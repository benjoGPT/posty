// Central app configuration. Everything region-specific lives here so the app
// itself is not tied to Shropshire: change `homeRegion` (and rebuild the data
// with the matching detail areas) to launch somewhere else.

export type Bounds = [[number, number], [number, number]]; // [[west, south], [east, north]]

export const APP_CONFIG = {
  name: 'Postcode Explorer',

  /** Where static postcode data is served from (output of `npm run data:build`). */
  dataBaseUrl: process.env.NEXT_PUBLIC_DATA_BASE_URL ?? '/data',

  /** Postcode lookup/autocomplete API (UK-wide). Used for search and for administrative details. */
  lookupApiUrl: process.env.NEXT_PUBLIC_LOOKUP_API_URL ?? 'https://api.postcodes.io',

  /** The region the map opens on and the Home button returns to. */
  homeRegion: {
    name: 'Shropshire',
    // Shropshire and Telford & Wrekin, with a little margin.
    bounds: [[-3.26, 52.3], [-2.2, 53.0]] as Bounds,
  },

  /** Whole United Kingdom, for the "View entire UK" control. */
  ukBounds: [[-8.3, 49.85], [1.9, 60.9]] as Bounds,

  /**
   * Basemap styles (MapLibre style JSON URLs). OpenFreeMap is free, needs no
   * API key and permits commercial use; data © OpenStreetMap contributors.
   * If a style can't be fetched the app falls back to a plain offline map.
   */
  basemaps: {
    light: process.env.NEXT_PUBLIC_BASEMAP_LIGHT ?? 'https://tiles.openfreemap.org/styles/positron',
    dark: process.env.NEXT_PUBLIC_BASEMAP_DARK ?? 'https://tiles.openfreemap.org/styles/dark',
  },
} as const;
