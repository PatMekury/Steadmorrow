import {jurisdictionFromGeographies} from './jurisdiction.mjs';
import {digest} from './evidence-client.mjs';

// Independent official Census endpoint; only fixed layer URLs, never user URLs.
const base='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/';
const layers=[['States','State_County',0],['Counties','State_County',1],['Incorporated Places','Places_CouSub_ConCity_SubMCD',4],['County Subdivisions','Places_CouSub_ConCity_SubMCD',1]];
export async function boundaryLocation(read,points){
 const ring=points.map(p=>[p.lng,p.lat]);ring.push(ring[0]);
 const query=async([name,service,id],relationship)=>{
  const u=new URL(`${base}${service}/MapServer/${id}/query`);
  u.search=new URLSearchParams({f:'json',geometry:JSON.stringify({rings:[ring],spatialReference:{wkid:4326}}),geometryType:'esriGeometryPolygon',inSR:'4326',spatialRel:relationship,outFields:'*',returnGeometry:'false',resultRecordCount:'10'});
  const r=await read(u.href),fs=r.data.features;
  if(!Array.isArray(fs)||r.data.error||r.data.exceededTransferLimit||fs.length>=10)throw Error('Incomplete boundary query');
  return {name,response:r,rows:fs.map(f=>f.attributes)};
 };
 try{
  const intersect=await Promise.all(layers.map(l=>query(l,'esriSpatialRelIntersects')));
  if(intersect.some(r=>r.rows.length>1)||intersect.slice(0,2).some(r=>r.rows.length!==1))return null;
  // ArcGIS evaluates input geometry against stored features: the selection
  // must be WITHIN the boundary, not contain the state/county itself.
  const containing=await Promise.all(layers.map(l=>query(l,'esriSpatialRelWithin')));
  if(containing.some((r,i)=>r.rows.length!==intersect[i].rows.length||r.rows.some((a,j)=>a.GEOID!==intersect[i].rows[j]?.GEOID)))return null;
  const g=Object.fromEntries(containing.map(r=>[r.name,r.rows])),locality=jurisdictionFromGeographies(g);
  if(!locality)return null;
  locality.boundaryLookupIncomplete=false;locality.boundaryUncertain=false;
  const proofs=intersect.concat(containing).map(r=>({url:r.response.url,hash:r.response.hash,retrievedAt:r.response.retrievedAt}));
  return {locality,evidence:{id:'jurisdiction',title:'Geographic jurisdiction · Census boundary service',publisher:'U.S. Census Bureau',kind:'geographic-reference',url:proofs[0].url,hash:digest(proofs),retrievedAt:proofs[0].retrievedAt,proof:proofs,text:`Official Census boundaries contain the selected outline in ${locality.label}; county: ${locality.county}. Recovered through TIGERweb after the address-geography service failed. Geographic boundaries guide authority discovery; they do not establish exclusive planning authority, tribal jurisdiction or ownership.`}};
 }catch{return null;}
}
