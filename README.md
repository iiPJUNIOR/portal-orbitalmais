# Plataforma de Cotação Control iD

Uma plataforma web completa para cotação e geração de propostas de produtos de controle de acesso da Control iD.

## 📋 Funcionalidades

### 1. Gerenciamento de Catálogo
- Base de dados com 300+ SKUs de produtos
- Filtros avançados por categoria, modelo e características
- Busca textual e por faixa de preço
- Tabela paginada com resultados

### 2. Construtor de Orçamento
- Adição de produtos ao orçamento com quantidade
- Edição de quantidades e modelos de preço (12m/24m)
- Cálculo automático de totais
- Resumo do orçamento em tempo real

### 3. Geração de Propostas
- Formulário de dados da empresa (CNPJ, razão social, etc.)
- Resumo da proposta antes da geração
- Geração dinâmica de apresentação em PPTX
- Download automático da proposta

### 4. Histórico de Orçamentos
- Armazenamento de cotações no Supabase
- Busca por CNPJ
- Visualização de orçamentos anteriores
- Controle de status (rascunho, enviada, aceita, recusada)

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React com TypeScript
- **UI Framework**: ShadCN UI + Tailwind CSS
- **Gerenciamento de Estado**: React Context API
- **Roteamento**: React Router
- **Validação**: Zod
- **Geração de PPTX**: PptxGenJS
- **Backend**: Supabase (PostgreSQL + Storage)
- **Deploy**: Vercel

## 📊 Estrutura do Projeto

```
src/
├── components/          # Componentes reutilizáveis
├── pages/              # Páginas da aplicação
├── services/            # Serviços e integrações
├── types/               # Definições de tipos TypeScript
├── utils/               # Funções utilitárias
└── lib/                 # Bibliotecas e configurações
```

## 🚀 Como Executar

1. Instale as dependências:
```bash
npm install
```

2. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

3. Acesse `http://localhost:8080` no seu navegador

## 📦 Estrutura de Dados

### Produto
```typescript
interface Product {
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
```

### Orçamento
```typescript
interface Quote {
  id: string;
  cnpj: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  proposalDate: string;
  proposalNumber: string;
  priceModel: '12m' | '24m';
  totalPrice: number;
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada';
  observations: string;
  createdAt: string;
  updatedAt: string;
  pptxUrl?: string;
}
```

## 🔧 Configuração do Supabase

Para utilizar o armazenamento de orçamentos, configure as variáveis de ambiente:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 🎯 Próximos Passos

1. Integração completa com Supabase
2. Implementação da geração real de PPTX
3. Sistema de autenticação de usuários
4. Envio de propostas por e-mail
5. Controle de versões de propostas
6. Dashboard administrativo

## 📝 Licença

Este projeto é parte da plataforma Dyad e segue os termos de uso da mesma.