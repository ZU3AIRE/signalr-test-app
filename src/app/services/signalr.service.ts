import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubUrl = 'https://localhost:7180/hubs/notification';
  private hubConnection: signalR.HubConnection | null = null;
  
  private connectionStatusSubject = new BehaviorSubject<string>('Disconnected');
  public connectionStatus$ = this.connectionStatusSubject.asObservable();
  
  private messagesSubject = new BehaviorSubject<string[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  constructor(private authService: AuthService) {}

  async startConnection(): Promise<void> {
    const token = this.authService.getToken();
    
    if (!token) {
      this.addMessage('Error: No authentication token available. Please login first.');
      return;
    }

    try {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(this.hubUrl, {
          accessTokenFactory: () => token,
           headers: { 'Auth': `JwAAAB_@_LCAAAAAAAAArLrczNT9HNKLJKCs4wzctyL0r0KXIxjXJ0dDVwKy73CIjITQqNKMgEADZjkscnAAAA` }
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Information)
        .build();

      this.hubConnection.onreconnecting((error) => {
        this.connectionStatusSubject.next('Reconnecting...');
        this.addMessage(`Reconnecting: ${error?.message || 'Connection lost'}`);
      });

      this.hubConnection.onreconnected((connectionId) => {
        this.connectionStatusSubject.next('Connected');
        this.addMessage(`Reconnected! Connection ID: ${connectionId}`);
      });

      this.hubConnection.onclose((error) => {
        this.connectionStatusSubject.next('Disconnected');
        this.addMessage(`Connection closed: ${error?.message || 'Unknown reason'}`);
      });

      // Register hub method listeners
      this.registerHubMethods();

      this.connectionStatusSubject.next('Connecting...');
      await this.hubConnection.start();
      this.connectionStatusSubject.next('Connected');
      this.addMessage(`✓ Connected to SignalR Hub! Connection ID: ${this.hubConnection.connectionId}`);
      console.log('SignalR Connected:', this.hubConnection.connectionId);
      
    } catch (error: any) {
      this.connectionStatusSubject.next('Disconnected');
      this.addMessage(`✗ Connection failed: ${error.message}`);
      console.error('SignalR Connection Error:', error);
    }
  }

  async stopConnection(): Promise<void> {
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
        this.connectionStatusSubject.next('Disconnected');
        this.addMessage('Disconnected from SignalR Hub');
        console.log('SignalR Disconnected');
      } catch (error: any) {
        this.addMessage(`Error disconnecting: ${error.message}`);
        console.error('SignalR Disconnect Error:', error);
      }
    }
  }

  private registerHubMethods(): void {
    if (!this.hubConnection) return;

    // Register any hub methods your .NET SignalR hub might send
    // Example: this.hubConnection.on('ReceiveNotification', (message) => { ... });
    
    this.hubConnection.on('ReceiveMessage', (message: string) => {
      this.addMessage(`[Hub] ReceiveMessage: ${message}`);
    });

    this.hubConnection.on('ReceiveNotification', (notification: any) => {
      this.addMessage(`[Hub] ReceiveNotification: ${JSON.stringify(notification)}`);
    });

    // Add more hub method listeners as needed
  }

  /**
   * Register a generic server-side message handler for the given hub event name.
   * - Does not remove or modify existing handlers.
   * - Default event name is `ServerMessage` but you can pass any event name your server uses.
   */
  public registerServerMessageHandler(eventName: string = 'ServerMessage'): void {
    if (!this.hubConnection) {
      this.addMessage(`Handler registration failed: no hub connection (event: ${eventName})`);
      return;
    }

    // Avoid duplicate registrations for the same event by removing existing handler first
    try {
      // signalR HubConnection doesn't provide a direct off() in older typings, but if available, remove first
      // @ts-ignore
      if (typeof this.hubConnection.off === 'function') {
        // remove previous handlers for the event to prevent duplicates
        // @ts-ignore
        this.hubConnection.off(eventName);
      }
    } catch (e) {
      // ignore if off() is not supported
    }

    this.hubConnection.on(eventName, (payload: any) => {
      let display = '';

      if (payload && typeof payload === 'object') {
        const candidate = payload.message ?? payload.text ?? payload.content ?? payload.body ?? payload.data;
        display = candidate ?? JSON.stringify(payload);
      } else {
        display = String(payload);
      }

      this.addMessage(`[Server:${eventName}] ${display}`);
    });
  }

  private addMessage(message: string): void {
    const currentMessages = this.messagesSubject.value;
    const timestamp = new Date().toLocaleTimeString();
    this.messagesSubject.next([...currentMessages, `[${timestamp}] ${message}`]);
  }

  clearMessages(): void {
    this.messagesSubject.next([]);
  }

  getConnectionState(): string {
    return this.connectionStatusSubject.value;
  }
}
