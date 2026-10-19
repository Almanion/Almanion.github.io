/* Original Web Audio instruments; no downloads, autoplay or timers. */
(function(root){
 'use strict';const O=root.Orbital=root.Orbital||{};
 class Sound{
  constructor(){this.ctx=null;this._enabled=true;this.volume=.6;this.voices=new Set();this.last={};this.pending=[];this.engine=null;}
  get enabled(){return this._enabled;}
  set enabled(value){this._enabled=!!value;this.mix();if(!value)this.silence();}
  prepare(){
   if(this.master||!this.ctx)return;const c=this.ctx;this.master=c.createGain();this.master.gain.value=this.enabled?this.volume:0;
   const limit=c.createDynamicsCompressor();limit.threshold.value=-12;limit.knee.value=12;limit.ratio.value=6;limit.attack.value=.004;limit.release.value=.18;this.master.connect(limit);limit.connect(c.destination);
   this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.noise.getChannelData(0);let n=991;for(let i=0;i<data.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;data[i]=n/2147483648-1;}
  }
  mix(){if(!this.master)return;const p=this.master.gain,t=this.ctx.currentTime;p.cancelScheduledValues(t);p.setTargetAtTime(this.enabled?this.volume:0,t,.02);}
  setVolume(v){this.volume=Math.max(0,Math.min(1,Number(v)||0));this.mix();}
  async unlock(){
   if(!this.enabled)return;try{const AC=root.AudioContext||root.webkitAudioContext;if(!this.ctx){if(!AC)return;this.ctx=new AC();this.prepare();}if(this.ctx.state==='suspended')await this.ctx.resume();const queue=this.pending.splice(0);for(const name of queue)this.play(name);}catch{this.pending=[];}
  }
  voice({frequency=440,end=frequency,duration=.2,offset=0,type='sine',volume=.05,pan=0,noise=false,filter=6000}){
   if(!this.enabled||!this.ctx||this.ctx.state!=='running'||this.voices.size>=28)return;
   this.prepare();const c=this.ctx,t=c.currentTime+offset,source=noise?c.createBufferSource():c.createOscillator(),amp=c.createGain(),tone=c.createBiquadFilter(),stereo=c.createStereoPanner();
   if(noise){source.buffer=this.noise;source.loop=true;}else{source.type=type;source.frequency.setValueAtTime(frequency,t);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);}
   tone.type=noise?'bandpass':'lowpass';tone.frequency.setValueAtTime(filter,t);tone.Q.value=noise?.6:.4;
   amp.gain.setValueAtTime(.00001,t);amp.gain.exponentialRampToValueAtTime(Math.max(.00002,volume),t+.012);amp.gain.exponentialRampToValueAtTime(.00001,t+duration);
   stereo.pan.value=Math.max(-1,Math.min(1,pan));source.connect(tone);tone.connect(amp);amp.connect(stereo);stereo.connect(this.master);
   const nodes=[source,tone,amp,stereo];this.voices.add(source);source.onended=()=>{for(const n of nodes)n.disconnect();this.voices.delete(source);};source.start(t);source.stop(t+duration+.03);
  }
  play(name,pan=0){
   if(!this.enabled||root.document?.hidden)return;
   if(this.ctx?.state==='suspended'){this.pending=[name];return;}if(!this.ctx||this.ctx.state!=='running')return;
   const t=this.ctx.currentTime,gap={cargo:.075,gate:.12,flyby:.2,portal:.12,click:.05}[name]||0;if(t-(this.last[name]??-Infinity)<gap)return;this.last[name]=t;
   const v=(frequency,end,duration,volume=.06,offset=0,type='sine')=>this.voice({frequency,end,duration,volume,offset,type,pan});
   if(name==='launch'){v(90,220,.5,.15,0,'triangle');v(220,440,.32,.025,.06);this.voice({noise:true,filter:680,duration:.38,volume:.11,pan});}
   else if(name==='cargo'){v(880,880,.2,.07);v(1320,1320,.28,.04,.065);v(2640,2600,.14,.01,.065);}
   else if(name==='gate'){v(520,780,.16,.045);v(1040,1040,.18,.018,.05);}
   else if(name==='flyby'){[330,440,660].forEach((f,i)=>v(f,f*1.005,.32,.025,i*.055,'triangle'));}
   else if(name==='portal'){v(140,1050,.42,.06,0,'triangle');v(1050,210,.55,.035,.07);this.voice({noise:true,filter:1900,duration:.45,volume:.06,pan:-pan});}
   else if(name==='win'){[392,494,587,784].forEach((f,i)=>{v(f,f,.65,.06,i*.13,'triangle');v(f*2,f*2,.5,.012,i*.13);});}
   else if(name==='fail'){this.voice({noise:true,filter:260,duration:.3,volume:.1});v(155,65,.5,.1,0,'triangle');}
   else if(name==='upgrade'){[440,554,660,880].forEach((f,i)=>v(f,f,.35,.04,i*.085));}
   else v(650,500,.055,.018);
  }
  flight(active,speed=0){
   if(!active||!this.enabled||!this.ctx||this.ctx.state!=='running'||this.volume===0){this.stopEngine();return;}
   const c=this.ctx,t=c.currentTime;if(!this.engine){this.prepare();const a=c.createOscillator(),b=c.createOscillator(),g=c.createGain();a.type='sine';b.type='triangle';g.gain.value=0;a.connect(g);b.connect(g);g.connect(this.master);a.start();b.start();this.engine={a,b,g};}
   const {a,b,g}=this.engine,f=40+Math.min(500,speed)*.07;a.frequency.setTargetAtTime(f,t,.2);b.frequency.setTargetAtTime(f*1.5,t,.2);g.gain.setTargetAtTime(.018,t,.15);
  }
  stopEngine(){if(!this.engine)return;const {a,b,g}=this.engine,t=this.ctx.currentTime;g.gain.cancelScheduledValues(t);g.gain.setTargetAtTime(0,t,.025);a.stop(t+.15);b.stop(t+.15);a.onended=()=>{a.disconnect();b.disconnect();g.disconnect();};this.engine=null;}
  silence(){this.pending=[];this.stopEngine();for(const s of this.voices){try{s.stop();}catch{}}}
 }
 O.Sound=Sound;if(typeof module!=='undefined'&&module.exports)module.exports=Sound;
})(typeof globalThis!=='undefined'?globalThis:window);
