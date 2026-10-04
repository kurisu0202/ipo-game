// ===== 決定論的な乱数（状態はゲームの seed に保存する） =====
import type { Game } from './types';

export function next(g: Game): number {
  // mulberry32
  let t = (g.seed = (g.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const int = (g: Game, a: number, b: number) => a + Math.floor(next(g) * (b - a + 1));
export const chance = (g: Game, p: number) => next(g) < p;
export const pick = <T>(g: Game, arr: readonly T[]): T => arr[Math.floor(next(g) * arr.length)];
export function shuffle<T>(g: Game, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(g) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function weighted<T>(g: Game, items: readonly T[], weight: (x: T) => number): T {
  const total = items.reduce((t, x) => t + weight(x), 0);
  let r = next(g) * total;
  for (const x of items) { r -= weight(x); if (r < 0) return x; }
  return items[items.length - 1];
}
