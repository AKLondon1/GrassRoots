"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { syncProductionAttendanceActions } from "@/features/coaching/actions";
import type { AttendanceStatus } from "@/features/coaching/attendance-queue";

const statuses: { value: AttendanceStatus; label: string }[] = [
  { value: "expected", label: "Expected" }, { value: "present", label: "Present" }, { value: "late", label: "Late" },
  { value: "left-early", label: "Left early" }, { value: "absent", label: "Absent" }, { value: "excused", label: "Excused" }, { value: "injured", label: "Injured (attendance only)" },
  { value: "observing", label: "Observing" }, { value: "trialist", label: "Trialist" }, { value: "unknown", label: "Unknown attendee" }, { value: "unexpected", label: "Unexpected attendee" },
];

export function ProductionAttendanceRecorder({ organisationId, sessionId, players }: { organisationId: string; sessionId: string; players: { id: string; label: string }[] }) {
  const [selectedPlayer, setSelectedPlayer] = useState(players[0]?.id ?? "guest");
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>(players.length ? "expected" : "trialist");
  const [message, setMessage] = useState("A connection is required; child attendance is never retained in an offline browser queue.");
  async function submit(formData: FormData) {
    if (!navigator.onLine) { setMessage("A connection is required to save attendance safely."); return; }
    const playerValue = String(formData.get("playerId"));
    const status = String(formData.get("status")) as AttendanceStatus;
    const guest = playerValue === "guest";
    const attendeeLabel = String(formData.get("attendeeLabel") ?? "").trim();
    if (guest && !attendeeLabel) { setMessage("Add a temporary attendee label before saving."); return; }
    if (guest && !["observing", "trialist", "unknown", "unexpected"].includes(status)) { setMessage("Choose an observing, trialist, unknown or unexpected status for a temporary attendee."); return; }
    if (status === "injured" && guest) { setMessage("Choose a registered player for an injury attendance marker."); return; }
    const occurredAt = new Date().toISOString();
    const idempotencyKey = `${organisationId}:${sessionId}:${guest ? `guest:${attendeeLabel.toLowerCase()}` : playerValue}:${occurredAt}`;
    setMessage("Saving attendance…");
    try {
      const [result] = await syncProductionAttendanceActions([{ organisationId, sessionId, playerId: guest ? undefined : playerValue, attendeeLabel: guest ? attendeeLabel : undefined, status, occurredAt, idempotencyKey }]);
      setMessage(result?.ok ? "Attendance synced securely." : "Attendance could not be saved. Check the record and try again.");
    } catch { setMessage("Attendance could not be saved. Check your connection and try again."); }
  }
  return <form action={submit} className="mt-5 grid gap-4 sm:grid-cols-3">
    <label className="text-sm font-semibold">Player or attendee<select className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3" name="playerId" value={selectedPlayer} onChange={(event) => { const value = event.target.value; setSelectedPlayer(value); setSelectedStatus(value === "guest" ? "trialist" : "expected"); }}>{players.map((player) => <option value={player.id} key={player.id}>{player.label}</option>)}<option value="guest">Temporary / unknown attendee</option></select></label>
    <label className="text-sm font-semibold">Status<select className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3" name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as AttendanceStatus)}>{statuses.filter((status) => selectedPlayer !== "guest" || ["observing","trialist","unknown","unexpected"].includes(status.value)).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
    <label className="text-sm font-semibold">Temporary attendee label<input className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3" name="attendeeLabel" placeholder="e.g. Trialist A" autoComplete="off"/></label>
    <Button className="self-end" type="submit">Save attendance</Button>
    <p className="text-sm text-muted sm:col-span-3" role="status">{message}</p>
  </form>;
}
