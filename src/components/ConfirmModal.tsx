"use client";

import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title = "Confirmação",
  description = "Tem certeza que deseja executar esta ação?",
  confirmLabel = "Sim, confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Keep dialog's open prop controlled by parent. Dialog handles focus-trap and ESC by default.
  useEffect(() => {
    // no-op placeholder in case we add side effects later (e.g. analytics)
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onCancel(); }}>
      <DialogContent className="sm:max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex justify-end space-x-2">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} className="bg-destructive text-white hover:bg-destructive/90">
            {confirmLabel}
          </Button>
        </div>

        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}