// =====================================================================
//  3年で上場 ― ゲームロジック本体（UI・通信から独立した純粋モジュール）
//  すべての乱数は g.seed から作るので、同じ入力なら同じ結果になる
// =====================================================================
import {
  ABANDON, ACCUSE, FUNDS, GROWTH, INDUSTRIES, INVEST, TRAINING, AUDIT, BID_PCTS, BIG_GOV, BUDGET, CARDS, CLOSE_RACE, DEFENSE_FX, DEFENSE_ORDER, DESIGN_BONUS, DUMP_RATE,
  EMPLOYEE_EVENT, ENGINEER, FIRE_DEBT, FIRST_NAMES, GAME, HACKATHON, HAPPENINGS, HAPPENING_FX, HIRE_FEES, INCIDENT,
  INTERIM, INTEREST, INVESTIGATE_COST, LAST_NAMES, LATE_PENALTY, MUST_SHARE, PROJECT_TYPES, REMOTE_SALARY, RENTAL, REPEAT_BONUS,
  REP_DISCOUNT, SECRET_MULTS, SERVICE, SEVERANCE_QUARTERS, SKILLS, SKILL_NAME, SPY_STEAL,
  STOCK_CHANCE, STOCK_VALUES, TAGS, TAG_CHANCE, TROLL,
  xpNeed,
} from './config';
import {
  assignees, checkReqs, companyOf, effSkills, payroll, quarterLabel, round10, season, servicePower, serviceNeed,
  signedYen, skillSum, sumSkills, totalQ, totalYears, working, yen,
  bidFactor, canBid, hireBonus, launchCost, payFactor, rushDebt, salaryMult, serviceIncome,
} from './calc';
import { chance, int, pick, shuffle, weighted } from './rng';
import type {
  ActiveProject, BidPct, BidSubmit, Fund, FundKind, IndustryKey, PickSubmit, CardKey, Company, DevSubmit, Engineer, FinalRow, Game, HappeningKey, HireFee,
  Project, ProjectType, RevealBlock, RevealLine, Skill, Skills, SpyOrder, Tag,
} from './types';

const uid = (g: Game, p: string) => `${p}${(g.nextId++).toString(36)}`;
const log = (g: Game, m: string) => { g.log.push(m); if (g.log.length > 400) g.log.splice(0, g.log.length - 400); };
const skillText = (s: Skills) => SKILLS.filter(k => s[k]).map(k => `${SKILL_NAME[k]}${s[k]}`).join('・');

// ---------------------------------------------------------------------
//  生成
// ---------------------------------------------------------------------
function personName(g: Game) { return `${pick(g, LAST_NAMES)} ${pick(g, FIRST_NAMES)}`; }

export function genEngineer(g: Game, kind: 'normal' | 'rookie' | 'legend'): Engineer {
  const skills: Skills = {};
  let salary: number;
  const e: Engineer = { id: uid(g, 'e'), name: personName(g), skills, salary: 0, assign: null, restQ: -99 };
  if (kind === 'normal') {
    const main = pick(g, SKILLS);
    skills[main] = int(g, ...ENGINEER.normalMain);
    if (chance(g, ENGINEER.subChance)) {
      const sub = pick(g, SKILLS.filter(k => k !== main));
      skills[sub] = int(g, ...ENGINEER.normalSub);
    }
    salary = ENGINEER.salaryBase + ENGINEER.salaryPerSkill * skillSum(skills);
  } else if (kind === 'rookie') {
    skills[pick(g, SKILLS)] = int(g, ...ENGINEER.rookieSkill);
    salary = ENGINEER.rookieSalary;
    e.rookie = true;
  } else {
    const [a, b] = shuffle(g, [...SKILLS]).slice(0, 2);
    skills[a] = ENGINEER.legendSkills[0];
    skills[b] = ENGINEER.legendSkills[1];
    salary = ENGINEER.legendSalary;
    e.legend = true;
  }
  e.salary = salary;
  return e;
}

const PROJECT_NAMES: Record<ProjectType, string[]> = {
  speed: ['キャンペーンLP制作', 'ECサイト改修', '社内アンケートツール', '予約フォーム刷新', '店舗アプリの小改修', '問い合わせ窓口のチャット化'],
  big: ['銀行の勘定系刷新', '物流センターの基幹システム', '全国チェーンのPOS統合', '保険会社の契約管理', '鉄道会社の運行管理'],
  maint: ['老舗旅館の予約サイト保守', '自治体ポータルの運用', '病院の電子カルテ保守', '学習塾の会員システム運用'],
  startup: ['謎のSNSアプリ', 'ペット向けマッチング', '昆虫食サブスク', '推し活管理アプリ', '睡眠記録ウェアラブル'],
  gov: ['マイナンバー連携基盤', '税務の電子申請', '防災情報システム', '住民票オンライン化'],
  fire: ['納期3日前の大炎上', '前任ベンダー夜逃げ案件', '本番DB消失からの復旧'],
  overseas: ['シリコンバレー企業のAPI開発', 'ベトナム拠点のEC構築', 'ドイツ自動車メーカーの社内ツール', 'シンガポール決済アプリ'],
  ai: ['チャットボット導入', '需要予測AI', '画像検品AI', '議事録自動要約'],
  design: ['アパレルブランドのサイト', '化粧品の新ブランド立ち上げ', '美術館のデジタル展示', 'カフェチェーンのアプリ'],
  secret: ['■■■■プロジェクト', 'コードネーム「黒猫」', '詳細はNDA締結後に', '某国家機関の案件'],
};

function makeReqs(g: Game, type: ProjectType): Skills {
  const spec = PROJECT_TYPES[type];
  const R = int(g, spec.req[0], spec.req[1]);
  const reqs: Skills = {};
  let rest = R;
  if (spec.must) {
    const m = Math.max(2, Math.ceil(R * MUST_SHARE));
    reqs[spec.must] = m;
    rest = R - m;
  }
  const cand = spec.cand.filter(k => k !== spec.must);
  if (rest > 0) {
    if (rest >= 4 && cand.length >= 2) {
      const [a, b] = shuffle(g, [...cand]).slice(0, 2);
      const x = int(g, 1, rest - 1);
      reqs[a] = (reqs[a] || 0) + x;
      reqs[b] = (reqs[b] || 0) + rest - x;
    } else {
      const a = pick(g, cand);
      reqs[a] = (reqs[a] || 0) + rest;
    }
  }
  return reqs;
}

export function genProject(g: Game, type: ProjectType, hap: HappeningKey | undefined, bigGov = false): Project {
  const spec = PROJECT_TYPES[type];
  let duration = int(g, spec.dur[0], spec.dur[1]);
  if (bigGov) duration = Math.max(BIG_GOV.minDur, duration);
  const reqs = makeReqs(g, type);
  const tags: Tag[] = [];
  if (type !== 'secret' && !bigGov && chance(g, TAG_CHANCE)) tags.push(pick(g, Object.keys(TAGS) as Tag[]));
  if (tags.includes('legacy')) reqs.IN = (reqs.IN || 0) + 1;
  let budget = bigGov
    ? BIG_GOV.rpq * duration * BIG_GOV.mult
    : spec.rpq * BUDGET.rate * duration * (1 + BUDGET.longBonus * (duration - 1));
  for (const t of tags) if (t === 'rush' || t === 'rich') budget *= TAGS[t].mult || 1;
  if (hap === 'H4' && reqs.SE) budget *= HAPPENING_FX.secNews;
  if (hap === 'H5') budget *= HAPPENING_FX.recession;
  if (hap === 'H18' && type === 'ai') budget *= HAPPENING_FX.aiBoom;
  const name = (bigGov ? '【大型公募】' : '') + pick(g, PROJECT_NAMES[type]);
  return { id: uid(g, 'p'), type, name, duration, budget: round10(budget), reqs, tags, pay: spec.pay };
}

function drawCard(g: Game, c: Company) {
  if (c.hand.length >= GAME.handMax) return;
  if (!g.cardDeck.length) {
    if (!g.cardDiscard.length) return;
    g.cardDeck = shuffle(g, g.cardDiscard);
    g.cardDiscard = [];
  }
  c.hand.push(g.cardDeck.pop() as CardKey);
}

// ---------------------------------------------------------------------
//  ゲーム作成・期の開始
// ---------------------------------------------------------------------
export function createGame(players: { id: string; name: string }[], seed: number, id = 'local', quarters: number = GAME.quarters, industries = true): Game {
  if (!(GAME.modes as readonly number[]).includes(quarters)) quarters = GAME.quarters;
  if (players.length < GAME.minPlayers || players.length > GAME.maxPlayers) throw new Error(`参加は${GAME.minPlayers}〜${GAME.maxPlayers}社です`);
  const g: Game = {
    id, quarters, q: -1, phase: 'bid', seed: seed | 0, happenings: [], market: [], pool: [], offers: [],
    cardDeck: [], cardDiscard: [], companies: [], log: [], bidSubs: {}, devSubs: {}, secretMult: {},
    reveal: null, revealSeq: 0, final: null, nextId: 1,
  };
  const deck: CardKey[] = [];
  (Object.keys(CARDS) as CardKey[]).forEach(k => { for (let i = 0; i < CARDS[k].count; i++) deck.push(k); });
  g.cardDeck = shuffle(g, deck);
  g.happenings = shuffle(g, Object.keys(HAPPENINGS) as HappeningKey[]).slice(0, quarters);
  for (const pl of players) {
    const c: Company = {
      id: pl.id, name: pl.name, cash: GAME.startCash, rep: 0, debt: 0, engineers: [], projects: [], service: null,
      hand: [], stocks: [], aiKnowhow: 0, effects: {}, trolls: [], hitsThisQuarter: 0, yearProfit: 0, completed: 0,
      sleeper: null, spyOrdersLeft: GAME.spyOrders, honestLoans: 0, honestAwarded: false, secretNotes: [],
      quarterStartCash: GAME.startCash, history: [GAME.startCash],
      stats: { attacks: 0, hitsTaken: 0, blocks: 0, wins: 0, spies: 0, caught: 0, rushes: 0, maxDebt: 0, hires: 0, fired: 0, biggestDeal: 0 },
    };
    for (const se of GAME.startEngineers) {
      c.engineers.push({ id: uid(g, 'e'), name: personName(g), skills: { ...se.skills }, salary: se.salary, assign: null, restQ: -99 });
    }
    g.companies.push(c);
  }
  for (let i = 0; i < GAME.startHand; i++) g.companies.forEach(c => drawCard(g, c));
  log(g, `ゲーム開始！ 参加：${g.companies.map(c => c.name).join('・')}`);
  if (industries) dealIndustries(g);
  else startQuarter(g);
  return g;
}

/** 業種を2つずつ配る（なるべく他社と重ならないように。足りないときは山を作り直す） */
function dealIndustries(g: Game) {
  const keys = Object.keys(INDUSTRIES) as IndustryKey[];
  let pile: IndustryKey[] = [];
  for (const c of g.companies) {
    const hand: IndustryKey[] = [];
    while (hand.length < 2) {
      if (!pile.length) pile = shuffle(g, [...keys]);
      const k = pile.pop()!;
      if (!hand.includes(k)) hand.push(k);
    }
    c.choices = hand;
  }
  g.phase = 'pick';
  g.pickSubs = {};
}

/** 業種の決定と、開始時の効果 */
function resolvePick(g: Game) {
  const blocks: RevealBlock[] = [];
  for (const c of g.companies) {
    const k = g.pickSubs![c.id].industry;
    const s = INDUSTRIES[k];
    c.industry = k;
    delete c.choices;
    if (s.spyBonus) c.spyOrdersLeft += s.spyBonus;
    if (s.startRep) c.rep += s.startRep;
    for (let i = 0; i < (s.fewerStaff || 0) && c.engineers.length > 1; i++) c.engineers.pop();
    blocks.push({
      kind: 'info', icon: s.icon, title: c.name, owner: c.id,
      lines: [{ text: `作戦：${s.plan}`, tone: 'muted' }, ...s.good.map(t => ({ text: `◎ ${t}`, tone: 'good' as const })), ...s.bad.map(t => ({ text: `△ ${t}`, tone: 'bad' as const }))],
      stamp: { type: 'info', text: s.name, tone: 'gold' },
    });
    log(g, `${c.name}：業種は「${s.name}」`);
  }
  g.pickSubs = {};
  g.reveal = { kind: 'pick', q: -1, title: '各社の業種が決定！', blocks, headlines: g.companies.map(c => `${c.name}、${INDUSTRIES[c.industry!].name}として創業`) };
  g.revealSeq++;
  startQuarter(g);
}

export const currentHappening = (g: Game) => g.happenings[g.q];

export function startQuarter(g: Game) {
  g.q++;
  g.phase = 'bid';
  g.bidSubs = {};
  g.devSubs = {};
  const h = currentHappening(g);
  const hs = HAPPENINGS[h];
  g.companies.forEach(c => { c.hitsThisQuarter = 0; c.quarterStartCash = c.cash; });
  if (season(g.q) === 0 || !g.funds) g.funds = newFunds(g);
  log(g, `━━ ${quarterLabel(g.q)}（第${g.q + 1}期）━━ ハプニング「${hs.name}」`);

  // 春：新人の成長
  if (season(g.q) === 0 && g.q > 0) {
    g.companies.forEach(c => c.engineers.forEach(e => {
      if (!e.rookie) return;
      const k = SKILLS.find(s => e.skills[s]);
      if (k) e.skills[k] = (e.skills[k] || 0) + ENGINEER.rookieGrow;
      e.salary += ENGINEER.rookieRaise;
    }));
    log(g, '春：在籍中の新人が成長（スキル+1・給料+10）');
  }

  // ハプニングの即時効果
  const pool: Engineer[] = [];
  switch (h) {
    case 'H2': for (let i = 0; i < 2; i++) pool.push(genEngineer(g, 'rookie')); break;
    case 'H3': g.companies.forEach(c => c.projects.forEach(p => { if (p.type === 'overseas') p.fx = chance(g, 0.5) ? 2 : 0.5; })); break;
    case 'H6': case 'H11': case 'H18': {
      const k: Skill = h === 'H18' ? 'AI' : pick(g, SKILLS);
      g.hackSkill = k;
      g.companies.forEach(c => c.engineers.forEach(e => {
        if (!e.skills[k]) return;
        e.skills[k] = (e.skills[k] || 0) + 1;
        if (h === 'H6') e.salary += 10;
      }));
      log(g, `${SKILL_NAME[k]}スキルを持つ全社員のスキル+1${h === 'H6' ? '・給料+10' : ''}`);
      break;
    }
    case 'H7': g.companies.forEach(c => { const v = c.engineers.length * HAPPENING_FX.rentPerHead; c.cash -= v; log(g, `${c.name}：賃料 −${v}`); }); break;
    case 'H8': g.companies.forEach(c => { if (!c.engineers.length) return; const e = pick(g, c.engineers); e.restQ = g.q; log(g, `${c.name}：${e.name} がインフルエンザで休み`); }); break;
    case 'H10': g.companies.forEach(c => c.projects.forEach(p => { p.deadline++; })); break;
    case 'H13': g.companies.forEach(c => { if (c.service && c.service.level >= 1) { c.cash += HAPPENING_FX.subsidy; log(g, `${c.name}：補助金 +${HAPPENING_FX.subsidy}`); } }); break;
    case 'H14': pool.push(genEngineer(g, 'legend')); break;
    case 'H16': g.companies.forEach(c => {
      if (c.debt >= HAPPENING_FX.bounty.high) { const v = c.debt * HAPPENING_FX.bounty.perDebt; c.cash -= v; log(g, `${c.name}：バグ報奨金 −${v}`); }
      else if (c.debt <= HAPPENING_FX.bounty.low) { c.cash += HAPPENING_FX.bounty.reward; log(g, `${c.name}：バグ報奨金ゼロで +${HAPPENING_FX.bounty.reward}`); }
    }); break;
    case 'H17': g.companies.forEach(c => drawCard(g, c)); break;
    default: break;
  }

  // 案件
  const count = g.companies.length + 1 - (h === 'H12' ? 1 : 0);
  const market: Project[] = [];
  const types = Object.keys(PROJECT_TYPES) as ProjectType[];
  while (market.length < count) {
    const hasFire = market.some(p => p.type === 'fire');
    const t = weighted(g, types.filter(x => !(hasFire && x === 'fire')), x => PROJECT_TYPES[x].weight);
    market.push(genProject(g, t, h));
  }
  if (season(g.q) === 2) market.push(genProject(g, 'gov', h, true));
  g.market = market;

  // 採用候補
  for (let i = 0; i < ENGINEER.normalPerQuarter; i++) pool.unshift(genEngineer(g, 'normal'));
  if (season(g.q) === 0) for (let i = 0; i < ENGINEER.springRookies; i++) pool.push(genEngineer(g, 'rookie'));
  g.pool = pool;

  g.companies.forEach(c => drawCard(g, c));
}

// ---------------------------------------------------------------------
//  提出
// ---------------------------------------------------------------------
export function emptyBid(): BidSubmit { return { bids: {}, hires: {}, spyOrders: {} }; }
export function defaultDev(g: Game, cid: string): DevSubmit {
  const c = companyOf(g, cid)!;
  const assign: Record<string, string> = {};
  c.engineers.forEach(e => { assign[e.id] = e.assign && (e.assign === 'svc' ? !!c.service : c.projects.some(p => p.id === e.assign)) ? e.assign : ''; });
  return {
    assign, rush: [], launch: false, sleeper: c.sleeper?.engineerId || '', sleeperOrder: c.sleeper?.order || 'intel', spyOrders: {},
  };
}

/** 自社の社員で、指令が未定のスパイ（他社に潜入中） */
export function pendingSpies(g: Game, cid: string) {
  const out: { engineer: Engineer; at: Company }[] = [];
  g.companies.forEach(c => c.engineers.forEach(e => { if (e.spy && e.spy.for === cid && !e.spy.order && c.id !== cid) out.push({ engineer: e, at: c }); }));
  return out;
}

function cleanBid(g: Game, cid: string, s: BidSubmit): BidSubmit {
  const c = companyOf(g, cid)!;
  const out: BidSubmit = { bids: {}, hires: {}, spyOrders: {} };
  for (const [pid, v] of Object.entries(s.bids || {})) if (g.market.some(p => p.id === pid && canBid(c, p.type)) && (BID_PCTS as readonly number[]).includes(v)) out.bids[pid] = v as BidPct;
  for (const [eid, v] of Object.entries(s.hires || {})) if (g.pool.some(e => e.id === eid) && (HIRE_FEES as readonly number[]).includes(v)) out.hires[eid] = v as HireFee;
  if (s.card && c.hand.includes(s.card) && CARDS[s.card].kind !== 'defense') {
    if (CARDS[s.card].kind === 'self') out.card = s.card;
    else if (s.target && s.target !== cid && companyOf(g, s.target)) { out.card = s.card; out.target = s.target; }
  }
  if (s.rent && g.offers.some(o => o.id === s.rent && o.from !== cid)) out.rent = s.rent;
  out.spyOrders = cleanOrders(g, cid, s.spyOrders);
  return out;
}

function cleanOrders(g: Game, cid: string, orders: Record<string, SpyOrder> | undefined) {
  const out: Record<string, SpyOrder> = {};
  const pend = pendingSpies(g, cid);
  for (const [eid, o] of Object.entries(orders || {})) if (pend.some(x => x.engineer.id === eid) && ['intel', 'sabo', 'steal'].includes(o)) out[eid] = o;
  return out;
}

function cleanDev(g: Game, cid: string, s: DevSubmit): DevSubmit {
  const c = companyOf(g, cid)!;
  const out = defaultDev(g, cid);
  const willHaveSvc = !!c.service || !!s.launch;
  for (const e of c.engineers) {
    const v = s.assign?.[e.id];
    if (v === undefined) continue;
    if (v === '' || (v === 'svc' && willHaveSvc) || (v === 'fire' && !e.loan) || c.projects.some(p => p.id === v)) out.assign[e.id] = v;
    else if (v === 'train' && canTrain(g, e, s.train?.[e.id])) { out.assign[e.id] = 'train'; (out.train ??= {})[e.id] = s.train![e.id]; }
  }
  out.drop = [...new Set((s.drop || []).filter(id => c.projects.some(p => p.id === id)))];
  for (const e of c.engineers) if (out.drop.includes(out.assign[e.id])) out.assign[e.id] = '';
  out.rush = (s.rush || []).filter(id => c.projects.some(p => p.id === id) && !out.drop!.includes(id));
  out.launch = !c.service && !!s.launch;
  const own = (id?: string) => c.engineers.find(e => e.id === id);
  if (s.offer && own(s.offer.engineerId) && !own(s.offer.engineerId)!.loan
    && (RENTAL.periods as readonly number[]).includes(s.offer.period) && (RENTAL.shares as readonly number[]).includes(s.offer.share)) {
    out.offer = { engineerId: s.offer.engineerId, period: s.offer.period, share: s.offer.share, spy: ['intel', 'sabo', 'steal'].includes(s.offer.spy) ? s.offer.spy : '' };
  }
  out.sleeper = own(s.sleeper || '') && !own(s.sleeper || '')!.loan ? s.sleeper : '';
  out.sleeperOrder = ['intel', 'sabo', 'steal'].includes(s.sleeperOrder) ? s.sleeperOrder : 'intel';
  if (s.investigate && own(s.investigate)?.via) out.investigate = s.investigate;
  if (s.accuse && own(s.accuse)?.via) out.accuse = s.accuse;
  out.spyOrders = cleanOrders(g, cid, s.spyOrders);
  // 投資：今年の候補に、決まった金額だけ。合計は手元の現金まで
  let left = Math.max(0, c.cash);
  for (const [fid, v] of Object.entries(s.invest || {})) {
    if (!(g.funds || []).some(f => f.id === fid) || !(INVEST.amounts as readonly number[]).includes(v) || v > left) continue;
    (out.invest ??= {})[fid] = v;
    left -= v;
  }
  return out;
}

/** 今年の投資先：国債1つ＋ほかの種類からランダムに3つ */
function newFunds(g: Game): Fund[] {
  const others = shuffle(g, (Object.keys(FUNDS) as FundKind[]).filter(k => k !== 'bond')).slice(0, INVEST.perYear - 1);
  return (['bond', ...others] as FundKind[]).map(kind => ({ id: uid(g, 'f'), kind, name: pick(g, FUNDS[kind].names) }));
}

export function submit(g: Game, cid: string, data: BidSubmit | DevSubmit | PickSubmit) {
  if (g.phase === 'end') throw new Error('ゲームは終了しています');
  if (!companyOf(g, cid)) throw new Error('参加していない会社です');
  if (g.phase === 'pick') {
    const k = (data as PickSubmit).industry;
    if (!companyOf(g, cid)!.choices?.includes(k)) throw new Error('配られた業種から選んでください');
    g.pickSubs![cid] = { industry: k };
  } else if (g.phase === 'bid') g.bidSubs[cid] = cleanBid(g, cid, data as BidSubmit);
  else g.devSubs[cid] = cleanDev(g, cid, data as DevSubmit);
}

export function cancelSubmit(g: Game, cid: string) {
  if (g.phase === 'pick') delete g.pickSubs?.[cid];
  else if (g.phase === 'bid') delete g.bidSubs[cid];
  else delete g.devSubs[cid];
}

export const subsOf = (g: Game): Record<string, unknown> => (g.phase === 'pick' ? g.pickSubs || {} : g.phase === 'bid' ? g.bidSubs : g.devSubs);
export const allSubmitted = (g: Game) => g.companies.every(c => subsOf(g)[c.id]);

/** 全員そろっていれば解決する。解決したら true */
export function tryResolve(g: Game): boolean {
  if (g.phase === 'end' || !allSubmitted(g)) return false;
  if (g.phase === 'pick') resolvePick(g);
  else if (g.phase === 'bid') resolveBid(g);
  else resolveDev(g);
  return true;
}

function applyOrders(g: Game, cid: string, orders: Record<string, SpyOrder>) {
  for (const [eid, o] of Object.entries(orders)) {
    for (const c of g.companies) {
      const e = c.engineers.find(x => x.id === eid);
      if (e && e.spy && e.spy.for === cid && !e.spy.order) e.spy.order = o;
    }
  }
}

// ---------------------------------------------------------------------
//  入札フェーズの解決
// ---------------------------------------------------------------------
export function bidAmount(budget: number, pct: number, dump: boolean) {
  let a = round10(budget * pct / 100);
  if (dump) a = round10(a * DUMP_RATE);
  return a;
}

function bestEngineer(g: Game, c: Company): Engineer | null {
  const list = c.engineers.filter(e => !e.loan);
  if (!list.length) return null;
  const max = Math.max(...list.map(e => skillSum(e.skills)));
  return pick(g, list.filter(e => skillSum(e.skills) === max));
}

/** ヘッドハンティング（taker が victim から最優秀社員を奪う） */
function headhunt(g: Game, taker: Company, victim: Company, lines: RevealLine[]) {
  const e = bestEngineer(g, victim);
  if (!e) { lines.push({ text: `${victim.name}には引き抜ける社員がいなかった`, tone: 'muted' }); return; }
  victim.engineers = victim.engineers.filter(x => x !== e);
  if (victim.sleeper?.engineerId === e.id) {
    // 潜伏スパイとして送り込まれた
    if (!e.spy) { e.spy = { for: victim.id, order: victim.sleeper.order, src: 'hh' }; victim.stats.spies++; }
    victim.sleeper = null;
  } else if (!e.spy && chance(g, ENGINEER.hhSpyChance)) {
    e.spy = { for: victim.id, order: null, src: 'hh' };
    victim.stats.spies++;
    victim.secretNotes.push(`${quarterLabel(g.q)}：引き抜かれた ${e.name} があなたのスパイになった！次のフェーズで指令を選んでください`);
  }
  if (e.spy && e.spy.for === taker.id) { delete e.spy; delete e.via; delete e.checked; }
  else e.via = 'hh';
  e.salary = round10(e.salary * ENGINEER.headhuntRaise);
  e.assign = null;
  taker.engineers.push(e);
  lines.push({ text: `${e.name}（${skillText(e.skills)}）が ${victim.name} → ${taker.name} へ移籍！ 給料は${e.salary}に`, tone: 'bad' });
}

/** 攻撃カードの効果。from=効果の得をする側、to=被害を受ける側 */
function applyAttack(g: Game, card: CardKey, from: Company, to: Company, lines: RevealLine[]) {
  switch (card) {
    case 'A1': headhunt(g, from, to, lines); break;
    case 'A2': {
      const list = to.engineers.filter(e => !e.loan);
      if (!list.length) { lines.push({ text: '退職させる社員がいなかった', tone: 'muted' }); break; }
      const e = pick(g, list);
      to.engineers = to.engineers.filter(x => x !== e);
      if (to.sleeper?.engineerId === e.id) to.sleeper = null;
      lines.push({ text: `${to.name}の ${e.name} が退職代行で辞めた…`, tone: 'bad' });
      break;
    }
    case 'A3': to.effects.slack = g.q; lines.push({ text: `${to.name}の全社員が今期スキル−1`, tone: 'bad' }); break;
    case 'A4': to.effects.review = g.q; lines.push({ text: `${to.name}の今期のサービス収入が半分に`, tone: 'bad' }); break;
    case 'A5': to.effects.noBid = g.q; lines.push({ text: `${to.name}の今期の入札はすべて無効！`, tone: 'bad' }); break;
    case 'A6': {
      if (!to.projects.length) { lines.push({ text: '進行中の案件がなく効果なし', tone: 'muted' }); break; }
      const p = pick(g, to.projects);
      p.work++;
      lines.push({ text: `${to.name}の「${p.name}」の必要進捗が+1`, tone: 'bad' });
      break;
    }
    case 'A7': to.debt += 2; lines.push({ text: `${to.name}の負債+2`, tone: 'bad' }); break;
    case 'A8': to.effects.noHire = g.q; lines.push({ text: `${to.name}は今期採用できない`, tone: 'bad' }); break;
    case 'A9':
      if (!to.service) { lines.push({ text: `${to.name}はサービスを持っておらず効果なし`, tone: 'muted' }); break; }
      to.trolls.push({ from: from.id, left: TROLL.quarters });
      lines.push({ text: `${to.name}は${TROLL.quarters}期にわたり毎期${TROLL.pay}を ${from.name} に払うことに`, tone: 'bad' });
      break;
    default: break;
  }
  to.hitsThisQuarter++;
  to.stats.hitsTaken++;
}

export function resolveBid(g: Game) {
  const blocks: RevealBlock[] = [];
  const headlines: string[] = [];
  const subs = g.bidSubs;
  const q = g.q;

  // 1. スパイ指令
  g.companies.forEach(c => applyOrders(g, c.id, subs[c.id].spyOrders));

  // 2. 作戦カード
  for (const atk of g.companies) {
    const s = subs[atk.id];
    if (!s.card || !atk.hand.includes(s.card)) continue;
    const card = s.card;
    atk.hand.splice(atk.hand.indexOf(card), 1);
    g.cardDiscard.push(card);
    const cs = CARDS[card];
    if (cs.kind === 'self') {
      atk.effects.dump = q;
      blocks.push({ kind: 'card', icon: cs.icon, title: cs.name, sub: atk.name, lines: [{ text: `${atk.name}が「${cs.name}」を宣言！ 今期の入札額×${DUMP_RATE}`, card }], stamp: { type: 'info', text: '値下げ攻勢', tone: 'gold' } });
      log(g, `${atk.name}：安値ダンピング`);
      continue;
    }
    const def = companyOf(g, s.target!)!;
    atk.stats.attacks++;
    const lines: RevealLine[] = [{ text: `${atk.name} が「${cs.name}」を ${def.name} に！`, card }];
    const dk = DEFENSE_ORDER.find(d => def.hand.includes(d) && CARDS[d].blocks!.includes(card));
    let stamp: RevealBlock['stamp'];
    if (dk) {
      def.hand.splice(def.hand.indexOf(dk), 1);
      g.cardDiscard.push(dk);
      def.stats.blocks++;
      lines.push({ text: `${def.name}の「${CARDS[dk].name}」が自動発動！`, card: dk, tone: 'good' });
      if (dk === 'D9') {
        lines.push({ text: 'ダミー情報で効果が跳ね返った！', tone: 'good' });
        applyAttack(g, card, def, atk, lines);
        stamp = { type: 'reflect', text: '跳ね返し！', tone: 'blue' };
        headlines.push(`${atk.name}の妨害、${def.name}に跳ね返される`);
      } else {
        if (dk === 'D3') {
          lines.push({ text: 'カウンターオファーで逆にエースを引き抜く！', tone: 'good' });
          headhunt(g, def, atk, lines);
        }
        if (dk === 'D5') { atk.cash -= DEFENSE_FX.D5fine; lines.push({ text: `${atk.name}に罰金${DEFENSE_FX.D5fine}`, tone: 'good' }); }
        if (dk === 'D8') { atk.cash -= DEFENSE_FX.D8take; def.cash += DEFENSE_FX.D8take; lines.push({ text: `${def.name}が ${atk.name} から${DEFENSE_FX.D8take}を受け取った`, tone: 'good' }); }
        stamp = { type: 'block', text: 'ブロック！', tone: 'good' };
      }
    } else {
      applyAttack(g, card, atk, def, lines);
      stamp = { type: 'hit', text: '成功！', tone: 'bad' };
      headlines.push(`${def.name}、${atk.name}の「${cs.name}」を受ける`);
    }
    log(g, lines.map(l => l.text).join(' / '));
    blocks.push({ kind: 'card', icon: cs.icon, title: cs.name, sub: `${atk.name} → ${def.name}`, lines, stamp });
  }
  if (!blocks.length) blocks.push({ kind: 'card', icon: '🕊️', title: '作戦カード', lines: [{ text: '今期はどの会社も作戦カードを使わなかった', tone: 'muted' }], stamp: { type: 'none', text: '平和だった', tone: 'muted' } });

  // 3. 同情票
  g.companies.forEach(c => {
    if (c.hitsThisQuarter >= 2) {
      c.rep++;
      blocks.push({ kind: 'sympathy', icon: '🥺', title: '同情票', lines: [{ text: `${c.name}は今期${c.hitsThisQuarter}回も妨害を受けた…世間の同情が集まる` }], stamp: { type: 'info', text: '評判+1', tone: 'good' } });
      log(g, `${c.name}：同情票で評判+1`);
    }
  });

  // 4. レンタル成立
  for (const o of g.offers) {
    const lender = companyOf(g, o.from)!;
    const e = lender.engineers.find(x => x.id === o.engineerId && !x.loan);
    const applicants = g.companies.filter(c => c.id !== o.from && subs[c.id].rent === o.id);
    const lines: RevealLine[] = [{ text: `${lender.name}の ${e ? `${e.name}（${skillText(e.skills)}）` : '社員'}・${o.period}期・取り分${o.share}%` }];
    if (!e) {
      lines.push({ text: 'すでに社員がいないため不成立', tone: 'muted' });
      blocks.push({ kind: 'rental', icon: '🤝', title: 'レンタル', lines, stamp: { type: 'none', text: '不成立', tone: 'muted' } });
      continue;
    }
    if (!applicants.length) {
      blocks.push({ kind: 'rental', icon: '🤝', title: 'レンタル', lines, stamp: { type: 'none', text: '借り手なし', tone: 'muted' } });
      continue;
    }
    const maxRep = Math.max(...applicants.map(c => c.rep));
    const borrower = pick(g, applicants.filter(c => c.rep === maxRep));
    lender.engineers = lender.engineers.filter(x => x !== e);
    if (lender.sleeper?.engineerId === e.id) lender.sleeper = null;
    e.loan = { from: lender.id, until: q + o.period - 1, share: o.share };
    e.via = 'rent';
    e.assign = null;
    delete e.checked;
    if (o.spy && lender.spyOrdersLeft > 0) {
      lender.spyOrdersLeft--;
      e.spy = { for: lender.id, order: o.spy, src: 'rent' };
      lender.stats.spies++;
    }
    borrower.engineers.push(e);
    if (applicants.length > 1) lines.push({ text: `申込 ${applicants.length}社（${applicants.map(c => c.name).join('・')}）→ 評判で決定` });
    blocks.push({ kind: 'rental', icon: '🤝', title: 'レンタル', lines, stamp: { type: 'hire', text: `${borrower.name}が借りた`, tone: 'good' } });
    log(g, `${borrower.name} が ${lender.name} の ${e.name} を借りた（${o.period}期）`);
  }

  // 5. 案件の落札
  for (const p of g.market) {
    const entries: { c: Company; amount: number; cmp: number; banned: boolean }[] = [];
    g.companies.forEach(c => {
      const pct = subs[c.id].bids[p.id];
      if (!pct) return;
      const banned = c.effects.noBid === q;
      const amount = bidAmount(p.budget, pct, c.effects.dump === q);
      entries.push({ c, amount, cmp: amount * (1 - REP_DISCOUNT * c.rep) * bidFactor(c, p.type), banned });
    });
    const valid = entries.filter(x => !x.banned);
    const spec = PROJECT_TYPES[p.type];
    const flips = [...entries].sort((a, b) => (a.banned ? -1 : 0) - (b.banned ? -1 : 0) || b.cmp - a.cmp)
      .map(x => ({ label: x.c.name, value: x.banned ? '入札禁止' : `${x.amount.toLocaleString()}万円${x.c.rep ? `（評判${x.c.rep > 0 ? '+' : ''}${x.c.rep}）` : ''}` }));
    const head: RevealLine = { text: `${spec.icon} ${spec.name}・${p.duration}期・予算${p.type === 'secret' ? '非公開' : yen(p.budget)}` };
    if (!valid.length) {
      blocks.push({ kind: 'project', icon: spec.icon, title: p.name, lines: [head], flips, stamp: { type: 'none', text: '流札', tone: 'muted' } });
      continue;
    }
    const minCmp = Math.min(...valid.map(x => x.cmp));
    let tied = valid.filter(x => x.cmp === minCmp);
    const maxRep = Math.max(...tied.map(x => x.c.rep));
    tied = tied.filter(x => x.c.rep === maxRep);
    const win = pick(g, tied);
    const sorted = [...valid].sort((a, b) => a.cmp - b.cmp);
    const close = sorted.length > 1 && (sorted[1].cmp - sorted[0].cmp) / sorted[0].cmp <= CLOSE_RACE;
    const ap: ActiveProject = { ...p, price: win.amount, progress: 0, work: p.duration, start: q, deadline: q + p.duration - 1, rush: false, fx: 1 };
    win.c.projects.push(ap);
    win.c.stats.wins++;
    win.c.stats.biggestDeal = Math.max(win.c.stats.biggestDeal, win.amount);
    if (p.type === 'fire') { win.c.debt += FIRE_DEBT; head.text += `（落札で負債+${FIRE_DEBT}）`; }
    flips.forEach(f => { if (f.label === win.c.name) (f as { win?: boolean }).win = true; });
    blocks.push({ kind: 'project', icon: spec.icon, title: p.name, lines: [head], flips, stamp: { type: close ? 'close' : 'win', text: `${win.c.name} 落札！${close ? ' 僅差の勝負！' : ''}`, tone: 'gold' } });
    if (win.amount >= 1000) headlines.push(`${win.c.name}、「${p.name}」を${yen(win.amount)}で受注`);
    log(g, `「${p.name}」は ${win.c.name} が ${yen(win.amount)} で落札`);
  }

  // 6. 採用
  for (const e of g.pool) {
    const entries = g.companies.filter(c => subs[c.id].hires[e.id] !== undefined).map(c => ({ c, fee: subs[c.id].hires[e.id], cmp: subs[c.id].hires[e.id] + hireBonus(c, e), banned: c.effects.noHire === q }));
    const valid = entries.filter(x => !x.banned);
    const flips = [...entries].sort((a, b) => (a.banned ? -1 : 0) - (b.banned ? -1 : 0) || a.fee - b.fee).map(x => ({ label: x.c.name, value: x.banned ? '採用禁止' : `${x.fee}万円` }));
    const kind = e.legend ? '🧙 伝説のエンジニア' : e.rookie ? '🌱 新人' : '👤';
    const head: RevealLine = { text: `${kind} ${e.name}（${skillText(e.skills)}）給料${e.salary}` };
    if (!valid.length) {
      blocks.push({ kind: 'hire', icon: '👤', title: e.name, lines: [head], flips, stamp: { type: 'none', text: '採用なし', tone: 'muted' } });
      continue;
    }
    const maxFee = Math.max(...valid.map(x => x.cmp));
    let tied = valid.filter(x => x.cmp === maxFee);
    const maxRep = Math.max(...tied.map(x => x.c.rep));
    tied = tied.filter(x => x.c.rep === maxRep);
    const win = pick(g, tied);
    win.c.cash -= win.fee;
    win.c.engineers.push({ ...e, assign: null });
    win.c.stats.hires++;
    flips.forEach(f => { if (f.label === win.c.name) (f as { win?: boolean }).win = true; });
    blocks.push({ kind: 'hire', icon: '👤', title: e.name, lines: [head], flips, stamp: { type: 'hire', text: `${win.c.name} 獲得`, tone: 'good' } });
    if (e.legend) headlines.push(`伝説のエンジニア ${e.name}、${win.c.name}へ`);
    log(g, `${e.name} は ${win.c.name} が採用（契約金${win.fee}）`);
  }

  // 7. クリア
  g.market = [];
  g.pool = [];
  g.offers = [];
  g.phase = 'dev';
  g.reveal = { kind: 'bid', q, title: `${quarterLabel(q)} 入札結果`, blocks, headlines };
  g.revealSeq++;
}

// ---------------------------------------------------------------------
//  開発フェーズの解決（決算）
// ---------------------------------------------------------------------
interface Ledger { lines: RevealLine[]; jackpot: boolean }

/** 経験値：案件で使ったスキルが育つ。成長したら給料も上がる */
function gainXp(c: Company, e: Engineer, reqs: Skills, ledgers: Record<string, Ledger>) {
  for (const k of SKILLS) {
    const lv = e.skills[k] || 0;
    if (!reqs[k] || !lv || lv >= GROWTH.maxSkill) continue;
    e.xp = e.xp || {};
    e.xp[k] = (e.xp[k] || 0) + 1;
    if ((e.xp[k] || 0) < xpNeed(lv)) continue;
    e.skills[k] = lv + 1;
    delete e.xp[k];
    e.salary += GROWTH.raise;
    const text = `📈 ${e.name} が成長！ ${SKILL_NAME[k]} ${lv}→${lv + 1}（給料+${GROWTH.raise}）`;
    ledgers[c.id].lines.push({ text, tone: 'good' });
    if (e.loan && ledgers[e.loan.from]) ledgers[e.loan.from].lines.push({ text: `${text}［${c.name}に貸し出し中］`, tone: 'good' });
  }
}

/** 研修に行けるか：自社の社員（借りている人は不可）で、今期出勤していて、伸ばすスキルが上限未満 */
export function canTrain(g: Game, e: Engineer, k: Skill | undefined): boolean {
  return !!k && SKILLS.includes(k) && !e.loan && working(g, e) && (e.skills[k] || 0) < GROWTH.maxSkill;
}

/** 研修の結果：スキル+1（新しく習得も）・給料アップ・来期は休み */
function doTraining(g: Game, c: Company, s: DevSubmit, L: (c: Company, text: string, tone?: RevealLine['tone']) => void) {
  for (const [eid, k] of Object.entries(s.train || {})) {
    const e = c.engineers.find(x => x.id === eid);
    if (!e || s.assign[eid] !== 'train') continue;
    const lv = e.skills[k] || 0;
    e.skills[k] = lv + 1;
    if (e.xp) delete e.xp[k];
    e.salary += TRAINING.raise;
    e.restQ = g.q + 1;
    e.trainedQ = g.q;
    if (TRAINING.fee) c.cash -= TRAINING.fee;
    L(c, `📚 ${e.name} が研修で${SKILL_NAME[k]}${lv ? ` ${lv}→${lv + 1}` : 'を新しく習得'}！（給料+${TRAINING.raise}・来期は休み${TRAINING.fee ? `・研修費 −${TRAINING.fee}` : ''}）`, 'good');
  }
}

/** 途中放棄の違約金 */
export const abandonFee = (p: ActiveProject) => round10(p.price * ABANDON.penalty);

export function resolveDev(g: Game) {
  const q = g.q;
  const h = currentHappening(g);
  const subs = g.devSubs;
  const ledgers: Record<string, Ledger> = {};
  g.companies.forEach(c => { ledgers[c.id] = { lines: [], jackpot: false }; });
  const L = (c: Company, text: string, tone?: RevealLine['tone']) => ledgers[c.id].lines.push({ text, tone });
  const spyBlocks: RevealBlock[] = [];
  const offerLines: RevealLine[] = [];
  const headlines: string[] = [];

  // 先に全社のスパイ指令と潜伏スパイ指定を反映
  g.companies.forEach(c => applyOrders(g, c.id, subs[c.id].spyOrders));

  for (const c of g.companies) {
    const s = subs[c.id];
    // 2. 潜伏スパイ
    c.sleeper = s.sleeper && c.engineers.some(e => e.id === s.sleeper && !e.loan) ? { engineerId: s.sleeper, order: s.sleeperOrder } : null;

    // 3. 告発
    if (s.accuse) {
      const e = c.engineers.find(x => x.id === s.accuse && x.via);
      if (e) spyBlocks.push(accuse(g, c, e));
    }
    // 4. 身辺調査
    if (s.investigate) {
      const e = c.engineers.find(x => x.id === s.investigate && x.via);
      if (e) {
        c.cash -= INVESTIGATE_COST;
        e.checked = e.spy && e.spy.for !== c.id ? 'spy' : 'clean';
        c.secretNotes.push(`${quarterLabel(q)}：身辺調査の結果、${e.name} は${e.checked === 'spy' ? '【スパイ確定】' : '【シロ】'}`);
        L(c, `身辺調査 −${INVESTIGATE_COST}`, 'muted');
      }
    }
    // 5. レンタル出品
    if (s.offer) {
      const e = c.engineers.find(x => x.id === s.offer!.engineerId && !x.loan);
      if (e) {
        const spy = s.offer.spy && c.spyOrdersLeft > 0 ? s.offer.spy : '';
        g.offers.push({ id: uid(g, 'o'), from: c.id, engineerId: e.id, period: s.offer.period as 1 | 2 | 3, share: s.offer.share as 10 | 20 | 30, spy });
        offerLines.push({ text: `${c.name}が ${e.name}（${skillText(e.skills)}）を貸し出し：${s.offer.period}期・取り分${s.offer.share}%` });
      }
    }
    // 6. 解雇
    for (const e of [...c.engineers]) {
      if (s.assign[e.id] !== 'fire' || e.loan) continue;
      const sev = e.salary * SEVERANCE_QUARTERS;
      c.cash -= sev;
      c.engineers = c.engineers.filter(x => x !== e);
      if (c.sleeper?.engineerId === e.id) c.sleeper = null;
      c.stats.fired++;
      L(c, `${e.name} を解雇（退職金 −${sev}）`, 'bad');
    }
    // 6.5 案件の放棄（違約金・評判−1。受け取り済みの中間金は返さない）
    for (const id of s.drop || []) {
      const p = c.projects.find(x => x.id === id);
      if (!p) continue;
      const fee = abandonFee(p);
      c.cash -= fee;
      c.rep += ABANDON.rep;
      c.projects = c.projects.filter(x => x !== p);
      c.engineers.forEach(e => { if (e.assign === p.id) e.assign = null; });
      L(c, `「${p.name}」を途中放棄（違約金 −${fee}・評判${ABANDON.rep}）`, 'bad');
      headlines.push(`${c.name}、「${p.name}」から撤退`);
      log(g, `${c.name}：「${p.name}」を放棄`);
    }
    // 7. サービス立ち上げ
    if (s.launch && !c.service) {
      c.cash -= launchCost(c);
      c.service = { level: 0 };
      L(c, `自社サービスを立ち上げ −${launchCost(c)}`, 'gold');
      headlines.push(`${c.name}、自社サービスを立ち上げ`);
    }
    // 8. 担当と突貫
    for (const e of c.engineers) {
      const v = s.assign[e.id];
      if (v === undefined) continue;
      e.assign = v === '' || v === 'fire' || v === 'train' ? null : v;
    }
    c.projects.forEach(p => { p.rush = s.rush.includes(p.id); });
    doTraining(g, c, s, L);
    // 投資（お金は今出ていき、結果は冬の決算で）
    for (const [fid, v] of Object.entries(s.invest || {})) {
      const f = (g.funds || []).find(x => x.id === fid);
      if (!f) continue;
      c.cash -= v;
      (c.invest ??= []).push({ fund: fid, amount: v });
      L(c, `💹 ${f.name}に投資 −${v}（結果は冬の決算で）`, 'muted');
    }

    // 9. 作業停止
    const stopped = h === 'H15' || (h === 'H1' && !c.engineers.some(e => working(g, e) && (effSkills(g, c, e, true).IN || 0) > 0));
    if (stopped) L(c, h === 'H15' ? '全社停電で作業停止…' : 'クラウド障害で作業停止…', 'bad');

    // 10〜12. 案件の進行と支払い
    for (const p of [...c.projects]) {
      const team = assignees(c, p.id);
      const chk = checkReqs(p.reqs, sumSkills(g, c, team, true));
      let steps = 0;
      if (!stopped) {
        if (chk.ok) {
          steps = p.rush ? 2 : 1;
          if (p.rush) { c.debt += rushDebt(c); c.stats.rushes++; }
          if (p.tags.includes('muri')) c.debt += 1;
          p.progress = Math.min(p.work, p.progress + steps);
          L(c, `「${p.name}」進捗 ${p.progress}/${p.work}${p.rush ? '（突貫・負債+2）' : ''}`);
          team.filter(e => working(g, e)).forEach(e => gainXp(c, e, p.reqs, ledgers));
        } else if (team.length) {
          L(c, `「${p.name}」スキル不足で進まず`, 'bad');
        } else {
          L(c, `「${p.name}」担当者なし`, 'muted');
        }
      }
      // 保守運用：毎期払い
      if (p.pay === 'turn' && steps > 0) {
        const gross = round10(p.price / p.work * steps);
        const net = payout(g, c, p, team, gross, ledgers);
        L(c, `「${p.name}」保守料 +${net}`, 'good');
      }
      // 一括払い：進んだ分の中間金（完了する期は完了時にまとめて受け取る）
      if (p.pay === 'lump' && steps > 0 && p.progress < p.work) {
        const gross = round10(p.price * INTERIM / p.work * steps);
        p.paid = (p.paid || 0) + gross;
        const net = payout(g, c, p, team, gross, ledgers);
        L(c, `「${p.name}」中間金 +${net}`, 'good');
      }
      // 完了
      if (p.progress >= p.work) completeProject(g, c, p, team, ledgers, headlines);
    }

    // 13. サービス
    if (c.service) {
      const power = servicePower(g, c, undefined, true);
      if (!stopped && c.service.level < SERVICE.maxLv && power >= serviceNeed(c)) {
        c.service.level++;
        L(c, `自社サービスが Lv${c.service.level} に成長！`, 'gold');
        if (c.service.level >= 4) headlines.push(`${c.name}のサービス、Lv${c.service.level}の人気に`);
      }
      let inc = serviceIncome(c, c.service.level);
      if (c.effects.review === q) inc = Math.floor(inc / 2);
      if (inc) { c.cash += inc; L(c, `サービス収入 +${inc}${c.effects.review === q ? '（口コミ被害で半減）' : ''}`, 'good'); }
    }

    // 14. リファクタリング
    const idle = c.engineers.filter(e => working(g, e) && !e.assign).length;
    if (idle && c.debt > 0) {
      const d = Math.min(c.debt, idle);
      c.debt -= d;
      L(c, `待機中の${idle}人がリファクタリング（負債−${d}）`);
    }

    // 15. 特許使用料
    for (const t of c.trolls) {
      const to = companyOf(g, t.from);
      c.cash -= TROLL.pay;
      if (to) { to.cash += TROLL.pay; ledgers[to.id].lines.push({ text: `特許使用料 +${TROLL.pay}`, tone: 'good' }); }
      t.left--;
      L(c, `特許使用料 −${TROLL.pay}`, 'bad');
    }
    c.trolls = c.trolls.filter(t => t.left > 0);

    // 16. 給料
    let salary = round10(payroll(g, c).reduce((t, e) => t + e.salary, 0) * salaryMult(c));
    if (h === 'H9') salary = Math.round(salary * REMOTE_SALARY);
    c.cash -= salary;
    L(c, `給料 −${salary}${h === 'H9' ? '（リモートで×0.7）' : ''}`);

    // 17. 本番障害
    if (c.debt >= INCIDENT.debt) {
      c.cash -= INCIDENT.loss;
      c.rep += INCIDENT.rep;
      L(c, `本番障害が発生！ −${INCIDENT.loss}・評判${INCIDENT.rep}`, 'bad');
      headlines.push(`${c.name}で大規模障害`);
    }
    // 18. 利息
    if (c.cash < 0) {
      const it = Math.ceil(-c.cash * INTEREST);
      c.cash -= it;
      L(c, `借入の利息 −${it}`, 'bad');
    }
    // 19. 社員イベント
    if (c.engineers.length && chance(g, EMPLOYEE_EVENT.chance)) {
      const ev = pick(g, ['awaken', 'burnout', 'leader'] as const);
      if (ev === 'awaken') {
        const e = pick(g, c.engineers);
        const ks = SKILLS.filter(k => e.skills[k]);
        if (ks.length) {
          const k = pick(g, ks);
          e.skills[k] = (e.skills[k] || 0) + EMPLOYEE_EVENT.awaken;
          L(c, `💰 ${e.name} が覚醒！ ${SKILL_NAME[k]}+${EMPLOYEE_EVENT.awaken}`, 'gold');
          ledgers[c.id].jackpot = true;
        }
      } else if (ev === 'burnout') {
        const list = c.engineers.filter(e => e.assign);
        if (list.length) { const e = pick(g, list); e.restQ = q + 1; L(c, `${e.name} が燃え尽きて来期お休み…`, 'bad'); }
      } else {
        const list = c.projects.filter(p => p.work - p.progress >= 2);
        if (list.length) { const p = pick(g, list); p.progress++; L(c, `リーダー誕生！「${p.name}」の進捗+1`, 'good'); }
      }
    }
    c.stats.maxDebt = Math.max(c.stats.maxDebt, c.debt);
  }

  // ===== 全社の処理が終わったあと =====
  // 1. レンタル返却
  const returnLines: RevealLine[] = [];
  for (const c of g.companies) {
    for (const e of [...c.engineers]) {
      if (!e.loan || e.loan.until > q) continue;
      const lender = companyOf(g, e.loan.from);
      c.engineers = c.engineers.filter(x => x !== e);
      const wasSpy = !!e.spy;
      delete e.loan; delete e.via; delete e.spy; delete e.checked;
      e.assign = null;
      if (lender) {
        lender.engineers.push(e);
        returnLines.push({ text: `${e.name} が ${c.name} から ${lender.name} へ戻った` });
        if (!wasSpy) {
          lender.honestLoans++;
          if (lender.honestLoans >= RENTAL.honestForRep && !lender.honestAwarded) {
            lender.honestAwarded = true;
            lender.rep++;
            returnLines.push({ text: `${lender.name}は「正直な貸し出し」${RENTAL.honestForRep}回で評判+1`, tone: 'good' });
          }
        }
      }
    }
  }

  // 発表ブロック（会社ごと）
  const blocks: RevealBlock[] = [];
  g.companies.forEach(c => {
    const profit = c.cash - c.quarterStartCash;
    c.yearProfit += profit;
    const lg = ledgers[c.id];
    if (!lg.lines.length) lg.lines.push({ text: '特に動きなし', tone: 'muted' });
    lg.lines.push({ text: `現金 ${yen(c.cash)}・評判${c.rep}・負債${c.debt}`, tone: 'muted' });
    blocks.push({
      kind: 'company', icon: '🏢', title: c.name, owner: c.id, sub: '今期の決算', lines: lg.lines,
      stamp: { type: profit >= 500 ? 'money' : profit < 0 ? 'loss' : 'info', text: signedYen(profit), tone: profit < 0 ? 'bad' : 'good' },
    });
  });
  spyBlocks.forEach(b => blocks.push(b));
  if (returnLines.length) blocks.push({ kind: 'return', icon: '🔙', title: 'レンタル終了', lines: returnLines, stamp: { type: 'info', text: '返却', tone: 'muted' } });
  if (offerLines.length) blocks.push({ kind: 'offer', icon: '📣', title: '新しいレンタル募集', sub: '次の入札で申し込めます', lines: offerLines, stamp: { type: 'info', text: '募集中', tone: 'blue' } });

  // 3. 季節イベント
  if (season(q) === 1) {
    const score = (c: Company) => Math.max(0, ...c.engineers.filter(e => working(g, e)).map(e => Math.max(0, ...SKILLS.map(k => e.skills[k] || 0))));
    const best = Math.max(...g.companies.map(score));
    const winners = g.companies.filter(c => score(c) === best && best > 0);
    winners.forEach(c => { c.cash += HACKATHON.prize; c.rep += HACKATHON.rep; c.yearProfit += HACKATHON.prize; });
    blocks.push({
      kind: 'season', icon: '🏆', title: '夏のハッカソン',
      lines: [...g.companies.map(c => ({ text: `${c.name}：最高スキル ${score(c)}` })), { text: winners.length ? `優勝 ${winners.map(c => c.name).join('・')}：+${HACKATHON.prize}・評判+${HACKATHON.rep}` : '優勝なし', tone: 'gold' as const }],
      stamp: { type: 'trophy', text: winners.length ? `${winners.map(c => c.name).join('・')} 優勝` : '優勝なし', tone: 'gold' },
    });
  }
  if (season(q) === 3 && (g.funds || []).length) {
    const lines: RevealLine[] = [];
    for (const f of g.funds!) {
      f.mult = weighted(g, FUNDS[f.kind].outcomes, o => o[1])[0];
      lines.push({ text: `${FUNDS[f.kind].icon} ${f.name}（${FUNDS[f.kind].label}）… ×${f.mult}`, tone: f.mult >= 1.5 ? 'gold' : f.mult >= 1 ? 'good' : 'bad' });
    }
    let best = { c: '', gain: 0 };
    g.companies.forEach(c => {
      if (!c.invest?.length) return;
      let total = 0, paid = 0;
      for (const h of c.invest) {
        const f = g.funds!.find(x => x.id === h.fund);
        const back = round10(h.amount * (f?.mult ?? 1));
        total += back; paid += h.amount;
      }
      c.cash += total;
      c.yearProfit += total;
      const gain = total - paid;
      if (gain > best.gain) best = { c: c.name, gain };
      lines.push({ text: `${c.name}：投資${paid.toLocaleString()} → ${total.toLocaleString()}（${signedYen(gain)}）`, tone: gain >= 0 ? 'good' : 'bad' });
      c.invest = [];
    });
    if (best.c && best.gain >= 1000) headlines.push(`${best.c}、投資で${yen(best.gain)}の大もうけ`);
    const jackpot = g.funds!.some(f => (f.mult ?? 1) >= 3);
    blocks.push({ kind: 'season', icon: '💹', title: '今年の投資の結果', lines, stamp: jackpot ? { type: 'money', text: '大化け！', tone: 'gold' } : { type: 'info', text: '投資の結果', tone: 'blue' } });
  }
  if (season(q) === 3) {
    const lines: RevealLine[] = [];
    g.companies.forEach(c => {
      const v = c.debt * AUDIT.perDebt;
      if (v) { c.cash -= v; c.yearProfit -= v; lines.push({ text: `${c.name}：監査で負債${c.debt}×${AUDIT.perDebt} = −${v}`, tone: 'bad' }); }
      else lines.push({ text: `${c.name}：監査は問題なし`, tone: 'good' });
    });
    const best = Math.max(...g.companies.map(c => c.yearProfit));
    const winners = g.companies.filter(c => c.yearProfit === best);
    winners.forEach(c => { c.rep += AUDIT.rep; });
    g.companies.forEach(c => lines.push({ text: `${c.name} の年間利益 ${signedYen(c.yearProfit)}` }));
    lines.push({ text: `年間表彰：${winners.map(c => c.name).join('・')}（評判+${AUDIT.rep}）`, tone: 'gold' });
    blocks.push({ kind: 'season', icon: '🎍', title: `${Math.floor(q / 4) + 1}年目の冬の決算`, lines, stamp: { type: 'trophy', text: `年間MVP ${winners.map(c => c.name).join('・')}`, tone: 'gold' } });
    g.companies.forEach(c => { c.yearProfit = 0; });
  }

  g.companies.forEach(c => { c.history.push(c.cash); });
  // 古い効果を掃除
  g.companies.forEach(c => {
    (Object.keys(c.effects) as (keyof Company['effects'])[]).forEach(k => { if ((c.effects[k] ?? -1) < q + 1) delete c.effects[k]; });
  });

  g.reveal = { kind: 'dev', q, title: `${quarterLabel(q)} 決算発表`, blocks, headlines };
  g.revealSeq++;
  log(g, `${quarterLabel(q)} の決算：` + g.companies.map(c => `${c.name} ${yen(c.cash)}`).join(' / '));

  if (q >= totalQ(g) - 1) finalize(g);
  else startQuarter(g);
}

/** 支払いから取り分・持ち出しを引いて入金する。実際の入金額を返す */
function payout(g: Game, c: Company, p: ActiveProject, team: Engineer[], gross: number, ledgers: Record<string, Ledger>) {
  gross = round10(gross * payFactor(c, p.type));   // 業種による受け取り倍率
  let net = gross;
  for (const e of team) {
    if (e.loan) {
      const lender = companyOf(g, e.loan.from);
      const v = round10(gross * e.loan.share / 100);
      if (lender && v) {
        net -= v; lender.cash += v;
        ledgers[c.id].lines.push({ text: `レンタル取り分（${e.name}）−${v}`, tone: 'muted' });
        ledgers[lender.id].lines.push({ text: `レンタル取り分 +${v}`, tone: 'good' });
      }
    }
    if (e.spy && e.spy.order === 'steal' && e.spy.for !== c.id && working(g, e)) {
      const emp = companyOf(g, e.spy.for);
      const v = round10(gross * SPY_STEAL);
      if (emp && v) {
        net -= v; emp.cash += v;
        ledgers[emp.id].lines.push({ text: `雑収入 +${v}`, tone: 'good' });     // 理由は表示しない
      }
    }
  }
  c.cash += net;
  return net;
}

function completeProject(g: Game, c: Company, p: ActiveProject, team: Engineer[], ledgers: Record<string, Ledger>, headlines: string[]) {
  const lg = ledgers[c.id];
  const late = Math.max(0, g.q - p.deadline);
  if (p.pay === 'lump') {
    let v = p.price * p.fx * Math.max(0, 1 - LATE_PENALTY * late);
    const notes: string[] = [];
    if (p.fx !== 1) notes.push(`為替×${p.fx}`);
    if (late) notes.push(`${late}期遅れ×${(1 - LATE_PENALTY * late).toFixed(1)}`);
    if (p.tags.includes('haggle')) { v *= TAGS.haggle.mult!; notes.push('値切り×0.8'); }
    if (p.type === 'design') {
      const de = sumSkills(g, c, team, true).DE || 0;
      if (de >= (p.reqs.DE || 0) + DESIGN_BONUS.extra) { v *= DESIGN_BONUS.mult; notes.push('デザイン満足×1.3'); }
    }
    if (p.type === 'secret') {
      let m = pick(g, SECRET_MULTS);
      if (c.industry && INDUSTRIES[c.industry].secretUp) m = SECRET_MULTS[Math.min(SECRET_MULTS.length - 1, SECRET_MULTS.indexOf(m) + 1)];
      g.secretMult[p.id] = m;
      v *= m;
      notes.push(`極秘倍率×${m}`);
      if (m >= 2) { lg.jackpot = true; headlines.push(`${c.name}、極秘案件で大当たり（×${m}）`); }
    }
    if (p.paid) notes.push(`中間金${p.paid}を除く`);
    const gross = Math.max(0, round10(v) - (p.paid || 0));
    const net = payout(g, c, p, team, gross, ledgers);
    lg.lines.push({ text: `💰「${p.name}」完了！ +${net}${notes.length ? `（${notes.join('・')}）` : ''}`, tone: 'gold' });
    lg.jackpot = true;
  } else {
    lg.lines.push({ text: `「${p.name}」の保守契約が満了`, tone: 'good' });
  }
  if (p.tags.includes('repeat')) { c.cash += REPEAT_BONUS; lg.lines.push({ text: `リピート受注ボーナス +${REPEAT_BONUS}`, tone: 'good' }); }
  if (p.tags.includes('record')) { c.rep++; lg.lines.push({ text: '実績になって評判+1', tone: 'good' }); }
  if (p.type === 'startup' && chance(g, STOCK_CHANCE)) { c.stocks.push(g.q); lg.lines.push({ text: '📈 報酬として株をもらった！', tone: 'gold' }); }
  if (p.type === 'ai') { c.aiKnowhow++; lg.lines.push({ text: `AIノウハウ+1（計${c.aiKnowhow}）`, tone: 'good' }); }
  c.completed++;
  c.projects = c.projects.filter(x => x !== p);
  c.engineers.forEach(e => { if (e.assign === p.id) e.assign = null; });
  log(g, `${c.name}：「${p.name}」完了`);
}

function accuse(g: Game, c: Company, e: Engineer): RevealBlock {
  const lines: RevealLine[] = [{ text: `${c.name} が ${e.name}（${e.via === 'rent' ? 'レンタル' : '引き抜き'}）をスパイとして告発！` }];
  const isSpy = !!e.spy && e.spy.for !== c.id;
  let stamp: RevealBlock['stamp'];
  if (isSpy) {
    const emp = companyOf(g, e.spy!.for)!;
    emp.stats.caught++;
    if (e.via === 'rent') {
      delete e.loan; delete e.spy; delete e.via; delete e.checked;
      emp.cash -= ACCUSE.rentFine;
      emp.rep += ACCUSE.employerRep;
      lines.push({ text: `本物のスパイだった！ ${e.name} は ${c.name} の正社員に。${emp.name}は罰金${ACCUSE.rentFine}・評判${ACCUSE.employerRep}`, tone: 'bad' });
    } else {
      c.engineers = c.engineers.filter(x => x !== e);
      emp.rep += ACCUSE.employerRep;
      lines.push({ text: `本物のスパイだった！ ${e.name} は即解雇。送り込んだ ${emp.name} は評判${ACCUSE.employerRep}`, tone: 'bad' });
    }
    stamp = { type: 'spy', text: `スパイ発覚！ 黒幕は${emp.name}`, tone: 'bad' };
    log(g, `スパイ発覚：${e.name}（黒幕 ${emp.name}）`);
  } else {
    c.rep += ACCUSE.wrongRep;
    lines.push({ text: `シロだった…${c.name}は評判${ACCUSE.wrongRep}`, tone: 'muted' });
    if (e.via === 'rent' && e.loan) {
      const lender = companyOf(g, e.loan.from);
      c.engineers = c.engineers.filter(x => x !== e);
      delete e.loan; delete e.via; delete e.checked;
      e.assign = null;
      if (lender) { lender.engineers.push(e); lines.push({ text: `${e.name} は気を悪くして ${lender.name} へ帰った` }); }
    }
    stamp = { type: 'spy', text: '冤罪…', tone: 'muted' };
    log(g, `${c.name} の告発は空振り（${e.name}）`);
  }
  return { kind: 'spy', icon: '🕵️', title: 'スパイ告発', lines, stamp };
}

// ---------------------------------------------------------------------
//  最終決算
// ---------------------------------------------------------------------
export function finalize(g: Game) {
  const rows: FinalRow[] = g.companies.map(c => {
    const stocks = c.stocks.map(() => pick(g, STOCK_VALUES));
    const stockTotal = stocks.reduce((t, v) => t + v, 0);
    const service = (c.service?.level || 0) * SERVICE.valuePerLv;
    const total = c.cash + service + stockTotal;
    return { id: c.id, name: c.name, cash: c.cash, service, stocks, stockTotal, total, profit: total - GAME.startCash, rank: 0, awards: [] };
  });
  rows.forEach(r => { r.rank = 1 + rows.filter(o => o.profit > r.profit).length; });
  // 表彰（追加要素）
  const award = (label: string, val: (c: Company) => number, min = 1) => {
    const best = Math.max(...g.companies.map(val));
    if (best < min) return;
    g.companies.filter(c => val(c) === best).forEach(c => rows.find(r => r.id === c.id)!.awards.push(label));
  };
  award('🗡️ 妨害王', c => c.stats.attacks);
  award('🛡️ 鉄壁の守り', c => c.stats.blocks);
  award('🏗️ 受注王', c => c.stats.wins);
  award('✅ 完遂の鬼', c => c.completed);
  award('💎 最高額案件', c => c.stats.biggestDeal);
  award('🕵️ スパイマスター', c => c.stats.spies);
  award('🔥 ブラック企業', c => c.stats.maxDebt, 4);
  award('🏃 突貫工事マニア', c => c.stats.rushes, 2);
  award('🤝 人材コレクター', c => c.stats.hires, 2);
  rows.sort((a, b) => a.rank - b.rank);
  g.final = rows;
  g.phase = 'end';
  const blocks: RevealBlock[] = [...rows].reverse().map(r => ({
    kind: 'final', icon: r.rank === 1 ? '🔔' : '🏢', title: r.name, owner: r.id,
    lines: r.awards.length ? [{ text: r.awards.join('　') }] : [],
    flips: [
      { label: '現金', value: yen(r.cash) },
      { label: `自社サービス`, value: yen(r.service) },
      { label: `株（${r.stocks.length}株）`, value: r.stocks.length ? `${r.stocks.map(v => v.toLocaleString()).join('+')} = ${yen(r.stockTotal)}` : '0万円' },
      { label: `${totalYears(g)}年間の利益`, value: signedYen(r.profit), win: r.rank === 1 },
    ],
    stamp: r.rank === 1 ? { type: 'ipo', text: '上場決定！', tone: 'gold' } : { type: 'rank', text: `${r.rank}位`, tone: 'muted' },
  }));
  // 最終期の決算発表も一緒に見せる
  const last = g.reveal && g.reveal.kind === 'dev' && g.reveal.q === g.q ? g.reveal : null;
  const lastBlocks: RevealBlock[] = last ? [...last.blocks, { kind: 'info', icon: '🔔', title: `そして、${totalYears(g)}年間の総決算へ…`, lines: [{ text: '現金・サービス価値・株を合計して利益を計算します', tone: 'muted' }], stamp: { type: 'info', text: '最終決算', tone: 'gold' } }] : [];
  g.reveal = { kind: 'final', q: g.q, title: last ? `${quarterLabel(g.q)} 決算 ＆ 最終決算` : '最終決算', blocks: [...lastBlocks, ...blocks], headlines: [`【速報】${rows.filter(r => r.rank === 1).map(r => r.name).join('・')}、東証グロース市場に上場へ`, ...(last?.headlines || [])] };
  g.revealSeq++;
  log(g, `最終決算：${rows.map(r => `${r.rank}位 ${r.name}（${signedYen(r.profit)}）`).join(' / ')}`);
}

