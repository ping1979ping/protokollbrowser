/**
 * Device-Identität: UUID + User/Device-Name in localStorage
 */

const DEVICE_ID_KEY = 'device-id';
const DEVICE_NAME_KEY = 'device-name';
const USER_NAME_KEY = 'user-name';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
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
