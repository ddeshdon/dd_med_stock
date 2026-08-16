import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";
import { Product, Sale, SaleItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 200;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const patient = searchParams.get("patient");
  const serviceName = searchParams.get("service_name");

  try {
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
    let paramCount = 1;

    if (from) {
      conditions.push(`date >= $${paramCount}`);
      args.push(from);
      paramCount++;
    }
    if (to) {
      conditions.push(`date <= $${paramCount}`);
      args.push(to);
      paramCount++;
    }
    if (patient) {
      conditions.push(`lower(trim(patient_name)) = lower(trim($${paramCount}))`);
      args.push(patient);
      paramCount++;
    }
    if (serviceName) {
      conditions.push(`service_name = $${paramCount}`);
      args.push(serviceName);
      paramCount++;
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += ` ORDER BY date DESC, id DESC LIMIT $${paramCount}`;
    args.push(limit);

    const result = await db.query(query, args);
    const sales = result.rows as Sale[];

    const withItems = await Promise.all(
      sales.map(async (s) => {
        const itemsResult = await db.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [s.id]);
        return {
          ...s,
          items: itemsResult.rows as SaleItem[],
        };
      })
    );

    return NextResponse.json(withItems);
  } catch (error) {
    console.error("GET sales error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

interface SaleItemBody {
  product_id: number;
  quantity: number;
}

export async function POST(req: NextRequest) {
  await ensureDbInitialized();
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

  try {
    // Validate stock availability before committing.
    for (const item of lineItems) {
      const qty = Number(item.quantity);
      if (!item.product_id || !qty || qty <= 0) {
        return NextResponse.json(
          { error: "Each sale item needs a product and a positive quantity" },
          { status: 400 }
        );
      }
      const productResult = await db.query(`SELECT * FROM products WHERE id = $1`, [item.product_id]);
      const product = productResult.rows[0] as Product | undefined;
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

    const client = await db.connect();
    try {
      await client.query("BEGIN");

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
        const productResult = await client.query(`SELECT * FROM products WHERE id = $1`, [item.product_id]);
        const product = productResult.rows[0] as Product;
        const lineCost = qty * product.avg_cost;
        drugCost += lineCost;
        resolvedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: qty,
          unit_cost: product.avg_cost,
          line_cost: lineCost,
        });
        await client.query(
          `UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2`,
          [qty, product.id]
        );
      }

      const totalCost = drugCost + consumableCost;
      const profit = sellingPrice - totalCost;
      const margin = grossPrice > 0 ? profit / grossPrice : 0;

      const saleResult = await client.query(
        `INSERT INTO sales (date, service_id, service_name, gross_price, deduction_type, deduction_value, owner_cut, selling_price, consumable_cost, drug_cost, total_cost, profit, margin, patient_name, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [
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
          note?.trim() || null,
        ]
      );
      const saleId = saleResult.rows[0].id;

      for (const ri of resolvedItems) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_cost, line_cost)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [saleId, ri.product_id, ri.product_name, ri.quantity, ri.unit_cost, ri.line_cost]
        );
      }

      const saleItems = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId]);
      
      await client.query("COMMIT");
      
      return NextResponse.json(
        { ...saleResult.rows[0], items: saleItems.rows },
        { status: 201 }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST sales error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
