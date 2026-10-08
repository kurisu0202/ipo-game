// ===== 本人に見せてよい情報だけを取り出す（オンラインでは各端末で自分の分だけ表示する） =====
import type { BidSubmit, DevSubmit, Game, PickSubmit, View } from './types';
import { subsOf } from './game';

export function viewFor(g: Game, me: string): View & { handCounts: Record<string, number>; deckCount: number } {
  const v: Game = JSON.parse(JSON.stringify(g));
  const handCounts: Record<string, number> = {};
  const intel: View['intel'] = {};
  v.seed = 0;
  const deckCount = g.cardDeck.length;
  v.cardDeck = [];
  v.happenings = g.happenings.slice(0, Math.max(0, g.q) + 1);
  v.secretMult = {};
  v.market.forEach(p => { if (p.type === 'secret') p.budget = 0; });
  v.offers.forEach(o => { if (o.from !== me) o.spy = ''; });
  for (const c of v.companies) {
    handCounts[c.id] = c.hand.length;
    const mine = c.id === me;
    if (!mine) { c.hand = []; c.sleeper = null; c.secretNotes = []; c.spyOrdersLeft = 0; delete c.choices; delete c.invest; delete c.books; delete c.bsHist; }
    for (const e of c.engineers) {
      if (e.spy && e.spy.for !== me) delete e.spy;
      if (!mine) delete e.checked;
    }
  }
  // 情報収集スパイ：潜入先の手札と提出済みの入札が見える
  for (const c of g.companies) {
    if (c.id === me) continue;
    if (c.engineers.some(e => e.spy && e.spy.for === me && e.spy.order === 'intel' && c.id !== me)) {
      intel[c.id] = { hand: [...c.hand], bid: g.phase === 'bid' ? (g.bidSubs[c.id] ? JSON.parse(JSON.stringify(g.bidSubs[c.id])) as BidSubmit : null) : null };
    }
  }
  const submitted: Record<string, boolean> = {};
  const subs = subsOf(g);
  g.companies.forEach(c => { submitted[c.id] = !!subs[c.id]; });
  const mySubmit = (subs[me] as BidSubmit | DevSubmit | PickSubmit | undefined) ?? null;
  v.bidSubs = {};
  v.devSubs = {};
  v.pickSubs = {};
  return { me, game: v, submitted, mySubmit: mySubmit ? JSON.parse(JSON.stringify(mySubmit)) : null, intel, handCounts, deckCount };
}

export type PlayerView = ReturnType<typeof viewFor>;
