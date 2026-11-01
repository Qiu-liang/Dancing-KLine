// 内置合成演示音轨：低频贝斯 + 三角波主旋律，2Hz 增益 LFO 充当节拍
export function createDemoTrack(audioCtx, analyser) {
    // 统一输出增益：避免叠加后的峰值削波，让 RMS 落在可视化标定范围内
    const output = audioCtx.createGain();
    output.gain.value = 0.2;
    output.connect(analyser);

    const master = audioCtx.createGain();
    master.connect(output);

    const bass = audioCtx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = 55;
    bass.connect(master);

    const lead = audioCtx.createOscillator();
    lead.type = 'triangle';
    lead.frequency.value = 220;
    lead.connect(master);

    const beat = audioCtx.createOscillator();
    beat.frequency.value = 2;
    const beatGain = audioCtx.createGain();
    beatGain.gain.value = 0.5;
    beat.connect(beatGain);
    beatGain.connect(master.gain);

    // A 大调五声音阶，随机点缀不会跑调
    const notes = [440, 493.88, 554.37, 659.25, 880];
    let started = false;

    function start() {
        if (started) return;
        started = true;
        bass.start();
        lead.start();
        beat.start();
    }

    // 偶发的随机高音点缀，与主音轨共用输出增益
    function blip() {
        if (!started) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(output);
        osc.start(t);
        osc.stop(t + 0.12);
    }

    return { start, blip };
}
