import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
  json: any;
}

export function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['DSH_HOME'];
  return env;
}

export async function invoke(
  argv: string[],
  home: string,
  extraEnv: Record<string, string> = {},
  stdin = '',
): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runBotCreateCli(['--home', home, ...argv], {
    env: { ...baseEnv(), ...extraEnv },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readStdin: async () => stdin,
  });
  const stdout = out.join('\n');
  return { code, stdout, stderr: err.join('\n'), json: JSON.parse(stdout) };
}
