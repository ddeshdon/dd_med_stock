import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDbInitialized();
  const { id } = await params;
  const body = await req.json();
  
  try {
    const existingResult = await db.query(`SELECT * FROM services WHERE id = $1`, [id]);
    const existing = existingResult.rows[0] as
      | { name: string; default_selling_price: number; default_consumable_cost: number }
      | undefined;
    
    if (!existing) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const name = body.name?.trim() ?? existing.name;
    const default_selling_price =
      body.default_selling_price !== undefined
        ? Number(body.default_selling_price)
        : existing.default_selling_price;
    const default_consumable_cost =
      body.default_consumable_cost !== undefined
        ? Number(body.default_consumable_cost)
        : existing.default_consumable_cost;

    try {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        
        await client.query(
          `UPDATE services SET name = $1, default_selling_price = $2, default_consumable_cost = $3 WHERE id = $4`,
          [name, default_selling_price, default_consumable_cost, id]
        );

        if (Array.isArray(body.items)) {
          await client.query(`DELETE FROM service_items WHERE service_id = $1`, [id]);
          for (const item of body.items) {
            if (item.product_id && Number(item.quantity) > 0) {
              await client.query(
                `INSERT INTO service_items (service_id, product_id, quantity) VALUES ($1, $2, $3)`,
                [id, item.product_id, Number(item.quantity)]
              );
            }
          }
        }

        await client.query("COMMIT");
        
        const updated = await db.query(`SELECT * FROM services WHERE id = $1`, [id]);
        return NextResponse.json(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate")) {
        return NextResponse.json(
          { error: "A service with this name already exists" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("PATCH services error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await db.query(`UPDATE sales SET service_id = NULL WHERE service_id = $1`, [id]);
    await db.query(`DELETE FROM service_items WHERE service_id = $1`, [id]);
    await db.query(`DELETE FROM services WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE services error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
