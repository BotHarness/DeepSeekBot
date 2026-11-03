import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { PrivateInputFailure, type PrivateInputLog } from './diagnostics.js';

const AUTHENTICATED_STATUS_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>60000) process.exit(2); });
const classify=(error)=>{
  const code=String(error?.cause?.code ?? error?.code ?? '');
  return error?.name==='TimeoutError' ? 'timeout'
    : /redirect/i.test(String(error?.cause?.message ?? '')) ? 'redirect'
    : ['ENOTFOUND','EAI_AGAIN','EAI_NONAME','EAI_FAIL'].includes(code) ? 'dns'
    : ['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(code) ? 'connection'
    : /CERT|SSL|TLS|SELF_SIGNED|ALTNAME/.test(code) ? 'tls'
    : 'network';
};
process.stdin.on('end', async () => {
  let values;
  try { values=JSON.parse(input); input=''; } catch { process.exitCode=2; return; }
  let url;
  try { url=new URL(values.endpoint); } catch { process.stdout.write('failure:endpoint'); return; }
  if(!['https:','http:'].includes(url.protocol) || url.username || url.password
    || (url.protocol==='http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname))) { process.stdout.write('failure:endpoint'); return; }
  try {
    const response=await fetch(url, {method:'GET', redirect:'error',
      headers:{'x-api-key':values.api_key,'x-api-secret':values.api_secret}, signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    process.stdout.write(String(response.status));
  } catch (error) { process.stdout.write('failure:'+classify(error)); }
});
`;

const AUTHENTICATED_REQUEST_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>200000) process.exit(2); });
const classify=(error)=>{
  const code=String(error?.cause?.code ?? error?.code ?? '');
  return error?.name==='TimeoutError' ? 'timeout'
    : ['ENOTFOUND','EAI_AGAIN','EAI_NONAME','EAI_FAIL'].includes(code) ? 'dns'
    : ['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(code) ? 'connection'
    : /CERT|SSL|TLS|SELF_SIGNED|ALTNAME/.test(code) ? 'tls'
    : 'network';
};
process.stdin.on('end', async () => {
  let request;
  try { request=JSON.parse(input); input=''; } catch { process.exitCode=2; return; }
  const mask=(text)=>{ for(const secret of request.mask){ for(const form of [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)])
    if(form.length>=6) text=text.split(form).join('[secret]'); } return text; };
  let output;
  try {
    const response=await fetch(request.url, {method:request.method, redirect:'manual', headers:request.headers,
      ...(request.body===undefined ? {} : {body:request.body}), signal:AbortSignal.timeout(20000)});
    if(response.status>=300 && response.status<400 && response.headers.has('location')){
      await response.body?.cancel();
      output={status:response.status, contentType:response.headers.get('content-type')??'', body:'', truncated:false,
        location:mask(String(response.headers.get('location'))).slice(0,2000)};
    } else {
      const reader=response.body?.getReader(); const chunks=[]; let size=0; let truncated=false;
      while(reader){ const {done,value}=await reader.read(); if(done) break; size+=value.length;
        if(size>request.limit){ truncated=true; await reader.cancel(); break; } chunks.push(value); }
      output={status:response.status, contentType:response.headers.get('content-type')??'', body:mask(Buffer.concat(chunks).toString('utf8')), truncated};
    }
  } catch (error) { output={failure:classify(error)}; }
  process.stdout.write(JSON.stringify(output));
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
  timeout: 'The request got no answer in time; the API may be slow or unreachable from this Host.',
  dns: 'The API host name could not be resolved from this Host; check the endpoint the Owner entered.',
  connection:
    'This Host could not connect to the API; it may be down, blocked or need a network proxy.',
  tls: 'The API TLS certificate was not accepted by this Host.',
  network: 'The request failed on the network before the API answered.',
  endpoint:
    'The Owner-supplied endpoint is not an https URL, or a plain http URL outside this computer; the Owner should replace the endpoint field.',
  redirect:
    'The API answered with a redirect, which is not followed; the Owner should replace the endpoint field with the final address.',
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
  ): Promise<{
    consumer: string;
    successful: boolean;
    httpStatus: number;
    action?: string;
  }> {
    if (Object.keys(values).sort().join(',') !== 'api_key,api_secret,endpoint')
      throw new PrivateInputFailure(
        'http-status-v1 requires endpoint, api_key and api_secret references',
        'invalid-references',
      );
    if (signal.aborted || this.#closed)
      throw new PrivateInputFailure(
        'The protected request was cancelled before it started.',
        'cancelled',
      );
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-status-v1' });
    const output = await this.#spawn(
      'http-status-v1',
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_STATUS_CLI],
      JSON.stringify(values),
      signal,
      true,
      32,
    );
    const failure = /^failure:([a-z]+)$/.exec(output)?.[1];
    if (failure !== undefined && failure in SECRET_HTTP_FAILURES) {
      this.log('credential-cli-unreachable', {
        program: 'http-status-v1',
        failure,
        durationMs: Date.now() - started,
      });
      throw new PrivateInputFailure(
        SECRET_HTTP_FAILURES[failure as keyof typeof SECRET_HTTP_FAILURES],
        failure,
      );
    }
    if (!/^[1-5][0-9]{2}$/.test(output)) {
      this.log('execution-failed', {
        program: 'http-status-v1',
        reason: 'invalid-result',
      });
      throw new PrivateInputFailure(
        'The protected helper returned a result the Host could not read.',
        'invalid-result',
      );
    }
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
    if (signal.aborted || this.#closed)
      throw new PrivateInputFailure(
        'The protected request was cancelled before it started.',
        'cancelled',
      );
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-request-v1' });
    const output = await this.#spawn(
      'http-request-v1',
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
      throw this.#invalid('http-request-v1');
    }
    if (typeof parsed.failure === 'string' && parsed.failure in SECRET_HTTP_FAILURES) {
      this.log('credential-cli-unreachable', {
        program: 'http-request-v1',
        failure: parsed.failure,
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
      throw this.#invalid('http-request-v1');
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

  #invalid(program: string): PrivateInputFailure {
    this.log('execution-failed', { program, reason: 'invalid-result' });
    return new PrivateInputFailure(
      'The protected helper returned a result the Host could not read.',
      'invalid-result',
    );
  }

  #spawn(
    label: string,
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
        reject(
          new PrivateInputFailure(
            'The protected request was cancelled before it started.',
            'cancelled',
          ),
        );
        return;
      }
      const child = spawn(program, args, {
        windowsHide: true,
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(credentialBearing
          ? {
              env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
            }
          : {}),
      });
      this.#children.add(child);
      let output = '';
      let failure: 'cancelled' | 'timeout' | 'output-limit' | 'start' | 'stdin' | undefined;
      const limit = outputLimit ?? (credentialBearing ? 3 : 16_000);
      const wait = timeoutMs ?? (credentialBearing ? 15_000 : 30_000);
      const stop = (reason: NonNullable<typeof failure>) => {
        failure ??= reason;
        child.kill();
      };
      const timer = setTimeout(() => stop('timeout'), wait);
      const abort = () => stop('cancelled');
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > limit) {
          output = '';
          stop('output-limit');
        }
      });
      child.stderr.on('data', () => undefined);
      child.stdin.on('error', () => stop('stdin'));
      child.on('error', () => {
        failure ??= 'start';
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.#children.delete(child);
        if (failure === undefined && signal.aborted) failure = 'cancelled';
        if (failure === undefined && code === 0) {
          resolve(output);
          return;
        }
        const reason = failure ?? 'exit';
        const message = {
          cancelled: 'The protected request was cancelled before it finished.',
          timeout: `The protected helper did not finish within ${Math.round(wait / 1000)} seconds and was stopped.`,
          'output-limit': 'The protected helper returned more output than allowed and was stopped.',
          start: 'The Host could not start its protected helper process.',
          stdin: 'The protected helper closed before the Host could hand it the request.',
          exit: `The protected helper exited with code ${String(code)}.`,
        }[reason];
        this.log('execution-failed', {
          program: label,
          reason,
          exitCode: code,
        });
        reject(new PrivateInputFailure(message, reason));
      });
      child.stdin.end(stdin);
    });
  }

  close(): void {
    this.#closed = true;
    for (const child of this.#children) child.kill();
  }
}
