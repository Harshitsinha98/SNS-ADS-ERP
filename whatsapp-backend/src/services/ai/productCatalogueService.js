/**
 * Product Catalogue Service.
 *
 * Manages org-scoped product catalogues stored in Firestore.
 * Products include image URLs (hosted on Firebase Storage or any CDN).
 * The AI uses this service to search and recommend products based on
 * customer queries.
 *
 * Schema:
 *   organizations/{orgId}/products/{productId}
 */

import { db } from "../../bootstrap/firebase.js";
import { nowIso, orgCollection } from "../helpers.js";
import { logger } from "../../middleware/logger.js";

// ─── Product CRUD ───────────────────────────────────────────────────

export async function createProduct(orgId, data, createdBy) {
  if (!data.name) throw new Error("Product name is required");
  if (!data.price && data.price !== 0) throw new Error("Product price is required");

  // Check product limit per org
  const countSnap = await orgCollection(db, orgId, "products").count().get();
  const currentCount = countSnap.data()?.count || 0;
  if (currentCount >= 500) {
    throw new Error("Maximum 500 products per organization");
  }

  const product = {
    name: String(data.name).trim().slice(0, 200),
    category: String(data.category || "general").trim().toLowerCase(),
    subcategory: data.subcategory ? String(data.subcategory).trim().toLowerCase() : "",
    price: Number(data.price) || 0,
    currency: data.currency || "INR",
    description: String(data.description || "").trim().slice(0, 1000),
    imageUrl: data.imageUrl || "",
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t).trim().toLowerCase()).slice(0, 20) : [],
    material: data.material ? String(data.material).trim().toLowerCase() : "",
    inStock: data.inStock !== false,
    active: true,
    priority: Number(data.priority) || 0,
    sku: data.sku || "",
    createdAt: nowIso(),
    createdBy: createdBy || "system",
    updatedAt: nowIso(),
  };

  const ref = await orgCollection(db, orgId, "products").add(product);
  logger.info({ orgId, productId: ref.id, name: product.name }, "Product created");
  return { id: ref.id, ...product };
}

export async function updateProduct(orgId, productId, updates, updatedBy) {
  const ref = orgCollection(db, orgId, "products").doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Product not found");

  const allowedFields = [
    "name", "category", "subcategory", "price", "currency",
    "description", "imageUrl", "tags", "material",
    "inStock", "active", "priority", "sku",
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (key in updates) sanitized[key] = updates[key];
  }
  sanitized.updatedAt = nowIso();
  sanitized.updatedBy = updatedBy || "system";

  await ref.update(sanitized);
  return { id: productId, ...snap.data(), ...sanitized };
}

export async function deleteProduct(orgId, productId) {
  const ref = orgCollection(db, orgId, "products").doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Product not found");
  await ref.delete();
  return { deleted: true, id: productId };
}

export async function listProducts(orgId, { category, inStock, active, limit: maxLimit } = {}) {
  let query = orgCollection(db, orgId, "products");
  if (category) query = query.where("category", "==", category.toLowerCase());
  if (inStock !== undefined) query = query.where("inStock", "==", inStock);
  if (active !== undefined) query = query.where("active", "==", active);
  query = query.orderBy("priority", "desc").limit(maxLimit || 100);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getProduct(orgId, productId) {
  const snap = await orgCollection(db, orgId, "products").doc(productId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getProductStats(orgId) {
  const snapshot = await orgCollection(db, orgId, "products").get();
  const products = snapshot.docs.map((doc) => doc.data());
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  return {
    total: products.length,
    active: products.filter((p) => p.active).length,
    inStock: products.filter((p) => p.inStock).length,
    outOfStock: products.filter((p) => !p.inStock).length,
    categories,
    limit: 500,
    remaining: 500 - products.length,
  };
}

// ─── AI Product Search ──────────────────────────────────────────────

/**
 * Search products based on AI-extracted filters from customer message.
 * Returns top 3 matching products for sending as images.
 */
export async function searchProductsForAI(orgId, filters = {}) {
  let query = orgCollection(db, orgId, "products")
    .where("active", "==", true)
    .where("inStock", "==", true);

  if (filters.category) {
    query = query.where("category", "==", filters.category.toLowerCase());
  }

  query = query.orderBy("priority", "desc").limit(10);
  const snapshot = await query.get();

  let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Apply price filter in memory (Firestore doesn't support inequality on multiple fields easily)
  if (filters.maxPrice) {
    results = results.filter((p) => p.price <= filters.maxPrice);
  }
  if (filters.minPrice) {
    results = results.filter((p) => p.price >= filters.minPrice);
  }

  // Apply material/tag filters in memory
  if (filters.material) {
    results = results.filter((p) => p.material === filters.material.toLowerCase());
  }
  if (filters.tag) {
    const tag = filters.tag.toLowerCase();
    results = results.filter((p) => p.tags?.includes(tag));
  }

  return results.slice(0, 3);
}

/**
 * Build a text summary of products for AI to include in its response.
 * Used when catalogue mode is "product_db".
 */
export async function getProductContextForAI(orgId) {
  const products = await orgCollection(db, orgId, "products")
    .where("active", "==", true)
    .where("inStock", "==", true)
    .orderBy("priority", "desc")
    .limit(30)
    .get();

  if (products.empty) return "";

  const categories = {};
  for (const doc of products.docs) {
    const p = doc.data();
    const cat = p.category || "general";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(`${p.name} — ₹${p.price.toLocaleString("en-IN")}${p.description ? ` (${p.description.slice(0, 50)})` : ""}`);
  }

  let context = "PRODUCT CATALOGUE:\n";
  for (const [cat, items] of Object.entries(categories)) {
    context += `\n${cat.charAt(0).toUpperCase() + cat.slice(1)}:\n`;
    items.forEach((item) => { context += `- ${item}\n`; });
  }
  context += "\nWhen customer asks about products, recommend from above and mention we can share product photos.";
  return context;
}
