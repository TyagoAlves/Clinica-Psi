/**
 * HTTP Adapter - Optional backend synchronization
 * Used when cloud backup/sync is configured
 */

import type { StorageAdapter, StorageConfig } from './StoragePort';
import type { BackupData } from '../domain/types';

export class HttpAdapter implements StorageAdapter {
  private baseUrl: string;
  private authToken: string;

  constructor(config: StorageConfig) {
    this.baseUrl = config.options?.apiBaseUrl || '';
    this.authToken = config.options?.authToken || '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) throw new Error('HTTP_ADAPTER_NOT_CONFIGURED');

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.request<T>(`/storage/${key}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.request(`/storage/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    });
  }

  async remove(key: string): Promise<void> {
    await this.request(`/storage/${key}`, { method: 'DELETE' });
  }

  async clear(): Promise<void> {
    await this.request('/storage', { method: 'DELETE' });
  }

  async listKeys(): Promise<string[]> {
    return this.request<string[]>('/storage/keys');
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/storage/batch`, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    });
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    await this.request('/storage/batch', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
  }

  async exportBackup(): Promise<BackupData> {
    return this.request<BackupData>('/backup/export');
  }

  async importBackup(data: BackupData): Promise<void> {
    await this.request('/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    return this.request('/storage/usage');
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }
}

export function createHttpAdapter(config: StorageConfig): HttpAdapter {
  return new HttpAdapter(config);
}