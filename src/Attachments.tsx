import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, dmy } from './supabase';

type FileRow = { id: number; invoice_id: number; path: string; file_name: string; mime: string | null; size_bytes: number | null; uploaded_at: string; uploaded_by: string | null };

const BUCKET = 'invoice-files';

/** Πλήθος αρχείων ανά τιμολόγιο, για το εικονίδιο 📎 στις λίστες. */
export function useFileCounts() {
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const refresh = useCallback(() => {
    supabase.from('invoice_files').select('invoice_id').range(0, 9999).then(({ data }) => {
      const m = new Map<number, number>();
      for (const r of (data ?? []) as { invoice_id: number }[]) m.set(r.invoice_id, (m.get(r.invoice_id) ?? 0) + 1);
      setCounts(m);
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { counts, refresh };
}

export function ClipButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className={'clip ' + (count ? 'has' : '')} onClick={(e) => { e.stopPropagation(); onClick(); }} title={count ? 'Αρχεία τιμολογίου' : 'Επισύναψη PDF ή φωτογραφίας'}>
      📎{count ? ` ${count}` : '+'}
    </button>
  );
}

const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
const kb = (b: number | null) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`) : '');

export function AttachmentsModal({ invoiceId, title, onClose, onChanged }: { invoiceId: number; title: string; onClose: () => void; onChanged: () => void }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('invoice_files').select('*').eq('invoice_id', invoiceId).order('uploaded_at');
    const rows = (data as FileRow[]) ?? [];
    setFiles(rows);
    if (rows.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
      const map: Record<number, string> = {};
      rows.forEach((r, i) => { const u = signed?.[i]?.signedUrl; if (u) map[r.id] = u; });
      setUrls(map);
    }
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setErr('');
    for (const f of Array.from(list)) {
      if (f.size > 20 * 1048576) { setErr(`Το «${f.name}» είναι πάνω από 20 MB.`); continue; }
      const path = `${invoiceId}/${Date.now()}-${safeName(f.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) { setErr('Αποτυχία ανεβάσματος: ' + up.error.message); continue; }
      const ins = await supabase.from('invoice_files').insert({ invoice_id: invoiceId, path, file_name: f.name, mime: f.type || null, size_bytes: f.size });
      if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); setErr('Αποτυχία αποθήκευσης: ' + ins.error.message); }
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
    await load(); onChanged();
  };

  const remove = async (f: FileRow) => {
    if (!window.confirm(`Διαγραφή του «${f.file_name}»;`)) return;
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([f.path]);
    await supabase.from('invoice_files').delete().eq('id', f.id);
    setBusy(false);
    await load(); onChanged();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>Αρχεία τιμολογίου</h3><div className="small muted">{title}</div></div>
          <button className="x" onClick={onClose}>×</button>
        </div>

        <div className="filters" style={{ marginBottom: 14 }}>
          <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>📄 Επιλογή PDF / εικόνας</button>
          <button className="btn ghost" disabled={busy} onClick={() => cameraInput.current?.click()}>📷 Φωτογραφία</button>
          <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
        </div>
        {busy && <div className="small muted" style={{ marginBottom: 10 }}>Παρακαλώ περίμενε…</div>}
        {err && <div className="msg neg" style={{ marginBottom: 10 }}>{err}</div>}

        {!files ? <div className="loading">Φόρτωση…</div> : !files.length ? (
          <div className="empty">Δεν υπάρχει ακόμα αρχείο. Ανέβασε το PDF ή φωτογράφισε το τιμολόγιο.</div>
        ) : (
          <div className="files">
            {files.map((f) => {
              const url = urls[f.id];
              const isImg = (f.mime ?? '').startsWith('image/');
              return (
                <div key={f.id} className="file">
                  {isImg && url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={f.file_name} /></a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="pdf">PDF</a>
                  )}
                  <div className="file-meta">
                    <a href={url} target="_blank" rel="noopener noreferrer"><b>{f.file_name}</b></a>
                    <div className="small muted">{kb(f.size_bytes)} · {dmy(f.uploaded_at)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ''}</div>
                  </div>
                  <button className="x" title="Διαγραφή" onClick={() => remove(f)} disabled={busy}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
