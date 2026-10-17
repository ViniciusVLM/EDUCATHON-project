/**
 * AppLayout — layout principal das rotas protegidas.
 *
 * Estrutura (redesign "caderno"):
 *   <div.edu-shell>
 *     <header.edu-nav>   ← barra azul: logo (mascote), links, tema, menu do usuário
 *     <main.edu-content> ← {children}
 *     <nav.edu-tabbar>   ← abas inferiores no celular / PWA
 *
 * Em telas ≤ 820px os links da barra superior somem e as abas inferiores aparecem.
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
  IconSun,
  IconMoon,
  IconLogout,
} from '../ui/Icons';
import { Mascot } from '../ui/Mascot';
import { Avatar } from '../ui/Avatar';
import { getHealth } from '../../services/api';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: React.ReactNode;
  id: string;
}

const navItems: NavItem[] = [
  { to: '/painel',     label: 'Painel',         short: 'Painel',     icon: <IconGrid />,     id: 'nav-painel'     },
  { to: '/activities', label: 'Atividades',     short: 'Atividades', icon: <IconDocument />, id: 'nav-atividades' },
  { to: '/classes',    label: 'Turmas',         short: 'Turmas',     icon: <IconUsers />,    id: 'nav-turmas'     },
  { to: '/setup',      label: 'Nova Atividade', short: 'Nova',       icon: <IconPlus />,     id: 'nav-nova'       },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { teacher, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    getHealth()
      .then((health) => {
        if (isMounted && health?.aiMode === 'mock') {
          setIsMockMode(true);
        }
      })
      .catch(() => {
        // Ignora erro
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
    <div className="edu-shell">
      <a href="#main-content" className="edu-skip">Pular para o conteúdo</a>

      {/* ── Barra superior (azul) ── */}
      <header className="edu-nav">
        <Link to="/painel" className="edu-nav__logo" aria-label="Educathon — ir para o painel">
          <span className="edu-nav__logo-mark" aria-hidden="true">
            <Mascot variant="head" size={30} />
          </span>
          <span className="edu-nav__logo-text">Educathon</span>
        </Link>

        <nav className="edu-nav__links" aria-label="Navegação principal">
          <ul role="list">
            {navItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  id={item.id}
                  className={({ isActive }) =>
                    `edu-nav__link${item.to === '/setup' ? ' edu-nav__link--cta' : ''}${isActive ? ' edu-nav__link--active' : ''}`
                  }
                >
                  {item.to === '/setup' ? <IconPlus size={16} /> : null}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="edu-nav__actions">
          {isMockMode && (
            <span
              className="edu-nav__demo"
              id="badge-demo-mode"
              role="status"
              aria-label="Modo demonstração ativo"
            >
              Modo demonstração
            </span>
          )}

          <div className="edu-theme" role="group" aria-label="Alternador de tema">
            <button
              type="button"
              id="theme-btn-light"
              className={`edu-theme__btn${theme === 'light' ? ' edu-theme__btn--active' : ''}`}
              onClick={() => theme !== 'light' && toggleTheme()}
              aria-pressed={theme === 'light'}
              aria-label="Tema claro"
              title="Tema claro"
            >
              <IconSun size={15} />
            </button>
            <button
              type="button"
              id="theme-btn-dark"
              className={`edu-theme__btn${theme === 'dark' ? ' edu-theme__btn--active' : ''}`}
              onClick={() => theme !== 'dark' && toggleTheme()}
              aria-pressed={theme === 'dark'}
              aria-label="Tema escuro"
              title="Tema escuro"
            >
              <IconMoon size={15} />
            </button>
          </div>

          <div className="edu-user" ref={userMenuRef}>
            <button
              type="button"
              className="edu-user__btn"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label={`Menu do professor ${teacher?.name ?? ''}`}
              id="btn-user-menu"
            >
              <Avatar name={teacher?.name ?? 'P'} size="sm" />
            </button>

            {userMenuOpen && (
              <div className="edu-user__menu" role="menu" aria-label="Opções do usuário">
                <div className="edu-user__head">
                  <p className="edu-user__name">{teacher?.name}</p>
                  <p className="edu-user__email">{teacher?.email}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="edu-user__item"
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
      <main className="edu-content" id="main-content" tabIndex={-1}>
        {children}
      </main>

      {/* ── Abas inferiores (celular / PWA) ── */}
      <nav className="edu-tabbar" aria-label="Navegação inferior">
        {navItems.map((item) => (
          <NavLink
            key={item.id + '-mobile'}
            to={item.to}
            className={({ isActive }) =>
              `edu-tabbar__item${isActive ? ' edu-tabbar__item--active' : ''}`
            }
            aria-label={item.label}
          >
            {item.icon}
            <span className="edu-tabbar__label">{item.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
