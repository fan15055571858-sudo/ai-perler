/**
 * 拼豆图纸生成算法 — 复刻自拼豆格 (jojobobo.com) 核心算法
 * 包含: sRGB→Lab、CIEDE2000/CIE76、最长轴二分聚类智能选色、Floyd-Steinberg 误差扩散
 * 纯计算模块，无 DOM 依赖，网站与小程序共用。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeadAlgo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var P = 25e7; // 25^7

  // ---------- 色彩空间 ----------
  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
  }
  // sRGB -> CIE Lab (D65)
  function rgbToLab(r, g, b) {
    var rr = r / 255, gg = g / 255, bb = b / 255;
    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
    var x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
    var y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722);
    var z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
    var f = function (p) { return p > 0.008856 ? Math.pow(p, 1 / 3) : 7.787 * p + 16 / 116; };
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  function cie76(a, b) {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
  }
  // CIEDE2000 感知色差
  function ciede2000(a, b) {
    var r1 = a[0], a1 = a[1], b1 = a[2];
    var r2 = b[0], a2 = b[1], b2 = b[2];
    var kL = 1, kC = 1, kH = 1;
    var dR = r2 - r1;
    var Lm = (r1 + r2) / 2;
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cb = (C1 + C2) / 2;
    var G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + P)));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
    var Cbp = (C1p + C2p) / 2;
    var hp1 = Math.atan2(b1, a1p) * 180 / Math.PI; if (hp1 < 0) hp1 += 360;
    var hp2 = Math.atan2(b2, a2p) * 180 / Math.PI; if (hp2 < 0) hp2 += 360;
    var dh;
    if (C1p === 0 || C2p === 0) dh = 0;
    else if (Math.abs(hp2 - hp1) <= 180) dh = hp2 - hp1;
    else if (hp2 - hp1 > 180) dh = hp2 - hp1 - 360;
    else dh = hp2 - hp1 + 360;
    var dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360);
    var hbp;
    if (C1p === 0 || C2p === 0) hbp = hp1 + hp2;
    else if (Math.abs(hp1 - hp2) <= 180) hbp = (hp1 + hp2) / 2;
    else if (hp1 + hp2 < 360) hbp = (hp1 + hp2 + 360) / 2;
    else hbp = (hp1 + hp2 - 360) / 2;
    var T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
      + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hbp - 63) * Math.PI / 180);
    var dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    var Sl = 1 + (0.015 * Math.pow(Lm - 50, 2)) / Math.sqrt(20 + Math.pow(Lm - 50, 2));
    var Sc = 1 + 0.045 * Cbp;
    var Sh = 1 + 0.015 * Cbp * T;
    var Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + P));
    var Rt = -Rc * Math.sin(2 * dTh * Math.PI / 180);
    var t = Math.pow(dR / (kL * Sl), 2) + Math.pow((C2p - C1p) / (kC * Sc), 2)
      + Math.pow(dH / (kH * Sh), 2) + Rt * ((C2p - C1p) / (kC * Sc)) * (dH / (kH * Sh));
    return Math.sqrt(Math.max(0, t));
  }
  function getDist(algo) { return algo === 'ciede2000' ? ciede2000 : cie76; }

  // ---------- 色卡构建 ----------
  // raw: [[id, r, g, b, series], ...]
  function buildPalette(raw, seriesFilter) {
    var allowed = seriesFilter && seriesFilter.length ? seriesFilter : null;
    return raw.filter(function (c) { return !allowed || allowed.indexOf(c[4]) >= 0; })
      .map(function (c) {
        var hex = rgbToHex(c[1], c[2], c[3]);
        return { id: c[0], name: c[0], hex: hex, rgb: [c[1], c[2], c[3]], lab: rgbToLab(c[1], c[2], c[3]), series: c[4] };
      });
  }

  // ---------- 最近邻选色 ----------
  function nearestColor(r, g, b, palette, algo) {
    var lab = rgbToLab(r, g, b);
    var dist = getDist(algo);
    var best = null, bestD = Infinity, second = null, secondD = Infinity;
    for (var i = 0; i < palette.length; i++) {
      var c = palette[i];
      var d = dist(lab, c.lab);
      if (d < bestD) { second = best; secondD = bestD; best = c; bestD = d; }
      else if (d < secondD) { second = c; secondD = d; }
    }
    return { best: best, second: second, bestDist: bestD };
  }

  // ---------- 最长轴二分聚类 (智能选色种子) ----------
  function axisInfo(pixels) {
    var minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (var i = 0; i < pixels.length; i++) {
      var p = pixels[i];
      if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0];
      if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1];
      if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2];
    }
    var rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB;
    var maxRange = Math.max(rangeR, rangeG, rangeB);
    var channel = maxRange === rangeR ? 0 : (maxRange === rangeG ? 1 : 2);
    return { maxRange: maxRange, channel: channel };
  }
  function splitClusters(pixels, target) {
    if (!pixels.length) return [];
    var groups = [{ pixels: pixels }];
    while (groups.length < target) {
      var idx = -1, bestRange = -1;
      for (var m = 0; m < groups.length; m++) {
        if (groups[m].pixels.length < 2) continue;
        var info = axisInfo(groups[m].pixels);
        if (info.maxRange > bestRange) { bestRange = info.maxRange; idx = m; }
      }
      if (idx === -1) break;
      var g = groups[idx];
      var ch = axisInfo(g.pixels).channel;
      g.pixels.sort(function (a, b) { return a[ch] - b[ch]; });
      var mid = Math.floor(g.pixels.length / 2);
      groups.splice(idx, 1, { pixels: g.pixels.slice(0, mid) }, { pixels: g.pixels.slice(mid) });
    }
    return groups.map(function (a) {
      var s0 = 0, s1 = 0, s2 = 0;
      for (var i = 0; i < a.pixels.length; i++) { s0 += a.pixels[i][0]; s1 += a.pixels[i][1]; s2 += a.pixels[i][2]; }
      var n = a.pixels.length;
      return [Math.round(s0 / n), Math.round(s1 / n), Math.round(s2 / n), n];
    });
  }

  // 智能选色: 分析图片实际用色，选出最能代表图片的 N 个色号
  function smartSelect(imageData, w, h, palette, maxColors, algo) {
    var pixels = [];
    for (var v = 0; v < w * h; v++) {
      var o = v * 4;
      if (imageData.data[o + 3] < 128) continue;
      pixels.push([imageData.data[o], imageData.data[o + 1], imageData.data[o + 2]]);
    }
    if (!pixels.length) return palette.slice(0, maxColors);
    var seedCount = Math.min(maxColors * 2, pixels.length, 128);
    var seeds = splitClusters(pixels, seedCount);
    var dist = getDist(algo);
    var weights = {};
    for (var i = 0; i < seeds.length; i++) {
      var lab = rgbToLab(seeds[i][0], seeds[i][1], seeds[i][2]);
      var best = null, bd = Infinity;
      for (var j = 0; j < palette.length; j++) {
        var d = dist(lab, palette[j].lab);
        if (d < bd) { bd = d; best = palette[j]; }
      }
      if (best) weights[best.id] = (weights[best.id] || 0) + seeds[i][3];
    }
    var chosen = Object.keys(weights).map(function (id) {
      return { color: palette.find(function (c) { return c.id === id; }), weight: weights[id] };
    }).filter(function (x) { return x.color; })
      .sort(function (a, b) { return b.weight - a.weight; })
      .slice(0, maxColors).map(function (x) { return x.color; });
    if (chosen.length < maxColors) {
      var have = {}; chosen.forEach(function (c) { have[c.id] = true; });
      for (var k = 0; k < palette.length && chosen.length < maxColors; k++) {
        if (!have[palette[k].id]) { chosen.push(palette[k]); have[palette[k].id] = true; }
      }
    }
    return chosen;
  }

  // ---------- 抖动量化 ----------
  var FLOYD = [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]];
  var PAIR = [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
  function clamp255(v) { return Math.min(255, Math.max(0, Math.round(v))); }
  function diffuse(buf, w, h, x, y, matrix, er, eg, eb) {
    for (var i = 0; i < matrix.length; i++) {
      var nx = x + matrix[i][0], ny = y + matrix[i][1], wt = matrix[i][2];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      var o = (ny * w + nx) * 4;
      buf[o] += er * wt; buf[o + 1] += eg * wt; buf[o + 2] += eb * wt;
    }
  }

  /**
   * 核心转换: 图像数据 -> 拼豆网格
   * @param imageData {data, width, height} 已缩放至目标网格尺寸的像素数据
   * @param palette 选色后的色卡数组
   * @param ditherMode 'off' | 'floyd' | 'pair'
   * @param algo 'ciede2000' | 'cie76'
   * @returns 二维数组 [y][x] = 色号对象或 null
   */
  function quantize(imageData, palette, ditherMode, algo) {
    var w = imageData.width, h = imageData.height;
    var data = imageData.data;
    var grid = [];
    var dist = getDist(algo);
    if (ditherMode === 'off') {
      for (var y = 0; y < h; y++) {
        var row = [];
        for (var x = 0; x < w; x++) {
          var o = (y * w + x) * 4;
          if (data[o + 3] < 128) { row.push(null); continue; }
          row.push(nearestColor(data[o], data[o + 1], data[o + 2], palette, algo).best);
        }
        grid.push(row);
      }
      return grid;
    }
    var buf = new Float32Array(data);
    var matrix = ditherMode === 'pair' ? PAIR : FLOYD;
    var usePairGuard = ditherMode === 'pair';
    for (var yy = 0; yy < h; yy++) {
      var r2 = [];
      for (var xx = 0; xx < w; xx++) {
        var idx = (yy * w + xx) * 4;
        if (data[idx + 3] < 128) { r2.push(null); continue; }
        var cr = clamp255(buf[idx]), cg = clamp255(buf[idx + 1]), cb = clamp255(buf[idx + 2]);
        var res = nearestColor(cr, cg, cb, palette, algo);
        var chosen = res.best;
        if (usePairGuard && res.second && res.bestDist > 12) {
          var lab = rgbToLab(cr, cg, cb);
          chosen = dist(lab, res.best.lab) <= dist(lab, res.second.lab) ? res.best : res.second;
        }
        r2.push(chosen);
        diffuse(buf, w, h, xx, yy, matrix, cr - chosen.rgb[0], cg - chosen.rgb[1], cb - chosen.rgb[2]);
      }
      grid.push(r2);
    }
    return grid;
  }

  // ---------- 统计 ----------
  function stats(grid) {
    var map = {}, total = 0;
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        var c = grid[y][x];
        if (!c) continue;
        total++;
        map[c.id] = (map[c.id] || 0) + 1;
      }
    }
    return { total: total, colors: map, types: Object.keys(map).length };
  }

  function luminance(rgb) {
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  }
  function contrastText(rgb) {
    return luminance(rgb) > 150 ? '#1a1f2e' : '#ffffff';
  }

  return {
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToLab: rgbToLab,
    cie76: cie76,
    ciede2000: ciede2000,
    buildPalette: buildPalette,
    nearestColor: nearestColor,
    splitClusters: splitClusters,
    smartSelect: smartSelect,
    quantize: quantize,
    stats: stats,
    luminance: luminance,
    contrastText: contrastText
  };
});
