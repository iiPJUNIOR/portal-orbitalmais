"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserSettings, saveUserSettings, ProductFieldDef, defaultFields } from "@/services/settingsService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Settings, Loader2, Edit2 } from "lucide-react";

export function ProductFieldsTab() {
  const [fields, setFields] = useState<ProductFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New field state
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"text" | "number" | "boolean" | "currency" | "dropdown">("text");
  
  // Dropdown options creator state
  const [dropdownOptions, setDropdownOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");

  // Editing state
  const [editingField, setEditingField] = useState<ProductFieldDef | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<"text" | "number" | "boolean" | "currency" | "dropdown">("text");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editOptionInput, setEditOptionInput] = useState("");

  const handleOpenEdit = (field: ProductFieldDef) => {
    setEditingField(field);
    setEditLabel(field.label);
    setEditType(field.type);
    setEditOptions(field.options || []);
    setEditOptionInput("");
  };

  const handleAddEditOption = () => {
    const cleanOpt = editOptionInput.trim();
    if (!cleanOpt) return;
    if (editOptions.includes(cleanOpt)) {
      toast.error("Esta opção já foi adicionada.");
      return;
    }
    setEditOptions((prev) => [...prev, cleanOpt]);
    setEditOptionInput("");
  };

  const handleRemoveEditOption = (index: number) => {
    setEditOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveEdit = () => {
    if (!editingField) return;
    if (!editLabel.trim()) {
      toast.error("Por favor, digite o nome do campo.");
      return;
    }
    if (editType === "dropdown" && editOptions.length === 0) {
      toast.error("Por favor, adicione pelo menos uma opção para o dropdown.");
      return;
    }

    setFields((prev) =>
      prev.map((f) => {
        if (f.key === editingField.key) {
          return {
            ...f,
            label: editLabel.trim(),
            type: editType,
            options: editType === "dropdown" ? editOptions : undefined,
          };
        }
        return f;
      })
    );

    toast.success(`Campo "${editLabel.trim()}" atualizado! Clique em Salvar Alterações.`);
    setEditingField(null);
  };

  const handleAddOption = () => {
    const cleanOpt = optionInput.trim();
    if (!cleanOpt) return;
    if (dropdownOptions.includes(cleanOpt)) {
      toast.error("Esta opção já foi adicionada.");
      return;
    }
    setDropdownOptions((prev) => [...prev, cleanOpt]);
    setOptionInput("");
  };

  const handleRemoveOption = (index: number) => {
    setDropdownOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getUserSettings();
        if (Array.isArray(settings?.product_fields)) {
          setFields(settings.product_fields);
        } else {
          setFields(defaultFields);
        }
      } catch (err) {
        console.error("Failed to load product fields", err);
        setFields(defaultFields);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleToggleActive = (key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, isActive: !f.isActive } : f))
    );
  };

  const handleAddField = () => {
    if (!newLabel.trim()) {
      toast.error("Por favor, digite o nome do campo.");
      return;
    }

    const key = `custom_${newLabel
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "_")}`;

    if (fields.some((f) => f.key === key)) {
      toast.error("Já existe um campo com este nome.");
      return;
    }

    if (newType === "dropdown" && dropdownOptions.length === 0) {
      toast.error("Por favor, adicione pelo menos uma opção para o dropdown.");
      return;
    }

    const newField: ProductFieldDef = {
      key,
      label: newLabel.trim(),
      type: newType,
      isCustom: true,
      isActive: true,
      options: newType === "dropdown" ? dropdownOptions : undefined,
    };

    setFields((prev) => [...prev, newField]);
    setNewLabel("");
    setDropdownOptions([]);
    toast.success(`Campo "${newLabel}" adicionado! Clique em Salvar Alterações.`);
  };

  const handleRemoveField = (key: string) => {
    const fieldToRemove = fields.find(f => f.key === key);
    setFields((prev) => prev.filter((f) => f.key !== key));
    toast.success(`Campo "${fieldToRemove?.label}" removido! Clique em Salvar Alterações.`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserSettings({
        product_fields: fields,
      });
      toast.success("Configuração de campos de produtos salva com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar configuração: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground animate-pulse">
        Carregando configurações...
      </div>
    );
  }

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Configuração de Campos de Produtos
        </CardTitle>
        <CardDescription>
          Escolha quais campos padrão e customizados estarão ativos no cadastro de produtos ou exclua-os permanentemente da listagem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Unified fields list */}
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Campos do Catálogo</h3>
          
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">Nenhum campo opcional configurado. Use o formulário abaixo para adicionar campos.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className={`flex items-center justify-between p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border transition-all ${
                    field.isActive ? "border-primary/20 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      {field.label}
                      {field.isCustom && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">Custom</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tipo: {field.type === "boolean" ? "Sim / Não" : field.type === "number" ? "Número" : field.type === "currency" ? "Valor Monetário" : field.type === "dropdown" ? "Seleção (Dropdown)" : "Texto"}
                    </p>
                    {field.type === "dropdown" && field.options && field.options.length > 0 && (
                      <p className="text-[10px] text-muted-foreground font-semibold max-w-[200px] truncate" title={field.options.join(", ")}>
                        Opções: {field.options.join(", ")}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`active-${field.key}`}
                        className={`text-xs cursor-pointer font-medium ${
                          field.isActive ? "text-primary font-bold" : "text-muted-foreground"
                        }`}
                      >
                        {field.isActive ? "Ativo" : "Inativo"}
                      </Label>
                      <Switch
                        id={`active-${field.key}`}
                        checked={field.isActive}
                        onCheckedChange={() => handleToggleActive(field.key)}
                      />
                    </div>
                    
                    <div className="h-4 w-[1px] bg-border" />

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(field)}
                      className="hover:bg-primary/10 hover:text-primary rounded-xl h-8 w-8"
                      title="Editar campo"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <div className="h-4 w-[1px] bg-border" />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveField(field.key)}
                      className="hover:bg-destructive/10 hover:text-destructive rounded-xl h-8 w-8"
                      title="Excluir campo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-border" />

        {/* Custom fields creator */}
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Criar Novo Campo</h3>
          
          <div className="flex flex-col sm:flex-row gap-3 items-end pt-2">
            <div className="space-y-2 w-full sm:flex-1">
              <Label htmlFor="new-field-label">Nome do Campo</Label>
              <Input
                id="new-field-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Garantia (Meses), Fabricante, etc."
                className="rounded-xl"
              />
            </div>
            
            <div className="space-y-2 w-full sm:w-48">
              <Label htmlFor="new-field-type">Tipo</Label>
              <Select value={newType} onValueChange={(val: any) => { setNewType(val); setDropdownOptions([]); }}>
                <SelectTrigger id="new-field-type" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="boolean">Sim / Não</SelectItem>
                  <SelectItem value="currency">Valor Monetário</SelectItem>
                  <SelectItem value="dropdown">Dropdown (Seleção)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              onClick={handleAddField}
              className="rounded-xl shrink-0 gap-2 font-bold w-full sm:w-auto animate-in"
            >
              <Plus className="h-4 w-4" /> Adicionar Campo
            </Button>
          </div>

          {newType === "dropdown" && (
            <div className="space-y-3 p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border w-full animate-in fade-in slide-in-from-top-2">
              <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Itens do Dropdown</Label>
              <div className="flex gap-2">
                <Input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="Digite uma opção (ex: Azul, Grande, etc.)"
                  className="rounded-xl"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddOption} className="rounded-xl font-semibold">
                  Adicionar Opção
                </Button>
              </div>
              
              {dropdownOptions.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {dropdownOptions.map((opt, idx) => (
                    <span key={idx} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold">
                      {opt}
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="hover:text-destructive transition-colors focus:outline-none ml-1 text-sm font-bold"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhuma opção adicionada ainda. Adicione pelo menos uma opção.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2 font-bold px-6">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </div>
      </CardContent>

      <Dialog open={editingField !== null} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" /> Editar Campo: {editingField?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-field-label">Nome do Campo</Label>
              <Input
                id="edit-field-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Ex: Garantia (Meses), Fabricante, etc."
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-field-type">Tipo</Label>
              <Select
                value={editType}
                onValueChange={(val: any) => {
                  setEditType(val);
                  if (val !== "dropdown") {
                    setEditOptions([]);
                  }
                }}
              >
                <SelectTrigger id="edit-field-type" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="boolean">Sim / Não</SelectItem>
                  <SelectItem value="currency">Valor Monetário</SelectItem>
                  <SelectItem value="dropdown">Dropdown (Seleção)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editType === "dropdown" && (
              <div className="space-y-3 p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border w-full animate-in fade-in slide-in-from-top-2">
                <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Itens do Dropdown
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={editOptionInput}
                    onChange={(e) => setEditOptionInput(e.target.value)}
                    placeholder="Digite uma opção (ex: Azul, Grande, etc.)"
                    className="rounded-xl"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEditOption();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddEditOption}
                    className="rounded-xl font-semibold"
                  >
                    Adicionar Opção
                  </Button>
                </div>

                {editOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {editOptions.map((opt, idx) => (
                      <span
                        key={idx}
                        className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold"
                      >
                        {opt}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditOption(idx)}
                          className="hover:text-destructive transition-colors focus:outline-none ml-1 text-sm font-bold"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Nenhuma opção adicionada ainda. Adicione pelo menos uma opção.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingField(null)}
              className="rounded-xl font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              className="rounded-xl font-bold"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
