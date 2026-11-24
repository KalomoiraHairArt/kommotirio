import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase, eur, MONTHS, MONTHS_FULL } from './supabase';

type Month = { month: string; income_gross: number; z_count: number; invoice_count: number };
type Z = { file_date: string; net_total: number; vat_total: number; gross_total: number; card_total: number; cash_total: number };
type Inv = { supplier: string; supplier_activity: string | null; issue_date: string; net_total: number; vat_total: number; gross_total: number; sign: number };
type Period = 'year' | 'quarter' | 'month';

const n = (v: unknown) => Number(v ?? 0);
const pad = (x: number) => String(x).padStart(2, '0');

function range(year: number, period: Period, q: number, m: number) {
  if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31`, months: [...Array(12).keys()] };
  if (period === 'quarter') {
    const s = (q - 1) * 3;
    const last = new Date(year, s + 3, 0).getDate();
    return { from: `${year}-${pad(s + 1)}-01`, to: `${year}-${pad(s + 3)}-${last}`, months: [s, s + 1, s + 2] };
  }
  const last = new Date(year, m + 1, 0).getDate();
  return { from: `${year}-${pad(m + 1)}-01`, to: `${year}-${pad(m + 1)}-${last}`, months: [m] };
}

type Bucket = { key: string; label: string; z: number; incNet: number; incVat: number; incGross: number; cash: number; card: number; invCount: number; expNet: number; expVat: number; expGross: number };
const emptyBucket = (key: string, label: string): Bucket => ({ key, label, z: 0, incNet: 0, incVat: 0, incGross: 0, cash: 0, card: 0, invCount: 0, expNet: 0, expVat: 0, expGross: 0 });

export default function AccountingTab() {
  const now = new Date();
  const [summary, setSummary] = useState<Month[] | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState<Period>('year');
  const [q, setQ] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [m, setM] = useState(now.getMonth());
  const [zs, setZs] = useState<Z[] | null>(null);
  const [inv, setInv] = useState<Inv[] | null>(null);

  const r = range(year, period, q, m);
  const prev = range(year - 1, period, q, m);

  useEffect(() => {
    supabase.from('monthly_summary').select('month,income_gross,z_count,invoice_count').order('month').then(({ data }) => setSummary((data as Month[]) ?? []));
  }, []);

  useEffect(() => {
    setZs(null); setInv(null);
    supabase.from('z_reports').select('file_date,net_total,vat_total,gross_total,card_total,cash_total')
      .gte('file_date', r.from).lte('file_date', r.to).then(({ data }) => setZs((data as Z[]) ?? []));
    supabase.from('invoices_with_supplier').select('supplier,supplier_activity,issue_date,net_total,vat_total,gross_total,sign')
      .gte('issue_date', r.from).lte('issue_date', r.to).then(({ data }) => setInv((data as Inv[]) ?? []));
  }, [r.from, r.to]);

  const years = useMemo(() => [...new Set((summary ?? []).map((x) => Number(x.month.slice(0, 4))))].sort((a, b) => b - a), [summary]);

  // ομαδοποίηση: ανά μήνα (έτος/τρίμηνο) ή ανά ημέρα (μήνας)
  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    if (period === 'month') {
      const days = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= days; d++) map.set(pad(d), emptyBucket(pad(d), String(d)));
    } else {
      for (const i of r.months) map.set(pad(i + 1), emptyBucket(pad(i + 1), MONTHS[i]));
    }
    const keyOf = (date: string) => (period === 'month' ? date.slice(8, 10) : date.slice(5, 7));
    for (const z of zs ?? []) {
      const b = map.get(keyOf(z.file_date)); if (!b) continue;
      b.z++; b.incNet += n(z.net_total); b.incVat += n(z.vat_total); b.incGross += n(z.gross_total); b.cash += n(z.cash_total); b.card += n(z.card_total);
    }
    for (const i of inv ?? []) {
      const b = map.get(keyOf(i.issue_date)); if (!b) continue;
      if (i.sign) b.invCount++;
      b.expNet += n(i.net_total) * i.sign; b.expVat += n(i.vat_total) * i.sign; b.expGross += n(i.gross_total) * i.sign;
    }
    return [...map.values()];
  }, [zs, inv, period, year, m, r.months]);

  const tot = buckets.reduce((a, b) => ({
    z: a.z + b.z, incNet: a.incNet + b.incNet, incVat: a.incVat + b.incVat, incGross: a.incGross + b.incGross, cash: a.cash + b.cash, card: a.card + b.card,
    invCount: a.invCount + b.invCount, expNet: a.expNet + b.expNet, expVat: a.expVat + b.expVat, expGross: a.expGross + b.expGross,
  }), { z: 0, incNet: 0, incVat: 0, incGross: 0, cash: 0, card: 0, invCount: 0, expNet: 0, expVat: 0, expGross: 0 });
  const result = tot.incNet - tot.expNet;
  const vatBal = tot.incVat - tot.expVat;

  // σύγκριση με την ίδια περίοδο πέρυσι (για το τρέχον έτος, μέχρι τον τρέχοντα μήνα)
  const prevIncome = useMemo(() => {
    const isCurrentYear = year === now.getFullYear();
    return (summary ?? []).filter((x) => {
      const mm = Number(x.month.slice(5, 7)) - 1;
      return x.month.startsWith(String(year - 1)) && prev.months.includes(mm) && (!isCurrentYear || mm <= now.getMonth());
    }).reduce((s, x) => s + n(x.income_gross), 0);
  }, [summary, year, prev.months]); // eslint-disable-line
  const yoy = prevIncome > 0 && tot.incGross > 0 ? (tot.incGross / prevIncome - 1) * 100 : null;

  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; act: string | null; count: number; gross: number }>();
    for (const i of inv ?? []) {
      if (!i.sign) continue;
      const e = map.get(i.supplier) ?? { name: i.supplier, act: i.supplier_activity, count: 0, gross: 0 };
      e.count++; e.gross += n(i.gross_total) * i.sign; map.set(i.supplier, e);
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }, [inv]);

  const title = period === 'year' ? `${year}` : period === 'quarter' ? `${q}ο τρίμηνο ${year}` : `${MONTHS_FULL[m]} ${year}`;
  const loading = !zs || !inv;
  const chart = buckets.map((b) => ({ name: b.label, Έσοδα: Math.round(b.incNet), Έξοδα: Math.round(b.expNet) }));
  const rows = period === 'month' ? buckets.filter((b) => b.z || b.invCount) : buckets;

  return (
    <>
      <div className="head">
        <div>
          <h2>Λογιστήριο · {title}</h2>
          <p>Έσοδα από τα Ζ της ταμειακής · Έξοδα από τα τιμολόγια του myDATA</p>
        </div>
        <div className="filters">
          <div className="seg">
            <button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>Έτος</button>
            <button className={period === 'quarter' ? 'on' : ''} onClick={() => setPeriod('quarter')}>Τρίμηνο</button>
            <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Μήνας</button>
          </div>
          {period === 'quarter' && (
            <select value={q} onChange={(e) => setQ(Number(e.target.value))}>
              {[1, 2, 3, 4].map((x) => <option key={x} value={x}>{x}ο τρίμηνο</option>)}
            </select>
          )}
          {period === 'month' && (
            <select value={m} onChange={(e) => setM(Number(e.target.value))}>
              {MONTHS_FULL.map((x, i) => <option key={i} value={i}>{x}</option>)}
            </select>
          )}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="loading">Φόρτωση…</div> : (
        <>
          <div className="kpis">
            <div className="kpi income">
              <div className="label">Έσοδα (με ΦΠΑ)</div>
              <div className="value">{eur(tot.incGross)}</div>
              <div className="sub">
                {yoy !== null ? <><span className={yoy >= 0 ? 'pos' : 'neg'}>{yoy >= 0 ? '▲' : '▼'} {Math.abs(yoy).toFixed(1)}%</span> σε σχέση με πέρυσι</> : `${tot.z} Ζ`}
              </div>
            </div>
            <div className="kpi expense">
              <div className="label">Έξοδα (με ΦΠΑ)</div>
              <div className="value">{eur(tot.expGross)}</div>
              <div className="sub">{tot.invCount} παραστατικά</div>
            </div>
            <div className="kpi">
              <div className="label">Αποτέλεσμα (καθαρά)</div>
              <div className={'value ' + (result >= 0 ? 'pos' : 'neg')}>{eur(result)}</div>
              <div className="sub">καθαρά έσοδα {eur(tot.incNet)} − έξοδα {eur(tot.expNet)}</div>
            </div>
            <div className="kpi">
              <div className="label">ΦΠΑ για απόδοση</div>
              <div className={'value ' + (vatBal >= 0 ? 'neg' : 'pos')}>{eur(vatBal)}</div>
              <div className="sub">ΦΠΑ πωλήσεων {eur(tot.incVat)} − αγορών {eur(tot.expVat)}</div>
            </div>
          </div>

          <div className="card">
            <h3>Έσοδα και έξοδα ανά {period === 'month' ? 'ημέρα' : 'μήνα'} (καθαρά, χωρίς ΦΠΑ)</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee6dc" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
                  <Tooltip formatter={(v) => eur(Number(v))} />
                  <Legend />
                  <Bar dataKey="Έσοδα" fill="#2f7d5b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Έξοδα" fill="#b2464f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3>Ανάλυση ανά {period === 'month' ? 'ημέρα' : 'μήνα'}</h3>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{period === 'month' ? 'Ημέρα' : 'Μήνας'}</th><th className="num">Ζ</th><th className="num">Έσοδα</th><th className="num">Μετρητά</th><th className="num">Κάρτα</th>
                    <th className="num">Έξοδα</th><th className="num">Καθαρό αποτέλεσμα</th><th className="num">ΦΠΑ πωλ.</th><th className="num">ΦΠΑ αγορ.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.key}>
                      <td>{period === 'month' ? `${b.label}/${m + 1}` : MONTHS_FULL[Number(b.key) - 1]}</td>
                      <td className="num">{b.z}</td>
                      <td className="num">{eur(b.incGross)}</td>
                      <td className="num">{eur(b.cash)}</td>
                      <td className="num">{eur(b.card)}</td>
                      <td className="num">{eur(b.expGross)}</td>
                      <td className={'num ' + (b.incNet - b.expNet >= 0 ? 'pos' : 'neg')}>{eur(b.incNet - b.expNet)}</td>
                      <td className="num">{eur(b.incVat)}</td>
                      <td className="num">{eur(b.expVat)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={9} className="empty">Καμία κίνηση στην περίοδο.</td></tr>}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Σύνολο</td><td className="num">{tot.z}</td><td className="num">{eur(tot.incGross)}</td>
                    <td className="num">{eur(tot.cash)}</td><td className="num">{eur(tot.card)}</td>
                    <td className="num">{eur(tot.expGross)}</td><td className={'num ' + (result >= 0 ? 'pos' : 'neg')}>{eur(result)}</td>
                    <td className="num">{eur(tot.incVat)}</td><td className="num">{eur(tot.expVat)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid2">
            {period === 'year' ? (
              <div className="card">
                <h3>ΦΠΑ ανά τρίμηνο</h3>
                <table>
                  <thead><tr><th>Τρίμηνο</th><th className="num">ΦΠΑ πωλήσεων</th><th className="num">ΦΠΑ αγορών</th><th className="num">Διαφορά</th></tr></thead>
                  <tbody>
                    {[0, 1, 2, 3].map((qi) => {
                      const bs = buckets.filter((b) => Math.floor((Number(b.key) - 1) / 3) === qi);
                      const out = bs.reduce((s, b) => s + b.incVat, 0); const inn = bs.reduce((s, b) => s + b.expVat, 0);
                      return (
                        <tr key={qi}>
                          <td>{qi + 1}ο</td><td className="num">{eur(out)}</td><td className="num">{eur(inn)}</td>
                          <td className={'num ' + (out - inn >= 0 ? 'neg' : 'pos')}>{eur(out - inn)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="small muted" style={{ marginTop: 10 }}>Θετική διαφορά = ΦΠΑ για πληρωμή, αρνητική = πιστωτικό υπόλοιπο. Ενδεικτικό.</p>
              </div>
            ) : (
              <div className="card">
                <h3>Μετρητά και κάρτα</h3>
                <table>
                  <tbody>
                    <tr><td>Μετρητά</td><td className="num">{eur(tot.cash)}</td><td className="num muted">{tot.incGross ? Math.round((tot.cash / tot.incGross) * 100) : 0}%</td></tr>
                    <tr><td>Κάρτα</td><td className="num">{eur(tot.card)}</td><td className="num muted">{tot.incGross ? Math.round((tot.card / tot.incGross) * 100) : 0}%</td></tr>
                    <tr><td>Μέσος όρος ανά Ζ</td><td className="num">{eur(tot.z ? tot.incGross / tot.z : 0)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
            )}
            <div className="card">
              <h3>Έξοδα ανά προμηθευτή</h3>
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
        </>
      )}

      <div className="note">
        Οι αριθμοί είναι ενδεικτικοί και βγαίνουν μόνο από τα Ζ και τα τιμολόγια του myDATA. Δεν περιλαμβάνουν μισθοδοσία, ενοίκιο χωρίς τιμολόγιο, εισφορές κ.λπ. Για τις επίσημες δηλώσεις ισχύουν όσα βγάζει το λογιστήριο.
      </div>
    </>
  );
}
