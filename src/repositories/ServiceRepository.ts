/**
 * Service Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Service, ServiceColor } from '../domain/types';
import { storage } from '../adapters';

export class ServiceRepository extends BaseRepository<Service> {
  protected storageKey = 'services';
  protected entityName = 'Service';

  constructor() {
    super(storage);
  }

  async findActive(): Promise<Service[]> {
    return this.findAll({ where: { active: true }, orderBy: 'name', orderDir: 'asc' });
  }

  async findByColor(color: ServiceColor): Promise<Service[]> {
    return this.findAll({ where: { color } });
  }
}

export const serviceRepository = new ServiceRepository();