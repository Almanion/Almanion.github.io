/* Original synthesized effects: no audio files, network calls or autoplay. */
(function(root){
  'use strict';const O=root.Orbital=root.Orbital||{};
  class Sound {
    constructor(){this.ctx=null;this.enabled=true;}
    async unlock(){
      if(!this.enabled)return;
      try{
        const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
        if(!this.ctx)this.ctx=new AC();
        if(this.ctx.state==='suspended')await this.ctx.resume();
      }catch{/* Audio is optional; the game remains playable. */}
    }
    tone(frequency,duration=0.12,offset=0,type='sine',volume=0.045){
      if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      try{
        const t=this.ctx.currentTime+offset,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
        osc.type=type;osc.frequency.setValueAtTime(frequency,t);
        gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001,t+duration);
        osc.connect(gain);gain.connect(this.ctx.destination);osc.start(t);osc.stop(t+duration+0.03);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }catch{/* Unsupported audio hardware is not a fatal error. */}
    }
    play(name){
      if(name==='launch'){[180,300,450].forEach((f,i)=>this.tone(f,0.2,i*0.06,'triangle'));}
      else if(name==='cargo'){this.tone(880);this.tone(1320,0.16,0.07);}
      else if(name==='win'){[392,494,587,784].forEach((f,i)=>this.tone(f,0.4,i*0.13,'triangle'));}
      else if(name==='fail'){this.tone(170,0.3,0,'triangle');this.tone(110,0.35,0.12,'triangle');}
      else if(name==='upgrade'){[440,660,880].forEach((f,i)=>this.tone(f,0.24,i*0.09));}
      else this.tone(480,0.07,0,'sine',0.015);
    }
  }
  O.Sound=Sound;
})(typeof globalThis!=='undefined'?globalThis:window);
