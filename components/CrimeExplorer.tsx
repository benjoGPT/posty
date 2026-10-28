'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BarChart} from './BarChart';
import {downloadCsv} from '@/lib/analysis';
import type {PostcodeData} from '@/lib/data';
import type {Selection} from '@/lib/search';
import type {NamedTarget} from '@/lib/namedSearch';
import {centreScope,coverageGaps,crimeLabel,crimeMonths,crimePeriod,periodMonths,forceLabel,loadCrimeCoverage,monthLabel,selectedCrimeScope,type CrimeCoverage,type CrimeRecord,type CrimeScope,type CrimePeriodResult} from '@/lib/crime';

interface Props {
 data:PostcodeData;selection:Selection|null;named:NamedTarget|null;
 getCentre:()=>[number,number];onRecords:(records:CrimeRecord[])=>void;onLocate:(record:CrimeRecord)=>void;
}
const EMPTY_RECORDS:CrimeRecord[]=[];
const field='mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent';
export function CrimeExplorer({data,selection,named,getCentre,onRecords,onLocate}:Props){
 const pending=useRef<AbortController|null>(null);
 const [months,setMonths]=useState<string[]>([]),[month,setMonth]=useState('');
 const [periodMode,setPeriodMode]=useState('month'),[year,setYear]=useState(''),[end,setEnd]=useState('');
 const [applied,setApplied]=useState<ReturnType<typeof periodMonths>|null>(null),[periodError,setPeriodError]=useState(''),[progress,setProgress]=useState(0);
 const [types,setTypes]=useState<string[]>([]),[outcome,setOutcome]=useState('all'),[group,setGroup]=useState('month'),[display,setDisplay]=useState('records'),[pins,setPins]=useState(true);
 const [scope,setScope]=useState<CrimeScope|null>(null),[coverage,setCoverage]=useState<CrimeCoverage|null>(null);
 const [coverageFailed,setCoverageFailed]=useState(false),[scopeError,setScopeError]=useState(''),[availabilityError,setAvailabilityError]=useState('');
 const [result,setResult]=useState<{scope:CrimeScope;period:NonNullable<typeof applied>;data:CrimePeriodResult}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [retry,setRetry]=useState(0),[query,setQuery]=useState(''),[limit,setLimit]=useState(40),[active,setActive]=useState<number|null>(null);
 useEffect(()=>{const c=new AbortController();setAvailabilityError('');crimeMonths(c.signal).then(m=>{setMonths(m);setMonth(old=>m.includes(old)?old:m[0]);setEnd(old=>old||m[0]);setYear(old=>old||m[0].slice(0,4));setApplied(old=>old??periodMonths(m,'month',m[0]));},e=>{if(!c.signal.aborted)setAvailabilityError(e.message);});loadCrimeCoverage(data.baseUrl,c.signal).then(v=>{setCoverage(v);setCoverageFailed(false);},()=>{if(!c.signal.aborted)setCoverageFailed(true);});return()=>c.abort();},[data,retry]);
 useEffect(()=>{let live=true;setScope(null);setScopeError('');selectedCrimeScope(data,selection,named,getCentre()).then(s=>{if(live)setScope(s);},e=>{if(live)setScopeError(e.message);});return()=>{live=false;};},[data,selection,named,getCentre,retry]);
 useEffect(()=>{
  if(!scope||!applied)return;const c=new AbortController();pending.current=c;setLoading(true);setProgress(0);setError('');setResult(null);setActive(null);setLimit(40);
  crimePeriod(scope,applied.months,c.signal,(done)=>{if(!c.signal.aborted)setProgress(done);}).then(result=>{if(!c.signal.aborted){setResult({scope,period:applied,data:result});if(!result.loaded.length)setError('No months could be loaded. '+(result.failed[0]?.message??'Please retry.'));}},e=>{if(!c.signal.aborted)setError(e.message||'Could not load Police.uk records. Please retry.');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 },[scope,applied,retry]);
 const records=result?.scope===scope&&result.period===applied?result.data.records:EMPTY_RECORDS;
 const categories=useMemo(()=>{const counts=new Map<string,number>();for(const r of records)counts.set(r.category,(counts.get(r.category)??0)+1);return [...counts].sort(([a],[b])=>a.localeCompare(b));},[records]);
 const filtered=useMemo(()=>records.filter(r=>(!types.length||types.includes(r.category))&&(outcome==='all'||outcome==='missing'&&!r.outcome_status||outcome==='published'&&!!r.outcome_status||outcome==='investigating'&&r.outcome_status?.category==='Under investigation')&&`${r.location.street.name} ${r.context} ${r.outcome_status?.category??''}`.toLowerCase().includes(query.trim().toLowerCase())),[records,types,outcome,query]);
 useEffect(()=>{onRecords(pins?filtered:[]);},[filtered,onRecords,pins]);
 useEffect(()=>{setLimit(40);setActive(null);},[types,outcome,query]);
 const gaps=coverage&&scope?.code&&applied?coverageGaps(coverage,scope.code,applied.months):[];
 const ordered=useMemo(()=>[...filtered].sort((a,b)=>group==='category'?a.category.localeCompare(b.category)||b.month.localeCompare(a.month):group==='street'?a.location.street.name.localeCompare(b.location.street.name)||b.month.localeCompare(a.month):b.month.localeCompare(a.month)||a.id-b.id),[filtered,group]);
 const resetFilters=()=>{setTypes([]);setOutcome('all');setQuery('');};
 const filteredOn=types.length>0||outcome!=='all'||!!query;
 const exportRows=()=>downloadCsv('posty-crime-records.csv',[['Scope','Month','Category','Approximate location','Outcome','Outcome month','Source'],...filtered.map(r=>[scope?.label,r.month,crimeLabel(r.category),r.location.street.name,r.outcome_status?.category??'Not published',r.outcome_status?.date??'','Police.uk'])]);
 const asb=records.filter(r=>r.category==='anti-social-behaviour').length;
 return <section aria-label="Crime records" className="px-4 py-4 text-ink">
  <h3 className="text-[16px] font-semibold">Crime records</h3>
  <p className="mt-1 text-[12px] leading-relaxed text-muted">Browse records published by Police.uk. Search a postcode, street or place above, or move the map and use its centre.</p>
  <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
   <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Search area</p>
   <p className="mt-1 text-[13px] font-medium" role="status">{scope?.label||(scopeError||'Choosing search area…')}</p>
   {scope&&!scope.boundary&&<p className="mt-1 text-[11px] text-muted">A 1 mile radius (1.6 km), not the whole postcode area.</p>}
   {scope?.largeRegion&&<p className="mt-1 text-[11px] text-muted">This region is too large for one reliable API request. Choose a district or street to explore another part.</p>}
   <button type="button" onClick={()=>{setScopeError('');setScope(centreScope(data,getCentre()));}} className="mt-2 min-h-9 rounded-md border border-line bg-surface px-3 text-[12px] font-medium text-accent-text">Use map centre</button>
  </div>
  <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-accent-text">Records show the month and an anonymised location. Exact days, times and addresses are not published. This is published recorded crime and ASB, not every incident or a live police feed.</p>
  <div className="mt-4 rounded-xl border border-line p-3">
   <div className="flex flex-wrap gap-1" aria-label="Crime period presets">{[['month','Month'],['year','Year'],['rolling','Latest 12 months'],['range','Custom range']].map(([id,label])=><button key={id} type="button" aria-pressed={periodMode===id} onClick={()=>setPeriodMode(id)} className={`min-h-9 rounded-md border px-2 text-[11px] ${periodMode===id?'border-accent bg-accent-soft text-accent-text':'border-line text-muted'}`}>{label}</button>)}</div>
   <div className="mt-2 grid grid-cols-2 items-end gap-2">
    {periodMode==='year'?<label className="text-[11px] text-muted">Calendar year<select aria-label="Crime year" className={field} value={year} onChange={e=>setYear(e.target.value)}>{[...new Set(months.map(m=>m.slice(0,4)))].map(y=><option key={y}>{y}</option>)}</select></label>:periodMode!=='rolling'&&<label className="text-[11px] text-muted">{periodMode==='range'?'From':'Month'}<select aria-label="Crime month" className={field} value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>}
    {periodMode==='range'&&<label className="text-[11px] text-muted">To<select aria-label="Crime end month" className={field} value={end} onChange={e=>setEnd(e.target.value)}>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>}
    <button type="button" disabled={!months.length||loading} onClick={()=>{try{setApplied(periodMonths(months,periodMode,periodMode==='year'?year:month,end));setPeriodError('');}catch(e){setPeriodError((e as Error).message);}}} className="min-h-10 rounded-lg bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50">Apply period</button>
   </div>
   <p className="mt-2 text-[11px] text-muted">Showing: {applied?.label??'Loading availability…'}{applied&&applied.months.length<applied.expected?` (${applied.months.length}/${applied.expected} published months)`:''}</p>
   {periodError&&<p role="alert" className="mt-2 text-[12px] text-danger">{periodError}</p>}
  </div>
  <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer text-[12px] font-semibold">Filter crime types {types.length?`(${types.length})`:'· all types'}</summary><div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">{categories.map(([c,n])=><label key={c} className="flex min-h-9 items-center gap-2 text-[11px]"><input type="checkbox" checked={types.includes(c)} onChange={()=>setTypes(t=>t.includes(c)?t.filter(x=>x!==c):[...t,c])} className="accent-accent"/>{crimeLabel(c)} ({n})</label>)}</div>{!!types.length&&<button onClick={()=>setTypes([])} className="mt-2 min-h-8 text-[11px] text-accent-text underline">All crime types</button>}</details>
  <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[11px] text-muted">Outcome<select aria-label="Crime outcome" className={field} value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="all">All outcomes</option><option value="published">Outcome published</option><option value="missing">No outcome published</option><option value="investigating">Under investigation</option></select></label><label className="text-[11px] text-muted">Organise by<select aria-label="Organise crime records" className={field} value={group} onChange={e=>setGroup(e.target.value)}><option value="month">Month, newest first</option><option value="category">Crime type</option><option value="street">Street name</option></select></label></div>
  <label className="mt-3 block text-[11px] font-medium text-muted">Find a street or outcome<input type="search" aria-label="Filter crime records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. High Street" maxLength={100} className={field}/></label>
  {(gaps.length>0||coverageFailed||coverage&&applied?.months.some(m=>!coverage.months.includes(m)))&&<div className="mt-3 rounded-lg bg-warn-soft p-3 text-[11.5px] leading-relaxed text-warn" role="note">{gaps.length?<><strong>Incomplete coverage for {scope?.code}.</strong> {gaps.map(g=>forceLabel(g.force)).join(', ')} have missing months in this period. Other forces may still return records here. A blank result does not mean no crime.</>:coverageFailed?'Coverage details could not be checked. Returned records may be incomplete.':'Some months fall outside the app’s coverage audit. Check the source for gaps.'} <a className="underline" href="https://data.police.uk/changelog/" target="_blank" rel="noreferrer">Source issues</a></div>}
  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">Scotland has no territorial-force crime coverage in this feed. Transport-police records, when present, are labelled separately. Outcomes can be missing or delayed.</p>
  {!!result?.data.failed.length&&<div role="alert" className="mt-3 rounded-lg bg-warn-soft p-3 text-[12px] text-warn">Partial results: {result.data.loaded.length}/{applied?.months.length} months loaded. {result.data.failed.map(f=>monthLabel(f.month)).join(', ')} failed. <button type="button" className="underline" onClick={()=>setRetry(n=>n+1)}>Retry missing months</button></div>}
  {(availabilityError||scopeError||error)&&<div role="alert" className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-[12px] leading-relaxed"><p>{availabilityError||scopeError||error}</p><button type="button" onClick={()=>setRetry(n=>n+1)} className="mt-2 min-h-9 rounded-md border border-line px-3 text-accent-text">Retry records</button></div>}
  {(loading||!months.length&&!availabilityError||!scope&&!scopeError)&&<div role="status" aria-label="Loading crime records" className="mt-4 space-y-3"><p className="text-[12px] text-muted">Loading {progress}/{applied?.months.length??1} months… <button type="button" className="ml-2 text-accent-text underline" onClick={()=>{pending.current?.abort();setLoading(false);setError('Loading cancelled. Apply the period to try again.');}}>Cancel</button></p>{[0,1,2].map(i=><div key={i} className="h-20 animate-pulse rounded-lg bg-surface-2"/>)}</div>}
  {!loading&&result?.scope===scope&&result.period===applied&&result.data.loaded.length>0&&<>
   <div className="mt-4 border-y border-line py-3" role="status"><p className="text-[17px] font-semibold tabular">{records.length.toLocaleString()} published records</p><p className="mt-0.5 text-[11px] text-muted">{records.length-asb} crimes · {asb} ASB incidents · {applied?.label}</p>{filteredOn&&<p className="mt-1 text-[11px] text-accent-text">{filtered.length} match your filters. <button type="button" className="underline" onClick={resetFilters}>Clear filters</button></p>}</div>
   <div className="my-3 flex flex-wrap items-center gap-2"><div className="flex gap-1">{['records','charts'].map(v=><button key={v} type="button" aria-pressed={display===v} onClick={()=>setDisplay(v)} className={`min-h-9 rounded-md border px-3 text-[12px] ${display===v?'border-accent bg-accent-soft text-accent-text':'border-line'}`}>{v==='records'?'Records':'Charts'}</button>)}</div><button type="button" onClick={exportRows} className="min-h-9 rounded-md border border-line px-3 text-[11px] text-accent-text">Export filtered CSV</button><label className="flex min-h-9 items-center gap-2 text-[11px]"><input type="checkbox" checked={pins} onChange={e=>setPins(e.target.checked)}/>Map pins</label></div>
   {display==='charts'&&<div className="my-3 grid gap-3 lg:grid-cols-2"><BarChart title="Published records by month" items={(applied?.months??[]).map(m=>({label:monthLabel(m),value:result?.data.loaded.includes(m)&&!gaps.some(g=>g.months.includes(m))?filtered.filter(r=>r.month===m).length:null}))} note="Filters apply. Months with API failures or known territorial-force gaps are unavailable, not zero."/><BarChart title="Crime type breakdown" items={categories.map(([c])=>({label:crimeLabel(c),value:filtered.filter(r=>r.category===c).length}))} note="Published mapped records only. ASB is a separate incident category."/></div>}
   {display==='records'&&<>
   {!records.length?<p className="py-5 text-[12px] leading-relaxed text-muted">No published mapped records were returned for this area and loaded period. This may reflect missing force data or unlocated records; it does not establish that no crimes occurred. Try another month or location.</p>:!filtered.length?<p className="py-5 text-[12px] text-muted">No records match these filters. Clear them to see all returned records.</p>:<ol className="divide-y divide-line" aria-label="Published crime records">{ordered.slice(0,limit).map(r=><li key={`${r.month}-${r.id}`} className={`py-3 ${active===r.id?'rounded-lg bg-accent-soft px-2':''}`}>
    <div className="flex items-start justify-between gap-2"><h4 className="text-[13px] font-semibold">{crimeLabel(r.category)}</h4><span className="shrink-0 text-[10px] text-muted">{monthLabel(r.month)}</span></div>
    <p className="mt-1 text-[12px] text-muted">{r.location.street.name}</p>
    <p className="mt-1 text-[11px] leading-relaxed text-muted">{r.outcome_status?.category??'No outcome published'}{r.outcome_status?.date?` · ${monthLabel(r.outcome_status.date)}`:''}</p>
    {r.location_type==='BTP'&&<p className="mt-1 text-[10px] font-medium text-muted">British Transport Police{r.location_subtype?` · ${r.location_subtype}`:''}</p>}
    <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={()=>{setActive(r.id);onLocate(r);}} className="min-h-9 rounded-md border border-line bg-surface px-2.5 text-[11.5px] font-medium text-accent-text">Show approximate location</button><details className="text-[10.5px] text-muted"><summary className="cursor-pointer">Record details</summary><p className="mt-1 break-all">API ID {r.id} (not a police reference). {r.context||'No further context published.'}</p><p className="mt-1">Approx. {Number(r.location.latitude).toFixed(5)}, {Number(r.location.longitude).toFixed(5)}</p></details></div>
   </li>)}</ol>}
   {filtered.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+40)} className="my-3 min-h-11 w-full rounded-lg border border-line text-[12px] font-medium text-accent-text">Show more ({Math.min(limit,filtered.length)} of {filtered.length})</button>}
   </>}
  </>}
  <p className="mt-3 flex items-center gap-2 text-[11px] text-muted"><span className="size-2.5 rounded-full bg-[#b45309]" aria-hidden/>Brown pins show filtered records; numbered circles group nearby locations.</p>
  <footer className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted"><a href="https://data.police.uk/" target="_blank" rel="noreferrer" className="text-accent-text underline">Police.uk open data</a> · Open Government Licence v3.0. Monthly publication. Locations are shifted to protect privacy; pins do not identify an address or imply anything about its occupants.</footer>
 </section>;
}
