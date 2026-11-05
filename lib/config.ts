/**
 * Schedule data source (all Kyiv groups).
 */
export const SOURCE_URL =
  'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages'

/** Server-side cache of the schedule data (seconds). */
export const REVALIDATE_S = 120

/** How long the last published schedule of a day is kept for emergencies (seconds). */
export const SNAPSHOT_TTL_S = 3 * 86400

/** How often an open page re-fetches from the server (ms). */
export const CLIENT_REFRESH_MS = 3 * 60 * 1000

export const TIME_ZONE = 'Europe/Kyiv'
