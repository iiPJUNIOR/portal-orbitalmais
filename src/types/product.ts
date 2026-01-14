export interface Product {
  id: string;
  sku: string;
  category: 'Catraca Pedestal' | 'Catraca Balcão' | 'Torniquete' | 'Controladores Porta';
  model: string;
  colors: string[];
  biometrics: boolean;
  facial: '1' | '2' | 'Lite' | 'Max' | 'None';
  proximity: 'ASK' | 'Mifare' | 'None';
  urn: boolean;
  qr: boolean;
  description: string;
  value_12m: number;
  value_24m: number;
  part_number: string;
  status: 'Ativo' | 'Inativo';
}

export interface ProductFilters {
  category?: string;
  model?: string;
  biometrics?: boolean;
  facial?: string;
  proximity?: string;
  urn?: boolean;
  qr?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}