"use client";

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ProposalWizard } from "@/components/ProposalWizard";
import { getUserSettings } from "@/services/settingsService";
import { toast } from "sonner";
import { saveUserSettings } from "@/services/settingsService";
import { DraftRecord } from "@/services/draftService";
import { deleteDraft } from "@/services/draftService";

export default function WizardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sellerData, setSellerData] = useState({ name: "", role: "", email: "", phone: "" });
  const stateDraft = (location.state as any)?.draft as DraftRecord | undefined;

  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        if (s) {
          setSellerData({
            name: s.seller_name || "",
            role: s.seller_role || "",
            email: s.seller_email || "",
            phone: s.seller_phone || "",
          });
        }
      } catch (err) {
        console.warn("WizardPage: failed to load seller settings", err);
      }
    })();
  }, []);

  const handleComplete = async (data: any) => {
    toast.success("Proposta gerada (via wizard standalone).");
    // If opened from a draft, remove the draft now that user completed the proposal
    try {
      if (stateDraft?.id) {
        await deleteDraft(stateDraft.id);
      }
    } catch {}
    navigate("/");
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-full py-8 px-4 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <ProposalWizard
          initialSellerData={sellerData}
          onComplete={handleComplete}
          onCancel={handleCancel}
          initialData={stateDraft?.data}
          initialStep={stateDraft?.step}
          draftId={stateDraft?.id}
        />
      </div>
    </div>
  );
}