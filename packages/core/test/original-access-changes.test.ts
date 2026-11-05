import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { OriginalAttachmentAccess } from '../src/attachments/original-access.js';
import { createTempRoot } from './helpers.js';

const fileId = 'file:6a1f3c2e-1b2c-4d3e-8f40-123456789abc';

it('reports an edited original once, on the next access or when the session ends', () => {
  const path = join(createTempRoot('original-access-'), 'report.txt');
  writeFileSync(path, 'first');
  const changed: string[] = [];
  const access = new OriginalAttachmentAccess((id) => changed.push(id));
  const target = { path, source: { fileId, name: 'report.txt', mime: 'text/plain', size: 5 } };
  access.open('s1', { messageId: 'm1', fileId, access: 'edit-original' }, () => target);
  access.root('s1', path, 'write');
  expect(changed).toEqual([]);
  writeFileSync(path, 'second, longer');
  access.root('s1', path, 'write');
  expect(changed).toEqual([fileId]);
  access.clear('s1');
  expect(changed).toEqual([fileId]);
});

it('ignores files opened for reading', () => {
  const path = join(createTempRoot('original-access-'), 'report.txt');
  writeFileSync(path, 'first');
  const changed: string[] = [];
  const access = new OriginalAttachmentAccess((id) => changed.push(id));
  const target = { path, source: { fileId, name: 'report.txt', mime: 'text/plain', size: 5 } };
  access.open('s1', { messageId: 'm1', fileId, access: 'read' }, () => target);
  writeFileSync(path, 'changed elsewhere');
  access.clear('s1');
  expect(changed).toEqual([]);
});
