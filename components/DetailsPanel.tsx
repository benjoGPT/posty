'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { AdminBreakdown, NearbyPlace, PostcodeData, RegionProps } from '@/lib/data';
import { AboutPostcode, Nearby, RegionPrices, UnitPrices } from './PanelSections';
import { LEVEL_LABELS } from '@/lib/levels';
import { lookupPostcode, type LookupResult } from '@/lib/lookup';
import type { StackedUnit } from '@/lib/mapController';
import { areaOf, compareCodes, districtOf, sectorOf } from '@/lib/postcode';
import type { RegionKind, Selection } from '@/lib/search';
import type { NavTarget } from './SearchBox';
import { AlertIcon, ChevronRight, CloseIcon, CopyIcon, ExternalIcon, LinkIcon, ZoomInIcon } from './Icons';

interface Props {
  data: PostcodeData;
  selection: Selection;
  stack: StackedUnit[] | null;
  onNavigate: (t: NavTarget) => void;
  onPickStacked: (u: StackedUnit) => void;
  onZoom: () => void;
  onCopy: (text: string, what: string) => void;
  onShare: () => void;
  onClose: () => void;
  onShowPlace: (p: NearbyPlace) => void;
}

// ONSPD positional quality indicator (osgrdind).
const QUALITY: Record<number, string> = {
  1: 'Within the building of the matched address closest to the postcode mean',
  2: 'As 1, checked by visual inspection (Scotland)',
  3: 'Approximate, to within 50 m',
  4: 'Mean of the postcode’s matched addresses',
  5: 'Imputed by ONS from surrounding postcodes',
  6: 'Postcode sector mean (mainly PO Boxes)',
  8: 'Last known position (terminated before Gridlink)',
};

const KIND_LEVEL = { area: 'areas', district: 'districts', sector: 'sectors' } as const;

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<{ deps: unknown[]; v: T } | undefined>();
  useEffect(() => {
    let live = true;
    fn().then((v) => { if (live) setValue({ deps, v }); }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value && value.deps.every((d, i) => d === deps[i]) ? value.v : undefined;
}

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

function CodeLink({ code, sub, onClick }: { code: string; sub?: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group -mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-left hover:bg-surface-hover">
      <span className="pc-code font-semibold whitespace-pre text-accent-text">{code}</span>
      {sub && <span className="text-muted">· {sub}</span>}
      <ChevronRight width={14} height={14} className="text-faint group-hover:text-accent-text" />
    </button>
  );
}

function ActionButton({ onClick, icon, children, primary }: { onClick: () => void; icon: ReactNode; children: ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 md:h-9 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
        primary ? 'bg-accent text-white hover:opacity-90 dark:text-[#0c1220]' : 'border border-line text-ink hover:bg-surface-hover'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Header({ eyebrow, title, badge, onClose }: { eyebrow: string; title: ReactNode; badge?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">{eyebrow}</span>
          {badge}
        </div>
        <h2 className="pc-code mt-0.5 truncate text-[24px] leading-tight font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      <button onClick={onClose} aria-label="Close details" className="-mr-1.5 grid size-11 shrink-0 md:size-8 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
        <CloseIcon />
      </button>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'neutral'; children: ReactNode }) {
  const cls = tone === 'ok' ? 'bg-accent-soft text-accent-text' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted';
  return <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function SourceFooter({ data, extra }: { data: PostcodeData; extra?: string }) {
  const s = data.manifest.source;
  return (
    <footer className="border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-faint">
      Source: {s.release}{!s.verified && <span className="text-warn"> (unverified copy)</span>}. Map data built {new Date(data.manifest.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
      {extra && <> {extra}</>}
    </footer>
  );
}

// -----------------------------------------------------------------------------

function UnitDetails({ data, sel, stack, onNavigate, onPickStacked, onCopy, onShare, onClose, onShowPlace }: Props & { sel: Extract<Selection, { kind: 'unit' }> }) {
  const lookup = useAsync<LookupResult>(() => lookupPostcode(sel.code), [sel.code]);
  const area = data.areas.get(areaOf(sel.code));
  const coords = `${sel.lat.toFixed(6)}, ${sel.lng.toFixed(6)}`;
  const admin = lookup?.status === 'live' ? lookup.data : null;
  const nearby = useAsync(() => data.nearestUnits(sel.lng, sel.lat, 6, sel.code), [sel.code, sel.lng, sel.lat]);
  const local = useAsync(() => (data.isDetailArea(areaOf(sel.code)) ? data.findUnit(sel.code) : Promise.resolve(null)), [sel.code]);
  const places = useAsync(() => data.nearbyPlaces(sel.lng, sel.lat), [sel.lng, sel.lat]);
  const sectors = useAsync(() => data.loadSectors(areaOf(sel.code)), [sel.code]);
  const sectorPrices = sectors?.features.find((f) => !f.properties.label && f.properties.c === sectorOf(sel.code))?.properties.pp ?? null;
  const prices = data.manifest.prices;
  const countries = admin?.country ? [admin.country] : (area?.adm?.countries ?? []).map(([c]) => c);
  const priceCovered = countries.some((c) => c === 'England' || c === 'Wales');
  const newSince = data.manifest.extras?.introduced?.newSince;
  const isNew = !!(local?.introduced && newSince && local.introduced > newSince);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${sel.lat.toFixed(6)},${sel.lng.toFixed(6)}`;

  return (
    <>
      <Header
        eyebrow="Postcode"
        title={<span className="tabular">{sel.code}</span>}
        badge={sel.status === 'terminated' ? <Badge tone="warn">Terminated</Badge> : <><Badge tone="ok">Live</Badge>{isNew && <Badge tone="neutral">New</Badge>}</>}
        onClose={onClose}
      />
      {sel.status === 'terminated' && sel.terminated && (
        <p className="mx-4 mb-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn">
          <AlertIcon width={15} height={15} className="mt-px shrink-0" />
          Terminated in {new Date(sel.terminated.year, sel.terminated.month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. Shown at its last recorded position; it is no longer in use.
        </p>
      )}
      {sel.notice && <p className="mx-4 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-muted">{sel.notice}</p>}
      {stack && stack.length > 1 && (
        <div className="mx-4 mb-3 rounded-lg bg-surface-2 px-3 py-2">
          <p className="mb-1.5 text-[12px] text-muted">{stack.length} postcodes share this reference point:</p>
          <div className="flex flex-wrap gap-1.5">
            {stack.map((u) => (
              <button
                key={u.code}
                onClick={() => onPickStacked(u)}
                aria-pressed={u.code === sel.code}
                className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${u.code === sel.code ? 'bg-accent text-white dark:text-[#0c1220]' : 'border border-line bg-surface text-ink hover:bg-surface-hover'}`}
              >
                {u.code}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 px-4 pb-3.5">
        <ActionButton onClick={() => onCopy(sel.code, 'Postcode')} icon={<CopyIcon width={15} height={15} />}>Copy postcode</ActionButton>
        <ActionButton onClick={() => onCopy(coords, 'Coordinates')} icon={<CopyIcon width={15} height={15} />}>Copy coords</ActionButton>
        <ActionButton onClick={onShare} icon={<LinkIcon width={15} height={15} />}>Share</ActionButton>
      </div>

      <Section title="Postal geography">
        <dl>
          <Row label="Postcode area"><CodeLink code={areaOf(sel.code)} sub={area?.name} onClick={() => onNavigate({ kind: 'area', code: areaOf(sel.code) })} /></Row>
          <Row label="District"><CodeLink code={districtOf(sel.code)} onClick={() => onNavigate({ kind: 'district', code: districtOf(sel.code) })} /></Row>
          <Row label="Sector"><CodeLink code={sectorOf(sel.code)} onClick={() => onNavigate({ kind: 'sector', code: sectorOf(sel.code) })} /></Row>
        </dl>
      </Section>

      <Section title="Location" note="This is the postcode’s official reference point (roughly the centre of its addresses), not a boundary or a specific address.">
        <dl>
          <Row label="Latitude, longitude"><span className="tabular">{coords}</span></Row>
          {sel.quality != null && QUALITY[sel.quality] && <Row label="Positional quality">{QUALITY[sel.quality]}</Row>}
        </dl>
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-text hover:underline">
          <ExternalIcon width={14} height={14} /> Open in Google Maps
        </a>
      </Section>

      {places && <Nearby places={places} onShow={onShowPlace} />}

      {prices && (
        <UnitPrices sales={local?.sales} sector={sectorPrices} sectorCode={sectorOf(sel.code)} period={prices} covered={priceCovered} />
      )}

      {nearby && nearby.length > 0 && (
        <Section title="Nearby postcodes">
          <ul className="grid grid-cols-2 gap-1.5">
            {nearby.map((u) => (
              <li key={u.postcode}>
                <button onClick={() => onNavigate({ kind: 'unit', code: u.postcode })} className="flex w-full items-baseline justify-between gap-2 rounded-md border border-line px-2 py-1.5 text-left hover:border-accent">
                  <span className="pc-code text-[12.5px] font-semibold whitespace-pre text-ink">{u.postcode}</span>
                  <span className="tabular text-[11px] text-faint">{u.metres < 1000 ? `${Math.round(u.metres)} m` : `${(u.metres / 1000).toFixed(1)} km`}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Administrative geography"
        note="Councils and other administrative areas don’t follow postcode boundaries. Royal Mail post towns aren’t in the open data, so none is shown."
      >
        {!lookup && <div className="space-y-2 py-1" aria-label="Loading">{[70, 55, 80, 60].map((w) => <div key={w} className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />)}</div>}
        {lookup?.status === 'unavailable' && <p className="text-[12.5px] text-muted">Not available: {lookup.message}.</p>}
        {(lookup?.status === 'not_found' || lookup?.status === 'terminated') && <p className="text-[12.5px] text-muted">postcodes.io holds no current administrative details for this postcode.</p>}
        {admin && (
          <dl>
            {admin.country && <Row label="Country">{admin.country}</Row>}
            {admin.region && <Row label="Region">{admin.region}</Row>}
            {admin.admin_district && <Row label="Local authority">{admin.admin_district}</Row>}
            {admin.admin_county && <Row label="County">{admin.admin_county}</Row>}
            {admin.admin_ward && <Row label="Ward">{admin.admin_ward}</Row>}
            {admin.parish && <Row label="Parish">{admin.parish}</Row>}
            {admin.parliamentary_constituency && <Row label="Constituency">{admin.parliamentary_constituency}</Row>}
            <p className="mt-1.5 text-[11.5px] text-faint">Administrative details from postcodes.io (ONS data).</p>
          </dl>
        )}
      </Section>
      <AboutPostcode admin={admin} introduced={local?.introduced} />
      <SourceFooter data={data} extra={sel.origin === 'remote' ? 'This postcode’s position comes from postcodes.io.' : undefined} />
    </>
  );
}

// Categorical slots from the validated palette (orange / aqua / blue / violet), not flag colours:
// red vs green is the pair colour-blind readers most often can't tell apart.
const COUNTRY_COLOUR: Record<string, string> = { England: '#eb6834', Wales: '#1baf7a', Scotland: '#2a78d6', 'Northern Ireland': '#6250d6' };

function share(n: number, total: number): string {
  const p = (100 * n) / total;
  return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

/** Which countries and councils a postcode area/district covers, by share of its postcodes. */
function WhereItIs({ adm, code, kind, method }: { adm: AdminBreakdown; code: string; kind: RegionKind; method?: 'onspd' | 'boundaries' }) {
  const total = adm.countries.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  const multi = adm.countries.length > 1;
  return (
    <Section
      title="Where it is"
      note={
        <>
          Share of the {kind === 'area' ? 'area’s' : 'district’s'} postcodes in each council
          {method === 'boundaries' ? ', estimated from ONS council boundaries' : ' (ONS data)'}. Postcode {kind}s ignore council and national borders.
        </>
      }
    >
      {multi && (
        <div className="mb-2.5">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={adm.countries.map(([c, n]) => `${c} ${share(n, total)}`).join(', ')}>
            {adm.countries.map(([c, n]) => <span key={c} style={{ width: `${(100 * n) / total}%`, background: COUNTRY_COLOUR[c] ?? '#888' }} />)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-ink">
            {adm.countries.map(([c, n]) => (
              <span key={c} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: COUNTRY_COLOUR[c] ?? '#888' }} aria-hidden />
                {c} <span className="tabular text-muted">{share(n, total)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {!multi && <p className="mb-1.5 text-[12.5px] text-ink">All of {code} is in {adm.countries[0][0]}.</p>}
      <ul className="space-y-1">
        {adm.councils.map(([name, n]) => (
          <li key={name} className="flex items-center gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (100 * n) / total)}%` }} />
            </span>
            <span className="tabular w-9 text-right text-muted">{share(n, total)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// -----------------------------------------------------------------------------

function RegionDetails({ data, sel, onNavigate, onZoom, onCopy, onShare, onClose }: Props & { sel: { kind: RegionKind; code: string } }) {
  const areaCode = areaOf(sel.code);
  const area = data.areas.get(areaCode);
  const district = sel.kind === 'area' ? undefined : data.districts.get(districtOf(sel.code));
  const sectors = useAsync(() => data.loadSectors(areaCode), [areaCode]);
  const sectorProps: RegionProps | undefined = sectors?.features.find((f) => !f.properties.label && f.properties.c === sel.code)?.properties;
  const level = KIND_LEVEL[sel.kind];

  let count: number | undefined;
  let km2: number | null | undefined;
  let children: { kind: RegionKind; codes: string[]; label: string } | null = null;
  if (sel.kind === 'area' && area) {
    count = area.n; km2 = area.km2;
    children = { kind: 'district', codes: data.sortedDistricts(areaCode).map((d) => d.c), label: `${area.nd} districts` };
  } else if (sel.kind === 'district' && district) {
    count = district.n; km2 = district.km2;
    const codes = (sectors?.features ?? []).filter((f) => !f.properties.label && f.properties.d === sel.code).map((f) => f.properties.c).sort(compareCodes);
    children = { kind: 'sector', codes, label: `${district.ns} sectors` };
  } else if (sel.kind === 'sector') {
    count = sectorProps?.n; km2 = sectorProps?.km2;
  }

  const name = sel.kind === 'area' ? area?.name : null;
  const regionInfo = sel.kind === 'area' ? area : sel.kind === 'district' ? district : sectorProps;
  const regionPrices = regionInfo?.pp ?? null;
  return (
    <>
      <Header
        eyebrow={LEVEL_LABELS[level].singular}
        title={<>{sel.code}{name && <span className="font-normal text-muted"> · {name}</span>}</>}
        badge={<Badge tone="neutral">Approximate boundary</Badge>}
        onClose={onClose}
      />
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="text-[11.5px] text-muted">Live postcodes</div>
          <div className="tabular text-[17px] font-semibold text-ink">{count != null ? count.toLocaleString() : '—'}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="text-[11.5px] text-muted">Land area (approx.)</div>
          <div className="tabular text-[17px] font-semibold text-ink">{km2 != null ? `${km2 < 10 ? km2.toFixed(1) : Math.round(km2).toLocaleString()} km²` : '—'}</div>
        </div>
        {regionInfo?.ur !== undefined && (
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <div className="text-[11.5px] text-muted">Urban postcodes</div>
            <div className="tabular text-[17px] font-semibold text-ink">{Math.round(regionInfo.ur * 100)}%</div>
          </div>
        )}
        {regionInfo?.nw !== undefined && (
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <div className="text-[11.5px] text-muted">New in last 2 years</div>
            <div className="tabular text-[17px] font-semibold text-ink">{regionInfo.nw.toLocaleString()}</div>
          </div>
        )}
      </div>
      <div className="flex gap-2 px-4 pb-3.5">
        <ActionButton primary onClick={onZoom} icon={<ZoomInIcon width={15} height={15} />}>Zoom to {sel.code}</ActionButton>
        <ActionButton onClick={() => onCopy(sel.code, 'Code')} icon={<CopyIcon width={15} height={15} />}>Copy</ActionButton>
        <ActionButton onClick={onShare} icon={<LinkIcon width={15} height={15} />}>Share</ActionButton>
      </div>

      {sel.kind === 'area' && (
        <p className="mx-4 mb-3 text-[12px] leading-snug text-muted">
          Postcode areas are named after their main post town, not a county{area?.name ? ` — ${sel.code} is the ${area.name} area` : ''}.
        </p>
      )}

      {(sel.kind === 'area' ? area?.adm : sel.kind === 'district' ? district?.adm : undefined) && (
        <WhereItIs adm={(sel.kind === 'area' ? area!.adm : district!.adm)!} code={sel.code} kind={sel.kind} method={data.manifest.admin?.method} />
      )}

      {(regionInfo?.im !== undefined || regionInfo?.pg !== undefined) && <Section title="Area insights">
        {regionInfo?.im !== undefined && <p className="text-[13px] text-ink">English IMD 2025: mean decile <strong>{regionInfo.im.toFixed(1)}</strong> from {regionInfo.imn?.toLocaleString()} published postcode records. 1 is most deprived, 10 least. This weights postcodes, not residents; border regions show English records only.</p>}
        {regionInfo?.pg !== undefined && <p className="mt-2 text-[13px] text-ink">Sale median change, {data.insights?.growth.baseYear} to {data.insights?.growth.year}: <strong>{regionInfo.pg>0?'+':''}{regionInfo.pg.toFixed(1)}%</strong> ({regionInfo.pgn?.join(' / ')} sales). Different properties sell each year; this is not individual property appreciation.</p>}
      </Section>}
      {regionPrices && data.manifest.prices && <RegionPrices pp={regionPrices} period={data.manifest.prices} />}

      {sel.kind !== 'area' && (
        <Section title="Part of">
          <dl>
            <Row label="Postcode area"><CodeLink code={areaCode} sub={area?.name} onClick={() => onNavigate({ kind: 'area', code: areaCode })} /></Row>
            {sel.kind === 'sector' && <Row label="District"><CodeLink code={districtOf(sel.code)} onClick={() => onNavigate({ kind: 'district', code: districtOf(sel.code) })} /></Row>}
          </dl>
        </Section>
      )}

      {children && children.codes.length > 0 && (
        <Section title={`Contains ${children.label}`}>
          <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-auto">
            {children.codes.map((c) => (
              <button key={c} onClick={() => onNavigate({ kind: children!.kind, code: c })} className="pc-code rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink md:px-2 md:py-0.5 md:text-[12px] hover:border-accent hover:text-accent-text">
                {c}
              </button>
            ))}
          </div>
        </Section>
      )}


      {area && !area.detail && sel.kind !== 'area' && (
        <p className="mx-4 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-snug text-muted">
          Sector and individual postcode detail isn’t loaded for the {areaCode} area yet. Search still finds any postcode here.
        </p>
      )}

      <Section title="About this boundary">
        <p className="text-[12px] leading-snug text-muted">
          There’s no open official boundary for postcodes. This outline is estimated from the reference points of the postcodes inside it, so treat edges as approximate.
        </p>
      </Section>
      <SourceFooter data={data} />
    </>
  );
}

export function DetailsContent(props: Props) {
  const { selection } = props;
  return selection.kind === 'unit' ? <UnitDetails {...props} sel={selection} /> : <RegionDetails {...props} sel={selection} />;
}
