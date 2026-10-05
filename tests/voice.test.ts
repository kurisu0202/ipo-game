import { describe, expect, it } from 'vitest';
import { createGame, submit, tryResolve } from '../src/logic/game';
import { pickIndustry, smartBid, smartDev } from '../src/logic/bots';
import { VOICE_COUNT, pickVoice } from '../src/client/voices';

describe('社員のひとこと', () => {
  it('どの場面でもせりふが選べて、{…} が残らない。直近のせりふは避ける', () => {
    expect(VOICE_COUNT).toBeGreaterThan(280);
    const g = createGame(['a', 'b', 'c'].map(id => ({ id, name: `${id}社` })), 99);
    const r = () => Math.random();
    const seen = new Set<string>();
    for (let step = 0; step < 100 && g.phase !== 'end'; step++) {
      if (g.phase !== 'pick') {
        for (const c of g.companies) {
          const recent: string[] = [];
          for (let i = 0; i < 20; i++) {
            const v = pickVoice(g, c, recent);
            if (!v) continue;
            expect(v.text).not.toMatch(/[{}]/);
            expect(recent).not.toContain(v.key);
            recent.push(v.key);
            seen.add(v.key);
          }
        }
      }
      g.companies.forEach(c => submit(g, c.id, g.phase === 'pick' ? pickIndustry(g, c.id, r) : g.phase === 'bid' ? smartBid(g, c.id, r) : smartDev(g, c.id, r)));
      tryResolve(g);
    }
    expect(seen.size).toBeGreaterThan(150);   // 1ゲームでいろいろなせりふが出る
  });
});
