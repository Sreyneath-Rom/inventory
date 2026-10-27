// lib/types.ts
export type Feature =
  | "dashboard" | "products" | "categories" | "stockIn"
  | "stockOut" | "employees" | "reports" | "settings";

/**
 * App-level role. Matches `public.profiles.role` (case-insensitive) and the
 * per-role permissions map. `settings.active_role` only allows the first
 * three — see `PreviewableRole` below.
 */
export type Role = "Admin" | "Manager" | "Staff" | "Viewer";
export type PreviewableRole = "Admin" | "Manager" | "Staff";

export type TxType = "IN" | "OUT";

export const ROLES: Role[] = ["Admin", "Manager", "Staff", "Viewer"];

export const FEATURES: { key: Feature; label: string }[] = [
  { key: "dashboard",  label: "Dashboard"  },
  { key: "products",   label: "Products"   },
  { key: "categories", label: "Categories" },
  { key: "stockIn",    label: "Stock In"   },
  { key: "stockOut",   label: "Stock Out"  },
  { key: "employees",  label: "Employees"  },
  { key: "reports",    label: "Reports"    },
  { key: "settings",   label: "Settings"   },
];

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  threshold: number;
  image: string;
  /** SQL: `is_active boolean NOT NULL DEFAULT true`. Optional in the type
   *  for backward-compat; the DB always fills it. */
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Transaction {
  id: string;
  ref: string;
  type: TxType;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  party?: string;
  note?: string;
  date: string;                // "YYYY-MM-DD" or full ISO
  /** SQL: pointer to the transaction that reversed this one. */
  reversedTransactionId?: string;
  /** SQL: unique client-supplied idempotency token. */
  idempotencyKey?: string;
  /** SQL: `auth.users(id)` — UUID of the caller. */
  createdBy?: string;
  createdAt?: string;
}

export interface AppUser {
  /** profiles.user_id (= auth.users.id). */
  id: string;
  /** profiles.display_name. */
  name: string;
  /** Not stored in profiles — enriched from auth.users on read. */
  email: string;
  /** Mapped from profiles.role (lowercase) → TitleCase. */
  role: Role;
  /** profiles.is_active. */
  isActive?: boolean;
  createdAt?: string;
}

export interface Settings {
  companyName: string;
  adminName: string;
  currency: string;
  defaultThreshold: number;
  /**
   * The **effective role for the current caller** — set by `GET /api/db`
   * to the signed-in user's real role, so the client's `can()` check
   * mirrors server enforcement. May be `"Viewer"`; the permission map
   * has a Viewer entry so `permissions[currentRole]` resolves correctly.
   *
   * ⚠ When this value is written back to `settings.active_role`, the
   * DB CHECK (`active_role = ANY ('Admin','Manager','Staff')`) forbids
   * Viewer. `toSettingsRow` in `lib/server/db.ts` guards that, and
   * `PUT /api/db` rejects it during payload validation — both before
   * any destructive write begins.
   */
  currentRole: Role;
  users: AppUser[];
  permissions: Record<Role, Record<Feature, boolean>>;
}



export interface DB {
  categories: Category[];
  products: Product[];
  transactions: Transaction[];
  employees: Employee[];
  settings: Settings;
}

export type EmployeeStatus = "Active" | "On Leave" | "Inactive";
export type EmployeeRole =
  | "Admin" | "Manager" | "Inventory Staff"
  | "Warehouse Staff" | "Accountant" | "Other";

export type Employee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  hireDate: string;
  salary: number;
  createdAt?: string;
  updatedAt?: string;
};

export type EmployeeFormData = Omit<Employee, "id" | "createdAt" | "updatedAt">;
