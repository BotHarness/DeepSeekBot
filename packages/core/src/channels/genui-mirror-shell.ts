import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

export const GENUI_MIRROR_CSP =
  "default-src 'none';script-src 'none';style-src 'unsafe-inline';img-src 'none';media-src 'none';font-src 'none';connect-src 'none';frame-src 'none';object-src 'none';base-uri 'none';form-action 'none'";
export const GENUI_MIRROR_SHELL = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${GENUI_MIRROR_CSP}"><meta name="referrer" content="no-referrer"></head><body></body></html>`;

const pending = 'data-genui-shell';

export function createGenuiMirrorShell(container: HTMLElement, title: string): HTMLIFrameElement {
  const frame = container.ownerDocument.createElement('iframe');
  frame.title = title;
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.referrerPolicy = 'no-referrer';
  Object.assign(frame.style, {
    display: 'block',
    width: '100%',
    height: `${GENUI_EXECUTION_LIMITS.mirrorMinHeight}px`,
    border: '0',
    zoom: '1',
  });
  frame.srcdoc = GENUI_MIRROR_SHELL;
  frame.setAttribute(pending, '');
  container.append(frame);
  return frame;
}

export function adoptGenuiMirrorShell(
  container: HTMLElement,
  frame: HTMLIFrameElement,
): HTMLIFrameElement | undefined {
  if (
    !frame.hasAttribute(pending) ||
    frame.parentElement !== container ||
    frame.referrerPolicy !== 'no-referrer' ||
    frame.getAttribute('sandbox') !== 'allow-same-origin' ||
    frame.srcdoc !== GENUI_MIRROR_SHELL
  )
    return undefined;
  frame.removeAttribute(pending);
  return frame;
}

export function genuiMirrorShellLoaded(frame: HTMLIFrameElement): boolean {
  const document = frame.contentDocument;
  return (
    document?.readyState === 'complete' &&
    document.head
      ?.querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content') === GENUI_MIRROR_CSP
  );
}
