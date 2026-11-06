import { describe, expect, it } from 'vitest';

import { resolve } from 'node:path';
import { credentialStoreDenial, denyStoreRead } from '../src/credentials/store-guard.js';

const store = '/qa/dsh-home/.credentials.yaml';

describe('credential store shell guard', () => {
  const home = resolve('/qa/dsh-home');

  it.each(['bash', 'pwsh'])('allows literal path output through %s', (name) => {
    for (const command of [`echo '${home}'`, `echo "${home.replaceAll('\\', '/')}"`]) {
      expect(credentialStoreDenial(name, { command }, home)).toBeUndefined();
    }
    if (name === 'bash') {
      expect(
        credentialStoreDenial(name, { command: `printf '%s\\n' '${home}'` }, home),
      ).toBeUndefined();
      expect(
        credentialStoreDenial(name, { command: `printf '%b' '${home}'` }, home),
      ).toBeUndefined();
      expect(credentialStoreDenial(name, { command: `echo -e '${home}'` }, home)).toBeUndefined();
    } else {
      expect(
        credentialStoreDenial(name, { command: `Write-Output '${home}'` }, home),
      ).toBeUndefined();
    }
  });

  it.each(['bash', 'pwsh'])(
    'keeps credential access and compound commands refused through %s',
    (name) => {
      for (const command of [
        `cat '${home}/.credentials.yaml'`,
        `echo '${home}/.credentials.yaml'`,
        `ls '${home}'`,
        `find '${home}' -maxdepth 1`,
        `echo '${home}' | cat`,
        `echo '${home}' > output`,
        `echo '${home}'; ls '${home}'`,
        `echo '${home}'\nls '${home}'`,
        `echo '${home}'\rls '${home}'`,
        `echo '${home}' & ls '${home}'`,
        `echo '${home}' && ls '${home}'`,
        `echo '${home}' $value`,
        `echo '${home}' "$(pwd)"`,
        `echo $(ls '${home}')`,
        `echo \`ls '${home}'\``,
        `echo ${home}/*`,
        `echo '${home}' @(Get-Content secret)`,
        `echo '${home}' 'text’; Write-Output unexpected; # '`,
        `echo '${home}' "text”; Write-Output unexpected; # "`,
      ]) {
        expect(credentialStoreDenial(name, { command }, home), command).toContain(
          'native credential store',
        );
      }
    },
  );
});

describe('credential store read denial in the Shell sandbox', () => {
  it('adds one read-denial rule to a Seatbelt profile and keeps the command', () => {
    const confined = {
      argv: ['/usr/bin/sandbox-exec', '-p', '(version 1) (allow default)', '/bin/sh', '-c', 'ls'],
      enforcement: 'full',
    };
    const denied = denyStoreRead(confined, store);
    expect(denied.argv).toEqual([
      '/usr/bin/sandbox-exec',
      '-p',
      '(version 1) (allow default) (deny file-read* (literal "/qa/dsh-home/.credentials.yaml"))',
      '/bin/sh',
      '-c',
      'ls',
    ]);
    expect(denied.enforcement).toBe('full');
    expect(denyStoreRead(denied, store)).toBe(denied);
    expect(confined.argv[2]).toBe('(version 1) (allow default)');
  });

  it('masks the store before the command separator of a bwrap runner', () => {
    const denied = denyStoreRead(
      { argv: ['/usr/bin/bwrap', '--ro-bind', '/', '/', '--', '/bin/sh', '-c', 'cat -- x'] },
      store,
    );
    expect(denied.argv).toEqual([
      '/usr/bin/bwrap',
      '--ro-bind',
      '/',
      '/',
      '--ro-bind-try',
      '/dev/null',
      store,
      '--',
      '/bin/sh',
      '-c',
      'cat -- x',
    ]);
  });

  it('leaves a runner it does not recognise unchanged', () => {
    for (const argv of [
      ['/opt/landlock-runner', '--mode', 'read-only', '--', 'ls'],
      ['/usr/bin/bwrap', '--ro-bind', '/', '/'],
      ['/usr/bin/sandbox-exec', '-f', 'profile.sb', 'ls'],
      [],
    ]) {
      const confined = { argv };
      expect(denyStoreRead(confined, store)).toBe(confined);
    }
  });
});
