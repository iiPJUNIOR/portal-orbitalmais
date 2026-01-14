import { Product, ProductFilters } from "@/types/product";

// Mock data - in a real app this would come from an API
const mockProducts: Product[] = [
  {
    id: "1",
    sku: "IDB-NEXT-001",
    category: "Catraca Pedestal",
    model: "iDBlock Next",
    colors: ["Inox", "Preta"],
    biometrics: true,
    facial: "Max",
    proximity: "Mifare",
    urn: true,
    qr: true,
    description: "Catraca pedestral biométrica com facial Max",
    value_12m: 1200.0,
    value_24m: 1000.0,
    part_number: "IDB-NEXT-001",
    status: "Ativo",
  },
  {
    id: "2",
    sku: "IDB-NEXT-BQC-001",
    category: "Catraca Balcão",
    model: "iDBlock Next BQC",
    colors: ["Cinza"],
    biometrics: true,
    facial: "Lite",
    proximity: "ASK",
    urn: false,
    qr: true,
    description: "Catraca balcão com facial Lite",
    value_12m: 950.0,
    value_24m: 800.0,
    part_number: "IDB-NEXT-BQC-001",
    status: "Ativo",
  },
  {
    id: "3",
    sku: "IDB-V2-001",
    category: "Torniquete",
    model: "iDBlock V2",
    colors: ["Inox"],
    biometrics: false,
    facial: "2",
    proximity: "Mifare",
    urn: true,
    qr: false,
    description: "Torniquete com facial 2",
    value_12m: 1500.0,
    value_24m: 1250.0,
    part_number: "IDB-V2-001",
    status: "Ativo",
  },
  {
    id: "4",
    sku: "IDB-BAL-001",
    category: "Catraca Balcão",
    model: "iDBlock Balcão",
    colors: ["Preta", "Cinza"],
    biometrics: true,
    facial: "1",
    proximity: "ASK",
    urn: false,
    qr: true,
    description: "Catraca balcão com facial 1",
    value_12m: 850.0,
    value_24m: 720.0,
    part_number: "IDB-BAL-001",
    status: "Ativo",
  },
  {
    id: "5",
    sku: "IDF-PRO-001",
    category: "Controladores Porta",
    model: "iDFace Pro",
    colors: ["Inox"],
    biometrics: false,
    facial: "Pro",
    proximity: "Mifare",
    urn: false,
    qr: true,
    description: "Controlador de porta com facial Pro",
    value_12m: 650.0,
    value_24m: 550.0,
    part_number: "IDF-PRO-001",
    status: "Ativo",
  },
];

export const fetchProducts = async (filters: ProductFilters = {}): Promise<Product[]> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  return mockProducts.filter((product) => {
    // Category filter
    if (filters.category && product.category !== filters.category) {
      return false;
    }

    // Model filter
    if (filters.model && product.model !== filters.model) {
      return false;
    }

    // Biometrics filter
    if (filters.biometrics !== undefined && product.biometrics !== filters.biometrics) {
      return false;
    }

    // Facial filter
    if (filters.facial && filters.facial !== "None" && product.facial !== filters.facial) {
      return false;
    }

    // Proximity filter
    if (filters.proximity && filters.proximity !== "None" && product.proximity !== filters.proximity) {
      return false;
    }

    // Urn filter
    if (filters.urn !== undefined && product.urn !== filters.urn) {
      return false;
    }

    // QR filter
    if (filters.qr !== undefined && product.qr !== filters.qr) {
      return false;
    }

    // Price range filter
    // Include product if at least one of the prices (12m or 24m) falls within the requested range.
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const minPriceFilter = filters.minPrice ?? Number.NEGATIVE_INFINITY;
      const maxPriceFilter = filters.maxPrice ?? Number.POSITIVE_INFINITY;

      const lowestPrice = Math.min(product.value_12m, product.value_24m);
      const highestPrice = Math.max(product.value_12m, product.value_24m);

      // If both prices are strictly less than min OR both strictly greater than max, exclude.
      if (highestPrice < minPriceFilter) {
        return false;
      }
      if (lowestPrice > maxPriceFilter) {
        return false;
      }
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (
        !product.description.toLowerCase().includes(searchLower) &&
        !product.part_number.toLowerCase().includes(searchLower) &&
        !product.sku.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    return product.status === "Ativo";
  });
};

export const getProductById = async (id: string): Promise<Product | undefined> => {
  return mockProducts.find((product) => product.id === id);
};

export const getCategories = (): string[] => {
  return Array.from(new Set(mockProducts.map((p) => p.category)));
};

export const getModels = (): string[] => {
  return Array.from(new Set(mockProducts.map((p) => p.model)));
};