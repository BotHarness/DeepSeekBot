import type { ReactElement } from 'react';

function baseProps(size: number): {
  width: number;
  height: number;
  viewBox: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  'aria-hidden': true;
} {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function TrackpadIcon({ size = 14 }: { readonly size?: number }): ReactElement {
  return (
    <svg {...baseProps(size)}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <line x1="12" y1="12" x2="12" y2="15" />
    </svg>
  );
}

export function TakeoverIcon({ size = 14 }: { readonly size?: number }): ReactElement {
  return (
    <svg {...baseProps(size)}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M4 20c0-3.3 2.7-6 6-6 1.4 0 2.7.5 3.7 1.3" />
      <path d="m14.5 18.5 2.5 2.5 5-5.5" />
    </svg>
  );
}
