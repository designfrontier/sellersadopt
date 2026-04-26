# sellers-uploads

Cloudflare Worker that mints short-lived presigned PUT URLs for image
uploads going into a Cloudflare R2 bucket. Sveltia CMS calls
`POST /presign` from the browser, gets back a URL, and uploads the file
straight to R2 — the Worker never proxies the bytes.

Will be deployed at `uploads.sellersadopt.com` (DNS handled in Wave 3).

## What it does

- `OPTIONS *` — CORS preflight. Echoes the request origin back if it is in
  `ALLOWED_ORIGINS`; otherwise returns 204 with no `Access-Control-Allow-*`
  headers (the browser then blocks the actual request).
- `POST /presign` — body `{filename, contentType, size}`:
  1. Requires an `Authorization: Bearer <github-token>` header.
  2. Calls `GET https://api.github.com/user` to resolve the user. The login
     must be in `ALLOWED_GITHUB_USERS` (case-insensitive).
  3. Validates `contentType` (jpeg/png/webp/gif), `size` (≤ 25 MiB),
     `filename` (non-empty after sanitization).
  4. Builds the object key `YYYY/MM/<unix-timestamp>-<sanitized-filename>`.
  5. Returns `{uploadUrl, publicUrl, key}`. `uploadUrl` is signed for 5
     minutes; `publicUrl` is the eventual public URL once the object lands.
- Anything else → 404.

## Required configuration

### Secrets (`wrangler secret put <NAME>`)

| Name                   | What                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `R2_ACCESS_KEY_ID`     | R2 API token (S3-compatible) access key id                  |
| `R2_SECRET_ACCESS_KEY` | matching secret                                             |

Generate these from the **R2 → Manage R2 API Tokens** screen in the
Cloudflare dashboard. See the Cloudflare docs for current steps:
<https://developers.cloudflare.com/r2/api/s3/tokens/>.

### Vars (in `wrangler.toml` or the dashboard)

| Name                   | Example                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | `abcd1234…` (your CF account id)                            |
| `R2_BUCKET`            | `sellers-uploads`                                           |
| `ALLOWED_GITHUB_USERS` | `designfrontier,kksellers`                                  |
| `PUBLIC_BASE_URL`      | `https://uploads.sellersadopt.com`                          |
| `ALLOWED_ORIGINS`      | `https://sellersadopt.com,http://localhost:4321`            |

## Local dev

```sh
cd workers/uploads
npm install

# Put your secrets into a local .dev.vars file (gitignored):
cat > .dev.vars <<'EOF'
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
EOF

# Optionally override [vars] for dev in .dev.vars too.

npm run dev      # starts wrangler dev
```

You can hit it with `curl`:

```sh
curl -X POST http://localhost:8787/presign \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"hero.jpg","contentType":"image/jpeg","size":1234}'
```

## Tests

```sh
npm test            # vitest run, with coverage
npm run test:watch  # vitest in watch mode
npm run typecheck   # tsc --noEmit
```

The tests run inside Miniflare via `@cloudflare/vitest-pool-workers`, so
they exercise the real Workers runtime (real `Request`/`Response`, real
`crypto.subtle` for aws4fetch's HMACs). The GitHub `/user` call is the
only outbound dependency and is stubbed via `vi.stubGlobal('fetch', …)`.
aws4fetch's signing is **not** mocked — tests assert the produced URL
contains `X-Amz-Signature`, `X-Amz-Date`, and `X-Amz-Expires=300`.

## Deploy

```sh
# one-off, after setting secrets
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY

npm run deploy
```

To verify the build without uploading:

```sh
npx wrangler deploy --dry-run --outdir=/tmp/uploads-build
```

## Filename sanitization rule

`sanitizeFilename(input)`:

1. Lowercase the entire input.
2. Replace every character not matching `[a-z0-9._-]` with `-`.
3. Collapse runs of `-` (so `a   b` → `a-b`).
4. Collapse `-+\.` → `.` and `\.-+` → `.` so the dash that would otherwise
   trail before/after the extension dot disappears (avoids `name-.jpg`).
5. Collapse runs of `.` to a single `.`.
6. Trim leading/trailing `-` and `.`.

Example: `My Photo (1).JPG` → `my-photo-1.jpg`.

Empty result → 400.
