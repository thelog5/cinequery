# Security

Cinequery is a public demo that executes model-generated SQL against movie data. These controls reduce risk; they are not a security certification or a guarantee against abuse.

## Report a concern privately

Use the repository's private vulnerability-reporting option if enabled. Otherwise ask the maintainer for a private contact without posting exploit details. Include the affected commit, reproduction steps, impact, and sanitized logs. Do not include live credentials, private questions, or database dumps. No dedicated security mailbox or response-time commitment is currently documented.

## Controls to preserve and verify before release

- Separate database roles: `cinequery_reader` reads the four movie tables; `cinequery_ops` handles request accounting. Direct owner credentials stay local for setup only. Runtime connections use pooled SSL URLs.
- Generated SQL passes a single-query lexical guard, executes inside a read-only transaction with a five-second statement timeout, and returns at most 200 rows. The guard is not a full SQL parser; database privileges remain essential. Avoid adding unrelated tables, privileged functions, or elevated role memberships to this database.
- Production requires `DATABASE_URL_OPS` and a private `IP_HASH_SALT`; unavailable admission checks return an error rather than allowing model calls. Local development can omit ops, so do not treat local fallback behavior as a production configuration.
- Admission uses a transaction-scoped advisory lock to serialize limit checks and admission across instances. The default public configuration is 10 questions/IP/hour, two active requests globally (`MAX_CONCURRENT_REQUESTS=2`), and a $0.50 daily recorded-spend threshold, resetting at UTC midnight. Stale active-request slots expire after three minutes; the model loop has a 90-second deadline inside Vercel's 120-second function limit.
- The API limits JSON bodies to 4 KB and questions to 3–300 characters, checks browser request origins, and uses generic public model-error messages. Origin checks do not authenticate callers or stop bots that directly submit HTTP requests.
- Enable included Vercel edge WAF controls for abusive `/api/ask` traffic. Requests rejected by database-backed admission still consume database activity; edge blocking can reduce Neon wake-ups. Review current allowances before enabling features. [Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf).

Rate and concurrency controls are conservative application safeguards. The daily budget is a **soft cap** based on estimated, recorded costs, with no prepayment reservation for an in-flight answer. Calls already running, interrupted functions, failed outcome writes, or stale price estimates can exceed it. Configure an Anthropic console workspace spend limit as the provider backstop. Neither the app cap nor IP hashing prevents distributed abuse or bounds total hosting/database usage.

## Secrets and user data

- Keep `.env*` private except the placeholder-only `.env.example`. Never commit API keys, role passwords, database URLs, backups, or deployment tokens. Check staged files and Git history before publication; ignored files may still have been tracked previously.
- Do not expose secrets through `NEXT_PUBLIC_*`, client components, `next.config` environment inlining, static JSON, screenshots, or browser logs. Preview deployments must use isolated credentials; do not give secrets to untrusted code.
- Generate `IP_HASH_SALT` with `openssl rand -hex 32` and keep it stable and private. A salted IP hash is pseudonymous, not proof of anonymity.
- `ops.requests` stores the question, salted IP hash, timestamps, status, tokens, latency, and estimated cost. Questions and query context/results can be sent to Anthropic. Hosting/database/provider logs may contain additional metadata. Do not submit sensitive information.
- No automatic ops-history cleanup is configured. The owner should choose retention and manually delete expired rows with local admin access after the accounting windows; app roles should not gain DELETE privileges. Do not add a database-waking cleanup cron merely for deployment.

If a secret is exposed, revoke/rotate it first, replace the affected deployment values, and redeploy. Then remove the exposure from the repository and artifacts; deleting the latest copy alone does not revoke a credential. Preserve sanitized evidence privately.

## Evidence and limits

The 2026-11-12 local review found **zero known dependency-audit advisories**, **94 passing tests on Node 24**, and a successful production build with inaccessible database URLs. Focused checks covered simultaneous admission, SQL guard bypasses, read-only database queries and timeouts, idle pool closure/reconnection, malformed requests, and production configuration. The available Git history (380 objects), public working files, client bundles, and traced server file lists were checked for known key patterns and configured credential values with no matches. Production smoke checks confirmed static pages load without service credentials, while an unconfigured API returns 503 and invalid requests return 400/403/413/415. These checks reflect the reviewed checkout and their detection scope, and are not a claim of “no vulnerabilities.”

The [Neon migration](docs/NEON_MIGRATION.md) is complete: row counts and content hashes match the local copy, pooled reader/ops permissions are verified, and all 100 reference queries pass. Vercel environment import, WAF configuration, live request accounting, cold starts, and function limits still need to be checked during launch. Follow [deployment guidance](docs/DEPLOYMENT.md).
