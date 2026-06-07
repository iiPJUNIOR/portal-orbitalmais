export interface Product {
  id: string;
  sku: string;
  category: string;
  model: string;
  colors?: string[];
  biometrics?: boolean;
  facial?: string;
  proximity?: string;
  urn?: boolean;
  qr?: boolean;
  description: string;
  value_12m: number;
  value_24m: number;
  part_number?: string;
  status: 'Ativo' | 'Inativo';
  custom_fields?: Record<string, any>;
}

export interface ProductFilters {
  category?: string;
  tipo?: string;
  model?: string;
  color?: string;
  biometrics?: boolean;
  facial?: string;
  proximity?: string;
  urn?: boolean;
  qr?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}