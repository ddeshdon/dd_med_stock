import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Purchase } from "@/lib/types";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const purchaseResult = await db.query(`SELECT * FROM purchases WHERE id = $1`, [id]);
    const purchase = purchaseResult.rows[0] as Purchase | undefined;
    
    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const productResult = await client.query(`SELECT * FROM products WHERE id = $1`, [purchase.product_id]);
      const product = productResult.rows[0] as Product | undefined;
      
      if (product) {
        const newStock = Math.max(0, product.stock_qty - purchase.quantity);
        await client.query(
          `UPDATE products SET stock_qty = $1 WHERE id = $2`,
          [newStock, product.id]
        );
      }
      
      await client.query(`DELETE FROM purchases WHERE id = $1`, [id]);
      await client.query("COMMIT");
      
      return NextResponse.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE purchases error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
