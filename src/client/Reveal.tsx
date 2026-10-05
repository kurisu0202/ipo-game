// ===== 結果発表の全画面演出 =====
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reveal as RevealData, RevealBlock } from '../logic/types';
import { cannons, confetti } from './fx/confetti';
import { buzz, reducedMotion, sfx, unlockAudio } from './fx/sound';

type Step = { b: number; kind: 'head' | 'line' | 'flip' | 'tremble' | 'stamp'; i: number; wait: number };

function timeline(blocks: RevealBlock[]): Step[] {
  const out: Step[] = [];
  blocks.forEach((bl, b) => {
    out.push({ b, kind: 'head', i: 0, wait: 450 });
    bl.lines.forEach((_, i) => out.push({ b, kind: 'line', i, wait: 320 }));
    const flips = bl.flips || [];
    flips.forEach((_, i) => {
      const last = i === flips.length - 1;
      if (last && flips.length >= 2) out.push({ b, kind: 'tremble', i, wait: 1300 });
      out.push({ b, kind: 'flip', i, wait: last ? 650 : 520 });
    });
    out.push({ b, kind: 'stamp', i: 0, wait: bl.stamp.type === 'ipo' ? 2600 : bl.stamp.type === 'none' || bl.stamp.type === 'info' ? 800 : 1150 });
  });
  return out;
}

export function Reveal({ data, me, onClose, closeLabel }: { data: RevealData; me: string; onClose: () => void; closeLabel: string }) {
  const [mode, setMode] = useState<'ready' | 'count' | 'show' | 'done'>('ready');
  const [count, setCount] = useState<number | 'OPEN'>(3);
  const [pos, setPos] = useState(-1);
  const [flash, setFlash] = useState<{ k: number; c: string } | null>(null);
  const [shake, setShake] = useState(false);
  const steps = useMemo(() => timeline(data.blocks), [data]);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rm = reducedMotion();

  const doFlash = (c: string) => setFlash(f => ({ k: (f?.k || 0) + 1, c }));
  const doShake = () => { if (rm) return; setShake(false); requestAnimationFrame(() => setShake(true)); setTimeout(() => setShake(false), 480); };

  // カウントダウン
  const begin = () => {
    unlockAudio();
    setMode('count');
    const seq: (number | 'OPEN')[] = [3, 2, 1, 'OPEN'];
    seq.forEach((n, i) => setTimeout(() => {
      setCount(n);
      if (n === 'OPEN') { sfx.open(); doFlash('#ffffff'); buzz(80); }
      else { sfx.don(); buzz(40); }
    }, i * 850));
    setTimeout(() => { setMode('show'); setPos(0); }, seq.length * 850 + 250);
  };

  // 1ステップずつ進める
  useEffect(() => {
    if (mode !== 'show') return;
    if (pos >= steps.length) { setMode('done'); return; }
    const s = steps[pos];
    effect(s);
    timer.current = setTimeout(() => setPos(p => p + 1), s.wait);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pos]);

  // 新しいブロックが出たらスクロール
  useEffect(() => {
    if (mode !== 'show') return;
    const s = steps[pos];
    if (!s) return;
    const el = wrap.current?.querySelector(`[data-b="${s.b}"]`);
    el?.scrollIntoView({ behavior: rm ? 'auto' : 'smooth', block: 'center' });
  }, [pos, mode, steps, rm]);

  function effect(s: Step) {
    const bl = data.blocks[s.b];
    if (s.kind === 'head') sfx.tick();
    if (s.kind === 'line') {
      const l = bl.lines[s.i];
      if (l.text.includes('💰')) { sfx.coin(); }
      else if (l.tone === 'bad') sfx.tick();
    }
    if (s.kind === 'tremble') sfx.roll(1.2);
    if (s.kind === 'flip') sfx.flip();
    if (s.kind === 'stamp') {
      const t = bl.stamp.type;
      sfx.stamp();
      const mine = bl.owner === me;
      switch (t) {
        case 'hit': case 'spy': doFlash('#ff2d55'); doShake(); sfx.alarm(); buzz([60, 40, 90]); break;
        case 'block': doFlash('#22e3a0'); sfx.shield(); buzz(30); break;
        case 'reflect': doFlash('#3d8bff'); sfx.reflect(); buzz([20, 30, 20]); break;
        case 'win': case 'close': sfx.fanfare(); confetti({ count: t === 'close' ? 160 : 110 }); if (t === 'close') doShake(); break;
        case 'hire': sfx.coin(); break;
        case 'money': sfx.coin(); sfx.fanfare(); confetti({ kind: 'money', count: 120 }); break;
        case 'loss': sfx.sad(); if (mine) doFlash('#ff2d55'); break;
        case 'trophy': sfx.fanfare(); confetti({ count: 100 }); break;
        case 'ipo': sfx.bell(); doFlash('#ffd34d'); cannons(); setTimeout(() => { cannons(); confetti({ kind: 'money', count: 160 }); }, 900); buzz([100, 80, 200]); break;
        default: break;
      }
    }
  }

  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    setMode('done');
    setPos(steps.length);
  };

  const visible = (b: number) => mode === 'done' || steps.findIndex(s => s.b === b) <= pos;
  const reached = (b: number, kind: Step['kind'], i: number) => {
    if (mode === 'done') return true;
    const idx = steps.findIndex(s => s.b === b && s.kind === kind && s.i === i);
    return idx >= 0 && idx <= pos;
  };
  const trembling = (b: number, i: number) => {
    if (mode !== 'show') return false;
    const s = steps[pos];
    return !!s && s.b === b && s.kind === 'tremble' && s.i === i;
  };

  if (mode === 'ready') {
    return (
      <div className="reveal">
        <div className="ready-wrap">
          <div style={{ fontSize: 13, letterSpacing: '.3em', opacity: .7 }}>RESULTS</div>
          <div className="reveal-title">{data.title}</div>
          <button className="big-btn" onClick={begin}>発表！</button>
          <button className="btn sm" onClick={() => { unlockAudio(); skip(); }}>演出なしで見る</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`reveal ${shake ? 'shake' : ''}`} ref={wrap}>
      {mode === 'count' && (
        <div className="countdown">{count === 'OPEN' ? <div className="open" key="o">OPEN!</div> : <div className="n" key={count}>{count}</div>}</div>
      )}
      {flash && <div className="flashfx" key={flash.k} style={{ background: flash.c }} />}
      {(mode === 'show') && <button className="btn sm skip" onClick={skip}>スキップ ⏭</button>}
      {mode !== 'count' && (
        <div className="reveal-in">
          <div className="reveal-title">{data.title}</div>
          <div className="reveal-sub">{data.kind === 'bid' ? '作戦カード → 同情票 → レンタル → 落札 → 採用' : data.kind === 'dev' ? '各社の決算とイベント' : '現金・サービス・株を合計して順位を決定'}</div>
          {data.headlines.length > 0 && (
            <div className="headline"><div className="hh">NEWS 速報</div>{data.headlines.slice(0, 4).map((h, i) => <div key={i}>{h}</div>)}</div>
          )}
          {data.blocks.map((bl, b) => visible(b) && (
            <div key={b} data-b={b} className={`rblock ${bl.owner === me ? 'me' : ''} ${reached(b, 'stamp', 0) ? 'has-stamp' : ''}`}>
              <div className="rh"><span className="ic">{bl.icon}</span><div className="grow"><b>{bl.title}</b>{bl.sub && <small>{bl.sub}</small>}</div></div>
              {bl.lines.map((l, i) => reached(b, 'line', i) && <div key={i} className={`rline ${l.tone || ''}`} style={l.big ? { fontSize: 16 } : undefined}>{l.text}</div>)}
              {bl.flips && bl.flips.length > 0 && (
                <div className="flips">
                  {bl.flips.map((f, i) => (
                    <div key={i} className={`flip ${reached(b, 'flip', i) ? 'open' : ''} ${f.win ? 'win' : ''} ${trembling(b, i) ? 'tremble' : ''}`}>
                      <div className="flip-in">
                        <div className="face-f">？</div>
                        <div className="face-b"><span>{f.label}</span><span className="v">{f.value}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {reached(b, 'stamp', 0) && <div className={`stamp ${bl.stamp.tone || 'muted'} ${bl.stamp.type === 'ipo' ? 'ipo' : ''}`}>{bl.stamp.text}</div>}
            </div>
          ))}
        </div>
      )}
      {mode === 'done' && (
        <div className="reveal-bottom"><button className={`btn big ${data.kind === 'final' ? 'gold' : 'primary'}`} onClick={() => { sfx.tap(); onClose(); }}>{closeLabel}</button></div>
      )}
    </div>
  );
}
