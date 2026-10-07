// ===== 型定義 =====
export type Skill = 'FE' | 'BE' | 'IN' | 'DE' | 'SE' | 'AI';
export type SpyOrder = 'intel' | 'sabo' | 'steal';
export type ProjectType = 'speed' | 'big' | 'maint' | 'startup' | 'gov' | 'fire' | 'overseas' | 'ai' | 'design' | 'secret';
export type Tag = 'rush' | 'rich' | 'repeat' | 'muri' | 'legacy' | 'record' | 'haggle';
export type CardKey = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'S1' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9';
export type HappeningKey = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12' | 'H13' | 'H14' | 'H15' | 'H16' | 'H17' | 'H18';
export type IndustryKey = 'sier' | 'web' | 'saas' | 'ai' | 'maint' | 'consul';
export type TraitKey = 'multi' | 'fast' | 'fire' | 'night' | 'refactor' | 'leader' | 'mentor' | 'mood' | 'sales' | 'cheap' | 'investor' | 'genius' | 'hopper' | 'tough' | 'study' | 'gambler';
export type ItemKind = 'desk' | 'rest' | 'meet' | 'bigmeet' | 'lab' | 'server' | 'refresh' | 'sec';
/** オフィスに置いたもの（x,y は左上のマス、rot は 90度回転の回数） */
export interface Placed { id: string; kind: ItemKind; x: number; y: number; rot: number }
export interface Office {
  w: number; h: number; items: Placed[];
  seats: Record<string, string>;   // デスクのID → 座っている社員のID
  spent: number; nextId: number; expansions: number;
  tiles?: unknown;                 // 古い形式（1マス1部屋）の名残。読み込み時に作り直す
}
export interface OfficePlan {
  expand?: 'row' | 'col';                                   // 床を1行／1列広げる
  remove: string[];                                         // 撤去（改装費）
  move: { id: string; x: number; y: number; rot: number }[]; // 移動・回転（改装費）
  place: { kind: ItemKind; x: number; y: number; rot: number }[];   // 新しく置く（購入）
  seats?: Record<string, string>;                           // 席替え（無料）
}
export type FundKind = 'bond' | 'index' | 'growth' | 'estate' | 'crypto' | 'angel';
export interface Fund { id: string; kind: FundKind; name: string; mult?: number }   // mult は冬に決まる
export interface Holding { fund: string; amount: number }
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
  trainedQ?: number;   // 最後に研修に行った期
  trait?: TraitKey;    // 特技（1人1つまで）
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

export interface Effects { slack?: number; review?: number; noBid?: number; noHire?: number; dump?: number; boost?: number; speed?: number; buzz?: number }

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
  skillUsed?: boolean;             // 業種の必殺技を使ったか（1ゲーム1回）
  invest?: Holding[];              // 今年の投資（冬の決算で結果が出る。本人だけに見える）
  office?: Office;                 // 自社オフィス（作業マスの数＝社員の上限）
  adRep?: number;                  // 広告で上乗せしている評判（冬の決算で消える）
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
  ad?: number;   // 広告（ADS の番号。1期1回）
  special?: { project?: string; target?: string };   // 業種の必殺技（入札フェーズで使うもの）
}

export interface PickSubmit { industry: IndustryKey }

export interface DevSubmit {
  assign: Record<string, string | 'svc' | '' | 'fire' | 'train'>;
  train?: Record<string, Skill>;   // 研修に行かせる社員 → 伸ばすスキル
  invest?: Record<string, number>; // 投資先 → 金額
  office?: OfficePlan;             // オフィスの増床・配置・席替え
  special?: boolean;               // 業種の必殺技（開発フェーズで使うもの）
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
  funds?: Fund[];                          // 今年の投資先の候補
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
  id: string; name: string; cash: number; service: number; stocks: number[]; stockTotal: number; office?: number; total: number; profit: number; rank: number;
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
