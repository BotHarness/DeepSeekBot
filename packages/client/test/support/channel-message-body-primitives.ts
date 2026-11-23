import { createElement, type ReactElement, type ReactNode } from 'react';
import { vi, type Mock } from 'vitest';

type MessagePrimitives = ReturnType<typeof import('../primitive-mocks.js').shellPrimitives> & {
  FileTypeIcon: (props: { path: string }) => ReactElement;
  fileSizeText: (bytes: number) => string;
  MarkdownText: Mock<() => null>;
  MarkdownDelegateProvider: (props: { children: ReactNode }) => ReactNode;
  useMarkdownDelegate: () => Record<string, never>;
  StateDot: () => ReactElement;
};

export const mockMessagePrimitives = async (): Promise<MessagePrimitives> => ({
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  ...(await import('../primitive-mocks.js')).shellPrimitives(),
  fileSizeText: (bytes: number) =>
    bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)}MB`
      : bytes >= 1024
        ? `${(bytes / 1024).toFixed(1)}KB`
        : `${bytes}B`,

  MarkdownText: vi.fn(() => null),
  MarkdownDelegateProvider: ({ children }: { children: ReactNode }) => children,
  useMarkdownDelegate: () => ({}),

  StateDot: () => createElement('span', { 'data-state-dot': 'error' }),
});
