import { describe, expect, it } from 'vitest';
import { createGame, submit, tryResolve } from '../src/logic/game';
import { pickIndustry, randomBid, randomDev, smartBid, smartDev } from '../src/logic/bots';
import { GAME } from '../src/logic/config';
import type { Game } from '../src/logic/types';

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function invariants(g: Game) {
  // 帳簿の合計 ＋ 開始資金 ＝ 今の現金（記録漏れがない）
  g.companies.forEach(c => {
    const sum = Object.values(c.books || {}).reduce((t, b) => t + Object.values(b).reduce((u, v) => u + (v || 0), 0), 0);
    expect(GAME.startCash + sum).toBe(c.cash);
  });
  // カードは40枚のまま
  const cards = g.cardDeck.length + g.cardDiscard.length + g.companies.reduce((t, c) => t + c.hand.length, 0);
  expect(cards).toBe(40);
  // 社員は重複しない・貸し手は別会社
  const ids = g.companies.flatMap(c => c.engineers.map(e => e.id));
  expect(new Set(ids).size).toBe(ids.length);
  g.companies.forEach(c => c.engineers.forEach(e => {
    if (e.loan) { expect(e.loan.from).not.toBe(c.id); expect(g.companies.some(o => o.id === e.loan!.from)).toBe(true); }
    if (e.assign && e.assign !== 'svc') expect(c.projects.some(p => p.id === e.assign)).toBe(true);
  }));
}

function play(n: number, seed: number, smart: boolean) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `会社${i}` }));
  const g = createGame(players, seed);
  const r = rng(seed * 7 + 1);
  for (let step = 0; step < 100 && g.phase !== 'end'; step++) {
    g.companies.forEach(c => {
      const s = g.phase === 'pick' ? pickIndustry(g, c.id, r) : g.phase === 'bid' ? (smart ? smartBid : randomBid)(g, c.id, r) : (smart ? smartDev : randomDev)(g, c.id, r);
      submit(g, c.id, s);
    });
    expect(tryResolve(g)).toBe(true);
    invariants(g);
  }
  expect(g.phase).toBe('end');
  expect(g.final!.length).toBe(n);
  return g;
}

describe('自動対戦', () => {
  it('ランダムボットで600ゲーム、エラーも増減もない', () => {
    for (let i = 0; i < 600; i++) play(2 + (i % 3), 1000 + i, false);
  });
  it('賢いボットの利益分布（4人戦）', () => {
    const profits: number[] = [];
    for (let i = 0; i < 300; i++) play(4, 5000 + i, true).final!.forEach(r => profits.push(r.profit));
    profits.sort((a, b) => a - b);
    const q = (p: number) => profits[Math.floor((profits.length - 1) * p)];
    console.log(`4人戦の利益：最小 ${q(0)} / 25% ${q(0.25)} / 中央値 ${q(0.5)} / 75% ${q(0.75)} / 最大 ${q(1)}（開始資金 ${GAME.startCash}）`);
    expect(profits.length).toBe(1200);
  });
});

describe('2年モード', () => {
  it('8期で最終決算になり、ボットの利益分布を出す', () => {
    const profits: number[] = [];
    for (let i = 0; i < 200; i++) {
      const players = Array.from({ length: 4 }, (_, k) => ({ id: `c${k}`, name: `会社${k}` }));
      const g = createGame(players, 7000 + i, 'two', 8);
      const r = rng(i + 3);
      expect(g.happenings).toHaveLength(8);
      for (let step = 0; step < 100 && g.phase !== 'end'; step++) {
        g.companies.forEach(c => submit(g, c.id, g.phase === 'pick' ? pickIndustry(g, c.id, r) : g.phase === 'bid' ? smartBid(g, c.id, r) : smartDev(g, c.id, r)));
        expect(tryResolve(g)).toBe(true);
        invariants(g);
      }
      expect(g.phase).toBe('end');
      expect(g.q).toBe(7);
      g.final!.forEach(f => profits.push(f.profit));
    }
    profits.sort((a, b) => a - b);
    const q = (p: number) => profits[Math.floor((profits.length - 1) * p)];
    console.log(`2年モードの利益：最小 ${q(0)} / 25% ${q(0.25)} / 中央値 ${q(0.5)} / 75% ${q(0.75)} / 最大 ${q(1)}`);
  });
  it('対応していない期数は標準（12期）になる', () => {
    expect(createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 1, 'x', 5).quarters).toBe(12);
  });
});
