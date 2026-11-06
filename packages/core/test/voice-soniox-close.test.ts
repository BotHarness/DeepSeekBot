import type { AddressInfo } from 'node:net';

import { expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { openSonioxStream, openSonioxUtterance } from '../src/voice/soniox.js';

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

it.each(['close-again', 'cancel', 'timeout'] as const)(
  'bounds recovery when the replacement stream will %s',
  async (mode) => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    let connections = 0;
    let retries = 0;
    let retryAudio!: () => void;
    const received = new Promise<void>((resolve) => {
      retryAudio = resolve;
    });
    server.on('connection', (socket) => {
      const attempt = ++connections;
      socket.on('message', (_data, binary) => {
        if (!binary) return;
        if (attempt === 1 || mode === 'close-again') socket.terminate();
        else retryAudio();
      });
    });
    const stream = openSonioxUtterance({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      key: undefined,
      model: 'stt-rt-v6',
      languageHints: ['zh'],
      audio: 'pcm',
      timeoutMs: mode === 'timeout' ? 150 : 1000,
      onReconnect: () => {
        retries += 1;
      },
    });
    try {
      stream.push(new Int16Array(320));
      const outcome = expect(stream.finish()).rejects.toMatchObject({
        code: mode === 'timeout' ? 'provider-timeout' : 'provider-unavailable',
      });
      if (mode === 'cancel') {
        await received;
        stream.cancel();
      }
      await outcome;
      expect(connections).toBe(2);
      expect(retries).toBe(1);
    } finally {
      stream.cancel();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
