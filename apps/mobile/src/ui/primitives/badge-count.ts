export const BADGE_MAX = 99;

export function badgeCount(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}
