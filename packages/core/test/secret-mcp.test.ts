import type { Agent } from '@deepseek-ai/dsh-agent';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { SecretCommandRefusal } from '../src/credentials/secret-command.js';
import {
  SECRET_MCP_KEEP,
  SECRET_MCP_LAUNCHER,
  SecretMcpServers,
  secretMcpDenial,
  secretMcpEnv,
  secretMcpPlan,
} from '../src/credentials/secret-mcp.js';

const env = [{ name: 'GITHUB_TOKEN', value: '{{token}}' }];

describe('Host-started MCP server with Owner secrets', () => {
  it('accepts a launcher with arguments and keeps the secret out of them', () => {
    expect(
      secretMcpPlan({
        server_name: 'github',
        program: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env,
      }),
    ).toEqual({
      serverName: 'github',
      command: ['npx', '-y', '@modelcontextprotocol/server-github'],
      names: ['GITHUB_TOKEN'],
    });
    for (const input of [
      { server_name: 'git hub', program: 'npx', args: [], env },
      { server_name: 'github', program: '/usr/bin/npx', args: [], env },
      { server_name: 'github', program: 'sh', args: ['-c', 'npx server'], env },
      { server_name: 'github', program: 'npx', args: ['--token', '{{token}}'], env },
      { server_name: 'github', program: 'npx', args: [], env: [{ name: 'PATH', value: '{{t}}' }] },
      { server_name: 'github', program: 'npx', args: [], env: [{ name: 'TOKEN', value: 'plain' }] },
    ])
      expect(() => secretMcpPlan(input), JSON.stringify(input)).toThrow(SecretCommandRefusal);
  });

  it('names the reason before any approval is asked for', () => {
    expect(
      secretMcpDenial({ server_name: 'github', program: 'node', args: ['server.mjs'], env }),
    ).toBeUndefined();
    expect(
      secretMcpDenial({ server_name: 'github', program: 'bash', args: ['-c', 'x'], env }),
    ).toContain('shell');
    expect(secretMcpDenial({ server_name: 'github', program: 'npx', args: 'x', env })).toBe(
      'secret_mcp_connect arguments are invalid',
    );
  });

  it('gives the server a clean environment with caches under the temp area', () => {
    const result = secretMcpEnv({
      PATH: '/usr/bin',
      HOME: '/home/owner',
      DEEPSEEK_API_KEY: 'SYNTHETIC-host-key',
    });
    expect(result['PATH']).toBe('/usr/bin');
    expect(result['DEEPSEEK_API_KEY']).toBeUndefined();
    expect(result['npm_config_cache']).toContain('botharness-mcp-cache');
    expect(result['UV_CACHE_DIR']).toContain('botharness-mcp-cache');
  });

  it('reports nothing connected and masks nothing for an Agent without servers', async () => {
    const servers = new SecretMcpServers();
    const agent = { session: { id: 'owned' } } as Agent;
    expect(servers.list(agent)).toEqual([]);
    expect(servers.has(agent, 'github')).toBe(false);
    expect(servers.mask(agent, 'mcp__github__search', 'SYNTHETIC-value')).toBe('SYNTHETIC-value');
    expect(await servers.stop(agent, 'github')).toBe(false);
    await servers.close();
  });

  it('starts the server with only the named variables, whatever the launcher itself inherited', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        SECRET_MCP_LAUNCHER,
        '--',
        process.execPath,
        '-e',
        'process.stdout.write(Object.keys(process.env).sort().join(","))',
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env['PATH'],
          DEMO_TOKEN: 'SYNTHETIC-demo-token',
          AMBIENT_HOST_SETTING: 'ambient',
          [SECRET_MCP_KEEP]: 'PATH,DEMO_TOKEN',
        },
      },
    );
    expect(result.status).toBe(0);
    const names = result.stdout.split(',');
    expect(names).toContain('DEMO_TOKEN');
    expect(names).toContain('PATH');
    expect(names).not.toContain('AMBIENT_HOST_SETTING');
    expect(names).not.toContain(SECRET_MCP_KEEP);
  });
});
