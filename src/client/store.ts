// ===== 通信層：Firebase Realtime Database / ローカルテスト（localStorage） =====
//  ipo_rooms/{ルームID}/data    … 部屋の状態（JSON文字列）。更新は必ずトランザクション
//  ipo_rooms/{ルームID}/online/{会社ID} … 接続中の印（切断されると Firebase が自動で消す）
import type { RoomData } from '../shared/protocol';
import { firebaseConfig } from './firebase-config';

export const isOnline = !!(firebaseConfig.databaseURL && firebaseConfig.apiKey && !/^YOUR/.test(firebaseConfig.apiKey));

type DB = typeof import('firebase/database') & { db: import('firebase/database').Database };
let fbP: Promise<DB> | null = null;
function fb(): Promise<DB> {
  return (fbP ??= (async () => {
    const [{ initializeApp }, dbM] = await Promise.all([import('firebase/app'), import('firebase/database')]);
    return { ...dbM, db: dbM.getDatabase(initializeApp(firebaseConfig)) };
  })());
}

const base = (room: string) => `ipo_rooms/${room}`;
const parse = (v: unknown): RoomData | null => { try { return typeof v === 'string' && v ? JSON.parse(v) as RoomData : null; } catch { return null; } };

/** 部屋の変化を受け取る。戻り値で購読をやめる */
export function watchRoom(room: string, cb: (d: RoomData | null) => void, onError: (msg: string) => void): () => void {
  if (!isOnline) return localWatch(room, cb);
  let off = () => {};
  let stopped = false;
  fb().then(f => {
    if (stopped) return;
    off = f.onValue(f.ref(f.db, `${base(room)}/data`), s => cb(parse(s.val())), e => {
      console.error(e);
      onError(/permission/i.test(e.message) ? 'Firebase のルールで拒否されました（database.rules.json を貼り付けてください）' : '通信エラー：' + e.message);
    });
  }).catch(e => onError('Firebase に接続できません：' + (e instanceof Error ? e.message : String(e))));
  return () => { stopped = true; off(); };
}

/** 接続中の会社IDの一覧と、自分の接続状態を受け取る */
export function watchPresence(room: string, cb: (ids: Set<string>) => void, onConn: (ok: boolean) => void): () => void {
  if (!isOnline) { onConn(true); return localPresence(room, cb); }
  const offs: (() => void)[] = [];
  let stopped = false;
  fb().then(f => {
    if (stopped) return;
    offs.push(f.onValue(f.ref(f.db, `${base(room)}/online`), s => cb(new Set(Object.keys(s.val() || {})))));
    offs.push(f.onValue(f.ref(f.db, '.info/connected'), s => onConn(!!s.val())));
  });
  return () => { stopped = true; offs.forEach(o => o()); };
}

/** 自分が接続中であることを書く（切断・再接続にも追従） */
export function announce(room: string, cid: string): () => void {
  if (!isOnline) return localAnnounce(room, cid);
  let stopped = false;
  let off = () => {};
  fb().then(f => {
    if (stopped) return;
    const me = f.ref(f.db, `${base(room)}/online/${cid}`);
    off = f.onValue(f.ref(f.db, '.info/connected'), s => {
      if (!s.val()) return;
      f.onDisconnect(me).remove().then(() => f.set(me, true)).catch(console.error);
    });
  });
  return () => {
    stopped = true;
    off();
    fb().then(f => f.remove(f.ref(f.db, `${base(room)}/online/${cid}`))).catch(() => { /* 無視 */ });
  };
}

/** fn(今の部屋) → 新しい部屋。fn が例外を投げたら中止して error を返す。fn は再実行されることがある */
export async function transact(room: string, fn: (d: RoomData | null) => RoomData): Promise<{ data?: RoomData; error?: string }> {
  let error = '';
  const update = (cur: unknown): string | undefined => {
    error = '';
    try {
      const nd = fn(parse(cur));
      nd.updated = Date.now();
      return JSON.stringify(nd);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return undefined; // 中止
    }
  };
  if (!isOnline) {
    const out = update(localGet(room));
    if (error || out === undefined) return { error };
    localSet(room, out);
    return { data: parse(out)! };
  }
  try {
    const f = await fb();
    const res = await f.runTransaction(f.ref(f.db, `${base(room)}/data`), update);
    if (error) return { error };
    return { data: parse(res.snapshot.val()) ?? undefined };
  } catch (e) {
    return { error: '通信エラー：' + (e instanceof Error ? e.message : String(e)) };
  }
}

// ---------------------------------------------------------------------
//  ローカルテストモード：同じブラウザの別タブ同士で対戦（Firebase 不要）
// ---------------------------------------------------------------------
const LKEY = (room: string) => `ipo_local_room_${room}`;
const PKEY = (room: string) => `ipo_local_online_${room}`;
const subs = new Map<string, Set<() => void>>();
const notify = (key: string) => subs.get(key)?.forEach(f => f());
function on(key: string, f: () => void) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(f);
  return () => { subs.get(key)?.delete(f); };
}
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key) notify(e.key); });
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const localGet = (room: string) => read(LKEY(room));
function localSet(room: string, v: string) { try { localStorage.setItem(LKEY(room), v); } catch { /* 容量不足 */ } notify(LKEY(room)); }
function localWatch(room: string, cb: (d: RoomData | null) => void) {
  const fire = () => cb(parse(localGet(room)));
  const off = on(LKEY(room), fire);
  setTimeout(fire, 0);
  return off;
}
// タブごとの接続の印（数秒おきに更新、途絶えたら切断扱い）
const presenceMap = (room: string): Record<string, number> => { try { return JSON.parse(read(PKEY(room)) || '{}'); } catch { return {}; } };
function localPresence(room: string, cb: (ids: Set<string>) => void) {
  const fire = () => { const now = Date.now(); cb(new Set(Object.entries(presenceMap(room)).filter(([, t]) => now - t < 8000).map(([id]) => id))); };
  const off = on(PKEY(room), fire);
  const t = setInterval(fire, 3000);
  setTimeout(fire, 0);
  return () => { off(); clearInterval(t); };
}
function localAnnounce(room: string, cid: string) {
  const beat = (alive: boolean) => {
    const m = presenceMap(room);
    if (alive) m[cid] = Date.now(); else delete m[cid];
    try { localStorage.setItem(PKEY(room), JSON.stringify(m)); } catch { /* 無視 */ }
    notify(PKEY(room));
  };
  beat(true);
  const t = setInterval(() => beat(true), 3000);
  return () => { clearInterval(t); beat(false); };
}
