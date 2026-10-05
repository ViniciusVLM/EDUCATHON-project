/**
 * AppLayout — layout principal das rotas protegidas.
 *
 * Estrutura:
 *   <body>
 *     <div.app-shell>
 *       <aside.app-sidebar>  ← barra lateral roxa (desktop)
 *       <div.app-main>
 *         <header.app-topbar> ← abas, alternador de tema, sino, menu
 *         <main.app-content>
 *           {children}
 *
 * Em telas ≤ 768px a sidebar vira uma barra de navegação inferior.
 */
import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  IconGrid,
  IconDocument,
  IconUsers,
  IconPlus,
  IconBell,
  IconSun,
  IconMoon,
  IconLogout,
  IconCap,
} from '../ui/Icons';
import { Avatar } from '../ui/Avatar';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  id: string;
}

const navItems: NavItem[] = [
  { to: '/painel',     label: 'Painel',         icon: <IconGrid />,     id: 'nav-painel'     },
  { to: '/activities', label: 'Atividades',      icon: <IconDocument />, id: 'nav-atividades' },
  { to: '/classes',    label: 'Turmas',          icon: <IconUsers />,    id: 'nav-turmas'     },
  { to: '/setup',      label: 'Nova Atividade',  icon: <IconPlus />,     id: 'nav-nova'       },
];

// Abas exibidas na topbar (mapeadas às rotas)
const tabItems = [
  { to: '/painel',     label: 'Painel'     },
  { to: '/activities', label: 'Atividades' },
  { to: '/classes',    label: 'Turmas'     },
  { to: '/setup',      label: 'Nova'       },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { teacher, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu do usuário ao clicar fora
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [userMenuOpen]);

  function handleLogout() {
    setUserMenuOpen(false);
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="app-sidebar" aria-label="Navegação principal">
        {/* Logo */}
        <Link to="/painel" className="app-sidebar__logo" aria-label="Educathon" title="Educathon">
          <div className="app-sidebar__logo-icon">
            <IconCap size={22} />
          </div>
        </Link>

        {/* Itens de navegação */}
        <nav className="app-sidebar__nav">
          <ul role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  id={item.id}
                  className={({ isActive }) =>
                    `app-sidebar__nav-item${isActive ? ' app-sidebar__nav-item--active' : ''}`
                  }
                  aria-label={item.label}
                  title={item.label}
                >
                  {item.icon}
                  <span className="app-sidebar__nav-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Botão de tema na sidebar (fica na base) */}
        <div className="app-sidebar__footer">
          <button
            type="button"
            className="app-sidebar__nav-item"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
          >
            {theme === 'light' ? <IconMoon /> : <IconSun />}
            <span className="app-sidebar__nav-label">
              {theme === 'light' ? 'Escuro' : 'Claro'}
            </span>
          </button>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="app-main">
        {/* ── Topbar ── */}
        <header className="app-topbar">
          {/* Abas de texto */}
          <nav className="app-topbar__tabs" aria-label="Abas de navegação">
            {tabItems.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `app-topbar__tab${isActive ? ' app-topbar__tab--active' : ''}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          {/* Ações à direita */}
          <div className="app-topbar__actions">
            {/* Alternador de tema (pílula) */}
            <div className="app-topbar__theme-toggle" role="group" aria-label="Alternador de tema">
              <button
                type="button"
                id="theme-btn-light"
                className={`app-topbar__theme-btn${theme === 'light' ? ' app-topbar__theme-btn--active' : ''}`}
                onClick={() => theme !== 'light' && toggleTheme()}
                aria-pressed={theme === 'light'}
                aria-label="Tema claro"
              >
                <IconSun size={14} />
                Claro
              </button>
              <button
                type="button"
                id="theme-btn-dark"
                className={`app-topbar__theme-btn${theme === 'dark' ? ' app-topbar__theme-btn--active' : ''}`}
                onClick={() => theme !== 'dark' && toggleTheme()}
                aria-pressed={theme === 'dark'}
                aria-label="Tema escuro"
              >
                <IconMoon size={14} />
                Escuro
              </button>
            </div>

            {/* Sino */}
            <button
              type="button"
              className="app-topbar__icon-btn"
              aria-label="Notificações"
              id="btn-notifications"
            >
              <IconBell size={18} />
            </button>

            {/* Menu do usuário */}
            <div className="app-topbar__user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="app-topbar__user-btn"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Menu do professor ${teacher?.name ?? ''}`}
                id="btn-user-menu"
              >
                <Avatar name={teacher?.name ?? 'P'} size="sm" />
                <span className="app-topbar__user-name">
                  {teacher?.name?.split(' ')[0] ?? 'Professor'}
                </span>
              </button>

              {userMenuOpen && (
                <div
                  className="app-topbar__dropdown"
                  role="menu"
                  aria-label="Opções do usuário"
                >
                  <div className="app-topbar__dropdown-header">
                    <Avatar name={teacher?.name ?? 'P'} size="md" />
                    <div>
                      <p className="app-topbar__dropdown-name">{teacher?.name}</p>
                      <p className="app-topbar__dropdown-email">{teacher?.email}</p>
                    </div>
                  </div>
                  <hr className="app-topbar__dropdown-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="app-topbar__dropdown-item app-topbar__dropdown-item--danger"
                    onClick={handleLogout}
                    id="btn-logout-dropdown"
                  >
                    <IconLogout size={16} />
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Conteúdo ── */}
        <main className="app-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* ── Barra inferior (mobile) ── */}
      <nav className="app-bottombar" aria-label="Navegação inferior">
        {navItems.map((item) => (
          <NavLink
            key={item.id + '-mobile'}
            to={item.to}
            className={({ isActive }) =>
              `app-bottombar__item${isActive ? ' app-bottombar__item--active' : ''}`
            }
            aria-label={item.label}
          >
            {item.icon}
            <span className="app-bottombar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
