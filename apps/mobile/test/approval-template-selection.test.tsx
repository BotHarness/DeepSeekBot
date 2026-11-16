// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { botSettings, type ApprovalTemplates } from '../src/host/bot-settings';
import { createHostClient } from '../src/host/client';
import { WorkspaceSheet } from '../src/ui/chat/workspace-sheet';
import { FakeHost } from './fake-host';
import { t } from '../src/ui/strings';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: PropsWithChildren) => children,
  SettingsRow: ({
    title,
    detail,
    selected,
    onPress,
    testID,
  }: {
    title: string;
    detail?: string;
    selected?: boolean;
    onPress?(): void;
    testID?: string;
  }) =>
    createElement(
      'button',
      { onClick: onPress, 'aria-pressed': selected === true, 'data-testid': testID },
      title,
      detail ? ', ' + detail : '',
    ),
}));
vi.mock('../src/ui/chat/sheet', () => {
  const pass = ({ children }: PropsWithChildren) => createElement('section', null, children);
  return {
    Sheet: pass,
    SheetActions: pass,
    SheetCallout: pass,
    SheetFailed: pass,
    SheetFooter: pass,
    SheetHeading: pass,
    SheetLoading: pass,
    SheetNote: pass,
    SHEET_GROUP: 'canvas',
  };
});
vi.mock('../src/ui/primitives/app-dialog', () => ({ confirmDestructive: vi.fn() }));
vi.mock('../src/ui/shell/icons', () => ({
  CloseIcon: () => null,
  FolderIcon: () => null,
  PlusIcon: () => null,
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function named(text: string): HTMLButtonElement {
  const row = [...host.querySelectorAll('button')].find((button) =>
    button.textContent?.startsWith(text),
  );
  if (!row) throw new Error('Missing choice ' + text);
  return row;
}
async function mount(
  initial: string | null,
  globalDefault: string | null | undefined,
  extra: ApprovalTemplates['templates'] = [],
) {
  const fake = new FakeHost();
  let selected = initial;
  fake.methods.set('approvalTemplates', () => ({
    templates: [{ name: 'cautious', title: 'Cautious', description: 'Read carefully.' }, ...extra],
    selected,
    ...(globalDefault === undefined ? {} : { globalDefault }),
  }));
  fake.methods.set('botApprovalTemplateSet', (args) => {
    const value = args['template'];
    if (value !== null && typeof value !== 'string') throw new Error('Invalid template');
    selected = value;
    return { bot: { slug: 'ada' } };
  });
  const settings = botSettings(
    createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: fake.credential,
      carrier: fake.carrier,
    }),
    'ada',
  );
  const initialTemplates = await settings.loadTemplates();
  function Harness() {
    const [templates, setTemplates] = useState<ApprovalTemplates>(initialTemplates);
    return (
      <WorkspaceSheet
        visible
        botName="Ada"
        settings={settings}
        grants={{ status: 'ready', value: [] }}
        access={{ status: 'ready', value: { mode: 'workspace-write', scope: 'chat', revision: 1 } }}
        templates={{ status: 'ready', value: templates }}
        onRetryGrants={() => {}}
        onGrantsChanged={() => {}}
        onAccess={() => {}}
        onTemplates={setTemplates}
        onClose={() => {}}
      />
    );
  }
  await act(async () => root.render(createElement(Harness)));
  return fake;
}
it.each([null, 'cautious'])(
  'shows the inherited global default %s and can return to inheritance after Off',
  async (globalDefault) => {
    const fake = await mount('@global', globalDefault);
    const inherited = named(t.autoApprovalInherit);
    expect(inherited.textContent).toContain(
      globalDefault === null ? t.autoApprovalOff : t.autoApprovalCautious,
    );
    expect(inherited.getAttribute('aria-pressed')).toBe('true');
    await act(async () => named(t.autoApprovalOff).click());
    expect(named(t.autoApprovalOff).getAttribute('aria-pressed')).toBe('true');
    await act(async () => named(t.autoApprovalInherit).click());
    expect(named(t.autoApprovalInherit).getAttribute('aria-pressed')).toBe('true');
    expect(
      fake.calls
        .filter((call) => call.method === 'botApprovalTemplateSet')
        .map((call) => call.args),
    ).toEqual([
      { slug: 'ada', template: null },
      { slug: 'ada', template: '@global' },
    ]);
  },
);
it('does not offer unsupported inheritance on legacy Hosts that omit global selection', async () => {
  await mount(null, undefined);
  expect(
    [...host.querySelectorAll('button')].some((button) =>
      button.textContent?.startsWith(t.autoApprovalInherit),
    ),
  ).toBe(false);
  expect(named(t.autoApprovalOff).getAttribute('aria-pressed')).toBe('true');
});

it('refreshes the actual global default after selecting inheritance', async () => {
  const fake = await mount(null, 'cautious');
  fake.methods.set('approvalTemplates', () => ({
    templates: [{ name: 'get-work-done', title: 'Get the work done', description: '' }],
    selected: '@global',
    globalDefault: 'get-work-done',
  }));
  await act(async () => named(t.autoApprovalInherit).click());
  expect(named(t.autoApprovalInherit).textContent).toContain(t.autoApprovalGetWorkDone);
  expect(fake.calls.filter((call) => call.method === 'botApprovalTemplateSet')).toHaveLength(1);
});
it('keeps confirmed inheritance but marks the source unknown when readback fails', async () => {
  const fake = await mount(null, 'cautious');
  fake.methods.set('approvalTemplates', () => {
    throw new Error('read unavailable');
  });
  await act(async () => named(t.autoApprovalInherit).click());
  const inherited = named(t.autoApprovalInherit);
  expect(inherited.getAttribute('aria-pressed')).toBe('true');
  expect(inherited.textContent).toContain(t.contextUnavailable);
  expect(inherited.textContent).not.toContain(t.autoApprovalCautious);
  await act(async () => inherited.click());
  expect(fake.calls.filter((call) => call.method === 'botApprovalTemplateSet')).toHaveLength(1);
});
it('can select a custom off template separately from Off', async () => {
  const fake = await mount(null, null, [{ name: 'off', title: 'Off template', description: '' }]);
  await act(async () => named('Off template').click());
  expect(named('Off template').getAttribute('aria-pressed')).toBe('true');
  expect(named(t.autoApprovalOff).getAttribute('aria-pressed')).toBe('false');
  expect(
    fake.calls.filter((call) => call.method === 'botApprovalTemplateSet').map((call) => call.args),
  ).toEqual([{ slug: 'ada', template: 'off' }]);
});
