import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ordsgpqakjiahihnqbrh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZHNncHFha2ppYWhpaG5xYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTQzODMsImV4cCI6MjA4MDg5MDM4M30.b2JYajOM-HbV6db4H9YAGVJn3EnaTkYrxbs1apPipZo";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
