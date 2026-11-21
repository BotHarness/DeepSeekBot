import './private-tunnel-fixtures.js';
import { createTunnelLookup } from '../src/devices/tunnel-dns.js';
import { expect, it, vi } from 'vitest';

it('rechecks a Quick Tunnel DNS miss against configured DNS without changing other hosts or successful answers', () => {
  const missing = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  const query = vi.fn((_host, callback) => callback(null, ['192.0.2.10']));
  const lookup = createTunnelLookup({
    systemLookup: (_host, _options, callback) => callback(missing, ''),
    query,
  });
  const result = vi.fn();
  lookup('new.trycloudflare.com', { all: true }, result);
  expect(result).toHaveBeenLastCalledWith(null, [{ address: '192.0.2.10', family: 4 }], 4);
  lookup('custom.example.com', {}, result);
  expect(result).toHaveBeenLastCalledWith(missing, '', undefined);
  lookup('new.trycloudflare.com', { family: 6 }, result);
  expect(query).toHaveBeenCalledTimes(1);
  createTunnelLookup({
    systemLookup: (_host, _options, callback) => callback(null, '192.0.2.20', 4),
    query,
  })('new.trycloudflare.com', {}, result);
  expect(result).toHaveBeenLastCalledWith(null, '192.0.2.20', 4);
  expect(query).toHaveBeenCalledTimes(1);
});

it('recovers an official Connect DNS miss using a fresh query without weakening unrelated DNS failures', () => {
  const missing = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  const query = vi.fn((_host, callback) => callback(null, ['192.0.2.10']));
  const lookup = createTunnelLookup({
    systemLookup: (_host, _options, callback) => callback(missing, ''),
    query,
  });
  const result = vi.fn();
  lookup('habcdefgh2345.botharness.ai', { all: true }, result);
  expect(result).toHaveBeenLastCalledWith(null, [{ address: '192.0.2.10', family: 4 }], 4);
  lookup('habcdefgh2345.botharness.ai.attacker.example', {}, result);
  expect(result).toHaveBeenLastCalledWith(missing, '', undefined);
  expect(query).toHaveBeenCalledTimes(1);
});

it.each(['empty', 'failed'])('retains the DNS refusal when a fresh query is %s', (outcome) => {
  const missing = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  const recovered = vi.fn();
  const lookup = createTunnelLookup({
    systemLookup: (_host, _options, callback) => callback(missing, ''),
    query: (_host, callback) => callback(outcome === 'failed' ? missing : null, []),
    onRecovery: recovered,
  });
  const result = vi.fn();
  lookup('habcdefgh2345.botharness.ai', {}, result);
  expect(result).toHaveBeenLastCalledWith(missing, '', undefined);
  expect(recovered).not.toHaveBeenCalled();
});
