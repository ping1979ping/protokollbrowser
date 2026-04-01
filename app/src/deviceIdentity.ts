/**
 * Device-Identität: UUID + User/Device-Name in localStorage
 */

const DEVICE_ID_KEY = 'device-id';
const DEVICE_NAME_KEY = 'device-name';
const USER_NAME_KEY = 'user-name';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // crypto.randomUUID() ist nur in Secure Contexts (HTTPS/localhost) verfügbar.
    // Fallback für HTTP-Zugriff über IP-Adresse (z.B. VPN).
    if (typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  return localStorage.getItem(DEVICE_NAME_KEY) || '';
}

export function setDeviceName(name: string) {
  localStorage.setItem(DEVICE_NAME_KEY, name);
}

export function getUserName(): string {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

export function setUserName(name: string) {
  localStorage.setItem(USER_NAME_KEY, name);
}
