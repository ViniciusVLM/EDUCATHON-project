/**
 * Card — cartão branco com cantos arredondados e sombra suave.
 * Variante `dashed` exibe borda tracejada com botão "+" central.
 */
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  className?: string;
  dashed?: boolean;
  variant?: 'default' | 'hover' | 'dashed';
  onAdd?: () => void;
  addLabel?: string;
  style?: React.CSSProperties;
  as?: React.ElementType;
}

export function Card({
  children,
  className = '',
  dashed = false,
  variant,
  onAdd,
  addLabel = 'Adicionar',
  style,
  as: Tag = 'div',
  ...rest
}: CardProps) {
  const isDashed = dashed || variant === 'dashed';
  const isHover = variant === 'hover';

  if (isDashed) {
    return (
      <Tag
        className={`ui-card ui-card--dashed ${className}`}
        style={style}
        {...rest}
      >
        {onAdd ? (
          <button
            type="button"
            className="ui-card__add-btn"
            onClick={onAdd}
            aria-label={addLabel}
          >
            <span className="ui-card__add-icon" aria-hidden="true">+</span>
            <span className="ui-card__add-label">{addLabel}</span>
          </button>
        ) : (
          children
        )}
      </Tag>
    );
  }

  return (
    <Tag className={`ui-card ${isHover ? 'ui-card--hover' : ''} ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}
