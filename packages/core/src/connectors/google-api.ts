import { z } from 'zod';

import { ConnectorError } from './errors.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary/';
const PEOPLE = 'https://people.googleapis.com/v1/';
const PAGE_SIZE = '20';

export interface GoogleRequest {
  url: URL;
  payload?: unknown;
  response: z.ZodType;
}

function get(
  base: string,
  path: string,
  response: z.ZodType,
  query?: Record<string, string>,
): GoogleRequest {
  const url = new URL(`./${path}`, base);
  url.search = new URLSearchParams(query).toString();
  return { url, response };
}

const reference = z.object({ id: z.string(), threadId: z.string().optional() });
const event = z.object({
  id: z.string(),
  summary: z.string().optional(),
  status: z.string().optional(),
  htmlLink: z.string().optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }).optional(),
  location: z.string().optional(),
});
const events = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(event).default([]),
});
const timestamp = z.iso.datetime({ offset: true });
function eventWindow(start: string, end: string) {
  if (
    !timestamp.safeParse(start).success ||
    !timestamp.safeParse(end).success ||
    Date.parse(end) <= Date.parse(start)
  )
    throw new ConnectorError(
      'invalid',
      'Use RFC 3339 start and end date-times with time zones, with end after start.',
    );
  return { start, end };
}

export function listEvents(start: string, end: string, page?: string) {
  const window = eventWindow(start, end);
  return get(CALENDAR, 'events', events, {
    timeMin: window.start,
    timeMax: window.end,
    maxResults: PAGE_SIZE,
    singleEvents: 'true',
    orderBy: 'startTime',
    ...(page === undefined ? {} : { pageToken: page }),
    fields: 'nextPageToken,items(id,summary,status,htmlLink,start,end,location)',
  });
}

export function createEvent(summary: string, start: string, end: string): GoogleRequest {
  const window = eventWindow(start, end);
  if (summary.trim() === '' || summary.length > 500)
    throw new ConnectorError('invalid', 'Calendar event title must be 1 to 500 characters.');
  return {
    ...get(CALENDAR, 'events', event, {
      fields: 'id,summary,status,htmlLink,start,end,location',
    }),
    payload: { summary, start: { dateTime: window.start }, end: { dateTime: window.end } },
  };
}

export function findMail(query: string, page?: string) {
  return get(
    GMAIL,
    'messages',
    z.object({
      nextPageToken: z.string().optional(),
      messages: z.array(reference).default([]),
    }),
    {
      q: query,
      maxResults: PAGE_SIZE,
      ...(page === undefined ? {} : { pageToken: page }),
      fields: 'nextPageToken,messages(id,threadId)',
    },
  );
}

const header = z.object({ name: z.string(), value: z.string() });
const part = z.object({
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  body: z.object({ data: z.string().optional() }).optional(),
  parts: z.array(z.unknown()).optional(),
});
const mail = z
  .object({
    ...reference.shape,
    snippet: z.string().default(''),
    payload: part.extend({ headers: z.array(header).default([]) }),
  })
  .transform(({ payload, snippet, ...ids }) => {
    const headers = Object.fromEntries(
      payload.headers
        .filter(({ name }) => ['from', 'to', 'subject', 'date'].includes(name.toLowerCase()))
        .map(({ name, value }) => [name.toLowerCase(), value.slice(0, 2000)]),
    );
    return { ...ids, ...headers, body: plainText(payload, 0) ?? snippet.slice(0, 2000) };
  });

function plainText(input: unknown, depth: number): string | undefined {
  if (depth > 8) return undefined;
  const parsed = part.safeParse(input);
  if (!parsed.success || parsed.data.filename) return undefined;
  const { mimeType, body, parts } = parsed.data;
  if (mimeType === 'text/plain' && body?.data)
    return Buffer.from(body.data.slice(0, 24_000), 'base64url').toString('utf8').slice(0, 12_000);
  for (const child of parts?.slice(0, 30) ?? []) {
    const text = plainText(child, depth + 1);
    if (text !== undefined) return text;
  }
  return undefined;
}

export function readMail(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    throw new ConnectorError('invalid', 'Use a message ID returned by Gmail search.');
  return get(GMAIL, `messages/${id}`, mail, { format: 'full' });
}

function base64Lines(value: string): string {
  return (
    Buffer.from(value, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  );
}

function mimeMessage(to: string, subject: string, body: string) {
  if (
    !z.email().max(254).safeParse(to).success ||
    /[\r\n\u0000]/.test(subject) ||
    subject.length > 200 ||
    body.length > 32_000
  )
    throw new ConnectorError(
      'invalid',
      'Use one recipient address, a subject up to 200 characters and a body up to 32,000 characters.',
    );
  const encoded: string[] = [];
  let word = '';
  for (const character of subject) {
    if (Buffer.byteLength(word + character) > 42) {
      encoded.push(`=?utf-8?B?${Buffer.from(word).toString('base64')}?=`);
      word = '';
    }
    word += character;
  }
  if (word !== '') encoded.push(`=?utf-8?B?${Buffer.from(word).toString('base64')}?=`);
  return Buffer.from(
    [
      `To: ${to}`,
      `Subject: ${encoded.join('\r\n ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(body),
    ].join('\r\n'),
  ).toString('base64url');
}

export function writeMail(
  kind: 'draft' | 'send',
  to: string,
  subject: string,
  body: string,
): GoogleRequest {
  const message = { raw: mimeMessage(to, subject, body) };
  return kind === 'draft'
    ? {
        ...get(GMAIL, 'drafts', z.object({ id: z.string(), message: reference }), {
          fields: 'id,message(id,threadId)',
        }),
        payload: { message },
      }
    : {
        ...get(GMAIL, 'messages/send', reference, { fields: 'id,threadId' }),
        payload: message,
      };
}

const contacts = z.object({
  results: z
    .array(
      z.object({
        person: z.object({
          names: z.array(z.object({ displayName: z.string().optional() })).optional(),
          emailAddresses: z.array(z.object({ value: z.string().optional() })).optional(),
          phoneNumbers: z.array(z.object({ value: z.string().optional() })).optional(),
        }),
      }),
    )
    .default([]),
});

export function searchContacts(query: string) {
  return get(PEOPLE, 'people:searchContacts', contacts, {
    query,
    pageSize: PAGE_SIZE,
    readMask: 'names,emailAddresses,phoneNumbers',
  });
}
