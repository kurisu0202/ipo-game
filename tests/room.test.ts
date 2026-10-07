import { describe, expect, it } from 'vitest';
import { addBot, addChat, backToLobby, cancelMove, effectiveHost, joinRoom, lobbyInfo, phaseKey, removeBot, startGame, submitMove, type RoomData } from '../src/shared/protocol';
import { createGame, submit, tryResolve } from '../src/logic/game';
import { pickIndustry, runBots, smartBid, smartDev } from '../src/logic/bots';

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
        const data = g.phase === 'pick' ? pickIndustry(g, c.id, Math.random) : g.phase === 'bid' ? smartBid(g, c.id, Math.random) : smartDev(g, c.id, Math.random);
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

describe('CPU', () => {
  it('人1社＋CPU3社：CPUは自動で提出し、人が出すたびにゲームが進んで最後まで終わる', () => {
    const g = createGame([{ id: 'h', name: '人' }, { id: 'b1', name: 'CPU1', bot: 'normal' }, { id: 'b2', name: 'CPU2', bot: 'easy' }, { id: 'b3', name: 'CPU3', bot: 'normal' }], 99);
    runBots(g);
    expect(g.phase).toBe('pick');
    expect(Object.keys(g.pickSubs!).sort()).toEqual(['b1', 'b2', 'b3']);
    let steps = 0;
    while (g.phase !== 'end' && steps++ < 100) {
      const data = g.phase === 'pick' ? pickIndustry(g, 'h', Math.random) : g.phase === 'bid' ? smartBid(g, 'h', Math.random) : smartDev(g, 'h', Math.random);
      submit(g, 'h', data);
      tryResolve(g);
      runBots(g);
    }
    expect(g.phase).toBe('end');
    expect(g.final).toHaveLength(4);
  });
  it('オンライン：ホストがCPUを追加・削除でき、人1人＋CPUで開始できる', () => {
    let d = save(joinRoom(null, 'A', '', new Set()).data);
    d = save(addBot(d, 'c0', 'normal'));
    d = save(addBot(d, 'c0', 'easy'));
    expect(d.players.map(p => p.bot || 'human')).toEqual(['human', 'normal', 'easy']);
    d = save(removeBot(d, 'c0', 'c2'));
    expect(d.players).toHaveLength(2);
    expect(lobbyInfo(d, new Set()).players[1].online).toBe(true);
    d = save(startGame(d, 'c0', 7));
    expect(d.game!.pickSubs!.c1).toBeTruthy();   // CPUは開始と同時に業種を選んでいる
    d = save(submitMove(d, 'c0', { industry: 'web' }, phaseKey(d.game!.q, d.game!.phase)));
    expect(d.game!.phase).toBe('bid');
    expect(d.game!.bidSubs.c1).toBeTruthy();   // 次のフェーズもCPUはすでに提出済み
  });
});
