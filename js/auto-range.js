// 响度范围自适应：跟踪当前歌曲实际观测到的最高/最低响度，把平滑 RMS
// min-max 归一化到 0..1 能量。替代按单首歌手工标定的固定 energyReference，
// 任何响度的歌曲（包括用户上传的）都能自动铺满 0..100 指数区间。
//
// 采用自动增益的经典形态：
// - 快攻击：超出范围的响度立即撑大范围，峰值瞬间不截顶
// - 慢释放：范围以时间常数 τ 缓慢向当前响度收缩，歌曲动态变化时能跟随，
//   又不会在几秒内扭曲短期形态
// - 跨度下限：范围收缩到下限后只抬高 max 不压低 min，长静音时 level→0
//   仍映射到 0，而不是把底噪放大成满幅波动
export function createAutoRange(config) {
    const minSpan = config.rangeMinSpan;
    const releaseTauMs = config.rangeReleaseTauMs;

    let min = Infinity;
    let max = -Infinity;
    let lastAt = 0;

    return {
        // 换曲时重置，让新歌从自己的动态重新标定
        reset() {
            min = Infinity;
            max = -Infinity;
            lastAt = 0;
        },
        // level 为平滑后的 RMS（audio-engine 输出），now 为 rAF 时间戳（ms）
        normalize(level, now) {
            if (!Number.isFinite(level)) return 0.5;

            if (!Number.isFinite(min)) {
                // 首采样：以当前响度起步，靠跨度下限给出可用区间，
                // 随后随歌曲动态自动扩张
                min = level;
                max = level + minSpan;
                lastAt = now;
            }

            // 快攻击
            if (level > max) max = level;
            if (level < min) min = level;

            // 慢释放：按真实时间换算衰减，帧率无关
            const dt = lastAt ? Math.min(1000, now - lastAt) : 16;
            lastAt = now;
            const kept = Math.exp(-dt / releaseTauMs);
            max = level + (max - level) * kept;
            min = level + (min - level) * kept;

            // 跨度下限：只抬 max，保证 (level-min)/span 不放大静音底噪
            if (max - min < minSpan) max = min + minSpan;

            const span = max - min;
            // 先 clamp 再求幂：负数的分数次幂是 NaN，不能靠事后 clamp 挽救
            const normalized = Math.min(1, Math.max(0, (level - min) / span));
            return Math.pow(normalized, config.energyCurve);
        },
    };
}
