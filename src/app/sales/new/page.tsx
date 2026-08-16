"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Product, Service, ServiceItem, Settings } from "@/lib/types";
import { formatCurrency, formatPercent, todayISO } from "@/lib/format";
import { Card } from "@/components/Card";

type ServiceWithItems = Service & { items: ServiceItem[] };
type LineItem = { product_id: number; quantity: number };

export default function NewSalePage() {
  const router = useRouter();
  const [services, setServices] = useState<ServiceWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [serviceId, setServiceId] = useState<number | "custom">("custom");
  const [serviceName, setServiceName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [visitPreview, setVisitPreview] = useState<number | null>(null);
  const [grossPrice, setGrossPrice] = useState(0);
  const [deductionType, setDeductionType] = useState<"percent" | "fixed">("percent");
  const [deductionValue, setDeductionValue] = useState(0);
  const [consumableCost, setConsumableCost] = useState(150);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [servicesRes, productsRes, settingsRes] = await Promise.all([
        fetch("/api/services"),
        fetch("/api/products"),
        fetch("/api/settings"),
      ]);
      const svc = await servicesRes.json();
      const prod = await productsRes.json();
      const settingsData: Settings = await settingsRes.json();
      setServices(svc);
      setProducts(prod);
      setSettings(settingsData);
      setDeductionType(settingsData.default_deduction_type);
      setDeductionValue(settingsData.default_deduction_value);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    const name = patientName.trim();
    const service = serviceName.trim();
    if (!name || !service) {
      setVisitPreview(null);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/sales?patient=${encodeURIComponent(name)}&service_name=${encodeURIComponent(service)}&limit=1000`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setVisitPreview((Array.isArray(data) ? data.length : 0) + 1);
      } catch {
        // ignore aborted/failed preview lookups
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [patientName, serviceName]);

  function productById(id: number) {
    return products.find((p) => p.id === id);
  }

  function applyService(id: number | "custom") {
    setServiceId(id);
    if (id === "custom") {
      setServiceName("");
      return;
    }
    const s = services.find((sv) => sv.id === id);
    if (!s) return;
    setServiceName(s.name);
    setGrossPrice(s.default_selling_price);
    setConsumableCost(s.default_consumable_cost);
    setItems(s.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })));
  }

  function addItemRow() {
    setItems([...items, { product_id: products[0]?.id || 0, quantity: 1 }]);
  }

  function updateItemRow(index: number, patch: Partial<LineItem>) {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    setItems(next);
  }

  function removeItemRow(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  const drugCost = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = productById(item.product_id);
        return sum + (product ? product.avg_cost * item.quantity : 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, products]
  );

  const gross = Number(grossPrice) || 0;
  const ownerCut =
    deductionType === "percent"
      ? (gross * (Number(deductionValue) || 0)) / 100
      : Math.min(Number(deductionValue) || 0, gross);
  const netPrice = gross - ownerCut;
  const totalCost = drugCost + (Number(consumableCost) || 0);
  const profit = netPrice - totalCost;
  const margin = gross > 0 ? profit / gross : 0;

  const stockWarnings = items
    .map((item) => {
      const product = productById(item.product_id);
      if (!product) return null;
      if (product.stock_qty < item.quantity) {
        return `Not enough "${product.name}" in stock (have ${product.stock_qty} ${product.unit}, need ${item.quantity}).`;
      }
      return null;
    })
    .filter(Boolean) as string[];

  async function save() {
    setError(null);
    if (!serviceName.trim()) {
      setError("Please choose or type a service name");
      return;
    }
    if (stockWarnings.length > 0) {
      setError(stockWarnings[0]);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        service_id: serviceId === "custom" ? null : serviceId,
        service_name: serviceName,
        patient_name: patientName,
        gross_price: gross,
        deduction_type: deductionType,
        deduction_value: Number(deductionValue) || 0,
        consumable_cost: Number(consumableCost) || 0,
        note,
        items,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      return;
    }
    router.push("/sales");
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Log a Sale</h1>
        <p className="text-sm text-slate-500">
          Pick a treatment, confirm the products used, and the drug cost & margin calculate automatically.
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <Card>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Service</label>
            <select
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={serviceId}
              onChange={(e) =>
                applyService(e.target.value === "custom" ? "custom" : Number(e.target.value))
              }
            >
              <option value="custom">Custom / one-off</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {serviceId === "custom" && (
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">Service / Treatment Name</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Nabota 30u"
            />
          </div>
        )}

        <div className="mt-3">
          <label className="text-xs font-medium text-slate-500">Patient Name</label>
          <input
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="e.g. Tu"
          />
          {visitPreview !== null && (
            <p className="text-xs text-slate-400 mt-1">
              This will be {patientName.trim()}&apos;s visit #{visitPreview} for{" "}
              {serviceName.trim()}.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Client Paid (Gross Price)</label>
            <input
              type="number"
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={grossPrice}
              onChange={(e) => setGrossPrice(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Consumable Cost (needle, glove, etc.)</label>
            <input
              type="number"
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={consumableCost}
              onChange={(e) => setConsumableCost(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-500">
              {settings?.owner_label || "Owner's Cut"}
            </label>
            <Link href="/settings" className="text-xs text-rose-500 hover:underline">
              Change default
            </Link>
          </div>
          <div className="flex gap-2 mt-1">
            <select
              className="border border-slate-200 rounded-md px-2 py-2 text-sm"
              value={deductionType}
              onChange={(e) => setDeductionType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">%</option>
              <option value="fixed">฿ fixed</option>
            </select>
            <input
              type="number"
              className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={deductionValue}
              onChange={(e) => setDeductionValue(Number(e.target.value))}
            />
            <span className="w-32 text-sm text-right text-amber-600 font-medium self-center">
              {formatCurrency(ownerCut)}
            </span>
          </div>
        </div>
      </Card>

      <Card
        title="Products Used (drug cost)"
        action={
          <button onClick={addItemRow} className="text-xs text-rose-500 font-medium">
            + Add product
          </button>
        }
      >
        <div className="space-y-2">
          {items.map((item, idx) => {
            const product = productById(item.product_id);
            const lineCost = product ? product.avg_cost * item.quantity : 0;
            const low = product && product.stock_qty < item.quantity;
            return (
              <div key={idx} className="flex gap-2 items-center">
                <select
                  className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  value={item.product_id}
                  onChange={(e) => updateItemRow(idx, { product_id: Number(e.target.value) })}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (avg {formatCurrency(p.avg_cost)}/{p.unit}, stock {p.stock_qty})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="w-20 border border-slate-200 rounded-md px-2 py-1.5 text-sm"
                  value={item.quantity}
                  onChange={(e) => updateItemRow(idx, { quantity: Number(e.target.value) })}
                />
                <span className={`w-24 text-sm text-right ${low ? "text-rose-600" : "text-slate-600"}`}>
                  {formatCurrency(lineCost)}
                </span>
                <button onClick={() => removeItemRow(idx)} className="text-rose-500 text-xs">
                  ✕
                </button>
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="text-xs text-slate-400">
              No products linked. Add one if this treatment consumes stock.
            </p>
          )}
        </div>
        {stockWarnings.length > 0 && (
          <div className="mt-3 text-xs text-rose-600 space-y-0.5">
            {stockWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
      </Card>

      <Card title="Summary">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Client Paid (Gross)</span>
            <span>{formatCurrency(gross)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{settings?.owner_label || "Owner's Cut"}</span>
            <span className="text-amber-600">- {formatCurrency(ownerCut)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-slate-600">Your Price (after cut)</span>
            <span>{formatCurrency(netPrice)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-100 mt-1">
            <span className="text-slate-500">Drug Cost</span>
            <span>{formatCurrency(drugCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Consumable Cost</span>
            <span>{formatCurrency(consumableCost)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-slate-600">Total Cost</span>
            <span>{formatCurrency(totalCost)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-slate-100 mt-2">
            <span className={profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
              Your Actual Earning
            </span>
            <span className={profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
              {formatCurrency(profit)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Margin (of client price)</span>
            <span>{formatPercent(margin)}</span>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-slate-500">Note (optional)</label>
          <input
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={() => router.push("/sales")}
            className="px-4 py-2 text-sm rounded-md text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-rose-500 hover:bg-rose-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Sale"}
          </button>
        </div>
      </Card>
    </div>
  );
}
