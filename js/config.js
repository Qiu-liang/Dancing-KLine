// 颜色读自 style.css 的 CSS 变量，避免配色在两处各写一份
const readVar = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
};

const readColors = () => ({
    grid: readVar('--grid', '#e3e8e5'),
    axis: readVar('--axis', '#d3dcd7'),
    up: readVar('--up', '#6cc39c'),
    down: readVar('--down', '#e8a0a0'),
    upInk: readVar('--up-ink', '#1f7a57'),
    downInk: readVar('--down-ink', '#b05252'),
    muted: readVar('--muted', '#62736a'),
    panel: readVar('--panel-solid', '#ffffff'),
});

export const config = {
    // 收盘节奏（ms）与最多保留的 K 线数量
    candleIntervalMs: 100,
    maxCandles: 480,

    // RMS 音量 -> 0..1 能量。energyReference 是「满格」对应的 RMS，
    // energyCurve 小于 1 会放大轻声段，让安静段落也有可见起伏。
    // 0.45 按实际歌曲（响度较大的 DJ 曲目，RMS 约 0.2）标定，避免能量长期饱和顶格
    energyReference: 0.45,
    energyCurve: 0.85,

    // 价格区间固定为 0..100 的音量指数，以下数值都以该区间为单位
    minBody: 0.6,
    maxBody: 16,
    closeJitter: 1.4,
    wickJitter: 5,
    centerPull: 0.12,

    // 能量阈值（0..1）：超过 burstThreshold 时未收盘 K 线继续上冲，
    // 超过 forceUpThreshold 时本根强制收阳
    burstThreshold: 0.8,
    burstPull: 2,
    forceUpThreshold: 0.9,
    upProbability: 0.52,

    // 网格与随机 blip 间隔
    gridSpacing: 80,
    blipMinMs: 280,
    blipMaxMs: 900,

    colors: readColors(),
};

// 系统主题切换时重新读取 CSS 变量，让 Canvas 与 DOM 同步换色
export function refreshColors() {
    Object.assign(config.colors, readColors());
}
