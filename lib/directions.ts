export type TravelMode='walking'|'bicycling'|'driving'|'transit';
export function directionsUrl(origin:{lng:number;lat:number},destination:{lng:number;lat:number},mode:TravelMode):string{
 if(![origin.lng,origin.lat,destination.lng,destination.lat].every(Number.isFinite))throw new Error('A route needs valid coordinates.');
 const params=new URLSearchParams({api:'1',origin:`${origin.lat},${origin.lng}`,destination:`${destination.lat},${destination.lng}`,travelmode:mode});return `https://www.google.com/maps/dir/?${params}`;
}
