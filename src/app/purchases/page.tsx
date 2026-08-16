"use client";

import { useEffect, useState } from "react";
import { Product, Purchase } from "@/lib/types";
import { formatCurrency, formatNumber, todayISO } from "@/lib/format";
import { Card } from "@/components/Card";

const emptyForm = {
  product_id: 0,
  date: todayISO(),
  quantity: 1,
  unit_price: 0,
  shipping_fee: 0,
  paid: true,
  note: "",
};

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [entryMode, setEntryMode] = useState<"base" | "package">("base");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [purchasesRes, productsRes] = await Promise.all([
      fetch("/api/purchases"),
      fetch("/api/products"),
    ]);
    setPurchases(await purchasesRes.json());
    setProducts(await productsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const selectedProduct = products.find((p) => p.id === form.product_id);
  const hasPackaging = !!(
    selectedProduct &&
    selectedProduct.package_size > 1 &&
    selectedProduct.package_unit
  );
  const packageSize = hasPackaging ? selectedProduct!.package_size : 1;
  const usingPackageEntry = hasPackaging && entryMode === "package";
  const baseQuantity = usingPackageEntry ? form.quantity * packageSize : form.quantity;
  const baseUnitPrice = usingPackageEntry ? form.unit_price / packageSize : form.unit_price;
  const total = form.quantity * form.unit_price + form.shipping_fee;

  function openNew() {
    const firstProduct = products[0];
    setForm({ ...emptyForm, product_id: firstProduct?.id || 0 });
    setEntryMode(
      firstProduct && firstProduct.package_size > 1 && firstProduct.package_unit
        ? "package"
        : "base"
    );
    setError(null);
    setShowForm(true);
  }

  function selectProduct(productId: number) {
    const product = products.find((p) => p.id === productId);
    setForm({ ...form, product_id: productId });
    setEntryMode(
      product && product.package_size > 1 && product.package_unit ? "package" : "base"
    );
  }

  async function save() {
    setError(null);
    if (!form.product_id) {
      setError("Please select a product");
      return;
    }
    if (form.quantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: baseQuantity,
        unit_price: baseUnitPrice,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      return;
    }
    setShowForm(false);
    load();
  }

  async function remove(p: Purchase) {
    if (
      !confirm(
        `Delete this purchase of ${p.quantity} ${p.unit} "${p.product_name}"? This will subtract the quantity back out of stock.`
      )
    )
      return;
    const res = await fetch(`/api/purchases/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Could not delete purchase");
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Purchases (Stock In)</h1>
          <p className="text-sm text-slate-500">
            Log every order you place online. Stock and average cost update automatically.
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + Log Purchase
        </button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-slate-400">No purchases logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Unit Price</th>
                  <th className="py-2 pr-4">Shipping</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{p.date}</td>
                    <td className="py-2 pr-4 font-medium text-slate-700">{p.product_name}</td>
                    <td className="py-2 pr-4">
                      {formatNumber(p.quantity)} {p.unit}
                    </td>
                    <td className="py-2 pr-4">{formatCurrency(p.unit_price)}</td>
                    <td className="py-2 pr-4">{formatCurrency(p.shipping_fee)}</td>
                    <td className="py-2 pr-4 font-medium">{formatCurrency(p.total_price)}</td>
                    <td className="py-2 pr-4">
                      {p.paid ? (
                        <span className="text-emerald-600 text-xs font-medium">Paid</span>
                      ) : (
                        <span className="text-amber-600 text-xs font-medium">Unpaid</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => remove(p)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <h2 className="font-semibold text-slate-800">Log Purchase</h2>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div>
              <label className="text-xs font-medium text-slate-500">Product</label>
              <select
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={form.product_id}
                onChange={(e) => selectProduct(Number(e.target.value))}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>

            {hasPackaging && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEntryMode("package")}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    entryMode === "package"
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Enter by {selectedProduct!.package_unit}
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("base")}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    entryMode === "base"
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Enter by {selectedProduct!.unit}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Date</label>
                <input
                  type="date"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">
                  Quantity {usingPackageEntry ? `(${selectedProduct!.package_unit})` : selectedProduct ? `(${selectedProduct.unit})` : ""}
                </label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">
                  Price per {usingPackageEntry ? selectedProduct!.package_unit : selectedProduct?.unit || "unit"}
                </label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Shipping Fee</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  value={form.shipping_fee}
                  onChange={(e) => setForm({ ...form, shipping_fee: Number(e.target.value) })}
                />
              </div>
            </div>
            {usingPackageEntry && selectedProduct && (
              <p className="text-xs text-slate-400">
                = {formatCurrency(baseUnitPrice)} per {selectedProduct.unit}, adds{" "}
                {baseQuantity} {selectedProduct.unit} to stock
              </p>
            )}
            <div className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2">
              <span className="text-xs font-medium text-slate-500">Total Price</span>
              <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm({ ...form, paid: e.target.checked })}
              />
              Already paid
            </label>
            <div>
              <label className="text-xs font-medium text-slate-500">Note (optional)</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
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
