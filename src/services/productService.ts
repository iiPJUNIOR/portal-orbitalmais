import { Product, ProductFilters } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";

// Mock data as fallback if the database table doesn't exist or is empty yet
const mockProducts: Product[] = [];

/**
 * Fetch products from Supabase, applying filters.
 * Falls back to mock data if there's an error or the table doesn't exist.
 */
export const fetchProducts = async (filters: ProductFilters = {}): Promise<Product[]> => {
  try {
    let query = supabase.from("products").select("*");

    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    if (filters.search) {
      const search = `%${filters.search}%`;
      query = query.or(`description.ilike.${search},sku.ilike.${search},model.ilike.${search}`);
    }

    const { data, error } = await query;
    
    if (error) throw error;

    let products = (data || []).map((p: any) => ({
      id: p.id,
      sku: p.sku,
      category: p.category,
      model: p.model,
      description: p.description || "",
      value_12m: Number(p.value_12m || 0),
      value_24m: Number(p.value_24m || 0),
      part_number: p.part_number || "",
      status: p.status || "Ativo",
      colors: p.colors || [],
      biometrics: !!p.biometrics,
      facial: p.facial || "None",
      proximity: p.proximity || "None",
      urn: !!p.urn,
      qr: !!p.qr,
      custom_fields: p.custom_fields || {},
    })) as Product[];

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
      return {
        id: data.id,
        sku: data.sku,
        category: data.category,
        model: data.model,
        description: data.description || "",
        value_12m: Number(data.value_12m || 0),
        value_24m: Number(data.value_24m || 0),
        part_number: data.part_number || "",
        status: data.status || "Ativo",
        colors: data.colors || [],
        biometrics: !!data.biometrics,
        facial: data.facial || "None",
        proximity: data.proximity || "None",
        urn: !!data.urn,
        qr: !!data.qr,
        custom_fields: data.custom_fields || {},
      } as Product;
    }
  } catch (err) {
    console.warn("getProductById failed", err);
  }
  return mockProducts.find((p) => p.id === id);
};

/**
 * Save a new product to Supabase
 */
export const createProduct = async (product: Omit<Product, "id">): Promise<Product> => {
  const { data, error } = await supabase.from("products").insert([product]).select().single();
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
  const { data, error } = await supabase.from("products").update(product).eq("id", id).select().single();
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