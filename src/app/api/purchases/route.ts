import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Purchase } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 200;
  
  try {
    const result = await db.query(
      `SELECT p.*, pr.name AS product_name, pr.unit AS unit
       FROM purchases p
       JOIN products pr ON pr.id = p.product_id
       ORDER BY p.date DESC, p.id DESC
       LIMIT $1`,
      [limit]
    );
    return NextResponse.json(result.rows as Purchase[]);
  } catch (error) {
    console.error("GET purchases error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { product_id, date, quantity, unit_price, shipping_fee, paid, note } = body;

  const qty = Number(quantity);
  const price = Number(unit_price);
  const shipping = Number(shipping_fee) || 0;

  if (!product_id || !date || !qty || qty <= 0 || price < 0) {
    return NextResponse.json(
      { error: "product_id, date, a positive quantity and unit_price are required" },
      { status: 400 }
    );
  }

  try {
    const productResult = await db.query(`SELECT * FROM products WHERE id = $1`, [product_id]);
    const product = productResult.rows[0] as Product | undefined;
    
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const totalPrice = qty * price + shipping;

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const insertResult = await client.query(
        `INSERT INTO purchases (product_id, date, quantity, unit_price, shipping_fee, total_price, paid, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [product_id, date, qty, price, shipping, totalPrice, paid === false ? 0 : 1, note?.trim() || null]
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

      await client.query(
        `UPDATE products SET stock_qty = $1, avg_cost = $2 WHERE id = $3`,
        [newStock, newAvgCost, product_id]
      );

      await client.query("COMMIT");
      
      const purchaseId = insertResult.rows[0].id;
      const resultQuery = await db.query(
        `SELECT p.*, pr.name AS product_name, pr.unit AS unit
         FROM purchases p JOIN products pr ON pr.id = p.product_id WHERE p.id = $1`,
        [purchaseId]
      );
      
      return NextResponse.json(resultQuery.rows[0], { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST purchases error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
