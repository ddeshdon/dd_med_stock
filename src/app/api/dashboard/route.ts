import { NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";
import { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDbInitialized();
  try {
    const monthlyResult = await db.query(
      `SELECT TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM') AS month,
              SUM(CAST(gross_price AS NUMERIC)) AS revenue,
              SUM(CAST(owner_cut AS NUMERIC)) AS owner_cut,
              SUM(CAST(total_cost AS NUMERIC)) AS cost,
              SUM(CAST(profit AS NUMERIC)) AS profit,
              COUNT(*) AS sessions
       FROM sales
       GROUP BY month
       ORDER BY month ASC`
    );

    const totalsResult = await db.query(
      `SELECT SUM(CAST(gross_price AS NUMERIC)) AS revenue, 
              SUM(CAST(owner_cut AS NUMERIC)) AS owner_cut, 
              SUM(CAST(total_cost AS NUMERIC)) AS cost, 
              SUM(CAST(profit AS NUMERIC)) AS profit, 
              COUNT(*) AS sessions
       FROM sales`
    );

    const topServicesResult = await db.query(
      `SELECT service_name, COUNT(*) AS count, SUM(CAST(profit AS NUMERIC)) AS profit, SUM(CAST(gross_price AS NUMERIC)) AS revenue
       FROM sales
       GROUP BY service_name
       ORDER BY revenue DESC
       LIMIT 8`
    );

    const lowStockResult = await db.query(
      `SELECT * FROM products WHERE stock_qty <= reorder_level ORDER BY stock_qty ASC`
    );

    const recentSalesResult = await db.query(
      `SELECT * FROM sales ORDER BY date DESC, id DESC LIMIT 5`
    );

    return NextResponse.json({
      monthly: monthlyResult.rows,
      totals: totalsResult.rows[0],
      topServices: topServicesResult.rows,
      lowStock: lowStockResult.rows as Product[],
      recentSales: recentSalesResult.rows,
    });
  } catch (error) {
    console.error("GET dashboard error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
