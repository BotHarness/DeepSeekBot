// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = { kind: string; value?: unknown };
const has = (modifiers: Modifier[], kind: string, value?: unknown) =>
  modifiers.some(
    (modifier) =>
      modifier.kind === kind &&
      (value === undefined || JSON.stringify(modifier.value) === JSON.stringify(value)),
  );
const labelOf = (modifiers: Modifier[]) =>
  modifiers.find((modifier) => modifier.kind === 'accessibilityLabel')?.value as string;

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock(
  '../src/ui/primitives/checkmark-row',
  () => import('../src/ui/primitives/checkmark-row.ios'),
);
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier =
    (kind: string) =>
    (value?: unknown): Modifier => ({ kind, value });
  return {
    accessibilityAddTraits: modifier('accessibilityAddTraits'),
    accessibilityLabel: modifier('accessibilityLabel'),
    accessibilityValue: modifier('accessibilityValue'),
    buttonStyle: modifier('buttonStyle'),
    contentShape: modifier('contentShape'),
    controlSize: modifier('controlSize'),
    disabled: modifier('disabled'),
    font: modifier('font'),
    frame: modifier('frame'),
    labelsHidden: modifier('labelsHidden'),
    padding: modifier('padding'),
    shapes: { rectangle: () => ({ shape: 'rectangle' }) },
    tint: modifier('tint'),
    toggleStyle: modifier('toggleStyle'),
  };
});
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  HStack: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Spacer: () => null,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Image: ({ systemName }: { systemName: string }) => <i data-symbol={systemName} />,
  Toggle: ({
    label,
    isOn,
    onIsOnChange,
    testID,
    modifiers,
  }: {
    label: string;
    isOn: boolean;
    onIsOnChange(isOn: boolean): void;
    testID?: string;
    modifiers: Modifier[];
  }) => (
    <button
      data-native="toggle"
      data-testid={testID}
      data-button-style={has(modifiers, 'toggleStyle', 'button')}
      data-selected-trait={has(modifiers, 'accessibilityAddTraits', ['isSelected'])}
      aria-pressed={isOn}
      aria-label={labelOf(modifiers)}
      disabled={has(modifiers, 'disabled', true)}
      onClick={() => onIsOnChange(!isOn)}
    >
      {label}
    </button>
  ),
  Button: ({
    onPress,
    testID,
    modifiers,
    children,
  }: {
    onPress(): void;
    testID?: string;
    modifiers: Modifier[];
    children: ReactNode;
  }) => (
    <button
      data-native="button"
      data-testid={testID}
      data-selected-trait={has(modifiers, 'accessibilityAddTraits', ['isSelected'])}
      aria-label={labelOf(modifiers)}
      disabled={has(modifiers, 'disabled', true)}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Slider: ({
    value,
    min,
    max,
    onValueChange,
    modifiers,
  }: {
    value: number;
    min: number;
    max: number;
    onValueChange(value: number): void;
    modifiers: Modifier[];
  }) => (
    <input
      type="range"
      data-native="slider"
      min={min}
      max={max}
      value={value}
      aria-label={labelOf(modifiers)}
      aria-valuetext={
        modifiers.find((modifier) => modifier.kind === 'accessibilityValue')?.value as string
      }
      onChange={(event) => onValueChange(Number(event.target.value))}
    />
  ),
}));

import { Chip } from '../src/ui/primitives/chip.ios';
import { CheckmarkRow } from '../src/ui/primitives/checkmark-row.ios';
import { ParticipantChoice } from '../src/ui/primitives/participant-choice.ios';
import { PercentageSlider } from '../src/ui/primitives/percentage-slider.ios';
import { DesignThemeProvider } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(node: ReactNode, scheme: 'light' | 'dark' = 'light') {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(<DesignThemeProvider appearance={{ scheme }}>{node}</DesignThemeProvider>),
  );
  return host;
}

it.each(['light', 'dark'] as const)(
  'renders a chip as a SwiftUI button-style toggle whose selection reaches VoiceOver in %s appearance',
  (scheme) => {
    function Tag() {
      const [selected, setSelected] = useState(false);
      return (
        <Chip
          testID="feedback-tag-wrong"
          label="Wrong"
          count={3}
          selected={selected}
          onPress={() => setSelected((value) => !value)}
        />
      );
    }
    const view = mount(<Tag />, scheme);
    const toggle = view.querySelector<HTMLButtonElement>('[data-native="toggle"]')!;
    expect(toggle.dataset.testid).toBe('feedback-tag-wrong');
    expect(toggle.dataset.buttonStyle).toBe('true');
    expect(toggle.textContent).toBe('Wrong  3');
    expect(toggle.getAttribute('aria-label')).toContain('Wrong');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.dataset.selectedTrait).toBe('false');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.dataset.selectedTrait).toBe('true');
  },
);

it('ignores a disabled chip toggle', () => {
  const pressed = vi.fn();
  const view = mount(<Chip label="Daily" selected={false} disabled onPress={pressed} />);
  const toggle = view.querySelector<HTMLButtonElement>('[data-native="toggle"]')!;
  expect(toggle.disabled).toBe(true);
  expect(pressed).not.toHaveBeenCalled();
});

it.each(['light', 'dark'] as const)(
  'renders a single choice as a whole-row button with a trailing checkmark in %s appearance',
  (scheme) => {
    function Topics() {
      const [value, setValue] = useState('');
      return (
        <>
          {['', 'coding'].map((topic) => (
            <CheckmarkRow
              key={topic}
              testID={`marketplace-topic-${topic || 'all'}`}
              label={topic || 'All topics'}
              selected={topic === value}
              onPress={() => setValue(topic)}
            />
          ))}
        </>
      );
    }
    const view = mount(<Topics />, scheme);
    const rows = [...view.querySelectorAll<HTMLButtonElement>('[data-native="button"]')];
    const state = () =>
      rows.map((row) => [
        row.getAttribute('aria-label'),
        row.dataset.selectedTrait,
        row.querySelector('[data-symbol="checkmark"]') !== null,
      ]);
    expect(state()).toEqual([
      ['All topics', 'true', true],
      ['coding', 'false', false],
    ]);
    act(() => rows[1]!.click());
    expect(state()).toEqual([
      ['All topics', 'false', false],
      ['coding', 'true', true],
    ]);
    expect(rows[1]!.dataset.testid).toBe('marketplace-topic-coding');
  },
);

it('renders Bot picker choices as checkmark rows that toggle several selections', () => {
  function Picker() {
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(['ada']));
    const toggle = (slug: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        return next;
      });
    return (
      <>
        {['ada', 'linus'].map((slug) => (
          <ParticipantChoice
            key={slug}
            id={slug}
            label={slug}
            checked={picked.has(slug)}
            disabled={false}
            onChange={() => toggle(slug)}
          />
        ))}
      </>
    );
  }
  const view = mount(<Picker />);
  const row = (slug: string) =>
    view.querySelector<HTMLButtonElement>(`[data-testid="create-channel-bot-${slug}"]`)!;
  expect(view.querySelector('[role="checkbox"]')).toBeNull();
  act(() => row('linus').click());
  expect([row('ada').dataset.selectedTrait, row('linus').dataset.selectedTrait]).toEqual([
    'true',
    'true',
  ]);
  act(() => row('ada').click());
  expect(row('ada').dataset.selectedTrait).toBe('false');
  expect(row('ada').querySelector('[data-symbol="checkmark"]')).toBeNull();
  expect(row('linus').querySelector('[data-symbol="checkmark"]')).not.toBeNull();
});

it('keeps a busy Bot picker row disabled', () => {
  const changed = vi.fn();
  const view = mount(
    <ParticipantChoice id="ada" label="Ada" checked={false} disabled onChange={changed} />,
  );
  expect(view.querySelector<HTMLButtonElement>('[data-native="button"]')!.disabled).toBe(true);
});

it.each(['light', 'dark'] as const)(
  'uses the SwiftUI slider and reports its value as a percentage in %s appearance',
  (scheme) => {
    const changed = vi.fn();
    function Fade() {
      const [value, setValue] = useState(40);
      return (
        <PercentageSlider
          label="Fade"
          value={value}
          onChange={(next) => {
            changed(next);
            setValue(next);
          }}
        />
      );
    }
    const view = mount(<Fade />, scheme);
    const slider = view.querySelector<HTMLInputElement>('[data-native="slider"]')!;
    expect([slider.min, slider.max, slider.value]).toEqual(['0', '100', '40']);
    expect(slider.getAttribute('aria-label')).toBe('Fade');
    expect(slider.getAttribute('aria-valuetext')).toBe('40%');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '73');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(changed).toHaveBeenCalledExactlyOnceWith(73);
    expect(slider.getAttribute('aria-valuetext')).toBe('73%');
  },
);
