/**
 * Professional Repository
 */

import { BaseRepository } from './BaseRepository';
import type { Professional } from '../domain/types';
import { storage } from '../adapters';
import { gerarHashSenha, serializarHash, verificarSenha } from '../services/CryptoService';

export interface SaveProfessionalInput {
  id?: string;
  name: string;
  email: string;
  crp: string;
  role: string;
  password?: string;
  active: boolean;
  admin: boolean;
}

export interface SaveProfessionalResult {
  ok: boolean;
  error?: string;
  campos?: Record<string, string>;
  professional?: Professional;
  changedSelf?: boolean;
}

export class ProfessionalRepository extends BaseRepository<Professional> {
  protected storageKey = 'professionals';
  protected entityName = 'Professional';

  constructor() {
    super(storage);
  }

  async findByEmail(email: string): Promise<Professional | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findActive(): Promise<Professional[]> {
    return this.findAll({ where: { active: true }, orderBy: 'name', orderDir: 'asc' });
  }

  async findAdmins(): Promise<Professional[]> {
    return this.findAll({ where: { admin: true, active: true } });
  }

  /**
   * Confere a senha e devolve o profissional, ou null.
   *
   * Compara com o hash guardado. Quando o acesso ainda tem a senha em texto
   * puro (criado antes do hash existir), compara no modo antigo e, se
   * conferir, regrava como hash naquela hora: a migracao acontece sozinha no
   * primeiro login, sem travar ninguem.
   */
  async authenticate(email: string, password: string): Promise<Professional | null> {
    const professional = await this.findByEmail(email);
    if (!professional || professional.active === false) return null;

    if (professional.passwordHash) {
      const { confere } = await verificarSenha(password, professional.passwordHash);
      return confere ? professional : null;
    }

    if (professional.password && professional.password === password) {
      // devolve o registro ja migrado: o objeto antigo ainda carrega a senha em
      // texto puro e iria parar na sessao, onde ficaria exposto ate recarregar
      return (await this.migrarParaHash(professional, password)) ?? professional;
    }
    return null;
  }

  /** Troca a senha guardada em texto puro por um hash. */
  private async migrarParaHash(professional: Professional, senha: string): Promise<Professional | null> {
    try {
      const hash = serializarHash(await gerarHashSenha(senha));
      await this.update(professional.id, { passwordHash: hash, password: undefined });
      return await this.findById(professional.id);
    } catch (e) {
      // falhar aqui nao pode impedir o login de quem digitou a senha certa
      console.error('Failed to hash password on login:', e);
      return null;
    }
  }

  /**
   * Returns true when at least one usable (e-mail + senha) credential exists.
   * A base corrompida/importada pode ter profissionais sem e-mail ou senha,
   * o que fazia todo login falhar silenciosamente.
   */
  async hasUsableCredentials(): Promise<boolean> {
    const all = await this.findAll();
    return all.some((p) => !!p?.email && !!(p?.passwordHash || p?.password));
  }

  async countActive(): Promise<number> {
    return this.count({ active: true });
  }

  async countActiveAdmins(): Promise<number> {
    return this.count({ active: true, admin: true });
  }

  async deactivate(id: string): Promise<Professional | null> {
    return this.update(id, { active: false });
  }

  async activate(id: string): Promise<Professional | null> {
    return this.update(id, { active: true });
  }

  async toggleAdmin(id: string): Promise<Professional | null> {
    const prof = await this.findById(id);
    if (!prof) return null;
    return this.update(id, { admin: !prof.admin });
  }

  /**
   * Regras de negocio da gestao de equipe (mesmas da POC):
   * - e-mail unico e em minusculas
   * - senha obrigatoria na criacao, opcional na edicao
   * - nunca deixar a equipe sem profissional ativo nem sem admin ativo
   * - nao remover profissional com vinculos clinicos
   */
  async save(input: SaveProfessionalInput): Promise<SaveProfessionalResult> {
    const all = await this.findAll();
    const existing = input.id ? all.find((p) => p.id === input.id) : null;

    if (input.id && !existing) {
      return { ok: false, error: 'Profissional nao encontrado.' };
    }

    const campos: Record<string, string> = {};

    const name = (input.name || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    const crp = (input.crp || '').trim();
    const role = (input.role || '').trim();
    const password = input.password || '';
    const active = input.active !== false;
    const admin = input.admin === true;

    if (!name) campos.name = 'Campo obrigatorio.';
    else if (name.length > 80) campos.name = 'Use no maximo 80 caracteres.';

    if (!email) campos.email = 'Campo obrigatorio.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) campos.email = 'E-mail invalido.';

    if (!crp) campos.crp = 'Campo obrigatorio.';
    else if (crp.length > 30) campos.crp = 'Use no maximo 30 caracteres.';

    if (role.length > 60) campos.role = 'Use no maximo 60 caracteres.';

    if (password) {
      if (password.length < 4) campos.password = 'Use pelo menos 4 caracteres.';
      else if (password.length > 40) campos.password = 'Use no maximo 40 caracteres.';
    } else if (!existing) {
      campos.password = 'Campo obrigatorio.';
    }

    if (email && all.some((p) => p.email?.toLowerCase() === email && p.id !== input.id)) {
      campos.email = 'Ja existe um profissional com este e-mail.';
    }

    const others = existing ? all.filter((p) => p.id !== existing.id) : all;

    const activeAfter = others.filter((p) => p.active).length + (active ? 1 : 0);
    if (activeAfter === 0) {
      campos.active = 'E preciso manter ao menos um profissional ativo.';
    }

    const wasActiveAdmin = !!existing && existing.admin === true && existing.active !== false;
    const adminsAfter =
      others.filter((p) => p.admin && p.active).length + (admin && active ? 1 : 0);
    if ((wasActiveAdmin || (admin && active)) && adminsAfter === 0) {
      campos.admin = 'E preciso manter ao menos um administrador ativo.';
    }

    if (Object.keys(campos).length > 0) {
      return { ok: false, error: 'Revise os campos destacados.', campos };
    }

    const payload: Partial<Professional> = { name, email, crp, role, active, admin };
    if (password) {
      payload.passwordHash = serializarHash(await gerarHashSenha(password));
      // Some o texto puro do mesmo registro: editar a equipe nao pode deixar
      // a senha antiga jogada no armazenamento.
      payload.password = undefined;
    } else if (existing) {
      payload.passwordHash = existing.passwordHash;
    }

    if (existing) {
      return { ok: true, professional: (await this.update(existing.id, payload))!, changedSelf: false };
    }

    const created = await this.create(payload as Omit<Professional, 'id' | 'createdAt' | 'updatedAt'>);
    return { ok: true, professional: created, changedSelf: false };
  }

  /**
   * Remove um profissional. Bloqueia quando ele e o ultimo ativo/ultimo admin
   * ou quando possui evolucoes, agendamentos ativos ou termos registrados.
   */
  async removeWithChecks(
    id: string,
    links: { evolutions: number; appointments: number; consents: number }
  ): Promise<{ ok: boolean; error?: string; links?: string[] }> {
    const all = await this.findAll();
    const target = all.find((p) => p.id === id);
    if (!target) return { ok: false, error: 'Profissional nao encontrado.' };

    if (target.active && all.filter((p) => p.active).length === 1) {
      return { ok: false, error: 'E preciso manter ao menos um profissional ativo.' };
    }

    if (target.admin && target.active && all.filter((p) => p.admin && p.active).length === 1) {
      return { ok: false, error: 'E preciso manter ao menos um administrador ativo.' };
    }

    const vinculos: string[] = [];
    if (links.evolutions) vinculos.push(`${links.evolutions} evolucao(oes)`);
    if (links.appointments) vinculos.push(`${links.appointments} agendamento(s) ativo(s)`);
    if (links.consents) vinculos.push(`${links.consents} termo(s) de consentimento`);

    if (vinculos.length) {
      return {
        ok: false,
        error: `Desative o acesso em vez de excluir: ${vinculos.join(', ')}.`,
        links: vinculos,
      };
    }

    await this.delete(id);
    return { ok: true };
  }
}

export const professionalRepository = new ProfessionalRepository();