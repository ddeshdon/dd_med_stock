"use client";

import { useEffect, useMemo, useState } from "react";
import { Sale, Settings } from "@/lib/types";
import { formatCurrency, todayISO } from "@/lib/format";
import { Card, StatCard } from "@/components/Card";

type RangeKey = "today" | "yesterday" | "week" | "month" | "all" | "custom";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TransferSummaryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("today");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());

  function applyRange(key: RangeKey) {
    setRange(key);
    const today = todayISO();
    if (key === "today") {
      setFrom(today);
      setTo(today);
    } else if (key === "yesterday") {
      const y = isoDaysAgo(1);
      setFrom(y);
      setTo(y);
    } else if (key === "week") {
      setFrom(isoDaysAgo(6));
      setTo(today);
    } else if (key === "month") {
      setFrom(today.slice(0, 8) + "01");
      setTo(today);
    } else if (key === "all") {
      setFrom("2000-01-01");
      setTo(today);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [salesRes, settingsRes] = await Promise.all([
        fetch(`/api/sales?from=${from}&to=${to}&limit=1000`),
        fetch("/api/settings"),
      ]);
      setSales(await salesRes.json());
      setSettings(await settingsRes.json());
      setLoading(false);
    }
    load();
  }, [from, to]);

  const groups = useMemo(() => {
    const byDate = new Map<string, Sale[]>();
    for (const s of sales) {
      const list = byDate.get(s.date) || [];
      list.push(s);
      byDate.set(s.date, list);
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => a.id - b.id);
    }
    return Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sales]);

  const grandTotal = sales.reduce(
    (acc, s) => {
      acc.gross += s.gross_price;
      acc.cut += s.owner_cut;
      acc.transfer += s.selling_price;
      return acc;
    },
    { gross: 0, cut: 0, transfer: 0 }
  );

  const ownerLabel = settings?.owner_label || "Owner's Cut";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Transfer Summary</h1>
        <p className="text-sm text-slate-500">
          What {ownerLabel.replace(/'s cut$/i, "")} collected from clients, and how much she still
          needs to transfer to you after her cut.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["week", "Last 7 Days"],
            ["month", "This Month"],
            ["all", "All Time"],
          ] as [RangeKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => applyRange(key)}
            className={`px-3 py-1.5 rounded-md font-medium ${
              range === key ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
            value={from}
            onChange={(e) => {
              setRange("custom");
              setFrom(e.target.value);
            }}
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm"
            value={to}
            onChange={(e) => {
              setRange("custom");
              setTo(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Sessions" value={String(sales.length)} />
        <StatCard label="Total Collected (Gross)" value={formatCurrency(grandTotal.gross)} />
        <StatCard label={ownerLabel} value={formatCurrency(grandTotal.cut)} />
        <StatCard
          label="To Transfer to You"
          value={formatCurrency(grandTotal.transfer)}
          tone="positive"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : groups.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">No sessions in this date range.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, daySales]) => {
            const dayTotal = daySales.reduce(
              (acc, s) => {
                acc.gross += s.gross_price;
                acc.cut += s.owner_cut;
                acc.transfer += s.selling_price;
                return acc;
              },
              { gross: 0, cut: 0, transfer: 0 }
            );
            return (
              <Card key={date} title={date}>
                <ol className="text-sm divide-y divide-slate-100">
                  {daySales.map((s, idx) => (
                    <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-slate-600">
                        <span className="text-slate-400 mr-2">{idx + 1}.</span>
                        {s.service_name}
                      </span>
                      <span className="text-right whitespace-nowrap">
                        <span className="text-slate-700 font-medium">
                          {formatCurrency(s.gross_price)}
                        </span>
                        <span className="text-amber-600 text-xs ml-2">
                          − {formatCurrency(s.owner_cut)}
                        </span>
                        <span className="text-emerald-600 font-semibold ml-2">
                          = {formatCurrency(s.selling_price)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-600">
                    Day Total ({daySales.length} session{daySales.length > 1 ? "s" : ""})
                  </span>
                  <span className="text-emerald-600">
                    Transfer {formatCurrency(dayTotal.transfer)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
