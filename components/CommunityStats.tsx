'use client';
import {areaOf} from '@/lib/postcode';
import type{PostcodeData}from '@/lib/data';
import{formatMetric}from '@/lib/metrics';
export function CommunityStats({data,code,context=false}:{data:PostcodeData;code:string;context?:boolean}){
 const community=data.community;if(!community)return null;if(data.regionalFailures.has(areaOf(code)))return <p className="border-t border-line px-4 py-3 text-[12px] text-warn">Statistics for this area could not be loaded. Reload the page to try again.</p>;const values=community.regions[code]??{};
 const topics=['People','Safety','Housing','Connectivity','Transport','Services','Environment'];
 return <section className="border-t border-line px-4 py-3"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Community profile {context?`· ${code} context`:''}</h3>
 {context&&<p className="mb-2 text-[11.5px] text-muted">District-level context, not statistics for this individual postcode.</p>}
 {topics.map(topic=>{const metrics=community.metrics.filter(m=>m.topic===topic&&m.status==='available');if(!metrics.length)return null;return <details key={topic} className="border-t border-line py-2" open={topic==='People'}><summary className="cursor-pointer text-[13px] font-medium text-ink">{topic}</summary><dl className="mt-2 space-y-2">{metrics.map(m=><div key={m.id} className="text-[12px]"><dt className="text-muted">{m.title}</dt><dd className="mt-0.5 font-medium text-ink">{formatMetric(values[m.id],m)}</dd><dd className="text-[10.5px] text-faint">{m.period} · <a className="underline" href={m.source} target="_blank" rel="noreferrer">Source</a><details className="mt-1"><summary className="cursor-pointer">Definition and limits</summary><p className="leading-relaxed">{m.note}</p></details></dd></div>)}</dl></details>})}
 {community.availability.map(d=><details key={d.id} className="border-t border-line py-2 text-[11.5px] text-muted"><summary className="cursor-pointer">{d.title} · data unavailable</summary><p className="mt-1">{d.reason} <a className="text-accent-text underline" href={d.url} target="_blank" rel="noreferrer">Official service</a></p></details>)}
 </section>
}
