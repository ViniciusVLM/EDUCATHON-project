/**
 * Mascot — "Grafi", o lápis-professor do Educathon.
 * Ilustração original em SVG (sem dependências externas).
 *
 * Variantes:
 *  - 'full'  → corpo inteiro acenando e segurando a folha corrigida
 *  - 'head'  → só o rosto (logo, telas pequenas)
 */
interface MascotProps {
  size?: number;
  variant?: 'full' | 'head';
  className?: string;
  /** Texto alternativo. Se omitido, a imagem é decorativa (aria-hidden). */
  title?: string;
}

const INK = '#1C1714';

export function Mascot({ size = 220, variant = 'full', className = '', title }: MascotProps) {
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const };

  if (variant === 'head') {
    return (
      <svg
        className={`mascot mascot--head ${className}`}
        viewBox="56 4 108 88"
        width={size}
        height={(size * 88) / 108}
        fill="none"
        stroke={INK}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
        {...a11y}
      >
        <rect x="64" y="10" width="92" height="28" rx="12" fill="#A60311" />
        <rect x="62" y="34" width="96" height="54" fill="#F29D52" />
        <ellipse cx="91" cy="58" rx="13" ry="15" fill="#FFFFFD" />
        <ellipse cx="129" cy="58" rx="13" ry="15" fill="#FFFFFD" />
        <circle cx="94" cy="62" r="6" fill={INK} stroke="none" />
        <circle cx="132" cy="62" r="6" fill={INK} stroke="none" />
        <path d="M100 76 Q110 86 120 76" fill="#590202" strokeWidth={5} />
      </svg>
    );
  }

  return (
    <svg
      className={`mascot ${className}`}
      viewBox="0 0 220 280"
      width={size}
      height={(size * 280) / 220}
      fill="none"
      stroke={INK}
      strokeWidth={6}
      strokeLinejoin="round"
      strokeLinecap="round"
      {...a11y}
    >
      <ellipse cx="110" cy="268" rx="62" ry="8" fill={INK} stroke="none" opacity=".18" />
      <g className="mascot__wave">
        <path d="M62 120 C 36 110, 26 88, 30 64" />
        <circle cx="30" cy="58" r="11" fill="#FFFFFD" />
      </g>
      <path d="M158 132 C 178 140, 186 152, 184 166" />
      <g transform="rotate(10 186 185)">
        <rect x="166" y="160" width="40" height="50" rx="4" fill="#FFFFFD" />
        <path d="M176 176 h22 M175 186 h20 M174 196 h14" strokeWidth={4} />
        <path d="M190 194 l5 5 l9 -11" stroke="#2E7D4F" strokeWidth={5} />
      </g>
      <circle cx="184" cy="170" r="10" fill="#FFFFFD" />
      <rect x="64" y="10" width="92" height="40" rx="14" fill="#A60311" />
      <rect x="60" y="46" width="100" height="26" rx="4" fill="#EDEAE3" />
      <path d="M60 59 h100" strokeWidth={4} />
      <rect x="62" y="70" width="96" height="120" fill="#F29D52" />
      <path d="M94 70 v120 M126 70 v120" strokeWidth={3} opacity=".35" />
      <path d="M62 190 L110 252 L158 190 Z" fill="#F7DDB5" />
      <path d="M95 232 L110 252 L125 232 Z" fill={INK} />
      <ellipse cx="91" cy="118" rx="14" ry="16" fill="#FFFFFD" />
      <ellipse cx="129" cy="118" rx="14" ry="16" fill="#FFFFFD" />
      <circle cx="94" cy="122" r="6" fill={INK} stroke="none" />
      <circle cx="132" cy="122" r="6" fill={INK} stroke="none" />
      <circle cx="96" cy="119" r="2" fill="#FFFFFD" stroke="none" />
      <circle cx="134" cy="119" r="2" fill="#FFFFFD" stroke="none" />
      <ellipse cx="78" cy="148" rx="8" ry="5" fill="#A60311" stroke="none" opacity=".45" />
      <ellipse cx="142" cy="148" rx="8" ry="5" fill="#A60311" stroke="none" opacity=".45" />
      <path d="M96 148 Q110 164 124 148" fill="#590202" />
      <circle cx="34" cy="22" r="5" fill="#FFFFFD" />
      <circle cx="186" cy="34" r="6" fill="#FFFFFD" />
      <circle cx="200" cy="96" r="4" fill="#FFFFFD" />
    </svg>
  );
}
