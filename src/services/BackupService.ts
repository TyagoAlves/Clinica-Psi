/**
 * Backup Service - Export/Import functionality
 */

import { storage } from '../adapters';
import { professionalRepository, patientRepository, serviceRepository, appointmentRepository, evolutionRepository, consentRepository, configRepository } from '../repositories';
import type { BackupData } from '../domain/types';

export class BackupService {
  async export(): Promise<Blob> {
    const [
      config,
      professionals,
      patients,
      services,
      appointments,
      evolutions,
      consents,
    ] = await Promise.all([
      configRepository.get(),
      professionalRepository.findAll(),
      patientRepository.findAll(),
      serviceRepository.findAll(),
      appointmentRepository.findAll(),
      evolutionRepository.findAll(),
      consentRepository.findAll(),
    ]);

    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      clinic: config,
      professionals,
      patients,
      services,
      appointments,
      evolutions,
      consents,
    };

    const json = JSON.stringify(backup, null, 2);

    return new Blob([json], { type: 'application/json' });
  }

  private async buildFilename(): Promise<string> {
    const config = await configRepository.get();
    const slug = config.clinic?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'clinica';
    return `backup-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  }

  async downloadBackup(): Promise<void> {
    const [blob, filename] = await Promise.all([this.export(), this.buildFilename()]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async import(file: File): Promise<{ success: boolean; error?: string }> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data.version || !data.clinic || !Array.isArray(data.professionals)) {
        return { success: false, error: 'Arquivo de backup inválido' };
      }

      // Import in transaction-like manner
      const backups = await this.createRollbackSnapshot();

      try {
        await this.importData(data);
        return { success: true };
      } catch (e) {
        await this.rollback(backups);
        return { success: false, error: e instanceof Error ? e.message : 'Erro ao importar' };
      }
    } catch {
      return { success: false, error: 'Arquivo inválido' };
    }
  }

  private async createRollbackSnapshot(): Promise<any> {
    return {
      config: await configRepository.get(),
      professionals: await professionalRepository.findAll(),
      patients: await patientRepository.findAll(),
      services: await serviceRepository.findAll(),
      appointments: await appointmentRepository.findAll(),
      evolutions: await evolutionRepository.findAll(),
      consents: await consentRepository.findAll(),
    };
  }

  private async rollback(snapshot: any): Promise<void> {
    await storage.set('config', snapshot.config);
    await storage.set('professionals', snapshot.professionals);
    await storage.set('patients', snapshot.patients);
    await storage.set('services', snapshot.services);
    await storage.set('appointments', snapshot.appointments);
    await storage.set('evolutions', snapshot.evolutions);
    await storage.set('consents', snapshot.consents);
  }

  private async importData(data: BackupData): Promise<void> {
    // Clear existing data
    await storage.clear();

    // Import in dependency order
    await storage.set('config', data.clinic);
    await storage.set('professionals', data.professionals);
    await storage.set('patients', data.patients);
    await storage.set('services', data.services);
    await storage.set('appointments', data.appointments);
    await storage.set('evolutions', data.evolutions);
    await storage.set('consents', data.consents);
  }

  async clearClinicalData(): Promise<void> {
    // Keep config and professionals, clear clinical data
    await storage.remove('patients');
    await storage.remove('evolutions');
    await storage.remove('appointments');
    await storage.remove('consents');
    await storage.remove('services');
  }

  async getStorageStats(): Promise<{
    used: number;
    quota: number;
    percentage: number;
    breakdown: Record<string, number>;
  }> {
    const keys = ['config', 'professionals', 'patients', 'services', 'appointments', 'evolutions', 'consents', 'session'];
    const breakdown: Record<string, number> = {};

    let totalUsed = 0;
    for (const key of keys) {
      const data = await storage.get(key);
      const size = data ? JSON.stringify(data).length : 0;
      breakdown[key] = size;
      totalUsed += size;
    }

    const quota = 5 * 1024 * 1024; // 5MB estimate
    return {
      used: totalUsed,
      quota,
      percentage: Math.round((totalUsed / quota) * 100),
      breakdown,
    };
  }
}

export const backupService = new BackupService();