// Supabase client. If the env vars are missing the app keeps working in
// demo mode with localStorage, so smoke tests and offline dev stay intact.
import { createClient } from '@supabase/supabase-js';

// Vite fills import.meta.env in the browser; Node scripts (node --env-file=.env scripts/…) only have process.env.
const env = import.meta.env || (typeof process !== 'undefined' && process.env) || {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const DB_MODE = !!supabase;
// A throw-away client without a session: used once to tell "the tables are empty" from "the signed-in
// user has no RLS policy yet" (supabase/auth.sql not run).
export const createAnonProbe = () => (url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null);
