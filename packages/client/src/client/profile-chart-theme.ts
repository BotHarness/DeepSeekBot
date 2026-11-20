import { useSyncExternalStore } from 'react';

export interface ChartTokens {
  cached: string;
  uncached: string;
  output: string;
  foreground: string;
  muted: string;
  grid: string;
}

function resolveChartTokens(): ChartTokens {
  const fallback: ChartTokens = {
    cached: 'currentColor',
    uncached: 'currentColor',
    output: 'currentColor',
    foreground: 'currentColor',
    muted: 'currentColor',
    grid: 'currentColor',
  };
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const surface = document.querySelector('.bh-root') ?? document.documentElement;
  const style = getComputedStyle(surface);
  const token = (name: string, fallbackValue: string): string =>
    style.getPropertyValue(name).trim() || fallbackValue;
  const cached = token('--bh-accent', 'currentColor');
  return {
    cached,
    uncached: token('--bh-chart-read-dim', cached),
    output: token('--bh-chart-output', cached),
    foreground: token('--tobs-ink-primary', 'currentColor'),
    muted: token('--tobs-ink-tertiary', 'currentColor'),
    grid: token('--tobs-line-edge', 'currentColor'),
  };
}

let chartTokens: ChartTokens | undefined;
let chartObserver: MutationObserver | undefined;
const chartListeners = new Set<() => void>();

function chartTokenSnapshot(): ChartTokens {
  chartTokens ??= resolveChartTokens();
  return chartTokens;
}

function refreshChartTokens(): void {
  const next = resolveChartTokens();
  const previous = chartTokenSnapshot();
  if (
    next.cached === previous.cached &&
    next.uncached === previous.uncached &&
    next.output === previous.output &&
    next.foreground === previous.foreground &&
    next.muted === previous.muted &&
    next.grid === previous.grid
  )
    return;
  chartTokens = next;
  chartListeners.forEach((listener) => listener());
}

function subscribeChartTokens(listener: () => void): () => void {
  chartListeners.add(listener);
  if (
    chartObserver === undefined &&
    typeof MutationObserver === 'function' &&
    typeof document !== 'undefined'
  ) {
    chartObserver = new MutationObserver(refreshChartTokens);
    chartObserver.observe(document.body, { attributes: true });
    chartObserver.observe(document.documentElement, { attributes: true });
  }
  refreshChartTokens();
  return () => {
    chartListeners.delete(listener);
    if (chartListeners.size === 0) {
      chartObserver?.disconnect();
      chartObserver = undefined;
    }
  };
}

export function useProfileChartTokens(): ChartTokens {
  return useSyncExternalStore(subscribeChartTokens, chartTokenSnapshot, chartTokenSnapshot);
}
