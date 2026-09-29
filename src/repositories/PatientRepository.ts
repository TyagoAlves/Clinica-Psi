/**
 * Patient Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Patient, PatientStatus } from '../domain/types';
import { storage } from '../adapters';

export class PatientRepository extends BaseRepository<Patient> {
  protected storageKey = 'patients';
  protected entityName = 'Patient';

  constructor() {
    super(storage);
  }

  async findByStatus(status: PatientStatus): Promise<Patient[]> {
    return this.findAll({ where: { status }, orderBy: 'name', orderDir: 'asc' });
  }

  async search(query: string): Promise<Patient[]> {
    const collection = await this.readCollection();
    const lower = query.toLowerCase().trim();
    if (!lower) return [];

    return collection.filter((p) =>
      p.name.toLowerCase().includes(lower) ||
      p.phone?.includes(lower) ||
      p.email?.toLowerCase().includes(lower) ||
      p.document?.includes(lower)
    );
  }

  async findByService(serviceId: string): Promise<Patient[]> {
    return this.findAll({ where: { serviceId } });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const all = await this.findAll();
    return all.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Exclui o paciente e todas as suas evolucoes, como na POC.
   * Se a gravacao das evolucoes falhar, restaura a colecao anterior.
   */
  async removeWithCascade(id: string): Promise<{ ok: boolean; error?: string; removedEvolutions?: number }> {
    const patients = await this.readCollection();
    const target = patients.find((p) => p.id === id);
    if (!target) return { ok: false, error: 'Paciente não encontrado.' };

    const evolutions = await this.storage.get<any[]>('evolutions');
    const lista = Array.isArray(evolutions) ? evolutions : [];
    const restantes = lista.filter((e) => e.patientId !== id);
    const removidas = lista.length - restantes.length;

    try {
      await this.writeCollection(patients.filter((p) => p.id !== id));
      await this.storage.set('evolutions', restantes);
    } catch (e) {
      // rollback: devolve os dois estados ao que estava antes
      await this.writeCollection(patients).catch(() => {});
      await this.storage.set('evolutions', lista).catch(() => {});
      return { ok: false, error: 'Não foi possível excluir o paciente.' };
    }

    return { ok: true, removedEvolutions: removidas };
  }

  async findWithEvolutionCount(): Promise<{ patient: Patient; count: number; lastDate?: string }[]> {
    const evolutions = await this.storage.get<any[]>('evolutions');
    const lista = Array.isArray(evolutions) ? evolutions : [];
    const patients = await this.findAll({ orderBy: 'name', orderDir: 'asc' });

    return patients.map((patient) => {
      const minhas = lista
        .filter((e) => e.patientId === patient.id)
        .map((e) => String(e.date))
        .sort((a, b) => b.localeCompare(a));
      return { patient, count: minhas.length, lastDate: minhas[0] };
    });
  }
}

export const patientRepository = new PatientRepository();