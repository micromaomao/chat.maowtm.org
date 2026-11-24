# MaoChat on Cloudflare Workers

The React, React Router, and Fluent UI frontend is built with Parcel and served
by Workers Static Assets. Hono handles `/api/*`. Neon remains the database,
connected through Hyperdrive with query caching disabled.

Each chat session has a Durable Object. Its WebSockets use the Hibernation API;
plain `ping`/`pong` frames are answered automatically without waking the object.
Messages still use the authenticated HTTP API. Pending generation jobs and event
cursors are persisted in Postgres, and alarms run and retry generation. A reply
is committed only if its source is still the current job. Reconnecting clients
replay missed events, falling back to a snapshot for a large backlog.
New-session idempotency keys must be securely random. Their lookup hashes and
session IDs are stored, not plaintext chat tokens or token-derivation keys.

Workers AI is the only model provider. The defaults are
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` and
`@cf/qwen/qwen3-embedding-0.6b`. Model IDs remain editable in admin settings.
Token counts are conservative character estimates; prompt budgeting reserves 25%
of the context window plus the output allowance. RAG vectors stay in memory,
with a database revision invalidating caches across Worker instances.

## Cloudflare resources

`wrangler.json` currently targets `maowtm-chat` at
<https://maowtm-chat.maowtm.workers.dev>, using the **separate Neon branch**
behind Hyperdrive `f1ce40f2f7f74bc1a7fa33e66503654e`.
It does not attach or change `chat.maowtm.org`.

Workers Paid is required. Deployment creates the `ChatSessionObject` SQLite
Durable Object namespace and configures `CHAT_SESSION`, `HYPERDRIVE`, `AI`, and
`ASSETS` bindings. Workers AI needs neither a separately created model resource
nor an application API key. Hyperdrive holds database credentials; no database
password goes into the Worker bundle or build variables. AI Gateway is not used.
Error and custom logs are enabled; automatic invocation/access logs are disabled
because the existing HTTP API uses URL query tokens. Application logs do not
deliberately record chat content. Treat retained error logs and Cloudflare request
metadata as sensitive and keep access restricted to the account.

## Build and deploy

Use Node.js 22.16 or newer. From this directory:

```sh
npm ci
npm run build
npm run typecheck
npm test
npx wrangler login
npx wrangler deploy
```

Alternatively, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in your local
environment for a scoped deployment token. `npm run deploy` builds the frontend
and runs `wrangler deploy`. Do not commit credentials.

`npm run lint` is the existing repository-wide linter; legacy files have
pre-existing lint violations. The migration does not rewrite unrelated UI code
just to clear those violations.

## Database migrations and re-embedding

Back up or branch the database first. Schema changes are explicit, transactional,
and never run on Worker startup. Version 4 databases migrate to version 5;
an empty database is initialized. Older databases need their historical
migrations first. No tables or old embeddings are dropped.

Set `POSTGRESQL_URL` to the target branch's direct Neon connection string:

```sh
npm run db:migrate
```

Deploy the Worker against that branch before using its binding to re-embed:

```sh
npm run reembed -- --worker-url https://maowtm-chat.maowtm.workers.dev
npm run reembed -- --worker-url https://maowtm-chat.maowtm.workers.dev --activate
```

The script embeds all dialogue phrasings and historical user messages in batches
of at most 32. It writes embeddings alongside old models, skips completed rows on
reruns, detects changed sources, and never silently truncates inputs. `--activate`
checks that all dialogue embeddings are current before changing models. Existing
prompt, initial messages, rate limits, and enable/disable settings are preserved.
Concurrent configuration changes cause activation to stop rather than overwrite
them. `--model @cf/...` selects another embedding model; `--force` recomputes
existing rows.

The Worker URL mode creates an expiring temporary admin token in the target
database and removes it on exit. The Worker and local script must point at the
same database. This mode requires no Workers AI REST permission on the deployment
token. An interrupted script may leave its temporary token until its one-hour
expiry. Alternatively, omit `--worker-url` and set `CLOUDFLARE_ACCOUNT_ID` plus
`CLOUDFLARE_AI_TOKEN` with Workers AI Read permission to use the REST API directly.

Both scripts accept `--secrets-file /path/to/file` to parse an environment file
without executing shell code. The existing local variable
`CHAT_NEON_DATABASE_URL` is accepted as an alias for `POSTGRESQL_URL`, and
`CHAT_CF_WORKER_ACCOUNT_ID` as an alias for `CLOUDFLARE_ACCOUNT_ID`. An unquoted
connection string containing `?` and `&` is safe in this file; **do not source it
as a shell script**.

## Local development and staging checks

```sh
npm run dev
```

For local Hyperdrive connections, set
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to a direct connection
string for a development Neon branch. Authenticate Wrangler when using remote
Workers AI inference; it is real, billable inference, not a local model.
Local Durable Object storage is separate from deployed storage.
`npm run parcel` optionally watches the frontend on port 8000; the existing
Parcel proxy routes API calls to port 3000, so start Wrangler with
`npx wrangler dev --port 3000` when using that mode.

The deployed staging smoke test exercises chat generation, idempotency, token
authentication, WebSockets, replay, rollback, and editing/embedding. It creates
and cleans up its own session, RAG item, and temporary admin token, and performs
billable inference:

```sh
npm run test:staging -- --url https://maowtm-chat.maowtm.workers.dev
```

It also accepts `--secrets-file`. Unit and Durable Object tests run with
`npm test` without Cloudflare credentials or a database. Use `npx wrangler tail`
for deployed errors.

## Workers Builds

Once the migration is committed to Git, open **maowtm-chat → Settings → Builds →
Connect** and authorize Cloudflare's GitHub integration for this repository.

| Setting | Value |
| --- | --- |
| Root directory | `app` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Deployment branch | The branch containing this migration |

Leave non-production branch preview deployments disabled. Preview URLs are also
disabled in Wrangler: a different URL does not provide database isolation.
Do not put Neon credentials in build variables. Cloudflare manages the build's
deployment credentials, while GitHub Actions builds, typechecks, bundles, and
tests without deployment credentials.

## Production cutover

After staging is accepted, create or select the intended production database and
Hyperdrive configuration, keeping caching disabled. Point the production
Worker's Wrangler configuration at that resource, run the same migration and
re-embedding sequence against that database, and verify the Worker URL first.
Only then attach `chat.maowtm.org` as a Worker custom domain and retire the old
deployment. Keep the old database/model embeddings until the cutover is accepted.
Tabs still running the old SSE frontend must be reloaded after cutover.
