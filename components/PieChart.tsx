'use client';
const COLOURS=['#2563eb','#e88b20','#14a17d','#8b5cf6','#d04c6b','#64748b'];
export function PieChart({title,items}:{title:string;items:{label:string;value:number}[]}){
 const valid=items.filter(x=>Number.isFinite(x.value)&&x.value>0);const total=valid.reduce((n,x)=>n+x.value,0);let at=0;
 const gradient=valid.map((x,i)=>{const start=at;at+=x.value/total*100;return `${COLOURS[i%COLOURS.length]} ${start}% ${at}%`;}).join(',');
 return <figure className="rounded-xl border border-line bg-surface p-3 sm:p-4"><h3 className="text-[13px] font-semibold">{title}</h3><div className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 sm:mt-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5"><div role="img" aria-label={`${title}: ${valid.map(x=>`${x.label} ${x.value.toFixed(1)}%`).join(', ')}`} className="size-24 shrink-0 rounded-full sm:size-28" style={{background:valid.length?`conic-gradient(${gradient})`:'#d6d5d1'}}/><figcaption className="min-w-0 space-y-2">{valid.map((x,i)=><p key={x.label} className="flex min-w-0 items-start gap-1.5 text-[10.5px] leading-tight sm:gap-2 sm:text-[11px]"><span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{background:COLOURS[i%COLOURS.length]}}/><span className="min-w-0 flex-1 break-words text-muted">{x.label}</span><strong className="shrink-0 tabular-nums">{x.value.toFixed(1)}%</strong></p>)}</figcaption></div></figure>;
}
