/**
 * Cookie Adapter - For session data and lightweight persistence
 * Cookies are sent with every request, so keep payloads small
 */

import type { StorageAdapter } from './StoragePort';
import Cookies from 'js-cookie';

const COOKIE_PREFIX = 'clinica_psi_';

function parseCookie<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class CookieAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    const cookie = Cookies.get(`${COOKIE_PREFIX}${key}`);
    return parseCookie<T>(cookie);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const json = JSON.stringify(value);
    // Cookies have 4KB limit per cookie
    if (json.length > 3500) {
      throw new Error('COOKIE_TOO_LARGE');
    }
    Cookies.set(`${COOKIE_PREFIX}${key}`, json, {
      expires: 365,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  }

  async remove(key: string): Promise<void> {
    Cookies.remove(`${COOKIE_PREFIX}${key}`, { path: '/' });
  }

  async clear(): Promise<void> {
    const cookies = Cookies.get();
    Object.keys(cookies)
      .filter(k => k.startsWith(COOKIE_PREFIX))
      .forEach(k => Cookies.remove(k, { path: '/' }));
  }

  async listKeys(): Promise<string[]> {
    return Object.keys(Cookies.get())
      .filter(k => k.startsWith(COOKIE_PREFIX))
      .map(k => k.slice(COOKIE_PREFIX.length));
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }

  // Cookie adapter not suitable for full backup
  async exportBackup(): Promise<never> {
    throw new Error('BACKUP_NOT_SUPPORTED_IN_COOKIE_ADAPTER');
  }

  async importBackup(): Promise<never> {
    throw new Error('BACKUP_NOT_SUPPORTED_IN_COOKIE_ADAPTER');
  }

  async getUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    let used = 0;
    const cookies = Cookies.get();
    for (const [key, value] of Object.entries(cookies)) {
      if (key.startsWith('clinica_psi_')) {
        used += key.length + value.length;
      }
    }
    return { used, quota: 4096, percentage: Math.round((used / 4096) * 100) };
  }
}

export const cookieAdapter = new CookieAdapter();