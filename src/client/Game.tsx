// ===== ゲーム画面 =====
import { useEffect, useMemo, useState } from 'react';
import { ADS, CARDS, GAME, HAPPENINGS, PROJECT_TYPES, SEASONS, SERVICE } from '../logic/config';
import { effSkills, payroll, projectCheck, quarterLabel, salaryMult, season, serviceIncome, slots, totalQ, totalYears, working, yen } from '../logic/calc';
import { defaultDev, emptyBid } from '../logic/game';
import type { ActiveProject, BidSubmit, Company, DevSubmit, Engineer, Game as G } from '../logic/types';
import type { PlayerView } from '../logic/view';
import { phaseKey, type ChatMsg } from '../shared/protocol';
import { BidTab, CardDetail, CardTile } from './BidTab';
import { IndustryChip, IndustryDetail } from './Industry';
import { VoiceBubble, setVoice, voiceOn } from './Voice';
import { OfficeView } from './Office';
import { DevTab, EngBadges, ProjectSkillSheet, TraitLine, XpLine, devSummary } from './DevTab';
import { sfx, setSound, soundOn } from './fx/sound';
import type { Snapshot } from './session';
import { CountUp, Face, LogoMark, Sheet, SkillChips, Sparkline, companyColor, useLongPress } from './ui';

type Tab = 'main' | 'me' | 'rivals' | 'log';

interface Props {
  snap: Snapshot;
  onSubmit: (d: BidSubmit | DevSubmit) => void;
  onCancel: () => void;
  onExit: () => void;
  onAgain: () => void;
  onChat: (t: string) => void;
  isHost: boolean;
}

const draftKey = (g: G, me: string) => `ipo_draft_${g.id}_${me}_${phaseKey(g.q, g.phase)}`;

export function GameScreen({ snap, onSubmit, onCancel, onExit, onAgain, onChat, isHost }: Props) {
  const v = snap.view!;
  const g = v.game;
  const me = g.companies.find(c => c.id === snap.me)!;
  const [tab, setTab] = useState<Tab>('main');
  const [happen, setHappen] = useState(false);
  const [sound, setSnd] = useState(soundOn);
  const [voice, setVoiceState] = useState(voiceOn);

  // 提出前の下書き（リロードしても残す）
  const initial = (): BidSubmit | DevSubmit => {
    if (v.mySubmit) return v.mySubmit as BidSubmit | DevSubmit;
    try { const s = sessionStorage.getItem(draftKey(g, snap.me)); if (s) return JSON.parse(s); } catch { /* 無視 */ }
    return g.phase === 'bid' ? emptyBid() : defaultDev(g, snap.me);
  };
  const [draft, setDraft] = useState<BidSubmit | DevSubmit>(initial);
  useEffect(() => { try { sessionStorage.setItem(draftKey(g, snap.me), JSON.stringify(draft)); } catch { /* 無視 */ } }, [draft, g, snap.me]);

  const locked = !!v.mySubmit;
  const h = HAPPENINGS[g.happenings[g.q]];
  const headlines = g.reveal?.headlines || [];

  if (g.phase === 'end' && g.final) return <FinalScreen g={g} me={snap.me} onExit={onExit} onAgain={onAgain} isHost={isHost} mode={snap.mode} />;

  const summary = g.phase === 'bid' ? bidSummary(g, draft as BidSubmit) : devSummary(g, me, draft as DevSubmit);
  const submittedCount = Object.values(v.submitted).filter(Boolean).length;

  return (
    <div className="game">
      <header className="hdr">
        <div className="hdr-top">
          <button className="icon-btn" aria-label="終了" onClick={() => { if (confirm(snap.mode === 'local' ? 'ホームに戻りますか？（続きから再開できます）' : 'ゲームから抜けますか？（同じルームIDと会社名で戻れます）')) onExit(); }}>✕</button>
          <button className="icon-btn" aria-label="効果音" onClick={() => { setSound(!sound); setSnd(!sound); }}>{sound ? '🔊' : '🔇'}</button>
          <button className={`icon-btn ${voice ? '' : 'off'}`} aria-label={voice ? '社員のひとことをオフ' : '社員のひとことをオン'} title="社員のひとこと" onClick={() => { setVoice(!voice); setVoiceState(!voice); }}>{voice ? '💬' : '🤐'}</button>
          <div className="hdr-mid">
            <div className="q">{quarterLabel(g.q)}<span className="faint" style={{ fontSize: 11, marginLeft: 6 }}>第{g.q + 1}期/{totalQ(g)}</span></div>
            <span className={`ph ${g.phase}`}>{g.phase === 'bid' ? '入札フェーズ' : '開発フェーズ'}</span>
          </div>
          <div className={`cash ${me.cash < 0 ? 'neg' : ''}`}><small>現金（万円）</small><CountUp v={me.cash} /></div>
        </div>
        <div className="progress12">
          {Array.from({ length: totalQ(g) }, (_, i) => <i key={i} className={`${i < g.q ? 'done' : i === g.q ? 'now' : ''} ${i > 0 && i % 4 === 0 ? 'year' : ''}`} title={quarterLabel(i)} />)}
        </div>
        <button className="happen" onClick={() => setHappen(true)}>
          <span className="hi">{h.icon}</span><span className="grow ellipsis"><b>{h.name}</b>　<span className="muted">{h.desc}</span></span><span className="more">詳しく ›</span>
        </button>
        {headlines.length > 0 && (
          <div className="news" aria-label="ニュース速報"><span className="lbl">速報</span>
            <div style={{ overflow: 'hidden', flex: 1 }}><div className="track" style={{ ['--dur' as string]: `${12 + headlines.join('').length * 0.25}s` }}>{headlines.map((x, i) => <span key={i}>◆ {x}</span>)}</div></div>
          </div>
        )}
        <nav className="tabs" role="tablist">
          {([['main', g.phase === 'bid' ? '入札' : '開発'], ['me', '自社'], ['rivals', '各社'], ['log', '記録']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { sfx.tap(); setTab(k); scrollTo({ top: 0 }); }}>{label}</button>
          ))}
        </nav>
      </header>

      {tab === 'main' && (g.phase === 'bid'
        ? <BidTab v={v} me={me} draft={draft as BidSubmit} locked={locked} set={f => setDraft(d => f(d as BidSubmit))} />
        : <DevTab v={v} me={me} draft={draft as DevSubmit} locked={locked} set={f => setDraft(d => f(d as DevSubmit))} />)}
      {tab === 'me' && <MeTab v={v} me={me} />}
      {tab === 'rivals' && <RivalsTab v={v} me={me.id} />}
      {tab === 'log' && <LogTab g={g} />}

      <div className="decide">
        <div className="sum">
          {locked ? (
            <>
              <div className="up">✓ 提出済み（{submittedCount}/{g.companies.length}社）</div>
              <div className="status-dots">{g.companies.map(c => <span key={c.id} className={v.submitted[c.id] ? 'ok' : ''}><span className="dot" style={{ background: companyColor(g, c.id) }} />{c.name}{v.submitted[c.id] ? '✓' : '…'}</span>)}</div>
            </>
          ) : summary.map((s, i) => <span key={i} className={s.w ? 'w' : ''}>{i ? '・' : ''}{s.t}</span>)}
        </div>
        {locked
          ? (snap.mode === 'online' ? <button className="btn" onClick={onCancel}>取り消す</button> : null)
          : <button className="btn primary" onClick={() => {
            const warn = summary.some(s => s.w && s.t.includes('進まない'));
            if (warn && !confirm('進まない案件があります。このまま決定しますか？')) return;
            sfx.don(); onSubmit(draft);
          }}>決定 ▶</button>}
      </div>

      {snap.mode === 'online' && <Chat chat={snap.chat} me={snap.me} onSend={onChat} />}
      <VoiceBubble g={g} me={me} on={voice} />
      {happen && (
        <Sheet onClose={() => setHappen(false)} title={<>{h.icon} {h.name}</>} sub={`今期のハプニング（${h.when === 'start' ? '期の始めに発生' : '開発の解決時に発生'}）`}>
          <div className="card"><p style={{ margin: 0 }}>{h.desc}</p></div>
          <div className="card"><b>季節のイベント（{SEASONS[season(g.q)]}）</b>
            <p className="note" style={{ margin: '6px 0 0' }}>{[
              '春：新人2人が採用候補に。在籍中の新人は2年目からスキル+1・給料+10',
              '夏：決算後にハッカソン。出勤社員の最高スキル値が一番高い会社に+200・評判+1',
              '秋：官公庁の大型公募が1件追加',
              '冬：決算後に監査（負債×30を支払い）。年間利益トップの会社は評判+1',
            ][season(g.q)]}</p></div>
          <div className="card"><b>これまでのハプニング</b>
            <div className="chips" style={{ marginTop: 6 }}>{g.happenings.slice(0, g.q).map((k, i) => <span key={i} className="chip">{HAPPENINGS[k].icon} {HAPPENINGS[k].name}</span>)}</div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function bidSummary(g: G, d: BidSubmit) {
  const parts: { t: string; w?: boolean }[] = [];
  const nb = Object.keys(d.bids).length, nh = Object.keys(d.hires).length;
  parts.push({ t: `入札 ${nb}件` });
  if (nh) parts.push({ t: `採用 ${nh}人` });
  if (d.card) {
    const t = d.target ? g.companies.find(c => c.id === d.target)?.name : '';
    parts.push({ t: `${CARDS[d.card].name}${t ? `→${t}` : ''}`, w: CARDS[d.card].kind === 'attack' && !d.target });
  }
  if (d.rent) parts.push({ t: 'レンタル申込' });
  if (d.ad !== undefined && ADS[d.ad]) parts.push({ t: `${ADS[d.ad].name} ${ADS[d.ad].cost}` });
  return parts;
}

// ---------- 自社 ----------
function MyProjectCard({ g, me, p, onOpen }: { g: G; me: Company; p: ActiveProject; onOpen: () => void }) {
  const lp = useLongPress(onOpen, onOpen);
  const chk = projectCheck(g, me, p);
  return (
    <div className="card lp" {...lp} role="button">
      <div className="row"><span className={`ptype ${p.type}`}>{PROJECT_TYPES[p.type].icon}</span><b className="grow ellipsis">{p.name}</b><span className="num gold">{p.price.toLocaleString()}</span></div>
      <div className="pbar"><i style={{ width: `${p.progress / p.work * 100}%` }} /></div>
      <div className="row note" style={{ justifyContent: 'space-between' }}><span>進捗 {p.progress}/{p.work}・納期 {quarterLabel(p.deadline)}</span>
        <span className={chk.ok ? 'up' : 'down'}>{chk.ok ? '✓ スキル足りてる' : '⚠ スキル不足'}</span></div>
    </div>
  );
}

function MeTab({ v, me }: { v: PlayerView; me: Company }) {
  const g = v.game;
  const [detail, setDetail] = useState<null | (typeof me.hand)[number]>(null);
  const [proj, setProj] = useState<string | null>(null);
  // 社員の担当：案件／サービス／空き（入札フェーズでは前の期の担当がそのまま次の開発の初期値）
  const placeOf = (e: Engineer): { kind: 'proj' | 'svc' | 'free'; label: string } => {
    const ps = slots(e.assign).map(t => me.projects.find(x => x.id === t)).filter(Boolean);
    const svc = slots(e.assign).includes('svc') && !!me.service;
    if (ps.length) return { kind: 'proj', label: `🛠️ ${ps.map(p => p!.name).join('＋')}${svc ? '＋サービス' : ''}` };
    if (svc) return { kind: 'svc', label: '🚀 サービス' };
    return { kind: 'free', label: '☕ 空き' };
  };
  const order = { free: 0, proj: 1, svc: 2 };
  const sortedStaff = [...me.engineers].sort((a, b) => order[placeOf(a).kind] - order[placeOf(b).kind]);
  const staff = { proj: 0, svc: 0, free: 0, rest: me.engineers.filter(e => !working(g, e)).length };
  me.engineers.forEach(e => { staff[placeOf(e).kind]++; });
  const pay = Math.round(payroll(g, me).reduce((t, e) => t + e.salary, 0) * salaryMult(me) / 10) * 10;
  return (
    <div className="content">
      <div className="row" style={{ margin: '12px 2px' }}><LogoMark g={g} id={me.id} name={me.name} /><div className="grow"><b style={{ fontSize: 18 }}>{me.name}</b> <IndustryChip c={me} full /><div className="note">完了した案件 {me.completed}件</div></div></div>
      {me.industry && <details className="fold" style={{ marginBottom: 10 }}><summary>業種の得意・弱点</summary><div className="fold-body"><IndustryDetail k={me.industry} /></div></details>}
      <div className="kpis">
        <div className="kpi"><small>💴 現金</small><span className={`num ${me.cash < 0 ? 'down' : ''}`}>{me.cash.toLocaleString()}<small>万円</small></span></div>
        <div className="kpi"><small>⭐ 評判</small><span className="num">{me.rep}</span><div className="note">入札の比較で{Math.abs(me.rep * 3)}%{me.rep >= 0 ? '有利' : '不利'}</div></div>
        <div className="kpi"><small>🧾 負債</small><span className={`num ${me.debt >= 6 ? 'down' : me.debt >= 4 ? 'gold' : ''}`}>{me.debt}</span><div className="note">{me.debt >= 6 ? '本番障害が起きる！' : '6以上で本番障害'}</div></div>
        <div className="kpi"><small>🚀 サービス</small><span className="num">{me.service ? `Lv${me.service.level}` : 'なし'}</span><div className="note">{me.service ? `毎期${serviceIncome(me, me.service.level)}・価値${me.service.level * SERVICE.valuePerLv}` : '開発タブで立ち上げ'}</div></div>
      </div>
      <div className="card" style={{ marginTop: 10 }}><div className="row"><b>現金の推移</b><span className="grow" /><span className="note">開始 {GAME.startCash}</span></div><Sparkline values={me.history} color={companyColor(g, me.id)} /></div>
      <div className="sec-title">👥 社員 <span className="n">{me.engineers.length}</span><small>給料の合計 {pay}万円/期（貸し出し中を含む{salaryMult(me) !== 1 ? `・業種で×${salaryMult(me)}` : ''}）</small></div>
      <div className="chips" style={{ margin: '0 2px 8px' }}>
        <span className="chip blue">🛠️ 案件 {staff.proj}人</span>
        {me.service && <span className="chip gold">🚀 サービス {staff.svc}人</span>}
        <span className={`chip ${staff.free ? 'up' : ''}`}>☕ 空き {staff.free}人</span>
        {staff.rest > 0 && <span className="chip">😷 休み {staff.rest}人</span>}
      </div>
      {g.phase === 'dev' && <div className="note" style={{ margin: '0 2px 8px' }}>※ 前の期の担当です。今期の割り当ては「開発」タブで変更できます</div>}
      {sortedStaff.map(e => (
        <div className={`eng ${placeOf(e).kind === 'free' ? 'free' : ''}`} key={e.id}><Face name={e.name} /><div className="grow">
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><span className="nm">{e.name}</span><span className={`badge-k place ${placeOf(e).kind}`}>{placeOf(e).label}</span><EngBadges g={g} e={e} me={me} /></div>
          <div style={{ marginTop: 4 }}><SkillChips skills={me.effects.slack === g.q ? effSkills(g, me, e) : e.skills} base={e.skills} why="Slack爆撃" /></div><XpLine e={e} /><TraitLine e={e} /><div className="sal">給料 {e.salary}</div></div></div>
      ))}
      {g.companies.flatMap(c => c.engineers.filter(e => e.loan?.from === me.id).map(e => (
        <div className="eng" key={e.id} style={{ opacity: .75 }}><Face name={e.name} /><div className="grow"><span className="nm">{e.name}</span> <span className="badge-k rent">{c.name}に貸し出し中</span><div className="sal">給料 {e.salary}（自社負担）</div></div></div>
      )))}
      <div className="sec-title">🏢 オフィス</div>
      <div className="card"><OfficeView g={g} me={me} /></div>
      <div className="sec-title">🛠️ 進行中の案件 <span className="n">{me.projects.length}</span><small>長押しでスキルの過不足</small></div>
      {me.projects.length === 0 && <div className="empty">なし</div>}
      {me.projects.map(p => <MyProjectCard key={p.id} g={g} me={me} p={p} onOpen={() => setProj(p.id)} />)}
      {proj && me.projects.some(p => p.id === proj) && <ProjectSkillSheet g={g} me={me} p={me.projects.find(p => p.id === proj)!} onClose={() => setProj(null)} />}
      <div className="sec-title">🃏 手札 <span className="n">{me.hand.length}</span><small>長押しで詳細</small></div>
      <div className="hand">{me.hand.map((k, i) => <CardTile key={i} k={k} onLong={() => setDetail(k)} onTap={() => setDetail(k)} />)}</div>
      <div className="kpis" style={{ marginTop: 6 }}>
        <div className="kpi"><small>📈 株</small><span className="num">{me.stocks.length}<small>株</small></span><div className="note">価値は最終決算で決定（0〜2,000）</div></div>
        <div className="kpi"><small>🧠 AIノウハウ</small><span className="num">{me.aiKnowhow}</span></div>
        <div className="kpi"><small>💹 今年の投資</small><span className="num">{(me.invest || []).reduce((t, h) => t + h.amount, 0).toLocaleString()}<small>万円</small></span><div className="note">結果は冬の決算で</div></div>
      </div>
      {detail && <CardDetail k={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ---------- 各社 ----------
function RivalsTab({ v, me }: { v: PlayerView; me: string }) {
  const g = v.game;
  const list = [...g.companies].sort((a, b) => b.cash - a.cash);
  return (
    <div className="content">
      <div className="sec-title">🏁 現金ランキング</div>
      {list.map((c, i) => (
        <div key={c.id} className={`card ${c.id === me ? 'hl' : ''}`}>
          <div className="rival">
            <span className="rk" style={{ color: i === 0 ? 'var(--gold)' : 'var(--faint)' }}>{i + 1}</span>
            <LogoMark g={g} id={c.id} name={c.name} />
            <div className="grow"><b>{c.name}</b>{c.id === me && <span className="chip ink" style={{ marginLeft: 6 }}>あなた</span>} <IndustryChip c={c} />
              <div className="note">{v.submitted[c.id] ? '✓ 提出済み' : '考え中…'}</div></div>
            <span className={`num ${c.cash < 0 ? 'down' : ''}`} style={{ fontSize: 20 }}>{yen(c.cash)}</span>
          </div>
          <Sparkline values={c.history} color={companyColor(g, c.id)} height={40} />
          <div className="rival"><div className="stats" style={{ flex: 1 }}>
            <div>社員<b>{c.engineers.length}</b></div><div>案件<b>{c.projects.length}</b></div><div>完了<b>{c.completed}</b></div><div>手札<b>{v.handCounts[c.id]}</b></div>
            <div>評判<b>{c.rep}</b></div><div>負債<b className={c.debt >= 6 ? 'down' : ''}>{c.debt}</b></div><div>サービス<b>{c.service ? `Lv${c.service.level}` : '−'}</b></div><div>株<b>{c.stocks.length}</b></div>
          </div></div>
        </div>
      ))}
    </div>
  );
}

// ---------- 記録 ----------
function LogTab({ g }: { g: G }) {
  const lines = useMemo(() => [...g.log].reverse(), [g.log]);
  return (
    <div className="content">
      <div className="sec-title">📜 記録 <small>新しい順</small></div>
      {lines.map((l, i) => <div key={i} className={`logline ${l.startsWith('━━') ? 'q' : ''}`}>{l}</div>)}
    </div>
  );
}

// ---------- 最終結果 ----------
function FinalScreen({ g, me, onExit, onAgain, isHost, mode }: { g: G; me: string; onExit: () => void; onAgain: () => void; isHost: boolean; mode: string }) {
  const rows = g.final!;
  const top = rows.filter(r => r.rank === 1);
  return (
    <div className="page">
      <div className="final-hero">
        <div className="crown">🔔</div>
        <div className="note" style={{ letterSpacing: '.3em' }}>上場決定</div>
        <div className="wname">{top.map(r => r.name).join('・')}</div>
        <div className="note">{totalYears(g)}年間の利益 {top[0] ? `${top[0].profit >= 0 ? '+' : ''}${top[0].profit.toLocaleString()}万円` : ''}</div>
      </div>
      {rows.map(r => (
        <div className={`card ${r.id === me ? 'hl' : ''}`} key={r.id}>
          <div className="podium-row">
            <span className={`rk r${r.rank}`}>{r.rank}</span>
            <div><b>{r.name}</b>{r.id === me && <span className="chip ink" style={{ marginLeft: 6 }}>あなた</span>}</div>
            <span className={`num ${r.profit < 0 ? 'down' : 'up'}`} style={{ fontSize: 20 }}>{r.profit >= 0 ? '+' : '−'}{Math.abs(r.profit).toLocaleString()}</span>
          </div>
          <div className="breakdown">
            <div>現金<b>{r.cash.toLocaleString()}</b></div>
            <div>サービス<b>{r.service.toLocaleString()}</b></div>
            <div>オフィス<b>{(r.office || 0).toLocaleString()}</b></div>
            <div>株{r.stocks.length ? `(${r.stocks.length})` : ''}<b>{r.stockTotal.toLocaleString()}</b></div>
          </div>
          {r.awards.map(a => <span key={a} className="award">{a}</span>)}
          <Sparkline values={g.companies.find(c => c.id === r.id)!.history} color={companyColor(g, r.id)} height={40} />
        </div>
      ))}
      <div className="note" style={{ textAlign: 'center', margin: '10px 0' }}>利益 ＝ 現金＋サービス価値（Lv×300）＋株 − 開始資金{GAME.startCash}</div>
      <div className="fixed-bottom row">
        <button className="btn grow" onClick={onExit}>ホームへ</button>
        {(mode === 'local' || isHost) && <button className="btn primary grow" onClick={onAgain}>もう一度</button>}
      </div>
    </div>
  );
}

// ---------- チャット（オンライン） ----------
const QUICK = ['談合しませんか？🤝', 'その案件は譲ります', '次はあの会社を狙おう', '裏切ったな…！', 'お手柔らかに🙏', 'さすが社長👏', 'スパイいるでしょ👀'];
function Chat({ chat, me, onSend }: { chat: ChatMsg[]; me: string; onSend: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(chat.length);
  const unread = open ? 0 : Math.max(0, chat.length - seen);
  useEffect(() => { if (open) setSeen(chat.length); }, [open, chat.length]);
  const send = (t: string) => { if (!t.trim()) return; onSend(t.trim()); setText(''); sfx.tap(); };
  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="チャット">💬{unread > 0 && <span className="badge">{unread}</span>}</button>
      {open && (
        <Sheet onClose={() => setOpen(false)} title="💬 社長たちの密談" sub="談合も交渉も自由。でも約束を守るとは限らない…">
          <div className="chat-list">
            {chat.length === 0 && <div className="empty">まだメッセージはありません</div>}
            {chat.map((m, i) => <div key={i} className={`msg ${m.from === me ? 'me' : ''}`}><small>{m.name}</small>{m.text}</div>)}
          </div>
          <div className="quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>
          <div className="row"><input className="input" value={text} maxLength={120} placeholder="メッセージ" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(text); }} />
            <button className="btn primary" onClick={() => send(text)}>送信</button></div>
        </Sheet>
      )}
    </>
  );
}

