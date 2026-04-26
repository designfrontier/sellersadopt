# sellers-auth

A Cloudflare Worker that handles the GitHub OAuth handshake for the
[Sveltia](https://github.com/sveltia/sveltia-cms) /
[Decap](https://decapcms.org/) CMS used to manage content on
`sellersadopt.com`. It will be deployed at `auth.sellersadopt.com`.

## What it does

Sveltia/Decap opens this Worker in a popup at
`/auth?provider=github&site_id=...&scope=repo`. We:

1. Generate a CSRF state token, store it in a 10-minute, HttpOnly,
   `SameSite=Lax` cookie, and 302 to GitHub's `/login/oauth/authorize`.
2. Receive the `code` + `state` at `/callback`, validate state against the
   cookie, exchange the code for an access token, and load
   `https://api.github.com/user` to discover the GitHub login.
3. If the login matches the `ALLOWED_GITHUB_USERS` allowlist (case-insensitive,
   comma-separated), return an HTML page that runs
   `window.opener.postMessage("authorization:github:success:{...}", "*")`
   – the exact format Decap/Sveltia listens for.
4. On any failure, return an HTML page with the matching
   `authorization:github:error:{...}` postMessage.

## Required configuration

Secrets (set with `wrangler secret put …` in production, or in a local
`.dev.vars` file for `wrangler dev`):

- `GITHUB_CLIENT_ID` – GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` – GitHub OAuth App client secret

Plain vars (set in `wrangler.toml` or the dashboard):

- `ALLOWED_GITHUB_USERS` – comma-separated list of GitHub login names that may
  authenticate. Compared case-insensitively after trimming.

## Local development

```sh
npm install

# Create .dev.vars (gitignored) for local secrets:
cat > .dev.vars <<EOF
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALLOWED_GITHUB_USERS=YourUserName
EOF

npm run dev
```

`wrangler dev` will print a local URL. Point your test OAuth App's
"Authorization callback URL" at `<that url>/callback` while developing.

## Tests

```sh
npm test                 # vitest run
npm run test:watch       # interactive
npm run test:coverage    # vitest run --coverage (enforces ≥80% lines)
```

Tests run inside the
[`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/)
pool so the runtime matches production. GitHub is mocked via
`vi.stubGlobal("fetch", …)`.

## Type-check & dry-run build

```sh
npm run typecheck                                 # tsc --noEmit
npx wrangler deploy --dry-run --outdir=/tmp/auth  # bundle without uploading
```

## Production deploy

```sh
# One-time: log in to Cloudflare
npx wrangler login

# Set secrets:
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# (ALLOWED_GITHUB_USERS lives in wrangler.toml under [vars] – update there.)

npm run deploy
```

CI deploys are wired up in ticket C1 (GitHub Actions) and use a
`CLOUDFLARE_API_TOKEN` env var instead of `wrangler login`.

## Decap/Sveltia contract

The popup-window OAuth contract this Worker implements is documented by Decap
CMS:

- <https://decapcms.org/docs/external-oauth-clients/>
- <https://decapcms.org/docs/github-backend/>

The non-negotiable bit is the postMessage payload string:

```
authorization:github:success:{"token":"<access_token>","provider":"github"}
authorization:github:error:{...arbitrary error json...}
```
