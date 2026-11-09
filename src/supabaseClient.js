// Supabase client. If the env vars are missing the app keeps working in
// demo mode with localStorage, so smoke tests and offline dev stay intact.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const DB_MODE = !!supabase;
