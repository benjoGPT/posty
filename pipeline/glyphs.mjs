// Builds MapLibre glyph PBFs for the label fonts used by the postcode layers,
// so labels still render when the basemap host is unreachable.
// Output: public/fonts/<fontstack>/<range>.pbf   Run: npm run data:glyphs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateGlyphPbfFiles, range256 } from 'maplibre-font-maker-node';

const require = createRequire(import.meta.url);
const OUT = path.resolve('public/fonts');
const files = (subset, weight) =>
  fs.readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-normal.woff2`));

// Names match the font stacks published by OpenFreeMap, so the same layer
// definitions work against either glyph server.
const stacks = [
  { fontstack: 'Noto Sans Regular', weight: 400 },
  { fontstack: 'Noto Sans Bold', weight: 700 },
];

for (const { fontstack, weight } of stacks) {
  const out = await generateGlyphPbfFiles({
    fontstack,
    fonts: [
      { name: `${fontstack} latin`, bytes: files('latin', weight) },
      { name: `${fontstack} latin-ext`, bytes: files('latin-ext', weight) },
    ],
    // Basic Latin + Latin-1, Latin Extended-A/B, Latin Extended Additional
    // (Welsh ẁ ẃ ẅ ỳ) and general punctuation.
    ranges: [0, 256, 7680, 8192].map(range256),
  });
  for (const f of out) {
    const p = path.join(OUT, f.filename);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.bytes);
  }
  console.log(`${fontstack}: ${out.length} ranges`);
}
