import { Centrifuge, type Subscription } from 'centrifuge';
import { centrifugoAPI } from './api';

type MessageHandler = (data: any) => void;

class WebSocketClient {
  private client: Centrifuge | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private tabId: string;

  constructor() {
    // Generate unique ID for this browser tab
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Centrifugo] Initializing WebSocket client for tab: ${this.tabId}`);
  }

  async connect(_token: string) {
    if (this.client) {
      return;
    }

    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//localhost:8000/connection/websocket`;

    try {
      const response = await centrifugoAPI.getToken();
      const centrifugoToken = response.data.token;

      this.client = new Centrifuge(wsUrl, {
        token: centrifugoToken,
      });

      this.client.on('connected', (ctx: any) => {
        console.log('[Centrifugo] Connected', ctx);
      });

      this.client.on('disconnected', (ctx: any) => {
        console.log('[Centrifugo] Disconnected', ctx);
      });

      this.client.on('error', (ctx: any) => {
        console.error('[Centrifugo] Error', ctx);
      });

      this.client.connect();
    } catch (error) {
      console.error('[Centrifugo] Failed to get token', error);
    }
  }

  private emit(type: string, data: any) {
    const handlers = this.handlers.get(type) || [];
    handlers.forEach((handler) => handler(data));
  }

  private normalizePublication(data: any) {
    if (data.type === 'message') {
      return {
        type: 'message_new',
        roomId: data.roomId,
        message: {
          _id: data.messageId,
          u: {
            _id: data.senderId,
            username: data.senderUsername,
          },
          msg: data.text,
          ts: data.createdAt,
          editedAt: data.editedAt,
        },
      };
    }

    if (data.type === 'message_update') {
      return {
        type: 'message_updated',
        roomId: data.roomId,
        message: {
          _id: data.messageId,
          msg: data.text,
          editedAt: data.editedAt,
        },
      };
    }

    if (data.type === 'message_delete') {
      return {
        type: 'message_deleted',
        roomId: data.roomId,
        messageId: data.messageId,
      };
    }

    return data;
  }

  async subscribe(roomId: string) {
    if (!this.client) {
      console.error(`[Centrifugo] Cannot subscribe to room:${roomId}, client not connected`);
      return;
    }

    const channelName = `room:${roomId}`;
    console.log(`[Centrifugo] Tab ${this.tabId} attempting to subscribe to room:${roomId}`);
    
    // Check if subscription already exists
    if (this.subscriptions.has(roomId)) {
      console.log(`[Centrifugo] Tab ${this.tabId} already subscribed to room:${roomId}`);
      return;
    }

    // Check if Centrifuge client already has this subscription
    const existingSub = this.client.getSubscription(channelName);
    if (existingSub) {
      console.log(`[Centrifugo] Tab ${this.tabId} found existing subscription for room:${roomId}`);
      this.subscriptions.set(roomId, existingSub);
      return;
    }

    try {
      // Fetch subscription token for this channel
      console.log(`[Centrifugo] Tab ${this.tabId} fetching subscription token for room:${roomId}`);
      const response = await centrifugoAPI.getSubscriptionToken(channelName);
      const subscriptionToken = response.data.token;
      console.log(`[Centrifugo] Tab ${this.tabId} got subscription token for room:${roomId}`);

      let subscription;
      try {
        subscription = this.client.newSubscription(channelName, {
          token: subscriptionToken,
        });
        console.log(`[Centrifugo] Tab ${this.tabId} created subscription for room:${roomId}`);
      } catch (err: any) {
        // If subscription already exists, get the existing one
        if (err?.message?.includes('already exists')) {
          console.log(`[Centrifugo] Tab ${this.tabId} subscription already exists for room:${roomId}`);
          const existingSub = this.client.getSubscription(channelName);
          if (existingSub) {
            this.subscriptions.set(roomId, existingSub);
            return;
          }
          throw err;
        }
        throw err;
      }

      subscription.on('publication', (ctx: any) => {
        console.log(`[Centrifugo] Tab ${this.tabId} Raw publication received from room:${roomId}:`, ctx);
        const normalized = this.normalizePublication(ctx.data);
        console.log(`[Centrifugo] Tab ${this.tabId} Normalized event:`, normalized);
        if (normalized?.type) {
          this.emit(normalized.type, normalized);
        }
      });

      subscription.on('subscribed', () => {
        console.log(`[Centrifugo] Tab ${this.tabId} Subscribed to room:${roomId}`);
      });

      subscription.on('error', (ctx: any) => {
        console.error(`[Centrifugo] Tab ${this.tabId} Subscription error for room:${roomId}`, ctx);
      });

      subscription.subscribe();
      this.subscriptions.set(roomId, subscription);
    } catch (error) {
      console.error(`[Centrifugo] Failed to get subscription token for room:${roomId}`, error);
    }
  }

  unsubscribe(roomId: string) {
    // Don't actually unsubscribe - we want to keep listening to all rooms
    // This ensures we get messages even when switching between rooms
    console.log(`[Centrifugo] Keeping subscription to room:${roomId} (not unsubscribing)`);
    
    // If you really want to unsubscribe in the future, uncomment this:
    // const subscription = this.subscriptions.get(roomId);
    // if (!subscription) {
    //   return;
    // }
    // subscription.unsubscribe();
    // this.subscriptions.delete(roomId);
  }

  startTyping(_roomId: string) {
  }

  stopTyping(_roomId: string) {
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }

    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler) {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      return;
    }

    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  disconnect() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.clear();

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

export const ws = new WebSocketClient();
