import { supabase } from '../supabaseClient';

export interface AdminPushStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  isIos: boolean;
  standalone: boolean;
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const isStandaloneDisplay = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as any).standalone === true);

const isIosDevice = () =>
  typeof window !== 'undefined' &&
  /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');

const ensureAuthToken = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again to enable notifications.');
  return token;
};

const getServiceWorkerRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration('/service-worker.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/service-worker.js');
};

export const AdminPushService = {
  getStatus: async (): Promise<AdminPushStatus> => {
    if (!isSupported()) {
      return {
        supported: false,
        permission: 'unsupported',
        subscribed: false,
        isIos: isIosDevice(),
        standalone: isStandaloneDisplay(),
      };
    }

    const registration = await getServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: Boolean(subscription),
      isIos: isIosDevice(),
      standalone: isStandaloneDisplay(),
    };
  },

  enable: async () => {
    if (!isSupported()) throw new Error('Push notifications are not supported on this device/browser.');
    const token = await ensureAuthToken();

    const registration = await getServiceWorkerRegistration();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }

    const vapidResponse = await fetch('/.netlify/functions/push_vapid_public', { method: 'GET' });
    const vapidBody = await vapidResponse.json().catch(() => ({}));
    const publicKey = String(vapidBody?.publicKey || '');
    if (!publicKey) {
      throw new Error('Push key unavailable. Contact operations.');
    }

    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const saveResponse = await fetch('/.netlify/functions/push_subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription }),
    });

    if (!saveResponse.ok) {
      throw new Error('Failed to save notification subscription.');
    }
  },

  disable: async () => {
    if (!isSupported()) return;
    const token = await ensureAuthToken();
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await fetch('/.netlify/functions/push_unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
  },
};
