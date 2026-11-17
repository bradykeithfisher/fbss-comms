// Public communication request form (no login).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const KIND_COLOR = { social:'#5E5A7E', facebook:'#3E5C8A', instagram:'#94506B', email:'#5F7478', slides:'#6B6F57', bulletin:'#B47E3D', announcement:'#91412D', text:'#4F6B4A', web:'#414A55', other:'#7D7468' };
const KIND_ICON = { social:'lucide:share-2', facebook:'simple-icons:facebook', instagram:'simple-icons:instagram', email:'lucide:mail', slides:'lucide:presentation', bulletin:'lucide:newspaper', announcement:'lucide:megaphone', text:'lucide:message-square', web:'lucide:globe', other:'lucide:sparkles' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconUrl = (icon, color='#ffffff') => { const [p,n]=String(icon).split(':'); return `https://api.iconify.design/${encodeURIComponent(p)}/${encodeURIComponent(n)}.svg?color=${encodeURIComponent(color)}`; };
const kb = ch => `<span class="kb" style="--k:${KIND_COLOR[ch.kind]||KIND_COLOR.other}"><img src="${esc(iconUrl(ch.icon||KIND_ICON[ch.kind]||KIND_ICON.other))}" alt="" onerror="this.remove()"><b>${esc((ch.name||'?').slice(0,2).toUpperCase())}</b></span>`;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});
const size = b => b>1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(b/1024))+' KB';
const root = document.getElementById('req');
let sb=null, channels=[], files=[], busy=false, maxMb=50;

function toast(msg){ const t=document.getElementById('toast'); t.innerHTML=`<div class="toast" role="status">${esc(msg)}</div>`; setTimeout(()=>{ t.innerHTML=''; },4000); }

async function boot(){
  try{
    const [cfg, form] = await Promise.all([fetch('/api/config').then(r=>r.json()), fetch('/api/request-form').then(r=>r.json())]);
    if(cfg.error) throw new Error(cfg.error);
    sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{ persistSession:false, autoRefreshToken:false } });
    channels = form.channels || []; maxMb = cfg.maxUploadMb || 50;
  }catch(e){ root.innerHTML=`<div class="reqwrap"><div class="reqcard"><p class="err">The request form is unavailable right now. Please try again later.</p></div></div>`; return; }
  render();
}

function render(){
  root.innerHTML = `<div class="reqwrap">
  <header class="reqhead"><img src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"><h1>Communication Request</h1>
    <p>Tell us about your event and where you'd like it promoted. The communications team will review it and email you when it's approved.</p></header>
  <form class="reqcard req" id="rq" novalidate>
    <fieldset><legend>Your information</legend>
      <div class="req2"><div class="field"><label class="lbl" for="r-name">Your name</label><input type="text" id="r-name" autocomplete="name" required></div>
      <div class="field"><label class="lbl" for="r-email">Email</label><input type="email" id="r-email" autocomplete="email" required></div></div>
      <div class="req2"><div class="field"><label class="lbl" for="r-ministry">Ministry or department <span class="opt">optional</span></label><input type="text" id="r-ministry" placeholder="e.g. Children's Ministry"></div>
      <div class="field"><label class="lbl" for="r-phone">Phone <span class="opt">optional</span></label><input type="text" id="r-phone" autocomplete="tel" inputmode="tel"></div></div>
    </fieldset>
    <fieldset><legend>Event</legend>
      <div class="field"><label class="lbl" for="r-title">Event name</label><input type="text" id="r-title" required></div>
      <div class="req2"><div class="field"><label class="lbl" for="r-sd">Start date <span class="opt">leave empty if it's not a dated event, like an offering</span></label><input type="date" id="r-sd"></div>
      <div class="field"><label class="lbl" for="r-ed">End date <span class="opt">if more than one day</span></label><input type="date" id="r-ed"></div></div>
      <div class="req2"><div class="field"><label class="lbl" for="r-st">Start time</label><input type="time" id="r-st"></div>
      <div class="field"><label class="lbl" for="r-et">End time</label><input type="time" id="r-et"></div></div>
      <div class="field"><label class="lbl" for="r-loc">Location</label><input type="text" id="r-loc" placeholder="e.g. Worship Center, The ROC"></div>
    </fieldset>
    <fieldset><legend>Communication</legend>
      <div class="field"><label class="lbl" for="r-desc">Communication description</label><textarea id="r-desc" rows="6" required placeholder="What should people know? Who is it for, what will happen, how do they sign up, any cost, childcare, deadlines…"></textarea></div>
      <div class="field"><span class="lbl">Where would you like this promoted?</span>
        <div class="chpick">${channels.map(c=>`<label><input type="checkbox" name="ch" value="${esc(c.id)}">${kb(c)}<span>${esc(c.name)}</span></label>`).join('')}
        <label><input type="checkbox" id="r-notsure"><span class="kb" style="--k:#7D7468"><img src="${esc(iconUrl('lucide:circle-help'))}" alt="" onerror="this.remove()"><b>?</b></span><span>Not sure. Let the team decide</span></label></div></div>
      <div class="req2"><div class="field"><label class="lbl" for="r-promo">When would you like to start promoting this?</label><input type="date" id="r-promo" required></div>
      <div class="field"><label class="lbl" for="r-promo-end">Promote until <span class="opt">needed if there's no event date</span></label><input type="date" id="r-promo-end"></div>
      <div class="field"><span class="lbl" id="r-gfx-l" tabindex="-1">Do you need graphics designed for this?</span>
        <div class="chpick" role="radiogroup" aria-labelledby="r-gfx-l" style="grid-template-columns:1fr 1fr"><label><input type="radio" name="gfx" value="yes"><span>Yes</span></label><label><input type="radio" name="gfx" value="no"><span>No, I have them</span></label></div></div></div>
    </fieldset>
    <fieldset><legend>Files <span class="opt" style="font-family:var(--f-ui)">optional</span></legend>
      <label class="drop" id="drop" for="r-files"><strong>Drag files here</strong> or click to choose<br><span class="small">Posters, logos, photos, videos, PDFs · up to 15 files, ${maxMb} MB each</span></label>
      <input type="file" id="r-files" class="sr" multiple>
      <div class="flist" id="flist"></div>
    </fieldset>
    <div class="hp" aria-hidden="true"><label for="r-website">Website</label><input type="text" id="r-website" tabindex="-1" autocomplete="off"></div>
    <div id="formerr" class="err" role="alert"></div>
    <div><button class="btn primary wide" type="submit" id="send">Send request</button></div>
  </form>
  <p class="authfoot" style="color:var(--moss)">For <b>Hopkins County.</b> For <b>the Gospel.</b></p></div>`;
  wire(); drawFiles();
}
function drawFiles(){
  const el=document.getElementById('flist'); if(!el) return;
  el.innerHTML = files.map((f,i)=>`<div class="frow"><span class="n">${esc(f.file.name)}</span><span class="sz">${f.status==='done'?'Uploaded':f.status==='uploading'?'Uploading…':f.status==='error'?'<span class="err">Failed</span>':size(f.file.size)}</span>${busy?'':`<button type="button" class="btn ghost iconbtn" data-rm="${i}" aria-label="Remove ${esc(f.file.name)}">✕</button>`}</div>`).join('');
}
function addFiles(list){
  for(const f of list){
    if(files.length>=15){ toast('Up to 15 files, please.'); break; }
    if(f.size>maxMb*1024*1024){ toast(`${f.name} is over ${maxMb} MB.`); continue; }
    files.push({file:f, status:'ready'});
  }
  drawFiles();
}
function wire(){
  const drop=document.getElementById('drop'), input=document.getElementById('r-files');
  input.addEventListener('change', ()=>{ addFiles([...input.files]); input.value=''; });
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e=>addFiles([...e.dataTransfer.files]));
  document.getElementById('flist').addEventListener('click', e=>{ const b=e.target.closest('[data-rm]'); if(b){ files.splice(+b.dataset.rm,1); drawFiles(); } });
  document.getElementById('r-sd').addEventListener('change', e=>{ const ed=document.getElementById('r-ed'); ed.min=e.target.value; document.getElementById('r-promo').max=e.target.value; });
  document.getElementById('rq').addEventListener('submit', submit);
}
const v = id => (document.getElementById(id)?.value || '').trim();
async function submit(e){
  e.preventDefault(); if(busy) return;
  const err=document.getElementById('formerr'); err.textContent='';
  const channelIds=[...document.querySelectorAll('input[name=ch]:checked')].map(x=>x.value), notSure=document.getElementById('r-notsure').checked;
  const data={ name:v('r-name'), email:v('r-email'), ministry:v('r-ministry'), phone:v('r-phone'), title:v('r-title'), startDate:v('r-sd'), endDate:v('r-ed'), startTime:v('r-st'), endTime:v('r-et'),
    location:v('r-loc'), description:v('r-desc'), channelIds, notSure, promoStart:v('r-promo'), promoEnd:v('r-promo-end'), graphics:(document.querySelector('input[name=gfx]:checked')||{}).value||'', website:v('r-website') };
  const missing=[[!data.name,'your name','r-name'],[!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email),'a valid email','r-email'],[!data.title,'the event name','r-title'],[!data.startDate&&!data.promoEnd,'a start date (or, if there isn\'t an event date, when to stop promoting)','r-promo-end'],[!data.description,'a description','r-desc'],[!data.promoStart,'when to start promoting','r-promo'],[!data.graphics,'whether you need graphics','r-gfx-l']].filter(x=>x[0]);
  if(missing.length){ err.textContent='Please add '+missing.map(m=>m[1]).join(', ')+'.'; document.getElementById(missing[0][2]).focus(); return; }
  if(data.endDate && data.startDate && data.endDate<data.startDate){ err.textContent='The end date is before the start date.'; return; }
  if(data.promoEnd && data.promoStart && data.promoEnd<data.promoStart){ err.textContent='Promote until is before the promotion start date.'; return; }
  if(data.promoStart && data.startDate && data.promoStart>data.startDate){ err.textContent='Promotion needs to start on or before the event start date.'; return; }
  if(!channelIds.length && !notSure){ err.textContent='Choose at least one place to promote this, or "Not sure".'; return; }
  busy=true; const btn=document.getElementById('send'); btn.disabled=true; btn.textContent=files.length?'Uploading files…':'Sending…'; drawFiles();
  const submissionId=uuid(); const uploaded=[];
  try{
    for(let i=0;i<files.length;i++){
      const f=files[i]; f.status='uploading'; drawFiles();
      const r=await fetch('/api/request-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({submissionId,name:f.file.name,size:f.file.size,index:i})}).then(async r=>{ const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Upload failed'); return j; });
      const { error } = await sb.storage.from('files').uploadToSignedUrl(r.path, r.token, f.file, { contentType:f.file.type||'application/octet-stream' });
      if(error){ f.status='error'; drawFiles(); throw new Error(`${f.file.name} didn't upload: ${error.message}`); }
      f.status='done'; uploaded.push({path:r.path, name:f.file.name, type:f.file.type, size:f.file.size}); drawFiles();
    }
    btn.textContent='Sending…';
    const res=await fetch('/api/request-submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data, submissionId, files:uploaded})});
    const j=await res.json().catch(()=>({})); if(!res.ok) throw new Error(j.error||'Something went wrong. Please try again.');
    root.innerHTML=`<div class="reqwrap"><header class="reqhead"><img src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"></header>
      <div class="reqcard thanks"><img src="/assets/mark-color.svg" alt="" width="70" height="70" style="margin:0 auto"><h2>Thank you</h2>
      <p class="prose" style="max-width:480px;margin:0 auto">We received your request for <strong>${esc(data.title)}</strong>. The communications team will review it and email you at <strong>${esc(data.email)}</strong> once it's approved.</p>
      <p><a class="btn" href="/request">Send another request</a></p></div></div>`;
    files=[]; busy=false;
  }catch(ex){ busy=false; err.textContent=ex.message; btn.disabled=false; btn.textContent='Send request'; drawFiles(); }
}
boot();
