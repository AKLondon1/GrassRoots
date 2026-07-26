"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

function applicationServerKey(value: string) {
  const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function PushRegistration({ workspace }: { workspace: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!supported || !publicKey) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then(setSubscription).catch(() => setMessage("Push status is unavailable."));
  }, [publicKey, supported]);

  if (!supported || !publicKey) return null;
  async function toggle() {
    setBusy(true); setMessage("");
    try {
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, subscription: subscription.toJSON() }) });
        if (!response.ok) throw new Error("Push could not be disabled.");
        await subscription.unsubscribe(); setSubscription(null); setMessage("Browser push disabled."); return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      const created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey!) });
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, subscription: created.toJSON() }) });
      if (!response.ok) { await created.unsubscribe(); throw new Error("Push could not be enabled."); }
      setSubscription(created); setMessage("Browser push enabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Push settings could not be changed."); }
    finally { setBusy(false); }
  }
  return <><Button aria-label={subscription ? "Disable browser push" : "Enable browser push"} disabled={busy} onClick={toggle} size="small" type="button" variant="quiet">{subscription ? <Bell className="size-4" aria-hidden="true"/> : <BellOff className="size-4" aria-hidden="true"/>}<span className="hidden xl:inline">{subscription ? "Push on" : "Enable push"}</span></Button><span className="sr-only" aria-live="polite">{message}</span></>;
}
