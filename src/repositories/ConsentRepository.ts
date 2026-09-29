/**
 * Consent Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Consent } from '../domain/types';
import { storage } from '../adapters';

export class ConsentRepository extends BaseRepository<Consent> {
  protected storageKey = 'consents';
  protected entityName = 'Consent';

  constructor() {
    super(storage);
  }

  async findByPatient(patientId: string): Promise<any[]> {
    return this.findAll({
      where: { patientId },
      orderBy: 'signedAt',
      orderDir: 'desc',
    });
  }

  async findByType(type: 'treatment' | 'data'): Promise<any[]> {
    return this.findAll({ where: { type }, orderBy: 'signedAt', orderDir: 'desc' });
  }

  async findActive(patientId: string): Promise<any[]> {
    return this.findAll({
      where: { patientId, status: 'active' },
      orderBy: 'signedAt',
      orderDir: 'desc',
    });
  }

  async findVigent(patientId: string, type: 'treatment' | 'data'): Promise<any | null> {
    const all = await this.findAll({
      where: { patientId, type, status: 'active' },
      orderBy: 'signedAt',
      orderDir: 'desc',
    });
    return all[0] || null;
  }

  async revoke(id: string, reason: string): Promise<any | null> {
    return this.update(id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revocationReason: reason,
    });
  }

  /**
   * Registra a assinatura de um termo, como a POC.
   * Bloqueia quando ja existe termo vigente do mesmo tipo, a menos que o
   * usuario marque a substituicao - nesse caso o anterior vira 'replaced'
   * e continua no historico para comprovacao.
   */
  async saveWithChecks(
    data: {
      patientId: string;
      type: 'treatment' | 'data';
      signedBy: string;
      relationship: 'holder' | 'guardian';
      document: string;
      signedAt: string;
      version: string;
      registeredBy: string;
      text: string;
    },
    substituir = false
  ): Promise<{ ok: boolean; error?: string; consent?: any }> {
    if (!data.patientId) return { ok: false, error: 'Selecione o paciente.' };
    if (!String(data.signedBy || '').trim()) {
      return { ok: false, error: 'Informe quem assinou o termo.' };
    }

    const vigente = await this.findVigent(data.patientId, data.type);
    if (vigente && !substituir) {
      return {
        ok: false,
        error: 'Já existe um termo vigente deste tipo. Revogue o anterior ou marque a substituição.',
      };
    }

    if (vigente) {
      await this.update(vigente.id, {
        status: 'replaced',
        revokedAt: new Date().toISOString(),
        revocationReason: 'Substituído por nova versão',
      });
    }

    const created = await this.create({
      patientId: data.patientId as any,
      type: data.type,
      signedBy: String(data.signedBy).trim(),
      relationship: data.relationship,
      document: String(data.document || '').trim(),
      signedAt: new Date(data.signedAt || Date.now()).toISOString(),
      version: data.version || '1.0',
      registeredBy: data.registeredBy as any,
      text: data.text,
      status: 'active',
      createdAt: new Date().toISOString(),
    } as any);

    return { ok: true, consent: created };
  }

  async replace(id: string, newConsent: any): Promise<any> {
    const old = await this.findById(id);
    if (!old) throw new Error('Consent not found');

    // Mark old as replaced
    await this.update(id, {
      status: 'replaced',
      revokedAt: new Date().toISOString(),
      revocationReason: 'Substituído por nova versão',
    });

    // Create new
    return this.create(newConsent);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const all = await this.findAll();
    return all.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  async getPendingCount(): Promise<number> {
    // Patients without active consent
    const { patientRepository } = await import('./PatientRepository');

    const patients = await patientRepository.findAll({ where: { status: 'active' } });
    let pending = 0;

    for (const patient of patients) {
      const active = await this.findActive(patient.id);
      if (active.length === 0) pending++;
    }

    return pending;
  }
}

export const consentRepository = new ConsentRepository();