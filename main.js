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
    }();
    addBtn('タップでBPM計測', () => calcBPM.main());
    addBtn('計測リセット', () => {
        calcBPM = new calcBPM.constructor();
    });
    const play = () => {
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(analy).connect(audioCtx.destination);
        src.start(0);
    };
    addBtn('音楽再生', play);
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
    let stopFunc, unitTime;
    const startBtn = addBtn('測定start', () => {
        stopFunc = timer(cooking, 60 * 1000 / inputBPM / inputUnit);
        startBtn.hide();
        stopBtn.show();
    });
    const stopBtn = addBtn('測定stop', () => {
        stopFunc();
        startBtn.show();
        stopBtn.hide();
    }).hide();
    const resetBtn = addBtn('採譜reset', () => {
        if(!confirm('採譜したデータを消去しますか？')) return;
        g_music = [];
    });
    const outputBtn = addBtn('保存', () => {
        makeTextFile('採譜データ', g_music.map(v => v.map(v => v).join(' ')).join('\n'));
    });
    let stopFunc2;
    const playBtn2 = addBtn('採譜結果を再生', () => {
        stopFunc2 = demo();
        playBtn2.hide();
        stopBtn2.show();
    });
    const stopBtn2 = addBtn('採譜結果を停止', () => {
        stopFunc2();
        playBtn2.show();
        stopBtn2.hide();
    }).hide();
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
        analy.fftSize = 2048;
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
    let pianoHzMap, g_music, g_min;
    const setting = () => {
        g_min = Math.min(...g_loudness);
        pianoHzMap = g_music = [];
        const arr = [];
        for(const [i,v] of freq.entries()){
            const hz = i * 44100 / analy.fftSize;
            arr.push(hz);
            if(hz > piano.hzLast) break;
        }
        let prev = 0;
        for(const [i,v] of piano.hz.entries()){
            const next = Infinity || piano.hz[i + 1],
                  m = new Map;
            for(let j = prev; j < arr.length; j++){
                const hz = arr[j];
                m.set(j, 114514); // 距離を求める
                if(hz > next) {
                    prev = j;
                    break;
                }
            }
            pianoHzMap.push(m);
        }
    };
    const cooking = () => {
        analy.getByteFrequencyData(freq);
        const arr = [];
        for(const [i,v] of piano.hz.entries()){
            const m = pianoHzMap[i];
            let sum = 0;
            for(const [i,v] of m.entries()) sum += freq[i] * v;
            arr.push(sum / m.size * (g_min / g_loudness[i]));
        }
        const output = [];
        for(const [i,v] of arr.entries()){
            if(v >= inputLimit) output.push(i);
        }
        g_music.push(output);
        if(inputDebug !== false) msg(arr[inputDebug()]);
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
        for(const i of hz.keys()) list[hzToNote[i]] = i;
        list[value] = false;
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
    const g_loudness = await(await fetch('loudness.txt')).text().then(v=>v.split('\n').map(v=>Number(v))).catch(()=>[...new Array(88)].map(v=>1));
})();
