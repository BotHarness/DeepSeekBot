import { createHmac, randomBytes } from 'node:crypto';

export type DiagnosticRedactionLevel = 'standard';

export type DiagnosticRedactionRule =
  | 'home-path'
  | 'absolute-path'
  | 'secret-token'
  | 'secret-field'
  | 'url-secret'
  | 'email'
  | 'request-headers';

export interface DiagnosticRedactor {
  readonly level: DiagnosticRedactionLevel;
  value<T>(input: T): T;
  text(input: string): string;
  count(rule: DiagnosticRedactionRule): void;
  report(): Record<DiagnosticRedactionRule, number>;
}

const RULES: readonly DiagnosticRedactionRule[] = [
  'home-path',
  'absolute-path',
  'secret-token',
  'secret-field',
  'url-secret',
  'email',
  'request-headers',
];

const SECRET_FIELD =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|apikey|secret|client[_-]?secret|app[_-]?secret|password|passwd|access[_-]?token|refresh[_-]?token|token)$/iu;

const SECRET_TOKENS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/gu,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  /\bnpm_[A-Za-z0-9]{20,}/gu,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
];

const URL_SECRET =
  /([?&](?:token|key|api_key|apikey|secret|password|access_token|refresh_token|sig|signature|code)=)[^&\s"'<>]+/giu;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/gu;
const STOP = String.raw`\s"'<>|\x60，。；：！？、（）【】「」《》,;`;
const POSIX_PATH = new RegExp(
  String.raw`(?<![\w.:/~$%@-])\/((?:[^/${STOP}]+\/)+)([^/${STOP}]*)`,
  'gu',
);
const WINDOWS_PATH = new RegExp(
  String.raw`(?<![\w])[A-Za-z]:(?:\\{1,2}|\/)((?:[^\\/:*?${STOP}]+(?:\\{1,2}|\/))*)([^\\/:*?${STOP}]*)`,
  'gu',
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function createDiagnosticRedactor(options: {
  homes: ReadonlyArray<{ path: string; label: string }>;
  key?: Buffer;
}): DiagnosticRedactor {
  const key = options.key ?? randomBytes(32);
  const counts = Object.fromEntries(RULES.map((rule) => [rule, 0])) as Record<
    DiagnosticRedactionRule,
    number
  >;
  const homes = options.homes
    .filter((home) => home.path.length > 1)
    .flatMap((home) => {
      const variants = new Set([home.path.replace(/[\\/]+$/u, '')]);
      if (/^[A-Za-z]:\\/u.test(home.path)) variants.add(home.path.replace(/\\/gu, '\\\\'));
      return [...variants].map((path) => ({ path, label: home.label }));
    })
    .sort((left, right) => right.path.length - left.path.length);
  const homePatterns = homes.map((home) => ({
    pattern: new RegExp(`${escapeRegExp(home.path)}(?=$|[\\\\/\\s"'<>:,;)\\]}])`, 'gu'),
    label: home.label,
  }));
  const pseudonym = (kind: string, value: string): string =>
    `<${kind}:${createHmac('sha256', key).update(kind).update('\0').update(value).digest('hex').slice(0, 6)}>`;

  const text = (input: string): string => {
    let output = input;
    for (const home of homePatterns)
      output = output.replace(home.pattern, () => {
        counts['home-path'] += 1;
        return home.label;
      });
    for (const pattern of SECRET_TOKENS)
      output = output.replace(pattern, (match, scheme?: string) => {
        counts['secret-token'] += 1;
        return typeof scheme === 'string' && /^(?:bearer|basic)$/iu.test(scheme)
          ? `${scheme} <secret>`
          : '<secret>';
      });
    output = output.replace(URL_SECRET, (_match, prefix: string) => {
      counts['url-secret'] += 1;
      return `${prefix}<secret>`;
    });
    output = output.replace(EMAIL, (match) => {
      counts.email += 1;
      return pseudonym('email', match.toLowerCase());
    });
    output = output.replace(POSIX_PATH, (_match, directory: string, base: string) => {
      counts['absolute-path'] += 1;
      return `${pseudonym('path', '/' + directory)}/${base}`;
    });
    output = output.replace(WINDOWS_PATH, (match, directory: string, base: string) => {
      if (directory.length === 0) return match;
      counts['absolute-path'] += 1;
      return `${pseudonym('path', match.slice(0, match.length - base.length).toLowerCase())}\\${base}`;
    });
    return output;
  };

  const walk = (input: unknown, depth: number): unknown => {
    if (typeof input === 'string') {
      if (/^\s*[{[]/u.test(input) && depth < 64)
        try {
          return JSON.stringify(walk(JSON.parse(input), depth + 1));
        } catch {}
      return text(input);
    }
    if (input === null || typeof input !== 'object' || depth > 64) return input;
    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));
    return Object.fromEntries(
      Object.entries(input).map(([field, value]) => {
        if (/^headers$/iu.test(field) && value !== null && typeof value === 'object') {
          counts['request-headers'] += 1;
          return [field, '<omitted>'];
        }
        if (SECRET_FIELD.test(field) && typeof value === 'string' && value.length > 0) {
          counts['secret-field'] += 1;
          return [field, '<secret>'];
        }
        return [field, walk(value, depth + 1)];
      }),
    );
  };

  return {
    level: 'standard',
    value: <T>(input: T) => walk(input, 0) as T,
    text,
    count(rule) {
      counts[rule] += 1;
    },
    report: () => ({ ...counts }),
  };
}
