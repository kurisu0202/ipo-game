// ===== 自社オフィス：マス目の見取り図・増築・改装 =====
import { useState } from 'react';
import { OFFICE, TILES } from '../logic/config';
import { expandCost, officeValue, seats, seatsUsed } from '../logic/calc';
import type { Company, Engineer, Game, TileKind } from '../logic/types';
import { Face, Sheet } from './ui';

export type OfficePlan = { add: TileKind[]; remodel: Record<string, TileKind> };
const KINDS = Object.keys(TILES) as TileKind[];
const lastName = (n: string) => n.split(/\s|　/)[0] || n;

/** 計画（改装・増築）を反映したマスの並びと費用 */
export function planOffice(c: Company, plan?: OfficePlan) {
  const base = c.office?.tiles || [];
  const tiles = [...base];
  let cost = 0;
  for (const [i, k] of Object.entries(plan?.remodel || {})) { const n = Number(i); if (tiles[n] !== undefined && tiles[n] !== k) { tiles[n] = k; cost += OFFICE.remodel; } }
  (plan?.add || []).forEach((k, n) => { tiles.push(k); cost += expandCost(c, n); });
  return { tiles, cost, work: tiles.filter(t => t === 'work').length };
}

/** 席に座る人：自社の社員 → 借りている社員 → 貸し出し中（席だけ確保） */
function seated(g: Game, c: Company): { e: Engineer; away?: string }[] {
  const here = c.engineers.map(e => ({ e }));
  const lent = g.companies.flatMap(o => o.engineers.filter(e => e.loan?.from === c.id).map(e => ({ e, away: o.name })));
  return [...here, ...lent];
}

export function OfficeView({ g, me, plan, editable, onPlan }: { g: Game; me: Company; plan?: OfficePlan; editable?: boolean; onPlan?: (p: OfficePlan) => void }) {
  const [sheet, setSheet] = useState<null | { kind: 'add' } | { kind: 'tile'; i: number }>(null);
  if (!me.office) return null;
  const p: OfficePlan = plan || { add: [], remodel: {} };
  const { tiles, cost, work } = planOffice(me, p);
  const used = seatsUsed(g, me);
  const people = seated(g, me);
  const base = me.office.tiles.length;
  const canAdd = editable && p.add.length < OFFICE.maxAddPerQ && tiles.length < OFFICE.max;
  const cols = tiles.length + (canAdd ? 1 : 0) <= 9 ? 3 : tiles.length + (canAdd ? 1 : 0) <= 16 ? 4 : 5;
  const cash = Math.max(0, me.cash);
  let seatNo = 0;
  const counts = (k: TileKind) => tiles.filter(t => t === k).length;

  return (
    <div className="office-wrap">
      <div className="office-head">
        <span className={`chip ${used >= work ? 'down' : 'up'}`}>🪑 席 {used}/{work}{used >= work ? '（満席）' : `・空き${work - used}`}</span>
        <span className="chip">🏢 {tiles.length}マス</span>
        <span className="chip gold">💰 資産価値 {officeValue(me).toLocaleString()}</span>
      </div>
      <div className="office" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {tiles.map((t, i) => {
          const isNew = i >= base;
          const changed = !isNew && p.remodel[String(i)] !== undefined && p.remodel[String(i)] !== me.office!.tiles[i];
          const person = t === 'work' ? people[seatNo++] : undefined;
          return (
            <button key={i} className={`tile t-${t} ${isNew || changed ? 'plan' : ''}`} disabled={!editable} onClick={() => setSheet({ kind: 'tile', i })}
              aria-label={`${TILES[t].name}${person ? `：${person.e.name}` : ''}`}>
              {t === 'work'
                ? (person
                  ? <span className={`who ${person.away ? 'away' : ''}`}><Face name={person.e.name} size={30} /><small>{lastName(person.e.name)}</small>{person.away && <em>貸出中</em>}</span>
                  : <span className="vacant"><span className="ic">🪑</span><small>空席</small></span>)
                : <span className="room"><span className="ic">{TILES[t].icon}</span><small>{TILES[t].short}</small></span>}
              {(isNew || changed) && <span className="ribbon">{isNew ? '増築' : '改装'}</span>}
            </button>
          );
        })}
        {canAdd && (
          <button className="tile add" onClick={() => setSheet({ kind: 'add' })}>
            <span className="room"><span className="ic">＋</span><small>増築 {expandCost(me, p.add.length)}</small></span>
          </button>
        )}
      </div>
      {editable && (
        <div className="note" style={{ marginTop: 8 }}>
          {cost ? <>工事費 合計 <b className={cost > cash ? 'down' : ''}>{cost.toLocaleString()}万円</b>（決定すると支払い）{cost > cash ? '・現金が足りません' : ''}・</> : null}
          マスをタップで改装（{OFFICE.remodel}）、＋で増築（1期に{OFFICE.maxAddPerQ}マスまで）。オフィスにかけたお金の{OFFICE.finalValue * 100}%は最終決算で資産になります
        </div>
      )}
      {!editable && <div className="note" style={{ marginTop: 8 }}>増築・改装は開発フェーズの「開発」タブでできます</div>}

      {sheet?.kind === 'add' && (
        <Sheet onClose={() => setSheet(null)} title="🏗️ 増築するマス" sub={`費用 ${expandCost(me, p.add.length)}万円（増やすほど少しずつ高くなります）`}>
          {KINDS.map(k => (
            <button key={k} className="card tile-pick" onClick={() => { onPlan?.({ ...p, add: [...p.add, k] }); setSheet(null); }}>
              <span className={`tp-ic t-${k}`}>{TILES[k].icon}</span>
              <div className="grow"><b>{TILES[k].name}</b>{k !== 'work' && <span className="note">（いま{counts(k)}・{OFFICE.maxEffect}つまで効果）</span>}<div className="note">{TILES[k].desc}</div></div>
            </button>
          ))}
        </Sheet>
      )}
      {sheet?.kind === 'tile' && (() => {
        const i = sheet.i;
        const isNew = i >= base;
        const cur = tiles[i];
        if (isNew) {
          return (
            <Sheet onClose={() => setSheet(null)} title={<>{TILES[cur].icon} {TILES[cur].name}（増築予定）</>} sub={TILES[cur].desc}>
              <button className="btn danger big" onClick={() => { const add = [...p.add]; add.splice(i - base, 1); onPlan?.({ ...p, add }); setSheet(null); }}>この増築を取り消す</button>
            </Sheet>
          );
        }
        const orig = me.office!.tiles[i];
        const planned = p.remodel[String(i)];
        return (
          <Sheet onClose={() => setSheet(null)} title={<>{TILES[cur].icon} {TILES[cur].name}</>} sub={TILES[cur].desc}>
            {planned && planned !== orig && (
              <button className="btn big" style={{ marginBottom: 8 }} onClick={() => { const r = { ...p.remodel }; delete r[String(i)]; onPlan?.({ ...p, remodel: r }); setSheet(null); }}>改装を取り消す（{TILES[orig].name}に戻す）</button>
            )}
            <div className="sec-title" style={{ marginTop: 4 }}>改装する（{OFFICE.remodel}万円）</div>
            {KINDS.filter(k => k !== cur).map(k => {
              // 作業マスを減らすと、使っている席より少なくなる場合は不可
              const after = planOffice(me, { ...p, remodel: { ...p.remodel, [String(i)]: k } });
              const ok = after.work >= used;
              return (
                <button key={k} className="card tile-pick" disabled={!ok} onClick={() => {
                  const r = { ...p.remodel };
                  if (k === orig) delete r[String(i)]; else r[String(i)] = k;
                  onPlan?.({ ...p, remodel: r }); setSheet(null);
                }}>
                  <span className={`tp-ic t-${k}`}>{TILES[k].icon}</span>
                  <div className="grow"><b>{TILES[k].name}</b><div className="note">{ok ? TILES[k].desc : '席を使っている社員がいるため、これ以上作業マスを減らせません'}</div></div>
                </button>
              );
            })}
          </Sheet>
        );
      })()}
    </div>
  );
}

/** 空いている席の数（計画を含まない、今の状態） */
export const freeSeatCount = (g: Game, c: Company) => (c.office ? seats(c) - seatsUsed(g, c) : Infinity);