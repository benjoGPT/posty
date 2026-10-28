'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_CONFIG } from '@/config/app';
import type { Manifest } from '@/lib/data';
import { AlertIcon, CloseIcon } from './Icons';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-3.5 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{title}</h3>
      <div className="space-y-1.5 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

interface CrossCheck {
  generated: string;
  seed?: { live: number; liveFound: number; identical: number; terminated: number; terminatedAbsent: number; seedNewestIntroduction: string };
  dwyl?: Record<string, { both: number; medianM: number; p95M: number; over100m: number }>;
  wiki?: Record<string, { pointsInOwnOurs: number; pointsInOwnWikipedia: number; landAgreement: number }>;
}

const pc = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

function CrossCheckBlock({ c }: { c: CrossCheck }) {
  const local = Object.entries(c.dwyl ?? {}).filter(([k]) => k !== 'Rest of GB');
  const both = local.reduce((s, [, v]) => s + v.both, 0);
  const over = local.reduce((s, [, v]) => s + v.over100m, 0);
  const wiki = Object.values(c.wiki ?? {});
  return (
    <Block title="Independent accuracy checks">
      <p>Checked {c.generated} against sources that weren’t used to build the map:</p>
      <ul className="list-disc space-y-1 pl-5 text-[12.5px]">
        {c.seed && (
          <li>
            <strong className="font-medium text-ink">Official ONSPD rows</strong> (postcodes.io database sample, {c.seed.seedNewestIntroduction.slice(0, 4)}): {pc(c.seed.liveFound, c.seed.live)} of {c.seed.live.toLocaleString()} live postcodes present, {pc(c.seed.identical, c.seed.liveFound)} at the identical position; {pc(c.seed.terminatedAbsent, c.seed.terminated)} of terminated postcodes correctly absent. The few differences are postcodes created or retired after this map’s release.
          </li>
        )}
        {both > 0 && (
          <li>
            <strong className="font-medium text-ink">Independent 2017 coordinate list</strong>: {both.toLocaleString()} postcodes compared in the detail areas; {pc(both - over, both)} within 100 m (typical difference 2–3 m). Larger differences are mostly postcodes repositioned by ONS since 2017.
          </li>
        )}
        {wiki.length > 0 && (
          <li>
            <strong className="font-medium text-ink">Wikipedia district outlines</strong>: the two sets of district boundaries agree on {Math.min(...wiki.map((w) => w.landAgreement)).toFixed(1)}–{Math.max(...wiki.map((w) => w.landAgreement)).toFixed(1)}% of the land.
          </li>
        )}
      </ul>
    </Block>
  );
}

export function AboutDialog({ open, onClose, manifest }: { open: boolean; onClose: () => void; manifest: Manifest | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [check, setCheck] = useState<CrossCheck | null>(null);
  const [places, setPlaces] = useState<{ source: string; counts: Record<string, number>; attribution: string; notes: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!open || check) return;
    fetch(`${APP_CONFIG.dataBaseUrl}/crosscheck.json`).then((r) => (r.ok ? r.json() : null)).then(setCheck, () => {});
    fetch(`${APP_CONFIG.dataBaseUrl}/places/meta.json`).then((r) => (r.ok ? r.json() : null)).then(setPlaces, () => {});
  }, [open, check]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const s = manifest?.source;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="about-title"
      className="m-auto w-[min(560px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-black/30"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id="about-title" className="text-[16px] font-semibold">About the data</h2>
        <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
          <CloseIcon />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
        {s && !s.verified && (
          <p className="mb-4 flex gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-[12.5px] leading-snug text-warn">
            <AlertIcon width={16} height={16} className="mt-px shrink-0" />
            <span>{s.warning}</span>
          </p>
        )}
        {manifest && s && (
          <>
            <Block title="Postcode records">
              <p>
                {s.name} — <strong className="font-medium text-ink">{s.release}</strong>. {manifest.counts.postcodes.toLocaleString()} live postcodes with
                coordinates across {manifest.counts.areas} areas, {manifest.counts.districts.toLocaleString()} districts and {manifest.counts.sectors.toLocaleString()} sectors.
              </p>
              <p>Licence: {s.licence}.</p>
              <ul className="list-disc space-y-0.5 pl-5 text-[12.5px]">{s.attribution.map((a) => <li key={a}>{a}</li>)}</ul>
            </Block>
            <Block title="Coverage">
              <p>
                Postcode areas and districts: whole of Great Britain. Sectors and individual postcodes:{' '}
                <strong className="font-medium text-ink">{manifest.coverage.detailAreas.join(', ')}</strong> ({manifest.counts.detailPostcodes.toLocaleString()} postcodes), covering {APP_CONFIG.homeRegion.name} and its neighbours. Other areas are planned; search already works UK-wide via postcodes.io.
              </p>
              {manifest.coverage.note && <p>{manifest.coverage.note}</p>}
              <p>Postal geography isn’t administrative geography: SY and TF postcodes extend into Wales and Cheshire, and parts of {APP_CONFIG.homeRegion.name} (e.g. Bridgnorth, WV16) use other areas’ postcodes.</p>
            </Block>
            {check && <CrossCheckBlock c={check} />}
            <Block title="Boundaries are approximate">
              <p>{manifest.boundaries.description}</p>
              <p>Coastline: {manifest.boundaries.coastline}.</p>
            </Block>
            {manifest.admin && (
              <Block title="Council and country borders">
                <p>
                  Councils: {manifest.admin.councils}. {manifest.admin.borders}. The “Where it is” breakdowns are{' '}
                  {manifest.admin.method === 'onspd' ? 'taken from each postcode’s council code in ONSPD.' : 'estimated by placing each postcode in these council boundaries.'}
                </p>
                <p className="text-[12.5px]">{manifest.admin.attribution}.</p>
              </Block>
            )}
            {manifest.prices && (
              <Block title="House prices">
                <p>
                  {manifest.prices.source}, standard sales only, {String(manifest.prices.from36).replace(/(\d{4})(\d{2})/, '$2/$1')} to {String(manifest.prices.latestMonth).replace(/(\d{4})(\d{2})/, '$2/$1')}. England and Wales only. Medians, not averages, so single unusual sales don’t skew them.
                </p>
                <p className="text-[12.5px]">{manifest.prices.attribution} Address fields in this data, including postcodes, are derived from Royal Mail data; commercial reuse of those needs a Royal Mail licence.</p>
              </Block>
            )}
            {places && (
              <Block title="Nearby places">
                <p>
                  {places.source}: {Object.entries(places.counts).map(([k, v]) => `${v.toLocaleString()} ${k === 'gps' ? 'GP surgeries' : k === 'stops' ? 'bus stops' : k}`).join(', ')} in the detail areas.
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-[12.5px]">{Object.values(places.notes).map((n) => <li key={n}>{n}</li>)}</ul>
                <p className="text-[12.5px]">{places.attribution}.</p>
              </Block>
            )}
            <Block title="Deprivation and price change">
              <p>English IMD 2025 comes from the official MHCLG postcode join, matched to this map’s postcode dataset. It shows a postcode-weighted mean LSOA decile, not a population-weighted score. 1 is most deprived and 10 least. Wales and Scotland have separate indices and are not compared; border regions represent English records only.</p>
              <p>Price change compares the last two complete calendar years available within the sale extract, with at least 20 sales in each. Changes in the kinds of property sold affect the result; it is not an individual house-price growth estimate.</p>
              <p>Source: MHCLG, English Indices of Deprivation 2025, licensed under the Open Government Licence v3.0. Grey means unavailable or insufficient data. The postcode provenance warning still applies.</p>
            </Block>
            <Block title="Postcode points">
              <p>Each dot is the postcode’s official reference coordinate, not an address. Several postcodes (e.g. PO boxes, large businesses) can share one point.</p>
            </Block>
            <Block title="Search and details">
              <p>
                Postcode lookups, autocomplete outside local coverage, terminated postcodes and administrative details use{' '}
                <a className="text-accent-text underline" href="https://postcodes.io" target="_blank" rel="noreferrer">postcodes.io</a> (open source, ONS data). Post towns aren’t in open data, so the map doesn’t show them.
              </p>
            </Block>
            <Block title="Basemap">
              <p>
                <a className="text-accent-text underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> tiles, © OpenMapTiles, data © OpenStreetMap contributors.
              </p>
            </Block>
          </>
        )}
      </div>
    </dialog>
  );
}
