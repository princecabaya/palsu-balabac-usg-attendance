window.BURUNGITAW_CONFIG = Object.freeze({
  supabaseUrl: "https://edfcehmttcwhhknywflq.supabase.co",
  supabasePublishableKey: "sb_publishable_XDI9PRlXfmA31Os3lQtthA_-gqwNXFI",
  eventSlug: "burungitaw-2026",

  // Migration mode:
  // - "direct": original phone-to-Laptop-A WebRTC
  // - "cloudflare_sfu": Cloudflare Realtime SFU through the Worker
  // - "auto": use Cloudflare when cloudflareWorkerBase is configured, otherwise direct
  mediaTransport: "auto",

  // Set this to the deployed Worker origin, for example:
  // "https://burungitaw-live.<your-subdomain>.workers.dev"
  cloudflareWorkerBase: "https://burungitaw-live.princejobetrohcabayacruz.workers.dev",

  // Used only by the direct fallback transport.
  rtcIceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
});