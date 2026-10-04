/**
 * ProgressBar — barra de progresso fina em roxo.
 * value: 0–100
 */
import React from 'react';

interface ProgressBarProps {
  value: number;
  label?: string;
  color?: 'purple' | 'green' | 'red' | 'amber';
  height?: number;
  className?: string;
}

export function ProgressBar({
  value,
  label,
  color = 'purple',
  height = 6,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`ui-progress-bar ${className}`} style={{ '--pb-height': `${height}px` } as React.CSSProperties}>
      {label && (
        <div className="ui-progress-bar__header">
          <span className="ui-progress-bar__label">{label}</span>
          <span className="ui-progress-bar__value">{clamped}%</span>
        </div>
      )}
      <div
        className="ui-progress-bar__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`ui-progress-bar__fill ui-progress-bar__fill--${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
