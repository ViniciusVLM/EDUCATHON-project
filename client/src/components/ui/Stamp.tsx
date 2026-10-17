/**
 * Stamp — selo de status no estilo "carimbo" de professor.
 */
import React from 'react';

type StampTone = 'pending' | 'approved' | 'reviewed' | 'error' | 'info';

interface StampProps {
  tone?: StampTone;
  children: React.ReactNode;
  className?: string;
}

export function Stamp({ tone = 'info', children, className = '' }: StampProps) {
  return <span className={`stamp stamp--${tone} ${className}`}>{children}</span>;
}
