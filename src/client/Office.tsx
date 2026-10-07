// ===== 自社オフィス：床のマス目に、形のある家具・部屋を置く見取り図 =====
import { useState } from 'react';
import { ITEMS, OFFICE } from '../logic/config';
import { officeValue, seats, seatsUsed } from '../logic/calc';
import { applyPlan, canPlace, cellsOf, checkPlan, emptyPlan, expandCost, nextTo, planIsEmpty, seatMap, shape } from '../logic/office';
import type { Company, Game, ItemKind, OfficePlan, Placed } from '../logic/types';
import { Face, Sheet } from './ui';

const KINDS = Object.keys(ITEMS) as ItemKind[];
const lastName = (n: string) => n.split(/\s|　/)[0] || n;

/** 計画の費用（画面の集計用） */
export const planCost = (c: Company, plan?: OfficePlan) => (c.office?.items && plan ? applyPlan(c.office, plan).cost : 0);
/** 空いている席の数（今の状態） */
export const freeSeatCount = (g: Game, c: Company) => (c.office?.items ? seats(c) - seatsUsed(g, c) : Infinity);

/** 形の小さな見本 */
function ShapeMini({ kind, rot = 0 }: { kind: ItemKind; rot?: number }) {
  const cells = shape(kind, rot);
  const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
  return (
    <span className="shape-mini" style={{ gridTemplateColumns: `repeat(${w}, 9px)`, gridTemplateRows: `repeat(${h}, 9px)` }}>
      {cells.map(([x, y], i) => <i key={i} className={`t-${kind}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />)}
    </span>
  );
}

type Mode = null | { type: 'place'; kind: ItemKind; rot: number } | { type: 'move'; id: string; rot: number };

export function OfficeView({ g, me, plan, editable, onPlan }: { g: Game; me: Company; plan?: OfficePlan; editable?: boolean; onPlan?: (p: OfficePlan) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [pick, setPick] = useState<Placed | null>(null);
  if (!me.office?.items) return null;
  const base = me.office;
  const p: OfficePlan = plan || emptyPlan();
  const preview = applyPlan(base, p);
  const o = preview.office;
  const chk = planIsEmpty(p) ? { ok: true, cost: 0 } as { ok: boolean; cost: number; reason?: string } : checkPlan(g, me, p);
  const seatsNow = seatMap(g, me, o);
  const desks = o.items.filter(i => i.kind === 'desk').length;
  const used = seatsUsed(g, me);
  const isNew = (id: string) => !base.items.some(i => i.id === id);
  const isMoved = (id: string) => p.move.some(m => m.id === id);
  const set = (np: OfficePlan) => onPlan?.(np);

  // マス → 置いてあるもの
  const at: Record<string, Placed> = {};
  for (const it of o.items) for (const [x, y] of cellsOf(it)) at[`${x},${y}`] = it;

  // 置ける場所（置く・動かすモードのとき）
  const moving = mode?.type === 'move' ? o.items.find(i => i.id === mode.id) : undefined;
  const ghostKind: ItemKind | undefined = mode?.type === 'place' ? mode.kind : moving?.kind;
  const fits = (x: number, y: number) => !!ghostKind && canPlace(o, { kind: ghostKind, x, y, rot: mode!.rot }, moving?.id);

  const tapCell = (x: number, y: number) => {
    if (!editable) return;
    if (mode) {
      if (!fits(x, y)) return;
      if (mode.type === 'place') set({ ...p, place: [...p.place, { kind: mode.kind, x, y, rot: mode.rot }] });
      else {
        const id = mode.id;
        if (isNew(id)) {
          // 今期置く予定のものは、置き場所を直すだけ（無料）
          const k = o.items.filter(i => isNew(i.id)).findIndex(i => i.id === id);
          set({ ...p, place: p.place.map((q, i) => (i === k ? { ...q, x, y, rot: mode.rot } : q)) });
        } else set({ ...p, move: [...p.move.filter(m => m.id !== id), { id, x, y, rot: mode.rot }] });
      }
      setMode(null);
      return;
    }
    const it = at[`${x},${y}`];
    if (it) setPick(it);
  };

  const cellStyle = (it: Placed, x: number, y: number) => {
    const same = (dx: number, dy: number) => at[`${x + dx},${y + dy}`]?.id === it.id;
    const r = 9;
    return {
      gridColumn: x + 1, gridRow: y + 1,
      borderTopLeftRadius: !same(-1, 0) && !same(0, -1) ? r : 0, borderTopRightRadius: !same(1, 0) && !same(0, -1) ? r : 0,
      borderBottomLeftRadius: !same(-1, 0) && !same(0, 1) ? r : 0, borderBottomRightRadius: !same(1, 0) && !same(0, 1) ? r : 0,
      borderLeftWidth: same(-1, 0) ? 0 : undefined, borderRightWidth: same(1, 0) ? 0 : undefined,
      borderTopWidth: same(0, -1) ? 0 : undefined, borderBottomWidth: same(0, 1) ? 0 : undefined,
    };
  };

  const cells: JSX.Element[] = [];
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const it = at[`${x},${y}`];
    const key = `${x},${y}`;
    const ok = mode ? fits(x, y) : false;
    if (!it || (moving && it.id === moving.id)) {
      cells.push(<button key={key} className={`fcell ${ok ? 'fit' : ''}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} disabled={!editable || (!!mode && !ok)} onClick={() => tapCell(x, y)} aria-label="床" />);
      continue;
    }
    const cs = cellsOf(it).filter(([cx, cy]) => cx < o.w && cy < o.h).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const anchor = cs[0]?.[0] === x && cs[0]?.[1] === y;
    const rect = cs.length === (Math.max(...cs.map(c => c[0])) - Math.min(...cs.map(c => c[0])) + 1) * (Math.max(...cs.map(c => c[1])) - Math.min(...cs.map(c => c[1])) + 1);
    const person = it.kind === 'desk' ? seatsNow[it.id] : undefined;
    const planned = isNew(it.id) || isMoved(it.id);
    cells.push(
      <button key={key} className={`icell t-${it.kind} ${planned ? 'plan' : ''} ${ok ? 'fit' : ''}`} style={cellStyle(it, x, y)} disabled={!editable || (!!mode && !ok)} onClick={() => tapCell(x, y)}>
        {it.kind === 'desk'
          ? (person
            ? <span className={`who ${person.away ? 'away' : ''}`}><Face name={person.e.name} size={28} /><small>{lastName(person.e.name)}</small>{person.away && <em>貸出中</em>}</span>
            : <span className="vacant"><span className="ic">🪑</span><small>空席</small></span>)
          : anchor && !rect ? <span className="room"><span className="ic">{ITEMS[it.kind].icon}</span><small>{ITEMS[it.kind].short}</small></span> : null}
        {anchor && planned && <span className="ribbon">{isNew(it.id) ? '新設' : '移動'}</span>}
      </button>,
    );
  }

  for (const it of o.items) {
    if (it.kind === 'desk') continue;
    const cs = cellsOf(it).filter(([cx, cy]) => cx < o.w && cy < o.h);
    if (!cs.length) continue;
    const x0 = Math.min(...cs.map(c => c[0])), x1 = Math.max(...cs.map(c => c[0])), y0 = Math.min(...cs.map(c => c[1])), y1 = Math.max(...cs.map(c => c[1]));
    if (cs.length !== (x1 - x0 + 1) * (y1 - y0 + 1) || cs.length === 1) continue;
    cells.push(<span key={`l-${it.id}`} className="ilabel" style={{ gridColumn: `${x0 + 1} / ${x1 + 2}`, gridRow: `${y0 + 1} / ${y1 + 2}` }}><span className="ic">{ITEMS[it.kind].icon}</span><small>{ITEMS[it.kind].name}</small></span>);
  }

  const canExpand = editable && !p.expand;
  return (
    <div className="office-wrap">
      <div className="office-head">
        <span className={`chip ${used >= desks ? 'down' : 'up'}`}>🪑 席 {used}/{desks}{used >= desks ? '（満席）' : `・空き${desks - used}`}</span>
        <span className="chip">📐 {o.w}×{o.h}</span>
        <span className="chip gold">💰 資産価値 {officeValue(me).toLocaleString()}</span>
      </div>
      <div className="floor" style={{ gridTemplateColumns: `repeat(${o.w}, 1fr)`, gridTemplateRows: `repeat(${o.h}, 1fr)`, aspectRatio: `${o.w} / ${o.h}`, maxWidth: o.w <= 3 ? 330 : undefined }}>
        {cells}
      </div>

      {mode && (
        <div className="place-bar">
          <span className="grow">{mode.type === 'place' ? `${ITEMS[mode.kind].icon}${ITEMS[mode.kind].name}を置く場所をタップ` : '移動先をタップ'}<small>（光っているマスに置けます）</small></span>
          <button className="btn sm" onClick={() => setMode({ ...mode, rot: (mode.rot + 1) % 4 })}>⟳ 回転</button>
          <button className="btn sm" onClick={() => setMode(null)}>やめる</button>
        </div>
      )}

      {editable && !mode && (
        <>
          <div className="palette">
            {KINDS.map(k => (
              <button key={k} className="pal" onClick={() => setMode({ type: 'place', kind: k, rot: 0 })} title={ITEMS[k].desc}>
                <ShapeMini kind={k} />
                <span className="pn">{ITEMS[k].icon}{ITEMS[k].name}</span>
                <span className="pc">{ITEMS[k].cost}{ITEMS[k].adj ? '・となり' : ''}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn sm grow" disabled={!canExpand || o.h >= OFFICE.maxH} onClick={() => set({ ...p, expand: 'row' })}>⬇ 床を1行広げる（{expandCost(base)}）</button>
            <button className="btn sm grow" disabled={!canExpand || o.w >= OFFICE.maxW} onClick={() => set({ ...p, expand: 'col' })}>➡ 床を1列広げる（{expandCost(base)}）</button>
            {p.expand && <button className="btn sm" onClick={() => set({ ...p, expand: undefined })}>増床を取消</button>}
          </div>
        </>
      )}

      {editable && (
        <div className="note" style={{ marginTop: 8 }}>
          {preview.cost ? <>工事費 合計 <b className={chk.ok ? '' : 'down'}>{preview.cost.toLocaleString()}万円</b>（決定すると支払い）・</> : null}
          {!chk.ok && chk.reason ? <b className="down">⚠ {chk.reason}・</b> : null}
          パレットから選んで置く／置いたものをタップで移動・回転・撤去（{OFFICE.move}）・デスクをタップで席替え（無料）。<b>となり</b>の付いた部屋は、上下左右にとなり合うデスクの社員だけに効きます。オフィスにかけたお金の{OFFICE.finalValue * 100}%は最終決算で資産に
        </div>
      )}
      {!editable && <div className="note" style={{ marginTop: 8 }}>増床・配置・席替えは開発フェーズの「開発」タブでできます</div>}

      {pick && (() => {
        const it = o.items.find(i => i.id === pick.id);
        if (!it) return null;
        const s = ITEMS[it.kind];
        const neu = isNew(it.id);
        const person = it.kind === 'desk' ? seatsNow[it.id] : undefined;
        const near = it.kind === 'desk' && person ? KINDS.filter(k => ITEMS[k].adj && nextTo(g, { ...me, office: o }, person.e.id, k)) : [];
        const close = () => setPick(null);
        const people = Object.values(seatMap(g, me, o));
        return (
          <Sheet onClose={close} title={<>{s.icon} {s.name}{neu ? '（新設予定）' : ''}</>} sub={s.desc}>
            {it.kind === 'desk' && (
              <div className="card">
                <b>この席</b>：{person ? person.e.name : '空席'}{near.length ? <span className="up">（となり：{near.map(k => ITEMS[k].name).join('・')}）</span> : null}
                <div className="note" style={{ margin: '6px 0' }}>座らせる人を選んでください（席替えは無料）</div>
                <div className="chips">
                  {people.map(q => (
                    <button key={q.e.id} className={`chip ${person?.e.id === q.e.id ? 'ink' : ''}`} onClick={() => {
                      const cur: Record<string, string> = {};
                      for (const [d, v] of Object.entries(seatsNow)) cur[d] = v.e.id;
                      const from = Object.keys(cur).find(d => cur[d] === q.e.id);
                      const was = cur[it.id];
                      if (from) { if (was) cur[from] = was; else delete cur[from]; }
                      cur[it.id] = q.e.id;
                      set({ ...p, seats: cur }); close();
                    }}><Face name={q.e.name} size={18} />{lastName(q.e.name)}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn grow" onClick={() => { setMode({ type: 'move', id: it.id, rot: it.rot }); close(); }}>✋ 移動・回転{neu ? '（無料）' : `（${OFFICE.move}）`}</button>
              {neu
                ? <button className="btn danger grow" onClick={() => { const k = o.items.filter(i => isNew(i.id)).findIndex(i => i.id === it.id); set({ ...p, place: p.place.filter((_, i) => i !== k) }); close(); }}>置くのをやめる</button>
                : <button className="btn danger grow" onClick={() => { set({ ...p, remove: [...p.remove, it.id], move: p.move.filter(m => m.id !== it.id) }); close(); }}>撤去（{OFFICE.move}）</button>}
              {isMoved(it.id) && <button className="btn grow" onClick={() => { set({ ...p, move: p.move.filter(m => m.id !== it.id) }); close(); }}>移動を取り消す</button>}
            </div>
          </Sheet>
        );
      })()}
      {editable && p.remove.length > 0 && (
        <div className="note" style={{ marginTop: 6 }}>撤去予定：{p.remove.map(id => ITEMS[base.items.find(i => i.id === id)?.kind || 'desk'].name).join('・')}
          <button className="btn xs" style={{ marginLeft: 6 }} onClick={() => set({ ...p, remove: [] })}>撤去を取り消す</button></div>
      )}
    </div>
  );
}
