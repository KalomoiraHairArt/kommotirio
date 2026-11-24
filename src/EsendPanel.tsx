import { useEffect, useRef, useState } from 'react';
import { supabase, dmy } from './supabase';

type Info = { bookmarklet: string | null; last_fetch: string | null; last_z: { znr: number; file_date: string; transmitted_at: string | null } | null };

const ESEND_URL = 'https://www1.gsis.gr/tameiakes/myweb/esend.php';

export default function EsendPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    supabase.rpc('esend_info').then(({ data }) => setInfo((data as Info) ?? null));
  }, []);

  // Το React μπλοκάρει τα javascript: links στο JSX, οπότε το βάζουμε απευθείας στο DOM.
  useEffect(() => {
    if (help && linkRef.current && info?.bookmarklet) linkRef.current.setAttribute('href', info.bookmarklet);
  }, [help, info]);

  const copy = async () => {
    if (!info?.bookmarklet) return;
    try { await navigator.clipboard.writeText(info.bookmarklet); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  const lastFetch = info?.last_fetch ? new Date(info.last_fetch) : null;

  return (
    <div className="card esend">
      <div className="esend-row">
        <div>
          <h3 style={{ marginBottom: 4 }}>e-send</h3>
          <div className="small muted">
            {info?.last_z ? <>Τελευταίο Ζ: <b>#{info.last_z.znr}</b> της {dmy(info.last_z.file_date)}</> : 'Φόρτωση…'}
            {lastFetch && <> · τελευταία λήψη {lastFetch.toLocaleDateString('el-GR')} {lastFetch.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</>}
          </div>
        </div>
        <div className="filters">
          <a className="btn" href={ESEND_URL} target="_blank" rel="noopener noreferrer">Άνοιγμα e-send ↗</a>
          <button className="btn ghost" onClick={() => setHelp(!help)}>{help ? 'Κλείσιμο' : 'Πώς φέρνω τα νέα Ζ;'}</button>
        </div>
      </div>

      {help && (
        <div className="esend-help">
          <ol>
            <li>Πάτα <b>Άνοιγμα e-send</b>, μετά <b>Επιχειρήσεις</b>, και κάνε login με τους κωδικούς TAXISnet.</li>
            <li>Πάτα το κουμπί <b>Λήψη Ζ</b> στη γραμμή σελιδοδεικτών του browser.</li>
            <li>Θα δεις μήνυμα «Αποθηκεύτηκαν Χ νέα Ζ». Γύρνα εδώ και κάνε ανανέωση.</li>
          </ol>
          <div className="small muted" style={{ marginTop: 8 }}>
            <b>Δεν έχεις το κουμπί «Λήψη Ζ»;</b> Σε υπολογιστή, σύρε το παρακάτω κουμπί με το ποντίκι πάνω στη γραμμή σελιδοδεικτών (Ctrl+Shift+B για να εμφανιστεί):
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            {info?.bookmarklet ? (
              <a ref={linkRef} className="bookmarklet" onClick={(e) => e.preventDefault()} title="Σύρε με στη γραμμή σελιδοδεικτών">⬇ Λήψη Ζ</a>
            ) : <span className="muted small">Δεν βρέθηκε το κουμπί.</span>}
            <button className="btn ghost" onClick={copy}>{copied ? '✔ Αντιγράφηκε' : 'Αντιγραφή συνδέσμου'}</button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Εναλλακτικά: «Αντιγραφή συνδέσμου», μετά νέος σελιδοδείκτης με όνομα «Λήψη Ζ» και επικόλληση στο πεδίο URL.
          </div>
        </div>
      )}
    </div>
  );
}
