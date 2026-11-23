import { createElement, type ReactNode } from 'react';
import { shellPrimitives } from '../primitive-mocks.js';

type ChannelDockPrimitives = ReturnType<typeof shellPrimitives> & {
  MarkdownText: (props: { text: string }) => ReactNode;
};

export function mockChannelDockPrimitives(): ChannelDockPrimitives {
  return {
    ...shellPrimitives(),
    MarkdownText: ({ text }: { text: string }) => createElement('span', null, text),
  };
}
