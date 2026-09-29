/**
 * Composite Adapter - Combines multiple adapters with priority
 * Primary for writes, fallback chain for reads
 */

import type { StorageAdapter } from './StoragePort';
import type { BackupData } from '../domain/types';

export class CompositeAdapter implements StorageAdapter {
  private primary: StorageAdapter;
  private fallbacks: StorageAdapter[] = [];
  private writeToAll = false;

  constructor(primary: StorageAdapter, fallbacks: StorageAdapter[] = []) {
    this.primary = primary;
    this.fallbacks = fallbacks;
  }

  setWriteToAll(enabled: boolean): void {
    this.writeToAll = enabled;
  }

  async get<T>(key: string): Promise<T | null> {
    const primaryResult = await this.primary.get<T>(key);
    if (primaryResult !== null && primaryResult !== undefined) return primaryResult;

    for (const fallback of this.fallbacks) {
      const result = await fallback.get<T>(key);
      if (result !== null && result !== undefined) {
        await this.primary.set(key, result);
        return result;
      }
    }
    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.primary.set(key, value);
    if (this.writeToAll) {
      await Promise.all(this.fallbacks.map(f => f.set(key, value).catch(() => {})));
    }
  }

  async remove(key: string): Promise<void> {
    await this.primary.remove(key);
    if (this.writeToAll) {
      await Promise.all(this.fallbacks.map(f => f.remove(key).catch(() => {})));
    }
  }

  async clear(): Promise<void> {
    await this.primary.clear();
    if (this.writeToAll) {
      await Promise.all(this.fallbacks.map(f => f.clear().catch(() => {})));
    }
  }

  async listKeys(): Promise<string[]> {
    const keys = new Set(await this.primary.listKeys());
    for (const fallback of this.fallbacks) {
      for (const key of await fallback.listKeys().catch(() => [])) {
        keys.add(key);
      }
    }
    return [...keys].sort();
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    const result = await this.primary.getAll(keys);
    const missing = keys.filter(k => !(k in result));
    if (missing.length === 0) return result;

    for (const fallback of this.fallbacks) {
      const fallbackResult = await fallback.getAll(missing);
      for (const [key, value] of Object.entries(fallbackResult)) {
        if (!(key in result)) result[key] = value;
      }
      const stillMissing = missing.filter(k => !(k in result));
      if (stillMissing.length === 0) break;
    }
    return result;
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    await this.primary.setAll(entries);
    if (this.writeToAll) {
      await Promise.all(this.fallbacks.map(f => f.setAll(entries).catch(() => {})));
    }
  }

  async exportBackup(): Promise<BackupData> {
    return this.primary.exportBackup();
  }

  async importBackup(data: BackupData): Promise<void> {
    await this.primary.importBackup(data);
  }

  async getUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    return this.primary.getUsage();
  }
}
