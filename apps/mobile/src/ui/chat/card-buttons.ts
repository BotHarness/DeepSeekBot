import { Children, Fragment, isValidElement, type ReactNode } from 'react';

export function countCardButtons(children: ReactNode): number {
  let count = 0;
  Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment)
      count += countCardButtons(child.props.children);
    else if (child !== null && child !== undefined && typeof child !== 'boolean') count += 1;
  });
  return count;
}

export function stacksCardButtons(children: ReactNode, stack: boolean): boolean {
  return stack || countCardButtons(children) >= 3;
}
