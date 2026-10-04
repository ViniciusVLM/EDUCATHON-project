/**
 * Card — cartão branco com cantos arredondados e sombra suave.
 * Variante `dashed` exibe borda tracejada com botão "+" central.
 */
import React from 'react';

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  dashed?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  style?: React.CSSProperties;
  as?: React.ElementType;
}

export function Card({
  children,
  className = '',
  dashed = false,
  onAdd,
  addLabel = 'Adicionar',
  style,
  as: Tag = 'div',
}: CardProps) {
  if (dashed) {
    return (
      <Tag
        className={`ui-card ui-card--dashed ${className}`}
        style={style}
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
    <Tag className={`ui-card ${className}`} style={style}>
      {children}
    </Tag>
  );
}
