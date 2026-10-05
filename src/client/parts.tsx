// ===== チュートリアル・極秘ファイル =====
import { useState } from 'react';
import { CARDS, SPY_ORDER_DESC, SPY_ORDER_NAME } from '../logic/config';
import { pendingSpies } from '../logic/game';
import type { Company, SpyOrder } from '../logic/types';
import type { PlayerView } from '../logic/view';
import { CardTile } from './BidTab';
import { sfx } from './fx/sound';

const TUT_KEY = 'ipo_tutorial_done';
const STEPS: Record<'bid' | 'dev', { t: string; d: string }[]> = {
  bid: [
    { t: 'ようこそ、社長！', d: '1期は「入札」と「開発」の2フェーズ。ここは入札フェーズです。全員がこっそり決めて、そろったら一斉に結果発表！' },
    { t: '① 案件に入札', d: '案件カードの「100%〜50%」を選ぶと入札。一番安い会社が落札します。評判が高いと少し有利。必要スキルが足りるかもチェック！' },
    { t: '② エンジニアを採用', d: '採用候補に契約金を出すと、一番高く出した会社が採用。社員が増えると大きな案件をこなせます（給料に注意）。' },
    { t: '③ 作戦カード', d: '手札から1枚だけ使えます。赤は妨害、オレンジは自分強化。青い防御カードは持っているだけで自動発動します。' },
    { t: '④ 決定！', d: '準備ができたら画面下の「決定」。全員が決定すると結果発表が始まります。' },
  ],
  dev: [
    { t: '開発フェーズ', d: '落札した案件に社員を割り当てます。必要スキルをすべて満たすと進捗+1。進むたびに中間金、完了すると残りの報酬が入ります。' },
    { t: '割り当てのコツ', d: '「空いている人で埋める」で自動配置もできます。突貫にすると2進むけど負債+2。負債がたまると障害が起きます。' },
    { t: '自社サービス', d: '300万円で立ち上げると、社員を付けるほどLvが上がり毎期の収入に。最終決算ではLv×300万円の価値！' },
  ],
};

export function Coach({ phase, q }: { phase: 'bid' | 'dev'; q: number }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(() => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return true; } });
  if (done || q > 0) return null;
  const steps = STEPS[phase];
  if (i >= steps.length) return null;
  const s = steps[i];
  const finish = () => { try { localStorage.setItem(TUT_KEY, '1'); } catch { /* 無視 */ } setDone(true); };
  return (
    <div className="coach" role="note">
      <div className="row"><b>{s.t}</b><span className="grow" /><span style={{ fontSize: 11, opacity: .85 }}>{i + 1}/{steps.length}</span></div>
      <p>{s.d}</p>
      <div className="row">
        <button className="btn xs" onClick={finish}>チュートリアルを終わる</button>
        <span className="grow" />
        <button className="btn xs" onClick={() => { sfx.tap(); if (i + 1 >= steps.length && phase === 'dev') finish(); setI(i + 1); }}>{i + 1 >= steps.length ? 'OK！' : '次へ ▶'}</button>
      </div>
    </div>
  );
}

const ORDERS: SpyOrder[] = ['intel', 'sabo', 'steal'];

export function SecretFile({ v, me, orders, setOrder, locked, open }: {
  v: PlayerView; me: Company; orders: Record<string, SpyOrder>; setOrder: (eid: string, o: SpyOrder) => void; locked: boolean; open: boolean;
}) {
  const g = v.game;
  const pend = pendingSpies(g, me.id);
  const agents = g.companies.filter(c => c.id !== me.id).flatMap(c => c.engineers.filter(e => e.spy && e.spy.for === me.id).map(e => ({ e, at: c })));
  const intel = Object.entries(v.intel);
  const notes = [...me.secretNotes].reverse();
  const count = pend.length + agents.length + notes.length;
  if (!count && !intel.length && !me.sleeper) return null;
  return (
    <details className="fold secret" open={open || undefined}>
      <summary>🕵️ 極秘ファイル {pend.length > 0 && <span className="chip down">指令待ち {pend.length}</span>}</summary>
      <div className="fold-body">
        {pend.map(({ engineer, at }) => (
          <div className="card" key={engineer.id}>
            <b>{engineer.name}</b>（{at.name}に潜入中）への指令を選んでください
            <div className="seg" style={{ marginTop: 8 }}>
              {ORDERS.map(o => <button key={o} disabled={locked} className={orders[engineer.id] === o ? 'on' : ''} onClick={() => { sfx.tap(); setOrder(engineer.id, o); }}>{SPY_ORDER_NAME[o]}</button>)}
            </div>
            <div className="note" style={{ marginTop: 6 }}>{orders[engineer.id] ? SPY_ORDER_DESC[orders[engineer.id]] : '指令はこのフェーズの提出で確定します'}</div>
          </div>
        ))}
        {agents.filter(a => a.e.spy?.order).map(({ e, at }) => (
          <div className="member" key={e.id}><span className="tagx spy">潜入中</span><span className="nm">{e.name}</span><span className="grow note">{at.name}・{SPY_ORDER_NAME[e.spy!.order!]}</span></div>
        ))}
        {intel.map(([cid, info]) => {
          const c = g.companies.find(x => x.id === cid)!;
          return (
            <div className="card" key={cid}>
              <b>📡 {c.name}の内部情報</b>
              <div className="note" style={{ margin: '6px 0' }}>手札 {info.hand.length}枚</div>
              <div className="hand">{info.hand.map((k, i) => <CardTile key={i} k={k} mini />)}</div>
              {info.bid ? (
                <div className="note">
                  今期の提出済み入札：
                  {Object.entries(info.bid.bids).map(([pid, pct]) => <div key={pid}>・{g.market.find(p => p.id === pid)?.name || '案件'} … {pct}%</div>)}
                  {Object.entries(info.bid.hires).map(([eid, fee]) => <div key={eid}>・採用 {g.pool.find(e => e.id === eid)?.name || '候補'} … {fee}万</div>)}
                  {info.bid.card && <div>・作戦カード：{CARDS[info.bid.card].name}{info.bid.target ? ` → ${g.companies.find(x => x.id === info.bid!.target)?.name}` : ''}</div>}
                  {!Object.keys(info.bid.bids).length && !Object.keys(info.bid.hires).length && !info.bid.card && <div>・何もしない</div>}
                </div>
              ) : <div className="note">{g.phase === 'bid' ? 'まだ入札を提出していません' : '入札フェーズに提出内容が見えます'}</div>}
            </div>
          );
        })}
        {me.sleeper && <div className="infobar">🛌 潜伏スパイ：{me.engineers.find(e => e.id === me.sleeper!.engineerId)?.name}（引き抜かれたら「{SPY_ORDER_NAME[me.sleeper.order]}」）</div>}
        <div className="note" style={{ marginTop: 8 }}>レンタルに付けられるスパイ指令：残り {me.spyOrdersLeft}回</div>
        {notes.map((n, i) => <div className="logline" key={i}>{n}</div>)}
      </div>
    </details>
  );
}
