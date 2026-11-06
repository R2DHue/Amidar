/* Original contemporary sound design: synthesized locally, no samples or music libraries. */
'use strict';
class AmidarAudio {
  constructor(){this.ctx=null;this.enabled=true;this.lastDot=-1;}
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
        this.ctx=new C();const c=this.ctx;
        this.master=c.createGain();this.master.gain.value=.38;
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;
        limiter.ratio.value=5;this.master.connect(limiter);limiter.connect(c.destination);
        // A quiet stereo ambient tail, not an oscillator's bare calculator beep.
        const reverb=c.createConvolver(),ir=c.createBuffer(2,Math.floor(c.sampleRate*.65),c.sampleRate);
        let seed=98765;
        for(let ch=0;ch<2;ch++){const a=ir.getChannelData(ch);for(let i=0;i<a.length;i++){
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          a[i]=((seed/4294967296)*2-1)*Math.pow(1-i/a.length,3)*.22;
        }}
        reverb.buffer=ir;this.wet=c.createGain();this.wet.gain.value=.22;
        this.wet.connect(reverb);reverb.connect(this.master);
      }
      if(this.ctx.state!=='running')this.ctx.resume().catch(()=>{});
      // iOS: run a silent sample in the originating user gesture.
      const b=this.ctx.createBufferSource();b.buffer=this.ctx.createBuffer(1,1,this.ctx.sampleRate);
      b.connect(this.master);b.start();
    }catch(e){/* Game remains playable without audio. */}
  }
  tone(hz,at,duration,volume=.2,type='sine',endHz=null,pan=0){
    const c=this.ctx,t=c.currentTime+at,o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(hz,t);
    if(endHz)o.frequency.exponentialRampToValueAtTime(endHz,t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);
    if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;g.connect(p);p.connect(this.master);p.connect(this.wet);}
    else{g.connect(this.master);g.connect(this.wet);}
    o.start(t);o.stop(t+duration+.02);
  }
  noise(at,duration,volume,frequency,endFrequency){
    const c=this.ctx,t=c.currentTime+at,b=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate);
    const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const s=c.createBufferSource();s.buffer=b;
    const f=c.createBiquadFilter();f.type='bandpass';f.Q.value=.8;
    f.frequency.setValueAtTime(frequency,t);f.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);
    const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    s.connect(f);f.connect(g);g.connect(this.master);g.connect(this.wet);s.start(t);
  }
  play(event){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const c=this.ctx;
    if(event==='dot'){
      if(c.currentTime-this.lastDot<.055)return;this.lastDot=c.currentTime;
      // Soft glass / marimba transient with a detuned, rapidly-decaying overtone.
      const p=[523.25,659.25,783.99,987.77][Math.floor(c.currentTime*3)%4];
      this.tone(p,0,.105,.15,'sine',p*.985,-.12);
      this.tone(p*2.006,0,.045,.045,'sine',null,.18);
    }else if(event==='paint'){
      [523.25,783.99,1046.5].forEach((f,i)=>this.tone(f,i*.045,.24,.13,'sine',null,(i-1)*.35));
      this.noise(0,.15,.045,1400,4200);
    }else if(event==='jump'){
      this.noise(0,.32,.14,450,5200);
      this.tone(180,0,.28,.21,'sine',760,-.25);
      this.tone(365,.035,.22,.075,'triangle',1520,.25);
    }else if(event==='death'){
      this.noise(0,.48,.25,1900,100);
      this.tone(140,0,.62,.55,'sine',35);
      this.tone(285,.02,.33,.12,'triangle',65,-.25);
      this.tone(430,.045,.32,.075,'sine',120,.25);
    }else if(event==='level'||event==='start'){
      const freqs=event==='level'?[261.63,329.63,392,493.88,587.33,783.99]:[329.63,440,659.25];
      freqs.forEach((f,i)=>{this.tone(f,i*.075,.46,.19,'sine',null,(i%2?1:-1)*.3);this.tone(f*2.003,i*.075,.18,.035);});
      this.noise(.03,.26,.06,900,5500);
    }else if(event==='bonus'){
      [659.25,987.77,1318.51].forEach((f,i)=>this.tone(f,i*.06,.32,.2,'sine',null,(i-1)*.3));
    }
  }
}
