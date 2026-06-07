"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Product } from "@/types/product";
import { fetchProducts, hardDeleteProduct, getCategories } from "@/services/productService";
import { getUserSettings, ProductFieldDef, defaultFields } from "@/services/settingsService";
import { ProductModal } from "@/components/ProductModal";
import { Plus, Search, Edit2, Trash2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

/* ─── Delete Confirmation Modal ─── */
interface DeleteModalProps {
  product: Product | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function DeleteConfirmModal({ product, onClose, onConfirm, loading }: DeleteModalProps) {
  const [input, setInput] = useState("");
  if (!product) return null;

  /* The code the user must type — prefer SKU, fallback to model first 4 words */
  const requiredCode = product.sku || product.model;
  const isMatch = input.trim() === requiredCode.trim();

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative bg-card border border-destructive/30 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6 animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon + title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="p-4 bg-destructive/10 rounded-full">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-foreground">Excluir Definitivamente</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Esta ação é <strong>irreversível</strong>. O item será removido permanentemente do banco de dados.
            </p>
          </div>
        </div>

        {/* Item info */}
        <div className="bg-muted/40 border rounded-2xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Item a excluir</p>
          <p className="font-bold text-base">{product.model}</p>
          {product.sku && (
            <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
          )}
          {product.category && (
            <p className="text-xs text-muted-foreground">{product.category}</p>
          )}
        </div>

        {/* Confirmation field */}
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
              Para confirmar, digite o código do item no campo abaixo:
            </p>
            <p className="mt-1.5 font-mono font-black text-sm text-amber-900 dark:text-amber-200 tracking-widest select-all">
              {requiredCode}
            </p>
          </div>
          <Input
            id="delete-confirm-input"
            placeholder={`Digite: ${requiredCode}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`rounded-xl font-mono transition-colors ${
              input.length > 0
                ? isMatch
                  ? "border-green-500 focus-visible:ring-green-500"
                  : "border-destructive focus-visible:ring-destructive"
                : ""
            }`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isMatch && !loading) onConfirm();
              if (e.key === "Escape") onClose();
            }}
          />
          {input.length > 0 && !isMatch && (
            <p className="text-xs text-destructive font-medium">
              Código incorreto. Verifique e tente novamente.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="flex-1 rounded-xl font-bold"
            disabled={!isMatch || loading}
            onClick={onConfirm}
          >
            {loading ? "Excluindo..." : "Excluir Definitivamente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [fieldsConfig, setFieldsConfig] = useState<ProductFieldDef[]>([]);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const prods = await fetchProducts({
        search: search.trim() || undefined,
        category: selectedCategory || undefined,
      });
      setProducts(prods);

      const cats = await getCategories();
      setCategories(cats);

      const settings = await getUserSettings();
      if (Array.isArray(settings?.product_fields)) {
        setFieldsConfig(settings.product_fields);
      } else {
        setFieldsConfig(defaultFields);
      }
    } catch {
      toast.error("Erro ao carregar catálogo de produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [search, selectedCategory]);

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const handleAddNew = () => {
    setSelectedProduct(null);
    setModalOpen(true);
  };

  /* Open the confirmation modal — no browser confirm() */
  const handleDeleteClick = (product: Product) => {
    setDeleteTarget(product);
  };

  /* Actual hard delete after confirmation */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const tId = toast.loading(`Excluindo "${deleteTarget.model}"...`);
    try {
      await hardDeleteProduct(deleteTarget.id);
      toast.success("Item excluído permanentemente.", { id: tId });
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(`Falha ao excluir: ${err?.message || "Erro desconhecido"}`, { id: tId });
    } finally {
      setDeleting(false);
    }
  };

  const isFieldActive = (key: string) =>
    fieldsConfig.some((f) => f.key === key && f.isActive);

  const getFieldLabel = (key: string, fallback: string) => {
    const field = fieldsConfig.find((f) => f.key === key);
    return field ? field.label : fallback;
  };

  const activeCustomFields = fieldsConfig.filter((f) => f.isActive && f.isCustom);
  const baseCount =
    1 +
    (isFieldActive("sku") ? 1 : 0) +
    (isFieldActive("model") ? 1 : 0) +
    (isFieldActive("category") ? 1 : 0) +
    (isFieldActive("value_12m") ? 1 : 0) +
    (isFieldActive("value_24m") ? 1 : 0) +
    (isFieldActive("status") ? 1 : 0);
  const colSpanCount = baseCount + activeCustomFields.length;

  return (
    <div className="container mx-auto py-10 px-4">
      <Card className="rounded-3xl border-none shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b">
          <div>
            <CardTitle className="text-3xl font-black">Produtos &amp; Serviços</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Cadastre e gerencie o catálogo de equipamentos e serviços disponíveis para orçamentos.
            </CardDescription>
          </div>
          <Button onClick={handleAddNew} className="rounded-xl shrink-0 gap-2 font-bold">
            <Plus className="h-4 w-4" /> Novo Item
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SKU, nome ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <div className="flex w-full md:w-auto items-center gap-2">
              <label htmlFor="cat-filter" className="text-sm font-semibold shrink-0 text-muted-foreground">
                Filtrar Categoria:
              </label>
              <select
                id="cat-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent border border-input rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full md:w-48"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-2xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  {isFieldActive("sku") && <TableHead className="font-bold w-[120px]">{getFieldLabel("sku", "SKU")}</TableHead>}
                  {isFieldActive("model") && <TableHead className="font-bold">{getFieldLabel("model", "Modelo / Nome")}</TableHead>}
                  {isFieldActive("category") && <TableHead className="font-bold">{getFieldLabel("category", "Categoria")}</TableHead>}
                  {activeCustomFields.map((f) => (
                    <TableHead key={f.key} className="font-bold">{f.label}</TableHead>
                  ))}
                  {isFieldActive("value_12m") && <TableHead className="font-bold text-right">{getFieldLabel("value_12m", "Valor 12m")}</TableHead>}
                  {isFieldActive("value_24m") && <TableHead className="font-bold text-right">{getFieldLabel("value_24m", "Valor 24m")}</TableHead>}
                  {isFieldActive("status") && <TableHead className="font-bold text-center w-[100px]">{getFieldLabel("status", "Status")}</TableHead>}
                  <TableHead className="font-bold text-center w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={colSpanCount} className="text-center py-10 text-muted-foreground animate-pulse">
                      Carregando catálogo...
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpanCount} className="text-center py-10 text-muted-foreground">
                      Nenhum item encontrado no catálogo.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/10">
                      {isFieldActive("sku") && <TableCell className="font-mono text-xs">{p.sku}</TableCell>}
                      {isFieldActive("model") && <TableCell className="font-semibold">{p.model}</TableCell>}
                      {isFieldActive("category") && <TableCell className="text-muted-foreground">{p.category}</TableCell>}

                      {activeCustomFields.map((f) => {
                        const val = p.custom_fields?.[f.key];
                        let renderedVal = "";
                        if (val !== undefined && val !== null && val !== "") {
                          if (f.type === "boolean") renderedVal = val ? "Sim" : "Não";
                          else if (f.type === "currency") renderedVal = "R$ " + Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                          else renderedVal = String(val);
                        }
                        return <TableCell key={f.key} className="text-muted-foreground">{renderedVal}</TableCell>;
                      })}

                      {isFieldActive("value_12m") && (
                        <TableCell className="text-right">
                          R$ {p.value_12m.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      )}
                      {isFieldActive("value_24m") && (
                        <TableCell className="text-right">
                          R$ {p.value_24m.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      )}
                      {isFieldActive("status") && (
                        <TableCell className="text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            p.status === "Ativo"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-neutral-500/10 text-neutral-600"
                          }`}>
                            {p.status}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(p)}
                            className="h-8 w-8 hover:bg-primary/10 hover:text-primary rounded-lg"
                            title="Editar item"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(p)}
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive rounded-lg"
                            title="Excluir definitivamente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Modal */}
      <ProductModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        product={selectedProduct}
        onSaveSuccess={loadData}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          product={deleteTarget}
          onClose={() => { setDeleteTarget(null); }}
          onConfirm={handleConfirmDelete}
          loading={deleting}
        />
      )}
    </div>
  );
}
