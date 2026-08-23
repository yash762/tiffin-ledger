import { createClient } from "@supabase/supabase-js";

// Paste your values from Supabase -> Project Settings -> API
const supabaseUrl = "https://ojyijvnjwwggiwfdbtvz.supabase.co";
const supabaseAnonKey = "sb_publishable_Hg6lSPAVJfAXbxYqGlO7BQ_JgXizT9I";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
