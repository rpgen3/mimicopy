import('https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.26/Tone.js');
var piano = (()=>{
    const semiTone = Math.exp(1/12 * Math.log(2)),
          hz = [...new Array(87)].reduce((p, x) => ([p[0] * semiTone].concat(p)), [27.5]).reverse();
    const ar = [],
          ptn = 'AABCCDDEFFGG',
          idxs = ptn.split('').map(v => ptn.indexOf(v));
    for(const i of hz.keys()){
        const j = i % ptn.length;
        ar.push(ptn[j] + (idxs.includes(j) ? '' : '#') + ((i + 9) / ptn.length | 0));
    }
    return {semiTone, hz, hzToNote: ar};
})();
var a = s => new Tone.Synth().toMaster().triggerAttackRelease(s, "16n");
var b = n => a(piano.hzToNote[n - 1]);
