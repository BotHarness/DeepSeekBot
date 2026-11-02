export function isSharePath(path: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?expo-sharing(?:[/?#]|$)/iu.test(path);
}
