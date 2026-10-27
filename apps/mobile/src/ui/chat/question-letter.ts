export function letter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}
