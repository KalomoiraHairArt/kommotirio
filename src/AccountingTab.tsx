import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase, eur, MONTHS, MONTHS_FULL } from './supabase';

type Month = {
  month: string; income_net: number; income_vat: number; income_gross: number; income_card: number; income_cash: number; z_count: number;
  expense_net: number; expense_vat: number; expense_gross: number; invoice_count: number; result_net: number; vat_balance: number;
};
type Inv = { supplier: string; supplier_activity: string | null; issue_date: string; net_total: number; vat_total: number; gross_total: number; sign: number };

const n = (v: unknown) => Number(v ?? 0);

export default function AccountingTab() {
  const [rows, setRows] = useState<Month[] | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [inv, setInv] = useState<Inv[]>([]);

  useEffect(() => {
    supabase.from('monthly_summary').select('*').order('month').then(({ data }) => setRows((data as Month[]) ?? []));
  }, []);
  useEffect(() => {
    supabase.from('invoices_with_supplier').select('supplier,supplier_activity,issue_date,net_total,vat_total,gross_total,sign')
      .gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`)
      .then(({ data }) => setInv((data as Inv[]) ?? []));
  }, [year]);

  const years = useMemo(() => [...new Set((rows ?? []).map((r) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a), [rows]);
  const months = useMemo(() => {
    const m = new Map((rows ?? []).filter((r) => r.month.startsWith(String(year))).map((r) => [Number(r.month.slice(5, 7)) - 1, r]));
    return MONTHS.map((label, i) => ({ i, label, r: m.get(i) }));
  }, [rows, year]);
  const sum = (k: keyof Month, y = year) => (rows ?? []).filter((r) => r.month.startsWith(String(y))).reduce((s, r) => s + n(r[k]), 0);

  // σύγκριση με το ίδιο διάστημα πέρυσι (μέχρι τον τελευταίο μήνα με κίνηση)
  const lastMonth = Math.max(-1, ...months.filter((m) => m.r && n(m.r.income_gross) > 0).map((m) => m.i));
  const prevSameRange = (rows ?? []).filter((r) => r.month.startsWith(String(year - 1)) && Number(r.month.slice(5, 7)) - 1 <= lastMonth)
    .reduce((s, r) => s + n(r.income_gross), 0);
  const incomeGross = sum('income_gross');
  const yoy = prevSameRange > 0 ? (incomeGross / prevSameRange - 1) * 100 : null;

  const quarters = [0, 1, 2, 3].map((q) => {
    const ms = months.filter((m) => Math.floor(m.i / 3) === q && m.r);
    return {
      q: q + 1,
      out: ms.reduce((s, m) => s + n(m.r!.income_vat), 0),
      in: ms.reduce((s, m) => s + n(m.r!.expense_vat), 0),
    };
  });

  const bySupplier = useMemo(() => {
    const m = new Map<string, { name: string; act: string | null; count: number; net: number; gross: number }>();
    for (const i of inv) {
      if (!i.sign) continue;
      const e = m.get(i.supplier) ?? { name: i.supplier, act: i.supplier_activity, count: 0, net: 0, gross: 0 };
      e.count++; e.net += n(i.net_total) * i.sign; e.gross += n(i.gross_total) * i.sign;
      m.set(i.supplier, e);
    }
    return [...m.values()].sort((a, b) => b.gross - a.gross);
  }, [inv]);

  if (!rows) return <div className="loading">Φόρτωση…</div>;

  const chart = months.map((m) => ({ name: m.label, Έσοδα: Math.round(n(m.r?.income_net)), Έξοδα: Math.round(n(m.r?.expense_net)) }));
  const result = sum('income_net') - sum('expense_net');
  const vatBal = sum('income_vat') - sum('expense_vat');

  return (
    <>
      <div className="head">
        <div>
          <h2>Λογιστήριο {year}</h2>
          <p>Έσοδα από τα Ζ της ταμειακής · Έξοδα από τα τιμολόγια του myDATA</p>
        </div>
        <div className="filters">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi income">
          <div className="label">Έσοδα (με ΦΠΑ)</div>
          <div className="value">{eur(incomeGross)}</div>
          <div className="sub">
            {yoy !== null ? <><span className={yoy >= 0 ? 'pos' : 'neg'}>{yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy).toFixed(1)}%</span> σε σχέση με πέρυσι, ίδιο διάστημα</> : `${sum('z_count')} Ζ`}
          </div>
        </div>
        <div className="kpi expense">
          <div className="label">Έξοδα (με ΦΠΑ)</div>
          <div className="value">{eur(sum('expense_gross'))}</div>
          <div className="sub">{sum('invoice_count')} παραστατικά</div>
        </div>
        <div className="kpi">
          <div className="label">Αποτέλεσμα (καθαρά)</div>
          <div className={'value ' + (result >= 0 ? 'pos' : 'neg')}>{eur(result)}</div>
          <div className="sub">καθαρά έσοδα − καθαρά έξοδα</div>
        </div>
        <div className="kpi">
          <div className="label">ΦΠΑ για απόδοση</div>
          <div className={'value ' + (vatBal >= 0 ? 'neg' : 'pos')}>{eur(vatBal)}</div>
          <div className="sub">ΦΠΑ πωλήσεων {eur(sum('income_vat'))} − ΦΠΑ αγορών {eur(sum('expense_vat'))}</div>
        </div>
      </div>

      <div className="card">
        <h3>Έσοδα και έξοδα ανά μήνα (καθαρά, χωρίς ΦΠΑ)</h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee6dc" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${Math.round(v / 100) / 10}k`} width={40} />
              <Tooltip formatter={(v) => eur(Number(v))} />
              <Legend />
              <Bar dataKey="Έσοδα" fill="#2f7d5b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Έξοδα" fill="#b2464f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Ανάλυση ανά μήνα</h3>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Μήνας</th><th className="num">Ζ</th><th className="num">Έσοδα</th><th className="num">Μετρητά</th><th className="num">Κάρτα</th>
                <th className="num">Έξοδα</th><th className="num">Καθαρό αποτέλεσμα</th><th className="num">ΦΠΑ πωλ.</th><th className="num">ΦΠΑ αγορ.</th>
              </tr>
            </thead>
            <tbody>
              {months.filter((m) => m.r).map(({ i, r }) => (
                <tr key={i}>
                  <td>{MONTHS_FULL[i]}</td>
                  <td className="num">{r!.z_count}</td>
                  <td className="num">{eur(r!.income_gross)}</td>
                  <td className="num">{eur(r!.income_cash)}</td>
                  <td className="num">{eur(r!.income_card)}</td>
                  <td className="num">{eur(r!.expense_gross)}</td>
                  <td className={'num ' + (n(r!.result_net) >= 0 ? 'pos' : 'neg')}>{eur(r!.result_net)}</td>
                  <td className="num">{eur(r!.income_vat)}</td>
                  <td className="num">{eur(r!.expense_vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Σύνολο</td><td className="num">{sum('z_count')}</td><td className="num">{eur(incomeGross)}</td>
                <td className="num">{eur(sum('income_cash'))}</td><td className="num">{eur(sum('income_card'))}</td>
                <td className="num">{eur(sum('expense_gross'))}</td><td className={'num ' + (result >= 0 ? 'pos' : 'neg')}>{eur(result)}</td>
                <td className="num">{eur(sum('income_vat'))}</td><td className="num">{eur(sum('expense_vat'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>ΦΠΑ ανά τρίμηνο</h3>
          <table>
            <thead><tr><th>Τρίμηνο</th><th className="num">ΦΠΑ πωλήσεων</th><th className="num">ΦΠΑ αγορών</th><th className="num">Διαφορά</th></tr></thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.q}>
                  <td>{q.q}ο</td><td className="num">{eur(q.out)}</td><td className="num">{eur(q.in)}</td>
                  <td className={'num ' + (q.out - q.in >= 0 ? 'neg' : 'pos')}>{eur(q.out - q.in)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>Θετική διαφορά = ΦΠΑ για πληρωμή, αρνητική = πιστωτικό υπόλοιπο. Ενδεικτικό.</p>
        </div>
        <div className="card">
          <h3>Έξοδα ανά προμηθευτή ({year})</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Προμηθευτής</th><th className="num">Παρ.</th><th className="num">Σύνολο</th></tr></thead>
              <tbody>
                {bySupplier.slice(0, 12).map((s) => (
                  <tr key={s.name}>
                    <td className="wrap">{s.name}{s.act && <div className="small muted">{s.act.toLowerCase()}</div>}</td>
                    <td className="num">{s.count}</td><td className="num">{eur(s.gross)}</td>
                  </tr>
                ))}
                {!bySupplier.length && <tr><td colSpan={3} className="empty">Κανένα τιμολόγιο</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="note">
        Οι αριθμοί είναι ενδεικτικοί και βγαίνουν μόνο από τα Ζ και τα τιμολόγια του myDATA. Δεν περιλαμβάνουν μισθοδοσία, ενοίκιο χωρίς τιμολόγιο, εισφορές κ.λπ. Για τις επίσημες δηλώσεις ισχύουν όσα βγάζει το λογιστήριο.
      </div>
    </>
  );
}
