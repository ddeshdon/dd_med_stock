import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Sale, SaleItem } from "@/lib/types";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const saleResult = await db.query(`SELECT * FROM sales WHERE id = $1`, [id]);
    const sale = saleResult.rows[0] as Sale | undefined;
    
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const itemsResult = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [id]);
      const items = itemsResult.rows as SaleItem[];
      
      for (const item of items) {
        if (item.product_id) {
          const productResult = await client.query(`SELECT * FROM products WHERE id = $1`, [item.product_id]);
          const product = productResult.rows[0] as Product | undefined;
          if (product) {
            await client.query(
              `UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2`,
              [item.quantity, product.id]
            );
          }
        }
      }
      
      await client.query(`DELETE FROM sales WHERE id = $1`, [id]);
      await client.query("COMMIT");
      
      return NextResponse.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE sales error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
