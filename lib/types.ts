export type Feature =
  | "dashboard" | "products" | "categories" | "stockIn" | "stockOut" | "reports" | "settings";
export type Role = "Admin" | "Manager" | "Staff";
export type TxType = "IN" | "OUT";

export const ROLES: Role[] = ["Admin", "Manager", "Staff"];
export const FEATURES: { key: Feature; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "stockIn", label: "Stock In" },
  { key: "stockOut", label: "Stock Out" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

export interface Category { id: string; name: string; color: string }

export interface Product {
  id: string; sku: string; name: string; categoryId: string; unit: string;
  cost: number; price: number; stock: number; threshold: number; emoji: string;
}

export interface Transaction {
  id: string; ref: string; type: TxType; productId: string; productName: string;
  qty: number; unitPrice: number; party?: string; note?: string; date: string; // ISO
}

export interface AppUser { id: string; name: string; email: string; role: Role }

export interface Settings {
  companyName: string; adminName: string; currency: string; defaultThreshold: number;
  currentRole: Role; users: AppUser[];
  permissions: Record<Role, Record<Feature, boolean>>;
}

export interface DB {
  categories: Category[]; products: Product[]; transactions: Transaction[]; settings: Settings;
}