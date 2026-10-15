import type { DB, Feature, Role } from "./types";
import { FEATURES } from "./types";

const perm = (on: Feature[]) =>
  Object.fromEntries(FEATURES.map((f) => [f.key, on.includes(f.key)])) as Record<Feature, boolean>;
const all = FEATURES.map((f) => f.key);

export const defaultPermissions: Record<Role, Record<Feature, boolean>> = {
  Admin: perm(all),
  Manager: perm(all.filter((f) => f !== "settings")),
  Staff: perm(["dashboard", "products", "stockIn", "stockOut"]),
};

/**
 * Starting state for a fresh install.
 *
 * Intentionally empty — no categories, no products, no transactions.
 * The UI shows its empty states until you add real data. Settings and the
 * default admin user are still seeded so the app boots.
 */
export function buildSeed(): DB {
  return {
    categories: [],
    products: [],
    transactions: [],
    settings: {
      companyName: "Inventory Co.",
      adminName: "Admin",
      currency: "USD",
      defaultThreshold: 10,
      currentRole: "Admin",
      permissions: defaultPermissions,
      users: [
        { id: "u1", name: "Admin", email: "admin@example.com", role: "Admin" },
      ],
    },
  };
}