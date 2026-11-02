import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Platform } from 'react-native';
import { EndSheet } from '../primitives/end-sheet';
import type { EndSheetProps } from '../primitives/end-sheet';

type Sheet = Omit<EndSheetProps, 'children' | 'fullWidth'>;
const Register = createContext<Dispatch<SetStateAction<Sheet | null>>>(() => {});

export function ActivitySheetRoot({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  return (
    <Register.Provider value={setSheet}>
      <EndSheet
        open={Boolean(sheet?.active && sheet.open)}
        active={sheet?.active ?? false}
        enabled={sheet?.enabled ?? false}
        panel={sheet?.panel}
        onOpenChange={sheet?.onOpenChange ?? ignoreChange}
      >
        {children}
      </EndSheet>
    </Register.Provider>
  );
}
const ignoreChange = () => {};

export function ActivitySheetRegistration(props: Sheet) {
  const register = useContext(Register);
  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;
    register(props);
    return () => register(null);
  }, [register, props]);
  return null;
}
