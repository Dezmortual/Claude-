"use client";
import { Bell, BellOff, Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui";
import { toast } from "./Toaster";

type Status = { configured: boolean; publicKey: string | null; devices: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function keyBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function api(method: string, path = "/api/v1/me/devices", body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? "Something went wrong");
  return j;
}

/** Install the app and turn on alert notifications for this device. */
export function PushCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [supported, setSupported] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSub(s ?? null)).catch(() => {});
    api("GET").then(setStatus).catch(() => setStatus({ configured: false, publicKey: null, devices: 0 }));
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setBusy(false);
  }

  const turnOn = () => run(async () => {
    if (!status?.publicKey) throw new Error("Push isn't set up on this server yet");
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings, then try again.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) });
    await api("POST", undefined, s.toJSON());
    setSub(s);
    setStatus(await api("GET"));
    toast("Notifications are on for this device");
  });

  const turnOff = () => run(async () => {
    if (sub) { await api("DELETE", undefined, { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setSub(null);
    setStatus(await api("GET"));
    toast("Notifications are off for this device");
  });

  const test = () => run(async () => {
    const r = await api("POST", "/api/v1/me/devices/test");
    toast(r?.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}` : "No device took the test. Turn notifications off and on again.");
  });

  const install = () => run(async () => {
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
    setPrompt(null);
  });

  return (
    <div className="grid gap-5 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Smartphone aria-hidden className="mt-1 h-5 w-5 text-accent" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">The app</p>
          {installed ? <p className="text-sm text-up">Installed. You&apos;re using it now.</p>
            : prompt ? <p className="text-sm text-muted">Add Proofcast to your home screen. It opens full screen, like any other app.</p>
            : ios ? <p className="text-sm text-muted">In Safari, tap Share, then <span className="font-semibold">Add to Home Screen</span>. On iPhone, notifications only work from the installed app.</p>
            : <p className="text-sm text-muted">Use your browser&apos;s menu and choose <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home screen</span>.</p>}
        </div>
        {!installed && prompt && <Button onClick={install} disabled={busy} variant="secondary"><Download aria-hidden className="h-4 w-4" />Install</Button>}
      </div>

      <div className="flex flex-wrap items-start gap-3 border-t pt-5">
        {sub ? <Bell aria-hidden className="mt-1 h-5 w-5 text-accent" /> : <BellOff aria-hidden className="mt-1 h-5 w-5 text-subtle" />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">Alert notifications</p>
          <p role="status" className="text-sm text-muted">
            {!supported ? (ios && !installed ? "Install the app first (see above), then turn them on from inside it." : "This browser can't receive notifications.")
              : !status ? "Checking…"
              : !status.configured ? "Not set up on the server yet: the VAPID keys are missing."
              : sub ? `On for this device. ${status.devices} device${status.devices === 1 ? "" : "s"} in total.`
              : `Off for this device.${status.devices ? ` On for ${status.devices} other device${status.devices === 1 ? "" : "s"}.` : ""}`}
          </p>
          <p className="text-xs text-muted">Alerts that use &ldquo;Push notification&rdquo; arrive here within 30 minutes of firing.</p>
        </div>
        {supported && status?.configured && (
          <div className="flex flex-wrap gap-2">
            {sub ? <>
              <Button onClick={test} loading={busy} variant="secondary">Send a test</Button>
              <Button onClick={turnOff} disabled={busy} variant="ghost">Turn off</Button>
            </> : <Button onClick={turnOn} loading={busy}>Turn on</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
