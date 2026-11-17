# Burungitaw Live Cloudflare Worker

This Worker keeps Cloudflare Realtime SFU credentials off the public site.

## Required secrets / vars

- `SFU_APP_ID` — Cloudflare Realtime SFU application ID.
- `SFU_APP_SECRET` — Cloudflare Realtime SFU app secret. Store with `wrangler secret put SFU_APP_SECRET`.
- `ALLOWED_ORIGIN` — the Cloudflare Pages production origin.

## Deploy

1. Create a Cloudflare Realtime SFU application in the Cloudflare dashboard.
2. In this directory run `npm install`.
3. Set `SFU_APP_ID` as a Worker variable.
4. Run `npx wrangler secret put SFU_APP_SECRET`.
5. Set `ALLOWED_ORIGIN` to the Pages URL.
6. Run `npm run deploy`.

The browser never receives the SFU App Secret.
