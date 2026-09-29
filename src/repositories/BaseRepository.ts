/**
 * Base Repository - Common CRUD operations
 * Template Method Pattern: defines algorithm structure, subclasses implement specifics
 */

import type { StorageAdapter } from '../adapters/StoragePort';

export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  where?: Record<string, any>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Entrada de criacao: id/createdAt/updatedAt sao gerados pelo repositorio,
 * mas aceitos para permitir seeds deterministicos.
 */
export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Record<'id' | 'createdAt' | 'updatedAt', unknown>>;

export abstract class BaseRepository<T extends { id: string }> {
  protected abstract storageKey: string;
  protected abstract entityName: string;

  constructor(protected storage: StorageAdapter) {}

  protected getCollectionKey(): string {
    return this.storageKey;
  }

  protected async readCollection(): Promise<T[]> {
    const collection = await this.storage.get<T[]>(this.storageKey);
    return Array.isArray(collection) ? collection : [];
  }

  protected async writeCollection(collection: T[]): Promise<void> {
    await this.storage.set(this.storageKey, collection);
  }

  private applyWhere(results: T[], where: Record<string, any>): T[] {
    return results.filter(item =>
      Object.entries(where).every(([k, v]) => item[k as keyof T] === v)
    );
  }

  private applyOrder(results: T[], orderBy?: string, orderDir: 'asc' | 'desc' = 'asc'): T[] {
    if (!orderBy) return results;
    const dir = orderDir === 'desc' ? -1 : 1;
    return [...results].sort((a, b) => {
      const aVal = a[orderBy as keyof T];
      const bVal = b[orderBy as keyof T];
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  }

  async findAll(options: FindOptions = {}): Promise<T[]> {
    let results = await this.readCollection();

    if (options.where) {
      results = this.applyWhere(results, options.where);
    }

    results = this.applyOrder(results, options.orderBy, options.orderDir);

    if (options.limit) {
      const offset = options.offset || 0;
      results = results.slice(offset, offset + options.limit);
    }

    return results;
  }

  async findPaginated(options: FindOptions = {}): Promise<{ data: T[]; total: number }> {
    let results = await this.readCollection();

    if (options.where) {
      results = this.applyWhere(results, options.where);
    }

    const total = results.length;

    results = this.applyOrder(results, options.orderBy, options.orderDir);

    const offset = options.offset || 0;
    const limit = options.limit || 20;
    const data = results.slice(offset, offset + limit);

    return { data, total };
  }

  async findById(id: string): Promise<T | null> {
    const collection = await this.readCollection();
    return collection.find(item => item.id === id) || null;
  }

  async findOne(where: Record<string, any>): Promise<T | null> {
    const collection = await this.readCollection();
    return this.applyWhere(collection, where)[0] || null;
  }

  async create(entity: CreateInput<T>): Promise<T> {
    const collection = await this.readCollection();
    const now = new Date().toISOString();

    const entityWithId = {
      ...entity,
      id: entity.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as unknown as T;

    await this.writeCollection([...collection, entityWithId]);
    return entityWithId;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const collection = await this.readCollection();
    const index = collection.findIndex((item: T) => item.id === id);

    if (index === -1) return null;

    const updated = {
      ...collection[index],
      ...data,
      id, // ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    } as T;

    const updatedCollection = [...collection];
    updatedCollection[index] = updated;
    await this.writeCollection(updatedCollection);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const collection = await this.readCollection();
    const filtered = collection.filter((item: T) => item.id !== id);

    if (filtered.length === collection.length) return false;

    await this.writeCollection(filtered);
    return true;
  }

  async count(where?: Record<string, any>): Promise<number> {
    const collection = await this.readCollection();
    if (!where) return collection.length;
    return this.applyWhere(collection, where).length;
  }

  async exists(id: string): Promise<boolean> {
    const collection = await this.readCollection();
    return collection.some((item: T) => item.id === id);
  }

  // Batch operations
  async createMany(entities: CreateInput<T>[]): Promise<T[]> {
    const collection = await this.readCollection();
    const now = new Date().toISOString();

    const newEntities = entities.map(e => ({
      ...e,
      id: e.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    })) as unknown as T[];

    await this.writeCollection([...collection, ...newEntities]);
    return newEntities;
  }

  async updateMany(updates: { id: string; data: Partial<T> }[]): Promise<T[]> {
    const collection = await this.readCollection();
    const now = new Date().toISOString();

    const updated = collection.map(item => {
      const update = updates.find(u => u.id === item.id);
      if (!update) return item;
      return { ...item, ...update.data, id: item.id, updatedAt: now } as T;
    });

    await this.writeCollection(updated);
    return updated.filter(item => updates.some(u => u.id === item.id));
  }

  async deleteMany(ids: string[]): Promise<number> {
    const collection = await this.readCollection();
    const filtered = collection.filter((item: T) => !ids.includes(item.id));
    const deleted = collection.length - filtered.length;

    if (deleted > 0) {
      await this.writeCollection(filtered);
    }
    return deleted;
  }
}