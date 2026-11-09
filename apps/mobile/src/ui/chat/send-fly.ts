import { createContext } from 'react';

import type { Rect } from './menu-placement';

export type SendFlight = { from: Rect | undefined };

export type SendFlights = {
  inverted: boolean;
  launch(messageId: string, flight: SendFlight): void;
  flight(messageId: string): SendFlight | undefined;
  land(messageId: string): void;
};

export function textFrame(frame: Rect, horizontal: number, vertical: number): Rect {
  return {
    x: frame.x + horizontal,
    y: frame.y + vertical,
    width: frame.width - 2 * horizontal,
    height: frame.height - 2 * vertical,
  };
}

export function flyOffset(from: Rect, to: Rect, inverted: boolean): { x: number; y: number } {
  const x = from.x - to.x;
  const y = from.y + from.height - (to.y + to.height);
  return inverted ? { x: -x, y: -y } : { x, y };
}

export function createSendFlights(inverted: boolean): SendFlights {
  const pending = new Map<string, SendFlight>();
  return {
    inverted,
    launch(messageId, flight) {
      pending.clear();
      pending.set(messageId, flight);
    },
    flight(messageId) {
      return pending.get(messageId);
    },
    land(messageId) {
      pending.delete(messageId);
    },
  };
}

export const SendFlightsContext = createContext<SendFlights | undefined>(undefined);
