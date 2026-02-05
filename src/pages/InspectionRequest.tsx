"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createInspection } from "@/services/inspectionService";

export default function InspectionRequestPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    cnpj: "",
    preferredDate: "",
    notes: "",
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  const validate = () => {
    if (!form.companyName.trim()) return "Informe a razão social";
    if (!form.contactName.trim()) return "Informe o responsável";
    if (!form.email.trim()) return "Informe um e-mail";
    return null;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSaving(true);
    const payload = {
      company_name: form.companyName.trim(),
      contact_name: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      cnpj: form.cnpj.replace(/\D/g, "") || undefined,
      preferred_date: form.preferredDate || null,
      notes: form.notes.trim() || undefined,
    };

    try {
      const res = await createInspection(payload);
      if (res.success) {
        toast.success("Solicitação enviada com sucesso");
        navigate("/", { replace: false });
      } else {
        toast.error("Falha ao enviar solicitação");
      }
    } catch (err) {
      console.error("inspection submit error", err);
      toast.error("Erro inesperado ao enviar solicitação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container mx-auto max-w-2xl">
        <Card className="proposal-highlight">
          <CardHeader className="bg-primary text-white p-6">
            <CardTitle className="text-lg font-bold">Solicitar Vistoria</CardTitle>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Razão Social *</Label>
                  <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} required />
                </div>

                <div>
                  <Label>Responsável *</Label>
                  <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} required />
                </div>

                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
                </div>

                <div>
                  <Label>Data Preferencial</Label>
                  <Input type="date" value={form.preferredDate} onChange={(e) => update("preferredDate", e.target.value)} />
                </div>

                <div />
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={4} />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" onClick={() => navigate(-1)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Enviando..." : "Enviar Solicitação"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}