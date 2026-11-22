import { useRef, type ReactElement } from 'react';
import { useMountedResource } from '../../mounted-resource.js';

const tails = new Set<HTMLElement>();

const followTails = (): void => {
  const targets = [...tails]
    .filter((node) => node.isConnected)
    .map((node) => [node, Math.max(0, node.scrollHeight - node.clientHeight)] as const);
  tails.clear();
  for (const [node, top] of targets) node.scrollTop = top;
};

const followTail = (node: HTMLElement): void => {
  if (!tails.size) queueMicrotask(followTails);
  tails.add(node);
};

export function CompanionMessageText({
  text,
  context,
  typing,
}: {
  text: string;
  context: boolean;
  typing: boolean;
}): ReactElement {
  const following = useRef(true);
  const viewport = useMountedResource<HTMLParagraphElement>(
    (node) => {
      if (following.current) followTail(node);
    },
    [text, context],
  );
  return (
    <p
      ref={viewport}
      data-context={context}
      tabIndex={0}
      onScroll={(event) => {
        const node = event.currentTarget;
        following.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 1;
      }}
    >
      {text}
      {typing ? <span className="bh-companion-caret" aria-hidden="true" /> : null}
    </p>
  );
}
