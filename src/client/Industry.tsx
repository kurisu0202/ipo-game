// ===== 業種：選ぶ画面と表示用のチップ =====
import { useState } from 'react';
import { INDUSTRIES, SPECIALS } from '../logic/config';
import type { Company, IndustryKey, PickSubmit } from '../logic/types';
import { sfx } from './fx/sound';
import type { Snapshot } from './session';

/** 会社の業種チップ（例：🏢 SIer） */
export function IndustryChip({ c, full }: { c: Pick<Company, 'industry'>; full?: boolean }) {
  if (!c.industry) return null;
  const s = INDUSTRIES[c.industry];
  return <span className="chip ind" title={s.plan}>{s.icon} {full ? s.name : s.name.replace(/（.*）/, '')}</span>;
}

/** 業種の得意・弱点の一覧 */
export function IndustryDetail({ k }: { k: IndustryKey }) {
  const s = INDUSTRIES[k];
  return (
    <ul className="ind-list">
      {s.good.map(t => <li key={t} className="up">◎ {t}</li>)}
      {s.bad.map(t => <li key={t} className="down">△ {t}</li>)}
      <li className="special">{SPECIALS[k].icon} 必殺技「{SPECIALS[k].name}」（1ゲーム1回・{SPECIALS[k].phase === 'bid' ? '入札' : '開発'}フェーズ）：{SPECIALS[k].desc}</li>
    </ul>
  );
}

export function PickScreen({ snap, onSubmit, onCancel, onExit }: { snap: Snapshot; onSubmit: (d: PickSubmit) => void; onCancel: () => void; onExit: () => void }) {
  const v = snap.view!;
  const g = v.game;
  const me = g.companies.find(c => c.id === snap.me)!;
  const mine = (v.mySubmit as PickSubmit | null)?.industry;
  const [sel, setSel] = useState<IndustryKey | undefined>(mine);
  const choices = me.choices || [];
  const done = Object.values(v.submitted).filter(Boolean).length;
  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="終了" onClick={() => { if (confirm(snap.mode === 'local' ? 'ホームに戻りますか？（続きから再開できます）' : 'ゲームから抜けますか？（同じルームIDと会社名で戻れます）')) onExit(); }}>✕</button>
        <h1>業種を選ぶ</h1><span style={{ width: 40 }} />
      </div>
      <p className="note" style={{ margin: '0 2px 12px' }}><b>{me.name}</b> の業種を6つの中から選んでください（他社と同じでもOK）。業種ごとに、1ゲームに1回だけ使える<b>必殺技</b>があります。全社がそろったら一斉に発表します。</p>
      {choices.map(k => {
        const s = INDUSTRIES[k];
        const on = (mine || sel) === k;
        return (
          <button key={k} className={`card ind-card ${on ? 'selected' : ''}`} disabled={!!mine} onClick={() => { sfx.tap(); setSel(k); }}>
            <div className="row"><span className="ind-icon">{s.icon}</span><div className="grow"><b className="ind-name">{s.name}</b><div className="note">作戦：{s.plan}</div></div>
              <span className="check" style={{ color: 'var(--accent)' }}>{on ? '✓' : ''}</span></div>
            <IndustryDetail k={k} />
          </button>
        );
      })}
      <div className="fixed-bottom">
        {mine
          ? <div className="row"><div className="card grow" style={{ textAlign: 'center', margin: 0 }}>{snap.mode === 'online' ? `他社を待っています…（${done}/${g.companies.length}）` : '決定しました'}</div>
            {snap.mode === 'online' && <button className="btn" onClick={onCancel}>取り消す</button>}</div>
          : <button className="btn primary big" disabled={!sel} onClick={() => { if (sel) { sfx.tap(); onSubmit({ industry: sel }); } }}>{sel ? `${INDUSTRIES[sel].icon} ${INDUSTRIES[sel].name}で創業！` : '業種を選んでください'}</button>}
      </div>
    </div>
  );
}
