"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export interface MonthlyRow {
  month: string;
  revenue: number;
  ownerCut: number;
  cost: number;
  profit: number;
  sessions: number;
}

export default function RevenueChart({ data }: { data: MonthlyRow[] }) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-400">
        No sales recorded yet.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={70} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
          <Bar dataKey="revenue" name="Client Paid" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ownerCut" name="Owner's Cut" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="cost" name="Drug/Consumable Cost" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="profit" name="Your Earning" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
