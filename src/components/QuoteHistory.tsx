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

interface QuoteHistoryProps {
  onQuoteSelect: (quote: Quote) => void;
  onRegenerateFromHistory?: (quote: Quote) => void;
  onRegeneratePDFFromHistory?: (quote: Quote) => void;
}

export function QuoteHistory({ onQuoteSelect, onRegenerateFromHistory, onRegeneratePDFFromHistory }: QuoteHistoryProps) {
  const [cnpj, setCnpj] = useState("");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de Orçamentos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por CNPJ (ou deixe vazio para ver os últimos)"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>

        {error && (
          <div className="text-destructive mb-4">{error}</div>
        )}

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium">{quote.proposalNumber}</TableCell>
                  <TableCell>{quote.companyName}</TableCell>
                  <TableCell>
                    {new Date(quote.proposalDate).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>{formatCurrencyBRL(quote.totalPrice)}</TableCell>
                  <TableCell>{getStatusBadge(quote.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onQuoteSelect(quote)}
                      >
                        Visualizar
                      </Button>

                      {onRegenerateFromHistory ? (
                        <div className="flex gap-1.5">
                          <Button 
                            variant="outline"
                            size="sm"
                            title="Baixar DOCX"
                            onClick={() => onRegenerateFromHistory(quote)}
                          >
                            DOCX
                          </Button>
                          {onRegeneratePDFFromHistory ? (
                            <Button 
                              size="sm"
                              title="Baixar PDF"
                              className="bg-orange-500 hover:bg-orange-600 text-white border-none font-semibold"
                              onClick={() => onRegeneratePDFFromHistory(quote)}
                            >
                              PDF
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {quotes.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {cnpj 
                      ? "Nenhum orçamento encontrado para este CNPJ"
                      : "Nenhum orçamento recente disponível"}
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