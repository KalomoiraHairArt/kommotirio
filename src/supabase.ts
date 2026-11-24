import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://cfbhluipnxkkmipqgqxk.supabase.co',
  'sb_publishable_sWwpMRQ6fAg9WkaXfSgAbQ_3FCImv4U',
);

export const eur = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === ''
    ? '–'
    : Number(v).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });

export const dmy = (d: string | null | undefined) => {
  if (!d) return '–';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

export const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
export const MONTHS_FULL = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

export const INVOICE_TYPES: Record<string, string> = {
  '1.1': 'Τιμολόγιο πώλησης',
  '1.2': 'Τιμολόγιο ενδοκοιν.',
  '1.3': 'Τιμολόγιο τρίτων χωρών',
  '2.1': 'Τιμολόγιο παροχής',
  '2.2': 'Παροχή ενδοκοιν.',
  '2.3': 'Παροχή τρίτων χωρών',
  '5.1': 'Πιστωτικό (συσχ.)',
  '5.2': 'Πιστωτικό',
  '9.3': 'Δελτίο αποστολής',
  '11.1': 'ΑΛΠ',
  '11.2': 'ΑΠΥ',
  '11.4': 'Πιστωτικό λιανικής',
  '13.1': 'Έξοδα (αγορές λιανικής)',
  '13.30': 'Παραστατικά οντότητας',
  '14.30': 'Παραστατικά οντότητας',
};
