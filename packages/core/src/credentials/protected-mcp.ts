import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { Client } from '@modelcontextprotocol/client';
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
} from '@modelcontextprotocol/client/stdio';
import { tmpdir } from 'node:os';
import type { PrivateInputs } from './private-inputs.js';
import type { PrivateInputLog } from './diagnostics.js';

export const PRIVATE_MCP_TOOL = 'mcp__private_status__authenticated_status';
const RAW_TOOL = 'authenticated_status';
const SERVER = String.raw`
for (const key of Object.keys(process.env)) if(key.toLowerCase()!=='systemroot') delete process.env[key];
let input='', used=false;
const schema={type:'object',properties:{endpoint:{type:'string'},api_key:{type:'string'},api_secret:{type:'string'}},required:['endpoint','api_key','api_secret'],additionalProperties:false};
function reply(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');}
function error(id){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32602,message:'Protected MCP request refused'}})+'\n');}
async function receive(message){
  if(message.id===undefined)return;
  if(message.method==='initialize')return reply(message.id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'botharness-private-status',version:'1.0.0'}});
  if(message.method==='ping')return reply(message.id,{});
  if(message.method==='tools/list')return reply(message.id,{tools:[{name:'authenticated_status',description:'One authenticated GET; HTTP status only.',inputSchema:schema}]});
  if(message.method!=='tools/call'||message.params?.name!=='authenticated_status'||used)return error(message.id);
  used=true;
  try{
    const values=message.params.arguments;
    if(!values||Object.keys(values).sort().join(',')!=='api_key,api_secret,endpoint'||Object.values(values).some(v=>typeof v!=='string'||v.length>16384))throw Error();
    const url=new URL(values.endpoint);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();
    if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();
    const response=await fetch(url,{method:'GET',redirect:'error',headers:{'x-api-key':values.api_key,'x-api-secret':values.api_secret},signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    reply(message.id,{content:[{type:'text',text:String(response.status)}],structuredContent:{httpStatus:response.status}});
  }catch{reply(message.id,{isError:true,content:[{type:'text',text:'Protected MCP operation failed'}]});}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  input+=chunk;if(input.length>120000)process.exit(2);
  for(let end;(end=input.indexOf('\n'))>=0;){
    let message;try{message=JSON.parse(input.slice(0,end));}catch{process.exit(2);}
    input=input.slice(end+1);void receive(message);
  }
});
process.stdin.on('end',()=>process.exit(0));
process.stdout.on('error',()=>process.exit(2));
`;

export function privateMcpStatus(result: unknown): number {
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    throw new Error('Protected MCP returned an invalid nonsecret result');
  if (
    Object.keys(result).sort().join(',') !== 'content,structuredContent' ||
    !('content' in result) ||
    !Array.isArray(result.content) ||
    result.content.length !== 1 ||
    !('structuredContent' in result) ||
    typeof result.structuredContent !== 'object' ||
    result.structuredContent === null ||
    Array.isArray(result.structuredContent) ||
    Object.keys(result.structuredContent).join(',') !== 'httpStatus' ||
    !('httpStatus' in result.structuredContent)
  )
    throw new Error('Protected MCP returned an invalid nonsecret result');
  const status = result.structuredContent.httpStatus;
  const content: unknown = result.content[0];
  if (
    typeof status !== 'number' ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599 ||
    typeof content !== 'object' ||
    content === null ||
    Array.isArray(content) ||
    Object.keys(content).sort().join(',') !== 'text,type' ||
    !('type' in content) ||
    content.type !== 'text' ||
    !('text' in content) ||
    content.text !== String(status)
  )
    throw new Error('Protected MCP returned an invalid nonsecret result');
  return status;
}

export class ProtectedMcp {
  #closed = false;
  readonly #active = new Set<() => Promise<void>>();
  readonly #definitions = new WeakMap<Agent, ToolDefinition>();
  constructor(readonly log: PrivateInputLog) {}

  register(ctx: Context, agent: Agent, owner: PrivateInputs): void {
    if (scopeOf(ctx) !== agent) throw new Error('Native Agent Scope is required for private MCP');
    const definition = createMcpToolDefinition(ctx, {
      name: PRIVATE_MCP_TOOL,
      rawName: RAW_TOOL,
      description:
        'Qualified MCP consumer: one authenticated GET using opaque endpoint, api_key and api_secret references from ask_secret for this exact account. Returns HTTP status only; success does not itself certify remote authentication. A failed or cancelled operation may already have sent a remote request; do not infer no remote effects from failure. No raw values, arbitrary server, command, headers, redirects or response-body access. Existing execution approval applies.',
      inputSchema: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Exact nonsecret account from ask_secret.' },
          endpoint: { type: 'string', description: 'Opaque endpoint reference.' },
          api_key: { type: 'string', description: 'Opaque API key reference.' },
          api_secret: { type: 'string', description: 'Opaque API secret reference.' },
        },
        required: ['account', 'endpoint', 'api_key', 'api_secret'],
        additionalProperties: false,
      },
      call: async (args, call) => {
        if (Object.keys(args).sort().join(',') !== 'account,api_key,api_secret,endpoint')
          throw new Error('Protected MCP parameters are unsupported');
        if (
          typeof args.account !== 'string' ||
          typeof args.endpoint !== 'string' ||
          typeof args.api_key !== 'string' ||
          typeof args.api_secret !== 'string'
        )
          throw new Error('Protected MCP requires an account and opaque references');
        const result = await owner
          .consume(
            agent,
            args.account,
            { endpoint: args.endpoint, api_key: args.api_key, api_secret: args.api_secret },
            (values, signal) => this.authenticatedStatus(values, signal),
            call.signal,
          )
          .catch((error: unknown) => {
            if (
              error instanceof Error &&
              error.message === 'Protected credential consumer failed or was cancelled'
            )
              throw new Error(
                'Protected MCP failed or was cancelled; a remote request may already have started and remote effects are unknown',
              );
            throw error;
          });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    });
    const tools = ctx.get('tools');
    if (tools === undefined) throw new Error('Native Tool Registry is unavailable');
    tools.register(definition);
    this.#definitions.set(agent, definition);
    ctx.effect(
      () => () => this.#definitions.delete(agent),
      'botharness: private MCP qualification',
    );
  }

  denial(ctx: Context, agent: Agent): string | undefined {
    const definition = this.#definitions.get(agent);
    return definition !== undefined && ctx.get('tools')?.get(PRIVATE_MCP_TOOL, agent) === definition
      ? undefined
      : 'Protected MCP definition has not been qualified for this Agent';
  }

  async authenticatedStatus(values: Record<string, string>, signal: AbortSignal) {
    if (this.#closed || signal.aborted) throw new Error('Protected MCP execution cancelled');
    if (Object.keys(values).sort().join(',') !== 'api_key,api_secret,endpoint')
      throw new Error('Protected MCP requires endpoint, api_key and api_secret references');
    const env = Object.fromEntries(DEFAULT_INHERITED_ENV_VARS.map((key) => [key, '']));
    if (process.platform === 'win32') env.SYSTEMROOT = process.env.SystemRoot ?? '';
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--disable-proto=throw', '-e', SERVER],
      cwd: tmpdir(),
      env,
      stderr: 'ignore',
      maxBufferSize: 4096,
    });
    const client = new Client(
      { name: 'botharness-private-status', version: '1.0.0' },
      {
        capabilities: {},
        versionNegotiation: { mode: 'legacy' },
      },
    );
    let closing: Promise<void> | undefined;
    const stop = () => {
      if (closing !== undefined) return closing;
      if (transport.pid !== null) {
        try {
          process.kill(transport.pid, 'SIGKILL');
        } catch {}
      }
      closing = transport.close().catch(() => undefined);
      return closing;
    };
    const started = Date.now();
    this.#active.add(stop);
    signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 15_000);
    this.log('credential-mcp-started', { program: 'mcp-http-status-v1' });
    try {
      await client.connect(transport, { timeout: 5000, signal });
      if (signal.aborted || this.#closed) throw new Error();
      const tools = await client.listTools({}, { timeout: 5000, signal });
      if (tools.tools.length !== 1 || tools.tools[0]?.name !== RAW_TOOL) throw new Error();
      this.log('credential-mcp-discovered', { program: 'mcp-http-status-v1' });
      const result = await client.callTool(
        { name: RAW_TOOL, arguments: { ...values } },
        {
          timeout: 12_000,
          signal,
          toolDefinition: tools.tools[0],
        },
      );
      if (signal.aborted || this.#closed) throw new Error();
      const httpStatus = privateMcpStatus(result);
      this.log('credential-mcp-completed', {
        program: 'mcp-http-status-v1',
        durationMs: Date.now() - started,
      });
      return {
        consumer: 'mcp-http-status-v1',
        successful: httpStatus >= 200 && httpStatus < 300,
        httpStatus,
        ...([401, 403].includes(httpStatus)
          ? {
              action:
                'Replace private information in Web Chat and retry; remote authorization may also need repair.',
            }
          : {}),
      };
    } catch {
      this.log('credential-mcp-failed', {
        program: 'mcp-http-status-v1',
        durationMs: Date.now() - started,
      });
      throw new Error('Protected MCP execution failed or was cancelled');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      await stop();
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      this.#active.delete(stop);
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    await Promise.allSettled(Array.from(this.#active, (stop) => stop()));
  }
}
