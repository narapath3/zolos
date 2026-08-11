import * as THREE from 'three';

const cache = new Map(), pending = new Map();
let renderer, scheduled = false;
const hash = value => { let h=2166136261; for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; };
const mat = (color, metalness=.15, roughness=.55) => new THREE.MeshStandardMaterial({color,metalness,roughness});
function add(scene, geometry, material, position=[0,0,0], rotation=[0,0,0]) { const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.rotation.set(...rotation);scene.add(m);return m; }

function buildItem(scene, name) {
  const lower=name.toLowerCase(), seed=hash(name), accent=new THREE.Color().setHSL((seed%360)/360,.68,.48);
  const dark=mat(new THREE.Color(accent).multiplyScalar(.42),.25,.7), bright=mat(accent,.22,.38), metal=mat(seed%2?0xb7c3d0:0xc18a43,.82,.2);
  if (/potion|juice|milk|honey|jelly|mucus|ink|bottle/.test(lower)) {
    add(scene,new THREE.SphereGeometry(.52,22,16),bright,[0,-.18,0]).scale.set(.82,1,.76);
    add(scene,new THREE.CylinderGeometry(.20,.25,.42,14),bright,[0,.38,0]); add(scene,new THREE.CylinderGeometry(.25,.25,.18,14),dark,[0,.67,0]);
    add(scene,new THREE.TorusGeometry(.34,.055,7,24),metal,[0,-.05,.43],[Math.PI/2,0,0]);
  } else if (/pickaxe/.test(lower)) {
    add(scene,new THREE.CylinderGeometry(.075,.09,1.45,10),mat(0x6f4528,.05,.9),[0,-.05,0],[0,0,-.48]);
    add(scene,new THREE.CapsuleGeometry(.12,1.05,4,10),metal,[.16,.50,0],[0,0,Math.PI/2+.12]);
  } else if (/ore|stone|crystal|emperium|orides|elunium|zargon|phracon|coal|sand|essence|heart|core/.test(lower)) {
    [[0,0,0,.62],[-.35,-.18,.05,.42],[.36,-.2,.02,.46]].forEach(([x,y,z,s],i)=>{const m=add(scene,new THREE.OctahedronGeometry(s,1),i?dark:bright,[x,y,z]);m.rotation.z=(i-1)*.28;});
  } else if (/horn|claw|tooth|fang|scale|shell/.test(lower)) {
    add(scene,new THREE.ConeGeometry(.38,1.35,18,4),mat(0xd8c49c,.08,.52),[0,0,0],[0,0,-.48]).scale.set(1,1,.72);
    add(scene,new THREE.TorusGeometry(.34,.08,8,22),metal,[-.28,-.48,0],[Math.PI/2,0,0]);
  } else if (/root|vine|wood|clover|herb|banana|carrot|apple|grape|candy|cookie|fish/.test(lower)) {
    add(scene,new THREE.IcosahedronGeometry(.58,2),bright).scale.set(.82,1.08,.72); add(scene,new THREE.ConeGeometry(.18,.55,12),mat(0x4c8d3c,.05,.82),[.15,.56,0],[0,0,-.38]);
  } else if (/feather|fur|fluff|skin|garment/.test(lower)) {
    add(scene,new THREE.CapsuleGeometry(.28,.72,6,14),bright,[0,0,0],[0,0,-.38]).scale.z=.28;
    add(scene,new THREE.CylinderGeometry(.035,.05,1.25,8),mat(0xead9b5,.05,.75),[0,-.05,.16],[0,0,-.38]);
  } else if (/coin|ingot|screw|ring|earring/.test(lower)) {
    add(scene,new THREE.TorusGeometry(.48,.14,12,30),metal,[0,0,0],[Math.PI/2.8,0,.25]); add(scene,new THREE.CylinderGeometry(.36,.36,.14,28),metal,[.1,-.18,-.16],[Math.PI/2.8,0,.25]);
  } else { add(scene,new THREE.DodecahedronGeometry(.58,1),bright); add(scene,new THREE.TorusGeometry(.44,.06,8,28),metal,[0,0,.34]); }
}

function render(name) {
  if(cache.has(name))return cache.get(name); const scene=new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xeaf6ff,0x21180f,2.7));
  const key=new THREE.DirectionalLight(0xffdfae,4.5);key.position.set(-4,6,7);scene.add(key);const rim=new THREE.DirectionalLight(0x679cff,2);rim.position.set(5,3,-5);scene.add(rim);buildItem(scene,name);
  const camera=new THREE.PerspectiveCamera(30,1,.01,50);camera.position.set(0,.1,4);camera.lookAt(0,0,0);
  if(!renderer){renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});renderer.setSize(160,160,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;}
  renderer.setClearColor(0,0);renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/webp',.88);cache.set(name,url);scene.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});return url;
}
function schedule(){if(scheduled)return;scheduled=true;if('requestIdleCallback'in window)window.requestIdleCallback(flush,{timeout:250});else setTimeout(()=>flush(null),16);}
function flush(deadline){scheduled=false;for(const[name,images]of[...pending]){if(deadline&&!deadline.didTimeout&&deadline.timeRemaining()<5)break;pending.delete(name);try{const src=render(name);images.forEach(img=>{if(img.isConnected)img.src=src;});}catch{/* retain realistic pouch fallback */}}if(pending.size)schedule();}
export function observeItemPortraits(root=document.body){const hydrate=node=>{const images=node?.matches?.('img[data-item-model]')?[node]:[...(node?.querySelectorAll?.('img[data-item-model]')||[])];images.forEach(img=>{if(img.dataset.modelRequested)return;img.dataset.modelRequested='1';const name=img.dataset.itemModel;if(!pending.has(name))pending.set(name,[]);pending.get(name).push(img);});if(images.length)schedule();};hydrate(root);const observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(hydrate)));observer.observe(root,{childList:true,subtree:true});return observer;}
