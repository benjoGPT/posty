'use client';
import {useEffect,useMemo,useState} from 'react';
import type {PostcodeData} from '@/lib/data';
import type {Selection} from '@/lib/search';
import type {NamedTarget} from '@/lib/namedSearch';
import {centreScope,coverageGaps,crimeLabel,crimeMonths,crimeRecords,forceLabel,loadCrimeCoverage,monthLabel,selectedCrimeScope,type CrimeCoverage,type CrimeRecord,type CrimeScope} from '@/lib/crime';

interface Props {
 data:PostcodeData;selection:Selection|null;named:NamedTarget|null;
 getCentre:()=>[number,number];onRecords:(records:CrimeRecord[])=>void;onLocate:(record:CrimeRecord)=>void;
}
const EMPTY_RECORDS:CrimeRecord[]=[];
const field='mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent';
export function CrimeExplorer({data,selection,named,getCentre,onRecords,onLocate}:Props){
 const [months,setMonths]=useState<string[]>([]),[month,setMonth]=useState('');
 const [scope,setScope]=useState<CrimeScope|null>(null),[coverage,setCoverage]=useState<CrimeCoverage|null>(null);
 const [coverageFailed,setCoverageFailed]=useState(false),[scopeError,setScopeError]=useState(''),[availabilityError,setAvailabilityError]=useState('');
 const [result,setResult]=useState<{scope:CrimeScope;month:string;records:CrimeRecord[]}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [retry,setRetry]=useState(0),[category,setCategory]=useState('all'),[query,setQuery]=useState(''),[limit,setLimit]=useState(40),[active,setActive]=useState<number|null>(null);
 useEffect(()=>{const c=new AbortController();setAvailabilityError('');crimeMonths(c.signal).then(m=>{setMonths(m);setMonth(old=>m.includes(old)?old:m[0]);},e=>{if(!c.signal.aborted)setAvailabilityError(e.message);});loadCrimeCoverage(data.baseUrl,c.signal).then(v=>{setCoverage(v);setCoverageFailed(false);},()=>{if(!c.signal.aborted)setCoverageFailed(true);});return()=>c.abort();},[data,retry]);
 useEffect(()=>{let live=true;setScope(null);setScopeError('');selectedCrimeScope(data,selection,named,getCentre()).then(s=>{if(live)setScope(s);},e=>{if(live)setScopeError(e.message);});return()=>{live=false;};},[data,selection,named,getCentre,retry]);
 useEffect(()=>{
  if(!scope||!month)return;const c=new AbortController();setLoading(true);setError('');setResult(null);setActive(null);setLimit(40);
  crimeRecords(scope,month,c.signal).then(records=>{if(!c.signal.aborted)setResult({scope,month,records});},e=>{if(!c.signal.aborted)setError(e.message||'Could not load Police.uk records. Please retry.');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 },[scope,month,retry]);
 const records=result?.scope===scope&&result.month===month?result.records:EMPTY_RECORDS;
 const categories=useMemo(()=>{const counts=new Map<string,number>();for(const r of records)counts.set(r.category,(counts.get(r.category)??0)+1);return [...counts].sort(([a],[b])=>a.localeCompare(b));},[records]);
 const filtered=useMemo(()=>records.filter(r=>(category==='all'||r.category===category)&&`${r.location.street.name} ${r.context} ${r.outcome_status?.category??''}`.toLowerCase().includes(query.trim().toLowerCase())),[records,category,query]);
 useEffect(()=>{onRecords(filtered);return()=>onRecords([]);},[filtered,onRecords]);
 useEffect(()=>{setLimit(40);setActive(null);},[category,query]);
 const gaps=coverage&&scope?.code&&month?coverageGaps(coverage,scope.code,[month]):[];
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
  <div className="mt-3 grid grid-cols-2 gap-2">
   <label className="text-[11px] font-medium text-muted">Month<select aria-label="Crime month" className={field} value={month} disabled={!months.length} onChange={e=>setMonth(e.target.value)}>{!months.length&&<option>Loading months…</option>}{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
   <label className="text-[11px] font-medium text-muted">Crime type<select aria-label="Crime type" className={field} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All types</option>{[...new Set([...categories.map(([c])=>c),...(category==='all'?[]:[category])])].map(c=><option key={c} value={c}>{crimeLabel(c)} ({categories.find(([k])=>k===c)?.[1]??0})</option>)}</select></label>
  </div>
  <label className="mt-3 block text-[11px] font-medium text-muted">Find a street or outcome<input type="search" aria-label="Filter crime records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. High Street" maxLength={100} className={field}/></label>
  {(gaps.length>0||coverageFailed||coverage&&!coverage.months.includes(month)&&month)&&<div className="mt-3 rounded-lg bg-warn-soft p-3 text-[11.5px] leading-relaxed text-warn" role="note">{gaps.length?<><strong>Incomplete coverage for {scope?.code}.</strong> {gaps.map(g=>forceLabel(g.force)).join(', ')} did not supply this month. Other forces may still return records here. A blank result does not mean no crime.</>:coverageFailed?'Coverage details could not be checked. Returned records may be incomplete.':'This month is newer than the app’s coverage audit. Check the source for gaps.'} <a className="underline" href="https://data.police.uk/changelog/" target="_blank" rel="noreferrer">Source issues</a></div>}
  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">Scotland has no territorial-force crime coverage in this feed. Transport-police records, when present, are labelled separately. Outcomes can be missing or delayed.</p>
  {(availabilityError||scopeError||error)&&<div role="alert" className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-[12px] leading-relaxed"><p>{availabilityError||scopeError||error}</p><button type="button" onClick={()=>setRetry(n=>n+1)} className="mt-2 min-h-9 rounded-md border border-line px-3 text-accent-text">Retry records</button></div>}
  {(loading||!months.length&&!availabilityError||!scope&&!scopeError)&&<div role="status" aria-label="Loading crime records" className="mt-4 space-y-3">{[0,1,2].map(i=><div key={i} className="h-20 animate-pulse rounded-lg bg-surface-2"/>)}</div>}
  {!loading&&result?.scope===scope&&result.month===month&&<>
   <div className="mt-4 border-y border-line py-3" role="status"><p className="text-[17px] font-semibold tabular">{records.length.toLocaleString()} published records</p><p className="mt-0.5 text-[11px] text-muted">{records.length-asb} crimes · {asb} ASB incidents · {monthLabel(month)}</p>{(category!=='all'||query)&&<p className="mt-1 text-[11px] text-accent-text">{filtered.length} match your filters. <button type="button" className="underline" onClick={()=>{setCategory('all');setQuery('');}}>Clear filters</button></p>}</div>
   {!records.length?<p className="py-5 text-[12px] leading-relaxed text-muted">No published mapped records were returned for this area and month. This may reflect missing force data or unlocated records; it does not establish that no crimes occurred. Try another month or location.</p>:!filtered.length?<p className="py-5 text-[12px] text-muted">No records match these filters. Clear them to see all returned records.</p>:<ol className="divide-y divide-line" aria-label="Published crime records">{filtered.slice(0,limit).map(r=><li key={`${r.month}-${r.id}`} className={`py-3 ${active===r.id?'rounded-lg bg-accent-soft px-2':''}`}>
    <div className="flex items-start justify-between gap-2"><h4 className="text-[13px] font-semibold">{crimeLabel(r.category)}</h4><span className="shrink-0 text-[10px] text-muted">{monthLabel(r.month)}</span></div>
    <p className="mt-1 text-[12px] text-muted">{r.location.street.name}</p>
    <p className="mt-1 text-[11px] leading-relaxed text-muted">{r.outcome_status?.category??'No outcome published'}{r.outcome_status?.date?` · ${monthLabel(r.outcome_status.date)}`:''}</p>
    {r.location_type==='BTP'&&<p className="mt-1 text-[10px] font-medium text-muted">British Transport Police{r.location_subtype?` · ${r.location_subtype}`:''}</p>}
    <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={()=>{setActive(r.id);onLocate(r);}} className="min-h-9 rounded-md border border-line bg-surface px-2.5 text-[11.5px] font-medium text-accent-text">Show approximate location</button><details className="text-[10.5px] text-muted"><summary className="cursor-pointer">Record details</summary><p className="mt-1 break-all">API ID {r.id} (not a police reference). {r.context||'No further context published.'}</p><p className="mt-1">Approx. {Number(r.location.latitude).toFixed(5)}, {Number(r.location.longitude).toFixed(5)}</p></details></div>
   </li>)}</ol>}
   {filtered.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+40)} className="my-3 min-h-11 w-full rounded-lg border border-line text-[12px] font-medium text-accent-text">Show more ({Math.min(limit,filtered.length)} of {filtered.length})</button>}
  </>}
  <p className="mt-3 flex items-center gap-2 text-[11px] text-muted"><span className="size-2.5 rounded-full bg-[#b45309]" aria-hidden/>Brown pins show filtered records; numbered circles group nearby locations.</p>
  <footer className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted"><a href="https://data.police.uk/" target="_blank" rel="noreferrer" className="text-accent-text underline">Police.uk open data</a> · Open Government Licence v3.0. Monthly publication. Locations are shifted to protect privacy; pins do not identify an address or imply anything about its occupants.</footer>
 </section>;
}
