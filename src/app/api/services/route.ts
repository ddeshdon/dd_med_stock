import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Service, ServiceItem } from "@/lib/types";

export async function GET() {
  const services = db
    .prepare(`SELECT * FROM services ORDER BY name`)
    .all() as Service[];

  const itemsStmt = db.prepare(
    `SELECT si.*, p.name AS product_name, p.unit AS unit, p.avg_cost AS avg_cost
     FROM service_items si JOIN products p ON p.id = si.product_id
     WHERE si.service_id = ?`
  );

  const result = services.map((s) => ({
    ...s,
    items: itemsStmt.all(s.id) as ServiceItem[],
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, default_selling_price, default_consumable_cost, items } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const result = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO services (name, default_selling_price, default_consumable_cost)
           VALUES (?, ?, ?)`
        )
        .run(
          name.trim(),
          Number(default_selling_price) || 0,
          Number(default_consumable_cost) || 0
        );
      const serviceId = info.lastInsertRowid as number;

      if (Array.isArray(items)) {
        const insertItem = db.prepare(
          `INSERT INTO service_items (service_id, product_id, quantity) VALUES (?, ?, ?)`
        );
        for (const item of items) {
          if (item.product_id && Number(item.quantity) > 0) {
            insertItem.run(serviceId, item.product_id, Number(item.quantity));
          }
        }
      }

      return db.prepare(`SELECT * FROM services WHERE id = ?`).get(serviceId);
    })();

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A service with this name already exists" },
      { status: 409 }
    );
  }
}
