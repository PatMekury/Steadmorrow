import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {streetWidth,streetTriangles} from './street-geometry.js';
import {sceneBuildings, subjectFrame, linkedBuildingIds} from './scene-geometry.js';

const EARTH_METRES = 111195;
const PAPER = '#f6f6f3';
const INK = '#535952';
const BLUE = '#3174d8';
const SELECTED = '#bdd9f6';
const polygonCoordinates = geometry => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  const value = geometry.coordinates ?? geometry;
  if (!Array.isArray(value) || !value.length) return [];
  return typeof value[0]?.[0]?.[0] === 'number' ? [value] : value;
};
const allPoints = geometry => polygonCoordinates(geometry).flat(2).filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
const average = points => {
  const unique = points.filter((p, i) => i === 0 || p[0] !== points[0][0] || p[1] !== points[0][1]);
  const ps = unique.length ? unique : points;
  return ps.length ? [ps.reduce((s,p) => s+p[0],0)/ps.length, ps.reduce((s,p) => s+p[1],0)/ps.length] : [0,0];
};
const selectedGeometry = result => result?.selectedArea?.geometry;
const contextOf = result => result?.siteContext ?? result?.context ?? {};
const roadsCoordinates = road => road.geometry?.coordinates ?? road.geometry ?? [];
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const pointInRing = (point,ring) => {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
};
const pointInGeometry = (point,geometry) => polygonCoordinates(geometry).some(poly=>poly[0]?.length&&pointInRing(point,poly[0])&&!poly.slice(1).some(hole=>pointInRing(point,hole)));
// Visual tone only. This deliberately does not produce a buildability constraint.
const parcelTone = (building,parcel) => {
  if(!parcel)return false;
  return allPoints(building).some(p=>pointInGeometry(p,parcel))||allPoints(parcel).some(p=>pointInGeometry(p,building));
};
export const canDrawHousing = (result, scenario) => Boolean(
  result?.housingRoute==='supported' && scenario?.concept?.buildings?.length && scenario.visualizationAllowed !== false && scenario.suppressed !== true &&
  scenario.options?.find(o=>o.id===scenario.activeOptionId)?.useStatus !== 'unresolved' &&
  !(scenario.concept.evidenceVersion&&result.caseId&&scenario.concept.evidenceVersion!==result.caseId) &&
  scenario.concept.allowed !== false && result?.housingRoute !== 'prohibited' && result?.scenarioEligibility?.allowed !== false &&
  !(scenario.assessmentVersion && result?.version?.assessment && scenario.assessmentVersion !== result.version.assessment) &&
  !(scenario.concept.roadContextVersion && scenario.concept.roadContextVersion !== contextOf(result).renderVersion) &&
  !(scenario.concept.contextVersion && contextOf(result).geometryVersion && scenario.concept.contextVersion !== contextOf(result).geometryVersion)
);

/**
 * Site scene in local metres. Geographic input is never stretched to fit a shape.
 * getAnchors() returns CSS-pixel {x,y,visible} points relative to this host.
 * capture() returns a PNG data URL. scenechange fires after a camera/render change.
 */
export function createSiteScene(host, {result, scenario, onSelectFeature, onReady, onViewChange} = {}) {
  let currentResult = result ?? {}, currentScenario = scenario ?? null;
  let disposed = false, renderer, controls, observer, frame = 0, view = '3d', focusMode = 'selection';
  let width = 1, height = 1, initializedCamera = false, revealStart = 0, lastScenarioKey = '', lastParcelScope = '', lastRenderVersion = '', hadContext = false, cameraTouched = false, hasMeasuredSize = false, readyReported = false, pendingFit = false;
  let origin = average(allPoints(selectedGeometry(currentResult)));
  let xScale = Math.max(.001, EARTH_METRES*Math.cos(origin[1]*Math.PI/180));
  let focusCenter = new THREE.Vector3(), focusSpan = 150, activeHighlight = '', fitWidth = 150, fitHeight = 150;
  const world = new THREE.Scene();
  world.background = new THREE.Color(PAPER);
  const camera = new THREE.OrthographicCamera(-100,100,80,-80,.1,6000);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const root = new THREE.Group();
  const contextGroup = new THREE.Group(), landGroup = new THREE.Group(), proposalGroup = new THREE.Group(), roadGroup = new THREE.Group(), placesGroup = new THREE.Group();
  root.add(roadGroup, contextGroup, landGroup, proposalGroup, placesGroup); world.add(root);
  const measurementGroup=new THREE.Group();root.add(measurementGroup);
  const anchors = new Map(), pickable = [], materials = new Set();
  const contextObjects = new Map(), placeObjects = new Map(), candidateObjects = new Map();
  const output = document.createElement('div'); output.className = 'site-scene-surface';
  output.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  host.append(output);
  const status = document.createElement('p'); status.className = 'site-scene-fallback';
  status.style.cssText = 'position:absolute;left:24px;bottom:20px;right:24px;margin:0;font:inherit;color:#535952;';
  status.hidden = true; status.setAttribute('role','status'); output.append(status);

  const project = ([lng,lat], y = 0) => new THREE.Vector3((lng-origin[0])*xScale,y,-(lat-origin[1])*EARTH_METRES);
  const centerOf = geometry => project(average(allPoints(geometry)));
  const makeMaterial = options => {
    const m = new THREE.MeshStandardMaterial({color:'#edede8',roughness:1,metalness:0,...options});
    materials.add(m); return m;
  };
  const areaMaterial = makeMaterial({color:'#d9dfd2',transparent:true,opacity:.38,depthWrite:false});
  const selectionMaterial = makeMaterial({color:'#9ec9ef',transparent:true,opacity:.56,depthWrite:false});
  const proposalMaterial = makeMaterial({color:'#f1f0e9',roughness:.88,transparent:false});
  const glazingMaterial=makeMaterial({color:'#adbfbe',roughness:.38,metalness:.12,side:THREE.DoubleSide});
  const roofMaterial=makeMaterial({color:'#4d9bc6',roughness:.95});
  const sillMaterial=makeMaterial({color:'#f1ede3',roughness:.95});
  const roadMaterial = new THREE.MeshBasicMaterial({color:'#d9ddda',side:THREE.DoubleSide}); materials.add(roadMaterial);
  const vergeMaterial = new THREE.MeshBasicMaterial({color:'#e9ebe6',side:THREE.DoubleSide});materials.add(vergeMaterial);
  const whiteHandle = makeMaterial({color:'#ffffff'});
  const darkHandle = makeMaterial({color:'#4d514d'});
  const outlineMaterial = new THREE.LineBasicMaterial({color:BLUE,depthTest:false}); materials.add(outlineMaterial);
  const parcelOutlineMaterial = new THREE.LineBasicMaterial({color:'#9dab95',transparent:true,opacity:.7}); materials.add(parcelOutlineMaterial);
  const edgeMaterial = new THREE.LineBasicMaterial({color:'#b5bbb0',transparent:true,opacity:.35}); materials.add(edgeMaterial);
  const placeMaterial=new THREE.MeshBasicMaterial({color:BLUE,depthTest:false,depthWrite:false});materials.add(placeMaterial);
  const placeHaloMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',depthTest:false,depthWrite:false});materials.add(placeHaloMaterial);

  function disposeChildren(group) {
    for (const child of [...group.children]) {
      child.traverse(node => {
        node.geometry?.dispose();
        if (node.userData.ownMaterial) {
          for (const mat of [node.material].flat().filter(Boolean)) {mat.map?.dispose();mat.dispose(); materials.delete(mat);}
        }
      });
      group.remove(child);
    }
  }

  // Shape uses local east/north; rotation turns its extrusion axis into world up.
  function shapesFor(geometry) {
    const shapes = [];
    for (const polygon of polygonCoordinates(geometry)) {
      if (!polygon?.[0]?.length) continue;
      const ringPath = ring => ring.filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map(p => {
        const v = project(p); return new THREE.Vector2(v.x,-v.z);
      });
      const outer = ringPath(polygon[0]); if (outer.length < 4) continue;
      const shape = new THREE.Shape(outer);
      for (const ring of polygon.slice(1)) {const hole = ringPath(ring); if (hole.length >= 4) shape.holes.push(new THREE.Path(hole));}
      shapes.push(shape);
    }
    return shapes;
  }

  function meshFor(geometry, depth, material, base = 0) {
    const shapes = shapesFor(geometry); if (!shapes.length) return null;
    const geometry3d = depth > 0 ? new THREE.ExtrudeGeometry(shapes,{depth,bevelEnabled:false,steps:1,curveSegments:1}) : new THREE.ShapeGeometry(shapes);
    geometry3d.rotateX(-Math.PI/2); geometry3d.translate(0,base,0);
    const mesh = new THREE.Mesh(geometry3d,material);
    mesh.castShadow = depth > .2; mesh.receiveShadow = true; return mesh;
  }

  function outline(geometry, material, y) {
    const group = new THREE.Group();
    for (const polygon of polygonCoordinates(geometry)) for (const ring of polygon) {
      const points = ring.filter(p => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map(p => project(p,y));
      if (points.length < 3) continue;
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material));
    }
    return group;
  }

  function screenAnchor(position) {
    const p = position.clone().project(camera);
    return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=-1&&p.z<=1&&p.x>=-1&&p.x<=1&&p.y>=-1&&p.y<=1};
  }

  function renderFallback() {
    output.querySelector('svg')?.remove();
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 800 600'); svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Plan view of the selected land and retrieved surrounding footprints.');
    svg.style.cssText = 'width:100%;height:100%;background:'+PAPER+';';
    const points = allPoints(selectedGeometry(currentResult)).map(p=>project(p));
    const bounds = new THREE.Box3().setFromPoints(points.length?points:[new THREE.Vector3()]);
    bounds.expandByScalar(50); const size = bounds.getSize(new THREE.Vector3()), c = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(680/Math.max(size.x,1),450/Math.max(size.z,1));
    const path = (geometry,fill,stroke,lineWidth=1) => {
      const n = document.createElementNS(ns,'path');
      n.setAttribute('d',polygonCoordinates(geometry).map(poly=>poly.map(ring=>ring.map((p,i)=>{const v=project(p);return `${i?'L':'M'}${400+(v.x-c.x)*scale},${275+(v.z-c.z)*scale}`;}).join(' ')+' Z').join(' ')).join(' '));
      n.setAttribute('fill',fill);n.setAttribute('fill-rule','evenodd');n.setAttribute('stroke',stroke);n.setAttribute('stroke-width',lineWidth);svg.append(n);
    };
    for (const b of contextOf(currentResult).buildings??[]) path(b.geometry,'#e4e5df','#c8ccc2');
    if(!currentResult.parcel)for(const candidate of currentResult.parcelCandidates??[])path(candidate.geometry,'#dce4d633','#879681',1.5);
    path(currentResult.parcel?.geometry,'#e7ebdf','#a4b397');
    path(selectedGeometry(currentResult),'#bdd9f677',BLUE,2);
    if(canDrawHousing(currentResult,currentScenario))for(const b of currentScenario.concept.buildings)path(b.geometry,'#a9ccef',BLUE);
    output.prepend(svg); status.hidden=false;status.textContent='3D is unavailable on this device. Your land is shown in plan.';
    host.dataset.sceneMode='plan-fallback';onReady?.({mode:'plan',fallback:true});
  }

  try {
    renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none;';
    renderer.domElement.setAttribute('role','img');
    renderer.domElement.setAttribute('aria-label','Interactive 3D view of the selected land, mapped property and retrieved surrounding buildings.');
    output.prepend(renderer.domElement);
    controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .14; controls.enablePan = true;
    controls.minPolarAngle = .12; controls.maxPolarAngle = Math.PI*.46;
    controls.minZoom = .3; controls.maxZoom = 9; controls.zoomSpeed=.7; controls.rotateSpeed=.5;
    controls.addEventListener('change',requestRender);
    controls.addEventListener('start',()=>{cameraTouched=true;});
  } catch (error) {
    renderer?.dispose();renderer=null;host.dataset.sceneError='webgl-unavailable';
  }

  const hemisphere = new THREE.HemisphereLight('#ffffff','#bdc7b6',1.45); world.add(hemisphere);
  const sunlight = new THREE.DirectionalLight('#fff5df',2.65);sunlight.position.set(-180,320,170);
  sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);
  sunlight.shadow.bias=-.0003;sunlight.shadow.normalBias=.05;sunlight.shadow.radius=3;
  world.add(sunlight,sunlight.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),makeMaterial({color:'#f2f2ed'}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;world.add(ground);

  function requestRender() {if(!disposed&&renderer&&!frame)frame=requestAnimationFrame(draw);}
  function draw(now) {
    frame=0;if(disposed||!renderer)return;
    // The reusable host is initially built off-DOM, then mounted by findings.js.
    // Never fit or publish anchors against its temporary zero-size box.
    if(!hasMeasuredSize||host.clientWidth!==width||host.clientHeight!==height)resize();
    if(!hasMeasuredSize||!host.isConnected)return;
    if(pendingFit)moveCamera(focusMode);
    const moving=controls?.update()??false;
    if(revealStart){
      const t=Math.min(1,(now-revealStart)/260);
      proposalGroup.traverse(n=>{if(n.material&&n.userData.revealMaterial)n.material.opacity=.55+.45*t;});
      if(t<1)requestRender();else{revealStart=0;proposalGroup.traverse(n=>{if(n.userData.revealMaterial){n.material.opacity=1;n.material.transparent=false;}});}
    }
    renderer.render(world,camera);
    if(!readyReported){readyReported=true;onReady?.({mode:view,fallback:false});}
    host.dispatchEvent(new CustomEvent('scenechange'));
    onViewChange?.();
    if(moving)requestRender();
  }

  function resize() {
    if(disposed)return;
    const nextWidth=host.clientWidth,nextHeight=host.clientHeight;
    if(!host.isConnected||nextWidth<2||nextHeight<2)return;
    const firstMeasurement=!hasMeasuredSize,changedAspectClass=(width<600)!==(nextWidth<600)&&!cameraTouched;
    width=nextWidth;height=nextHeight;hasMeasuredSize=true;
    if(renderer){
      renderer.setSize(width,height,false);
      if(firstMeasurement||changedAspectClass)moveCamera(focusMode);else setProjection();
      requestRender();
    }
  }

  function setProjection() {
    const aspect=width/height, vertical=Math.max(fitHeight,fitWidth/aspect);
    focusSpan=vertical;
    camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
    camera.updateProjectionMatrix();
  }

  function nearbyRadius() {
    const points=allPoints(currentResult.parcel?.geometry??selectedGeometry(currentResult)).map(p=>project(p));
    const size=new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3());
    return Math.max(110,Math.min(200,Math.max(size.x,size.z)*.55+70));
  }

  function applyContextVisibility(mode) {
    const radius=mode==='selection'?Math.min(nearbyRadius(),125):nearbyRadius();
    const feature=placeObjects.has(mode)?anchors.get(mode):null;
    const rows=[...contextObjects.values()].map(mesh=>({...mesh.userData,id:mesh.userData.feature.id,sceneParentId:mesh.userData.feature.sceneParentId}));
    const visible=linkedBuildingIds(rows,item=>mode==='context'||item.onProperty||item.distance<=radius||feature&&item.center.distanceTo(feature)<=Math.min(80,radius));
    for(const [id,mesh]of contextObjects)mesh.visible=visible.has(id);
    for(const child of contextGroup.children)if(child.userData.outlineFor)child.visible=contextObjects.get(child.userData.outlineFor)?.visible??true;
    for(const[id,marker]of placeObjects)marker.visible=id===activeHighlight||id===mode;
  }

  function framingPoints(mode) {
    const selected=allPoints(selectedGeometry(currentResult)),parcel=allPoints(currentResult.parcel?.geometry);
    const focusedCandidate=candidateObjects.get(mode)?.userData.feature.geometry;
    const base=focusedCandidate?allPoints(focusedCandidate):['property','site'].includes(mode)&&parcel.length?[...selected,...parcel]:selected;
    const points=base.map(p=>project(p));
    if(!points.length)points.push(new THREE.Vector3(-12,0,-12),new THREE.Vector3(12,0,12));
    if(placeObjects.has(mode)&&anchors.has(mode))points.push(anchors.get(mode).clone());
    const route=routeReceipt(mode)?.route;
    if(route?.geometry?.coordinates)points.push(...route.geometry.coordinates.map(p=>project(p,.4)));
    if(['context','district','site','property'].includes(mode))for(const mesh of contextObjects.values()) {
      if(!mesh.visible||['site','property'].includes(mode)&&!mesh.userData.onProperty)continue;
      for(const p of allPoints(mesh.userData.feature.geometry)) {
        points.push(project(p));points.push(project(p,mesh.userData.feature.displayHeightMeters??0));
      }
    }
    const comparison=(currentScenario?.options?.length?currentScenario.options.map(o=>({...currentScenario,concept:o.concept,activeOptionId:o.id})):[currentScenario]).filter(v=>canDrawHousing(currentResult,v));
    for(const variant of comparison)for(const b of variant.concept.buildings)for(const p of allPoints(b.geometry)) {
      points.push(project(p));points.push(project(p,b.height||0));
    }
    return points;
  }

  function architecturalDirection() {
    const target=centerOf(selectedGeometry(currentResult));
    const points=[target,...allPoints(selectedGeometry(currentResult)).slice(0,4).map(p=>project(p,.3))];
    const meshes=[...contextObjects.values()].filter(m=>m.visible).flatMap(m=>m.children);
    root.updateMatrixWorld(true);
    let best,score=Infinity;
    // View across the site's edges, not directly along a street or facade.
    // The four diagonal alternatives let us favour an unobstructed site.
    const edge=allPoints(selectedGeometry(currentResult)).slice(0,2).map(p=>project(p));
    const outline=allPoints(selectedGeometry(currentResult)).map(p=>project(p)),longEdge=outline.slice(1).map((p,i)=>p.clone().sub(outline[i])).sort((a,b)=>b.length()-a.length())[0];
    const narrow=width<600;
    const azimuth=narrow&&longEdge?Math.atan2(longEdge.x,longEdge.z):edge.length===2?Math.atan2(edge[1].x-edge[0].x,edge[1].z-edge[0].z)+Math.PI/4:-.64;
    for(let i=0;i<(narrow?2:4);i++) {
      const angle=azimuth+i*Math.PI/(narrow?1:2),direction=new THREE.Vector3(Math.sin(angle),.74,Math.cos(angle)).normalize();
      let obstructed=0;
      for(const point of points) {
        const start=point.clone().addScaledVector(direction,800);
        raycaster.set(start,direction.clone().negate());raycaster.far=799.6;
        if(raycaster.intersectObjects(meshes,false).length)obstructed++;
      }
      if(obstructed<score){score=obstructed;best=direction;}
      if(!obstructed)break;
    }
    raycaster.far=Infinity;
    return best??new THREE.Vector3(-.7,.68,1).normalize();
  }

  function moveCamera(mode=focusMode, resetRotation=true) {
    focusMode=mode;
    if(!hasMeasuredSize||!host.isConnected){pendingFit=true;return;}
    pendingFit=false;
    applyContextVisibility(mode);
    const points=framingPoints(mode),direction=resetRotation?(view==='plan'?new THREE.Vector3(0,1,.00001):architecturalDirection()):camera.position.clone().sub(controls?.target??focusCenter).normalize();
    const upReference=view==='plan'?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
    const right=new THREE.Vector3().crossVectors(upReference,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const xs=points.map(p=>p.dot(right)),ys=points.map(p=>p.dot(up));
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const routeFocus=Boolean(routeReceipt(mode)),reserved=routeFocus&&width>680?Math.min(.43,370/width):0;
    const frame=subjectFrame(points.map(p=>[p.dot(right),p.dot(up)]),{aspect:width*(1-reserved)/height,padding:mode==='selection'?1.5:mode==='site'?1.6:1.2,minSpan:mode==='selection'?32:mode==='site'?70:70});
    fitWidth=frame.width/(1-reserved);fitHeight=frame.height;
    // Fit camera-space extents, including uncapped source heights. The old world-axis
    // span framed the ground while cutting off towers and putting the land at the edge.
    focusCenter.copy(right).multiplyScalar((minX+maxX)/2+fitWidth*reserved/2).addScaledVector(up,(minY+maxY)/2);
    setProjection();camera.zoom=1;
    const distance=Math.max(500,Math.max(fitWidth,fitHeight)*3);
    // OrbitControls keeps a quaternion derived from the initial camera up vector.
    // Keep world Y up in both modes; the almost vertical plan direction faces north.
    camera.up.set(0,1,0);camera.position.copy(focusCenter).addScaledVector(direction,distance);
    camera.lookAt(focusCenter);camera.updateProjectionMatrix();
    if(controls){controls.target.copy(focusCenter);controls.enableRotate=view!=='plan';controls.minPolarAngle=view==='plan'?0:.12;controls.maxPolarAngle=view==='plan'?.00002:Math.PI*.46;controls.update();controls.saveState();}
    const shadowSize=Math.min(800,Math.max(focusSpan*.8,45));
    sunlight.target.position.copy(focusCenter);
    // Consistent studio illumination keeps every camera orientation legible.
    // This light is illustrative; it is not a location/date solar calculation.
    sunlight.position.copy(focusCenter).addScaledVector(right,-180).addScaledVector(direction,170);
    sunlight.position.y=focusCenter.y+320;
    Object.assign(sunlight.shadow.camera,{left:-shadowSize,right:shadowSize,top:shadowSize,bottom:-shadowSize,near:1,far:1400});
    sunlight.shadow.camera.updateProjectionMatrix();initializedCamera=true;groundLabel();requestRender();
  }

  function buildLand() {
    const parcel=currentResult.parcel?.geometry,selected=selectedGeometry(currentResult);
    if(!parcel)for(const [i,candidate]of (currentResult.parcelCandidates??[]).entries()){
      const material=makeMaterial({color:['#e2e9da','#e9e4da','#dfe8e8'][i%3],transparent:true,opacity:.42,depthWrite:false});
      const mesh=meshFor(candidate.geometry,0,material,.05+i*.001);
      if(!mesh){material.dispose();materials.delete(material);continue;}
      mesh.userData={feature:{...candidate,kind:'parcel-candidate'},ownMaterial:true};landGroup.add(mesh);pickable.push(mesh);
      const lineMaterial=new THREE.LineBasicMaterial({color:['#7f9577','#998e75','#799294'][i%3],transparent:true,opacity:.86});materials.add(lineMaterial);
      const edge=outline(candidate.geometry,lineMaterial,.085+i*.001);edge.traverse(n=>{if(n.material)n.userData.ownMaterial=true;});landGroup.add(edge);
      const anchor=centerOf(candidate.geometry).setY(.12);
      for(const key of [candidate.key,candidate.id,candidate.key?'candidate:'+candidate.key:null].filter(Boolean)){
        candidateObjects.set(String(key),mesh);anchors.set(String(key),anchor.clone());
      }
    }
    const parcelMesh=meshFor(parcel,0,areaMaterial,.045);if(parcelMesh)landGroup.add(parcelMesh);
    landGroup.add(outline(parcel,parcelOutlineMaterial,.08));
    for(const member of currentResult.parcel?.members??[])landGroup.add(outline(member.geometry,parcelOutlineMaterial,.10));
    const selectedMesh=meshFor(selected,0,selectionMaterial,.11);if(selectedMesh){selectedMesh.renderOrder=3;landGroup.add(selectedMesh);}
    const perimeter=outline(selected,outlineMaterial,.16);perimeter.renderOrder=5;landGroup.add(perimeter);
    const coords=polygonCoordinates(selected)?.[0]?.[0]??[];
    const corners=coords.slice(0,coords.length>1&&coords[0][0]===coords.at(-1)[0]&&coords[0][1]===coords.at(-1)[1]?coords.length-1:coords.length);
    const selectedPoints=corners.map(p=>project(p));
    const size=new THREE.Box3().setFromPoints(selectedPoints).getSize(new THREE.Vector3());
    const radius=Math.max(.33,Math.min(.75,Math.max(size.x,size.z)*.015));
    for(const corner of corners){
      const dot=new THREE.Mesh(new THREE.SphereGeometry(radius,18,10),whiteHandle);
      dot.position.copy(project(corner,.23));dot.scale.y=.32;dot.renderOrder=6;landGroup.add(dot);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.13,radius*1.13,.09,24),darkHandle);base.position.copy(project(corner,.16));landGroup.add(base);
    }
    const land=centerOf(selected);anchors.set('land',land.clone().setY(.2));anchors.set('whole-site',land.clone().setY(.2));anchors.set('selection',land.clone().setY(.2));
    if(parcel){anchors.set('property',centerOf(parcel));anchors.set('parcel',centerOf(parcel));}
    anchors.set('context',land.clone().setY(.2));

  }

  function groundLabel(){
    for(const old of [...landGroup.children].filter(n=>n.userData.groundLabel)){old.geometry.dispose();old.material.map.dispose();old.material.dispose();materials.delete(old.material);landGroup.remove(old);}
    const selected=selectedGeometry(currentResult),size=new THREE.Box3().setFromPoints(allPoints(selected).map(p=>project(p))).getSize(new THREE.Vector3());
    root.updateMatrixWorld(true);
    const occluders=pickable.filter(m=>m.visible&&m.parent?.visible!==false&&['building','proposed-home'].includes(m.userData.feature?.kind));
    const visible=coordinate=>{const target=project(coordinate,.18),direction=target.clone().sub(camera.position);raycaster.set(camera.position,direction.clone().normalize());raycaster.far=direction.length()-.03;const hit=raycaster.intersectObjects(occluders,false).length;raycaster.far=Infinity;return !hit;};
    const points=allPoints(selected).map(p=>project(p)),box=new THREE.Box3().setFromPoints(points);
    const labelWidth=Math.max(3,Math.min(13,Math.min(size.x,size.z)*.58)),labelHeight=labelWidth/7;
    const geographic=(x,z)=>[origin[0]+x/xScale,origin[1]-z/EARTH_METRES];
    const proposed=canDrawHousing(currentResult,currentScenario)?currentScenario.concept.buildings:[];
    const occupied=[...proposed,...(canDrawHousing(currentResult,currentScenario)?currentScenario.concept.parking??[]:[]),...(contextOf(currentResult).buildings??[])];
    const boundary=polygonCoordinates(selected)[0]?.[0]??[];let longest=0,angle=0;for(let i=1;i<boundary.length;i++){const a=project(boundary[i-1]),b=project(boundary[i]),length=a.distanceTo(b);if(length>longest){longest=length;angle=Math.atan2(b.z-a.z,b.x-a.x);}}
    camera.updateMatrixWorld(true);const screenStart=new THREE.Vector3().project(camera),screenEnd=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)).project(camera);if(screenEnd.x<screenStart.x)angle+=Math.PI;const ca=Math.cos(angle),sa=Math.sin(angle);
    let chosen;
    for(let iz=1;iz<20&&!chosen;iz++)for(let ix=1;ix<20&&!chosen;ix++){
      const x=box.min.x+size.x*ix/20,z=box.max.z-size.z*iz/20;
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([dx,dz])=>geographic(x+dx*labelWidth/2*ca-dz*labelHeight/2*sa,z+dx*labelWidth/2*sa+dz*labelHeight/2*ca));
      const labelGeometry=[[corners.concat([corners[0]])]];
      const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const intersects=(a,b,c,d)=>turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0;
      const overlaps=b=>corners.some(p=>pointInGeometry(p,b.geometry))||allPoints(b.geometry).some(p=>pointInGeometry(p,labelGeometry))||polygonCoordinates(b.geometry).some(poly=>poly.some(r=>r.slice(1).some((p,i)=>corners.some((a,j)=>intersects(a,corners[(j+1)%4],r[i],p)))));
      if(corners.every(p=>pointInGeometry(p,selected))&&!occupied.some(overlaps)&&corners.every(visible))chosen={x,z};
    }
    if(!chosen)return;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=146;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#245c92';ctx.font='500 68px Outfit, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('SELECTED AREA · '+Math.round(currentResult.selectedArea?.squareMeters??0)+' m²',512,73,1000);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});materials.add(material);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(labelWidth,labelHeight),material);label.rotation.x=-Math.PI/2;label.rotateZ(-angle);label.position.set(chosen.x,.17,chosen.z);label.userData.ownMaterial=true;label.userData.groundLabel=true;label.renderOrder=4;landGroup.add(label);host.dataset.groundLabel='shown';
  }

  function buildContext() {
    const context=contextOf(currentResult);
    const buildings=sceneBuildings(context.buildings??[]);
    let approximations=0;
    for(const b of buildings){
      if(b.excludeFromScene)continue;
      const c=centerOf(b.geometry),distance=Math.hypot(c.x,c.z);
      const onProperty=b.onSelectedParcel===true||b.onParcel===true||parcelTone(b.geometry,currentResult.parcel?.geometry);
      const material=makeMaterial({color:onProperty?'#d9dfd0':b.display.placeholder?'#dadbd5':'#e7e5dc'});
      const group=new THREE.Group();
      for(const volume of b.volumes) {
        const mesh=meshFor(volume.geometry,volume.top-volume.base,material,volume.base+.025);
        if(mesh){group.add(mesh);pickable.push(mesh);}
      }
      const feature={...b,kind:'building',heightBasis:b.display.basis,displayHeightMeters:b.display.top,heightDescription:b.display.description,isHeightDiagram:b.display.approximate,isPlaceholder:b.display.placeholder};
      delete feature.sceneParts;delete feature.volumes;delete feature.bounds;delete feature.display;
      group.userData={feature,ownMaterial:true,onProperty,distance,center:c.clone(),baseColor:material.color.clone()};
      group.material=material;
      for(const mesh of group.children){mesh.userData.feature=feature;mesh.userData.owner=group;}
      contextGroup.add(group);contextObjects.set(b.id,group);
      anchors.set(b.id,c.clone().setY(b.volumes.length?b.display.top+.25:.2));
      // Source footprints remain visible even where parts replace parent volumes.
      const line=outline(b.geometry,edgeMaterial,.06);line.userData.outlineFor=b.id;contextGroup.add(line);
      if(b.display.approximate&&b.volumes.length)approximations++;
      if(distance>160)material.color.lerp(new THREE.Color(PAPER),Math.min(.25,(distance-160)/1400));
      group.userData.baseColor.copy(material.color);
    }
    const propertyFamily=linkedBuildingIds([...contextObjects.values()].map(mesh=>({...mesh.userData,id:mesh.userData.feature.id,sceneParentId:mesh.userData.feature.sceneParentId})),item=>item.onProperty);
    for(const [id,mesh]of contextObjects)mesh.userData.onProperty=propertyFamily.has(id);
    host.dataset.approximateBuildings=String(approximations);
    for(const region of currentScenario?.concept?.blockedRegions??[]) {
      if(region.geometry?.length)anchors.set(region.id,centerOf(region.geometry).setY(.3));
    }
    const receipts=[...(currentResult.priorityMeasurements??[]),...(currentScenario?.brief??[]).map(p=>p.answer)].filter(Boolean);
    const streets=new Map([...(context.roads??[]),...receipts.flatMap(m=>m.route?.streets??[])].map(r=>[r.id,r]));
    for(const road of streets.values()){
      let lines=roadsCoordinates(road);if(road.geometry?.type!=='MultiLineString')lines=[lines];
      for(const line of lines){
        const pts=line.filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1])).map(p=>project(p,.035));
        if(pts.length<2)continue;
        const width=streetWidth(road).metres;
        const local=pts.map(p=>[p.x,p.z]);
        roadGroup.add(streetMesh(local,width+1.4,vergeMaterial,.045),streetMesh(local,width,roadMaterial,.065));
        anchors.set(road.id,pts[Math.floor(pts.length/2)].clone());
      }
    }
    const measuredPlaces=[...(currentResult.priorityMeasurements??[]).map(m=>m.feature),...(currentScenario?.brief??[]).map(p=>p.answer?.feature)].filter(Boolean);
    const places=new Map([...(context.amenities??context.places??[]),...measuredPlaces].filter(p=>p?.id).map(p=>[p.id,p]));
    for(const place of places.values()){
      const p=place.coordinate??place.coordinates??place.location;
      const coordinate=Array.isArray(p)?p:Number.isFinite(p?.lng)?[p.lng,p.lat]:place.geometry?.type==='Point'?place.geometry.coordinates:allPoints(place.geometry).length?average(allPoints(place.geometry)):null;
      if(coordinate){
        anchors.set(place.id,project(coordinate,.4));
        const marker=new THREE.Group(),halo=new THREE.Mesh(new THREE.CircleGeometry(1.8,24),placeHaloMaterial),dot=new THREE.Mesh(new THREE.CircleGeometry(1.05,24),placeMaterial);
        halo.rotation.x=-Math.PI/2;dot.rotation.x=-Math.PI/2;dot.position.y=.02;halo.renderOrder=12;dot.renderOrder=13;
        marker.position.copy(project(coordinate,.4));marker.add(halo,dot);marker.visible=false;placesGroup.add(marker);placeObjects.set(place.id,marker);
        dot.userData.feature={...place,kind:place.kind??'place'};pickable.push(dot);
        if(place.kind==='parking'&&!anchors.has('parking'))anchors.set('parking',project(coordinate,.4));
        if(place.kind==='school'&&!anchors.has('school'))anchors.set('school',project(coordinate,.4));
      }
    }
    for(const measurement of context.measurements??[]){
      const endpoints=measurement.endpoints??[measurement.origin,measurement.destination];
      if(endpoints?.length!==2||!endpoints.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))continue;
      anchors.set(measurement.id,project(endpoints[1],.5));
    }
  }

  function buildProposal() {
    if(!canDrawHousing(currentResult,currentScenario))return;
    const concept=currentScenario.concept;
    const meshes=[];
    for(const b of concept.buildings){
      if(!Number.isFinite(b.height)||b.height<=0)continue;
      const pitched=b.typology!=='apartment',rise=pitched?Math.min(1.15,b.height*.21):.12,wallHeight=b.height-rise;
      const center=average(allPoints(b.geometry)),ring=polygonCoordinates(b.geometry)[0][0],local=ring.map(p=>project(p));
      const minSide=Math.min(local[0].distanceTo(local[1]),local[1].distanceTo(local[2])),factor=1-.16/minSide;
      const inset=polygonCoordinates(b.geometry).map(p=>p.map(r=>r.map(([x,y])=>[center[0]+(x-center[0])*factor,center[1]+(y-center[1])*factor])));
      const mesh=meshFor(inset,wallHeight,proposalMaterial,0);if(!mesh)continue;
      mesh.userData.feature={...b,kind:'proposed-home'};proposalGroup.add(mesh);pickable.push(mesh);meshes.push(b);
      if(pitched){
        const corners=local.slice(0,4),front=corners[0].clone().lerp(corners[1],.5),back=corners[3].clone().lerp(corners[2],.5);
        const v=[...corners.map(p=>[p.x,wallHeight,p.z]),[front.x,b.height,front.z],[back.x,b.height,back.z]];
        const indices=[0,4,5,0,5,3,4,1,2,4,2,5,0,1,4,3,5,2],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(indices.flatMap(i=>v[i]),3));g.computeVertexNormals();
        const mat=roofMaterial.clone();mat.side=THREE.DoubleSide;materials.add(mat);const roof=new THREE.Mesh(g,mat);roof.userData.ownMaterial=true;roof.castShadow=true;roof.receiveShadow=true;proposalGroup.add(roof);
        const ridgeMaterial=new THREE.LineBasicMaterial({color:'#468aaf',transparent:true,opacity:.55});materials.add(ridgeMaterial);const ridge=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(front.x,b.height+.001,front.z),new THREE.Vector3(back.x,b.height+.001,back.z)]),ridgeMaterial);ridge.userData.ownMaterial=true;proposalGroup.add(ridge);
      }else{const cap=meshFor(b.geometry,.12,roofMaterial,b.height-.12);if(cap)proposalGroup.add(cap);}
      architecturalFacades({...b,wallHeight},concept.buildings);
      anchors.set(b.id,centerOf(b.geometry).setY(b.height+.7));
    }
    if(meshes[0]){const home=centerOf(meshes[0].geometry).setY(meshes[0].height+.7);anchors.set('homes',home);anchors.set('height',home.clone());}
    for(const parking of concept.parking??[]){
      const material=makeMaterial({color:'#aeb9b3',roughness:1});
      const mesh=meshFor(parking.geometry,0,material,.19);if(!mesh){material.dispose();materials.delete(material);continue;}
      mesh.userData={feature:{...parking,kind:'proposed-parking'},ownMaterial:true};proposalGroup.add(mesh);pickable.push(mesh);
      const stripe=new THREE.LineBasicMaterial({color:'#ffffff'});materials.add(stripe);const lines=outline(parking.geometry,stripe,.21);lines.traverse(n=>{if(n.material)n.userData.ownMaterial=true;});proposalGroup.add(lines);
      // A neutral car-sized block gives scale without changing the parking bay.
      const ring=polygonCoordinates(parking.geometry)[0][0],a=project(ring[0]),b=project(ring[1]),c=centerOf(parking.geometry);
      const car=new THREE.Mesh(new THREE.BoxGeometry(1.75,.65,3.9),sillMaterial);car.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);car.position.copy(c).setY(.65);car.castShadow=true;car.receiveShadow=true;proposalGroup.add(car);
      const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.5,.48,2.1),glazingMaterial);cabin.rotation.copy(car.rotation);cabin.position.copy(c).setY(1.18);cabin.castShadow=true;proposalGroup.add(cabin);
    }
    for(const geometry of concept.maneuver??[]){const mat=makeMaterial({color:'#dce2dc',roughness:1});const mesh=meshFor(geometry,0,mat,.175);if(mesh){mesh.userData.ownMaterial=true;proposalGroup.add(mesh);}}
    if(concept.parking?.[0])anchors.set('parking',centerOf(concept.parking[0].geometry).setY(.3));
  }

  // Illustrative facade rhythm stays on the calculated walls. It never changes
  // footprint, floor area, capacity or access evidence, and avoids party walls.
  function architecturalFacades(building,buildings){
    const ring=polygonCoordinates(building.geometry)[0]?.[0]??[],center=centerOf(building.geometry),storeys=building.storeys;
    const floorHeight=building.wallHeight/storeys;
    const toward=currentScenario.concept.siteDesign?.frontage?.nearestPoint?project(currentScenario.concept.siteDesign.frontage.nearestPoint):centerOf(currentScenario.concept.site);
    const faces=[];
    for(let edge=1;edge<ring.length;edge++){
      const a=project(ring[edge-1]),b=project(ring[edge]),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<2)continue;
      let nx=-dz/length,nz=dx/length;const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      if(nx*(mx-center.x)+nz*(mz-center.z)<0){nx=-nx;nz=-nz;}
      const outside=[origin[0]+(mx+nx*.1)/xScale,origin[1]-(mz+nz*.1)/EARTH_METRES];
      if(buildings.some(other=>other.id!==building.id&&pointInGeometry(outside,other.geometry)))continue;
      faces.push({a,b,dx,dz,length,nx,nz,score:nx*(toward.x-center.x)+nz*(toward.z-center.z)});
    }
    const entrance=faces.slice().sort((a,b)=>b.score-a.score)[0];
    for(const face of faces){
      const {a,dx,dz,length,nx,nz}=face,angle=Math.atan2(nx,nz);
      const box=(w,h,d,t,y,mat,offset=-.035)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(a.x+dx*t+nx*offset,y,a.z+dz*t+nz*offset);mesh.rotation.y=angle;mesh.castShadow=true;mesh.receiveShadow=true;proposalGroup.add(mesh);return mesh;};
      const bays=Math.max(2,Math.floor(length/2.5)),bayWidth=length/bays,ww=Math.min(1.35,bayWidth*.57),wh=Math.min(1.4,floorHeight*.53);
      for(let floor=0;floor<storeys;floor++)for(let bay=0;bay<bays;bay++){
        const t=(bay+.5)/bays,door=face===entrance&&floor===0&&bay===Math.floor(bays/2),h=door?Math.min(2.1,floorHeight-.12):wh,w=door?.94:ww,y=door?h/2:floorHeight*(floor+.54);
        box(w+.16,h+.16,.065,t,y,sillMaterial,-.043);
        box(w,h,.035,t,y,glazingMaterial,-.025);
        // Restrained vertical mullion and inset entry surround.
        if(!door)box(.045,h,.045,t,y,sillMaterial,-.03);
        else{box(.09,h+.12,.065,t-(w/2+.08)/length,y,sillMaterial);box(.09,h+.12,.065,t+(w/2+.08)/length,y,sillMaterial);}
      }
      if(building.typology==='apartment')for(let floor=1;floor<storeys;floor++)box(length-.18,.12,.065,.5,floor*floorHeight,sillMaterial,-.04);
    }
  }

  function routeReceipt(target){return [...(currentResult.priorityMeasurements??[]),...(currentScenario?.brief??[]).map(p=>p.answer)].map(m=>m?.measurement??m).find(m=>m?.id===target&&m.distanceType==='street-route'&&m.route?.geometry?.type==='LineString');}
  function streetMesh(points,width,material,height){
    const flat=streetTriangles(points,width),vertices=[];for(let i=0;i<flat.length;i+=2)vertices.push(flat[i],height,flat[i+1]);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return new THREE.Mesh(g,material);
  }

  function setHighlight(target='') {
    activeHighlight=target;
    disposeChildren(measurementGroup);
    const receipt=routeReceipt(target);
    if(receipt?.route?.geometry?.coordinates){
      const pts=receipt.route.geometry.coordinates.map(p=>{const v=project(p);return [v.x,v.z];});
      const material=new THREE.MeshBasicMaterial({color:'#d84c49',side:THREE.DoubleSide,depthTest:false,depthWrite:false});materials.add(material);
      const routeWidth=Math.max(1.5,fitWidth/Math.max(1,width)*3);
      const line=streetMesh(pts,routeWidth,material,.45);line.renderOrder=14;line.userData.ownMaterial=true;measurementGroup.add(line);
      for(const coordinate of [receipt.route.start,receipt.route.end]){
        const pin=new THREE.Group(),ring=new THREE.Mesh(new THREE.TorusGeometry(3,.8,8,24),material),stem=new THREE.Mesh(new THREE.ConeGeometry(1.7,4,16),material);
        ring.position.y=7;stem.rotation.z=Math.PI;stem.position.y=2;pin.add(ring,stem);pin.scale.setScalar(Math.max(1,fitWidth/Math.max(1,width)*2));pin.position.copy(project(coordinate,.5));pin.renderOrder=15;measurementGroup.add(pin);
      }
    }
    for(const [id,mesh]of contextObjects){mesh.material.color.copy(mesh.userData.baseColor);if(id===(receipt?.feature?.id??target))mesh.material.color.set('#d0dcc2');}
    const selectedCandidate=candidateObjects.get(String(target));
    for(const mesh of new Set(candidateObjects.values()))mesh.material.opacity=mesh===selectedCandidate ? .72 : .42;
    for(const[id,marker]of placeObjects)marker.visible=id===(receipt?.feature?.id??target)||id===(routeReceipt(focusMode)?.feature?.id??focusMode);
    proposalMaterial.color.set(target==='homes'||target==='height'?'#d8ebd7':'#f1f0e9');
    selectionMaterial.opacity=target==='land'||target==='selection'?.8:.56;
    requestRender();
  }

  function update(next={}) {
    if(disposed)return;
    if('result'in next)currentResult=next.result??{};
    if('scenario'in next)currentScenario=next.scenario;
    const parcelScope=JSON.stringify(currentResult.parcel?.geometry??(currentResult.parcelCandidates??[]).map(p=>p.geometry));
    const parcelScopeChanged=parcelScope!==lastParcelScope;lastParcelScope=parcelScope;
    const nextOrigin=average(allPoints(selectedGeometry(currentResult))),moved=Math.hypot((nextOrigin[0]-origin[0])*xScale,(nextOrigin[1]-origin[1])*EARTH_METRES)>1;
    origin=nextOrigin;xScale=Math.max(.001,EARTH_METRES*Math.cos(origin[1]*Math.PI/180));
    if(moved){cameraTouched=false;hadContext=false;}
    for(const group of [contextGroup,landGroup,proposalGroup,roadGroup,placesGroup])disposeChildren(group);
    proposalMaterial.opacity=1;proposalMaterial.transparent=false;
    anchors.clear();pickable.length=0;contextObjects.clear();placeObjects.clear();candidateObjects.clear();proposalGroup.scale.y=1;
    buildLand();buildContext();buildProposal();applyContextVisibility(focusMode);

    setHighlight(activeHighlight);
    const key=currentScenario?.concept?.id??currentScenario?.version?.scenario??'';
    const newProposal=key!==lastScenarioKey;
    const renderVersion=contextOf(currentResult).renderVersion??contextOf(currentResult).version??'';
    const contextChanged=renderVersion!==lastRenderVersion;lastRenderVersion=renderVersion;
    if(key&&key!==lastScenarioKey&&proposalGroup.children.length&&!reducedMotion()){revealStart=performance.now();proposalGroup.traverse(n=>{if(n.isMesh&&n.material===proposalMaterial){n.material.transparent=true;n.userData.revealMaterial=true;}});}else revealStart=0;
    lastScenarioKey=key;
    if(!renderer){renderFallback();return;}
    const hasContext=Boolean(contextOf(currentResult).buildings?.length);
    if(!initializedCamera||moved||!cameraTouched&&(hasContext&&!hadContext||parcelScopeChanged||contextChanged))moveCamera(focusMode);
    hadContext=hasContext;
    if(initializedCamera)groundLabel();
    requestRender();
  }

  let pointerStart;
  function pointerDown(event){pointerStart={x:event.clientX,y:event.clientY};}
  function pointerUp(event){
    if(!pointerStart||Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickable.filter(o=>o.visible&&o.parent?.visible!==false),false)[0];
    if(hit)onSelectFeature?.(hit.object.userData.feature);
  }
  function lost(event){event.preventDefault();status.textContent='The 3D view is reconnecting…';status.hidden=false;}
  function restored(){status.hidden=true;requestRender();}
  renderer?.domElement.addEventListener('pointerdown',pointerDown);
  renderer?.domElement.addEventListener('pointerup',pointerUp);
  renderer?.domElement.addEventListener('webglcontextlost',lost);
  renderer?.domElement.addEventListener('webglcontextrestored',restored);
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resize);observer.observe(host);}else globalThis.addEventListener('resize',resize);
  resize();update({result:currentResult,scenario:currentScenario});
  host.dataset.sceneMode=renderer?'3d':'plan-fallback';

  return {
    update,
    setView(next){if(disposed)return;view=next==='plan'?'plan':'3d';host.dataset.sceneMode=renderer?view:'plan-fallback';if(renderer)moveCamera(focusMode);},
    focus(mode){if(disposed)return;cameraTouched=true;moveCamera(['selection','property','context','district','site'].includes(mode)||routeReceipt(mode)||placeObjects.has(mode)||candidateObjects.has(String(mode))?mode:'site');},
    rotate(){if(disposed||!controls)return;cameraTouched=true;if(view==='plan'){view='3d';moveCamera(focusMode);}controls.enableRotate=true;controls.enableDamping=false;const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);camera.position.copy(controls.target).add(offset);controls.update();controls.enableDamping=true;moveCamera(focusMode,false);},
    setHighlight,
    getAnchors(){if(!renderer||!hasMeasuredSize||!host.isConnected)return {};camera.updateMatrixWorld();return Object.fromEntries([...anchors].map(([id,p])=>{const a=screenAnchor(p);if(contextObjects.has(id)&&!contextObjects.get(id).visible)a.visible=false;return[id,a];}));},
    capture(){if(!renderer||disposed)return null;renderer.render(world,camera);return renderer.domElement.toDataURL('image/png');},
    dispose(){
      if(disposed)return;disposed=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();globalThis.removeEventListener('resize',resize);controls?.dispose();
      renderer?.domElement.removeEventListener('pointerdown',pointerDown);renderer?.domElement.removeEventListener('pointerup',pointerUp);renderer?.domElement.removeEventListener('webglcontextlost',lost);renderer?.domElement.removeEventListener('webglcontextrestored',restored);
      world.traverse(node=>node.geometry?.dispose());for(const material of materials){material.map?.dispose();material.dispose();}sunlight.shadow.map?.dispose();renderer?.dispose();output.remove();
    }
  };
}
