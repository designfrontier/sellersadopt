# `site/public/admin/` — Sveltia CMS

This directory is the static admin SPA for editing site content. Astro copies
`public/` verbatim into `dist/` at build time, so it's available in production
at `https://sellersadopt.com/admin/`.

> **Status:** the admin shell is built. Login + content editing work as soon as
> the auth Worker is deployed with its GitHub OAuth secrets (see `SETUP.md` at
> the repo root). No external media bucket is required — uploads commit
> directly to the repo.

> **Local dev quirk:** Astro's dev server doesn't auto-resolve `/admin/` to
> `/admin/index.html`. When testing in `npm run dev`, visit
> `http://localhost:4321/admin/index.html` directly. Production handles
> directory index requests correctly, so `/admin/` works there.

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

## Media handling — in-repo, per-field

Image uploads commit **into the git repo**, alongside the markdown that
references them. There is no external media bucket, no CDN, no separate
upload service — when an editor adds a photo to a gallery entry, the binary
lands in the same git commit as the new markdown file.

How it works:
- Each image-widget field in `config.yml` (`pages.hero`, `family.photo`,
  `gallery.image`, `blog.hero`) sets `media_folder: images` and
  `public_folder: images`. Per Decap/Sveltia rules, those paths are
  interpreted **relative to the entry's collection folder**.
- A photo uploaded for a gallery entry at
  `site/src/content/gallery/our-yard.md` is committed to
  `site/src/content/gallery/images/<filename>`, and Sveltia writes
  `image: images/<filename>` into the frontmatter.
- That relative path is exactly what Astro's `image()` schema helper accepts
  in content collections (Astro 6 resolves it relative to the markdown file).
  At build time, Astro processes the binary through its image pipeline
  (resize, format conversion, hashing) and emits an optimized asset under
  `_astro/`.

The only explicit cost is **repo size**. Image binaries live in git history
forever. Mitigation:

- Compress photos before upload. JPEGs at ~1500-2000 px on the long edge are
  plenty for web use; aim for under ~1 MB per image, hard ceiling around
  5 MB. Sveltia commits exactly what you upload.
- Don't upload original camera files (24 MP RAW or 5 MB+ JPEGs) unless
  there's a specific need.
- For one-off oversized images, an editor or maintainer can re-export and
  re-upload — the old commit lingers in history, but the rendered site uses
  the latest version.

The top-level `media_folder: site/public/uploads` and `public_folder: /uploads`
in `config.yml` are a fallback for any media inserted via the markdown widget
(images dropped into a body, not into a structured image field). Anything
landing there is served as a normal static asset at `/uploads/...`.

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
4. For any `widget: image` field, copy the per-field
   `media_folder: images` / `public_folder: images` pattern used elsewhere
   in `config.yml` so uploads land next to the markdown rather than in the
   top-level fallback.

References:
- Sveltia config: <https://sveltiacms.app/en/docs>
- Decap-compatible widget reference (Sveltia inherits this):
  <https://decapcms.org/docs/widgets/>
- Decap media/public folder rules:
  <https://decapcms.org/docs/configuration-options/#media-and-public-folders>
- Astro `image()` in content collections:
  <https://docs.astro.build/en/guides/images/#images-in-content-collections>

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
3. Hard-refresh `/admin/` and smoke-test login + an edit on each collection,
   confirming that an image uploaded via the image widget lands at
   `<collection-folder>/images/<filename>` in the resulting commit.
