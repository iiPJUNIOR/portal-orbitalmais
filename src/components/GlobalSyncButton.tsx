import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getDrafts, syncLocalDrafts } from "@/services/draftService";
import { CloudUpload, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function GlobalSyncButton() {
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateCount = () => {
    try {
      const drafts = getDrafts();
      const unsynced = drafts.filter((d) => !d.synced);
      setUnsyncedCount(unsynced.length);
    } catch (err) {
      console.warn("GlobalSyncButton: failed to read drafts", err);
    }
  };

  useEffect(() => {
    updateCount();
    window.addEventListener("local_drafts_changed", updateCount);
    return () => {
      window.removeEventListener("local_drafts_changed", updateCount);
    };
  }, []);

  const handleSyncAll = async () => {
    if (isSyncing) return;
    if (unsyncedCount === 0) {
      toast.info("Todos os rascunhos locais já estão sincronizados com o servidor.");
      return;
    }

    setIsSyncing(true);
    const toastId = toast.loading("Sincronizando rascunhos locais com o servidor...");

    try {
      const res = await syncLocalDrafts();
      const syncedLen = res.synced.length;
      const failedLen = res.failed.length;

      if (syncedLen > 0 && failedLen === 0) {
        toast.success(`Sucesso: ${syncedLen} rascunho(s) sincronizado(s) com o servidor.`, { id: toastId });
      } else if (syncedLen > 0 && failedLen > 0) {
        toast.warning(`Sincronizados: ${syncedLen}. Falhas: ${failedLen}. Verifique sua conexão.`, { id: toastId });
      } else if (failedLen > 0) {
        toast.error(`Falha ao sincronizar ${failedLen} rascunho(s). Verifique sua conexão.`, { id: toastId });
      } else {
        toast.info("Nenhum rascunho pendente foi encontrado.", { id: toastId });
      }
      updateCount();
    } catch (err) {
      console.error("GlobalSyncButton: sync failed", err);
      toast.error("Erro interno ao sincronizar rascunhos.", { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative flex items-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSyncAll}
        disabled={isSyncing}
        className={`relative h-9 w-9 rounded-xl transition-all ${
          unsyncedCount > 0
            ? "text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/50"
            : "text-muted-foreground hover:text-primary hover:bg-muted"
        }`}
        title={
          unsyncedCount > 0
            ? `Sincronizar ${unsyncedCount} rascunho(s) pendente(s) com o servidor`
            : "Rascunhos locais sincronizados"
        }
      >
        {isSyncing ? (
          <RefreshCw className="h-5 w-5 animate-spin" />
        ) : unsyncedCount > 0 ? (
          <CloudUpload className="h-5 w-5 animate-pulse" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        )}

        {unsyncedCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground animate-in zoom-in">
            {unsyncedCount}
          </span>
        )}
      </Button>
    </div>
  );
}
