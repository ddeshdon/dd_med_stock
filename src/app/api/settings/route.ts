import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return NextResponse.json({
    default_deduction_type: map.default_deduction_type || "percent",
    default_deduction_value: Number(map.default_deduction_value) || 0,
    owner_label: map.owner_label || "Owner's Cut",
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  if (body.default_deduction_type !== undefined) {
    upsert.run("default_deduction_type", String(body.default_deduction_type));
  }
  if (body.default_deduction_value !== undefined) {
    upsert.run("default_deduction_value", String(Number(body.default_deduction_value) || 0));
  }
  if (body.owner_label !== undefined) {
    upsert.run("owner_label", String(body.owner_label));
  }

  return GET();
}
