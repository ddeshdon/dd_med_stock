import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Purchase } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 200;
  const purchases = db
    .prepare(
      `SELECT p.*, pr.name AS product_name, pr.unit AS unit
       FROM purchases p
       JOIN products pr ON pr.id = p.product_id
       ORDER BY p.date DESC, p.id DESC
       LIMIT ?`
    )
    .all(limit) as Purchase[];
  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { product_id, date, quantity, unit_price, shipping_fee, paid, note } =
    body;

  const qty = Number(quantity);
  const price = Number(unit_price);
  const shipping = Number(shipping_fee) || 0;

  if (!product_id || !date || !qty || qty <= 0 || price < 0) {
    return NextResponse.json(
      { error: "product_id, date, a positive quantity and unit_price are required" },
      { status: 400 }
    );
  }

  const product = db
    .prepare(`SELECT * FROM products WHERE id = ?`)
    .get(product_id) as Product | undefined;
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const totalPrice = qty * price + shipping;

  const result = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO purchases (product_id, date, quantity, unit_price, shipping_fee, total_price, paid, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        product_id,
        date,
        qty,
        price,
        shipping,
        totalPrice,
        paid === false ? 0 : 1,
        note?.trim() || null
      );

    // Weighted-average cost: allocate shipping into the effective unit cost.
    const effectiveUnitCost = totalPrice / qty;
    const oldStock = product.stock_qty;
    const oldAvgCost = product.avg_cost;
    const newStock = oldStock + qty;
    const newAvgCost =
      newStock > 0
        ? (oldStock * oldAvgCost + qty * effectiveUnitCost) / newStock
        : effectiveUnitCost;

    db.prepare(`UPDATE products SET stock_qty = ?, avg_cost = ? WHERE id = ?`).run(
      newStock,
      newAvgCost,
      product_id
    );

    return db
      .prepare(
        `SELECT p.*, pr.name AS product_name, pr.unit AS unit
         FROM purchases p JOIN products pr ON pr.id = p.product_id WHERE p.id = ?`
      )
      .get(info.lastInsertRowid);
  })();

  return NextResponse.json(result, { status: 201 });
}
