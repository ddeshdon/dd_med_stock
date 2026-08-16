export type Category = "drug" | "consumable";

export interface Product {
  id: number;
  name: string;
  category: Category;
  unit: string;
  stock_qty: number;
  avg_cost: number;
  reorder_level: number;
  package_unit: string;
  package_size: number;
  created_at: string;
}

export interface Purchase {
  id: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  date: string;
  quantity: number;
  unit_price: number;
  shipping_fee: number;
  total_price: number;
  paid: number;
  note: string | null;
  created_at: string;
}

export interface Service {
  id: number;
  name: string;
  default_selling_price: number;
  default_consumable_cost: number;
  created_at: string;
}

export interface ServiceItem {
  id: number;
  service_id: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  avg_cost?: number;
  quantity: number;
}

export interface SaleItemInput {
  product_id: number;
  quantity: number;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_cost: number;
}

export interface Sale {
  id: number;
  date: string;
  service_id: number | null;
  service_name: string;
  gross_price: number;
  deduction_type: "percent" | "fixed";
  deduction_value: number;
  owner_cut: number;
  selling_price: number;
  consumable_cost: number;
  drug_cost: number;
  total_cost: number;
  profit: number;
  margin: number;
  patient_name: string;
  note: string | null;
  created_at: string;
  items?: SaleItem[];
  visit_number?: number | null;
}

export interface PatientVisit {
  id: number;
  date: string;
  service_name: string;
  gross_price: number;
  owner_cut: number;
  selling_price: number;
  profit: number;
  visit_number: number;
}

export interface PatientSummary {
  name: string;
  total_visits: number;
  first_visit: string;
  last_visit: string;
  services: { service_name: string; count: number }[];
  visits: PatientVisit[];
}

export interface Settings {
  default_deduction_type: "percent" | "fixed";
  default_deduction_value: number;
  owner_label: string;
}
