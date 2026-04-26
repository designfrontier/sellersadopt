# `site/public/admin/` — Sveltia CMS

This directory is the static admin SPA for editing site content. Astro copies
`public/` verbatim into `dist/` at build time, so it's available in production
at `https://sellersadopt.com/admin/`.

## What's here

- `index.html` — loads Sveltia CMS from a CDN (pinned version).
- `config.yml` — backend, media, and collection configuration.
- `README.md` — this file.

## How an editor logs in

1. Visit <https://sellersadopt.com/admin/> in a browser.
2. Click **Login with GitHub**.
3. Authenticate with GitHub. The OAuth flow is handled by our auth Worker at
   `https://auth.sellersadopt.com` (see `workers/auth/`). The Worker enforces
   the `ALLOWED_GITHUB_USERS` allowlist, so only Daniel and Katie's accounts
   succeed; everyone else gets a polite error.
4. Once logged in, the CMS pulls the four collections (Pages, Family,
   Gallery, Blog) from the GitHub repo and presents a Notion-style editor.
   "Publish" commits straight to `main` (`publish_mode: simple`).

### First-time R2 setup (per editor, per browser)

The first time an editor uploads an image, Sveltia prompts for an R2
**Secret Access Key**. This is stored only in the editor's browser
local storage, never in the repo. Daniel will share the secret out-of-band
with Katie when the bucket is provisioned (Wave 3). The matching access key
*id* lives in `config.yml`.

If a browser is cleared / a new device is used, the prompt reappears.

## Media handling — Path A (native R2)

We chose **Path A: Sveltia's first-class Cloudflare R2 media library**.

Why:
- Sveltia 0.157.1 (the current release as of 2026-04-25) ships an R2 backend
  with `serviceId: cloudflare_r2` directly in the published bundle. Verified
  by inspecting `https://unpkg.com/@sveltia/cms@0.157.1/dist/sveltia-cms.mjs`
  — the relevant code reads `media_libraries.cloudflare_r2` and constructs
  an S3 endpoint at `https://<account_id>.r2.cloudflarestorage.com`.
- The browser uploads directly to R2 via the S3-compatible API. No proxy,
  no extra round-trip through a Worker.
- Credentials model: the public `access_key_id` lives in `config.yml`; the
  matching `secret_access_key` is entered through the Sveltia UI on first
  use and stored only in the browser. The repo never sees the secret.
- Decap CMS does **not** ship native R2 support, so this is a real Sveltia
  advantage for our setup.

The `workers/uploads/` presigning Worker is **unused for the moment**. We
recommend keeping it in the repo: it's a working presigned-URL service that
matches the same R2 bucket and the same allowlist of GitHub users, so if
Sveltia introduces a backend-presign mode (Stage 2 of the upstream proposal
in <https://github.com/sveltia/sveltia-cms/issues/586>) or if we need to
tighten the model so editors don't hold a long-lived R2 secret in their
browser, the Worker is ready to plug in.

`media_folder` / `public_folder` are still set in `config.yml` because
Sveltia requires them, but with `media_libraries.cloudflare_r2` in play, the
image widget commits R2 URLs directly into markdown rather than writing
files to `site/public/uploads/`.

## How to add a new collection

1. Update `site/src/content.config.ts` with the new collection's Zod schema
   (this is engineer E1's lane, but for reference).
2. Add a matching block under `collections:` in `config.yml`. Field widgets
   must mirror the Zod schema: `z.string()` → `widget: string`,
   `z.number()` → `widget: number` with `value_type: int` for integers,
   `z.coerce.date()` → `widget: datetime`, `image()` → `widget: image`,
   `z.enum([...])` → `widget: select` with `options:`.
3. Set `folder:` to the path the Astro `glob` loader watches (relative to
   the repo root), `create: true`, and `slug:` to the filename pattern.

References:
- Sveltia config: <https://sveltiacms.app/en/docs>
- Decap-compatible widget reference (Sveltia inherits this):
  <https://decapcms.org/docs/widgets/>

## Limitations / things the editor cannot do via the CMS

- **Layout / component changes.** New page templates, navigation changes,
  CSS, and Astro components still require code edits + PR.
- **New collections.** Adding a new content collection means changing both
  `content.config.ts` (Zod schema) and `config.yml` (Sveltia widgets).
  Both require code edits.
- **Schema-breaking changes.** Renaming a field or changing its type
  requires migrating existing markdown files; the CMS will not do this for
  the editor.
- **Publishing draft posts on a delay.** `publish_mode: simple` commits
  immediately. To gate posts behind PR review, switch to
  `publish_mode: editorial_workflow` and set up the corresponding
  conventions.

## Maintenance: bumping Sveltia

The CDN URL in `index.html` is pinned to `@sveltia/cms@0.157.1`. To upgrade:

1. Check <https://www.npmjs.com/package/@sveltia/cms> for the latest version
   and read the changelog for breaking changes (Sveltia is pre-1.0; minor
   versions can include breaking changes).
2. Update the version in the `<script src="...">` URL.
3. Hard-refresh `/admin/` and smoke-test login + an edit on each collection.
