"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function InvitationIssuer({ workspace, roles }: { workspace: string; roles: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!roles.length) return <p className="rounded-xl bg-surface p-4 text-sm text-muted">Create an organisation role before issuing invitations.</p>;
  async function submit(formData: FormData) {
    setBusy(true); setLink(""); setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, email: formData.get("email"), roleId: formData.get("roleId") }) });
      const result = await response.json() as { link?: string; error?: string };
      if (!response.ok || !result.link) throw new Error(result.error ?? "The invitation could not be issued.");
      setLink(result.link); setMessage("Invitation issued for seven days. Share it only with the named adult using an approved channel."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The invitation could not be issued."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Adult email<input className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-background px-3" name="email" type="email" required /></label><label className="text-sm font-semibold">Role<select className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-background px-3" name="roleId">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><Button className="sm:w-fit" disabled={busy} type="submit">{busy ? "Issuing…" : "Issue invitation"}</Button>{link ? <label className="sm:col-span-2 text-sm font-semibold">Single-use invitation link<input className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 font-mono text-xs" readOnly value={link}/></label> : null}{message ? <p aria-live="polite" className="text-sm text-muted sm:col-span-2">{message}</p> : null}</form>;
}
