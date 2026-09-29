/**
 * Authentication Service
 */

import { professionalRepository } from '../repositories';
import { storage } from '../adapters';
import type { Professional } from '../domain/types';

const SESSION_KEY = 'session';

export interface AuthResult {
  success: boolean;
  professional?: Professional;
  error?: string;
}

export interface SessionData {
  professional: Professional;
  expiresAt: string;
}

export class AuthService {
  async login(email: string, password: string): Promise<AuthResult> {
    const professional = await professionalRepository.authenticate(email, password);
    if (!professional) {
      return { success: false, error: 'E-mail ou senha inválidos.' };
    }

    const session: SessionData = {
      professional,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    };

    await storage.set(SESSION_KEY, session);
    return { success: true, professional };
  }

  async logout(): Promise<void> {
    await storage.remove(SESSION_KEY);
  }

  async getSession(): Promise<Professional | null> {
    const session = await storage.get<SessionData>(SESSION_KEY);
    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      await this.logout();
      return null;
    }

    return session.professional;
  }

  async refreshSession(professional: any): Promise<void> {
    const session: SessionData = {
      professional,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await storage.set(SESSION_KEY, session);
  }

  async isAdmin(professional?: any): Promise<boolean> {
    if (!professional) {
      const session = await this.getSession();
      return session?.admin === true;
    }
    return professional.admin === true;
  }

  async requireAuth(): Promise<any> {
    const professional = await this.getSession();
    if (!professional) throw new Error('NOT_AUTHENTICATED');
    return professional;
  }

  async requireAdmin(): Promise<any> {
    const professional = await this.requireAuth();
    if (!professional.admin) throw new Error('NOT_ADMIN');
    return professional;
  }
}

export const authService = new AuthService();