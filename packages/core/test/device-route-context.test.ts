import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { expect, it } from 'vitest';
import {
  DEVICE_ROUTE_HEADER,
  forwardDeviceRoute,
  isConnectRequest,
  stampConnectRoute,
} from '../src/devices/route-context.js';

it('replaces duplicate raw headers without trusting a Host name or caller label', () => {
  const request = new IncomingMessage(new Socket());
  request.headers = { host: 'safety.deepseekbot.dev', [DEVICE_ROUTE_HEADER]: 'connect' };
  request.rawHeaders = [
    'Host',
    'safety.deepseekbot.dev',
    'X-BotHarness-Device-Route',
    'connect',
    DEVICE_ROUTE_HEADER,
    'tailscale',
  ];
  expect(isConnectRequest(request)).toBe(false);
  expect(forwardDeviceRoute(request)).toEqual({});
  stampConnectRoute(request);
  expect(isConnectRequest(request)).toBe(true);
  expect(
    request.rawHeaders.filter((value) => value.toLowerCase() === DEVICE_ROUTE_HEADER),
  ).toHaveLength(1);
  delete request.headers[DEVICE_ROUTE_HEADER];
  expect(isConnectRequest(request)).toBe(false);
  stampConnectRoute(request);
  expect(isConnectRequest(request)).toBe(true);
  request.destroy();
});
