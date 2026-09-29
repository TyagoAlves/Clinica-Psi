/**
 * IndexedDB Adapter - For large data storage (beyond localStorage limits)
 */

import type { StorageAdapter } from './StoragePort';

const DB_NAME = 'clinica-psi-db';
const DB_VERSION = 1;
const STORE_NAME = 'records';

class IndexedDBConnection {
  private db: IDBDatabase | null = null;

  async connect(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getStore(mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const db = await this.connect();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

const connection = new IndexedDBConnection();

export class IndexedDBAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    const store = await connection.getStore();
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value as T ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const store = await connection.getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async remove(key: string): Promise<void> {
    const store = await connection.getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const store = await connection.getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listKeys(): Promise<string[]> {
    const store = await connection.getStore();
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result as IDBValidKey[]).map(String));
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    const store = await connection.getStore();
    const result: Record<string, unknown> = {};

    return new Promise((resolve, reject) => {
      let completed = 0;
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result) result[key] = request.result.value;
          completed++;
          if (completed === keys.length) resolve(result);
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    const store = await connection.getStore('readwrite');
    return new Promise((resolve, reject) => {
      let completed = 0;
      const keys = Object.keys(entries);
      for (const key of keys) {
        const request = store.put({ key, value: entries[key], updatedAt: Date.now() });
        request.onsuccess = () => {
          completed++;
          if (completed === keys.length) resolve();
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  async exportBackup(): Promise<never> {
    throw new Error('BACKUP_NOT_SUPPORTED_IN_INDEXEDDB_ADAPTER_USE_LOCALSTORAGE');
  }

  async importBackup(): Promise<never> {
    throw new Error('BACKUP_NOT_SUPPORTED_IN_INDEXEDDB_ADAPTER');
  }

  async getUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 50 * 1024 * 1024,
        percentage: estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0,
      };
    }
    return { used: 0, quota: 50 * 1024 * 1024, percentage: 0 };
  }
}

export const indexedDBAdapter = new IndexedDBAdapter();