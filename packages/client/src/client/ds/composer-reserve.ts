import { space, style } from './tobs.stylex.js';

const controlHeightSmall: string = style.controlHeightSmall;

export const composerModelReserve = `calc(${controlHeightSmall} + ${space.x2})`;

export function composerCompactPadding(): string {
  return `${space.x3} calc(var(--bh-composer-compact-padding-right) + ${composerModelReserve}) ${space.x3} var(--bh-composer-compact-padding-left)`;
}

export function composerModelReservePx(computed: Pick<CSSStyleDeclaration, 'getPropertyValue'>) {
  const name = /var\((--[\w-]+)\)/u.exec(controlHeightSmall)?.[1];
  const control =
    name === undefined ? Number.NaN : Number.parseFloat(computed.getPropertyValue(name));
  return control + Number.parseFloat(space.x2);
}
