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

    // RMS 音量 -> 0..1 能量：不再用固定参考值，而是由 auto-range.js 跟踪
    // 当前歌曲实际观测到的最高/最低响度做 min-max 归一化。
    // energyCurve 小于 1 会在歌内轻微抬升安静段。
    // rangeMinSpan 是归一化范围的最小跨度（RMS 单位），防止静音段把底噪
    // 放大成满幅波动；rangeReleaseTauMs 是范围向当前响度收缩的时间常数。
    energyCurve: 0.85,
    rangeMinSpan: 0.06,
    rangeReleaseTauMs: 30000,

    // 纵轴范围自适应：价格是音量指数，不再封顶 0..100，纵轴跟着可视图内
    // K 线的实测最高/最低点走——响度上来时轴顶从 100 抬到 120、140…，
    // 安静段再缓慢收回。
    // viewMinSpan 是纵轴最小跨度（防止安静段把微小波动放大成满幅），
    // viewPad* 是上下留白，viewReleaseTauMs 是范围收缩的时间常数
    // （扩张即时生效，收缩按真实时间衰减），viewTickCount 是目标网格条数。
    viewMinSpan: 70,
    viewPadRatio: 0.08,
    viewPadMin: 6,
    viewReleaseTauMs: 8000,
    viewTickCount: 6,

    // K 线尺寸：单位是音量指数，数值不再被限制在 0..100 区间内
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
