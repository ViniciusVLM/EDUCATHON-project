/**
 * Chip — etiqueta pastel para categorias, prioridades e estados.
 *
 * Paleta: 'pink' | 'green' | 'purple' | 'blue' | 'amber'
 */
import React from 'react';

type ChipColor = 'pink' | 'green' | 'purple' | 'blue' | 'amber';

interface ChipProps {
  label: string;
  color?: ChipColor;
  className?: string;
}

export function Chip({ label, color = 'purple', className = '' }: ChipProps) {
  return (
    <span className={`ui-chip ui-chip--${color} ${className}`}>
      {label}
    </span>
  );
}
