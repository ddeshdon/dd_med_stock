import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __medStockDb: Database.Database | undefined;
}

function createConnection() {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

// Reuse the connection across hot-reloads in dev.
const db = global.__medStockDb ?? createConnection();
if (process.env.NODE_ENV !== "production") {
  global.__medStockDb = db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('drug','consumable')),
      unit TEXT NOT NULL DEFAULT 'unit',
      stock_qty REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 0,
      package_unit TEXT NOT NULL DEFAULT '',
      package_size REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      shipping_fee REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL,
      paid INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_selling_price REAL NOT NULL DEFAULT 0,
      default_consumable_cost REAL NOT NULL DEFAULT 150,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  // Safe migration for databases created before the owner-cut columns existed.
  const salesColumns = (
    db.prepare(`PRAGMA table_info(sales)`).all() as { name: string }[]
  ).map((c) => c.name);
  const addColumnIfMissing = (name: string, ddl: string) => {
    if (salesColumns.includes(name)) return;
    try {
      db.exec(`ALTER TABLE sales ADD COLUMN ${ddl}`);
    } catch (err) {
      // Another process (e.g. a parallel build worker) may have added it first.
      if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
        throw err;
      }
    }
  };
  addColumnIfMissing("gross_price", "gross_price REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("deduction_type", "deduction_type TEXT NOT NULL DEFAULT 'percent'");
  addColumnIfMissing("deduction_value", "deduction_value REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("owner_cut", "owner_cut REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("patient_name", "patient_name TEXT NOT NULL DEFAULT ''");

  // Backfill gross_price for any pre-existing rows so old sales still display sensibly.
  db.exec(`UPDATE sales SET gross_price = selling_price WHERE gross_price = 0`);

  // Safe migration for the vial/package-to-base-unit conversion columns on products.
  const productColumns = (
    db.prepare(`PRAGMA table_info(products)`).all() as { name: string }[]
  ).map((c) => c.name);
  const addProductColumnIfMissing = (name: string, ddl: string) => {
    if (productColumns.includes(name)) return;
    try {
      db.exec(`ALTER TABLE products ADD COLUMN ${ddl}`);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
        throw err;
      }
    }
  };
  addProductColumnIfMissing("package_unit", "package_unit TEXT NOT NULL DEFAULT ''");
  addProductColumnIfMissing("package_size", "package_size REAL NOT NULL DEFAULT 1");

  const settingsDefaults: Record<string, string> = {
    default_deduction_type: "percent",
    default_deduction_value: "0",
    owner_label: "Owner's Cut",
  };
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(settingsDefaults)) {
    insertSetting.run(key, value);
  }
}

migrate();

function seedIfEmpty() {
  const productCount = (
    db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }
  ).c;
  if (productCount > 0) return;

  const insertProduct = db.prepare(
    `INSERT INTO products (name, category, unit, stock_qty, avg_cost, reorder_level, package_unit, package_size)
     VALUES (@name, @category, @unit, @stock_qty, @avg_cost, @reorder_level, @package_unit, @package_size)`
  );

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
    const info = insertProduct.run(p);
    productIds[p.name] = info.lastInsertRowid as number;
  }

  const insertService = db.prepare(
    `INSERT INTO services (name, default_selling_price, default_consumable_cost)
     VALUES (@name, @default_selling_price, @default_consumable_cost)`
  );
  const insertServiceItem = db.prepare(
    `INSERT INTO service_items (service_id, product_id, quantity) VALUES (?, ?, ?)`
  );

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
    const info = insertService.run({
      name: s.name,
      default_selling_price: s.default_selling_price,
      default_consumable_cost: s.default_consumable_cost,
    });
    const serviceId = info.lastInsertRowid as number;
    for (const item of s.recipe) {
      const productId = productIds[item.product];
      if (productId) {
        insertServiceItem.run(serviceId, productId, item.quantity);
      }
    }
  }
}

seedIfEmpty();

export default db;
