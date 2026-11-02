// @vitest-environment jsdom
import { act, createElement, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { EntryPart, useStableProps } from '../src/client/entry-part.js';

interface Props {
  label: string;
  t(key: string): string;
  onPick(value: string): void;
}

it('skips a part render for new callbacks but repaints for new data or a new translator', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const renders: string[] = [];
  const picked: string[] = [];
  const Part = ({ label, t, onPick }: Props): ReactElement => {
    renders.push(t(label));
    return createElement('button', { onClick: () => onPick(label) }, t(label));
  };
  let setTick: (value: number) => void = () => undefined;
  let setLabel: (value: string) => void = () => undefined;
  let setLocale: (value: string) => void = () => undefined;
  const Host = (): ReactElement => {
    const [tick, tickState] = useState(0);
    const [label, labelState] = useState('a');
    const [locale, localeState] = useState('en');
    setTick = tickState;
    setLabel = labelState;
    setLocale = localeState;
    const t = useState(() => new Map<string, (key: string) => string>())[0];
    if (!t.has(locale)) t.set(locale, (key) => `${locale}:${key}`);
    const props = useStableProps<Props>({
      label,
      t: t.get(locale)!,
      onPick: (value) => picked.push(`${value}@${tick}`),
    });
    return createElement(EntryPart<Props>, { part: Part, props });
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(createElement(Host)));
  await act(async () => setTick(1));
  expect(renders).toEqual(['en:a']);
  await act(async () => host.querySelector('button')!.click());
  expect(picked).toEqual(['a@1']);
  await act(async () => setLabel('b'));
  await act(async () => setLocale('zh'));
  expect(renders).toEqual(['en:a', 'en:b', 'zh:b']);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
