/** Source-described measures shared by map paint, menus, panels and comparisons. */
export interface MetricDefinition {
  id: string; title: string; topic: string; unit: string; stops: number[];
  source: string; period: string; note: string; precision: number;
  status: 'available' | 'unavailable';
}
export interface DataAvailability { id: string; title: string; status: string; reason: string; url: string }
export interface CommunityData {
  schema: number; generated: string; metrics: MetricDefinition[];
  regions: Record<string, Record<string, number>>; availability: DataAvailability[];
  crime?: { months: string[]; missingComparedWithUnion: Record<string, string[]>; unlocatedRows: number; sourceRows: number };
}
let definitions: MetricDefinition[] = [];
export function setMetricDefinitions(items: MetricDefinition[]) { definitions = items.filter(m => /^[a-z_]+$/.test(m.id) && m.stops.length >= 2 && m.stops.every((v,i)=>Number.isFinite(v)&&(i===0||v>m.stops[i-1]))); }
export function metricFor(mode: string): MetricDefinition | undefined { return definitions.find(m => mode === `metric:${m.id}`); }
const LIGHT = ['#edf8fb','#b2e2e2','#66c2a4','#238b45','#005824'];
const DARK = ['#214639','#2b7557','#55a77a','#94d4ac','#d1f3db'];
export function metricStops(m: MetricDefinition, theme: 'light'|'dark'): [number,string][] {
  const ramp=theme==='dark'?DARK:LIGHT;
  const diverging=['#b35806','#e5b786',theme==='dark'?'#56616a':'#f7f7f7','#80cdc1','#01665e'];
  return m.stops.map((v,i)=>[v,(m.id==='crime_change'?diverging:ramp)[Math.round(i*4/(m.stops.length-1))]]);
}
export function formatMetric(value: number|undefined, m: MetricDefinition): string {
  if (value===undefined||!Number.isFinite(value)) return 'No data';
  const n=value.toLocaleString('en-GB',{maximumFractionDigits:m.precision});
  return m.unit==='%'?`${n}%`:m.unit==='% change'?`${value>0?'+':''}${n}%`:`${n} ${m.unit}`;
}
