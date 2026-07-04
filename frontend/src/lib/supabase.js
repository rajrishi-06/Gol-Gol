import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Surface misconfiguration early and clearly instead of failing deep in a
  // network call. The anon key is safe to expose in the client by design.
  console.warn(
    "[gol-gol] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
