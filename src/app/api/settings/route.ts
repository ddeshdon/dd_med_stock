import { NextRequest, NextResponse } from "next/server";
import db, { ensureDbInitialized } from "@/lib/db";

async function getSettings() {
  try {
    const result = await db.query(`SELECT key, value FROM settings`);
    const map: Record<string, string> = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }
    return {
      default_deduction_type: map.default_deduction_type || "percent",
      default_deduction_value: Number(map.default_deduction_value) || 0,
      owner_label: map.owner_label || "Owner's Cut",
    };
  } catch (error) {
    console.error("GET settings error:", error);
    throw error;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDbInitialized();
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {  await ensureDbInitialized();  const body = await req.json();

  try {
    if (body.default_deduction_type !== undefined) {
      await db.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
        ["default_deduction_type", String(body.default_deduction_type)]
      );
    }
    if (body.default_deduction_value !== undefined) {
      await db.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
        ["default_deduction_value", String(Number(body.default_deduction_value) || 0)]
      );
    }
    if (body.owner_label !== undefined) {
      await db.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
        ["owner_label", String(body.owner_label)]
      );
    }

    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("PATCH settings error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
