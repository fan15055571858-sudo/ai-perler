/* ============================================================
   AI 拼豆工作台 · 应用逻辑
   ============================================================ */
(function () {
  'use strict';
  var A = window.BeadAlgo;
  var RAW = window.MARD_PALETTE;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var STYLES = [
    { key: 'chibi', name: 'chibi 二次元', desc: 'Q 版二头身 · 白底表情包', tone: 'warm' },
    { key: 'clay', name: '软陶黏土', desc: '圆润敦实 · 哑光手作质感', tone: 'clay' },
    { key: 'doodle', name: 'doodle 涂鸦', desc: '随性手绘线条 · 淡色治愈', tone: 'soft' },
    { key: 'kawaii', name: '日系 kawaii', desc: '亮晶晶大眼 · 马卡龙配色', tone: 'pink' }
  ];
  var PRESETS = [29, 40, 52, 64, 78, 104];
  var SERIES = [
    { key: 'solid', name: '实色', count: 239 },
    { key: 'transparent', name: '透明', count: 1 },
    { key: 'neon', name: '荧光', count: 5 },
    { key: 'glow', name: '夜光', count: 8 },
    { key: 'pearl', name: '珠光', count: 23 },
    { key: 'metallic', name: '金属', count: 15 }
  ];

  var state = {
    view: 'studio',
    sourceImg: null,          // HTMLImageElement (调整后)
    originalImg: null,        // 原始上传图
    sourceName: '',
    materials: [],            // [{img, name, styleKey}]
    activeMaterial: 0,
    grid: null,               // 生成的拼豆网格
    gridW: 0, gridH: 0,
    palette: [],              // 当前色卡
    usedPalette: [],          // 本次生成实际使用的色号
    presetW: 29, presetH: 29,
    isCustom: false,
    locked: true,
    maxColors: 48,
    dither: 'floyd',
    algo: 'ciede2000',
    series: ['solid'],
    style: 'chibi',
    zoom: 1,
    showGrid: true, showLabel: true, showRuler: true,
    cstatus: 'pattern',
    quota: { ai: 10, beads: 20 },
    adjust: { brightness: 0, contrast: 0, saturate: 0, rotate: 0, flip: false },
    history: [], historyIdx: -1,
    generating: false
  };

  // ---------- 工具 ----------
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function openModal(html, wide) {
    $('#modalBody').innerHTML = html;
    $('.modal-card').classList.toggle('wide', !!wide);
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src;
    });
  }
  function filterCss() {
    var a = state.adjust;
    var b = 100 + a.brightness, c = 100 + a.contrast, s = 100 + a.saturate;
    return 'brightness(' + b + '%) contrast(' + c + '%) saturate(' + s + '%)';
  }
  function applyAdjustToCanvas(img) {
    var cv = document.createElement('canvas');
    var w = img.naturalWidth, h = img.naturalHeight;
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.filter = filterCss();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(state.adjust.rotate * Math.PI / 180);
    if (state.adjust.flip) ctx.scale(-1, 1);
    // 旋转后适配画布
    var rot = Math.abs(state.adjust.rotate) % 180 === 90;
    var dw = rot ? h : w, dh = rot ? w : h;
    if (rot) { cv.width = h; cv.height = w; ctx = cv.getContext('2d'); ctx.filter = filterCss(); }
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(state.adjust.rotate * Math.PI / 180);
    if (state.adjust.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2);
    return cv;
  }
  function getSourceImage() {
    if (state.materials.length && state.activeMaterial > 0) return state.materials[state.activeMaterial].img;
    return state.sourceImg;
  }

  // ---------- 初始化 ----------
  function init() {
    buildHeroPreview();
    buildSteps();
    buildStyles();
    buildPresets();
    buildSeries();
    bindEvents();
    refreshPalette();
    updateQuota();
    // 默认进入工作台
    setView('studio');
  }

  function buildHeroPreview() {
    var grid = $('#heroGrid');
    // 用色卡颜色生成一个可爱小熊的像素示意
    var ids = ['G16','G16','G16','A14','A14','G16','G16','G16','G16','G16','Y11','Y11','G16','G16','G16','G16',
      'G16','G16','E3','E3','A14','A14','E3','E3','G16','G16','Y11','Y11','G16','G16','D15','D15',
      'G16','E3','E3','E3','E3','E3','E3','E3','G16','Y11','G16','G16','G16','Y11','D15','D15',
      'G16','E3','K3','E3','E3','K3','E3','E3','G16','G16','G16','G16','G16','G16','D15','D15',
      'G16','E3','E3','E3','E3','E3','E3','E3','G16','G16','G16','G16','G16','G16','G16','G16',
      'G16','G16','E3','E3','E3','E3','G16','G16','G16','G16','G16','G16','G16','G16','G16','G16'];
    var map = {}; RAW.forEach(function (c) { map[c[0]] = A.rgbToHex(c[1], c[2], c[3]); });
    grid.innerHTML = '';
    ids.forEach(function (id) {
      var i = document.createElement('i'); i.style.background = map[id] || '#eee'; grid.appendChild(i);
    });
  }
  function buildSteps() {
    var steps = [
      { n: '01', t: '上传图片', d: '从相册或文件选择喜欢的图案' },
      { n: '02', t: '调整参数', d: '选尺寸、色卡与配色算法' },
      { n: '03', t: '生成图纸', d: '一键像素化，可画笔微调' },
      { n: '04', t: '导出开拼', d: '下载图纸，对照色号拼豆' }
    ];
    $('#stepsRow').innerHTML = steps.map(function (s) {
      return '<div class="step-card"><div class="step-no">' + s.n + '</div><h4>' + s.t + '</h4><p>' + s.d + '</p></div>';
    }).join('');
  }
  function buildStyles() {
    $('#styleGrid').innerHTML = STYLES.map(function (s) {
      return '<button class="style-card' + (s.key === state.style ? ' active' : '') + '" data-style="' + s.key + '">' +
        '<strong>' + s.name + '</strong><span>' + s.desc + '</span></button>';
    }).join('') + '<button class="btn btn-ai style-gen-btn" id="aiGenBtn">生成风格图 · 消耗 1 次 AI</button>';
    $('#aiGenBtn').addEventListener('click', generateAIStyle);
  }
  function buildPresets() {
    $('#sizePresets').innerHTML = PRESETS.map(function (n) {
      return '<button class="size-btn' + (n === 29 ? ' active' : '') + '" data-size="' + n + '">' + n + '×' + n + '</button>';
    }).join('');
  }
  function buildSeries() {
    $('#seriesGroup').innerHTML = SERIES.map(function (s) {
      return '<button class="series-chip' + (s.key === 'solid' ? ' active' : '') + '" data-series="' + s.key + '">' +
        s.name + ' ' + s.count + '</button>';
    }).join('');
  }
  function refreshPalette() {
    state.palette = A.buildPalette(RAW, state.series);
  }
  function updateQuota() {
    $('#quotaText').textContent = '拼豆 ' + state.quota.beads + ' · AI ' + state.quota.ai;
  }
  function setView(v) {
    state.view = v;
    $('#viewHome').style.display = v === 'home' ? '' : 'none';
    $('#viewStudio').style.display = v === 'studio' ? '' : 'none';
    $$('.nav-link').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === v || (v === 'gallery' && b.dataset.nav === 'gallery')); });
    if (v === 'home') window.scrollTo(0, 0);
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $$('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.nav); }); });
    $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.go === 'demo' ? 'studio' : b.dataset.go); }); });
    $('#logoHome').addEventListener('click', function (e) { e.preventDefault(); setView('home'); });
    $('#themeToggle').addEventListener('click', function () {
      var d = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', d ? 'light' : 'dark');
      if (state.grid) renderPattern();
    });
    $('#authBtn').addEventListener('click', showAuth);
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeModal); });

    // 上传
    var uz = $('#uploadZone');
    uz.addEventListener('click', function () { $('#fileInput').click(); });
    uz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });
    uz.addEventListener('dragover', function (e) { e.preventDefault(); uz.classList.add('dragover'); });
    uz.addEventListener('dragleave', function () { uz.classList.remove('dragover'); });
    uz.addEventListener('drop', function (e) { e.preventDefault(); uz.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    $('#fileInput').addEventListener('change', function (e) { if (e.target.files[0]) handleFile(e.target.files[0]); });
    $('#changeImage').addEventListener('click', function () { $('#fileInput').click(); });

    // 调整
    ['brightness', 'contrast', 'saturate'].forEach(function (k) {
      $('#' + k).addEventListener('input', function (e) {
        state.adjust[k] = +e.target.value;
        $('#' + k + 'Val').textContent = (e.target.value > 0 ? '+' : '') + e.target.value;
      });
      $('#' + k).addEventListener('change', function () { refreshAdjusted(); });
    });
    $('#rotateL').addEventListener('click', function () { state.adjust.rotate = (state.adjust.rotate + 270) % 360; refreshAdjusted(); });
    $('#rotateR').addEventListener('click', function () { state.adjust.rotate = (state.adjust.rotate + 90) % 360; refreshAdjusted(); });
    $('#flipH').addEventListener('click', function () { state.adjust.flip = !state.adjust.flip; refreshAdjusted(); });
    $('#adjustReset').addEventListener('click', function () {
      state.adjust = { brightness: 0, contrast: 0, saturate: 0, rotate: 0, flip: false };
      ['brightness', 'contrast', 'saturate'].forEach(function (k) { $('#' + k).value = 0; $('#' + k + 'Val').textContent = '0'; });
      refreshAdjusted();
    });
    $('#resetAll').addEventListener('click', function () {
      state.grid = null; state.materials = []; state.activeMaterial = 0;
      $('#canvasEmpty').hidden = false; $('#canvasWrap').hidden = true; $('#imgWrap').hidden = true;
      $('#materialList').innerHTML = '<div class="material-empty">生成图纸后显示完整材料统计</div>';
      $('#statTotal').textContent = '—'; $('#statTypes').textContent = '—'; $('#statSize').textContent = '—';
      $('#colorCountBadge').textContent = '— 色';
      $('#statusLeft').textContent = '等待上传图片';
      ['#previewBtn', '#downloadBtn', '#exportCsvBtn', '#editBtn', '#newBlankBtn'].forEach(function (s) { $(s).disabled = true; $(s).hidden = true; });
      toast('已恢复默认');
    });

    // 风格
    $('#styleGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]'); if (!b) return;
      state.style = b.dataset.style;
      $$('.style-card').forEach(function (x) { x.classList.toggle('active', x === b); });
    });

    // 参数
    $('#sizePresets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-size]'); if (!b) return;
      state.isCustom = false; state.presetW = state.presetH = +b.dataset.size;
      $$('.size-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      if (state.locked && getSourceImage()) {
        var im = getSourceImage(); var ratio = im.naturalHeight / im.naturalWidth;
        state.presetH = Math.max(8, Math.min(160, Math.round(state.presetW * ratio)));
        $('#customW').value = state.presetW; $('#customH').value = state.presetH;
      }
    });
    $('#customW').addEventListener('change', function () { state.isCustom = true; });
    $('#customH').addEventListener('change', function () { state.isCustom = true; });
    $('#maxColors').addEventListener('input', function (e) { state.maxColors = +e.target.value; $('#maxColorsVal').textContent = e.target.value; });
    $('#seriesGroup').addEventListener('click', function (e) {
      var b = e.target.closest('[data-series]'); if (!b) return;
      var k = b.dataset.series;
      var i = state.series.indexOf(k);
      if (i >= 0) { if (state.series.length > 1) state.series.splice(i, 1); }
      else state.series.push(k);
      b.classList.toggle('active', state.series.indexOf(k) >= 0);
      refreshPalette();
    });
    $('#ditherMode').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b) return;
      state.dither = b.dataset.mode;
      $$('#ditherMode .seg').forEach(function (x) { x.classList.toggle('active', x === b); });
    });
    $('#algoMode').addEventListener('click', function (e) {
      var b = e.target.closest('[data-algo]'); if (!b) return;
      state.algo = b.dataset.algo;
      $$('#algoMode .seg').forEach(function (x) { x.classList.toggle('active', x === b); });
    });
    $('#generateBtn').addEventListener('click', generatePattern);

    // 画布工具
    $('#zoomIn').addEventListener('click', function () { setZoom(state.zoom * 1.2); });
    $('#zoomOut').addEventListener('click', function () { setZoom(state.zoom / 1.2); });
    $('#zoomFit').addEventListener('click', fitZoom);
    ['showGrid', 'showLabel', 'showRuler'].forEach(function (k) {
      $('#' + k).addEventListener('change', function (e) { state[k] = e.target.checked; if (state.grid) renderPattern(); });
    });
    $$('.ctab').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cstatus = b.dataset.ctab;
        $$('.ctab').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('#canvasWrap').hidden = state.cstatus !== 'pattern' || !state.grid;
        $('#imgWrap').hidden = state.cstatus !== 'original' || !getSourceImage();
        if (state.cstatus === 'original' && getSourceImage()) $('#originalView').src = getSourceImage().src;
        if (state.cstatus === 'pattern' && state.grid) renderPattern();
      });
    });
    $('#previewBtn').addEventListener('click', showPreview);
    $('#downloadBtn').addEventListener('click', downloadHD);
    $('#exportCsvBtn').addEventListener('click', exportCsv);
    $('#editBtn').addEventListener('click', function () { toast('图纸编辑功能即将开放'); });
    $('#newBlankBtn').addEventListener('click', newBlank);

    // 画布交互: Ctrl+滚轮缩放 / 空格拖拽平移
    var stage = $('#canvasStage');
    stage.addEventListener('wheel', function (e) {
      if (!state.grid) return;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : .9)); }
    }, { passive: false });
  }

  // ---------- 图片处理 ----------
  function handleFile(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('仅支持 JPG / PNG / WEBP 格式'); return; }
    if (file.size > 20 * 1024 * 1024) { toast('图片不能超过 20MB'); return; }
    var url = URL.createObjectURL(file);
    loadImage(url).then(function (im) {
      state.originalImg = im;
      state.sourceImg = im;
      state.sourceName = file.name;
      state.adjust = { brightness: 0, contrast: 0, saturate: 0, rotate: 0, flip: false };
      state.materials = [{ img: im, name: '原图', styleKey: null }];
      state.activeMaterial = 0;
      state.grid = null;
      $('#uploadZone').hidden = true;
      $('#thumbRow').hidden = false;
      $('#sourceThumb').src = url;
      $('#sourceName').textContent = file.name;
      $('#sourceSize').textContent = im.naturalWidth + '×' + im.naturalHeight;
      $('#generateBtn').disabled = false;
      $('#canvasEmpty').hidden = false; $('#canvasWrap').hidden = true;
      $('#materialList').innerHTML = '<div class="material-empty">生成图纸后显示完整材料统计</div>';
      $('#statusLeft').textContent = '图片已上传 · ' + im.naturalWidth + '×' + im.naturalHeight;
      renderSourceTabs();
      if (state.locked) {
        var ratio = im.naturalHeight / im.naturalWidth;
        state.presetH = Math.max(8, Math.min(160, Math.round(state.presetW * ratio)));
        $('#customW').value = state.presetW; $('#customH').value = state.presetH;
      }
      toast('图片上传成功');
    }).catch(function () { toast('图片读取失败，请重试'); });
  }
  function refreshAdjusted() {
    if (!state.originalImg) return;
    var cv = applyAdjustToCanvas(state.originalImg);
    var url = cv.toDataURL('image/png');
    loadImage(url).then(function (im) {
      state.sourceImg = im;
      if (state.activeMaterial === 0) {
        state.materials[0] = { img: im, name: '原图', styleKey: null };
        $('#sourceThumb').src = url;
        renderSourceTabs();
      }
      $('#originalView').src = url;
    });
  }
  function renderSourceTabs() {
    var box = $('#sourceTabs');
    if (!state.materials.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = state.materials.map(function (m, i) {
      var label = i === 0 ? '原图' : (STYLES.find(function (s) { return s.key === m.styleKey; }) || {}).name || '风格';
      return '<button class="source-tab' + (i === state.activeMaterial ? ' active' : '') + '" data-mi="' + i + '" title="' + label + '">' +
        '<img src="' + m.img.src + '" alt="' + label + '"><span class="tab-label">' + (i === 0 ? '原图' : 'AI ' + i) + '</span>' +
        (i > 0 ? '<span class="tab-del" data-del="' + i + '">×</span>' : '') + '</button>';
    }).join('');
  }
  $('#sourceTabs').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      var i = +del.dataset.del;
      state.materials.splice(i, 1);
      if (state.activeMaterial >= i) state.activeMaterial = Math.max(0, state.activeMaterial - 1);
      renderSourceTabs(); toast('已删除风格结果'); return;
    }
    var b = e.target.closest('[data-mi]'); if (!b) return;
    state.activeMaterial = +b.dataset.mi;
    renderSourceTabs();
    toast('已切换素材，请重新生成图纸');
  });

  // ---------- AI 风格转换 (本地演示版) ----------
  function generateAIStyle() {
    if (!getSourceImage()) { toast('请先上传图片'); return; }
    if (state.quota.ai <= 0) { showQuotaModal('ai'); return; }
    var btn = $('#aiGenBtn'); btn.disabled = true; btn.textContent = '生成中…';
    toast('正在生成 ' + (STYLES.find(function (s) { return s.key === state.style; }) || {}).name + '…');
    setTimeout(function () {
      var src = getSourceImage();
      var cv = document.createElement('canvas');
      var w = Math.min(src.naturalWidth, 640);
      var h = Math.round(src.naturalHeight * w / src.naturalWidth);
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      // 白底 + 风格化滤镜（本地演示，实际产品由服务端 LLM 生成）
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      var filters = { chibi: 'saturate(1.35) contrast(1.08)', clay: 'saturate(.85) sepia(.15) contrast(.95)', doodle: 'saturate(.7) contrast(1.15)', kawaii: 'saturate(1.5) hue-rotate(-8deg) contrast(1.05)' };
      ctx.filter = filters[state.style] || 'none';
      ctx.drawImage(src, 0, 0, w, h);
      var url = cv.toDataURL('image/png');
      loadImage(url).then(function (im) {
        var name = (STYLES.find(function (s) { return s.key === state.style; }) || {}).name || '风格';
        state.materials.push({ img: im, name: name, styleKey: state.style });
        state.activeMaterial = state.materials.length - 1;
        state.quota.ai--; updateQuota();
        renderSourceTabs();
        $('#originalView').src = url;
        btn.disabled = false; btn.textContent = '生成风格图 · 消耗 1 次 AI';
        toast('风格图已生成，可在素材条切换');
      });
    }, 700);
  }

  // ---------- 拼豆生成 ----------
  function getTargetSize() {
    if (state.isCustom) {
      return { w: Math.max(8, Math.min(160, +$('#customW').value || 40)), h: Math.max(8, Math.min(160, +$('#customH').value || 40)) };
    }
    return { w: state.presetW, h: state.presetH };
  }
  function showProgress(show, pct, label) {
    var o = $('#progressOverlay'); o.hidden = !show;
    if (show) { $('#progressFill').style.width = pct + '%'; $('#progressLabel').textContent = label; }
  }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); }

  async function generatePattern() {
    var src = getSourceImage();
    if (!src) { toast('请先上传图片'); return; }
    if (state.generating) return;
    state.generating = true;
    $('#generateBtn').disabled = true;
    var size = getTargetSize();
    try {
      showProgress(true, 8, '准备图片…'); await nextFrame();
      // 缩放图片到目标网格尺寸
      var cv = document.createElement('canvas'); cv.width = size.w; cv.height = size.h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size.w, size.h);
      ctx.drawImage(src, 0, 0, size.w, size.h);
      var imgData = ctx.getImageData(0, 0, size.w, size.h);

      showProgress(true, 28, '构建色卡…'); await nextFrame();
      var palette = state.palette;
      if (!palette.length) { toast('色卡为空，请检查色系筛选'); return; }

      showProgress(true, 42, '智能选色（分析图片色彩分布）…'); await nextFrame();
      var chosen = A.smartSelect(imgData, size.w, size.h, palette, Math.min(state.maxColors, palette.length), state.algo);

      showProgress(true, 68, state.dither === 'floyd' ? '经典抖动（Floyd-Steinberg）…' : (state.dither === 'pair' ? '近色抖动…' : '颜色量化…')); await nextFrame();
      var grid = A.quantize(imgData, chosen, state.dither, state.algo);

      showProgress(true, 88, '渲染图纸…'); await nextFrame();
      state.grid = grid; state.gridW = size.w; state.gridH = size.h;
      state.usedPalette = chosen;
      state.cstatus = 'pattern';
      $$('.ctab').forEach(function (x) { x.classList.toggle('active', x.dataset.ctab === 'pattern'); });

      $('#canvasEmpty').hidden = true; $('#canvasWrap').hidden = false; $('#imgWrap').hidden = true;
      renderPattern(); fitZoom(); updateStats();
      ['#previewBtn', '#downloadBtn', '#exportCsvBtn', '#editBtn', '#newBlankBtn'].forEach(function (s) { $(s).disabled = false; $(s).hidden = false; });
      $('#statusLeft').textContent = '图纸已生成 · ' + size.w + '×' + size.h + ' 格 · ' + A.stats(grid).total + ' 颗豆';

      // 额度：拼豆次数为 0 时仍可免费预览
      if (state.quota.beads > 0) { state.quota.beads--; updateQuota(); }
      else toast('拼豆次数已用完，本次为免费预览图纸');

      showProgress(true, 100, '完成'); await sleep(220); showProgress(false);
      toast('图纸生成完成');
    } catch (e) {
      showProgress(false);
      toast('生成失败：' + e.message);
      console.error(e);
    } finally {
      state.generating = false;
      $('#generateBtn').disabled = false;
    }
  }

  // ---------- 画布渲染 ----------
  function getCellSize() {
    var stage = $('#canvasStage');
    var availW = stage.clientWidth - 72, availH = stage.clientHeight - 72;
    var base = Math.max(4, Math.min(availW / state.gridW, availH / state.gridH, 26));
    return Math.max(3, Math.round(base * state.zoom));
  }
  function renderPattern() {
    if (!state.grid) return;
    var cell = getCellSize();
    var cols = state.gridW, rows = state.gridH;
    var ruler = state.showRuler ? 26 : 0;
    var pad = 14;
    var cv = $('#patternCanvas');
    cv.width = cols * cell + ruler + pad * 2;
    cv.height = rows * cell + ruler + pad * 2;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-surface').trim() || '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    var ox = ruler + pad, oy = ruler + pad;

    // 矩形色块填充（不使用圆形豆子）
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var c = state.grid[y][x];
        if (!c) continue;
        ctx.fillStyle = c.hex;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        // 29格板分隔线
        if (state.showGrid && cell >= 7 && (x + 1) % 29 === 0 && x < cols - 1) {
          ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ox + (x + 1) * cell + .5, oy); ctx.lineTo(ox + (x + 1) * cell + .5, oy + rows * cell); ctx.stroke();
        }
        if (state.showGrid && cell >= 7 && (y + 1) % 29 === 0 && y < rows - 1) {
          ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ox, oy + (y + 1) * cell + .5); ctx.lineTo(ox + cols * cell, oy + (y + 1) * cell + .5); ctx.stroke();
        }
      }
    }
    // 网格线
    if (state.showGrid && cell >= 8) {
      ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= cols; gx++) { ctx.moveTo(ox + gx * cell + .5, oy); ctx.lineTo(ox + gx * cell + .5, oy + rows * cell); }
      for (var gy = 0; gy <= rows; gy++) { ctx.moveTo(ox, oy + gy * cell + .5); ctx.lineTo(ox + cols * cell, oy + gy * cell + .5); }
      ctx.stroke();
    }
    // 色号标注（亮度阈值 128：深底白字、浅底深字）
    if (state.showLabel && cell >= 19) {
      ctx.font = '600 ' + Math.max(8, Math.floor(cell * .32)) + 'px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var ly = 0; ly < rows; ly++) {
        for (var lx = 0; lx < cols; lx++) {
          var cc = state.grid[ly][lx]; if (!cc) continue;
          ctx.fillStyle = A.luminance(cc.rgb) > 128 ? '#1a1f2e' : '#ffffff';
          ctx.fillText(cc.id, ox + lx * cell + cell / 2, oy + ly * cell + cell / 2);
        }
      }
    }
    // 坐标尺
    if (state.showRuler && cell >= 10) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-dim').trim() || '#888';
      ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var step = cell >= 20 ? 1 : (cell >= 14 ? 2 : 5);
      for (var rx = 0; rx < cols; rx += step) ctx.fillText(String(rx + 1), ox + rx * cell + cell / 2, oy - 13);
      ctx.textAlign = 'right';
      for (var ry = 0; ry < rows; ry += step) ctx.fillText(String(ry + 1), ox - 6, oy + ry * cell + cell / 2);
    }
    $('#zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
  }
  function setZoom(z) { state.zoom = Math.max(.4, Math.min(6, z)); renderPattern(); }
  function fitZoom() { state.zoom = 1; renderPattern(); }

  function updateStats() {
    var st = A.stats(state.grid);
    $('#statTotal').textContent = st.total;
    $('#statTypes').textContent = st.types;
    var mm = 2.6;
    $('#statSize').textContent = (state.gridW * mm / 10).toFixed(1) + '×' + (state.gridH * mm / 10).toFixed(1) + 'cm';
    $('#colorCountBadge').textContent = st.types + ' 色';
    var counts = Object.keys(st.colors).map(function (id) { return { id: id, n: st.colors[id] }; })
      .sort(function (a, b) { return b.n - a.n; });
    $('#materialList').innerHTML = counts.map(function (x) {
      var c = state.usedPalette.find(function (p) { return p.id === x.id; }) || { hex: '#ccc', name: x.id };
      return '<div class="material-item"><span class="material-swatch" style="background:' + c.hex + '"></span>' +
        '<span class="material-info"><strong>' + x.id + '</strong><span>' + c.name + '</span></span>' +
        '<span class="material-qty"><b>' + x.n + '</b> 颗</span></div>';
    }).join('');
  }

  // ---------- 预览 / 下载 ----------
  function drawHDCanvas(withWatermark) {
    var cell = 26, ruler = 30, pad = 24;
    var cv = document.createElement('canvas');
    cv.width = state.gridW * cell + ruler + pad * 2;
    cv.height = state.gridH * cell + ruler + pad * 2;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    var ox = ruler + pad, oy = ruler + pad;
    for (var y = 0; y < state.gridH; y++) for (var x = 0; x < state.gridW; x++) {
      var c = state.grid[y][x]; if (!c) continue;
      ctx.fillStyle = c.hex; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= state.gridW; gx++) { ctx.moveTo(ox + gx * cell + .5, oy); ctx.lineTo(ox + gx * cell + .5, oy + state.gridH * cell); }
    for (var gy = 0; gy <= state.gridH; gy++) { ctx.moveTo(ox, oy + gy * cell + .5); ctx.lineTo(ox + state.gridW * cell, oy + gy * cell + .5); }
    ctx.stroke();
    ctx.font = '600 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var y2 = 0; y2 < state.gridH; y2++) for (var x2 = 0; x2 < state.gridW; x2++) {
      var c2 = state.grid[y2][x2]; if (!c2) continue;
      ctx.fillStyle = A.luminance(c2.rgb) > 128 ? '#1a1f2e' : '#ffffff';
      ctx.fillText(c2.id, ox + x2 * cell + cell / 2, oy + y2 * cell + cell / 2);
    }
    ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    for (var rx = 0; rx < state.gridW; rx += 5) ctx.fillText(String(rx + 1), ox + rx * cell + cell / 2, oy - 15);
    ctx.textAlign = 'right';
    for (var ry = 0; ry < state.gridH; ry += 5) ctx.fillText(String(ry + 1), ox - 8, oy + ry * cell + cell / 2);
    // 页眉
    ctx.fillStyle = '#1a1f2e'; ctx.textAlign = 'left'; ctx.font = '700 16px sans-serif';
    ctx.fillText('AI 拼豆工作台 · 高清图纸', pad, 22);
    if (withWatermark) {
      ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = 'rgba(230,138,92,.10)'; ctx.font = '700 42px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('AI 拼豆工作台 · 免费预览', 0, 0); ctx.restore();
    }
    return cv;
  }
  function showPreview() {
    if (!state.grid) return;
    var cv = drawHDCanvas(true);
    var url = cv.toDataURL('image/png');
    openModal('<h2>图纸预览</h2><p class="sub">免费预览含水印，仅供查看整体效果。下载高清图纸后获得完整色号、坐标与材料统计。</p>' +
      '<img src="' + url + '" alt="图纸预览" style="width:100%;border:1px solid var(--c-border);border-radius:12px;max-height:55vh;object-fit:contain">' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-primary" id="modalDownload">下载高清图纸</button></div>', true);
    $('#modalDownload').addEventListener('click', function () { closeModal(); downloadHD(); });
  }
  function downloadHD() {
    if (!state.grid) return;
    // 演示环境：直接下载无水印高清图纸。正式产品在此处接入权益校验与支付。
    var cv = drawHDCanvas(false);
    cv.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'AI拼豆图纸_' + state.gridW + 'x' + state.gridH + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      toast('高清图纸已下载');
    }, 'image/png');
  }
  function exportCsv() {
    if (!state.grid) return;
    var st = A.stats(state.grid);
    var mm = 2.6;
    var rows = [
      ['图纸标题', 'AI 拼豆图纸'],
      ['色卡品牌', 'MARD 2.6mm 291色'],
      ['格子尺寸', state.gridW + 'x' + state.gridH],
      ['颜色种数', String(st.types)],
      ['总豆数', String(st.total)],
      ['实物尺寸', (state.gridW * mm / 10).toFixed(1) + 'x' + (state.gridH * mm / 10).toFixed(1) + 'cm'],
      [],
      ['色号', '颜色名称', '数量（颗）', '占比'],
      ...Object.keys(st.colors).sort(function (a, b) { return st.colors[b] - st.colors[a]; }).map(function (id) {
        var c = state.usedPalette.find(function (p) { return p.id === id; }) || { name: id };
        return [id, c.name, String(st.colors[id]), (st.colors[id] / st.total * 100).toFixed(1) + '%'];
      }),
      ['', '合计', String(st.total), '100%']
    ];
    var csv = '\ufeff' + rows.map(function (r) { return r.join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'AI拼豆_用色清单.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('用色清单已导出');
  }
  function newBlank() {
    openModal('<h2>新增空白图纸</h2><p class="sub">将创建 40×40 全空网格，当前图纸会存入历史版本。</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="confirmBlank">确认创建</button></div>');
    $('#confirmBlank').addEventListener('click', function () {
      state.grid = Array.from({ length: 40 }, function () { return new Array(40).fill(null); });
      state.gridW = state.gridH = 40;
      closeModal(); renderPattern(); updateStats(); toast('已创建空白图纸');
    });
  }
  function showQuotaModal(type) {
    openModal('<h2>' + (type === 'ai' ? 'AI 次数不足' : '拼豆次数不足') + '</h2><p class="sub">购买次数包或开通会员后可继续使用。拼豆次数为 0 时仍可免费生成预览图纸。</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="card" style="padding:16px;display:flex;justify-content:space-between;align-items:center"><div><strong>AI 次数包</strong><div class="muted" style="font-size:12px">10 次 AI 风格转换</div></div><strong>¥ 9.9</strong></div>' +
      '<div class="card" style="padding:16px;display:flex;justify-content:space-between;align-items:center"><div><strong>月会员</strong><div class="muted" style="font-size:12px">AI 30 次 · 拼豆不限 · 高清下载</div></div><strong>¥ 29</strong></div>' +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="mockPay">模拟购买</button></div>');
    $('#mockPay').addEventListener('click', function () {
      state.quota.ai += 10; state.quota.beads += 20; updateQuota(); closeModal(); toast('购买成功（演示），额度已到账');
    });
  }
  function showAuth() {
    openModal('<h2>登录 / 注册</h2><p class="sub">手机号首次验证成功即自动创建账号，赠送 AI 10 次 + 拼豆 20 次。</p>' +
      '<div class="field"><span class="field-label">手机号</span><input class="input" id="phone" placeholder="请输入大陆手机号" maxlength="11"></div>' +
      '<div class="field" style="margin-top:12px"><span class="field-label">验证码</span><div style="display:flex;gap:8px"><input class="input" id="code" placeholder="6 位验证码" maxlength="6"><button class="btn btn-outline" id="sendCode">获取验证码</button></div></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:16px;font-size:12px"><input type="checkbox" id="agree" checked> 已阅读并同意用户协议与隐私政策</label>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" id="doLogin">登录 / 注册</button></div>');
    $('#sendCode').addEventListener('click', function () {
      var p = $('#phone').value;
      if (!/^1[3-9]\d{9}$/.test(p)) { toast('请输入正确的手机号'); return; }
      toast('验证码已发送（演示：123456）');
      var b = $('#sendCode'); var n = 60;
      b.disabled = true;
      var t = setInterval(function () { b.textContent = n + 's'; if (--n < 0) { clearInterval(t); b.disabled = false; b.textContent = '获取验证码'; } }, 1000);
    });
    $('#doLogin').addEventListener('click', function () {
      if (!/^1[3-9]\d{9}$/.test($('#phone').value)) { toast('请输入正确的手机号'); return; }
      if ($('#code').value !== '123456') { toast('验证码错误'); return; }
      closeModal(); $('#authBtn').textContent = '我的账号'; toast('登录成功');
    });
  }

  init();
})();
