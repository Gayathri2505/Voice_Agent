// supabaseClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Single shared Supabase client instance for the entire app.
// Import THIS file everywhere — never call createClient() anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);