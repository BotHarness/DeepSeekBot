export type SheetDetent = 'medium' | 'large';

export interface SheetRoom {
  window: number;
  top: number;
  bottom: number;
  touch: number;
}

export function sheetContentCap(room: SheetRoom, keyboard: number) {
  return room.window - room.top - room.bottom - room.touch * 2 - keyboard;
}

export function sheetDetent(
  room: SheetRoom,
  content: number | undefined,
  keyboard: boolean,
): SheetDetent {
  if (keyboard) return 'large';
  if (content === undefined) return 'medium';
  return content <= (room.window - room.top) / 2 - room.bottom - room.touch ? 'medium' : 'large';
}
