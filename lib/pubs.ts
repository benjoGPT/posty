export interface PubRecord {id:string;name:string;address:string;postcode:string;lat:number;lng:number;rating:string;ratingDate?:string;localAuthority?:string;country?:string;county?:string;town?:string}
let task:Promise<PubRecord[]>|undefined;
async function decode(response:Response):Promise<string>{const b=await response.arrayBuffer(),u=new Uint8Array(b);return u[0]===31&&u[1]===139?new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(b);}
export function loadPubs(base='/data'):Promise<PubRecord[]>{task??=fetch(`${base}/pubs/records.json.gz`).then(async r=>{if(!r.ok)throw new Error('The venue register could not be loaded.');return JSON.parse(await decode(r)) as PubRecord[]});task.catch(()=>{task=undefined});return task;}
export function directionsUrl(pub:PubRecord){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${pub.lat},${pub.lng}`)}`;}
