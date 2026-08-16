import { NextResponse } from "next/server";
import db from "@/lib/db";
import { Product } from "@/lib/types";

export async function GET() {
  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', date) AS month,
              SUM(gross_price) AS revenue,
              SUM(owner_cut) AS owner_cut,
              SUM(total_cost) AS cost,
              SUM(profit) AS profit,
              COUNT(*) AS sessions
       FROM sales
       GROUP BY month
       ORDER BY month ASC`
    )
    .all();

  const totals = db
    .prepare(
      `SELECT SUM(gross_price) AS revenue, SUM(owner_cut) AS owner_cut, SUM(total_cost) AS cost, SUM(profit) AS profit, COUNT(*) AS sessions
       FROM sales`
    )
    .get();

  const topServices = db
    .prepare(
      `SELECT service_name, COUNT(*) AS count, SUM(profit) AS profit, SUM(gross_price) AS revenue
       FROM sales
       GROUP BY service_name
       ORDER BY revenue DESC
       LIMIT 8`
    )
    .all();

  const lowStock = db
    .prepare(`SELECT * FROM products WHERE stock_qty <= reorder_level ORDER BY stock_qty ASC`)
    .all() as Product[];

  const recentSales = db
    .prepare(`SELECT * FROM sales ORDER BY date DESC, id DESC LIMIT 5`)
    .all();

  return NextResponse.json({
    monthly,
    totals,
    topServices,
    lowStock,
    recentSales,
  });
}
