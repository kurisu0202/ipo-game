// ===== オンライン対戦の部屋データと操作 =====
//  部屋の状態は Firebase Realtime Database の ipo_rooms/{ルームID}/data に JSON 文字列で1つだけ保存し、
//  更新は必ずトランザクションで行う。下の関数は「今の部屋 → 新しい部屋」を返す純粋な関数で、
//  失敗するときは Error を投げる（トランザクションは中止される）。
import { cancelSubmit, createGame, submit as doSubmit, tryResolve } from '../logic/game';
import { GAME } from '../logic/config';
import type { BidSubmit, DevSubmit, Game, PickSubmit } from '../logic/types';

export const ROOM_RE = /^[A-Za-z0-9]{2,24}$/;
export const NAME_MAX = 12;

export interface LobbyInfo { players: { id: string; name: string; online: boolean }[]; hostId: string; started: boolean }
export interface ChatMsg { from: string; name: string; text: string; at: number }

export interface RoomData {
  players: { id: string; name: string }[];
  hostId: string;
  game: Game | null;
  chat: ChatMsg[];
  nextNo: number;
  updated?: number;
}

/** 提出が今のフェーズ向けかを確かめるキー（古い提出の取り違え防止） */
export const phaseKey = (q: number, phase: string) => `${q}:${phase}`;

const emptyRoom = (): RoomData => ({ players: [], hostId: '', game: null, chat: [], nextNo: 0 });

/** ホスト：最初に入った会社。いなくなっていたら、オンラインの会社の先頭が代わりを務める */
export function effectiveHost(d: RoomData, online: Set<string>): string {
  if (online.has(d.hostId)) return d.hostId;
  return d.players.find(p => online.has(p.id))?.id || d.hostId;
}

export function lobbyInfo(d: RoomData, online: Set<string>): LobbyInfo {
  return { players: d.players.map(p => ({ id: p.id, name: p.name, online: online.has(p.id) })), hostId: effectiveHost(d, online), started: !!d.game };
}

/** 入室。savedCid はこの端末で前に入ったときの会社ID。戻り値の cid が自分になる */
export function joinRoom(cur: RoomData | null, name: string, savedCid: string, online: Set<string>): { data: RoomData; cid: string } {
  const d = cur ?? emptyRoom();
  name = name.trim().slice(0, NAME_MAX);
  let p = savedCid ? d.players.find(x => x.id === savedCid) : undefined;
  if (!p && name) {
    // 端末を変えたとき用：ゲーム中なら、オフライン中の同名の会社として戻れる
    const same = d.players.find(x => x.name === name);
    if (same && !online.has(same.id) && d.game) p = same;
  }
  if (!p) {
    if (!name) throw new Error('会社名を入力してください');
    if (d.game) throw new Error('ゲームが始まっているため参加できません');
    if (d.players.length >= GAME.maxPlayers) throw new Error(`満員です（最大${GAME.maxPlayers}社）`);
    if (d.players.some(x => x.name === name)) throw new Error('同じ会社名がすでにあります');
    p = { id: `c${d.nextNo++}`, name };
    d.players.push(p);
    if (!d.hostId) d.hostId = p.id;
  }
  return { data: d, cid: p.id };
}

function need(d: RoomData | null, cid: string): RoomData {
  if (!d) throw new Error('部屋が見つかりません');
  if (!d.players.some(p => p.id === cid)) throw new Error('先に入室してください');
  return d;
}

export function startGame(cur: RoomData | null, cid: string, seed: number, quarters: number = GAME.quarters): RoomData {
  const d = need(cur, cid);
  if (d.game && d.game.phase !== 'end') throw new Error('すでに始まっています');
  if (d.players.length < GAME.minPlayers) throw new Error(`${GAME.minPlayers}社以上で開始できます`);
  d.hostId = cid;
  d.game = createGame(d.players.map(p => ({ id: p.id, name: p.name })), seed, `online-${seed >>> 0}`, quarters);
  return d;
}

export function submitMove(cur: RoomData | null, cid: string, data: BidSubmit | DevSubmit | PickSubmit, pk: string): RoomData {
  const d = need(cur, cid);
  const g = d.game;
  if (!g) throw new Error('ゲームが始まっていません');
  if (pk !== phaseKey(g.q, g.phase)) throw new Error('フェーズが進んでいます。画面を確認してください');
  doSubmit(g, cid, data);
  tryResolve(g);
  return d;
}

export function cancelMove(cur: RoomData | null, cid: string): RoomData {
  const d = need(cur, cid);
  if (d.game && d.game.phase !== 'end') cancelSubmit(d.game, cid);
  return d;
}

export function addChat(cur: RoomData | null, cid: string, text: string, at: number): RoomData {
  const d = need(cur, cid);
  text = text.trim().slice(0, 120);
  if (!text) return d;
  const p = d.players.find(x => x.id === cid)!;
  d.chat.push({ from: cid, name: p.name, text, at });
  if (d.chat.length > 60) d.chat = d.chat.slice(-60);
  return d;
}

export function backToLobby(cur: RoomData | null, cid: string): RoomData {
  const d = need(cur, cid);
  d.hostId = cid;
  d.game = null;
  return d;
}
