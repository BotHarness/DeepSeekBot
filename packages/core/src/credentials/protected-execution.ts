import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { PrivateInputLog } from './diagnostics.js';

const AUTHENTICATED_STATUS_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>60000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const values=JSON.parse(input); input='';
    const url=new URL(values.endpoint);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) process.exit(2);
    if(url.protocol==='http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) process.exit(2);
    const response=await fetch(url, {method:'GET', redirect:'error',
      headers:{'x-api-key':values.api_key,'x-api-secret':values.api_secret}, signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    process.stdout.write(String(response.status));
  } catch { process.exitCode=2; }
});
`;

const AUTHENTICATED_REQUEST_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>200000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const request=JSON.parse(input); input='';
    let response;
    try {
      response=await fetch(request.url, {method:request.method, redirect:'manual', headers:request.headers,
        ...(request.body===undefined ? {} : {body:request.body}), signal:AbortSignal.timeout(20000)});
    } catch (error) {
      const code=String(error?.cause?.code ?? error?.code ?? '');
      const failure=error?.name==='TimeoutError' ? 'timeout'
        : ['ENOTFOUND','EAI_AGAIN','EAI_NONAME','EAI_FAIL'].includes(code) ? 'dns'
        : ['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(code) ? 'connection'
        : /CERT|SSL|TLS|SELF_SIGNED|ALTNAME/.test(code) ? 'tls'
        : 'network';
      process.stdout.write(JSON.stringify({failure}));
      return;
    }
    const mask=(text)=>{ for(const secret of request.mask){ for(const form of [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)])
      if(form.length>=6) text=text.split(form).join('[secret]'); } return text; };
    if(response.status>=300 && response.status<400 && response.headers.has('location')){
      await response.body?.cancel();
      process.stdout.write(JSON.stringify({status:response.status, contentType:response.headers.get('content-type')??'', body:'', truncated:false,
        location:mask(String(response.headers.get('location')).slice(0,2000))}));
      return;
    }
    const reader=response.body?.getReader(); const chunks=[]; let size=0; let truncated=false;
    while(reader){ const {done,value}=await reader.read(); if(done) break; size+=value.length;
      if(size>request.limit){ truncated=true; await reader.cancel(); break; } chunks.push(value); }
    const text=mask(Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify({status:response.status, contentType:response.headers.get('content-type')??'', body:text, truncated}));
  } catch { process.exitCode=2; }
});
`;

export interface SecretHttpRequest {
  endpoint: string;
  path: string;
  method: string;
  headers: Array<{ name: string; value: string }>;
  query: Array<{ name: string; value: string }>;
  body?: string;
}

export interface SecretHttpResult {
  consumer: 'http-request-v1';
  httpStatus: number;
  successful: boolean;
  contentType: string;
  body: string;
  truncated: boolean;
  location?: string;
  action?: string;
}

const SECRET_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_HTTP_FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
]);
const SECRET_HTTP_BODY_LIMIT = 64_000;
const SECRET_HTTP_RESPONSE_LIMIT = 32_000;

export class SecretHttpRefusal extends Error {}

const SECRET_HTTP_FAILURES = {
  timeout:
    'The request reached no answer within 20 seconds; the API may be slow or unreachable from this Host.',
  dns: 'The API host name could not be resolved from this Host; check the endpoint the Owner entered.',
  connection:
    'This Host could not connect to the API; it may be down, blocked or need a network proxy.',
  tls: 'The API TLS certificate was not accepted by this Host.',
  network: 'The request failed on the network before the API answered.',
} as const;

export function secretHttpTarget(endpoint: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(endpoint);
  } catch {
    throw new SecretHttpRefusal('The Owner-supplied endpoint is not a valid URL');
  }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password)
    throw new SecretHttpRefusal(
      'The Owner-supplied endpoint must be an http(s) URL without credentials',
    );
  if (base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
    throw new SecretHttpRefusal('Plain http is allowed only for a local endpoint');
  if (base.hash !== '')
    throw new SecretHttpRefusal('The Owner-supplied endpoint must not carry a fragment');
  if (
    path !== '' &&
    (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path))
  )
    throw new SecretHttpRefusal('path must be empty or start with a single /');
  const target = new URL(base.pathname.replace(/\/$/, '') + path, base.origin);
  const prefix = base.pathname.replace(/\/$/, '');
  if (
    target.origin !== base.origin ||
    (prefix !== '' && target.pathname !== prefix && !target.pathname.startsWith(prefix + '/'))
  )
    throw new SecretHttpRefusal('path leaves the Owner-supplied endpoint');
  const merged = new URLSearchParams(base.search);
  for (const [name, value] of target.searchParams) merged.append(name, value);
  target.search = merged.toString();
  return target;
}

export class ProtectedExecution {
  #closed = false;
  readonly #children = new Set<ReturnType<typeof spawn>>();
  constructor(readonly log: PrivateInputLog) {}

  async authenticatedStatus(
    values: Record<string, string>,
    signal: AbortSignal,
  ): Promise<{ consumer: string; successful: boolean; httpStatus: number; action?: string }> {
    if (Object.keys(values).sort().join(',') !== 'api_key,api_secret,endpoint')
      throw new Error('http-status-v1 requires endpoint, api_key and api_secret references');
    if (signal.aborted || this.#closed) throw new Error('Protected credential execution cancelled');
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-status-v1' });
    const output = await this.#spawn(
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_STATUS_CLI],
      JSON.stringify(values),
      signal,
      true,
    );
    if (!/^[1-5][0-9]{2}$/.test(output))
      throw new Error('Protected CLI returned an invalid nonsecret result');
    const httpStatus = Number(output);
    this.log('credential-cli-completed', {
      program: 'http-status-v1',
      durationMs: Date.now() - started,
    });
    return {
      consumer: 'http-status-v1',
      successful: httpStatus >= 200 && httpStatus < 300,
      httpStatus,
      ...([401, 403].includes(httpStatus)
        ? {
            action:
              'Replace private information in Web Chat and retry; remote authorization may also need repair.',
          }
        : {}),
    };
  }

  async authenticatedRequest(
    request: SecretHttpRequest,
    secrets: readonly string[],
    signal: AbortSignal,
  ): Promise<SecretHttpResult> {
    const method = request.method.toUpperCase();
    if (!SECRET_HTTP_METHODS.has(method)) throw new SecretHttpRefusal('method is not supported');
    const target = secretHttpTarget(request.endpoint, request.path);
    for (const entry of request.query) {
      if (entry.name.length === 0 || entry.name.length > 200)
        throw new SecretHttpRefusal('query name is invalid');
      target.searchParams.append(entry.name, entry.value);
    }
    const headers: Record<string, string> = {};
    for (const entry of request.headers) {
      const name = entry.name.toLowerCase();
      if (
        !/^[a-z0-9!#$%&'*+.^_\`|~-]{1,100}$/.test(name) ||
        SECRET_HTTP_FORBIDDEN_HEADERS.has(name) ||
        /[\r\n]/.test(entry.value) ||
        entry.value.length > 8_000
      )
        throw new SecretHttpRefusal('header is not allowed');
      headers[name] = entry.value;
    }
    if (
      request.body !== undefined &&
      (method === 'GET' || request.body.length > SECRET_HTTP_BODY_LIMIT)
    )
      throw new SecretHttpRefusal('body is not allowed for this request');
    if (signal.aborted || this.#closed) throw new Error('Protected credential execution cancelled');
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-request-v1' });
    const output = await this.#spawn(
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_REQUEST_CLI],
      JSON.stringify({
        url: target.href,
        method,
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        mask: [...secrets, ...new URL(request.endpoint).searchParams.values()].filter(
          (value) => value.length >= 6,
        ),
        limit: SECRET_HTTP_RESPONSE_LIMIT,
      }),
      signal,
      true,
      SECRET_HTTP_RESPONSE_LIMIT * 8,
      30_000,
    );
    let parsed: {
      status?: unknown;
      contentType?: unknown;
      body?: unknown;
      truncated?: unknown;
      location?: unknown;
      failure?: unknown;
    };
    try {
      parsed = JSON.parse(output) as typeof parsed;
    } catch {
      throw new Error('Protected request returned an invalid result');
    }
    if (typeof parsed.failure === 'string' && parsed.failure in SECRET_HTTP_FAILURES) {
      this.log('credential-cli-unreachable', {
        program: 'http-request-v1',
        failure: parsed.failure as keyof typeof SECRET_HTTP_FAILURES,
        durationMs: Date.now() - started,
      });
      throw new SecretHttpRefusal(
        SECRET_HTTP_FAILURES[parsed.failure as keyof typeof SECRET_HTTP_FAILURES],
      );
    }
    if (
      typeof parsed.status !== 'number' ||
      typeof parsed.contentType !== 'string' ||
      typeof parsed.body !== 'string' ||
      (parsed.location !== undefined && typeof parsed.location !== 'string')
    )
      throw new Error('Protected request returned an invalid result');
    this.log('credential-cli-completed', {
      program: 'http-request-v1',
      durationMs: Date.now() - started,
    });
    return {
      consumer: 'http-request-v1',
      httpStatus: parsed.status,
      successful: parsed.status >= 200 && parsed.status < 300,
      contentType: parsed.contentType.slice(0, 200),
      body: parsed.body,
      truncated: parsed.truncated === true,
      ...(typeof parsed.location === 'string'
        ? {
            location: parsed.location,
            action:
              'The API answered with a redirect, which is not followed. Retry with the path or endpoint it points to; a different origin needs the Owner to replace the endpoint field.',
          }
        : {}),
    };
  }

  #spawn(
    program: string,
    args: string[],
    stdin: string,
    signal: AbortSignal,
    credentialBearing: boolean,
    outputLimit?: number,
    timeoutMs?: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.#closed || signal.aborted) {
        reject(new Error('Protected execution cancelled'));
        return;
      }
      const child = spawn(program, args, {
        windowsHide: true,
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(credentialBearing
          ? { env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {} }
          : {}),
      });
      this.#children.add(child);
      let output = '';
      let failed = false;
      const limit = outputLimit ?? (credentialBearing ? 3 : 16_000);
      const stop = () => {
        failed = true;
        child.kill();
      };
      const timer = setTimeout(stop, timeoutMs ?? (credentialBearing ? 15_000 : 30_000));
      signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > limit) {
          output = '';
          stop();
        }
      });
      child.stderr.on('data', () => undefined);
      child.stdin.on('error', () => stop());
      child.on('error', () => {
        failed = true;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        this.#children.delete(child);
        if (failed || code !== 0 || signal.aborted) {
          this.log('execution-failed');
          reject(new Error('Protected execution failed or was cancelled'));
        } else resolve(output);
      });
      child.stdin.end(stdin);
    });
  }

  close(): void {
    this.#closed = true;
    for (const child of this.#children) child.kill();
  }
}
