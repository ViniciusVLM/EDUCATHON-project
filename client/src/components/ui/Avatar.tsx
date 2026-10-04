/**
 * Avatar — iniciais do nome do usuário em círculo colorido.
 * Suporta uma URL de imagem opcional.
 * size: 'sm' (32px) | 'md' (40px, padrão) | 'lg' (56px)
 */
import React from 'react';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  return (
    <div
      className={`ui-avatar ui-avatar--${size} ${className}`}
      aria-label={name}
      role="img"
    >
      {src ? (
        <img src={src} alt={name} className="ui-avatar__img" />
      ) : (
        <span className="ui-avatar__initials" aria-hidden="true">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}
