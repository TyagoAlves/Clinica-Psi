/**
 * LocalStorage Adapter - Default browser persistence
 */

import type { StorageAdapter } from './StoragePort';
import type { BackupData } from '../domain/types';

const isBrowser = typeof window !== 'undefined';

export class LocalStorageAdapter implements StorageAdapter {
  private prefix = 'clinica-psi-';

  private prefixed(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!isBrowser) return null;
    try {
      const raw = localStorage.getItem(this.prefixed(key));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!isBrowser) return;
    try {
      localStorage.setItem(this.prefixed(key), JSON.stringify(value));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('STORAGE_QUOTA_EXCEEDED');
      }
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    if (!isBrowser) return;
    localStorage.removeItem(this.prefixed(key));
  }

  async clear(): Promise<void> {
    if (!isBrowser) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }

  async listKeys(): Promise<string[]> {
    if (!isBrowser) return [];
    return Object.keys(localStorage)
      .filter(k => k.startsWith(this.prefix))
      .map(k => k.slice(this.prefix.length));
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    if (!isBrowser) return {};
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    if (!isBrowser) return;
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }

  async exportBackup(): Promise<BackupData> {
    const db = await this.get('db');
    if (!db) throw new Error('NO_DATA_TO_EXPORT');
    return db as BackupData;
  }

  async importBackup(data: BackupData): Promise<void> {
    await this.set('db', data);
  }

  async getUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    if (!isBrowser) return { used: 0, quota: 5 * 1024 * 1024, percentage: 0 };
    let used = 0;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(this.prefix)) {
        used += localStorage.getItem(key)?.length || 0;
      }
    }
    const quota = 5 * 1024 * 1024; // ~5MB typical limit
    return { used, quota, percentage: Math.round((used / quota) * 100) };
  }
}

export const localStorageAdapter = new LocalStorageAdapter();