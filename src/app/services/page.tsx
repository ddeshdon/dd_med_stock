"use client";

import { useEffect, useState } from "react";
import { Product, Service, ServiceItem, Settings } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/Card";

type ServiceWithItems = Service & { items: ServiceItem[] };

const emptyForm = {
  id: 0,
  name: "",
  default_selling_price: 0,
  default_consumable_cost: 150,
  items: [] as { product_id: number; quantity: number }[],
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [servicesRes, productsRes, settingsRes] = await Promise.all([
      fetch("/api/services"),
      fetch("/api/products"),
      fetch("/api/settings"),
    ]);
    setServices(await servicesRes.json());
    setProducts(await productsRes.json());
    setSettings(await settingsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function estimatedDrugCost(items: { product_id: number; quantity: number }[]) {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.product_id);
      return sum + (product ? product.avg_cost * item.quantity : 0);
    }, 0);
  }

  function openNew() {
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(s: ServiceWithItems) {
    setForm({
      id: s.id,
      name: s.name,
      default_selling_price: s.default_selling_price,
      default_consumable_cost: s.default_consumable_cost,
      items: s.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    });
    setError(null);
    setShowForm(true);
  }

  function addItemRow() {
    setForm({
      ...form,
      items: [...form.items, { product_id: products[0]?.id || 0, quantity: 1 }],
    });
  }

  function updateItemRow(index: number, patch: Partial<{ product_id: number; quantity: number }>) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }

  function removeItemRow(index: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const isEdit = form.id > 0;
    const res = await fetch(isEdit ? `/api/services/${form.id}` : "/api/services", {
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

  async function remove(s: Service) {
    if (!confirm(`Delete service "${s.name}"? Past sales will keep their recorded values.`)) return;
    await fetch(`/api/services/${s.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Services (Treatment Presets)</h1>
          <p className="text-sm text-slate-500">
            Define each treatment with the products it consumes, so sales auto-fill drug cost.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + Add Service
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : services.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">No services yet.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {services.map((s) => {
            const drugCost = estimatedDrugCost(s.items);
            const totalCost = drugCost + s.default_consumable_cost;
            const ownerCut =
              settings?.default_deduction_type === "fixed"
                ? Math.min(settings.default_deduction_value, s.default_selling_price)
                : (s.default_selling_price * (settings?.default_deduction_value || 0)) / 100;
            const netPrice = s.default_selling_price - ownerCut;
            const profit = netPrice - totalCost;
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Client price {formatCurrency(s.default_selling_price)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(s)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <ul className="mt-3 text-sm space-y-1">
                  {s.items.map((i) => (
                    <li key={i.id} className="flex justify-between text-slate-600">
                      <span>
                        {i.product_name} × {i.quantity} {i.unit}
                      </span>
                      <span>{formatCurrency((i.avg_cost || 0) * i.quantity)}</span>
                    </li>
                  ))}
                  {s.items.length === 0 && (
                    <li className="text-slate-400">No products linked</li>
                  )}
                </ul>
                <div className="mt-3 pt-3 border-t border-slate-100 text-sm space-y-1">
                  {(settings?.default_deduction_value || 0) > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>{settings?.owner_label || "Owner's cut"}</span>
                      <span className="text-amber-600">- {formatCurrency(ownerCut)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>Est. drug cost</span>
                    <span>{formatCurrency(drugCost)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Consumable cost</span>
                    <span>{formatCurrency(s.default_consumable_cost)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-slate-700">
                    <span>Est. your earning</span>
                    <span className={profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      {formatCurrency(profit)}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20 overflow-y-auto">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 my-8">
            <h2 className="font-semibold text-slate-800">
              {form.id ? "Edit Service" : "Add Service"}
            </h2>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div>
              <label className="text-xs font-medium text-slate-500">Service Name</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Nabota 100u"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Default Client Price (Gross)</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.default_selling_price}
                  onChange={(e) =>
                    setForm({ ...form, default_selling_price: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Default Consumable Cost</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.default_consumable_cost}
                  onChange={(e) =>
                    setForm({ ...form, default_consumable_cost: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500">Products Used (recipe)</label>
                <button onClick={addItemRow} className="text-xs text-rose-500 font-medium">
                  + Add product
                </button>
              </div>
              <div className="space-y-2 mt-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                      value={item.product_id}
                      onChange={(e) => updateItemRow(idx, { product_id: Number(e.target.value) })}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                      value={item.quantity}
                      onChange={(e) => updateItemRow(idx, { quantity: Number(e.target.value) })}
                    />
                    <button onClick={() => removeItemRow(idx)} className="text-rose-500 text-xs">
                      ✕
                    </button>
                  </div>
                ))}
                {form.items.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No products linked yet — you can still pick products manually when logging a sale.
                  </p>
                )}
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
