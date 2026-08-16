"use client";

import { useEffect, useMemo, useState } from "react";
import { Product } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card } from "@/components/Card";

const emptyForm = {
  id: 0,
  name: "",
  category: "drug" as "drug" | "consumable",
  unit: "unit",
  stock_qty: 0,
  avg_cost: 0,
  reorder_level: 0,
  package_unit: "",
  package_size: 1,
};

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<"all" | "drug" | "consumable" | "low">("all");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return products;
    if (filter === "low") return products.filter((p) => p.stock_qty <= p.reorder_level);
    return products.filter((p) => p.category === filter);
  }, [products, filter]);

  function openNew() {
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      stock_qty: p.stock_qty,
      avg_cost: p.avg_cost,
      reorder_level: p.reorder_level,
      package_unit: p.package_unit || "",
      package_size: p.package_size || 1,
    });
    setShowForm(true);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const isEdit = form.id > 0;
    const res = await fetch(isEdit ? `/api/products/${form.id}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      return;
    }
    setShowForm(false);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? This only works if it has no purchase/sale history.`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Could not delete product");
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Stock / Inventory</h1>
          <p className="text-sm text-slate-500">
            Current on-hand quantity and average cost per item. Costs update automatically from purchases.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + Add Product
        </button>
      </div>

      <div className="flex gap-2 text-sm">
        {(["all", "drug", "consumable", "low"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md font-medium ${
              filter === f ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {f === "all" ? "All" : f === "drug" ? "Drugs" : f === "consumable" ? "Consumables" : "Low Stock"}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No products found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4">Avg. Cost</th>
                  <th className="py-2 pr-4">Reorder Level</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = p.stock_qty <= p.reorder_level;
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-700">{p.name}</td>
                      <td className="py-2 pr-4 capitalize text-slate-500">{p.category}</td>
                      <td className={`py-2 pr-4 font-medium ${low ? "text-rose-600" : "text-slate-700"}`}>
                        {formatNumber(p.stock_qty)} {p.unit}
                        {low && (
                          <span className="ml-2 text-[10px] uppercase bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">
                            Low
                          </span>
                        )}
                        {p.package_size > 1 && p.package_unit && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            1 {p.package_unit} = {formatNumber(p.package_size)} {p.unit}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(p.avg_cost)}</td>
                      <td className="py-2 pr-4 text-slate-500">
                        {formatNumber(p.reorder_level)} {p.unit}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-slate-500 hover:text-slate-800 font-medium mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <h2 className="font-semibold text-slate-800">
              {form.id ? "Edit Product" : "Add Product"}
            </h2>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div>
              <label className="text-xs font-medium text-slate-500">Name</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Nabota 100u (Repack)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Category</label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as "drug" | "consumable" })
                  }
                >
                  <option value="drug">Drug</option>
                  <option value="consumable">Consumable</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Unit</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="unit / vial / pcs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">
                  {form.id ? "Stock Qty" : "Starting Stock Qty"}
                </label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">
                  {form.id ? "Avg. Cost / Unit" : "Starting Avg. Cost / Unit"}
                </label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.avg_cost}
                  onChange={(e) => setForm({ ...form, avg_cost: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Reorder Level (low-stock alert)</label>
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
              />
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-500 mb-1">
                Purchase Packaging (optional)
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Fill this in if you buy in a bigger package but track/use stock in a smaller unit
                &mdash; e.g. you buy 1 <em>vial</em> but track stock in <em>cc</em>, and 1 vial ={" "}
                5 cc.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    Package Name (e.g. vial)
                  </label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    value={form.package_unit}
                    onChange={(e) => setForm({ ...form, package_unit: e.target.value })}
                    placeholder="vial"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    {form.unit || "unit"} per Package
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    value={form.package_size}
                    onChange={(e) => setForm({ ...form, package_size: Number(e.target.value) })}
                    placeholder="5"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm rounded-md text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 text-sm rounded-md bg-rose-500 hover:bg-rose-600 text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
