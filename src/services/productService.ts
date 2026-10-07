import { Product, ProductFilters } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import { parseSpreadsheetNumber } from "@/lib/formatters";

// Mock data as fallback if the database table doesn't exist or is empty yet
const mockProducts: Product[] = [];

/**
 * Fetch products from Supabase, applying filters.
 * Falls back to mock data if there's an error or the table doesn't exist.
 */
export const fetchProducts = async (filters: ProductFilters = {}): Promise<Product[]> => {
  try {
    let query = supabase.from("products").select("*");

    if (filters.status) {
      query = query.eq("status", filters.status);
    } else if (!filters.includeInactive) {
      query = query.eq("status", "Ativo");
    }

    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    if (filters.search) {
      const search = `%${filters.search}%`;
      query = query.or(`description.ilike.${search},sku.ilike.${search},model.ilike.${search}`);
    }

    const { data, error } = await query;
    
    if (error) throw error;

    let products = (data || []).map((p: any) => {
      const custom_fields = { ...(p.custom_fields || {}) };
      if (p.valor !== undefined && p.valor !== null && custom_fields.valor === undefined) {
        custom_fields.valor = p.valor;
      }
      if (p.price !== undefined && p.price !== null && custom_fields.price === undefined) {
        custom_fields.price = p.price;
      }
      const rawVal = p.value_12m ?? custom_fields.valor ?? p.valor ?? custom_fields.price ?? p.price ?? 0;
      const numVal = parseSpreadsheetNumber(rawVal);

      return {
        ...p,
        id: p.id,
        sku: p.sku,
        category: p.category,
        model: p.model,
        description: p.description || "",
        value_12m: numVal,
        value_24m: parseSpreadsheetNumber(p.value_24m ?? numVal),
        part_number: p.part_number || "",
        status: p.status || "Ativo",
        colors: p.colors || [],
        biometrics: !!p.biometrics,
        facial: p.facial || "None",
        proximity: p.proximity || "None",
        urn: !!p.urn,
        qr: !!p.qr,
        custom_fields,
      };
    }) as Product[];

    // Apply client-side filters if necessary (like min/max price ranges)
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const min = filters.minPrice ?? 0;
      const max = filters.maxPrice ?? Number.MAX_VALUE;
      products = products.filter(p => {
        const lowest = Math.min(p.value_12m, p.value_24m);
        const highest = Math.max(p.value_12m, p.value_24m);
        return highest >= min && lowest <= max;
      });
    }

    // If database has no products, return mock data for initial setup
    if (products.length === 0) {
      return getFilteredMockProducts(filters);
    }

    return products;
  } catch (err) {
    console.warn("fetchProducts database failed, using fallback mock data", err);
    return getFilteredMockProducts(filters);
  }
};

const getFilteredMockProducts = (filters: ProductFilters): Product[] => {
  return mockProducts.filter((p) => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      return p.description.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.model.toLowerCase().includes(s);
    }
    return p.status === "Ativo";
  });
};

/**
 * Fetch a single product by ID
 */
export const getProductById = async (id: string): Promise<Product | undefined> => {
  try {
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) {
      const custom_fields = { ...(data.custom_fields || {}) };
      if (data.valor !== undefined && data.valor !== null && custom_fields.valor === undefined) {
        custom_fields.valor = data.valor;
      }
      if (data.price !== undefined && data.price !== null && custom_fields.price === undefined) {
        custom_fields.price = data.price;
      }
      const rawVal = data.value_12m ?? custom_fields.valor ?? data.valor ?? custom_fields.price ?? data.price ?? 0;
      const numVal = parseSpreadsheetNumber(rawVal);

      return {
        ...data,
        id: data.id,
        sku: data.sku,
        category: data.category,
        model: data.model,
        description: data.description || "",
        value_12m: numVal,
        value_24m: parseSpreadsheetNumber(data.value_24m ?? numVal),
        part_number: data.part_number || "",
        status: data.status || "Ativo",
        colors: data.colors || [],
        biometrics: !!data.biometrics,
        facial: data.facial || "None",
        proximity: data.proximity || "None",
        urn: !!data.urn,
        qr: !!data.qr,
        custom_fields,
      } as Product;
    }
  } catch (err) {
    console.warn("getProductById failed", err);
  }
  return mockProducts.find((p) => p.id === id);
};

/**
 * Known columns in public.products table to prevent PostgreSQL column 42703 errors
 */
const DB_PRODUCT_COLUMNS = new Set([
  "sku",
  "category",
  "model",
  "description",
  "value_12m",
  "value_24m",
  "status",
  "colors",
  "custom_fields",
  "part_number",
  "biometrics",
  "facial",
  "proximity",
  "urn",
  "qr",
]);

function sanitizeProductPayload(raw: any): Record<string, any> {
  const sanitized: Record<string, any> = {};
  const customFields: Record<string, any> = { ...(raw.custom_fields || {}) };

  for (const [key, val] of Object.entries(raw)) {
    if (key === "id") continue;
    if (DB_PRODUCT_COLUMNS.has(key)) {
      sanitized[key] = val;
    } else {
      // Guarda dinamicamente qualquer outro atributo dentro de custom_fields
      customFields[key] = val;
    }
  }

  // Garante que colors seja array se informado (PostgreSQL text[])
  if (sanitized.colors !== undefined) {
    if (typeof sanitized.colors === "string") {
      sanitized.colors = sanitized.colors.split(",").map((c: string) => c.trim()).filter(Boolean);
    } else if (!Array.isArray(sanitized.colors)) {
      sanitized.colors = [];
    }
  }

  sanitized.custom_fields = customFields;
  return sanitized;
}

/**
 * Save a new product to Supabase
 */
export const createProduct = async (product: Omit<Product, "id">): Promise<Product> => {
  const payload = sanitizeProductPayload(product);
  const { data, error } = await supabase.from("products").insert([payload]).select().single();
  if (error) {
    console.error("createProduct failed:", error);
    throw error;
  }
  return data as Product;
};

/**
 * Update an existing product in Supabase
 */
export const updateProduct = async (id: string, product: Partial<Product>): Promise<Product> => {
  const payload = sanitizeProductPayload(product);
  const { data, error } = await supabase.from("products").update(payload).eq("id", id).select().single();
  if (error) {
    console.error("updateProduct failed:", error);
    throw error;
  }
  return data as Product;
};

/**
 * Delete or inactivate a product (soft delete — preserves history)
 */
export const deleteProduct = async (id: string): Promise<void> => {
  // We perform an inactivation (soft delete) to avoid breaking existing quotes that reference this product
  const { error } = await supabase.from("products").update({ status: "Inativo" }).eq("id", id);
  if (error) {
    console.error("deleteProduct failed:", error);
    throw error;
  }
};

/**
 * Permanently delete a product from the database (hard delete — irreversible)
 */
export const hardDeleteProduct = async (id: string): Promise<void> => {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    console.error("hardDeleteProduct failed:", error);
    throw error;
  }
};

/**
 * Helper to fetch distinct categories
 */
export const getCategories = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase.from("products").select("category");
    if (error) throw error;
    if (data && data.length > 0) {
      return Array.from(new Set(data.map((p) => p.category)));
    }
  } catch (err) {
    console.warn("getCategories failed", err);
  }
  return Array.from(new Set(mockProducts.map((p) => p.category)));
};

/**
 * Helper to fetch distinct models
 */
export const getModels = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase.from("products").select("model");
    if (error) throw error;
    if (data && data.length > 0) {
      return Array.from(new Set(data.map((p) => p.model)));
    }
  } catch (err) {
    console.warn("getModels failed", err);
  }
  return Array.from(new Set(mockProducts.map((p) => p.model)));
};

export const getTipos = async (): Promise<string[]> => {
  return getModels();
};

export const getColors = async (): Promise<string[]> => {
  return [];
};