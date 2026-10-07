import { describe, expect, it } from 'vitest';
import { createGame, defaultDev, emptyBid, grantTrait, resolveBid, resolveDev, submit, tryResolve } from '../src/logic/game';
import { viewFor } from '../src/logic/view';
import { SPECIALS, TRAINING } from '../src/logic/config';
import { checkPlan, expandCost, nextTo, shape, upgradeOffice } from '../src/logic/office';
import { projectCheck } from '../src/logic/calc';
import type { ActiveProject, BidSubmit, Company, Engineer, Game, Project } from '../src/logic/types';

const two = () => createGame([{ id: 'a', name: 'A社' }, { id: 'b', name: 'B社' }], 12345, 'local', 12, false);
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
    const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 7, 'local', 12, false);
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
      const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], 999, 'local', 12, false);
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

describe('経験値', () => {
  it('進んだ案件の必要スキルに経験が入り、レベル+1たまると成長して給料+5', () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.engineers = [eng('e1', { BE: 2, FE: 1 }, { assign: 'p1', xp: { BE: 2 } }), eng('e2', { IN: 3 }, { assign: null })];
    a.projects = [active('p1', 900, { BE: 1 }, { work: 3 })];
    devOnly(g);
    const e1 = a.engineers.find(e => e.id === 'e1')!;
    expect(e1.skills.BE).toBe(3);
    expect(e1.xp?.BE).toBeUndefined();
    expect(e1.xp?.FE).toBeUndefined();   // 案件に必要ないスキルは育たない
    expect(e1.salary).toBe(55);
    expect(a.engineers.find(e => e.id === 'e2')!.xp).toBeUndefined();   // 担当していない社員は育たない
  });
});

describe('業種', () => {
  const four = () => createGame(['a', 'b', 'c', 'd'].map(id => ({ id, name: id })), 4242);
  it('ゲーム開始時は業種選び。6つから自由に選べ、他社の候補は見えない', () => {
    const g = four();
    expect(g.phase).toBe('pick');
    g.companies.forEach(c => { expect(c.choices).toHaveLength(6); });
    const v = viewFor(g, 'a');
    expect(v.game.companies.find(c => c.id === 'a')!.choices).toHaveLength(6);
    expect(v.game.companies.find(c => c.id === 'b')!.choices).toBeUndefined();
  });
  it('配られていない業種は選べない。全員そろうと決定して1期目の入札へ', () => {
    const g = four();
    const a = co(g, 'a');
    expect(() => submit(g, 'a', { industry: 'nope' as never })).toThrow('配られた業種');
    g.companies.forEach(c => submit(g, c.id, { industry: c.choices![0] }));
    expect(tryResolve(g)).toBe(true);
    expect(g.phase).toBe('bid');
    expect(g.q).toBe(0);
    expect(g.reveal?.kind).toBe('pick');
    g.companies.forEach(c => { expect(c.industry).toBeTruthy(); expect(c.choices).toBeUndefined(); });
  });
  it('コンサルはスパイ指令+1で始まる', () => {
    const g = four();
    const a = co(g, 'a');
    a.choices = ['consul', 'web'];
    const rep = a.rep, orders = a.spyOrdersLeft;
    g.companies.forEach(c => submit(g, c.id, { industry: c.choices![0] }));
    tryResolve(g);
    expect(a.rep).toBe(rep);
    expect(a.spyOrdersLeft).toBe(orders + 1);
  });
  it('SIerは大型システムで比較−10%、運用保守は炎上火消しに入札できない', () => {
    const g2 = two(); cleanHands(g2);
    co(g2, 'a').industry = 'sier';
    g2.market = [{ ...proj('p1', 1000), type: 'big' }];
    bidOnly(g2, { a: { bids: { p1: 90 } }, b: { bids: { p1: 80 } } });   // 900×0.9=810 > 800 → b
    expect(co(g2, 'b').projects[0]?.id).toBe('p1');
    const g3 = two(); cleanHands(g3);
    co(g3, 'a').industry = 'sier';
    g3.market = [{ ...proj('p1', 1000), type: 'big' }];
    bidOnly(g3, { a: { bids: { p1: 90 } }, b: { bids: { p1: 90 } } });   // 810 < 900 → SIer が同率でも勝つ
    expect(co(g3, 'a').projects[0]?.id).toBe('p1');
    const g4 = two(); cleanHands(g4);
    co(g4, 'a').industry = 'maint';
    g4.market = [{ ...proj('p1', 1000), type: 'fire' }];
    g4.companies.forEach(c => submit(g4, c.id, { ...emptyBid(), bids: { p1: 100 } } as BidSubmit));
    expect(g4.bidSubs.a.bids).toEqual({});
    expect(g4.bidSubs.b.bids).toEqual({ p1: 100 });
  });
  it('SaaSは案件の受け取り×0.9', () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a'), b = co(g, 'b');
    a.industry = 'saas';
    for (const c of [a, b]) { c.engineers = [eng(`${c.id}1`, { BE: 2 }, { assign: `${c.id}p` })]; c.projects = [active(`${c.id}p`, 1000, { BE: 1 })]; c.cash = 0; }
    devOnly(g);
    expect(b.cash - a.cash).toBe(100);   // 1000 と 900（給料は同じ）
  });
});

describe('研修', () => {
  const setup = () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.engineers = [eng('e1', { BE: 2 }, { xp: { BE: 1 } }), eng('e2', { FE: 5 }), eng('e3', { IN: 1 }, { loan: { from: 'b', until: 3, share: 10 } })];
    a.projects = [];
    return g;
  };
  it('持っているスキルは+1・持っていないスキルは習得。給料+5で来期は休み（休む確率100%のとき）', () => {
    const keep = TRAINING.restChance; TRAINING.restChance = 1;
    const g = setup();
    devOnly(g, (c, s) => { if (c.id === 'a') { s.assign.e1 = 'train'; s.train = { e1: 'BE' }; } });
    const e1 = co(g, 'a').engineers.find(e => e.id === 'e1')!;
    expect(e1.skills.BE).toBe(3);
    expect(e1.xp?.BE).toBeUndefined();
    expect(e1.salary).toBe(55);
    expect(e1.restQ).toBe(1);
    const g2 = setup();
    devOnly(g2, (c, s) => { if (c.id === 'a') { s.assign.e1 = 'train'; s.train = { e1: 'AI' }; } });
    expect(co(g2, 'a').engineers.find(e => e.id === 'e1')!.skills).toEqual({ BE: 2, AI: 1 });
    TRAINING.restChance = 0;
    const g3 = setup();
    devOnly(g3, (c, s) => { if (c.id === 'a') { s.assign.e1 = 'train'; s.train = { e1: 'BE' }; } });
    expect(co(g3, 'a').engineers.find(e => e.id === 'e1')!.restQ).not.toBe(1);   // 休まない
    TRAINING.restChance = keep;
  });
  it('研修のあと休むのはおよそ30%', () => {
    let rest = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed, 'x', 12, false);
      cleanHands(g); g.phase = 'dev';
      const a = co(g, 'a');
      a.engineers = [eng('e1', { BE: 1 })]; a.projects = [];
      devOnly(g, (c, s) => { if (c.id === 'a') { s.assign.e1 = 'train'; s.train = { e1: 'BE' }; } });
      if (a.engineers[0].restQ === 1) rest++;
    }
    expect(rest / 400).toBeGreaterThan(0.2);
    expect(rest / 400).toBeLessThan(0.4);
  });
  it('上限のスキル・借りている社員・今期休みの社員は研修に行けない', () => {
    const g = setup();
    co(g, 'a').engineers.find(e => e.id === 'e1')!.restQ = 0;
    const s = defaultDev(g, 'a');
    s.assign = { e1: 'train', e2: 'train', e3: 'train' };
    s.train = { e1: 'BE', e2: 'FE', e3: 'IN' };
    submit(g, 'a', s);
    expect(g.devSubs.a.train).toBeUndefined();
    expect(Object.values(g.devSubs.a.assign).filter(v => v === 'train')).toHaveLength(0);
  });
});

describe('投資', () => {
  const setup = () => {
    const g = two(); cleanHands(g);
    g.phase = 'dev';
    co(g, 'a').cash = 1000;
    return g;
  };
  it('春に国債を含む4つの投資先が出る', () => {
    const g = setup();
    expect(g.funds).toHaveLength(4);
    expect(g.funds![0].kind).toBe('bond');
  });
  it('決まった金額だけ・手元の現金まで。投資すると現金が減り、他社には見えない', () => {
    const g = setup();
    const [f1, f2, f3] = g.funds!;
    const s = defaultDev(g, 'a');
    s.invest = { [f1.id]: 500, [f2.id]: 300, [f3.id]: 500, nope: 100 };   // 3つ目は残り200を超える
    submit(g, 'a', s);
    expect(g.devSubs.a.invest).toEqual({ [f1.id]: 500, [f2.id]: 300 });
    const s2 = defaultDev(g, 'a'); s2.invest = { [f1.id]: 250 };
    submit(g, 'a', s2);
    expect(g.devSubs.a.invest).toBeUndefined();
    submit(g, 'a', s);
    submit(g, 'b', defaultDev(g, 'b'));
    const before = co(g, 'a').cash;
    resolveDev(g);
    expect(co(g, 'a').invest).toEqual([{ fund: f1.id, amount: 500 }, { fund: f2.id, amount: 300 }]);
    expect(before - co(g, 'a').cash).toBeGreaterThanOrEqual(800);
    expect(viewFor(g, 'b').game.companies.find(c => c.id === 'a')!.invest).toBeUndefined();
  });
  it('冬の決算で倍率が決まり、投資額×倍率が戻る', () => {
    const g = setup();
    g.q = 3;
    const f = g.funds![0];
    co(g, 'a').invest = [{ fund: f.id, amount: 1000 }];
    const cashBefore = co(g, 'a').cash;
    devOnly(g);
    expect(f.mult).toBeGreaterThanOrEqual(1.03);
    const block = g.reveal!.blocks.find(b => b.title === '今年の投資の結果');
    expect(block).toBeTruthy();
    expect(co(g, 'a').invest).toEqual([]);
    expect(block!.lines.some(l => l.text.includes(`投資1,000 → ${(Math.round(1000 * f.mult! / 10) * 10).toLocaleString()}`))).toBe(true);
    expect(co(g, 'a').cash).not.toBe(cashBefore);
  });
});

describe('特技', () => {
  const setup = () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.engineers = []; a.projects = []; a.cash = 0; a.debt = 0;
    co(g, 'b').engineers = [];
    return { g, a };
  };
  it('掛け持ち：2つの案件に同時に入れる（掛け持ちでない社員は1つだけ）', () => {
    const { g, a } = setup();
    a.engineers = [eng('m', { BE: 2 }, { trait: 'multi' }), eng('n', { BE: 2 })];
    a.projects = [active('p1', 100, { BE: 2 }, { work: 3 }), active('p2', 100, { BE: 2 }, { work: 3 })];
    const s = defaultDev(g, 'a');
    s.assign = { m: 'p1+p2', n: 'p1+p2' };
    submit(g, 'a', s);
    expect(g.devSubs.a.assign).toEqual({ m: 'p1+p2', n: '' });
    submit(g, 'b', defaultDev(g, 'b'));
    resolveDev(g);
    expect(a.projects.map(p => p.progress)).toEqual([1, 1]);
  });
  it('リーダー：ほかのメンバーのスキル+1。火消し職人：遅れた案件でスキル+1', () => {
    const { g, a } = setup();
    a.engineers = [eng('l', { FE: 1 }, { trait: 'leader', assign: 'p1' }), eng('x', { BE: 2 }, { assign: 'p1' }), eng('f', { IN: 2 }, { trait: 'fire', assign: 'p2' })];
    a.projects = [active('p1', 100, { BE: 3 }, { work: 3 }), active('p2', 100, { IN: 3 }, { work: 3, deadline: -1 })];
    devOnly(g);
    expect(a.projects.map(p => p.progress)).toEqual([1, 1]);
  });
  it('夜型：突貫しても負債が増えない。営業上手：受け取り×1.1。リファクタ魔：負債−1', () => {
    const { g, a } = setup();
    a.engineers = [eng('n', { BE: 3 }, { trait: 'night', assign: 'p1' }), eng('r', { IN: 1 }, { trait: 'refactor', assign: 'svc' })];
    a.service = { level: 0 };
    a.debt = 2;
    a.projects = [active('p1', 100, { BE: 1 }, { work: 3 })];
    devOnly(g, (c, s) => { if (c.id === 'a') s.rush = ['p1']; });
    expect(a.projects.find(p => p.id === 'p1')!.progress).toBe(2);
    expect(a.debt).toBe(1);   // 突貫の負債なし、リファクタ魔で−1
    const s2 = setup();
    s2.a.engineers = [eng('s', { FE: 3 }, { trait: 'sales', assign: 'p2' })];
    s2.a.projects = [active('p2', 1000, { FE: 1 }, { work: 1 })];
    devOnly(s2.g);
    expect(s2.g.reveal!.blocks.some(b => b.lines.some(l => l.text.includes('「p2」完了！ +1100')))).toBe(true);
  });
  it('薄給は給料半分、天才肌・転職癖はスキル+1', () => {
    const e1 = eng('a', { BE: 2 }, { salary: 60 }); grantTrait(e1, 'cheap'); expect(e1.salary).toBe(30);
    const e2 = eng('b', { BE: 2, FE: 5 }, { salary: 90 }); grantTrait(e2, 'genius'); expect(e2.skills).toEqual({ BE: 3, FE: 5 }); expect(e2.salary).toBe(100);
  });
  it('転職癖は冬に辞めることがある・投資の勘は最悪の結果を1段階よくする', () => {
    let quit = false, saved = false;
    for (let seed = 1; seed < 200 && !(quit && saved); seed++) {
      const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed, 'x', 12, false);
      cleanHands(g);
      g.q = 3; g.phase = 'dev';
      const a = co(g, 'a');
      a.engineers = [eng('h', { BE: 1 }, { trait: 'hopper' }), eng('i', { BE: 1 }, { trait: 'investor' })];
      const fund = { id: 'f1', kind: 'angel' as const, name: 'テスト' } as { id: string; kind: 'angel'; name: string; mult?: number };
      g.funds = [fund];
      a.invest = [{ fund: 'f1', amount: 1000 }];
      devOnly(g);
      if (!a.engineers.some(e => e.id === 'h')) quit = true;
      if (fund.mult === 0 && g.reveal!.blocks.some(b => b.lines.some(l => l.text.includes('投資1,000 → 500')))) saved = true;
    }
    expect({ quit, saved }).toEqual({ quit: true, saved: true });
  });
});

describe('特技（★1の追加分）', () => {
  const setup = () => {
    const g = two(); cleanHands(g);
    g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.projects = [];
    return { g, a };
  };
  it('体力おばけは研修のあとも休まない・勉強熱心はもう1つのスキルにも経験値', () => {
    const keep = TRAINING.restChance; TRAINING.restChance = 1;
    const { g, a } = setup();
    a.engineers = [eng('t', { BE: 2 }, { trait: 'tough' }), eng('s', { BE: 2, FE: 3 }, { trait: 'study', xp: { FE: 3 } })];
    devOnly(g, (c, s) => { if (c.id === 'a') { s.assign = { t: 'train', s: 'train' }; s.train = { t: 'BE', s: 'BE' }; } });
    const t = a.engineers.find(e => e.id === 't')!, st = a.engineers.find(e => e.id === 's')!;
    expect(t.skills.BE).toBe(3);
    expect(t.restQ).not.toBe(1);
    expect(st.restQ).toBe(1);
    expect(st.skills).toEqual({ BE: 3, FE: 4 });   // FE は経験値 3+1=4 で 3→4
    TRAINING.restChance = keep;
  });
  it('ギャンブラーは投資の結果が1段階上下することがある', () => {
    let up = false, down = false;
    for (let seed = 1; seed < 300 && !(up && down); seed++) {
      const g = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed, 'x', 12, false);
      cleanHands(g);
      g.q = 3; g.phase = 'dev';
      const a = co(g, 'a');
      a.engineers = [eng('x', { BE: 1 }, { trait: 'gambler' })];
      g.funds = [{ id: 'f1', kind: 'index', name: 'テスト' }];
      a.invest = [{ fund: 'f1', amount: 1000 }];
      devOnly(g);
      const text = g.reveal!.blocks.flatMap(b => b.lines.map(l => l.text)).join('\n');
      if (text.includes('1段階アップ')) up = true;
      if (text.includes('1段階ダウン')) down = true;
    }
    expect({ up, down }).toEqual({ up: true, down: true });
  });
});

describe('オフィス', () => {
  it('最初は3×2のデスク。満席だと採用もできない', () => {
    const g = two(); cleanHands(g);
    const a = co(g, 'a');
    expect([a.office!.w, a.office!.h, a.office!.items.filter(i => i.kind === 'desk').length]).toEqual([3, 2, 6]);
    a.engineers = Array.from({ length: 6 }, (_, i) => eng(`x${i}`, { BE: 1 }));
    g.pool = [eng('new', { FE: 3 }, { salary: 50 })];
    g.market = [];
    bidOnly(g, { a: { hires: { new: 400 } }, b: { hires: { new: 0 } } });
    expect(co(g, 'b').engineers.some(e => e.id === 'new')).toBe(true);
  });
  it('形と回転：サーバールームは縦長、回すと横長。L字は4通り', () => {
    expect(shape('server', 0)).toEqual([[0, 0], [0, 1]]);
    expect(shape('server', 1).sort()).toEqual([[0, 0], [1, 0]]);
    const ls = [0, 1, 2, 3].map(r => JSON.stringify(shape('refresh', r).sort()));
    expect(new Set(ls).size).toBe(4);
  });
  it('増床・設置・重なり・デスクを減らしすぎない', () => {
    const g = two(); cleanHands(g); g.phase = 'dev';
    const a = co(g, 'a');
    a.cash = 3000;
    a.engineers = Array.from({ length: 6 }, (_, i) => eng(`x${i}`, { BE: 1 }));
    expect(checkPlan(g, a, { remove: ['d1'], move: [], place: [] }).ok).toBe(false);   // 6人いるのでデスクは減らせない
    expect(checkPlan(g, a, { remove: [], move: [], place: [{ kind: 'meet', x: 0, y: 0, rot: 0 }] }).ok).toBe(false);   // 重なる
    const plan = { expand: 'row' as const, remove: [], move: [], place: [{ kind: 'meet' as const, x: 0, y: 2, rot: 0 }, { kind: 'desk' as const, x: 2, y: 2, rot: 0 }] };
    expect(checkPlan(g, a, plan)).toEqual({ ok: true, cost: 300 + 250 + 50 });
    const s = defaultDev(g, 'a'); s.office = plan;
    submit(g, 'a', s); submit(g, 'b', defaultDev(g, 'b'));
    resolveDev(g);
    expect([a.office!.w, a.office!.h]).toEqual([3, 3]);
    expect(a.office!.items.filter(i => i.kind === 'desk').length).toBe(7);
    expect(a.office!.spent).toBe(600);
    expect(expandCost(a.office!)).toBe(450);
  });
  it('となりのデスクの社員だけに効く', () => {
    const g = two(); cleanHands(g);
    const a = co(g, 'a');
    a.engineers = [eng('near', { BE: 1 }), eng('far', { BE: 1 })];
    a.office!.h = 3;
    a.office!.items.push({ id: 'r9', kind: 'rest', x: 0, y: 2, rot: 0 });   // (0,2)-(1,2)
    a.office!.seats = { d4: 'near', d3: 'far' };   // d4=(0,1) は休憩室のとなり、d3=(2,0) は離れている
    expect(nextTo(g, a, 'near', 'rest')).toBe(true);
    expect(nextTo(g, a, 'far', 'rest')).toBe(false);
  });
  it('セキュリティ室は情報漏洩を毎回防ぐ・最終決算でオフィス投資額の50%が資産', () => {
    const g = two(); cleanHands(g);
    const b = co(g, 'b');
    b.office!.items = b.office!.items.filter(i => i.id !== 'd6');
    b.office!.items.push({ id: 's1', kind: 'sec', x: 2, y: 1, rot: 0 });
    co(g, 'a').hand = ['A5'];
    g.market = [];
    bidOnly(g, { a: { card: 'A5', target: 'b' } });
    expect(b.effects.noBid).toBeUndefined();
    const g2 = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 5, 'x', 8, false);
    co(g2, 'a').office!.spent = 1000;
    g2.q = 7; g2.phase = 'dev';
    devOnly(g2);
    expect(g2.final!.find(r => r.id === 'a')!.office).toBe(500);
  });
  it('古い形式（1マス1部屋）のオフィスは、同じ数のデスクに作り直す', () => {
    const o = upgradeOffice({ tiles: ['work', 'work', 'work', 'work', 'work', 'work', 'rest', 'sec'], spent: 700 }, 5);
    expect(o.items.filter(i => i.kind === 'desk').length).toBe(8);
    expect(o.spent).toBe(700);
  });
});

describe('広告・同点', () => {
  it('広告で評判が上がり、今期の入札から効く。上乗せは+2まで・冬の決算で消える', () => {
    const g = two(); cleanHands(g);
    g.market = [proj('p1', 1000)];
    co(g, 'a').cash = 1000; co(g, 'b').rep = 1;
    bidOnly(g, { a: { bids: { p1: 100 }, ad: 1 }, b: { bids: { p1: 100 } } });   // テレビCMで評判+2 → 比較 940 < 970
    expect(co(g, 'a').rep).toBe(2);
    expect(co(g, 'a').cash).toBe(100);
    expect(co(g, 'a').projects[0]?.id).toBe('p1');
    const g2 = two(); cleanHands(g2); g2.market = [];
    co(g2, 'a').cash = 2000; co(g2, 'a').adRep = 2; co(g2, 'a').rep = 4;
    bidOnly(g2, { a: { ad: 0 } });
    expect(co(g2, 'a').cash).toBe(2000);   // 今年はもう上乗せできない
    const g3 = two(); cleanHands(g3);
    g3.q = 3; g3.phase = 'dev';
    co(g3, 'a').rep = 3; co(g3, 'a').adRep = 2;
    devOnly(g3);
    expect(co(g3, 'a').rep).toBe(1 + (g3.reveal!.blocks.some(b => b.title.includes('冬の決算') && b.lines.some(l => l.text.includes('年間表彰') && l.text.includes('A社'))) ? 1 : 0));
    expect(co(g3, 'a').adRep).toBe(0);
  });
  it('同額・同評判なら抽選と表示する', () => {
    const g = two(); cleanHands(g);
    g.market = [proj('p1', 1000)];
    bidOnly(g, { a: { bids: { p1: 90 } }, b: { bids: { p1: 90 } } });
    expect(g.reveal!.blocks.some(b => b.lines.some(l => l.text.includes('同額・同評判のため抽選')))).toBe(true);
  });
});

describe('業種の必殺技', () => {
  it('根回し：入札なしで予算100%で受注。1ゲーム1回', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').industry = 'sier';
    g.market = [proj('p1', 1000)];
    bidOnly(g, { a: { special: { project: 'p1' } }, b: { bids: { p1: 50 } } });
    expect(co(g, 'a').projects[0]?.price).toBe(1000);
    expect(co(g, 'b').projects).toHaveLength(0);
    expect(co(g, 'a').skillUsed).toBe(true);
    const s = { ...emptyBid(), special: { project: 'x' } };
    g.phase = 'bid'; g.market = [proj('x', 500)];
    submit(g, 'a', s);
    expect(g.bidSubs.a.special).toBeUndefined();   // 使用済み
  });
  it('引き抜き工作：防御カードを無視して一番優秀な社員を引き抜く', () => {
    const g = two(); cleanHands(g);
    co(g, 'a').industry = 'consul';
    co(g, 'b').hand = ['D1', 'D3'];
    co(g, 'b').engineers = [eng('ace', { BE: 5 }), eng('x', { FE: 1 })];
    g.market = [];
    bidOnly(g, { a: { special: { target: 'b' } } });
    expect(co(g, 'a').engineers.some(e => e.id === 'ace')).toBe(true);
    expect(co(g, 'b').hand).toEqual(['D1', 'D3']);   // 防御カードは使われない
  });
  it('スピード納品・AI自動化・障害ゼロ宣言・バズマーケ', () => {
    const mk = (ind: 'web' | 'ai' | 'maint' | 'saas') => {
      const g = two(); cleanHands(g); g.q = 0; g.phase = 'dev';
      const a = co(g, 'a'); a.industry = ind; a.debt = 4; a.rep = 0; a.cash = 0;
      a.engineers = [eng('e', { BE: 1 }, { assign: 'p1' })];
      a.projects = [active('p1', 100, { BE: 2 }, { work: 5 })];
      if (ind === 'saas') a.service = { level: 1 };
      devOnly(g, (c, s) => { if (c.id === 'a') s.special = true; });
      return a;
    };
    expect(mk('web').projects[0].progress).toBe(0);   // スキル不足なら進まない
    expect(mk('ai').projects[0].progress).toBe(1);    // BE1+1=2 で足りる
    const m = mk('maint'); expect([m.debt, m.rep]).toEqual([0, 1]);
    const sa = mk('saas'); expect(sa.service!.level).toBe(2);
    const g = two(); cleanHands(g); g.q = 0; g.phase = 'dev';
    const a = co(g, 'a'); a.industry = 'web';
    a.engineers = [eng('e', { BE: 2 }, { assign: 'p1' })];
    a.projects = [active('p1', 100, { BE: 2 }, { work: 5 })];
    devOnly(g, (c, s) => { if (c.id === 'a') s.special = true; });
    expect(a.projects[0].progress).toBe(2);   // 満たした案件はさらに+1
    expect(Object.keys(SPECIALS)).toHaveLength(6);
  });
});

describe('自社サービスの成長の方向', () => {
  const setup = (level: number, branch?: 'toc' | 'subs' | 'b2b') => {
    const g = two(); cleanHands(g); g.q = 0; g.phase = 'dev';
    const a = co(g, 'a');
    a.service = { level, branch };
    a.engineers = [eng('s', { FE: 9, BE: 9 }, { assign: 'svc' })];
    a.projects = []; a.cash = 0;
    return { g, a };
  };
  it('Lv2で方向を選ぶまでLv3に上がらない。選んだ期から上がる', () => {
    const { g, a } = setup(2);
    devOnly(g);
    expect(a.service!.level).toBe(2);
    const t = setup(2);
    devOnly(t.g, (c, s) => { if (c.id === 'a') s.branch = 'toc'; });
    expect(t.a.service).toEqual({ level: 3, branch: 'toc' });
  });
  it('toCは収入×1.5で口コミ被害なら0、サブスクは口コミ被害なし・価値Lv×500、法人向けは入札が有利', () => {
    const toc = setup(5, 'toc'); toc.a.effects.review = 0;
    devOnly(toc.g);
    expect(toc.g.reveal!.blocks.some(b => b.lines.some(l => l.text.includes('サービス収入 +0')))).toBe(true);
    const sub = setup(5, 'subs'); sub.a.effects.review = 0;
    devOnly(sub.g);
    expect(sub.g.reveal!.blocks.some(b => b.lines.some(l => l.text.includes('サブスクなので口コミ被害なし')))).toBe(true);
    const g2 = two(); cleanHands(g2);
    co(g2, 'a').service = { level: 5, branch: 'b2b' };
    g2.market = [proj('p1', 1000)];
    bidOnly(g2, { a: { bids: { p1: 100 } }, b: { bids: { p1: 100 } } });   // 1000×0.95 < 1000
    expect(co(g2, 'a').projects[0]?.id).toBe('p1');
    const fin = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 3, 'x', 8, false);
    co(fin, 'a').service = { level: 3, branch: 'subs' };
    fin.q = 7; fin.phase = 'dev';
    devOnly(fin);
    expect(fin.final!.find(r => r.id === 'a')!.service).toBeGreaterThanOrEqual(1500);
  });
});
