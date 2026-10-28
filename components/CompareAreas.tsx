'use client';
import{useEffect,useRef,useState}from'react';
import type{PostcodeData,PriceSummary}from'@/lib/data';
import{areaOf}from'@/lib/postcode';
import{formatMetric}from'@/lib/metrics';
export interface ComparedArea{code:string;kind:string}
export function CompareAreas({data,areas,open,onClose,onClear}:{data:PostcodeData;areas:ComparedArea[];open:boolean;onClose:()=>void;onClear:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current?.close()},[open]);
 const [prices,setPrices]=useState<(PriceSummary|null)[]>([]);
 useEffect(()=>{let active=true;if(!open)return;void Promise.all(areas.map(async a=>{const known=data.areas.get(a.code)?.pp??data.districts.get(a.code)?.pp;if(known)return known;if(a.kind==='sector'){const fc=await data.loadSectors(areaOf(a.code));return fc?.features.find(f=>!f.properties.label&&f.properties.c===a.code)?.properties.pp??null;}return null;})).then(p=>{if(active)setPrices(p)}).catch(()=>{if(active)setPrices([])});return()=>{active=false}},[open,areas,data]);
 const metrics=data.community?.metrics.filter(m=>m.status==='available')??[];
 return <dialog ref={dialog} onClose={onClose} className="m-auto max-h-[85dvh] w-[min(900px,94vw)] overflow-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-float backdrop:bg-black/40" aria-labelledby="compare-title"><header className="mb-4 flex items-center justify-between"><h2 id="compare-title" className="text-lg font-semibold">Compare {areas[0]?.kind??'areas'}s</h2><button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm">Close</button></header>
 <p className="mb-4 text-[12px] text-muted">Select two regions at the same geographic level. Each row uses the same source and period for both. Missing coverage is shown as no data.</p>
 <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead><tr className="border-b border-line"><th className="p-2">Measure</th>{[0,1].map(i=><th key={i} className="p-2">{areas[i]?.code??'Choose another region'}</th>)}</tr></thead><tbody>
 <tr className="border-b border-line"><th scope="row" className="p-2 font-normal">Median sale price<span className="block text-[10.5px] text-muted">Last 36 months in the Land Registry extract; ≥5 sales, fewer than 20 is a small sample.</span></th>{[0,1].map(i=><td key={i} className="p-2 align-top">{prices[i]?.m36&&prices[i]!.n36>=5?`£${prices[i]!.m36!.toLocaleString('en-GB')}`:'No data'}</td>)}</tr>
 <tr className="border-b border-line"><th scope="row" className="p-2 font-normal">English IMD 2025 mean decile<span className="block text-[10.5px] text-muted">Postcode-weighted English records only; 1 most deprived, 10 least.</span></th>{[0,1].map(i=><td key={i} className="p-2">{data.insights?.groups[areas[i]?.code]?.im?.toFixed(1)??'No data'}</td>)}</tr>
 <tr className="border-b border-line"><th scope="row" className="p-2 font-normal">Sale median change<span className="block text-[10.5px] text-muted">{data.insights?.growth.baseYear}–{data.insights?.growth.year}, at least 20 sales each; not individual property appreciation.</span></th>{[0,1].map(i=><td key={i} className="p-2">{data.insights?.groups[areas[i]?.code]?.pg!==undefined?`${data.insights.groups[areas[i].code].pg!.toFixed(1)}%`:'No data'}</td>)}</tr>
 {metrics.map(m=><tr key={m.id} className="border-b border-line"><th scope="row" className="p-2 font-normal"><span className="block font-medium">{m.title}</span><span className="text-[10.5px] text-muted">{m.period} · {m.topic}</span><details className="mt-1 text-[10.5px] text-muted"><summary className="cursor-pointer">Definition</summary>{m.note}</details></th>{[0,1].map(i=><td key={i} className="p-2 tabular-nums align-top">{formatMetric(areas[i]?data.community?.regions[areas[i].code]?.[m.id]:undefined,m)}</td>)}</tr>)}
 </tbody></table></div><button onClick={onClear} className="mt-4 rounded-lg border border-line px-3 py-2 text-[12px]">Clear comparison</button>
 </dialog>
}
