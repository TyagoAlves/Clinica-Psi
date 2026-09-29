/**
 * Global Store - Zustand
 * Single source of truth for UI state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { AppConfig, Professional } from '../domain/types';
import { authService } from '../services/AuthService';
import { clinicService } from '../services/ClinicService';

interface UIState {
  // Global UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Loading states
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;

  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Modals
  activeModal: string | null;
  modalProps: Record<string, any>;
  openModal: (name: string, props?: any) => void;
  closeModal: () => void;

  // Search
  globalSearch: string;
  setGlobalSearch: (query: string) => void;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface DataState {
  // Current context
  currentPatient: any | null;
  setCurrentPatient: (patient: any) => void;

  currentAppointment: any | null;
  setCurrentAppointment: (appointment: any) => void;

  // Filters
  patientsFilter: { search: string; status: string; serviceId: string };
  setPatientsFilter: (filter: Partial<DataState['patientsFilter']>) => void;

  appointmentsFilter: { date: string; professionalId: string; status: string };
  setAppointmentsFilter: (filter: Partial<DataState['appointmentsFilter']>) => void;
}

interface AuthState {
  professional: Professional | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (updates: DeepPartialConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
}

type DeepPartialConfig = {
  [K in keyof AppConfig]?: AppConfig[K] extends object
    ? { [P in keyof AppConfig[K]]?: AppConfig[K][P] }
    : AppConfig[K];
};

type AppStore = UIState & DataState & AuthState & ConfigState;

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // UI State
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      globalLoading: false,
      setGlobalLoading: (loading) => set({ globalLoading: loading }),

      toasts: [],
      addToast: (toast) => {
        const id = crypto.randomUUID();
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }],
        }));
        // Auto-remove
        setTimeout(() => get().removeToast(id), toast.duration || 4000);
      },
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

      activeModal: null,
      modalProps: {},
      openModal: (name, props) => set({ activeModal: name, modalProps: props || {} }),
      closeModal: () => set({ activeModal: null, modalProps: {} }),

      globalSearch: '',
      setGlobalSearch: (query) => set({ globalSearch: query }),

      // Data State
      currentPatient: null,
      setCurrentPatient: (patient) => set({ currentPatient: patient }),

      currentAppointment: null,
      setCurrentAppointment: (appointment) => set({ currentAppointment: appointment }),

      patientsFilter: { search: '', status: 'all', serviceId: 'all' },
      setPatientsFilter: (filter) => set((state) => ({
        patientsFilter: { ...state.patientsFilter, ...filter },
      })),

      appointmentsFilter: { date: new Date().toISOString().split('T')[0], professionalId: 'all', status: 'all' },
      setAppointmentsFilter: (filter) => set((state) => ({
        appointmentsFilter: { ...state.appointmentsFilter, ...filter },
      })),

      // Auth State
      professional: null,
      isAuthenticated: false,
      isAdmin: false,

      login: async (email, password) => {
        const result = await authService.login(email, password);
        if (result.success && result.professional) {
          set({
            professional: result.professional,
            isAuthenticated: true,
            isAdmin: result.professional.admin === true,
          });
          return { success: true };
        }
        return { success: false, error: result.error };
      },

      logout: async () => {
        await authService.logout();
        set({
          professional: null,
          isAuthenticated: false,
          isAdmin: false,
          currentPatient: null,
          currentAppointment: null,
        });
      },

      checkAuth: async () => {
        const professional = await authService.getSession();
        if (professional) {
          set({
            professional,
            isAuthenticated: true,
            isAdmin: professional.admin === true,
          });
        }
      },

      // Config State
      config: null,
      loading: true,

      loadConfig: async () => {
        set({ loading: true });
        try {
          const config = await clinicService.getConfig();
          set({ config, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      updateConfig: async (updates) => {
        // updateClinic embrulha o que recebe dentro de `clinic`: usar ele aqui
        // gravava marca e textos no lugar errado
        const updated = await clinicService.updateConfig(updates);
        set({ config: updated });
      },

      resetConfig: async () => {
        const config = await clinicService.resetToDefaults();
        set({ config });
      },
    }),
    {
      name: 'clinica-psi-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        patientsFilter: state.patientsFilter,
        appointmentsFilter: state.appointmentsFilter,
      }),
    }
  )
);

// Selectors
// NOTE: zustand v5 uses useSyncExternalStore, so selectors returning a new
// object must be wrapped in useShallow to keep the snapshot reference stable.
export const useAuth = () => useStore(useShallow((state) => ({
  professional: state.professional,
  isAuthenticated: state.isAuthenticated,
  isAdmin: state.isAdmin,
  sidebarOpen: state.sidebarOpen,
  toggleSidebar: state.toggleSidebar,
  login: state.login,
  logout: state.logout,
  checkAuth: state.checkAuth,
})));

export const useConfig = () => useStore(useShallow((state) => ({
  config: state.config,
  loading: state.loading,
  loadConfig: state.loadConfig,
  updateConfig: state.updateConfig,
  resetConfig: state.resetConfig,
  isDemo: state.config?.demo === true,
  homologacao: state.config?.homologacao === true,
})));

export const useUI = () => useStore(useShallow((state) => ({
  sidebarOpen: state.sidebarOpen,
  setSidebarOpen: state.setSidebarOpen,
  toggleSidebar: state.toggleSidebar,
  globalLoading: state.globalLoading,
  setGlobalLoading: state.setGlobalLoading,
  toasts: state.toasts,
  addToast: state.addToast,
  removeToast: state.removeToast,
  activeModal: state.activeModal,
  modalProps: state.modalProps,
  openModal: state.openModal,
  closeModal: state.closeModal,
  globalSearch: state.globalSearch,
  setGlobalSearch: state.setGlobalSearch,
})));

export const useData = () => useStore(useShallow((state) => ({
  currentPatient: state.currentPatient,
  setCurrentPatient: state.setCurrentPatient,
  currentAppointment: state.currentAppointment,
  setCurrentAppointment: state.setCurrentAppointment,
  patientsFilter: state.patientsFilter,
  setPatientsFilter: state.setPatientsFilter,
  appointmentsFilter: state.appointmentsFilter,
  setAppointmentsFilter: state.setAppointmentsFilter,
})));