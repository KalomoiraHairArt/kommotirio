import { useEffect, useMemo, useState } from 'react';
import { supabase, eur, dmy, INVOICE_TYPES } from './supabase';
import { AttachmentsModal, ClipButton, DocLink, useFileCounts } from './Attachments';

type Inv = {
  id: number; mark: number; issuer_vat: string; series: string | null; aa: string | null; issue_date: string; invoice_type: string;
  net_total: number; vat_total: number; gross_total: number; sign: number; is_new: boolean; supplier: string; download_url: string | null; qr_url: string | null;
};
type Supplier = {
  vat: string; name: string | null; commercial_title: string | null; activity: string | null; address: string | null; doy: string | null; is_active: boolean | null;
};
type Row = Supplier & { label: string; count: number; total: number; thisYear: number; last: string | null; newCount: number };

const n = (v: unknown) => Number(v ?? 0);
const thisYear = new Date().getFullYear();

export default function SuppliersTab() {
  const [invoices, setInvoices] = useState<Inv[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'total' | 'year' | 'last' | 'name'>('total');
  const [open, setOpen] = useState<string | null>(null);
  const [year, setYear] = useState<number | ''>('');
  const { counts, refresh: refreshFiles } = useFileCounts();
  const [attach, setAttach] = useState<Inv | null>(null);

  useEffect(() => {
    supabase.from('invoices_with_supplier').select('id,mark,issuer_vat,series,aa,issue_date,invoice_type,net_total,vat_total,gross_total,sign,is_new,supplier,download_url,qr_url')
      .order('issue_date', { ascending: false }).range(0, 9999).then(({ data }) => setInvoices((data as Inv[]) ?? []));
    supabase.from('suppliers').select('vat,name,commercial_title,activity,address,doy,is_active').then(({ data }) => setSuppliers((data as Supplier[]) ?? []));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const byVat = new Map(suppliers.map((s) => [s.vat, s]));
    const map = new Map<string, Row>();
    for (const i of invoices ?? []) {
      const s = byVat.get(i.issuer_vat);
      const r = map.get(i.issuer_vat) ?? {
        vat: i.issuer_vat, name: s?.name ?? null, commercial_title: s?.commercial_title ?? null, activity: s?.activity ?? null,
        address: s?.address ?? null, doy: s?.doy ?? null, is_active: s?.is_active ?? null,
        label: i.supplier, count: 0, total: 0, thisYear: 0, last: null, newCount: 0,
      };
      if (i.sign) r.count++;
      r.total += n(i.gross_total) * i.sign;
      if (i.issue_date?.startsWith(String(thisYear))) r.thisYear += n(i.gross_total) * i.sign;
      if (!r.last || i.issue_date > r.last) r.last = i.issue_date;
      if (i.is_new) r.newCount++;
      map.set(i.issuer_vat, r);
    }
    return [...map.values()];
  }, [invoices, suppliers]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter((r) => !s || [r.label, r.name, r.commercial_title, r.vat, r.activity].some((x) => x?.toLowerCase().includes(s)));
    const cmp: Record<typeof sort, (a: Row, b: Row) => number> = {
      total: (a, b) => b.total - a.total,
      year: (a, b) => b.thisYear - a.thisYear,
      last: (a, b) => (b.last ?? '').localeCompare(a.last ?? ''),
      name: (a, b) => a.label.localeCompare(b.label, 'el'),
    };
    return list.sort(cmp[sort]);
  }, [rows, q, sort]);

  const sel = rows.find((r) => r.vat === open) ?? null;
  const selInv = useMemo(() => (invoices ?? []).filter((i) => i.issuer_vat === open && (year === '' || i.issue_date.startsWith(String(year)))), [invoices, open, year]);
  const selYears = useMemo(() => [...new Set((invoices ?? []).filter((i) => i.issuer_vat === open).map((i) => Number(i.issue_date.slice(0, 4))))].sort((a, b) => b - a), [invoices, open]);

  if (!invoices) return <div className="loading">Φόρτωση…</div>;

  if (sel) {
    const sum = (k: 'net_total' | 'vat_total' | 'gross_total') => selInv.reduce((s, i) => s + n(i[k]) * i.sign, 0);
    return (
      <>
        <button className="btn ghost" onClick={() => { setOpen(null); setYear(''); }} style={{ marginBottom: 14 }}>← Όλοι οι προμηθευτές</button>
        <div className="head">
          <div>
            <h2>{sel.label}</h2>
            <p>{sel.name && sel.name !== sel.label ? <>{sel.name} · </> : null}ΑΦΜ {sel.vat}{sel.doy ? ` · ΔΟΥ ${sel.doy}` : ''}</p>
            {(sel.activity || sel.address) && <p className="small">{sel.activity?.toLowerCase()}{sel.activity && sel.address ? ' · ' : ''}{sel.address}</p>}
            {sel.is_active === false && <p><span className="pill warn">Ανενεργή επιχείρηση στο μητρώο</span></p>}
          </div>
          <div className="filters">
            <select value={year} onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Όλα τα έτη</option>
              {selYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi expense"><div className="label">Σύνολο</div><div className="value">{eur(sum('gross_total'))}</div><div className="sub">{selInv.filter((i) => i.sign).length} παραστατικά</div></div>
          <div className="kpi"><div className="label">Καθαρά</div><div className="value">{eur(sum('net_total'))}</div></div>
          <div className="kpi"><div className="label">ΦΠΑ</div><div className="value">{eur(sum('vat_total'))}</div></div>
        </div>
        <div className="card">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Ημ/νία</th><th>Είδος</th><th>Αριθμός</th><th>ΜΑΡΚ</th><th className="num">Καθαρά</th><th className="num">ΦΠΑ</th><th className="num">Σύνολο</th><th></th></tr></thead>
              <tbody>
                {selInv.map((r) => (
                  <tr key={r.id} className={r.is_new ? 'newrow' : ''}>
                    <td>{dmy(r.issue_date)} {r.is_new && <span className="pill new">ΝΕΟ</span>}</td>
                    <td><span className="pill">{INVOICE_TYPES[r.invoice_type] ?? r.invoice_type}</span></td>
                    <td className="small">{[r.series, r.aa].filter(Boolean).join(' ')}</td>
                    <td className="small muted">{r.mark}</td>
                    <td className="num">{eur(n(r.net_total) * (r.sign || 1))}</td>
                    <td className="num">{eur(n(r.vat_total) * (r.sign || 1))}</td>
                    <td className="num"><b className={r.sign < 0 ? 'pos' : ''}>{eur(n(r.gross_total) * (r.sign || 1))}</b></td>
                    <td><div className="docs"><DocLink downloadUrl={r.download_url} qrUrl={r.qr_url} /><ClipButton count={counts.get(r.id) ?? 0} onClick={() => setAttach(r)} /></div></td>
                  </tr>
                ))}
                {!selInv.length && <tr><td colSpan={8} className="empty">Κανένα τιμολόγιο.</td></tr>}
              </tbody>
              {selInv.length > 0 && (
                <tfoot><tr><td colSpan={4}>Σύνολο</td><td className="num">{eur(sum('net_total'))}</td><td className="num">{eur(sum('vat_total'))}</td><td className="num">{eur(sum('gross_total'))}</td><td /></tr></tfoot>
              )}
            </table>
          </div>
        </div>
        {attach && (
          <AttachmentsModal invoiceId={attach.id} title={`${sel.label} · ${[attach.series, attach.aa].filter(Boolean).join(' ')} · ${dmy(attach.issue_date)}`}
            onClose={() => setAttach(null)} onChanged={refreshFiles} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="head">
        <div>
          <h2>Προμηθευτές</h2>
          <p>{rows.length} προμηθευτές από τα τιμολόγια του myDATA. Πάτα έναν για να δεις όλα τα τιμολόγιά του.</p>
        </div>
        <div className="filters">
          <input type="search" placeholder="Αναζήτηση: όνομα, ΑΦΜ, δραστηριότητα…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="total">Ταξινόμηση: σύνολο</option>
            <option value="year">Ταξινόμηση: φέτος</option>
            <option value="last">Ταξινόμηση: πιο πρόσφατο</option>
            <option value="name">Ταξινόμηση: όνομα</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="tablewrap">
          <table>
            <thead><tr><th>Προμηθευτής</th><th>ΑΦΜ</th><th className="num">Τιμολόγια</th><th className="num">{thisYear}</th><th className="num">Σύνολο</th><th>Τελευταίο</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.vat} className="click" onClick={() => setOpen(r.vat)}>
                  <td className="wrap"><b>{r.label}</b> {r.newCount > 0 && <span className="pill new">{r.newCount} ΝΕΑ</span>}
                    {r.activity && <div className="small muted">{r.activity.toLowerCase()}</div>}</td>
                  <td className="small">{r.vat}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.thisYear ? eur(r.thisYear) : '–'}</td>
                  <td className="num"><b>{eur(r.total)}</b></td>
                  <td>{dmy(r.last)}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="empty">Δεν βρέθηκε προμηθευτής.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
