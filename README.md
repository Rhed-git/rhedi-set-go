# RhediSetGo

Less time scrolling, more time rolling. RhediSetGo is a mountain biker's trail conditions app that gives you a single Go, Caution, or No-Go verdict for today and the next six days, so you can stop checking three weather apps before every ride.

## Status

Live at [rhedi-set-go.vercel.app](https://rhedi-set-go.vercel.app). Installable as a PWA on iPhone (Add to Home Screen from Safari).

## Tech stack

- React 19 with Vite
- Tailwind CSS v4
- Hosted on Vercel
- Weather data from Tomorrow.io (current conditions, hourly timeline) and Open-Meteo (7 day forecast, sunrise/sunset, UV, wind, US AQI)
- Browser Geolocation API for the user's coordinates

## Project structure

```
src/
  App.jsx                       Main component: state, effects, top-level layout
  index.css                     Tailwind theme + keyframe animations
  main.jsx                      React entry point

  lib/
    cache.js                    localStorage cache (lat/lon keyed, with TTLs)
    geo.js                      Shared geo helpers (US state abbreviations, Nominatim headers)
    verdictEngine.js            Pure Go/Caution/No-Go decision engine + user preferences
    weatherClient.js            Fetches Tomorrow.io and Open-Meteo, parses responses

  components/
    SplashScreen.jsx            Animated splash on first load
    BottomNav.jsx               Fixed bottom nav (4 icon buttons)
    Sheet.jsx                   Generic floating modal for nav targets
    LocationSearch.jsx          City/zip search via Nominatim
    TrailTipsIsland.jsx         Modal listing trail tips
    StatusDot.jsx               Verdict status indicator (check, bang, cross)
    icons.jsx                   Shared icons (PinIcon)
```

The `lib/` modules are pure (no React) and free of UI concerns. `App.jsx` owns React state and wires the modules into the render tree.

## Environment variables

Create a `.env.local` file at the project root:

```
VITE_TOMORROW_API_KEY=your_key_here
```

`VITE_TOMORROW_API_KEY` is a free API key from [Tomorrow.io](https://www.tomorrow.io/weather-api/). Sign up, create a project, copy the key. Without it, current conditions and hourly data will be empty (Open-Meteo data will still load).

## Local development

```bash
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). Vite picks the next free port if 5173 is taken.

Other scripts:

```bash
npm run build      # production build to dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint
```

## Deployment

Vercel auto-deploys from the `main` branch on GitHub. Every push to `main` triggers a build and deploy. The `VITE_TOMORROW_API_KEY` environment variable is configured in the Vercel project settings.

## Go/No-Go logic summary

The verdict engine looks at how much rain has actually fallen since midnight, when rain last stopped, and how long the trail still needs to dry (scaled by soil type). It checks for active precipitation, freezing temps, forecasted rain, and high humidity. For each of the next six days it carries over today's dryout time so a wet trail doesn't suddenly turn rideable just because tomorrow's forecast is clear. The result is a single Go, Caution, or No-Go verdict per day, with a plain language reason and three trail tips.
