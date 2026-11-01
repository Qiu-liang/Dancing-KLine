# 音乐 K 线可视化

用 K 线图实时呈现声音强弱的小玩具：Web Audio API 采集音量（RMS），Canvas 每 100ms 把音量画成一根 K 线——音量越大 K 线实体越高，强拍时强制收阳。

播放工作区根目录下的歌曲文件（`SONG_SRC` 常量，见 `js/main.js`），经 `<audio>` + MediaElementSource 汇入分析器，循环播放。想换歌，替换音频文件并同步修改 `SONG_SRC` 即可；页面上也可以点上传按钮、按 `U` 键或直接把音频文件拖进页面，临时换成自己的本地音频（仅当前会话有效，刷新后恢复默认曲目）。`js/demo-track.js` 仍保留着一条内置合成音轨（低频贝斯 + 三角波主旋律 + 2Hz 节拍 LFO + 随机五声音阶 blip），需要时可切回。

## 运行

页面使用 ES Modules，直接双击 `index.html` 会被浏览器的 file:// 协议拦截，需要起一个静态服务器：

```bash
npm start                # 等价于 npx -y serve .
# 或
python3 -m http.server 8080
```

然后访问 `http://localhost:3000`（serve）或 `http://localhost:8080`。

## 界面与操作

- **顶部 HUD**：当前音量指数、较上根变化、当前可视区间的最高/最低值；状态标签显示「待启动 / 播放中 / 已暂停」。
- **主图**：固定 0–100 的音量指数坐标轴、网格、右侧最新价标签（虚线 + 数值），以及绿色上扬 / 红色回落的 K 线。
- **底部控制**：播放 / 暂停、静音。静音只关闭扬声器输出，分析链路继续工作，所以画面仍然会动。
- **快捷键**：`空格` 播放 / 暂停，`M` 静音。
- 跟随系统深浅色主题；静音偏好写入 `localStorage`。
- 响应式布局：窄屏下指标变为四列全宽、隐藏图例与键盘提示，极矮窗口会压缩留白并隐藏副标题。

## 目录结构

```
music-kline-visualizer/
├── index.html          # 入口页面与 HUD/控制条结构
├── package.json
├── css/
│   └── style.css       # 主题变量、布局、响应式与动效
└── js/
    ├── main.js         # 播放状态、唯一的 rAF 循环、HUD 更新、键盘/可见性处理
    ├── config.js       # 能量映射、K 线尺寸、阈值、配色（读自 CSS 变量）
    ├── audio-engine.js # AudioContext + AnalyserNode + 输出增益/静音、RMS 平滑
    ├── song-track.js   # 歌曲音轨：<audio> 解码本地 MP3 汇入分析器
    ├── demo-track.js   # 内置合成演示音轨与随机五声音阶 blip（备用）
    └── chart.js        # 0–100 音量指数 K 线、Canvas 绘制、坐标轴与最新价
```

## K 线生成规则

- 每 `candleIntervalMs`（100ms）收一根新 K 线，开盘价 = 上一根收盘价。
- 音量先换算成 `0..1` 的能量：`(rms / energyReference) ^ energyCurve`，再映射成实体高度 `minBody + energy × maxBody`（单位是 0–100 的价格指数）。
- 收盘方向默认 52% 概率向上；能量超过 `forceUpThreshold` 时强制收阳；超过 `burstThreshold` 时，未收盘 K 线在每帧继续上冲。
- 未收盘的 K 线每帧小幅抖动；抖动和上冲都按帧间隔换算，60Hz / 120Hz 屏幕下表现一致。
- 价格越界时沿边界镜像反弹，并带一点回中力，长时间运行不会漂出画面或长期贴边。
- 宽高变化时价格会按比例重新映射，不会出现旧价格留在屏幕外的情况。

## 可调参数

都在 `js/config.js`：

| 参数 | 作用 |
| --- | --- |
| `energyReference` / `energyCurve` | RMS → 能量曲线的标定；换成麦克风或其他音源时优先调这两个 |
| `minBody` / `maxBody` | K 线实体高度的下限 / 上限（0–100 指数单位） |
| `forceUpThreshold` / `burstThreshold` | 强制收阳 / 盘中上冲的能量阈值 |
| `upProbability` / `centerPull` | 基础收阳概率 / 回中力度 |
| `candleIntervalMs` | 每根 K 线的时间跨度 |
| `blipMinMs` / `blipMaxMs` | 随机高音点缀的间隔范围 |
| `colors` | Canvas 用的颜色；实际值来自 `style.css` 的 CSS 变量 |

配色统一在 `css/style.css` 的 `:root` 与深色媒体查询里修改，`config.js` 会在加载和主题切换时重新读取。

## 本次代码审查修复的问题

- **音量标定失真**：原来的 `volumeScale: 3000` 面对实测 RMS 0.3–0.96 时，每根 K 线的价格步长达到 900–2800px，远超 600px 的价格区间，所有 K 线都在上下边界之间来回镜像，阈值也永远处于触发状态。现在改为 0–100 归一化指数 + 按内置音轨实测标定的能量映射，实体高度约 3–17 个指数单位。
- **演示音轨削波**：原音轨叠加峰值可达 3 左右，直接输出会削波。现在增加 0.2 的统一输出增益，并把 blip 也接入同一增益。
- **分析窗口减半**：时域数据数组原来用 `frequencyBinCount`（128）分配，实际应按 `fftSize`（256）分配。
- **极窄/极矮窗口 NaN**：`reflect()` 在高度 ≤ 120px 时会出现零/负 range，现加保护。
- **改变窗口后价格错位**：价格从像素改为 0–100 归一化指数，Canvas 尺寸变化时自动等比缩放；同时用 `ResizeObserver` 监听画布的 CSS 尺寸，避免只改变 CSS 大小而位图不重设导致画面被拉伸。
- **暂停与后台**：rAF 循环在暂停时停止，切到后台时挂起音频，回来再恢复；快速连点不会叠加多个循环。
- **帧率相关的抖动**：未收盘 K 线的抖动与上冲按 `dt` 换算，高刷屏和低帧率下节奏一致。
- **主题切换**：Canvas 颜色会在 `prefers-color-scheme` 变化时重新读取 CSS 变量，避免 DOM 换色而图表不换色。
- **前端表现**：新增坐标轴 / 最新价标签 / 实时指标 / 图例 / 状态标签 / 键盘操作 / 深色模式 / 响应式与 reduced-motion 支持；画布与控件的配色、层级和可读性也做了统一。
