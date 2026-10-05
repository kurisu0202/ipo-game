// ===== 入札タブ =====
import { useState } from 'react';
import { ABANDON, BID_PCTS, CARDS, DESIGN_BONUS, INTERIM, DUMP_RATE, ENGINEER, FIRE_DEBT, HIRE_FEES, LATE_PENALTY, PROJECT_TYPES, REPEAT_BONUS, REP_DISCOUNT, SECRET_MULTS, SKILLS, SKILL_NAME, STOCK_CHANCE, TAGS } from '../logic/config';
import { checkReqs, quarterLabel, round10, skillSum, sumSkills, totalQ } from '../logic/calc';
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

      <div className="sec-title">📋 今期の案件 <span className="n">{g.market.length}</span><small>入札は予算に対する%。一番安い会社が落札・長押しで利益の目安</small></div>
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
  const [info, setInfo] = useState(false);
  const lp = useLongPress(() => setInfo(true));
  return (
    <>
    <div className={`card lp ${secret ? 'secret-card' : ''} ${pct ? 'selected' : ''}`} {...lp}>
      <div className="proj-top">
        <span className={`ptype ${p.type}`}>{spec.icon} {spec.name}</span>
        {p.tags.map(t => <span key={t} className={`tag ${t === 'muri' || t === 'haggle' || t === 'legacy' ? 'bad' : ''}`}>{TAGS[t].name}：{TAGS[t].desc}</span>)}
        <span className="chip" style={{ marginLeft: 'auto' }}>⏱ {p.duration}期</span>
      </div>
      <div className="proj-name">{p.name}</div>
      <div className="proj-desc">{spec.desc}</div>
      <div className="money-row">
        {secret ? <span className="num" style={{ fontSize: 20 }}>予算 ？？？</span> : <span className="num">{p.budget.toLocaleString()}<small>万円</small></span>}
        <span className="chip">{p.pay === 'turn' ? '毎期払い' : '中間金＋完了時'}</span>
        <button className="chip blue" style={{ marginLeft: 'auto' }} onClick={() => setInfo(true)}>💰 利益の目安</button>
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
    {info && <ProjectDetail g={g} me={me} p={p} pct={pct} dumping={dumping} onClose={() => setInfo(false)} />}
    </>
  );
}

/** 必要スキルぴったりの社員で担当したときの、1期あたりの給料の目安（1人あたりスキル4前後と仮定） */
function salaryEstimate(reqs: Skills) {
  const sk = skillSum(reqs);
  const people = Math.max(1, Math.ceil(sk / 4));
  return { sk, people, perQ: round10(ENGINEER.salaryBase * people + ENGINEER.salaryPerSkill * sk) };
}

function ProjectDetail({ g, me, p, pct, dumping, onClose }: { g: Game; me: Company; p: Project; pct?: BidPct; dumping: boolean; onClose: () => void }) {
  const spec = PROJECT_TYPES[p.type];
  const secret = p.type === 'secret';
  const haggle = p.tags.includes('haggle');
  const last = totalQ(g) - 1;
  const doneQ = g.q + p.duration - 1;            // 最短で完了する期（落札した期の開発フェーズから着手）
  const tooLate = doneQ > last;
  const sal = salaryEstimate(p.reqs);
  const cost = sal.perQ * p.duration;
  const rows = BID_PCTS.map(x => {
    const price = secret ? 0 : bidAmount(p.budget, x, dumping);
    const got = round10(price * (haggle ? TAGS.haggle.mult! : 1)) + (p.tags.includes('repeat') ? REPEAT_BONUS : 0);
    return { x, price, got, profit: got - cost };
  });
  const diff = haggle || p.tags.includes('repeat');   // 受注額と受け取りが違うときだけ列を出す
  const when = p.pay === 'turn'
    ? `進んだ期ごとに、その期の決算で 受注額÷${p.duration} ずつ（最短 ${quarterLabel(g.q)}〜${quarterLabel(Math.min(doneQ, last))}）`
    : `進んだ期ごとに中間金（受注額の${INTERIM * 100}%÷${p.duration}）を受け取り、残りは完了した期の決算で（最短 ${quarterLabel(Math.min(doneQ, last))}）`;
  const notes: string[] = [];
  if (haggle) notes.push(`値切り屋：受け取りは受注額の×${TAGS.haggle.mult}`);
  if (p.tags.includes('repeat')) notes.push(`リピートあり：完了時に+${REPEAT_BONUS}（表に含めています）`);
  if (p.tags.includes('record')) notes.push('実績になる：完了で評判+1（次からの入札が有利に）');
  if (p.tags.includes('muri')) notes.push('無茶な要件：進むたびに負債+1');
  if (p.tags.includes('legacy')) notes.push('レガシー環境：インフラ+1が必要（必要スキルに含めています）');
  if (p.type === 'fire') notes.push(`炎上火消し：落札した時点で負債+${FIRE_DEBT}`);
  if (p.type === 'overseas') notes.push('海外案件：ハプニング「為替の急変動」が来ると報酬が×2か×0.5に');
  if (p.type === 'design') notes.push(`デザイン重視：デザインを必要量+${DESIGN_BONUS.extra}以上そろえると報酬×${DESIGN_BONUS.mult}`);
  if (p.type === 'startup') notes.push(`スタートアップ：完了すると${STOCK_CHANCE * 100}%で株（最終決算で価値が決まる）`);
  if (p.type === 'ai') notes.push('AI案件：完了でAIノウハウ+1');
  if (secret) notes.push(`極秘案件：予算は非公開。完了時に×${SECRET_MULTS[0]}〜×${SECRET_MULTS[SECRET_MULTS.length - 1]}のどれかになる`);
  return (
    <Sheet onClose={onClose} title={<>{spec.icon} {p.name}</>} sub={`${spec.name}・${p.duration}期・${p.pay === 'turn' ? '毎期払い' : '中間金＋完了時'}`}>
      <div className="card">
        <b>💰 お金が入るのは</b>
        <p style={{ margin: '6px 0 0' }}>{when}</p>
        {tooLate
          ? <div className="warn" style={{ marginTop: 8 }}>⚠ 普通に進めると{totalQ(g)}期目（{quarterLabel(last)}）までに終わりません。突貫（1期で2進む・負債+2）が必要です。受け取れるのは進んだ分の中間金だけです</div>
          : <p className="note" style={{ margin: '6px 0 0' }}>必要スキルを満たす社員を割り当てると1期に1進みます。足りない期は進まず、締切（{quarterLabel(doneQ)}）より遅れると1期ごとに報酬−{LATE_PENALTY * 100}%</p>}
      </div>
      <div className="card">
        <b>🧮 入札率ごとの目安</b>
        {secret
          ? <p className="note" style={{ margin: '6px 0 0' }}>予算が非公開のため金額は出せません。受け取りは「予算×入札率×極秘倍率」です</p>
          : (
            <table className="ptable">
              <thead><tr><th>入札</th><th>受注額</th>{diff && <th>受け取り</th>}<th>利益の目安</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.x} className={pct === r.x ? 'on' : ''}>
                    <td>{r.x}%</td><td>{r.price.toLocaleString()}</td>{diff && <td>{r.got.toLocaleString()}</td>}
                    <td className={r.profit >= 0 ? 'up' : 'down'}>{r.profit >= 0 ? '+' : '−'}{Math.abs(r.profit).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <p className="note" style={{ margin: '8px 0 0' }}>
          利益の目安 ＝ {diff ? '受け取り' : '受注額'} − 担当社員の給料 約{cost.toLocaleString()}万円（必要スキル{sal.sk}を約{sal.people}人で担当、{sal.perQ}万円/期×{p.duration}期として計算）。
          社員は案件がなくても給料がかかるので、空いている社員に担当させるなら{diff ? '受け取り' : '受注額'}がほぼそのまま利益になります。{dumping ? `ダンピング（×${DUMP_RATE}）込みです。` : ''}
        </p>
      </div>
      <div className="card">
        <b>🏁 落札のしくみ</b>
        <p style={{ margin: '6px 0 0' }}>一番安い会社が落札し、<b>入札した額がそのまま受注額</b>になります（100%なら予算満額）。
          比べるときだけ評判で割り引かれます：あなたは評判{me.rep}なので、入札額×{(1 - REP_DISCOUNT * me.rep).toFixed(2)} で比べられます。</p>
        <p className="note" style={{ margin: '6px 0 0' }}>取ったあとで手に負えなくなったら、開発フェーズで途中放棄もできます（違約金＝受注額の{ABANDON.penalty * 100}%・評判{ABANDON.rep}）。</p>
      </div>
      {notes.length > 0 && <div className="card"><b>📌 この案件の特徴</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{notes.map(n => <li key={n}>{n}</li>)}</ul></div>}
    </Sheet>
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
