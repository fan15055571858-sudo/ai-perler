App({
  globalData: {
    currentWork: null,
    works: [],
    quota: { ai: 10, beads: 20 }
  },
  onLaunch() {
    try {
      const saved = wx.getStorageSync('perler_works');
      if (Array.isArray(saved)) this.globalData.works = saved;
      const q = wx.getStorageSync('perler_quota');
      if (q) this.globalData.quota = q;
    } catch (e) { /* 首次使用无缓存 */ }
  },
  saveWorks() {
    try { wx.setStorageSync('perler_works', this.globalData.works); } catch (e) {}
  },
  saveQuota() {
    try { wx.setStorageSync('perler_quota', this.globalData.quota); } catch (e) {}
  }
});
