// ===== 入札タブ =====
import { useState } from 'react';
import { BID_PCTS, CARDS, DUMP_RATE, HIRE_FEES, PROJECT_TYPES, SKILLS, SKILL_NAME, TAGS } from '../logic/config';
import { checkReqs, sumSkills } from '../logic/calc';
import { bidAmount, pendingSpies } from '../logic/game';
import type { BidPct, BidSubmit, CardKey, Company, Game, HireFee, Project, Skills } from '../logic/types';
import type { PlayerView } from '../logic/view';
import { Coach, SecretFile } from './parts';
import { sfx } from './fx/sound';
import { Face, Sheet, SkillChips, companyColor, useLongPress } from './ui';

interface P { v: PlayerView; me: Company; draft: BidSubmit; set: (f: (d: BidSubmit) => BidSubmit) => void; locked: boolean }

export function BidTab({ v, me, draft, set, locked }: P) {
  const g = v.game;
  const [detail, setDetail] = useState<CardKey | null>(null);
  const dumping = draft.card === 'S1' || me.effects.dump === g.q;
  const pend = pendingSpies(g, me.id);
  return (
    <div className="content">
      <Coach phase="bid" q={g.q} />
      <SecretFile v={v} me={me} orders={draft.spyOrders} locked={locked} open={pend.length > 0}
        setOrder={(eid, o) => set(d => ({ ...d, spyOrders: { ...d.spyOrders, [eid]: o } }))} />

      <div className="sec-title">📋 今期の案件 <span className="n">{g.market.length}</span><small>入札は予算に対する%。一番安い会社が落札</small></div>
      {g.market.map(p => (
        <ProjectBidCard key={p.id} g={g} me={me} p={p} pct={draft.bids[p.id]} dumping={dumping} locked={locked}
          onPick={pct => { sfx.tap(); set(d => { const bids = { ...d.bids }; if (pct) bids[p.id] = pct; else delete bids[p.id]; return { ...d, bids }; }); }} />
      ))}

      {g.offers.length > 0 && (
        <>
          <div className="sec-title">🤝 レンタル募集 <small>借りたい社員を1人だけ選べます</small></div>
          {g.offers.map(o => {
            const lender = g.companies.find(c => c.id === o.from)!;
            const e = lender.engineers.find(x => x.id === o.engineerId);
            const mine = o.from === me.id;
            const on = draft.rent === o.id;
            return (
              <button key={o.id} className={`card ${on ? 'selected' : ''}`} style={{ width: '100%', textAlign: 'left', display: 'block' }} disabled={locked || mine}
                onClick={() => { sfx.tap(); set(d => ({ ...d, rent: on ? undefined : o.id })); }}>
                <div className="row">
                  {e ? <Face name={e.name} /> : null}
                  <div className="grow"><b>{e?.name || '（不在）'}</b><div className="note">{lender.name}から・{o.period}期間・取り分{o.share}%{mine ? '（自社の出品）' : ''}</div></div>
                  <span className={`check`} style={{ color: 'var(--accent)' }}>{on ? '✓' : ''}</span>
                </div>
                {e && <div style={{ marginTop: 8 }}><SkillChips skills={e.skills} /></div>}
                <div className="note" style={{ marginTop: 6 }}>給料は貸し手持ち。担当した案件の支払いの{o.share}%を貸し手に渡します</div>
              </button>
            );
          })}
        </>
      )}

      <div className="sec-title">👤 採用候補 <span className="n">{g.pool.length}</span><small>契約金が一番高い会社が採用</small></div>
      {me.effects.noHire === g.q && <div className="warn">🪧 採用広告を買い占められていて、今期は採用できません</div>}
      {g.pool.map(e => {
        const fee = draft.hires[e.id];
        return (
          <div className="card" key={e.id}>
            <div className="row">
              <Face name={e.name} size={36} />
              <div className="grow">
                <div className="row" style={{ gap: 6 }}><b>{e.name}</b>
                  {e.legend && <span className="badge-k legend">伝説</span>}{e.rookie && <span className="badge-k rookie">新人</span>}</div>
                <div className="note">給料 <b>{e.salary}</b>万円/期{e.rookie ? '・毎年春に成長' : ''}</div>
              </div>
            </div>
            <div style={{ margin: '8px 0' }}><SkillChips skills={e.skills} /></div>
            <div className="seg">
              <button className={fee === undefined ? 'on' : 'off'} disabled={locked} onClick={() => set(d => { const hires = { ...d.hires }; delete hires[e.id]; return { ...d, hires }; })}>見送り</button>
              {HIRE_FEES.map(f => <button key={f} className={fee === f ? 'on gold' : ''} disabled={locked} onClick={() => { sfx.tap(); set(d => ({ ...d, hires: { ...d.hires, [e.id]: f as HireFee } })); }}>{f}万</button>)}
            </div>
          </div>
        );
      })}

      <div className="sec-title">🃏 作戦カード <span className="n">{me.hand.length}</span><small>1枚だけ使えます・長押しで詳細</small></div>
      {me.hand.length === 0 && <div className="empty">手札がありません</div>}
      <div className="hand">
        {me.hand.map((k, i) => (
          <CardTile key={i} k={k} sel={draft.card === k} onLong={() => setDetail(k)}
            onTap={() => {
              if (locked) return;
              if (CARDS[k].kind === 'defense') { setDetail(k); return; }
              sfx.flip();
              set(d => (d.card === k ? { ...d, card: undefined, target: undefined } : { ...d, card: k, target: CARDS[k].kind === 'self' ? undefined : d.target }));
            }} />
        ))}
      </div>
      {draft.card && CARDS[draft.card].kind === 'attack' && (
        <div className="card hl">
          <b>{CARDS[draft.card].icon} {CARDS[draft.card].name}</b> をだれに使う？
          <div className="seg" style={{ marginTop: 8 }}>
            {g.companies.filter(c => c.id !== me.id).map(c => (
              <button key={c.id} className={draft.target === c.id ? 'on' : ''} disabled={locked} onClick={() => { sfx.tap(); set(d => ({ ...d, target: c.id })); }}>
                <span className="dot" style={{ background: companyColor(g, c.id), marginRight: 4 }} />{c.name}
              </button>
            ))}
          </div>
          {!draft.target && <div className="warn" style={{ marginTop: 8 }}>相手を選んでください（選ばないと使われません）</div>}
        </div>
      )}
      {draft.card === 'S1' && <div className="infobar">🏷️ 今期の入札額がすべて×{DUMP_RATE}になります</div>}
      {detail && <CardDetail k={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function capacityWarn(g: Game, me: Company, reqs: Skills): string | null {
  const all = sumSkills(g, me, me.engineers);
  const full = checkReqs(reqs, all);
  if (!full.ok) return `社員全員でも ${SKILLS.filter(k => full.missing[k]).map(k => `${SKILL_NAME[k]}が${full.missing[k]}`).join('・')} 足りません`;
  const busy: Skills = {};
  me.projects.forEach(p => SKILLS.forEach(k => { if (p.reqs[k]) busy[k] = (busy[k] || 0) + (p.reqs[k] || 0); }));
  const free: Skills = {};
  SKILLS.forEach(k => { free[k] = Math.max(0, (all[k] || 0) - (busy[k] || 0)); });
  const part = checkReqs(reqs, free);
  if (!part.ok) return `進行中の案件と並行すると ${SKILLS.filter(k => part.missing[k]).map(k => SKILL_NAME[k]).join('・')} が不足する恐れ`;
  return null;
}

function ProjectBidCard({ g, me, p, pct, dumping, locked, onPick }: { g: Game; me: Company; p: Project; pct?: BidPct; dumping: boolean; locked: boolean; onPick: (p?: BidPct) => void }) {
  const spec = PROJECT_TYPES[p.type];
  const secret = p.type === 'secret';
  const warn = capacityWarn(g, me, p.reqs);
  const banned = me.effects.noBid === g.q;
  return (
    <div className={`card ${secret ? 'secret-card' : ''} ${pct ? 'selected' : ''}`}>
      <div className="proj-top">
        <span className={`ptype ${p.type}`}>{spec.icon} {spec.name}</span>
        {p.tags.map(t => <span key={t} className={`tag ${t === 'muri' || t === 'haggle' || t === 'legacy' ? 'bad' : ''}`}>{TAGS[t].name}：{TAGS[t].desc}</span>)}
        <span className="chip" style={{ marginLeft: 'auto' }}>⏱ {p.duration}期</span>
      </div>
      <div className="proj-name">{p.name}</div>
      <div className="proj-desc">{spec.desc}</div>
      <div className="money-row">
        {secret ? <span className="num" style={{ fontSize: 20 }}>予算 ？？？</span> : <span className="num">{p.budget.toLocaleString()}<small>万円</small></span>}
        <span className="chip">{p.pay === 'turn' ? '毎期払い' : '完了時に一括'}</span>
      </div>
      <SkillChips skills={p.reqs} />
      {warn && <div className="warn" style={{ marginTop: 8 }}>⚠ {warn}</div>}
      <div className="bidline">
        <div className="result">
          {banned ? <span className="down">📰 情報漏洩の噂で今期は入札禁止</span>
            : pct ? (secret ? <span>予算の<span className="gold">{pct}%</span>{dumping ? `×${DUMP_RATE}` : ''}で入札（金額は非公開）</span>
              : <span><span className="num gold" style={{ fontSize: 18 }}>{bidAmount(p.budget, pct, dumping).toLocaleString()}</span>万円で入札{dumping ? '（ダンピング込み）' : ''}</span>)
              : <span className="faint">見送り</span>}
        </div>
        <div className="seg">
          <button className={!pct ? 'on' : 'off'} disabled={locked} onClick={() => onPick(undefined)}>見送り</button>
          {BID_PCTS.map(x => <button key={x} className={pct === x ? 'on gold' : ''} disabled={locked} onClick={() => onPick(x as BidPct)}>{x}%</button>)}
        </div>
      </div>
    </div>
  );
}

export function CardTile({ k, sel, onTap, onLong, mini }: { k: CardKey; sel?: boolean; onTap?: () => void; onLong?: () => void; mini?: boolean }) {
  const c = CARDS[k];
  const lp = useLongPress(() => onLong?.(), onTap);
  return (
    <button className={`ccard ${c.kind} ${sel ? 'sel' : ''} ${mini ? 'mini' : ''}`} {...lp} aria-pressed={sel}>
      <span className="ck">{c.kind === 'defense' ? '自動発動' : c.kind === 'self' ? '自分に' : '妨害'}</span>
      <span className="ci">{c.icon}</span>
      <span className="cn">{c.name}</span>
      <span className="cd">{c.desc}</span>
    </button>
  );
}

export function CardDetail({ k, onClose }: { k: CardKey; onClose: () => void }) {
  const c = CARDS[k];
  const blockers = (Object.keys(CARDS) as CardKey[]).filter(d => CARDS[d].blocks?.includes(k));
  return (
    <Sheet onClose={onClose} title={<>{c.icon} {c.name}</>} sub={c.kind === 'defense' ? '防御カード：手札にあるだけで自動発動し、使うと捨て札になります' : c.kind === 'self' ? '自分に使うカード' : '妨害カード：入札フェーズで相手を選んで使います'}>
      <div className="card"><b>効果</b><p style={{ margin: '6px 0 0' }}>{c.desc}</p></div>
      {c.blocks && <div className="card"><b>防げる妨害</b><div className="chips" style={{ marginTop: 6 }}>{c.blocks.map(b => <span className="chip" key={b}>{CARDS[b].icon} {CARDS[b].name}</span>)}</div></div>}
      {blockers.length > 0 && <div className="card"><b>このカードを防ぐ防御</b><div className="chips" style={{ marginTop: 6 }}>{blockers.map(b => <span className="chip blue" key={b}>{CARDS[b].icon} {CARDS[b].name}</span>)}</div></div>}
      <div className="note">山札の枚数：{c.count}枚</div>
    </Sheet>
  );
}
