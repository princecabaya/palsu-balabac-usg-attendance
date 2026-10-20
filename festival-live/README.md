# Burungitaw Festival Live

Sister utility inside the existing PSU Balabac USG site.

## Interfaces
- `camera.html` — phone camera client; each new device gets the next camera number.
- `judge.html` — authenticated judge scoring with whole-number direct entry, local draft fallback, submit-and-lock.
- `control.html` — Laptop A production switcher, Laptop A microphone master audio, camera A/V delay adjustment, score reveal, score reopening.
- `program.html` — Laptop B clean program output; double-click for fullscreen.

## Event model
Current seeded event: **Mr. and Ms. Burungitaw Festival 2026** (`burungitaw-2026`).

The database contains 6 pairs, 7 official segments, 28 criteria, and 14 male/female minor-award records. Candidate names/photos and judge accounts are intentionally not fabricated and must be added when supplied.

## Scoring rules
Five judges score all segments. Each criterion accepts whole numbers only. A candidate's segment result is the arithmetic mean of the five judge totals. Public reveal is blocked until all five judges have submitted. Submitted sheets lock. An administrator may reopen a sheet with a mandatory reason; this is audit logged.

## Live production
Camera video is WebRTC. Supabase Realtime carries signaling/control messages. Laptop A microphone is the master audio source. Laptop A relays the selected camera through a canvas plus the delayed master microphone to Laptop B.

Current RTC configuration is STUN-only. For dependable mixed Wi-Fi/mobile-data operation, add a TURN service or SFU before the live event.

## Reuse
The schema is event-based, so future Burungitaw editions can be added without rebuilding the application.
