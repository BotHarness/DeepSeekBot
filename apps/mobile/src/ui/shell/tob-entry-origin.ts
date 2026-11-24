import type { EntranceRect } from './tob-mode-model';

let origin: EntranceRect | undefined;

export const tobEntryOrigin = {
  set(next: EntranceRect | undefined): void {
    origin = next;
  },
  read(): EntranceRect | undefined {
    return origin;
  },
};
