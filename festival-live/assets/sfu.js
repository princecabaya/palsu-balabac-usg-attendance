(() => {
  const cfg = window.BURUNGITAW_CONFIG;

  async function waitForIce(pc, timeout = 5000) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      const done = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          pc.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", done);
    });
  }

  async function api(path, init = {}) {
    const base = (cfg.cloudflareWorkerBase || "").replace(/\/$/, "");
    if (!base) throw new Error("Cloudflare Worker URL is not configured.");
    const r = await fetch(base + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || ("Cloudflare request failed: " + r.status));
    return body;
  }

  function enabled() {
    if (cfg.mediaTransport === "cloudflare_sfu") return true;
    if (cfg.mediaTransport === "direct") return false;
    return Boolean(cfg.cloudflareWorkerBase);
  }

  async function publishVideo(track, trackName) {
    const pc = new RTCPeerConnection();
    const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);

    const created = await api("/api/sfu/session", { method: "POST" });
    const sessionId = created.sessionId;
    if (!sessionId) throw new Error("Cloudflare did not return a session ID.");

    const pub = await api("/api/sfu/session/" + encodeURIComponent(sessionId) + "/tracks", {
      method: "POST",
      body: JSON.stringify({
        sessionDescription: pc.localDescription,
        tracks: [{
          location: "local",
          mid: transceiver.mid,
          trackName
        }]
      })
    });

    if (!pub.sessionDescription) throw new Error("Cloudflare did not return a session answer.");
    await pc.setRemoteDescription(pub.sessionDescription);
    return { pc, sessionId, trackName, response: pub };
  }

  async function subscribeVideo(publisherSessionId, trackName, onTrack) {
    const pc = new RTCPeerConnection();
    pc.ontrack = e => onTrack?.(e.track, e);

    const created = await api("/api/sfu/session", { method: "POST" });
    const subscriberSessionId = created.sessionId;
    if (!subscriberSessionId) throw new Error("Cloudflare did not return a subscriber session ID.");

    const sub = await api("/api/sfu/session/" + encodeURIComponent(subscriberSessionId) + "/tracks", {
      method: "POST",
      body: JSON.stringify({
        tracks: [{
          location: "remote",
          sessionId: publisherSessionId,
          trackName
        }]
      })
    });

    if (!sub.sessionDescription) throw new Error("Cloudflare did not return a subscription offer.");
    await pc.setRemoteDescription(sub.sessionDescription);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);

    await api("/api/sfu/session/" + encodeURIComponent(subscriberSessionId) + "/renegotiate", {
      method: "PUT",
      body: JSON.stringify({ sessionDescription: pc.localDescription })
    });

    return { pc, sessionId: subscriberSessionId, response: sub };
  }

  window.BuruSFU = { enabled, api, waitForIce, publishVideo, subscribeVideo };
})();