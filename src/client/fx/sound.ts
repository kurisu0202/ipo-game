// ===== 効果音（Web Audioで合成）と振動 =====
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const KEY = 'ipo_sound';
export let soundOn = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
export function setSound(on: boolean) {
  soundOn = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 無視 */ }
}

/** タップを起点に呼ぶ（ブラウザの自動再生制限のため） */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready() { return soundOn && ctx && master ? ctx : null; }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.4, at = 0, slideTo?: number) {
  const c = ready(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.3, at = 0, filter = 1200, q = 0.8) {
  const c = ready(); if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filter;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(t);
}

export const sfx = {
  /** 和太鼓のドン */
  don() { tone(140, 0.45, 'sine', 0.9, 0, 55); noise(0.12, 0.35, 0, 300, 1.2); },
  tick() { tone(1200, 0.05, 'square', 0.12); },
  tap() { tone(660, 0.06, 'triangle', 0.15); },
  /** ドラムロール */
  roll(sec = 1.2) {
    const n = Math.floor(sec / 0.045);
    for (let i = 0; i < n; i++) noise(0.05, 0.12 + (i / n) * 0.25, i * 0.045, 2200, 0.6);
  },
  /** カード（裏向き）をめくる */
  flip() { noise(0.08, 0.25, 0, 3500, 1.5); tone(520, 0.08, 'triangle', 0.1, 0.02); },
  /** ファンファーレ */
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.18, i * 0.11));
    tone(1047, 0.7, 'square', 0.14, 0.45);
    tone(1319, 0.7, 'square', 0.1, 0.45);
    tone(784, 0.7, 'sawtooth', 0.1, 0.45);
  },
  /** 警告音 */
  alarm() { [0, 0.18, 0.36].forEach(t => tone(880, 0.12, 'square', 0.22, t, 440)); },
  /** シールド音 */
  shield() { tone(400, 0.5, 'sine', 0.25, 0, 1600); tone(1200, 0.5, 'triangle', 0.12, 0.05, 2400); noise(0.3, 0.08, 0, 6000, 2); },
  /** 跳ね返し */
  reflect() { tone(1500, 0.2, 'triangle', 0.25, 0, 500); tone(500, 0.25, 'triangle', 0.25, 0.15, 1500); },
  /** コイン */
  coin() { tone(988, 0.08, 'square', 0.18); tone(1319, 0.35, 'square', 0.18, 0.08); },
  /** ハンコをドンと押す */
  stamp() { tone(90, 0.25, 'sine', 0.8, 0, 50); noise(0.1, 0.4, 0, 500, 1); },
  /** 上場の鐘（カーン） */
  bell() {
    [523, 1046, 1568, 2093].forEach((f, i) => tone(f, 2.4 - i * 0.4, 'sine', 0.35 / (i + 1)));
    tone(523 * 2.76, 1.2, 'sine', 0.08);
  },
  /** 白フラッシュの「シャーン」 */
  open() { noise(0.6, 0.25, 0, 5000, 0.4); tone(1760, 0.6, 'triangle', 0.12, 0, 3520); },
  sad() { tone(392, 0.25, 'triangle', 0.2); tone(349, 0.25, 'triangle', 0.2, 0.22); tone(330, 0.5, 'triangle', 0.2, 0.44); },
};

export function buzz(pattern: number | number[]) {
  if (!soundOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* 非対応 */ }
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
