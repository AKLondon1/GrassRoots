"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function QuarantineUpload({ workspace }: { workspace: string }) {
  const [message, setMessage] = useState("Select a PNG, JPEG or PDF up to 10 MB.");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return setMessage("Choose a file first.");
    setBusy(true);
    setMessage("Preparing a private quarantine upload…");
    try {
      const intentResponse = await fetch("/api/uploads/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, filename: file.name, declaredMime: file.type, size: file.size }),
      });
      const intent = await intentResponse.json() as { intentId?: string; signedUrl?: string; error?: string; errorRef?: string };
      if (!intentResponse.ok || !intent.intentId || !intent.signedUrl) throw new Error(intent.errorRef ? `${intent.error} (${intent.errorRef})` : intent.error ?? "Upload intent failed.");
      const uploadResponse = await fetch(intent.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!uploadResponse.ok) throw new Error("The private storage upload failed.");
      const finaliseResponse = await fetch(`/api/uploads/${intent.intentId}/finalise`, { method: "POST" });
      const finalised = await finaliseResponse.json() as { message?: string; error?: string; errorRef?: string };
      if (!finaliseResponse.ok) throw new Error(finalised.errorRef ? `${finalised.error} (${finalised.errorRef})` : finalised.error ?? "Validation failed.");
      setMessage(finalised.message ?? "The file is quarantined and unavailable until a scanner records a clean verdict.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return <form action={submit} className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Upload to private quarantine</h2><p className="mt-2 text-sm text-muted">Files are validated and kept unavailable. This deployment does not claim malware-scanner approval until a service worker records a clean verdict.</p><label className="mt-5 block text-sm font-semibold">File<input accept="image/png,image/jpeg,application/pdf" className="mt-2 block min-h-11 w-full rounded-xl border border-border-strong bg-surface p-2" name="file" required type="file"/></label><Button className="mt-4" disabled={busy} type="submit">{busy ? "Uploading…" : "Upload privately"}</Button><p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p></form>;
}
