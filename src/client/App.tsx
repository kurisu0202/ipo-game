// ===== アプリ本体：画面の切り替えと結果発表 =====
import { useEffect, useMemo, useState } from 'react';
import { GameScreen } from './Game';
import { Reveal } from './Reveal';
import { Home, LocalSetup, Lobby, OnlineJoin, PassScreen, Splash } from './screens';
import { LocalSession, OnlineSession, clearLocal, hasJoined, savedLocal, useSession, type Session } from './session';
import { Toast } from './ui';
import { PickScreen } from './Industry';

type Screen = 'home' | 'local' | 'online' | 'game';

const seenKey = (s: Session) => { const sn = s.get(); return `ipo_seen_${sn.mode}_${sn.room || 'local'}_${sn.view?.game.id || ''}`; };

export default function App() {
  const [splash, setSplash] = useState(true);
  // URLにルームIDがあり、この端末で入ったことがあればリロード後に自動で再入室する
  const autoRoom = (() => {
    const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    try { const name = localStorage.getItem('ipo_name'); if (room && name && hasJoined(room)) return { room, name }; } catch { /* 無視 */ }
    return null;
  })();
  const [screen, setScreen] = useState<Screen>(() => (autoRoom ? 'game' : new URLSearchParams(location.search).get('room') ? 'online' : 'home'));
  const [session, setSession] = useState<Session | null>(() => (autoRoom ? new OnlineSession(autoRoom.room, autoRoom.name) : null));
  const resume = useMemo(() => savedLocal(), [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => {
    session?.leave();
    setSession(null);
    setScreen('home');
    history.replaceState(null, '', location.pathname);
  };

  return (
    <div className="app">
      {screen === 'home' && <Home online={location.protocol !== 'file:'} resume={resume}
        onResume={() => { setSession(new LocalSession(null, resume!)); setScreen('game'); }}
        onLocal={() => setScreen('local')} onOnline={() => setScreen('online')} />}
      {screen === 'local' && <LocalSetup onBack={() => setScreen('home')} onStart={(names, quarters) => { clearLocal(); setSession(new LocalSession(names, undefined, quarters)); setScreen('game'); }} />}
      {screen === 'online' && <OnlineJoin onBack={() => setScreen('home')} onJoin={(room, name) => {
        history.replaceState(null, '', `?room=${room}`);
        setSession(new OnlineSession(room, name)); setScreen('game');
      }} />}
      {screen === 'game' && session && <Playing session={session} onExit={leave} />}
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  );
}

function Playing({ session, onExit }: { session: Session; onExit: () => void }) {
  const snap = useSession(session);
  const g = snap.view?.game;
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem(seenKey(session)) || 0); } catch { return 0; } });
  // 別のゲームに切り替わったら既読をそのゲームの値に
  const key = seenKey(session);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); try { setSeen(Number(localStorage.getItem(key) || 0)); } catch { setSeen(0); } }

  // 既読がこのゲームの回数より大きいのは、前のゲームの記録が残っているとき → 未読扱い
  const seenHere = g && seen > g.revealSeq ? 0 : seen;
  const showReveal = !!g && !!g.reveal && g.revealSeq > seenHere;
  const markSeen = () => {
    if (!g) return;
    setSeen(g.revealSeq);
    try { localStorage.setItem(key, String(g.revealSeq)); } catch { /* 無視 */ }
  };
  useEffect(() => { scrollTo({ top: 0 }); }, [snap.stage, g?.phase, g?.q]);

  const isHost = snap.lobby?.hostId === snap.me;
  let body: React.ReactNode = null;
  if (snap.stage === 'lobby' || !g) {
    body = <Lobby room={snap.room} lobby={snap.lobby} me={snap.me} connected={snap.connected} onStart={quarters => session.start(quarters)} onLeave={onExit} />;
  } else if (snap.stage === 'pass' && g.phase !== 'end') {
    body = <PassScreen g={g} cid={snap.me} onOpen={() => session.openTurn()} />;
  } else if (g.phase === 'pick') {
    body = <PickScreen key={`pick:${snap.me}`} snap={snap} onSubmit={d => session.submit(d)} onCancel={() => session.cancel()} onExit={onExit} />;
  } else {
    body = <GameScreen key={`${g.q}:${g.phase}:${snap.me}`} snap={snap} isHost={isHost} onSubmit={d => session.submit(d)} onCancel={() => session.cancel()}
      onExit={onExit} onAgain={() => session.again()} onChat={t => session.chat(t)} />;
  }
  return (
    <>
      {body}
      {showReveal && <Reveal key={g!.revealSeq} data={g!.reveal!} me={snap.mode === 'online' ? snap.me : ''} onClose={markSeen}
        closeLabel={g!.reveal!.kind === 'final' ? '最終結果を見る 🔔' : g!.reveal!.kind === 'pick' ? 'ゲーム開始 ▶' : g!.phase === 'bid' ? '次の期へ ▶' : '開発フェーズへ ▶'} />}
      {snap.mode === 'online' && !snap.connected && <Toast msg="📡 再接続中…" />}
      <Toast msg={snap.error} />
    </>
  );
}
