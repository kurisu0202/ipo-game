// ===== 決算書：期ごとの PL（損益計算書）と BS（貸借対照表） =====
import { useState } from 'react';
import { GAME } from '../logic/config';
import { quarterLabel } from '../logic/calc';
import { currentBS } from '../logic/game';
import type { Acct, BS, Books, Company, Game } from '../logic/types';

const n = (b: Books, k: Acct) => b[k] || 0;
const fmt = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`;

/** 帳簿から PL を組み立てる（費用はマイナスで記録されているので、表示では符号を反転） */
function pl(b: Books) {
  const sales = n(b, 'project') + n(b, 'service');
  const sga: [string, number][] = ([
    ['給料', -n(b, 'salary')], ['採用費（契約金）', -n(b, 'hire')], ['広告宣伝費', -n(b, 'ad')], ['研修費', -n(b, 'training')],
    ['サービス立ち上げ費', -n(b, 'launch')], ['オフィス改装費', -n(b, 'remodel')], ['賃料', -n(b, 'rent')], ['退職金', -n(b, 'severance')], ['調査費', -n(b, 'research')],
  ] as [string, number][]).filter(([, v]) => v);
  const sgaTotal = sga.reduce((t, [, v]) => t + v, 0);
  const op = sales - sgaTotal;
  const nonIn = n(b, 'nonopIn'), nonOut = -(n(b, 'nonopOut') + n(b, 'interest'));
  const inv = n(b, 'invgain'), loss = -n(b, 'loss');
  const net = op + nonIn - nonOut + inv - loss;
  return { sales, sga, sgaTotal, op, nonIn, nonOut, inv, loss, net, capex: -n(b, 'capex'), invest: -n(b, 'invest'), interest: -n(b, 'interest') };
}

function Row({ label, v, cls = '', bold, indent }: { label: string; v: number; cls?: string; bold?: boolean; indent?: boolean }) {
  return <tr className={`${bold ? 'b' : ''} ${cls}`}><td style={indent ? { paddingLeft: 14 } : undefined}>{label}</td><td className={v < 0 ? 'down' : ''}>{fmt(v)}</td></tr>;
}

export function FinanceCard({ g, me }: { g: Game; me: Company }) {
  const qs = Array.from({ length: Math.max(0, g.q) + 1 }, (_, i) => i);
  const [sel, setSel] = useState<number | 'all'>(g.q);
  const [tab, setTab] = useState<'pl' | 'bs'>('pl');
  const books = me.books || {};
  const cur = sel === 'all' ? null : sel;
  const b: Books = cur === null
    ? Object.values(books).reduce<Books>((acc, x) => { for (const [k, v] of Object.entries(x)) acc[k as Acct] = (acc[k as Acct] || 0) + (v || 0); return acc; }, {})
    : books[String(cur)] || {};
  const p = pl(b);
  const live = cur === g.q && g.phase !== 'end';   // 今期はまだ途中
  const bs: BS | undefined = cur === null || live ? currentBS(me) : me.bsHist?.[String(cur)];
  const prevBS: BS | undefined = cur === null ? undefined : cur === 0 ? { cash: GAME.startCash, invest: 0, office: 0, service: 0, stocks: 0 } : me.bsHist?.[String(cur - 1)];
  const assets = bs ? Math.max(0, bs.cash) + bs.invest + bs.office + bs.service : 0;
  const debt = bs ? Math.max(0, -bs.cash) : 0;
  const equity = assets - debt;
  const startCash = cur === null ? GAME.startCash : prevBS?.cash ?? GAME.startCash;
  const endCash = startCash + p.net - p.capex - p.invest;

  return (
    <div className="card fin">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <div className="seg grow" style={{ minWidth: 0 }}>
          <button className={tab === 'pl' ? 'on' : ''} onClick={() => setTab('pl')}>📈 PL（損益）</button>
          <button className={tab === 'bs' ? 'on' : ''} onClick={() => setTab('bs')}>🏦 BS（資産）</button>
        </div>
      </div>
      <div className="fin-q">
        <button className="btn xs" disabled={cur === null || cur <= 0} onClick={() => setSel(cur === null ? g.q : cur - 1)}>◀</button>
        <select value={String(sel)} onChange={e => setSel(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          {qs.map(q => <option key={q} value={q}>{quarterLabel(q)}{q === g.q && g.phase !== 'end' ? '（今期・途中）' : ''}</option>)}
          <option value="all">ここまでの累計</option>
        </select>
        <button className="btn xs" disabled={cur === null || cur >= g.q} onClick={() => setSel(cur === null ? g.q : cur + 1)}>▶</button>
      </div>
      {live && <div className="note" style={{ marginBottom: 6 }}>今期はまだ途中です（開発フェーズの決算で給料や案件の入金が加わります）</div>}

      {tab === 'pl' ? (
        <>
          <table className="fin-table">
            <tbody>
              <Row label="売上高" v={p.sales} bold />
              <Row label="案件収入" v={n(b, 'project')} indent />
              <Row label="サービス収入" v={n(b, 'service')} indent />
              <Row label="販管費" v={-p.sgaTotal} bold />
              {p.sga.map(([l, v]) => <Row key={l} label={l} v={-v} indent />)}
              <Row label="営業利益" v={p.op} bold cls="sub" />
              {p.nonIn ? <Row label="営業外収益（補助金・賞金・取り分など）" v={p.nonIn} indent /> : null}
              {p.nonOut ? <Row label="営業外費用（利息・特許使用料）" v={-p.nonOut} indent /> : null}
              {p.inv ? <Row label="投資損益" v={p.inv} indent /> : null}
              {p.loss ? <Row label="特別損失（違約金・障害・罰金・監査など）" v={-p.loss} indent /> : null}
              <Row label="当期純利益" v={p.net} bold cls="total" />
            </tbody>
          </table>
          <div className="sec-title" style={{ marginTop: 12 }}>💴 現金の動き</div>
          <table className="fin-table">
            <tbody>
              <Row label={cur === null ? '開始時の現金' : '期首の現金'} v={startCash} />
              <Row label="＋ 当期純利益" v={p.net} indent />
              {p.capex ? <Row label="− オフィスへの設備投資" v={-p.capex} indent /> : null}
              {p.invest ? <Row label={p.invest > 0 ? '− 投資（出資）' : '＋ 投資の元本の回収'} v={-p.invest} indent /> : null}
              <Row label={live ? '今の現金' : '期末の現金'} v={endCash} bold cls="total" />
            </tbody>
          </table>
        </>
      ) : bs ? (
        <>
          <table className="fin-table">
            <tbody>
              <tr className="b"><td>資産</td><td>{fmt(assets)}</td></tr>
              <Row label="現金" v={Math.max(0, bs.cash)} indent />
              <Row label="投資（今年の出資額）" v={bs.invest} indent />
              <Row label="オフィス（最終決算での価値）" v={bs.office} indent />
              <Row label="自社サービス（最終決算での価値）" v={bs.service} indent />
              <tr className="b"><td>負債</td><td className={debt ? 'down' : ''}>{fmt(debt)}</td></tr>
              <Row label="借入金（現金のマイナス分・利息あり）" v={debt} indent />
              <Row label="純資産" v={equity} bold cls="total" />
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 6 }}>
            ほかに株を{bs.stocks}株（価値は最終決算で決まる）。最終決算の利益 ＝ 純資産 ＋ 株の価値 ＋ 冬の投資の結果 − 開始資金{GAME.startCash.toLocaleString()}。
            {prevBS && cur !== null && <> 前の期からの純資産の増減：<b className={equity - (Math.max(0, prevBS.cash) + prevBS.invest + prevBS.office + prevBS.service - Math.max(0, -prevBS.cash)) >= 0 ? 'up' : 'down'}>{fmt(equity - (Math.max(0, prevBS.cash) + prevBS.invest + prevBS.office + prevBS.service - Math.max(0, -prevBS.cash)))}</b></>}
          </div>
        </>
      ) : <div className="note">この期の記録がありません</div>}
      {me.debt > 0 && <div className="note" style={{ marginTop: 6 }}>※「技術的負債」（{me.debt}）はお金の負債ではないので、BSには入りません</div>}
    </div>
  );
}
