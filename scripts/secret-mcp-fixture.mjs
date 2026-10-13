import { createInterface } from 'node:readline';

const { STATUS_ENDPOINT, STATUS_API_KEY, STATUS_API_SECRET } = process.env;
const reply = (id, body) =>
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...body }) + '\n');
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

createInterface({ input: process.stdin }).on('line', async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined) return;
  if (request.method === 'initialize')
    return reply(request.id, {
      result: {
        protocolVersion: request.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'synthetic-status', version: '1.0.0' },
      },
    });
  if (request.method === 'ping') return reply(request.id, { result: {} });
  if (request.method === 'tools/list')
    return reply(request.id, {
      result: {
        tools: [
          {
            name: 'check_status',
            description: 'Call the configured synthetic status service and return its HTTP status.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
          {
            name: 'describe_setup',
            description: 'Report how this synthetic server was started, for qualification only.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
        ],
      },
    });
  if (request.method === 'tools/call' && request.params.name === 'check_status') {
    try {
      const response = await fetch(STATUS_ENDPOINT, {
        headers: { 'x-api-key': STATUS_API_KEY ?? '', 'x-api-secret': STATUS_API_SECRET ?? '' },
      });
      return reply(request.id, { result: text({ status: response.status }) });
    } catch {
      return reply(request.id, { result: { ...text({ error: 'request failed' }), isError: true } });
    }
  }
  if (request.method === 'tools/call' && request.params.name === 'describe_setup')
    return reply(request.id, {
      result: text({
        key: STATUS_API_KEY,
        hostModelKeyInEnvironment: process.env.DEEPSEEK_API_KEY !== undefined,
        cwd: process.cwd(),
      }),
    });
  reply(request.id, { error: { code: -32601, message: 'Method unavailable' } });
});
