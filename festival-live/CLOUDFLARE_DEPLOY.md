# Cloudflare deployment

## Pages

Create a Cloudflare Pages project from `princecabaya/palsu-balabac-usg-attendance`.

Recommended settings:

- Production branch: `main`
- Root directory: `festival-live`
- Build command: leave blank
- Build output directory: `.`

Pages can use the same GitHub repository while deploying only the Festival Live subdirectory.

## Realtime SFU

Create a Realtime SFU application. Put the App ID and App Secret only in the Worker environment.

The browser talks to the Worker. The Worker talks to Cloudflare Realtime at `https://rtc.live.cloudflare.com/v1`.

## Supabase

Supabase remains the source of truth for:
- authentication
- candidates
- judges
- scoring
- minor awards
- audit history

Do not migrate official scoring records to D1 for this version.
