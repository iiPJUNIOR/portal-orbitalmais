"use client";

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Settings as SettingsIcon, ScanText, ShieldCheck, Users, Lock, Type, Info, LayoutList, Loader2, FileCheck, Copy, ExternalLink, AlertTriangle, Presentation, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getUserSettings, saveUserSettings, getAllUsersSettings, updateUserPermission, TypeObject, TypeFieldDef, ResponsabilidadeDef } from "@/services/settingsService";
import { fetchProducts } from "@/services/productService";
import { useSession } from "@/contexts/SessionProvider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { scanDocxTemplate } from "@/utils/docxScanner";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ProductFieldsTab } from "@/components/ProductFieldsTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [sellerName, setSellerName] = useState("");
  const [sellerRole, setSellerRole] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [fontSize, setFontSize] = useState<string>("medium");


  // DOCX Mappings
  const [docxTokens, setDocxTokens] = useState<string[]>([]);
  const [docxMappings, setDocxMappings] = useState<Record<string, string>>({});
  const [scanningDocx, setScanningDocx] = useState(false);

  // DOCX Upload
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [uploadingDocx, setUploadingDocx] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [docxTemplateUrl, setDocxTemplateUrl] = useState<string | null>(null);
  const [showRlsModal, setShowRlsModal] = useState(false);

  // Service DOCX Mappings
  const [serviceDocxTokens, setServiceDocxTokens] = useState<string[]>([]);
  const [serviceDocxMappings, setServiceDocxMappings] = useState<Record<string, string>>({});
  const [scanningServiceDocx, setScanningServiceDocx] = useState(false);

  // Service DOCX Upload
  const [serviceDocxFile, setServiceDocxFile] = useState<File | null>(null);
  const [uploadingServiceDocx, setUploadingServiceDocx] = useState(false);
  const [serviceUploadProgress, setServiceUploadProgress] = useState(0);
  const [serviceDocxTemplateUrl, setServiceDocxTemplateUrl] = useState<string | null>(null);

  const [canAccessSettings, setCanAccessSettings] = useState(true);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [productsStats, setProductsStats] = useState({ total: 0, active: 0, serviceCount: 0, productCount: 0 });
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Tipos de Serviço, Tipos de Junta e Tipos de Material
  const [tiposServico, setTiposServico] = useState<TypeObject[]>([]);
  const [tiposJunta, setTiposJunta] = useState<TypeObject[]>([]);
  const [tiposMaterial, setTiposMaterial] = useState<TypeObject[]>([]);
  const [camposTipoServico, setCamposTipoServico] = useState<TypeFieldDef[]>([]);
  const [camposTipoJunta, setCamposTipoJunta] = useState<TypeFieldDef[]>([]);
  const [camposTipoMaterial, setCamposTipoMaterial] = useState<TypeFieldDef[]>([]);

  // Responsabilidades
  const [responsabilidadesCliente, setResponsabilidadesCliente] = useState<ResponsabilidadeDef[]>([]);
  const [responsabilidadesOrbital, setResponsabilidadesOrbital] = useState<ResponsabilidadeDef[]>([]);
  const [newRespCliente, setNewRespCliente] = useState("");
  const [newRespOrbital, setNewRespOrbital] = useState("");

  // Campos de criação de propriedades customizadas
  const [newFieldLabelServico, setNewFieldLabelServico] = useState("");
  const [newFieldTypeServico, setNewFieldTypeServico] = useState<"text" | "number" | "boolean">("text");
  const [newFieldLabelJunta, setNewFieldLabelJunta] = useState("");
  const [newFieldTypeJunta, setNewFieldTypeJunta] = useState<"text" | "number" | "boolean">("text");
  const [newFieldLabelMaterial, setNewFieldLabelMaterial] = useState("");
  const [newFieldTypeMaterial, setNewFieldTypeMaterial] = useState<"text" | "number" | "boolean">("text");

  // Modal CRUD para tipos
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeModalMode, setTypeModalMode] = useState<"create" | "edit">("create");
  const [typeModalTarget, setTypeModalTarget] = useState<"servico" | "junta" | "material">("servico");
  const [editingTypeObject, setEditingTypeObject] = useState<TypeObject | null>(null);
  const [typeFormName, setTypeFormName] = useState("");
  const [typeFormProperties, setTypeFormProperties] = useState<Record<string, any>>({});

  const PAULO_EMAIL = "paulo.sergio@controlid.com.br";
  const isSuperAdmin = String(user?.email || "").toLowerCase() === PAULO_EMAIL;

  const baseFields = [
    { value: "vendedor", label: "Vendedor (Nome)" },
    { value: "empresa", label: "Empresa (Razão Social)" },
    { value: "cnpj", label: "CNPJ" },
    { value: "empresa_phone", label: "Telefone do Vendedor" },
    { value: "empresa_email", label: "E-mail do Vendedor" },
    { value: "contato_nome", label: "Nome do Contato" },
    { value: "contato_telefone", label: "Telefone do Contato" },
    { value: "endereco", label: "Endereço Completo" },
    { value: "quantidade", label: "Quantidade Total de Itens" },
    { value: "produto", label: "Descrição dos Produtos" },
    { value: "observacoes", label: "Observações" },
    { value: "numeroproposta", label: "Número do Orçamento (Nome do Arquivo)" },
    { value: "versao", label: "Versão / Revisão" },
    { value: "data", label: "Data da Proposta" },
    { value: "valor", label: "Valor Total" },
    { value: "ensaios_inclusos", label: "Ensaios de Laboratório Inclusos (Sim/Não)" },
  ];

  for (let i = 0; i < 10; i++) {
    const numStr = i === 0 ? "" : String(i);
    baseFields.push({ value: `sku${numStr}`, label: `Código do Produto (Item ${i + 1})` });
    baseFields.push({ value: `qtd${numStr}`, label: `Quantidade (Item ${i + 1})` });
    baseFields.push({ value: `valor_item${numStr}`, label: `Valor do Item (Item ${i + 1})` });
  }

  const VISTORIA_FIELDS = baseFields;

  const SERVICO_FIELDS = [
    { value: "none", label: "Não mapeado" },
    { value: "datadoorçamento", label: "Data do Orçamento ({{datadoorçamento}})" },
    { value: "razaosocial", label: "Razão Social ({{razaosocial}})" },
    { value: "emaildocliente", label: "E-mail do Cliente ({{emaildocliente}})" },
    { value: "tipodeservico", label: "Tipo de Serviço ({{tipodeservico}})" },
    { value: "dependencias", label: "Dependências ({{dependencias}})" },
    { value: "tipodematerial", label: "Tipo de Material ({{tipodematerial}})" },
    { value: "tipodejunta", label: "Tipo de Junta ({{tipodejunta}})" },
    { value: "descricaodoservico", label: "Descrição do Serviço ({{descricaodoservico}})" },
    { value: "numerodesoldas", label: "Número de Soldas ({{numerodesoldas}})" },
    { value: "obsservicos", label: "Obs Serviços ({{obsservicos}})" },
    { value: "responsabilidadeorbital", label: "Responsabilidade Orbital ({{responsabilidadeorbital}})" },
    { value: "responsabilidadedocliente", label: "Responsabilidade do Cliente ({{responsabilidadedocliente}})" },
    { value: "prazoexec", label: "Prazo Execução ({{prazoexec}})" },
    { value: "corpodeprova", label: "Corpo de Prova ({{corpodeprova}})" },
    { value: "precototal", label: "Preço Total ({{precototal}})" },
    { value: "porcentagementrada", label: "Porcentagem Entrada ({{porcentagementrada}})" },
    { value: "porcentagemfinal", label: "Porcentagem Final ({{porcentagemfinal}})" },
    { value: "diaspquitcao", label: "Dias para Quitação ({{diaspquitcao}})" },
    { value: "obsresponsabildiadecliente", label: "Obs Responsabilidades Cliente ({{obsresponsabildiadecliente}})" },
  ];



  const loadProductsStats = async () => {
    setLoadingProducts(true);
    try {
      const prods = await fetchProducts();
      const stats = {
        total: prods.length,
        active: prods.filter(p => (p.status || "").toLowerCase() === 'ativo').length,
        serviceCount: prods.filter(p => (p.category || "").toLowerCase() === 'serviço' || (p.category || "").toLowerCase() === 'servico').length,
        productCount: prods.filter(p => (p.category || "").toLowerCase() === 'produto').length,
      };
      setProductsStats(stats);
    } catch (err) {
      console.warn("Failed to load products stats in settings:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await getAllUsersSettings();
      setAllUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    (async () => {
      const s = await getUserSettings();
      if (s) {
        setSellerName(s.seller_name || "");
        setSellerRole(s.seller_role || "");
        setSellerEmail(s.seller_email || "");
        setSellerPhone(s.seller_phone || "");
        setFontSize(s.font_size || "medium");
        setDocxTemplateUrl(s.pptx_template_url || null);
        
        const savedDocx = s.docx_mappings || {};
        setDocxMappings(savedDocx);
        
        // Scan template to ensure we only show keys that exist in the active file
        try {
          const scanned = await scanDocxTemplate(s.pptx_template_url || undefined);
          setDocxTokens(scanned.filter(k => !k.startsWith("__")));
        } catch (err) {
          console.warn("settings: auto-scan on mount failed, falling back to saved keys", err);
          const savedKeys = Object.keys(savedDocx).filter(k => !k.startsWith("__"));
          setDocxTokens(savedKeys);
        }

        setServiceDocxTemplateUrl(s.service_docx_url || null);
        const savedServiceDocx = s.service_docx_mappings || {};
        setServiceDocxMappings(savedServiceDocx);

        // Scan service template
        try {
          const scannedService = await scanDocxTemplate(s.service_docx_url || undefined);
          setServiceDocxTokens(scannedService.filter(k => !k.startsWith("__")));
        } catch (err) {
          console.warn("settings: auto-scan service on mount failed, falling back to saved keys", err);
          const savedServiceKeys = Object.keys(savedServiceDocx).filter(k => !k.startsWith("__"));
          setServiceDocxTokens(savedServiceKeys);
        }

        setCanAccessSettings(true);
        setTiposServico(s.tipos_servico || []);
        setTiposJunta(s.tipos_junta || []);
        setTiposMaterial(s.tipos_material || []);
        setCamposTipoServico(s.campos_tipo_servico || []);
        setCamposTipoJunta(s.campos_tipo_junta || []);
        setCamposTipoMaterial(s.campos_tipo_material || []);
        setResponsabilidadesCliente(s.responsabilidades_cliente || []);
        setResponsabilidadesOrbital(s.responsabilidades_orbital || []);
      } else {
        setCanAccessSettings(true);
      }

      loadProductsStats();

      if (isSuperAdmin) {
        loadAllUsers();
      }
    })();
  }, [user, isSuperAdmin]);



  const toggleUserPermission = async (userId: string, email: string, permission: 'history' | 'settings', currentValue: boolean) => {
    try {
      await updateUserPermission(userId, email, permission, !currentValue);
      toast.success("Permissão atualizada");
      loadAllUsers();
    } catch (err) {
      console.error("Erro permissão:", err);
      toast.error("Erro ao atualizar permissão");
    }
  };

  const handleSaveFontSize = async (value: string) => {
    try {
      setFontSize(value);
      await saveUserSettings({ font_size: value as any });
      toast.success("Tamanho da fonte atualizado!");
    } catch (err) {
      toast.error("Erro ao salvar tamanho da fonte");
    }
  };

  // CRUD de campos customizados para Serviço
  const handleAddFieldServico = async () => {
    const label = newFieldLabelServico.trim();
    if (!label) return;
    const key = `prop_${label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_")}`;
    if (camposTipoServico.some(f => f.key === key)) {
      toast.error("Já existe um campo com este nome.");
      return;
    }
    const newField: TypeFieldDef = { key, label, type: newFieldTypeServico };
    const updated = [...camposTipoServico, newField];
    setCamposTipoServico(updated);
    setNewFieldLabelServico("");
    try {
      await saveUserSettings({ campos_tipo_servico: updated });
      toast.success("Campo adicionado com sucesso!");
    } catch {
      toast.error("Erro ao salvar campo.");
    }
  };

  const handleRemoveFieldServico = async (key: string) => {
    const updated = camposTipoServico.filter(f => f.key !== key);
    setCamposTipoServico(updated);
    try {
      await saveUserSettings({ campos_tipo_servico: updated });
      toast.success("Campo excluído com sucesso!");
    } catch {
      toast.error("Erro ao excluir campo.");
    }
  };

  // CRUD de campos customizados para Junta
  const handleAddFieldJunta = async () => {
    const label = newFieldLabelJunta.trim();
    if (!label) return;
    const key = `prop_${label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_")}`;
    if (camposTipoJunta.some(f => f.key === key)) {
      toast.error("Já existe um campo com este nome.");
      return;
    }
    const newField: TypeFieldDef = { key, label, type: newFieldTypeJunta };
    const updated = [...camposTipoJunta, newField];
    setCamposTipoJunta(updated);
    setNewFieldLabelJunta("");
    try {
      await saveUserSettings({ campos_tipo_junta: updated });
      toast.success("Campo adicionado com sucesso!");
    } catch {
      toast.error("Erro ao salvar campo.");
    }
  };

  const handleRemoveFieldJunta = async (key: string) => {
    const updated = camposTipoJunta.filter(f => f.key !== key);
    setCamposTipoJunta(updated);
    try {
      await saveUserSettings({ campos_tipo_junta: updated });
      toast.success("Campo excluído com sucesso!");
    } catch {
      toast.error("Erro ao excluir campo.");
    }
  };

  // CRUD de campos customizados para Material
  const handleAddFieldMaterial = async () => {
    const label = newFieldLabelMaterial.trim();
    if (!label) return;
    const key = `prop_${label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_")}`;
    if (camposTipoMaterial.some(f => f.key === key)) {
      toast.error("Já existe um campo com este nome.");
      return;
    }
    const newField: TypeFieldDef = { key, label, type: newFieldTypeMaterial };
    const updated = [...camposTipoMaterial, newField];
    setCamposTipoMaterial(updated);
    setNewFieldLabelMaterial("");
    try {
      await saveUserSettings({ campos_tipo_material: updated });
      toast.success("Campo adicionado com sucesso!");
    } catch {
      toast.error("Erro ao salvar campo.");
    }
  };

  const handleRemoveFieldMaterial = async (key: string) => {
    const updated = camposTipoMaterial.filter(f => f.key !== key);
    setCamposTipoMaterial(updated);
    try {
      await saveUserSettings({ campos_tipo_material: updated });
      toast.success("Campo excluído com sucesso!");
    } catch {
      toast.error("Erro ao excluir campo.");
    }
  };

  const handleAddRespCliente = async () => {
    const label = newRespCliente.trim();
    if (!label) return;
    const newItem: ResponsabilidadeDef = { 
      id: `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
      label 
    };
    const updated = [...responsabilidadesCliente, newItem];
    setResponsabilidadesCliente(updated);
    setNewRespCliente("");
    try {
      await saveUserSettings({ responsabilidades_cliente: updated });
      toast.success("Responsabilidade do cliente adicionada!");
    } catch { toast.error("Erro ao salvar."); }
  };

  const handleRemoveRespCliente = async (id: string) => {
    const updated = responsabilidadesCliente.filter(r => r.id !== id);
    setResponsabilidadesCliente(updated);
    try {
      await saveUserSettings({ responsabilidades_cliente: updated });
      toast.success("Responsabilidade removida.");
    } catch { toast.error("Erro ao remover."); }
  };

  const handleAddRespOrbital = async () => {
    const label = newRespOrbital.trim();
    if (!label) return;
    const newItem: ResponsabilidadeDef = { 
      id: `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
      label 
    };
    const updated = [...responsabilidadesOrbital, newItem];
    setResponsabilidadesOrbital(updated);
    setNewRespOrbital("");
    try {
      await saveUserSettings({ responsabilidades_orbital: updated });
      toast.success("Responsabilidade Orbitalmais adicionada!");
    } catch { toast.error("Erro ao salvar."); }
  };

  const handleRemoveRespOrbital = async (id: string) => {
    const updated = responsabilidadesOrbital.filter(r => r.id !== id);
    setResponsabilidadesOrbital(updated);
    try {
      await saveUserSettings({ responsabilidades_orbital: updated });
      toast.success("Responsabilidade removida.");
    } catch { toast.error("Erro ao remover."); }
  };

  // Modal CRUD handlers para Tipos
  const handleOpenTypeModal = (target: "servico" | "junta" | "material", mode: "create" | "edit", item?: TypeObject) => {
    setTypeModalTarget(target);
    setTypeModalMode(mode);
    setEditingTypeObject(item || null);
    if (mode === "edit" && item) {
      setTypeFormName(item.name);
      setTypeFormProperties(item.properties || {});
    } else {
      setTypeFormName("");
      const initialProps: Record<string, any> = {};
      const fields = target === "servico" 
        ? camposTipoServico 
        : target === "junta" 
          ? camposTipoJunta 
          : camposTipoMaterial;
      fields.forEach(f => {
        initialProps[f.key] = f.type === "boolean" ? false : "";
      });
      setTypeFormProperties(initialProps);
    }
    setShowTypeModal(true);
  };

  const handleSaveType = async () => {
    const name = typeFormName.trim();
    if (!name) {
      toast.error("O nome é obrigatório.");
      return;
    }

    const targetList = typeModalTarget === "servico" 
      ? tiposServico 
      : typeModalTarget === "junta" 
        ? tiposJunta 
        : tiposMaterial;
    
    // Check duplication in creation
    if (typeModalMode === "create" && targetList.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      const targetLabel = typeModalTarget === "servico" 
        ? "serviço" 
        : typeModalTarget === "junta" 
          ? "junta" 
          : "material";
      toast.error(`Este tipo de ${targetLabel} já existe.`);
      return;
    }

    let updatedList: TypeObject[];
    if (typeModalMode === "edit" && editingTypeObject) {
      updatedList = targetList.map(t => t.id === editingTypeObject.id ? { ...t, name, properties: typeFormProperties } : t);
    } else {
      const newItem: TypeObject = {
        id: `type-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        properties: typeFormProperties
      };
      updatedList = [...targetList, newItem];
    }

    if (typeModalTarget === "servico") {
      setTiposServico(updatedList);
      try {
        await saveUserSettings({ tipos_servico: updatedList });
        toast.success("Tipo de serviço salvo com sucesso!");
      } catch {
        toast.error("Erro ao salvar tipo de serviço.");
      }
    } else if (typeModalTarget === "junta") {
      setTiposJunta(updatedList);
      try {
        await saveUserSettings({ tipos_junta: updatedList });
        toast.success("Tipo de junta salvo com sucesso!");
      } catch {
        toast.error("Erro ao salvar tipo de junta.");
      }
    } else {
      setTiposMaterial(updatedList);
      try {
        await saveUserSettings({ tipos_material: updatedList });
        toast.success("Tipo de material salvo com sucesso!");
      } catch {
        toast.error("Erro ao salvar tipo de material.");
      }
    }
    setShowTypeModal(false);
  };

  const handleDeleteType = async (target: "servico" | "junta" | "material", id: string) => {
    const targetList = target === "servico" 
      ? tiposServico 
      : target === "junta" 
        ? tiposJunta 
        : tiposMaterial;
    const updatedList = targetList.filter(t => t.id !== id);

    if (target === "servico") {
      setTiposServico(updatedList);
      try {
        await saveUserSettings({ tipos_servico: updatedList });
        toast.success("Tipo de serviço excluído.");
      } catch {
        toast.error("Erro ao excluir tipo de serviço.");
      }
    } else if (target === "junta") {
      setTiposJunta(updatedList);
      try {
        await saveUserSettings({ tipos_junta: updatedList });
        toast.success("Tipo de junta excluído.");
      } catch {
        toast.error("Erro ao excluir tipo de junta.");
      }
    } else {
      setTiposMaterial(updatedList);
      try {
        await saveUserSettings({ tipos_material: updatedList });
        toast.success("Tipo de material excluído.");
      } catch {
        toast.error("Erro ao excluir tipo de material.");
      }
    }
  };



  const handleScanDocx = async () => {
    setScanningDocx(true);
    try {
      const tokens = await scanDocxTemplate();
      const filtered = tokens.filter(k => !k.startsWith("__"));
      setDocxTokens(filtered);

      const nextMappings = { ...docxMappings };
      tokens.forEach(t => {
        if (nextMappings[t] === undefined) nextMappings[t] = "";
      });

      setDocxMappings(nextMappings);
      await saveUserSettings({ docx_mappings: nextMappings });

      if (tokens.length > 0) {
        toast.success(`${tokens.length} tokens encontrados.`);
      } else {
        toast.info("Nenhum novo token encontrado no template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao escanear template.");
    } finally {
      setScanningDocx(false);
    }
  };

  const handleUpdateDocxMapping = async (token: string, field: string) => {
    const next = { ...docxMappings, [token]: field };
    setDocxMappings(next);
    try {
      await saveUserSettings({ docx_mappings: next });
      // success toast is handled by individual change if desired, but here we just ensure state is updated
    } catch (err) {
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleFetchDocxMappings = async () => {
    try {
      const tId = toast.loading("Buscando mapeamentos salvos no banco de dados...");
      const s = await getUserSettings();
      if (s?.docx_mappings) {
        setDocxMappings(s.docx_mappings);
        
        const savedKeys = Object.keys(s.docx_mappings).filter(k => !k.startsWith("__"));
        if (savedKeys.length > 0 && docxTokens.length === 0) {
          setDocxTokens(savedKeys);
        }
        
        toast.success("Mapeamentos baixados do banco de dados!", { id: tId });
      } else {
        toast.info("Nenhum mapeamento encontrado no banco de dados.", { id: tId });
      }
    } catch (err) {
      console.error("Failed to fetch docx mappings", err);
      toast.error("Erro ao baixar mapeamentos do banco de dados.");
    }
  };

  const handleUploadDocx = async () => {
    if (!docxFile) return;
    setUploadingDocx(true);
    setUploadProgress(10);
    
    // Simulate upload progress animation
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return 90;
        const remaining = 90 - prev;
        return Math.min(90, prev + Math.ceil(remaining * 0.15));
      });
    }, 300);

    try {
      const bucketName = "templates";
      const fileName = `proposal-template-${Date.now()}.docx`;

      // Upload file directly using Supabase SDK (handles session and boundary headers automatically)
      const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, docxFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      clearInterval(progressInterval);
      setUploadProgress(100);

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      await saveUserSettings({ pptx_template_url: publicUrl });
      setDocxTemplateUrl(publicUrl);
      setDocxFile(null);
      toast.success("Template DOCX enviado com sucesso!");

      // Clean up old templates, keeping only the 2 most recent ones
      try {
        const { data: files, error: listError } = await supabase.storage.from(bucketName).list();
        if (!listError && files) {
          const docxTemplates = files.filter(f => f.name.startsWith("proposal-template-") && f.name.endsWith(".docx"));
          if (docxTemplates.length > 2) {
            // Sort ascending chronologically (oldest first)
            docxTemplates.sort((a, b) => {
              const timeA = parseInt(a.name.replace("proposal-template-", "").replace(".docx", ""), 10) || 0;
              const timeB = parseInt(b.name.replace("proposal-template-", "").replace(".docx", ""), 10) || 0;
              return timeA - timeB;
            });
            const filesToDelete = docxTemplates.slice(0, docxTemplates.length - 2).map(f => f.name);
            if (filesToDelete.length > 0) {
              await supabase.storage.from(bucketName).remove(filesToDelete);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("Failed to auto-clean old templates:", cleanupErr);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Upload error:", err);
      const errMsg = String(err?.message || err || "").toLowerCase();
      const isRlsError = errMsg.includes("row-level security") || 
                         errMsg.includes("security policy") || 
                         errMsg.includes("violates row-level") ||
                         errMsg.includes("policy");
      if (isRlsError) {
        setShowRlsModal(true);
      }
      toast.error("Erro ao subir template: " + (err?.message || String(err)));
    } finally {
      setUploadingDocx(false);
      setTimeout(() => setUploadProgress(0), 2500);
    }
  };

  const handleScanServiceDocx = async () => {
    setScanningServiceDocx(true);
    try {
      const tokens = await scanDocxTemplate(serviceDocxTemplateUrl || undefined);
      const filtered = tokens.filter(k => !k.startsWith("__"));
      setServiceDocxTokens(filtered);

      const nextMappings = { ...serviceDocxMappings };
      tokens.forEach(t => {
        if (nextMappings[t] === undefined) nextMappings[t] = "";
      });

      setServiceDocxMappings(nextMappings);
      await saveUserSettings({ service_docx_mappings: nextMappings });

      if (tokens.length > 0) {
        toast.success(`${tokens.length} tokens de serviço encontrados.`);
      } else {
        toast.info("Nenhum novo token de serviço encontrado no template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao escanear template de serviços.");
    } finally {
      setScanningServiceDocx(false);
    }
  };

  const handleUpdateServiceDocxMapping = async (token: string, field: string) => {
    const next = { ...serviceDocxMappings, [token]: field };
    setServiceDocxMappings(next);
    try {
      await saveUserSettings({ service_docx_mappings: next });
    } catch (err) {
      toast.error("Erro ao salvar mapeamento de serviço");
    }
  };

  const handleFetchServiceDocxMappings = async () => {
    try {
      const tId = toast.loading("Buscando mapeamentos de serviço salvos no banco de dados...");
      const s = await getUserSettings();
      if (s?.service_docx_mappings) {
        setServiceDocxMappings(s.service_docx_mappings);
        
        const savedKeys = Object.keys(s.service_docx_mappings).filter(k => !k.startsWith("__"));
        if (savedKeys.length > 0 && serviceDocxTokens.length === 0) {
          setServiceDocxTokens(savedKeys);
        }
        
        toast.success("Mapeamentos de serviço baixados do banco de dados!", { id: tId });
      } else {
        toast.info("Nenhum mapeamento de serviço encontrado no banco de dados.", { id: tId });
      }
    } catch (err) {
      console.error("Failed to fetch service docx mappings", err);
      toast.error("Erro ao baixar mapeamentos de serviço do banco de dados.");
    }
  };

  const handleUploadServiceDocx = async () => {
    if (!serviceDocxFile) return;
    setUploadingServiceDocx(true);
    setServiceUploadProgress(10);
    
    const progressInterval = setInterval(() => {
      setServiceUploadProgress(prev => {
        if (prev >= 90) return 90;
        const remaining = 90 - prev;
        return Math.min(90, prev + Math.ceil(remaining * 0.15));
      });
    }, 300);

    try {
      const bucketName = "templates";
      const fileName = `service-template-${Date.now()}.docx`;

      const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, serviceDocxFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      clearInterval(progressInterval);
      setServiceUploadProgress(100);

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      await saveUserSettings({ service_docx_url: publicUrl });
      setServiceDocxTemplateUrl(publicUrl);
      setServiceDocxFile(null);
      toast.success("Template DOCX de serviços enviado com sucesso!");

      // Clean up old templates
      try {
        const { data: files, error: listError } = await supabase.storage.from(bucketName).list();
        if (!listError && files) {
          const docxTemplates = files.filter(f => f.name.startsWith("service-template-") && f.name.endsWith(".docx"));
          if (docxTemplates.length > 2) {
            docxTemplates.sort((a, b) => {
              const timeA = parseInt(a.name.replace("service-template-", "").replace(".docx", ""), 10) || 0;
              const timeB = parseInt(b.name.replace("service-template-", "").replace(".docx", ""), 10) || 0;
              return timeA - timeB;
            });
            const filesToDelete = docxTemplates.slice(0, docxTemplates.length - 2).map(f => f.name);
            if (filesToDelete.length > 0) {
              await supabase.storage.from(bucketName).remove(filesToDelete);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("Failed to auto-clean old service templates:", cleanupErr);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Upload error:", err);
      toast.error("Erro ao subir template de serviço: " + (err?.message || String(err)));
    } finally {
      setUploadingServiceDocx(false);
      setTimeout(() => setServiceUploadProgress(0), 2500);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    try {
      await saveUserSettings({
        seller_name: sellerName,
        seller_role: sellerRole,
        seller_email: sellerEmail,
        seller_phone: sellerPhone
      });
      toast.success("Perfil atualizado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      toast.error("Erro ao salvar perfil: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopySql = () => {
    const sqlText = `-- DELETAR POLÍTICAS ANTIGAS SE EXISTIREM\n` +
      `DROP POLICY IF EXISTS "Leitura pública de templates" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Inserção de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Inserção de templates por qualquer usuário" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Atualização de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Atualização de templates por qualquer usuário" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Deleção de templates por usuários autenticados" ON storage.objects;\n` +
      `DROP POLICY IF EXISTS "Deleção de templates por qualquer usuário" ON storage.objects;\n` +
      `\n` +
      `-- CRIAR NOVAS POLÍTICAS PARA O BUCKET DE TEMPLATES (storage.objects)\n` +
      `-- 1. Permitir leitura pública dos arquivos do bucket 'templates'\n` +
      `CREATE POLICY "Leitura pública de templates" ON storage.objects FOR SELECT USING (bucket_id = 'templates');\n` +
      `\n` +
      `-- 2. Permitir inserção por qualquer usuário (autenticado ou anônimo)\n` +
      `CREATE POLICY "Inserção de templates por qualquer usuário" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'templates');\n` +
      `\n` +
      `-- 3. Permitir atualização por qualquer usuário\n` +
      `CREATE POLICY "Atualização de templates por qualquer usuário" ON storage.objects FOR UPDATE USING (bucket_id = 'templates') WITH CHECK (bucket_id = 'templates');\n` +
      `\n` +
      `-- 4. Permitir deleção por qualquer usuário\n` +
      `CREATE POLICY "Deleção de templates por qualquer usuário" ON storage.objects FOR DELETE USING (bucket_id = 'templates');`;
    navigator.clipboard.writeText(sqlText);
    toast.success("Código SQL copiado para a área de transferência!");
  };

  const docxMappedCount = Object.keys(docxMappings || {}).filter(k => docxMappings[k] && docxMappings[k] !== "none").length;
  const docxTotalTokens = docxTokens.length;
  const serviceDocxMappedCount = Object.keys(serviceDocxMappings || {}).filter(k => serviceDocxMappings[k] && serviceDocxMappings[k] !== "none").length;
  const serviceDocxTotalTokens = serviceDocxTokens.length;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          {!canAccessSettings && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Algumas seções estão restritas ao administrador.
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
      </div>

      <Tabs defaultValue="geral" className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full h-auto p-1 bg-muted rounded-2xl">
          <TabsTrigger value="geral" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background flex items-center justify-center gap-2">
            <Users className="h-4 w-4" /> Geral & Perfil
          </TabsTrigger>
          <TabsTrigger value="qualification" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background text-orange-600 dark:text-orange-400 data-[state=active]:text-orange-600 flex items-center justify-center gap-2">
            <ClipboardList className="h-4 w-4" /> Qualificação
          </TabsTrigger>
          <TabsTrigger value="service" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background text-primary data-[state=active]:text-primary flex items-center justify-center gap-2">
            <Presentation className="h-4 w-4" /> Serviço
          </TabsTrigger>
          <TabsTrigger value="bases" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background flex items-center justify-center gap-2">
            <LayoutList className="h-4 w-4" /> Bases de Produtos
          </TabsTrigger>
          <TabsTrigger value="tipos" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background text-indigo-600 dark:text-indigo-400 data-[state=active]:text-indigo-600 flex items-center justify-center gap-2">
            <Type className="h-4 w-4" /> Tipos
          </TabsTrigger>
          <TabsTrigger value="responsabilidades" className="rounded-xl py-2.5 font-bold data-[state=active]:bg-background text-rose-600 dark:text-rose-400 data-[state=active]:text-rose-600 flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Responsabilidades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 focus-visible:ring-0 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Type className="h-5 w-5" />
                    Preferências de Interface
                  </CardTitle>
                  <CardDescription>Ajuste como o sistema aparece para você.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tamanho do Texto Global</Label>
                    <Select value={fontSize} onValueChange={handleSaveFontSize}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha um tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Pequeno (Compacto)</SelectItem>
                        <SelectItem value="medium">Médio (Padrão)</SelectItem>
                        <SelectItem value="large">Grande</SelectItem>
                        <SelectItem value="extra-large">Extra Grande</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {isSuperAdmin && (
                <Card className="bg-green-50/30 border-green-100">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-green-600" /> Gestão de Usuários</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {allUsers.map(u => (
                      <div key={u.user_id} className="flex items-center justify-between p-3 bg-card border rounded-xl">
                        <div>
                          <p className="font-bold text-sm">{u.seller_name || "Sem Nome"}</p>
                          <p className="text-xs text-muted-foreground">{u.seller_email}</p>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex flex-col items-end text-[10px]">
                            <span>Histórico</span>
                            <Switch checked={!!u.can_view_history} onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email, 'history', !!u.can_view_history)} />
                          </div>
                          <div className="flex flex-col items-end text-[10px]">
                            <span>Configurações</span>
                            <Switch checked={!!u.can_access_settings} onCheckedChange={() => toggleUserPermission(u.user_id, u.seller_email, 'settings', !!u.can_access_settings)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="lg:col-span-1">
              <Card className="shadow-md overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Perfil do Vendedor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2"><Label>Nome Completo</Label><Input value={sellerName} onChange={e => setSellerName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Cargo</Label><Input value={sellerRole} onChange={e => setSellerRole(e.target.value)} /></div>
                  <div className="space-y-2"><Label>E-mail</Label><Input value={sellerEmail} onChange={e => setSellerEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Telefone</Label><Input value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} /></div>
                  <Button onClick={handleSaveProfile} className="w-full font-bold bg-primary hover:bg-primary/95 text-white" disabled={savingProfile}>
                    {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar Perfil
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="qualification" className="space-y-6 focus-visible:ring-0 outline-none">
          {!canAccessSettings ? (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de bases e mapeamentos são limitadas a administradores.</p>
            </Card>
          ) : (
            <>
              <Card className="border-orange-500/20 shadow-lg">
                <CardHeader className="bg-orange-500/10 dark:bg-orange-500/5">
                  <CardTitle className="flex items-center gap-2">
                    <ScanText className="h-5 w-5 text-orange-500" />
                    Template DOCX de Qualificação
                  </CardTitle>
                  <CardDescription>Gerencie o arquivo de template Word (.docx) para as propostas de qualificação.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="p-4 bg-muted/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Template Ativo:</p>
                      <p className="text-xs text-muted-foreground break-all max-w-md">
                        {docxTemplateUrl ? docxTemplateUrl : "Padrão do Sistema (/Solicitação de vistoria.docx)"}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(docxTemplateUrl || "/proposal-template.docx", "_blank")}
                        className="rounded-xl w-full sm:w-auto border-orange-200 text-orange-600 hover:bg-orange-50"
                      >
                        Ver/Baixar Arquivo
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-semibold text-sm text-orange-600 dark:text-orange-400">Alterar Template (Subir arquivo .docx)</Label>
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <Input
                        type="file"
                        accept=".docx"
                        onChange={(e) => { setDocxFile(e.target.files?.[0] || null); setUploadProgress(0); }}
                        className="rounded-xl bg-background cursor-pointer"
                        disabled={uploadingDocx}
                      />
                      <Button
                        onClick={handleUploadDocx}
                        disabled={!docxFile || uploadingDocx}
                        className="rounded-xl shrink-0 font-bold w-full sm:w-auto min-w-[160px] bg-orange-600 hover:bg-orange-500 text-white"
                      >
                        {uploadingDocx
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{uploadProgress > 0 ? `${uploadProgress}%` : "Preparando..."}</>
                          : "Subir Novo Template"}
                      </Button>
                    </div>

                    {uploadingDocx && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>Enviando arquivo...</span>
                          <span className="font-bold text-orange-500">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-2.5 rounded-full transition-all duration-300 ease-out bg-orange-500"
                            style={{
                              width: `${uploadProgress}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {docxFile && !uploadingDocx && (
                      <p className="text-xs text-muted-foreground">
                        Arquivo selecionado: <strong>{docxFile.name}</strong> ({(docxFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground italic">
                      * O template deve conter variáveis no formato <code className="bg-muted px-1 rounded">{"{{companyName}}"}</code> para funcionar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="border rounded-2xl overflow-hidden shadow-sm bg-card border-orange-500/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border-b gap-4 bg-orange-500/[0.02]">
                  <div className="flex items-center gap-3">
                    <FileCheck className="h-5 w-5 text-orange-500" />
                    <div>
                      <div className="font-bold text-lg">Mapeamento de Qualificação (DOCX)</div>
                      <div className="text-xs text-muted-foreground">
                        {docxMappedCount} mapeado(s) {docxTotalTokens ? `• ${docxTotalTokens} token(s) detectado(s)` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <Button size="sm" variant="outline" onClick={handleScanDocx} disabled={scanningDocx} className="h-8 border-orange-200 text-orange-600 hover:bg-orange-50">
                      {scanningDocx ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanText className="h-4 w-4 mr-2" />}
                      Escanear Template
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleFetchDocxMappings} className="h-8 hover:bg-orange-50 text-orange-600">
                      Recarregar do Banco
                    </Button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Associe as tags encontradas no DOCX de qualificação aos campos correspondentes do sistema.
                  </p>

                  {docxTokens.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {docxTokens.map(token => (
                        <div key={token} className="flex flex-col gap-2 p-3 bg-muted/30 border rounded-xl shadow-sm">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="text-xs font-bold bg-orange-500/10 text-orange-600 px-2 py-1 rounded shrink-0">
                              {"{{"}{token}{"}}"}
                            </span>
                            <div className="flex-1">
                              <Select
                                value={docxMappings[token] ?? ""}
                                onValueChange={(val) => handleUpdateDocxMapping(token, val)}
                              >
                                <SelectTrigger className="h-9 focus:ring-orange-500">
                                  <SelectValue placeholder="Selecione o campo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- Ignorar --</SelectItem>
                                  {VISTORIA_FIELDS.map(f => (
                                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {docxMappings[token] === "ensaios_inclusos" && (
                            <div className="mt-2 grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Sim</Label>
                                <Input
                                  className="h-8 text-xs rounded-xl"
                                  placeholder="Ex: já"
                                  value={docxMappings["__ensaios_yes"] ?? ""}
                                  onChange={(e) => handleUpdateDocxMapping("__ensaios_yes", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-neutral-500 font-bold uppercase">Texto se Não</Label>
                                <Input
                                  className="h-8 text-xs rounded-xl"
                                  placeholder="Ex: não"
                                  value={docxMappings["__ensaios_no"] ?? ""}
                                  onChange={(e) => handleUpdateDocxMapping("__ensaios_no", e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground italic">
                      Nenhum token de qualificação detectado. Clique em "Escanear" para ler o template.
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t">
                    <Button className="bg-orange-600 hover:bg-orange-500 text-white font-bold" onClick={async () => {
                      const tId = toast.loading("Salvando mapeamentos no banco de dados...");
                      try {
                        await saveUserSettings({ docx_mappings: docxMappings });
                        toast.success("Mapeamentos de qualificação salvos com sucesso!", { id: tId });
                      } catch (err) {
                        toast.error("Erro ao salvar mapeamentos.", { id: tId });
                      }
                    }}>
                      Salvar Mapeamentos
                    </Button>
                  </div>
                </div>
              </div>


            </>
          )}
        </TabsContent>

        <TabsContent value="service" className="space-y-6 focus-visible:ring-0 outline-none">
          {!canAccessSettings ? (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de bases e mapeamentos são limitadas a administradores.</p>
            </Card>
          ) : (
            <>
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="bg-primary/10 dark:bg-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <ScanText className="h-5 w-5 text-primary" />
                    Template DOCX de Serviços
                  </CardTitle>
                  <CardDescription>Gerencie o arquivo de template Word (.docx) para as propostas de serviços.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="p-4 bg-muted/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Template Ativo:</p>
                      <p className="text-xs text-muted-foreground break-all max-w-md">
                        {serviceDocxTemplateUrl ? serviceDocxTemplateUrl : "Padrão do Sistema (/Solicitação de vistoria.docx)"}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(serviceDocxTemplateUrl || "/proposal-template.docx", "_blank")}
                        className="rounded-xl w-full sm:w-auto"
                        disabled={!serviceDocxTemplateUrl}
                      >
                        Ver/Baixar Arquivo
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-semibold text-sm text-primary">Alterar Template de Serviço (Subir arquivo .docx)</Label>
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <Input
                        type="file"
                        accept=".docx"
                        onChange={(e) => { setServiceDocxFile(e.target.files?.[0] || null); setServiceUploadProgress(0); }}
                        className="rounded-xl bg-background cursor-pointer"
                        disabled={uploadingServiceDocx}
                      />
                      <Button
                        onClick={handleUploadServiceDocx}
                        disabled={!serviceDocxFile || uploadingServiceDocx}
                        className="rounded-xl shrink-0 font-bold w-full sm:w-auto min-w-[160px] bg-primary hover:bg-primary/90 text-white"
                      >
                        {uploadingServiceDocx
                          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{serviceUploadProgress > 0 ? `${serviceUploadProgress}%` : "Preparando..."}</>
                          : "Subir Novo Template"}
                      </Button>
                    </div>

                    {uploadingServiceDocx && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>Enviando arquivo...</span>
                          <span className="font-bold text-primary">{serviceUploadProgress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-2.5 rounded-full transition-all duration-300 ease-out bg-primary"
                            style={{
                              width: `${serviceUploadProgress}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {serviceDocxFile && !uploadingServiceDocx && (
                      <p className="text-xs text-muted-foreground">
                        Arquivo selecionado: <strong>{serviceDocxFile.name}</strong> ({(serviceDocxFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground italic">
                      * O template de serviço deve conter variáveis como <code className="bg-muted px-1 rounded">{"{{razaosocial}}"}</code> ou <code className="bg-muted px-1 rounded">{"{{precototal}}"}</code> para funcionar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="border rounded-2xl overflow-hidden shadow-sm bg-card border-primary/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border-b gap-4 bg-primary/[0.02]">
                  <div className="flex items-center gap-3">
                    <FileCheck className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-bold text-lg">Mapeamento de Serviços (DOCX)</div>
                      <div className="text-xs text-muted-foreground">
                        {serviceDocxMappedCount} mapeado(s) {serviceDocxTotalTokens ? `• ${serviceDocxTotalTokens} token(s) detectado(s)` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <Button size="sm" variant="outline" onClick={handleScanServiceDocx} disabled={scanningServiceDocx} className="h-8 border-primary/25 text-primary hover:bg-primary/5">
                      {scanningServiceDocx ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanText className="h-4 w-4 mr-2" />}
                      Escanear Template
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleFetchServiceDocxMappings} className="h-8 hover:bg-primary/5 text-primary">
                      Recarregar do Banco
                    </Button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Associe as tags encontradas no DOCX aos campos correspondentes do formulário de serviço.
                  </p>

                  {serviceDocxTokens.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {serviceDocxTokens.map(token => (
                        <div key={token} className="flex flex-col gap-2 p-3 bg-muted/30 border rounded-xl shadow-sm">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded shrink-0">
                              {"{{"}{token}{"}}"}
                            </span>
                            <div className="flex-1">
                              <Select
                                value={serviceDocxMappings[token] ?? ""}
                                onValueChange={(val) => handleUpdateServiceDocxMapping(token, val)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione o campo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-- Ignorar --</SelectItem>
                                  {SERVICO_FIELDS.map(f => (
                                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground italic">
                      Nenhum token de serviço detectado. Clique em "Escanear" para ler o template de serviços.
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t">
                    <Button className="font-bold bg-primary hover:bg-primary/90 text-white" onClick={async () => {
                      const tId = toast.loading("Salvando mapeamentos de serviço no banco de dados...");
                      try {
                        await saveUserSettings({ service_docx_mappings: serviceDocxMappings });
                        toast.success("Mapeamentos de serviço salvos com sucesso!", { id: tId });
                      } catch (err) {
                        toast.error("Erro ao salvar mapeamentos de serviço.", { id: tId });
                      }
                    }}>
                      Salvar Mapeamentos de Serviço
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="bases" className="space-y-6 focus-visible:ring-0 outline-none">
          {!canAccessSettings ? (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de bases e mapeamentos são limitadas a administradores.</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Card 1: Base de Dados Ativa do Sistema */}
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="bg-primary/[0.02] border-b pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold">Base de Dados Interna (Produtos & Serviços)</CardTitle>
                        <CardDescription className="text-xs mt-0.5">Catálogo de itens cadastrados diretamente e ativos no sistema.</CardDescription>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Conectada e Ativa
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Neste sistema, os produtos e serviços são cadastrados e atualizados diretamente no banco de dados, sem a necessidade de planilhas externas. A base de dados principal está ativa e respondendo normalmente com as estatísticas abaixo:
                  </p>

                  {loadingProducts ? (
                    <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Carregando estatísticas...</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 bg-muted/40 rounded-2xl border text-center space-y-1">
                        <span className="text-xs text-muted-foreground font-semibold block">Total de Itens</span>
                        <strong className="text-2xl font-black text-foreground">{productsStats.total}</strong>
                      </div>
                      <div className="p-4 bg-muted/40 rounded-2xl border text-center space-y-1">
                        <span className="text-xs text-muted-foreground font-semibold block">Produtos</span>
                        <strong className="text-2xl font-black text-blue-600 dark:text-blue-400">{productsStats.productCount}</strong>
                      </div>
                      <div className="p-4 bg-muted/40 rounded-2xl border text-center space-y-1">
                        <span className="text-xs text-muted-foreground font-semibold block">Serviços</span>
                        <strong className="text-2xl font-black text-orange-600 dark:text-orange-400">{productsStats.serviceCount}</strong>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t">
                    <Button onClick={() => navigate("/products")} className="font-bold gap-2 rounded-xl">
                      <ExternalLink className="h-4 w-4" /> Gerenciar Catálogo (Produtos & Serviços)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <ProductFieldsTab />
            </div>
          )}
        </TabsContent>

        <TabsContent value="tipos" className="space-y-6 focus-visible:ring-0 outline-none">
          {!canAccessSettings ? (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de tipos de serviços e juntas são limitadas a administradores.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
              {/* Card 1: Tipos de Serviço */}
              <Card className="border-primary/20 shadow-md rounded-3xl">
                <CardHeader className="bg-primary/[0.02] border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                      <Presentation className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">Tipos de Serviço</CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-medium">Gerencie os tipos de serviços e seus atributos.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Seção A: Propriedades Customizadas */}
                  <div className="space-y-4 p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Propriedades Customizadas do Serviço</h4>
                    <div className="flex flex-col sm:flex-row gap-2 items-end pt-1">
                      <div className="space-y-1 w-full sm:flex-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome do Atributo</Label>
                        <Input
                          placeholder="Ex: Sigla, Categoria, etc."
                          value={newFieldLabelServico}
                          onChange={(e) => setNewFieldLabelServico(e.target.value)}
                          className="rounded-xl h-9 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddFieldServico();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1 w-full sm:w-28">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                        <Select value={newFieldTypeServico} onValueChange={(val: any) => setNewFieldTypeServico(val)}>
                          <SelectTrigger className="rounded-xl h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="boolean">Sim / Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddFieldServico} size="sm" className="rounded-xl font-bold h-9 text-xs shrink-0">
                        <Plus className="h-3 w-3 mr-1" /> Adicionar Campo
                      </Button>
                    </div>

                    {/* Lista de campos adicionados */}
                    {camposTipoServico.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                        {camposTipoServico.map(f => (
                          <span key={f.key} className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold">
                            {f.label} ({f.type === "boolean" ? "Sim/Não" : f.type === "number" ? "Núm." : "Texto"})
                            <button
                              type="button"
                              onClick={() => handleRemoveFieldServico(f.key)}
                              className="text-destructive hover:text-destructive/80 font-black ml-1 text-sm leading-none"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Nenhuma propriedade customizada criada para serviço.</p>
                    )}
                  </div>

                  {/* Seção B: Itens Cadastrados */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Tipos de Serviço Ativos</h4>
                      <Button onClick={() => handleOpenTypeModal("servico", "create")} size="sm" className="rounded-xl font-bold gap-1 text-xs">
                        <Plus className="h-3.5 w-3.5" /> Cadastrar Tipo
                      </Button>
                    </div>

                    {/* Lista de tipos cadastrados */}
                    <div className="border rounded-2xl overflow-hidden bg-card divide-y max-h-[400px] overflow-y-auto">
                      {tiposServico.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground text-center italic">Nenhum tipo de serviço cadastrado.</p>
                      ) : (
                        tiposServico.map((item) => (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                            <div className="space-y-1">
                              <span className="font-bold text-sm text-foreground block">{item.name}</span>
                              {Object.keys(item.properties || {}).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {camposTipoServico.map(f => {
                                    const val = item.properties?.[f.key];
                                    if (val === undefined || val === null || val === "") return null;
                                    const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                                    return (
                                      <span key={f.key} className="text-[10px] bg-muted border px-2 py-0.5 rounded-md text-muted-foreground font-medium">
                                        <strong>{f.label}:</strong> {displayVal}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenTypeModal("servico", "edit", item)}
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteType("servico", item.id)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                title="Remover"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Tipos de Junta */}
              <Card className="border-indigo-500/20 shadow-md rounded-3xl">
                <CardHeader className="bg-indigo-500/[0.02] border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
                      <Type className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">Tipos de Junta</CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-medium">Gerencie os tipos de junta e seus atributos.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Seção A: Propriedades Customizadas */}
                  <div className="space-y-4 p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Propriedades Customizadas da Junta</h4>
                    <div className="flex flex-col sm:flex-row gap-2 items-end pt-1">
                      <div className="space-y-1 w-full sm:flex-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome do Atributo</Label>
                        <Input
                          placeholder="Ex: Espessura, Ângulo, etc."
                          value={newFieldLabelJunta}
                          onChange={(e) => setNewFieldLabelJunta(e.target.value)}
                          className="rounded-xl h-9 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddFieldJunta();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1 w-full sm:w-28">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                        <Select value={newFieldTypeJunta} onValueChange={(val: any) => setNewFieldTypeJunta(val)}>
                          <SelectTrigger className="rounded-xl h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="boolean">Sim / Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddFieldJunta} size="sm" className="rounded-xl font-bold h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-none shrink-0">
                        <Plus className="h-3 w-3 mr-1" /> Adicionar Campo
                      </Button>
                    </div>

                    {/* Lista de campos adicionados */}
                    {camposTipoJunta.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                        {camposTipoJunta.map(f => (
                          <span key={f.key} className="flex items-center gap-1.5 text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full font-semibold">
                            {f.label} ({f.type === "boolean" ? "Sim/Não" : f.type === "number" ? "Núm." : "Texto"})
                            <button
                              type="button"
                              onClick={() => handleRemoveFieldJunta(f.key)}
                              className="text-destructive hover:text-destructive/80 font-black ml-1 text-sm leading-none"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Nenhuma propriedade customizada criada para junta.</p>
                    )}
                  </div>

                  {/* Seção B: Itens Cadastrados */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Tipos de Junta Ativos</h4>
                      <Button onClick={() => handleOpenTypeModal("junta", "create")} size="sm" className="rounded-xl font-bold gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-none">
                        <Plus className="h-3.5 w-3.5" /> Cadastrar Tipo
                      </Button>
                    </div>

                    {/* Lista de tipos cadastrados */}
                    <div className="border rounded-2xl overflow-hidden bg-card divide-y max-h-[400px] overflow-y-auto">
                      {tiposJunta.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground text-center italic">Nenhum tipo de junta cadastrado.</p>
                      ) : (
                        tiposJunta.map((item) => (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                            <div className="space-y-1">
                              <span className="font-bold text-sm text-foreground block">{item.name}</span>
                              {Object.keys(item.properties || {}).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {camposTipoJunta.map(f => {
                                    const val = item.properties?.[f.key];
                                    if (val === undefined || val === null || val === "") return null;
                                    const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                                    return (
                                      <span key={f.key} className="text-[10px] bg-muted border px-2 py-0.5 rounded-md text-muted-foreground font-medium">
                                        <strong>{f.label}:</strong> {displayVal}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenTypeModal("junta", "edit", item)}
                                className="h-8 w-8 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-500/10 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteType("junta", item.id)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                title="Remover"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Tipos de Material */}
              <Card className="border-amber-500/20 shadow-md rounded-3xl">
                <CardHeader className="bg-amber-500/[0.02] border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400">
                      <LayoutList className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">Tipos de Material</CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-medium">Gerencie os tipos de material e seus atributos.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Seção A: Propriedades Customizadas */}
                  <div className="space-y-4 p-4 bg-muted/20 dark:bg-muted/5 rounded-2xl border">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Propriedades Customizadas do Material</h4>
                    <div className="flex flex-col sm:flex-row gap-2 items-end pt-1">
                      <div className="space-y-1 w-full sm:flex-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome do Atributo</Label>
                        <Input
                          placeholder="Ex: Norma, Especificação, etc."
                          value={newFieldLabelMaterial}
                          onChange={(e) => setNewFieldLabelMaterial(e.target.value)}
                          className="rounded-xl h-9 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddFieldMaterial();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1 w-full sm:w-28">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                        <Select value={newFieldTypeMaterial} onValueChange={(val: any) => setNewFieldTypeMaterial(val)}>
                          <SelectTrigger className="rounded-xl h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="boolean">Sim / Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddFieldMaterial} size="sm" className="rounded-xl font-bold h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white border-none shrink-0">
                        <Plus className="h-3 w-3 mr-1" /> Adicionar Campo
                      </Button>
                    </div>

                    {/* Lista de campos adicionados */}
                    {camposTipoMaterial.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                        {camposTipoMaterial.map(f => (
                          <span key={f.key} className="flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full font-semibold">
                            {f.label} ({f.type === "boolean" ? "Sim/Não" : f.type === "number" ? "Núm." : "Texto"})
                            <button
                              type="button"
                              onClick={() => handleRemoveFieldMaterial(f.key)}
                              className="text-destructive hover:text-destructive/80 font-black ml-1 text-sm leading-none"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Nenhuma propriedade customizada criada para material.</p>
                    )}
                  </div>

                  {/* Seção B: Itens Cadastrados */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Tipos de Material Ativos</h4>
                      <Button onClick={() => handleOpenTypeModal("material", "create")} size="sm" className="rounded-xl font-bold gap-1 text-xs bg-amber-600 hover:bg-amber-700 text-white border-none">
                        <Plus className="h-3.5 w-3.5" /> Cadastrar Tipo
                      </Button>
                    </div>

                    {/* Lista de tipos cadastrados */}
                    <div className="border rounded-2xl overflow-hidden bg-card divide-y max-h-[400px] overflow-y-auto">
                      {tiposMaterial.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground text-center italic">Nenhum tipo de material cadastrado.</p>
                      ) : (
                        tiposMaterial.map((item) => (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                            <div className="space-y-1">
                              <span className="font-bold text-sm text-foreground block">{item.name}</span>
                              {Object.keys(item.properties || {}).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {camposTipoMaterial.map(f => {
                                    const val = item.properties?.[f.key];
                                    if (val === undefined || val === null || val === "") return null;
                                    const displayVal = f.type === "boolean" ? (val ? "Sim" : "Não") : String(val);
                                    return (
                                      <span key={f.key} className="text-[10px] bg-muted border px-2 py-0.5 rounded-md text-muted-foreground font-medium">
                                        <strong>{f.label}:</strong> {displayVal}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenTypeModal("material", "edit", item)}
                                className="h-8 w-8 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 rounded-lg transition-all"
                                title="Editar"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteType("material", item.id)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                title="Remover"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="responsabilidades" className="space-y-6 focus-visible:ring-0 outline-none">
          {!canAccessSettings ? (
            <Card className="bg-muted/20 py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <h3 className="font-bold">Acesso Restrito</h3>
              <p className="text-sm text-neutral-500">Configurações de responsabilidades são limitadas a administradores.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
              {/* Card: Responsabilidades do Cliente */}
              <Card className="border-rose-500/20 shadow-md rounded-3xl">
                <CardHeader className="bg-rose-500/[0.02] border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">Responsabilidades do Cliente</CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-medium">O que o cliente precisa providenciar ou executar.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Fornecer EPI, Liberar acesso à área..."
                      value={newRespCliente}
                      onChange={(e) => setNewRespCliente(e.target.value)}
                      className="rounded-xl text-sm"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRespCliente(); } }}
                    />
                    <Button onClick={handleAddRespCliente} size="sm" className="rounded-xl shrink-0 bg-rose-600 hover:bg-rose-700 text-white border-none">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="border rounded-2xl overflow-hidden bg-card divide-y max-h-[400px] overflow-y-auto">
                    {responsabilidadesCliente.length === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground text-center italic">Nenhuma responsabilidade do cliente cadastrada.</p>
                    ) : (
                      responsabilidadesCliente.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 gap-3 hover:bg-muted/40 transition-colors">
                          <span className="text-sm text-foreground flex-1">{item.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveRespCliente(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Card: Responsabilidades Orbitalmais */}
              <Card className="border-primary/20 shadow-md rounded-3xl">
                <CardHeader className="bg-primary/[0.02] border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">Responsabilidades Orbitalmais</CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-medium">O que a Orbitalmais se compromete a executar ou fornecer.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Fornecer equipamentos, Executar soldagem..."
                      value={newRespOrbital}
                      onChange={(e) => setNewRespOrbital(e.target.value)}
                      className="rounded-xl text-sm"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRespOrbital(); } }}
                    />
                    <Button onClick={handleAddRespOrbital} size="sm" className="rounded-xl shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="border rounded-2xl overflow-hidden bg-card divide-y max-h-[400px] overflow-y-auto">
                    {responsabilidadesOrbital.length === 0 ? (
                      <p className="p-6 text-sm text-muted-foreground text-center italic">Nenhuma responsabilidade Orbitalmais cadastrada.</p>
                    ) : (
                      responsabilidadesOrbital.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 gap-3 hover:bg-muted/40 transition-colors">
                          <span className="text-sm text-foreground flex-1">{item.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveRespOrbital(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Modal CRUD para Tipos (Serviço ou Junta) */}
        <Dialog open={showTypeModal} onOpenChange={setShowTypeModal}>
          <DialogContent className="sm:max-w-[450px] rounded-3xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                {typeModalMode === "create" ? <Plus className="h-5 w-5 text-primary" /> : <Edit2 className="h-5 w-5 text-primary" />}
                {typeModalMode === "create" ? "Cadastrar" : "Editar"} Tipo de {typeModalTarget === "servico" ? "Serviço" : typeModalTarget === "junta" ? "Junta" : "Material"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveType(); }} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="type-name">Nome / Descrição do Tipo</Label>
                <Input
                  id="type-name"
                  placeholder="Ex: Junta Soldada, Inspeção Visual, etc."
                  value={typeFormName}
                  onChange={(e) => setTypeFormName(e.target.value)}
                  className="rounded-xl font-medium shadow-none"
                  autoFocus
                />
              </div>

              {/* Dynamic Custom Fields */}
              {(typeModalTarget === "servico" ? camposTipoServico : typeModalTarget === "junta" ? camposTipoJunta : camposTipoMaterial).map((field) => {
                const val = typeFormProperties[field.key];
                
                if (field.type === "boolean") {
                  return (
                    <div key={field.key} className="flex items-center justify-between p-3 bg-muted/20 dark:bg-muted/5 rounded-xl border w-full">
                      <Label htmlFor={field.key} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">{field.label}</Label>
                      <Switch
                        id={field.key}
                        checked={!!val}
                        onCheckedChange={(checked) => setTypeFormProperties(prev => ({ ...prev, [field.key]: checked }))}
                      />
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="space-y-2 w-full">
                    <Label htmlFor={field.key} className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">{field.label}</Label>
                    <Input
                      id={field.key}
                      type={field.type === "number" ? "number" : "text"}
                      value={val ?? ""}
                      onChange={(e) => setTypeFormProperties(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={`Preencher ${field.label.toLowerCase()}...`}
                      className="rounded-xl text-sm"
                    />
                  </div>
                );
              })}

              <DialogFooter className="pt-4 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTypeModal(false)}
                  className="rounded-xl font-semibold"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl font-bold bg-primary hover:bg-primary/95 text-white">
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Tabs>

      {/* Modal de Instrução de RLS do Supabase */}
      <Dialog open={showRlsModal} onOpenChange={setShowRlsModal}>
        <DialogContent className="max-w-2xl bg-card rounded-2xl border-primary/20 shadow-2xl p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-2xl">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Erro de Permissão (RLS) no Supabase</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  O bucket de armazenamento <strong>templates</strong> não permite uploads devido às políticas de segurança de linha (Row Level Security).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="p-4 bg-muted/50 border rounded-2xl text-sm space-y-2.5">
              <h4 className="font-bold flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" /> Como resolver isso no painel do Supabase:
              </h4>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs text-muted-foreground">
                <li>Acesse o painel do seu projeto no <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 font-semibold">Supabase Dashboard <ExternalLink className="h-3 w-3" /></a>.</li>
                <li>No menu lateral esquerdo, clique em <strong>SQL Editor</strong> (ícone de terminal/código).</li>
                <li>Clique em <strong>New query</strong> (Nova consulta).</li>
                <li>Copie o script SQL abaixo, cole no editor e clique no botão <strong>Run</strong> (Executar).</li>
              </ol>
            </div>

            <div className="relative">
              <div className="flex justify-between items-center bg-zinc-900 text-zinc-100 rounded-t-xl px-4 py-2 text-xs font-mono">
                <span>supabase_storage_policies.sql</span>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCopySql} 
                  className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 rounded-lg font-bold gap-1"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar SQL
                </Button>
              </div>
              <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-b-xl overflow-x-auto text-[11px] font-mono leading-relaxed max-h-48 border border-t-0">
{`-- DELETAR POLÍTICAS ANTIGAS SE EXISTIREM
DROP POLICY IF EXISTS "Leitura pública de templates" ON storage.objects;
DROP POLICY IF EXISTS "Inserção de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Inserção de templates por qualquer usuário" ON storage.objects;
DROP POLICY IF EXISTS "Atualização de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Atualização de templates por qualquer usuário" ON storage.objects;
DROP POLICY IF EXISTS "Deleção de templates por usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Deleção de templates por qualquer usuário" ON storage.objects;

-- CRIAR NOVAS POLÍTICAS PARA O BUCKET DE TEMPLATES (storage.objects)

-- 1. Permitir leitura pública dos arquivos do bucket 'templates'
CREATE POLICY "Leitura pública de templates" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'templates');

-- 2. Permitir inserção por qualquer usuário (autenticado ou anônimo)
CREATE POLICY "Inserção de templates por qualquer usuário" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'templates');

-- 3. Permitir atualização por qualquer usuário
CREATE POLICY "Atualização de templates por qualquer usuário" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'templates') 
WITH CHECK (bucket_id = 'templates');

-- 4. Permitir deleção por qualquer usuário
CREATE POLICY "Deleção de templates por qualquer usuário" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'templates');`}
              </pre>
            </div>
            
            <p className="text-[11px] text-muted-foreground italic text-center">
              * Nota: Se o bucket 'templates' ainda não existir, certifique-se de criá-lo como "Public" na seção Storage do painel antes de aplicar as políticas.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowRlsModal(false)} className="w-full sm:w-auto font-bold rounded-xl">
              Entendido, vou configurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}