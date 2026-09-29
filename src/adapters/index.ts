/**
 * Storage Factory - Main entry point for storage
 * Provides unified API regardless of underlying adapter
 */

import type { StorageAdapter, StorageConfig } from './StoragePort';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { CookieAdapter } from './CookieAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { HttpAdapter } from './HttpAdapter';
import { SqliteAdapter } from './SqliteAdapter';
import { isTauri } from '../utils/tauri';

export type AdapterInstance = StorageAdapter & {
  // Extended methods for multi-adapter coordination
  syncTo?(target: StorageAdapter): Promise<void>;
};

let _adapter: StorageAdapter | null = null;

export function createStorage(config: StorageConfig): StorageAdapter {
  const { type, options } = config;

  switch (type) {
    case 'localStorage':
      return new LocalStorageAdapter();

    case 'cookie':
      return new CookieAdapter();

    case 'indexedDB':
      return new IndexedDBAdapter();

    case 'sqlite':
      return new SqliteAdapter();

    case 'http':
      if (!options?.apiBaseUrl) {
        throw new Error('HTTP adapter requires apiBaseUrl in options');
      }
      return new HttpAdapter(config);

    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

export function getStorage(config?: StorageConfig): StorageAdapter {
  if (_adapter) return _adapter;
  if (!config) {
    // No app empacotado o dado clinico vai para o arquivo SQLite; na web
    // segue no localStorage, que e o que a suite Playwright exercita.
    return createStorage({ type: isTauri() ? 'sqlite' : 'localStorage' });
  }
  _adapter = createStorage(config);
  return _adapter;
}

export function setStorage(adapter: StorageAdapter): void {
  _adapter = adapter;
}

export function resetStorage(): void {
  _adapter = null;
}

/**
 * Default application storage instance.
 * All repositories and services depend on this singleton.
 */
export const storage: StorageAdapter = getStorage();

/**
 * Multi-adapter setup for production:
 * - localStorage: main data (patients, evolutions, appointments, etc.)
 * - Cookie: session only (auth token, user preferences)
 * - IndexedDB: large binary data (images, PDFs) - optional
 * - HTTP: backend sync - optional
 */
export function createProductionStorage(): {
  main: LocalStorageAdapter;
  session: CookieAdapter;
  large?: IndexedDBAdapter;
  sync?: HttpAdapter;
} {
  const main = new LocalStorageAdapter();
  const session = new CookieAdapter();

  return {
    main,
    session,
    // large: new IndexedDBAdapter(), // enable if needed
    // sync: new HttpAdapter({ type: 'http', options: { apiBaseUrl: '/api' } }), // enable if backend exists
  };
}

export type { StorageAdapter, StorageConfig, StorageType } from './StoragePort';
export { LocalStorageAdapter } from './LocalStorageAdapter';
export { CookieAdapter } from './CookieAdapter';
export { IndexedDBAdapter } from './IndexedDBAdapter';
export { HttpAdapter } from './HttpAdapter';
export { SqliteAdapter } from './SqliteAdapter';
