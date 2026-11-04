import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js";

const vertex=`precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec4 color;
uniform mat4 viewProjection;
#include<instancesDeclaration>
#ifdef INSTANCES
attribute float floorHeight;
#endif
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vColor;
#ifdef TERRAIN
attribute vec2 uv;attribute vec2 uv2;
varying vec2 vTerrainUV;varying float vSurface;
varying float vTerrainLight;
#endif
void main(void){
#include<instancesVertex>
vec4 p=finalWorld*vec4(position,1.0);
#ifdef INSTANCES
vColor=vec4(color.rgb*instanceColor.rgb,color.a*instanceColor.a);
#else
vColor=color;
#endif
vNormal=normalize(normal.x*cross(finalWorld[1].xyz,finalWorld[2].xyz)+normal.y*cross(finalWorld[2].xyz,finalWorld[0].xyz)+normal.z*cross(finalWorld[0].xyz,finalWorld[1].xyz));
vPosition=p.xyz;gl_Position=viewProjection*p;
#ifdef TERRAIN
vTerrainUV=uv;vSurface=uv2.x;
vTerrainLight=0.54+0.46*max(dot(vNormal,normalize(vec3(-0.45,0.85,-0.3))),0.0);
#endif
}`;
const fragment=`precision highp float;
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vColor;
uniform sampler2D fogMask;uniform vec2 mapSize;uniform float fogEnabled;
#ifdef TERRAIN
uniform sampler2D groundMap;uniform sampler2D cliffMap;
uniform float groundReady;uniform float cliffReady;
varying vec2 vTerrainUV;varying float vSurface;
varying float vTerrainLight;
#endif
void main(void){
#ifdef TERRAIN
// The old road strips remain available only as the loading/error fallback.
if(vSurface>2.5&&groundReady>0.5)discard;
#endif
// A stable screen-door fade keeps depth and instance batching correct for wrecks.
#ifndef TERRAIN
if(abs(vColor.a)<0.999&&fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)>abs(vColor.a))discard;
#endif
vec2 uv=vec2(vPosition.x,-vPosition.z)/mapSize;
vec4 fog=texture2D(fogMask,clamp(uv,vec2(0.0),vec2(1.0)));
if(fogEnabled>0.5&&(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||fog.r<0.02))discard;
#ifdef TERRAIN
float light=vTerrainLight;
vec3 rgb=vColor.rgb*light;
if(vSurface<0.5&&groundReady>0.5){
 if(mapSize.x>4000.0){if(vPosition.x<3600.0)rgb=texture2D(groundMap,vec2(vTerrainUV.x*mapSize.x/3600.0,vTerrainUV.y)).rgb*light;}
 else rgb=texture2D(groundMap,vTerrainUV).rgb*light;
}
else if(vSurface>0.5&&vSurface<1.5&&cliffReady>0.5)rgb=texture2D(cliffMap,vTerrainUV).rgb*light;
#else
vec3 n=normalize(vNormal),sun=normalize(vec3(-0.45,0.85,-0.3));
float light=0.54+0.46*max(dot(n,sun),0.0);
vec3 rgb=vColor.rgb*(vColor.a<0.0?1.0:light);
// Restrained satin highlights reveal bevels without a post-processing pass.
if(vColor.a>0.0){vec3 halfDirection=normalize(sun+normalize(vec3(0.0,1.0,-1.0)));rgb+=vec3(0.075)*pow(max(0.0,dot(n,halfDirection)),28.0);}
#endif
float seen=fogEnabled>0.5?smoothstep(0.1,0.9,fog.g):1.0;
float grey=dot(rgb,vec3(0.299,0.587,0.114));
rgb=mix(mix(rgb,vec3(grey),0.8)*0.42,rgb,seen);
gl_FragColor=vec4(rgb,1.0);
}`;
const shadowVertex=`precision highp float;
attribute vec3 position;uniform mat4 viewProjection;
#include<instancesDeclaration>
attribute float floorHeight;
varying vec3 vPosition;varying float vOpacity;
void main(void){
#include<instancesVertex>
vec4 p=finalWorld*vec4(position,1.0);
#ifdef INSTANCESCOLOR
vOpacity=abs(instanceColor.a);
#else
vOpacity=1.0;
#endif
float altitude=max(0.0,p.y-floorHeight);
p.x+=altitude*0.42;p.z-=altitude*0.55;p.y=floorHeight+0.35;
vPosition=p.xyz;gl_Position=viewProjection*p;
if(floorHeight< -999.0)gl_Position=vec4(2.0,2.0,2.0,1.0);
}`;
const shadowFragment=`precision highp float;
varying vec3 vPosition;varying float vOpacity;uniform sampler2D fogMask;uniform sampler2D heightMap;
uniform vec2 mapSize;uniform float fogEnabled;
void main(void){
if(vOpacity<0.999&&fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)>vOpacity)discard;
vec2 uv=vec2(vPosition.x,-vPosition.z)/mapSize;
vec4 terrain=texture2D(heightMap,uv);
if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0||terrain.g<0.5||abs(terrain.r*255.0-vPosition.y)>3.5)discard;
if(fogEnabled>0.5&&texture2D(fogMask,uv).g<0.5)discard;
gl_FragColor=vec4(0.015,0.035,0.045,0.3);
}`;

export function materials(scene) {
  const main=new ShaderMaterial("signal-solid",scene,{vertexSource:vertex,fragmentSource:fragment},{
    attributes:["position","normal","color","floorHeight"],uniforms:["world","viewProjection","mapSize","fogEnabled"],samplers:["fogMask"]});
  main.backFaceCulling=false;
  const terrain=new ShaderMaterial("signal-terrain",scene,{vertexSource:vertex,fragmentSource:fragment},{
    attributes:["position","normal","color","uv","uv2"],
    uniforms:["world","viewProjection","mapSize","fogEnabled","groundReady","cliffReady"],
    samplers:["fogMask","groundMap","cliffMap"],defines:["#define TERRAIN"]});
  terrain.backFaceCulling=false;terrain.setFloat("groundReady",0);terrain.setFloat("cliffReady",0);
  const shadow=new ShaderMaterial("signal-shadow",scene,{vertexSource:shadowVertex,fragmentSource:shadowFragment},{
    attributes:["position","color","floorHeight"],uniforms:["world","viewProjection","mapSize","fogEnabled"],samplers:["fogMask","heightMap"],needAlphaBlending:true});
  shadow.backFaceCulling=false;shadow.disableDepthWrite=true;
  // Stamp each pixel only once: overlapping limbs do not darken a shadow twice.
  shadow.stencil.enabled=true;shadow.stencil.func=Constants.NOTEQUAL;shadow.stencil.funcRef=1;
  shadow.stencil.opStencilDepthPass=Constants.REPLACE;
  return {main,shadow,terrain};
}
