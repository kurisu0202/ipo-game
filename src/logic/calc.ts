// ===== 計算ヘルパー（解決処理と画面の両方で使う） =====
import { BRANCHES, GAME, GROWTH, INDUSTRIES, INDUSTRY_BID, INDUSTRY_HIRE_BONUS, OFFICE, OFFICE_FX, RUSH_DEBT, SERVICE, SKILLS } from './config';
import type { ActiveProject, Company, Engineer, Game, ItemKind, ProjectType, Skill, Skills } from './types';

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
  const d = (c.effects.boost === g.q ? 1 : 0) - (c.effects.slack === g.q ? 1 : 0);   // AI自動化 +1／Slack爆撃 −1
  for (const k of SKILLS) {
    const v = e.skills[k] || 0;
    if (!v) continue;
    out[k] = Math.max(0, v + d);
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

/** 担当先（「掛け持ち」の社員は 'p1+p2' のように2つ持てる） */
export const slots = (v?: string | null) => (v ? v.split('+').filter(Boolean) : []);
export const hasSlot = (v: string | null | undefined, t: string) => slots(v).includes(t);
/** 担当先のオン／オフ。掛け持ちなら2つまで（3つ目は古いほうと入れ替え） */
export function toggleSlot(e: Engineer, cur: string, target: string, on: boolean): string {
  const s = slots(cur).filter(x => x !== 'fire' && x !== 'train');
  if (!on) return s.filter(x => x !== target).join('+');
  if (s.includes(target)) return s.join('+');
  if (e.trait === 'multi' && s.length >= 1) return [s[s.length - 1], target].join('+');
  return target;
}

/** 案件の担当者（assign マップを渡すとその割り当てで計算） */
export function assignees(c: Company, target: string, assign?: Record<string, string>): Engineer[] {
  return c.engineers.filter(e => hasSlot(assign ? (assign[e.id] ?? (e.assign || '')) : e.assign, target));
}

/** 案件の担当チームのスキル合計（リーダー・火消し職人の効果込み） */
export function projectSums(g: Game, c: Company, p: ActiveProject, team: Engineer[], real = false): Skills {
  const out = sumSkills(g, c, team, real);
  const on = team.filter(e => working(g, e));
  const leader = on.find(e => e.trait === 'leader');
  const late = g.q > p.deadline || p.type === 'fire';
  for (const e of on) {
    const s = effSkills(g, c, e, real);
    const plus = (leader && leader !== e ? 1 : 0) + (late && e.trait === 'fire' ? 1 : 0);
    if (!plus) continue;
    for (const k of SKILLS) if (s[k]) out[k] = (out[k] || 0) + plus;
  }
  return out;
}

export function projectCheck(g: Game, c: Company, p: ActiveProject, assign?: Record<string, string>, real = false): Check {
  return checkReqs(p.reqs, projectSums(g, c, p, assignees(c, p.id, assign), real));
}

/** 特技で持っているスキルを+1（天才肌・転職癖） */
export function boostAll(e: Engineer) {
  for (const k of SKILLS) if (e.skills[k]) e.skills[k] = Math.min(GROWTH.maxSkill, (e.skills[k] || 0) + 1);
}

export function serviceNeed(c: Company) {
  return Math.max(1, SERVICE.needBase + (c.service?.level || 0) - OFFICE_FX.serverDown * rooms(c, 'server'));
}
/** サービス担当のスキル合計（成長の方向で決まったスキルは2倍で数える） */
export function servicePower(g: Game, c: Company, assign?: Record<string, string>, real = false) {
  const sums = sumSkills(g, c, assignees(c, 'svc', assign), real);
  const br = c.service?.branch ? BRANCHES[c.service.branch] : undefined;
  return SKILLS.reduce((t, k) => t + (sums[k] || 0) * (br?.skills.includes(k) ? 2 : 1), 0);
}
/** 成長の方向を選ばないと上がれないレベルに来ているか */
export const needBranch = (c: Pick<Company, 'service'>) => !!c.service && !c.service.branch && c.service.level >= SERVICE.branchAt;
/** 最終決算でのサービスの価値 */
export const serviceValue = (c: Pick<Company, 'service'>) => (c.service?.level || 0) * (c.service?.branch ? BRANCHES[c.service.branch].valuePerLv ?? SERVICE.valuePerLv : SERVICE.valuePerLv);
/** 法人向けSaaS：入札の比較値の割引 */
export const b2bDiscount = (c: Pick<Company, 'service'>) => (c.service?.branch ? (BRANCHES[c.service.branch].bidPerLv || 0) * c.service.level : 0);

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

// ---------- 業種の効果 ----------
export const industryOf = (c: Pick<Company, 'industry'>) => (c.industry ? INDUSTRIES[c.industry] : undefined);
/** 入札の比較値にかける倍率（得意 0.9・苦手 1.1） */
export function bidFactor(c: Pick<Company, 'industry'>, t: ProjectType) {
  const s = industryOf(c);
  if (s?.bidGood?.includes(t)) return INDUSTRY_BID.good;
  if (s?.bidBad?.includes(t)) return INDUSTRY_BID.bad;
  return 1;
}
export const canBid = (c: Pick<Company, 'industry'>, t: ProjectType) => !industryOf(c)?.noBid?.includes(t);
/** 案件の受け取りにかける倍率 */
export function payFactor(c: Pick<Company, 'industry'>, t: ProjectType) {
  const p = industryOf(c)?.pay;
  return (p?.[t] ?? 1) * (p?.all ?? 1);
}
export const hireBonus = (c: Pick<Company, 'industry'>, e: Engineer) => (industryOf(c)?.hireSkills?.some(k => (e.skills[k] || 0) > 0) ? INDUSTRY_HIRE_BONUS : 0);
export const launchCost = (c: Pick<Company, 'industry'>) => round10(SERVICE.launchCost * (industryOf(c)?.launchMult ?? 1));
export const serviceIncome = (c: Pick<Company, 'industry'> & { service?: Company['service'] }, lv: number, branch = c.service?.branch) => round10(SERVICE.income[lv] * (industryOf(c)?.serviceMult ?? 1) * (branch ? BRANCHES[branch].incomeMult : 1));
export const salaryMult = (c: Pick<Company, 'industry'>) => industryOf(c)?.salaryMult ?? 1;
export const rushDebt = (c: Pick<Company, 'industry'>) => industryOf(c)?.rushDebt ?? RUSH_DEBT;

// ---------- オフィス（数えるだけのもの。配置・となり判定は office.ts） ----------
/** 会社全体に効く部屋の数（同じ種類は OFFICE.maxEffect まで） */
export const rooms = (c: Pick<Company, 'office'>, k: ItemKind) => Math.min(OFFICE.maxEffect, (c.office?.items || []).filter(t => t.kind === k).length);
/** デスクの数＝席の数（オフィスがない古いデータは上限なし） */
export const seats = (c: Pick<Company, 'office'>) => (c.office?.items ? c.office.items.filter(t => t.kind === 'desk').length : Infinity);
/** 席を使っている人数：自社の社員（貸し出し中を含む）＋借りている社員 */
export const seatsUsed = (g: Game, c: Company) => payroll(g, c).length + c.engineers.filter(e => e.loan).length;
export const freeSeats = (g: Game, c: Company) => seats(c) - seatsUsed(g, c);
export const officeValue = (c: Pick<Company, 'office'>) => round10((c.office?.spent || 0) * OFFICE.finalValue);
/** 会議室・大会議室による入札の比較値の割引（最大 meetCap） */
export const meetDiscount = (c: Pick<Company, 'office'>) => Math.min(OFFICE_FX.meetCap, OFFICE_FX.meetDown * rooms(c, 'meet') + OFFICE_FX.bigMeetDown * rooms(c, 'bigmeet'));
