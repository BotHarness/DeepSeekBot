// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).shellPrimitives(),
);

import { FilterPicker } from '../src/client/ds/filter-picker.js';

function PagedPicker({ closeOnSelect }: { readonly closeOnSelect?: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const [options, setOptions] = useState([{ value: 'first', label: 'First voice' }]);
  return (
    <>
      <button ref={anchor} type="button">
        Voices
      </button>
      {open ? (
        <FilterPicker
          label="Voices"
          value=""
          options={options}
          onSelect={() => undefined}
          closeOnSelect
          filters={[]}
          allFilter={{ key: 'all', label: 'All', icon: null }}
          filtersLabel="Voice sources"
          searchLabel="Search voices"
          emptyLabel="No matches"
          footer={{
            label: 'Load more',
            icon: null,
            ...(closeOnSelect === undefined ? {} : { closeOnSelect }),
            onSelect: () =>
              setOptions((previous) => [...previous, { value: 'more', label: 'More voices' }]),
          }}
          anchorRef={anchor}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

it.each([
  { setting: false, showsMore: true },
  { setting: undefined, showsMore: false },
])(
  'shows the next page when the footer keeps the picker open ($setting)',
  ({ setting, showsMore }) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
      act(() =>
        root.render(<PagedPicker {...(setting === undefined ? {} : { closeOnSelect: setting })} />),
      );
      act(() => document.querySelector<HTMLButtonElement>('[data-picker-footer]')?.click());
      expect(
        document.querySelector('[role="listbox"]')?.textContent?.includes('More voices') ?? false,
      ).toBe(showsMore);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  },
);

function SamplePicker({ onSelect }: { onSelect(value: string): void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <button ref={anchor} type="button">
        Voices
      </button>
      <FilterPicker
        label="Voices"
        value=""
        options={[
          {
            value: 'sampled',
            label: 'Sampled voice',
            action: {
              label: playing ? 'Stop sample' : 'Play sample',
              icon: null,
              pressed: playing,
              onPress: () => setPlaying((previous) => !previous),
            },
          },
          { value: 'silent', label: 'Silent voice' },
        ]}
        onSelect={onSelect}
        closeOnSelect
        filters={[]}
        allFilter={{ key: 'all', label: 'All', icon: null }}
        filtersLabel="Voice sources"
        searchLabel="Search voices"
        emptyLabel="No matches"
        anchorRef={anchor}
        onClose={() => undefined}
      />
    </>
  );
}

it('toggles a row action without choosing the row', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const onSelect = vi.fn();
  try {
    act(() => root.render(<SamplePicker onSelect={onSelect} />));
    const action = () =>
      document.querySelector<HTMLButtonElement>('[data-picker-action="sampled"]');
    expect(document.querySelector('[data-picker-action="silent"]')).toBeNull();
    expect(action()?.getAttribute('aria-label')).toBe('Play sample · Sampled voice');
    act(() => action()?.click());
    expect(action()?.getAttribute('aria-pressed')).toBe('true');
    expect(action()?.getAttribute('aria-label')).toBe('Stop sample · Sampled voice');
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
