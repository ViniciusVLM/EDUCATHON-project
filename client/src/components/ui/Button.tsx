/**
 * Button — botão acessível com variantes visuais.
 *
 * Variantes:
 *  - 'primary'  → azul-marinho escuro (ação principal)
 *  - 'purple'   → roxo (#6C63FF)
 *  - 'ghost'    → transparente com borda
 *  - 'danger'   → vermelho
 *  - 'success'  → verde
 *
 * Tamanhos: 'sm' | 'md' (padrão) | 'lg'
 * iconOnly: true → quadrado com aria-label obrigatório
 */
import React from 'react';

type ButtonVariant = 'primary' | 'purple' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  iconOnly = false,
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    iconOnly ? 'ui-btn--icon' : '',
    loading ? 'ui-btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="ui-btn__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
