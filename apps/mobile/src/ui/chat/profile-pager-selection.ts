import type { ProfileTab } from './profile-tabs';

export function createProfilePagerSelection(initial: ProfileTab) {
  let settled = initial;
  let requested = initial;
  let pending = false;
  return {
    choose(next: ProfileTab) {
      if (requested === next) return false;
      requested = next;
      pending = true;
      return true;
    },
    settle(next: ProfileTab) {
      settled = next;
      if (pending && requested !== next) return false;
      requested = next;
      pending = false;
      return true;
    },
    drag() {
      requested = settled;
      pending = false;
      return settled;
    },
  };
}
