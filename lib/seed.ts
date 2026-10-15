import type { DB, Feature, Role, Transaction } from "./types";
import { FEATURES } from "./types";
import { addDays, nextRef } from "./utils";

const perm = (on: Feature[]) =>
  Object.fromEntries(FEATURES.map((f) => [f.key, on.includes(f.key)])) as Record<Feature, boolean>;
const all = FEATURES.map((f) => f.key);

export const defaultPermissions: Record<Role, Record<Feature, boolean>> = {
  Admin: perm(all),
  Manager: perm(all.filter((f) => f !== "settings")),
  Staff: perm(["dashboard", "products", "stockIn", "stockOut"]),
};

export function buildSeed(): DB {
  const categories = [
    { id: "c1", name: "Grocery", color: "#3b82f6" },
    { id: "c2", name: "Beverage", color: "#14b8a6" },
    { id: "c3", name: "Dairy", color: "#f59e0b" },
    { id: "c4", name: "Bakery", color: "#ec4899" },
    { id: "c5", name: "Household", color: "#8b5cf6" },
  ];
  const P = (
    id: string,
    sku: string,
    name: string,
    categoryId: string,
    unit: string,
    cost: number,
    price: number,
    stock: number,
    threshold: number,
    emoji: string
  ) => ({ id, sku, name, categoryId, unit, cost, price, stock, threshold, emoji });
  const products = [
    P("p1", "SKU-001", "Rice 5kg", "c1", "bag", 4.5, 6.5, 78, 20, "🍚"),
    P("p2", "SKU-002", "Cooking Oil 1L", "c1", "btl", 2.2, 3.2, 8, 10, "🛢️"),
    P("p3", "SKU-003", "Instant Noodles", "c1", "pack", 0.3, 0.5, 5, 10, "🍜"),
    P("p4", "SKU-004", "Fresh Milk 1L", "c3", "btl", 1.4, 2.0, 12, 20, "🥛"),
    P("p5", "SKU-005", "Eggs Pack", "c3", "pack", 1.2, 1.9, 6, 10, "🥚"),
    P("p6", "SKU-006", "Bread Loaf", "c4", "pcs", 1.0, 1.6, 40, 15, "🍞"),
    P("p7", "SKU-007", "Mineral Water 500ml", "c2", "btl", 0.2, 0.4, 150, 50, "💧"),
    P("p8", "SKU-008", "Dish Soap 500ml", "c5", "btl", 1.1, 1.8, 34, 10, "🧴"),
  ];

  let s = 42;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const now = new Date();
  const raw: Omit<Transaction, "ref">[] = [];
  for (let day = 59; day >= 0; day--) {
    for (let k = 0; k < 2; k++) {
      const p = products[Math.floor(rnd() * products.length)];
      const type = rnd() < 0.5 ? "IN" : "OUT";
      const d = addDays(now, -day);
      d.setHours(8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);
      if (d > now) d.setTime(now.getTime() - 60000);
      const qty = type === "IN" ? 20 + Math.floor(rnd() * 100) : 5 + Math.floor(rnd() * 35);
      raw.push({
        id: `t${day}-${k}`,
        type,
        productId: p.id,
        productName: p.name,
        qty,
        unitPrice: type === "IN" ? p.cost : p.price,
        party: type === "IN" ? "Default Supplier" : "Walk-in Customer",
        date: d.toISOString(),
      });
    }
  }
  raw.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const done: Transaction[] = [];
  raw.forEach((t) => done.push({ ...t, ref: nextRef(t.type, done, t.date) }));
  done.reverse();

  return {
    categories,
    products,
    transactions: done,
    settings: {
      companyName: "Inventory Co.",
      adminName: "Sreyneath Rom",
      currency: "USD",
      defaultThreshold: 10,
      currentRole: "Admin",
      permissions: defaultPermissions,
      users: [
        { id: "u1", name: "Sreyneath Rom", email: "admin@example.com", role: "Admin" },
        { id: "u2", name: "Dara Sok", email: "dara@example.com", role: "Manager" },
        { id: "u3", name: "Lina Chan", email: "lina@example.com", role: "Staff" },
      ],
    },
  };
}