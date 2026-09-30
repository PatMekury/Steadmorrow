// Cartographic widths do not establish a surveyed roadway or legal access.
export function streetWidth(road={}){
  if(Number.isFinite(road.widthMeters)&&road.widthMeters>=1&&road.widthMeters<=60)return {metres:road.widthMeters,basis:'mapped-width'};
  if(Number.isFinite(road.lanes)&&road.lanes>=1&&road.lanes<=12)return {metres:Math.max(3,Math.min(40,road.lanes*3.1)),basis:'lane-estimate'};
  const sizes={motorway:13,trunk:12,primary:11,secondary:10,tertiary:9,residential:7.5,unclassified:7,living_street:5.5,service:4.5,pedestrian:4,footway:2,path:2,cycleway:2.5,steps:1.8,track:3};
  return {metres:sizes[road.kind]??(road.kind?.endsWith('_link')?5.5:6),basis:'cartographic-estimate'};
}
// Segment quads with round joins/caps: real world width, independent of GPU
// line-width support. All bends use source coordinates, without spline shortcuts.
export function streetTriangles(points,width){
  if(!Number.isFinite(width)||width<=0)return [];
  const ps=points.filter(p=>Array.isArray(p)&&p.every(Number.isFinite)).filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-6),tri=[];
  const add=(a,b,c)=>tri.push(...a,...b,...c),r=width/2;
  for(let i=1;i<ps.length;i++){
    const a=ps[i-1],b=ps[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/d*r,ny=(b[0]-a[0])/d*r;
    const p=[a[0]+nx,a[1]+ny],q=[a[0]-nx,a[1]-ny],s=[b[0]-nx,b[1]-ny],t=[b[0]+nx,b[1]+ny];add(p,q,t);add(q,s,t);
  }
  for(const p of ps)for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;add(p,[p[0]+r*Math.cos(a),p[1]+r*Math.sin(a)],[p[0]+r*Math.cos(b),p[1]+r*Math.sin(b)]);}
  return tri;
}
