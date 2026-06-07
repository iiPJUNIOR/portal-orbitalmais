# Portal Orbitalmais - Orçamentos e Propostas

Uma plataforma web completa para cotação, precificação e geração de propostas comerciais de equipamentos e serviços para a **Orbitalmais - Tecnologia em Soldagem**.

## 📋 Funcionalidades

### 1. Gerenciamento de Catálogo de Produtos e Serviços
- Cadastro unificado e dinâmico de equipamentos de soldagem e serviços de suporte
- Controle flexível de atributos e campos base (SKU, Modelo, Categoria, Valores)
- Criação de campos customizados (dropdowns de seleção, booleanos, valores monetários)
- Ocultação inteligente de atributos vazios ou inativos nas listagens

### 2. Construtor de Orçamento Comercial
- Fluxo simplificado em 4 etapas (Vendedor, Dados do Cliente, Itens e Resumo)
- Validação automática de dados do cliente por meio de consulta integrada de CNPJ
- Seleção e edição de quantidade por produto
- Marcação de itens bonificados (com valor zerado no documento de proposta)
- Pergunta global configurável sobre inclusão de ensaios de laboratório

### 3. Geração de Propostas Dinâmicas
- Geração automática e exportação direta em formato Word (`.docx`)
- Scanner inteligente de tokens em tempo real do arquivo de template carregado
- Preenchimento plano de atributos de até 10 itens (`sku` a `sku9`, `qtd` a `qtd9` e `valor_item` a `valor_item9`)
- Duplicação automatizada de linhas de tabela no Word baseada no loop de repetição de produtos selecionados

### 4. Gestão de Histórico e Rascunhos
- Armazenamento em nuvem no Supabase e backup de segurança local
- Busca otimizada de orçamentos emitidos por Razão Social ou CNPJ
- Salvamento de rascunhos para continuação posterior e recuperação adaptativa de etapas
- Controle de status de cotação (rascunho, enviada, aceita, recusada)

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React + TypeScript
- **Bundler & Server**: Vite
- **UI Framework**: Shadcn UI + Tailwind CSS
- **Gerenciamento de Estado**: React Context API
- **Validação de Formulários**: Zod
- **Geração de Documentos**: Pizzip + Docxtemplater
- **Backend & Banco de Dados**: Supabase (PostgreSQL + RLS)
- **Deploy**: Vercel

## 🚀 Como Executar Localmente

1. Certifique-se de ter o **Node.js** instalado em sua máquina.
2. Instale as dependências do projeto:
```bash
npm install
```
3. Inicie o servidor de desenvolvimento local:
```bash
npm run dev
```
4. Abra a URL informada no terminal (normalmente `http://localhost:8080`) no seu navegador.

## 📦 Variáveis de Ambiente (.env)

Para conectar à base de dados Supabase do cliente, configure as seguintes variáveis no arquivo `.env` do diretório raiz:

```env
VITE_SUPABASE_URL=url_do_seu_supabase
VITE_SUPABASE_ANON_KEY=chave_anonima_do_seu_supabase
```

## 📝 Licença

Este projeto é de uso exclusivo da Orbitalmais e seus revendedores autorizados.