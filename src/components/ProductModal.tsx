"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Product } from "@/types/product";
import { createProduct, updateProduct } from "@/services/productService";
import { getUserSettings, ProductFieldDef, defaultFields } from "@/services/settingsService";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const formatInitialCurrency = (value: number | string | null | undefined): string => {
  if (value === undefined || value === null || value === "") return "";
  const num = Number(value);
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
};

const handleCurrencyInput = (valueStr: string): string => {
  const cleanStr = valueStr.replace(/\D/g, "");
  if (!cleanStr) return "";
  const numValue = Number(cleanStr) / 100;
  return numValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
};

const parseCurrencyBRLToNumber = (formattedStr: string): number => {
  if (!formattedStr) return 0;
  const cleanStr = formattedStr.replace(/\D/g, "");
  if (!cleanStr) return 0;
  return Number(cleanStr) / 100;
};

interface ProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSaveSuccess: () => void;
}

export function ProductModal({ open, onOpenChange, product, onSaveSuccess }: ProductModalProps) {
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [value12m, setValue12m] = useState("");
  const [value24m, setValue24m] = useState("");
  const [status, setStatus] = useState<"Ativo" | "Inativo">("Ativo");
  
  // Dynamic fields configuration and values
  const [fieldsConfig, setFieldsConfig] = useState<ProductFieldDef[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  
  const [loading, setLoading] = useState(false);

  // Load fields configuration on open
  useEffect(() => {
    async function loadFieldsConfig() {
      try {
        const settings = await getUserSettings();
        if (Array.isArray(settings?.product_fields)) {
          setFieldsConfig(settings.product_fields);
        } else {
          setFieldsConfig(defaultFields);
        }
      } catch (err) {
        console.error("Failed to load fields configuration in modal", err);
      }
    }
    if (open) {
      loadFieldsConfig();
    }
  }, [open]);

  // Set values when product changes or modal opens
  useEffect(() => {
    if (product) {
      setSku(product.sku);
      setCategory(product.category);
      setModel(product.model);
      setDescription(product.description || "");
      setValue12m(formatInitialCurrency(product.value_12m));
      setValue24m(formatInitialCurrency(product.value_24m));
      setStatus(product.status);

      // Initialize dynamic values
      const initialDynValues: Record<string, any> = {};
      fieldsConfig.forEach((field) => {
        if (field.isCustom) {
          const rawVal = product.custom_fields?.[field.key] ?? "";
          initialDynValues[field.key] = field.type === "currency" ? formatInitialCurrency(rawVal) : rawVal;
        } else {
          // Standard fields mapping
          const key = field.key as keyof Product;
          if (field.key === "colors") {
            initialDynValues[field.key] = Array.isArray(product.colors) ? product.colors.join(", ") : "";
          } else {
            initialDynValues[field.key] = product[key] ?? (field.type === "boolean" ? false : "");
          }
        }
      });
      setDynamicValues(initialDynValues);
    } else {
      setSku("");
      setCategory("");
      setModel("");
      setDescription("");
      setValue12m("");
      setValue24m("");
      setStatus("Ativo");

      // Reset dynamic values to defaults
      const initialDynValues: Record<string, any> = {};
      fieldsConfig.forEach((field) => {
        initialDynValues[field.key] = field.type === "boolean" ? false : "";
      });
      setDynamicValues(initialDynValues);
    }
  }, [product, fieldsConfig, open]);

  const handleDynamicChange = (key: string, value: any) => {
    setDynamicValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate only if active
    if (isFieldActive("sku") && !sku) {
      toast.error("Por favor, preencha o campo SKU.");
      return;
    }
    if (isFieldActive("model") && !model) {
      toast.error("Por favor, preencha o campo Modelo/Nome.");
      return;
    }
    if (isFieldActive("category") && !category) {
      toast.error("Por favor, preencha o campo Categoria.");
      return;
    }
    if (isFieldActive("value_12m") && !value12m) {
      toast.error("Por favor, preencha o campo Valor Mensal (12m).");
      return;
    }
    if (isFieldActive("value_24m") && !value24m) {
      toast.error("Por favor, preencha o campo Valor Mensal (24m).");
      return;
    }

    setLoading(true);

    // Prepare standard and custom fields payload
    const customFieldsPayload: Record<string, any> = {};
    const payload: Omit<Product, "id"> = {
      sku: isFieldActive("sku") ? sku.trim() : `ORB-${Date.now()}`,
      category: isFieldActive("category") ? category.trim() : "",
      model: isFieldActive("model") ? model.trim() : "Item Sem Nome",
      description: isFieldActive("description") ? description.trim() : "",
      value_12m: isFieldActive("value_12m") ? parseCurrencyBRLToNumber(value12m) : 0,
      value_24m: isFieldActive("value_24m") ? parseCurrencyBRLToNumber(value24m) : 0,
      status: isFieldActive("status") ? status : "Ativo",
    };

    // Populate payload with configured dynamic values
    fieldsConfig.forEach((field) => {
      const val = dynamicValues[field.key];
      if (field.isCustom) {
        if (field.type === "currency") {
          customFieldsPayload[field.key] = parseCurrencyBRLToNumber(String(val));
        } else {
          customFieldsPayload[field.key] = field.type === "number" ? Number(val || 0) : val;
        }
      } else {
        // Standard fields mapped back to their root columns
        if (field.key === "colors") {
          payload.colors = typeof val === "string" ? val.split(",").map((c) => c.trim()).filter(Boolean) : [];
        } else if (field.key === "biometrics") {
          payload.biometrics = !!val;
        } else if (field.key === "facial") {
          payload.facial = val || "None";
        } else if (field.key === "proximity") {
          payload.proximity = val || "None";
        } else if (field.key === "urn") {
          payload.urn = !!val;
        } else if (field.key === "qr") {
          payload.qr = !!val;
        }
      }
    });

    payload.custom_fields = customFieldsPayload;

    try {
      if (product?.id) {
        await updateProduct(product.id, payload);
        toast.success("Item atualizado com sucesso!");
      } else {
        await createProduct(payload);
        toast.success("Item criado com sucesso!");
      }
      onSaveSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const getFieldDef = (key: string, label: string, type: "text" | "number" | "boolean" | "currency" | "dropdown") => {
    return fieldsConfig.find((f) => f.key === key) || { key, label, type, isCustom: false, isActive: true };
  };

  // Render any input field dynamically based on its definition
  const renderFieldInput = (field: ProductFieldDef, value: any, onChange: (val: any) => void) => {
    if (field.type === "boolean") {
      return (
        <div className="flex items-center justify-between p-3 bg-muted/20 dark:bg-muted/5 rounded-xl border w-full">
          <Label htmlFor={field.key} className="font-medium cursor-pointer">{field.label}</Label>
          <Switch
            id={field.key}
            checked={!!value}
            onCheckedChange={onChange}
          />
        </div>
      );
    }

    if (field.type === "currency") {
      return (
        <div className="space-y-2 w-full">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input
            id={field.key}
            type="text"
            value={value}
            onChange={(e) => onChange(handleCurrencyInput(e.target.value))}
            placeholder="R$ 0,00"
            className="rounded-xl"
          />
        </div>
      );
    }

    if (field.type === "dropdown") {
      const options = field.options || [];
      return (
        <div className="space-y-2 w-full">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={field.key} className="rounded-xl">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <div className="space-y-2 w-full">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input
            id={field.key}
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
            className="rounded-xl"
          />
        </div>
      );
    }

    // Default text/textarea
    if (field.key === "description") {
      return (
        <div className="space-y-2 w-full">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Textarea
            id={field.key}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Descreva brevemente o item/serviço..."
            className="resize-none h-16"
          />
        </div>
      );
    }

    return (
      <div className="space-y-2 w-full">
        <Label htmlFor={field.key}>{field.label}</Label>
        <Input
          id={field.key}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Preencher ${field.label.toLowerCase()}...`}
          className="rounded-xl"
        />
      </div>
    );
  };

  const isFieldActive = (key: string) => {
    return fieldsConfig.some((f) => f.key === key && f.isActive);
  };

  const getFieldLabel = (key: string, fallback: string) => {
    const field = fieldsConfig.find((f) => f.key === key);
    return field ? field.label : fallback;
  };

  const coreKeys = ["sku", "model", "status", "category", "description", "value_12m", "value_24m"];
  const activeFields = fieldsConfig.filter((f) => f.isActive && !coreKeys.includes(f.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {product ? "Editar Item" : "Novo Item"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {(isFieldActive("sku") || isFieldActive("status")) && (
            <div className="grid grid-cols-2 gap-4">
              {isFieldActive("sku") && (
                <div className={`space-y-2 ${isFieldActive("status") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("sku", "SKU/Código", "text"), sku, setSku)}
                </div>
              )}
              {isFieldActive("status") && (
                <div className={`space-y-2 ${isFieldActive("sku") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("status", "Status", "dropdown"), status, setStatus)}
                </div>
              )}
            </div>
          )}

          {(isFieldActive("category") || isFieldActive("model")) && (
            <div className="grid grid-cols-2 gap-4">
              {isFieldActive("category") && (
                <div className={`space-y-2 ${isFieldActive("model") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("category", "Categoria", "text"), category, setCategory)}
                </div>
              )}
              {isFieldActive("model") && (
                <div className={`space-y-2 ${isFieldActive("category") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("model", "Modelo / Nome", "text"), model, setModel)}
                </div>
              )}
            </div>
          )}

          {(isFieldActive("value_12m") || isFieldActive("value_24m")) && (
            <div className="grid grid-cols-2 gap-4">
              {isFieldActive("value_12m") && (
                <div className={`space-y-2 ${isFieldActive("value_24m") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("value_12m", "Valor Mensal (12m)", "currency"), value12m, setValue12m)}
                </div>
              )}
              {isFieldActive("value_24m") && (
                <div className={`space-y-2 ${isFieldActive("value_12m") ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                  {renderFieldInput(getFieldDef("value_24m", "Valor Mensal (24m)", "currency"), value24m, setValue24m)}
                </div>
              )}
            </div>
          )}

          {isFieldActive("description") && (
            <div className="space-y-2">
              {renderFieldInput(getFieldDef("description", "Descrição", "text"), description, setDescription)}
            </div>
          )}

          {/* Dynamic Configuration Fields */}
          {activeFields.length > 0 && (
            <div className="space-y-4 pt-2 border-t">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Atributos Adicionais</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeFields.map((field) => (
                  <div key={field.key}>
                    {renderFieldInput(
                      field,
                      dynamicValues[field.key] ?? (field.type === "boolean" ? false : ""),
                      (val) => handleDynamicChange(field.key, val)
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="pt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="rounded-xl font-bold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
