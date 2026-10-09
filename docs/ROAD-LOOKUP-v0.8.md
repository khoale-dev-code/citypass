# CityPass v0.8 — Street inspection

## Scope

Use the top search bar to search a named street or intersection in Ho Chi Minh City, choose a matching result, select traffic / rain / flood / nearby cameras, and inspect independent signals near one representative point. The results are **not** a guarantee that a full road is safe or dry. Two identically named street results may refer to different points; user must choose the appropriate district/segment.

## API integration

- `GET /api/v1/roads/search?q=Hai%20B%C3%A0%20Tr%C6%B0ng` uses TomTom Search v2 Fuzzy Search. Requires `TOMTOM_API_KEY`, held on server. Candidate results are limited to HCMC coordinate bounds and cached for ten minutes in-process.
- `GET /api/v1/roads/inspect?lat=10.77&lng=106.69&checks=traffic,rain,flood,camera` runs independent signal checks:
  - TomTom Traffic Flow Segment API, sampled at the nearest road segment, not averaged across the street. Provider traffic readings describe a road segment, not specifically a motorcycle ETA.
  - Open-Meteo `current.precipitation` and `current.cloud_cover`, modeled / estimated weather, not confirmed rain at street level. Zero modeled rain does **not** mean a dry road.
  - Supabase nearby incidents (600 m radius); simulated data is never used. No matching verified report does **not** confirm no flooding.
  - Public camera catalog within 1 km. Lists up to three cameras. No automatic image analysis is done; images may be stale or inaccessible.

Only selected checks are queried. Providers can fail individually without blocking all others. API returns source and observation timestamp where available. Never mark a road safe based on missing data.

## Operating cautions

- TomTom Search and Traffic APIs may require separate product permissions; see `https://docs.tomtom.com/search-api/documentation/search-service/fuzzy-search` and `https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data`.
- Do not publish `TOMTOM_API_KEY`, `OPENWEATHER_API_KEY` or Supabase service credentials to browser variables.
- Before exposing to many users, implement centralized rate limiting, provider quota monitoring, distributed search caching and abuse protection.
- Snapshot cameras should not be interpreted by AI or human reviewers as certified real-time flood measurements.
