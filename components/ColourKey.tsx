'use client';
import {metricFor,metricStops} from '@/lib/metrics';

import { insightStops, densityStops, NO_DATA, priceStops, URBAN_STOPS, type ColourMode, type Theme } from '@/lib/mapLayers';

interface Props {
  colourMode: ColourMode;
  theme: Theme;
  priceScale?: number[] | null;
  growthPeriod?: {baseYear: number; year: number};
}

const compact = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

/** Always-visible key for the heat-map colour modes, so the colours can be read without opening the legend. */
export function ColourKey({ colourMode, theme, priceScale, growthPeriod }: Props) {
  let title: string;
  let colours: string[];
  let labels: string[];
  let noData = false;
  const metric=metricFor(colourMode);
  if(metric){const stops=metricStops(metric,theme);title=metric.title;colours=stops.map(([,c])=>c);labels=[stops[0],stops[Math.floor(stops.length/2)],stops.at(-1)!].map(([v])=>`${compact(v)}${metric.unit==='%'?'%':''}`);noData=true;}
  else if (colourMode === 'deprivation' || colourMode === 'growth') {
    const stops=insightStops(colourMode,theme);
    title=colourMode==='deprivation'?'English IMD 2025 · mean decile':`Sale medians ${growthPeriod?.baseYear ?? ''}–${growthPeriod?.year ?? ''}`;
    colours=stops.map(([,c])=>c);labels=colourMode==='deprivation'?['1 · most','5.5','10 · least']:['−20%','0%','+20%'];noData=true;
  } else if (colourMode === 'prices') {
    const stops = priceStops(theme, priceScale);
    title = 'Median house price';
    colours = stops.map(([, c]) => c);
    labels = [stops[0], stops[Math.floor(stops.length / 2)], stops[stops.length - 1]].map(([v]) => `£${compact(v)}`);
    noData = true;
  } else if (colourMode === 'density') {
    const stops = densityStops(theme);
    title = 'Postcodes per km²';
    colours = stops.map(([, c]) => c);
    labels = [stops[0], stops[Math.floor(stops.length / 2)], stops[stops.length - 1]].map(([v]) => compact(v));
  } else if (colourMode === 'urban') {
    title = 'Urban share of postcodes';
    colours = URBAN_STOPS[theme].map(([, c]) => c);
    labels = ['Rural', 'Mixed', 'Urban'];
    noData = true;
  } else return null;

  return (
    <section aria-label={`${title} colour key`} className="animate-in w-[168px] rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-float backdrop-blur">
      <h2 className="mb-1.5 text-[11.5px] font-semibold text-ink">{title}</h2>
      <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
        {colours.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
      </div>
      <div className="tabular mt-1 flex justify-between text-[10.5px] text-muted">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </div>
      {metric && <p className="mt-1 text-[10px] text-muted">{metric.period} · {metric.unit}</p>}
      {noData && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-faint">
          <span className="size-2.5 rounded-[3px]" style={{ background: NO_DATA[theme] }} aria-hidden /> No data
        </div>
      )}
    </section>
  );
}
