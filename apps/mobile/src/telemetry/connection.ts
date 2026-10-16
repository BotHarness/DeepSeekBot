import type { ConnectionState } from '../host/client';
import type { MobileTelemetry } from './mobile-telemetry';
import type { ConnectionOutcome, ConnectionReason, ConnectionTrigger } from './schema';

export function createConnectionTelemetry(telemetry: MobileTelemetry, initial: ConnectionTrigger) {
  let observation: ReturnType<MobileTelemetry['connection']> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  let connected = false;
  let timedOut = false;
  function finish(outcome: ConnectionOutcome, reason: ConnectionReason = 'none') {
    clearTimeout(timer);
    observation?.finish(outcome, retries, reason);
    observation = undefined;
  }
  function begin(trigger: ConnectionTrigger) {
    finish('cancelled');
    connected = false;
    timedOut = false;
    retries = 0;
    if (!telemetry.isActive()) return;
    observation = telemetry.connection(trigger);
    timer = setTimeout(() => {
      finish('timeout');
      timedOut = true;
    }, 30_000);
  }
  const off = telemetry.onBackground(() => {
    finish('cancelled');
    connected = false;
    timedOut = false;
  });
  begin(initial);
  return {
    begin,
    update(status: ConnectionState['status'], attempt = 0, reason: ConnectionReason = 'none') {
      if (!telemetry.isActive()) return;
      retries = Math.max(retries, attempt);
      if (status === 'connected') {
        if (connected) return;
        if (observation === undefined) begin('recovery');
        finish('ready');
        connected = true;
        timedOut = false;
      } else if (status === 'refused') {
        finish('refused', reason);
        connected = false;
      } else if (status === 'stopped') {
        finish('cancelled');
        connected = false;
      } else if (connected) begin('recovery');
      else if (observation === undefined && !timedOut) begin('recovery');
    },
    dispose() {
      finish('cancelled');
      off();
    },
  };
}
export type ConnectionTelemetry = ReturnType<typeof createConnectionTelemetry>;
