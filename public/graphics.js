// Turns AI designs into the finished files: images cropped to their exact size, and the poster as a PDF.

export function loadImage(src){
  return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>rej(new Error("Couldn't load the design.")); i.src=src; });
}
function canvas(w,h){ const cv=document.createElement('canvas'); cv.width=w; cv.height=h; return [cv, cv.getContext('2d')]; }
// Fill a box with the image, cropping any overflow evenly.
function cover(x, img, w, h){
  const s=Math.max(w/img.naturalWidth, h/img.naturalHeight); const sw=w/s, sh=h/s;
  x.drawImage(img, (img.naturalWidth-sw)/2, (img.naturalHeight-sh)/2, sw, sh, 0, 0, w, h);
}
const toBlob = (cv, type='image/jpeg', q=0.93) => new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("Couldn't save the image.")), type, q));

// A JPEG at an exact size (1920x1080 for 16:9, 1080x1350 for 4:5).
export async function makeImage(url, w, h){
  const img=await loadImage(url); const [cv,x]=canvas(w,h); x.imageSmoothingQuality='high'; cover(x,img,w,h); return toBlob(cv);
}

// 36 x 42 inch poster PDF with the design filling the page.
let pdfLib=null;
function loadPdfLib(){
  if(!pdfLib) pdfLib=new Promise((res,rej)=>{ if(window.jspdf) return res(window.jspdf); const s=document.createElement('script'); s.src='/vendor/jspdf.umd.min.js'; s.onload=()=>res(window.jspdf); s.onerror=()=>rej(new Error("Couldn't load the PDF maker.")); document.head.appendChild(s); });
  return pdfLib;
}
export async function makePoster(url){
  const [{ jsPDF }, img] = await Promise.all([loadPdfLib(), loadImage(url)]);
  const W=36*72, H=42*72;
  const pw=img.naturalWidth, ph=Math.round(pw*H/W); const [cv,x]=canvas(pw, Math.min(ph, img.naturalHeight)); cover(x,img,cv.width,cv.height);
  const doc=new jsPDF({ unit:'pt', format:[W,H], orientation:'portrait', compress:true });
  doc.addImage(cv.toDataURL('image/jpeg',0.95), 'JPEG', 0, 0, W, H, undefined, 'FAST');
  return doc.output('blob');
}
