// lib/types.ts
export type Feature =
  | "dashboard" | "products" | "categories" | "stockIn"
  | "stockOut" | "employees" | "reports" | "settings";

export type Role = "Admin" | "Manager" | "Staff";
export type TxType = "IN" | "OUT";

export const ROLES: Role[] = ["Admin", "Manager", "Staff"];
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
  createdAt?: string;
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
  date: string;          // ISO or YYYY-MM-DD
  createdAt?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

/** `users` lives in `app_users`, not on the settings row. */
export interface Settings {
  companyName: string;
  adminName: string;
  currency: string;
  defaultThreshold: number;
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
};

export type EmployeeFormData = Omit<Employee, "id" | "createdAt">;