/**
 * Main App Component
 */

import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { isTauri } from './utils/tauri';
import { useAuth, useConfig, useUI } from './store';
import { ClinicProvider } from './context/ClinicContext';
import { ToastContainer, ModalPortal } from './components/ui';
import { Layout } from './components/layout/Layout';
import { ModalRouter, ModalTitle } from './components/modal/ModalRouter';
import { Tour } from './components/onboarding/Tour';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { EvolutionPage } from './pages/EvolutionPage';
import { ServicesPage } from './pages/ServicesPage';
import { AgendaPage } from './pages/AgendaPage';
import { LGPDPage } from './pages/LGPDPage';
import { ReportsPage } from './pages/ReportsPage';
import { AjudaPage } from './pages/AjudaPage';
import { AdminPage } from './pages/AdminPage';
import './styles/globals.css';

// No app empacotado o frontend e servido via tauri://localhost, que nao faz
// fallback de rotas: recarregar em /patients devolveria 404. O HashRouter
// mantem o deep link no hash; na web o BrowserRouter continua valendo.
const Router = isTauri() ? HashRouter : BrowserRouter;

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, isAdmin, checkAuth } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    checkAuth().finally(() => {
      if (active) setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [checkAuth]);

  // Wait for the session check before deciding, otherwise a hard reload would
  // bounce an authenticated user to /login.
  if (checking) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/evolution/:id?" element={<EvolutionPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/lgpd" element={<LGPDPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/ajuda" element={<AjudaPage />} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  const { loadConfig } = useConfig();
  const { checkAuth } = useAuth();
  const { toasts, removeToast, activeModal, modalProps, closeModal } = useUI();

  useEffect(() => {
    loadConfig();
    checkAuth();
  }, [loadConfig, checkAuth]);

  return (
    <ClinicProvider>
      <Router>
        <div className="app">
          <AppRoutes />
          <ToastContainer toasts={toasts} onRemove={removeToast} />
          <Tour />
          {activeModal && (
            <ModalPortal isOpen onClose={closeModal} title={<ModalTitle />} size={modalProps?.size}>
              <ModalRouter />
            </ModalPortal>
          )}
        </div>
      </Router>
    </ClinicProvider>
  );
}

export default App;