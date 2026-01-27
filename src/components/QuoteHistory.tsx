"use client";

import React, { useState, useEffect } from 'react';
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
}

export function QuoteHistory({ onQuoteSelect, onRegenerateFromHistory }: QuoteHistoryProps) {
  const [cnpj, setCnpj] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!cnpj) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // In a real implementation, this would fetch from Supabase (and local fallback)
      const results = await getQuotesByCnpj(cnpj);
      setQuotes(results);
    } catch (err) {
      setError("Erro ao buscar orçamentos");
      console.error(err);
    } finally {
      setLoading(false);
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
              placeholder="Digite o CNPJ para buscar orçamentos"
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
                        <Button 
                          size="sm"
                          onClick={() => onRegenerateFromHistory(quote)}
                        >
                          Gerar
                        </Button>
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
                      : "Digite um CNPJ para buscar orçamentos"}
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