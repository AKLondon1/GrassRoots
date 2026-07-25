"use client";

import { useEffect, useState } from "react";

type PlayingInterval = { playerId:string; position:string; enteredAt:string; leftAt:string|null };

export function calculateLivePlayingTime(playerId: string, intervals: PlayingInterval[], nowMs: number) {
  const validIntervals = intervals.filter((item) => Number.isFinite(Date.parse(item.enteredAt)));
  const firstKickoffMs = validIntervals.length ? Math.min(...validIntervals.map((item) => Date.parse(item.enteredAt))) : null;
  const spans = validIntervals.filter((item) => item.playerId === playerId).sort((a,b) => Date.parse(a.enteredAt)-Date.parse(b.enteredAt));
  const duration = (item: PlayingInterval) => Math.max(0,(item.leftAt ? Date.parse(item.leftAt) : nowMs)-Date.parse(item.enteredAt));
  const playedMs = spans.reduce((total,item) => total+duration(item),0);
  const isStarter = firstKickoffMs != null && spans.some((item) => Date.parse(item.enteredAt) === firstKickoffMs);
  const positionMs = spans.reduce<Record<string,number>>((totals,item) => ({ ...totals, [item.position]:(totals[item.position]??0)+duration(item) }),{});
  return { playedMs, starterMs:isStarter ? playedMs : 0, positionMs };
}

export function ProductionPlayingTimeTracker({ players, intervals, state, startedAt, elapsedBeforeMs }: { players: { id:string; label:string }[]; intervals: { playerId:string; position:string; enteredAt:string; leftAt:string|null }[]; state:string; startedAt:string|null; elapsedBeforeMs:number }) {
  const [now,setNow] = useState(() => new Date().toISOString());
  useEffect(() => { if (state !== "running") return; const timer=window.setInterval(() => setNow(new Date().toISOString()),1000); return () => window.clearInterval(timer); },[state]);
  const nowMs=Date.parse(now); const elapsedMs=elapsedBeforeMs+(state==="running"&&startedAt?Math.max(0,nowMs-Date.parse(startedAt)):0);
  return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold text-ink">Live playing-time tracker</h2><ul className="mt-4 divide-y divide-border">{players.map((player) => { const { playedMs,starterMs,positionMs }=calculateLivePlayingTime(player.id,intervals,nowMs); const positions=Object.entries(positionMs).map(([position,durationMs])=>`${position} ${Math.round(durationMs/6000)/10} min`); return <li className="grid gap-1 py-3 text-sm sm:grid-cols-2" key={player.id}><strong>{player.label}</strong><span>{Math.round(playedMs/6000)/10} min played</span><span>{Math.round(starterMs/6000)/10} min as starter</span><span>{Math.max(0,Math.round((elapsedMs-playedMs)/6000)/10)} min off pitch</span><span>Positions: {positions.join(", ")||"Bench"}</span></li>; })}</ul></section>;
}
