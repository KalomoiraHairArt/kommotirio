import { useState } from 'react';
import { supabase } from './supabase';

type Mode = 'password' | 'link';

export default function Login() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setErr(error.message.includes('Invalid login') ? 'Λάθος email ή κωδικός.' : 'Κάτι πήγε στραβά: ' + error.message);
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin + '/?setpw=1' },
    });
    setBusy(false);
    if (error) setErr('Κάτι πήγε στραβά: ' + error.message);
    else setSent(true);
  };

  return (
    <div className="login">
      {mode === 'password' ? (
        <form className="box" onSubmit={signIn}>
          <h1>Κομμωτήριο</h1>
          <p>Σύνδεση με email και κωδικό.</p>
          <input type="email" required placeholder="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input type="password" required placeholder="κωδικός" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? 'Σύνδεση…' : 'Είσοδος'}</button>
          {err && <div className="msg neg">{err}</div>}
          <button type="button" className="linkbtn" onClick={() => { setMode('link'); setErr(''); }}>
            Πρώτη φορά ή ξέχασες τον κωδικό;
          </button>
        </form>
      ) : (
        <form className="box" onSubmit={sendLink}>
          <h1>Ορισμός κωδικού</h1>
          <p>Βάλε το email σου. Θα σου έρθει σύνδεσμος· πατώντας τον μπαίνεις και ορίζεις νέο κωδικό.</p>
          {sent ? (
            <div className="msg">✉️ Στάλθηκε στο <b>{email}</b>. Άνοιξε το email και πάτα τον σύνδεσμο.</div>
          ) : (
            <>
              <input type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <button className="btn" disabled={busy}>{busy ? 'Αποστολή…' : 'Στείλε μου σύνδεσμο'}</button>
            </>
          )}
          {err && <div className="msg neg">{err}</div>}
          <button type="button" className="linkbtn" onClick={() => { setMode('password'); setSent(false); setErr(''); }}>
            ← Πίσω στη σύνδεση με κωδικό
          </button>
        </form>
      )}
    </div>
  );
}

export function SetPassword({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.');
    if (pw !== pw2) return setErr('Οι δύο κωδικοί δεν είναι ίδιοι.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setErr('Κάτι πήγε στραβά: ' + error.message);
    else setOk(true);
  };

  return (
    <div className="modal-bg">
      <form className="modal" style={{ maxWidth: 380 }} onSubmit={save}>
        <div className="modal-head">
          <h3>Ορισμός κωδικού</h3>
          {canCancel && <button type="button" className="x" onClick={onDone}>×</button>}
        </div>
        {ok ? (
          <>
            <p>✔ Ο κωδικός αποθηκεύτηκε. Από εδώ και πέρα μπαίνεις με email και κωδικό.</p>
            <button type="button" className="btn" onClick={onDone}>Συνέχεια</button>
          </>
        ) : (
          <>
            <input className="full" type="password" autoComplete="new-password" placeholder="νέος κωδικός (8+ χαρακτήρες)" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <input className="full" type="password" autoComplete="new-password" placeholder="ξανά τον νέο κωδικό" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <button className="btn" disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση κωδικού'}</button>
            {err && <div className="msg neg">{err}</div>}
          </>
        )}
      </form>
    </div>
  );
}
