// ===== セッション：ローカル（ホットシート）とオンラインを同じ形で扱う =====
import { useSyncExternalStore } from 'react';
import { cancelSubmit, createGame, submit as doSubmit, subsOf, tryResolve } from '../logic/game';
import { viewFor, type PlayerView } from '../logic/view';
import type { BidSubmit, DevSubmit, Game, PickSubmit } from '../logic/types';
import { addChat, backToLobby, cancelMove, joinRoom, lobbyInfo, phaseKey, startGame, submitMove, type ChatMsg, type LobbyInfo, type RoomData } from '../shared/protocol';
import { announce, transact, watchPresence, watchRoom } from './store';

export interface Snapshot {
  mode: 'local' | 'online';
  stage: 'lobby' | 'pass' | 'play';
  view: PlayerView | null;
  lobby: LobbyInfo | null;
  chat: ChatMsg[];
  me: string;
  connected: boolean;
  error: string;
  room: string;
}

export interface Session {
  get(): Snapshot;
  subscribe(fn: () => void): () => void;
  submit(data: BidSubmit | DevSubmit | PickSubmit): void;
  cancel(): void;
  start(quarters?: number): void;
  again(): void;
  chat(text: string): void;
  openTurn(): void;
  leave(): void;
}

abstract class Base implements Session {
  protected snap: Snapshot;
  private subs = new Set<() => void>();
  constructor(init: Partial<Snapshot>) {
    this.snap = { mode: 'local', stage: 'lobby', view: null, lobby: null, chat: [], me: '', connected: true, error: '', room: '', ...init };
  }
  get = () => this.snap;
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  protected set(p: Partial<Snapshot>) { this.snap = { ...this.snap, ...p }; this.subs.forEach(f => f()); }
  abstract submit(data: BidSubmit | DevSubmit | PickSubmit): void;
  abstract cancel(): void;
  abstract start(quarters?: number): void;
  abstract again(): void;
  chat(_text: string) { /* ローカルではなし */ }
  openTurn() { /* オンラインではなし */ }
  abstract leave(): void;
}

// ---------------------------------------------------------------------
//  ローカル（1台を回して遊ぶ）
// ---------------------------------------------------------------------
const LOCAL_KEY = 'ipo_local_game';
export function savedLocal(): Game | null {
  try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) as Game : null; } catch { return null; }
}
export function clearLocal() { try { localStorage.removeItem(LOCAL_KEY); } catch { /* 無視 */ } }

// ゲームごとに別のIDにする（演出の既読管理がゲームをまたいで混ざらないように）
function newLocalGame(names: string[], quarters?: number): Game {
  const seed = (Math.random() * 2 ** 31) | 0;
  return createGame(names.map((n, i) => ({ id: `c${i}`, name: n })), seed, `local-${seed}-${Date.now().toString(36)}`, quarters);
}

export class LocalSession extends Base {
  private g: Game;
  constructor(names: string[] | null, resume?: Game, quarters?: number) {
    super({ mode: 'local', stage: 'pass' });
    this.g = resume ?? newLocalGame(names!, quarters);
    this.refresh('pass');
  }
  private current(): string {
    const g = this.g;
    if (g.phase === 'end') return g.companies[0].id;
    const done = subsOf(g);
    return (g.companies.find(c => !done[c.id]) || g.companies[0]).id;
  }
  private refresh(stage: Snapshot['stage']) {
    const me = this.current();
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.g)); } catch { /* 容量不足 */ }
    this.set({ me, stage: this.g.phase === 'end' ? 'play' : stage, view: viewFor(this.g, me), lobby: null });
  }
  submit(data: BidSubmit | DevSubmit | PickSubmit) {
    doSubmit(this.g, this.snap.me, data);
    tryResolve(this.g);
    this.refresh('pass');
  }
  cancel() { cancelSubmit(this.g, this.snap.me); this.refresh('play'); }
  openTurn() { this.set({ stage: 'play' }); }
  start() { /* 作成時に開始済み */ }
  again() {
    const names = this.g.companies.map(c => c.name);
    this.g = newLocalGame(names, this.g.quarters);
    this.refresh('pass');
  }
  leave() { if (this.g.phase === 'end') clearLocal(); }
}

// ---------------------------------------------------------------------
//  オンライン（Firebase。部屋の状態は全員で1つを共有し、各自の画面は viewFor で自分の分だけ表示）
// ---------------------------------------------------------------------
const cidKey = (room: string) => `ipo_cid_${room.toUpperCase()}`;
export const hasJoined = (room: string) => { try { return !!localStorage.getItem(cidKey(room)); } catch { return false; } };

export class OnlineSession extends Base {
  private data: RoomData | null = null;
  private online = new Set<string>();
  private loaded = { room: false, presence: false };
  private joining = false;
  private offs: (() => void)[] = [];
  private errTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private room: string, private name: string) {
    super({ mode: 'online', stage: 'lobby', connected: false, room: room.toUpperCase() });
    this.room = room.toUpperCase();
    this.offs.push(watchRoom(this.room, d => { this.data = d; this.loaded.room = true; this.render(); }, msg => this.set({ error: msg })));
    this.offs.push(watchPresence(this.room, ids => { this.online = ids; this.loaded.presence = true; this.render(); }, ok => this.set({ connected: ok })));
  }
  private render() {
    if (!this.snap.me && !this.joining && this.loaded.room && this.loaded.presence) void this.join();
    const d = this.data;
    const me = this.snap.me;
    if (!d) { this.set({ lobby: null, view: null, chat: [], stage: 'lobby' }); return; }
    const inGame = !!me && !!d.game?.companies.some(c => c.id === me);
    const view = inGame ? viewFor(d.game!, me) : null;
    this.set({ lobby: lobbyInfo(d, this.online), view, chat: d.chat || [], stage: view ? 'play' : 'lobby' });
  }
  private async join() {
    this.joining = true;
    let saved = '';
    try { saved = localStorage.getItem(cidKey(this.room)) || ''; } catch { /* 無視 */ }
    let cid = '';
    const r = await transact(this.room, d => { const j = joinRoom(d, this.name, saved, this.online); cid = j.cid; return j.data; });
    if (r.error) { this.joining = false; this.fail(r.error); return; }
    try { localStorage.setItem(cidKey(this.room), cid); } catch { /* 無視 */ }
    this.offs.push(announce(this.room, cid));
    this.set({ me: cid });
    this.render();
  }
  private fail(msg: string) {
    this.set({ error: msg });
    if (this.errTimer) clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => { if (this.snap.error === msg) this.set({ error: '' }); }, 4000);
  }
  private act(fn: (d: RoomData | null, me: string) => RoomData) {
    const me = this.snap.me;
    if (!me) { this.fail('入室中です。少し待ってください'); return; }
    void transact(this.room, d => fn(d, me)).then(r => { if (r.error) this.fail(r.error); });
  }
  submit(data: BidSubmit | DevSubmit | PickSubmit) {
    const g = this.snap.view?.game;
    if (!g) return;
    const pk = phaseKey(g.q, g.phase);
    this.act((d, me) => submitMove(d, me, data, pk));
  }
  cancel() { this.act(cancelMove); }
  start(quarters?: number) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    this.act((d, me) => startGame(d, me, seed, quarters));
  }
  again() { this.act(backToLobby); }
  chat(text: string) { const at = Date.now(); this.act((d, me) => addChat(d, me, text, at)); }
  leave() { this.offs.forEach(o => o()); this.offs = []; }
}

export function useSession(s: Session): Snapshot {
  return useSyncExternalStore(s.subscribe, s.get);
}
