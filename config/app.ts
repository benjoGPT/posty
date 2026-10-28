// Central app configuration. Everything region-specific lives here so the app
// itself is not tied to Shropshire: change `homeRegion` (and rebuild the data
// with the matching detail areas) to launch somewhere else.

export type Bounds = [[number, number], [number, number]]; // [[west, south], [east, north]]

export const APP_CONFIG = {
  name: 'Postcode Explorer',

  /** Where static postcode data is served from (output of `npm run data:build`). */
  dataBaseUrl: process.env.NEXT_PUBLIC_DATA_BASE_URL ?? (process.env.NEXT_PUBLIC_DATA_RELEASE ? `/data/releases/${process.env.NEXT_PUBLIC_DATA_RELEASE}` : '/data'),

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
   * `url: null` is the built-in minimal map (coastline only, works offline).
   * If a hosted style can't be fetched the app falls back to the minimal map.
   */
  basemaps: [
    { id: 'light', label: 'Light', theme: 'light', url: process.env.NEXT_PUBLIC_BASEMAP_LIGHT ?? 'https://tiles.openfreemap.org/styles/positron', swatch: ['#f2f3f0', '#d7dde4'] },
    { id: 'streets', label: 'Streets', theme: 'light', url: 'https://tiles.openfreemap.org/styles/liberty', swatch: ['#f8f4ec', '#f7c977'] },
    { id: 'bright', label: 'Bright', theme: 'light', url: 'https://tiles.openfreemap.org/styles/bright', swatch: ['#f6f0e3', '#9fd3a5'] },
    { id: 'dark', label: 'Dark', theme: 'dark', url: process.env.NEXT_PUBLIC_BASEMAP_DARK ?? 'https://tiles.openfreemap.org/styles/dark', swatch: ['#1b2232', '#3a4a66'] },
    { id: 'minimal', label: 'Minimal', theme: 'light', url: null, swatch: ['#f7f6f3', '#dfe7ef'] },
  ],
} as const;

export type BasemapId = (typeof APP_CONFIG.basemaps)[number]['id'];
export type Basemap = (typeof APP_CONFIG.basemaps)[number];
export const basemapById = (id: string): Basemap => APP_CONFIG.basemaps.find((b) => b.id === id) ?? APP_CONFIG.basemaps[0];
