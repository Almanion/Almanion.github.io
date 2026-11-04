import {Engine,Scene,ArcRotateCamera,Vector3,Color4,Color3,HemisphericLight,DirectionalLight,LoadAssetContainerAsync} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// Loaded on demand; galleries never create WebGL contexts or render loops.
export async function openModel(canvas,url,signal) {
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false});
  engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
  const scene=new Scene(engine);scene.clearColor=new Color4(.075,.105,.12,1);
  const camera=new ArcRotateCamera('inspection',-Math.PI/2,Math.PI/3,5,Vector3.Zero(),scene);
  camera.attachControl(canvas,true);camera.wheelDeltaPercentage=.012;
  camera.lowerBetaLimit=.05;camera.upperBetaLimit=Math.PI-.05;camera.panningSensibility=0;
  const sky=new HemisphericLight('softbox',new Vector3(0,1,0),scene);
  sky.intensity=.8;sky.groundColor=new Color3(.32,.38,.43);
  const key=new DirectionalLight('key',new Vector3(-.6,-1,.4),scene);key.intensity=1.5;
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;resize.disconnect();scene.dispose();engine.dispose();signal?.removeEventListener('abort',dispose);};
  const resize=new ResizeObserver(()=>{if(!disposed)engine.resize();});resize.observe(canvas);
  signal?.addEventListener('abort',dispose,{once:true});
  try {
    if(signal?.aborted)throw new DOMException('Closed','AbortError');
    const response=await fetch(url,{signal});if(!response.ok)throw Error('Файл недоступен.');
    const container=await LoadAssetContainerAsync(new Uint8Array(await response.arrayBuffer()),scene,{pluginExtension:'.glb'});
    if(disposed){container.dispose();throw new DOMException('Closed','AbortError');}
    container.addAllToScene();scene.stopAllAnimations();
    let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
    for(const mesh of container.meshes){
      if(!mesh.getTotalVertices())continue;
      mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
      min=Vector3.Minimize(min,box.minimumWorld);max=Vector3.Maximize(max,box.maximumWorld);
    }
    if(!Number.isFinite(min.x))throw Error('Не удалось определить размеры модели.');
    const center=min.add(max).scale(.5),radius=Math.max(.01,max.subtract(min).length()/2);
    const reset=()=>{
      const aspect=engine.getRenderWidth()/engine.getRenderHeight();
      const fov=Math.min(camera.fov,2*Math.atan(Math.tan(camera.fov/2)*aspect));
      camera.setTarget(center);camera.radius=radius/Math.sin(fov/2)*1.15;camera.alpha=-Math.PI/2;camera.beta=Math.PI/3;
      camera.minZ=radius*.001;camera.maxZ=radius*100;camera.lowerRadiusLimit=radius*.3;camera.upperRadiusLimit=radius*12;
    };
    engine.resize();reset();engine.runRenderLoop(()=>{if(!document.hidden&&!disposed)scene.render();});
    return {dispose,reset};
  }catch(error){dispose();throw error;}
}
