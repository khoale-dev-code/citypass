# CityPass v0.6.3 - map tile loading

- Default map tiles: OpenStreetMap (best effort). OpenStreetMap France HOT remains a fallback for evaluation only, subject to its use policy.
- No eager tile prefetch/offline archive. Browser cache rules remain intact.
- Raster requests update when the map becomes idle, not continuously during zoom. Small tile buffer reduces total live tile requests and browser memory.
- After a sustained stall or widespread tile errors, the component switches sources once. Manual retry/switch is available in the status panel.
- For public/high-traffic production, configure a dedicated permitted raster tile provider with its own capacity and SLA.

## Optional MapTiler provider

1. Create a MapTiler Cloud key at https://cloud.maptiler.com/account/keys/
2. Restrict the key to your CityPass site domain in MapTiler settings. This key is **public**, visible to website visitors; never place server-only secrets in a NEXT_PUBLIC variable.
3. Set NEXT_PUBLIC_CITYPASS_MAPTILER_KEY=... in .env.local; restart npm run dev.
4. CityPass then loads MapTiler Streets v4 512-pixel raster tiles first, followed by OpenStreetMap fallback. Source attribution stays visible. Provider subscription and quota rules apply.

## Diagnostic

If the map stays grey, open Chrome DevTools -> Network -> Img, examine tile requests for HTTP 403/429/5xx, then verify provider key/quota and DNS. A CSS change cannot repair an inaccessible external map server.
