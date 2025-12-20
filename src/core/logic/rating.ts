export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ratingForIndex(index: number, total: number): number {
  if (total <= 1) return 10.0;

  const step = 9 / (total - 1);
  const raw = 10 - index * step;

  const clamped = Math.min(10, Math.max(1, raw));
  return round1(clamped);
}