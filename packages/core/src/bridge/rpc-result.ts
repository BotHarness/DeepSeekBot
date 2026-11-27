import type { AdminResult as KernelAdminResult } from '../kernel/rpc-result.js';
import type { BotMetadataResult } from '../features/team/bot-administration.js';

export { toRemoteError, unwrap, unwrapAsync } from '../kernel/rpc-result.js';

export type AdminResult<T, M = BotMetadataResult> = KernelAdminResult<T, M>;
