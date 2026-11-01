// AudioContext + AnalyserNode：所有声音汇入 analyser，level() 输出当前 RMS 音量。
// 输出增益放在 analyser 之后，所以静音只影响扬声器，不影响可视化。
export function createAudioEngine({ muted = false } = {}) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('当前浏览器不支持 Web Audio API');

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    // 时域波形长度是 fftSize，不是 frequencyBinCount（后者是频域 bin 数）
    const dataArray = new Uint8Array(analyser.fftSize);

    const output = audioCtx.createGain();
    output.gain.value = muted ? 0 : 1;
    analyser.connect(output);
    output.connect(audioCtx.destination);

    let isMuted = muted;
    let smoothed = 0;
    let lastLevelAt = 0;

    return {
        audioCtx,
        analyser,
        get muted() {
            return isMuted;
        },
        // 不做 state 判断：resume / suspend 可能还在异步切换中，直接按调用顺序执行
        resume() {
            return audioCtx.resume().catch((error) => {
                console.warn('恢复音频失败', error);
            });
        },
        suspend() {
            return audioCtx.suspend().catch((error) => {
                console.warn('暂停音频失败', error);
            });
        },
        setMuted(value) {
            isMuted = Boolean(value);
            const now = audioCtx.currentTime;
            output.gain.cancelScheduledValues(now);
            output.gain.setTargetAtTime(isMuted ? 0 : 1, now, 0.015);
        },
        level() {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const value = (dataArray[i] - 128) / 128;
                sum += value * value;
            }
            const rms = Math.sqrt(sum / dataArray.length);

            // 按真实时间平滑，60Hz / 120Hz 屏幕下的响应速度一致
            const now = performance.now();
            if (!lastLevelAt) {
                lastLevelAt = now;
                smoothed = rms;
                return smoothed;
            }
            const dt = Math.min(100, now - lastLevelAt);
            lastLevelAt = now;
            const alpha = 1 - Math.exp(-dt / 45);
            smoothed += (rms - smoothed) * alpha;
            return smoothed;
        },
    };
}
