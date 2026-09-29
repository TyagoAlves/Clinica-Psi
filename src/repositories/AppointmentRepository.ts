/**
 * Appointment Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Appointment, AppointmentStatus } from '../domain/types';
import { storage } from '../adapters';

/**
 * `new Date('2026-09-28')` e interpretado como UTC midnight e, ao aplicar
 * setHours no fuso local, a data volta um dia em fusos negativos (UTC-3).
 * Montando o ISO explicitamente o limite do dia fica sempre no fuso local.
 */
function dayRange(date: string): { start: string; end: string } {
  return {
    start: new Date(`${date}T00:00:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999`).toISOString(),
  };
}

/** Data local de hoje (YYYY-MM-DD); toISOString() devolveria a data UTC. */
export function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().split('T')[0];
}

export class AppointmentRepository extends BaseRepository<Appointment> {
  protected storageKey = 'appointments';
  protected entityName = 'Appointment';

  constructor() {
    super(storage);
  }

  async findByProfessional(professionalId: string, date?: string): Promise<Appointment[]> {
    if (date) {
      const { start, end } = dayRange(date);
      return this.findByDateRange(start, end, professionalId);
    }
    return this.findAll({ where: { professionalId }, orderBy: 'start', orderDir: 'asc' });
  }

  async findByPatient(patientId: string): Promise<Appointment[]> {
    return this.findAll({ where: { patientId }, orderBy: 'start', orderDir: 'desc' });
  }

  async findByDateRange(start: string, end: string, professionalId?: string): Promise<Appointment[]> {
    const all = await this.findAll({ where: professionalId ? { professionalId } : {} });
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    return all.filter(a => {
      const apptTime = new Date(a.start).getTime();
      return apptTime >= startTime && apptTime <= endTime;
    });
  }

  async findByDate(date: string, professionalId?: string): Promise<Appointment[]> {
    const { start, end } = dayRange(date);
    return this.findByDateRange(start, end, professionalId);
  }

  async findConflicts(professionalId: string, start: string, durationMin: number, excludeId?: string): Promise<Appointment[]> {
    const startTime = new Date(start).getTime();
    const endTime = startTime + durationMin * 60000;

    const appointments = await this.findByProfessional(professionalId);
    return appointments
      // 'cancelled' e 'no-show' nao ocupam a agenda do profissional (paridade com a POC)
      .filter(a => a.id !== excludeId && a.status !== 'cancelled' && a.status !== 'no-show')
      .filter(a => {
        const aStart = new Date(a.start).getTime();
        const aEnd = aStart + a.durationMin * 60000;
        return aStart < endTime && aEnd > startTime;
      });
  }

  /**
   * Salva um agendamento validando paciente/servico/profissional e impedindo
   * sobreposicao de horario para o mesmo profissional.
   */
  async saveWithConflictCheck(
    data: Partial<Appointment> & { patientId?: string; serviceId?: string; professionalId?: string }
  ): Promise<{ ok: boolean; error?: string; appointment?: Appointment }> {
    if (!data.patientId) return { ok: false, error: 'Selecione o paciente.' };
    if (!data.serviceId) return { ok: false, error: 'Selecione o serviço.' };
    if (!data.professionalId) return { ok: false, error: 'Selecione o profissional responsável.' };
    if (!data.start) return { ok: false, error: 'Informe a data e a hora da sessão.' };
    if (Number.isNaN(new Date(data.start).getTime())) {
      return { ok: false, error: 'Data e hora inválidas.' };
    }

    const durationMin = Number(data.durationMin) > 0 ? Number(data.durationMin) : 50;

    const conflitos = await this.findConflicts(
      data.professionalId,
      data.start,
      durationMin,
      data.id
    );
    if (conflitos.length) {
      return {
        ok: false,
        error: `Conflito de horário: já existe uma sessão em ${new Date(conflitos[0].start).toLocaleString('pt-BR')}.`,
      };
    }

    const payload = {
      patientId: data.patientId,
      serviceId: data.serviceId,
      professionalId: data.professionalId,
      start: new Date(data.start).toISOString(),
      durationMin,
      status: (data.status || 'scheduled') as AppointmentStatus,
      notes: String(data.notes || '').trim(),
    };

    const saved = data.id
      ? await this.update(data.id, payload)
      : await this.create(payload);
    if (!saved) return { ok: false, error: 'Não foi possível salvar o agendamento.' };
    return { ok: true, appointment: saved };
  }

  async findByStatus(status: AppointmentStatus): Promise<Appointment[]> {
    return this.findAll({ where: { status }, orderBy: 'start', orderDir: 'asc' });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const all = await this.findAll();
    return all.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  async getTodaysAppointments(professionalId?: string): Promise<Appointment[]> {
    return this.findByDate(localToday(), professionalId);
  }

  async getUpcoming(limit = 5, professionalId?: string): Promise<Appointment[]> {
    const all = await this.findAll({
      where: professionalId ? { professionalId } : {},
      orderBy: 'start',
      orderDir: 'asc',
    });
    const now = Date.now();
    return all
      .filter(a => new Date(a.start).getTime() >= now)
      // sessao cancelada ou nao realizada nao e atendimento futuro (paridade com a POC)
      .filter(a => a.status !== 'cancelled' && a.status !== 'no-show')
      .slice(0, limit);
  }
}

export const appointmentRepository = new AppointmentRepository();