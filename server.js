const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'web');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  // 防目录穿越
  if (!f.startsWith(root)) { s.writeHead(403); s.end('403'); return; }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); s.end('404'); return; }
    s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    s.end(d);
  });
}).listen(8899, () => console.log('AI Perler server ready on http://127.0.0.1:8899'));
