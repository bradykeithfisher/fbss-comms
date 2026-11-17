// Lays the event's text, the FBSS brand fonts and logo over AI artwork, in the browser.
// Each function takes the campaign and the artwork's URL and returns finished files as Blobs.

export const COLORS = { rust:'#91412D', gold:'#B47E3D', slate:'#414A55', cream:'#EFE9DB', moss:'#8C9077', ink:'#2E343C', muted:'#686E75', white:'#FFFFFF' };
const FAM = { title:'FBSS Marcellus', ui:'FBSS Jost', serif:'FBSS Baskerville', serifI:'FBSS Baskerville Italic' };
const FONT_FILES = { title:'Marcellus-Regular.ttf', ui:'Jost-Medium.ttf', serif:'LibreBaskerville-Regular.ttf', serifI:'LibreBaskerville-Italic.ttf' };

let fontsReady = null;
export function loadFonts(){
  if(!fontsReady) fontsReady = Promise.all(Object.entries(FONT_FILES).map(async ([k,file])=>{
    const f = new FontFace(FAM[k], `url(/assets/fonts/${file})`); await f.load(); document.fonts.add(f);
  }));
  return fontsReady;
}
export function loadImage(src){
  return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>rej(new Error("Couldn't load the artwork.")); i.src=src; });
}

/* ---------- event text ---------- */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const ymd = s => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null; };
const hm = t => { const m=/^(\d{1,2}):(\d{2})/.exec(t||''); if(!m) return null; const h=+m[1]; return { h12:((h+11)%12)+1, mm:m[2], ap:h>=12?'PM':'AM' }; };
const tStr = (t,withAp=true) => { const x=hm(t); if(!x) return ''; return `${x.h12}${x.mm==='00'?'':':'+x.mm}${withAp?' '+x.ap:''}`; };
export function eventText(c){
  const a=ymd(c.date), b=ymd(c.endDate);
  let date='';
  if(a){
    if(b && b>a){
      date = a.getUTCMonth()===b.getUTCMonth() ? `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}` : `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
    } else date = `${DAYS[a.getUTCDay()]}, ${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  }
  let time='';
  if(c.time){
    const s=hm(c.time), e=hm(c.endTime);
    time = e && (!b || +b===+a) ? (s.ap===e.ap ? `${tStr(c.time,false)}–${tStr(c.endTime)}` : `${tStr(c.time)} – ${tStr(c.endTime)}`) : tStr(c.time);
  }
  const link = String(c.link||'').replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
  return { title:(c.title||'').trim()||'Event', date, time, where:(c.location||'').trim(), blurb:String(c.description||'').replace(/\s+/g,' ').trim(), link: link||'fbss.church' };
}

/* ---------- canvas helpers ---------- */
function canvas(w,h){ const cv=document.createElement('canvas'); cv.width=w; cv.height=h; return [cv, cv.getContext('2d')]; }
// Draw an image to fill a box, cropping the overflow. fy picks which part stays when cropping top/bottom (0 = top).
function cover(x, img, dx, dy, dw, dh, fy=0.4){
  const s=Math.max(dw/img.naturalWidth, dh/img.naturalHeight); const sw=dw/s, sh=dh/s;
  const sx=(img.naturalWidth-sw)/2, sy=(img.naturalHeight-sh)*fy;
  x.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
function setFont(x, fam, size, spacing=0){ x.font=`${size}px "${fam}"`; if('letterSpacing' in x) x.letterSpacing=spacing+'px'; }
function measure(x, s){ return x.measureText(s).width; }
function wrap(x, text, maxW){
  const words=String(text).split(/\s+/).filter(Boolean); const lines=[]; let cur='';
  for(const w of words){ const t=cur?cur+' '+w:w; if(measure(x,t)<=maxW || !cur) cur=t; else { lines.push(cur); cur=w; } }
  if(cur) lines.push(cur); return lines;
}
// Largest size (from max down to min) at which the text fits in maxLines lines.
function fit(x, text, fam, maxW, maxLines, max, min, spacingEm=0){
  for(let size=max; size>=min; size-=2){ setFont(x,fam,size,size*spacingEm); const lines=wrap(x,text,maxW); if(lines.length<=maxLines && lines.every(l=>measure(x,l)<=maxW)) return {size, lines}; }
  setFont(x,fam,min,min*spacingEm); let lines=wrap(x,text,maxW);
  if(lines.length>maxLines){ lines=lines.slice(0,maxLines); let l=lines[maxLines-1]; while(l && measure(x,l+'…')>maxW) l=l.replace(/\s*\S+$/,''); lines[maxLines-1]=l+'…'; }
  return {size:min, lines};
}
async function logoCanvas(width, white){
  const img=await loadImage(white?'/assets/logo-horizontal-reversed.svg':'/assets/logo-horizontal.svg'); const h=Math.round(width*250/890);
  const [cv,x]=canvas(width,h); x.drawImage(img,0,0,width,h);
  return cv;
}
const toBlob = (cv, type='image/jpeg', q=0.92) => new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("Couldn't save the image.")), type, q));
const lineList = (...xs) => xs.filter(Boolean).join('  ·  ');

/* ---------- 16:9 background (artwork only) ---------- */
export async function makeBackground(artUrl){
  const art=await loadImage(artUrl); const [cv,x]=canvas(1920,1080); cover(x,art,0,0,1920,1080,0.5);
  return toBlob(cv);
}

/* ---------- 16:9 title graphic ---------- */
export async function makeTitle(c, artUrl){
  await loadFonts(); const t=eventText(c); const art=await loadImage(artUrl);
  const W=1920, H=1080, [cv,x]=canvas(W,H); cover(x,art,0,0,W,H,0.5);
  const g=x.createLinearGradient(0,0,W*0.66,0); g.addColorStop(0,'rgba(46,52,60,.9)'); g.addColorStop(.55,'rgba(46,52,60,.66)'); g.addColorStop(1,'rgba(46,52,60,0)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  const X=130, maxW=880; x.textBaseline='alphabetic';
  const ttl=fit(x, t.title.toUpperCase(), FAM.title, maxW, 4, 150, 64, 0.03); const lh=ttl.size*1.06;
  const eyebrow=lineList(t.date, t.time).toUpperCase(), eSize=34;
  const whereSize=40;
  const blockH=(eyebrow?eSize+34:0) + ttl.lines.length*lh + (t.where?whereSize+30:0);
  let y=Math.max(110, (H-blockH)/2 - 30);
  if(eyebrow){ setFont(x,FAM.ui,eSize,eSize*0.18); x.fillStyle=COLORS.gold; y+=eSize; x.fillText(eyebrow,X,y); y+=34; }
  setFont(x,FAM.title,ttl.size,ttl.size*0.03); x.fillStyle='#fff';
  ttl.lines.forEach(l=>{ y+=lh; x.fillText(l,X,y-lh*0.12); });
  if(t.where){ y+=30; setFont(x,FAM.serifI,whereSize,0); x.fillStyle=COLORS.cream; y+=whereSize; x.fillText(t.where,X,y); }
  const logo=await logoCanvas(300,true); x.drawImage(logo,X,H-logo.height-70);
  return toBlob(cv);
}

/* ---------- 4:5 social post ---------- */
export async function makeSocial(c, artUrl){
  await loadFonts(); const t=eventText(c); const art=await loadImage(artUrl);
  const W=1080, H=1350, X=72, maxW=W-2*X, [cv,x]=canvas(W,H); x.textBaseline='alphabetic';
  const logo=await logoCanvas(250,false);
  const eyebrow=lineList(t.date,t.time).toUpperCase();
  // Pick the biggest title that fits, then size the cream band to the text.
  let ttl=null, bandH=0;
  for(let size=92; size>=44; size-=2){
    setFont(x,FAM.title,size,size*0.03); const lines=wrap(x,t.title.toUpperCase(),maxW);
    const ok=lines.length<=3 && lines.every(l=>measure(x,l)<=maxW); if(!ok && size>44) continue;
    const f= ok ? {size, lines} : fit(x,t.title.toUpperCase(),FAM.title,maxW,3,44,44,0.03);
    const textH=64+(eyebrow?29+26:0)+f.lines.length*size*1.06+(t.where?56:0)+logo.height+60;
    if(textH<=H*0.42 || size===44){ ttl=f; bandH=Math.max(Math.round(H*0.31), Math.round(textH)); break; }
  }
  const top=H-bandH;
  cover(x,art,0,0,W,top+40,0.3);
  x.fillStyle=COLORS.cream; x.fillRect(0,top,W,bandH); x.fillStyle=COLORS.gold; x.fillRect(0,top,W,7);
  let y=top+64;
  if(eyebrow){ y+=29; setFont(x,FAM.ui,29,29*0.16); x.fillStyle=COLORS.rust; x.fillText(eyebrow,X,y); y+=26; }
  const lh=ttl.size*1.06; setFont(x,FAM.title,ttl.size,ttl.size*0.03); x.fillStyle=COLORS.slate;
  ttl.lines.forEach(l=>{ y+=lh; x.fillText(l,X,y-lh*0.1); });
  if(t.where){ y+=46; const w=fit(x,t.where,FAM.serifI,maxW,1,31,22); setFont(x,FAM.serifI,w.size,0); x.fillStyle=COLORS.muted; x.fillText(w.lines[0],X,y); }
  x.drawImage(logo, W-X-logo.width+10, H-logo.height-40);
  return toBlob(cv);
}

/* ---------- 36 x 42 inch poster (PDF, sharp text at any size) ---------- */
let pdfLib=null;
function loadPdfLib(){
  if(!pdfLib) pdfLib=new Promise((res,rej)=>{ if(window.jspdf) return res(window.jspdf); const s=document.createElement('script'); s.src='/vendor/jspdf.umd.min.js'; s.onload=()=>res(window.jspdf); s.onerror=()=>rej(new Error("Couldn't load the PDF maker.")); document.head.appendChild(s); });
  return pdfLib;
}
async function fontB64(file){
  const buf=new Uint8Array(await (await fetch('/assets/fonts/'+file)).arrayBuffer()); let s='';
  for(let i=0;i<buf.length;i+=0x8000) s+=String.fromCharCode.apply(null, buf.subarray(i,i+0x8000));
  return btoa(s);
}
export async function makePoster(c, artUrl){
  const [{ jsPDF }, art] = await Promise.all([loadPdfLib(), loadImage(artUrl)]); const t=eventText(c);
  const W=36*72, H=42*72, artH=Math.round(H*0.58), M=170;
  const doc=new jsPDF({ unit:'pt', format:[W,H], orientation:'portrait', compress:true });
  for(const [k,file] of Object.entries(FONT_FILES)){ doc.addFileToVFS(file, await fontB64(file)); doc.addFont(file, k, 'normal'); }
  // artwork, cropped to the top of the poster
  const ratio=W/artH, sw=art.naturalWidth, sh=Math.round(sw/ratio);
  const [acv,ax]=canvas(sw, Math.min(sh, art.naturalHeight)); cover(ax, art, 0,0, acv.width, acv.height, 0.25);
  doc.addImage(acv.toDataURL('image/jpeg',0.9), 'JPEG', 0, 0, W, artH, undefined, 'FAST');
  // text panel
  const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  doc.setFillColor(...hex(COLORS.cream)); doc.rect(0,artH,W,H-artH,'F');
  doc.setFillColor(...hex(COLORS.gold)); doc.rect(0,artH,W,12,'F');
  const maxW=W-2*M, width=(s,size,cs=0)=>doc.getStringUnitWidth(s)*size+cs*Math.max(0,s.length-1);
  const wrapPdf=(text,font,size,cs,mw)=>{ doc.setFont(font,'normal'); const words=text.split(/\s+/).filter(Boolean), out=[]; let cur='';
    for(const w of words){ const tt=cur?cur+' '+w:w; if(width(tt,size,cs)<=mw||!cur) cur=tt; else { out.push(cur); cur=w; } } if(cur) out.push(cur); return out; };
  const fitPdf=(text,font,mw,lines,max,min,csEm)=>{ for(let s=max;s>=min;s-=4){ const l=wrapPdf(text,font,s,s*csEm,mw); if(l.length<=lines && l.every(x=>width(x,s,s*csEm)<=mw)) return {s,l}; } return {s:min,l:wrapPdf(text,font,min,min*csEm,mw).slice(0,lines)}; };
  const draw=(s,font,size,color,x,y,cs=0)=>{ doc.setFont(font,'normal'); doc.setFontSize(size); doc.setTextColor(...hex(color)); doc.text(s,x,y,{charSpace:cs}); };
  const bottomRow=H-150, logoH=150, top=artH+12+170, limit=bottomRow-logoH-110;
  const eyebrow=lineList(t.date,t.time).toUpperCase();
  const eyeH=eyebrow?66+70:0, whereH=t.where?40+74:0, lineH=50*1.45;
  const blurbAll=t.blurb?wrapPdf(t.blurb,'serif',50,0,maxW):[];
  // Biggest title (up to 3 lines) that still leaves room for at least two lines of description.
  let ttl=null;
  for(let size=250; size>=96; size-=4){
    const l=wrapPdf(t.title.toUpperCase(),'title',size,size*0.03,maxW); if(l.length>3 || !l.every(z=>width(z,size,size*0.03)<=maxW)) continue;
    const used=eyeH+l.length*size*1.04+whereH, want=Math.min(2,blurbAll.length)*lineH+(blurbAll.length?50:0);
    if(top+used+want<=limit || size===96){ ttl={s:size,l}; break; }
  }
  if(!ttl) ttl=fitPdf(t.title.toUpperCase(),'title',maxW,3,96,96,0.03);
  let y=top;
  if(eyebrow){ y+=66; draw(eyebrow,'ui',66,COLORS.rust,M,y,66*0.16); y+=70; }
  ttl.l.forEach(l=>{ y+=ttl.s*1.04; draw(l,'title',ttl.s,COLORS.slate,M,y-ttl.s*0.06,ttl.s*0.03); });
  if(t.where){ y+=40+74; draw(t.where,'serifI',74,COLORS.slate,M,y); }
  if(blurbAll.length){
    const max=Math.max(0,Math.min(5,Math.floor((limit-(y+50))/lineH)));
    if(max>0){ let lines=blurbAll; if(lines.length>max){ lines=lines.slice(0,max); lines[max-1]=lines[max-1].replace(/[\s,.;:]*\S*$/,'')+'…'; }
      y+=50; lines.forEach(l=>{ y+=lineH; draw(l,'serif',50,COLORS.ink,M,y); }); }
  }
  const logo=await logoCanvas(2000,false); const lw=logoH*logo.width/logo.height;
  doc.addImage(logo.toDataURL('image/png'),'PNG',M,bottomRow-logoH,lw,logoH,undefined,'FAST');
  doc.setFont('ui','normal'); const ls=58, lsw=width(t.link.toUpperCase(),ls,ls*0.12);
  draw(t.link.toUpperCase(),'ui',ls,COLORS.rust,W-M-lsw,bottomRow-logoH/2+ls*0.35,ls*0.12);
  return doc.output('blob');
}
