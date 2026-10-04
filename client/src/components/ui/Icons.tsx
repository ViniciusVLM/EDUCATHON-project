/**
 * Ícones SVG simples e originais para uso interno.
 * Cada ícone é um componente React com aria-hidden="true".
 * Use aria-label no elemento pai quando necessário.
 *
 * Props comuns: size (px, padrão 20), className, style
 */
import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// ── Painel / Grid ──
export function IconGrid({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <rect x="2" y="2" width="7" height="7" rx="2" fill="currentColor" opacity=".9"/>
      <rect x="11" y="2" width="7" height="7" rx="2" fill="currentColor" opacity=".9"/>
      <rect x="2" y="11" width="7" height="7" rx="2" fill="currentColor" opacity=".9"/>
      <rect x="11" y="11" width="7" height="7" rx="2" fill="currentColor" opacity=".9"/>
    </svg>
  );
}

// ── Atividades / Documento ──
export function IconDocument({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <path d="M5 3h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Turmas / Pessoas ──
export function IconUsers({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 17c0-3.314 2.686-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M14 11c3.314 0 6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Nova Atividade / Mais ──
export function IconPlus({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Sino / Notificação ──
export function IconBell({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <path d="M10 2a6 6 0 016 6v3l2 2H2l2-2V8a6 6 0 016-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 16a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Sol / Tema claro ──
export function IconSun({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── Lua / Tema escuro ──
export function IconMoon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Seta / Chevron ──
export function IconChevronDown({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Sair / Logout ──
export function IconLogout({ size = 20, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} style={style}>
      <path d="M13 3h4a1 1 0 011 1v12a1 1 0 01-1 1h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 13l4-4-4-4M4 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Logo Educathon (capelo) ──
export function IconCap({ size = 28, className = '', style }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 28 28" fill="none" className={className} style={style}>
      <path d="M14 6L2 12l12 6 12-6-12-6z" fill="currentColor" opacity=".9"/>
      <path d="M6 15v5c0 2 3.6 4 8 4s8-2 8-4v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24 12v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
