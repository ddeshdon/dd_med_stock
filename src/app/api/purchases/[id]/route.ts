import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Purchase } from "@/lib/types";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const purchase = db
    .prepare(`SELECT * FROM purchases WHERE id = ?`)
    .get(id) as Purchase | undefined;
  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  db.transaction(() => {
    const product = db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(purchase.product_id) as Product;
    if (product) {
      const newStock = Math.max(0, product.stock_qty - purchase.quantity);
      db.prepare(`UPDATE products SET stock_qty = ? WHERE id = ?`).run(
        newStock,
        product.id
      );
    }
    db.prepare(`DELETE FROM purchases WHERE id = ?`).run(id);
  })();

  return NextResponse.json({ ok: true });
}
