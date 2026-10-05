/**
 * Chip — etiqueta pastel para categorias, prioridades e estados.
 *
 * Paleta: 'pink' | 'green' | 'purple' | 'blue' | 'amber'
 */
import React from 'react';

type ChipColor = 'pink' | 'green' | 'purple' | 'blue' | 'amber';
type ChipSize = 'sm' | 'md';

interface ChipProps {
  label?: string;
  children?: React.ReactNode;
  color?: ChipColor;
  variant?: ChipColor;
  size?: ChipSize;
  className?: string;
}

export function Chip({ label, children, color, variant = 'purple', size = 'md', className = '' }: ChipProps) {
  const chosenColor = color || variant;
  return (
    <span className={`ui-chip ui-chip--${chosenColor} ui-chip--${size} ${className}`}>
      {children ?? label}
    </span>
  );
}
