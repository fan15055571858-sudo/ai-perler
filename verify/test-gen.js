// 生成一张测试图片（小红花）—— 用纯 SVG 转 PNG 通过 Chrome 截图太复杂，直接写一个 BMP 更简单
// 这里生成一个 120x120 的 PNG，圆心红色花瓣 + 黄色花心 + 绿叶
const fs = require('fs');
const zlib = require('zlib');
function crc32(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return (~c)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const t=Buffer.from(type);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
const w=120,h=120;const raw=Buffer.alloc((w*3+1)*h);
for(let y=0;y<h;y++){const off=y*(w*3+1);raw[off]=0;for(let x=0;x<w;x++){
  const dx=x-60,dy=y-60,r=Math.sqrt(dx*dx+dy*dy),ang=Math.atan2(dy,dx);
  let R=255,G=255,B=255;
  if(r<14){R=245;G=197;B=66;}
  else if(r<46){const petal=Math.cos(ang*5)>0.25;if(petal){R=253;G=84;B=61;}}
  else if(Math.abs(dy-72)<16&&dx>-6&&dx<6){R=53;G=199;B=91;}
  const o=off+1+x*3;raw[o]=R;raw[o+1]=G;raw[o+2]=B;
}}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const out="C:\\Users\\l'l\\WorkBuddy\\2026-11-25-13-48-17\\ai-perler\\verify\\test-flower.png";
fs.writeFileSync(out,png);
console.log('written',out,png.length);
