'use client';
const COLOURS=['#2563eb','#e88b20','#14a17d','#8b5cf6','#d04c6b','#64748b'];
export function PieChart({title,items}:{title:string;items:{label:string;value:number}[]}){
 const valid=items.filter(x=>Number.isFinite(x.value)&&x.value>0);const total=valid.reduce((n,x)=>n+x.value,0);let at=0;
 const gradient=valid.map((x,i)=>{const start=at;at+=x.value/total*100;return `${COLOURS[i%COLOURS.length]} ${start}% ${at}%`;}).join(',');
 return <figure className="rounded-xl border border-line bg-surface p-4"><h3 className="text-[13px] font-semibold">{title}</h3><div className="mt-4 flex items-center gap-5"><div role="img" aria-label={`${title}: ${valid.map(x=>`${x.label} ${x.value.toFixed(1)}%`).join(', ')}`} className="size-28 shrink-0 rounded-full" style={{background:valid.length?`conic-gradient(${gradient})`:'#d6d5d1'}}/><figcaption className="min-w-0 flex-1 space-y-2">{valid.map((x,i)=><p key={x.label} className="flex items-center gap-2 text-[11px]"><span className="size-2.5 shrink-0 rounded-full" style={{background:COLOURS[i%COLOURS.length]}}/><span className="min-w-0 flex-1 text-muted">{x.label}</span><strong className="tabular-nums">{x.value.toFixed(1)}%</strong></p>)}</figcaption></div></figure>;
}
