import Link from "next/link";
import db from "@/lib/db";
import { Product, Sale } from "@/lib/types";
import { Card, StatCard } from "@/components/Card";
import RevenueChart, { MonthlyRow } from "@/components/RevenueChart";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', date) AS month,
              SUM(gross_price) AS revenue,
              SUM(owner_cut) AS ownerCut,
              SUM(total_cost) AS cost,
              SUM(profit) AS profit,
              COUNT(*) AS sessions
       FROM sales GROUP BY month ORDER BY month ASC`
    )
    .all() as MonthlyRow[];

  const totals = db
    .prepare(
      `SELECT SUM(gross_price) AS revenue, SUM(owner_cut) AS ownerCut, SUM(total_cost) AS cost, SUM(profit) AS profit, COUNT(*) AS sessions
       FROM sales`
    )
    .get() as {
    revenue: number | null;
    ownerCut: number | null;
    cost: number | null;
    profit: number | null;
    sessions: number;
  };

  const revenue = totals.revenue || 0;
  const ownerCut = totals.ownerCut || 0;
  const cost = totals.cost || 0;
  const profit = totals.profit || 0;
  const margin = revenue > 0 ? profit / revenue : 0;

  const lowStock = db
    .prepare(`SELECT * FROM products WHERE stock_qty <= reorder_level ORDER BY stock_qty ASC`)
    .all() as Product[];

  const recentSales = db
    .prepare(`SELECT * FROM sales ORDER BY date DESC, id DESC LIMIT 6`)
    .all() as Sale[];

  const topServices = db
    .prepare(
      `SELECT service_name, COUNT(*) AS count, SUM(profit) AS profit, SUM(gross_price) AS revenue
       FROM sales GROUP BY service_name ORDER BY revenue DESC LIMIT 6`
    )
    .all() as { service_name: string; count: number; profit: number; revenue: number }[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of your clinic&apos;s stock and margins.</p>
        </div>
        <Link
          href="/sales/new"
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          + Log a Sale
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Gross Revenue" value={formatCurrency(revenue)} sub={`${totals.sessions} sessions (client paid)`} />
        <StatCard label="Owner's Cut" value={formatCurrency(ownerCut)} sub="Paid out before your costs" />
        <StatCard label="Drug + Consumable Cost" value={formatCurrency(cost)} />
        <StatCard
          label="Your Actual Earnings"
          value={formatCurrency(profit)}
          tone={profit >= 0 ? "positive" : "negative"}
          sub={`${formatPercent(margin)} of gross`}
        />
      </div>

      <Card title="Monthly Revenue, Cost & Profit">
        <RevenueChart data={monthly} />
      </Card>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <Card
          title="Low Stock Alerts"
          action={
            <Link href="/stock" className="text-xs text-rose-500 font-medium hover:underline">
              Manage stock
            </Link>
          }
        >
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400">All stock levels look healthy.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{p.name}</span>
                  <span className="text-rose-500 font-semibold">
                    {formatNumber(p.stock_qty)} {p.unit} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top Services by Revenue">
          {topServices.length === 0 ? (
            <p className="text-sm text-slate-400">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topServices.map((s) => (
                <li key={s.service_name} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    {s.service_name}{" "}
                    <span className="text-slate-400 font-normal">×{s.count}</span>
                  </span>
                  <span className="text-emerald-600 font-semibold">{formatCurrency(s.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Recent Sales"
        action={
          <Link href="/sales" className="text-xs text-rose-500 font-medium hover:underline">
            View all
          </Link>
        }
      >
        {recentSales.length === 0 ? (
          <p className="text-sm text-slate-400">No sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Service</th>
                  <th className="py-2 pr-4">Client Paid</th>
                  <th className="py-2 pr-4">Owner&apos;s Cut</th>
                  <th className="py-2 pr-4">Total Cost</th>
                  <th className="py-2 pr-4">Your Earning</th>
                  <th className="py-2">Margin</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{s.date}</td>
                    <td className="py-2 pr-4 font-medium text-slate-700">{s.service_name}</td>
                    <td className="py-2 pr-4">{formatCurrency(s.gross_price)}</td>
                    <td className="py-2 pr-4">{formatCurrency(s.owner_cut)}</td>
                    <td className="py-2 pr-4">{formatCurrency(s.total_cost)}</td>
                    <td
                      className={`py-2 pr-4 font-medium ${
                        s.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(s.profit)}
                    </td>
                    <td className="py-2">{formatPercent(s.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
