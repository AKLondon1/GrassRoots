"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface MagicLinkScope { eventInstanceId: string; guardianId: string; playerId: string; label: string }

export function MagicLinkIssuer({ workspace, scopes }: { workspace: string; scopes: MagicLinkScope[] }) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!scopes.length) return <p className="rounded-xl bg-surface p-4 text-sm text-muted">No linked guardians require a response link for upcoming events.</p>;
  async function issue(formData: FormData) {
    setBusy(true); setMessage(""); setLink("");
    const scope = scopes.find((item) => item.eventInstanceId === formData.get("eventInstanceId") && item.guardianId === formData.get("guardianId") && item.playerId === formData.get("playerId"));
    if (!scope) { setMessage("Choose a valid linked response scope."); setBusy(false); return; }
    try {
      const response = await fetch("/api/availability/magic-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, eventInstanceId: scope.eventInstanceId, guardianId: scope.guardianId, playerId: scope.playerId }) });
      const result = await response.json() as { link?: string; error?: string };
      if (!response.ok || !result.link) throw new Error(result.error ?? "The response link could not be issued.");
      setLink(result.link); setMessage("One-time link issued. Share it only with the named guardian using an approved adult channel.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The response link could not be issued."); }
    finally { setBusy(false); }
  }
  return <form action={issue} className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Issue one-time availability link</h2><label className="mt-4 block text-sm font-semibold">Guardian, player and event<select className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-background px-3" name="scope" onChange={(event) => { const scope = scopes[Number(event.currentTarget.value)]!; const form = event.currentTarget.form!; (form.elements.namedItem("eventInstanceId") as HTMLInputElement).value = scope.eventInstanceId; (form.elements.namedItem("guardianId") as HTMLInputElement).value = scope.guardianId; (form.elements.namedItem("playerId") as HTMLInputElement).value = scope.playerId; }}><option value="0">{scopes[0]?.label}</option>{scopes.slice(1).map((scope, index) => <option key={`${scope.eventInstanceId}:${scope.guardianId}:${scope.playerId}`} value={index + 1}>{scope.label}</option>)}</select></label><input name="eventInstanceId" type="hidden" defaultValue={scopes[0]?.eventInstanceId}/><input name="guardianId" type="hidden" defaultValue={scopes[0]?.guardianId}/><input name="playerId" type="hidden" defaultValue={scopes[0]?.playerId}/><Button className="mt-4" disabled={busy} type="submit">{busy ? "Issuing…" : "Issue link"}</Button>{link ? <label className="mt-4 block text-sm font-semibold">One-time link<input className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 font-mono text-xs" readOnly value={link}/></label> : null}{message ? <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p> : null}</form>;
}
