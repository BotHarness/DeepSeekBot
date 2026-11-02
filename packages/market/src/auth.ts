export {
  createAccessTokenVerifier,
  workosKeys,
  type AccessTokenVerifier,
} from '../../connect-relay/src/auth.js';

export function bearer(request: Request): string | undefined {
  return /^Bearer (\S+)$/u.exec(request.headers.get('authorization') ?? '')?.[1];
}
