#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = readFileSync(`${root}packages/core/src/connectors/catalog.ts`, 'utf8');
const services = [...catalog.matchAll(/service: '([a-z0-9_]+)'/g)].map((match) => match[1]);
const UNSAFE = /<script|<foreignObject|<image|\bon[a-z]+=|(?:xlink:)?href="(?!#)/i;

const entries = [];
for (const service of services) {
  const response = await fetch(`https://logos.composio.dev/api/${service}`);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('image/svg+xml'))
    throw new Error(`${service}: ${response.status} ${type}`);
  const svg = (await response.text()).replace(/\s+/g, ' ').trim();
  if (UNSAFE.test(svg)) throw new Error(`${service}: the logo contains active or external content`);
  entries.push(`  ${service}: ${JSON.stringify(svg)},`);
}

writeFileSync(
  `${root}packages/client/src/client/ds/brand-logos.ts`,
  `const SVG: Readonly<Record<string, string>> = {
${entries.join('\n')}
};

export function connectorLogo(service: string): string | undefined {
  const svg = SVG[service];
  return svg === undefined ? undefined : \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\`;
}
`,
);
console.log(`wrote ${entries.length} logos`);
