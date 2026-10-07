// ===== 社員の顔アイコン（名前から決まる、かんたんな似顔絵） =====
//  同じ名前なら必ず同じ顔。髪型・髪色・肌・目・口・メガネ・背景の組み合わせで見分けやすくする。

// 名前 → 何度でも取り出せる疑似乱数
function seq(name: string) {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return (n: number) => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % n); };
}

const BG = ['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0c4ff', '#ffadad', '#d0f4de', '#e4c1f9'];
const SKIN = ['#fde0c5', '#f7cfa9', '#eab88f', '#d69c6f', '#b97a50', '#8d5a3b'];
const HAIR = ['#1f1a17', '#3b2a20', '#5a3825', '#8a5a2b', '#c58b3a', '#e3c16f', '#9e9e9e', '#c0392b', '#3d5a99', '#6b3fa0'];
const SHIRT = ['#2d6cdf', '#20a46b', '#e05a5a', '#f2a65a', '#6c5ce7', '#2b2d42', '#00a8a8', '#d35d9e'];

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const r = seq(name);
  const bg = BG[r(BG.length)], skin = SKIN[r(SKIN.length)], hair = HAIR[r(HAIR.length)], shirt = SHIRT[r(SHIRT.length)];
  const style = r(8), eyes = r(4), mouth = r(4);
  const glasses = r(10) < 3, blush = r(10) < 4, beard = style !== 4 && style !== 5 && r(10) < 1;
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={name}>
      <title>{name}</title>
      <circle cx="20" cy="20" r="20" fill={bg} />
      {/* 後ろ髪（長い髪・ボブ・おだんご） */}
      {style === 4 && <path d="M8 19 Q8 8 20 8 Q32 8 32 19 L32 33 Q26 30 20 30 Q14 30 8 33 Z" fill={hair} />}
      {style === 5 && <path d="M9 19 Q9 8 20 8 Q31 8 31 19 L31 27 Q20 29 9 27 Z" fill={hair} />}
      {style === 6 && <circle cx="20" cy="6.5" r="4.2" fill={hair} />}
      {/* 体 */}
      <path d="M6 40 Q7 30 20 30 Q33 30 34 40 Z" fill={shirt} />
      <path d="M17 30 L20 34 L23 30 Z" fill="#fff" opacity=".85" />
      {/* 首と顔 */}
      <rect x="17" y="25" width="6" height="6" rx="2" fill={skin} />
      <ellipse cx="20" cy="19" rx="9.5" ry="10.5" fill={skin} />
      <ellipse cx="10.6" cy="20" rx="1.6" ry="2.2" fill={skin} />
      <ellipse cx="29.4" cy="20" rx="1.6" ry="2.2" fill={skin} />
      {/* 前髪 */}
      {style === 0 && <path d="M10.5 17 Q10 8.5 20 8.5 Q30 8.5 29.5 17 Q26 12 20 12.5 Q14 12 10.5 17 Z" fill={hair} />}
      {style === 1 && <path d="M10.5 17 L11 10 L14 12 L15.5 7.5 L18.5 11 L20.5 6.5 L23 10.8 L25.5 7.5 L26.5 12 L29 10 L29.5 17 Q25 12.5 20 13 Q15 12.5 10.5 17 Z" fill={hair} />}
      {style === 2 && <path d="M10.5 18 Q10 8 21 8.5 Q30.5 9 29.5 18 Q28 13 22 12.5 Q18 15 10.5 18 Z" fill={hair} />}
      {style === 3 && <path d="M11.5 15 Q12 9 20 9 Q28 9 28.5 15 Q24 12 20 12 Q16 12 11.5 15 Z" fill={hair} opacity=".55" />}
      {(style === 4 || style === 5) && <path d="M10.5 19 Q10 8.5 20 8.5 Q30 8.5 29.5 19 Q28 13 23 12 Q20 14.5 15 13 Q12 14 10.5 19 Z" fill={hair} />}
      {style === 6 && <path d="M10.5 17 Q10 9 20 9 Q30 9 29.5 17 Q25 12.5 20 12.5 Q15 12.5 10.5 17 Z" fill={hair} />}
      {style === 7 && <><path d="M9.5 15.5 Q10 7.5 20 7.5 Q30 7.5 30.5 15.5 Z" fill={shirt} /><rect x="8" y="14.3" width="24" height="2.6" rx="1.3" fill={shirt} /><circle cx="20" cy="9.5" r="1.2" fill="#fff" opacity=".8" /></>}
      {/* 目 */}
      {eyes === 0 && <><circle cx="16.3" cy="19.5" r="1.3" fill="#222" /><circle cx="23.7" cy="19.5" r="1.3" fill="#222" /></>}
      {eyes === 1 && <><path d="M14.8 20 Q16.3 18.3 17.8 20" stroke="#222" strokeWidth="1.2" fill="none" strokeLinecap="round" /><path d="M22.2 20 Q23.7 18.3 25.2 20" stroke="#222" strokeWidth="1.2" fill="none" strokeLinecap="round" /></>}
      {eyes === 2 && <><ellipse cx="16.3" cy="19.4" rx="1.4" ry="1.8" fill="#222" /><ellipse cx="23.7" cy="19.4" rx="1.4" ry="1.8" fill="#222" /><circle cx="16.8" cy="18.8" r=".5" fill="#fff" /><circle cx="24.2" cy="18.8" r=".5" fill="#fff" /></>}
      {eyes === 3 && <><path d="M15 19.6 L17.6 19.6" stroke="#222" strokeWidth="1.3" strokeLinecap="round" /><path d="M22.4 19.6 L25 19.6" stroke="#222" strokeWidth="1.3" strokeLinecap="round" /></>}
      {/* メガネ */}
      {glasses && <g stroke="#333" strokeWidth=".9" fill="rgba(255,255,255,.25)"><circle cx="16.3" cy="19.5" r="3" /><circle cx="23.7" cy="19.5" r="3" /><path d="M19.3 19.5 L20.7 19.5" /></g>}
      {/* ほっぺ */}
      {blush && <><ellipse cx="13.8" cy="22.8" rx="1.6" ry="1" fill="#ff7b7b" opacity=".45" /><ellipse cx="26.2" cy="22.8" rx="1.6" ry="1" fill="#ff7b7b" opacity=".45" /></>}
      {/* 口 */}
      {mouth === 0 && <path d="M17.3 24.3 Q20 26.6 22.7 24.3" stroke="#7a3b2e" strokeWidth="1.2" fill="none" strokeLinecap="round" />}
      {mouth === 1 && <path d="M17.2 24 Q20 27.8 22.8 24 Z" fill="#7a3b2e" />}
      {mouth === 2 && <path d="M18 25 L22 25" stroke="#7a3b2e" strokeWidth="1.2" strokeLinecap="round" />}
      {mouth === 3 && <ellipse cx="20" cy="25" rx="1.3" ry="1.1" fill="#7a3b2e" />}
      {beard && <path d="M12.5 23 Q13 30 20 30.5 Q27 30 27.5 23 Q24 27 20 27 Q16 27 12.5 23 Z" fill={hair} opacity=".85" />}
    </svg>
  );
}
