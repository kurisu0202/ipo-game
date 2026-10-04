// ===== テスト用ボット（ランダム／賢い） =====
import { BID_PCTS, CARDS, HIRE_FEES, PROJECT_TYPES, SKILLS } from './config';
import { companyOf, projectCheck, skillSum, sumSkills, checkReqs } from './calc';
import { defaultDev, emptyBid, pendingSpies } from './game';
import type { BidPct, BidSubmit, Company, DevSubmit, Game, HireFee, Skill, SpyOrder } from './types';

type R = () => number;
const pick = <T>(r: R, a: readonly T[]) => a[Math.floor(r() * a.length)];
const ORDERS: SpyOrder[] = ['intel', 'sabo', 'steal'];

export function randomBid(g: Game, cid: string, r: R): BidSubmit {
  const c = companyOf(g, cid)!;
  const s = emptyBid();
  g.market.forEach(p => { if (r() < 0.5) s.bids[p.id] = pick(r, BID_PCTS) as BidPct; });
  g.pool.forEach(e => { if (r() < 0.4) s.hires[e.id] = pick(r, HIRE_FEES) as HireFee; });
  const usable = c.hand.filter(k => CARDS[k].kind !== 'defense');
  if (usable.length && r() < 0.7) {
    s.card = pick(r, usable);
    s.target = pick(r, g.companies.filter(x => x.id !== cid)).id;
  }
  const offers = g.offers.filter(o => o.from !== cid);
  if (offers.length && r() < 0.5) s.rent = pick(r, offers).id;
  pendingSpies(g, cid).forEach(x => { s.spyOrders[x.engineer.id] = pick(r, ORDERS); });
  return s;
}

export function randomDev(g: Game, cid: string, r: R): DevSubmit {
  const c = companyOf(g, cid)!;
  const s = defaultDev(g, cid);
  const targets = ['', ...c.projects.map(p => p.id), ...(c.service ? ['svc'] : [])];
  c.engineers.forEach(e => {
    s.assign[e.id] = r() < 0.05 && !e.loan ? 'fire' : pick(r, targets);
  });
  s.rush = c.projects.filter(() => r() < 0.2).map(p => p.id);
  s.launch = !c.service && c.cash > 600 && r() < 0.3;
  const own = c.engineers.filter(e => !e.loan);
  if (own.length > 2 && r() < 0.3) {
    const e = pick(r, own);
    s.offer = { engineerId: e.id, period: pick(r, [1, 2, 3]), share: pick(r, [10, 20, 30]), spy: r() < 0.5 ? pick(r, ORDERS) : '' };
    if (s.assign[e.id] === 'fire') s.assign[e.id] = '';
  }
  if (own.length && r() < 0.3) { s.sleeper = pick(r, own).id; s.sleeperOrder = pick(r, ORDERS); }
  const outsiders = c.engineers.filter(e => e.via);
  if (outsiders.length && r() < 0.2) s.investigate = pick(r, outsiders).id;
  if (outsiders.length && r() < 0.15) s.accuse = pick(r, outsiders).id;
  pendingSpies(g, cid).forEach(x => { s.spyOrders[x.engineer.id] = pick(r, ORDERS); });
  return s;
}

// ---------- 賢いボット：こなせる案件にだけ入札し、不足を埋めるよう配置 ----------
function capacity(g: Game, c: Company) {
  return sumSkills(g, c, c.engineers.filter(e => e.restQ !== g.q + 1));
}
export function smartBid(g: Game, cid: string, r: R): BidSubmit {
  const c = companyOf(g, cid)!;
  const s = emptyBid();
  const cap = capacity(g, c);
  const busy: Partial<Record<Skill, number>> = {};
  c.projects.forEach(p => SKILLS.forEach(k => { busy[k] = (busy[k] || 0) + (p.reqs[k] || 0); }));
  const free: Partial<Record<Skill, number>> = {};
  SKILLS.forEach(k => { free[k] = Math.max(0, (cap[k] || 0) - (busy[k] || 0)); });
  let taken = 0;
  for (const p of [...g.market].sort((a, b) => b.budget / b.duration - a.budget / a.duration)) {
    if (taken >= 2) break;
    if (!checkReqs(p.reqs, free).ok) continue;
    if (p.type === 'fire' && c.debt >= 3) continue;
    s.bids[p.id] = pick(r, [100, 90, 80]) as BidPct;
    SKILLS.forEach(k => { free[k] = (free[k] || 0) - (p.reqs[k] || 0); });
    taken++;
  }
  if (c.cash > 400) {
    const best = [...g.pool].sort((a, b) => skillSum(b.skills) / b.salary - skillSum(a.skills) / a.salary)[0];
    if (best && c.engineers.length < 8) s.hires[best.id] = best.legend ? 200 : 50;
  }
  const attack = c.hand.find(k => ['A1', 'A3', 'A5', 'A7', 'S1'].includes(k));
  if (attack) {
    s.card = attack;
    if (CARDS[attack].kind === 'attack') s.target = [...g.companies].filter(x => x.id !== cid).sort((a, b) => b.cash - a.cash)[0].id;
  }
  pendingSpies(g, cid).forEach(x => { s.spyOrders[x.engineer.id] = 'steal'; });
  return s;
}

export function smartDev(g: Game, cid: string, _r: R): DevSubmit {
  const c = companyOf(g, cid)!;
  const s = defaultDev(g, cid);
  c.engineers.forEach(e => { s.assign[e.id] = ''; });
  const free = new Set(c.engineers.filter(e => e.restQ !== g.q).map(e => e.id));
  // 締め切りが近い順に、不足スキルを一番埋める人を足していく
  for (const p of [...c.projects].sort((a, b) => a.deadline - b.deadline)) {
    for (let guard = 0; guard < 10; guard++) {
      const chk = projectCheck(g, c, p, s.assign);
      if (chk.ok) break;
      let best = ''; let bestGain = 0;
      for (const id of free) {
        const e = c.engineers.find(x => x.id === id)!;
        const gain = (Object.keys(chk.missing) as Skill[]).reduce((t, k) => t + Math.min(chk.missing[k] || 0, e.skills[k] || 0), 0);
        if (gain > bestGain) { bestGain = gain; best = id; }
      }
      if (!best) break;
      s.assign[best] = p.id;
      free.delete(best);
    }
    if (!projectCheck(g, c, p, s.assign).ok) {
      // 足りないなら外して他に回す
      c.engineers.forEach(e => { if (s.assign[e.id] === p.id) { s.assign[e.id] = ''; free.add(e.id); } });
    }
  }
  if (!c.service && c.cash > 900) s.launch = true;
  if (c.service || s.launch) [...free].slice(0, 2).forEach(id => { s.assign[id] = 'svc'; free.delete(id); });
  c.projects.forEach(p => { if (g.q > p.deadline - 1 && p.work - p.progress >= 2 && c.debt < 3 && projectCheck(g, c, p, s.assign).ok) s.rush.push(p.id); });
  pendingSpies(g, cid).forEach(x => { s.spyOrders[x.engineer.id] = 'steal'; });
  return s;
}

export const isTypeKnown = (t: string) => t in PROJECT_TYPES;
