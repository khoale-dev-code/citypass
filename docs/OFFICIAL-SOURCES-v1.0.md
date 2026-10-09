# CityPass official-source weather cross-check v1.0

A newly added panel beneath RoadLookup can compare weather **estimates** at the map center.

- Open-Meteo: `current.precipitation` and `current.weather_code`.
- OpenWeatherMap Current Weather API: `weather[0].id`, optional `rain.1h` (not the OpenWeatherMap precipitation tile service).
- Comparison is explicit about missing data, old reports, model disagreement, and 0 precipitation not proving roads safe.
- Request is only sent when the user clicks **So sánh hai nguồn mưa**. No extra map-drag API storm.
- API keys remain on the server.

Official-source links: NCHMF, VNDMS, HCMC civil defense/flood prevention, HCMC transport, and HCMC Facebook page. These are *reference links only*, NOT machine-integrated data feeds. The NCHMF RSS terms mention free personal/nonprofit usage; commercial redistribution requires rights confirmation. VNDMS has a terms-of-use link, and the other portals have no verified licensed public API in this work. Do not scrape hidden endpoints, invent sensor records, or claim traffic/flood warnings from these sites. No route-score change is made from these five references.

Endpoint: `GET /api/v1/weather/verify?lat=10.78&lng=106.69`.

Configuration: `OPENWEATHER_API_KEY` already used by CityPass (no new key).

Follow-up to improve *actual* street-level accuracy: obtain authorized station observations with lat/lng, timestamps, rainfall units and QA flags; build a dedicated ingestor, data freshness filters, and validated spatial matching to each candidate route. Do not use manual links as automatic warnings.
