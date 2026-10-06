# Zermatt Summit

A simple, modern static version of the public Zermatt Summit website, captured on 6 October 2026. The editorial content is preserved in English and French. Original page addresses are retained, with local images and documents where the source files are available.

The site uses TypeScript for importing content and generating pages, plain HTML/CSS for the interface, and a small JavaScript file for directory search and form messages. It needs no WordPress installation, database, framework runtime, or PHP server.

## Run locally

Install Node.js 22 or newer and pnpm, then:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm dev
```

Open <http://localhost:8787>. `pnpm dev` uses Cloudflare's local runtime, so routing and headers can be checked before deployment.

## Edit the website

- `content/pages.json`: imported editorial text, semantic HTML, images, dates, translations, and categories. This is the editable content source; normal builds use this file and never contact the original website.
- `public/wp-content/uploads/`: the downloaded images and documents. Their existing public paths are retained.
- `scripts/templates.ts`: homepage, shared navigation/footer, news and speaker directories.
- `src/site.css`: responsive styles.
- `src/site.js`: local directory search and form status messages.
- `scripts/build.ts`: produces `dist/`, the deployable website.

`pnpm build` is deterministic and works without the original WordPress site. `pnpm check` checks TypeScript, editorial text preservation, local links and assets, page headings, and Cloudflare asset size/count limits.

## Cloudflare Workers

Workers Static Assets is the default deployment target. The root `wrangler.jsonc` serves `dist/` with directory-index routing and a real 404 page.

When ready to publish, authenticate with Cloudflare and run:

```sh
pnpm exec wrangler login
pnpm deploy:workers
```

Add `www.zermattsummit.org` as a custom domain after the domain transfer. Configure the apex `zermattsummit.org` to redirect to the existing canonical `www` hostname. No domain or DNS changes have been made by this project.

## Cloudflare Pages

The same `dist/` output also works on Pages. Create a Pages project named `zermatt-summit`, then authenticate and deploy:

```sh
pnpm deploy:pages
```

This command explicitly selects `wrangler.pages.jsonc`. For a Git-connected Pages project, use `pnpm build` as the build command and `dist` as the output directory. The Workers configuration is separate; do not use it as the Pages configuration.

See the official [Workers Static Assets documentation](https://developers.cloudflare.com/workers/static-assets/) and [Pages deployment documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Content coverage and remaining migration work

The imported content includes summit programmes and archives, 255 speaker profiles in each language, 80 articles in each language, foundation information, projects, declarations, and contact information. WordPress taxonomy pages are replaced with small static directories. Old test pages and duplicate/obsolete homepage variants are omitted. Known legacy speaker URLs redirect to their current profiles.

Some images and documents are already missing from the source website. `reports/source-unavailable-media.json` records these paths. Missing images are omitted or replaced with an available rendition; unavailable document links are visibly disabled. These files cannot be recovered from the public website and would need the original WordPress media backup.

Contact, newsletter, signature, and registration forms do **not** submit yet. They show an explicit unavailable message and do not claim success. A later Cloudflare Worker can validate submissions and send them to a chosen email or newsletter provider. No submissions are stored, and the old site's CAPTCHA keys, analytics, and WordPress endpoints are not used.

Video links remain available on the original external video platforms. There is no payment, registration, newsletter, or email backend in this first step.

## Capture provenance

The one-time capture cache under `source/` is kept locally and excluded from Git. It is unnecessary for building or deploying the website. `reports/content-index.json`, `reports/build.json`, and `reports/verification.json` record the imported routes and verification results.

To deliberately import a new public-site snapshot while the original site still exists:

```sh
pnpm capture
pnpm import-content
pnpm build
pnpm check
```

The capture command resumes cached downloads. To refresh an existing page, delete its corresponding cached file under `source/pages/` before capturing again. The default page crawl uses one request at a time and a ten-second delay. Importing overwrites `content/pages.json`, so preserve any manual content edits first. After importing, copy newly downloaded media from `dist/wp-content/uploads/` into `public/wp-content/uploads/`.
