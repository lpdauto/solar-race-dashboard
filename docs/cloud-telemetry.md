# Cloud Telemetry Integration

Cloud Telemetry lets the ESP32 send telemetry through a phone hotspot to the
hosted Solar Race Dashboard:

```text
ESP32 -> phone hotspot -> Vercel API -> Upstash Redis -> Dashboard
```

## Required Environment Variables

Set these in Vercel project environment variables:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
TELEMETRY_INGEST_TOKEN=
```

`UPSTASH_REDIS_REST_TOKEN` is only for server-side API routes. Do not put it in
ESP32 firmware or browser code.

## Upstash Redis Setup

Create an Upstash Redis database, then copy the REST URL and REST token into
Vercel as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Redis does not require SQL migrations. The app uses this key layout:

```text
latest:vehicle
latest:mppt
latest:spare-battery
history:vehicle
history:mppt
history:spare-battery
```

Each `latest:<node>` value stores:

```json
{
  "id": "vehicle",
  "node": "vehicle",
  "payload": {},
  "updated_at": "2026-06-06T23:00:00.000Z"
}
```

Each `history:<node>` Redis list is capped at the latest 1000 packets.

## ESP32 POST URL

Use the deployed Vercel app URL:

```text
https://YOUR-VERCEL-APP.vercel.app/api/telemetry/ingest
```

Required headers:

```text
Authorization: Bearer YOUR_TELEMETRY_INGEST_TOKEN
Content-Type: application/json
```

## JSON Examples

Raw vehicle packet. The API defaults `node` to `vehicle`:

```json
{
  "timestamp": 1770000000000,
  "speedMph": 24.8,
  "packVoltage": 78.4,
  "packCurrent": 42.5,
  "packSoc": 76,
  "packTempC": 32.6,
  "motorTempC": 58.4,
  "controllerTempC": 54.1,
  "motorRpm": 3720,
  "throttlePercent": 38,
  "mpptVoltage": 91.5,
  "mpptCurrent": 18.7,
  "mpptPowerWatts": 1711,
  "regenWatts": 0
}
```

Explicit multi-node packet:

```json
{
  "node": "vehicle",
  "payload": {
    "timestamp": 1770000000000,
    "speedMph": 24.8,
    "packVoltage": 78.4,
    "packCurrent": 42.5,
    "packSoc": 76
  }
}
```

Supported dashboard node names today:

- `vehicle`
- `mppt`
- `spare-battery`

Future nodes can still be stored by sending a custom `node` string.

## Test Without ESP32

Use the protected test endpoint to generate and store a simulated packet:

```bash
curl -X POST "https://YOUR-VERCEL-APP.vercel.app/api/telemetry/test" \
  -H "Authorization: Bearer YOUR_TELEMETRY_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"node\":\"vehicle\"}"
```

Then open the dashboard, select `Cloud Telemetry`, choose `Vehicle`, and click
`Start Cloud`.

## Health Check

Open:

```text
https://YOUR-VERCEL-APP.vercel.app/api/telemetry/health
```

Healthy response:

```json
{
  "ok": true,
  "redis": "connected",
  "latestVehiclePacketAgeSeconds": 0,
  "latestVehicleUpdatedAt": "2026-06-06T23:00:00.000Z",
  "latestVehicleNode": "vehicle"
}
```

## Race-Day Setup

1. Confirm Vercel env vars are set for production.
2. Confirm the Upstash Redis database exists and REST credentials are copied.
3. POST to `/api/telemetry/test` and verify the dashboard updates.
4. Connect the ESP32 to the phone hotspot.
5. Configure firmware to POST once per second to `/api/telemetry/ingest`.
6. Open the dashboard on any internet-connected phone.
7. Select `Cloud Telemetry` and `Vehicle`.
8. Watch the Cloud Telemetry Status panel.

## Stale Packet Indicators

- Under 5 seconds: healthy.
- 5 to 15 seconds: warning.
- Over 15 seconds: stale/disconnected.

## Troubleshooting

- `401 Unauthorized`: the ESP32 token does not match
  `TELEMETRY_INGEST_TOKEN`.
- `UPSTASH_REDIS_NOT_CONFIGURED`: Vercel is missing
  `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN`.
- `No telemetry found for this node`: no packet has been posted for the selected
  node yet.
- Stale packets: check phone hotspot internet, ESP32 Wi-Fi connection, Vercel
  deployment URL, and firmware POST interval.
- Dashboard connected but gauges are zero: confirm payload field names match
  `speedMph`, `packVoltage`, `packCurrent`, `packSoc`, and related ESP32 parser
  keys.
