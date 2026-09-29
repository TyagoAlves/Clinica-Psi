/**
 * Sqlite Adapter - Persistencia local no app empacotado (Tauri).
 *
 * Mesma interface de chave-valor dos outros adapters, so que a porta
 * `StorageAdapter`, os oito repositorios e o dominio continuam intactos.
 * O que muda em relacao ao LocalStorageAdapter:
 *
 * - sem teto de ~5 MB por origem;
 * - escrita em transacao (WAL + synchronous=FULL), entao uma falha no meio
 *   de um `setAll` nao deixa a colecao truncada;
 * - os dados ficam num arquivo .db, e nao presos no perfil do WebView2.
 *
 * O espelho do `LocalStorageAdapter` mantem o prefixo `clinica-psi-` para que
 * as chaves fiquem identicas entre o app empacotado e a versao web.
 */

import { invoke } from '@tauri-apps/api/core';
import type { StorageAdapter } from './StoragePort';
import type { BackupData } from '../domain/types';

interface StorageUsage {
  used: number;
  quota: number;
  percentage: number;
}

export class SqliteAdapter implements StorageAdapter {
  private prefix = 'clinica-psi-';

  private prefixed(key: string): string {
    return `${this.prefix}${key}`;
  }

  private unprefixed(key: string): string {
    return key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await invoke<string | null>('kv_get', { key: this.prefixed(key) });
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await invoke('kv_set', { key: this.prefixed(key), value: JSON.stringify(value) });
  }

  async remove(key: string): Promise<void> {
    await invoke('kv_remove', { key: this.prefixed(key) });
  }

  async clear(): Promise<void> {
    const keys = await this.listKeys();
    await Promise.all(keys.map(key => invoke('kv_remove', { key: this.prefixed(key) })));
  }

  async listKeys(): Promise<string[]> {
    const keys = await invoke<string[]>('kv_keys');
    return keys.map(k => this.unprefixed(k));
  }

  async getAll(keys: string[]): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    const prefixed = keys.map(k => this.prefixed(k));
    const raw = await invoke<Record<string, string>>('kv_get_all', { keys: prefixed });
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[this.unprefixed(key)] = JSON.parse(value);
    }
    return result;
  }

  async setAll(entries: Record<string, unknown>): Promise<void> {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries)) {
      payload[this.prefixed(key)] = JSON.stringify(value);
    }
    await invoke('kv_set_all', { entries: payload });
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
    const usage = await invoke<StorageUsage>('kv_usage');
    return { used: usage.used, quota: usage.quota, percentage: usage.percentage };
  }

  /** Caminho do arquivo .db, para o usuario localizar a base na maquina. */
  async path(): Promise<string> {
    return invoke<string>('kv_path');
  }
}

export const sqliteAdapter = new SqliteAdapter();
