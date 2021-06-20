(async () => {
    await Promise.all([
        'https://rpgen3.github.io/lib/lib/jquery-3.5.1.min.js',
    ].map(v => import(v)));
    const rpgen3 = await Promise.all([
        'baseN',
        'css',
        'hankaku',
        'input',
        'random',
        'sample',
        'save',
        'strToImg',
        'url',
        'util'
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
    const addBtn = (ttl, func) => $('<button>').appendTo(h).text(ttl).on('click', func);
    const bpmMin = 40,
          bpmMax = 300;
    const inputBPM = rpgen3.addInputNum(h,{
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
        if(!isReady) return msg('読み込みが完了していません', true);
        const src = audioCtx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(analy).connect(audioCtx.destination);
        src.start(0);
    };
    addBtn('音楽再生', play);
    let isReady, stopFunc;
    const startBtn = addBtn('処理start', () => {
        if(!isReady) return msg('読み込みが完了していません', true);
        stopFunc = timer(inputBPM, cooking);
        startBtn.hide();
        stopBtn.show();
    });
    const stopBtn = addBtn('処理stop', () => {
        stopFunc();
        startBtn.show();
        stopBtn.hide();
    }).hide();
    let audioCtx, audioBuf, analy, freq;
    const load = async arrBuf => {
        audioCtx = new AudioContext;
        audioBuf = await audioCtx.decodeAudioData(arrBuf);
        analy = audioCtx.createAnalyser();
        analy.fftSize = 2048;
        freq = new Uint8Array(analy.frequencyBinCount);
        msg('読み込み完了');
        isReady = true;
    };
    const timer = (ms, func) => {
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
    const cooking = () => {
        analy.getByteFrequencyData(freq);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'blue';
        for(const [i,v] of freq.entries()){
            ctx.fillRect(i, 0, 1, v);
        }
    };
    const width = 1000,
          height = 300;
    const cv = $('<canvas>').appendTo(h).prop({width, height}),
          ctx = cv.get(0).getContext('2d');
})();
