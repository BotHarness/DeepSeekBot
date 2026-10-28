export function humanInitial(name: string | undefined): string | undefined {
  return Array.from(name?.trim() ?? '')[0]?.toUpperCase();
}
