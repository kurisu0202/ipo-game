// ===== 開発タブ =====
import { useState } from 'react';
import { ABANDON, FUNDS, GROWTH, INVEST, INVESTIGATE_COST, TRAINING, TRAITS, PROJECT_TYPES, RENTAL, SERVICE, SKILLS, SKILL_ICON, SKILL_NAME, SPY_ORDER_DESC, SPY_ORDER_NAME, TAGS, xpNeed } from '../logic/config';
import { assignees, effSkills, hasSlot, launchCost, projectCheck, quarterLabel, rushDebt, season, serviceIncome, servicePower, skillSum, slots, sumSkills, toggleSlot, totalQ, working } from '../logic/calc';
import { abandonFee, canTrain, pendingSpies } from '../logic/game';
import type { ActiveProject, Company, DevSubmit, Engineer, Game, Skill, SpyOrder } from '../logic/types';
import type { PlayerView } from '../logic/view';
import { Coach, SecretFile } from './parts';
import { sfx } from './fx/sound';
import { Face, Sheet, SkillChips } from './ui';

interface P { v: PlayerView; me: Company; draft: DevSubmit; set: (f: (d: DevSubmit) => DevSubmit) => void; locked: boolean }
type Target = string | 'svc';

const ORDERS: SpyOrder[] = ['intel', 'sabo', 'steal'];
const missingText = (m: Partial<Record<Skill, number>>) => SKILLS.filter(k => m[k]).map(k => `${SKILL_NAME[k]} あと${m[k]}`).join('・');

export function DevTab({ v, me, draft, set, locked }: P) {
  const g = v.game;
  const [sheet, setSheet] = useState<Target | null>(null);
  const assign = draft.assign as Record<string, string>;
  const setAssign = (eid: string, to: string) => set(d => ({ ...d, assign: { ...d.assign, [eid]: to } }));
  const pend = pendingSpies(g, me.id);

  const autofill = (p: ActiveProject) => {
    sfx.tap();
    set(d => {
      const a = { ...(d.assign as Record<string, string>) };
      for (let guard = 0; guard < 12; guard++) {
        const chk = projectCheck(g, me, p, a);
        if (chk.ok) break;
        let best = ''; let gain = 0;
        for (const e of me.engineers) {
          if ((a[e.id] ?? '') !== '' || !working(g, e)) continue;
          const s = effSkills(g, me, e);
          const gn = SKILLS.reduce((t, k) => t + Math.min(chk.missing[k] || 0, s[k] || 0), 0);
          if (gn > gain) { gain = gn; best = e.id; }
        }
        if (!best) break;
        a[best] = p.id;
      }
      return { ...d, assign: a };
    });
  };

  return (
    <div className="content">
      <Coach phase="dev" q={g.q} />
      <SecretFile v={v} me={me} orders={draft.spyOrders} locked={locked} open={pend.length > 0}
        setOrder={(eid, o) => set(d => ({ ...d, spyOrders: { ...d.spyOrders, [eid]: o } }))} />
      {me.effects.slack === g.q && <div className="warn" style={{ marginTop: 10 }}>💬 深夜のSlack爆撃で、今期は全社員のスキル−1</div>}

      <div className="sec-title">🛠️ 進行中の案件 <span className="n">{me.projects.length}</span></div>
      {me.projects.length === 0 && <div className="empty">進行中の案件はありません。待機中の社員は負債を返す（リファクタリング）か、サービスに回しましょう</div>}
      {me.projects.map(p => (draft.drop || []).includes(p.id) ? (
        <div className="card dropped" key={p.id}>
          <div className="row">
            <div className="grow"><b>🗑️ {p.name}</b><div className="note">放棄予定：違約金 −{abandonFee(p).toLocaleString()}万円・評判{ABANDON.rep}{p.paid ? `（受取済みの中間金 ${p.paid.toLocaleString()} は返さなくてOK）` : ''}</div></div>
            {!locked && <button className="btn sm" onClick={() => { sfx.tap(); set(d => ({ ...d, drop: (d.drop || []).filter(x => x !== p.id) })); }}>取り消す</button>}
          </div>
        </div>
      ) : (
        <ProjectDevCard key={p.id} g={g} me={me} p={p} assign={assign} rush={draft.rush.includes(p.id)} locked={locked}
          onDrop={() => {
            if (!confirm(`「${p.name}」を途中放棄しますか？

・違約金 ${abandonFee(p).toLocaleString()}万円（受注額の${ABANDON.penalty * 100}%）
・評判${ABANDON.rep}
・これまでの進捗は失われます${p.paid ? `
・受け取り済みの中間金 ${p.paid.toLocaleString()}万円 はそのまま` : ''}

担当していた社員は、今期ほかの仕事に回せます。`)) return;
            sfx.tap();
            set(d => {
              const a = { ...(d.assign as Record<string, string>) };
              Object.keys(a).forEach(id => { if (a[id] === p.id) a[id] = ''; });
              return { ...d, assign: a, rush: d.rush.filter(x => x !== p.id), drop: [...(d.drop || []), p.id] };
            });
          }}
          onOpen={() => setSheet(p.id)} onFill={() => autofill(p)} onRemove={eid => setAssign(eid, '')}
          onRush={() => { sfx.tap(); set(d => ({ ...d, rush: d.rush.includes(p.id) ? d.rush.filter(x => x !== p.id) : [...d.rush, p.id] })); }} />
      ))}

      <div className="sec-title">🚀 自社サービス</div>
      <ServiceCard g={g} me={me} draft={draft} assign={assign} locked={locked} onOpen={() => setSheet('svc')} onRemove={eid => setAssign(eid, '')}
        onLaunch={() => { sfx.coin(); set(d => ({ ...d, launch: !d.launch, assign: d.launch ? Object.fromEntries(Object.entries(d.assign).map(([k, x]) => [k, x === 'svc' ? '' : x])) : d.assign })); }} />

      <TrainCard g={g} me={me} draft={draft} locked={locked}
        onTrain={(eid, k) => { sfx.tap(); set(d => ({ ...d, assign: { ...d.assign, [eid]: 'train' }, train: { ...(d.train || {}), [eid]: k } })); }}
        onCancel={eid => { sfx.tap(); set(d => { const t = { ...(d.train || {}) }; delete t[eid]; return { ...d, assign: { ...d.assign, [eid]: '' }, train: t }; }); }} />

      <InvestCard g={g} me={me} draft={draft} locked={locked}
        onSet={(fid, v) => { sfx.coin(); set(d => { const inv = { ...(d.invest || {}) }; if (v) inv[fid] = v; else delete inv[fid]; return { ...d, invest: inv }; }); }} />

      <BackOps g={g} me={me} draft={draft} set={set} locked={locked} />

      <details className="fold">
        <summary>👥 社員一覧・解雇 <span className="chip">{me.engineers.length}人</span></summary>
        <div className="fold-body">
          {me.engineers.map(e => {
            const fire = assign[e.id] === 'fire';
            return (
              <div className="eng" key={e.id}>
                <Face name={e.name} />
                <div className="grow">
                  <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><span className="nm">{e.name}</span><EngBadges g={g} e={e} me={me} /></div>
                  <div style={{ marginTop: 4 }}><SkillChips skills={e.skills} /></div>
                  <XpLine e={e} />
                  <TraitLine e={e} />
                  <div className="sal">給料 {e.salary}{e.loan ? '（貸し手が負担）' : ''}・{placeName(me, assign[e.id] ?? '')}</div>
                </div>
                {!e.loan && <button className={`btn xs ${fire ? 'danger' : ''}`} disabled={locked} onClick={() => { sfx.tap(); setAssign(e.id, fire ? '' : 'fire'); }}>{fire ? '解雇取消' : '解雇'}</button>}
              </div>
            );
          })}
          <div className="note" style={{ marginTop: 8 }}>解雇すると退職金（給料1期分）。借りている社員は解雇できません。</div>
        </div>
      </details>

      {sheet && <AssignSheet g={g} me={me} target={sheet} assign={assign} locked={locked}
        onToggle={(eid, on) => { sfx.tap(); const e = me.engineers.find(x => x.id === eid)!; setAssign(eid, toggleSlot(e, assign[eid] ?? '', sheet, on)); }} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function placeName(me: Company, a: string) {
  if (a === 'fire') return '解雇予定';
  if (a === 'train') return '研修';
  if (!a) return '待機';
  return slots(a).map(t => (t === 'svc' ? 'サービス担当' : `「${me.projects.find(p => p.id === t)?.name || '案件'}」担当`)).join('＋');
}

/** 投資：今年の候補にお金を入れる。結果は冬の決算で */
function InvestCard({ g, me, draft, locked, onSet }: { g: Game; me: Company; draft: DevSubmit; locked: boolean; onSet: (fid: string, v: number) => void }) {
  const funds = g.funds || [];
  if (!funds.length) return null;
  const plan = draft.invest || {};
  const planned = Object.values(plan).reduce((t, v) => t + v, 0);
  const left = Math.max(0, me.cash) - planned;
  const held = (fid: string) => (me.invest || []).filter(h => h.fund === fid).reduce((t, h) => t + h.amount, 0);
  const heldAll = (me.invest || []).reduce((t, h) => t + h.amount, 0);
  const toWinter = 3 - season(g.q);
  const range = (k: keyof typeof FUNDS) => { const m = FUNDS[k].outcomes.map(o => o[0]); return `×${Math.min(...m)}〜×${Math.max(...m)}`; };
  return (
    <>
      <div className="sec-title">💹 投資 <small>{toWinter === 0 ? '今期の決算で結果発表！' : `結果は冬の決算で発表（あと${toWinter}期）`}</small></div>
      <div className="card">
        <div className="note" style={{ marginBottom: 8 }}>今年の投資先です。同じ投資先に入れた会社は同じ倍率になります。運しだい！{heldAll > 0 && <b>（今年の投資 計{heldAll.toLocaleString()}万円）</b>}</div>
        {funds.map(f => {
          const s = FUNDS[f.kind];
          const v = plan[f.id] || 0;
          return (
            <div className="fund" key={f.id}>
              <div className="row"><span style={{ fontSize: 24 }}>{s.icon}</span>
                <div className="grow" style={{ minWidth: 0 }}><b>{f.name}</b><div className="note">{s.label}・{s.desc}</div></div>
                <div style={{ textAlign: 'right' }}><div className="risk" aria-label={`リスク${s.risk}`}>{'★'.repeat(s.risk)}<span>{'★'.repeat(5 - s.risk)}</span></div><div className="note">{range(f.kind)}</div></div></div>
              {held(f.id) > 0 && <div className="note gold" style={{ marginTop: 4 }}>保有中 {held(f.id).toLocaleString()}万円</div>}
              <div className="seg" style={{ marginTop: 6 }}>
                <button className={!v ? 'on' : 'off'} disabled={locked} onClick={() => onSet(f.id, 0)}>なし</button>
                {INVEST.amounts.map(a => <button key={a} className={v === a ? 'on gold' : ''} disabled={locked || (v !== a && a > left + v)} onClick={() => onSet(f.id, a)}>{a}</button>)}
              </div>
            </div>
          );
        })}
        <div className="note" style={{ marginTop: 8 }}>{planned ? <>今期の投資 <b>{planned.toLocaleString()}万円</b>（決定すると現金から引かれます）・</> : null}投資に使えるのは手元の現金（{Math.max(0, me.cash).toLocaleString()}万円）まで</div>
      </div>
    </>
  );
}

/** 研修：空いている社員を研修に行かせる（スキル+1・新スキル習得。30%で来期は休み） */
function TrainCard({ g, me, draft, locked, onTrain, onCancel }: {
  g: Game; me: Company; draft: DevSubmit; locked: boolean; onTrain: (eid: string, k: Skill) => void; onCancel: (eid: string) => void;
}) {
  const [pickFor, setPickFor] = useState<Engineer | null>(null);
  const a = draft.assign as Record<string, string>;
  const list = me.engineers.filter(e => !e.loan && working(g, e) && ((a[e.id] ?? '') === '' || a[e.id] === 'train'));
  const last = g.q >= totalQ(g) - 1;
  return (
    <>
      <div className="sec-title">📚 研修 <small>空いている社員のスキルを伸ばす・{TRAINING.restChance * 100}%で来期は休み</small></div>
      <div className="card">
        {list.length === 0 && <div className="note">今期は空いている社員がいません（案件・サービスの担当から外すと研修に行けます）</div>}
        {last && list.length > 0 && <div className="warn" style={{ marginBottom: 8 }}>⚠ 最後の期です。研修しても活かす期がありません</div>}
        {list.map(e => {
          const k = a[e.id] === 'train' ? draft.train?.[e.id] : undefined;
          const lv = k ? e.skills[k] || 0 : 0;
          return (
            <div className="member" key={e.id}>
              <Face name={e.name} size={26} />
              <div className="grow" style={{ minWidth: 0 }}>
                <span className="nm">{e.name}</span>
                {k ? <div className="note up">📚 {SKILL_ICON[k]}{SKILL_NAME[k]} {lv ? `${lv}→${lv + 1}` : '新しく習得（0→1）'}・{e.trait === 'tough' ? '💪休みなし' : `${TRAINING.restChance * 100}%で来期は休み`}</div>
                  : <div style={{ marginTop: 2 }}><SkillChips skills={e.skills} /></div>}
              </div>
              {!locked && (k ? <button className="btn xs" onClick={() => onCancel(e.id)}>取消</button> : <button className="btn xs" onClick={() => setPickFor(e)}>研修へ</button>)}
            </div>
          );
        })}
        <div className="note" style={{ marginTop: 8 }}>研修した社員は、選んだスキルが+1（持っていなければ新しく習得）、給料+{TRAINING.raise}。今期の決算で反映されます。{TRAINING.restChance * 100}%の確率で疲れて来期は1期お休み（💪体力おばけは休まない）{TRAINING.fee ? `（研修費 ${TRAINING.fee}万円）` : ''}。</div>
      </div>
      {pickFor && (
        <Sheet onClose={() => setPickFor(null)} title={<>📚 {pickFor.name} の研修</>} sub={`伸ばすスキルを選んでください（${pickFor.trait === 'tough' ? '💪体力おばけなので休みなし' : `${TRAINING.restChance * 100}%で来期は休み`}）`}>
          {SKILLS.map(k => {
            const lv = pickFor.skills[k] || 0;
            const ok = canTrain(g, pickFor, k);
            const need = me.projects.reduce((t, p) => t + (p.reqs[k] || 0), 0);
            return (
              <button key={k} className="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} disabled={!ok}
                onClick={() => { onTrain(pickFor.id, k); setPickFor(null); }}>
                <div className="row"><span style={{ fontSize: 22 }}>{SKILL_ICON[k]}</span>
                  <div className="grow"><b>{SKILL_NAME[k]}</b> <span className={lv ? '' : 'up'}>{!ok ? `${lv}（上限）` : lv ? `${lv} → ${lv + 1}` : '新しく習得 0 → 1'}</span>
                    {need > 0 && <div className="note">進行中の案件で必要：{SKILL_NAME[k]} 合計{need}</div>}</div></div>
              </button>
            );
          })}
        </Sheet>
      )}
    </>
  );
}

/** 特技の説明（例：🔀 掛け持ち：1期に2つ…） */
export function TraitLine({ e }: { e: Engineer }) {
  if (!e.trait) return null;
  const t = TRAITS[e.trait];
  return <div className={`trait-line r${t.rarity}`}>{t.icon} <b>{t.name}</b>{'★'.repeat(t.rarity)}：{t.desc}</div>;
}

/** 経験値の進み具合（例：📈 バック 2/4） */
export function XpLine({ e }: { e: Engineer }) {
  const list = SKILLS.filter(k => (e.skills[k] || 0) > 0 && (e.skills[k] || 0) < GROWTH.maxSkill)
    .map(k => ({ k, have: e.xp?.[k] || 0, need: xpNeed(e.skills[k] || 0) }))
    .filter(x => x.have > 0);
  if (!list.length) return null;
  return <div className="xp">📈 経験 {list.map(x => <span key={x.k}>{SKILL_ICON[x.k]}{SKILL_NAME[x.k]} {x.have}/{x.need}</span>)}</div>;
}

export function EngBadges({ g, e, me }: { g: Game; e: Engineer; me?: Company }) {
  const lender = e.loan ? g.companies.find(c => c.id === e.loan!.from) : null;
  return (
    <>
      {e.trait && <span className={`badge-k trait r${TRAITS[e.trait].rarity}`} title={TRAITS[e.trait].desc}>{TRAITS[e.trait].icon}{TRAITS[e.trait].name}</span>}
      {e.legend && <span className="badge-k legend">伝説</span>}
      {e.rookie && <span className="badge-k rookie">新人</span>}
      {e.loan && <span className="badge-k rent">{lender?.name}から{quarterLabel(e.loan.until)}まで</span>}
      {e.via === 'hh' && <span className="badge-k hh">引き抜き</span>}
      {e.checked === 'spy' && <span className="badge-k spy">スパイ確定</span>}
      {e.checked === 'clean' && <span className="badge-k rookie">調査済み・シロ</span>}
      {e.spy && me && e.spy.for === me.id && <span className="badge-k spy">あなたのスパイ</span>}
      {e.restQ === g.q && <span className="badge-k rest">今期お休み</span>}
      {e.restQ === g.q + 1 && <span className="badge-k rest">来期お休み</span>}
    </>
  );
}

/** 自社の案件：今の担当で何が足りていて何が足りないか */
export function ProjectSkillSheet({ g, me, p, onClose }: { g: Game; me: Company; p: ActiveProject; onClose: () => void }) {
  const chk = projectCheck(g, me, p);
  const team = assignees(me, p.id);
  const free = me.engineers.filter(e => !slots(e.assign).length && working(g, e));
  const freeSum = sumSkills(g, me, free);
  const allSum = sumSkills(g, me, me.engineers);
  const rows = SKILLS.filter(k => p.reqs[k]).map(k => {
    const need = p.reqs[k] || 0, have = chk.sums[k] || 0;
    const status = have >= need ? { t: '✓ 足りている', c: 'up' }
      : have + (freeSum[k] || 0) >= need ? { t: `空いている社員で補える`, c: 'gold' }
        : (allSum[k] || 0) >= need ? { t: '他の仕事から回せば足りる', c: 'gold' }
          : { t: `社員全員でも${need - (allSum[k] || 0)}不足`, c: 'down' };
    return { k, need, have, free: freeSum[k] || 0, all: allSum[k] || 0, status };
  });
  const place = (e: Engineer) => (slots(e.assign).length ? slots(e.assign).map(t => (t === 'svc' ? 'サービス' : me.projects.find(x => x.id === t)?.name || '案件')).join('＋') : '空き');
  const holders = (k: Skill) => me.engineers.filter(e => (e.skills[k] || 0) > 0 && !hasSlot(e.assign, p.id));
  return (
    <Sheet onClose={onClose} title={<>{PROJECT_TYPES[p.type].icon} {p.name}</>}
      sub={chk.ok ? '✓ 今の担当のままなら、次の開発フェーズで進みます' : team.length ? `⚠ 今の担当では ${missingText(chk.missing)} 足りません` : '⚠ まだ担当者がいません（開発フェーズで割り当て）'}>
      <Gauges reqs={p.reqs} sums={chk.sums} />
      <div className="card">
        <b>スキルごとの状況</b>
        <table className="ptable">
          <thead><tr><th>スキル</th><th>必要</th><th>担当中</th><th>空き</th><th>全員</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k}><td>{SKILL_ICON[r.k]} {SKILL_NAME[r.k]}</td><td>{r.need}</td><td>{r.have}</td><td>{r.free}</td><td>{r.all}</td></tr>
          ))}</tbody>
        </table>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {rows.map(r => <li key={r.k}><b>{SKILL_NAME[r.k]}</b>：<span className={r.status.c}>{r.status.t}</span>
            {r.have < r.need && holders(r.k).length > 0 && <div className="note">持っている人：{holders(r.k).map(e => `${e.name}（${SKILL_NAME[r.k]}${effSkills(g, me, e)[r.k] || 0}・${place(e)}${working(g, e) ? '' : '・今期休み'}）`).join('、')}</div>}
          </li>)}
        </ul>
      </div>
      <div className="card">
        <b>担当中の社員</b>
        {team.length === 0 && <div className="note" style={{ marginTop: 6 }}>まだいません</div>}
        {team.map(e => (
          <div className="member" key={e.id}><Face name={e.name} size={26} /><span className="nm">{e.name}</span>{!working(g, e) && <span className="tagx">休み</span>}<span className="grow" /><SkillChips skills={effSkills(g, me, e)} /></div>
        ))}
      </div>
      <div className="note">{g.phase === 'bid' ? '割り当ての変更は開発フェーズで行います。足りないスキルは、この入札フェーズで採用・レンタルして補うこともできます。' : '割り当ては「開発」タブで変更できます。足りないスキルは、次の入札フェーズで採用・レンタルして補うこともできます。'}</div>
    </Sheet>
  );
}

function Gauges({ reqs, sums }: { reqs: Partial<Record<Skill, number>>; sums: Partial<Record<Skill, number>> }) {
  return (
    <div className="gauges">
      {SKILLS.filter(k => reqs[k]).map(k => {
        const need = reqs[k] || 0, have = sums[k] || 0;
        return (
          <div key={k} className={`gauge ${have < need ? 'short' : ''}`}>
            <div className="gh"><span>{SKILL_ICON[k]} {SKILL_NAME[k]}</span><span>{have}/{need}{have < need ? ` あと${need - have}` : ' ✓'}</span></div>
            <div className="gb"><i style={{ width: `${Math.min(100, have / need * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectDevCard({ g, me, p, assign, rush, locked, onOpen, onFill, onRemove, onRush, onDrop }: {
  g: Game; me: Company; p: ActiveProject; assign: Record<string, string>; rush: boolean; locked: boolean;
  onOpen: () => void; onFill: () => void; onRemove: (eid: string) => void; onRush: () => void; onDrop: () => void;
}) {
  const spec = PROJECT_TYPES[p.type];
  const chk = projectCheck(g, me, p, assign);
  const team = assignees(me, p.id, assign);
  const left = p.deadline - g.q;
  const steps = chk.ok ? (rush ? 2 : 1) : 0;
  const after = Math.min(p.work, p.progress + steps);
  const late = g.q > p.deadline;
  return (
    <div className={`card ${chk.ok ? '' : 'hl'}`}>
      <div className="proj-top">
        <span className={`ptype ${p.type}`}>{spec.icon} {spec.name}</span>
        {p.tags.map(t => <span key={t} className={`tag ${t === 'muri' || t === 'haggle' || t === 'legacy' ? 'bad' : ''}`}>{TAGS[t].name}</span>)}
        {p.fx !== 1 && <span className={`chip ${p.fx > 1 ? 'up' : 'down'}`}>為替×{p.fx}</span>}
      </div>
      <div className="proj-name">{p.name}</div>
      <div className="row note" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span>契約額 <b className="gold num">{p.price.toLocaleString()}</b>万円{p.pay === 'turn' ? '（毎期払い）' : p.paid ? `（中間金 ${p.paid.toLocaleString()} 受取済み）` : ''}</span>
        <span className={late ? 'down' : left <= 0 ? 'gold' : ''}>納期 {quarterLabel(p.deadline)}{late ? `（${g.q - p.deadline}期遅れ・報酬−${(g.q - p.deadline) * 10}%）` : left === 0 ? '（今期まで！）' : `（あと${left}期）`}</span>
      </div>
      <div className="pbar"><i className="next" style={{ width: `${after / p.work * 100}%` }} /><i style={{ width: `${p.progress / p.work * 100}%` }} /></div>
      <div className="row note" style={{ justifyContent: 'space-between' }}><span>進捗 {p.progress}/{p.work}</span>{steps > 0 && <span className="up">→ 今期 {after}/{p.work}{after >= p.work ? ' 完了！' : ''}</span>}</div>
      <div style={{ marginTop: 8 }}>
        {chk.ok ? <div className="okbar">✓ 今期{steps}期分進みます{after >= p.work ? '（完了！）' : ''}</div>
          : <div className="warn">⚠ {missingText(chk.missing)} 足りません</div>}
      </div>
      <Gauges reqs={p.reqs} sums={chk.sums} />
      {team.map(e => (
        <div className="member" key={e.id}>
          <Face name={e.name} size={26} />
          <span className="nm">{e.name}</span>
          {!working(g, e) && <span className="tagx">休み</span>}
          <span className="grow" />
          <SkillChips skills={Object.fromEntries(SKILLS.filter(k => p.reqs[k] && e.skills[k]).map(k => [k, effSkills(g, me, e)[k] || 0]))} />
          {!locked && <button className="btn xs" onClick={() => onRemove(e.id)}>外す</button>}
        </div>
      ))}
      {!locked && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm grow" onClick={onOpen}>＋ 社員を割り当てる</button>
          {!chk.ok && <button className="btn sm" onClick={onFill}>空いている人で埋める</button>}
        </div>
      )}
      <button className={`rush ${rush ? 'on' : ''}`} disabled={locked} onClick={onRush}>
        <span className="check" />
        <span className="grow">🏃 突貫工事<div className="note" style={{ fontWeight: 500 }}>進捗+2になるかわりに負債+{rushDebt(me)}（スキルを満たしたときだけ）</div></span>
      </button>
      {!locked && <button className="link-btn" onClick={onDrop}>🗑️ この案件を途中放棄する（違約金 {abandonFee(p).toLocaleString()}・評判{ABANDON.rep}）</button>}
    </div>
  );
}

function ServiceCard({ g, me, draft, assign, locked, onOpen, onRemove, onLaunch }: {
  g: Game; me: Company; draft: DevSubmit; assign: Record<string, string>; locked: boolean; onOpen: () => void; onRemove: (eid: string) => void; onLaunch: () => void;
}) {
  if (!me.service && !draft.launch) {
    return (
      <div className="card">
        <b>まだ自社サービスがありません</b>
        <p className="note" style={{ margin: '6px 0 10px' }}>{launchCost(me)}万円で立ち上げ。担当社員のスキル合計が「3＋Lv」以上だとLvが1上がり、毎期の収入が増えます（Lv1:{serviceIncome(me, 1)} → Lv5:{serviceIncome(me, 5)}）。最終決算ではLv×{SERVICE.valuePerLv}万円の価値。</p>
        <button className="btn gold big" disabled={locked} onClick={onLaunch}>🚀 {launchCost(me)}万円で立ち上げる</button>
      </div>
    );
  }
  const lv = me.service?.level || 0;
  const need = 3 + lv;
  const power = servicePower(g, me, assign);
  const team = assignees(me, 'svc', assign);
  return (
    <div className="card">
      <div className="row">
        <div className="grow"><b>{draft.launch ? '🚀 今期立ち上げ予定' : `自社サービス Lv${lv}`}</b>
          <div className="note">収入 {serviceIncome(me, lv)}万円/期{me.effects.review === g.q ? '（口コミ被害で今期は半分）' : ''}・価値 {lv * SERVICE.valuePerLv}万円</div></div>
        {draft.launch && !locked && <button className="btn xs" onClick={onLaunch}>取りやめ</button>}
      </div>
      <div className="row" style={{ gap: 4, margin: '10px 0' }}>
        {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= lv ? 'var(--gold)' : 'var(--line)' }} />)}
      </div>
      {lv < SERVICE.maxLv ? (
        <div className={`gauge ${power < need ? 'short' : ''}`}>
          <div className="gh"><span>Lvアップ条件（担当スキル合計）</span><span>{power}/{need}{power >= need ? ' ✓ Lvアップ！' : ` あと${need - power}`}</span></div>
          <div className="gb"><i style={{ width: `${Math.min(100, power / need * 100)}%` }} /></div>
        </div>
      ) : <div className="okbar">🏆 最大レベル！</div>}
      <div style={{ marginTop: 8 }}>
        {team.map(e => (
          <div className="member" key={e.id}><Face name={e.name} size={26} /><span className="nm">{e.name}</span><span className="grow note">スキル計 {skillSum(effSkills(g, me, e))}</span>
            {!locked && <button className="btn xs" onClick={() => onRemove(e.id)}>外す</button>}</div>
        ))}
      </div>
      {!locked && <button className="btn sm" style={{ width: '100%', marginTop: 8 }} onClick={onOpen}>＋ 社員を割り当てる</button>}
    </div>
  );
}

function BackOps({ g, me, draft, set, locked }: { g: Game; me: Company; draft: DevSubmit; set: P['set']; locked: boolean }) {
  const outsiders = me.engineers.filter(e => e.via);
  const own = me.engineers.filter(e => !e.loan);
  const offer = draft.offer;
  return (
    <details className="fold">
      <summary>🕶️ 裏工作 {outsiders.length > 0 && <span className="chip">外から来た社員 {outsiders.length}</span>}</summary>
      <div className="fold-body">
        <div className="group-h">外から来た社員のチェック</div>
        {outsiders.length === 0 && <div className="empty">レンタルや引き抜きで来た社員はいません</div>}
        {outsiders.map(e => (
          <div className="eng" key={e.id}>
            <Face name={e.name} />
            <div className="grow"><div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><span className="nm">{e.name}</span><EngBadges g={g} e={e} me={me} /></div>
              <div className="row" style={{ marginTop: 6 }}>
                <button className={`btn xs ${draft.investigate === e.id ? 'gold' : ''}`} disabled={locked} onClick={() => set(d => ({ ...d, investigate: d.investigate === e.id ? undefined : e.id }))}>🔍 身辺調査（{INVESTIGATE_COST}万）</button>
                <button className={`btn xs ${draft.accuse === e.id ? 'danger' : ''}`} style={draft.accuse === e.id ? { background: 'var(--down-bg)' } : {}} disabled={locked} onClick={() => set(d => ({ ...d, accuse: d.accuse === e.id ? undefined : e.id }))}>🚨 告発する</button>
              </div>
            </div>
          </div>
        ))}
        <div className="note" style={{ marginTop: 6 }}>告発してスパイなら没収・黒幕に罰。シロなら自社の評判−1。調査結果は自分にだけ見えます。</div>

        <div className="group-h">レンタル出品（次の入札で募集）</div>
        <div className="seg">
          <button className={!offer ? 'on' : 'off'} disabled={locked} onClick={() => set(d => ({ ...d, offer: undefined }))}>出品しない</button>
          {own.map(e => <button key={e.id} className={offer?.engineerId === e.id ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, offer: { engineerId: e.id, period: d.offer?.period || 2, share: d.offer?.share || 20, spy: d.offer?.spy || '' } }))}>{e.name.split(' ')[0]}</button>)}
        </div>
        {offer && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="note">期間</div>
            <div className="seg">{RENTAL.periods.map(x => <button key={x} className={offer.period === x ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, offer: { ...d.offer!, period: x } }))}>{x}期</button>)}</div>
            <div className="note" style={{ marginTop: 8 }}>取り分（借り手の案件報酬から）</div>
            <div className="seg">{RENTAL.shares.map(x => <button key={x} className={offer.share === x ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, offer: { ...d.offer!, share: x } }))}>{x}%</button>)}</div>
            <div className="note" style={{ marginTop: 8 }}>スパイ指令（残り{me.spyOrdersLeft}回・相手には見えません）</div>
            <div className="seg">
              <button className={!offer.spy ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, offer: { ...d.offer!, spy: '' } }))}>なし</button>
              {ORDERS.map(o => <button key={o} className={offer.spy === o ? 'on' : ''} disabled={locked || me.spyOrdersLeft <= 0} onClick={() => set(d => ({ ...d, offer: { ...d.offer!, spy: o } }))}>{SPY_ORDER_NAME[o]}</button>)}
            </div>
            {offer.spy && <div className="note" style={{ marginTop: 6 }}>{SPY_ORDER_DESC[offer.spy]}</div>}
          </div>
        )}

        <div className="group-h">潜伏スパイ（引き抜かれたらスパイになる社員）</div>
        <div className="seg">
          <button className={!draft.sleeper ? 'on' : 'off'} disabled={locked} onClick={() => set(d => ({ ...d, sleeper: '' }))}>指定しない</button>
          {own.map(e => <button key={e.id} className={draft.sleeper === e.id ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, sleeper: e.id }))}>{e.name.split(' ')[0]}</button>)}
        </div>
        {draft.sleeper && (
          <div className="seg" style={{ marginTop: 6 }}>
            {ORDERS.map(o => <button key={o} className={draft.sleeperOrder === o ? 'on' : ''} disabled={locked} onClick={() => set(d => ({ ...d, sleeperOrder: o }))}>{SPY_ORDER_NAME[o]}</button>)}
          </div>
        )}
      </div>
    </details>
  );
}

function AssignSheet({ g, me, target, assign, locked, onToggle, onClose }: {
  g: Game; me: Company; target: Target; assign: Record<string, string>; locked: boolean; onToggle: (eid: string, on: boolean) => void; onClose: () => void;
}) {
  const proj = target === 'svc' ? null : me.projects.find(p => p.id === target)!;
  const check = (a: Record<string, string>) => (proj ? projectCheck(g, me, proj, a) : null);
  const now = check(assign);
  const svcNeed = 3 + (me.service?.level || 0);
  const svcPower = servicePower(g, me, assign);
  const rows = me.engineers.filter(e => assign[e.id] !== 'fire').map(e => {
    const on = hasSlot(assign[e.id] ?? '', target);
    const cur = assign[e.id] ?? '';
    const next = toggleSlot(e, cur, target, true);
    let label: 'full' | 'part' | 'none' = 'none';
    let gain = 0;
    if (!on) {
      const a2 = { ...assign, [e.id]: next };
      if (proj) {
        const after = check(a2)!;
        gain = (now?.short || 0) - after.short;
        label = after.ok && !now?.ok ? 'full' : gain > 0 ? 'part' : 'none';
      } else {
        const p2 = servicePower(g, me, a2);
        gain = p2 - svcPower;
        label = svcPower < svcNeed && p2 >= svcNeed ? 'full' : gain > 0 ? 'part' : 'none';
      }
    }
    let warn = '';
    for (const t of slots(cur)) {
      if (on || t === 'svc' || hasSlot(next, t)) continue;
      const other = me.projects.find(p => p.id === t);
      if (other && projectCheck(g, me, other, assign).ok && !projectCheck(g, me, other, { ...assign, [e.id]: next }).ok) warn = `移すと「${other.name}」が進まなくなります`;
    }
    return { e, on, label, gain, warn, cur };
  });
  const order = { full: 0, part: 1, none: 2 };
  rows.sort((a, b) => (a.on === b.on ? order[a.label] - order[b.label] || b.gain - a.gain : a.on ? -1 : 1));
  const title = proj ? proj.name : '自社サービス';
  const sub = proj
    ? (now!.ok ? '✓ 必要スキルを満たしています' : `足りないスキル：${missingText(now!.missing)}`)
    : `Lvアップには担当スキル合計 ${svcNeed}（今 ${svcPower}）`;
  return (
    <Sheet onClose={onClose} title={title} sub={sub}>
      {proj && <Gauges reqs={proj.reqs} sums={now!.sums} />}
      {rows.map(({ e, on, label, gain, warn, cur }) => {
        const usable = working(g, e);
        return (
          <button key={e.id} className={`pick ${on ? 'on' : ''}`} disabled={locked || !usable} onClick={() => onToggle(e.id, !on)}>
            <Face name={e.name} />
            <div className="grow">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><b>{e.name}</b>
                {on ? <span className="lbl full">担当中</span> : label === 'full' ? <span className="lbl full">これで足りる！</span> : label === 'part' ? <span className="lbl part">不足を{gain}埋める</span> : <span className="lbl none">効果なし</span>}
              </div>
              <div style={{ marginTop: 4 }}><SkillChips skills={effSkills(g, me, e)} highlight={proj ? Object.fromEntries(SKILLS.filter(k => proj.reqs[k] && e.skills[k]).map(k => [k, 'ok'])) : undefined} /></div>
              <div className="note">{usable ? `いま：${placeName(me, cur)}` : '今期はお休み'}{e.trait === 'multi' && usable ? '（🔀掛け持ちで2つまで担当できます）' : ''}</div>
              {e.trait && <TraitLine e={e} />}
              {warn && <div className="note down">⚠ {warn}</div>}
            </div>
          </button>
        );
      })}
    </Sheet>
  );
}

export function devSummary(g: Game, me: Company, d: DevSubmit) {
  const a = d.assign as Record<string, string>;
  const drop = d.drop || [];
  const live = me.projects.filter(p => !drop.includes(p.id));
  const stuck = live.filter(p => !projectCheck(g, me, p, a).ok).length;
  const idle = me.engineers.filter(e => working(g, e) && !(a[e.id] ?? '')).length;
  const fired = Object.values(a).filter(x => x === 'fire').length;
  const trained = Object.values(a).filter(x => x === 'train').length;
  const parts: { t: string; w?: boolean }[] = [];
  if (stuck) parts.push({ t: `⚠ 進まない案件 ${stuck}件`, w: true });
  else if (live.length) parts.push({ t: `✓ 案件 ${live.length}件すべて進行` });
  if (drop.length) parts.push({ t: `放棄 ${drop.length}件`, w: true });
  if (idle) parts.push({ t: `待機 ${idle}人` });
  if (d.rush.length) parts.push({ t: `突貫 ${d.rush.length}件`, w: true });
  if (fired) parts.push({ t: `解雇 ${fired}人`, w: true });
  if (trained) parts.push({ t: `研修 ${trained}人` });
  const inv = Object.values(d.invest || {}).reduce((t, v) => t + v, 0);
  if (inv) parts.push({ t: `投資 ${inv.toLocaleString()}` });
  if (d.launch) parts.push({ t: 'サービス立ち上げ' });
  if (d.offer) parts.push({ t: 'レンタル出品' });
  if (d.accuse) parts.push({ t: '告発', w: true });
  if (!parts.length) parts.push({ t: '割り当てを確認して決定' });
  return parts;
}

