import { once } from 'node:events';
import { Client, fetch } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEAM_PATH } from '../src/team/http.js';
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
  return { gateway: fixture.gateway, origin: http.origin, open, next };
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
    const { gateway, open, next } = await signedInMember();
    const polling = Promise.withResolvers<void>();
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

    expect(await (await open(1)).json()).toEqual({});
    expect(await (await open(2)).json()).toEqual({});
    expect(await (await next(1)).json()).toEqual({ value: 'baseline' });
    const controller = new AbortController();
    const result = expect(next(1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await polling.promise;
    controller.abort();
    await result;
    await vi.waitFor(() => expect(stopped).toHaveBeenCalledOnce());
    expect(await (await next(1)).json()).toEqual({ code: 'stream-not-found' });
    expect(await (await next(2)).json()).toEqual({ value: 'other-page' });
  });

  it('releases a disconnected opening before the Gateway returns its iterator', async () => {
    const { gateway, open, next } = await signedInMember();
    const opening = Promise.withResolvers<AbortSignal>();
    const opened = Promise.withResolvers<AsyncIterable<unknown>>();
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
