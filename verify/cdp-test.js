// 用 CDP 自动化验证：上传图片 → 点击生成 → 检查画布与用料清单
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PAGE = "file:///C:/Users/l'l/WorkBuddy/2026-11-25-13-48-17/ai-perler/web/index.html";
const IMG = "C:\\Users\\l'l\\WorkBuddy\\2026-11-25-13-48-17\\ai-perler\\verify\\test-flower.png";
const OUT = "C:\\Users\\l'l\\WorkBuddy\\2026-11-25-13-48-17\\ai-perler\\verify\\generated.png";
const PORT = 9333;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('CDP not ready');
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`, '--window-size=1440,900', '--user-data-dir=' + path.join(__dirname, 'cdp-profile'),
    PAGE
  ], { stdio: 'ignore' });

  try {
    const wsUrl = await getWs();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') events.push(m.params.exceptionDetails.text + ': ' + (m.params.exceptionDetails.exception?.description || ''));
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise(res => {
      const mid = ++id;
      pending.set(mid, res);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evalJs = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) events.push('eval: ' + r.result.exceptionDetails.text);
      return r.result?.result?.value;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(1200);

    console.log('初始视图:', await evalJs("document.querySelector('#viewStudio').style.display !== 'none' ? 'studio' : 'home'"));

    // 设置文件输入
    const root = (await send('DOM.getDocument')).result.root.nodeId;
    const inputNode = (await send('DOM.querySelector', { nodeId: root, selector: '#fileInput' })).result.nodeId;
    await send('DOM.setFileInputFiles', { files: [IMG], nodeId: inputNode });
    await sleep(800);
    console.log('上传后状态:', await evalJs("document.querySelector('#statusLeft').textContent"));
    console.log('生成按钮可用:', await evalJs("!document.querySelector('#generateBtn').disabled"));

    // 触发生成
    await evalJs("document.querySelector('#generateBtn').click()");
    // 等待生成完成（进度遮罩隐藏 + 状态栏包含“已生成”）
    let done = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const st = await evalJs("document.querySelector('#statusLeft').textContent");
      if (st.includes('已生成')) { done = true; console.log('生成状态:', st); break; }
    }
    if (!done) console.log('生成未完成, 状态:', await evalJs("document.querySelector('#statusLeft').textContent"));

    const canvasInfo = await evalJs(`(() => {
      const c = document.querySelector('#patternCanvas');
      return { w: c.width, h: c.height, hidden: document.querySelector('#canvasWrap').hidden };
    })()`);
    console.log('画布:', JSON.stringify(canvasInfo));
    console.log('用料统计:', await evalJs("document.querySelector('#colorCountBadge').textContent + ' / 总豆数 ' + document.querySelector('#statTotal').textContent"));
    console.log('用料条目数:', await evalJs("document.querySelectorAll('.material-item').length"));

    // 等待进度遮罩消失后截图
    await sleep(1000);
    console.log('进度遮罩隐藏:', await evalJs("document.querySelector('#progressOverlay').hidden"));
    // 放大到 200% 验证色号标注
    await evalJs("document.querySelector('#zoomIn').click();document.querySelector('#zoomIn').click()");
    await sleep(300);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
    console.log('截图已保存:', OUT);

    console.log('JS 错误数:', events.length);
    events.slice(0, 10).forEach(e => console.log('  ERR:', e));
    ws.close();
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill();
  }
})();
