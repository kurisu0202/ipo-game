import { describe, expect, it } from 'vitest';
import { createGame, defaultDev, emptyBid, resolveBid, resolveDev, submit, tryResolve } from '../src/logic/game';
import { viewFor } from '../src/logic/view';
import { projectCheck } from '../src/logic/calc';
import type { ActiveProject, BidSubmit, Company, Engineer, Game, Project } from '../src/logic/types';

const two = () => createGame([{ id: 'a', name: 'A社' }, { id: 'b', name: 'B社' }], 12345);
const co = (g: Game, id: string) => g.companies.find(c => c.id === id)!;
const eng = (id: string, skills: Engineer['skills'], extra: Partial<Engineer> = {}): Engineer => ({ id, name: id, skills, salary: 50, assign: null, restQ: -99, ...extra });
const proj = (id: string, budget: number, reqs: Project['reqs'] = { BE: 1 }): Project => ({ id, type: 'speed', name: id, duration: 1, budget, reqs, tags: [], pay: 'lump' });
const active = (id: string, price: number, reqs: Project['reqs'], extra: Partial<ActiveProject> = {}): ActiveProject => ({
  ...proj(id, price, reqs), price, progress: 0, work: 1, start: 0, deadline: 5, rush: false, fx: 1, ...extra,
});
function bidOnly(g: Game, subs: Record<string, Partial<BidSubmit>>) {
  g.companies.forEach(c => submit(g, c.id, { ...emptyBid(), ...(subs[c.id] || {}) } as BidSubmit));
  resolveBid(g);
}
function devOnly(g: Game, tweak?: (c: Company, s: ReturnType<typeof defaultDev>) => void) {
  g.companies.forEach(c => { const s = defaultDev(g, c.id); tweak?.(c, s); submit(g, c.id, s); });
  resolveDev(g);
}
function cleanHands(g: Game) { g.companies.forEach(c => { c.hand = []; }); }

describe('落札', () => {
  it('評判による割引を含めた比較値が最小の会社が落札する', () => {
    const g = two(); cleanHands(g);
    g.market = [proj('p1', 1000)];
    co(g, 'a').rep = 2;  // 1000×0.94=940
    bidOnly(g, { a: { bids: { p1: 100 } }, b: { bids: { p1: 90 } } });   // 900
    expect(co(g, 'b').projects.map(p => p.id)).toEqual(['p1']);
    expect(co(g, 'b').projects[0].price).toBe(900);
  });
  it('比較値が同じなら評判が高い会社', () => {
    const g = two(); cleanHands(g);
    g.market = [proj('p1', 1000)];
    co(g, 'b').rep = 10;  // 1000×0.7 = 700 と 700
    bidOnly(g, { a: { bids: { p1: 70 } }, b: { bids: { p1: 100 } } });
    expect(co(g, 'b').projects[0]?.id).toBe('p1');
    expect(co(g, 'b').projects[0].price).toBe(1000);
  });
  it('情報漏洩を受けた会社の入札は無効', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').hand = ['A5'];
    g.market = [proj('p1', 1000)];
    bidOnly(g, { a: { bids: { p1: 100 }, card: 'A5', target: 'b' }, b: { bids: { p1: 50 } } });
    expect(co(g, 'a').projects[0]?.id).toBe('p1');
    expect(co(g, 'b').projects.length).toBe(0);
  });
  it('安値ダンピングで入札額×0.8', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').hand = ['S1'];
    g.market = [proj('p1', 1000)];
    bidOnly(g, { a: { bids: { p1: 100 }, card: 'S1' }, b: { bids: { p1: 90 } } });
    expect(co(g, 'a').projects[0].price).toBe(800);
  });
});

describe('作戦カードと防御', () => {
  it('防御は D3 が D1 より先に使われ、攻撃側のエースを奪う', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').hand = ['A1'];
    co(g, 'b').hand = ['D1', 'D3'];
    const aBefore = co(g, 'a').engineers.length;
    bidOnly(g, { a: { card: 'A1', target: 'b' } });
    expect(co(g, 'b').hand).toEqual(['D1']);
    expect(co(g, 'a').engineers.length).toBe(aBefore - 1);
    expect(co(g, 'b').engineers.length).toBe(4);
  });
  it('ダミー情報は効果を跳ね返し、攻撃側の防御は発動しない', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').hand = ['A7', 'D6'];
    co(g, 'b').hand = ['D9'];
    bidOnly(g, { a: { card: 'A7', target: 'b' } });
    expect(co(g, 'a').debt).toBe(2);
    expect(co(g, 'b').debt).toBe(0);
    expect(co(g, 'a').hand).toEqual(['D6']);
  });
  it('2回以上妨害を受けた会社は同情票で評判+1', () => {
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 7);
    cleanHands(g);
    co(g, 'a').hand = ['A7']; co(g, 'b').hand = ['A7'];
    bidOnly(g, { a: { card: 'A7', target: 'c' }, b: { card: 'A7', target: 'c' } });
    expect(co(g, 'c').rep).toBe(1);
    expect(co(g, 'c').debt).toBe(4);
  });
});

describe('開発フェーズ', () => {
  function devGame() {
    const g = two(); cleanHands(g);
    bidOnly(g, {});
    g.companies.forEach(c => { c.engineers = []; c.projects = []; });
    return g;
  }
  it('サボタージュは画面ではOK、解決ではスキル不足', () => {
    const g = devGame();
    const a = co(g, 'a');
    a.engineers = [eng('spy', { BE: 3 }, { via: 'hh', spy: { for: 'b', order: 'sabo', src: 'hh' }, assign: 'x' })];
    a.projects = [active('x', 500, { BE: 3 })];
    expect(projectCheck(g, a, a.projects[0]).ok).toBe(true);
    devOnly(g);
    expect(a.projects[0].progress).toBe(0);
    expect(g.reveal!.blocks.find(b => b.owner === 'a')!.lines.some(l => l.text.includes('スキル不足'))).toBe(true);
  });
  it('レンタルの取り分と機密持ち出しが差し引かれる', () => {
    const g = devGame();
    const a = co(g, 'a'), b = co(g, 'b');
    a.engineers = [
      eng('r', { BE: 1 }, { via: 'rent', loan: { from: 'b', until: 9, share: 20 }, assign: 'x' }),
      eng('s', { FE: 1 }, { via: 'hh', spy: { for: 'b', order: 'steal', src: 'hh' }, assign: 'x' }),
    ];
    a.projects = [active('x', 1000, { BE: 1, FE: 1 })];
    const aCash = a.cash, bCash = b.cash;
    devOnly(g);
    // 1000 − 取り分200 − 持ち出し200 = 600。給料は s の50のみ（r は貸し手が払う）
    expect(a.cash - aCash).toBe(600 - 50);
    expect(b.cash - bCash).toBe(200 + 200 - 50);
  });
  it('告発：レンタルのスパイは没収、雇い主は罰金と評判−2', () => {
    const g = devGame();
    const a = co(g, 'a'), b = co(g, 'b');
    a.engineers = [eng('r', { BE: 1 }, { via: 'rent', loan: { from: 'b', until: 9, share: 10 }, spy: { for: 'b', order: 'intel', src: 'rent' } })];
    const bCash = b.cash;
    devOnly(g, (c, s) => { if (c.id === 'a') s.accuse = 'r'; });
    expect(a.engineers[0].loan).toBeUndefined();
    expect(a.engineers[0].spy).toBeUndefined();
    expect(b.rep).toBe(-2);
    expect(bCash - b.cash).toBe(200);
  });
  it('告発：レンタルのシロは貸し手へ帰り、告発者は評判−1', () => {
    const g = devGame();
    const a = co(g, 'a'), b = co(g, 'b');
    a.engineers = [eng('r', { BE: 1 }, { via: 'rent', loan: { from: 'b', until: 9, share: 10 } })];
    devOnly(g, (c, s) => { if (c.id === 'a') s.accuse = 'r'; });
    expect(a.engineers.length).toBe(0);
    expect(b.engineers.map(e => e.id)).toContain('r');
    expect(a.rep).toBe(-1);
  });
  it('告発：引き抜いたスパイは即解雇、雇い主は評判−2。シロなら告発者−1', () => {
    const g = devGame();
    const a = co(g, 'a'), b = co(g, 'b');
    a.engineers = [eng('h', { BE: 1 }, { via: 'hh', spy: { for: 'b', order: 'steal', src: 'hh' } }), eng('k', { BE: 1 }, { via: 'hh' })];
    devOnly(g, (c, s) => { if (c.id === 'a') s.accuse = 'h'; });
    expect(a.engineers.map(e => e.id)).toEqual(['k']);
    expect(b.rep).toBe(-2);
    const g2 = devGame();
    co(g2, 'a').engineers = [eng('k', { BE: 1 }, { via: 'hh' })];
    devOnly(g2, (c, s) => { if (c.id === 'a') s.accuse = 'k'; });
    expect(co(g2, 'a').rep).toBe(-1);
    expect(co(g2, 'a').engineers.length).toBe(1);
  });
  it('レンタル期間が終わると返却され、正直な貸し出しに数える', () => {
    const g = devGame();
    const a = co(g, 'a'), b = co(g, 'b');
    a.engineers = [eng('r', { BE: 1 }, { via: 'rent', loan: { from: 'b', until: g.q, share: 10 } })];
    devOnly(g);
    expect(a.engineers.length).toBe(0);
    expect(b.engineers.map(e => e.id)).toContain('r');
    expect(b.honestLoans).toBe(1);
  });
});

describe('秘密情報', () => {
  it('他社の手札・スパイ・提出内容はビューに含まれない', () => {
    const g = two();
    co(g, 'a').engineers[0].spy = { for: 'b', order: 'sabo', src: 'hh' };
    submit(g, 'b', { ...emptyBid(), bids: {} });
    const v = viewFor(g, 'a');
    expect(v.game.companies.find(c => c.id === 'b')!.hand).toEqual([]);
    expect(v.game.companies.find(c => c.id === 'a')!.engineers[0].spy).toBeUndefined();
    expect(v.game.seed).toBe(0);
    expect(v.game.cardDeck).toEqual([]);
    expect(JSON.stringify(v.game)).not.toContain('"bidSubs":{"b"');
    const vb = viewFor(g, 'b');
    expect(vb.game.companies.find(c => c.id === 'a')!.engineers[0].spy?.order).toBe('sabo');
  });
  it('情報収集スパイの雇い主には潜入先の手札と入札が見える', () => {
    const g = two();
    co(g, 'a').engineers[0].spy = { for: 'b', order: 'intel', src: 'hh' };
    const p = g.market[0];
    submit(g, 'a', { ...emptyBid(), bids: { [p.id]: 80 } });
    const vb = viewFor(g, 'b');
    expect(vb.intel.a.hand.length).toBe(co(g, 'a').hand.length);
    expect(vb.intel.a.bid?.bids[p.id]).toBe(80);
  });
});

describe('決定論', () => {
  it('同じシードと提出なら同じ結果になる', () => {
    const run = () => {
      const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 999);
      for (let i = 0; i < 24 && g.phase !== 'end'; i++) {
        g.companies.forEach(c => {
          if (g.phase === 'bid') submit(g, c.id, { ...emptyBid(), bids: Object.fromEntries(g.market.slice(0, 2).map(p => [p.id, 80])) });
          else submit(g, c.id, defaultDev(g, c.id));
        });
        tryResolve(g);
      }
      return JSON.stringify(g);
    };
    expect(run()).toBe(run());
  });
});

describe('途中放棄', () => {
  const setup = () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.engineers = [eng('e1', { BE: 2 }, { assign: 'p1' })];
    a.projects = [active('p1', 1000, { SE: 99 }, { work: 3, progress: 1, paid: 170 })];
    return g;
  };
  it('違約金20%・評判−1を払って案件が消え、中間金は返さない', () => {
    const keep = setup();
    devOnly(keep);
    const drop = setup();
    devOnly(drop, (c, s) => { if (c.id === 'a') s.drop = ['p1']; });
    const a0 = co(keep, 'a'), a1 = co(drop, 'a');
    expect(a1.projects).toHaveLength(0);
    expect(a0.cash - a1.cash).toBe(200);
    expect(a1.rep).toBe(a0.rep - 1);
    expect(a1.engineers[0].assign).toBeNull();
  });
  it('放棄する案件への割り当てと突貫は無効になり、ない案件は無視される', () => {
    const g = setup();
    const s = defaultDev(g, 'a');
    s.drop = ['p1', 'p1', 'nope'];
    s.rush = ['p1'];
    submit(g, 'a', s);
    expect(g.devSubs.a.drop).toEqual(['p1']);
    expect(g.devSubs.a.rush).toEqual([]);
    expect(g.devSubs.a.assign.e1).toBe('');
  });
});
