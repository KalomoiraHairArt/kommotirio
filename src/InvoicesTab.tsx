import { useEffect, useMemo, useState } from 'react';
import { supabase, eur, dmy, INVOICE_TYPES } from './supabase';
import { AttachmentsModal, ClipButton, useFileCounts } from './Attachments';

type Inv = {
  id: number; mark: number; issuer_vat: string; series: string | null; aa: string | null; issue_date: string; invoice_type: string;
  net_total: number; vat_total: number; gross_total: number; sign: number; is_new: boolean; supplier: string; supplier_activity: string | null;
};

export default function InvoicesTab({ onSeen }: { onSeen: () => void }) {
  const [year, setYear] = useState<number | ''>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Inv[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const { counts, refresh: refreshFiles } = useFileCounts();
  const [attach, setAttach] = useState<Inv | null>(null);

  const load = () => {
    let query = supabase.from('invoices_with_supplier').select('*').order('issue_date', { ascending: false }).order('mark', { ascending: false });
    if (year !== '') query = query.gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`);
    query.then(({ data }) => setRows((data as Inv[]) ?? []));
  };

  useEffect(() => {
    supabase.from('monthly_summary').select('month').gt('invoice_count', 0).then(({ data }) =>
      setYears([...new Set((data ?? []).map((r: { month: string }) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a)));
  }, []);
  useEffect(() => { setRows(null); load(); }, [year]); // eslint-disable-line

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || r.supplier?.toLowerCase().includes(s) || r.issuer_vat?.includes(s) || `${r.series ?? ''} ${r.aa ?? ''}`.toLowerCase().includes(s));
  }, [rows, q]);
  const newOnes = (rows ?? []).filter((r) => r.is_new).length;
  const total = filtered.reduce((s, r) => s + Number(r.gross_total ?? 0) * r.sign, 0);
  const vat = filtered.reduce((s, r) => s + Number(r.vat_total ?? 0) * r.sign, 0);

  const markSeen = async () => {
    setBusy(true);
    await supabase.rpc('mark_invoices_seen');
    setBusy(false); load(); onSeen();
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Τιμολόγια προμηθευτών</h2>
          <p>Ό,τι έχει εκδοθεί στον ΑΦΜ του κομμωτηρίου στο myDATA. Ελέγχεται αυτόματα κάθε 15 λεπτά.</p>
        </div>
        <div className="filters">
          <input type="search" placeholder="Αναζήτηση προμηθευτή…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={year} onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Όλα τα έτη</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {newOnes > 0 && (
        <div className="note" style={{ background: 'var(--warn-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>🔔 <b>{newOnes}</b> νέ{newOnes === 1 ? 'ο τιμολόγιο' : 'α τιμολόγια'} από την τελευταία φορά.</span>
          <button className="btn" onClick={markSeen} disabled={busy}>Τα είδα</button>
        </div>
      )}

      <div className="kpis">
        <div className="kpi expense"><div className="label">Σύνολο</div><div className="value">{eur(total)}</div><div className="sub">{filtered.length} παραστατικά</div></div>
        <div className="kpi"><div className="label">ΦΠΑ</div><div className="value">{eur(vat)}</div><div className="sub">εκπίπτει από τον ΦΠΑ πωλήσεων</div></div>
      </div>

      <div className="card">
        {!rows ? <div className="loading">Φόρτωση…</div> : !filtered.length ? <div className="empty">Δεν βρέθηκαν τιμολόγια.</div> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Ημ/νία</th><th>Προμηθευτής</th><th>Είδος</th><th>Αριθμός</th><th className="num">Καθαρά</th><th className="num">ΦΠΑ</th><th className="num">Σύνολο</th><th></th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={r.is_new ? 'newrow' : ''}>
                    <td>{dmy(r.issue_date)} {r.is_new && <span className="pill new">ΝΕΟ</span>}</td>
                    <td className="wrap"><b>{r.supplier}</b><div className="small muted">ΑΦΜ {r.issuer_vat}</div></td>
                    <td><span className="pill">{INVOICE_TYPES[r.invoice_type] ?? r.invoice_type}</span></td>
                    <td className="small">{[r.series, r.aa].filter(Boolean).join(' ')}</td>
                    <td className="num">{eur(Number(r.net_total) * (r.sign || 1))}</td>
                    <td className="num">{eur(Number(r.vat_total) * (r.sign || 1))}</td>
                    <td className="num"><b className={r.sign < 0 ? 'pos' : ''}>{eur(Number(r.gross_total) * (r.sign || 1))}</b></td>
                    <td><ClipButton count={counts.get(r.id) ?? 0} onClick={() => setAttach(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {attach && (
        <AttachmentsModal invoiceId={attach.id} title={`${attach.supplier} · ${[attach.series, attach.aa].filter(Boolean).join(' ')} · ${dmy(attach.issue_date)}`}
          onClose={() => setAttach(null)} onChanged={refreshFiles} />
      )}
    </>
  );
}
