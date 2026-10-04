# Field Apps

Two lightweight, mobile-first web apps for field/factory reporting. Each app is a
self-contained static site (no build step, no backend) that stores data in the
browser's `localStorage`.

## Apps

### `road-report/` - RoadWatch
Report broken road surfaces with a photo, auto GPS location, and severity.

- Camera capture (rear camera on mobile), auto-compressed
- One-tap GPS with accuracy readout
- Severity: Low / Medium / High
- Color-coded markers on a Leaflet map + list view
- Export JSON, clear all

### `civil-requests/` - CivilDesk
Raise factory civil work requirements with a photo, location, and priority.

- Camera capture (rear camera on mobile), auto-compressed
- Location both ways: typed site location and/or GPS button
- Work category, priority (Low / Medium / High), description, requester
- Status tracker: Open -> In progress -> Done, with filters
- Leaflet map (GPS-tagged only) + list view
- Export JSON, clear all

## Run locally

Serve the folder over HTTP (geolocation requires `localhost` or HTTPS, not `file://`):

```
npx --yes serve .
```

Then open:

- http://localhost:3000/road-report/
- http://localhost:3000/civil-requests/

To use on a phone on the same Wi-Fi, replace `localhost` with your machine's LAN IP.

## Tech

- Plain HTML, CSS, and JavaScript (no framework, no bundler)
- [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles for maps
- Browser APIs: Geolocation, camera via file input `capture`, Canvas for image compression

## Notes

- Data is stored per-device in `localStorage`; there is no shared backend.
- Map tiles require an internet connection.
