import { NextResponse } from "next/server";
import db from "@/lib/db";

interface NumberedSaleRow {
  id: number;
  date: string;
  service_name: string;
  patient_name: string;
  gross_price: number;
  owner_cut: number;
  selling_price: number;
  profit: number;
  visit_number: number;
}

export async function GET() {
  const rows = db
    .prepare(
      `SELECT id, date, service_name, patient_name, gross_price, owner_cut, selling_price, profit,
        ROW_NUMBER() OVER (
          PARTITION BY lower(trim(patient_name)), service_name
          ORDER BY date, id
        ) AS visit_number
       FROM sales
       WHERE trim(patient_name) != ''
       ORDER BY date, id`
    )
    .all() as NumberedSaleRow[];

  const byKey = new Map<
    string,
    { name: string; visits: NumberedSaleRow[] }
  >();

  for (const row of rows) {
    const key = row.patient_name.trim().toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.visits.push(row);
      // Keep the most recently-typed spelling/casing as the display name.
      existing.name = row.patient_name.trim();
    } else {
      byKey.set(key, { name: row.patient_name.trim(), visits: [row] });
    }
  }

  const patients = Array.from(byKey.values()).map(({ name, visits }) => {
    const serviceCounts = new Map<string, number>();
    for (const v of visits) {
      serviceCounts.set(v.service_name, (serviceCounts.get(v.service_name) || 0) + 1);
    }
    return {
      name,
      total_visits: visits.length,
      first_visit: visits[0].date,
      last_visit: visits[visits.length - 1].date,
      services: Array.from(serviceCounts.entries()).map(([service_name, count]) => ({
        service_name,
        count,
      })),
      visits: visits
        .map((v) => ({
          id: v.id,
          date: v.date,
          service_name: v.service_name,
          gross_price: v.gross_price,
          owner_cut: v.owner_cut,
          selling_price: v.selling_price,
          profit: v.profit,
          visit_number: v.visit_number,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  });

  return NextResponse.json(patients);
}
