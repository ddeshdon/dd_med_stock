import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureDbInitialized();

  try {
    const body = await req.json();
    const sales = Array.isArray(body) ? body : body.sales || [];

    if (!Array.isArray(sales) || sales.length === 0) {
      return NextResponse.json({ error: "No sales data provided" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;

    for (const sale of sales) {
      try {
        const { date, service_name, gross_price, drug_cost, consumable_cost, total_cost, profit, margin } = sale;

        if (!date || !service_name || gross_price === undefined) {
          skipped++;
          continue;
        }

        await db.query(
          `INSERT INTO sales (date, service_name, gross_price, owner_cut, selling_price, consumable_cost, drug_cost, total_cost, profit, margin, patient_name, deduction_type, deduction_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT DO NOTHING`,
          [
            date,
            service_name,
            gross_price,
            0, // owner_cut
            gross_price, // selling_price
            consumable_cost || 150,
            drug_cost || 0,
            total_cost || 0,
            profit || 0,
            margin || 0,
            "", // patient_name (empty)
            "percent", // deduction_type
            0, // deduction_value
          ]
        );
        imported++;
      } catch (error: any) {
        console.error("Error importing sale:", error?.message);
        skipped++;
      }
    }

    return NextResponse.json(
      {
        message: "Import completed",
        imported,
        skipped,
        total: sales.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
