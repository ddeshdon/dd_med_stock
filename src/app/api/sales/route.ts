import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Product, Sale, SaleItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 200;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const patient = searchParams.get("patient");
  const serviceName = searchParams.get("service_name");

  // Visit number is computed across ALL sales first (so it's always accurate),
  // then date/patient/service filters are applied on top.
  let query = `
    WITH numbered AS (
      SELECT *,
        CASE WHEN trim(patient_name) != '' THEN
          ROW_NUMBER() OVER (
            PARTITION BY lower(trim(patient_name)), service_name
            ORDER BY date, id
          )
        ELSE NULL END AS visit_number
      FROM sales
    )
    SELECT * FROM numbered
  `;
  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (from) {
    conditions.push("date >= ?");
    args.push(from);
  }
  if (to) {
    conditions.push("date <= ?");
    args.push(to);
  }
  if (patient) {
    conditions.push("lower(trim(patient_name)) = lower(trim(?))");
    args.push(patient);
  }
  if (serviceName) {
    conditions.push("service_name = ?");
    args.push(serviceName);
  }
  if (conditions.length) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY date DESC, id DESC LIMIT ?`;
  args.push(limit);

  const sales = db.prepare(query).all(...args) as Sale[];
  const itemsStmt = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`);
  const withItems = sales.map((s) => ({
    ...s,
    items: itemsStmt.all(s.id) as SaleItem[],
  }));

  return NextResponse.json(withItems);
}

interface SaleItemBody {
  product_id: number;
  quantity: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    date,
    service_id,
    service_name,
    patient_name,
    gross_price,
    deduction_type,
    deduction_value,
    consumable_cost,
    note,
    items,
  } = body as {
    date: string;
    service_id: number | null;
    service_name: string;
    patient_name?: string;
    gross_price: number;
    deduction_type: "percent" | "fixed";
    deduction_value: number;
    consumable_cost: number;
    note?: string;
    items: SaleItemBody[];
  };

  if (!date || !service_name || !service_name.trim()) {
    return NextResponse.json(
      { error: "date and service_name are required" },
      { status: 400 }
    );
  }
  const grossPrice = Number(gross_price);
  if (isNaN(grossPrice) || grossPrice < 0) {
    return NextResponse.json(
      { error: "gross_price must be a non-negative number" },
      { status: 400 }
    );
  }
  const deductionType: "percent" | "fixed" = deduction_type === "fixed" ? "fixed" : "percent";
  const deductionValue = Math.max(0, Number(deduction_value) || 0);
  const ownerCut =
    deductionType === "percent"
      ? (grossPrice * deductionValue) / 100
      : Math.min(deductionValue, grossPrice);
  const sellingPrice = grossPrice - ownerCut;
  const consumableCost = Number(consumable_cost) || 0;
  const lineItems = Array.isArray(items) ? items : [];

  // Validate stock availability before committing.
  for (const item of lineItems) {
    const qty = Number(item.quantity);
    if (!item.product_id || !qty || qty <= 0) {
      return NextResponse.json(
        { error: "Each sale item needs a product and a positive quantity" },
        { status: 400 }
      );
    }
    const product = db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(item.product_id) as Product | undefined;
    if (!product) {
      return NextResponse.json(
        { error: `Product ${item.product_id} not found` },
        { status: 404 }
      );
    }
    if (product.stock_qty < qty) {
      return NextResponse.json(
        {
          error: `Not enough stock for "${product.name}". Available: ${product.stock_qty} ${product.unit}, requested: ${qty}.`,
        },
        { status: 409 }
      );
    }
  }

  const result = db.transaction(() => {
    let drugCost = 0;
    const resolvedItems: {
      product_id: number;
      product_name: string;
      quantity: number;
      unit_cost: number;
      line_cost: number;
    }[] = [];

    for (const item of lineItems) {
      const qty = Number(item.quantity);
      const product = db
        .prepare(`SELECT * FROM products WHERE id = ?`)
        .get(item.product_id) as Product;
      const lineCost = qty * product.avg_cost;
      drugCost += lineCost;
      resolvedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_cost: product.avg_cost,
        line_cost: lineCost,
      });
      db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`).run(
        qty,
        product.id
      );
    }

    const totalCost = drugCost + consumableCost;
    const profit = sellingPrice - totalCost;
    const margin = grossPrice > 0 ? profit / grossPrice : 0;

    const info = db
      .prepare(
        `INSERT INTO sales (date, service_id, service_name, gross_price, deduction_type, deduction_value, owner_cut, selling_price, consumable_cost, drug_cost, total_cost, profit, margin, patient_name, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        date,
        service_id || null,
        service_name.trim(),
        grossPrice,
        deductionType,
        deductionValue,
        ownerCut,
        sellingPrice,
        consumableCost,
        drugCost,
        totalCost,
        profit,
        margin,
        patient_name?.trim() || "",
        note?.trim() || null
      );
    const saleId = info.lastInsertRowid as number;

    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_cost, line_cost)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const ri of resolvedItems) {
      insertItem.run(
        saleId,
        ri.product_id,
        ri.product_name,
        ri.quantity,
        ri.unit_cost,
        ri.line_cost
      );
    }

    const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as Sale;
    const saleItems = db
      .prepare(`SELECT * FROM sale_items WHERE sale_id = ?`)
      .all(saleId) as SaleItem[];
    return { ...sale, items: saleItems };
  })();

  return NextResponse.json(result, { status: 201 });
}
