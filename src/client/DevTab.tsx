// ===== 開発タブ =====
import { useState } from 'react';
import { ABANDON, GROWTH, INVESTIGATE_COST, PROJECT_TYPES, RENTAL, SERVICE, SKILLS, SKILL_ICON, SKILL_NAME, SPY_ORDER_DESC, SPY_ORDER_NAME, TAGS, xpNeed } from '../logic/config';
import { assignees, effSkills, launchCost, projectCheck, quarterLabel, rushDebt, serviceIncome, servicePower, skillSum, sumSkills, working } from '../logic/calc';
import { abandonFee, pendingSpies } from '../logic/game';
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
        onToggle={(eid, on) => { sfx.tap(); setAssign(eid, on ? sheet : ''); }} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function placeName(me: Company, a: string) {
  if (a === 'fire') return '解雇予定';
  if (a === 'svc') return 'サービス担当';
  if (!a) return '待機';
  return `「${me.projects.find(p => p.id === a)?.name || '案件'}」担当`;
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
  const free = me.engineers.filter(e => !e.assign && working(g, e));
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
  const place = (e: Engineer) => (e.assign === 'svc' ? 'サービス' : e.assign ? me.projects.find(x => x.id === e.assign)?.name || '案件' : '空き');
  const holders = (k: Skill) => me.engineers.filter(e => (e.skills[k] || 0) > 0 && e.assign !== p.id);
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
    const on = (assign[e.id] ?? '') === target;
    const cur = assign[e.id] ?? '';
    let label: 'full' | 'part' | 'none' = 'none';
    let gain = 0;
    if (!on) {
      const a2 = { ...assign, [e.id]: target };
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
    if (!on && cur && cur !== 'svc' && cur !== target) {
      const other = me.projects.find(p => p.id === cur);
      if (other && projectCheck(g, me, other, assign).ok && !projectCheck(g, me, other, { ...assign, [e.id]: target }).ok) warn = `移すと「${other.name}」が進まなくなります`;
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
              <div className="note">{usable ? `いま：${placeName(me, cur)}` : '今期はお休み'}</div>
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
  const parts: { t: string; w?: boolean }[] = [];
  if (stuck) parts.push({ t: `⚠ 進まない案件 ${stuck}件`, w: true });
  else if (live.length) parts.push({ t: `✓ 案件 ${live.length}件すべて進行` });
  if (drop.length) parts.push({ t: `放棄 ${drop.length}件`, w: true });
  if (idle) parts.push({ t: `待機 ${idle}人` });
  if (d.rush.length) parts.push({ t: `突貫 ${d.rush.length}件`, w: true });
  if (fired) parts.push({ t: `解雇 ${fired}人`, w: true });
  if (d.launch) parts.push({ t: 'サービス立ち上げ' });
  if (d.offer) parts.push({ t: 'レンタル出品' });
  if (d.accuse) parts.push({ t: '告発', w: true });
  if (!parts.length) parts.push({ t: '割り当てを確認して決定' });
  return parts;
}

