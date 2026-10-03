import * as THREE from 'three';

// A perspective view keeps the land in the foreground, while retaining the
// actual route and destination at their true scale and position.
export function frameRouteFromSite(camera,{site,points,destination,aspect}){
  const bounds=new THREE.Box3().setFromPoints(site),center=bounds.getCenter(new THREE.Vector3());
  center.y=0;
  const size=bounds.getSize(new THREE.Vector3()),span=Math.max(22,size.x,size.z);
  let heading=destination.clone().sub(center).setY(0);
  if(heading.length()<1)heading.set(0,0,-1);
  heading.normalize();
  camera.aspect=aspect;camera.fov=65;camera.zoom=1;camera.near=.1;camera.far=Math.max(6000,...points.map(p=>p.distanceTo(center)*3));camera.updateProjectionMatrix();
  let scale=1;
  for(let i=0;i<60;i++,scale*=1.12){
    camera.position.copy(center).addScaledVector(heading,-span*1.0*scale);camera.position.y=span*.85*scale;
    camera.lookAt(center.clone().addScaledVector(heading,span*.65*scale));camera.updateMatrixWorld();
    if(points.every(p=>{const v=p.clone().project(camera);return Math.abs(v.x)<.84&&v.y>-.8&&v.y<.82&&v.z>-1&&v.z<1;}))break;
  }
  return {center,target:center.clone().addScaledVector(heading,span*.65*scale),span};
}
