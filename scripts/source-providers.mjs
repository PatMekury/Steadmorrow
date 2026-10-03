// Verified provider endpoints, not a supported-city list. Catalogue discovery
// still runs for every selected location. Keep provenance with each exception
// to the government-domain rule; never allow all .org or .net hosts.
const providers=[
  {origin:'https://arcweb.hcad.org',path:'/server/rest/services/public/public_query/MapServer',publisher:'Harris Central Appraisal District',
    authority:'https://www.harriscountytx.gov/',directory:'https://hcad.org/',publicMap:'https://arcweb.hcad.org/parcel-viewer-v2.0/'},
  {origin:'https://www.gis.hctx.net',path:'/arcgis/rest/services/HCAD/Parcels/MapServer',publisher:'Harris County · appraisal district parcel records',
    authority:'https://www.harriscountytx.gov/',directory:'https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer'},
];
export function verifiedProvider(value){
  try{const u=new URL(value);return providers.find(p=>u.origin===p.origin&&(u.pathname===p.path||u.pathname.startsWith(p.path+'/')))??null;}catch{return null;}
}

// Verified catalogue entry points supplement generic discovery; they never gate
// which locations may be selected and contain no zoning rules.
export const catalogueConnections=[
 {stateId:'34',kind:'parcel',itemId:'533599bbfbaa4748bf39faf1375a8a9c',authority:'https://www.nj.gov/njgin/edata/parcels/',publisher:'New Jersey Office of GIS'},
 {cityId:'3651000',kind:'parcel',itemId:'1564ace0b4f44318ac39920737f9bd07',authority:'https://www.arcgis.com/sharing/rest/portals/GfwWNkhOj9bNBqoJ?f=json',publisher:'NYC Department of City Planning'},
 {cityId:'3651000',kind:'zoning',itemId:'788dcf4c61e34757bad1e015cb5f4111',authority:'https://www.arcgis.com/sharing/rest/portals/GfwWNkhOj9bNBqoJ?f=json',publisher:'NYC Department of City Planning'},
];
export const publishedCodeConnections=[
 {cityId:'3651000',root:'https://zoningresolution.planning.nyc.gov/',searchPath:'/search',searchParameter:'search_term',publisher:'New York City Planning · Zoning Resolution',authority:'https://zoningresolution.planning.nyc.gov/'},
 {cityId:'3405740',root:'https://ecode360.com/BE3153',publisher:'City of Beverly, New Jersey · General Code',authority:'https://thecityofbeverly.com/ordinances'},
];
export const connectionMatches=(connection,locality)=>Boolean(connection.cityId?connection.cityId===locality.cityId:connection.stateId===locality.stateId);
