import { Pool, PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __medStockDbPool: Pool | null | undefined;
  var __medStockDbInitialized: boolean;
}

// Lazy pool initialization
let poolInstance: Pool | null = null;
let initPromise: Promise<boolean> | null = null;
let hasAttemptedInit = false;

async function getOrCreatePool(): Promise<Pool | null> {
  // If we've already attempted init and failed with a network error, return null
  if (hasAttemptedInit && poolInstance === null) {
    return null;
  }

  // If pool already exists, return it
  if (poolInstance) {
    return poolInstance;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return poolInstance;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not configured");
        hasAttemptedInit = true;
        return false;
      }

      poolInstance = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
        // Add connection timeouts
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 20,
        statement_timeout: 30000,
      });

      // Test the connection
      const client = await Promise.race([
        poolInstance.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000)),
      ]);
      client.release();

      hasAttemptedInit = true;
      return true;
    } catch (error: any) {
      console.warn("⚠️  Database connection failed:");
      console.warn("  Error Code:", error?.code);
      console.warn("  Error Message:", error?.message);
      console.warn("  Error:", error);
      poolInstance = null;
      hasAttemptedInit = true;

      // Network errors are expected during build/startup
      if (
        error?.code === "ENETUNREACH" ||
        error?.code === "ENOTFOUND" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "EHOSTUNREACH"
      ) {
        return false;
      }

      // Other errors should be logged
      return false;
    }
  })();

  await initPromise;
  initPromise = null;
  return poolInstance;
}

// Main query function with error handling
async function query(sql: string, params?: any[]) {
  const pool = await getOrCreatePool();

  if (!pool) {
    // Database unavailable - return empty results instead of throwing
    console.warn("Database query attempted but pool is unavailable:", sql.substring(0, 50));
    return { rows: [] };
  }

  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error: any) {
    // Network errors during queries indicate database went down
    if (
      error?.code === "ENETUNREACH" ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED" ||
      error?.code === "EHOSTUNREACH"
    ) {
      console.warn("Database query failed - connection lost:", error?.code);
      poolInstance = null; // Reset pool so next query tries to reconnect
      return { rows: [] }; // Return empty results
    }

    // Other errors should be thrown
    throw error;
  }
}

// Connect for transactions
async function connect() {
  const pool = await getOrCreatePool();

  if (!pool) {
    throw new Error("Database is not available");
  }

  return pool.connect();
}

// Ensure database is initialized (called by API routes)
async function ensureDbInitialized() {
  const pool = await getOrCreatePool();

  if (!pool) {
    // Database is not available - this is normal during build or startup
    console.warn("ensureDbInitialized: pool not available");
    return;
  }

  console.log("ensureDbInitialized: running migrations...");
  
  // Run migrations only if pool is available
  try {
    await migrate();
    console.log("ensureDbInitialized: migrations completed");
    await seedIfEmpty();
    console.log("ensureDbInitialized: seeding completed");
  } catch (error: any) {
    // If migrations fail due to network, that's OK - will retry next time
    if (
      error?.code === "ENETUNREACH" ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED" ||
      error?.code === "EHOSTUNREACH"
    ) {
      console.warn("Database migrations skipped - connection unavailable");
      return;
    }
    // Other errors should be logged but not thrown
    console.error("Database migration error:", error?.message);
    throw error;
  }
}

// Migration function
async function migrate() {
  const pool = await getOrCreatePool();
  if (!pool) {
    console.warn("migrate: pool not available");
    return;
  }

  console.log("migrate: starting...");
  const sql = `
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('drug', 'consumable')),
      unit TEXT NOT NULL,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      avg_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 0,
      package_unit TEXT,
      package_size INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      default_price NUMERIC(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER,
      service_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL,
      gross_price NUMERIC(10,2) NOT NULL,
      owner_cut NUMERIC(10,2) NOT NULL,
      total_cost NUMERIC(10,2) NOT NULL,
      profit NUMERIC(10,2) NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      quantity_purchased INTEGER NOT NULL,
      cost_per_unit NUMERIC(10,2) NOT NULL,
      total_cost NUMERIC(10,2) NOT NULL,
      purchase_date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS service_items (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_used INTEGER NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_used INTEGER NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    ALTER TABLE services ADD COLUMN IF NOT EXISTS default_selling_price NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE services ADD COLUMN IF NOT EXISTS default_consumable_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE services ALTER COLUMN default_price SET DEFAULT 0;

    ALTER TABLE sales ADD COLUMN IF NOT EXISTS service_id INTEGER;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS deduction_type TEXT NOT NULL DEFAULT 'percent';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS deduction_value NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS consumable_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS drug_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS patient_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE sales ALTER COLUMN quantity SET DEFAULT 1;
    ALTER TABLE sales ALTER COLUMN unit_price SET DEFAULT 0;

    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE purchases ALTER COLUMN quantity_purchased SET DEFAULT 0;
    ALTER TABLE purchases ALTER COLUMN cost_per_unit SET DEFAULT 0;
    ALTER TABLE purchases ALTER COLUMN total_cost SET DEFAULT 0;
    ALTER TABLE purchases ALTER COLUMN purchase_date SET DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');

    ALTER TABLE service_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE service_items ALTER COLUMN quantity_used SET DEFAULT 0;

    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
    ALTER TABLE sale_items ALTER COLUMN quantity_used SET DEFAULT 0;
  `;

  try {
    const client = await pool.connect();
    try {
      // Execute each statement separately to handle multiple creates
      const statements = sql.split(";").filter((s) => s.trim());
      console.log(`migrate: executing ${statements.length} statements`);
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }
      console.log("migrate: all tables created successfully");
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (
      error?.code === "ENETUNREACH" ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED"
    ) {
      console.warn("Migration skipped - database unavailable");
      return;
    }
    console.error("Migration error:", error?.message, error?.code);
    throw error;
  }
}

// Seed function
async function seedIfEmpty() {
  const pool = await getOrCreatePool();
  if (!pool) return;

  try {
    const result = await query("SELECT COUNT(*) as count FROM products");
    const productsExist = result.rows.length > 0 && result.rows[0]?.count > 0;

    if (!productsExist) {
      // Seed initial products if empty
      const products = [
        ["Amoxicillin 500mg", "drug", "tablet", 100, 0.25, 20, "box", 20],
        ["Metformin 500mg", "drug", "tablet", 80, 0.15, 15, "box", 20],
        ["Paracetamol 500mg", "drug", "tablet", 150, 0.05, 30, "box", 100],
        ["Ibuprofen 400mg", "drug", "tablet", 90, 0.08, 20, "box", 50],
        ["Antibiotic Cream", "drug", "tube", 30, 2.5, 10, "box", 12],
        ["Sterile Gauze", "consumable", "pad", 200, 0.1, 50, "box", 100],
        ["Disposable Gloves", "consumable", "pair", 500, 0.02, 100, "box", 1000],
        ["Adhesive Bandage", "consumable", "piece", 300, 0.01, 50, "box", 100],
        ["Thermometer", "consumable", "unit", 10, 5.0, 3, "box", 10],
        ["Blood Pressure Monitor", "consumable", "unit", 5, 25.0, 2, "box", 5],
        ["Syringe 5ml", "consumable", "piece", 200, 0.15, 50, "box", 100],
        ["Needle 25G", "consumable", "piece", 500, 0.05, 100, "box", 1000],
        ["Cotton Swabs", "consumable", "pack", 50, 1.0, 10, "box", 50],
        ["Hand Sanitizer", "consumable", "bottle", 30, 2.0, 10, "box", 12],
        ["Mask N95", "consumable", "piece", 100, 0.5, 20, "box", 50],
      ];

      for (const [name, category, unit, stock, cost, reorder, pkgUnit, pkgSize] of products) {
        await query(
          "INSERT INTO products (name, category, unit, stock_qty, avg_cost, reorder_level, package_unit, package_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING",
          [name, category, unit, stock, cost, reorder, pkgUnit, pkgSize]
        );
      }
    }

    // Always seed services (they may be empty even if products exist)
    // First, delete old services
    const oldServiceNames = [
      "Basic Consultation",
      "Blood Draw",
      "Injection Administration",
      "Wound Care",
      "Blood Pressure Check",
      "Temperature Check",
      "Prescription Refill",
      "Lab Test Analysis",
      "Follow-up Consultation",
      "Emergency Visit",
    ];
    
    for (const serviceName of oldServiceNames) {
      await query("DELETE FROM services WHERE name = $1", [serviceName]);
    }

    const services = [
      ["20 u", 1000, 150],
      ["dermaglow", 900, 150],
      ["dermaglow + acne", 1100, 150],
      ["dermglow", 900, 150],
      ["mesofat", 900, 150],
      ["nabota 50 อย", 2200, 150],
      ["nabota 50 repack", 1900, 150],
      ["nabota 100 อย", 4500, 150],
      ["nabota 100 repack", 4400, 150],
      ["nabota 200 อย", 9000, 150],
      ["piko", 3000, 150],
      ["scar", 600, 150],
    ];

    for (const [name, sellingPrice, consumableCost] of services) {
      await query(
        "INSERT INTO services (name, default_price, default_selling_price, default_consumable_cost) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET default_price = $2, default_selling_price = $3, default_consumable_cost = $4",
        [name, sellingPrice, sellingPrice, consumableCost]
      );
    }
  } catch (error: any) {
    if (
      error?.code === "ENETUNREACH" ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED"
    ) {
      console.warn("Seed skipped - database unavailable");
      return;
    }
    console.error("Seed error:", error?.message);
  }
}

export default {
  query,
  connect,
};

export { ensureDbInitialized };
