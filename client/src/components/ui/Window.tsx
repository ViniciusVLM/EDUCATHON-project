/**
 * Window — cartão no formato de "janela de arquivo" (assinatura visual do Educathon).
 * A barra superior mostra um nome de arquivo, como `segunda-guerra.csv`.
 */
import React from 'react';

interface WindowProps extends React.HTMLAttributes<HTMLElement> {
  /** Nome exibido na barra (ex.: "beatriz-santos.txt"). */
  fileName: string;
  /** Destaque da barra: neutra (padrão), laranja ou azul. */
  tone?: 'neutral' | 'orange' | 'blue';
  /** Conteúdo extra à direita da barra (ex.: carimbo de status). */
  barExtra?: React.ReactNode;
  as?: React.ElementType;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Window({
  fileName,
  tone = 'neutral',
  barExtra,
  as: Tag = 'section',
  className = '',
  bodyClassName = '',
  children,
  ...rest
}: WindowProps) {
  return (
    <Tag className={`win win--${tone} ${className}`} {...rest}>
      <div className="win__bar">
        <span className="win__dots" aria-hidden="true"><i /><i /></span>
        <span className="win__name">{fileName}</span>
        <span className="win__extra">{barExtra}</span>
      </div>
      <div className={`win__body ${bodyClassName}`}>{children}</div>
    </Tag>
  );
}

/** Converte um título em nome de arquivo amigável: "Segunda Guerra" → "segunda-guerra". */
export function toFileSlug(text: string, max = 28): string {
  const slug = (text || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > max ? slug.slice(0, max).replace(/-+$/, '') : slug || 'arquivo';
}
