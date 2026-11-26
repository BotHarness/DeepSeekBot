const BACKDROP = /^<svg\b[^>]*><rect\b[^>]*?\sfill="(#[0-9a-fA-F]{3,8})"/u;

export function avatarBackdrop(svg: string): string | undefined {
  return BACKDROP.exec(svg)?.[1];
}
