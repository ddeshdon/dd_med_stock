import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";
import { Product } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDbInitialized();
  const { id } = await params;
  const body = await req.json();
  
  try {
    const result = await db.query(`SELECT * FROM products WHERE id = $1`, [id]);
    const existing = result.rows[0] as Product | undefined;
    
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const name = body.name?.trim() ?? existing.name;
    const category = body.category ?? existing.category;
    const unit = body.unit?.trim() ?? existing.unit;
    const reorder_level =
      body.reorder_level !== undefined
        ? Number(body.reorder_level)
        : existing.reorder_level;
    const stock_qty =
      body.stock_qty !== undefined ? Number(body.stock_qty) : existing.stock_qty;
    const avg_cost =
      body.avg_cost !== undefined ? Number(body.avg_cost) : existing.avg_cost;
    const package_unit =
      body.package_unit !== undefined ? String(body.package_unit).trim() : existing.package_unit;
    const package_size =
      body.package_size !== undefined ? Number(body.package_size) || 1 : existing.package_size;

    try {
      const updated = await db.query(
        `UPDATE products SET name = $1, category = $2, unit = $3, reorder_level = $4, stock_qty = $5, avg_cost = $6, package_unit = $7, package_size = $8 WHERE id = $9 RETURNING *`,
        [name, category, unit, reorder_level, stock_qty, avg_cost, package_unit, package_size, id]
      );
      return NextResponse.json(updated.rows[0]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate")) {
        return NextResponse.json(
          { error: "A product with this name already exists" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("PATCH products error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const usedInSalesResult = await db.query(
      `SELECT COUNT(*) AS c FROM sale_items WHERE product_id = $1`,
      [id]
    );
    const usedInSales = parseInt(usedInSalesResult.rows[0]?.c || "0", 10);
    
    const usedInPurchasesResult = await db.query(
      `SELECT COUNT(*) AS c FROM purchases WHERE product_id = $1`,
      [id]
    );
    const usedInPurchases = parseInt(usedInPurchasesResult.rows[0]?.c || "0", 10);
    
    if (usedInSales > 0 || usedInPurchases > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a product that has purchase or sale history. Consider editing it instead.",
        },
        { status: 409 }
      );
    }
    
    await db.query(`DELETE FROM service_items WHERE product_id = $1`, [id]);
    await db.query(`DELETE FROM products WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE products error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
