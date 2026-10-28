import type {PostcodeData,PriceSummary} from './data';
import {areaOf} from './postcode';
import type {MetricDefinition} from './metrics';
export interface DataRow {code:string;name:string;n:number;values:Record<string,number>;prices?:PriceSummary}
export const DERIVED_METRICS:MetricDefinition[]=[
 {id:'working_age',title:'Residents aged 15–64',topic:'People',unit:'%',stops:[40,50,60,70,80],precision:1,status:'available',period:'Mid-2024 estimates',source:'https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates',note:'100 minus the estimated under-15 and 65+ shares. Age range only, not employment or economic activity. Same postcode-share allocation limits as the source population estimates.'},
 {id:'age_dependency',title:'Age dependency ratio',topic:'People',unit:'per 100 aged 15–64',stops:[20,40,60,80,120],precision:1,status:'available',period:'Mid-2024 estimates',source:'https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates',note:'Estimated residents under 15 or 65+, divided by those aged 15–64, multiplied by 100. An age-based demographic ratio, not a measure of actual financial dependency.'},
 {id:'gigabit_gap',title:'Without gigabit availability',topic:'Connectivity',unit:'%',stops:[0,10,25,50,100],precision:1,status:'available',period:'January 2026',source:'https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-update-spring-2026',note:'100 minus the Ofcom gigabit availability measure. Unweighted average of postcode percentages, not a count of homes or actual broadband speeds.'},
];
export function deriveValues(v:Record<string,number>):Record<string,number>{
 const out={...v};if(Number.isFinite(v.children)&&Number.isFinite(v.older)){const working=100-v.children-v.older;if(working>0&&working<=100){out.working_age=working;out.age_dependency=(v.children+v.older)/working*100;}}
 if(Number.isFinite(v.gigabit)&&v.gigabit>=0&&v.gigabit<=100)out.gigabit_gap=100-v.gigabit;return out;
}
const sourceMonth=(ym:number)=>new Date(Date.UTC(Math.floor(ym/100),ym%100-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
export function analysisMetrics(data:PostcodeData):MetricDefinition[]{
 return [{id:'sale_median',title:'Median sale price',topic:'Housing',unit:'£',stops:[100000,200000,300000,500000,1000000],precision:0,status:'available',period:data.manifest.prices?`${sourceMonth(data.manifest.prices.from36)}–${sourceMonth(data.manifest.prices.latestMonth)}`:'Registered source extract',source:'https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads',note:'Standard registered sales in the source extract, at least five sales. Recent registrations can be incomplete; fewer than 20 sales is a small sample.'},
 {id:'imd_decile',title:'English deprivation mean decile',topic:'People',unit:'decile',stops:[1,3,5,7,10],precision:1,status:'available',period:'IMD 2025',source:'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025',note:'Postcode-weighted mean decile of matched English records only. 1 most deprived, 10 least. This is not an area’s national rank.'},...(data.community?.metrics??[]).filter(m=>m.status==='available')];
}
export async function loadRows(data:PostcodeData,kind:string,area?:string):Promise<DataRow[]>{
 if(kind!=='area'){if(!area)throw new Error('Choose a postcode area.');await data.loadDistricts(area);if(kind==='sector')await data.loadSectors(area);if(data.regionalFailures.has(area))throw new Error('Regional statistics could not load. Reload the page to retry.');}
 let entries:{code:string;name?:string|null;n:number;pp?:PriceSummary;im?:number}[];
 if(kind==='area')entries=[...data.areas.values()].map(x=>({...x,code:x.c}));
 else if(kind==='sector'){const fc=await data.loadSectors(area!);if(!fc)throw new Error('Sector data is available in SY, TF, WV and DY only.');entries=fc.features.filter(f=>!f.properties.label).map(f=>({...f.properties,code:f.properties.c}));}
 else entries=data.sortedDistricts(area!).map(x=>({...x,code:x.c}));
 return entries.map(x=>({code:x.code,name:x.name??'',n:x.n,prices:x.pp,values:{...deriveValues(data.community?.regions[x.code]??{}),...(x.pp?.m36!=null&&x.pp.n36>=5?{sale_median:x.pp.m36}:{}),...(x.im!=null?{imd_decile:x.im}:{})}}));
}
export async function loadComparedRow(data:PostcodeData,code:string,kind:string):Promise<DataRow>{
 const rows=await loadRows(data,kind,kind==='area'?undefined:areaOf(code));const row=rows.find(r=>r.code===code);if(!row)throw new Error(`No ${kind} ${code} is available.`);return row;
}
export function difference(a:number|undefined,b:number|undefined,unit:string,precision=1):string {
 if(a==null||b==null||!Number.isFinite(a)||!Number.isFinite(b))return 'No comparable data';const d=b-a,n=Math.abs(d).toLocaleString('en-GB',{maximumFractionDigits:precision});const rounded=Number(Math.abs(d).toFixed(precision));const sign=rounded===0?'':d>0?'+':'−';
 return unit==='%'||unit==='% change'?`${sign}${n} percentage points`:unit==='£'?`${sign}£${n}`:`${sign}${n} ${unit}`;
}
export function sortRows(rows:DataRow[],key:string,descending:boolean):DataRow[]{
 return [...rows].sort((a,b)=>{if(key==='code')return (descending?-1:1)*a.code.localeCompare(b.code,'en-GB',{numeric:true});const x=a.values[key],y=b.values[key];if(x==null)return y==null?a.code.localeCompare(b.code):1;if(y==null)return -1;return (descending?y-x:x-y)||a.code.localeCompare(b.code);});
}
export function csvCell(value:unknown):string{const s=String(value??'');return '"'+(typeof value!=='number'&&/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export function downloadCsv(name:string,rows:unknown[][]){const content='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
