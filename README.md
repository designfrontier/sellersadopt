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
                          Browser |  /admin/
                                  v
                       +---------------------+
                       |  Sveltia CMS        |
                       |  (static SPA at     |
                       |   /admin/)          |
                       +----+-----------+----+
                            |           |
              OAuth handshake|          | commits markdown + images
                            v           v
               +-----------------+   +---------------------+
               |  Auth Worker    |   |  GitHub repo        |
               |  (Cloudflare)   |   |  designfrontier/    |
               |  auth.sellers-  |   |  adoption           |
               |  adopt.com      |   +----------+----------+
               +--------+--------+              |
                        |             push to   | main triggers
                        v                       v
               +-----------------+    +----------------------+
               |  GitHub OAuth   |    |  GitHub Pages build  |
               |  App            |    |  (Astro static)      |
               +-----------------+    +----------+-----------+
                                                 |
                                                 v
                                      +----------------------+
                                      |  sellersadopt.com    |
                                      |  (live static site)  |
                                      +----------------------+
```

In words: editors visit `/admin/`, log in via GitHub (OAuth handled by our
auth Worker on Cloudflare), edit markdown that lives in this repo, and click
Publish. Sveltia commits straight to `main`, including any uploaded image
binaries, which are written next to the markdown that references them. The
GitHub Pages workflow rebuilds Astro on every push to `main` and the change
is live in about a minute. There is no external media bucket and no separate
upload service — images are part of the repo.

## Repo layout

```
adoption/
├── site/                     # Astro 6 static site (Tailwind v4)
│   ├── src/
│   │   ├── content/          # Markdown content collections (pages, family,
│   │   │                       gallery, blog) — what editors edit. Image
│   │   │                       uploads land in `<collection>/images/`.
│   │   ├── content.config.ts # Zod schemas for the four collections
│   │   ├── layouts/          # Shared Astro layouts
│   │   ├── pages/            # Route-mapped .astro pages
│   │   └── styles/           # Tailwind entry + globals
│   └── public/
│       ├── admin/            # Sveltia CMS (config.yml, index.html)
│       └── CNAME             # Custom-domain marker for GitHub Pages
├── workers/
│   └── auth/                 # Cloudflare Worker: GitHub OAuth for the CMS
├── .github/workflows/        # CI: deploy-site (Pages), deploy-workers (auth)
├── README.md                 # this file
├── SETUP.md                  # one-time finalize-and-go-live checklist
├── CMS-GUIDE.md              # day-to-day editor guide (Daniel + Katie)
└── ADOPTION_PLAN.md          # the family's strategy doc (private)
```

## Status

Built; pending finalize steps. The site, the CMS config, and the auth Worker
are implemented and tested. What remains is the one-time provisioning work
in [SETUP.md](./SETUP.md) — DNS, GitHub OAuth app, the auth Worker's secrets
and custom domain, and CI secrets.

## Documentation

- **[SETUP.md](./SETUP.md)** — one-time finalize checklist. Daniel walks
  through this once to take a fresh clone to a live production site.
- **[CMS-GUIDE.md](./CMS-GUIDE.md)** — daily editor guide. For Katie and
  for any future editor who shouldn't have to read code.
- **[site/README.md](./site/README.md)** — local dev guide for the Astro
  site (run, build, add content programmatically, extend collections).
- **[site/public/admin/README.md](./site/public/admin/README.md)** —
  Sveltia CMS config, in-repo media model, and how to add a new collection.
- **[workers/auth/README.md](./workers/auth/README.md)** — auth Worker
  reference (OAuth flow, secrets, local dev).

## Privacy

This is a private family repo. Please do not link to or share our
children's photos, full names, or other identifying details outside the
family network. The site itself is intentionally public — this README is
not the place for sensitive content.
