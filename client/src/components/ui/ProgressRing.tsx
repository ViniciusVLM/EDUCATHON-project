/**
 * ProgressRing — anel circular SVG com porcentagem centralizada.
 * value: 0–100
 * color: 'green' | 'red' | 'purple' | 'amber'
 * size: diâmetro em px (padrão 72)
 * stroke: espessura em px (padrão 6)
 */
import React from 'react';

interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: 'green' | 'red' | 'purple' | 'amber';
  label?: string;
  showPercent?: boolean;
  className?: string;
}

export function ProgressRing({
  value,
  size = 72,
  stroke = 6,
  color = 'purple',
  label,
  showPercent = true,
  className = '',
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const colorMap: Record<string, string> = {
    green:  'var(--success-500)',
    red:    'var(--error-500)',
    purple: 'var(--primary-500)',
    amber:  'var(--warning-500)',
  };

  return (
    <div
      className={`ui-progress-ring ${className}`}
      role="img"
      aria-label={label ?? `${clamped}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Trilha */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-border)"
          strokeWidth={stroke}
        />
        {/* Preenchimento */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorMap[color]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset var(--transition-slow)' }}
        />
      </svg>
      {showPercent && (
        <span className="ui-progress-ring__label" aria-hidden="true">
          {clamped}%
        </span>
      )}
    </div>
  );
}
