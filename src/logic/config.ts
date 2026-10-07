// =====================================================================
//  3年で上場 ― 数値設定（バランス調整はこのファイルだけで行う）
//  金額の単位はすべて「万円」、期間の単位は「期」（四半期）
// =====================================================================
import type { CardKey, FundKind, IndustryKey, ItemKind, TraitKey, HappeningKey, ProjectType, Skill, SpyOrder, Tag } from './types';

export const SKILLS: Skill[] = ['FE', 'BE', 'IN', 'DE', 'SE', 'AI'];
export const SKILL_NAME: Record<Skill, string> = { FE: 'フロント', BE: 'バック', IN: 'インフラ', DE: 'デザイン', SE: 'セキュリティ', AI: 'AI' };
export const SKILL_ICON: Record<Skill, string> = { FE: '🖥️', BE: '⚙️', IN: '🌐', DE: '🎨', SE: '🔒', AI: '🤖' };
export const SEASONS = ['春', '夏', '秋', '冬'];

export const GAME = {
  quarters: 12,                  // 標準（3年モード）
  modes: [12, 8] as const,        // 選べる長さ：3年（12期）・2年（8期）
  minPlayers: 2,
  maxPlayers: 4,
  startCash: 2000,
  startEngineers: [
    { skills: { BE: 3, IN: 1 }, salary: 60 },
    { skills: { FE: 3, DE: 1 }, salary: 60 },
    { skills: { SE: 2, AI: 2 }, salary: 60 },
  ] as { skills: Partial<Record<Skill, number>>; salary: number }[],
  startHand: 3,
  handMax: 6,
  spyOrders: 2,
};

// ---------- 入札・採用 ----------
export const BID_PCTS = [100, 90, 80, 70, 60, 50] as const;
export const HIRE_FEES = [0, 50, 100, 200, 400] as const;
export const REP_DISCOUNT = 0.03;      // 比較値 = 入札額 ×(1 − 0.03×評判)
export const DUMP_RATE = 0.8;          // 安値ダンピング
export const CLOSE_RACE = 0.05;        // 「僅差の勝負！」と出す差

// ---------- 案件 ----------
export interface ProjectSpec {
  name: string; desc: string; weight: number; dur: [number, number]; rpq: number; req: [number, number];
  cand: Skill[]; must?: Skill; pay: 'lump' | 'turn'; icon: string;
}
export const PROJECT_TYPES: Record<ProjectType, ProjectSpec> = {
  speed: { name: 'スピード案件', icon: '⚡', desc: '短期で終わる小さめの開発', weight: 3, dur: [1, 2], rpq: 190, req: [3, 4], cand: ['FE', 'BE', 'DE'], pay: 'lump' },
  big: { name: '大型システム', icon: '🏢', desc: '長期・大人数の基幹システム', weight: 2, dur: [4, 6], rpq: 330, req: [7, 9], cand: ['BE', 'IN', 'FE', 'SE'], pay: 'lump' },
  maint: { name: '保守運用', icon: '🔧', desc: '毎期少しずつ支払われる安定収入', weight: 2, dur: [4, 4], rpq: 140, req: [2, 2], cand: ['IN', 'BE'], pay: 'turn' },
  startup: { name: 'スタートアップ', icon: '🚀', desc: '完了すると50%で株がもらえる', weight: 2, dur: [2, 3], rpq: 130, req: [3, 5], cand: ['FE', 'BE', 'DE', 'AI'], pay: 'lump' },
  gov: { name: '官公庁', icon: '🏛️', desc: 'セキュリティ必須のお堅い案件', weight: 1, dur: [3, 5], rpq: 300, req: [5, 7], cand: ['BE', 'IN'], must: 'SE', pay: 'lump' },
  fire: { name: '炎上火消し', icon: '🔥', desc: '高単価だが落札で負債+3', weight: 1, dur: [1, 1], rpq: 560, req: [5, 6], cand: ['BE', 'IN', 'FE'], pay: 'lump' },
  overseas: { name: '海外案件', icon: '🌏', desc: '為替の急変動で報酬が2倍か半分に', weight: 2, dur: [2, 4], rpq: 270, req: [4, 6], cand: ['FE', 'BE', 'IN', 'AI'], pay: 'lump' },
  ai: { name: 'AI案件', icon: '🧠', desc: 'AI必須。完了でAIノウハウ+1', weight: 2, dur: [2, 4], rpq: 310, req: [4, 6], cand: ['BE', 'IN'], must: 'AI', pay: 'lump' },
  design: { name: 'デザイン重視', icon: '✨', desc: 'デザインを必要量+2以上で報酬×1.3', weight: 2, dur: [2, 3], rpq: 230, req: [4, 5], cand: ['FE'], must: 'DE', pay: 'lump' },
  secret: { name: '極秘案件', icon: '🕶️', desc: '予算は非公開。完了時に×0.5〜×3', weight: 1, dur: [2, 3], rpq: 260, req: [4, 6], cand: ['FE', 'BE', 'IN', 'DE', 'SE', 'AI'], pay: 'lump' },
};
export const BUDGET = { rate: 1.5, longBonus: 0.08 };   // 予算 = rpq×1.5×期間×(1+0.08×(期間−1))×タグ倍率
export const MUST_SHARE = 0.45;                         // 必須スキルの割合
export const TAG_CHANCE = 0.5;
export const TAGS: Record<Tag, { name: string; desc: string; mult?: number }> = {
  rush: { name: '急募', desc: '予算×1.3', mult: 1.3 },
  rich: { name: '予算潤沢', desc: '予算×1.5', mult: 1.5 },
  repeat: { name: 'リピートあり', desc: '完了時に+100' },
  muri: { name: '無茶な要件', desc: '進むたび負債+1' },
  legacy: { name: 'レガシー環境', desc: 'インフラ+1が追加で必要' },
  record: { name: '実績になる', desc: '完了で評判+1' },
  haggle: { name: '値切り屋', desc: '完了時の報酬×0.8', mult: 0.8 },
};
export const BIG_GOV = { minDur: 4, rpq: 300, mult: 1.4 };  // 秋の官公庁大型公募
export const DESIGN_BONUS = { extra: 2, mult: 1.3 };
export const SECRET_MULTS = [0.5, 1, 1.5, 2, 3];
export const LATE_PENALTY = 0.1;
// 経験値：進んだ案件を担当すると、その案件に必要なスキル（持っているもの）に経験+1。
//        「今のレベル+1」たまるとスキル+1・給料+raise（最大 maxSkill）
export const GROWTH = { maxSkill: 5, raise: 5 };
export const xpNeed = (lv: number) => lv + 1;
// 研修：開発フェーズで空いている社員を研修へ。選んだスキルが+1（持っていなければ1で習得）、給料+raise、restChance の確率で来期は休み
export const TRAINING = { fee: 0, raise: 5, restChance: 0.3 };
export const ABANDON = { penalty: 0.2, rep: -1 };   // 案件の途中放棄：違約金＝受注額×0.2、評判−1（受け取り済みの中間金は返さない）
export const INTERIM = 0.5;   // 一括払いの案件：進んだ期ごとに受注額×0.5÷期間 を中間金として先に受け取る（残りは完了時）
export const REPEAT_BONUS = 100;
export const STOCK_CHANCE = 0.5;
export const STOCK_VALUES = [0, 0, 300, 800, 2000];
export const RUSH_DEBT = 2;
export const FIRE_DEBT = 3;

// ---------- 社員 ----------
export const ENGINEER = {
  normalPerQuarter: 3,
  normalMain: [2, 4] as [number, number],
  subChance: 0.55,
  normalSub: [1, 2] as [number, number],
  salaryBase: 20, salaryPerSkill: 10,
  rookieSkill: [1, 2] as [number, number], rookieSalary: 25, rookieGrow: 1, rookieRaise: 10, springRookies: 2,
  legendSkills: [5, 4], legendSalary: 150,
  headhuntRaise: 1.5,
  hhSpyChance: 0.1,
};
export const LAST_NAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '松本', '井上', '木村', '林', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '岡田', '後藤', '長谷川', '村上'];
export const FIRST_NAMES = ['翔', '陽菜', '蓮', '結衣', '湊', '葵', '大和', '凛', '悠真', 'さくら', '樹', '美咲', '颯太', '莉子', '健', '彩', '拓海', '七海', '誠', '楓', '隼人', '舞', '亮', '千尋', '直樹', 'ひかり', '大輔', '愛', '和也', '真央'];

// ---------- 自社サービス ----------
export const SERVICE = { launchCost: 300, maxLv: 5, needBase: 3, income: [0, 60, 130, 220, 330, 460], valuePerLv: 300 };

// ---------- 開発フェーズ ----------
export const SEVERANCE_QUARTERS = 1;
export const INVESTIGATE_COST = 50;
export const REMOTE_SALARY = 0.7;
export const INCIDENT = { debt: 6, loss: 100, rep: -1 };
export const INTEREST = 0.1;
export const TROLL = { pay: 50, quarters: 3 };
export const EMPLOYEE_EVENT = { chance: 0.35, awaken: 2 };

// ---------- レンタルとスパイ ----------
export const RENTAL = { periods: [1, 2, 3] as const, shares: [10, 20, 30] as const, honestForRep: 3 };
export const SPY_STEAL = 0.2;
export const ACCUSE = { rentFine: 200, employerRep: -2, wrongRep: -1 };
export const SPY_ORDER_NAME: Record<SpyOrder, string> = { intel: '情報収集', sabo: 'サボタージュ', steal: '機密持ち出し' };
export const SPY_ORDER_DESC: Record<SpyOrder, string> = {
  intel: '潜入先の手札と、今期の提出済み入札が見える',
  sabo: '決算のとき、潜入先でのスキルが全部0になる',
  steal: '担当案件の支払いの20%をこっそり持ち出す',
};

// ---------- 季節イベント ----------
export const HACKATHON = { prize: 200, rep: 1 };
export const AUDIT = { perDebt: 30, rep: 1 };

// ---------- 作戦カード ----------
export interface CardSpec { name: string; count: number; kind: 'attack' | 'self' | 'defense'; desc: string; icon: string; blocks?: CardKey[] }
export const CARDS: Record<CardKey, CardSpec> = {
  A1: { name: 'ヘッドハンティング', count: 3, kind: 'attack', icon: '🎯', desc: '相手の一番優秀な社員（借りている社員以外）を自社へ。給料×1.5' },
  A2: { name: '退職代行を紹介', count: 2, kind: 'attack', icon: '📮', desc: '相手の社員1人（借りている社員以外）がランダムに退職' },
  A3: { name: '深夜のSlack爆撃', count: 3, kind: 'attack', icon: '💬', desc: '今期、相手の全社員の各スキル−1' },
  A4: { name: '悪い口コミ投稿', count: 2, kind: 'attack', icon: '👎', desc: '今期、相手のサービス収入が半分' },
  A5: { name: '情報漏洩の噂', count: 2, kind: 'attack', icon: '📰', desc: '今期、相手の入札はすべて無効' },
  A6: { name: '無茶振りクライアント紹介', count: 3, kind: 'attack', icon: '🤯', desc: '相手の進行中案件1つの必要進捗+1（納期はそのまま）' },
  A7: { name: '技術ブログで炎上', count: 3, kind: 'attack', icon: '🔥', desc: '相手の負債+2' },
  A8: { name: '採用広告の買い占め', count: 2, kind: 'attack', icon: '🪧', desc: '今期、相手は採用できない' },
  A9: { name: '特許トロール', count: 2, kind: 'attack', icon: '🧌', desc: 'サービスを持つ相手から3期にわたり毎期50' },
  S1: { name: '安値ダンピング', count: 3, kind: 'self', icon: '🏷️', desc: '自分に使う。今期の自分の入札額×0.8' },
  D1: { name: '福利厚生の充実', count: 2, kind: 'defense', icon: '🍱', desc: 'ヘッドハンティングを防ぐ', blocks: ['A1'] },
  D2: { name: '社内の飲み会文化', count: 2, kind: 'defense', icon: '🍻', desc: '退職代行・Slack爆撃を防ぐ', blocks: ['A2', 'A3'] },
  D3: { name: 'カウンターオファー', count: 1, kind: 'defense', icon: '🔁', desc: 'ヘッドハンティングを防ぎ、逆に相手のエースを奪う', blocks: ['A1'] },
  D4: { name: 'ホワイト企業認定', count: 1, kind: 'defense', icon: '🏳️', desc: 'ヘッドハンティング・退職代行・採用広告の買い占めを防ぐ', blocks: ['A1', 'A2', 'A8'] },
  D5: { name: '法務チーム', count: 2, kind: 'defense', icon: '⚖️', desc: '悪い口コミ・情報漏洩を防ぎ、相手に罰金100', blocks: ['A4', 'A5'] },
  D6: { name: '鉄壁のセキュリティ', count: 2, kind: 'defense', icon: '🛡️', desc: '情報漏洩・技術ブログ炎上を防ぐ', blocks: ['A5', 'A7'] },
  D7: { name: '強いPM', count: 2, kind: 'defense', icon: '📋', desc: '無茶振りクライアントを防ぐ', blocks: ['A6'] },
  D8: { name: '顧問弁護士', count: 1, kind: 'defense', icon: '👔', desc: '特許トロールを防ぎ、相手から200を受け取る', blocks: ['A9'] },
  D9: { name: 'ダミー情報', count: 2, kind: 'defense', icon: '🪞', desc: 'すべての妨害を相手に跳ね返す', blocks: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'] },
};
export const DEFENSE_ORDER: CardKey[] = ['D3', 'D1', 'D2', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
export const DEFENSE_FX = { D5fine: 100, D8take: 200 };

// ---------- ハプニング ----------
export const HAPPENINGS: Record<HappeningKey, { name: string; desc: string; icon: string; when: 'start' | 'dev' }> = {
  H1: { name: '大規模クラウド障害', icon: '☁️', when: 'dev', desc: 'インフラスキルを持つ出勤社員がいない会社は作業停止' },
  H2: { name: '新卒の大量入社', icon: '🌸', when: 'start', desc: '採用候補に新人2人が追加' },
  H3: { name: '為替の急変動', icon: '💱', when: 'start', desc: '進行中の海外案件の報酬が50%で2倍か半分に' },
  H4: { name: 'セキュリティ事故のニュース', icon: '🚨', when: 'start', desc: 'セキュリティが必要な案件の予算×1.3' },
  H5: { name: '景気後退', icon: '📉', when: 'start', desc: '今期の案件の予算×0.8' },
  H6: { name: 'バズるプログラミング言語', icon: '📈', when: 'start', desc: 'ランダムなスキル1種を持つ全社員のそのスキル+1・給料+10' },
  H7: { name: 'オフィスの賃料値上げ', icon: '🏢', when: 'start', desc: '社員数×10を支払う' },
  H8: { name: 'インフルエンザ流行', icon: '🤒', when: 'start', desc: '各社ランダムな社員1人が今期休み' },
  H9: { name: 'リモートワーク解禁', icon: '🏠', when: 'dev', desc: '今期の給料×0.7' },
  H10: { name: '大型連休', icon: '🎌', when: 'start', desc: '進行中の全案件の納期+1' },
  H11: { name: '人気技術書の出版', icon: '📘', when: 'start', desc: 'ランダムなスキル1種を持つ全社員のそのスキル+1' },
  H12: { name: '巨大IT企業の参入', icon: '🦖', when: 'start', desc: '今期の案件が1件少ない' },
  H13: { name: '補助金の公募', icon: '💴', when: 'start', desc: 'サービスLv1以上の会社に+200' },
  H14: { name: '伝説のエンジニアが独立', icon: '🧙', when: 'start', desc: '採用候補に伝説のエンジニアが1人追加' },
  H15: { name: '全社停電', icon: '🔌', when: 'dev', desc: '今期は全社の作業が停止' },
  H16: { name: 'バグ報奨金ブーム', icon: '🐛', when: 'start', desc: '負債4以上は負債×50を支払い、負債1以下は+100' },
  H17: { name: '業界カンファレンス', icon: '🎤', when: 'start', desc: '全社が作戦カードを1枚追加で引く' },
  H18: { name: '生成AIブーム', icon: '🤖', when: 'start', desc: 'AI案件の予算×1.5、AIスキル持ちのAI+1' },
};
export const HAPPENING_FX = { secNews: 1.3, recession: 0.8, aiBoom: 1.5, rentPerHead: 10, subsidy: 200, bounty: { high: 4, perDebt: 50, low: 1, reward: 100 } };

// ---------- 最終決算の表彰（追加要素） ----------
export const AWARDS = true;

// ---------- 業種（ゲーム開始時にランダムに2つ配られ、1つ選ぶ） ----------
export interface IndustrySpec {
  name: string; icon: string; plan: string; good: string[]; bad: string[];
  bidGood?: ProjectType[];       // 入札の比較値 ×INDUSTRY_BID.good
  bidBad?: ProjectType[];        // 入札の比較値 ×INDUSTRY_BID.bad
  noBid?: ProjectType[];         // 入札できない
  pay?: Partial<Record<ProjectType | 'all', number>>;   // 案件の受け取り倍率
  hireSkills?: Skill[];          // このスキルを持つ候補の採用で、契約金の比較に +INDUSTRY_HIRE_BONUS
  launchMult?: number; serviceMult?: number; salaryMult?: number;
  rushDebt?: number; secretUp?: boolean; spyBonus?: number; fewerStaff?: number; startRep?: number;
}
export const INDUSTRY_BID = { good: 0.9, bad: 1.1 };
export const INDUSTRY_HIRE_BONUS = 10;   // 契約金は50刻みなので、実質「同額なら勝つ」
export const INDUSTRIES: Record<IndustryKey, IndustrySpec> = {
  sier: {
    name: 'SIer（大手受託）', icon: '🏢', plan: '大きく長い案件を確実に取る',
    good: ['大型システム・官公庁の入札が比較で−10%', '大型システム・官公庁の受け取り×1.15'], bad: ['スピード案件・スタートアップの入札は比較で+10%'],
    bidGood: ['big', 'gov'], bidBad: ['speed', 'startup'], pay: { big: 1.15, gov: 1.15 },
  },
  web: {
    name: 'Web制作会社', icon: '⚡', plan: '短い案件を数多く回す',
    good: ['スピード案件・デザイン重視の受け取り×1.15'],
    bad: ['大型システム・官公庁の入札は比較で+10%'],
    bidBad: ['big', 'gov'], pay: { speed: 1.15, design: 1.15 },
  },
  saas: {
    name: 'SaaSスタートアップ', icon: '🚀', plan: 'サービスを育てて最終決算で勝つ',
    good: ['自社サービスの立ち上げ費が半額', 'サービス収入×1.2'], bad: ['受託案件の受け取り×0.9'],
    launchMult: 0.5, serviceMult: 1.2, pay: { all: 0.9 },
  },
  ai: {
    name: 'AIベンチャー', icon: '🧠', plan: '少数精鋭で高単価のAI案件を狙う',
    good: ['AI案件の入札が比較で−10%', 'AI案件の受け取り×1.3'], bad: ['給料の支払い×1.1（AI人材は高い）'],
    bidGood: ['ai'], pay: { ai: 1.3 }, salaryMult: 1.1,
  },
  maint: {
    name: '運用保守ベンダー', icon: '🔧', plan: '堅実な安定収入で逃げ切る',
    good: ['保守運用の入札が比較で−10%', '保守運用の受け取り×1.5', '突貫工事の負債が+2→+1'], bad: ['炎上火消し・海外案件には入札できない'],
    bidGood: ['maint'], pay: { maint: 1.5 }, rushDebt: 1, noBid: ['fire', 'overseas'],
  },
  consul: {
    name: 'コンサル', icon: '🕶️', plan: '情報戦と一発逆転',
    good: ['極秘案件の入札が比較で−10%', '極秘案件の倍率が1段階良くなる', 'スパイ指令が1回多い'], bad: ['保守運用には入札できない'],
    bidGood: ['secret'], secretUp: true, spyBonus: 1, noBid: ['maint'],
  },
};


// ---------- 投資（開発フェーズで投資、冬の決算で結果発表。運しだい） ----------
export interface FundSpec { label: string; icon: string; risk: number; desc: string; outcomes: [number, number][]; names: string[] }   // outcomes: [倍率, 重み]
export const INVEST = { amounts: [100, 300, 500, 1000] as const, perYear: 4 };
export const FUNDS: Record<FundKind, FundSpec> = {
  bond: { label: '国債', icon: '🏦', risk: 1, desc: 'ほぼ確実に少し増える', outcomes: [[1.03, 1], [1.05, 2], [1.08, 1]],
    names: ['日本ほのぼの国債', '個人向け安心国債', '超長期まったり国債'] },
  index: { label: '株式インデックス', icon: '📊', risk: 2, desc: '市場全体に連動。年によって上下', outcomes: [[0.8, 2], [1.0, 3], [1.2, 3], [1.4, 1]],
    names: ['全世界まるっと株ファンド', 'ニッポン225連動ファンド', '米国ビッグ500ファンド'] },
  estate: { label: '不動産', icon: '🏙️', risk: 2, desc: '堅めだが、たまに大きく下がる', outcomes: [[0.6, 1], [1.0, 3], [1.15, 4], [1.3, 1]],
    names: ['湾岸タワーREIT', 'リゾート民泊ファンド', '駅前オフィスビル投資'] },
  growth: { label: '成長株', icon: '🚀', risk: 3, desc: '当たれば大きいが、半分以下もある', outcomes: [[0.4, 3], [1.0, 2], [1.5, 3], [2.5, 1]],
    names: ['ネコテック（ペット×IoT）', '宇宙エレベーター開発', '代替肉スタートアップ', '空飛ぶタクシー'] },
  crypto: { label: '暗号資産', icon: '🪙', risk: 4, desc: 'ジェットコースター。紙くずか、大化けか', outcomes: [[0.1, 4], [0.5, 2], [1.5, 2], [3, 1], [6, 0.6]],
    names: ['量子コイン', 'ワンワンコイン🐕', 'メタバース土地トークン', 'ラーメン本位制コイン'] },
  angel: { label: '未公開株', icon: '🎲', risk: 5, desc: 'ほとんどは消える。ごくまれに10倍', outcomes: [[0, 6], [0.5, 2], [3, 2], [10, 0.6]],
    names: ['社長の友人の新事業', 'ウワサの未上場ベンチャー', '謎の情報商材会社', '地下アイドル運営会社'] },
};

// ---------- 特技（たまに採用市場にいる・研修でたまに目覚める。1人1つまで） ----------
export interface TraitSpec { name: string; icon: string; rarity: 1 | 2 | 3; desc: string; group: string }
export const TRAITS: Record<TraitKey, TraitSpec> = {
  multi: { name: '掛け持ち', icon: '🔀', rarity: 3, group: '働き方', desc: '1期に2つの担当（案件・サービス）を同時にこなせる。どちらにもスキルが入る' },
  fast: { name: '爆速', icon: '⚡', rarity: 3, group: '働き方', desc: '担当した案件が、突貫しなくても30%で2進む（負債なし）' },
  fire: { name: '火消し職人', icon: '🧯', rarity: 2, group: '働き方', desc: '納期遅れの案件・炎上火消しを担当すると、持っているスキルがすべて+1' },
  night: { name: '夜型', icon: '🌙', rarity: 2, group: '働き方', desc: '担当した案件を突貫工事しても、負債が増えない' },
  refactor: { name: 'リファクタ魔', icon: '🧹', rarity: 2, group: '働き方', desc: '案件かサービスを担当した期に、会社の負債−1' },
  leader: { name: 'リーダー', icon: '👑', rarity: 3, group: 'チーム', desc: '同じ案件のほかのメンバーの、持っているスキルがそれぞれ+1' },
  mentor: { name: '教え上手', icon: '🎓', rarity: 2, group: 'チーム', desc: '同じ案件のほかのメンバーに入る経験値が2倍' },
  mood: { name: 'ムードメーカー', icon: '😄', rarity: 1, group: 'チーム', desc: '会社にいるだけで、インフルエンザで休む人が出ない。天才肌の気まぐれも半分に' },
  sales: { name: '営業上手', icon: '🤝', rarity: 2, group: 'お金', desc: '担当した案件の受け取り×1.1' },
  cheap: { name: '薄給でOK', icon: '🍙', rarity: 1, group: 'お金', desc: '給料が半分' },
  investor: { name: '投資の勘', icon: '🔮', rarity: 2, group: 'お金', desc: '会社の投資で一番悪い結果が出たとき、1年に1回だけ1段階よい結果になる' },
  genius: { name: '天才肌', icon: '🌟', rarity: 3, group: 'クセあり', desc: 'スキルがすべて+1。ただし毎期20%で気分が乗らずに休む' },
  hopper: { name: '転職癖', icon: '🏃', rarity: 2, group: 'クセあり', desc: 'スキルがすべて+1。ただし毎年冬の決算で30%の確率で辞めてしまう' },
  tough: { name: '体力おばけ', icon: '💪', rarity: 1, group: '働き方', desc: '研修のあとに休むことがない（ふつうは30%で次の期が休み）' },
  study: { name: '勉強熱心', icon: '📖', rarity: 1, group: '成長', desc: '研修のとき、ほかに持っているスキル1つにも経験値+1' },
  gambler: { name: 'ギャンブラー', icon: '🎲', rarity: 1, group: 'クセあり', desc: '会社の投資の結果が、投資先ごとに10%で1段階よくなり、10%で1段階悪くなる' },
};
export const TRAIT = {
  market: 0.25, rookie: 0.12, legend: 0.35, train: 0.25,   // 特技を持っている／目覚める確率
  rarityWeight: { 1: 3, 2: 2, 3: 1 } as Record<1 | 2 | 3, number>,
  fastChance: 0.3, geniusRest: 0.2, hopperQuit: 0.3, salesMult: 1.1, gambleUp: 0.1, gambleDown: 0.1,
};

// ---------- 自社オフィス（床のマス目にデスクや部屋を置く。デスクの数＝社員の上限） ----------
export const OFFICE = {
  startW: 3, startH: 2, maxW: 5, maxH: 5,
  expandBase: 300, expandStep: 150,   // 増床（1行／1列）：300、450、600…
  move: 100,                          // 置いたものを動かす・回す・撤去する（1つにつき）
  finalValue: 0.5,                    // 最終決算でオフィスにかけたお金の50%が資産
  maxEffect: 2,                       // 会社全体に効く部屋は、同じ種類2つまで
};
export interface ItemSpec { name: string; icon: string; cells: [number, number][]; cost: number; desc: string; adj?: boolean; short: string }
export const ITEMS: Record<ItemKind, ItemSpec> = {
  desk: { name: 'デスク', icon: '🪑', short: '席', cells: [[0, 0]], cost: 50, desc: '社員1人分の席。デスクの数が社員の上限（借りている社員・貸し出し中の社員も席を使う）' },
  sec: { name: 'セキュリティ室', icon: '🔒', short: 'セキュ', cells: [[0, 0]], cost: 200, desc: '会社全体：妨害「情報漏洩」「技術ブログ炎上」をカードなしで毎回防ぐ' },
  rest: { name: '休憩室', icon: '☕', short: '休憩室', cells: [[0, 0], [1, 0]], cost: 200, adj: true, desc: 'となりのデスクの社員：研修のあと休む確率−20%・インフルエンザで休まない・天才肌の気まぐれ半分' },
  meet: { name: '会議室', icon: '🤝', short: '会議室', cells: [[0, 0], [1, 0]], cost: 250, desc: '会社全体：入札の比較値−3%' },
  server: { name: 'サーバールーム', icon: '🖥️', short: 'サーバ', cells: [[0, 0], [0, 1]], cost: 250, desc: '会社全体：自社サービスのLvアップに必要なスキル合計−1' },
  refresh: { name: 'リフレッシュ室', icon: '🎮', short: 'リフレ', cells: [[0, 0], [0, 1], [1, 1]], cost: 300, adj: true, desc: 'となりのデスクの社員：案件で経験値が入るとき、50%で+1多く入る' },
  lab: { name: '研修室', icon: '📚', short: '研修室', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], cost: 400, adj: true, desc: 'となりのデスクの社員：研修で特技に目覚める確率+20%' },
  bigmeet: { name: '大会議室', icon: '🏛️', short: '大会議室', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], cost: 500, desc: '会社全体：入札の比較値−6%（会議室と合わせて最大−9%）' },
};
export const OFFICE_FX = { restAdjDown: 0.2, labAdjUp: 0.2, refreshAdj: 0.5, meetDown: 0.03, bigMeetDown: 0.06, meetCap: 0.09, serverDown: 1, secBlocks: ['A5', 'A7'] as CardKey[] };

// ---------- 広告（入札フェーズで1期1回。お金で評判を上げる。広告の評判は maxRep まで上乗せでき、その年の冬の決算で消える） ----------
export const ADS = [
  { name: 'Web広告', icon: '📣', cost: 500, rep: 1 },
  { name: 'テレビCM', icon: '📺', cost: 900, rep: 2 },
] as const;
export const AD = { maxRep: 2 };

// ---------- 業種の必殺技（1ゲームに1回だけ） ----------
export interface SpecialSpec { name: string; icon: string; phase: 'bid' | 'dev'; target?: 'project' | 'rival'; desc: string }
export const SPECIALS: Record<IndustryKey, SpecialSpec> = {
  sier: { name: '根回し', icon: '🤝', phase: 'bid', target: 'project', desc: '選んだ案件を、入札なしで予算の100%で受注する（ほかの会社の入札は無効。同じ技がぶつかったら評判→抽選）' },
  consul: { name: '引き抜き工作', icon: '🕶️', phase: 'bid', target: 'rival', desc: '選んだライバルの一番優秀な社員を、防御カードを無視して引き抜く（席が必要）' },
  web: { name: 'スピード納品', icon: '⚡', phase: 'dev', desc: '今期、必要スキルを満たした案件がすべてさらに+1進む（負債は増えない）' },
  saas: { name: 'バズマーケ', icon: '📈', phase: 'dev', desc: '自社サービスがすぐにLv+1、今期のサービス収入×2（サービスが必要）' },
  ai: { name: 'AI自動化', icon: '🤖', phase: 'dev', desc: '今期、全社員の持っているスキルがすべて+1' },
  maint: { name: '障害ゼロ宣言', icon: '🛡️', phase: 'dev', desc: '負債をすべて0にして、評判+1' },
};
