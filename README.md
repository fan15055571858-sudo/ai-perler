# AI 拼豆工作台

上传图片，一键生成带色号标注的可拼拼豆图纸。包含 **Web 网站** 与 **微信小程序** 两端，共用同一套颜色映射算法。

> 私有仓库，用于版本备份与迭代回退。

## 目录结构

```
ai-perler/
├── web/                      # 静态网站（直接打开 index.html 即可用）
│   ├── index.html            # 首页 + 三栏工作台
│   ├── css/
│   │   ├── design-system.css # 设计 token
│   │   └── app.css           # 组件与布局
│   └── js/
│       ├── palette.js        # MARD 2.6mm 291 色色卡
│       ├── bead-algorithm.js # 核心算法（色彩空间/色差/选色/抖动）
│       └── app.js            # 应用逻辑（上传/参数/生成/渲染/导出）
└── miniapp-project/          # 微信小程序原生工程
    ├── app.js / app.json / app.wxss
    ├── pages/
    │   ├── index/            # 创作页
    │   ├── preview/          # 图纸预览页
    │   └── works/            # 作品列表页
    └── utils/                # 与网站共用的算法与色卡
```

## 核心算法

从竞品「拼豆格」(jojobobo.com) 公开前端逆向移植，双端共用：

- **色彩空间**：sRGB → CIE Lab (D65)
- **色差匹配**：CIEDE2000 感知色差（默认）/ CIE76 快速
- **智能选色**：最长轴二分聚类（median-cut）生成种子色，按像素权重选出代表色号
- **抖动**：Floyd-Steinberg 误差扩散（7/16、3/16、5/16、1/16），支持近色抖动
- **色卡**：MARD 2.6mm 291 色（实色/透明/荧光/夜光/珠光/金属）
- **渲染**：矩形色块填充 + 色号标注（亮度阈值切换字色）+ 坐标尺

透明度阈值统一为 `alpha < 128` 视为空格子。

## 本地运行

**网站**：直接用浏览器打开 `web/index.html`，或在 `web/` 目录起任意静态服务器：

```bash
cd web
python -m http.server 8080
# 访问 http://localhost:8080
```

**小程序**：用微信开发者工具导入 `miniapp-project/` 目录（使用测试号 AppID 即可）。

## 迭代与回退

每次迭代都会在 `CHANGELOG.md` 记录版本，并推送一个 git commit。回退方式：

```bash
git log --oneline          # 查看历史版本
git checkout <commit-hash> # 切换到历史版本
git revert <commit-hash>   # 撤销某个版本（保留后续历史）
```

详见 `CHANGELOG.md`。
