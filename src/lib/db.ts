import { Pool, PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __medStockDb: Pool | undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Reuse the connection pool across hot-reloads in dev.
const db = global.__medStockDb ?? pool;
if (process.env.NODE_ENV !== "production") {
  global.__medStockDb = db;
}

// Helper to run migrations
async function executeQuery(sql: string) {
  try {
    const client = await db.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  } catch (error: any) {
    // Silently fail if database not available (e.g., during build)
    if (error?.code === "ENETUNREACH" || error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
      console.warn("Database not available during initialization - will retry at runtime");
      return;
    }
    throw error;
  }
}

async function migrate() {
  try {
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('drug','consumable')),
      unit TEXT NOT NULL DEFAULT 'unit',
      stock_qty REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 0,
      package_unit TEXT NOT NULL DEFAULT '',
      package_size REAL NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      shipping_fee REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL,
      paid INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      default_selling_price REAL NOT NULL DEFAULT 0,
      default_consumable_cost REAL NOT NULL DEFAULT 150,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS service_items (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      service_name TEXT NOT NULL,
      gross_price REAL NOT NULL DEFAULT 0,
      deduction_type TEXT NOT NULL DEFAULT 'percent',
      deduction_value REAL NOT NULL DEFAULT 0,
      owner_cut REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL,
      consumable_cost REAL NOT NULL DEFAULT 0,
      drug_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL DEFAULT 0,
      margin REAL NOT NULL DEFAULT 0,
      patient_name TEXT NOT NULL DEFAULT '',
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      line_cost REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
  `);

  // Backfill gross_price for any pre-existing rows
  await db.query(`UPDATE sales SET gross_price = selling_price WHERE gross_price = 0`);

  // Set default settings
  const settingsDefaults: Record<string, string> = {
    default_deduction_type: "percent",
    default_deduction_value: "0",
    owner_label: "Owner's Cut",
  };
  
  for (const [key, value] of Object.entries(settingsDefaults)) {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [key, value]
    );
  }
  } catch (error: any) {
    // Silently fail if database not available (e.g., during build)
    if (error?.code === "ENETUNREACH" || error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
      console.warn("Database not available during initialization - will retry at runtime");
      return;
    }
    throw error;
  }
}

// Only run migrations at runtime, not during build
if (process.env.NODE_ENV !== "development" || !process.env.VERCEL_ENV) {
  migrate().catch(err => {
    if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production") {
      console.warn("Database not available during build - will initialize at runtime");
    } else {
      console.error("Migration error:", err);
    }
  });
}

async function seedIfEmpty() {
  try {
    const result = await db.query("SELECT COUNT(*) AS c FROM products");
    const productCount = parseInt(result.rows[0]?.c || "0", 10);
    if (productCount > 0) return;

    const products = [
      { name: "Nabota (Repack) - unit", category: "drug", unit: "unit", stock_qty: 100, avg_cost: 22, reorder_level: 30, package_unit: "", package_size: 1 },
      { name: "Nabota (Authentic/อย) - unit", category: "drug", unit: "unit", stock_qty: 100, avg_cost: 33.5, reorder_level: 30, package_unit: "", package_size: 1 },
      { name: "Piko", category: "drug", unit: "cc", stock_qty: 10, avg_cost: 96, reorder_level: 5, package_unit: "vial", package_size: 5 },
      { name: "Dermaglow", category: "drug", unit: "cc", stock_qty: 10, avg_cost: 74, reorder_level: 5, package_unit: "vial", package_size: 5 },
      { name: "Mesofat", category: "drug", unit: "vial", stock_qty: 2, avg_cost: 480, reorder_level: 1, package_unit: "", package_size: 1 },
      { name: "Lipo V", category: "drug", unit: "vial", stock_qty: 1, avg_cost: 483, reorder_level: 0, package_unit: "", package_size: 1 },
      { name: "Steroid", category: "drug", unit: "vial", stock_qty: 2, avg_cost: 105, reorder_level: 1, package_unit: "", package_size: 1 },
      { name: "ยาชา (Numbing cream)", category: "drug", unit: "tube", stock_qty: 2, avg_cost: 1150, reorder_level: 1, package_unit: "", package_size: 1 },
      { name: "Needle 18G", category: "consumable", unit: "pcs", stock_qty: 20, avg_cost: 250, reorder_level: 10, package_unit: "", package_size: 1 },
      { name: "Needle 30G", category: "consumable", unit: "pcs", stock_qty: 20, avg_cost: 150, reorder_level: 10, package_unit: "", package_size: 1 },
      { name: "Needle 32G", category: "consumable", unit: "pcs", stock_qty: 20, avg_cost: 1000, reorder_level: 10, package_unit: "", package_size: 1 },
      { name: "Syringe", category: "consumable", unit: "pcs", stock_qty: 20, avg_cost: 250, reorder_level: 10, package_unit: "", package_size: 1 },
      { name: "Cotton", category: "consumable", unit: "pack", stock_qty: 5, avg_cost: 35, reorder_level: 2, package_unit: "", package_size: 1 },
      { name: "NSS (Saline)", category: "consumable", unit: "bottle", stock_qty: 2, avg_cost: 700, reorder_level: 1, package_unit: "", package_size: 1 },
      { name: "Gloves", category: "consumable", unit: "box", stock_qty: 2, avg_cost: 210, reorder_level: 1, package_unit: "", package_size: 1 },
    ];

    const productIds: Record<string, number> = {};
    for (const p of products) {
      const result = await db.query(
        `INSERT INTO products (name, category, unit, stock_qty, avg_cost, reorder_level, package_unit, package_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [p.name, p.category, p.unit, p.stock_qty, p.avg_cost, p.reorder_level, p.package_unit, p.package_size]
      );
      productIds[p.name] = result.rows[0].id;
    }

    const services: {
      name: string;
      default_selling_price: number;
      default_consumable_cost: number;
      recipe: { product: string; quantity: number }[];
    }[] = [
      {
        name: "Nabota 20u",
        default_selling_price: 1000,
        default_consumable_cost: 150,
        recipe: [{ product: "Nabota (Repack) - unit", quantity: 20 }],
      },
      {
        name: "Nabota 50u",
        default_selling_price: 2200,
        default_consumable_cost: 150,
        recipe: [{ product: "Nabota (Repack) - unit", quantity: 50 }],
      },
      {
        name: "Nabota 100u",
        default_selling_price: 4400,
        default_consumable_cost: 150,
        recipe: [{ product: "Nabota (Repack) - unit", quantity: 100 }],
      },
      {
        name: "Nabota 200u",
        default_selling_price: 9000,
        default_consumable_cost: 100,
        recipe: [{ product: "Nabota (Authentic/อย) - unit", quantity: 200 }],
      },
      {
        name: "Piko",
        default_selling_price: 1400,
        default_consumable_cost: 150,
        recipe: [{ product: "Piko", quantity: 2 }],
      },
      {
        name: "Dermaglow",
        default_selling_price: 900,
        default_consumable_cost: 150,
        recipe: [{ product: "Dermaglow", quantity: 2 }],
      },
      {
        name: "Dermaglow + Acne",
        default_selling_price: 1100,
        default_consumable_cost: 150,
        recipe: [{ product: "Dermaglow", quantity: 2 }],
      },
      {
        name: "Mesofat",
        default_selling_price: 1900,
        default_consumable_cost: 150,
        recipe: [{ product: "Mesofat", quantity: 1 }],
      },
      {
        name: "Lipo V",
        default_selling_price: 2900,
        default_consumable_cost: 150,
        recipe: [{ product: "Lipo V", quantity: 1 }],
      },
      {
        name: "Scar Treatment",
        default_selling_price: 600,
        default_consumable_cost: 150,
        recipe: [{ product: "Steroid", quantity: 1 }],
      },
    ];

    for (const s of services) {
      const serviceResult = await db.query(
        `INSERT INTO services (name, default_selling_price, default_consumable_cost)
         VALUES ($1, $2, $3) RETURNING id`,
        [s.name, s.default_selling_price, s.default_consumable_cost]
      );
      const serviceId = serviceResult.rows[0].id;
      for (const item of s.recipe) {
        const productId = productIds[item.product];
        if (productId) {
          await db.query(
            `INSERT INTO service_items (service_id, product_id, quantity) VALUES ($1, $2, $3)`,
            [serviceId, productId, item.quantity]
          );
        }
      }
    }
  } catch (err: any) {
    // Silently fail if database not available during build
    if (err?.code === "ENETUNREACH" || err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED") {
      console.warn("Database not available during initialization - will retry at runtime");
      return;
    }
    console.error("Seed error:", err);
  }
}

seedIfEmpty().catch(err => {
  if (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production") {
    console.warn("Seed skipped during build - will initialize at runtime");
  } else {
    console.error("Seed failed:", err);
  }
});

export default db;
export { Pool };
