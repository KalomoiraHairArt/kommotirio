import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase, eur, dmy } from './supabase';

type Line_ = {
  invoice_id: number; issuer_vat: string; issue_date: string; sign: number; item_code: string | null; item_descr: string;
  quantity: number | null; net_value: number | null; discount: number | null;
};
type Purchase = { date: string; qty: number; unit: number; net: number; invoice_id: number };
type Item = {
  key: string; vat: string; supplier: string; code: string | null; descr: string; purchases: Purchase[];
  last: Purchase; prev: Purchase | null; first: Purchase; change: number | null; changeFromFirst: number | null; totalQty: number; totalNet: number;
};

const n = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : null);
const fmtPct = (p: number | null) => (p === null ? '–' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`);
const cls = (p: number | null) => (p === null || Math.abs(p) < 0.5 ? 'muted' : p > 0 ? 'neg' : 'pos');

export default function PricesTab() {
  const [lines, setLines] = useState<Line_[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [sup, setSup] = useState('');
  const [onlyRepeat, setOnlyRepeat] = useState(true);
  const [sort, setSort] = useState<'change' | 'recent' | 'spent' | 'name'>('change');
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    supabase.from('invoice_lines').select('invoice_id,issuer_vat,issue_date,sign,item_code,item_descr,quantity,net_value,discount')
      .gt('net_value', 0).gt('quantity', 0).eq('sign', 1).order('issue_date').range(0, 9999)
      .then(({ data }) => setLines((data as Line_[]) ?? []));
    supabase.from('suppliers').select('vat,name,commercial_title').then(({ data }) =>
      setNames(new Map((data ?? []).map((s: { vat: string; name: string | null; commercial_title: string | null }) => [s.vat, (s.commercial_title || s.name || s.vat).trim()]))));
  }, []);

  const items = useMemo<Item[]>(() => {
    const map = new Map<string, { vat: string; code: string | null; descr: string; purchases: Purchase[] }>();
    for (const l of lines ?? []) {
      const key = `${l.issuer_vat}|${l.item_code ?? l.item_descr.toUpperCase()}`;
      const e = map.get(key) ?? { vat: l.issuer_vat, code: l.item_code, descr: l.item_descr, purchases: [] };
      e.purchases.push({ date: l.issue_date, qty: n(l.quantity), unit: n(l.net_value) / n(l.quantity), net: n(l.net_value), invoice_id: l.invoice_id });
      e.descr = l.item_descr; // κρατάμε την πιο πρόσφατη περιγραφή (ταξινόμηση παρακάτω)
      map.set(key, e);
    }
    return [...map.entries()].map(([key, e]) => {
      // ίδια ημέρα, ίδιο είδος → μία αγορά (σταθμισμένη τιμή)
      const byDate = new Map<string, Purchase>();
      for (const p of e.purchases.sort((a, b) => a.date.localeCompare(b.date))) {
        const d = byDate.get(p.date);
        if (d) { d.qty += p.qty; d.net += p.net; d.unit = d.net / d.qty; } else byDate.set(p.date, { ...p });
      }
      const ps = [...byDate.values()];
      const last = ps[ps.length - 1]; const prev = ps.length > 1 ? ps[ps.length - 2] : null; const first = ps[0];
      return {
        key, vat: e.vat, supplier: names.get(e.vat) ?? e.vat, code: e.code, descr: e.descr, purchases: ps, last, prev, first,
        change: prev ? pct(last.unit, prev.unit) : null, changeFromFirst: ps.length > 1 ? pct(last.unit, first.unit) : null,
        totalQty: ps.reduce((s, p) => s + p.qty, 0), totalNet: ps.reduce((s, p) => s + p.net, 0),
      };
    });
  }, [lines, names]);

  const suppliers = useMemo(() => [...new Map(items.map((i) => [i.vat, i.supplier])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'el')), [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.filter((i) => (!onlyRepeat || i.purchases.length > 1) && (!sup || i.vat === sup)
      && (!s || i.descr.toLowerCase().includes(s) || (i.code ?? '').toLowerCase().includes(s)));
    const cmp = {
      change: (a: Item, b: Item) => (b.change ?? -999) - (a.change ?? -999),
      recent: (a: Item, b: Item) => b.last.date.localeCompare(a.last.date),
      spent: (a: Item, b: Item) => b.totalNet - a.totalNet,
      name: (a: Item, b: Item) => a.descr.localeCompare(b.descr, 'el'),
    }[sort];
    return list.sort(cmp);
  }, [items, q, sup, onlyRepeat, sort]);

  // πρόσφατες αυξήσεις: τελευταία αγορά στις τελευταίες 120 ημέρες, πάνω από 0,5%
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const recentUp = items.filter((i) => i.change !== null && i.change > 0.5 && i.last.date >= since).sort((a, b) => b.change! - a.change!);
  const repeat = items.filter((i) => i.purchases.length > 1);
  const upCount = repeat.filter((i) => (i.change ?? 0) > 0.5).length;
  const downCount = repeat.filter((i) => (i.change ?? 0) < -0.5).length;

  if (!lines) return <div className="loading">Φόρτωση…</div>;

  return (
    <>
      <div className="head">
        <div>
          <h2>Τιμές ειδών</h2>
          <p>Τιμή μονάδας χωρίς ΦΠΑ, μετά από τυχόν έκπτωση, όπως τη γράφει το τιμολόγιο στο myDATA.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Είδη με τιμές</div><div className="value">{items.length}</div><div className="sub">{repeat.length} αγοράστηκαν 2+ φορές</div></div>
        <div className="kpi expense"><div className="label">Ακρίβυναν</div><div className="value">{upCount}</div><div className="sub">στην τελευταία αγορά</div></div>
        <div className="kpi income"><div className="label">Φθήνυναν</div><div className="value">{downCount}</div><div className="sub">στην τελευταία αγορά</div></div>
        <div className="kpi"><div className="label">Προμηθευτές</div><div className="value">{suppliers.length}</div><div className="sub">δίνουν είδη στο myDATA</div></div>
      </div>

      {recentUp.length > 0 && (
        <div className="card">
          <h3>Πρόσφατες αυξήσεις (τελευταίοι 4 μήνες)</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Είδος</th><th>Προμηθευτής</th><th className="num">Πριν</th><th className="num">Τώρα</th><th className="num">Μεταβολή</th><th>Ημ/νία</th></tr></thead>
              <tbody>
                {recentUp.slice(0, 8).map((i) => (
                  <tr key={i.key} className="click" onClick={() => setOpen(i)}>
                    <td className="wrap"><b>{i.descr}</b></td><td className="small">{i.supplier}</td>
                    <td className="num">{eur(i.prev!.unit)}</td><td className="num"><b>{eur(i.last.unit)}</b></td>
                    <td className="num neg"><b>{fmtPct(i.change)}</b></td><td>{dmy(i.last.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="head" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Όλα τα είδη</h3>
          <div className="filters">
            <input type="search" placeholder="Αναζήτηση είδους ή κωδικού…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
            <select value={sup} onChange={(e) => setSup(e.target.value)}>
              <option value="">Όλοι οι προμηθευτές</option>
              {suppliers.map(([vat, name]) => <option key={vat} value={vat}>{name}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="change">Μεγαλύτερη αύξηση</option>
              <option value="recent">Πιο πρόσφατη αγορά</option>
              <option value="spent">Περισσότερα χρήματα</option>
              <option value="name">Όνομα</option>
            </select>
            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={onlyRepeat} onChange={(e) => setOnlyRepeat(e.target.checked)} /> μόνο 2+ αγορές
            </label>
          </div>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Είδος</th><th>Προμηθευτής</th><th className="num">Αγορές</th><th className="num">Τελευταία τιμή</th><th className="num">Από προηγ.</th><th className="num">Από 1η</th><th>Τελευταία</th></tr></thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.key} className="click" onClick={() => setOpen(i)}>
                  <td className="wrap"><b>{i.descr}</b>{i.code && <div className="small muted">{i.code.replace(/^0+/, '')}</div>}</td>
                  <td className="small">{i.supplier}</td>
                  <td className="num">{i.purchases.length}</td>
                  <td className="num"><b>{eur(i.last.unit)}</b></td>
                  <td className={'num ' + cls(i.change)}>{fmtPct(i.change)}</td>
                  <td className={'num ' + cls(i.changeFromFirst)}>{fmtPct(i.changeFromFirst)}</td>
                  <td>{dmy(i.last.date)}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="empty">Δεν βρέθηκαν είδη.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note">
        Η L'OREAL στέλνει στο myDATA τα είδη μόνο στα δελτία αποστολής, χωρίς τιμές, οπότε δεν εμφανίζεται εδώ. Επίσης, μια «πτώση» τιμής μπορεί να είναι έκπτωση ή προσφορά και όχι μόνιμη αλλαγή.
      </div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>{open.descr}</h3>
                <div className="small muted">{open.supplier}{open.code ? ` · κωδ. ${open.code.replace(/^0+/, '')}` : ''}</div>
              </div>
              <button className="x" onClick={() => setOpen(null)}>×</button>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="label">Τελευταία τιμή</div><div className="value">{eur(open.last.unit)}</div><div className="sub">{dmy(open.last.date)}</div></div>
              <div className="kpi"><div className="label">Από 1η αγορά</div><div className={'value ' + cls(open.changeFromFirst)}>{fmtPct(open.changeFromFirst)}</div><div className="sub">1η: {eur(open.first.unit)} ({dmy(open.first.date)})</div></div>
              <div className="kpi"><div className="label">Σύνολο</div><div className="value">{eur(open.totalNet)}</div><div className="sub">{open.totalQty} τεμ.</div></div>
            </div>
            {open.purchases.length > 1 && (
              <div style={{ width: '100%', height: 220, marginBottom: 12 }}>
                <ResponsiveContainer>
                  <LineChart data={open.purchases.map((p) => ({ date: dmy(p.date), Τιμή: Math.round(p.unit * 100) / 100 }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee6dc" />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} tickFormatter={(v) => `${v}€`} />
                    <Tooltip formatter={(v) => eur(Number(v))} />
                    <Line type="monotone" dataKey="Τιμή" stroke="#b8794a" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <table>
              <thead><tr><th>Ημ/νία</th><th className="num">Ποσότητα</th><th className="num">Τιμή μονάδας</th><th className="num">Μεταβολή</th><th className="num">Σύνολο</th></tr></thead>
              <tbody>
                {[...open.purchases].reverse().map((p, idx, arr) => {
                  const before = arr[idx + 1];
                  const ch = before ? pct(p.unit, before.unit) : null;
                  return (
                    <tr key={p.date}>
                      <td>{dmy(p.date)}</td><td className="num">{p.qty}</td><td className="num"><b>{eur(p.unit)}</b></td>
                      <td className={'num ' + cls(ch)}>{fmtPct(ch)}</td><td className="num">{eur(p.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
