"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Sale } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card } from "@/components/Card";

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sales");
    setSales(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: number) {
    if (!confirm("Delete this sale? Stock quantities used will be restored.")) return;
    await fetch(`/api/sales/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Sales</h1>
          <p className="text-sm text-slate-500">Every treatment session sold, with cost & margin.</p>
        </div>
        <Link
          href="/sales/new"
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + Log a Sale
        </Link>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : sales.length === 0 ? (
          <p className="text-sm text-slate-400">No sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Patient</th>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Client Paid</th>
                  <th className="py-2 pr-4">Owner&apos;s Cut</th>
                  <th className="py-2 pr-4">Total Cost</th>
                  <th className="py-2 pr-4">Your Earning</th>
                  <th className="py-2 pr-4">Margin</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <Fragment key={s.id}>
                    <tr
                      className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    >
                      <td className="py-2 pr-4 text-slate-500">{s.date}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {s.patient_name || <span className="text-slate-300">—</span>}
                        {s.patient_name && s.visit_number && (
                          <span className="text-slate-400 text-xs ml-1">(#{s.visit_number})</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-700">{s.service_name}</td>
                      <td className="py-2 pr-4">{formatCurrency(s.gross_price)}</td>
                      <td className="py-2 pr-4 text-amber-600">{formatCurrency(s.owner_cut)}</td>
                      <td className="py-2 pr-4">{formatCurrency(s.total_cost)}</td>
                      <td
                        className={`py-2 pr-4 font-medium ${
                          s.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(s.profit)}
                      </td>
                      <td className="py-2 pr-4">{formatPercent(s.margin)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(s.id);
                          }}
                          className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expanded === s.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Breakdown:</p>
                              <ul className="text-xs text-slate-600 space-y-0.5">
                                <li>Client paid: {formatCurrency(s.gross_price)}</li>
                                <li>
                                  Owner&apos;s cut ({s.deduction_type === "percent" ? `${s.deduction_value}%` : formatCurrency(s.deduction_value)}):{" "}
                                  {formatCurrency(s.owner_cut)}
                                </li>
                                <li>Your price after cut: {formatCurrency(s.selling_price)}</li>
                                <li>Drug cost: {formatCurrency(s.drug_cost)}</li>
                                <li>Consumable cost: {formatCurrency(s.consumable_cost)}</li>
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">Products used:</p>
                              {s.items && s.items.length > 0 ? (
                                <ul className="text-xs text-slate-600 space-y-0.5">
                                  {s.items.map((it) => (
                                    <li key={it.id}>
                                      {it.product_name} × {it.quantity} @ {formatCurrency(it.unit_cost)} ={" "}
                                      {formatCurrency(it.line_cost)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-slate-400">No stock items linked.</p>
                              )}
                            </div>
                          </div>
                          {s.note && (
                            <p className="text-xs text-slate-500 mt-2">Note: {s.note}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
