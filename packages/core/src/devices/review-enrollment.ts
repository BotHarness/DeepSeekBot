export interface ReviewEnrollmentPolicy {
  account: string;
  hostId: string;
  expiresAt: string;
}

export function reviewEnrollmentPolicy(env: NodeJS.ProcessEnv): ReviewEnrollmentPolicy | undefined {
  const account = env['BOTHARNESS_REVIEW_ACCOUNT_ID'];
  const hostId = env['BOTHARNESS_REVIEW_HOST_ID'];
  const expiresAt = env['BOTHARNESS_REVIEW_EXPIRES_AT'];
  if (!account || !hostId || !expiresAt || !Number.isFinite(Date.parse(expiresAt)))
    return undefined;
  return { account, hostId, expiresAt };
}

export function permitsReviewEnrollment(
  policy: ReviewEnrollmentPolicy | undefined,
  identity: { account: string; hostId: string },
  now = Date.now(),
): boolean {
  return (
    policy !== undefined &&
    policy.account === identity.account &&
    policy.hostId === identity.hostId &&
    Date.parse(policy.expiresAt) > now
  );
}
