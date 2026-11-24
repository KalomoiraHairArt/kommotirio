# Κομμωτήριο · Διαχείριση

Ιδιωτική εφαρμογή για τα Ζ της ταμειακής (e-send), τα τιμολόγια προμηθευτών (myDATA) και μια ενδεικτική εικόνα λογιστηρίου.

- Live: https://kommotirio.vercel.app
- Frontend: Vite + React + `@supabase/supabase-js`
- Backend: Supabase (Postgres με RLS, Edge Functions `esend-ingest`, `mydata-sync`, `supplier-lookup`, pg_cron κάθε 15')

Τα δεδομένα προστατεύονται από RLS στη βάση: μόνο emails στον πίνακα `allowed_users` βλέπουν οτιδήποτε.
Το publishable key στο `src/supabase.ts` είναι σχεδιασμένο να είναι δημόσιο.

```bash
npm install
npm run dev
```
