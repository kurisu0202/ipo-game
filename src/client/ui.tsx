// ===== 共通の小さな部品 =====
import { Avatar } from './Avatar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SKILLS, SKILL_ICON, SKILL_NAME } from '../logic/config';
import type { Game, Skill, Skills } from '../logic/types';

export const companyColor = (g: Game, id: string) => `var(--c${Math.max(0, g.companies.findIndex(c => c.id === id)) % 4})`;

/** 社員の顔（名前から決まる似顔絵） */
export function Face({ name, size = 30 }: { name: string; size?: number }) {
  return <span className="face" style={{ width: size, height: size }}><Avatar name={name} size={size} /></span>;
}

export function LogoMark({ g, id, name }: { g: Game; id: string; name: string }) {
  return <span className="logo-mark" style={{ background: companyColor(g, id) }}>{[...name][0]}</span>;
}

/** スキルの表示。base（本来の値）を渡すと、今期だけ下がっているスキルを「1→0」と赤で出す（0 になっても消さない） */
export function SkillChips({ skills, need, highlight, base, why }: { skills: Skills; need?: Skills; highlight?: Partial<Record<Skill, 'ok' | 'short'>>; base?: Skills; why?: string }) {
  return (
    <span className="chips">
      {SKILLS.filter(k => skills[k] || base?.[k]).map(k => {
        const down = base && (skills[k] || 0) < (base[k] || 0);
        return (
          <span key={k} className={`skill ${highlight?.[k] || ''} ${down ? 'reduced' : ''}`} title={down ? `${SKILL_NAME[k]}：本来${base![k]}、今期は${skills[k] || 0}${why ? `（${why}）` : ''}` : SKILL_NAME[k]}>
            {SKILL_ICON[k]} {SKILL_NAME[k]} {down ? <><s>{base![k]}</s>→<b>{skills[k] || 0}</b></> : <b>{skills[k]}</b>}{need?.[k] !== undefined ? <span className="faint">/{need[k]}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

/** タップと長押しを分けて受け取るボタン（一覧の中でも使えるように部品にしたもの） */
export function PressButton({ onTap, onLong, children, ...rest }: { onTap?: () => void; onLong: () => void; children: ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const lp = useLongPress(onLong, onTap);
  return <button {...rest} {...lp}>{children}</button>;
}

export function Money({ v, signed, className = '' }: { v: number; signed?: boolean; className?: string }) {
  const s = signed ? (v > 0 ? '+' : v < 0 ? '−' : '±') : v < 0 ? '−' : '';
  return <span className={`num ${className}`}>{s}{Math.abs(Math.round(v)).toLocaleString('ja-JP')}<small>万円</small></span>;
}

/** 数字が変わるときにカウントアップする */
export function CountUp({ v, className = '' }: { v: number; className?: string }) {
  const [shown, setShown] = useState(v);
  const from = useRef(v);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (v - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = v;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <span className={`num ${className}`}>{shown < 0 ? '−' : ''}{Math.abs(shown).toLocaleString('ja-JP')}</span>;
}

export function Sheet({ onClose, children, title, sub }: { onClose: () => void; children: ReactNode; title?: ReactNode; sub?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grip" />
        {title && <h2>{title}</h2>}
        {sub && <div className="note" style={{ marginBottom: 8 }}>{sub}</div>}
        {children}
        <div className="sheet-actions"><button className="btn grow" onClick={onClose}>閉じる</button></div>
      </div>
    </>
  );
}

/** 長押し（またはタップ）で詳細を出すためのハンドラ */
export function useLongPress(onLong: () => void, onTap?: () => void, ms = 420) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => { fired.current = false; timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong(); }, ms); };
  const end = () => { if (timer.current) clearTimeout(timer.current); };
  return {
    onPointerDown: start, onPointerUp: end, onPointerLeave: end, onPointerCancel: end,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); },
    onClick: () => { if (!fired.current) onTap?.(); },
  };
}

export function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="toast" role="status">{msg}</div>;
}

export function Sparkline({ values, color = 'var(--up)', height = 56 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values, 0), max = Math.max(...values);
  const w = 300, h = height;
  const pts = values.map((v, i) => [i / (values.length - 1) * w, h - 6 - (v - min) / Math.max(1, max - min) * (h - 12)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const zero = h - 6 - (0 - min) / Math.max(1, max - min) * (h - 12);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      {min < 0 && <line x1="0" x2={w} y1={zero} y2={zero} stroke="var(--line2)" strokeDasharray="4 4" />}
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
