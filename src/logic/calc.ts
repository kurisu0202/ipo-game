// ===== 計算ヘルパー（解決処理と画面の両方で使う） =====
import { GAME, SERVICE, SKILLS } from './config';
import type { ActiveProject, Company, Engineer, Game, Skill, Skills } from './types';

/** このゲームの全期数と年数 */
export const totalQ = (g: { quarters?: number }) => g.quarters || GAME.quarters;
export const totalYears = (g: { quarters?: number }) => Math.round(totalQ(g) / 4);

export const round10 = (v: number) => Math.round(v / 10) * 10;
export const skillSum = (s: Skills) => SKILLS.reduce((t, k) => t + (s[k] || 0), 0);
export const season = (q: number) => ((q % 4) + 4) % 4;
export const yearOf = (q: number) => Math.floor(q / 4) + 1;
export const working = (g: Game, e: Engineer) => e.restQ !== g.q;
export const isBorrowed = (e: Engineer) => !!e.loan;
export const companyOf = (g: Game, id: string) => g.companies.find(c => c.id === id);

/** 実効スキル。real=true のときだけサボタージュを反映（画面表示では false） */
export function effSkills(g: Game, c: Company, e: Engineer, real = false): Skills {
  if (real && e.spy && e.spy.order === 'sabo' && e.spy.for !== c.id) return {};
  const out: Skills = {};
  const slack = c.effects.slack === g.q;
  for (const k of SKILLS) {
    const v = e.skills[k] || 0;
    if (!v) continue;
    out[k] = slack ? Math.max(0, v - 1) : v;
  }
  return out;
}

export function sumSkills(g: Game, c: Company, list: Engineer[], real = false): Skills {
  const out: Skills = {};
  for (const e of list) {
    if (!working(g, e)) continue;
    const s = effSkills(g, c, e, real);
    for (const k of SKILLS) if (s[k]) out[k] = (out[k] || 0) + (s[k] || 0);
  }
  return out;
}

export interface Check { sums: Skills; ok: boolean; missing: Partial<Record<Skill, number>>; short: number }
export function checkReqs(reqs: Skills, sums: Skills): Check {
  const missing: Partial<Record<Skill, number>> = {};
  let short = 0;
  for (const k of SKILLS) {
    const need = reqs[k] || 0;
    const have = sums[k] || 0;
    if (need > have) { missing[k] = need - have; short += need - have; }
  }
  return { sums, ok: short === 0, missing, short };
}

/** 案件の担当者（assign マップを渡すとその割り当てで計算） */
export function assignees(c: Company, target: string, assign?: Record<string, string>): Engineer[] {
  return c.engineers.filter(e => (assign ? (assign[e.id] ?? (e.assign || '')) : e.assign) === target);
}

export function projectCheck(g: Game, c: Company, p: ActiveProject, assign?: Record<string, string>, real = false): Check {
  return checkReqs(p.reqs, sumSkills(g, c, assignees(c, p.id, assign), real));
}

export function serviceNeed(c: Company) {
  return SERVICE.needBase + (c.service?.level || 0);
}
export function servicePower(g: Game, c: Company, assign?: Record<string, string>, real = false) {
  return skillSum(sumSkills(g, c, assignees(c, 'svc', assign), real));
}

/** 自社が給料を払う社員（借りている社員を除く＋他社に貸している社員） */
export function payroll(g: Game, c: Company): Engineer[] {
  const own = c.engineers.filter(e => !e.loan);
  const lent = g.companies.flatMap(o => o.engineers.filter(e => e.loan?.from === c.id));
  return [...own, ...lent];
}

export const remaining = (p: ActiveProject) => Math.max(0, p.work - p.progress);
export const quarterLabel = (q: number) => `${yearOf(q)}年目・${['春', '夏', '秋', '冬'][season(q)]}`;
export const yen = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}万円`;
export const signedYen = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}万円`;
