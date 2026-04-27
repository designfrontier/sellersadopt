# site/ — Astro static site

The public-facing website for <https://sellersadopt.com>.

For the high-level architecture, see [`../README.md`](../README.md).
For Cloudflare/GitHub setup, see [`../SETUP.md`](../SETUP.md). For the
day-to-day editor guide, see [`../CMS-GUIDE.md`](../CMS-GUIDE.md).

## What's in this directory

- **Astro 6** static site with **Tailwind CSS v4** via `@tailwindcss/vite`.
- Four content collections (`pages`, `family`, `gallery`, `blog`)
  in `src/content.config.ts`, validated against Zod schemas at build time.
- `public/admin/` ships the Sveltia CMS at `/admin/` in production
  (Astro copies `public/` verbatim).
- Node 22+ (`.nvmrc`, `engines.node`).

## Commands

```sh
cd site
npm install
npm run dev      # http://localhost:4321 (with --host so phones on LAN can hit it)
npm run build    # static output to ./dist/
npm run preview  # serve ./dist/ locally
npm run check    # astro check: type-check + content schema validation
```

Cloudflare Pages runs `npm ci && npm run build` from this directory on
every push to `main` (see `../SETUP.md` step 4).

The CMS at `http://localhost:4321/admin/` will load locally, but
**login won't work** without also running the auth Worker locally and
pointing `config.yml` at it. For local content work, just edit
markdown in `src/content/` and watch hot-reload.

## Content collections

All four collections live under `src/content/<name>/` as `.md` files
loaded via Astro's `glob()` content loader. The Zod schemas in
`src/content.config.ts` enforce frontmatter shape.

| Collection | Path                  | Example file                  |
| ---------- | --------------------- | ----------------------------- |
| `pages`    | `src/content/pages/`  | `about.md`, `our-home.md`     |
| `family`   | `src/content/family/` | `daniel.md`, `katie.md`       |
| `gallery`  | `src/content/gallery/`| *(empty until editors upload)*|
| `blog`     | `src/content/blog/`   | `welcome.md`                  |

Concrete frontmatter examples (one per collection):

```yaml
# src/content/pages/about.md
---
title: About Us
order: 1
summary: A little about Daniel, Katie, and our family in Holladay, Utah.
---

# src/content/family/daniel.md
---
name: Daniel
role: parent
traits: "Dad, builder of things, cyclist, banjo picker"
order: 1
---

# src/content/gallery/<slug>.md
---
title: Sledding at the canyon
image: ./sledding.jpg
alt: Two kids in red snowsuits at the bottom of a sledding hill
caption: First snow of the season
takenAt: 2025-12-12
season: winter
---

# src/content/blog/welcome.md
---
title: "Welcome to our journey"
date: 2026-04-26
summary: "A first note from us — what this site is, why we're here."
---
```

The full schemas (with optional fields and refinements) live in
`src/content.config.ts`.

## Adding content: CMS vs. direct edits

Two equivalent paths. Both produce the same markdown:

1. **Via the CMS** (Daniel and Katie's daily flow): visit
   <https://sellersadopt.com/admin/>. See
   [`../CMS-GUIDE.md`](../CMS-GUIDE.md).
2. **Direct file edit:** drop a new file at
   `src/content/<collection>/<slug>.md` with valid frontmatter and
   commit. Faster for bulk imports or anything you'd rather do in an
   editor than a web form.

Sveltia will edit hand-written files; the build doesn't care which path
produced a file.

## Adding a new collection

If you ever want to add a new type of content (say, "events" or
"videos"), it takes two coordinated changes:

1. **Define the Zod schema in `src/content.config.ts`.** Add a new
   `defineCollection` block and export it under `collections`.
   Example:

   ```ts
   const events = defineCollection({
     loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
     schema: ({ image }) =>
       z.object({
         title: z.string(),
         when: z.coerce.date(),
         where: z.string().optional(),
         hero: image().optional(),
       }),
   });

   export const collections = { pages, family, gallery, blog, events };
   ```

2. **Add a matching `collections:` block in
   `public/admin/config.yml`** so the CMS knows about it. Field widgets
   must mirror the Zod schema (see `public/admin/README.md` →
   "How to add a new collection" for the widget mapping rules).

3. Build at least one Astro page that consumes the new collection —
   typically an index under `src/pages/` and a `[slug].astro` for
   individual entries. Astro 6 docs:
   <https://docs.astro.build/en/guides/content-collections/>.

If you only do step 1, the data is loadable but never rendered. If you
only do step 2, the CMS will let editors create files but Astro will
fail to build them.

## The `/admin/` directory

`public/admin/` is the Sveltia CMS — Astro copies it verbatim into
`dist/admin/`. Two files there you may touch: `config.yml` (collections,
backend, R2 details — must mirror the Zod schemas) and `index.html`
(pinned Sveltia CDN URL). See `public/admin/README.md` for widget
mapping rules and upgrade procedure, and [`../CMS-GUIDE.md`](../CMS-GUIDE.md)
for the editor experience.

## Troubleshooting

- **"Empty collection" warning for `gallery` at build time.** Benign —
  Astro warns when a collection has zero entries; the build still
  succeeds. Goes away after the first gallery upload.
- **Dates off by one.** Astro parses `date:` and `takenAt:` as UTC.
  Bare `2026-04-26` in a negative-UTC timezone may render as April 25.
  Include a time (`2026-04-26T12:00:00`) or format in UTC explicitly.
- **Image field error "expected ImageMetadata, got string".** Schemas
  use Astro's `image()` helper, so values must resolve to a local file
  (`./photo.jpg` next to the markdown, or a path under `src/assets/`).
  Bare URLs don't satisfy `image()`. For remote images, either place a
  local copy or change the schema for that field to `z.string().url()`
  and update the consuming `.astro` page.
- **`Cannot find module 'astro:content'`.** Virtual module Astro
  generates from content collections. Run `npx astro sync` (or just
  `npm run dev` once) to regenerate `.astro/` types.
