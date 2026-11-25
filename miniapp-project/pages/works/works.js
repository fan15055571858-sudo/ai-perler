const app = getApp();

Page({
  data: { works: [] },
  onShow() {
    const works = app.globalData.works.map(w => ({
      id: w.id, name: w.name, size: w.size, total: w.total, colors: w.colors, thumb: w.thumb, createdAt: w.createdAt
    }));
    this.setData({ works });
  },
  goCreate() { wx.switchTab({ url: '/pages/index/index' }); },
  onOpen(e) {
    const id = Number(e.currentTarget.dataset.id);
    // 作品列表只存摘要，完整网格在当前会话全局数据中；重新打开需重新生成
    if (app.globalData.currentWork && app.globalData.currentWork.id === id) {
      wx.navigateTo({ url: '/pages/preview/preview' });
    } else {
      wx.showToast({ title: '请重新生成图纸查看', icon: 'none' });
    }
  },
  onDelete(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '删除作品', content: '删除后无法恢复，确定删除吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.globalData.works = app.globalData.works.filter(w => w.id !== id);
        app.saveWorks();
        this.setData({ works: this.data.works.filter(w => w.id !== id) });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }
});
