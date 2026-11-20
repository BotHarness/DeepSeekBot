export function joinClass(...names: readonly (string | undefined)[]): string | undefined {
  const joined = names.filter((name) => name !== undefined && name !== '').join(' ');
  return joined === '' ? undefined : joined;
}
