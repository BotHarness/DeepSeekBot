import { driver } from 'driver.js';

export interface InternalTourSpec {
  selector: string;
  fallback?: string;
  title: string;
  description: string;
}

export interface InternalTourStep {
  element: Element;
  title: string;
  description: string;
}

export interface InternalTourOptions {
  closeLabel: string;
  skipLabel?: string;
  previousLabel: string;
  nextLabel: string;
  doneLabel: string;
  doneIcon?: 'done' | 'next';
  progress?: { offset: number; total?: number };
  onClosed(): void;
  onFinished(): void;
  onSkip(): void;
}

const FIRST_STEP_TIMEOUT_MS = 4000;

const TOUR_ICON_PATHS = {
  previous: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
  done: 'm16 9-5.5 5.5L8 12',
};

function setNavigationIcon(
  doc: Document,
  button: HTMLButtonElement,
  label: string,
  pathData: string,
): void {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (pathData === TOUR_ICON_PATHS.done) {
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '2');
    svg.append(circle);
  }
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  button.replaceChildren(svg);
  button.classList.add('bh-internal-tour-navigation');
  button.classList.toggle('bh-internal-tour-done', pathData === TOUR_ICON_PATHS.done);
  button.setAttribute('aria-label', label);
  button.title = label;
}

export function resolveTourSteps(
  doc: Document,
  specs: readonly InternalTourSpec[],
): InternalTourStep[] {
  const steps: InternalTourStep[] = [];
  for (const spec of specs) {
    const element =
      doc.querySelector(spec.selector) ??
      (spec.fallback === undefined ? null : doc.querySelector(spec.fallback));
    if (element !== null) steps.push({ element, title: spec.title, description: spec.description });
  }
  return steps;
}

export function startInternalTour(
  specs: readonly InternalTourSpec[],
  options: InternalTourOptions,
): () => void {
  const doc = typeof document === 'undefined' ? undefined : document;
  const first = specs[0];
  if (doc === undefined || first === undefined) return () => {};
  const previous = doc.activeElement;
  let tour: ReturnType<typeof driver> | undefined;
  let observer: MutationObserver | undefined;
  let dialogs: MutationObserver | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  const stopWaiting = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const attempt = (allowPartial: boolean): void => {
    if (started) return;
    if (!allowPartial && doc.querySelector(first.selector) === null) return;
    const steps = resolveTourSteps(doc, specs);
    if (steps.length === 0) {
      if (allowPartial) {
        stopWaiting();
        options.onClosed();
      }
      return;
    }
    started = true;
    stopWaiting();
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onClosed();
      tour?.destroy();
    };
    const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    tour = driver({
      animate: !reduced,
      smoothScroll: false,
      allowKeyboardControl: false,
      overlayClickBehavior: (_element, _step, { driver: activeTour }) => {
        if (activeTour.isLastStep()) {
          options.onFinished();
          activeTour.destroy();
        } else {
          activeTour.moveNext();
        }
      },
      overlayColor: 'var(--dsw-alias-bg-mask-1)',
      overlayOpacity: 1,
      popoverClass: 'bh-internal-tour',
      showButtons: ['next', 'previous', 'close'],
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      nextBtnText: options.nextLabel,
      prevBtnText: options.previousLabel,
      doneBtnText: options.doneLabel,
      steps: steps.map((step, index) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
          ...(index === steps.length - 1
            ? {
                nextBtnText: options.doneLabel,
                onNextClick: () => {
                  options.onFinished();
                  tour?.destroy();
                },
              }
            : {}),
        },
      })),
      onPopoverRender: (popover) => {
        popover.wrapper.setAttribute('role', 'dialog');
        popover.wrapper.setAttribute('aria-label', tour?.getActiveStep()?.popover?.title ?? '');
        popover.closeButton.setAttribute('aria-label', options.closeLabel);
        const progress = options.progress;
        const index = tour?.getActiveIndex();
        if (progress !== undefined && index !== undefined)
          popover.progress.textContent = `${index + 1 + progress.offset} / ${progress.total ?? progress.offset + steps.length}`;
        setNavigationIcon(
          doc,
          popover.previousButton,
          options.previousLabel,
          TOUR_ICON_PATHS.previous,
        );
        const lastStep = tour?.isLastStep() === true;
        setNavigationIcon(
          doc,
          popover.nextButton,
          lastStep ? options.doneLabel : options.nextLabel,
          lastStep && options.doneIcon !== 'next' ? TOUR_ICON_PATHS.done : TOUR_ICON_PATHS.next,
        );
        const skipLabel = options.skipLabel;
        if (
          skipLabel !== undefined &&
          popover.footerButtons.querySelector('.bh-internal-tour-skip') === null
        ) {
          const skip = doc.createElement('button');
          skip.type = 'button';
          skip.className = 'bh-internal-tour-skip';
          skip.textContent = skipLabel;
          skip.addEventListener('click', () => {
            options.onSkip();
            tour?.destroy();
          });
          popover.footerButtons.prepend(skip);
        }
        popover.closeButton.focus();
      },
      onCloseClick: () => {
        options.onClosed();
        tour?.destroy();
      },
      onDestroyed: () => {
        doc.removeEventListener('keydown', escape, true);
        dialogs?.disconnect();
        dialogs = undefined;
        queueMicrotask(() => {
          if (previous instanceof HTMLElement && previous.isConnected && previous !== doc.body)
            previous.focus();
        });
      },
    });
    doc.addEventListener('keydown', escape, true);
    dialogs = new MutationObserver(() => {
      const dialog = [...doc.querySelectorAll('[role="dialog"]')].find(
        (node) => !node.classList.contains('driver-popover') && node.getClientRects().length > 0,
      );
      if (dialog === undefined) return;
      options.onClosed();
      tour?.destroy();
    });
    dialogs.observe(doc.body, { childList: true, subtree: true });
    tour.drive();
  };
  if (doc.querySelector(first.selector) !== null) {
    attempt(false);
  } else {
    observer = new MutationObserver(() => {
      attempt(false);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    timer = setTimeout(() => {
      attempt(true);
    }, FIRST_STEP_TIMEOUT_MS);
  }
  return () => {
    stopWaiting();
    tour?.destroy();
  };
}

export function startHelpTour(
  steps: readonly import('../help-api.js').HelpStep[],
  signal: AbortSignal,
  text: (value: import('../help-api.js').HelpText) => string,
  labels: { close: string; previous: string; next: string; done: string },
  progress: (step: number) => void,
  end: (reason: string) => void,
): () => void {
  const html = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  let index = 0;
  let target: Element | undefined;
  let deadline = Date.now() + FIRST_STEP_TIMEOUT_MS;
  let stopped = false;
  const previous = document.activeElement;
  let nextButton: HTMLButtonElement | undefined;
  const portals = new Set<Element>();
  const syncPortals = () => {
    const current = new Set<Element>();
    for (const control of target?.querySelectorAll('[aria-controls]') ?? []) {
      for (const id of (control.getAttribute('aria-controls') ?? '').split(/\s+/)) {
        const popup = document.getElementById(id);
        if (popup && !target?.contains(popup)) current.add(popup);
      }
    }
    for (const popup of portals)
      if (!current.has(popup)) {
        popup.classList.remove('bh-help-owned-popup');
        portals.delete(popup);
      }
    for (const popup of current) {
      popup.classList.add('bh-help-owned-popup');
      portals.add(popup);
    }
  };
  const tour = driver({
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    smoothScroll: false,
    allowKeyboardControl: false,
    overlayColor: 'var(--dsw-alias-bg-mask-1)',
    overlayOpacity: 1,
    popoverClass: 'bh-internal-tour',
    overlayClickBehavior: () => {},
    onCloseClick: () => end('closed'),
    onPopoverRender(popover) {
      popover.wrapper.setAttribute('role', 'dialog');
      popover.wrapper.setAttribute('aria-label', text(steps[index]!.title));
      popover.closeButton.setAttribute('aria-label', labels.close);
      nextButton = popover.nextButton;
      nextButton.disabled = steps[index]?.complete?.() === false;
      popover.closeButton.focus();
    },
  });
  const show = () => {
    syncPortals();
    const step = steps[index];
    if (!step) {
      end('completed');
      return;
    }
    const resolved = step.resolve();
    if (!resolved?.isConnected) {
      if (target || Date.now() > deadline) end('target-unavailable');
      return;
    }
    if (resolved === target) {
      if (nextButton) nextButton.disabled = step.complete?.() === false;
      tour.refresh();
      return;
    }
    target = resolved;
    tour.highlight({
      element: target,
      popover: {
        title: html(text(step.title)),
        description: html(text(step.description)),
        showButtons: ['previous', 'next', 'close'],
        prevBtnText: labels.previous,
        nextBtnText: index === steps.length - 1 ? labels.done : labels.next,
        onPrevClick() {
          if (index === 0) return;
          index--;
          target = undefined;
          deadline = Date.now() + FIRST_STEP_TIMEOUT_MS;
          progress(index);
          show();
        },
        onNextClick() {
          if (step.complete?.() === false) return;
          index++;
          target = undefined;
          deadline = Date.now() + FIRST_STEP_TIMEOUT_MS;
          progress(index);
          show();
        },
      },
    });
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    end('closed');
  };
  const timer = setInterval(show, 100);
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('keydown', escape, true);
    signal.removeEventListener('abort', dispose);
    tour.destroy();
    for (const popup of portals) popup.classList.remove('bh-help-owned-popup');
    portals.clear();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
  document.addEventListener('keydown', escape, true);
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) dispose();
  else show();
  return dispose;
}
