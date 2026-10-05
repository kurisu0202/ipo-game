// ===== ゲーム外の画面：オープニング・ホーム・設定・ロビー・交代画面 =====
import { useMemo, useState } from 'react';
import { GAME } from '../logic/config';
import type { Game } from '../logic/types';
import { ROOM_RE, NAME_MAX, type LobbyInfo } from '../shared/protocol';
import { confetti, cannons } from './fx/confetti';
import { buzz, reducedMotion, sfx, unlockAudio } from './fx/sound';
import { isOnline } from './store';
import { companyColor } from './ui';

// ---------- オープニング（起動時のエフェクト） ----------
export function Splash({ onDone }: { onDone: () => void }) {
  const [go, setGo] = useState(false);
  const tape = useMemo(() => {
    const names = ['ゼロイチ', 'ネオソフト', 'クラウド斎藤', 'ピクセル堂', 'バグナシ', 'デジタル田中', 'コード工房', 'サーバー屋'];
    return Array.from({ length: 16 }, (_, i) => {
      const up = (i * 7) % 3 !== 0;
      return { n: names[i % names.length], v: `${up ? '▲' : '▼'}${((i * 37) % 90 + 5) / 10}%`, up };
    });
  }, []);
  const Tape = ({ cls }: { cls: string }) => (
    <div className={`tape ${cls}`}>{[...tape, ...tape].map((t, i) => <span key={i}>{t.n} <span className={t.up ? 'u' : 'd'}>{t.v}</span></span>)}</div>
  );
  const start = () => {
    if (go) return;
    unlockAudio();
    sfx.bell();
    buzz([30, 60, 30]);
    setGo(true);
    if (!reducedMotion()) { setTimeout(() => cannons(), 150); setTimeout(() => confetti({ kind: 'money', count: 80 }), 350); }
    setTimeout(onDone, 700);
  };
  return (
    <div className={`splash ${go ? 'go' : ''}`} onClick={start} role="button" aria-label="タップしてはじめる">
      <Tape cls="t1" /><Tape cls="t2" /><Tape cls="t3" />
      <svg className="chart" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
        <path d="M0,170 L40,160 L70,172 L105,140 L140,150 L175,118 L205,128 L240,90 L270,104 L305,60 L335,72 L372,24 L400,8" />
        <circle cx="372" cy="24" r="6" />
      </svg>
      <div className="center">
        <div className="y">3年</div>
        <div className="t">で<b>上場</b>
          <span className="hanko" style={{ position: 'absolute' }}>上場</span>
        </div>
        <div className="tap">TAP TO START</div>
      </div>
      <div className="flash" />
    </div>
  );
}

// ---------- ホーム ----------
export function Home({ onLocal, onOnline, resume, onResume, online }: { onLocal: () => void; onOnline: () => void; resume: Game | null; onResume: () => void; online: boolean }) {
  return (
    <div className="home">
      <div className="hero">
        <div className="kicker">IT COMPANY BATTLE</div>
        <div className="logo"><span className="y3">3</span>年で<span className="ipo">上場</span></div>
        <div className="tag">2〜4人でIT企業の社長に。12期（3年）で一番利益を出した会社が上場！</div>
        <svg className="ticker-chart" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--up)" stopOpacity=".35" /><stop offset="1" stopColor="var(--up)" stopOpacity="0" /></linearGradient></defs>
          <path className="area" d="M0,70 L30,62 L55,68 L85,50 L110,56 L140,40 L165,46 L195,28 L220,34 L250,16 L275,20 L300,4 L300,80 L0,80Z" />
          <path className="line" d="M0,70 L30,62 L55,68 L85,50 L110,56 L140,40 L165,46 L195,28 L220,34 L250,16 L275,20 L300,4" />
        </svg>
      </div>
      <div className="menu">
        {resume && (
          <button className="btn gold" onClick={onResume}>
            <span className="mi">▶</span><span><b>続きから</b><small>この端末で遊んでいたゲーム（{resume.companies.map(c => c.name).join('・')}）</small></span>
          </button>
        )}
        <button className="btn primary" onClick={onOnline} disabled={!online}>
          <span className="mi">🌐</span><span><b>オンラインで遊ぶ</b><small>{online ? '各自のスマホで対戦（2〜4人）' : 'このURLではオンライン対戦は使えません'}</small></span>
        </button>
        <button className="btn" onClick={onLocal}>
          <span className="mi">📱</span><span><b>この端末で遊ぶ</b><small>1台を順番に回して遊ぶ（通信なし）</small></span>
        </button>
      </div>
      <details className="fold how">
        <summary>📖 遊び方</summary>
        <div className="fold-body">
          <p>あなたはIT企業の社長。3年（12期）で一番<b>利益</b>を出した会社が上場（勝ち）です。</p>
          <p><b>1期の流れ</b>（全員が非公開で同時に決めます）</p>
          <ol>
            <li><b>入札フェーズ</b>：案件に入札（安いほど有利、評判が高いと割引）／エンジニアを採用／作戦カードで妨害</li>
            <li><b>開発フェーズ</b>：社員を案件に割り当て。必要スキルを満たすと進捗+1。進むたびに中間金、完了で残りの報酬！</li>
            <li><b>決算</b>：給料を払い、ド派手に結果発表</li>
          </ol>
          <p>負債がたまると本番障害、借金には利息。レンタル社員がスパイかも…？</p>
        </div>
      </details>
      <div className="footer-note">効果音が鳴ります（右上でオフにできます）</div>
    </div>
  );
}

// ---------- ローカル設定 ----------
export function LocalSetup({ onBack, onStart }: { onBack: () => void; onStart: (names: string[]) => void }) {
  const [n, setN] = useState(3);
  const defaults = ['ゼロイチ株式会社', 'ネオソフト', 'ピクセル堂', 'バグナシ技研'];
  const [names, setNames] = useState(defaults);
  const ok = names.slice(0, n).every(x => x.trim()) && new Set(names.slice(0, n).map(x => x.trim())).size === n;
  return (
    <div className="page">
      <div className="topbar"><button className="icon-btn" onClick={onBack} aria-label="戻る">←</button><h1>この端末で遊ぶ</h1><span style={{ width: 40 }} /></div>
      <div className="field"><label>人数</label>
        <div className="stepper">{[2, 3, 4].map(k => <button key={k} className={k === n ? 'on' : ''} onClick={() => { setN(k); sfx.tap(); }}>{k}人</button>)}</div>
      </div>
      {names.slice(0, n).map((v, i) => (
        <div className="field" key={i}><label>{i + 1}社目の会社名</label>
          <input className="input" value={v} maxLength={NAME_MAX} onChange={e => setNames(a => a.map((x, j) => (j === i ? e.target.value : x)))} />
        </div>
      ))}
      <p className="note">順番に端末を渡して、ほかの人に見えないように決めていきます。</p>
      <div className="fixed-bottom"><button className="btn primary big" disabled={!ok} onClick={() => onStart(names.slice(0, n).map(x => x.trim()))}>{ok ? `${n}社でスタート！` : '会社名を入力してください（重複なし）'}</button></div>
    </div>
  );
}

// ---------- オンライン参加 ----------
export function OnlineJoin({ onBack, onJoin }: { onBack: () => void; onJoin: (room: string, name: string) => void }) {
  const params = new URLSearchParams(location.search);
  const [room, setRoom] = useState(params.get('room') || '');
  const [name, setName] = useState(() => { try { return localStorage.getItem('ipo_name') || ''; } catch { return ''; } });
  const gen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; setRoom(Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join('')); sfx.tap(); };
  const ok = ROOM_RE.test(room) && name.trim().length > 0;
  return (
    <div className="page">
      <div className="topbar"><button className="icon-btn" onClick={onBack} aria-label="戻る">←</button><h1>オンラインで遊ぶ</h1><span style={{ width: 40 }} /></div>
      <div className="field"><label>ルームID（半角英数 2〜24文字）</label>
        <div className="row"><input className="input" value={room} maxLength={24} inputMode="text" autoCapitalize="characters" onChange={e => setRoom(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder="例：TOKYO1" />
          <button className="btn" onClick={gen}>🎲 作る</button></div>
      </div>
      <div className="field"><label>会社名</label>
        <input className="input" value={name} maxLength={NAME_MAX} onChange={e => setName(e.target.value)} placeholder="例：ゼロイチ株式会社" />
      </div>
      <p className="note">同じルームIDを入れた人同士で対戦します。部屋がなければ作られ、最初の人がホストになります。</p>
      {!isOnline && <p className="note">⚠ ローカルテストモード：Firebase が未設定のため、同じブラウザの別タブ同士でだけ対戦できます。</p>}
      <div className="fixed-bottom"><button className="btn primary big" disabled={!ok} onClick={() => { try { localStorage.setItem('ipo_name', name.trim()); } catch { /* 無視 */ } onJoin(room.toUpperCase(), name.trim()); }}>入室する</button></div>
    </div>
  );
}

// ---------- ロビー ----------
export function Lobby({ room, lobby, me, onStart, onLeave, connected }: { room: string; lobby: LobbyInfo | null; me: string; onStart: () => void; onLeave: () => void; connected: boolean }) {
  const host = lobby?.hostId === me;
  const n = lobby?.players.length || 0;
  const share = async () => {
    const url = `${location.origin}${location.pathname}?room=${room}`;
    const text = `「3年で上場」で勝負！ ルームID：${room}`;
    try { if (navigator.share) { await navigator.share({ title: '3年で上場', text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); alert('招待リンクをコピーしました'); } catch { /* 無視 */ }
  };
  return (
    <div className="page">
      <div className="topbar"><button className="icon-btn" onClick={onLeave} aria-label="退出">←</button><h1>ロビー</h1><span className={`online-dot ${connected ? '' : 'off'}`} style={{ margin: '0 16px' }} /></div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="note">ルームID</div>
        <div className="room-big" style={{ fontSize: Math.min(42, Math.floor(560 / Math.max(6, room.length))) }}>{room}</div>
        <button className="btn sm" onClick={share}>🔗 招待リンクを送る</button>
      </div>
      <div className="sec-title">参加中の会社 <span className="n">{n}</span><small>/ {GAME.maxPlayers}社</small></div>
      {!lobby && <div className="empty">接続中…</div>}
      {lobby?.players.map((p, i) => (
        <div className="player-row" key={p.id}>
          <span className="logo-mark" style={{ background: `var(--c${i % 4})` }}>{[...p.name][0]}</span>
          <div className="grow"><b>{p.name}</b>{p.id === me && <span className="chip ink" style={{ marginLeft: 6 }}>あなた</span>}</div>
          {p.id === lobby.hostId && <span className="chip gold">👑 ホスト</span>}
          <span className={`online-dot ${p.online ? '' : 'off'}`} />
        </div>
      ))}
      {n < GAME.minPlayers && <p className="note" style={{ marginTop: 12 }}>招待リンクを送って、あと{GAME.minPlayers - n}社以上集めましょう。</p>}
      <div className="fixed-bottom">
        {host
          ? <button className="btn primary big" disabled={n < GAME.minPlayers} onClick={onStart}>{n < GAME.minPlayers ? `${GAME.minPlayers}社から開始できます` : `${n}社でゲーム開始！`}</button>
          : <div className="card" style={{ textAlign: 'center' }}>ホストの開始を待っています…</div>}
      </div>
    </div>
  );
}

// ---------- 交代画面（ローカル） ----------
export function PassScreen({ g, cid, onOpen }: { g: Game; cid: string; onOpen: () => void }) {
  const c = g.companies.find(x => x.id === cid)!;
  return (
    <div className="pass" style={{ ['--pc' as string]: companyColor(g, cid) }}>
      <div className="hand-icon">🤲</div>
      <div style={{ fontWeight: 700 }}>端末を渡してください</div>
      <div className="who">{c.name}<br /><span style={{ fontSize: 24 }}>の番です</span></div>
      <div style={{ opacity: .85, fontSize: 13 }}>{g.phase === 'bid' ? '入札フェーズ' : '開発フェーズ'}・ほかの人は画面を見ないでね</div>
      <button className="btn big" onClick={() => { unlockAudio(); sfx.tap(); onOpen(); }}>👀 見る</button>
    </div>
  );
}
