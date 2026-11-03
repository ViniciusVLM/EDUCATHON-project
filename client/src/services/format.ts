/** Formatação de valores para a interface. */

/** Duração legível em português: 40 → "40 s"; 75 → "1 min 15 s"; 5400 → "1 h 30 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return rest ? `${min} min ${rest} s` : `${min} min`;
}
