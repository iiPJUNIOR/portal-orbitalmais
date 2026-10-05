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
import { Search } from "lucide-react";
import { getQuotesByCnpj } from "@/services/supabaseService";
import { Quote } from "@/types/quote";
import { formatCurrencyBRL } from "@/lib/formatters";
import { getProposalKind, getProposalKindBadgeInfo, ProposalKind } from "@/utils/proposalType";

interface QuoteHistoryProps {
  onQuoteSelect: (quote: Quote) => void;
  onRegenerateFromHistory?: (quote: Quote) => void;
}

export function QuoteHistory({ onQuoteSelect, onRegenerateFromHistory }: QuoteHistoryProps) {
  const [cnpj, setCnpj] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ProposalKind>("all");
  const [quotes, setQuotes] = useState<Quote[]>([]);
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

  const filteredQuotes = quotes.filter((q) => {
    if (typeFilter === "all") return true;
    return getProposalKind(q) === typeFilter;
  });

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
                <TableHead className="font-bold">Número</TableHead>
                <TableHead className="font-bold">Tipo</TableHead>
                <TableHead className="font-bold">Empresa</TableHead>
                <TableHead className="font-bold">Data</TableHead>
                <TableHead className="font-bold">Valor</TableHead>
                <TableHead className="font-bold text-center">Status</TableHead>
                <TableHead className="text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((quote) => {
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredQuotes.length === 0 && !loading && (
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