/**
 * Products Admin Page.
 *
 * Manage product catalogue for AI-powered WhatsApp image messages.
 * Admin can add, edit, delete products with images, categories, and pricing.
 */

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingBag, Plus, Edit3, Trash2, Save, X, Loader2,
  Image, Tag, Search, Filter,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function apiFetch(path, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const CATEGORIES = ["general", "electronics", "clothing", "jewellery", "food", "beauty", "home", "sports", "books", "services", "courses", "other"];

export default function Products() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", category: "general", price: "", description: "",
    imageUrl: "", tags: "", material: "", inStock: true, priority: 0,
  });

  const loadProducts = useCallback(async () => {
    if (!orgId) return;
    try {
      const params = new URLSearchParams({ orgId });
      if (filterCategory) params.set("category", filterCategory);
      const data = await apiFetch(`/api/v1/ai/catalogue?${params}`);
      setProducts(data.products || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [orgId, filterCategory]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const body = {
        orgId,
        name: form.name,
        category: form.category,
        price: Number(form.price) || 0,
        description: form.description,
        imageUrl: form.imageUrl,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        material: form.material,
        inStock: form.inStock,
        priority: Number(form.priority) || 0,
      };
      if (editId) {
        await apiFetch(`/api/v1/ai/catalogue/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/v1/ai/catalogue", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false); setEditId(null);
      setForm({ name: "", category: "general", price: "", description: "", imageUrl: "", tags: "", material: "", inStock: true, priority: 0 });
      await loadProducts();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this product?")) return;
    try {
      await apiFetch(`/api/v1/ai/catalogue/${id}?orgId=${orgId}`, { method: "DELETE" });
      await loadProducts();
    } catch (e) { setError(e.message); }
  };

  const startEdit = (product) => {
    setForm({
      name: product.name || "",
      category: product.category || "general",
      price: String(product.price || ""),
      description: product.description || "",
      imageUrl: product.imageUrl || "",
      tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
      material: product.material || "",
      inStock: product.inStock !== false,
      priority: product.priority || 0,
    });
    setEditId(product.id);
    setShowForm(true);
  };

  const filteredProducts = products.filter((p) => {
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return <Layout><div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-orange-500" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShoppingBag size={24} className="text-orange-500" />
            <div>
              <h1 className="text-xl font-display font-bold text-ink">Products</h1>
              <p className="text-sm text-ink-muted">Manage your product catalogue for AI WhatsApp replies</p>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", category: "general", price: "", description: "", imageUrl: "", tags: "", material: "", inStock: true, priority: 0 }); }}
            className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={14} /> Add Product
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

        {/* Search & Filter */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-cream-200 text-sm" />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-cream-200 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="card p-6 mb-5 border-orange-200 bg-orange-50/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink">{editId ? "Edit Product" : "Add New Product"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-cream-100 rounded"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-ink-soft">Product Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" placeholder="Gold Kundan Jhumka" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Price (₹) *</label>
                <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" placeholder="12500" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Material</label>
                <input type="text" value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" placeholder="gold, silver, cotton..." />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-ink-soft">Image URL *</label>
                <input type="url" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" placeholder="https://i.ibb.co/your-image.jpg" />
                <p className="text-xs text-ink-muted mt-1">Upload image to imgbb.com or any hosting → paste the direct URL here</p>
                {form.imageUrl && (
                  <div className="mt-2 w-20 h-20 rounded-lg border overflow-hidden bg-cream-50">
                    <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-ink-soft">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" rows={2} placeholder="Traditional kundan work with pearl drops. 22K gold, 8g weight." />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Tags (comma-separated)</label>
                <input type="text" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm" placeholder="bridal, traditional, gift" />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-sm font-medium text-ink-soft">Priority</label>
                  <input type="number" value={form.priority} min={0} max={100}
                    onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                    className="mt-1 w-20 rounded-lg border border-cream-200 px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 mt-5 cursor-pointer">
                  <input type="checkbox" checked={form.inStock} onChange={(e) => setForm((f) => ({ ...f, inStock: e.target.checked }))}
                    className="rounded border-cream-300" />
                  <span className="text-sm text-ink-soft">In Stock</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving || !form.name || !form.price}
                className="btn-primary text-sm flex items-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editId ? "Update Product" : "Add Product"}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="card p-16 text-center">
            <ShoppingBag size={40} className="mx-auto text-cream-300 mb-4" />
            <h3 className="font-semibold text-ink mb-2">No products yet</h3>
            <p className="text-sm text-ink-muted max-w-md mx-auto mb-4">
              Add your products with images and pricing. When customers ask about products on WhatsApp, AI will automatically show them relevant items with photos.
            </p>
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm"><Plus size={14} /> Add Your First Product</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="card overflow-hidden hover:shadow-md transition-shadow">
                {/* Image */}
                <div className="h-40 bg-cream-100 relative">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image size={32} className="text-cream-300" />
                    </div>
                  )}
                  {!product.inStock && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Out of Stock</span>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button onClick={() => startEdit(product)} className="w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white">
                      <Edit3 size={12} className="text-ink-muted" />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-red-50">
                      <Trash2 size={12} className="text-red-500" />
                    </button>
                  </div>
                </div>
                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink text-sm truncate">{product.name}</h3>
                    <span className="text-sm font-bold text-orange-600 whitespace-nowrap">₹{Number(product.price).toLocaleString("en-IN")}</span>
                  </div>
                  {product.description && <p className="text-xs text-ink-muted mt-1 line-clamp-2">{product.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-muted">{product.category}</span>
                    {product.material && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream-100 text-ink-muted">{product.material}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-ink-muted mt-6">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""} • AI will show relevant products when customers ask on WhatsApp
        </p>
      </div>
    </Layout>
  );
}
