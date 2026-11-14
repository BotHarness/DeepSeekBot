import { z } from 'zod';
import { RelationshipRefused } from './relationships.js';
import type { RelationshipControl } from './relationship-control.js';

export const RELATIONSHIPS_PATH = '/api/botharness/relationships';
const id = z.string().regex(/^[A-Za-z0-9_-]{32}$/u);
const key = z.string().regex(/^[0-9a-f]{64}$/u);
const command = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('initiate'),
    link: z.string().max(16_384),
    confirmedKey: key,
    confirm: z.literal(true),
  }),
  z.object({ action: z.literal('approve'), id, confirmedKey: key, confirm: z.literal(true) }),
  z.object({ action: z.literal('sync'), id }),
  z.object({ action: z.literal('route'), id, link: z.string().max(16_384) }),
  z.object({ action: z.literal('enroll'), id, publicKey: key, name: z.string().min(1).max(60) }),
  z.object({ action: z.literal('disconnect'), id, confirm: z.literal(true) }),
  z.object({ action: z.literal('cancel'), id, confirm: z.literal(true) }),
]);

export const RELATIONSHIP_ACTIONS: readonly string[] = command.options.map(
  (option) => option.shape.action.value,
);

export function createRelationshipHttp(control: RelationshipControl) {
  return async (request: Request): Promise<Response> => {
    const reply = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
    if (request.method === 'GET') return reply({ relationships: control.list() });
    if (request.method !== 'POST') return reply({ code: 'method-not-allowed' }, 405);
    let input: z.infer<typeof command>;
    try {
      const text = await request.text();
      if (text.length > 20_000) return reply({ code: 'request-too-large' }, 413);
      const parsed = command.safeParse(JSON.parse(text));
      if (!parsed.success) return reply({ code: 'relationship-input-invalid' }, 400);
      input = parsed.data;
    } catch {
      return reply({ code: 'relationship-input-invalid' }, 400);
    }
    try {
      if (input.action === 'initiate')
        return reply({
          relationship: await control.initiate(input.link, input.confirmedKey),
          local: await control.identity(),
        });
      if (input.action === 'approve')
        return reply({ relationship: control.approve(input.id, input.confirmedKey) });
      if (input.action === 'sync') return reply({ relationship: await control.sync(input.id) });
      if (input.action === 'route')
        return reply({ relationship: await control.recoverRoute(input.id, input.link) });
      if (input.action === 'enroll')
        return reply(await control.enroll(input.id, input.publicKey, input.name));
      return reply({
        relationship: await control.disconnect(
          input.id,
          input.action === 'cancel' ? { pendingOnly: true } : {},
        ),
      });
    } catch (error) {
      return reply(
        {
          code: error instanceof RelationshipRefused ? error.code : 'relationship-operation-failed',
        },
        409,
      );
    }
  };
}
