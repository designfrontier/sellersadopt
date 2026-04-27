# Sellers Adopt

The Sellers family's private adoption website and content management system,
hosted at <https://sellersadopt.com>. The site is a small, fast, mobile-first
Astro site that doubles as our adoption profile — it's where expectant
parents, friends, family, and our wider network can meet us. The CMS at
`/admin/` lets Daniel and Katie keep it up to date without touching code.

## Architecture

```
                   +------------------------------+
                   |  Editors (Daniel & Katie)    |
                   +--------------+---------------+
                                  |
                  Browser         |        Browser
                  (logs in)       |        (uploads)
                                  v
   +-----------------+   /admin/  |   +--------------------------+
   |  Sveltia CMS    |<-----------+-->|  Cloudflare R2 bucket    |
   |  (static SPA at |   commits  |   |  sellersadopt-uploads    |
   |   /admin/)      |   markdown |   |  (S3-compatible API)     |
   +--------+--------+            |   +-------------+------------+
            |                     |                 |
            | OAuth handshake     |                 | served via
            v                     |                 | uploads.sellersadopt.com
   +-----------------+            |                 |
   |  Auth Worker    |            |                 v
   |  (Cloudflare)   |            |        +------------------+
   |  auth.sellers-  |            |        |  Public image    |
   |  adopt.com      |            |        |  CDN (R2 custom  |
   +--------+--------+            |        |  domain)         |
            |                     |        +------------------+
            v                     v
   +-----------------+    +---------------------+
   |  GitHub OAuth   |    |  GitHub repo        |
   |  App            |    |  designfrontier/    |
   +-----------------+    |  adoption           |
                          +----------+----------+
                                     |
                       push to main  |  webhook
                                     v
                          +----------------------+
                          |  Cloudflare Pages    |
                          |  (Astro build)       |
                          +----------+-----------+
                                     |
                                     v
                          +----------------------+
                          |  sellersadopt.com    |
                          |  (live static site)  |
                          +----------------------+
```

In words: editors visit `/admin/`, log in via GitHub (OAuth handled by our
auth Worker), edit markdown that lives in this repo, and click Publish.
Sveltia commits straight to `main`. Cloudflare Pages rebuilds on push and
the change is live in about a minute. Image uploads go straight from the
editor's browser to a Cloudflare R2 bucket using Sveltia's native R2
backend, then are served from `uploads.sellersadopt.com`.

## Repo layout

```
adoption/
├── site/                     # Astro 6 static site (Tailwind v4)
│   ├── src/
│   │   ├── content/          # Markdown content collections (pages, family,
│   │   │                       gallery, blog) — what editors edit
│   │   ├── content.config.ts # Zod schemas for the four collections
│   │   ├── layouts/          # Shared Astro layouts
│   │   ├── pages/            # Route-mapped .astro pages
│   │   └── styles/           # Tailwind entry + globals
│   └── public/admin/         # Sveltia CMS (config.yml, index.html)
├── workers/
│   ├── auth/                 # Cloudflare Worker: GitHub OAuth for the CMS
│   └── uploads/              # Cloudflare Worker: presigned R2 PUTs
│                               (currently UNUSED — kept as scaffolding)
├── .github/workflows/        # CI: deploys Workers on push to main
├── README.md                 # this file
├── SETUP.md                  # one-time Cloudflare + GitHub setup
├── CMS-GUIDE.md              # day-to-day editor guide (Daniel + Katie)
└── ADOPTION_PLAN.md          # the family's strategy doc (private)
```

## Status

Built; pending Cloudflare setup (see [SETUP.md](./SETUP.md)).

The site, the CMS config, and both Workers are implemented and tested.
What remains is provisioning the Cloudflare account (R2 bucket, Pages
project, Worker custom domains, GitHub OAuth app, secrets) so the
production system actually runs.

## Documentation

- **[SETUP.md](./SETUP.md)** — one-time setup. Daniel walks through this
  once to wire up Cloudflare, GitHub, and the CMS.
- **[CMS-GUIDE.md](./CMS-GUIDE.md)** — daily editor guide. For Katie and
  for any future editor who shouldn't have to read code.
- **[site/README.md](./site/README.md)** — local dev guide for the Astro
  site (run, build, add content programmatically, extend collections).
- **[workers/auth/README.md](./workers/auth/README.md)** — auth Worker
  reference (OAuth flow, secrets, local dev).
- **[workers/uploads/README.md](./workers/uploads/README.md)** — uploads
  Worker reference (currently unused; kept for future backend-presign
  flow).

## Privacy

This is a private family repo. Please do not link to or share our
children's photos, full names, or other identifying details outside the
family network. The site itself is intentionally public — this README is
not the place for sensitive content.
