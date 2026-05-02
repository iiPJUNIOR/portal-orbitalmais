export interface CnpjData {
  companyName: string;
  email: string;
  phone: string;
  address: string;
  cnpj: string;
}

interface ApiProvider {
  name: string;
  url: (cnpj: string) => string;
  transform: (data: any) => CnpjData;
}

const providers: ApiProvider[] = [
  {
    name: "BrasilAPI",
    url: (cnpj) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    transform: (data) => ({
      companyName: data.razao_social || data.nome || data.nome_fantasia || data.fantasia || "",
      email: data.email || data.e_mail || data.contato_email || "",
      phone: data.telefone || data.telefones || data.ddd_telefone || data.telefone_principal || "",
      address: buildAddress(data),
      cnpj: data.cnpj || "",
    }),
  },
  {
    name: "ReceitaWS",
    url: (cnpj) => `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
    transform: (data) => ({
      companyName: data.nome || data.fantasia || "",
      email: data.email || "",
      phone: data.telefone || "",
      address: buildAddress(data),
      cnpj: data.cnpj || "",
    }),
  },
  {
    name: "CNPJ.ws",
    url: (cnpj) => `https://publica.cnpj.ws/cnpj/${cnpj}`,
    transform: (data) => {
      const estabelecimento = data.estabelecimento || {};
      return {
        companyName: data.razao_social || "",
        email: estabelecimento.email || "",
        phone: estabelecimento.ddd1 || estabelecimento.telefone1 || "",
        address: buildAddress(data),
        cnpj: data.cnpj || "",
      };
    },
  },
];

function buildAddress(data: any): string {
  const parts: string[] = [];
  const logradouro = data.logradouro || data.estabelecimento?.logradouro || data.endereco || "";
  const numero = data.numero || data.estabelecimento?.numero || data.numero_t || "";
  const complemento = data.complemento || data.estabelecimento?.complemento || "";
  const bairro = data.bairro || data.estabelecimento?.bairro || "";
  const municipio = data.municipio || data.estabelecimento?.cidade?.nome || data.cidade || "";
  const uf = data.uf || data.estabelecimento?.estado?.sigla || data.uf_t || "";
  const cep = data.cep || data.estabelecimento?.cep || "";

  if (logradouro) {
    let addr = logradouro;
    if (numero) addr += `, ${numero}`;
    if (complemento) addr += `, ${complemento}`;
    parts.push(addr);
  }
  if (bairro) parts.push(bairro);
  if (municipio || uf) parts.push([municipio, uf].filter(Boolean).join("/"));
  if (cep) parts.push(cep);

  return parts.filter(Boolean).join(" - ");
}

export async function fetchCnpjData(cnpj: string): Promise<CnpjData> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) {
    throw new Error("CNPJ deve ter 14 dígitos");
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const res = await fetch(provider.url(digits), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`${provider.name} retornou ${res.status}`);
      }
      const data = await res.json();
      return provider.transform(data);
    } catch (err: any) {
      console.warn(`Falha ao consultar ${provider.name}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Todas as APIs de CNPJ falharam");
}
