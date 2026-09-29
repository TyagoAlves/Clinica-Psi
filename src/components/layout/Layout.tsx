/**
 * Main Layout - shell alinhado com a POC (sidebar escura + topbar)
 */

import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useUI, useAuth, useConfig, useData } from '../../store';
import {
  Calendar,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  Shield,
  Stethoscope,
  Users,
  Circle,
  type LucideIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Painel', icon: 'LayoutDashboard' },
  { path: '/patients', label: 'Pacientes', icon: 'Users' },
  { path: '/agenda', label: 'Agenda', icon: 'Calendar' },
  { path: '/services', label: 'Serviços', icon: 'Stethoscope' },
  { path: '/lgpd', label: 'LGPD', icon: 'Shield' },
  { path: '/reports', label: 'Relatórios', icon: 'FileText' },
  { path: '/ajuda', label: 'Ajuda', icon: 'HelpCircle' },
] as const;

const ADMIN_NAV = { path: '/admin', label: 'Configurações', icon: 'Settings' };

const TITLES: Record<string, [string, string]> = {
  '/dashboard': ['Painel', 'Visão geral da clínica'],
  '/patients': ['Pacientes', 'Cadastro e acompanhamento'],
  '/patients/': ['Prontuário do paciente', 'Dados cadastrais, evoluções e termos LGPD'],
  '/evolution': ['Registro de evolução', 'Escreva, salve e gere o PDF'],
  '/services': ['Serviços', 'Crie, altere e desative os tipos de atendimento'],
  '/agenda': ['Agenda', 'Agendamento de sessões por dia'],
  '/lgpd': ['LGPD', 'Consentimentos e privacidade de dados'],
  '/reports': ['Relatórios', 'Documentos prontos para gerar em PDF'],
  '/ajuda': ['Ajuda', 'Como usar o sistema, área por área'],
  '/admin': ['Configurações', 'Identidade, textos, termos, equipe e dados'],
};

function resolveTitle(pathname: string): [string, string] {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/patients/')) return TITLES['/patients/'];
  if (pathname.startsWith('/evolution')) return TITLES['/evolution'];
  return TITLES['/dashboard'];
}

function initials(name?: string): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * Icones do menu.
 *
 * Antes eram SVG escritos a mao, sem `stroke-linecap`/`stroke-linejoin`, o que
 * deixava as pontas e as curvas tortas - estetoscopio, relatorio e
 * configuracao. Usando o lucide, que ja e dependencia do projeto, todos os
 * icones ficam com o mesmo desenho e o mesmo traco.
 */
const ICONES: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  Shield,
  FileText,
  HelpCircle,
  Settings,
};

function Icon({ name }: { name: string }) {
  const Desenho = ICONES[name] || Circle;
  return <Desenho size={18} aria-hidden="true" />;
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { professional, logout, isAdmin } = useAuth();
  const { openModal } = useUI();
  const { config } = useConfig();
  const { patientsFilter, setPatientsFilter } = useData();

  const [title, subtitle] = useMemo(() => resolveTitle(location.pathname), [location.pathname]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${title} · ${config?.clinic?.name || config?.texts?.systemName || 'Clínica Psi'}`;
  }, [title, config]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const homologacao = config?.homologacao === true;
  const clinicName = config?.clinic?.name || config?.texts?.systemName || 'Clínica Psi';
  const unit = config?.clinic?.unit || 'Unidade';
  const acronym = (config?.brand?.acronym || 'CP').slice(0, 3);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/patients');
  };

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="logo logo-sm">{acronym}</div>
          <div className="sidebar-title">
            <strong>{clinicName}</strong>
            <span>{unit}</span>
          </div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-ico">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink
              to={ADMIN_NAV.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-ico">
                <Icon name={ADMIN_NAV.icon} />
              </span>
              {ADMIN_NAV.label}
            </NavLink>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{initials(professional?.name)}</div>
          <div className="sidebar-user-info">
            <strong>{professional?.name || '—'}</strong>
            <span>{professional?.role || professional?.crp || '—'}</span>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair do sistema"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <main className="main-content">
        {homologacao && (
          <div className="homologacao-bar" role="status">
            <span className="demo-badge">Homologação</span>
            <span>
              Ambiente de teste: os acessos de demonstração foram removidos. Pode apagar e recriar
              dados livremente em <strong>Configurações › Dados</strong>, mas não use pacientes reais.
            </span>
          </div>
        )}
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={sidebarOpen}
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          <div>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>

          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => openModal('new-patient')}>
              + Novo paciente
            </button>
            <form className="search" onSubmit={submitSearch} role="search">
              <input
                type="search"
                value={patientsFilter.search}
                onChange={(e) => setPatientsFilter({ search: e.target.value })}
                placeholder="Buscar paciente pelo nome ou telefone…"
                aria-label="Buscar paciente pelo nome ou telefone"
              />
            </form>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
