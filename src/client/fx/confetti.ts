// ===== 紙吹雪（依存なしのcanvas実装） =====
import { reducedMotion } from './sound';

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; shape: 0 | 1 | 2; life: number }
let canvas: HTMLCanvasElement | null = null;
let parts: P[] = [];
let raf = 0;

const COLORS = ['#f5c542', '#ff4d6d', '#22d3a6', '#4da3ff', '#b77dff', '#ffffff'];

function ensure() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.appendChild(canvas);
  const resize = () => { canvas!.width = innerWidth * devicePixelRatio; canvas!.height = innerHeight * devicePixelRatio; };
  resize();
  addEventListener('resize', resize);
  return canvas;
}

function loop() {
  const c = canvas!;
  const ctx = c.getContext('2d')!;
  const dpr = devicePixelRatio;
  ctx.clearRect(0, 0, c.width, c.height);
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += 0.18; p.vx *= 0.99; p.vy *= 0.99;
    p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    ctx.save();
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.r);
    ctx.scale(1, Math.cos(p.r * 2));
    ctx.fillStyle = p.c;
    if (p.shape === 0) ctx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr);
    else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.w * dpr / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.font = `${p.w * 2.2 * dpr}px sans-serif`; ctx.fillText('¥', 0, 0); }
    ctx.restore();
  }
  if (parts.length) raf = requestAnimationFrame(loop);
  else { ctx.clearRect(0, 0, c.width, c.height); raf = 0; }
}

/** 紙吹雪を出す。kind=money で札束・コイン多め */
export function confetti(opts: { count?: number; x?: number; y?: number; spread?: number; angle?: number; kind?: 'party' | 'money' } = {}) {
  if (reducedMotion()) return;
  ensure();
  const n = opts.count ?? 120;
  const x0 = opts.x ?? innerWidth / 2;
  const y0 = opts.y ?? innerHeight * 0.35;
  for (let i = 0; i < n; i++) {
    const a = (opts.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opts.spread ?? 2.2);
    const v = 7 + Math.random() * 9;
    const money = opts.kind === 'money';
    parts.push({
      x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      w: money ? 10 + Math.random() * 6 : 6 + Math.random() * 6, h: money ? 5 + Math.random() * 3 : 3 + Math.random() * 5,
      c: money ? (Math.random() < 0.5 ? '#f5c542' : '#3ecf8e') : COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: money ? (Math.random() < 0.25 ? 2 : 0) : (Math.random() < 0.3 ? 1 : 0), life: 260,
    });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}

/** 両サイドからのキャノン */
export function cannons() {
  confetti({ x: 0, y: innerHeight * 0.75, angle: -Math.PI / 3, spread: 0.9, count: 90 });
  setTimeout(() => confetti({ x: innerWidth, y: innerHeight * 0.75, angle: -Math.PI * 2 / 3, spread: 0.9, count: 90 }), 120);
}
