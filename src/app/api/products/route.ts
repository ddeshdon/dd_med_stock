import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";
import { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDbInitialized();
    const result = await db.query(`SELECT * FROM products ORDER BY category, name`);
    return NextResponse.json(result.rows as Product[]);
  } catch (error) {
    console.error("GET products error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDbInitialized();
  const body = await req.json();
  const { name, category, unit, reorder_level, stock_qty, avg_cost, package_unit, package_size } =
    body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (category !== "drug" && category !== "consumable") {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  try {
    const result = await db.query(
      `INSERT INTO products (name, category, unit, stock_qty, avg_cost, reorder_level, package_unit, package_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name.trim(),
        category,
        unit?.trim() || "unit",
        Number(stock_qty) || 0,
        Number(avg_cost) || 0,
        Number(reorder_level) || 0,
        package_unit?.trim() || "",
        Number(package_size) || 1,
      ]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A product with this name already exists" },
        { status: 409 }
      );
    }
    console.error("POST products error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
