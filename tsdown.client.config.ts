import { defineConfig } from 'tsdown';

import { clientBundleOptions, vrmCompanionClientBundleOptions } from './tsdown.config';

export default defineConfig([clientBundleOptions, vrmCompanionClientBundleOptions]);
