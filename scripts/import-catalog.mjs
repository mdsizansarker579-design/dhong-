import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_PRODUCTS = 5000;
const MAX_VARIANTS = 500;

function fail(message) {
  throw new Error(message);
}

function sqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function parseCatalogDocument(raw) {
  let doc;
  try { doc = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { fail("Catalog file is not valid JSON"); }
  if (!doc || doc.schema !== "dhong_catalog_v1" || !Array.isArray(doc.products)) {
    fail("Unsupported catalog schema; expected dhong_catalog_v1");
  }
  if (doc.products.length < 1 || doc.products.length > MAX_PRODUCTS) fail("Product count is outside the allowed range");
  const seenProducts = new Set();
  const products = doc.products.map((p, index) => {
    const id = typeof p?.product_id === "string" ? p.product_id.trim() : "";
    const title = typeof p?.title === "string" ? p.title.trim() : "";
    if (!id || id.length > 100 || !title || title.length > 180) fail(`Invalid product identity at row ${index + 1}`);
    if (seenProducts.has(id)) fail(`Duplicate product_id: ${id}`);
    seenProducts.add(id);
    const price = p.price, salePrice = p.sale_price, stock = p.stock;
    if (!Number.isSafeInteger(price) || price < 0) fail(`Invalid price for ${id}`);
    if (!Number.isSafeInteger(salePrice) || salePrice < 0 || (salePrice > 0 && salePrice >= price)) fail(`Invalid sale_price for ${id}`);
    if (!Number.isSafeInteger(stock) || stock < 0) fail(`Invalid stock for ${id}`);
    if (![0, 1].includes(p.active)) fail(`Invalid active flag for ${id}`);
    const variants = p.variants ?? [];
    if (!Array.isArray(variants) || variants.length > MAX_VARIANTS) fail(`Invalid variants for ${id}`);
    const seenVariants = new Set();
    const cleanVariants = variants.map((v, vi) => {
      const color = typeof v?.color === "string" ? v.color.trim() : "";
      const size = typeof v?.size === "string" ? v.size.trim() : "";
      if (!color || color.length > 40 || !size || size.length > 40 ||
          !Number.isSafeInteger(v.stock) || v.stock < 0) fail(`Invalid variant ${vi + 1} for ${id}`);
      const key = color + "\u0000" + size;
      if (seenVariants.has(key)) fail(`Duplicate color/size variant for ${id}`);
      seenVariants.add(key);
      return { color, size, stock: v.stock };
    });
    return { product_id: id, title, price, sale_price: salePrice, stock, active: p.active, variants: cleanVariants };
  });
  return products;
}

export function buildCatalogSql(products, updatedAt = new Date().toISOString()) {
  if (!Array.isArray(products) || products.length < 1) fail("No catalog products to import");
  const stamp = sqlString(updatedAt);
  const statements = products.map(p => {
    const variantsJson = sqlString(JSON.stringify(p.variants));
    return `INSERT INTO dhong_catalog (product_id, title, price, sale_price, stock, active, variants_json, updated_at)
VALUES (${sqlString(p.product_id)}, ${sqlString(p.title)}, ${p.price}, ${p.sale_price}, ${p.stock}, ${p.active}, ${variantsJson}, ${stamp})
ON CONFLICT(product_id) DO UPDATE SET
  title=excluded.title, price=excluded.price, sale_price=excluded.sale_price,
  stock=excluded.stock, active=excluded.active, variants_json=excluded.variants_json,
  updated_at=excluded.updated_at;`;
  });
  return "BEGIN TRANSACTION;\n" + statements.join("\n") + "\nCOMMIT;\n";
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3] || "dhong-catalog-import.sql";
  if (!input) fail("Usage: node scripts/import-catalog.mjs <catalog.json> [output.sql]");
  const raw = fs.readFileSync(input, "utf8");
  const products = parseCatalogDocument(raw);
  const sql = buildCatalogSql(products);
  fs.writeFileSync(output, sql, "utf8");
  process.stdout.write(`Validated ${products.length} products. SQL written to ${path.resolve(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
}
