/**
 * Who a signed in person is in the DATA, which is not always who Cognito says they are.
 *
 * People who used Quizlike on Firebase have documents keyed by their old Firebase user id (their quizzes, results,
 * classes). The migration copies those across unchanged and marks each profile `legacy` with `legacyEmail`.
 * When the same person signs in on AWS, Cognito gives them a NEW id (the `sub`). To keep their data without
 * rewriting thousands of documents, the API treats them as their old id.
 *
 * The match is by email, and it only counts when the email is VERIFIED (authn.mjs: Google, or an account moved over
 * from Firebase with its password). A plain new sign up with the same email is not verified, is refused up front by
 * the pre sign up trigger, and in any case never matches. Nobody can claim another person's data by typing their email.
 */
const TTL_MS = 5 * 60_000;
const cache = new Map();       // sub -> { uid, at }

export function resetIdentityCache() { cache.clear(); }

/**
 * @param repo   storage (repo.mjs or memory-repo.mjs)
 * @param caller from verifyToken, or null
 * @returns the caller with `uid` set to the id the data uses, `sub` the Cognito id, and `legacy` true when they differ
 */
export async function resolveCaller(repo, caller, nowMs = Date.now()) {
  if (!caller) return null;
  const base = { ...caller, sub: caller.sub || caller.uid, legacy: false };
  if (!caller.emailVerified || !caller.email) return base;

  const hit = cache.get(base.sub);
  if (hit && nowMs - hit.at < TTL_MS) return hit.uid === base.sub ? base : { ...base, uid: hit.uid, legacy: true };

  const rows = await repo.query('users', {
    index: 'byLegacyEmail', pkAttr: 'legacyEmail', pkValue: String(caller.email).trim().toLowerCase(), limit: 2,
  });
  const uid = rows.length === 1 ? rows[0].uid : base.sub;       // two profiles with one email is ambiguous: match none
  cache.set(base.sub, { uid, at: nowMs });
  return uid === base.sub ? base : { ...base, uid, legacy: true };
}
