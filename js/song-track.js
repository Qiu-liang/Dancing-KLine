// 歌曲音轨：<audio> 解码本地 MP3，经 MediaElementSource 汇入 analyser。
// 暂停 / 继续直接控制 <audio> 元素本身——若只挂起 AudioContext，
// 媒体元素会继续推进播放进度，恢复时会"跳过"暂停期间的段落。
export function createSongTrack(audioCtx, analyser, { src, volume = 1 } = {}) {
    const audio = new Audio();
    audio.src = src;
    audio.loop = true;
    audio.preload = 'auto';

    const source = audioCtx.createMediaElementSource(audio);
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(analyser);

    return {
        audio,
        start() {
            return audio.play();
        },
        pause() {
            audio.pause();
        },
        resume() {
            return audio.play();
        },
        // 换音源：复用同一个 <audio> 元素（MediaElementSource 只能建立一次）。
        // 播放中直接接着播新文件；暂停中只加载，保持暂停。
        setSource(url) {
            const wasPlaying = !audio.paused;
            audio.src = url;
            audio.load();
            return wasPlaying ? audio.play() : Promise.resolve();
        },
    };
}
