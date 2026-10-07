// ===== 自社オフィス：床のマス目に、形のある家具・部屋を置く =====
//  ・デスク（1×1）の数が社員の上限
//  ・休憩室・研修室・リフレッシュ室は「となりのデスク」に座る社員にだけ効く
//  ・会議室・大会議室・サーバールーム・セキュリティ室は会社全体に効く（calc.ts で数える）
import { ITEMS, OFFICE } from './config';
import { seatsUsed } from './calc';
import type { Company, Engineer, Game, ItemKind, Office, OfficePlan, Placed } from './types';

export const emptyPlan = (): OfficePlan => ({ remove: [], move: [], place: [] });
export const planIsEmpty = (p?: OfficePlan) => !p || (!p.expand && !p.remove.length && !p.move.length && !p.place.length && !p.seats);

/** 形を rot 回（90度ずつ）回したマス（左上を 0,0 にそろえる） */
export function shape(kind: ItemKind, rot: number): [number, number][] {
  let cells = ITEMS[kind].cells.map(([x, y]) => [x, y] as [number, number]);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x] as [number, number]);
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as [number, number]);
}
export const cellsOf = (p: { kind: ItemKind; x: number; y: number; rot: number }) => shape(p.kind, p.rot).map(([x, y]) => [p.x + x, p.y + y] as [number, number]);

/** 最初のオフィス：3×2 のデスク */
export function newOffice(): Office {
  const items: Placed[] = [];
  let id = 1;
  for (let y = 0; y < OFFICE.startH; y++) for (let x = 0; x < OFFICE.startW; x++) items.push({ id: `d${id++}`, kind: 'desk', x, y, rot: 0 });
  return { w: OFFICE.startW, h: OFFICE.startH, items, seats: {}, spent: 0, nextId: id, expansions: 0 };
}

/** 古い形式（1マス1部屋）からの作り直し：同じ数のデスクを並べる（特殊マスはデスクに） */
export function upgradeOffice(old: { tiles?: unknown; spent?: number } | undefined, need: number): Office {
  const n = Math.max(OFFICE.startW * OFFICE.startH, Array.isArray(old?.tiles) ? old!.tiles.length : 0, need);
  const w = Math.min(OFFICE.maxW, Math.max(OFFICE.startW, Math.ceil(Math.sqrt(n))));
  const h = Math.ceil(n / w);
  const o = newOffice();
  o.w = w; o.h = h; o.items = [];
  for (let i = 0; i < n; i++) o.items.push({ id: `d${i + 1}`, kind: 'desk', x: i % w, y: Math.floor(i / w), rot: 0 });
  o.nextId = n + 1;
  o.spent = old?.spent || 0;
  return o;
}

export const expandCost = (o: Office) => OFFICE.expandBase + OFFICE.expandStep * o.expansions;

/** マス → 置いてあるものの ID */
export function occupancy(o: Office): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: o.h }, () => Array<string | null>(o.w).fill(null));
  for (const it of o.items) for (const [x, y] of cellsOf(it)) if (grid[y] && x >= 0 && x < o.w) grid[y][x] = it.id;
  return grid;
}

/** 置けるか（床の中で、ほかと重ならない。ignore の ID は無視） */
export function canPlace(o: Office, p: { kind: ItemKind; x: number; y: number; rot: number }, ignore?: string): boolean {
  const grid = occupancy(o);
  return cellsOf(p).every(([x, y]) => x >= 0 && y >= 0 && x < o.w && y < o.h && (grid[y][x] === null || grid[y][x] === ignore));
}

/** 計画を当てはめる：増床 → 撤去 → 移動 → 新しく置く → 席替え。おかしなものは飛ばし、費用と内訳を返す */
export function applyPlan(src: Office, plan: OfficePlan | undefined): { office: Office; cost: number; asset: number; notes: string[]; errors: string[] } {
  const o: Office = JSON.parse(JSON.stringify(src));
  let cost = 0, asset = 0;
  const notes: string[] = [], errors: string[] = [];
  if (!plan) return { office: o, cost, asset, notes, errors };
  if (plan.expand === 'row' && o.h < OFFICE.maxH) { const v = expandCost(o); cost += v; asset += v; o.h++; o.expansions++; notes.push('床を1行広げた'); }
  else if (plan.expand === 'col' && o.w < OFFICE.maxW) { const v = expandCost(o); cost += v; asset += v; o.w++; o.expansions++; notes.push('床を1列広げた'); }
  for (const id of plan.remove || []) {
    const it = o.items.find(x => x.id === id);
    if (!it) continue;
    o.items = o.items.filter(x => x !== it);
    delete o.seats[id];
    cost += OFFICE.move;
    notes.push(`${ITEMS[it.kind].name}を撤去`);
  }
  for (const m of plan.move || []) {
    const it = o.items.find(x => x.id === m.id);
    if (!it || (it.x === m.x && it.y === m.y && it.rot === m.rot)) continue;
    const to = { ...it, x: m.x, y: m.y, rot: ((m.rot % 4) + 4) % 4 };
    if (!canPlace(o, to, it.id)) { errors.push(`${ITEMS[it.kind].name}をその場所に動かせません`); continue; }
    Object.assign(it, to);
    cost += OFFICE.move;
    notes.push(`${ITEMS[it.kind].name}を移動`);
  }
  for (const p of plan.place || []) {
    if (!(p.kind in ITEMS)) continue;
    const it: Placed = { id: `${p.kind === 'desk' ? 'd' : 'r'}${o.nextId}`, kind: p.kind, x: p.x, y: p.y, rot: ((p.rot % 4) + 4) % 4 };
    if (!canPlace(o, it)) { errors.push(`${ITEMS[p.kind].name}をその場所に置けません`); continue; }
    o.nextId++;
    o.items.push(it);
    cost += ITEMS[p.kind].cost;
    asset += ITEMS[p.kind].cost;
    notes.push(`${ITEMS[p.kind].icon}${ITEMS[p.kind].name}を設置`);
  }
  if (plan.seats) o.seats = { ...plan.seats };
  // 席の整理：なくなったデスクの席は外す
  for (const d of Object.keys(o.seats)) if (!o.items.some(x => x.id === d && x.kind === 'desk')) delete o.seats[d];
  return { office: o, cost, asset, notes, errors };
}

/** 空いているマスにデスクを1つ置く計画（空きがなければ床を広げる）。ボット用 */
export function autoDeskPlan(src: Office): OfficePlan | null {
  const find = (o: Office) => { const grid = occupancy(o); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (!grid[y][x]) return { x, y }; return null; };
  const here = find(src);
  if (here) return { ...emptyPlan(), place: [{ kind: 'desk', ...here, rot: 0 }] };
  const expand: 'row' | 'col' | undefined = src.h < OFFICE.maxH && src.h <= src.w ? 'row' : src.w < OFFICE.maxW ? 'col' : src.h < OFFICE.maxH ? 'row' : undefined;
  if (!expand) return null;
  const bigger = applyPlan(src, { ...emptyPlan(), expand }).office;
  const spot = find(bigger);
  return spot ? { ...emptyPlan(), expand, place: [{ kind: 'desk', ...spot, rot: 0 }] } : null;
}

/** 席にいる人：自社の社員・借りている社員・貸し出し中の自社社員（席だけ確保） */
export function occupants(g: Game, c: Company): { e: Engineer; away?: string }[] {
  const here = c.engineers.map(e => ({ e }));
  const lent = g.companies.flatMap(o => o.engineers.filter(e => e.loan?.from === c.id).map(e => ({ e, away: o.name })));
  return [...here, ...lent];
}

/** デスク → 座っている人。保存した席を優先し、席のない人は空いているデスクに順に座る */
export function seatMap(g: Game, c: Company, office: Office | undefined = c.office): Record<string, { e: Engineer; away?: string }> {
  const out: Record<string, { e: Engineer; away?: string }> = {};
  if (!office?.items) return out;
  const people = occupants(g, c);
  const desks = office.items.filter(i => i.kind === 'desk').sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = new Set<string>();
  for (const d of desks) {
    const pid = office.seats[d.id];
    const p = pid && people.find(x => x.e.id === pid);
    if (p && !placed.has(p.e.id)) { out[d.id] = p; placed.add(p.e.id); }
  }
  const rest = people.filter(p => !placed.has(p.e.id));
  for (const d of desks) { if (out[d.id] || !rest.length) continue; out[d.id] = rest.shift()!; }
  return out;
}

/** 社員が座っているデスク */
export function deskOf(g: Game, c: Company, eid: string): Placed | undefined {
  const m = seatMap(g, c);
  const id = Object.keys(m).find(d => m[d].e.id === eid);
  return id ? c.office!.items.find(i => i.id === id) : undefined;
}

/** その社員のデスクのとなり（上下左右）に kind の部屋があるか */
export function nextTo(g: Game, c: Company, eid: string, kind: ItemKind): boolean {
  if (!c.office?.items) return false;
  const d = deskOf(g, c, eid);
  if (!d) return false;
  const [dx, dy] = [d.x, d.y];
  return c.office.items.some(it => it.kind === kind && cellsOf(it).some(([x, y]) => Math.abs(x - dx) + Math.abs(y - dy) === 1));
}

/** 計画の検証（サーバー側でも同じ判定）：費用は手元の現金まで、デスクは使っている席より減らせない */
export function checkPlan(g: Game, c: Company, plan: OfficePlan | undefined): { ok: boolean; cost: number; reason?: string } {
  if (!c.office?.items || planIsEmpty(plan)) return { ok: false, cost: 0 };
  const r = applyPlan(c.office, plan);
  if (r.errors.length) return { ok: false, cost: r.cost, reason: r.errors[0] };
  if (r.office.items.filter(i => i.kind === 'desk').length < seatsUsed(g, c)) return { ok: false, cost: r.cost, reason: '社員の人数よりデスクが少なくなります' };
  if (r.cost > Math.max(0, c.cash)) return { ok: false, cost: r.cost, reason: '現金が足りません' };
  return { ok: true, cost: r.cost };
}
