const A = require('../../utils/bead-algorithm.js');
const app = getApp();

Page({
  data: {
    work: null, materials: [], physicalSize: '',
    canvasW: 300, canvasH: 300
  },

  onLoad() {
    const work = app.globalData.currentWork;
    if (!work) {
      wx.showToast({ title: '暂无图纸', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const st = { colors: {} };
    work.grid.forEach(row => row.forEach(c => { if (c) st.colors[c.id] = (st.colors[c.id] || 0) + 1; }));
    const materials = Object.keys(st.colors).map(id => {
      const c = work.usedPalette.find(p => p.id === id) || { name: id, hex: '#ccc' };
      return { id, name: c.name, hex: c.hex, n: st.colors[id] };
    }).sort((a, b) => b.n - a.n);

    this.setData({
      work: { size: work.size, total: work.total, colors: work.colors },
      materials,
      physicalSize: (work.gridW * 2.6 / 10).toFixed(1) + '×' + (work.gridH * 2.6 / 10).toFixed(1) + 'cm'
    });

    // 画布逻辑尺寸：格子 12px，最多显示 360px（可滚动）
    const cell = 12;
    const w = Math.min(720, work.gridW * cell + 40);
    const h = Math.min(720, work.gridH * cell + 40);
    this.setData({ canvasW: w, canvasH: h }, () => this.drawPattern(cell));
  },

  drawPattern(cell) {
    const work = app.globalData.currentWork;
    wx.createSelectorQuery().select('#patternCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = this.data.canvasW * dpr;
      canvas.height = this.data.canvasH * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.data.canvasW, this.data.canvasH);
      ctx.fillStyle = '#6b7280';
      ctx.font = '8px monospace';
      const ox = 24, oy = 24;
      // 色块
      for (let y = 0; y < work.gridH; y++) {
        for (let x = 0; x < work.gridW; x++) {
          const c = work.grid[y][x];
          if (!c) continue;
          ctx.fillStyle = c.hex;
          ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        }
      }
      // 网格线
      ctx.strokeStyle = 'rgba(0,0,0,.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx <= work.gridW; gx++) { ctx.moveTo(ox + gx * cell + .5, oy); ctx.lineTo(ox + gx * cell + .5, oy + work.gridH * cell); }
      for (let gy = 0; gy <= work.gridH; gy++) { ctx.moveTo(ox, oy + gy * cell + .5); ctx.lineTo(ox + work.gridW * cell, oy + gy * cell + .5); }
      ctx.stroke();
      // 色号（放大后显示）
      if (cell >= 10) {
        ctx.font = '600 7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let y = 0; y < work.gridH; y++) {
          for (let x = 0; x < work.gridW; x++) {
            const c = work.grid[y][x]; if (!c) continue;
            ctx.fillStyle = A.luminance(c.rgb) > 128 ? '#1a1f2e' : '#ffffff';
            ctx.fillText(c.id, ox + x * cell + cell / 2, oy + y * cell + cell / 2);
          }
        }
      }
      // 坐标
      ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center';
      for (let rx = 0; rx < work.gridW; rx += 5) ctx.fillText(String(rx + 1), ox + rx * cell + cell / 2, oy - 10);
      ctx.textAlign = 'right';
      for (let ry = 0; ry < work.gridH; ry += 5) ctx.fillText(String(ry + 1), ox - 6, oy + ry * cell + cell / 2);
    });
  },

  previewHD() {
    wx.showToast({ title: '已显示图纸预览，长按画布可保存', icon: 'none' });
  },

  saveToAlbum() {
    wx.showLoading({ title: '生成高清图纸…' });
    wx.createSelectorQuery().select('#patternCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) { wx.hideLoading(); return; }
      wx.canvasToTempFilePath({
        canvas: res[0].node,
        fileType: 'png',
        success: (r) => {
          wx.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => { wx.hideLoading(); wx.showToast({ title: '已保存到相册', icon: 'success' }); },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '请授权保存到相册', icon: 'none' }); }
          });
        },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); }
      });
    });
  }
});
