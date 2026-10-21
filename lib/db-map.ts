// lib/db-map.ts
// @deprecated All logic has moved to `lib/server/db.ts`. Kept so existing
// imports don't break; migrate imports to `@/lib/server/db` when convenient.
export {
  readDb,
  replaceDb as writeDb,
  mapCategory, mapProduct, mapTransaction, mapEmployee, mapAppUser, mapSettings,
  toCategoryRow, toProductRow, toTransactionRow, toEmployeeRow, toAppUserRow, toSettingsRow,
} from "./server/db";