(async () => {
    await Promise.all([
        'https://rpgen3.github.io/lib/lib/jquery-3.5.1.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.26/Tone.js'
    ].map(v => import(v)));
    const rpgen3 = await Promise.all([
        'input'
    ].map(v => import(`https://rpgen3.github.io/mylib/export/${v}.mjs`))).then(v => Object.assign({},...v));
    const h = $('body').css({
        'text-align': 'center',
        padding: '1em'
    });
    $('<h1>').appendTo(h).text('耳コピする');
    const msg = (()=>{
        const elm = $('<div>').appendTo(h);
        return (str, isError) => $('<span>').appendTo(elm.empty()).text(str).css({
            color: isError ? 'red' : 'blue',
            backgroundColor: isError ? 'pink' : 'lightblue'
        });
    })();
    $('<input>').appendTo(h).prop({
        type: 'file',
        accept: 'audio/*'
    }).on('change', e => {
        msg('読み込み中');
        const fr = new FileReader;
        fr.onload = () => load(fr.result);
        fr.readAsArrayBuffer(e.target.files[0]);
    });
    const dl = $('<dl>').appendTo(h).hide();
    const addBtn = (ttl, func) => $('<button>').appendTo(dl).text(ttl).on('click', func);
    const bpmMin = 40,
          bpmMax = 300;
    const inputBPM = rpgen3.addInputNum(dl,{
        label: 'BPM',
        save: true,
        value: 140,
        min: bpmMin,
        max: bpmMax
    });
    let calcBPM = new class {
        constructor(){
            this.old = 0;
            this.ar = [];
        }
        main(){
            const now = performance.now(),
                  bpm = 1 / (now - this.old) * 1000 * 60;
            this.old = now;
            if(bpm < bpmMin || bpm > bpmMax) return;
            this.ar.push(bpm);
            inputBPM(this.ar.reduce((p,x) => p + x) / this.ar.length);
        }
    };
    addBtn('タップでBPM計測', () => calcBPM.main());
    addBtn('計測リセット', () => {
        calcBPM = new calcBPM.constructor();
    });
    new class {
        constructor(){
            this.a = addBtn('音楽再生', () => this.play());
            this.b = addBtn('音楽停止', () => this.stop()).hide();
        }
        play(){
            this.a.hide();
            this.b.show();
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuf;
            src.connect(analy).connect(audioCtx.destination);
            src.start(0);
            this.src = src;
        }
        stop(){
            this.a.show();
            this.b.hide();
            this.src.stop();
        }
    };
    const inputUnit = rpgen3.addSelect(dl,{
        label: '採譜する単位',
        save: true,
        value: '１６分音符',
        list: {
            '４分音符': 1,
            '８分音符': 2,
            '１６分音符': 4,
        }
    });
    const inputLimit = rpgen3.addInputNum(dl,{
        label: '採譜の下限値',
        save: true,
        value: 127,
        min: 0,
        max: 255
    });
    new class {
        constructor(){
            this.a = addBtn('測定start', () => this.play());
            this.b = addBtn('測定stop', () => this.stop()).hide();
        }
        play(){
            this.a.hide();
            this.b.show();
            this.func = timer(cooking, 60 * 1000 / inputBPM / inputUnit);
        }
        stop(){
            this.a.show();
            this.b.hide();
            this.func();
        }
    };
    const resetBtn = addBtn('採譜reset', () => {
        if(!confirm('採譜したデータを消去しますか？')) return;
        g_music = [];
    });
    const outputBtn = addBtn('保存', () => {
        makeTextFile('採譜データ', g_music.map(v => v.map(v => v).join(' ')).join('\n'));
    });
    new class {
        constructor(){
            this.a = addBtn('採譜結果を再生', () => this.start());
            this.b = addBtn('採譜結果を停止', () => this.stop()).hide();
        }
        play(){
            this.a.hide();
            this.b.show();
            this.func = demo();
        }
        stop(){
            this.a.show();
            this.b.hide();
            this.func();
        }
    };
    const makeTextFile = (ttl, str) => $('<a>').prop({
        download: ttl + '.txt',
        href: URL.createObjectURL(new Blob([str], {
            type: 'text/plain'
        }))
    }).get(0).click();
    let audioCtx, audioBuf, analy, freq;
    const load = async arrBuf => {
        audioCtx = new AudioContext;
        audioBuf = await audioCtx.decodeAudioData(arrBuf);
        analy = audioCtx.createAnalyser();
        analy.fftSize = 2 << 14;
        freq = new Uint8Array(analy.frequencyBinCount);
        setting();
        msg('読み込み完了');
        dl.show();
    };
    const timer = (func, ms) => {
        let id, old = 0;
        const loop = () => {
            const now = performance.now();
            if (ms <= now - old) {
                old = now;
                func();
            }
            id = requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    };
    let hzRange, g_music, g_min;
    const setting = () => {
        g_min = Math.min(...g_loudness);
        hzRange = g_music = [];
        const arr = [];
        for(const [i,v] of freq.entries()){
            const hz = i * 44100 / analy.fftSize;
            arr.push(hz);
            if(hz > piano.hzLast) break;
        }
        let prev = 0;
        for(const [i,v] of piano.hz.entries()){
            const next = Infinity || piano.hz[i + 1],
                  r = [];
            for(let j = prev; j < arr.length; j++){
                const hz = arr[j];
                if(hz > next) {
                    prev = j;
                    break;
                }
                r.push(j);
            }
            hzRange.push(r);
        }
    };
    const cooking = () => {
        analy.getByteFrequencyData(freq);
        const arr = [];
        for(const i of piano.hz.keys()){
            const r = hzRange[i],
                  sum = r.reduce((p,x) => p + freq[x], 0);
            arr.push(sum / r.length * (g_min / g_loudness[i]));
        }
        const output = [];
        for(const [i,v] of arr.entries()){
            if(v >= inputLimit) output.push(i);
        }
        if(inputDebug !== false) g_music.push(arr[inputDebug]);
        else g_music.push(output);
    };
    const piano = (()=>{
        const semiTone = Math.exp(1/12 * Math.log(2)),
              hz = [...new Array(87)].reduce((p, x)=>(p.unshift(p[0] * semiTone), p), [27.5]).reverse(),
              hzLast = hz[hz.length - 1];
        const ar = [],
              ptn = 'AABCCDDEFFGG',
              idxs = ptn.split('').map(v => ptn.indexOf(v));
        for(const i of hz.keys()){
            const j = i % ptn.length;
            ar.push(ptn[j] + (idxs.includes(j) ? '' : '#') + ((i + 9) / ptn.length | 0));
        }
        return {hz, hzLast, hzToNote: ar};
    })();
    const inputDebug = (()=>{
        const list = {},
              {hz, hzToNote} = piano,
              value = '測定しない';
        list[value] = false;
        for(const i of hz.keys()) list[hzToNote[i]] = i;
        return rpgen3.addSelect(dl,{
            lebel: '音階の値を測定(debug用)',
            list, value
        });
    })();
    const demo = () => {
        const {Tone} = window,
              synth = new Tone.Synth().toMaster();
        const data = g_music.map(v => v.length ? v.map(v => ({
            note: piano.hzToNote[v],
            dur: inputUnit * 4 + 'n'
        })) : null);
        const seq = new Tone.Sequence((time, {note, dur}) => {
            synth.triggerAttackRelease(note, dur, time);
        }, data, '4n').start(0);
        seq.loop = false;
        Tone.Transport.bpm.value = inputBPM();
        Tone.Transport.start();
        return () => Tone.Transport.stop();
    };
    const g_loudness = await (async () => {
        const res = await fetch('loudness.txt');
        return res.ok ? (await res.text()).split('\n').map(v => +v) : [...new Array(88)].fill(1);
    })();
})();
