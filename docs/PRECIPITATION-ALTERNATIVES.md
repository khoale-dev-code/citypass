# CityPass rainfall data alternatives

The RainViewer API is not called by CityPass after v0.7.

- **Default (no key):** Open-Meteo's existing 22 sampled locations in HCMC, as modeled/interpolated precipitation. The map displays *approximate colored circles around those sampling locations*. It is neither radar nor direct surface rain observation; no rain-colored circle **never** implies dry roads.
- **Optional:** OpenWeatherMap Weather Maps 1.0 precipitation_new raster tiles. Obtain a key at https://home.openweathermap.org/api_keys and add OPENWEATHER_API_KEY=... to .env.local (server-side only). Restart Next.js. The raster is an estimated rain/precipitation overlay, not pure meteorological radar. Verify account entitlement and terms.
- **Safety:** do not use either layer as proof of no road flooding. Traffic routing estimates do not imply safe motorbike passage.
- **API:** /api/v1/weather/radar returns the current tile source selection; /api/v1/weather/precipitation/tiles/[z]/[x]/[y] proxies OpenWeatherMap when configured with limited zoom and caching. The legacy radar route name is retained for backward compatibility.

Open-Meteo's 15-minute data are *interpolated from hourly* in Vietnam; they are not local weather station measurements.
