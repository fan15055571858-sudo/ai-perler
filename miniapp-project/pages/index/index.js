const A = require('../../utils/bead-algorithm.js');
const RAW = require('../../utils/palette.js');
const app = getApp();

const STYLES = [
  { key: 'chibi', name: 'chibi 二次元', desc: 'Q版二头身·白底表情包' },
  { key: 'clay', name: '软陶黏土', desc: '圆润敦实·哑光手作' },
  { key: 'doodle', name: '涂鸦手绘', desc: '随性线条·淡色治愈' },
  { key: 'kawaii', name: '日系 kawaii', desc: '大眼腮红·马卡龙配色' }
];
const SERIES_DEF = [
  { key: 'solid', name: '实色', count: 239 },
  { key: 'transparent', name: '透明', count: 1 },
  { key: 'neon', name: '荧光', count: 5 },
  { key: 'glow', name: '夜光', count: 8 },
  { key: 'pearl', name: '珠光', count: 23 },
  { key: 'metallic', name: '金属', count: 15 }
];

Page({
  data: {
    quota: { ai: 10, beads: 20 },
    sourcePath: '', sourceName: '', sourceW: 0, sourceH: 0,
    styles: STYLES, style: 'chibi', aiResults: [], activeMaterial: 0,
    presets: [29, 40, 52, 64, 78, 104], presetW: 29,
    customW: 29, customH: 29,
    maxColors: 48,
    series: [], dithers: [
      { key: 'floyd', name: '经典抖动' },
      { key: 'off', name: '颜色量化' },
      { key: 'pair', name: '近色抖动' }
    ],
    dither: 'floyd',
    generating: false, generatingAI: false,
    recentWork: null
  },

  onLoad() {
    this.setData({ quota: app.globalData.quota });
    this.refreshSeries([{ key: 'solid', name: '实色', count: 239, active: true }].concat(
      SERIES_DEF.slice(1).map(s => Object.assign({}, s, { active: false }))
    ));
    const works = app.globalData.works;
    if (works.length) {
      const w = works[0];
      this.setData({ recentWork: { name: w.name, size: w.size, total: w.total, thumb: w.thumb } });
    }
  },
  onShow() { this.setData({ quota: app.globalData.quota }); },

  refreshSeries(series) { this.setData({ series }); },

  // 上传
  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles[0];
        if (f.size > 20 * 1024 * 1024) { wx.showToast({ title: '图片不能超过20MB', icon: 'none' }); return; }
        wx.getImageInfo({
          src: f.tempFilePath,
          success: (info) => {
            const ratio = info.height / info.width;
            this.setData({
              sourcePath: f.tempFilePath,
              sourceName: f.tempFilePath.split('/').pop().slice(0, 18),
              sourceW: info.width, sourceH: info.height,
              customH: Math.max(8, Math.min(160, Math.round(this.data.presetW * ratio))),
              aiResults: [], activeMaterial: 0
            });
            wx.showToast({ title: '上传成功', icon: 'success' });
          }
        });
      }
    });
  },

  // 风格选择
  onStyleTap(e) { this.setData({ style: e.currentTarget.dataset.key }); },

  // 素材切换
  onMaterialTap(e) { this.setData({ activeMaterial: Number(e.currentTarget.dataset.index) }); },

  // AI 风格转换（演示版：本地滤镜，正式版接服务端 LLM）
  onAIGen() {
    const path = this.getActivePath();
    if (!path) { wx.showToast({ title: '请先上传图片', icon: 'none' }); return; }
    if (app.globalData.quota.ai <= 0) { wx.showToast({ title: 'AI 次数不足', icon: 'none' }); return; }
    this.setData({ generatingAI: true });
    wx.showLoading({ title: '生成风格图…' });
    // 演示：直接用原图作为风格结果（正式版由服务端返回）
    setTimeout(() => {
      const style = STYLES.find(s => s.key === this.data.style);
      const results = this.data.aiResults.concat([{ path: path, name: style.name, styleKey: style.key }]);
      app.globalData.quota.ai--;
      app.saveQuota();
      this.setData({ aiResults: results, generatingAI: false, quota: app.globalData.quota, activeMaterial: results.length });
      wx.hideLoading();
      wx.showToast({ title: '风格图已生成', icon: 'success' });
    }, 600);
  },

  getActivePath() {
    if (this.data.activeMaterial === 0) return this.data.sourcePath;
    const r = this.data.aiResults[this.data.activeMaterial - 1];
    return r ? r.path : this.data.sourcePath;
  },

  // 参数
  onPresetTap(e) {
    const n = Number(e.currentTarget.dataset.size);
    this.setData({ presetW: n, customW: n, customH: n });
  },
  onCustomW(e) { this.setData({ customW: Number(e.detail.value) || 29 }); },
  onCustomH(e) { this.setData({ customH: Number(e.detail.value) || 29 }); },
  onColorsChange(e) { this.setData({ maxColors: Number(e.detail.value) }); },
  onSeriesTap(e) {
    const key = e.currentTarget.dataset.key;
    const series = this.data.series.map(s => {
      if (s.key !== key) return s;
      return Object.assign({}, s, { active: !s.active });
    });
    if (!series.some(s => s.active)) {
      wx.showToast({ title: '至少选择一种色系', icon: 'none' }); return;
    }
    this.setData({ series });
  },
  onDitherTap(e) { this.setData({ dither: e.currentTarget.dataset.key }); },

  // 核心：生成拼豆图纸
  onGenerate() {
    const path = this.getActivePath();
    if (!path) { wx.showToast({ title: '请先上传图片', icon: 'none' }); return; }
    if (this.data.generating) return;
    this.setData({ generating: true });
    wx.showLoading({ title: '分析色彩…' });

    const w = Math.max(8, Math.min(160, this.data.customW));
    const h = Math.max(8, Math.min(160, this.data.customH));

    // 用 canvas 缩放图片并取像素
    const cv = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
    const ctx = cv.getContext('2d');
    const img = cv.createImage();
    img.onload = () => {
      try {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        wx.hideLoading();
        wx.showLoading({ title: '智能选色…' });
        const activeSeries = this.data.series.filter(s => s.active).map(s => s.key);
        const palette = A.buildPalette(RAW, activeSeries);
        const chosen = A.smartSelect(imgData, w, h, palette, Math.min(this.data.maxColors, palette.length), 'ciede2000');

        wx.hideLoading();
        wx.showLoading({ title: '生成图纸…' });
        const grid = A.quantize(imgData, chosen, this.data.dither, 'ciede2000');
        const st = A.stats(grid);

        // 存到全局（网格数据可能较大，作品列表只存缩略信息）
        const work = {
          id: Date.now(),
          name: '拼豆作品',
          size: w + '×' + h,
          total: st.total,
          colors: st.types,
          thumb: path,
          grid: grid,
          gridW: w, gridH: h,
          usedPalette: chosen,
          dither: this.data.dither,
          createdAt: new Date().toLocaleString('zh-CN')
        };
        app.globalData.currentWork = work;
        app.globalData.works.unshift({ id: work.id, name: work.name, size: work.size, total: work.total, colors: work.colors, thumb: path, createdAt: work.createdAt });
        app.saveWorks();

        if (app.globalData.quota.beads > 0) { app.globalData.quota.beads--; app.saveQuota(); }

        wx.hideLoading();
        this.setData({ generating: false, quota: app.globalData.quota });
        wx.navigateTo({ url: '/pages/preview/preview' });
      } catch (err) {
        wx.hideLoading();
        this.setData({ generating: false });
        wx.showToast({ title: '生成失败：' + err.message, icon: 'none' });
      }
    };
    img.onerror = () => {
      wx.hideLoading();
      this.setData({ generating: false });
      wx.showToast({ title: '图片读取失败', icon: 'none' });
    };
    img.src = path;
  },

  goWorks() { wx.switchTab({ url: '/pages/works/works' }); }
});
