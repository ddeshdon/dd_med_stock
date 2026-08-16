import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product } from "@/lib/types";

export async function GET() {
  const products = db
    .prepare(`SELECT * FROM products ORDER BY category, name`)
    .all() as Product[];
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
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
    const info = db
      .prepare(
        `INSERT INTO products (name, category, unit, stock_qty, avg_cost, reorder_level, package_unit, package_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name.trim(),
        category,
        unit?.trim() || "unit",
        Number(stock_qty) || 0,
        Number(avg_cost) || 0,
        Number(reorder_level) || 0,
        package_unit?.trim() || "",
        Number(package_size) || 1
      );
    const product = db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(info.lastInsertRowid) as Product;
    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A product with this name already exists" },
      { status: 409 }
    );
  }
}
