// lib/supabase/server.ts
// @deprecated Use `createAdminSupabase` from `@/lib/supabase/admin`.
// The old name hid that this client bypasses RLS.
export { createAdminSupabase as createServerSupabase } from "./admin";