'use client';

import { useEffect, useRef, type ReactNode } from 'react';
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

export function AboutDialog({ open, onClose, manifest }: { open: boolean; onClose: () => void; manifest: Manifest | null }) {
  const ref = useRef<HTMLDialogElement>(null);
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
            <Block title="Boundaries are approximate">
              <p>{manifest.boundaries.description}</p>
              <p>Coastline: {manifest.boundaries.coastline}.</p>
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
