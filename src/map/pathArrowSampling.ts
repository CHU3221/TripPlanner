/** NAVER polyline does not expose Google-style repeating IconSequence.
 * Produce bounded, viewport-relative arrows on a polyline without new API calls.
 */
export type ScreenPathPoint = { x:number;y:number;lat:number;lng:number }
export type ScreenArrow = ScreenPathPoint & { degrees:number }

export function sampleScreenSpaceArrows(points:readonly ScreenPathPoint[],step=38,max=100): ScreenArrow[] {
  if (points.length<2 || step<=0 || max<=0) return []
  const out:ScreenArrow[]=[]
  let consumed=0
  let next=step/2
  for(let i=1;i<points.length&&out.length<max;i++){
    const a=points[i-1],b=points[i]
    if (![a.x,a.y,b.x,b.y,a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) continue
    const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)
    if(dist<0.5)continue
    while(next<=consumed+dist&&out.length<max){
      const t=(next-consumed)/dist
      out.push({x:a.x+dx*t,y:a.y+dy*t,lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t,degrees:Math.atan2(dy,dx)*180/Math.PI})
      next+=step
    }
    consumed+=dist
  }
  return out
}
