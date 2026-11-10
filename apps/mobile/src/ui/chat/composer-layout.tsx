import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, type ViewProps } from 'react-native';

type Part = 'body' | 'notice';
type Lease = { report(height: number | undefined): void; dispose(): void };
type ComposerLayout = { register(part: Part): Lease };
export const ComposerLayoutContext = createContext<ComposerLayout | undefined>(undefined);

export function useComposerLayout() {
  const owners = useRef<Partial<Record<Part, symbol>>>({});
  const [parts, setParts] = useState<{ body: number | undefined; notice: number | undefined }>({
    body: undefined,
    notice: 0,
  });
  const controller = useMemo<ComposerLayout>(
    () => ({
      register(part) {
        const owner = Symbol(part);
        owners.current[part] = owner;
        setParts((current) => ({ ...current, [part]: undefined }));
        return {
          report(height) {
            if (owners.current[part] !== owner) return;
            setParts((current) =>
              current[part] === height ? current : { ...current, [part]: height },
            );
          },
          dispose() {
            if (owners.current[part] !== owner) return;
            delete owners.current[part];
            setParts((current) => ({ ...current, [part]: part === 'notice' ? 0 : undefined }));
          },
        };
      },
    }),
    [],
  );
  return {
    controller,
    height:
      parts.body === undefined || parts.notice === undefined
        ? undefined
        : parts.body + parts.notice,
  };
}

function useLayoutLease(part: Part) {
  const controller = useContext(ComposerLayoutContext);
  const lease = useRef<Lease | undefined>(undefined);
  useLayoutEffect(() => {
    const next = controller?.register(part);
    lease.current = next;
    return () => {
      if (lease.current === next) lease.current = undefined;
      next?.dispose();
    };
  }, [controller, part]);
  const report = useCallback((height: number | undefined) => lease.current?.report(height), []);
  return { enabled: controller !== undefined, report };
}

export function ComposerLayoutNotice(props: ViewProps) {
  const { enabled, report } = useLayoutLease('notice');
  return (
    <View
      {...props}
      onLayout={enabled ? (event) => report(event.nativeEvent.layout.height) : props.onLayout}
    />
  );
}

export function useComposerBodyLayout(padding: number, hasFooter: boolean) {
  const { enabled, report } = useLayoutLease('body');
  const sizes = useRef<{
    pill: number | undefined;
    above: number | undefined;
    footer: number | undefined;
  }>({ pill: undefined, above: undefined, footer: undefined });
  const publish = useCallback(() => {
    const { pill, above, footer } = sizes.current;
    report(
      pill === undefined || above === undefined || (hasFooter && footer === undefined)
        ? undefined
        : padding + pill + above + (hasFooter ? (footer ?? 0) : 0),
    );
  }, [padding, hasFooter, report]);
  useLayoutEffect(() => {
    if (!hasFooter) sizes.current.footer = undefined;
    publish();
  }, [hasFooter, publish]);
  const measure = (part: 'pill' | 'above' | 'footer', height: number) => {
    sizes.current[part] = height;
    publish();
  };
  return { enabled, measure };
}
