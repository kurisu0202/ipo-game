import { describe, expect, it } from 'vitest';
import { addChat, backToLobby, cancelMove, effectiveHost, joinRoom, phaseKey, startGame, submitMove, type RoomData } from '../src/shared/protocol';
import { smartBid, smartDev } from '../src/logic/bots';
import type { BidSubmit, DevSubmit } from '../src/logic/types';

// 毎回 JSON を通す（Firebase に文字列で保存するのと同じ）
const save = (d: RoomData) => JSON.parse(JSON.stringify(d)) as RoomData;

describe('オンラインの部屋', () => {
  it('入室・再入室・満員・開始後の参加', () => {
    const none = new Set<string>();
    let r = joinRoom(null, 'A社', '', none);
    expect(r.cid).toBe('c0');
    let d = save(r.data);
    expect(d.hostId).toBe('c0');
    expect(() => joinRoom(save(d), 'A社', '', none)).toThrow('同じ会社名');
    r = joinRoom(save(d), 'B社', '', none); d = save(r.data);
    r = joinRoom(save(d), 'A社', 'c0', none);
    expect(r.cid).toBe('c0');
    expect(r.data.players).toHaveLength(2);
    d = save(startGame(save(d), 'c0', 123));
    expect(() => joinRoom(save(d), 'C社', '', none)).toThrow('始まっている');
    // 端末を変えても、オフラインの同名の会社として戻れる
    expect(joinRoom(save(d), 'B社', '', none).cid).toBe('c1');
    expect(() => joinRoom(save(d), 'B社', '', new Set(['c1']))).toThrow();
  });

  it('ホストが落ちたら次のオンラインの会社が代わる', () => {
    let d = joinRoom(null, 'A', '', new Set()).data;
    d = joinRoom(d, 'B', '', new Set()).data;
    expect(effectiveHost(d, new Set(['c0', 'c1']))).toBe('c0');
    expect(effectiveHost(d, new Set(['c1']))).toBe('c1');
  });

  it('最後まで遊べて、データが上限より小さい', () => {
    let d: RoomData | null = null;
    for (const n of ['A', 'B', 'C', 'D']) d = save(joinRoom(d, n, '', new Set()).data);
    d = save(startGame(d, 'c0', 42));
    let max = 0;
    for (let step = 0; step < 100 && d.game!.phase !== 'end'; step++) {
      for (const c of d.game!.companies) {
        const g = d.game!;
        const pk = phaseKey(g.q, g.phase);
        const data: BidSubmit | DevSubmit = g.phase === 'bid' ? smartBid(g, c.id, Math.random) : smartDev(g, c.id, Math.random);
        if (c.id === 'c1' && step === 0) { d = save(submitMove(d, c.id, data, pk)); d = save(cancelMove(d, c.id)); }
        d = save(submitMove(d, c.id, data, pk));
        max = Math.max(max, JSON.stringify(d).length);
      }
      d = save(addChat(d, 'c0', 'よろしく', step));
    }
    expect(d.game!.phase).toBe('end');
    expect(d.chat.length).toBeLessThanOrEqual(60);
    expect(max).toBeLessThan(1_000_000);
    expect(() => submitMove(save(d), 'c0', smartDev(d.game!, 'c0', Math.random), '0:bid')).toThrow('フェーズ');
    d = save(backToLobby(d, 'c2'));
    expect(d.game).toBeNull();
    expect(d.hostId).toBe('c2');
    console.log('最大データサイズ', max, '文字');
  });
});
