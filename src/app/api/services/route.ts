import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";
import { Service, ServiceItem } from "@/lib/types";

export async function GET() {
  await ensureDbInitialized();
  try {
    const services = await db.query(`SELECT * FROM services ORDER BY name`);
    const result = await Promise.all(
      services.rows.map(async (s: Service) => {
        const items = await db.query(
          `SELECT si.*, p.name AS product_name, p.unit AS unit, p.avg_cost AS avg_cost
           FROM service_items si JOIN products p ON p.id = si.product_id
           WHERE si.service_id = $1`,
          [s.id]
        );
        return {
          ...s,
          items: items.rows as ServiceItem[],
        };
      })
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET services error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, default_selling_price, default_consumable_cost, items } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const serviceResult = await client.query(
        `INSERT INTO services (name, default_selling_price, default_consumable_cost)
         VALUES ($1, $2, $3) RETURNING *`,
        [name.trim(), Number(default_selling_price) || 0, Number(default_consumable_cost) || 0]
      );
      const serviceId = serviceResult.rows[0].id;

      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.product_id && Number(item.quantity) > 0) {
            await client.query(
              `INSERT INTO service_items (service_id, product_id, quantity) VALUES ($1, $2, $3)`,
              [serviceId, item.product_id, Number(item.quantity)]
            );
          }
        }
      }

      await client.query("COMMIT");
      return NextResponse.json(serviceResult.rows[0], { status: 201 });
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
    console.error("POST services error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
