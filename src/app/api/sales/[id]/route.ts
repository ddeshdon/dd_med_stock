import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Sale, SaleItem } from "@/lib/types";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(id) as
    | Sale
    | undefined;
  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  db.transaction(() => {
    const items = db
      .prepare(`SELECT * FROM sale_items WHERE sale_id = ?`)
      .all(id) as SaleItem[];
    for (const item of items) {
      if (item.product_id) {
        const product = db
          .prepare(`SELECT * FROM products WHERE id = ?`)
          .get(item.product_id) as Product | undefined;
        if (product) {
          db.prepare(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?`).run(
            item.quantity,
            product.id
          );
        }
      }
    }
    db.prepare(`DELETE FROM sales WHERE id = ?`).run(id);
  })();

  return NextResponse.json({ ok: true });
}
