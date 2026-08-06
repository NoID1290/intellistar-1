# Prompt for AI Coding Assistant — IntelliStar-1 Canadianization + OSM + IPTV

Copy everything below into your coding AI (Claude Code, Cursor, etc.) once it has the repo open.

---

I'm working on a local clone of **IntelliStar-1** (MistWeatherMedia/intellistar-1), a Weather Channel "Local on the 8s" simulator built in HTML/CSS/JS with a Node.js dev server (`webroot/` is the app, `webroot/js/config.js` holds API keys). I need three major features implemented. Please read through the existing codebase first (especially `webroot/js/config.js`, the radar/map module, and `app.js`) before making changes, and tell me what you find before touching anything.

## 1. Full Canadian compatibility

- Add support for **Canadian locations**: postal code lookup (in addition to/instead of US ZIP), province/territory selection instead of US states, and city/town search that works with Canadian geocoding (e.g. Geocoder.ca, Nominatim/OSM, or Environment Canada's location list — pick whichever is free and reliable).
- Switch (or add a toggle for) **metric units** — °C, km/h, kPa/mb, mm — as the default when a Canadian location is selected.
- Replace/augment the US NWS weather data source with **Environment and Climate Change Canada (ECCC)** data:
  - Current conditions and forecasts from ECCC's public XML/CAP feeds (`dd.weather.gc.ca`) or the MSC GeoMet API.
  - Canadian radar imagery from ECCC (GeoMet WMS/radar mosaic) instead of (or alongside) NOAA radar, since the existing radar layer needs to reflect Canadian coverage.
- Implement **Alert Ready** support — this is the crucial government-alert piece:
  - Canadian emergency alerts are distributed as **CAP (Common Alerting Protocol)** messages via **NAAD (National Alert Aggregation & Dissemination system)**. Pull the live NAAD CAP feed and parse it the same way the app currently parses NOAA/NWS CAP alerts.
  - Match alerts to the user's selected province/region the same way US alerts are matched to state/county, and trigger the same on-air alert interrupt/crawl behavior (tone, full-screen alert graphic, crawl text) that the sim already does for US alerts — model it after Alert Ready's real broadcast behavior (attention tone, bilingual EN/FR text where the source provides it).
  - Handle the fact that some Alert Ready alerts are French-only or bilingual — don't assume English-only strings.
- Make the location config support both US and Canadian formats cleanly (don't hardcode US-only assumptions like ZIP-based lookups or state-only dropdowns).

## 2. Replace Mapbox with OpenStreetMap

- Remove the Mapbox GL JS dependency and the Mapbox API key requirement from `config.js` and the install docs.
- Replace it with **MapLibre GL JS + OpenStreetMap raster/vector tiles** (or Leaflet + OSM tiles if that's a simpler fit for how the radar layer is composited) — both are free and require no API key/token.
- Keep the existing radar overlay compositing logic working on top of the new base map — the underlying map is just the base layer; the animated radar tiles still need to render over it.
- **No traffic layer** — don't add or port any traffic data feature, this app doesn't need it.
- Update `README.md`'s setup instructions to remove the "acquire a mapbox.com API key" step since it's no longer needed.

## 3. Live IPTV output via FFmpeg

- The app currently renders in a browser as a local simulation. I need it to produce a **live streaming output suitable for IPTV** (i.e., a continuous encoded stream, not just an on-screen sim).
- Set up a pipeline that:
  1. Runs the existing web app headlessly (e.g., headless Chromium via Puppeteer/Playwright, or an Electron kiosk window) at a fixed resolution/frame rate.
  2. Captures that rendered output (screen/window capture, or a virtual display via Xvfb on Linux) and pipes it into **FFmpeg**.
  3. FFmpeg encodes it into a live stream suitable for IPTV distribution — output as an **HLS stream** (`.m3u8` + segments) and/or an **RTMP/UDP/MPEG-TS** stream, whichever fits a typical IPTV playout setup better. Ask me which target format I need if it's not obvious from context, since IPTV middleware varies (multicast UDP is common for closed IPTV networks, HLS/RTMP for most others).
  4. Include audio in the pipeline if/when the sim has any audio (alert tones, music bed) — mux it into the same output.
- Provide a start/stop script (matching the existing `start.sh`/`start.bat` pattern in the repo) that launches the headless renderer + FFmpeg pipeline together, and make the encoding settings (resolution, bitrate, framerate, output URL/path) configurable, ideally in `config.js` or a new `stream-config.js`.
- Keep this modular — the browser sim itself shouldn't need to know it's being captured; the capture/encode pipeline should be a separate process/script layered on top.

## Process

Please work through these three features **one at a time**, in the order above, and after each one:

- Summarize what you changed and why.
- Note any new dependencies added and how to install them.
- Flag anything that needs a decision from me (e.g., HLS vs RTMP vs UDP for the IPTV output, which Canadian geocoding source to use, bilingual alert text handling).

Don't touch anything unrelated to these three features.
