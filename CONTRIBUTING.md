# Contributing

Keep changes focused and include the problem, resulting behavior, and relevant validation in the pull request. Read [README.md](README.md), [AGENTS.md](AGENTS.md), and the relevant installed guides under `node_modules/next/dist/docs/` before changing Next.js code; this version has breaking changes.

## Local workflow

Use Node 24 and pnpm 10.27.0, pinned in `.nvmrc` and `package.json`. See [deployment guidance](docs/DEPLOYMENT.md).

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The dev server listens on `http://localhost:3100`. Fill `.env` privately only for features you need. Static homepage/Accuracy work should not require database or model access. Never point development tests or setup scripts at production.

For database work, use a disposable local PostgreSQL database with `pg_trgm`. The README's `db:load` workflow downloads current IMDb data and recreates movie tables; use it only for a fresh development dataset. To preserve the dataset used by saved evals, use the [dump/restore workflow](docs/DEPLOYMENT.md#2-copy-the-exact-movie-dataset-to-an-empty-neon-target). Run `db:ops` and `db:roles` locally with local-only admin credentials as needed.

## Validate the change

```bash
pnpm lint
pnpm test
pnpm build
```

`pnpm lint` currently runs TypeScript checking. Integration tests need the appropriate local database URLs and may skip when they are absent; report skips instead of presenting them as successful coverage. Tests of the agent use a scripted model; do not substitute live model calls. For UI changes, check the affected pages at desktop and mobile widths.

Builds must only build the app: no migrations, data loads, model calls, or evaluations. Preserve the static/cached Accuracy page and its saved JSON inputs; do not add database reads, polling, cron, or warm-up requests to browsing paths.

`pnpm eval` and `pnpm eval:all` make paid model calls and are not routine contribution checks. Do not run them without explicit authorization and a separate budget; they bypass the web admission path. `pnpm eval:check-gold` runs SQL without model calls but still uses database compute. Keep the baseline data and saved results unchanged unless the PR deliberately revises them. Record model/version, dataset provenance, costs, and scores when an authorized evaluation changes results.

Preserve the SQL guard, least-privilege roles, production fail-closed behavior, atomic admission, and conservative spend controls. Add focused regression coverage for changes to these boundaries. Report concerns through [SECURITY.md](SECURITY.md), keeping exploit details private.

## Before making the repository public

- Review staged files and the complete Git history for secrets, credential-bearing URLs, private user questions, and logs. Commit only placeholders in `.env.example`; `.env`, dumps/backups, data exports, and local deployment files must stay private. Rotate any credential previously exposed, even if removed.
- Check client components, browser bundles, `NEXT_PUBLIC_*`, and `next.config` environment values: API keys, database URLs, and salts belong only on the server. Keep `DATABASE_URL_ADMIN` and role-setup passwords off Vercel entirely.
- Review and commit the intended `evals/results/*.json` so the public Accuracy page has its inputs. Verify that result/error text contains no secrets or private data. Do not commit `ops.requests` exports or database dumps to reproduce scores.
- Original application code is MIT-licensed; preserve [LICENSE](LICENSE). The package stays `private` to prevent accidental npm publishing.
- Preserve [third-party notices](THIRD_PARTY_NOTICES.md). Included photographs use the Unsplash License; fonts, dependencies, and IMDb data retain their own terms. The application's MIT license does not grant commercial IMDb data rights.
- Use isolated Preview credentials and review untrusted pull requests before any deployment with secrets. Follow [deployment guidance](docs/DEPLOYMENT.md); publishing source does not require provisioning services or running evaluations.
