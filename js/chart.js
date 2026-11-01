import { config } from './config.js';

const BASE_FRAME_MS = 1000 / 60;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 价格越界时沿边界镜像反弹，避免长时间运行漂出画面或贴边定格
const reflect = (value, min, max) => {
    const range = max - min;
    // 极端窄窗口下 range 可能为 0，直接返回最小值，避免除零得到 NaN
    if (!(range > 0)) return min;
    const period = 2 * range;
    const t = (((value - min) % period) + period) % period;
    return t <= range ? min + t : min + period - t;
};

export class CandleChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.candles = [];
        this.lastCandleTime = 0;
        this.lastFrameTime = 0;
        // 由 main.js 根据顶部 HUD / 底部控制条的实际高度覆盖
        this.padding = { top: 132, right: 56, bottom: 116, left: 0 };
        this.width = 0;
        this.height = 0;
        this.resize();
    }

    resize() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        // 全屏动画画布把 DPR 上限压到 2，3x 手机上少渲染一半像素
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = width;
        this.height = height;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.trim();
    }

    setPadding(padding) {
        this.padding = { ...this.padding, ...padding };
        this.trim();
    }

    // 价格用 0..100 的音量指数表示，绘图时再映射到屏幕像素，
    // 因此窗口高度变化时整张图会等比缩放，不会把旧价格留在屏幕外
    plotTop() {
        return clamp(this.padding.top, 0, Math.max(0, this.height - 120));
    }

    plotBottom() {
        return clamp(this.height - this.padding.bottom, this.plotTop() + 60, this.height);
    }

    plotWidth() {
        return Math.max(40, this.width - this.padding.right - this.padding.left);
    }

    // 按窗口宽度选择蜡烛尺寸，窄屏下能保留更多历史
    metrics() {
        if (this.width < 640) return { candleWidth: 9, spacing: 5, step: 14 };
        if (this.width < 1100) return { candleWidth: 12, spacing: 7, step: 19 };
        return { candleWidth: 15, spacing: 9, step: 24 };
    }

    maxVisible() {
        return Math.max(1, Math.floor(this.plotWidth() / this.metrics().step));
    }

    visibleCandles() {
        return this.candles.slice(-this.maxVisible());
    }

    trim() {
        const max = Math.min(config.maxCandles, this.maxVisible());
        if (this.candles.length > max) {
            this.candles.splice(0, this.candles.length - max);
        }
    }

    valueToY(value) {
        const top = this.plotTop();
        const bottom = this.plotBottom();
        return bottom - (value / 100) * (bottom - top);
    }

    energy(rms) {
        const normalized = Math.max(0, rms) / config.energyReference;
        return clamp(Math.pow(normalized, config.energyCurve), 0, 1);
    }

    // 每帧调用：rms 为当前音量，now 为 rAF 时间戳（ms）
    update(rms, now) {
        const dt = this.lastFrameTime ? clamp(now - this.lastFrameTime, 1, 64) : BASE_FRAME_MS;
        this.lastFrameTime = now;

        const energy = this.energy(rms);
        const interval = config.candleIntervalMs;

        if (!this.candles.length) {
            this.lastCandleTime = now;
            this.openCandle(energy);
            return;
        }

        const overdue = now - this.lastCandleTime;
        if (overdue >= interval) {
            // 按 100ms 节奏对齐；长时间挂起后不补画几百根，只从现在重新开始
            this.lastCandleTime = overdue > interval * 4
                ? now
                : this.lastCandleTime + Math.floor(overdue / interval) * interval;
            this.openCandle(energy);
        } else {
            this.tickLastCandle(energy, dt);
        }
    }

    openCandle(energy) {
        const last = this.candles[this.candles.length - 1];
        const open = last ? last.close : 50;
        const forcedUp = energy >= config.forceUpThreshold;
        let direction = Math.random() < config.upProbability ? 1 : -1;
        if (forcedUp) direction = 1;

        const body = config.minBody + energy * config.maxBody;
        // 轻微回中，避免连续强拍把价格长期顶在边界
        const drift = (50 - open) * config.centerPull;
        let close = reflect(open + drift + direction * body, 0, 100);

        // 强拍在顶部被镜像反弹时仍应保持阳线，不能翻红
        if (forcedUp && close < open) {
            close = Math.min(100, open + Math.max(config.minBody, body * 0.5));
        }

        const wick = config.wickJitter;

        this.candles.push({
            open,
            close,
            high: clamp(Math.max(open, close) + Math.random() * wick, -2, 102),
            low: clamp(Math.min(open, close) - Math.random() * wick, -2, 102),
        });
        this.trim();
    }

    tickLastCandle(energy, dt) {
        const last = this.candles[this.candles.length - 1];
        if (!last) return;

        // 抖动与拉升都按帧间隔换算，60Hz / 120Hz 屏幕下的表现一致
        const frameScale = dt / BASE_FRAME_MS;
        let close = last.close + (Math.random() - 0.5) * config.closeJitter * Math.sqrt(frameScale);

        if (energy >= config.burstThreshold) {
            const strength = (energy - config.burstThreshold) / (1 - config.burstThreshold);
            close = last.close + strength * config.burstPull * frameScale;
        }

        close = reflect(close, 0, 100);
        last.close = close;
        last.high = Math.min(102, Math.max(last.high, close));
        last.low = Math.max(-2, Math.min(last.low, close));
    }

    draw() {
        const { ctx } = this;
        ctx.clearRect(0, 0, this.width, this.height);
        this.drawGrid();
        this.drawAxis();

        const { candleWidth, step } = this.metrics();
        const visible = this.visibleCandles();
        // 右对齐滚动：最后一根蜡烛的右边缘贴着价格轴留白
        const startX = this.width - this.padding.right - visible.length * step + (step - candleWidth);
        visible.forEach((candle, index) => {
            this.drawCandle(candle, startX + index * step, candleWidth);
        });

        this.drawLastPrice();
    }

    drawGrid() {
        const { ctx } = this;
        const right = this.width - this.padding.right;

        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = config.colors.grid;
        for (let x = right; x >= 0; x -= config.gridSpacing) {
            const px = Math.round(x) + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, this.height);
            ctx.stroke();
        }

        ctx.strokeStyle = config.colors.axis;
        for (const value of [0, 25, 50, 75, 100]) {
            const y = Math.round(this.valueToY(value)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawAxis() {
        const { ctx } = this;
        const x = this.width - this.padding.right + 8;

        ctx.save();
        ctx.fillStyle = config.colors.muted;
        ctx.font = this.axisFont();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const value of [100, 75, 50, 25, 0]) {
            const y = clamp(this.valueToY(value), this.plotTop() + 6, this.plotBottom() - 6);
            ctx.fillText(String(value), x, y);
        }
        ctx.restore();
    }

    drawCandle({ open, close, high, low }, x, width) {
        const { ctx } = this;
        const yOpen = this.valueToY(open);
        const yClose = this.valueToY(close);
        const yHigh = this.valueToY(high);
        const yLow = this.valueToY(low);
        const isUp = close >= open;
        const color = isUp ? config.colors.up : config.colors.down;
        const centerX = Math.round(x + width / 2) + 0.5;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, yHigh);
        ctx.lineTo(centerX, yLow);
        ctx.stroke();

        ctx.fillStyle = color;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yOpen - yClose), 2);
        ctx.fillRect(Math.round(x), Math.round(bodyTop), width, Math.round(bodyHeight));
    }

    // 最新价的虚线 + 右侧标签，让 K 线的「当前音量」一眼可读
    drawLastPrice() {
        const last = this.candles[this.candles.length - 1];
        if (!last) return;

        const { ctx } = this;
        const isUp = last.close >= last.open;
        const color = isUp ? config.colors.up : config.colors.down;
        // 标签文字用更深的 ink 色，保证小字号也能看清
        const ink = isUp ? config.colors.upInk : config.colors.downInk;
        const y = this.valueToY(last.close);
        const right = this.width - this.padding.right;
        const lineY = Math.round(y) + 0.5;

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(right, lineY);
        ctx.stroke();
        ctx.restore();

        const tagWidth = Math.max(32, this.padding.right - 14);
        const tagHeight = 20;
        const tagX = right + 6;
        const tagY = clamp(y - tagHeight / 2, this.plotTop(), this.plotBottom() - tagHeight);

        ctx.save();
        ctx.fillStyle = config.colors.panel;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        this.roundRect(tagX, tagY, tagWidth, tagHeight, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = ink;
        ctx.font = this.axisFont(true);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(last.close)), tagX + tagWidth / 2, tagY + tagHeight / 2 + 0.5);
        ctx.restore();
    }

    roundRect(x, y, width, height, radius) {
        const { ctx } = this;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, width, height, radius);
            return;
        }
        const r = Math.min(radius, width / 2, height / 2);
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    axisFont(bold = false) {
        const size = this.width < 640 ? 10 : 11;
        return `${bold ? 600 : 500} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    }

    // 供 HUD 使用：当前价、较上根变化、区间高低
    stats() {
        const last = this.candles[this.candles.length - 1];
        if (!last) return null;

        const visible = this.visibleCandles();
        const previous = this.candles[this.candles.length - 2];
        let high = -Infinity;
        let low = Infinity;
        let up = 0;
        let down = 0;

        for (const candle of visible) {
            high = Math.max(high, candle.high);
            low = Math.min(low, candle.low);
            if (candle.close >= candle.open) up += 1;
            else down += 1;
        }

        return {
            current: last.close,
            change: last.close - (previous ? previous.close : last.open),
            high: clamp(high, 0, 100),
            low: clamp(low, 0, 100),
            up,
            down,
            count: visible.length,
        };
    }
}
