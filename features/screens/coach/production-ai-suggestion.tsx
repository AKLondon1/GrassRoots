"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { approveProductionDevelopmentSummary } from "@/features/coaching/actions";

type Suggestion = { title: string; summary: string; nextSteps: string[] };

export function ProductionAiSuggestion({ organisationId, teamId, objectiveId, reviewId, workspace, section }: { organisationId: string; teamId: string; objectiveId: string; reviewId: string; workspace: string; section: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("No suggestion requested. AI is optional and never publishes automatically.");
  const [loading, setLoading] = useState(false);
  async function generate() {
    setLoading(true); setMessage("Creating a parent-safe draft from approved coaching context…");
    try {
      const response = await fetch("/api/ai/coaching-suggestion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId, teamId, objectiveId }) });
      const payload = await response.json() as { status?: string; suggestion?: Suggestion; message?: string } & Partial<Suggestion>;
      const proposal = payload.suggestion ?? (payload.title && payload.summary && payload.nextSteps ? { title: payload.title, summary: payload.summary, nextSteps: payload.nextSteps } as Suggestion : null);
      if (!response.ok || !proposal) throw new Error(payload.message ?? "A suggestion was not available.");
      setSuggestion(proposal); setSummary(`${proposal.summary}\n\nNext steps: ${proposal.nextSteps.join("; ")}`); setMessage("Draft ready. Edit it, then approve deliberately if it is accurate and appropriate.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A suggestion was not available."); }
    finally { setLoading(false); }
  }
  return <div className="mt-5 rounded-xl border border-border bg-surface-subtle p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-ink">Optional AI drafting assistant</h3><p className="text-sm text-muted">Uses a first-name-and-initial display plus the selected objective; private notes are excluded.</p></div><Button type="button" variant="secondary" onClick={generate} disabled={loading}>{loading ? "Drafting…" : "Generate draft"}</Button></div>
    <p className="mt-3 text-sm text-muted" role="status">{message}</p>
    {suggestion ? <form action={approveProductionDevelopmentSummary} className="mt-4 grid gap-3"><input type="hidden" name="workspace" value={workspace}/><input type="hidden" name="section" value={section}/><input type="hidden" name="reviewId" value={reviewId}/><label className="text-sm font-semibold">Editable parent summary<textarea className="mt-2 min-h-32 w-full rounded-[10px] border border-border-strong bg-background px-3 py-3" name="summary" value={summary} onChange={(event) => setSummary(event.target.value)} required maxLength={1200}/></label><Button type="submit">Approve edited summary</Button></form> : null}
  </div>;
}
