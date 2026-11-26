import { once } from 'node:events';
import { Client, fetch } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEAM_PATH } from '../src/team/http.js';
import { deferred } from './deferred.js';
import { cleanup, enabledFixture, memberHttp } from './team-mode-fixtures.js';

afterEach(cleanup);

async function signedInMember() {
  const fixture = await enabledFixture();
  const password = 'member-password-1';
  await fixture.team.changePassword(fixture.human, fixture.initialPassword, password);
  const login = await fixture.team.signIn('bob', password, 'ip');
  const http = await memberHttp(fixture);
  const post = (command: unknown, signal?: AbortSignal, dispatcher?: Client) =>
    fetch(`${http.origin}${TEAM_PATH}/__share/rpc`, {
      method: 'POST',
      headers: { cookie: `botharness-member=${login.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
      ...(signal ? { signal } : {}),
      ...(dispatcher ? { dispatcher } : {}),
    });
  const open = (id: number, signal?: AbortSignal, dispatcher?: Client) =>
    post(
      { op: 'stream-open', id, endpoint: 'botharness/followRoster', payload: { args: {} } },
      signal,
      dispatcher,
    );
  const next = (id: number, signal?: AbortSignal, dispatcher?: Client) =>
    post({ op: 'stream-next', id }, signal, dispatcher);
  return { gateway: fixture.gateway, origin: http.origin, post, open, next };
}

describe('member HTTP stream disconnection', () => {
  it('admits another stream after more socket closes between polls than the per-member cap', async () => {
    const { gateway, origin, open, next } = await signedInMember();
    const stopped = vi.fn();
    vi.spyOn(gateway.wireStream, 'open').mockImplementation(async () =>
      (async function* () {
        try {
          yield 'baseline';
        } finally {
          stopped();
        }
      })(),
    );

    for (let id = 1; id <= 17; id += 1) {
      const socket = new Client(origin);
      try {
        expect(await (await open(id, undefined, socket)).json()).toEqual({});
        expect(await (await next(id, undefined, socket)).json()).toEqual({ value: 'baseline' });
      } finally {
        await socket.destroy();
      }
    }

    expect(await (await open(18)).json()).toEqual({});
    expect(await (await next(18)).json()).toEqual({ value: 'baseline' });
    await vi.waitFor(() => expect(stopped).toHaveBeenCalledTimes(17));
  });

  it('frees the session control slot when a socket closes during another stream’s poll', async () => {
    const { gateway, origin, post, open, next } = await signedInMember();
    const polling = deferred<AbortSignal>();
    vi.spyOn(gateway.wireStream, 'open').mockImplementation(
      async function (endpoint, _payload, _uplink, _peer, signal) {
        return (async function* () {
          if (endpoint === 'session/control') yield 'session-baseline';
          else {
            polling.resolve(signal);
            if (!signal.aborted) await once(signal, 'abort');
          }
        })();
      },
    );

    const socket = new Client(origin);
    const openControl = (id: number, dispatcher?: Client) =>
      post(
        { op: 'stream-open', id, endpoint: 'session/control', payload: { args: {} } },
        undefined,
        dispatcher,
      );
    try {
      expect(await (await openControl(1, socket)).json()).toEqual({});
      expect(await (await next(1, undefined, socket)).json()).toEqual({
        value: 'session-baseline',
      });
      expect(await (await open(2, undefined, socket)).json()).toEqual({});
      const interrupted = expect(next(2, undefined, socket)).rejects.toMatchObject({
        name: 'TypeError',
      });
      const signal = await polling.promise;
      await socket.destroy();
      await interrupted;
      await vi.waitFor(() => expect(signal.aborted).toBe(true));
    } finally {
      await socket.destroy();
    }

    for (let id = 3; id <= 17; id += 1) expect(await (await open(id)).json()).toEqual({});
    const replacement = await openControl(18);
    expect(replacement.status).toBe(200);
    expect(await replacement.json()).toEqual({});
    expect(await (await next(1)).json()).toEqual({ code: 'stream-not-found' });
    expect((await openControl(19)).status).toBe(429);
  });

  it('stops every open stream when the member HTTP surface closes', async () => {
    const { gateway, open, next } = await signedInMember();
    const stopped = vi.fn();
    vi.spyOn(gateway.wireStream, 'open').mockImplementation(
      async function (_endpoint, _payload, _uplink, _peer, signal) {
        return (async function* () {
          try {
            yield 'baseline';
            if (!signal.aborted) await once(signal, 'abort');
          } finally {
            stopped();
          }
        })();
      },
    );

    for (const id of [1, 2, 3]) {
      expect(await (await open(id)).json()).toEqual({});
      expect(await (await next(id)).json()).toEqual({ value: 'baseline' });
    }
    await cleanup();
    expect(stopped).toHaveBeenCalledTimes(3);
  });

  it('keeps a stream polling on a new socket when its earlier socket closes', async () => {
    const { gateway, origin, open, next } = await signedInMember();
    vi.spyOn(gateway.wireStream, 'open').mockResolvedValue(
      (async function* () {
        yield 'first';
        yield 'second';
      })(),
    );
    const opening = new Client(origin);
    const polling = new Client(origin);
    try {
      expect(await (await open(1, undefined, opening)).json()).toEqual({});
      expect(await (await next(1, undefined, polling)).json()).toEqual({ value: 'first' });
      await opening.destroy();
      expect(await (await next(1, undefined, polling)).json()).toEqual({ value: 'second' });
    } finally {
      await Promise.all([opening.destroy(), polling.destroy()]);
    }
  });

  it('releases an abandoned poll while another stream under the same grant keeps working', async () => {
    const { gateway, origin, open, next } = await signedInMember();
    const polling = deferred<void>();
    const stopped = vi.fn();
    vi.spyOn(gateway.wireStream, 'open')
      .mockImplementationOnce(async function (_endpoint, _payload, _uplink, _peer, signal) {
        return (async function* () {
          try {
            yield 'baseline';
            polling.resolve();
            if (!signal.aborted) await once(signal, 'abort');
          } finally {
            stopped();
          }
        })();
      })
      .mockResolvedValueOnce(
        (async function* () {
          yield 'other-page';
        })(),
      );

    const otherPage = new Client(origin);
    try {
      expect(await (await open(1)).json()).toEqual({});
      expect(await (await open(2, undefined, otherPage)).json()).toEqual({});
      expect(await (await next(1)).json()).toEqual({ value: 'baseline' });
      const controller = new AbortController();
      const result = expect(next(1, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      await polling.promise;
      controller.abort();
      await result;
      await vi.waitFor(() => expect(stopped).toHaveBeenCalledOnce());
      expect(await (await next(1)).json()).toEqual({ code: 'stream-not-found' });
      expect(await (await next(2, undefined, otherPage)).json()).toEqual({ value: 'other-page' });
    } finally {
      await otherPage.destroy();
    }
  });

  it('releases a disconnected opening before the Gateway returns its iterator', async () => {
    const { gateway, open, next } = await signedInMember();
    const opening = deferred<AbortSignal>();
    const opened = deferred<AsyncIterable<unknown>>();
    const returned = vi.fn(async () => ({ done: true, value: undefined }));
    vi.spyOn(gateway.wireStream, 'open')
      .mockImplementationOnce((_endpoint, _payload, _uplink, _peer, signal) => {
        opening.resolve(signal);
        return opened.promise;
      })
      .mockResolvedValueOnce(
        (async function* () {
          yield 'replacement';
        })(),
      );

    const controller = new AbortController();
    const result = expect(open(1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    try {
      const signal = await opening.promise;
      controller.abort();
      await result;
      await vi.waitFor(() => expect(signal.aborted).toBe(true));
      expect(await (await open(1)).json()).toEqual({});
    } finally {
      opened.resolve({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
          return: returned,
        }),
      });
    }
    await vi.waitFor(() => expect(returned).toHaveBeenCalledOnce());
    expect(await (await next(1)).json()).toEqual({ value: 'replacement' });
  });
});
