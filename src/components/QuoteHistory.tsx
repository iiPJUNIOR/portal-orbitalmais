"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { getQuotesByCnpj, deleteQuote } from "@/services/supabaseService";
import { Quote } from "@/types/quote";
import { formatCurrencyBRL } from "@/lib/formatters";
import { getProposalKind, getProposalKindBadgeInfo, ProposalKind } from "@/utils/proposalType";
import { toast } from "sonner";

interface QuoteHistoryProps {
  onQuoteSelect: (quote: Quote) => void;
  onRegenerateFromHistory?: (quote: Quote) => void;
}

export function QuoteHistory({ onQuoteSelect, onRegenerateFromHistory }: QuoteHistoryProps) {
  const [cnpj, setCnpj] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ProposalKind>("all");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sortField, setSortField] = useState<'proposalNumber' | 'type' | 'companyName' | 'proposalDate' | 'totalPrice' | 'status'>('proposalDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const DEBOUNCE_MS = 300;
  const debounceRef = useRef<number | null>(null);
  const initialLoadDone = useRef(false);

  // Load recent quotes on mount (empty CNPJ -> returns recent / all)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await getQuotesByCnpj("");
        setQuotes(results);
      } catch (err) {
        console.error("Erro ao carregar orçamentos recentes", err);
        setError("Erro ao carregar orçamentos recentes");
        setQuotes([]);
      } finally {
        setLoading(false);
        initialLoadDone.current = true;
      }
    })();
  }, []);

  const doSearch = async (searchCnpj: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await getQuotesByCnpj(searchCnpj);
      setQuotes(results);
    } catch (err) {
      console.error("Erro ao buscar orçamentos", err);
      setError("Erro ao buscar orçamentos");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced live search while typing
  useEffect(() => {
    // Avoid firing debounce on initial mount before the initial load finished
    if (!initialLoadDone.current && cnpj === "") {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    debounceRef.current = window.setTimeout(() => {
      doSearch(cnpj);
      debounceRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  const handleSearch = async () => {
    // manual search fallback (immediate)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await doSearch(cnpj);
  };

  const handleDeleteQuote = async (quote: Quote) => {
    const num = quote.proposalNumber || "este orçamento";
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente ${num}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    const tId = toast.loading("Excluindo orçamento...");
    try {
      await deleteQuote(quote.id);
      setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
      toast.success("Orçamento excluído com sucesso!", { id: tId });
    } catch (err: any) {
      console.error("Falha ao excluir orçamento:", err);
      toast.error("Falha ao excluir orçamento do banco de dados.", { id: tId });
    }
  };

  const getStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'rascunho':
        return <Badge variant="secondary">Rascunho</Badge>;
      case 'enviada':
        return <Badge variant="default">Enviada</Badge>;
      case 'aceita':
        return <Badge variant="success">Aceita</Badge>;
      case 'recusada':
        return <Badge variant="destructive">Recusada</Badge>;
      default:
        return <Badge variant="secondary">Desconhecido</Badge>;
    }
  };

  const handleSort = (field: 'proposalNumber' | 'type' | 'companyName' | 'proposalDate' | 'totalPrice' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Para valores monetários e datas, o padrão mais comum ao clicar é do maior para o menor (desc)
      setSortDirection(field === 'totalPrice' || field === 'proposalDate' ? 'desc' : 'asc');
    }
  };

  const filteredQuotes = quotes.filter((q) => {
    if (typeFilter === "all") return true;
    return getProposalKind(q) === typeFilter;
  });

  const sortedQuotes = React.useMemo(() => {
    return [...filteredQuotes].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'proposalNumber':
          comparison = (a.proposalNumber || '').localeCompare(b.proposalNumber || '', undefined, { numeric: true });
          break;
        case 'type': {
          const kindA = getProposalKind(a);
          const kindB = getProposalKind(b);
          comparison = kindA.localeCompare(kindB);
          break;
        }
        case 'companyName':
          comparison = (a.companyName || '').localeCompare(b.companyName || '', 'pt-BR', { sensitivity: 'base' });
          break;
        case 'proposalDate': {
          const dateA = new Date(a.proposalDate).getTime() || 0;
          const dateB = new Date(b.proposalDate).getTime() || 0;
          comparison = dateA - dateB;
          break;
        }
        case 'totalPrice': {
          const priceA = Number(a.totalPrice) || 0;
          const priceB = Number(b.totalPrice) || 0;
          comparison = priceA - priceB;
          break;
        }
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredQuotes, sortField, sortDirection]);

  const renderSortableHeader = (
    field: 'proposalNumber' | 'type' | 'companyName' | 'proposalDate' | 'totalPrice' | 'status',
    label: string,
    alignClass?: string
  ) => {
    const isActive = sortField === field;
    return (
      <TableHead
        className={`font-bold cursor-pointer select-none group hover:text-foreground transition-colors ${alignClass || ''}`}
        onClick={() => handleSort(field)}
        title={`Ordenar por ${label} (${isActive && sortDirection === 'desc' ? 'menor para o maior' : 'maior para o menor'})`}
      >
        <div className={`flex items-center gap-1.5 ${alignClass?.includes('center') ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'desc' ? (
              <ArrowDown className="h-4 w-4 text-primary shrink-0 transition-transform" />
            ) : (
              <ArrowUp className="h-4 w-4 text-primary shrink-0 transition-transform" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-colors" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle>Histórico de Orçamentos</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Consulte propostas de Qualificação e Prestação de Serviço salvas.</p>
        </div>
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border">
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "ghost"}
            className="rounded-lg text-xs font-semibold h-8"
            onClick={() => setTypeFilter("all")}
          >
            Todos ({quotes.length})
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "qualification" ? "default" : "ghost"}
            className="rounded-lg text-xs font-semibold h-8"
            onClick={() => setTypeFilter("qualification")}
          >
            Qualificação ({quotes.filter((q) => getProposalKind(q) === "qualification").length})
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "service" ? "default" : "ghost"}
            className="rounded-lg text-xs font-semibold h-8"
            onClick={() => setTypeFilter("service")}
          >
            Serviço ({quotes.filter((q) => getProposalKind(q) === "service").length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por CNPJ ou Razão Social (ou deixe vazio para ver os últimos)..."
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              className="pl-8 rounded-xl"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading} className="rounded-xl font-bold">
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>

        {error && (
          <div className="text-destructive mb-4 text-sm">{error}</div>
        )}

        <div className="border rounded-2xl overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {renderSortableHeader('proposalNumber', 'Número')}
                {renderSortableHeader('type', 'Tipo')}
                {renderSortableHeader('companyName', 'Empresa')}
                {renderSortableHeader('proposalDate', 'Data')}
                {renderSortableHeader('totalPrice', 'Valor')}
                {renderSortableHeader('status', 'Status', 'text-center')}
                <TableHead className="text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedQuotes.map((quote) => {
                const kindInfo = getProposalKindBadgeInfo(quote);
                return (
                  <TableRow key={quote.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-mono text-xs font-medium">{quote.proposalNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${kindInfo.badgeClass} font-bold rounded-lg text-xs`}>
                        {kindInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{quote.companyName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(quote.proposalDate).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrencyBRL(quote.totalPrice)}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(quote.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="rounded-lg"
                          onClick={() => onQuoteSelect(quote)}
                        >
                          Visualizar
                        </Button>

                        {onRegenerateFromHistory ? (
                          <Button 
                            size="sm"
                            className="rounded-lg font-bold"
                            onClick={() => onRegenerateFromHistory(quote)}
                          >
                            DOCX
                          </Button>
                        ) : null}

                        <Button 
                          variant="outline" 
                          size="sm"
                          className="rounded-lg border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteQuote(quote)}
                          title="Excluir orçamento permanentemente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {sortedQuotes.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {cnpj 
                      ? "Nenhum orçamento encontrado com os filtros informados"
                      : "Nenhum orçamento disponível nesta categoria"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}