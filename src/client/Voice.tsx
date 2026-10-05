// ===== 社員のひとこと：画面下にときどき出る吹き出し =====
import { useEffect, useRef, useState } from 'react';
import type { Company, Engineer, Game } from '../logic/types';
import { Face } from './ui';
import { pickVoice } from './voices';

const KEY = 'ipo_voice_off';
export const voiceOn = () => { try { return localStorage.getItem(KEY) !== '1'; } catch { return true; } };
export const setVoice = (on: boolean) => { try { localStorage.setItem(KEY, on ? '0' : '1'); } catch { /* 無視 */ } };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function VoiceBubble({ g, me, on }: { g: Game; me: Company; on: boolean }) {
  const [msg, setMsg] = useState<{ e: Engineer; text: string; n: number } | null>(null);
  const recent = useRef<string[]>([]);
  const state = useRef({ g, me });
  state.current = { g, me };

  useEffect(() => {
    if (!on) { setMsg(null); return; }
    let t: ReturnType<typeof setTimeout>;
    let n = 0;
    const speak = () => {
      if (!document.hidden) {
        const v = pickVoice(state.current.g, state.current.me, recent.current);
        if (v) {
          recent.current = [...recent.current, v.key].slice(-40);
          setMsg({ e: v.e, text: v.text, n: ++n });
          setTimeout(() => setMsg(m => (m && m.n === n ? null : m)), 5500);
        }
      }
      t = setTimeout(speak, rand(10000, 18000));
    };
    t = setTimeout(speak, rand(3000, 6000));
    return () => clearTimeout(t);
  }, [on]);

  if (!msg) return null;
  return (
    <div className="voice" key={msg.n} role="status" onClick={() => setMsg(null)}>
      <Face name={msg.e.name} size={34} />
      <div className="vb"><small>{msg.e.name}</small>{msg.text}</div>
    </div>
  );
}
