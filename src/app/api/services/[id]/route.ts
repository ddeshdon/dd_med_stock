import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const existing = db.prepare(`SELECT * FROM services WHERE id = ?`).get(id) as
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
    db.transaction(() => {
      db.prepare(
        `UPDATE services SET name = ?, default_selling_price = ?, default_consumable_cost = ? WHERE id = ?`
      ).run(name, default_selling_price, default_consumable_cost, id);

      if (Array.isArray(body.items)) {
        db.prepare(`DELETE FROM service_items WHERE service_id = ?`).run(id);
        const insertItem = db.prepare(
          `INSERT INTO service_items (service_id, product_id, quantity) VALUES (?, ?, ?)`
        );
        for (const item of body.items) {
          if (item.product_id && Number(item.quantity) > 0) {
            insertItem.run(id, item.product_id, Number(item.quantity));
          }
        }
      }
    })();

    const updated = db.prepare(`SELECT * FROM services WHERE id = ?`).get(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "A service with this name already exists" },
      { status: 409 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.prepare(`UPDATE sales SET service_id = NULL WHERE service_id = ?`).run(id);
  db.prepare(`DELETE FROM service_items WHERE service_id = ?`).run(id);
  db.prepare(`DELETE FROM services WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
