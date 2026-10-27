// lib/database.types.ts
/**
 * Hand-maintained shape of the `public` schema, matching schema.sql exactly.
 *
 * Why hand-written rather than `supabase gen types`?
 *  - It lives in-repo and survives without the CLI.
 *  - It can declare `permissions: Record<string, Record<string, boolean>>`
 *    instead of the generic `Json`, so `mergePermissions()` and
 *    `mapSettings()` type-check without casts.
 *
 * Whenever schema.sql changes, update this file in the same commit.
 *
 * Every table MUST include `Relationships` (even `[]`) — supabase-js v2
 * requires that key on each table entry.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          color: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          category_id: string;
          unit: string;
          cost: number;
          price: number;
          stock: number;
          threshold: number;
          image: string;
          created_at: string;
          updated_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          category_id: string;
          unit?: string;
          cost?: number;
          price?: number;
          stock?: number;
          threshold?: number;
          image?: string;
          created_at?: string;
          updated_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          category_id?: string;
          unit?: string;
          cost?: number;
          price?: number;
          stock?: number;
          threshold?: number;
          image?: string;
          created_at?: string;
          updated_at?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          ref: string;
          type: "IN" | "OUT";
          product_id: string;
          product_name: string;
          qty: number;
          unit_price: number;
          party: string | null;
          note: string | null;
          date: string;
          created_at: string;
          created_by: string | null;
          reversed_transaction_id: string | null;
          idempotency_key: string | null;
        };
        Insert: {
          id?: string;
          ref: string;
          type: "IN" | "OUT";
          product_id: string;
          product_name: string;
          qty: number;
          unit_price?: number;
          party?: string | null;
          note?: string | null;
          date?: string;
          created_at?: string;
          created_by?: string | null;
          reversed_transaction_id?: string | null;
          idempotency_key?: string | null;
        };
        Update: {
          id?: string;
          ref?: string;
          type?: "IN" | "OUT";
          product_id?: string;
          product_name?: string;
          qty?: number;
          unit_price?: number;
          party?: string | null;
          note?: string | null;
          date?: string;
          created_at?: string;
          created_by?: string | null;
          reversed_transaction_id?: string | null;
          idempotency_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_reversed_transaction_id_fkey";
            columns: ["reversed_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          role: "admin" | "manager" | "staff" | "viewer";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string;
          role?: "admin" | "manager" | "staff" | "viewer";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string;
          role?: "admin" | "manager" | "staff" | "viewer";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          company_name: string;
          admin_name: string;
          currency: string;
          default_threshold: number;
          active_role: "Admin" | "Manager" | "Staff";
          /** JSONB; the app enforces `Record<role, Record<feature, boolean>>`. */
          permissions: Record<string, Record<string, boolean>>;
          updated_at: string;
        };
        Insert: {
          id?: number;
          company_name?: string;
          admin_name?: string;
          currency?: string;
          default_threshold?: number;
          active_role?: "Admin" | "Manager" | "Staff";
          permissions?: Record<string, Record<string, boolean>>;
          updated_at?: string;
        };
        Update: {
          id?: number;
          company_name?: string;
          admin_name?: string;
          currency?: string;
          default_threshold?: number;
          active_role?: "Admin" | "Manager" | "Staff";
          permissions?: Record<string, Record<string, boolean>>;
          updated_at?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          employee_code: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          department: string;
          job_title: string;
          role:
            | "Admin"
            | "Manager"
            | "Inventory Staff"
            | "Warehouse Staff"
            | "Accountant"
            | "Other";
          status: "Active" | "On Leave" | "Inactive";
          hire_date: string;
          salary: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_code: string;
          first_name: string;
          last_name: string;
          email: string;
          phone?: string | null;
          department: string;
          job_title: string;
          role:
            | "Admin"
            | "Manager"
            | "Inventory Staff"
            | "Warehouse Staff"
            | "Accountant"
            | "Other";
          status?: "Active" | "On Leave" | "Inactive";
          hire_date: string;
          salary?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_code?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string | null;
          department?: string;
          job_title?: string;
          role?:
            | "Admin"
            | "Manager"
            | "Inventory Staff"
            | "Warehouse Staff"
            | "Accountant"
            | "Other";
          status?: "Active" | "On Leave" | "Inactive";
          hire_date?: string;
          salary?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      move_stock: {
        Args: {
          p_id: string;
          p_type: "IN" | "OUT";
          p_product_id: string;
          p_qty: number;
          p_unit_price: number;
          p_party: string | null;
          p_note: string | null;
          p_date: string;
        };
        Returns: {
          id: string;
          ref: string;
          type: "IN" | "OUT";
          product_id: string;
          product_name: string;
          qty: number;
          unit_price: number;
          party: string | null;
          note: string | null;
          date: string;
          created_at: string;
          created_by: string | null;
          reversed_transaction_id: string | null;
          idempotency_key: string | null;
        };
      };
      delete_transaction: {
        Args: { p_id: string };
        Returns: undefined;
      };
      bootstrap_admin_if_first_user: {
        Args: {
          p_id: string;
          p_name: string;
          p_email: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}