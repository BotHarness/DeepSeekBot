import type { HostApiAnswer, HostApiInit } from './client';
import { LOCAL_VIDEO_PATH } from '../../../../packages/computer/src/local-video-contract';
export async function readComputerAvailability(
  api: (path: string, init?: HostApiInit) => Promise<HostApiAnswer>,
  localVideo: boolean,
): Promise<boolean | undefined> {
  const answer = localVideo
    ? await api(LOCAL_VIDEO_PATH, { body: { kind: 'status' } })
    : await api('/api/computer/status');
  if (answer.status === 404) return false;
  const body = record(answer.body);
  if (localVideo) {
    if (body['ok'] === false && body['code'] === 'unsupported-platform') return false;
    const state = record(body['state']);
    return answer.status === 200 &&
      body['ok'] === true &&
      state['computerId'] === 'local' &&
      typeof state['runtimeId'] === 'string'
      ? true
      : undefined;
  }
  const available = record(body['probe'])['available'];
  return answer.status === 200 && typeof available === 'boolean' ? true : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
