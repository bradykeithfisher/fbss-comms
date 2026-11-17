// FBSS Communication Calendar — browser app.
// Data lives in Supabase (database + file storage + logins). Server functions live under /api/*.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/* ---------- constants ---------- */
const KINDS = {
  facebook:{label:'Facebook', color:'#3E5C8A', abbr:'FB', icon:'simple-icons:facebook', limit:2000, social:true},
  instagram:{label:'Instagram', color:'#94506B', abbr:'IG', icon:'simple-icons:instagram', limit:2200, social:true},
  email:{label:'Email', color:'#5F7478', abbr:'EM', icon:'lucide:mail', head:'Subject line'},
  slides:{label:'Service slides', color:'#6B6F57', abbr:'SL', icon:'lucide:presentation', head:'Slide headline'},
  bulletin:{label:'Bulletin / print', color:'#B47E3D', abbr:'BU', icon:'lucide:newspaper', head:'Headline'},
  announcement:{label:'Spoken announcement', color:'#91412D', abbr:'AN', icon:'lucide:megaphone'},
  text:{label:'Text message', color:'#4F6B4A', abbr:'TX', icon:'lucide:message-square', limit:160},
  web:{label:'Website', color:'#414A55', abbr:'WB', icon:'lucide:globe', head:'Page title'},
  other:{label:'Other', color:'#7D7468', abbr:'••', icon:'lucide:sparkles', head:'Headline'}
};
const GUIDE = {
  facebook:'Facebook post. Conversational, 40-110 words, short paragraphs, clear details, ends with an invitation or call to action.',
  instagram:'Instagram caption. Strong first line, short lines with line breaks, details (date, time, place) easy to spot, under 150 words.',
  email:'Section in the church weekly email newsletter (the Weekly Update). Headline is the email subject line (under 50 characters). Body 60-130 words, warm, with the key details and a clear next step.',
  slides:'Announcement slide shown on screens before and after service. Headline under 6 words. Body is one or two very short lines with date, time and place only (under 18 words total).',
  bulletin:'Printed bulletin announcement. Headline plus 35-70 words, third person, details at the end.',
  announcement:'Script a staff member reads aloud from the stage before service. 30-45 seconds spoken (70-110 words), natural spoken rhythm, repeat the date once.',
  text:'Mass text message. Under 160 characters total, friendly, includes date and time and one call to action. No hashtags.',
  web:'Website event listing. Headline is the page title. Body 60-120 words, scannable, details first.',
  other:'General church announcement, 40-90 words.'
};
const STATUSES = [['draft','Draft'],['review','In review'],['approved','Approved'],['scheduled','Scheduled'],['posted','Posted']];
const DONE = new Set(['approved','scheduled','posted']);
const PALETTE = ['#91412D','#B47E3D','#6B6F57','#5F7478','#414A55','#7A5232','#A35A43','#4F6B4A'];
const DEFAULT_CHANNELS = [
  {id:'facebook',name:'Facebook',kind:'facebook'},
  {id:'instagram',name:'Instagram',kind:'instagram'},
  {id:'email',name:'Weekly Update email',kind:'email'},
  {id:'slides',name:'Sunday slides',kind:'slides'},
  {id:'bulletin',name:'Bulletin',kind:'bulletin'},
  {id:'announce',name:'Pre-service announcement',kind:'announcement'},
  {id:'text',name:'Text message',kind:'text'},
  {id:'web',name:'Website',kind:'web'}
];
const DEFAULT_VOICE = 'Passionate, Gospel-focused, vibrant, connected, authentic, equipping, familial, understanding, committed and unified. We write like family inviting a neighbor: warm, personal and hopeful, never salesy. Use plain words, include the date, time and place, and end with a simple invitation. Tagline: For Hopkins County. For the Gospel.';
const META_COMPOSER = 'https://business.facebook.com/latest/composer';
// Icons come from Iconify (api.iconify.design): Lucide for general icons, Simple Icons for brand logos.
const ICON_SETS = 'lucide,simple-icons';
const SUGGESTED_ICONS = ['simple-icons:facebook','simple-icons:instagram','simple-icons:youtube','simple-icons:tiktok','simple-icons:x','simple-icons:threads','simple-icons:spotify','simple-icons:vimeo',
  'lucide:mail','lucide:mails','lucide:newspaper','lucide:presentation','lucide:monitor','lucide:tv','lucide:megaphone','lucide:mic','lucide:message-square','lucide:message-circle','lucide:smartphone','lucide:globe',
  'lucide:link','lucide:calendar','lucide:calendar-days','lucide:church','lucide:cross','lucide:book-open','lucide:baby','lucide:users','lucide:heart','lucide:hand-heart','lucide:music','lucide:radio',
  'lucide:printer','lucide:file-text','lucide:image','lucide:camera','lucide:video','lucide:clapperboard','lucide:podcast','lucide:bell','lucide:signpost','lucide:flag','lucide:star','lucide:sparkles',
  'lucide:coffee','lucide:utensils','lucide:gift','lucide:graduation-cap','lucide:map-pin','lucide:qr-code','lucide:ticket','lucide:clipboard-list'];
const iconUrl = (icon, color='#ffffff') => { const [p,n]=String(icon||'lucide:sparkles').split(':'); return `https://api.iconify.design/${encodeURIComponent(p)}/${encodeURIComponent(n||'')}.svg?color=${encodeURIComponent(color)}`; };
const iconOf = ch => ch.icon || (KINDS[ch.kind]||KINDS.other).icon;

/* ---------- helpers ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()+n); return x; };
const startOfWeek = d => addDays(d, -d.getDay());
const todayStr = () => ymd(new Date());
const fmtD = (s,opts) => { const d=parseYmd(s); return d ? d.toLocaleDateString('en-US', opts||{weekday:'short',month:'short',day:'numeric'}) : 'No date'; };
const fmtT = t => { if(!t || !/^\d{1,2}:\d{2}/.test(t)) return ''; const [h,m]=t.split(':').map(Number); return `${((h+11)%12)+1}:${pad(m)} ${h>=12?'PM':'AM'}`; };
const daysBetween = (a,b) => Math.round((parseYmd(b)-parseYmd(a))/86400000);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = n => (String(n||'').trim().split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('') || '?').toUpperCase();
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
function eventDays(c){ const a=parseYmd(c.date); if(!a) return []; let b=parseYmd(c.endDate)||a; if(b<a) b=a; const out=[]; for(let d=a,i=0; d<=b && i<62; d=addDays(d,1),i++) out.push(ymd(d)); return out; }
function fmtRange(c,long){ const o=long?{weekday:'long',month:'long',day:'numeric',year:'numeric'}:{weekday:'short',month:'short',day:'numeric'};
  if(!c.date) return 'No date set'; const t1=fmtT(c.time), t2=fmtT(c.endTime);
  if(!c.endDate || c.endDate<=c.date) return fmtD(c.date,o)+(t1?' · '+t1+(t2?' – '+t2:''):'');
  return `${fmtD(c.date,o)}${t1?', '+t1:''} – ${fmtD(c.endDate,o)}${t2?', '+t2:''}`; }
const fileKind = f => (f.type||'').startsWith('image/') ? 'image' : (f.type==='application/pdf' ? 'PDF' : (f.type||'').startsWith('video/') ? 'VIDEO' : ((f.name||'').split('.').pop()||'FILE').toUpperCase().slice(0,4));
const safeName = n => String(n||'file').normalize('NFKD').replace(/[^\w.\-]+/g,'-').replace(/-+/g,'-').slice(-80);

/* ---------- state ---------- */
let sb=null, CFG=null, session=null, rtChannel=null;
const S = { settings:{channels:clone(DEFAULT_CHANNELS), voice:DEFAULT_VOICE, handle:'First Baptist Sulphur Springs'}, campaigns:{}, dests:{}, team:{}, requests:{}, loaded:false, social:null };
const V = { screen:'boot', view:'calendar', campaignId:null, calMode: ls('cc.calMode')||'week', anchor:new Date(), fChan:'', fPerson:'', openDest:null, modal:null, ai:{}, workPerson:'', reqFilter:'new', requestId:null, pendingDest:null, authMsg:'', authErr:'', authMode:'login', busy:false, dragging:false };
const settings = () => S.settings;
const me = () => session && S.team[session.user.id];
const isAdmin = () => !!(me() && me().role==='admin');
const channelById = id => settings().channels.find(c=>c.id===id) || {id, name:'Removed destination', kind:'other'};
const kindOf = ch => KINDS[ch.kind] || KINDS.other;
const memberById = id => id ? S.team[id] : null;
const teamList = () => Object.values(S.team).sort((a,b)=>a.name.localeCompare(b.name));
const destsOf = cid => Object.values(S.dests).filter(d=>d.campaignId===cid).sort(byWhen);
function byWhen(a,b){ return (a.date||'9999').localeCompare(b.date||'9999') || (a.time||'').localeCompare(b.time||''); }
const campOf = d => S.campaigns[d.campaignId] || {title:'(Campaign removed)', color:'#7D7468'};
const fileUrl = path => path ? sb.storage.from('files').getPublicUrl(path).data.publicUrl : '';

/* ---------- row mapping ---------- */
const t5 = t => t ? String(t).slice(0,5) : '';
const rowToCamp = r => ({ id:r.id, title:r.title||'', date:r.start_date||'', time:t5(r.start_time), endDate:r.end_date||'', endTime:t5(r.end_time), adStart:r.ad_start||'', adEnd:r.ad_end||'',
  location:r.location||'', description:r.description||'', ministry:r.ministry||'', link:r.link||'', color:r.color||PALETTE[0], coverPath:r.cover_path||'', files:Array.isArray(r.files)?r.files:[] });
const campToRow = c => ({ id:c.id, title:c.title||'Untitled campaign', start_date:c.date||null, start_time:c.time||null, end_date:c.endDate||null, end_time:c.endTime||null, ad_start:c.adStart||null, ad_end:c.adEnd||null,
  location:c.location||'', description:c.description||'', ministry:c.ministry||'', link:c.link||'', color:c.color||PALETTE[0], cover_path:c.coverPath||'', files:c.files||[] });
const rowToDest = r => ({ id:r.id, campaignId:r.campaign_id, channelId:r.channel_id, date:r.publish_date||'', time:t5(r.publish_time), assigneeId:r.assignee_id||'', status:r.status||'draft',
  headline:r.headline||'', copy:r.copy||'', notes:r.notes||'', imagePaths:Array.isArray(r.image_paths)?r.image_paths:[], autoPublish:!!r.auto_publish,
  publishedAt:r.published_at||'', externalUrl:r.external_url||'', publishError:r.publish_error||'', dueDate:r.due_date||'' });
const destToRow = d => ({ id:d.id, campaign_id:d.campaignId, channel_id:d.channelId, publish_date:d.date||null, publish_time:d.time||null, assignee_id:d.assigneeId||null, status:d.status||'draft',
  headline:d.headline||'', copy:d.copy||'', notes:d.notes||'', image_paths:d.imagePaths||[], auto_publish:!!d.autoPublish, due_date:d.dueDate||null });
const rowToMember = r => ({ id:r.id, name:r.full_name || (r.email||'').split('@')[0] || 'Staff member', email:r.email||'', color:r.color||'#5F7478', role:r.role||'editor' });

/* ---------- saving ---------- */
const timers={}, dirty={}, queued={}, inflight={}; const DEL={del:true};
function scheduleSave(key, delay){ dirty[key]=true; clearTimeout(timers[key]); timers[key]=setTimeout(()=>{ delete timers[key]; writeKey(key); }, delay); }
function payloadFor(key){ const [t,id]=key.split(':');
  if(t==='c'){ const c=S.campaigns[id]; return c?campToRow(c):DEL; }
  if(t==='d'){ const d=S.dests[id]; return d?destToRow(d):DEL; }
  if(t==='s') return {data:settings()};
  if(t==='p'){ const m=S.team[id]; return m?{full_name:m.name, color:m.color}:null; } }
async function writeKey(key){
  dirty[key]=true; queued[key]=payloadFor(key);
  if(inflight[key]) return; inflight[key]=true;
  while(key in queued){ const o=queued[key]; delete queued[key]; const [t,id]=key.split(':');
    try{ let r;
      if(t==='c') r = o===DEL ? await sb.from('campaigns').delete().eq('id',id) : await sb.from('campaigns').upsert(o);
      else if(t==='d') r = o===DEL ? await sb.from('destinations').delete().eq('id',id) : await sb.from('destinations').upsert(o);
      else if(t==='s') r = await sb.from('app_settings').update({data:o.data, updated_at:new Date().toISOString()}).eq('id',1);
      else if(t==='p' && o) r = await sb.from('profiles').update(o).eq('id',id);
      if(r && r.error) throw r.error;
    }catch(e){ saveErr(e); }
  }
  inflight[key]=false; if(!timers[key]) delete dirty[key];
}
function saveErr(e){ const m=(e && (e.message||e.error_description)) || 'unknown error';
  if(/JWT|token|auth/i.test(m)) toast('Your session expired. Sign in again to keep saving.'); else toast('Could not save: '+m); }
function flushAll(){ for(const k of Object.keys(timers)){ clearTimeout(timers[k]); delete timers[k]; writeKey(k); } }
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);
const saveCampaign = (c,delay) => { S.campaigns[c.id]=c; delay ? scheduleSave('c:'+c.id,delay) : writeKey('c:'+c.id); };
const saveDest = (d,delay) => { S.dests[d.id]=d; delay ? scheduleSave('d:'+d.id,delay) : writeKey('d:'+d.id); };
const saveSettings = delay => delay ? scheduleSave('s:1',delay) : writeKey('s:1');
const removeDest = id => { delete S.dests[id]; writeKey('d:'+id); };
const removeCampaign = id => { for(const d of destsOf(id)) delete S.dests[d.id]; delete S.campaigns[id]; writeKey('c:'+id); };

function defaultDue(d){ const p=parseYmd(d.date); if(!p) return ''; let due=addDays(p,-2); if(ymd(due)<todayStr()) due=new Date(); if(ymd(due)>d.date) return d.date; return ymd(due); }
async function notifyAssigned(id){
  for(let i=0;i<50 && (dirty['d:'+id]||inflight['d:'+id]);i++) await new Promise(r=>setTimeout(r,150)); // wait for the save to land
  try{ const r=await api('notify-assigned',{id}); if(r.ok){ const d=S.dests[id]; const m=d&&memberById(d.assigneeId); toast(`Emailed ${m?m.name:'them'} about the assignment`); } }
  catch(e){ toast('Assignment saved, but the email failed: '+e.message); }
}

/* ---------- server calls ---------- */
async function api(path, body, method){
  const { data:{ session:s } } = await sb.auth.getSession();
  const res = await fetch('/api/'+path, { method: method || (body?'POST':'GET'), headers:{ 'content-type':'application/json', Authorization:'Bearer '+(s?s.access_token:'') }, body: body?JSON.stringify(body):undefined });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- boot & auth ---------- */
const hashParams = new URLSearchParams(location.hash.replace(/^#/,''));
const authLinkType = hashParams.get('type');           // 'invite' or 'recovery' when arriving from an email link
const authLinkError = hashParams.get('error_description');
async function boot(){
  try{ CFG = await fetch('/api/config').then(r=>r.json()); }catch(e){ CFG=null; }
  if(!CFG || CFG.error){ document.getElementById('app').innerHTML = `<div class="auth"><div class="authcard"><img class="logo" src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"><div class="authmsg err">${esc((CFG&&CFG.error)||'The app could not reach its server settings. Check the Netlify deploy.')}</div></div></div>`; return; }
  sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  sb.auth.onAuthStateChange((event, s)=>{
    session = s;
    if(event==='PASSWORD_RECOVERY'){ V.screen='setpw'; V.authMode='recovery'; render(true); return; }
    if(event==='SIGNED_OUT'){ teardown(); V.screen='login'; render(true); return; }
    if(event==='SIGNED_IN' && V.screen!=='app' && V.screen!=='setpw'){ startApp(); }
  });
  const { data } = await sb.auth.getSession(); session = data.session;
  if(authLinkError){ V.screen='login'; V.authErr = authLinkError.replace(/\+/g,' ') + '. Ask an admin to send a new invite, or use "Forgot password".'; history.replaceState(null,'',location.pathname); render(true); return; }
  if(session && (authLinkType==='invite' || authLinkType==='recovery')){ V.screen='setpw'; V.authMode=authLinkType; history.replaceState(null,'',location.pathname); render(true); return; }
  if(session) startApp(); else { V.screen='login'; render(true); }
}
async function startApp(){
  if(V.screen==='app') return;
  V.screen='app'; route(); render(true);
  await loadAll();
  subscribe();
  api('social').then(s=>{ S.social=s; render(); }).catch(()=>{ S.social={connected:false}; });
}
function teardown(){ if(rtChannel){ sb.removeChannel(rtChannel); rtChannel=null; } S.campaigns={}; S.dests={}; S.team={}; S.loaded=false; V.openDest=null; V.modal=null; }
async function loadAll(){
  const [c,d,s,p,rq] = await Promise.all([
    sb.from('campaigns').select('*'), sb.from('destinations').select('*'),
    sb.from('app_settings').select('data').eq('id',1).maybeSingle(), sb.from('profiles').select('id,email,full_name,color,role'),
    sb.from('requests').select('*').order('created_at',{ascending:false})]);
  const err = c.error||d.error||s.error||p.error;
  S.requests = Object.fromEntries(((rq&&rq.data)||[]).map(r=>[r.id,r]));
  if(err){ toast('Could not load data: '+err.message); }
  S.campaigns = Object.fromEntries((c.data||[]).map(r=>[r.id,rowToCamp(r)]));
  S.dests = Object.fromEntries((d.data||[]).map(r=>[r.id,rowToDest(r)]));
  S.team = Object.fromEntries((p.data||[]).map(r=>[r.id,rowToMember(r)]));
  applySettings(s.data && s.data.data);
  S.loaded=true;
  if(V.pendingDest){ const pd=S.dests[V.pendingDest]; if(pd){ V.view='campaign'; V.campaignId=pd.campaignId; V.openDest=pd.id; } V.pendingDest=null; }
  render();
}
function applySettings(data){ const x = data||{}; S.settings = { handle:x.handle||'First Baptist Sulphur Springs', voice:x.voice||DEFAULT_VOICE, channels:Array.isArray(x.channels)&&x.channels.length?x.channels:clone(DEFAULT_CHANNELS) }; }
function subscribe(){
  rtChannel = sb.channel('fbss-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'campaigns'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id); if(dirty['c:'+id]) return;
      if(p.eventType==='DELETE') delete S.campaigns[id]; else S.campaigns[id]=rowToCamp(p.new); render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'destinations'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id);
      if(p.eventType==='DELETE'){ delete S.dests[id]; render(); return; }
      const incoming=rowToDest(p.new);
      if(dirty['d:'+id] && S.dests[id]){ const l=S.dests[id]; l.publishedAt=incoming.publishedAt; l.externalUrl=incoming.externalUrl; l.publishError=incoming.publishError; if(incoming.status==='posted') l.status='posted'; }
      else S.dests[id]=incoming;
      render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'app_settings'}, p=>{ if(dirty['s:1']) return; if(p.new) applySettings(p.new.data); render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'requests'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id);
      if(p.eventType==='DELETE') delete S.requests[id]; else S.requests[id]=p.new; render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'profiles'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id); if(dirty['p:'+id]) return;
      if(p.eventType==='DELETE') delete S.team[id]; else S.team[id]=rowToMember(p.new); render(); })
    .subscribe();
  // catch up after the laptop wakes or the tab comes back
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && V.screen==='app' && !Object.keys(dirty).length) loadAll(); });
}

/* ---------- routing ---------- */
function route(){
  const h=(location.hash||'').replace('#','');
  if(h.startsWith('campaign-')){ V.view='campaign'; V.campaignId=h.slice(9); }
  else if(h.startsWith('request-')){ V.view='requests'; V.requestId=h.slice(8); }
  else if(h.startsWith('dest-')){ const id=h.slice(5); const d=S.dests[id]; if(d){ V.view='campaign'; V.campaignId=d.campaignId; V.openDest=id; } else { V.view='calendar'; V.pendingDest=id; } }
  else if(['calendar','campaigns','my-work','settings','requests'].includes(h)) V.view=h;
  else V.view='calendar';
}
window.addEventListener('hashchange', ()=>{ if(V.screen!=='app') return; V.openDest=null; route(); render(true); window.scrollTo(0,0); });

/* ---------- render core ---------- */
let pendingRender=false;
function isTyping(){ const a=document.activeElement; return !!a && (a.tagName==='TEXTAREA' || a.tagName==='INPUT' || a.tagName==='SELECT'); }
document.addEventListener('focusout', ()=> setTimeout(()=>{ if(pendingRender && !isTyping()) render(); }, 60));
function render(force){
  if(V.dragging || (!force && isTyping())){ pendingRender=true; return; }
  pendingRender=false;
  const app=document.getElementById('app'), ov=document.getElementById('overlay');
  if(V.screen==='login'||V.screen==='setpw'){ app.innerHTML=renderAuth(); ov.innerHTML=''; return; }
  if(V.screen!=='app') return;
  const ae=document.activeElement, fid=ae && ae.id; let sel=null;
  try{ if(fid && typeof ae.selectionStart==='number') sel=[ae.selectionStart, ae.selectionEnd]; }catch(e){}
  const drw=document.querySelector('.drawer'), dScroll=drw?drw.scrollTop:0;
  const mdl=document.querySelector('.modal'), mScroll=mdl?mdl.scrollTop:0;
  app.innerHTML = renderHeader() + `<main>${renderView()}</main>`;
  ov.innerHTML = renderDrawer() + renderModal();
  const d2=document.querySelector('.drawer'); if(d2) d2.scrollTop=dScroll;
  const m2=document.querySelector('.modal'); if(m2) m2.scrollTop=mScroll;
  if(fid){ const el=document.getElementById(fid); if(el && el!==document.activeElement){ el.focus({preventScroll:true}); if(sel) try{ el.setSelectionRange(sel[0],sel[1]); }catch(e){} } }
  document.body.style.overflow = (V.openDest||V.modal) ? 'hidden' : '';
}

/* ---------- auth screens ---------- */
function renderAuth(){
  const msg = V.authErr?`<div class="authmsg err" role="alert">${esc(V.authErr)}</div>`:(V.authMsg?`<div class="authmsg" role="status">${esc(V.authMsg)}</div>`:'');
  let body;
  if(V.screen==='setpw'){
    body = `<h1>${V.authMode==='invite'?'Welcome':'New password'}</h1><p class="prose muted" style="text-align:center">${V.authMode==='invite'?'Choose a password to finish setting up your account.':'Choose a new password for your account.'}</p>${msg}
    <form class="stack" data-form="setpw" style="gap:12px">
      ${V.authMode==='invite'?`<div class="field"><label class="lbl" for="a-name">Your name</label><input type="text" id="a-name" autocomplete="name" value="${esc((session&&session.user.user_metadata&&session.user.user_metadata.full_name)||'')}" required></div>`:''}
      <div class="field"><label class="lbl" for="a-pw">Password</label><input type="password" id="a-pw" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label class="lbl" for="a-pw2">Confirm password</label><input type="password" id="a-pw2" autocomplete="new-password" minlength="8" required></div>
      <button class="btn primary wide" type="submit" ${V.busy?'disabled':''}>${V.busy?'Saving…':'Save password'}</button></form>`;
  } else if(V.authMode==='forgot'){
    body = `<h1>Reset password</h1><p class="prose muted" style="text-align:center">We'll email you a link to choose a new password.</p>${msg}
    <form class="stack" data-form="forgot" style="gap:12px"><div class="field"><label class="lbl" for="a-email">Email</label><input type="email" id="a-email" autocomplete="email" value="${esc(V.lastEmail||'')}" required></div>
    <button class="btn primary wide" type="submit" ${V.busy?'disabled':''}>${V.busy?'Sending…':'Send reset link'}</button></form>
    <div style="text-align:center"><button class="linkbtn" data-action="auth-mode" data-mode="login">Back to sign in</button></div>`;
  } else {
    body = `<h1>Staff sign in</h1>${msg}
    <form class="stack" data-form="login" style="gap:12px">
      <div class="field"><label class="lbl" for="a-email">Email</label><input type="email" id="a-email" autocomplete="username" value="${esc(V.lastEmail||'')}" required></div>
      <div class="field"><label class="lbl" for="a-pw">Password</label><input type="password" id="a-pw" autocomplete="current-password" required></div>
      <button class="btn primary wide" type="submit" ${V.busy?'disabled':''}>${V.busy?'Signing in…':'Sign in'}</button></form>
    <div style="text-align:center"><button class="linkbtn" data-action="auth-mode" data-mode="forgot">Forgot password?</button></div>
    <p class="small muted" style="text-align:center">New staff get an email invite from an admin.</p>`;
  }
  return `<div class="auth"><div><div class="authcard"><img class="logo" src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"><div class="app">Communication Calendar</div>${body}</div>
    <div class="authfoot">For <b>Hopkins County.</b> For <b>the Gospel.</b></div></div></div>`;
}

/* ---------- header & views ---------- */
function renderHeader(){
  const tab=(h,l,on)=>`<a href="#${h}" class="${on?'on':''}">${l}</a>`; const m=me();
  return `<header class="topbar">
    <a href="#calendar" aria-label="Calendar home"><img class="logo" src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"></a>
    <nav class="tabs" aria-label="Main">${tab('calendar','Calendar',V.view==='calendar')}${tab('campaigns','Campaigns',V.view==='campaigns'||V.view==='campaign')}${tab('my-work','My work',V.view==='my-work')}<a href="#requests" class="${V.view==='requests'?'on':''}">Requests${(()=>{ const n=Object.values(S.requests).filter(r=>r.status==='new').length; return n?`<span class="count">${n}</span>`:''; })()}</a>${tab('settings','Settings',V.view==='settings')}</nav>
    <button class="btn primary" data-action="new-campaign">+ New campaign</button>
    <div class="usermenu">${m?av(m.id,'lg'):''}<span class="nm">${esc(m?m.name:'')}</span><button class="btn ghost sm" data-action="sign-out">Sign out</button></div>
  </header>`;
}
function renderView(){
  if(!S.loaded) return `<div class="empty"><img src="/assets/mark-color.svg" alt="">Loading your calendar…</div>`;
  if(V.view==='campaigns') return renderCampaigns();
  if(V.view==='campaign') return renderCampaign(V.campaignId);
  if(V.view==='my-work') return renderWork();
  if(V.view==='requests') return renderRequests();
  if(V.view==='settings') return renderSettings();
  return renderCalendar();
}
function kb(ch, cls=''){ const k=kindOf(ch); return `<span class="kb ${cls}" style="--k:${k.color}" title="${esc(ch.name)}"><img src="${esc(iconUrl(iconOf(ch)))}" alt="" loading="lazy" onerror="this.remove()"><b>${esc(k.abbr)}</b></span>`; }
function av(memberId, cls=''){ const m=memberById(memberId); if(!m) return `<span class="av none ${cls}" title="Unassigned">?</span>`; return `<span class="av ${cls}" style="--m:${esc(m.color)}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`; }
function pill(st){ const s=STATUSES.find(x=>x[0]===st)||STATUSES[0]; return `<span class="pill st-${s[0]}">${s[1]}</span>`; }
function chip(d,label,removable){ const c=campOf(d), ch=channelById(d.channelId); const s=d.status||'draft';
  return `<div class="chip" role="button" tabindex="0" draggable="true" data-drag-dest="${esc(d.id)}" style="--c:${esc(c.color)}" data-action="open-dest" data-id="${esc(d.id)}" title="${esc(c.title)} · ${esc(ch.name)}${d.time?' · '+fmtT(d.time):''} · ${esc((STATUSES.find(x=>x[0]===s)||STATUSES[0])[1])}${d.autoPublish&&!d.publishedAt?' · posts automatically':''} · drag to move">${kb(ch)}<span class="t">${esc(label||c.title)}</span>${d.publishError?'<span title="Posting failed" style="color:var(--bad)">!</span>':''}<span class="sdot st-${s}"></span>${d.assigneeId?av(d.assigneeId):''}${removable?`<button class="chipx" data-action="quick-delete" data-id="${esc(d.id)}" aria-label="Remove ${esc(ch.name)}" title="Remove">×</button>`:''}</div>`; }
function evtBtn(c){ return `<button class="evt" style="--c:${esc(c.color)}" data-action="open-campaign" data-id="${esc(c.id)}" title="Event: ${esc(c.title)}">★ <span>${esc(c.title)}</span></button>`; }
function memberOptions(sel, includeNone=true, noneLabel='Unassigned'){ return (includeNone?`<option value="">${noneLabel}</option>`:'') + teamList().map(m=>`<option value="${esc(m.id)}" ${m.id===sel?'selected':''}>${esc(m.name)}</option>`).join(''); }
function channelOptions(sel){ return settings().channels.map(c=>`<option value="${esc(c.id)}" ${c.id===sel?'selected':''}>${esc(c.name)}</option>`).join(''); }
function filteredDests(){ return Object.values(S.dests).filter(d=>(!V.fChan||d.channelId===V.fChan) && (!V.fPerson || (V.fPerson==='none'? !d.assigneeId : d.assigneeId===V.fPerson))); }

/* ---------- calendar ---------- */
function renderCalendar(){
  const s=settings(); const today=todayStr(); const list=filteredDests();
  const byKey={}; for(const d of list){ (byKey[d.date+'|'+d.channelId] ||= []).push(d); (byKey[d.date] ||= []).push(d); }
  const evts={}; for(const c of Object.values(S.campaigns)){ for(const k of eventDays(c)) (evts[k] ||= []).push(c); }
  let days, label;
  if(V.calMode==='week'){ const st=startOfWeek(V.anchor); days=[...Array(7)].map((_,i)=>addDays(st,i));
    const m0=days[0].toLocaleDateString('en-US',{month:'short'}), m6=days[6].toLocaleDateString('en-US',{month:'short'});
    label=`${m0} ${days[0].getDate()} – ${m0===m6?'':m6+' '}${days[6].getDate()}, ${days[6].getFullYear()}`; }
  else { const first=new Date(V.anchor.getFullYear(),V.anchor.getMonth(),1); const st=startOfWeek(first); days=[...Array(42)].map((_,i)=>addDays(st,i));
    if(days[35].getMonth()!==first.getMonth()) days=days.slice(0,35); label=first.toLocaleDateString('en-US',{month:'long',year:'numeric'}); }
  const inRange=list.filter(d=>{ const dt=parseYmd(d.date); return dt && dt>=days[0] && dt<=days[days.length-1]; });
  const unassigned=inRange.filter(d=>!d.assigneeId).length, notReady=inRange.filter(d=>!DONE.has(d.status)).length, posted=inRange.filter(d=>d.status==='posted').length;
  const toolbar=`<div class="toolbar">
    <div class="row"><button class="btn iconbtn" data-action="cal-prev" aria-label="Previous">‹</button><button class="btn sm" data-action="cal-today">Today</button><button class="btn iconbtn" data-action="cal-next" aria-label="Next">›</button></div>
    <div class="rangelabel">${esc(label)}</div>
    <div class="seg" role="group" aria-label="View"><button data-action="cal-mode" data-mode="week" class="${V.calMode==='week'?'on':''}">Week by destination</button><button data-action="cal-mode" data-mode="month" class="${V.calMode==='month'?'on':''}">Month</button></div>
    <span class="spacer"></span>
    <select class="compact" id="f-chan" data-ui="fChan" aria-label="Filter by destination"><option value="">All destinations</option>${channelOptions(V.fChan)}</select>
    <select class="compact" id="f-person" data-ui="fPerson" aria-label="Filter by person"><option value="">Everyone</option><option value="none" ${V.fPerson==='none'?'selected':''}>Unassigned</option>${memberOptions(V.fPerson,false)}</select>
  </div>
  <div class="stats"><div class="stat" style="--p:var(--dusty)"><b>${inRange.length}</b> scheduled</div><div class="stat" style="--p:var(--gold)"><b>${notReady}</b> not approved</div><div class="stat" style="--p:var(--rust)"><b>${unassigned}</b> unassigned</div><div class="stat" style="--p:var(--moss)"><b>${posted}</b> posted</div></div>`;
  if(!Object.keys(S.campaigns).length) return toolbar+`<div class="empty"><img src="/assets/mark-color.svg" alt=""><p><strong>No campaigns yet.</strong></p><p>Create a campaign for an upcoming event, then add the destinations where you'll announce it.</p><button class="btn primary" data-action="new-campaign">+ New campaign</button></div>`;
  if(V.calMode==='week'){
    const chans=s.channels.filter(c=>!V.fChan||c.id===V.fChan);
    let h=`<div class="wkwrap"><div class="wk"><div class="corner">Destination</div>`;
    for(const d of days){ const k=ymd(d); h+=`<div class="dh ${k===today?'today':''}"><span class="d">${d.toLocaleDateString('en-US',{weekday:'short'})}</span><span class="n">${d.getDate()}</span>${(evts[k]||[]).map(evtBtn).join('')}</div>`; }
    for(const ch of chans){ h+=`<div class="chn">${kb(ch)}<span>${esc(ch.name)}</span></div>`;
      for(const d of days){ const k=ymd(d); const items=(byKey[k+'|'+ch.id]||[]).sort(byWhen);
        h+=`<div class="cell ${k===today?'today':''}" data-drop="${k}" data-drop-chan="${esc(ch.id)}">${items.map(x=>chip(x)).join('')}<button class="addbtn" data-action="cell-add" data-chan="${esc(ch.id)}" data-date="${k}" aria-label="Add ${esc(ch.name)} on ${esc(fmtD(k))}">+ Add</button></div>`; } }
    return toolbar+h+`</div></div>`;
  }
  const mon=V.anchor.getMonth();
  let h=`<div class="mo">`+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(const d of days){ const k=ymd(d); const items=(byKey[k]||[]).sort(byWhen); const ev=evts[k]||[]; const max=Math.max(0,4-ev.length);
    h+=`<div class="day ${d.getMonth()!==mon?'out':''} ${k===today?'today':''}" data-drop="${k}"><div class="num"><span>${d.getDate()}</span></div>${ev.map(evtBtn).join('')}${items.slice(0,max).map(x=>chip(x)).join('')}${items.length>max?`<button class="more" data-action="cal-goweek" data-date="${k}">+${items.length-max} more</button>`:''}</div>`; }
  return toolbar+h+`</div>`;
}

/* ---------- campaigns ---------- */
function campCard(c){
  const ds=destsOf(c.id); const done=ds.filter(d=>DONE.has(d.status)).length; const pct=ds.length?Math.round(done/ds.length*100):0;
  const people=[...new Set(ds.map(d=>d.assigneeId).filter(Boolean))]; const chans=[...new Set(ds.map(d=>d.channelId))].map(channelById);
  return `<button class="ccard" style="--c:${esc(c.color)}" data-action="open-campaign" data-id="${esc(c.id)}">
    ${c.coverPath?`<div class="cover" style="background-image:url('${esc(fileUrl(c.coverPath))}')"></div>`:`<div class="stripe"></div>`}
    <div class="body"><h3>${esc(c.title||'Untitled campaign')}</h3><div class="sub">${esc(fmtRange(c,true))}${c.location?' · '+esc(c.location):''}</div>
    <div class="row">${chans.slice(0,8).map(ch=>kb(ch)).join('')}${chans.length?'':'<span class="muted small">No destinations yet</span>'}</div>
    <div class="row small"><span>${done} of ${ds.length} ready</span><span class="spacer"></span>${people.map(p=>av(p)).join('')}</div>
    <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div></div></button>`;
}
function renderCampaigns(){
  const all=Object.values(S.campaigns).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  const t=todayStr(); const endOf=c=>(c.endDate&&c.endDate>c.date?c.endDate:c.date);
  const up=all.filter(c=>!c.date||endOf(c)>=t), past=all.filter(c=>c.date&&endOf(c)<t).reverse();
  let h=`<div class="pagehead"><h1>Campaigns</h1><button class="btn primary" data-action="new-campaign">+ New campaign</button></div>`;
  if(!all.length) return h+`<div class="empty"><img src="/assets/mark-color.svg" alt="">No campaigns yet. Start one for your next event, sermon series or ministry push.</div>`;
  h+=`<div class="sectionlabel">Upcoming · ${up.length}</div>`+(up.length?`<div class="cards">${up.map(campCard).join('')}</div>`:`<div class="empty">Nothing upcoming.</div>`);
  if(past.length) h+=`<div class="sectionlabel">Past · ${past.length}</div><div class="cards">${past.map(campCard).join('')}</div>`;
  return h;
}
function drow(d, showCamp){
  const ch=channelById(d.channelId), c=campOf(d); const imgs=d.imagePaths||[];
  return `<button class="drow" data-action="open-dest" data-id="${esc(d.id)}">${kb(ch,'lg')}
    <div><div class="nm">${esc(showCamp?c.title:ch.name)}</div><div class="muted small">${showCamp?esc(ch.name)+' · ':''}${esc(fmtD(d.date))}${d.time?' · '+fmtT(d.time):''}${d.dueDate&&d.status!=='posted'?` · <span style="color:${d.dueDate<todayStr()?'var(--bad)':d.dueDate===todayStr()?'var(--gold)':'inherit'}">due ${esc(fmtD(d.dueDate,{month:'short',day:'numeric'}))}</span>`:''}${d.autoPublish&&!d.publishedAt?' · posts automatically':''}</div></div>
    <div class="snip">${d.publishError?`<span style="color:var(--bad)">Posting failed: ${esc(d.publishError)}</span>`:(esc((d.headline?d.headline+' — ':'')+(d.copy||'')) || '<em>No copy yet</em>')}</div>
    <div class="thumbs">${imgs.slice(0,3).map(i=>`<img src="${esc(fileUrl(i))}" alt="">`).join('')}</div>${av(d.assigneeId)}${pill(d.status)}</button>`;
}
function fileTile(c,f){ const k=fileKind(f), isImg=k==='image';
  return `<div class="ftile" title="${esc(f.name)}"><a class="open" href="${esc(fileUrl(f.path))}" target="_blank" rel="noopener" aria-label="Open ${esc(f.name)}"></a>
    <div class="fprev" style="${isImg?`background-image:url('${esc(fileUrl(f.path))}')`:''}">${isImg?'':esc(k)}</div><div class="fname">${esc(f.name)}</div>
    <button class="x" data-action="remove-file" data-id="${esc(c.id)}" data-file="${esc(f.path)}" aria-label="Remove ${esc(f.name)}">×</button></div>`; }
function renderCampaign(id){
  const c=S.campaigns[id];
  if(!c) return `<div class="empty">This campaign was deleted or hasn't loaded yet. <a href="#campaigns">Back to campaigns</a></div>`;
  const ds=destsOf(id); const done=ds.filter(d=>DONE.has(d.status)).length; const files=c.files||[]; const I=esc(id);
  const inp=(f,label,type,ph,extra='')=>`<div class="field"><label class="lbl" for="c-${f}">${label}</label><input type="${type}" id="c-${f}" data-bind="camp:${f}" data-id="${I}" value="${esc(c[f]||'')}" ${ph?`placeholder="${esc(ph)}"`:''} ${extra}></div>`;
  return `<div class="row small" style="margin-bottom:12px"><a href="#campaigns">← All campaigns</a></div>
  <div class="cp">
    <section class="panel stack" aria-label="Event details">
      <div class="field"><label class="lbl" for="c-title">Campaign</label><input type="text" id="c-title" class="titleinput" data-bind="camp:title" data-id="${I}" value="${esc(c.title)}" placeholder="Campaign name"></div>
      <div class="grid2">${inp('date','Start date','date')}${inp('time','Start time','time')}${inp('endDate','End date','date','',`min="${esc(c.date||'')}"`)}${inp('endTime','End time','time')}</div>
      ${inp('location','Location','text','e.g. Worship Center, The ROC')}
      <div class="field"><label class="lbl" for="c-description">Description</label><textarea id="c-description" data-bind="camp:description" data-id="${I}" placeholder="What is it, who is it for, how do people sign up? The AI writer uses this.">${esc(c.description||'')}</textarea></div>
      <div class="grid2">${inp('adStart','Advertise from','date')}${inp('adEnd','Advertise until','date','',`min="${esc(c.adStart||'')}"`)}</div>
      ${inp('ministry','Ministry / requested by','text',"e.g. Children's Ministry")}
      ${inp('link','Sign-up or info link','url','https://')}
      <div class="field"><span class="lbl">Calendar color</span><div class="swatches">${PALETTE.map(p=>`<button class="sw ${c.color===p?'on':''}" style="--c:${p}" data-action="set-color" data-id="${I}" data-color="${p}" aria-label="Color ${p}"></button>`).join('')}</div></div>
      <div class="field"><span class="lbl">Key art (used when a destination has no photo)</span>
        <div class="coverbox" style="${c.coverPath?`background-image:url('${esc(fileUrl(c.coverPath))}')`:''}">
          <label class="btn sm" for="up-cover-${I}">${c.coverPath?'Replace':'Upload image'}</label><input type="file" accept="image/*" class="sr" id="up-cover-${I}" data-upload="cover:${I}">
          ${c.coverPath?`<button class="btn sm" data-action="remove-cover" data-id="${I}">Remove</button>`:''}</div></div>
      <div class="field"><span class="lbl">Campaign files · ${files.length}</span>
        <div class="files">${files.map(f=>fileTile(c,f)).join('')}<label class="addfile" for="up-file-${I}">+ Add files<br><span class="small muted">Images, PDFs, video</span></label><input type="file" multiple accept="image/*,application/pdf,video/*,.ai,.psd,.indd,.docx,.pptx,.zip" class="sr" id="up-file-${I}" data-upload="file:${I}"></div>
        <span class="small muted" style="margin-top:6px">Posters, logos, photos and PDFs. Images can be added to any destination.</span></div>
      <div><button class="btn danger sm" data-action="delete-campaign" data-id="${I}">Delete campaign</button></div>
    </section>
    <div class="stack" style="gap:22px;min-width:0">
      ${renderAdCal(c, ds)}
      <section aria-label="Destinations">
        <div class="pagehead" style="margin-bottom:12px"><div><h2>Destinations</h2><div class="sub">Every place this campaign goes out, with its own date, copy, photos and owner.</div></div>
        <button class="btn dark" data-action="add-dests" data-id="${I}">+ Add destinations</button></div>
        ${ds.length?`<div class="dlist">${ds.map(d=>drow(d,false)).join('')}</div>`:`<div class="empty">No destinations yet. Drag them onto the advertising calendar above, or use Add destinations.</div>`}
        <div class="footbar"><span class="pill st-${done===ds.length&&ds.length?'approved':'review'}">${done} of ${ds.length} ready</span><span class="muted small">Ready = approved, scheduled or posted</span>
        ${ds.some(d=>d.status==='review')?`<span class="spacer"></span><button class="btn sm" data-action="approve-all" data-id="${I}">Approve all in review</button>`:''}</div>
      </section>
    </div>
  </div>`;
}
function renderAdCal(c, ds){
  const id=c.id;
  const head=`<div class="pagehead" style="margin-bottom:10px"><div><h2>Advertising calendar</h2><div class="sub">${c.adStart&&c.adEnd?`${esc(fmtD(c.adStart))} – ${esc(fmtD(c.adEnd))}. `:''}Drag a destination onto a day to schedule it, or drag one already placed to move it.</div></div></div>`;
  const a=parseYmd(c.adStart), b=parseYmd(c.adEnd);
  if(!a||!b) return `<section class="panel">${head}<div class="empty">Set <strong>Advertise from</strong> and <strong>Advertise until</strong> to see every day in your advertising window.</div></section>`;
  if(b<a) return `<section class="panel">${head}<div class="empty">"Advertise until" is before "Advertise from". Fix the dates to see the calendar.</div></section>`;
  if(daysBetween(c.adStart,c.adEnd)>180) return `<section class="panel">${head}<div class="empty">The advertising window is longer than 6 months. Shorten it to plan by day.</div></section>`;
  const palette=`<div class="palette" aria-label="Destinations to drag">${settings().channels.map(ch=>`<span class="pal" draggable="true" data-drag-chan="${esc(ch.id)}" data-camp="${esc(id)}" title="Drag onto a day">${kb(ch)}${esc(ch.name)}</span>`).join('')}</div>`;
  const st=startOfWeek(a), en=addDays(startOfWeek(b),6); const days=[]; for(let d=st; d<=en; d=addDays(d,1)) days.push(d);
  const ev=new Set(eventDays(c)); const byDate={}; for(const d of ds) if(d.date) (byDate[d.date] ||= []).push(d); const t=todayStr();
  let g=`<div class="adcal" style="--c:${esc(c.color)}">`+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(const d of days){ const k=ymd(d); const inR=k>=c.adStart && k<=c.adEnd; const items=(byDate[k]||[]).sort(byWhen); const showMon=d.getDate()===1||k===ymd(days[0]);
    g+=`<div class="aday ${inR?'':'na'} ${ev.has(k)?'ev':''} ${k===t?'today':''}" ${inR?`data-drop="${k}"`:''}>
      <div class="anum"><span>${showMon?`<span class="mon">${d.toLocaleDateString('en-US',{month:'short'})}</span> `:''}${d.getDate()}</span>${ev.has(k)?'<span class="evtag">★ Event</span>':''}${inR?`<button class="adadd" data-action="ad-add" data-id="${esc(id)}" data-date="${k}" aria-label="Add a destination on ${esc(fmtD(k))}">+</button>`:''}</div>
      ${items.map(x=>chip(x, channelById(x.channelId).name, true)).join('')}</div>`; }
  g+=`</div>`;
  const outside=ds.filter(d=>!d.date||d.date<c.adStart||d.date>c.adEnd);
  const tray=outside.length?`<div class="tray"><span class="small muted">Outside the advertising window:</span>${outside.map(x=>chip(x, channelById(x.channelId).name+(x.date?' · '+fmtD(x.date,{month:'short',day:'numeric'}):''), true)).join('')}</div>`:'';
  return `<section class="panel">${head}${palette}${g}${tray}</section>`;
}

/* ---------- my work ---------- */
function renderWork(){
  const m=me(); let pid=V.workPerson || (m&&m.id) || '';
  let h=`<div class="pagehead"><div><h1>My work</h1><div class="sub">Sorted by due date, or publish date when there's no due date.</div></div><div class="row"><label class="small muted" for="w-person">Showing</label><select class="compact" id="w-person" data-ui="workPerson">${memberOptions(pid,false)}<option value="none" ${pid==='none'?'selected':''}>Unassigned</option></select></div></div>`;
  const when=d=>d.dueDate||d.date||'';
  const mine=Object.values(S.dests).filter(d=>pid==='none'?!d.assigneeId:d.assigneeId===pid).sort((a,b)=>(when(a)||'9999').localeCompare(when(b)||'9999')||byWhen(a,b));
  const t=todayStr(), wk=ymd(addDays(new Date(),7)); const open=mine.filter(d=>d.status!=='posted'); const ok=d=>!d.publishError;
  const groups=[['Needs attention',open.filter(d=>d.publishError)],['Overdue',open.filter(d=>ok(d)&&when(d)&&when(d)<t)],['Due today',open.filter(d=>ok(d)&&when(d)===t)],['Next 7 days',open.filter(d=>ok(d)&&when(d)>t&&when(d)<=wk)],['Later',open.filter(d=>ok(d)&&(!when(d)||when(d)>wk))],['Posted recently',mine.filter(d=>d.status==='posted').reverse().slice(0,10)]];
  if(!mine.length) h+=`<div class="empty"><img src="/assets/mark-color.svg" alt="">Nothing assigned yet.</div>`;
  for(const [g,items] of groups){ if(!items.length) continue; h+=`<div class="sectionlabel">${g} · ${items.length}</div><div class="dlist">${items.map(d=>drow(d,true)).join('')}</div>`; }
  return h;
}

/* ---------- requests inbox ---------- */
const REQ_ST = {new:['New','st-new'], approved:['Approved','st-approved'], declined:['Declined','st-declined']};
function reqWhen(r){ return fmtRange({date:r.start_date||'', endDate:r.end_date||'', time:t5(r.start_time), endTime:t5(r.end_time)}, true); }
function ago(ts){ const m=Math.round((Date.now()-new Date(ts))/60000); if(m<60) return `${Math.max(1,m)} min ago`; const h=Math.round(m/60); if(h<24) return `${h} hr ago`; const d=Math.round(h/24); return d<14?`${d} day${d===1?'':'s'} ago`:new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function renderRequests(){
  const all=Object.values(S.requests).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const counts={new:0,approved:0,declined:0}; all.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  if(V.requestId && S.requests[V.requestId] && S.requests[V.requestId].status!==V.reqFilter) V.reqFilter=S.requests[V.requestId].status;
  const list=all.filter(r=>r.status===V.reqFilter);
  const sel=(V.requestId && S.requests[V.requestId]) || list[0];
  const formUrl=location.origin+'/request';
  let h=`<div class="pagehead"><div><h1>Requests</h1><div class="sub">Communication requests from staff and ministry leaders. Share the form: <a href="/request" target="_blank" rel="noopener">${esc(formUrl)}</a></div></div>
    <div class="row"><button class="btn sm" data-action="copy-form-link">Copy form link</button><div class="seg" role="group" aria-label="Show">${['new','approved','declined'].map(k=>`<button data-action="req-filter" data-f="${k}" class="${V.reqFilter===k?'on':''}">${REQ_ST[k][0]} · ${counts[k]||0}</button>`).join('')}</div></div></div>`;
  if(!list.length) return h+`<div class="empty"><img src="/assets/mark-color.svg" alt="">${V.reqFilter==='new'?'No new requests. When someone fills out the request form, it shows up here.':'Nothing here yet.'}</div>`;
  h+=`<div class="inbox"><div class="reqlist">${list.map(r=>`<button class="reqitem ${REQ_ST[r.status][1]} ${sel&&sel.id===r.id?'on':''}" data-action="open-request" data-id="${esc(r.id)}"><span class="t">${esc(r.title)}</span><span class="small">${esc(r.requester_name)}${r.ministry?' · '+esc(r.ministry):''}</span><span class="small muted">${esc(fmtD(r.start_date))} · sent ${esc(ago(r.created_at))}</span></button>`).join('')}</div>`;
  if(sel && sel.status===V.reqFilter){
    const chs=(sel.channel_ids||[]).map(channelById); const files=sel.files||[]; const reviewer=memberById(sel.reviewed_by); const camp=sel.campaign_id&&S.campaigns[sel.campaign_id];
    h+=`<section class="panel stack"><div class="row"><h2 style="font-size:24px;text-transform:uppercase;letter-spacing:.06em;flex:1">${esc(sel.title)}</h2><span class="pill ${REQ_ST[sel.status][1]}">${REQ_ST[sel.status][0]}</span></div>
      <dl class="dl">
        <dt>Requested by</dt><dd>${esc(sel.requester_name)} · <a href="mailto:${esc(sel.requester_email)}">${esc(sel.requester_email)}</a>${sel.phone?' · '+esc(sel.phone):''}</dd>
        ${sel.ministry?`<dt>Ministry</dt><dd>${esc(sel.ministry)}</dd>`:''}
        <dt>When</dt><dd>${esc(reqWhen(sel))}</dd>
        ${sel.location?`<dt>Location</dt><dd>${esc(sel.location)}</dd>`:''}
        <dt>Description</dt><dd>${esc(sel.description)}</dd>
        <dt>Destinations</dt><dd style="white-space:normal"><div class="chlist">${chs.map(c=>`<span class="chtag">${kb(c)}${esc(c.name)}</span>`).join('')}${sel.not_sure?'<span class="chtag" style="padding-left:10px">Not sure: team decides</span>':''}</div></dd>
        <dt>Files</dt><dd style="white-space:normal">${files.length?`<div class="files">${files.map(f=>{ const k=fileKind(f), img=k==='image'; return `<div class="ftile" title="${esc(f.name)}"><a class="open" href="${esc(fileUrl(f.path))}" target="_blank" rel="noopener" aria-label="Open ${esc(f.name)}"></a><div class="fprev" style="${img?`background-image:url('${esc(fileUrl(f.path))}')`:''}">${img?'':esc(k)}</div><div class="fname">${esc(f.name)}</div></div>`; }).join('')}</div>`:'<span class="muted">None</span>'}</dd>
        <dt>Received</dt><dd>${esc(new Date(sel.created_at).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</dd>
        ${sel.status!=='new'?`<dt>${sel.status==='approved'?'Approved':'Declined'}</dt><dd>${esc(reviewer?reviewer.name:'Staff')}${sel.reviewed_at?' · '+esc(new Date(sel.reviewed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})):''}${sel.decision_note?'\n“'+esc(sel.decision_note)+'”':''}</dd>`:''}
      </dl>
      <div class="footbar">${sel.status==='new'?`<button class="btn primary" data-action="req-approve" data-id="${esc(sel.id)}">Approve</button><button class="btn" data-action="req-decline" data-id="${esc(sel.id)}">Decline</button>`:''}
        ${camp?`<a class="btn dark" href="#campaign-${esc(camp.id)}">Open campaign</a>`:''}<span class="spacer"></span><button class="btn ghost sm danger" data-action="req-delete" data-id="${esc(sel.id)}">Delete</button></div>
    </section>`;
  } else h+=`<div class="empty">Select a request.</div>`;
  return h+`</div>`;
}
async function approveRequest(m){
  const r=S.requests[m.id]; if(!r) return; V.busy=true; render(true);
  let campaignId=null;
  try{
    if(m.createCampaign){
      const start=r.start_date||ymd(addDays(new Date(),21)); let adEnd=r.end_date&&r.end_date>start?r.end_date:start;
      const c={id:uid(), title:r.title, date:r.start_date||'', endDate:r.end_date||r.start_date||'', time:t5(r.start_time), endTime:t5(r.end_time), adStart:todayStr()<start?todayStr():start, adEnd,
        location:r.location||'', description:r.description||'', ministry:r.ministry||r.requester_name, link:'', color:PALETTE[Object.keys(S.campaigns).length % PALETTE.length], coverPath:'',
        files:(r.files||[]).map(f=>({path:f.path, name:f.name, type:f.type, size:f.size, at:Date.now()}))};
      saveCampaign(c); campaignId=c.id;
      let def=parseYmd(start)?addDays(parseYmd(start),-3):new Date(); if(ymd(def)<todayStr()) def=new Date();
      for(const chId of (r.channel_ids||[])) if(settings().channels.some(x=>x.id===chId)) newDest(c.id, chId, ymd(def), defaultTime(chId), '');
      for(let i=0;i<60 && Object.keys(dirty).length;i++) await new Promise(res=>setTimeout(res,150));
    }
    const res=await api('request-decision',{id:r.id, decision:'approved', note:m.note, campaignId, notify:m.notify});
    Object.assign(r,{status:'approved', decision_note:m.note, campaign_id:campaignId, reviewed_by:session.user.id, reviewed_at:new Date().toISOString()});
    V.modal=null; V.busy=false;
    toast(m.notify?(res.emailed?`Approved. ${r.requester_name} was emailed.`:`Approved, but the email didn't send${res.emailError?': '+res.emailError:''}.`):'Approved.');
    if(campaignId) location.hash='campaign-'+campaignId; else render(true);
  }catch(e){ V.busy=false; toast(e.message); render(true); }
}
async function declineRequest(m){
  const r=S.requests[m.id]; if(!r) return; V.busy=true; render(true);
  try{ const res=await api('request-decision',{id:r.id, decision:'declined', note:m.note, notify:m.notify});
    Object.assign(r,{status:'declined', decision_note:m.note, reviewed_by:session.user.id, reviewed_at:new Date().toISOString()});
    V.modal=null; V.busy=false; toast(m.notify?(res.emailed?`Declined. ${r.requester_name} was emailed.`:'Declined, but the email didn\'t send.'):'Declined.'); render(true);
  }catch(e){ V.busy=false; toast(e.message); render(true); }
}

/* ---------- settings ---------- */
function renderSettings(){
  const s=settings(); const m=me(); const admin=isAdmin(); const so=S.social;
  const social = !so ? `<div class="muted small">Checking connection…</div>` : so.connected ? `
      <div class="connected"><img src="/assets/mark-color.svg" alt="" width="36" height="36"><div style="flex:1"><div><strong>Facebook:</strong> ${esc(so.pageName||so.pageId)}</div><div><strong>Instagram:</strong> ${so.hasInstagram?'@'+esc(so.igUsername):'<span class="muted">No Instagram professional account linked to this Page</span>'}</div></div>
      ${admin?`<button class="btn sm" data-action="social-disconnect">Disconnect</button>`:''}</div>
      <p class="small muted" style="margin:0">Facebook and Instagram destinations can now be posted from this app, right away or automatically at their scheduled time.</p>` :
    admin ? `<p class="prose small" style="margin:0">Connect your Facebook Page to post to Facebook and Instagram from this app. The setup guide explains how to get the Page ID and access token.</p>
      <form class="stack" data-form="social" style="gap:10px"><div class="field"><label class="lbl" for="so-page">Facebook Page ID</label><input type="text" id="so-page" inputmode="numeric" placeholder="e.g. 104578123456789"></div>
      <div class="field"><label class="lbl" for="so-token">Access token</label><input type="password" id="so-token" autocomplete="off" placeholder="Paste the token"></div>
      <div><button class="btn primary" type="submit" ${V.busy?'disabled':''}>${V.busy?'Checking…':'Connect'}</button></div></form>` :
    `<p class="small muted" style="margin:0">Not connected. An admin can connect the church's Facebook Page here.</p>`;
  return `<div class="pagehead"><h1>Settings</h1><span class="sub">Changes save automatically and apply for everyone.</span></div>
  <div class="setgrid">
  <section class="panel stack"><h2>Your profile</h2>
    ${m?`<div class="field"><label class="lbl" for="p-name">Name</label><input type="text" id="p-name" data-bind="me:name" value="${esc(m.name)}"></div>
    <div class="field"><span class="lbl">Color</span><div class="swatches">${PALETTE.map(p=>`<button class="sw ${m.color===p?'on':''}" style="--c:${p}" data-action="my-color" data-color="${p}" aria-label="Color ${p}"></button>`).join('')}</div></div>
    <div class="small muted">${esc(m.email)} · ${m.role==='admin'?'Admin':'Editor'}</div>`:''}
    <div class="row"><button class="btn sm" data-action="change-pw">Change password</button></div>
  </section>
  <section class="panel stack"><h2>Facebook &amp; Instagram</h2>${social}</section>
  <section class="panel stack"><h2>Writing voice</h2>
    <div class="field"><label class="lbl" for="s-voice">Church voice for AI copy</label><textarea id="s-voice" data-bind="set:voice" rows="6">${esc(s.voice)}</textarea></div>
    <div class="field"><label class="lbl" for="s-handle">Page name in post previews</label><input type="text" id="s-handle" data-bind="set:handle" value="${esc(s.handle)}"></div>
    ${CFG&&CFG.aiEnabled?'':'<p class="small" style="margin:0;color:var(--bad)">AI writing is off until ANTHROPIC_API_KEY is added in Netlify.</p>'}
  </section>
  <section class="panel stack"><h2>Destinations</h2>
    <p class="sub" style="margin:0">The places you publish to. Each becomes a row on the calendar. Click an icon to change it. The type sets the AI writing style and character limits.</p>
    ${s.channels.map(c=>`<div class="setrow"><button class="iconbtn-pick" data-action="pick-icon" data-id="${esc(c.id)}" title="Change icon" aria-label="Change icon for ${esc(c.name)}">${kb(c)}</button><input type="text" id="ch-name-${esc(c.id)}" data-bind="chan:name" data-id="${esc(c.id)}" value="${esc(c.name)}" aria-label="Destination name"><select id="ch-kind-${esc(c.id)}" data-bind="chan:kind" data-id="${esc(c.id)}" aria-label="Destination type">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${c.kind===k?'selected':''}>${v.label}</option>`).join('')}</select><button class="btn ghost iconbtn" data-action="remove-channel" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">✕</button></div>`).join('')}
    <div><button class="btn sm" data-action="add-channel">+ Add destination</button></div>
  </section>
  <section class="panel stack"><h2>Team</h2>
    <div>${teamList().map(t=>`<div class="teamrow">${av(t.id,'lg')}<div class="who"><div><strong>${esc(t.name)}</strong>${t.id===(m&&m.id)?' <span class="small muted">(you)</span>':''}</div><div class="small muted">${esc(t.email)}</div></div>
      ${admin&&t.id!==(m&&m.id)?`<select class="compact" id="role-${esc(t.id)}" data-role="${esc(t.id)}" aria-label="Role for ${esc(t.name)}"><option value="editor" ${t.role==='editor'?'selected':''}>Editor</option><option value="admin" ${t.role==='admin'?'selected':''}>Admin</option></select><button class="btn ghost iconbtn" data-action="remove-member" data-id="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">✕</button>`:`<span class="pill ${t.role==='admin'?'st-posted':'st-draft'}">${t.role==='admin'?'Admin':'Editor'}</span><span></span>`}</div>`).join('')}</div>
    ${admin?`<form class="stack" data-form="invite" style="gap:10px"><div class="grid2"><div class="field"><label class="lbl" for="inv-name">Name</label><input type="text" id="inv-name" autocomplete="off"></div><div class="field"><label class="lbl" for="inv-email">Email</label><input type="email" id="inv-email" autocomplete="off" required></div></div>
      <div><button class="btn dark" type="submit" ${V.busy?'disabled':''}>${V.busy?'Sending…':'Send invite'}</button></div></form>
      <p class="small muted" style="margin:0">They'll get an email with a link to choose a password. Admins can invite people, change roles and connect Facebook. Editors can do everything else.</p>`
      :`<p class="small muted" style="margin:0">Ask an admin to invite new staff.</p>`}
  </section>
  </div>`;
}

/* ---------- drawer ---------- */
function aiState(id){ return V.ai[id] ||= {open:false, loading:false, options:[], error:'', tone:'voice', length:'medium', emoji:'light', hashtags:'off', extra:''}; }
function renderDrawer(){
  const d=V.openDest && S.dests[V.openDest]; if(!d) return '';
  const c=campOf(d), ch=channelById(d.channelId), k=kindOf(ch), id=d.id;
  const a=aiState(id); const len=(d.copy||'').length; const imgs=d.imagePaths||[]; const st=d.status||'draft'; const s=settings();
  const previewImg = imgs[0] || c.coverPath;
  let html=`<div class="scrim" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(ch.name)} for ${esc(c.title)}">
  <div class="dhead">${kb(ch,'lg')}<div style="flex:1;min-width:0"><div class="t">${esc(ch.name)}</div><a class="small" href="#campaign-${esc(d.campaignId)}">${esc(c.title)}</a></div><button class="btn ghost iconbtn" data-action="close-drawer" aria-label="Close">✕</button></div>
  <div class="dbody">
    <div class="grid2">
      <div class="field"><label class="lbl" for="d-date-${id}">Publish date</label><input type="date" id="d-date-${id}" data-bind="dest:date" data-id="${id}" value="${esc(d.date)}"></div>
      <div class="field"><label class="lbl" for="d-time-${id}">Time</label><input type="time" id="d-time-${id}" data-bind="dest:time" data-id="${id}" value="${esc(d.time)}"></div>
      <div class="field"><label class="lbl" for="d-chan-${id}">Destination</label><select id="d-chan-${id}" data-bind="dest:channelId" data-id="${id}">${channelOptions(d.channelId)}</select></div>
    </div>
    <div class="postbox" style="border-left-color:var(--gold);gap:10px"><span class="lbl" style="margin:0">Assignment</span>
      <div class="grid2">
        <div class="field"><label class="lbl" for="d-assignee-${id}">Assigned to</label><select id="d-assignee-${id}" data-bind="dest:assigneeId" data-id="${id}">${memberOptions(d.assigneeId)}</select></div>
        <div class="field"><label class="lbl" for="d-due-${id}">Due date</label><input type="date" id="d-due-${id}" data-bind="dest:dueDate" data-id="${id}" value="${esc(d.dueDate)}" ${d.date?`max="${esc(d.date)}"`:''}></div>
      </div>
      <span class="small muted">${d.assigneeId?`${esc((memberById(d.assigneeId)||{}).name||'They')} gets an email when assigned and a reminder the morning it's due.`:'Pick someone to email them the assignment. They get a reminder the morning it\'s due.'}</span>
    </div>
    <div class="field"><span class="lbl">Status</span><div class="statusseg" role="group" aria-label="Status">${STATUSES.map(([v,l])=>`<button class="st-${v} ${st===v?'on':''}" data-action="set-status" data-id="${id}" data-status="${v}" aria-pressed="${st===v}"><span class="sdot"></span>${l}</button>`).join('')}</div></div>
    ${k.head?`<div class="field"><label class="lbl" for="d-head-${id}">${k.head}</label><input type="text" id="d-head-${id}" data-bind="dest:headline" data-id="${id}" value="${esc(d.headline)}"></div>`:''}
    <div class="field">
      <div class="copyhead"><label class="lbl" for="d-copy-${id}" style="margin:0">${ch.kind==='announcement'?'Script':k.social?'Caption':'Copy'}</label><span class="counter ${k.limit&&len>k.limit?'over':''}" id="cnt-${id}">${len}${k.limit?' / '+k.limit:''} characters</span><span class="spacer"></span>
        <button class="btn sm" data-action="copy-text" data-id="${id}">Copy</button>${CFG&&CFG.aiEnabled?`<button class="btn gold sm" data-action="ai-toggle" data-id="${id}">✦ Write with AI</button>`:''}</div>
      <textarea id="d-copy-${id}" data-bind="dest:copy" data-id="${id}" rows="8" placeholder="Write the ${esc(k.label.toLowerCase())} copy, or use Write with AI.">${esc(d.copy)}</textarea>
    </div>
    ${a.open?renderAI(d,a,k):''}
    <div class="field"><span class="lbl">Photos for this destination</span>
      <div class="photos">${imgs.map(p=>`<div class="photo"><a href="${esc(fileUrl(p))}" target="_blank" rel="noopener" aria-label="Open full-size photo"></a><img src="${esc(fileUrl(p))}" alt=""><button class="x" data-action="remove-photo" data-id="${id}" data-img="${esc(p)}" aria-label="Remove photo">×</button></div>`).join('')}
      <label class="addphoto" for="up-${id}">+ Add<br>photos</label><input type="file" accept="image/*" multiple class="sr" id="up-${id}" data-upload="dest:${id}"></div>
      ${!imgs.length&&c.coverPath?`<span class="small muted" style="margin-top:6px">Using the campaign's key art until you add a photo here.</span>`:''}
      ${(()=>{ const avail=(c.files||[]).filter(f=>fileKind(f)==='image' && !imgs.includes(f.path)); if(!avail.length) return '';
        return `<span class="small muted" style="margin:10px 0 6px">From campaign files (click to add):</span><div class="photos">${avail.map(f=>`<button class="photo" style="cursor:pointer" data-action="attach-file" data-id="${id}" data-file="${esc(f.path)}" title="Add ${esc(f.name)}"><img src="${esc(fileUrl(f.path))}" alt="${esc(f.name)}"></button>`).join('')}</div>`; })()}
    </div>`;
  if(k.social) html += renderSocial(d,c,ch,previewImg,s);
  html+=`<div class="field"><label class="lbl" for="d-notes-${id}">Notes for the team</label><textarea id="d-notes-${id}" data-bind="dest:notes" data-id="${id}" rows="3" placeholder="Approvals, links, who to tag…">${esc(d.notes)}</textarea></div>
    <div class="row"><button class="btn danger sm" data-action="delete-dest" data-id="${id}">Delete this destination</button><span class="spacer"></span><button class="btn primary" data-action="close-drawer">Done</button></div>
  </div></aside>`;
  return html;
}
function renderSocial(d,c,ch,previewImg,s){
  const ig = ch.kind==='instagram'; const id=d.id; const so=S.social;
  const preview=`<div class="field"><span class="lbl">${ig?'Instagram':'Facebook'} preview</span>
    <div class="preview ${ig?'ig':'fb'}"><div class="ph"><img src="/assets/mark-color.svg" alt="">${esc(s.handle)}</div>
    ${!ig?`<div class="pcap">${esc(d.copy||'Your post text appears here.')}</div>`:''}
    <div class="pimg" style="${previewImg?`background-image:url('${esc(fileUrl(previewImg))}')`:''}">${previewImg?'':'Add a photo'}</div>
    ${ig?`<div class="pcap"><strong>${esc(s.handle)}</strong> ${esc(d.copy||'Your caption appears here.')}</div>`:''}</div></div>`;
  let box;
  if(d.publishedAt){
    box=`<div class="postbox ok"><span class="lbl" style="margin:0">Posted</span><div>Posted ${esc(new Date(d.publishedAt).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}.</div>${d.externalUrl?`<div><a class="btn sm" href="${esc(d.externalUrl)}" target="_blank" rel="noopener">View post</a></div>`:''}</div>`;
  } else if(so && so.connected && (!ig || so.hasInstagram)){
    const when = d.date ? `${fmtD(d.date,{weekday:'long',month:'short',day:'numeric'})}${d.time?' at '+fmtT(d.time):' at 9:00 AM'}` : 'its publish date';
    box=`<div class="postbox ${d.publishError?'err':''}"><span class="lbl" style="margin:0">Post to ${ig?'Instagram':'Facebook'}</span>
      ${d.publishError?`<div style="color:var(--bad)"><strong>Last try failed:</strong> ${esc(d.publishError)}</div><div><button class="btn sm" data-action="clear-error" data-id="${id}">Try again</button></div>`:''}
      <label class="check"><input type="checkbox" id="d-auto-${id}" data-bind="dest:autoPublish" data-id="${id}" ${d.autoPublish?'checked':''}><span>Post automatically on ${esc(when)}<br><span class="small muted">Only posts once its status is Approved or Scheduled.</span></span></label>
      <div class="row"><button class="btn primary sm" data-action="post-now" data-id="${id}" ${V.busy?'disabled':''}>${V.busy?'Posting…':'Post now'}</button>${ig?'<span class="small muted">Instagram needs at least one photo.</span>':''}</div></div>`;
  } else {
    box=`<div class="postbox"><span class="lbl" style="margin:0">Publish by hand</span>
      <ol class="steps"><li><button class="btn sm" data-action="copy-text" data-id="${id}">Copy caption</button></li>
      <li>${previewImg?`<a class="btn sm" href="${esc(fileUrl(previewImg))}" target="_blank" rel="noopener">Open photo to save it</a>`:'<span class="muted small">Add a photo above</span>'}</li>
      <li><a class="btn sm dark" href="${META_COMPOSER}" target="_blank" rel="noopener">Open Meta Business Suite</a></li>
      <li><button class="btn sm" data-action="set-status" data-id="${id}" data-status="${d.date&&d.date>todayStr()?'scheduled':'posted'}">Mark as ${d.date&&d.date>todayStr()?'scheduled':'posted'}</button></li></ol>
      <span class="small muted">${so&&so.connected&&ig&&!so.hasInstagram?'The connected Facebook Page has no Instagram professional account linked.':'An admin can connect Facebook in Settings to post straight from here.'}</span></div>`;
  }
  return preview+box;
}
function renderAI(d,a,k){
  const id=d.id; const sel=(f,opts)=>`<select id="ai-${f}-${id}" data-ai="${f}" data-id="${id}">${opts.map(([v,l])=>`<option value="${v}" ${a[f]===v?'selected':''}>${l}</option>`).join('')}</select>`;
  return `<div class="aibox" aria-live="polite"><div class="row"><span class="lbl" style="margin:0">Write with AI</span><span class="sub">Uses the campaign details and your church voice.</span></div>
    <div class="grid2">
      <div class="field"><label class="lbl" for="ai-tone-${id}">Tone</label>${sel('tone',[['voice','Our church voice'],['joyful','Joyful & vibrant'],['reverent','Reverent & reflective'],['urgent','Last call'],['playful','Playful (kids & families)']])}</div>
      <div class="field"><label class="lbl" for="ai-length-${id}">Length</label>${sel('length',[['short','Short'],['medium','Medium'],['long','Long']])}</div>
      <div class="field"><label class="lbl" for="ai-emoji-${id}">Emoji</label>${sel('emoji',[['none','None'],['light','Light'],['more','More']])}</div>
      ${k.social?`<div class="field"><label class="lbl" for="ai-hashtags-${id}">Hashtags</label>${sel('hashtags',[['off','Off'],['on','A few at the end']])}</div>`:''}
    </div>
    <div class="field"><label class="lbl" for="ai-extra-${id}">Anything else? (optional)</label><input type="text" id="ai-extra-${id}" data-ai="extra" data-id="${id}" value="${esc(a.extra)}" placeholder="e.g. mention childcare is provided"></div>
    <div class="row"><button class="btn dark" data-action="ai-generate" data-id="${id}" ${a.loading?'disabled':''}>${a.loading?'Writing…':(a.options.length?'Regenerate':'Generate 2 options')}</button>${d.copy?'<span class="small muted">Your current copy is used as a starting point.</span>':''}</div>
    ${a.error?`<div class="small" style="color:var(--bad)">${esc(a.error)}</div>`:''}
    ${a.options.length?`<div class="aiopts">${a.options.map((o,i)=>`<div class="aiopt"><div class="row"><span class="lbl" style="margin:0">Option ${'AB'[i]||i+1}</span><span class="spacer"></span><button class="btn sm gold" data-action="ai-use" data-id="${id}" data-i="${i}">Use option ${'AB'[i]||i+1}</button></div>${o.headline&&k.head?`<div class="hl">${esc(o.headline)}</div>`:''}<div class="tx">${esc(o.text)}</div></div>`).join('')}</div>`:''}
  </div>`;
}

/* ---------- modals ---------- */
function renderModal(){
  const m=V.modal; if(!m) return '';
  const wrap=(inner,w)=>`<div class="modalwrap" data-action="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t" ${w?`style="width:min(${w}px,100%)"`:''}>${inner}</div></div>`;
  if(m.type==='confirm') return wrap(`<h2 id="m-t">${esc(m.title)}</h2><p class="prose" style="margin:0">${esc(m.body)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn primary" data-action="confirm-yes">${esc(m.yes||'Delete')}</button></div>`);
  if(m.type==='change-pw') return wrap(`<h2 id="m-t">Change password</h2><form class="stack" data-form="change-pw" style="gap:12px"><div class="field"><label class="lbl" for="cp-1">New password</label><input type="password" id="cp-1" autocomplete="new-password" minlength="8" required></div><div class="field"><label class="lbl" for="cp-2">Confirm</label><input type="password" id="cp-2" autocomplete="new-password" minlength="8" required></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  if(m.type==='pick-campaign'){
    const ch=channelById(m.channelId); const t=todayStr();
    const list=Object.values(S.campaigns).sort((a,b)=>{ const ua=(a.date||'9999')>=t, ub=(b.date||'9999')>=t; if(ua!==ub) return ua?-1:1; return ua?(a.date||'9999').localeCompare(b.date||'9999'):(b.date||'').localeCompare(a.date||''); });
    return wrap(`<h2 id="m-t">Add ${esc(ch.name)} on ${esc(fmtD(m.date))}</h2><p class="sub" style="margin:0">Which campaign is this for?</p>
      <div class="stack" style="gap:8px">${list.map(c=>`<button class="pickrow" data-action="pick-campaign" data-id="${esc(c.id)}"><span class="sw" style="--c:${esc(c.color)};cursor:inherit"></span><span style="flex:1"><strong>${esc(c.title)}</strong><br><span class="small muted">${esc(fmtRange(c))}</span></span></button>`).join('')||'<div class="muted">No campaigns yet.</div>'}</div>
      <div class="row"><button class="btn" data-action="new-campaign">+ New campaign instead</button><span class="spacer"></span><button class="btn" data-action="modal-close">Cancel</button></div>`);
  }
  if(m.type==='icon-picker'){ const ch=channelById(m.channelId); const k=kindOf(ch); const cur=iconOf(ch);
    return wrap(`<h2 id="m-t">Icon for ${esc(ch.name)}</h2>
      <div class="row" style="gap:14px"><div class="iconprev" style="--k:${k.color}"><img src="${esc(iconUrl(cur))}" alt=""></div><div class="small muted">Current: <code>${esc(cur)}</code><br>Search thousands of free icons from Lucide, plus brand logos from Simple Icons.</div></div>
      <div class="field"><label class="lbl" for="icon-q">Search icons</label><input type="text" id="icon-q" placeholder="Try: youtube, calendar, music, kids, coffee" autocomplete="off"></div>
      <div class="icongrid" id="icon-results">${iconCells(SUGGESTED_ICONS, cur)}</div>
      <div class="row"><button class="btn sm" data-action="icon-reset">Use default icon</button><span class="spacer"></span><button class="btn" data-action="modal-close">Done</button></div>`, 680); }
  if(m.type==='req-approve'||m.type==='req-decline'){ const r=S.requests[m.id]; const ap=m.type==='req-approve';
    return wrap(`<h2 id="m-t">${ap?'Approve':'Decline'} request</h2><p class="prose" style="margin:0">${esc(r.title)} · from ${esc(r.requester_name)}</p>
      ${ap?`<label class="check"><input type="checkbox" id="ra-camp" ${m.createCampaign?'checked':''}><span>Create a campaign with the requested destinations<br><span class="small muted">Event details and files are copied in. You can change anything after.</span></span></label>`:''}
      <label class="check"><input type="checkbox" id="ra-notify" ${m.notify?'checked':''}><span>Email ${esc(r.requester_name)} (${esc(r.requester_email)})</span></label>
      <div class="field"><label class="lbl" for="ra-note">Message to include <span class="small muted" style="text-transform:none;letter-spacing:0">optional</span></label><textarea id="ra-note" rows="4" placeholder="${ap?'e.g. We\'ll have this in the Weekly Update on the 12th and on social media the week of the event.':'e.g. This falls outside our communication guidelines. Let\'s talk about other options.'}">${esc(m.note||'')}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn ${ap?'primary':'dark'}" data-action="${ap?'req-approve-go':'req-decline-go'}" ${V.busy?'disabled':''}>${V.busy?'Working…':ap?'Approve':'Decline'}</button></div>`, 600); }
  if(m.type==='pick-channel') return wrap(`<h2 id="m-t">Add a destination on ${esc(fmtD(m.date,{weekday:'long',month:'long',day:'numeric'}))}</h2>
      <div class="stack" style="gap:8px">${settings().channels.map(ch=>`<button class="pickrow" data-action="pick-channel" data-id="${esc(ch.id)}">${kb(ch)}<strong>${esc(ch.name)}</strong></button>`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button></div>`);
  if(m.type==='add-dests'){
    const c=S.campaigns[m.campaignId]; const used=new Set(destsOf(m.campaignId).map(d=>d.channelId));
    const rows=settings().channels.map(ch=>{ const r=m.rows[ch.id]||(m.rows[ch.id]={on:false,date:todayStr(),time:defaultTime(ch.id),assigneeId:''}); const C=esc(ch.id); return `<div class="mrow ${r.on?'':'off'}"><input type="checkbox" id="m-on-${C}" data-mrow="${C}:on" ${r.on?'checked':''}><label for="m-on-${C}" class="row" style="gap:8px;cursor:pointer">${kb(ch)}<span><strong>${esc(ch.name)}</strong>${used.has(ch.id)?' <span class="small muted">· already added</span>':''}</span></label>
      <input class="ctl" type="date" id="m-date-${C}" data-mrow="${C}:date" value="${esc(r.date)}" aria-label="${esc(ch.name)} date"><input class="ctl" type="time" id="m-time-${C}" data-mrow="${C}:time" value="${esc(r.time)}" aria-label="${esc(ch.name)} time"><select class="ctl" id="m-who-${C}" data-mrow="${C}:assigneeId" aria-label="${esc(ch.name)} assignee">${memberOptions(r.assigneeId)}</select></div>`; }).join('');
    const n=Object.values(m.rows).filter(r=>r.on).length;
    return wrap(`<h2 id="m-t">Add destinations</h2><p class="sub" style="margin:0">For ${esc(c?c.title:'this campaign')}. Pick where it goes, then set when each one publishes and who owns it.</p><div>${rows}</div>
      <form class="row" data-form="modal-new-channel"><input type="text" id="m-newname" placeholder="New destination, e.g. Kids Ministry Facebook group" aria-label="New destination name" style="flex:1;min-width:200px"><select id="m-newkind" class="compact" aria-label="New destination type">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${k==='other'?'selected':''}>${v.label}</option>`).join('')}</select><button class="btn sm" type="submit">+ Add new</button></form>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn primary" data-action="modal-save-dests" ${n?'':'disabled'}>Add ${n} destination${n===1?'':'s'}</button></div>`, 840);
  }
  return '';
}
function iconCells(list, cur){ return list.map(ic=>`<button class="iconcell ${ic===cur?'on':''}" data-action="set-icon" data-icon="${esc(ic)}" title="${esc(ic)}"><img src="${esc(iconUrl(ic,'#414A55'))}" alt="" loading="lazy"><span>${esc(ic.split(':')[1])}</span></button>`).join(''); }
let iconSearchT, iconSearchN=0;
function iconSearch(q){
  clearTimeout(iconSearchT);
  iconSearchT=setTimeout(async ()=>{ const box=document.getElementById('icon-results'); if(!box) return; const n=++iconSearchN; const cur=iconOf(channelById(V.modal.channelId));
    if(!q.trim()){ box.innerHTML=iconCells(SUGGESTED_ICONS,cur); return; }
    box.innerHTML='<span class="small muted">Searching…</span>';
    try{ const r=await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q.trim())}&prefixes=${ICON_SETS}&limit=96`).then(r=>r.json()); if(n!==iconSearchN) return;
      box.innerHTML = (r.icons&&r.icons.length) ? iconCells(r.icons,cur) : '<span class="small muted">No icons found. Try a simpler word.</span>'; }
    catch(e){ box.innerHTML='<span class="small muted">Icon search is unavailable right now.</span>'; } }, 300);
}
function defaultTime(chanId){ const k=channelById(chanId).kind; return k==='slides'||k==='announcement'||k==='bulletin' ? '08:30' : k==='text' ? '12:00' : '09:00'; }
function openAddDests(cid){
  const c=S.campaigns[cid]; const base=c&&parseYmd(c.date);
  let def = base ? addDays(base,-3) : addDays(new Date(),7); if(ymd(def)<todayStr()) def=new Date();
  if(c && c.adStart && ymd(def)<c.adStart) def=parseYmd(c.adStart);
  const rows={}; for(const ch of settings().channels) rows[ch.id]={on:false, date:ymd(def), time:defaultTime(ch.id), assigneeId:''};
  V.modal={type:'add-dests', campaignId:cid, rows}; render(true);
}

/* ---------- actions ---------- */
function newDest(campaignId, channelId, date, time, assigneeId){
  const d={id:uid(), campaignId, channelId, date:date||'', time:time||'', assigneeId:assigneeId||'', status:'draft', headline:'', copy:'', notes:'', imagePaths:[], autoPublish:false, publishedAt:'', externalUrl:'', publishError:'', dueDate:''};
  if(d.assigneeId) d.dueDate=defaultDue(d);
  saveDest(d); if(d.assigneeId) notifyAssigned(d.id); return d;
}
function newCampaign(){
  const start=ymd(addDays(new Date(),21));
  const c={id:uid(), title:'New campaign', date:start, endDate:start, time:'', endTime:'', adStart:todayStr(), adEnd:start, location:'', description:'', ministry:'', link:'', color:PALETTE[Object.keys(S.campaigns).length % PALETTE.length], coverPath:'', files:[]};
  saveCampaign(c); return c;
}
function confirmBox(title, body, fn, yes){ V.modal={type:'confirm', title, body, fn, yes}; render(true); }
async function copyText(text){ try{ await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }catch(e){ toast('Copy was blocked. Select the text and press Ctrl+C (⌘C on Mac).'); } }
function pathInUse(path){ return Object.values(S.dests).some(d=>(d.imagePaths||[]).includes(path)) || Object.values(S.campaigns).some(c=>c.coverPath===path || (c.files||[]).some(f=>f.path===path)); }
async function deleteFileIfUnused(path){ if(path && !pathInUse(path)) await sb.storage.from('files').remove([path]).catch(()=>{}); }

const A = {
  'pick-icon'(el){ V.modal={type:'icon-picker', channelId:el.dataset.id}; render(true); setTimeout(()=>{ const q=document.getElementById('icon-q'); if(q) q.focus(); },30); },
  'set-icon'(el){ const ch=settings().channels.find(c=>c.id===V.modal.channelId); if(!ch) return; ch.icon=el.dataset.icon; saveSettings(); V.modal=null; render(true); toast(`Icon updated for ${ch.name}`); },
  'icon-reset'(){ const ch=settings().channels.find(c=>c.id===V.modal.channelId); if(!ch) return; delete ch.icon; saveSettings(); V.modal=null; render(true); },
  'quick-delete'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const copy=clone(d); const name=channelById(d.channelId).name;
    if(V.openDest===d.id) V.openDest=null; removeDest(d.id); render(true);
    toast(`Removed ${name}`, ()=>{ S.dests[copy.id]=copy; writeKey('d:'+copy.id); render(true); toast(`${name} restored`); }); },
  'toast-undo'(){ const fn=toastUndo; toastUndo=null; document.getElementById('toast').innerHTML=''; if(fn) fn(); },
  'req-filter'(el){ V.reqFilter=el.dataset.f; V.requestId=null; if(location.hash!=='#requests') history.replaceState(null,'','#requests'); render(true); },
  'open-request'(el){ V.requestId=el.dataset.id; history.replaceState(null,'','#request-'+el.dataset.id); render(true); },
  'copy-form-link'(){ copyText(location.origin+'/request'); },
  'req-approve'(el){ V.modal={type:'req-approve', id:el.dataset.id, createCampaign:true, notify:true, note:''}; render(true); },
  'req-decline'(el){ V.modal={type:'req-decline', id:el.dataset.id, notify:true, note:''}; render(true); },
  'req-approve-go'(){ const m=V.modal; m.note=(document.getElementById('ra-note')||{}).value||''; m.createCampaign=!!(document.getElementById('ra-camp')||{}).checked; m.notify=!!(document.getElementById('ra-notify')||{}).checked; approveRequest(m); },
  'req-decline-go'(){ const m=V.modal; m.note=(document.getElementById('ra-note')||{}).value||''; m.notify=!!(document.getElementById('ra-notify')||{}).checked; declineRequest(m); },
  'req-delete'(el){ const r=S.requests[el.dataset.id]; confirmBox('Delete this request?', `"${r.title}" from ${r.requester_name} will be removed. Its files stay in storage if a campaign uses them.`, async ()=>{
      const { error } = await sb.from('requests').delete().eq('id',r.id); if(error){ toast(error.message); return; } delete S.requests[r.id]; V.requestId=null; render(true); }); },
  'auth-mode'(el){ V.authMode=el.dataset.mode; V.authErr=''; V.authMsg=''; render(true); },
  'sign-out'(){ flushAll(); sb.auth.signOut(); },
  'change-pw'(){ V.modal={type:'change-pw'}; render(true); },
  'new-campaign'(){ const c=newCampaign(); V.modal=null; location.hash='campaign-'+c.id; setTimeout(()=>{ const el=document.getElementById('c-title'); if(el){ el.focus(); el.select(); } },60); },
  'open-campaign'(el){ V.openDest=null; location.hash='campaign-'+el.dataset.id; },
  'open-dest'(el){ V.openDest=el.dataset.id; render(true); },
  'close-drawer'(){ V.openDest=null; render(true); },
  'cal-prev'(){ V.anchor = V.calMode==='week'? addDays(V.anchor,-7) : new Date(V.anchor.getFullYear(), V.anchor.getMonth()-1, 1); render(true); },
  'cal-next'(){ V.anchor = V.calMode==='week'? addDays(V.anchor,7) : new Date(V.anchor.getFullYear(), V.anchor.getMonth()+1, 1); render(true); },
  'cal-today'(){ V.anchor=new Date(); render(true); },
  'cal-mode'(el){ V.calMode=el.dataset.mode; ls('cc.calMode',V.calMode); render(true); },
  'cal-goweek'(el){ V.anchor=parseYmd(el.dataset.date); V.calMode='week'; render(true); },
  'cell-add'(el){ V.modal={type:'pick-campaign', channelId:el.dataset.chan, date:el.dataset.date}; render(true); },
  'pick-campaign'(el){ const m=V.modal; const d=newDest(el.dataset.id, m.channelId, m.date, defaultTime(m.channelId), ''); V.modal=null; V.openDest=d.id; render(true); },
  'ad-add'(el){ V.modal={type:'pick-channel', campaignId:el.dataset.id, date:el.dataset.date}; render(true); },
  'pick-channel'(el){ const m=V.modal; const d=newDest(m.campaignId, el.dataset.id, m.date, defaultTime(el.dataset.id), ''); V.modal=null; V.openDest=d.id; render(true); },
  'add-dests'(el){ openAddDests(el.dataset.id); },
  'modal-close'(){ V.modal=null; render(true); },
  'modal-bg'(el,e){ if(e.target===el){ V.modal=null; render(true); } },
  'confirm-yes'(){ const fn=V.modal&&V.modal.fn; V.modal=null; if(fn) fn(); render(true); },
  'modal-save-dests'(){ const m=V.modal; let n=0; for(const [cid,r] of Object.entries(m.rows)){ if(r.on){ newDest(m.campaignId,cid,r.date,r.time,r.assigneeId); n++; } } V.modal=null; render(true); toast(`Added ${n} destination${n===1?'':'s'}`); },
  'delete-campaign'(el){ const c=S.campaigns[el.dataset.id]; confirmBox('Delete this campaign?', `"${c.title}" and its ${destsOf(c.id).length} destinations will be removed for everyone.`, ()=>{ removeCampaign(c.id); location.hash='campaigns'; }); },
  'delete-dest'(el){ const d=S.dests[el.dataset.id]; confirmBox('Delete this destination?', `${channelById(d.channelId).name} for "${campOf(d).title}" will be removed for everyone.`, ()=>{ V.openDest=null; removeDest(d.id); }); },
  'set-status'(el){ const d=S.dests[el.dataset.id]; if(!d) return; d.status=el.dataset.status; saveDest(d); render(true); },
  'approve-all'(el){ for(const d of destsOf(el.dataset.id)) if(d.status==='review'){ d.status='approved'; saveDest(d); } render(true); },
  'set-color'(el){ const c=S.campaigns[el.dataset.id]; c.color=el.dataset.color; saveCampaign(c); render(true); },
  'remove-cover'(el){ const c=S.campaigns[el.dataset.id]; const p=c.coverPath; c.coverPath=''; saveCampaign(c); render(true); deleteFileIfUnused(p); },
  'remove-photo'(el){ const d=S.dests[el.dataset.id]; const p=el.dataset.img; d.imagePaths=(d.imagePaths||[]).filter(i=>i!==p); saveDest(d); render(true); deleteFileIfUnused(p); },
  'remove-file'(el){ const c=S.campaigns[el.dataset.id]; const f=(c.files||[]).find(x=>x.path===el.dataset.file); if(!f) return;
    confirmBox(`Remove ${f.name}?`, 'It will be removed from this campaign\'s files.', ()=>{ c.files=(c.files||[]).filter(x=>x.path!==f.path); saveCampaign(c); deleteFileIfUnused(f.path); }, 'Remove'); },
  async 'attach-file'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const path=el.dataset.file;
    if(/\.jpe?g$/i.test(path)){ d.imagePaths=[...(d.imagePaths||[]), path]; saveDest(d); render(true); return; }
    // social posts need JPEG: make a JPEG copy for this destination
    try{ toast('Preparing photo…'); const blob=await fetch(fileUrl(path)).then(r=>r.blob()); const jpg=await toJpeg(blob); const np=`photos/${d.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from('files').upload(np, jpg, {contentType:'image/jpeg'}); if(error) throw error;
      d.imagePaths=[...(d.imagePaths||[]), np]; saveDest(d); render(true); toast('Photo added'); }catch(e){ toast('Could not add that photo: '+(e.message||'')); } },
  'copy-text'(el){ const d=S.dests[el.dataset.id]; const k=kindOf(channelById(d.channelId)); const t=(k.head&&d.headline? d.headline+'\n\n':'')+(d.copy||''); if(!t.trim()){ toast('Nothing to copy yet'); return; } copyText(k.social?(d.copy||''):t); },
  'ai-toggle'(el){ const a=aiState(el.dataset.id); a.open=!a.open; render(true); },
  'ai-generate'(el){ generate(el.dataset.id); },
  'ai-use'(el){ const d=S.dests[el.dataset.id], a=aiState(d.id), o=a.options[+el.dataset.i]; if(!o) return; const k=kindOf(channelById(d.channelId)); d.copy=o.text; if(k.head&&o.headline) d.headline=o.headline; if(d.status==='draft') d.status='review'; saveDest(d); a.open=false; a.options=[]; render(true); toast('Copy added and marked In review'); },
  async 'post-now'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const ch=channelById(d.channelId);
    confirmBox(`Post to ${kindOf(ch).label} now?`, 'This publishes the caption and photos to the church\'s page right away.', async ()=>{
      flushAll(); V.busy=true; render(true);
      try{ await new Promise(r=>setTimeout(r,400)); const r=await api('publish-now',{id:d.id}); d.status='posted'; d.publishedAt=new Date().toISOString(); d.externalUrl=r.url||''; d.publishError=''; toast('Posted!'); }
      catch(e){ d.publishError=e.message; toast('Posting failed: '+e.message); }
      V.busy=false; render(true); }, 'Post now'); },
  async 'clear-error'(el){ const d=S.dests[el.dataset.id]; d.publishError=''; const { error } = await sb.from('destinations').update({publish_error:''}).eq('id',d.id); if(error) toast(error.message); render(true); },
  'add-channel'(){ const id=uid().slice(0,8); settings().channels.push({id, name:'New destination', kind:'other'}); saveSettings(); render(true); setTimeout(()=>{ const el=document.getElementById('ch-name-'+id); if(el){el.focus(); el.select();} },30); },
  'remove-channel'(el){ const ch=channelById(el.dataset.id); const n=Object.values(S.dests).filter(d=>d.channelId===ch.id).length;
    confirmBox(`Remove ${ch.name}?`, n?`${n} scheduled item${n===1?'':'s'} use this destination. They stay on their campaigns but show as "Removed destination".`:'It will no longer appear on the calendar.', ()=>{ const s=settings(); s.channels=s.channels.filter(c=>c.id!==ch.id); saveSettings(); }, 'Remove'); },
  'my-color'(el){ const m=me(); if(!m) return; m.color=el.dataset.color; writeKey('p:'+m.id); render(true); },
  'remove-member'(el){ const t=memberById(el.dataset.id); confirmBox(`Remove ${t.name}?`, 'They will no longer be able to sign in. Anything assigned to them becomes unassigned.', async ()=>{
      try{ await api('team',{action:'remove', id:t.id}); delete S.team[t.id]; for(const d of Object.values(S.dests)) if(d.assigneeId===t.id) d.assigneeId=''; toast(`${t.name} removed`); }catch(e){ toast(e.message); } render(true); }, 'Remove'); },
  'social-disconnect'(){ confirmBox('Disconnect Facebook?', 'Automatic posting stops until an admin connects it again.', async ()=>{ try{ S.social=await api('social',{action:'disconnect'}); toast('Disconnected'); }catch(e){ toast(e.message); } render(true); }, 'Disconnect'); }
};
document.addEventListener('click', e=>{
  const el=e.target.closest('[data-action]'); if(!el) return; const fn=A[el.dataset.action]; if(!fn) return;
  if(el.tagName==='A') e.preventDefault(); if(el.disabled) return; fn(el,e);
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ if(V.modal){ V.modal=null; render(true); } else if(V.openDest){ V.openDest=null; render(true); } }
  if((e.key==='Enter'||e.key===' ') && e.target.matches && e.target.matches('[role=button][data-action]')){ e.preventDefault(); e.target.click(); }
});

/* ---------- forms ---------- */
document.addEventListener('submit', async e=>{
  const f=e.target; e.preventDefault(); const val=id=>{ const el=document.getElementById(id); return el?el.value:''; };
  if(f.dataset.form==='login'){ V.lastEmail=val('a-email').trim(); const pw=val('a-pw'); V.busy=true; V.authErr=''; render(true);
    const { error } = await sb.auth.signInWithPassword({ email:V.lastEmail, password:pw });
    V.busy=false; if(error){ V.authErr = /invalid/i.test(error.message)?'That email and password don\'t match. Try again or reset your password.':error.message; render(true); } return; }
  if(f.dataset.form==='forgot'){ V.lastEmail=val('a-email').trim(); V.busy=true; render(true);
    const { error } = await sb.auth.resetPasswordForEmail(V.lastEmail, { redirectTo: location.origin+'/' });
    V.busy=false; if(error) V.authErr=error.message; else { V.authErr=''; V.authMsg='If that email belongs to a staff account, a reset link is on its way.'; V.authMode='login'; } render(true); return; }
  if(f.dataset.form==='setpw'){ const p1=val('a-pw'), p2=val('a-pw2'), name=val('a-name').trim(); if(p1!==p2){ V.authErr='The passwords don\'t match.'; render(true); return; }
    V.busy=true; render(true);
    const { error } = await sb.auth.updateUser({ password:p1, ...(name?{data:{full_name:name}}:{}) });
    if(!error && name) await sb.from('profiles').update({full_name:name}).eq('id',session.user.id);
    V.busy=false; if(error){ V.authErr=error.message; render(true); return; } V.authErr=''; V.screen='boot'; startApp(); toast('Password saved'); return; }
  if(f.dataset.form==='change-pw'){ const p1=val('cp-1'), p2=val('cp-2'); if(p1!==p2){ toast('The passwords don\'t match.'); return; }
    const { error } = await sb.auth.updateUser({ password:p1 }); if(error){ toast(error.message); return; } V.modal=null; render(true); toast('Password changed'); return; }
  if(f.dataset.form==='invite'){ const email=val('inv-email').trim(), name=val('inv-name').trim(); V.busy=true; render(true);
    try{ await api('team',{action:'invite', email, name}); toast(`Invite sent to ${email}`); }catch(err){ toast(err.message); } V.busy=false; render(true); return; }
  if(f.dataset.form==='social'){ const pageId=val('so-page').trim(), token=val('so-token').trim(); V.busy=true; render(true);
    try{ S.social=await api('social',{action:'connect', pageId, token}); toast('Facebook connected'); }catch(err){ toast(err.message); } V.busy=false; render(true); return; }
  if(f.dataset.form==='modal-new-channel'){ const name=val('m-newname').trim(), kind=val('m-newkind'); if(!name){ toast('Type a name for the new destination'); return; }
    const id=uid().slice(0,8); settings().channels.push({id,name,kind}); saveSettings(); const m=V.modal; const any=Object.values(m.rows)[0];
    m.rows[id]={on:true, date:any?any.date:todayStr(), time:defaultTime(id), assigneeId:''}; render(true); }
});

/* ---------- field binding ---------- */
function onField(el, committed){
  const [kind, field]=el.dataset.bind.split(':'); const id=el.dataset.id; const val = el.type==='checkbox' ? el.checked : el.value;
  if(kind==='dest'){ const d=S.dests[id]; if(!d) return; const before=d[field]; d[field]=val;
    if(field==='assigneeId' && val && val!==before && !d.dueDate) d.dueDate=defaultDue(d);
    saveDest(d, committed?0:700);
    if(field==='assigneeId' && val && val!==before) notifyAssigned(d.id);
    if(field==='copy'){ const k=kindOf(channelById(d.channelId)); const cnt=document.getElementById('cnt-'+id); if(cnt){ cnt.textContent=`${val.length}${k.limit?' / '+k.limit:''} characters`; cnt.classList.toggle('over', !!(k.limit&&val.length>k.limit)); } }
    if(committed && !['copy','notes','headline'].includes(field)) render(true); }
  else if(kind==='camp'){ const c=S.campaigns[id]; if(!c) return; const prev=c[field]; c[field]=val;
    if(field==='date' && val){ if(!c.endDate||c.endDate<val||c.endDate===prev) c.endDate=val; if(!c.adEnd||c.adEnd===prev) c.adEnd=c.endDate; }
    if(field==='endDate' && val && c.adEnd===prev) c.adEnd=val;
    saveCampaign(c, committed?0:700); if(committed && /date|time|adStart|adEnd/i.test(field)) render(true); }
  else if(kind==='set'){ settings()[field]=val; saveSettings(700); }
  else if(kind==='chan'){ const ch=settings().channels.find(c=>c.id===id); if(!ch) return; ch[field]=val; saveSettings(committed?0:700); if(committed) render(true); }
  else if(kind==='me'){ const m=me(); if(!m) return; m[field]=val; scheduleSave('p:'+m.id,700); }
}
document.addEventListener('input', e=>{
  const el=e.target;
  if(el.dataset.bind){ const t=el.type; const committed = el.tagName==='SELECT'||t==='date'||t==='time'||t==='checkbox'; if(!committed) onField(el,false); return; }
  if(el.dataset.ai){ aiState(el.dataset.id)[el.dataset.ai]=el.value; return; }
  if(el.id==='icon-q') iconSearch(el.value);
});
document.addEventListener('change', async e=>{
  const el=e.target;
  if(el.matches('input[type=file][data-upload]')){ await handleUpload(el); return; }
  if(el.dataset.bind){ const t=el.type; if(el.tagName==='SELECT'||t==='date'||t==='time'||t==='checkbox') onField(el,true); else if(el.dataset.bind.startsWith('chan:')) onField(el,true); else flushAll(); return; }
  if(el.dataset.ui){ V[el.dataset.ui]=el.value; render(true); return; }
  if(el.dataset.ai){ aiState(el.dataset.id)[el.dataset.ai]=el.value; return; }
  if(el.dataset.role){ const { error } = await sb.rpc('set_member_role',{member:el.dataset.role, new_role:el.value}); if(error){ toast(error.message); } else { S.team[el.dataset.role].role=el.value; toast('Role updated'); } render(true); return; }
  if(el.dataset.mrow){ const [cid,f]=el.dataset.mrow.split(':'); const r=V.modal&&V.modal.rows[cid]; if(!r) return; r[f]= el.type==='checkbox'?el.checked:el.value; if(f!=='on'&&!r.on) r.on=true; render(true); }
});

/* ---------- uploads ---------- */
async function toJpeg(blob, max=2048){
  const url=URL.createObjectURL(blob);
  try{ const img=new Image(); img.src=url; await img.decode();
    const scale=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight)); const w=Math.round(img.naturalWidth*scale), h=Math.round(img.naturalHeight*scale);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h);
    return await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('Could not convert image')),'image/jpeg',0.9));
  } finally { URL.revokeObjectURL(url); }
}
async function handleUpload(el){
  const [kind,id]=el.dataset.upload.split(':'); const files=[...el.files]; el.value=''; let n=0;
  for(const f of files){
    if(kind!=='file' && !f.type.startsWith('image/')){ toast(`${f.name} isn't an image`); continue; }
    if(f.size>50*1024*1024){ toast(`${f.name} is over 50 MB`); continue; }
    toast(`Uploading ${f.name}…`);
    try{
      let body=f, type=f.type||'application/octet-stream', path;
      if(kind==='dest'){ body=await toJpeg(f); type='image/jpeg'; path=`photos/${id}/${uid()}.jpg`; }
      else if(kind==='cover'){ body=await toJpeg(f); type='image/jpeg'; path=`campaigns/${id}/cover-${uid().slice(0,8)}.jpg`; }
      else path=`campaigns/${id}/${uid().slice(0,8)}-${safeName(f.name)}`;
      const { error } = await sb.storage.from('files').upload(path, body, { contentType:type, upsert:false });
      if(error) throw error;
      if(kind==='dest'){ const d=S.dests[id]; if(!d) continue; d.imagePaths=[...(d.imagePaths||[]), path]; saveDest(d); }
      else if(kind==='file'){ const c=S.campaigns[id]; if(!c) continue; c.files=[...(c.files||[]), {path, name:f.name, type, size:f.size, at:Date.now()}]; saveCampaign(c); }
      else { const c=S.campaigns[id]; if(!c) continue; const old=c.coverPath; c.coverPath=path; saveCampaign(c); deleteFileIfUnused(old); }
      n++; render(true);
    }catch(err){ toast('Upload failed: '+((err&&err.message)||'try again')); }
  }
  if(n) toast(`Uploaded ${n} file${n===1?'':'s'}`);
}

/* ---------- AI ---------- */
async function generate(id){
  const d=S.dests[id]; if(!d) return; const a=aiState(id); if(a.loading) return;
  const c=campOf(d), ch=channelById(d.channelId), k=kindOf(ch), s=settings();
  const gap=(d.date&&c.date)?daysBetween(d.date,c.date):null;
  const timing = gap===null ? 'Unknown timing; avoid relative words like "tomorrow".' : gap===0 ? 'This goes out on the day of the event.'
    : gap>0 ? `This goes out ${gap} day${gap===1?'':'s'} before the event (message date ${fmtD(d.date,{weekday:'long',month:'long',day:'numeric'})}). Relative words like "this Sunday" are fine only if correct.`
    : `This goes out ${-gap} day${gap===-1?'':'s'} after the event starts, so write a recap or thank-you unless the event is still going.`;
  const tones={voice:'Match the church voice exactly.', joyful:'Joyful and vibrant.', reverent:'Reverent, reflective and calm.', urgent:'Last-call urgency, still warm.', playful:'Playful and fun for kids and families.'};
  const prompt=`You are the communications writer for First Baptist Sulphur Springs (FBSS) in Sulphur Springs, Texas (Hopkins County).
Mission: to reach Hopkins County with the Gospel and equip the church for ministry. Tagline: For Hopkins County. For the Gospel.
Church voice: ${s.voice}

Write copy for ONE destination about this campaign.
Campaign: ${c.title}
Event date(s) and time: ${c.date? fmtRange(c,true) : 'not set'}
Location: ${c.location||'not set'}
Ministry: ${c.ministry||'not set'}
Sign-up or info link: ${c.link||'none'}
Details: ${c.description||'(no description given)'}

Destination: ${ch.name} (${k.label})
Format guidance: ${GUIDE[ch.kind]||GUIDE.other}
Timing: ${timing}
Tone: ${tones[a.tone]||tones.voice}
Length: ${a.length} for this format.
Emoji: ${a.emoji==='none'?'Do not use emoji.':a.emoji==='more'?'Use several emoji where natural.':'At most one or two emoji.'}
${k.social?(a.hashtags==='on'?'Hashtags: add 2-4 relevant hashtags on the last line.':'Hashtags: none.'):''}
${k.limit?`Hard limit: the text must be under ${k.limit} characters.`:''}
${a.extra?'Extra instructions: '+a.extra:''}
${d.copy?'Current draft to improve on:\n'+d.copy:''}

Rules: do not invent facts (speakers, prices, deadlines, links) that are not in the details. Leave out anything marked "not set". Plain text, no markdown.
Return ONLY a JSON object, no other text: {"options":[{"headline":"...","text":"..."},{"headline":"...","text":"..."}]}
Give two clearly different options. "headline" is the ${k.head||'headline'}${k.head?'':' and must be an empty string for this destination'}. Use \\n for line breaks inside "text".`;
  a.loading=true; a.error=''; render(true);
  try{
    const r=await api('ai-copy',{prompt}); const m=(r.text||'').match(/\{[\s\S]*\}/); const parsed=m?JSON.parse(m[0]):null;
    const opts=parsed&&Array.isArray(parsed.options)?parsed.options.filter(o=>o&&typeof o.text==='string').slice(0,2).map(o=>({headline:String(o.headline||''), text:o.text.trim()})):[];
    if(!opts.length) throw new Error('The AI response came back in an unexpected format. Click Regenerate.');
    a.options=opts;
  }catch(err){ a.error=err.message||'Could not generate copy. Try again.'; }
  a.loading=false; render(true);
}

/* ---------- drag & drop ---------- */
let dragData=null;
function clearDrop(){ document.querySelectorAll('.dropover').forEach(x=>x.classList.remove('dropover')); }
document.addEventListener('dragstart', e=>{
  const el=e.target.closest && e.target.closest('[data-drag-dest],[data-drag-chan]'); if(!el) return;
  dragData = el.dataset.dragDest ? {dest:el.dataset.dragDest} : {chan:el.dataset.dragChan, camp:el.dataset.camp};
  try{ e.dataTransfer.effectAllowed = dragData.dest?'move':'copy'; e.dataTransfer.setData('text/plain', dragData.dest||dragData.chan); }catch(err){}
  V.dragging=true; el.classList.add('dragging');
});
document.addEventListener('dragend', e=>{ const el=e.target.closest && e.target.closest('.dragging'); if(el) el.classList.remove('dragging'); V.dragging=false; dragData=null; clearDrop(); if(pendingRender) render(); });
document.addEventListener('dragover', e=>{ const t=e.target.closest && e.target.closest('[data-drop]'); if(!t||!dragData) return; if(dragData.chan && t.dataset.dropChan) return;
  e.preventDefault(); try{ e.dataTransfer.dropEffect=dragData.dest?'move':'copy'; }catch(err){} if(!t.classList.contains('dropover')){ clearDrop(); t.classList.add('dropover'); } });
document.addEventListener('dragleave', e=>{ const t=e.target.closest && e.target.closest('[data-drop]'); if(t && !t.contains(e.relatedTarget)) t.classList.remove('dropover'); });
document.addEventListener('drop', e=>{
  const t=e.target.closest && e.target.closest('[data-drop]'); if(!t||!dragData) return; e.preventDefault();
  const date=t.dataset.drop, chan=t.dataset.dropChan, dd=dragData; dragData=null; V.dragging=false; clearDrop();
  if(dd.dest){ const d=S.dests[dd.dest]; if(!d) return render(true); if(d.date===date&&(!chan||chan===d.channelId)) return render(true);
    d.date=date; if(chan) d.channelId=chan; saveDest(d); render(true); toast(`Moved ${channelById(d.channelId).name} to ${fmtD(date)}`); }
  else if(dd.chan && dd.camp){ newDest(dd.camp, dd.chan, date, defaultTime(dd.chan), ''); render(true); toast(`Added ${channelById(dd.chan).name} on ${fmtD(date)}`); }
});

/* ---------- toast ---------- */
let toastT, toastUndo=null;
function toast(msg, undo){ const t=document.getElementById('toast'); toastUndo=undo||null;
  t.innerHTML=`<div class="toast" role="status">${esc(msg)}${undo?'<button class="undo" data-action="toast-undo">Undo</button>':''}</div>`; clearTimeout(toastT); toastT=setTimeout(()=>{ t.innerHTML=''; toastUndo=null; }, undo?7000:3600); }

boot();
