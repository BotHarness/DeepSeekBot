import * as stylex from '@stylexjs/stylex';

export function hooked(
  hook: string,
  ...styles: ReadonlyArray<stylex.StyleXStyles>
): ReturnType<typeof stylex.props> & { className: string } {
  const props = stylex.props(...styles);
  return { ...props, className: props.className ? `${hook} ${props.className}` : hook };
}
