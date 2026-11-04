// Visibility can change only inside the old or new observer footprints.
// A changed exploration contour may move distant corners of the known region,
// but cannot change pixels outside the old/new polygons and observer footprints.
export function fogUpdateRect(previous,next,world,width,height){
  const full={x:0,y:0,width,height};
  if(!previous||!next)return full;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=u=>{if(!u)return;left=Math.min(left,u.x-u.radius);top=Math.min(top,u.y-u.radius);
    right=Math.max(right,u.x+u.radius);bottom=Math.max(bottom,u.y+u.radius);};
  // Canvas rasterizes visibility as one compound path. Changing one contour
  // can slightly change antialias coverage on another contour's edge. Include
  // all observers to preserve those pixels exactly, even after death/spawning.
  for(const u of previous.observers)include(u);
  for(const u of next.observers)include(u);
  if(previous.exploredCode!==next.exploredCode){
    // Use actual smoothed polygons, not newly opened cell bounds: smoothing
    // can change an older stretch of boundary too. Retain both generations.
    if(!previous.exploredBounds||!next.exploredBounds)return full;
    for(const b of [previous.exploredBounds,next.exploredBounds]){
      left=Math.min(left,b.left);top=Math.min(top,b.top);
      right=Math.max(right,b.right);bottom=Math.max(bottom,b.bottom);
    }
  }
  if(!Number.isFinite(left))return full;
  // Include the antialiased edge, with identical world→texture orientation.
  const x=Math.max(0,Math.floor(left/world.W*width)-2),y=Math.max(0,Math.floor(top/world.H*height)-2),
    x2=Math.min(width,Math.ceil(right/world.W*width)+2),y2=Math.min(height,Math.ceil(bottom/world.H*height)+2);
  return x2>x&&y2>y?{x,y,width:x2-x,height:y2-y}:full;
}
