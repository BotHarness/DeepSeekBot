import type { AddressInfo } from 'node:net';

import { expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { openSonioxStream } from '../src/voice/soniox.js';

it.each([
  [false, 1011],
  [true, 1011],
  [true, 1000],
])(
  'refuses incomplete recognition when closed after finish=%s with code %s',
  async (afterFinish, code) => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    let heard!: () => void;
    const partial = new Promise<void>((resolve) => {
      heard = resolve;
    });
    let didClose!: () => void;
    const closed = new Promise<void>((resolve) => {
      didClose = resolve;
    });
    server.on('connection', (socket) => {
      socket.on('message', (data, binary) => {
        if (binary) {
          socket.send(
            JSON.stringify({
              tokens: [
                { text: '三加四', is_final: true },
                { text: '等于多少', is_final: false },
              ],
            }),
          );
          if (!afterFinish) socket.close(code);
        } else if (String(data).includes('finalize')) socket.close(code);
      });
    });
    const stream = openSonioxStream({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      key: undefined,
      model: 'stt-rt-v6',
      languageHints: ['zh'],
      audio: 'pcm',
      timeoutMs: 1000,
      onText: heard,
      socket: (url) => {
        const socket = new WebSocket(url);
        socket.on('close', didClose);
        return socket;
      },
    });
    try {
      stream.push(new Int16Array(320));
      await partial;
      if (!afterFinish) await closed;
      await expect(stream.finish()).rejects.toMatchObject({ code: 'provider-unavailable' });
    } finally {
      stream.cancel();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
