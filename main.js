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
    const header = $('<dl>').appendTo(h).hide(),
          footer = $('<dl>').appendTo(h).hide();
    const addBtn = (parent, ttl, func) => $('<button>').appendTo(parent).text(ttl).on('click', func);
    const selectMode = rpgen3.addSelect(footer,{
        label: 'モード選択',
        list: {
            '採譜': 0,
            'BPM測定': 1,
            'グラフ表示': 2,
            '周波数計測': 3
        }
    });
    const ui = [...new Array(4)].map(v => $('<dl>').appendTo(footer).hide());
    selectMode.elm.on('change', () => {
        ui.forEach(v => v.hide());
        ui[selectMode()].show();
    }).trigger('change');
    const bpmMin = 40,
          bpmMax = 300;
    const inputBPM = rpgen3.addInputNum(header,{
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
    addBtn(ui[1], 'タップでBPM計測', () => calcBPM.main());
    addBtn(ui[1], '計測リセット', () => {
        calcBPM = new calcBPM.constructor();
    });
    class toggleBtn {
        constructor(parent, ttl, ttl2){
            this.a = addBtn(parent, ttl, () => this.on());
            this.b = addBtn(parent, ttl2, () => this.off()).hide();
        }
        on(){
            this.a.hide();
            this.b.show();
        }
        off(){
            this.a.show();
            this.b.hide();
        }
    }
    new class extends toggleBtn {
        on(){
            super.on();
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuf
            src.connect(analy).connect(audioCtx.destination);;
            src.onended = () => this.off();
            src.start(0);
            this.src = src;
        }
        off(){
            super.off();
            this.src.stop();
        }
    }(header, '音楽を再生', '音楽を停止');
    const inputUnit = rpgen3.addSelect(ui[0],{
        label: '採譜する単位',
        save: true,
        value: '１６分音符',
        list: {
            '４分音符': 1,
            '８分音符': 2,
            '１６分音符': 4,
        }
    });
    const inputTopN = rpgen3.addInputNum(ui[0],{
        label: '上位の音から抽出(0なら全て)',
        save: true,
        value: 0,
        min: 0,
        max: 9
    });
    const inputLimit = rpgen3.addInputNum(header,{
        label: '採譜の下限値',
        save: true,
        value: 30,
        min: 0,
        max: 255
    });
    new class extends toggleBtn {
        on(){
            super.on();
            this.func = timer(cooking, {
                valueOf: () => 60 * 1000 / inputBPM / inputUnit
            });
        }
        off(){
            super.off();
            this.func();
            if(selectMode() === 3) {
                g_music.push(['max:' + debugMax]);
                debugMax = 0;
            }
        }
    }(header, '処理start', '処理stop');
    const resetBtn = addBtn(ui[0], '採譜reset', () => {
        if(!confirm('採譜したデータを消去しますか？')) return;
        g_music = [];
    });
    const outputBtn = addBtn(ui[0], '保存', () => {
        makeTextFile('採譜データ', g_music.map(v => v.map(v => v).join(' ')).join('\n'));
    });
    new class extends toggleBtn {
        on(){
            super.on();
            this.func = demo();
        }
        off(){
            super.off();
            this.func();
        }
    }(ui[0], '採譜結果を再生', '採譜結果を停止');
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
        $(header).add(footer).show();
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
    const A = (() => { // A特性補正式
        const rA = f => 12194 ** 2 * f ** 4 / (
            (f ** 2 + 20.6 ** 2) *
            Math.sqrt(
                (f ** 2 + 107.7 ** 2) * (f ** 2 + 737.9 ** 2)
            ) * (f ** 2 + 12194 ** 2)
        );
        return f => f ? 20 * Math.log10(rA(f)) + 2 : 0;
    })();
    const ATH = f => 3.64 * (f / 1000) ** -0.8 -
          6.5 * Math.E ** (-0.6 * (f / 1000 - 3.3) ** 2) +
          10 ** -3 * (f / 1000) ** 4; // 最小可聴値
    const setting = () => { // 標本化
        const {semiTone, hz} = piano,
              a90 = [
                  hz[0] / semiTone,
                  ...hz,
                  hz[hz.length - 1] * semiTone
              ],
              range = [];
        for(const i of hz.keys()){
            const [prev, now, next] = a90.slice(i, i + 3);
            range.push([
                (now - prev) / 2 + prev,
                (next - now) / 2 + now
            ]);
        }
        const start = range[0][0],
              end = range[range.length - 1][1],
              freqHz = [],
              m = new Map;
        for(const [i,v] of freq.entries()){
            const Hz = i * 44100 / analy.fftSize;
            if(Hz >= end) break;
            if(Hz > start) {
                freqHz.push(Hz);
                m.set(Hz, i);
            }
        }
        pianoRange = [];
        for(const i of hz.keys()){
            const [start, end] = range[i],
                  arr = [];
            for(const Hz of freqHz){
                if(Hz >= end) break;
                if(Hz > start) arr.push(m.get(Hz));
            }
            pianoRange.push(arr);
        }
        Aarr = [];
        for(const v of hz) Aarr.push(A(v));
        g_music = [];
    };
    let pianoRange, g_music, Aarr;
    const cooking = () => { // 量子化
        analy.getByteFrequencyData(freq);
        const arr = [];
        for(const i of piano.hz.keys()){
            const r = pianoRange[i],
                  ave = r.reduce((p,x) => p + freq[x], 0) / r.length,
                  dB = 20 * Math.log10(ave);
            arr.push(Math.max(0, dB + Aarr[i]));
        }
        let output = [];
        for(const [i,v] of arr.entries()){
            if(v >= inputLimit) output.push(i);
        }
        const topN = [];
        for(let i = 0; i < inputTopN; i++){
            let max = -1;
            for(const i of output){
                if((arr[max] | 0) < arr[i]) max = i;
            }
            if(max === -1) break;
            topN.push(max);
            output.splice(max, 1);
        }
        if(inputTopN()) output = topN;
        switch(selectMode()){
            case 0: return g_music.push(output);
            case 1: return;
            case 2: {
                const {width, height} = ctx.canvas;
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = 'blue';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const barW = inputBarWidth(),
                      barH = height - barW,
                      movX = inputScroll / 100 * (barW * piano.hz.length - width);
                for(const [i,v] of arr.entries()) {
                    const x = barW * i;
                    ctx.fillRect(x - movX, barH - v , barW - 1, v);
                    ctx.fillText(i, x + barW / 2 - movX, barH, barW * 0.8);
                }
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.fillRect(0, barH - inputLimit - 1, width, 3);
                break;
            }
            case 3: {
                const now = arr[inputDebug];
                if(now > debugMax) debugMax = now;
                g_music.push([now]);
                break;
            }
        }
    };
    let debugMax = 0;
    const piano = (()=>{
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
    const inputDebug = (()=>{
        const list = {},
              {hz, hzToNote} = piano;
        for(const i of hz.keys()) list[hzToNote[i]] = i;
        return rpgen3.addSelect(ui[3],{
            list, lebel: '音階の値を測定(debug用)'
        });
    })();
    const inputBarWidth = rpgen3.addInputNum(ui[2],{
        label: 'バーの幅',
        save: true,
        value: 10,
        min: 5,
        max: 30
    });
    const inputScroll = rpgen3.addInputNum(ui[2],{
        label: '横スクロール',
        value: 0,
        min: 0,
        max: 100
    });
    const ctx = (()=>{
        const width = $(window).width() * 0.95,
              height = 300;
        return $('<canvas>').appendTo(ui[2]).prop({width, height}).get(0).getContext('2d');
    })();
    const demo = () => {
        const dur = inputUnit * 4 + 'n';
        const {Tone} = window,
              synth = new Tone.Synth().toMaster();
        const data = g_music.map(v => v.length ? v.map(v => ({
            note: piano.hzToNote[v],
            dur
        })) : null);
        const trimFront = arr => arr.reduce((p, x) => x || p[0] ? p.concat(x) : p, []),
              trim = arr => trimFront(trimFront(arr).reverse()).reverse();
        const seq = new Tone.Sequence((time, {note, dur}) => {
            synth.triggerAttackRelease(note, dur, time);
        }, trim(data), dur).start(0);
        seq.loop = false;
        Tone.Transport.bpm.value = inputBPM();
        Tone.Transport.start();
        return () => Tone.Transport.stop();
    };
})();
