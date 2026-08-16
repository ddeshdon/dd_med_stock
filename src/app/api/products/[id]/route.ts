import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const existing = db
    .prepare(`SELECT * FROM products WHERE id = ?`)
    .get(id) as Product | undefined;
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
    db.prepare(
      `UPDATE products SET name = ?, category = ?, unit = ?, reorder_level = ?, stock_qty = ?, avg_cost = ?, package_unit = ?, package_size = ? WHERE id = ?`
    ).run(name, category, unit, reorder_level, stock_qty, avg_cost, package_unit, package_size, id);
    const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "A product with this name already exists" },
      { status: 409 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const usedInSales = (
    db.prepare(`SELECT COUNT(*) AS c FROM sale_items WHERE product_id = ?`).get(id) as {
      c: number;
    }
  ).c;
  const usedInPurchases = (
    db.prepare(`SELECT COUNT(*) AS c FROM purchases WHERE product_id = ?`).get(id) as {
      c: number;
    }
  ).c;
  if (usedInSales > 0 || usedInPurchases > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a product that has purchase or sale history. Consider editing it instead.",
      },
      { status: 409 }
    );
  }
  db.prepare(`DELETE FROM service_items WHERE product_id = ?`).run(id);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
