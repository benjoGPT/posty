'use client';

import type { ReactNode } from 'react';
import type { NearbyPlace, PlaceKind, PriceSummary } from '@/lib/data';
import type { LivePostcode } from '@/lib/lookup';
import { PLACE_STYLE } from '@/lib/mapLayers';

const gbp = (v: number) => (v >= 1e6 ? `£${(v / 1e6).toFixed(v >= 1e7 ? 0 : 2)}m` : `£${Math.round(v / 1000).toLocaleString()}k`);
const metres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const monthName = (ym: number) => new Date(Math.floor(ym / 100), (ym % 100) - 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h3>
      {children}
      {note && <p className="mt-2 text-[11.5px] leading-snug text-muted">{note}</p>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-[3px] text-[13px]">
      <dt className="w-[118px] shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat' };

/** House prices for a postcode area, district or sector. */
export function RegionPrices({ pp, period }: { pp: PriceSummary; period: { from36: number; latestMonth: number } }) {
  const years = Object.entries(pp.year).sort(([a], [b]) => Number(a) - Number(b));
  const maxYear = Math.max(...years.map(([, [, m]]) => m));
  // Prefer the last 12 months; fall back to 3 years; never show a median of fewer than 5 sales.
  const headline = pp.m12 && pp.n12 >= 10 ? { label: 'last 12 months', m: pp.m12, n: pp.n12 } : pp.m36 && pp.n36 >= 5 ? { label: 'last 3 years', m: pp.m36, n: pp.n36 } : null;
  return (
    <Section
      title="House prices"
      note={<>Standard sales registered with HM Land Registry, {monthName(period.from36)}–{monthName(period.latestMonth)}. The most recent months are incomplete because sales take a while to register.</>}
    >
      {headline ? (
        <div className="mb-2">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-[20px] font-semibold text-ink">{gbp(headline.m)}</span>
            <span className="text-[12px] text-muted">median, {headline.label} · {headline.n.toLocaleString()} sales</span>
          </div>
          {headline.n < 20 && <p className="text-[11.5px] text-warn">Few sales, so this figure can swing a lot.</p>}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">Too few sales to give a median.</p>
      )}
      <dl>
        {(['D', 'S', 'T', 'F'] as const).filter((t) => pp.type[t]).map((t) => (
          <Row key={t} label={TYPE_LABEL[t]}>
            <span className="tabular">{pp.type[t][0] >= 3 ? gbp(pp.type[t][1]) : '—'}</span>
            <span className="tabular ml-1.5 text-[11.5px] text-faint">{pp.type[t][0].toLocaleString()} sales</span>
          </Row>
        ))}
      </dl>
      {years.length > 1 && (
        <div className="mt-2.5">
          <div className="mb-1 text-[11.5px] text-muted">Median by year</div>
          <ul className="space-y-1">
            {years.map(([y, [n, m]]) => (
              <li key={y} className="flex items-center gap-2 text-[12px]">
                <span className="tabular w-9 text-muted">{y}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${(100 * m) / maxYear}%`, background: '#eb6834' }} />
                </span>
                <span className="tabular w-14 text-right text-ink">{gbp(m)}</span>
                <span className="tabular w-14 text-right text-[11px] text-faint">{n.toLocaleString()} sales</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** House sales in one postcode, with its sector for context. */
export function UnitPrices({ sales, sector, sectorCode, period, covered }: {
  sales?: [number, number];
  sector?: PriceSummary | null;
  sectorCode: string;
  period: { from36: number; latestMonth: number };
  covered: boolean;
}) {
  if (!covered) {
    return (
      <Section title="House prices">
        <p className="text-[12.5px] text-muted">Land Registry price data covers England and Wales only.</p>
      </Section>
    );
  }
  return (
    <Section title="House prices" note={<>Standard sales registered with HM Land Registry since {monthName(period.from36)}.</>}>
      <dl>
        <Row label="This postcode">
          {sales ? (
            <>
              <span className="tabular font-semibold">{gbp(sales[1])}</span>
              <span className="tabular ml-1.5 text-[11.5px] text-faint">{sales[0] === 1 ? 'one sale' : `median of ${sales[0]} sales`}</span>
            </>
          ) : (
            <span className="text-muted">No sales recorded</span>
          )}
        </Row>
        {sector?.m36 && sector.n36 >= 5 && (
          <Row label={`Sector ${sectorCode}`}>
            <span className="tabular">{gbp(sector.m36)}</span>
            <span className="tabular ml-1.5 text-[11.5px] text-faint">{sector.n36.toLocaleString()} sales{sector.n36 < 20 ? ' — few sales' : ''}</span>
          </Row>
        )}
      </dl>
    </Section>
  );
}

const NEARBY_ORDER: { kind: PlaceKind; title: string }[] = [
  {kind:'supermarkets',title:'Supermarkets'},{kind:'pharmacies',title:'Pharmacies'},{kind:'parks',title:'Mapped green spaces'},
  { kind: 'postboxes', title: 'Postbox' },
  { kind: 'stations', title: 'Station' },
  { kind: 'stops', title: 'Bus stop' },
  { kind: 'schools', title: 'School' },
  { kind: 'gps', title: 'GP surgery' },
];

/** Nearest postbox, station, bus stop, schools and GP surgery. */
export function Nearby({ places, onShow }: { places: Record<PlaceKind, NearbyPlace[]>; onShow: (p: NearbyPlace) => void }) {
  const items: NearbyPlace[] = [];
  for (const { kind } of NEARBY_ORDER) {
    const list = places[kind];
    if (kind === 'stations') {
      // Nearest National Rail station first, plus a nearer bus/heritage station if there is one.
      const rail = list.find((p) => p.info === 'rail');
      if (rail) items.push(rail);
      const other = list.find((p) => p !== rail && (!rail || p.metres < rail.metres));
      if (other) items.push(other);
    } else if (kind === 'schools') items.push(...list.slice(0, 2));
    else if (list[0]) items.push(list[0]);
  }
  if (!items.length) return null;
  const icon = (p: NearbyPlace) => (p.kind === 'stations' ? (p.info as string) : p.kind);
  return (
    <Section title="Nearby" note="From OpenStreetMap and Overture Maps. Volunteer-mapped, so occasionally incomplete. Distances are straight-line.">
      <ul className="-mx-1 space-y-0.5">
        {items.map((p) => (
          <li key={`${p.kind}-${p.lng}-${p.lat}`}>
            <button onClick={() => onShow(p)} className="flex w-full items-start gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-surface-hover">
              <span className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-surface" style={{ background: PLACE_STYLE[icon(p)]?.colour }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] text-muted">
                  {PLACE_STYLE[icon(p)]?.label}
                  {p.kind === 'schools' && p.info && p.info !== 'school' ? ` · ${p.info}` : ''}
                </span>
                <span className="block truncate text-[13px] font-medium text-ink">
                  {p.kind === 'postboxes' ? (p.ref ? `Box ${p.ref}` : 'Postbox') : p.name ?? PLACE_STYLE[icon(p)]?.label}
                </span>
                {p.kind === 'postboxes' && (
                  <span className="block text-[11.5px] text-muted">{p.info ? `Collections: ${p.info}` : 'Collection times not mapped'}</span>
                )}
              </span>
              <span className="tabular mt-0.5 shrink-0 text-[12px] text-faint">{metres(p.metres)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// Approximate number of neighbourhoods ranked in each nation's deprivation index
// (England ~33,000 LSOAs, Wales ~1,900, Scotland ~7,000 data zones, Northern Ireland ~900).
const IMD_TOTAL: Record<string, number> = { England: 33000, Wales: 1900, Scotland: 7000, 'Northern Ireland': 900 };

/** Extra ONS facts about a postcode, shown only where postcodes.io provides them. */
export function AboutPostcode({ admin, introduced }: { admin: LivePostcode | null; introduced?: number | null }) {
  const intro = introduced ?? (admin?.date_of_introduction && /^\d{6}$/.test(admin.date_of_introduction) ? Number(admin.date_of_introduction) : null);
  const rank = admin?.index_of_multiple_deprivation ?? null;
  const total = admin?.country ? IMD_TOTAL[admin.country] : undefined;
  const park = admin?.national_park && !/pseudo/i.test(admin.national_park) ? admin.national_park : null;
  const rows: [string, ReactNode][] = [];
  if (intro) rows.push(['Introduced', monthName(intro)]);
  if (admin?.bua && !/pseudo|not in a built/i.test(admin.bua)) rows.push(['Built-up area', admin.bua]);
  if (admin?.ruc21 ?? admin?.ruc11) rows.push(['Urban or rural', (admin?.ruc21 ?? admin?.ruc11)!]);
  if (rank && total) rows.push(['Deprivation rank', <>{rank.toLocaleString()} <span className="text-[11.5px] text-faint">of about {total.toLocaleString()} in {admin!.country} (1 = most deprived)</span></>]);
  if (park) rows.push(['National park', park]);
  if (admin?.senedd_constituency) rows.push(['Senedd constituency', admin.senedd_constituency]);
  if (admin?.pfa) rows.push(['Police force', admin.pfa]);
  if (!rows.length) return null;
  return (
    <Section title="About this postcode" note="ONS data via postcodes.io. Deprivation ranks describe a whole neighbourhood of around 1,500 people, not individual streets.">
      <dl>{rows.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}</dl>
    </Section>
  );
}

export { monthName };
