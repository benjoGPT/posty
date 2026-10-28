'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { PostcodeData, RegionProps } from '@/lib/data';
import { LEVEL_LABELS } from '@/lib/levels';
import { lookupOutcode, lookupPostcode, type LookupResult, type OutcodeInfo } from '@/lib/lookup';
import type { StackedUnit } from '@/lib/mapController';
import { areaOf, compareCodes, districtOf, sectorOf } from '@/lib/postcode';
import type { RegionKind, Selection } from '@/lib/search';
import type { NavTarget } from './SearchBox';
import { AlertIcon, ChevronRight, CloseIcon, CopyIcon, LinkIcon, ZoomInIcon } from './Icons';

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
    <button onClick={onClick} className="group -mx-1 inline-flex items-center gap-1 rounded px-1 text-left hover:bg-surface-hover">
      <span className="font-semibold whitespace-pre text-accent-text">{code}</span>
      {sub && <span className="text-muted">· {sub}</span>}
      <ChevronRight width={14} height={14} className="text-faint group-hover:text-accent-text" />
    </button>
  );
}

function ActionButton({ onClick, icon, children, primary }: { onClick: () => void; icon: ReactNode; children: ReactNode; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
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
        <h2 className="mt-0.5 truncate text-[24px] leading-tight font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      <button onClick={onClose} aria-label="Close details" className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-hover hover:text-ink">
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

function UnitDetails({ data, sel, stack, onNavigate, onPickStacked, onCopy, onShare, onClose }: Props & { sel: Extract<Selection, { kind: 'unit' }> }) {
  const lookup = useAsync<LookupResult>(() => lookupPostcode(sel.code), [sel.code]);
  const area = data.areas.get(areaOf(sel.code));
  const coords = `${sel.lat.toFixed(6)}, ${sel.lng.toFixed(6)}`;
  const admin = lookup?.status === 'live' ? lookup.data : null;

  return (
    <>
      <Header
        eyebrow="Postcode"
        title={<span className="tabular">{sel.code}</span>}
        badge={sel.status === 'terminated' ? <Badge tone="warn">Terminated</Badge> : <Badge tone="ok">Live</Badge>}
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
      </Section>

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
      <SourceFooter data={data} extra={sel.origin === 'remote' ? 'This postcode’s position comes from postcodes.io.' : undefined} />
    </>
  );
}

// -----------------------------------------------------------------------------

function RegionDetails({ data, sel, onNavigate, onZoom, onCopy, onShare, onClose }: Props & { sel: { kind: RegionKind; code: string } }) {
  const areaCode = areaOf(sel.code);
  const area = data.areas.get(areaCode);
  const district = sel.kind === 'area' ? undefined : data.districts.get(districtOf(sel.code));
  const sectors = useAsync(() => data.loadSectors(areaCode), [areaCode]);
  const outcode = useAsync<OutcodeInfo | null | 'unavailable'>(() => (sel.kind === 'district' ? lookupOutcode(sel.code) : Promise.resolve(null)), [sel.code, sel.kind]);
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
      </div>
      <div className="flex gap-2 px-4 pb-3.5">
        <ActionButton primary onClick={onZoom} icon={<ZoomInIcon width={15} height={15} />}>Zoom to {sel.code}</ActionButton>
        <ActionButton onClick={() => onCopy(sel.code, 'Code')} icon={<CopyIcon width={15} height={15} />}>Copy</ActionButton>
        <ActionButton onClick={onShare} icon={<LinkIcon width={15} height={15} />}>Share</ActionButton>
      </div>

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
              <button key={c} onClick={() => onNavigate({ kind: children!.kind, code: c })} className="rounded-md border border-line px-2 py-0.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent-text">
                {c}
              </button>
            ))}
          </div>
        </Section>
      )}

      {sel.kind === 'district' && (
        <Section title="Local authorities" note="Councils whose areas overlap this postcode district, from postcodes.io. Postal and administrative boundaries differ.">
          {outcode === undefined && <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />}
          {outcode === 'unavailable' && <p className="text-[12.5px] text-muted">Not available: couldn’t reach postcodes.io.</p>}
          {outcode === null && <p className="text-[12.5px] text-muted">No details found.</p>}
          {outcode && outcode !== 'unavailable' && (
            <dl>
              <Row label="Local authority">{outcode.admin_district.join(', ') || '—'}</Row>
              {outcode.admin_county.length > 0 && <Row label="County">{outcode.admin_county.join(', ')}</Row>}
              <Row label="Country">{outcode.country.join(', ')}</Row>
            </dl>
          )}
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
