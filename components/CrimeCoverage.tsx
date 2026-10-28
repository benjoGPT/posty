'use client';
import {useEffect,useState} from 'react';
import {coverageGaps,forceLabel,loadCrimeCoverage,monthLabel,type CrimeCoverage as Coverage} from '@/lib/crime';

export function CrimeCoverage({base,code}:{base:string;code:string}){
 const [state,setState]=useState<{code:string;data?:Coverage;error?:boolean}>();
 useEffect(()=>{const c=new AbortController();loadCrimeCoverage(base,c.signal).then(data=>setState({code,data}),()=>{if(!c.signal.aborted)setState({code,error:true});});return()=>c.abort();},[base,code]);
 if(state?.code!==code)return <p className="text-[11px] text-muted" role="status">Checking crime coverage…</p>;
 if(!state.data)return <p className="text-[11px] text-muted">Coverage details could not load. Missing values do not mean no crime.</p>;
 const months=state.data.months.slice(-12),gaps=coverageGaps(state.data,code,months);
 return <div className="mt-2 rounded-lg bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
  <p className="font-medium text-ink">{gaps.length?'Why is this area grey?':'Crime data coverage'}</p>
  {gaps.length?<><p className="mt-1">The annual comparison is hidden because forces covering part of {code} have missing months. This does not mean there was no crime.</p><ul className="mt-2 space-y-1">{gaps.map(g=><li key={g.force}>{forceLabel(g.force)}: {g.months.length} of 12 months missing ({monthLabel(g.months[0])}{g.months.length>1?` to ${monthLabel(g.months.at(-1)!)}`:''}).</li>)}</ul><p className="mt-2">Postcode areas cross force borders. Smaller districts can still have complete coverage. Published individual records remain available in the Crime tab.</p></>:<p className="mt-1">All associated territorial forces supplied the 12 source months. Missing values can still reflect no mapped observations, unavailable population estimates or the minimum population threshold.</p>}
  <a href="https://data.police.uk/changelog/" target="_blank" rel="noreferrer" className="mt-2 inline-block text-accent-text underline">Police.uk data issues</a>
 </div>;
}
