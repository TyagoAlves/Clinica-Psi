/**
 * Evolution Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Evolution } from '../domain/types';
import { storage } from '../adapters';

export class EvolutionRepository extends BaseRepository<Evolution> {
  protected storageKey = 'evolutions';
  protected entityName = 'Evolution';

  constructor() {
    super(storage);
  }

  async findByPatient(patientId: string): Promise<any[]> {
    return this.findAll({
      where: { patientId },
      orderBy: 'date',
      orderDir: 'desc',
    });
  }

  async findByProfessional(professionalId: string): Promise<any[]> {
    return this.findAll({
      where: { professionalId },
      orderBy: 'date',
      orderDir: 'desc',
    });
  }

  async findByDateRange(patientId: string, start: string, end: string): Promise<any[]> {
    const all = await this.findByPatient(patientId);
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    return all.filter(e => {
      const eTime = new Date(e.date).getTime();
      return eTime >= startTime && eTime <= endTime;
    });
  }

  async getLatest(patientId: string, limit = 1): Promise<any[]> {
    const all = await this.findByPatient(patientId);
    return all.slice(0, limit);
  }

  async getRecent(limit = 5): Promise<any[]> {
    return this.findAll({ orderBy: 'date', orderDir: 'desc', limit });
  }

  async countByPatient(patientId: string): Promise<number> {
    return this.count({ patientId });
  }

  async getMonthlyStats(professionalId?: string): Promise<Record<string, number>> {
    const all = await this.findAll({ where: professionalId ? { professionalId } : {} });
    const stats: Record<string, number> = {};

    for (const e of all) {
      const month = e.date.slice(0, 7); // YYYY-MM
      stats[month] = (stats[month] || 0) + 1;
    }

    return stats;
  }
}

export const evolutionRepository = new EvolutionRepository();