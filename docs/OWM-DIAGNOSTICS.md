# CityPass OpenWeatherMap precipitation diagnostics

## Why the radar manifest may succeed while PNG tiles fail
The legacy `/api/v1/weather/radar` URL only advertised raster if `OPENWEATHER_API_KEY` existed. That did not verify activation, Maps 1.0 access, or network connectivity.

The v0.7.1 status API probes one safe, fixed tile around Ho Chi Minh City and caches the probe in the server for five minutes on success or one minute on failure. It never includes the API key in its JSON.

* `/api/v1/weather/precipitation/status` shows `code`, `upstream_http_status`, `available` and `message`.
* `/api/v1/weather/radar` returns an empty `frames` array when raster cannot be fetched so CityPass can paint **Open-Meteo modeled precipitation circles** instead.
* `401`: verify email, key activation (can take hours), and key validity.
* `403`: check plan entitlement for **Weather Maps 1.0**.
* `429`: provider rate limit; avoid frequent refresh, and monitor usage.
* `5xx`/timeout: upstream or connectivity issue.

Source: https://openweathermap.org/api/weathermaps

No raster availability should ever be interpreted as dry roads. Both Open-Meteo and Weather Maps 1.0 are modeled estimates, **not direct flooding observations**.
