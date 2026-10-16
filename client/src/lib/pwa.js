import { useEffect, useState } from 'react';
import { api } from './api';

// ---------- Install ----------
let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own "Install app" button
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    standalone: isStandalone(),
    ios: isIOS(),
    canInstall: !!deferredPrompt,
    async install() {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      emit();
      return outcome === 'accepted';
    },
  };
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker failed', e));
  });
}

// ---------- Push notifications ----------
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must be called from a tap), subscribe this device and tell the server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser can't show notifications");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await Promise.race([
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Couldn't reach the notification service — check your connection and try again")), 20000)),
    ]);
  }
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return sub;
}

/** Stop notifications on this device (also used on log out, so the next person doesn't get yours). */
export async function disablePush() {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await api('/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Re-register an existing subscription with the server (e.g. after logging in on this device). */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription().catch(() => null);
  if (sub) await api('/push/subscribe', { method: 'POST', body: sub.toJSON() }).catch(() => {});
}
