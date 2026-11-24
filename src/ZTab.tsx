import { useEffect, useMemo, useState } from 'react';
import { supabase, eur, dmy, MONTHS_FULL } from './supabase';

type Z = {
  fhm: string; znr: number; file_date: string; transmitted_at: string | null; gross_total: number; vat_total: number; net_total: number;
  card_total: number; cash_total: number; receipts_count: number; returns_count: number; returns_amount: number;
};
type Receipt = { line_no: number; aa: number; issued_at: string | null; doc_type: string; total: number; card_amount: number };

const daysLate = (z: Z) => z.transmitted_at ? Math.round((Date.parse(z.transmitted_at.slice(0, 10)) - Date.parse(z.file_date)) / 86400000) : null;

export default function ZTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | ''>('');
  const [years, setYears] = useState<number[]>([]);
  const [rows, setRows] = useState<Z[] | null>(null);
  const [open, setOpen] = useState<Z | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);

  useEffect(() => {
    supabase.from('monthly_summary').select('month').gt('z_count', 0).then(({ data }) =>
      setYears([...new Set((data ?? []).map((r: { month: string }) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a)));
  }, []);

  useEffect(() => {
    setRows(null);
    let q = supabase.from('z_reports').select('*').order('znr', { ascending: false });
    if (month === '') q = q.gte('file_date', `${year}-01-01`).lte('file_date', `${year}-12-31`);
    else {
      const m = String(month + 1).padStart(2, '0');
      const last = new Date(year, month + 1, 0).getDate();
      q = q.gte('file_date', `${year}-${m}-01`).lte('file_date', `${year}-${m}-${last}`);
    }
    q.then(({ data }) => setRows((data as Z[]) ?? []));
  }, [year, month]);

  useEffect(() => {
    if (!open) return;
    setReceipts(null);
    supabase.from('z_receipts').select('line_no,aa,issued_at,doc_type,total,card_amount').eq('fhm', open.fhm).eq('znr', open.znr).order('line_no')
      .then(({ data }) => setReceipts((data as Receipt[]) ?? []));
  }, [open]);

  const t = useMemo(() => {
    const r = rows ?? [];
    const s = (k: keyof Z) => r.reduce((a, z) => a + Number(z[k] ?? 0), 0);
    return { gross: s('gross_total'), card: s('card_total'), cash: s('cash_total'), vat: s('vat_total'), receipts: s('receipts_count'), count: r.length, late: r.filter((z) => (daysLate(z) ?? 0) > 2).length };
  }, [rows]);

  return (
    <>
      <div className="head">
        <div>
          <h2>Ζ ταμειακής</h2>
          <p>Ό,τι έχει διαβιβαστεί στο e-send. Πάτα μια γραμμή για να δεις τις αποδείξεις.</p>
        </div>
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Όλο το έτος</option>
            {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi income"><div className="label">Τζίρος</div><div className="value">{eur(t.gross)}</div><div className="sub">{t.count} Ζ · {t.receipts} αποδείξεις</div></div>
        <div className="kpi"><div className="label">Μετρητά</div><div className="value">{eur(t.cash)}</div><div className="sub">{t.gross ? Math.round((t.cash / t.gross) * 100) : 0}% του τζίρου</div></div>
        <div className="kpi"><div className="label">Κάρτα</div><div className="value">{eur(t.card)}</div><div className="sub">{t.gross ? Math.round((t.card / t.gross) * 100) : 0}% του τζίρου</div></div>
        <div className="kpi"><div className="label">Μέσος όρος / Ζ</div><div className="value">{eur(t.count ? t.gross / t.count : 0)}</div><div className="sub">ΦΠΑ {eur(t.vat)}</div></div>
      </div>

      {t.late > 0 && <div className="note">⚠️ {t.late} Ζ σε αυτή την περίοδο διαβιβάστηκαν στο e-send με καθυστέρηση πάνω από 2 ημέρες.</div>}

      <div className="card">
        {!rows ? <div className="loading">Φόρτωση…</div> : !rows.length ? <div className="empty">Κανένα Ζ για την περίοδο.</div> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Ζ</th><th>Ημερομηνία</th><th className="num">Αποδ.</th><th className="num">Μετρητά</th><th className="num">Κάρτα</th><th className="num">ΦΠΑ</th><th className="num">Σύνολο</th><th>Διαβίβαση</th></tr></thead>
              <tbody>
                {rows.map((z) => {
                  const late = daysLate(z);
                  return (
                    <tr key={z.znr} className="click" onClick={() => setOpen(z)}>
                      <td><b>#{z.znr}</b></td>
                      <td>{dmy(z.file_date)}</td>
                      <td className="num">{z.receipts_count}</td>
                      <td className="num">{eur(z.cash_total)}</td>
                      <td className="num">{eur(z.card_total)}</td>
                      <td className="num">{eur(z.vat_total)}</td>
                      <td className="num"><b>{eur(z.gross_total)}</b></td>
                      <td>{late === null ? '–' : late > 2 ? <span className="pill warn">+{late} ημέρες</span> : <span className="muted small">{dmy(z.transmitted_at)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Ζ #{open.znr} · {dmy(open.file_date)}</h3>
              <button className="x" onClick={() => setOpen(null)}>×</button>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="label">Σύνολο</div><div className="value">{eur(open.gross_total)}</div></div>
              <div className="kpi"><div className="label">Καθαρά / ΦΠΑ</div><div className="value" style={{ fontSize: 18 }}>{eur(open.net_total)} / {eur(open.vat_total)}</div></div>
            </div>
            {!receipts ? <div className="loading">Φόρτωση…</div> : (
              <table>
                <thead><tr><th>Ώρα</th><th>Παραστατικό</th><th className="num">Α/Α</th><th className="num">Κάρτα</th><th className="num">Ποσό</th></tr></thead>
                <tbody>
                  {receipts.filter((r) => r.aa > 0).map((r) => (
                    <tr key={r.line_no}>
                      <td>{r.issued_at ? r.issued_at.slice(11, 16) : '–'}</td>
                      <td>{(r.doc_type ?? '').replace(/^-?\d+#\s*/, '')}</td>
                      <td className="num">{r.aa}</td>
                      <td className="num">{Number(r.card_amount) > 0 ? eur(r.card_amount) : '–'}</td>
                      <td className="num"><b>{eur(r.total)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
