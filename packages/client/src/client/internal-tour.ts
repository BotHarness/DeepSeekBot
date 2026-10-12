import { driver } from 'driver.js';

export interface InternalTourSpec {
  selector: string;
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
  skipLabel: string;
  previousLabel: string;
  nextLabel: string;
  doneLabel: string;
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
  button.setAttribute('aria-label', label);
  button.title = label;
}

export function resolveTourSteps(
  doc: Document,
  specs: readonly InternalTourSpec[],
): InternalTourStep[] {
  const steps: InternalTourStep[] = [];
  for (const spec of specs) {
    const element = doc.querySelector(spec.selector);
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
    if (steps.length === 0) return;
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
          lastStep ? TOUR_ICON_PATHS.done : TOUR_ICON_PATHS.next,
        );
        if (popover.footerButtons.querySelector('.bh-internal-tour-skip') === null) {
          const skip = doc.createElement('button');
          skip.type = 'button';
          skip.className = 'bh-internal-tour-skip';
          skip.textContent = options.skipLabel;
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
