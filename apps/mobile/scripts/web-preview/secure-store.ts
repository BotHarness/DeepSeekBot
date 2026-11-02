export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 0;
export const AFTER_FIRST_UNLOCK = 0;
export const WHEN_UNLOCKED = 0;
export async function getItemAsync(key: string) {
  return localStorage.getItem(`ss:${key}`);
}
export async function setItemAsync(key: string, value: string) {
  localStorage.setItem(`ss:${key}`, value);
}
export async function deleteItemAsync(key: string) {
  localStorage.removeItem(`ss:${key}`);
}
export function getItem(key: string) {
  return localStorage.getItem(`ss:${key}`);
}
export function setItem(key: string, value: string) {
  localStorage.setItem(`ss:${key}`, value);
}
export async function isAvailableAsync() {
  return true;
}
