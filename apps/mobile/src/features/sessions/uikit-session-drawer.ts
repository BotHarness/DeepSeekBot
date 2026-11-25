import { requireOptionalNativeModule } from 'expo';

export const uikitSessionDrawer = requireOptionalNativeModule('SessionDrawer') !== null;
