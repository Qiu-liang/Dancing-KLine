import { config, refreshColors } from './config.js';
import { createAudioEngine } from './audio-engine.js';
import { createSongTrack } from './song-track.js';
import { createAutoRange } from './auto-range.js';
import { CandleChart } from './chart.js';

// 工作区内的歌曲文件，循环播放并驱动 K 线
const SONG_SRC = '「邦友的酒(DJ版)」梦的结唱halo - 活跃黑江乐.mp3';

const canvas = document.getElementById('visualizer');
const hud = document.querySelector('.hud');
const footer = document.querySelector('.bottombar');
const startBtn = document.getElementById('startBtn');
const startLabel = document.getElementById('startLabel');
const muteBtn = document.getElementById('muteBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('audioFile');
const hintEl = document.getElementById('hint');
const statCurrent = document.getElementById('statCurrent');
const statChange = document.getElementById('statChange');
const statHigh = document.getElementById('statHigh');
const statLow = document.getElementById('statLow');

const STORAGE_KEY = 'music-kline-muted';
const readMuted = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

let muted = readMuted();

refreshColors();
const chart = new CandleChart(canvas);
// 响度范围自适应：换曲时 reset 重新标定
const autoRange = createAutoRange(config);

let engine = null;
let track = null;
let playing = false;
// 用户上传的音频（object URL）与当前曲目显示名；为 null 时播内置默认曲目
let objectUrl = null;
let trackName = '邦友的酒 (DJ版)';
let rafId = 0;
let nextBlipAt = 0;
let lastStatsAt = 0;
let lastAriaAt = 0;
let resizeRaf = 0;

function syncMuteUI() {
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? '取消静音' : '静音');
}

function hintText() {
    if (playing) return `正在播放：${trackName} · 每 100ms 一根 K 线`;
    if (engine) return '已暂停 · 点击继续';
    return objectUrl
        ? `已选择：${trackName} · 点击开始`
        : `歌曲：${trackName} · 点击开始`;
}

function syncPlaybackUI() {
    const state = playing ? 'playing' : engine ? 'paused' : 'idle';
    startBtn.dataset.state = state;
    startBtn.setAttribute('aria-pressed', String(playing));
    startLabel.textContent = playing ? '暂停' : engine ? '继续' : '开始';
    startBtn.setAttribute('aria-label', playing ? '暂停可视化' : engine ? '继续可视化' : '开始可视化');
    hintEl.textContent = hintText();
    syncMuteUI();
}

function renderStats(now = 0) {
    const stats = chart.stats();
    if (!stats) {
        statCurrent.textContent = '—';
        statChange.textContent = '—';
        statHigh.textContent = '—';
        statLow.textContent = '—';
        statChange.dataset.trend = 'flat';
        return;
    }

    const change = Math.round(stats.change * 10) / 10;
    const sign = change > 0 ? '+' : '';

    statCurrent.textContent = stats.current.toFixed(1);
    statChange.textContent = sign + change.toFixed(1);
    statChange.dataset.trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    statHigh.textContent = stats.high.toFixed(1);
    statLow.textContent = stats.low.toFixed(1);

    if (now - lastAriaAt >= 1000) {
        lastAriaAt = now;
        canvas.setAttribute(
            'aria-label',
            `音乐音量 K 线图。当前音量指数 ${stats.current.toFixed(1)}，较上根 ${sign}${change.toFixed(1)}，`
            + `区间最高 ${stats.high.toFixed(1)}，最低 ${stats.low.toFixed(1)}。`,
        );
    }
}

// 让绘图区避开顶部 HUD 与底部控制条，窄窗口下也不会互相遮挡
function syncLayout() {
    const height = window.innerHeight;
    const hudRect = hud.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const gap = 22;
    const maxPad = height * 0.4;

    let top = Math.min(hudRect.bottom + gap, maxPad);
    let bottom = Math.min(height - footerRect.top + gap, maxPad);

    // 窗口极矮时按比例压缩留白，至少给 K 线留 110px
    if (height - top - bottom < 110) {
        const scale = Math.max(0, height - 110) / (top + bottom || 1);
        top *= scale;
        bottom *= scale;
    }

    chart.setPadding({
        top,
        bottom,
        right: window.innerWidth < 640 ? 46 : 56,
    });
    chart.draw();
}

function startLoop() {
    if (rafId || !playing || !engine || !track) return;
    if (nextBlipAt < performance.now()) {
        nextBlipAt = performance.now() + 700;
    }
    rafId = requestAnimationFrame(loop);
}

function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
}

function loop(time) {
    if (!playing || !engine || !track) {
        rafId = 0;
        return;
    }

    chart.update(autoRange.normalize(engine.level(), time), time);

    // 合成音轨才有随机 blip，歌曲音轨直接跟唱
    if (track.blip && time >= nextBlipAt) {
        track.blip();
        nextBlipAt = time + config.blipMinMs + Math.random() * (config.blipMaxMs - config.blipMinMs);
    }

    chart.draw(time);

    if (time - lastStatsAt >= 100) {
        lastStatsAt = time;
        renderStats(time);
    }

    rafId = requestAnimationFrame(loop);
}

function togglePlayback() {
    if (!engine) {
        try {
            engine = createAudioEngine({ muted });
            track = createSongTrack(engine.audioCtx, engine.analyser, { src: objectUrl ?? SONG_SRC });
            autoRange.reset();
            // 在用户手势调用栈内同步 play()，绕过浏览器自动播放限制
            Promise.resolve(track.start()).catch((error) => {
                console.error(error);
                hintEl.textContent = '音频加载失败，请重新上传或刷新页面重试';
            });
        } catch (error) {
            console.error(error);
            engine = null;
            track = null;
            hintEl.textContent = '当前浏览器不支持 Web Audio，请换用较新的浏览器';
            return;
        }

        playing = true;
        lastStatsAt = 0;
        syncPlaybackUI();
        engine.resume().then(() => {
            if (playing) startLoop();
        });
        return;
    }

    playing = !playing;
    if (playing) {
        lastStatsAt = 0;
        syncPlaybackUI();
        Promise.resolve(track.resume()).catch((error) => {
            console.error(error);
            hintEl.textContent = '歌曲恢复播放失败，请刷新页面重试';
        });
        engine.resume().then(() => {
            if (playing) startLoop();
        });
    } else {
        stopLoop();
        track.pause();
        engine.suspend();
        syncPlaybackUI();
        chart.draw();
        // 暂停时强制刷新一次 aria 快照，避免读屏拿到上一秒的旧值
        lastAriaAt = 0;
        renderStats(performance.now());
    }
}

function toggleMute() {
    muted = !muted;
    if (engine) engine.setMuted(muted);
    try {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
        // 隐私模式下 localStorage 可能不可用，忽略即可
    }
    syncMuteUI();
}

// ---------- 音频上传 ----------

// accept="audio/*" 在部分系统（尤其 Linux）会漏掉类型标注，用扩展名兜底
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;

function isAudioFile(file) {
    return (file.type && file.type.startsWith('audio/')) || AUDIO_EXT_RE.test(file.name);
}

function handleAudioFile(file) {
    if (!file) return;
    if (!isAudioFile(file)) {
        hintEl.textContent = `「${file.name}」不是音频文件，请选择 mp3 / wav / m4a 等`;
        return;
    }

    trackName = file.name.replace(/\.[^.]+$/, '');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    if (!track) {
        // 还没启动过：只记录文件，点「开始」时用它创建音轨
        syncPlaybackUI();
        return;
    }

    // 播放中无缝切换，暂停中只加载（保持暂停）
    Promise.resolve(track.setSource(objectUrl))
        .then(() => {
            autoRange.reset(); // 新歌重新标定响度范围
            syncPlaybackUI();
        })
        .catch((error) => {
            console.error(error);
            hintEl.textContent = '音频解码失败，请换一个文件试试';
        });
}

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    handleAudioFile(fileInput.files[0]);
    // 清空选择，让用户可以再次选同一个文件
    fileInput.value = '';
});

// 整页拖放：dragenter/leave 会成对嵌套触发，用深度计数避免提示闪烁
let dragDepth = 0;

window.addEventListener('dragover', (event) => {
    event.preventDefault(); // 允许 drop
});

window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    if (dragDepth === 1) hintEl.textContent = '松开鼠标，加载音频文件';
});

window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hintEl.textContent = hintText();
});

window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    // handleAudioFile 内部会刷新提示栏（成功 / 未启动 / 非法文件各自处理）
    handleAudioFile(event.dataTransfer?.files?.[0]);
});

startBtn.addEventListener('click', togglePlayback);
muteBtn.addEventListener('click', toggleMute);

window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target;
    const isFormField = target instanceof Element
        && target.closest('input, textarea, select, [contenteditable="true"]');
    if (isFormField) return;

    if (event.code === 'Space') {
        // 焦点在按钮上时交给按钮原生处理，避免一次按键切换两次
        if (target instanceof Element && target.closest('button, a')) return;
        event.preventDefault();
        togglePlayback();
    } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        toggleMute();
    } else if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        fileInput.click();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!engine || !playing) return;
    if (document.hidden) {
        // 后台时停止声音与循环，回来后从当前状态继续
        stopLoop();
        engine.suspend();
    } else {
        engine.resume().then(() => {
            if (playing && !document.hidden) startLoop();
        });
    }
});

const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const onThemeChange = () => {
    refreshColors();
    chart.draw();
};
if (themeQuery.addEventListener) themeQuery.addEventListener('change', onThemeChange);
else if (themeQuery.addListener) themeQuery.addListener(onThemeChange);

// 画布尺寸变化（窗口缩放、移动端地址栏收起等）时重设位图并重排 HUD 留白
function scheduleResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        chart.resize();
        syncLayout();
        // 可视 K 线数量变了，暂停状态下也要刷新区间高低
        renderStats(performance.now());
    });
}

window.addEventListener('resize', scheduleResize);

if ('ResizeObserver' in window) {
    // 仅依赖 window.resize 会漏掉某些只改变画布 CSS 尺寸的情况
    const canvasObserver = new ResizeObserver(scheduleResize);
    canvasObserver.observe(canvas);

    const layoutObserver = new ResizeObserver(() => syncLayout());
    layoutObserver.observe(hud);
    layoutObserver.observe(footer);
}

chart.resize();
syncLayout();
renderStats();
syncPlaybackUI();
