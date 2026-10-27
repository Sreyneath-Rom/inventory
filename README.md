# Inventory Management System
Next.js 14 (App Router) + TypeScript + Tailwind CSS — Liquid Glass × Neumorphic UI.

```bash
npm install
npm run dev      # http://localhost:3000
```
Data is stored in the browser (localStorage). Replace `src/lib/store.tsx` actions with API calls to connect a backend.

## Supabase database migrations

Apply the SQL files in `supabase/migrations/` to the Supabase project before
using the app. If you do not use the Supabase CLI, run each migration in order
in the Supabase SQL Editor. The first-admin bootstrap migration creates the
RPC used to safely provision the first application account.