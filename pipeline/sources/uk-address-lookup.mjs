// DEVELOPMENT-ONLY adapter for the third-party npm package `uk-address-lookup`
// (v0.1.0), which states that it bundles ONSPD February 2026 under the OGL.
// The package has an anonymous publisher and no source repository, so its
// provenance cannot be verified. Builds made from it are flagged
// `verified: false` and the app shows that in its data notice. Use the
// official ONSPD adapter for anything you publish.
//
// The bundle is read as data only; none of the package's code is executed.
import fs from 'node:fs';
import zlib from 'node:zlib';

export const id = 'uk-address-lookup';

export async function load({ input, onRecord }) {
  if (!input) throw new Error('uk-address-lookup source needs --input <path to data/uk-address.json.gz>');
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(input)).toString('utf8'));
  const stats = { rows: 0, terminated: 0, noLocation: 0 };
  for (const [pc, lat, lng] of raw.postcodes) {
    stats.rows++;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat > 90) { stats.noLocation++; continue; }
    onRecord(pc, lat, lng, { quality: null, country: null });
  }
  return {
    stats,
    meta: {
      id,
      name: 'ONS Postcode Directory (ONSPD), via unverified npm repackage',
      release: 'ONSPD February 2026 (as stated by uk-address-lookup 0.1.0)',
      url: 'https://www.npmjs.com/package/uk-address-lookup',
      licence: 'Open Government Licence v3.0 (as stated by the repackager)',
      attribution: [
        'Source: Office for National Statistics licensed under the Open Government Licence v.3.0',
        'Contains OS data © Crown copyright and database right',
        'Contains Royal Mail data © Royal Mail copyright and database right',
      ],
      verified: false,
      warning: 'Postcode records come from a third-party repackage of ONSPD whose provenance has not been verified. Rebuild from the official ONSPD release before relying on this data.',
    },
  };
}
