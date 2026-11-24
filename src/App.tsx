import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Login, { SetPassword } from './Login';
import ZTab from './ZTab';
import InvoicesTab from './InvoicesTab';
import AccountingTab from './AccountingTab';

type Tab = 'acc' | 'z' | 'inv';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (localStorageGet('tab') as Tab) || 'acc');
  const [newCount, setNewCount] = useState(0);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [setPw, setSetPw] = useState(() => new URLSearchParams(window.location.search).has('setpw'));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setSetPw(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { localStorageSet('tab', tab); }, [tab]);

  const refreshNew = async () => {
    const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).is('notified_at', null);
    setNewCount(count ?? 0);
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase.rpc('is_allowed');
      setAllowed(!error && data === true);
      refreshNew();
    })();
  }, [session]);

  if (!ready) return <div className="loading">Φόρτωση…</div>;
  if (!session) return <Login />;
  if (allowed === false)
    return (
      <div className="login"><div className="box">
        <h1>Χωρίς πρόσβαση</h1>
        <p>Το email {session.user.email} δεν έχει πρόσβαση σε αυτή την εφαρμογή.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Αποσύνδεση</button>
      </div></div>
    );
  if (allowed === null) return <div className="loading">Φόρτωση…</div>;

  return (
    <>
      <header className="topbar">
        <div className="brand">Κομμωτήριο<small>Ζ · Τιμολόγια · Λογιστήριο</small></div>
        <nav className="tabs">
          <button className={'tab ' + (tab === 'acc' ? 'active' : '')} onClick={() => setTab('acc')}>Λογιστήριο</button>
          <button className={'tab ' + (tab === 'z' ? 'active' : '')} onClick={() => setTab('z')}>Ζ ταμειακής</button>
          <button className={'tab ' + (tab === 'inv' ? 'active' : '')} onClick={() => setTab('inv')}>
            Τιμολόγια {newCount > 0 && <span className="badge">{newCount}</span>}
          </button>
        </nav>
        <button className="logout" onClick={() => setSetPw(true)}>Κωδικός</button>
        <button className="logout" onClick={() => supabase.auth.signOut()}>Έξοδος</button>
      </header>
      <main>
        {tab === 'acc' && <AccountingTab />}
        {tab === 'z' && <ZTab />}
        {tab === 'inv' && <InvoicesTab onSeen={refreshNew} />}
      </main>
      {setPw && <SetPassword canCancel onDone={() => { setSetPw(false); window.history.replaceState(null, '', '/'); }} />}
    </>
  );
}

function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
