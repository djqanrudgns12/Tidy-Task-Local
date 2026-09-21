/** Original procedural cues: no third-party recording or network request. */
export function createPickerAudio() {
  /** @type {AudioContext|null} */ let ctx=null;
  let enabled=true;
  /** @type {Set<OscillatorNode>} */ const nodes=new Set();
  const stop=()=>{for(const n of nodes){try{n.stop();}catch{}}nodes.clear();};
  return {
    /** @param {boolean} value */ setEnabled(value){enabled=value;if(!value)stop();},
    async unlock(){try{ctx??=new AudioContext();await ctx.resume();}catch{}},
    /** @param {'move'|'grip'|'pop'|'result'|'shuffle'} cue */ play(cue){
      if(!enabled||!ctx||ctx.state!=='running')return;
      const notes=cue==='result'?[660,880]:cue==='pop'?[180]:cue==='grip'?[330]:cue==='shuffle'?[280,350]:[420];
      for(const [i,f] of notes.entries()){
        const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+i*.07;
        osc.type='sine';osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(cue==='pop'?60:f*1.08,t+.12);
        gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045,t+.009);gain.gain.exponentialRampToValueAtTime(.0001,t+.17);
        osc.connect(gain);gain.connect(ctx.destination);nodes.add(osc);
        osc.onended=()=>{nodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+.18);
      }
    },
    stop,
    dispose(){stop();void ctx?.close().catch(()=>{});ctx=null;},
  };
}
