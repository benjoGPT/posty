import type {CircleLayerSpecification} from 'maplibre-gl';
import type {MetricDefinition} from './metrics';
export interface MetricOverlay {id:string;opacity:number}
export const OVERLAY_COLOURS=['#2563eb','#be185d'];
export function metricOverlayLayer(id:string,source:string,metric:MetricDefinition,index:number,opacity:number):CircleLayerSpecification{
 const prop='mx_'+metric.id;return {id,type:'circle',source,filter:['all',['==',['get','label'],true],['has',prop]],paint:{'circle-radius':['interpolate',['linear'],['get',prop],metric.stops[0],4,metric.stops.at(-1)!,20],'circle-color':OVERLAY_COLOURS[index%2],'circle-opacity':Math.min(1,Math.max(.15,opacity)),'circle-stroke-color':'#ffffff','circle-stroke-width':1.5,'circle-translate':[index===0?-14:14,0]}};
}
