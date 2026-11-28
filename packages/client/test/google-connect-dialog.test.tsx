// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).dialogPrimitives(),
);

import type { ConnectorsView, GoogleSetup } from '../src/client/features/connectors/bridge.js';
import {
  GoogleConnectDialog,
  googleWriteWaiting,
  type GoogleActions,
} from '../src/client/features/connectors/google-connect.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { buttonNamed, fieldNamed, typeInto } from './primitive-mocks.js';

const REDIRECT = 'http://127.0.0.1:7777/botharness/connectors/callback';
const CLIENT_ID = '1234-abc.apps.googleusercontent.com';

function setup(configured: boolean, redirectUri: string | null = REDIRECT): GoogleSetup {
  return {
    configured,
    ...(redirectUri === null ? {} : { redirectUri }),
    oauthClientType: 'web',
    browserLocation: 'host',
    apis: [
      { id: 'gmail.googleapis.com', name: 'Gmail API' },
      { id: 'people.googleapis.com', name: 'People API' },
    ],
    limits: {
      testingRefreshTokenDays: 7,
      unverifiedExternalUserCap: 100,
      internalWorkspaceOnly: true,
    },
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function render(actions: GoogleActions, onLinked = vi.fn()) {
  await act(async () =>
    root.render(
      <GoogleConnectDialog actions={actions} t={t} onCancel={vi.fn()} onLinked={onLinked} />,
    ),
  );
  return onLinked;
}

function submit(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('[data-google-submit]');
  if (found === null) throw new Error('No submit');
  return found;
}

it('walks the Owner from setup help to the Google consent page without echoing the secret', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const actions: GoogleActions = {
    connectorGoogleSetup: vi.fn(async () => setup(false)),
    connectorGoogleAdd: vi.fn(async () => setup(true)),
    connectorGoogleLogin: vi.fn(async (label: string) => ({
      account: {
        accountId: 'acc-1',
        provider: 'google' as const,
        service: 'google_workspace',
        label,
        status: 'pending' as const,
        revision: 1,
        createdAt: '',
        updatedAt: '',
      },
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s',
    })),
  };
  const onLinked = await render(actions);
  const help = document.querySelector('[data-google-setup]');
  expect(help?.textContent).toContain('Gmail API');
  expect(help?.querySelector('a[href$="people.googleapis.com"]')).not.toBeNull();
  expect(document.querySelector('[data-google-redirect]')?.textContent).toContain(REDIRECT);
  expect(help?.textContent).toContain('7');
  expect(document.body.textContent).toContain(t('connectors.google.noToken'));
  expect(submit().disabled).toBe(true);

  await typeInto(fieldNamed(t('connectors.google.clientId')), ` ${CLIENT_ID} `);
  const secret = fieldNamed(t('connectors.google.clientSecret'));
  expect(secret.type).toBe('password');
  await typeInto(secret, 'GOCSPX-secret-value');
  await act(async () => submit().click());
  expect(actions.connectorGoogleAdd).toHaveBeenCalledWith({
    clientId: CLIENT_ID,
    clientSecret: 'GOCSPX-secret-value',
  });
  expect(document.body.innerHTML).not.toContain('GOCSPX-secret-value');
  expect(submit().dataset['googleSubmit']).toBe('sign-in');

  await typeInto(fieldNamed(t('connectors.connect.label')), 'Work');
  await act(async () => submit().click());
  expect(actions.connectorGoogleLogin).toHaveBeenCalledWith('Work');
  expect(open).toHaveBeenCalledWith(
    'https://accounts.google.com/o/oauth2/v2/auth?state=s',
    '_blank',
    'noopener,noreferrer',
  );
  expect(onLinked).toHaveBeenCalledWith(
    'acc-1',
    'https://accounts.google.com/o/oauth2/v2/auth?state=s',
  );
});

it('keeps sign-in off when the Host has no loopback redirect, and lets the Owner replace the client', async () => {
  const actions: GoogleActions = {
    connectorGoogleSetup: vi.fn(async () => setup(true, null)),
    connectorGoogleAdd: vi.fn(async () => setup(true, null)),
    connectorGoogleLogin: vi.fn(),
  };
  await render(actions);
  expect(submit().disabled).toBe(true);
  expect(document.body.textContent).toContain(t('connectors.google.noRedirect'));
  await act(async () => buttonNamed(t('connectors.google.replace')).click());
  expect(submit().dataset['googleSubmit']).toBe('client');
  expect(fieldNamed(t('connectors.google.clientSecret')).value).toBe('');
  await act(async () => buttonNamed(t('connectors.google.keep')).click());
  expect(submit().dataset['googleSubmit']).toBe('sign-in');
});

it('asks for a new Google sign-in only when a Bot holds Write but Google consent is still Read', () => {
  const account = (
    access: 'read' | 'write' | undefined,
    grants: Array<'read' | 'write'>,
  ): ConnectorsView['accounts'][number] => ({
    accountId: 'a',
    provider: 'google',
    service: 'google_workspace',
    label: 'Work',
    status: 'active',
    ...(access === undefined ? {} : { access }),
    revision: 1,
    createdAt: '',
    updatedAt: '',
    name: 'Google Workspace',
    grants: grants.map((grant, index) => ({ botSlug: `bot${index}`, access: grant })),
  });
  expect(googleWriteWaiting(account('read', ['read', 'write']))).toBe(true);
  expect(googleWriteWaiting(account('write', ['write']))).toBe(false);
  expect(googleWriteWaiting(account('read', ['read']))).toBe(false);
  expect(googleWriteWaiting({ ...account('read', ['write']), provider: 'mcp' })).toBe(false);
});
