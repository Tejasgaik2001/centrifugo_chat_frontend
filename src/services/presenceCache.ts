// Presence cache service to persist user presence status
interface UserPresence {
  userId: string;
  username: string;
  status: 'online' | 'offline' | 'away' | 'dnd';
  lastSeen: string;
  lastUpdated: number; // Timestamp when this was last updated
}

const PRESENCE_CACHE_KEY = 'chat_presence_cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

class PresenceCacheService {
  private cache: Map<string, UserPresence> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(PRESENCE_CACHE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const now = Date.now();
        
        // Filter out expired entries
        Object.entries(data).forEach(([userId, presence]: [string, any]) => {
          if (presence.username && now - presence.lastUpdated < CACHE_EXPIRY_MS) {
            this.cache.set(userId, presence);
          }
        });
      }
    } catch (err) {
      console.error('[PresenceCache] Failed to load from storage:', err);
    }
  }

  private saveToStorage() {
    try {
      const data: Record<string, UserPresence> = {};
      this.cache.forEach((presence, userId) => {
        data[userId] = presence;
      });
      localStorage.setItem(PRESENCE_CACHE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[PresenceCache] Failed to save to storage:', err);
    }
  }

  set(userId: string, presence: Omit<UserPresence, 'lastUpdated'>) {
    this.cache.set(userId, {
      ...presence,
      lastUpdated: Date.now()
    });
    this.saveToStorage();
  }

  get(userId: string): UserPresence | null {
    return this.cache.get(userId) || null;
  }

  getByUsername(username: string): UserPresence | null {
    if (!username) return null;
    const lowerUsername = username.toLowerCase();
    for (const presence of this.cache.values()) {
      if (presence.username && presence.username.toLowerCase() === lowerUsername) {
        return presence;
      }
    }
    return null;
  }

  setMultiple(presences: Omit<UserPresence, 'lastUpdated'>[]) {
    presences.forEach(presence => {
      this.cache.set(presence.userId, {
        ...presence,
        lastUpdated: Date.now()
      });
    });
    this.saveToStorage();
  }

  getAll(): Record<string, UserPresence> {
    const result: Record<string, UserPresence> = {};
    this.cache.forEach((presence, userId) => {
      result[userId] = presence;
    });
    return result;
  }

  clear() {
    this.cache.clear();
    localStorage.removeItem(PRESENCE_CACHE_KEY);
  }
}

export const presenceCache = new PresenceCacheService();
export type { UserPresence };
