// ===== 型定義 =====
export type Skill = 'FE' | 'BE' | 'IN' | 'DE' | 'SE' | 'AI';
export type SpyOrder = 'intel' | 'sabo' | 'steal';
export type ProjectType = 'speed' | 'big' | 'maint' | 'startup' | 'gov' | 'fire' | 'overseas' | 'ai' | 'design' | 'secret';
export type Tag = 'rush' | 'rich' | 'repeat' | 'muri' | 'legacy' | 'record' | 'haggle';
export type CardKey = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'S1' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9';
export type HappeningKey = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12' | 'H13' | 'H14' | 'H15' | 'H16' | 'H17' | 'H18';
export type IndustryKey = 'sier' | 'web' | 'saas' | 'ai' | 'maint' | 'consul';
export type Skills = Partial<Record<Skill, number>>;

export interface Engineer {
  id: string; name: string; skills: Skills; salary: number;
  rookie?: boolean; legend?: boolean;
  assign: string | 'svc' | null; restQ: number;
  via?: 'rent' | 'hh';
  loan?: { from: string; until: number; share: number };
  spy?: { for: string; order: SpyOrder | null; src: 'rent' | 'hh' };
  checked?: 'spy' | 'clean';
  xp?: Skills;   // 経験値（スキルごと）
}

export interface Project {
  id: string; type: ProjectType; name: string; duration: number; budget: number;
  reqs: Skills; tags: Tag[]; pay: 'lump' | 'turn';
}

export interface ActiveProject extends Project {
  price: number; progress: number; work: number;
  start: number; deadline: number; rush: boolean; fx: number;
  paid?: number;   // 受け取り済みの中間金
}

export interface RentalOffer { id: string; from: string; engineerId: string; period: 1 | 2 | 3; share: 10 | 20 | 30; spy: SpyOrder | '' }

export interface Effects { slack?: number; review?: number; noBid?: number; noHire?: number; dump?: number }

export interface Company {
  id: string; name: string; cash: number; rep: number; debt: number;
  engineers: Engineer[]; projects: ActiveProject[];
  service: { level: number } | null;
  hand: CardKey[]; stocks: number[]; aiKnowhow: number;
  effects: Effects;
  trolls: { from: string; left: number }[];
  hitsThisQuarter: number; yearProfit: number; completed: number;
  sleeper: { engineerId: string; order: SpyOrder } | null;
  spyOrdersLeft: number; honestLoans: number; honestAwarded: boolean;
  industry?: IndustryKey;          // 選んだ業種
  choices?: IndustryKey[];         // 配られた業種の候補（本人だけに見える）
  secretNotes: string[];
  quarterStartCash: number;
  history: number[];            // 各期末の現金（グラフ用）
  stats: CompanyStats;          // 表彰用の集計
}

export interface CompanyStats {
  attacks: number; hitsTaken: number; blocks: number; wins: number; spies: number; caught: number;
  rushes: number; maxDebt: number; hires: number; fired: number; biggestDeal: number;
}

export type BidPct = 50 | 60 | 70 | 80 | 90 | 100;
export type HireFee = 0 | 50 | 100 | 200 | 400;

export interface BidSubmit {
  bids: Record<string, BidPct>;
  hires: Record<string, HireFee>;
  card?: CardKey; target?: string;
  rent?: string;
  spyOrders: Record<string, SpyOrder>;
}

export interface PickSubmit { industry: IndustryKey }

export interface DevSubmit {
  assign: Record<string, string | 'svc' | '' | 'fire'>;
  rush: string[];
  drop?: string[];   // 放棄する案件
  launch: boolean;
  offer?: { engineerId: string; period: number; share: number; spy: SpyOrder | '' };
  sleeper: string | '';
  sleeperOrder: SpyOrder;
  investigate?: string;
  accuse?: string;
  spyOrders: Record<string, SpyOrder>;
}

export interface Game {
  id: string; q: number; phase: 'pick' | 'bid' | 'dev' | 'end';
  quarters?: number;   // 全体の期数（12=3年モード、8=2年モード）。古いデータでは無い
  seed: number;
  happenings: HappeningKey[];
  market: Project[]; pool: Engineer[];
  offers: RentalOffer[];
  cardDeck: CardKey[]; cardDiscard: CardKey[];
  companies: Company[]; log: string[];
  bidSubs: Record<string, BidSubmit>;
  devSubs: Record<string, DevSubmit>;
  pickSubs?: Record<string, PickSubmit>;   // 業種選び
  secretMult: Record<string, number>;   // 極秘案件の倍率（完了時に決まる）
  hackSkill?: string;
  reveal: Reveal | null;                // 直前の解決結果の発表
  revealSeq: number;
  final: FinalRow[] | null;
  nextId: number;
}

// ---------- 発表データ ----------
export type Stamp = 'hit' | 'block' | 'reflect' | 'win' | 'close' | 'none' | 'hire' | 'money' | 'loss' | 'spy' | 'trophy' | 'rank' | 'ipo' | 'info';
export interface RevealLine { text: string; tone?: 'good' | 'bad' | 'gold' | 'muted'; card?: string; big?: boolean }
export interface RevealBlock {
  kind: 'card' | 'sympathy' | 'rental' | 'project' | 'hire' | 'company' | 'spy' | 'return' | 'offer' | 'season' | 'final' | 'info';
  title: string; sub?: string; icon?: string;
  lines: RevealLine[];
  flips?: { label: string; value: string; win?: boolean }[];   // 裏向きカードを順にめくる
  stamp: { type: Stamp; text: string; tone?: 'good' | 'bad' | 'gold' | 'blue' | 'muted' };
  owner?: string;             // 会社ブロックの会社ID
}
export interface Reveal { kind: 'pick' | 'bid' | 'dev' | 'final'; q: number; title: string; blocks: RevealBlock[]; headlines: string[] }

export interface FinalRow {
  id: string; name: string; cash: number; service: number; stocks: number[]; stockTotal: number; total: number; profit: number; rank: number;
  awards: string[];
}

// 画面に渡すビュー（本人に見せてよい情報だけ）
export interface View {
  me: string;                       // 見ている会社ID（観戦なら ''）
  game: Game;                       // 秘密を取り除いたゲーム状態
  submitted: Record<string, boolean>;
  mySubmit: BidSubmit | DevSubmit | PickSubmit | null;
  intel: Record<string, { hand: CardKey[]; bid: BidSubmit | null }>;  // 情報収集スパイで見える内容
}
