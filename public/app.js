// FBSS Communication Calendar — browser app.
// Data lives in Supabase (database + file storage + logins). Server functions live under /api/*.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import * as GFX from '/graphics.js';

/* ---------- constants ---------- */
const KINDS = {
  social:{label:'Social (Facebook + Instagram)', color:'#5E5A7E', abbr:'SO', icon:'lucide:share-2', limit:2200, social:true, both:true},
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
// Word ranges for the Length choice (Short / Medium / Long), by kind of destination.
// Slides and text messages have fixed limits, so Length doesn't apply to them.
const WORDS = {
  social:[[15,35],[40,70],[80,130]], facebook:[[20,40],[50,90],[100,150]], instagram:[[15,35],[40,70],[80,130]],
  email:[[30,50],[60,100],[110,160]], bulletin:[[20,35],[35,60],[60,90]], announcement:[[35,55],[70,100],[110,140]],
  web:[[40,60],[70,110],[120,180]], other:[[20,40],[45,80],[90,130]],
};
// Words in a post, not counting hashtags or emoji on their own.
const wordCount = t => String(t||'').split(/\s+/).filter(w=>/[A-Za-z0-9]/.test(w) && !w.startsWith('#')).length;
const lenRange = (kind, len) => { const w=WORDS[kind]; return w ? w[{short:0,medium:1,long:2}[len]??1] : null; };
const GUIDE = {
  social:'One caption posted to BOTH Facebook and Instagram. Strong first line, short lines with line breaks, details (date, time, place) easy to spot. Links are not clickable on Instagram, so if there is a sign-up link say where to find it instead of pasting a long URL.',
  facebook:'Facebook post. Conversational, short paragraphs, clear details, ends with an invitation or call to action.',
  instagram:'Instagram caption. Strong first line, short lines with line breaks, details (date, time, place) easy to spot.',
  email:'Section in the church weekly email newsletter (the Weekly Update). Headline is the email subject line (under 50 characters). Body warm, with the key details and a clear next step.',
  slides:'Announcement slide shown on screens before and after service. Headline under 6 words. Body is one or two very short lines with date, time and place only (under 18 words total).',
  bulletin:'Printed bulletin announcement. Headline plus a short paragraph, third person, details at the end.',
  announcement:'Script a staff member reads aloud from the stage before service. Natural spoken rhythm, repeat the date once.',
  text:'Mass text message. Under 160 characters total, friendly, includes date and time and one call to action. No hashtags.',
  web:'Website event listing. Headline is the page title. Body scannable, details first.',
  other:'General church announcement.'
};
// Social destinations (Facebook, Instagram, Social) go through approval, because approved posts go out automatically.
// Every other destination is simply a task: Scheduled until someone marks it Done.
const STATUSES = [['draft','Draft'],['scheduled','Scheduled'],['posted','Posted']];   // social posts: Scheduled ones post automatically
const TASK_STATUSES = [['scheduled','Scheduled'],['posted','Done']];
const PALETTE = ['#91412D','#B47E3D','#6B6F57','#5F7478','#414A55','#7A5232','#A35A43','#4F6B4A'];
const DEFAULT_CHANNELS = [
  {id:'social',name:'Social (Facebook + Instagram)',kind:'social'},
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
const SUGGESTED_ICONS = ['lucide:share-2','simple-icons:meta','simple-icons:facebook','simple-icons:instagram','simple-icons:youtube','simple-icons:tiktok','simple-icons:x','simple-icons:threads','simple-icons:spotify','simple-icons:vimeo',
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
  if(!c.date) return c.adStart&&c.adEnd ? `Advertised ${fmtD(c.adStart,{month:'short',day:'numeric'})} – ${fmtD(c.adEnd,{month:'short',day:'numeric'})}` : 'No event date'; const t1=fmtT(c.time), t2=fmtT(c.endTime);
  if(!c.endDate || c.endDate<=c.date) return fmtD(c.date,o)+(t1?' · '+t1+(t2?' – '+t2:''):'');
  return `${fmtD(c.date,o)}${t1?', '+t1:''} – ${fmtD(c.endDate,o)}${t2?', '+t2:''}`; }
const fileKind = f => (f.type||'').startsWith('image/') ? 'image' : (f.type==='application/pdf' ? 'PDF' : (f.type||'').startsWith('video/') ? 'VIDEO' : ((f.name||'').split('.').pop()||'FILE').toUpperCase().slice(0,4));
const isVideo = p => /\.(mp4|mov|m4v)$/i.test(p||'');
const isRemote = p => /^https?:\/\//i.test(p||'');
const BIG_VIDEO_MB = 100; // Cloudinary's limit for one video on its free plan
const maxMb = () => (CFG && CFG.maxUploadMb) || 50;
// A small preview for a photo or a video path.
const mediaTag = (path, cls='') => isVideo(path) ? `<video class="${cls}" src="${esc(fileUrl(path))}#t=0.5" muted playsinline preload="metadata"></video>` : `<img class="${cls}" src="${esc(fileUrl(path))}" alt="">`;
const safeName = n => String(n||'file').normalize('NFKD').replace(/[^\w.\-]+/g,'-').replace(/-+/g,'-').slice(-80);

/* ---------- state ---------- */
let sb=null, CFG=null, session=null, rtChannel=null;
const S = { settings:{channels:clone(DEFAULT_CHANNELS), voice:DEFAULT_VOICE, handle:'First Baptist Sulphur Springs'}, campaigns:{}, dests:{}, team:{}, requests:{}, gjobs:{}, comments:{}, loaded:false, social:null };
const V = { screen:'boot', view:'calendar', campaignId:null, calMode: ls('cc.calMode')||(window.matchMedia('(max-width: 760px)').matches?'list':'week'), anchor:new Date(), fChan:'', fPerson:'', openDest:null, modal:null, ai:{}, workPerson:'', reqFilter:'new', requestId:null, pendingDest:null, authMsg:'', authErr:'', authMode:'login', busy:false, dragging:false };
const settings = () => S.settings;
const me = () => session && S.team[session.user.id];
const isAdmin = () => !!(me() && me().role==='admin');
const channelById = id => settings().channels.find(c=>c.id===id) || {id, name:'Removed destination', kind:'other'};
const kindOf = ch => KINDS[ch.kind] || KINDS.other;
const memberById = id => id ? S.team[id] : null;
const teamList = () => Object.values(S.team).sort((a,b)=>a.name.localeCompare(b.name));
const destsOf = cid => Object.values(S.dests).filter(d=>d.campaignId===cid).sort(byWhen);
function byWhen(a,b){ return (a.date||'9999').localeCompare(b.date||'9999') || (a.time||'').localeCompare(b.time||''); }
const ONEOFF_COLOR = '#414A55';
// A one-off post has no campaign: its own title and details stand in for the campaign's.
const campOf = d => !d.campaignId ? {title:d.title||'One-off post', color:ONEOFF_COLOR, description:d.details||'', oneOff:true, files:[]} : (S.campaigns[d.campaignId] || {title:'(Campaign removed)', color:'#7D7468'});
const requestFor = cid => cid && Object.values(S.requests).find(r=>r.campaign_id===cid && r.status==='new');
const isPending = cid => { const c=cid&&S.campaigns[cid]; return !!c && (c._draft || c.status==='pending'); };
const isDeclined = cid => { const c=cid&&S.campaigns[cid]; return !!c && c.status==='declined'; };
const hasDrafts = () => Object.values(S.campaigns).some(c=>c._draft);
window.addEventListener('beforeunload', e=>{ if(hasDrafts()){ e.preventDefault(); e.returnValue=''; } });
const fileUrl = path => !path ? '' : isRemote(path) ? path : sb.storage.from('files').getPublicUrl(path).data.publicUrl;

/* ---------- row mapping ---------- */
const t5 = t => t ? String(t).slice(0,5) : '';
const rowToCamp = r => ({ id:r.id, title:r.title||'', date:r.start_date||'', time:t5(r.start_time), endDate:r.end_date||'', endTime:t5(r.end_time), adStart:r.ad_start||'', adEnd:r.ad_end||'',
  location:r.location||'', description:r.description||'', ministry:r.ministry||'', link:r.link||'', color:r.color||PALETTE[0], coverPath:r.cover_path||'', files:Array.isArray(r.files)?r.files:[], status:r.status||'approved', createdBy:r.created_by||'', reviewedBy:r.reviewed_by||'', reviewNote:r.review_note||'' });
const campToRow = c => ({ id:c.id, title:c.title||'Untitled campaign', start_date:c.date||null, start_time:c.time||null, end_date:c.endDate||null, end_time:c.endTime||null, ad_start:c.adStart||null, ad_end:c.adEnd||null,
  location:c.location||'', description:c.description||'', ministry:c.ministry||'', link:c.link||'', color:c.color||PALETTE[0], cover_path:c.coverPath||'', files:c.files||[], status:c.status||'approved' });
const rowToDest = r => ({ id:r.id, campaignId:r.campaign_id||'', title:r.title||'', details:r.details||'', channelId:r.channel_id, date:r.publish_date||'', time:t5(r.publish_time), assigneeId:r.assignee_id||'', status:r.status||'draft',
  headline:r.headline||'', copy:r.copy||'', notes:r.notes||'', imagePaths:Array.isArray(r.image_paths)?r.image_paths:[], autoPublish:!!r.auto_publish,
  publishedAt:r.published_at||'', externalUrl:r.external_url||'', publishError:r.publish_error||'', publishedParts:r.published_parts||{}, publishPending:!!r.publish_pending });
const destToRow = d => ({ id:d.id, campaign_id:d.campaignId||null, title:d.title||'', details:d.details||'', channel_id:d.channelId, publish_date:d.date||null, publish_time:d.time||null, assignee_id:d.assigneeId||null, status:d.status||'draft',
  headline:d.headline||'', copy:d.copy||'', notes:d.notes||'', image_paths:d.imagePaths||[], auto_publish:!!d.autoPublish, due_date:d.date||null });  // due date is always the scheduled date
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
const saveCampaign = (c,delay) => { S.campaigns[c.id]=c; if(c._draft) return; delay ? scheduleSave('c:'+c.id,delay) : writeKey('c:'+c.id); };
const saveDest = (d,delay) => { S.dests[d.id]=d; const c=d.campaignId&&S.campaigns[d.campaignId]; if(c&&c._draft) return; delay ? scheduleSave('d:'+d.id,delay) : writeKey('d:'+d.id); };
const saveSettings = delay => delay ? scheduleSave('s:1',delay) : writeKey('s:1');
const removeDest = id => { const d=S.dests[id]; const c=d&&d.campaignId&&S.campaigns[d.campaignId]; delete S.dests[id]; if(!(c&&c._draft)) writeKey('d:'+id); };
const removeCampaign = id => { for(const d of destsOf(id)) delete S.dests[d.id]; delete S.campaigns[id]; writeKey('c:'+id); };

// Assignment emails go out one per person per campaign. Single assignment changes wait a few seconds
// so several made together (e.g. assigning a whole campaign) arrive as one email.
const notifyQueue=new Set(); let notifyTimer=null;
function notifyAssigned(id){ notifyQueue.add(id); clearTimeout(notifyTimer); notifyTimer=setTimeout(flushAssignedEmails, 6000); }
async function flushAssignedEmails(){
  const ids=[...notifyQueue]; notifyQueue.clear(); if(!ids.length) return;
  await waitForSaves();
  try{ const r=await api('notify-assigned',{ids});
    if(r.emails){ const names=[...new Set(ids.map(id=>S.dests[id]).filter(d=>d&&d.assigneeId).map(d=>(memberById(d.assigneeId)||{}).name).filter(Boolean))];
      toast(`Emailed ${names.length===1?names[0]:names.length?names.length+' people':'them'} about ${r.pieces===1?'the assignment':r.pieces+' assignments'}`); } }
  catch(e){ toast('Assignments saved, but the email failed: '+e.message); }
}
window.addEventListener('pagehide', ()=>{ if(notifyQueue.size) flushAssignedEmails(); });
// Assignment emails for a whole campaign at once (when it's approved or created by an admin). Returns how many emails went out.
async function notifyCampaignAssignments(cid){
  await waitForSaves();
  try{ const r=await api('notify-assigned',{campaignId:cid}); return r.emails||0; }catch(e){ return 0; }
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
  const drafts=Object.values(S.campaigns).filter(x=>x._draft); const draftDests=Object.values(S.dests).filter(x=>drafts.some(c=>c.id===x.campaignId));
  S.campaigns = Object.fromEntries((c.data||[]).map(r=>[r.id,rowToCamp(r)]));
  S.dests = Object.fromEntries((d.data||[]).map(r=>[r.id,rowToDest(r)]));
  for(const x of drafts) S.campaigns[x.id]=x; for(const x of draftDests) S.dests[x.id]=x;
  S.team = Object.fromEntries((p.data||[]).map(r=>[r.id,rowToMember(r)]));
  applySettings(s.data && s.data.data);
  S.loaded=true;
  if(V.pendingDest){ const pd=S.dests[V.pendingDest]; if(pd){ if(pd.campaignId){ V.view='campaign'; V.campaignId=pd.campaignId; } else if(pd.date) V.anchor=parseYmd(pd.date); V.openDest=pd.id; } V.pendingDest=null; }
  render();
}
const DEFAULT_BRAND_NOTES=`First Baptist Sulphur Springs brand (from our brand guide).
Feeling: warm, serene, welcoming, gospel-focused, authentic, unified, vibrant but never loud. Tagline: "For Hopkins County. For the Gospel."
Colors: Rust #91412D, Cream #EFE9DB, Moss #8C9077, Gold #B47E3D, Dusty Blue #ACBABD, Slate Blue #414A55. Deep earthy tones with softer reflective hues; cream and slate blue as grounds, rust and gold as accents.
Type: titles in Hyogo (a clean, classical display face) set in ALL CAPS with wide letter spacing; subheads in Mr Eaves XL Mod (clean, approachable sans) in all caps with wide spacing; body text in Baskerville.
Look: generous open space, thin hairline rules, clean alignment, minimal ornament. Motifs: stained-glass arches and the three-pillar / three-leaf shape (Gather, Grow, Go), used faintly as tone-on-tone line art. Warm, natural photography with soft light.
Don't: draw the church logo, use neon or harsh saturated colors, busy layouts, or grunge effects.`;
function applySettings(data){ const x = data||{}; const b=x.brand||{}; S.settings = { handle:x.handle||'First Baptist Sulphur Springs', voice:x.voice||DEFAULT_VOICE, brand:{ notes: typeof b.notes==='string'?b.notes:DEFAULT_BRAND_NOTES, assets:Array.isArray(b.assets)?b.assets:[] }, channels:Array.isArray(x.channels)&&x.channels.length?x.channels:clone(DEFAULT_CHANNELS) }; }
function subscribe(){
  rtChannel = sb.channel('fbss-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'campaigns'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id); if(dirty['c:'+id]) return;
      if(p.eventType==='DELETE') delete S.campaigns[id]; else S.campaigns[id]=rowToCamp(p.new); render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'destinations'}, p=>{ const id=(p.new&&p.new.id)||(p.old&&p.old.id);
      if(p.eventType==='DELETE'){ delete S.dests[id]; render(); return; }
      const incoming=rowToDest(p.new);
      if(dirty['d:'+id] && S.dests[id]){ const l=S.dests[id]; l.publishedAt=incoming.publishedAt; l.externalUrl=incoming.externalUrl; l.publishError=incoming.publishError; l.publishedParts=incoming.publishedParts; l.publishPending=incoming.publishPending; if(incoming.status==='posted') l.status='posted'; }
      else S.dests[id]=incoming;
      render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'app_settings'}, p=>{ if(dirty['s:1']) return; if(p.new) applySettings(p.new.data); render(); })
    .on('postgres_changes',{event:'*',schema:'public',table:'destination_comments'}, p=>{
      if(p.eventType==='INSERT'){ const l=S.comments[p.new.destination_id]; if(l && !l.some(c=>c.id===p.new.id)){ l.push(p.new); render(); } }
      if(p.eventType==='DELETE'){ for(const k in S.comments) S.comments[k]=S.comments[k].filter(c=>c.id!==p.old.id); render(); } })
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
  else if(h.startsWith('dest-')){ const id=h.slice(5); const d=S.dests[id]; if(d){ if(d.campaignId){ V.view='campaign'; V.campaignId=d.campaignId; } else { V.view='calendar'; if(d.date) V.anchor=parseYmd(d.date); } V.openDest=id; } else { V.view='calendar'; V.pendingDest=id; } }
  else if(['calendar','campaigns','my-work','settings','requests'].includes(h)) V.view=h;
  else V.view='calendar';
}
window.addEventListener('hashchange', ()=>{ if(V.screen!=='app') return; V.openDest=null; V.resetScroll=true; route(); render(true); window.scrollTo(0,0); if(V.view==='campaign'&&V.campaignId){ gfxLoaded[V.campaignId]=false; render(true); } });

/* ---------- render core ---------- */
let pendingRender=false;
function isTyping(){ const a=document.activeElement; return !!a && (a.tagName==='TEXTAREA' || a.tagName==='INPUT' || a.tagName==='SELECT'); }
document.addEventListener('focusout', ()=> setTimeout(()=>{ if(pendingRender && !isTyping()) render(); if(!isTyping() && window.scrollY && document.getElementById('app').classList.contains('shell') && window.matchMedia('(max-width: 760px)').matches) window.scrollTo(0,0); }, 60));
function render(force){
  if(V.dragging || (!force && isTyping())){ pendingRender=true; return; }
  pendingRender=false;
  const app=document.getElementById('app'), ov=document.getElementById('overlay');
  if(V.screen==='login'||V.screen==='setpw'){ app.className=''; app.innerHTML=renderAuth(); ov.innerHTML=''; return; }
  if(V.screen!=='app') return;
  const ae=document.activeElement, fid=ae && ae.id; let sel=null;
  try{ if(fid && typeof ae.selectionStart==='number') sel=[ae.selectionStart, ae.selectionEnd]; }catch(e){}
  const drw=document.querySelector('.drawer'), dScroll=drw?drw.scrollTop:0;
  const mdl=document.querySelector('.modal'), mScroll=mdl?mdl.scrollTop:0;
  const mn=app.querySelector('main'), mainScroll=(mn&&!V.resetScroll)?mn.scrollTop:0; V.resetScroll=false;
  app.className='shell';
  app.innerHTML = renderHeader() + `<main>${renderView()}</main>` + renderBottomTabs();
  const mn2=app.querySelector('main'); if(mn2&&mainScroll) mn2.scrollTop=mainScroll;
  { const tb=app.querySelector('.bottomtabs'); const h=tb&&getComputedStyle(tb).display!=='none'?tb.offsetHeight:0; document.documentElement.style.setProperty('--tabbar-h', h+'px'); }
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
// Built-in tab icons (Lucide shapes), so the phone tab bar never depends on a network request.
const TAB_ICONS = {
  'calendar-days':'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  'layers':'<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  'list-checks':'<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
  'inbox':'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'settings':'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>'
};
let navLinks=()=>'';
function renderBottomTabs(){ return `<nav class="tabs bottomtabs" aria-label="Main">${navLinks()}</nav>`; }
function renderHeader(){
  const ti=n=>`<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[n]||''}</svg>`;
  const tab=(h,l,on,icon)=>`<a href="#${h}" class="${on?'on':''}">${ti(icon)}<span>${l}</span></a>`; const m=me();
  navLinks=()=>`${tab('calendar','Calendar',V.view==='calendar','calendar-days')}${tab('campaigns','Campaigns',V.view==='campaigns'||V.view==='campaign','layers')}${tab('my-work','My work',V.view==='my-work','list-checks')}<a href="#requests" class="${V.view==='requests'?'on':''}">${ti('inbox')}<span>Approvals</span>${(()=>{ const n=Object.values(S.requests).filter(r=>r.status==='new').length + pendingCampaigns().length; return n?`<span class="count">${n}</span>`:''; })()}</a>${tab('settings','Settings',V.view==='settings','settings')}`;
  return `<header class="topbar">
    <a href="#calendar" aria-label="Calendar home"><img class="logo" src="/assets/logo-horizontal.svg" alt="First Baptist Sulphur Springs"></a>
    <nav class="tabs toptabs" aria-label="Main">${navLinks()}</nav>
    <button class="btn primary newbtn" data-action="new-campaign" aria-label="New campaign">+<span class="wide-only"> New campaign</span></button>
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
const stClass = (d, v=st(d)) => (!isSocialDest(d) && v==='posted') ? 'done' : v;   // finished tasks show green
function pill(d){ return `<span class="pill st-${stClass(d)}">${statusLabel(d)}</span>`; }
function chip(d,label,removable){ const c=campOf(d), ch=channelById(d.channelId); const s=st(d);
  return `<div class="chip ${isPending(d.campaignId)?'pending':''}" role="button" tabindex="0" draggable="true" data-drag-dest="${esc(d.id)}" style="--c:${esc(c.color)}" data-action="open-dest" data-id="${esc(d.id)}" title="${isPending(d.campaignId)?'Pending approval · ':''}${esc(c.title)} · ${esc(ch.name)}${timeTxt(d)} · ${esc(statusLabel(d))}${d.autoPublish&&!d.publishedAt?' · posts automatically':''} · drag to move">${kb(ch)}<span class="t">${esc(label||c.title)}</span>${d.publishError?'<span title="Posting failed" style="color:var(--bad)">!</span>':''}<span class="sdot st-${stClass(d)}"></span>${d.assigneeId?av(d.assigneeId):''}${removable?`<button class="chipx" data-action="quick-delete" data-id="${esc(d.id)}" aria-label="Remove ${esc(ch.name)}" title="Remove">×</button>`:''}</div>`; }
function evtBtn(c){ return `<button class="evt ${isPending(c.id)?'pending':''}" style="--c:${esc(c.color)}" data-action="open-campaign" data-id="${esc(c.id)}" title="Event: ${esc(c.title)}">★ <span>${esc(c.title)}</span></button>`; }
function memberOptions(sel, includeNone=true, noneLabel='Unassigned'){ return (includeNone?`<option value="">${noneLabel}</option>`:'') + teamList().map(m=>`<option value="${esc(m.id)}" ${m.id===sel?'selected':''}>${esc(m.name)}</option>`).join(''); }
function channelOptions(sel){ return settings().channels.map(c=>`<option value="${esc(c.id)}" ${c.id===sel?'selected':''}>${esc(c.name)}</option>`).join(''); }
function filteredDests(){ return Object.values(S.dests).filter(d=>!isDeclined(d.campaignId) && (!V.fChan||d.channelId===V.fChan) && (!V.fPerson || (V.fPerson==='none'? !d.assigneeId : d.assigneeId===V.fPerson))); }

/* ---------- calendar ---------- */
function renderCalendar(){
  const s=settings(); const today=todayStr(); const list=filteredDests();
  const byKey={}; for(const d of list){ (byKey[d.date+'|'+d.channelId] ||= []).push(d); (byKey[d.date] ||= []).push(d); }
  const evts={}; for(const c of Object.values(S.campaigns)){ if(c.status==='declined') continue; for(const k of eventDays(c)) (evts[k] ||= []).push(c); }
  let days, label;
  if(V.calMode==='week'||V.calMode==='list'){ const st=startOfWeek(V.anchor); days=[...Array(7)].map((_,i)=>addDays(st,i));
    const m0=days[0].toLocaleDateString('en-US',{month:'short'}), m6=days[6].toLocaleDateString('en-US',{month:'short'});
    label=`${m0} ${days[0].getDate()} – ${m0===m6?'':m6+' '}${days[6].getDate()}, ${days[6].getFullYear()}`; }
  else { const first=new Date(V.anchor.getFullYear(),V.anchor.getMonth(),1); const st=startOfWeek(first); days=[...Array(42)].map((_,i)=>addDays(st,i));
    if(days[35].getMonth()!==first.getMonth()) days=days.slice(0,35); label=first.toLocaleDateString('en-US',{month:'long',year:'numeric'}); }
  const inRange=list.filter(d=>{ const dt=parseYmd(d.date); return dt && dt>=days[0] && dt<=days[days.length-1]; });
  V.calRange=[ymd(days[0]), ymd(days[days.length-1])];
  // Pieces that can be marked done in bulk: open tasks (social posts are marked Posted when they go out).
  const openTask=d=>!isSocialDest(d) && !isDone(d);
  const fCh=V.fChan&&channelById(V.fChan); const bulkN=fCh&&!kindOf(fCh).social ? inRange.filter(openTask).length : 0;
  const unassigned=inRange.filter(d=>!d.assigneeId).length, notReady=inRange.filter(needsApproval).length, posted=inRange.filter(isDone).length;
  const toolbar=`<div class="toolbar">
    <div class="row"><button class="btn iconbtn" data-action="cal-prev" aria-label="Previous">‹</button><button class="btn sm" data-action="cal-today">Today</button><button class="btn iconbtn" data-action="cal-next" aria-label="Next">›</button></div>
    <div class="rangelabel">${esc(label)}</div>
    <div class="seg" role="group" aria-label="View"><button data-action="cal-mode" data-mode="list" class="${V.calMode==='list'?'on':''}">List</button><button data-action="cal-mode" data-mode="week" class="${V.calMode==='week'?'on':''}"><span class="wide-only">Week by destination</span><span class="narrow-only">Week</span></button><button data-action="cal-mode" data-mode="month" class="${V.calMode==='month'?'on':''}">Month</button></div>
    <span class="spacer"></span>
    <button class="btn dark" data-action="new-oneoff">+ One-off<span class="wide-only"> post</span></button>
    <select class="compact" id="f-chan" data-ui="fChan" aria-label="Filter by destination"><option value="">All destinations</option>${channelOptions(V.fChan)}</select>
    <select class="compact" id="f-person" data-ui="fPerson" aria-label="Filter by person"><option value="">Everyone</option><option value="none" ${V.fPerson==='none'?'selected':''}>Unassigned</option>${memberOptions(V.fPerson,false)}</select>
    ${bulkN?`<button class="btn sm" data-action="bulk-done" data-chan="${esc(V.fChan)}">✓ Mark all ${esc(fCh.name)} done (${bulkN})</button>`:''}
  </div>
  <div class="stats"><div class="stat" style="--p:var(--dusty)"><b>${inRange.length}</b> scheduled</div><div class="stat" style="--p:var(--gold)"><b>${notReady}</b> social drafts</div><div class="stat" style="--p:var(--rust)"><b>${unassigned}</b> unassigned</div><div class="stat" style="--p:var(--moss)"><b>${posted}</b> done</div></div>`;
  if(!Object.keys(S.campaigns).length && !Object.keys(S.dests).length) return toolbar+`<div class="empty"><img src="/assets/mark-color.svg" alt=""><p><strong>Nothing scheduled yet.</strong></p><p>Create a campaign for an upcoming event, or add a one-off post that isn't part of a campaign.</p><div class="row" style="justify-content:center"><button class="btn primary" data-action="new-campaign">+ New campaign</button><button class="btn dark" data-action="new-oneoff">+ One-off post</button></div></div>`;
  if(V.calMode==='list'){
    let h=`<div class="agenda">`;
    for(const d of days){ const k=ymd(d); const items=(byKey[k]||[]).sort(byWhen); const ev=evts[k]||[];
      const byCh={}; for(const x of items) if(openTask(x)) (byCh[x.channelId] ||= []).push(x);
      const dayBulk=Object.entries(byCh).filter(([,l])=>l.length>1).map(([cid,l])=>`<button class="btn ghost sm bulkday" data-action="bulk-done" data-chan="${esc(cid)}" data-date="${k}">✓ All ${esc(channelById(cid).name)} done</button>`).join('');
      h+=`<section class="aday-l ${k===today?'today':''}" data-drop="${k}">${dayBulk?`<div class="bulkrow">${dayBulk}</div>`:''}<div class="ah"><span class="dn">${d.toLocaleDateString('en-US',{weekday:'short'})}</span><span class="dd">${d.getDate()}</span><span class="dm">${d.toLocaleDateString('en-US',{month:'short'})}</span><span class="spacer"></span><button class="btn ghost sm" data-action="agenda-add" data-date="${k}" aria-label="Add on ${esc(fmtD(k))}">+ Add</button></div>
        ${ev.map(evtBtn).join('')}
        ${items.length?items.map(x=>{ const ch=channelById(x.channelId), c=campOf(x); return `<button class="arow ${isPending(x.campaignId)?'pending':''}" style="--c:${esc(c.color)}" data-action="open-dest" data-id="${esc(x.id)}">${kb(ch)}<span class="at"><strong>${esc(c.title)}</strong><span class="small muted">${esc(ch.name)}${timeTxt(x)}</span></span>${x.assigneeId?av(x.assigneeId):''}${pill(x)}</button>`; }).join(''):(ev.length?'':'<div class="small muted aempty">Nothing scheduled</div>')}
      </section>`; }
    return toolbar+h+`</div>`;
  }
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
  const ds=destsOf(c.id); const done=ds.filter(isDone).length; const pct=ds.length?Math.round(done/ds.length*100):0;
  const people=[...new Set(ds.map(d=>d.assigneeId).filter(Boolean))]; const chans=[...new Set(ds.map(d=>d.channelId))].map(channelById);
  return `<button class="ccard" style="--c:${esc(c.color)}" data-action="open-campaign" data-id="${esc(c.id)}">
    ${c.coverPath?`<div class="cover" style="background-image:url('${esc(fileUrl(c.coverPath))}')"></div>`:`<div class="stripe"></div>`}
    <div class="body">${c._draft?'<span class="pill st-draft" style="align-self:flex-start">Draft · not submitted</span>':isPending(c.id)?'<span class="pill st-new" style="align-self:flex-start">Pending approval</span>':c.status==='declined'?'<span class="pill st-declined" style="align-self:flex-start">Declined</span>':''}<h3>${esc(c.title||'Untitled draft')}</h3><div class="sub">${esc(fmtRange(c,true))}${c.location?' · '+esc(c.location):''}</div>
    <div class="row">${chans.slice(0,8).map(ch=>kb(ch)).join('')}${chans.length?'':'<span class="muted small">No destinations yet</span>'}</div>
    <div class="row small"><span>${done} of ${ds.length} done</span><span class="spacer"></span>${people.map(p=>av(p)).join('')}</div>
    <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div></div></button>`;
}
function renderCampaigns(){
  const all=Object.values(S.campaigns).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  const t=todayStr(); const endOf=c=>(c.date ? (c.endDate&&c.endDate>c.date?c.endDate:c.date) : (c.adEnd||''));
  const up=all.filter(c=>!endOf(c)||endOf(c)>=t), past=all.filter(c=>endOf(c)&&endOf(c)<t).reverse();
  let h=`<div class="pagehead"><h1>Campaigns</h1><button class="btn primary" data-action="new-campaign">+ New campaign</button></div>`;
  if(!all.length) return h+`<div class="empty"><img src="/assets/mark-color.svg" alt="">No campaigns yet. Start one for your next event, sermon series or ministry push.</div>`;
  h+=`<div class="sectionlabel">Upcoming · ${up.length}</div>`+(up.length?`<div class="cards">${up.map(campCard).join('')}</div>`:`<div class="empty">Nothing upcoming.</div>`);
  if(past.length) h+=`<div class="sectionlabel">Past · ${past.length}</div><div class="cards">${past.map(campCard).join('')}</div>`;
  return h;
}
function drow(d, showCamp){
  const ch=channelById(d.channelId), c=campOf(d); const imgs=d.imagePaths||[];
  return `<button class="drow" data-action="open-dest" data-id="${esc(d.id)}">${kb(ch,'lg')}
    <div><div class="nm">${esc(showCamp?c.title:ch.name)}</div><div class="muted small">${showCamp?esc(ch.name)+' · ':''}${esc(fmtD(d.date))}${timeTxt(d)}${d.date&&!isDone(d)&&d.date<todayStr()?' · <span style="color:var(--bad)">overdue</span>':''}${d.autoPublish&&!d.publishedAt?' · posts automatically':''}</div></div>
    <div class="snip">${d.publishError?`<span style="color:var(--bad)">Posting failed: ${esc(d.publishError)}</span>`:(esc((d.headline?d.headline+' — ':'')+(d.copy||'')) || '<em>No copy yet</em>')}</div>
    <div class="thumbs">${imgs.slice(0,3).map(i=>mediaTag(i)).join('')}</div>${av(d.assigneeId)}${pill(d)}</button>`;
}
function fileTile(c,f){ const k=fileKind(f), isImg=k==='image';
  return `<div class="ftile" title="${esc(f.name)}"><a class="open" href="${esc(fileUrl(f.path))}" target="_blank" rel="noopener" aria-label="Open ${esc(f.name)}"></a>
    <div class="fprev" style="${isImg?`background-image:url('${esc(fileUrl(f.path))}')`:''}">${isImg?'':esc(k)}</div><div class="fname">${esc(f.name)}</div>
    <button class="x" data-action="remove-file" data-id="${esc(c.id)}" data-file="${esc(f.path)}" aria-label="Remove ${esc(f.name)}">×</button></div>`; }
/* Key art is automatic: the first 16:9 image in the campaign's files, in upload order, or the first image if
   none is 16:9. It's stored in cover_path so the newsletter and social posting can use it. Image sizes are
   recorded on upload; older files are measured once here. */
const isImgFile=f=>/^image\//.test(f.type||'') || /\.(jpe?g|png|webp|gif)$/i.test(f.name||f.path||'');
const isWide=f=>f.w&&f.h&&Math.abs(f.w/f.h-16/9)<0.06;
const measuring=new Set();
function imageSize(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight}); i.onerror=()=>res(null); i.src=src; }); }
function syncKeyArt(c){
  if(!c||c._draft&&!(c.files||[]).length) return;
  const imgs=(c.files||[]).filter(isImgFile);
  const unknown=imgs.filter(f=>!f.w&&!measuring.has(f.path));
  if(unknown.length){
    unknown.forEach(f=>measuring.add(f.path));
    Promise.all(unknown.map(async f=>{ const d=await imageSize(fileUrl(f.path)); if(d){ f.w=d.w; f.h=d.h; } else { f.w=-1; f.h=-1; } })).then(()=>{ saveCampaign(c); syncKeyArt(c); render(); });
  }
  if(imgs.some(f=>!f.w)) return;   // wait until every image is measured
  const pick=imgs.find(isWide)||imgs.find(f=>f.w>0);
  const next=pick?pick.path:c.coverPath;   // no images: keep any older key art
  if(next!==c.coverPath){ c.coverPath=next; saveCampaign(c); setTimeout(()=>render(),0); }
}
function renderCampaign(id){
  const c=S.campaigns[id];
  if(!c) return `<div class="empty">This campaign was deleted or hasn't loaded yet. <a href="#campaigns">Back to campaigns</a></div>`;
  syncKeyArt(c);
  const ds=destsOf(id); const done=ds.filter(isDone).length; const files=c.files||[]; const I=esc(id);
  const inp=(f,label,type,ph,extra='')=>`<div class="field"><label class="lbl" for="c-${f}">${label}</label><input type="${type}" id="c-${f}" data-bind="camp:${f}" data-id="${I}" value="${esc(c[f]||'')}" ${ph?`placeholder="${esc(ph)}"`:''} ${extra}></div>`;
  const pr=requestFor(id); const sub=memberById(c.createdBy);
  const banner = c._draft ? `<div class="planbanner" style="border-left-color:var(--gold);background:color-mix(in srgb,var(--gold) 7%,var(--surface))"><div style="flex:1;min-width:220px"><span class="lbl" style="margin:0">New campaign · not saved yet</span>
      <div class="prose" style="font-size:14px">Fill in the details and add destinations, then submit it. ${isAdmin()?'As an admin, your campaign is approved as soon as you submit it.':'An admin reviews it, and assignment emails go out once it\'s approved.'}</div></div>
      <button class="btn" data-action="discard-draft" data-id="${esc(id)}">Discard</button><button class="btn primary" data-action="submit-campaign" data-id="${esc(id)}" ${V.busy?'disabled':''}>${V.busy?'Submitting…':'Submit campaign'}</button></div>`
    : (!pr && c.status==='pending') ? `<div class="planbanner"><div style="flex:1;min-width:220px"><span class="lbl" style="margin:0">Waiting for approval</span>
      <div class="prose" style="font-size:14px">Submitted by <strong>${esc(sub?sub.name:'a staff member')}</strong>. Assignment emails and automatic posting start once an admin approves it.</div></div>
      ${isAdmin()?`<button class="btn sm" data-action="camp-decline" data-id="${esc(id)}">Decline</button><button class="btn primary" data-action="camp-approve" data-id="${esc(id)}">Approve</button>`:`<span class="pill st-new">Waiting for admin approval</span>`}</div>`
    : c.status==='declined' ? `<div class="planbanner" style="border-left-color:var(--st-draft);background:var(--surface-2)"><div style="flex:1;min-width:220px"><span class="lbl" style="margin:0">Not approved</span>
      <div class="prose" style="font-size:14px">${c.reviewNote?`“${esc(c.reviewNote)}”`:'An admin declined this campaign.'} It's hidden from the calendar. Make changes, then submit it again.</div></div>
      <button class="btn primary" data-action="resubmit-campaign" data-id="${esc(id)}">Submit again</button></div>`
    : pr ? `<div class="planbanner"><div style="flex:1;min-width:220px"><span class="lbl" style="margin:0">Planning a request · not approved yet</span>
      <div class="prose" style="font-size:14px">From <strong>${esc(pr.requester_name)}</strong>${pr.ministry?' ('+esc(pr.ministry)+')':''}. Drag the destinations onto the days they should go out, then ${isAdmin()?'approve':'an admin approves'}. ${esc(pr.requester_name.split(' ')[0])} gets an email listing every destination and date, and assignment emails go out to your team at the same time.</div></div>
      <a class="btn sm" href="#request-${esc(pr.id)}">View request</a>${isAdmin()?`<button class="btn sm" data-action="req-decline" data-id="${esc(pr.id)}">Decline</button><button class="btn primary" data-action="req-approve" data-id="${esc(pr.id)}">Approve &amp; email</button>`:`<span class="pill st-new">Waiting for admin approval</span>`}</div>` : '';
  return `<div class="row small" style="margin-bottom:12px"><a href="#campaigns">← All campaigns</a></div>${banner}
  <div class="cp">
    <section class="panel stack" aria-label="Event details">
      <div class="field"><label class="lbl" for="c-title">Campaign</label><input type="text" id="c-title" class="titleinput" data-bind="camp:title" data-id="${I}" value="${esc(c.title)}" placeholder="Campaign name"></div>
      <div class="grid2">${inp('date','Start date','date')}${inp('time','Start time','time')}${inp('endDate','End date','date','',`min="${esc(c.date||'')}"`)}${inp('endTime','End time','time')}</div>
      ${c.date?'':'<span class="small muted" style="margin-top:-8px">No event date? For things like an offering, leave the dates empty and set Advertise from and until below.</span>'}
      ${inp('location','Location','text','e.g. Worship Center, The ROC')}
      <div class="field"><label class="lbl" for="c-description">Description</label><textarea id="c-description" data-bind="camp:description" data-id="${I}" placeholder="What is it, who is it for, how do people sign up? The AI writer uses this.">${esc(c.description||'')}</textarea></div>
      <div class="grid2">${inp('adStart','Advertise from','date')}${inp('adEnd','Advertise until','date','',`min="${esc(c.adStart||'')}"`)}</div>
      ${inp('ministry','Ministry / requested by','text',"e.g. Children's Ministry")}
      ${inp('link','Sign-up or info link','url','https://')}
      <div class="field"><span class="lbl">Calendar color</span><div class="swatches">${PALETTE.map(p=>`<button class="sw ${c.color===p?'on':''}" style="--c:${p}" data-action="set-color" data-id="${I}" data-color="${p}" aria-label="Color ${p}"></button>`).join('')}</div></div>
      <div class="field"><span class="lbl">Key art (used when a destination has no photo)</span>
        <div class="coverbox" style="${c.coverPath?`background-image:url('${esc(fileUrl(c.coverPath))}')`:''}">${c.coverPath?'':'<span class="small muted" style="padding:10px;text-align:center">No image yet</span>'}</div>
        <span class="small muted" style="margin-top:6px">Set automatically: the first 16 × 9 image in Campaign files (the title graphic, if you made one).</span></div>
      <div class="field"><span class="lbl">Campaign files · ${files.length}</span>
        <div class="files">${files.map(f=>fileTile(c,f)).join('')}<label class="addfile" for="up-file-${I}">+ Add files<br><span class="small muted">Images, PDFs, video</span></label><input type="file" multiple accept="image/*,application/pdf,video/*,.ai,.psd,.indd,.docx,.pptx,.zip" class="sr" id="up-file-${I}" data-upload="file:${I}"></div>
        <span class="small muted" style="margin-top:6px">Posters, logos, photos and PDFs. Images can be added to any destination.</span></div>
      ${renderGfxPanel(c)}
      <div><button class="btn danger sm" data-action="delete-campaign" data-id="${I}">Delete campaign</button></div>
    </section>
    <div class="stack" style="gap:22px;min-width:0">
      ${renderAdCal(c, ds)}
      <section aria-label="Destinations">
        <div class="pagehead" style="margin-bottom:12px"><div><h2>Destinations</h2><div class="sub">Every place this campaign goes out, with its own date, copy, photos and owner.</div></div>
        <button class="btn dark" data-action="add-dests" data-id="${I}">+ Add destinations</button></div>
        ${ds.length?`<div class="dlist">${ds.map(d=>drow(d,false)).join('')}</div>`:`<div class="empty">No destinations yet. Drag them onto the advertising calendar above, or use Add destinations.</div>`}
        <div class="footbar"><span class="pill st-${done===ds.length&&ds.length?'approved':'review'}">${done} of ${ds.length} done</span><span class="muted small">Tasks are done when marked Done; social posts when posted</span>
        ${ds.some(d=>isSocialDest(d)&&st(d)==='draft')?`<span class="spacer"></span><button class="btn sm" data-action="approve-all" data-id="${I}">Schedule all social drafts</button>`:''}</div>
      </section>
    </div>
  </div>`;
}
function renderAdCal(c, ds){
  const id=c.id;
  const head=`<div class="pagehead" style="margin-bottom:10px"><div><h2>Advertising calendar</h2><div class="sub">${c.adStart&&c.adEnd?`${esc(fmtD(c.adStart))} – ${esc(fmtD(c.adEnd))}. `:''}<span class="hover-only">Drag a destination onto a day to schedule it, or drag one already placed to move it.</span><span class="touch-only">Tap + on a day to add a destination. To move one, tap it and change its date.</span></div></div></div>`;
  const a=parseYmd(c.adStart), b=parseYmd(c.adEnd);
  if(!a||!b) return `<section class="panel">${head}<div class="empty">Set <strong>Advertise from</strong> and <strong>Advertise until</strong> to see every day in your advertising window.</div></section>`;
  if(b<a) return `<section class="panel">${head}<div class="empty">"Advertise until" is before "Advertise from". Fix the dates to see the calendar.</div></section>`;
  if(daysBetween(c.adStart,c.adEnd)>366) return `<section class="panel">${head}<div class="empty">The advertising window is longer than a year. Shorten it to plan by day.</div></section>`;
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
// Open tasks for a person that are overdue, due today, or both (not social posts, not ones with a posting error).
function workDue(pid, scope){
  const t=todayStr();
  return Object.values(S.dests).filter(d=>!isDeclined(d.campaignId) && !(S.campaigns[d.campaignId]||{})._draft && (pid==='none'?!d.assigneeId:d.assigneeId===pid)
    && !isDone(d) && !isSocialDest(d) && !d.publishError && d.date && (scope==='overdue'?d.date<t:scope==='today'?d.date===t:d.date<=t));
}
function renderWork(){
  const m=me(); let pid=V.workPerson || (m&&m.id) || '';
  let h=`<div class="pagehead"><div><h1>My work</h1><div class="sub">Sorted by due date: the day each item is scheduled to go out.</div></div><div class="row"><label class="small muted" for="w-person">Showing</label><select class="compact" id="w-person" data-ui="workPerson">${memberOptions(pid,false)}<option value="none" ${pid==='none'?'selected':''}>Unassigned</option></select></div></div>`;
  const when=d=>d.date||'';
  const mine=Object.values(S.dests).filter(d=>!isDeclined(d.campaignId) && !(S.campaigns[d.campaignId]||{})._draft).filter(d=>pid==='none'?!d.assigneeId:d.assigneeId===pid).sort((a,b)=>(when(a)||'9999').localeCompare(when(b)||'9999')||byWhen(a,b));
  const t=todayStr(), wk=ymd(addDays(new Date(),7)); const open=mine.filter(d=>!isDone(d)); const ok=d=>!d.publishError;
  const groups=[['Needs attention',open.filter(d=>d.publishError)],['Overdue',open.filter(d=>ok(d)&&when(d)&&when(d)<t)],['Due today',open.filter(d=>ok(d)&&when(d)===t)],['Next 7 days',open.filter(d=>ok(d)&&when(d)>t&&when(d)<=wk)],['Later',open.filter(d=>ok(d)&&(!when(d)||when(d)>wk))],['Done recently',mine.filter(isDone).reverse().slice(0,10)]];
  if(!mine.length) h+=`<div class="empty"><img src="/assets/mark-color.svg" alt="">Nothing assigned yet.</div>`;
  // Overdue and due-today tasks can be marked done in one go (social posts are marked Posted when they go out).
  const scopeOf={'Overdue':'overdue','Due today':'today'};
  const nTasks=g=>workDue(pid,g).length, both=nTasks('both');
  if(both && nTasks('overdue') && nTasks('today')) h+=`<div class="row" style="justify-content:flex-end;margin:-6px 0 4px"><button class="btn sm" data-action="work-done" data-scope="both" data-person="${esc(pid)}">✓ Mark all overdue and due today done (${both})</button></div>`;
  for(const [g,items] of groups){ if(!items.length) continue; const sc=scopeOf[g], n=sc?nTasks(sc):0;
    h+=`<div class="sectionlabel row" style="gap:10px"><span>${g} · ${items.length}</span>${n?`<button class="btn ghost sm bulkday" data-action="work-done" data-scope="${sc}" data-person="${esc(pid)}">✓ Mark ${n===items.length?'all':n+(n===1?' task':' tasks')} done</button>`:''}</div><div class="dlist">${items.map(d=>drow(d,true)).join('')}</div>`; }
  return h;
}

/* ---------- requests inbox ---------- */
// Staff-submitted campaigns waiting for an admin (request plans are approved through their request).
const pendingCampaigns = () => Object.values(S.campaigns).filter(c=>c.status==='pending' && !c._draft && !requestFor(c.id)).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
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
  const pc=pendingCampaigns();
  const pcHtml = pc.length ? `<div class="sectionlabel">Campaigns waiting for approval · ${pc.length}</div><div class="dlist" style="margin-bottom:8px">${pc.map(c=>{ const sub=memberById(c.createdBy); const n=destsOf(c.id).length; return `<button class="drow" style="grid-template-columns:auto minmax(0,1fr) auto" data-action="open-campaign" data-id="${esc(c.id)}"><span class="sw" style="--c:${esc(c.color)};cursor:inherit"></span><div><div class="nm">${esc(c.title)}</div><div class="muted small">${esc(fmtRange(c))} · ${n} destination${n===1?'':'s'} · submitted by ${esc(sub?sub.name:'staff')}</div></div>${isAdmin()?'<span class="pill st-new">Review</span>':'<span class="pill st-new">Pending</span>'}</button>`; }).join('')}</div><div class="sectionlabel">Communication requests</div>` : '';
  let h=`<div class="pagehead"><div><h1>Approvals</h1><div class="sub">Campaigns submitted by staff, and communication requests from the request form. Share the form: <a href="/request" target="_blank" rel="noopener">${esc(formUrl)}</a></div></div>
    <div class="row"><button class="btn sm" data-action="copy-form-link">Copy form link</button><div class="seg" role="group" aria-label="Show">${['new','approved','declined'].map(k=>`<button data-action="req-filter" data-f="${k}" class="${V.reqFilter===k?'on':''}">${REQ_ST[k][0]} · ${counts[k]||0}</button>`).join('')}</div></div></div>`;
  h+=pcHtml;
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
        ${sel.promo_start?`<dt>Start promoting</dt><dd>${esc(fmtD(sel.promo_start,{weekday:'long',month:'short',day:'numeric'}))}</dd>`:''}
        ${sel.promo_end?`<dt>Promote until</dt><dd>${esc(fmtD(sel.promo_end,{weekday:'long',month:'short',day:'numeric'}))}</dd>`:''}
        ${sel.needs_graphics?`<dt>Graphics</dt><dd>${sel.needs_graphics==='yes'?'<strong>Yes, needs graphics designed</strong>':'No, they have their own'}</dd>`:''}
        <dt>Files</dt><dd style="white-space:normal">${files.length?`<div class="files">${files.map(f=>{ const k=fileKind(f), img=k==='image'; return `<div class="ftile" title="${esc(f.name)}"><a class="open" href="${esc(fileUrl(f.path))}" target="_blank" rel="noopener" aria-label="Open ${esc(f.name)}"></a><div class="fprev" style="${img?`background-image:url('${esc(fileUrl(f.path))}')`:''}">${img?'':esc(k)}</div><div class="fname">${esc(f.name)}</div></div>`; }).join('')}</div>`:'<span class="muted">None</span>'}</dd>
        <dt>Received</dt><dd>${esc(new Date(sel.created_at).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</dd>
        ${sel.status!=='new'?`<dt>${sel.status==='approved'?'Approved':'Declined'}</dt><dd>${esc(reviewer?reviewer.name:'Staff')}${sel.reviewed_at?' · '+esc(new Date(sel.reviewed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})):''}${sel.decision_note?'\n“'+esc(sel.decision_note)+'”':''}</dd>`:''}
      </dl>
      ${sel.status==='new'?renderPlanSummary(sel, camp):''}
      <div class="footbar">${sel.status==='new'?(camp?`<a class="btn dark" href="#campaign-${esc(camp.id)}">Edit schedule on calendar</a>`:`<button class="btn dark" data-action="req-plan" data-id="${esc(sel.id)}">Plan on calendar</button>`)+(isAdmin()?`<button class="btn primary" data-action="req-approve" data-id="${esc(sel.id)}">${camp?'Approve &amp; email':'Approve'}</button><button class="btn" data-action="req-decline" data-id="${esc(sel.id)}">Decline</button>`:`<span class="small muted">Waiting for an admin to approve.</span>`):''}
        ${camp&&sel.status!=='new'?`<a class="btn dark" href="#campaign-${esc(camp.id)}">Open campaign</a>`:''}<span class="spacer"></span>${isAdmin()?`<button class="btn ghost sm danger" data-action="req-delete" data-id="${esc(sel.id)}">Delete</button>`:''}</div>
    </section>`;
  } else h+=`<div class="empty">Select a request.</div>`;
  return h+`</div>`;
}
function renderPlanSummary(r, camp){
  if(!camp) return `<div class="planbanner" style="margin:0"><div class="prose" style="font-size:14px;flex:1">Plan the schedule before approving: <strong>Plan on calendar</strong> creates a campaign with the requested destinations so you can drag each one to its day. The approval email lists every destination and date.</div></div>`;
  const ds=destsOf(camp.id);
  return `<div class="field"><span class="lbl">Planned schedule (goes in the approval email)</span>${ds.length?`<div class="dlist">${ds.map(d=>{ const ch=channelById(d.channelId); return `<button class="drow" style="grid-template-columns:auto 1fr auto" data-action="open-dest" data-id="${esc(d.id)}">${kb(ch)}<div class="nm">${esc(ch.name)}</div><div class="small">${esc(fmtD(d.date,{weekday:'short',month:'short',day:'numeric'}))}${timeTxt(d)}</div></button>`; }).join('')}</div>`:'<div class="muted small">No destinations planned yet.</div>'}</div>`;
}
function createCampaignFromRequest(r, opts={}){
  // No event date (e.g. an offering): advertise from the requested start until the requested end.
  const pStart=r.promo_start&&r.promo_start>todayStr()?r.promo_start:todayStr();
  const start=r.start_date||r.promo_end||ymd(addDays(parseYmd(pStart),30)); const adEnd=r.start_date?(r.end_date&&r.end_date>start?r.end_date:start):start;
  const c={id:uid(), title:r.title, date:r.start_date||'', endDate:r.end_date||r.start_date||'', time:t5(r.start_time), endTime:t5(r.end_time), adStart:(r.promo_start&&r.promo_start<=start?(r.promo_start<todayStr()?todayStr():r.promo_start):(todayStr()<start?todayStr():start)), adEnd,
    location:r.location||'', description:r.description||'', ministry:r.ministry||r.requester_name, link:'', color:PALETTE[Object.keys(S.campaigns).length % PALETTE.length], coverPath:'',
    files:(r.files||[]).map(f=>({path:f.path, name:f.name, type:f.type, size:f.size, at:Date.now()})), status:'pending'};
  saveCampaign(c);
  let def=parseYmd(start)?addDays(parseYmd(start),-3):new Date(); if(ymd(def)<todayStr()) def=new Date();
  for(const chId of (r.channel_ids||[])) if(settings().channels.some(x=>x.id===chId)) newDest(c.id, chId, ymd(def), defaultTime(chId), '', {silent:true});
  return c;
}
const waitForSaves = async () => { for(let i=0;i<60 && (Object.keys(dirty).length||Object.values(inflight).some(Boolean));i++) await new Promise(res=>setTimeout(res,150)); };
async function planRequest(id){
  const r=S.requests[id]; if(!r) return;
  if(r.campaign_id && S.campaigns[r.campaign_id]){ location.hash='campaign-'+r.campaign_id; return; }
  const c=createCampaignFromRequest(r); await waitForSaves();
  const { error } = await sb.from('requests').update({campaign_id:c.id}).eq('id',r.id);
  if(error){ toast('Could not link the plan to the request: '+error.message); return; }
  r.campaign_id=c.id; toast('Drag each destination to the day it should go out, then approve.'); location.hash='campaign-'+c.id;
}
async function approveRequest(m){
  const r=S.requests[m.id]; if(!r) return; V.busy=true; render(true);
  let campaignId = r.campaign_id && S.campaigns[r.campaign_id] ? r.campaign_id : null;
  try{
    if(!campaignId && m.createCampaign){ campaignId=createCampaignFromRequest(r).id; }
    await waitForSaves();
    const res=await api('request-decision',{id:r.id, decision:'approved', note:m.note, campaignId, notify:m.notify, includeSchedule:m.includeSchedule!==false});
    Object.assign(r,{status:'approved', decision_note:m.note, campaign_id:campaignId, reviewed_by:session.user.id, reviewed_at:new Date().toISOString()});
    if(campaignId && S.campaigns[campaignId]) S.campaigns[campaignId].status='approved';
    const tasks = campaignId ? await notifyCampaignAssignments(campaignId) : 0;
    V.modal=null; V.busy=false;
    toast((m.notify?(res.emailed?`Approved. ${r.requester_name} was emailed.`:`Approved, but the email to ${r.requester_name} didn't send${res.emailError?': '+res.emailError:''}.`):'Approved.') + (tasks?` ${tasks} assignment email${tasks===1?'':'s'} sent.`:''));
    if(campaignId && location.hash!=='#campaign-'+campaignId) location.hash='campaign-'+campaignId; else render(true);
  }catch(e){ V.busy=false; toast(e.message); render(true); }
}
async function declineRequest(m){
  const r=S.requests[m.id]; if(!r) return; V.busy=true; render(true);
  try{ const res=await api('request-decision',{id:r.id, decision:'declined', note:m.note, notify:m.notify});
    if(m.removePlan && r.campaign_id && S.campaigns[r.campaign_id]){ removeCampaign(r.campaign_id); r.campaign_id=null; if(location.hash.startsWith('#campaign-')) history.replaceState(null,'','#request-'+r.id); V.view='requests'; V.requestId=r.id; }
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
  <section class="panel stack"><h2>Weekly Update newsletter</h2>
    ${CFG&&CFG.newsletter?`<p class="prose small" style="margin:0">Every hour, the calendar sends each <strong>${esc(s.channels.filter(c=>c.kind==='email').map(c=>c.name).join(', ')||'email')}</strong> destination going out in the next week to the <a href="${esc(CFG.newsletterUrl)}" target="_blank" rel="noopener">Newsletter Studio</a>. Each one becomes an announcement section marked "From the calendar." Sections nobody has edited stay in step with the calendar. Once someone edits a section in the studio, the calendar leaves it alone.</p>
      <div class="row"><button class="btn dark" data-action="newsletter-sync" ${V.busy?'disabled':''}>${V.busy?'Sending…':'Send to newsletter now'}</button>${V.nlResult?`<span class="small muted">${esc(V.nlResult)}</span>`:''}</div>`
    :`<p class="small muted" style="margin:0">Not connected. Add <code>NEWSLETTER_URL</code> and <code>NEWSLETTER_IMPORT_KEY</code> in Netlify to send each week's Weekly Update items to the Newsletter Studio automatically.</p>`}
  </section>
  <section class="panel stack brandkit"><h2>Brand kit for AI graphics</h2>
    <p class="prose small" style="margin:0">Used whenever a design or post image is set to <strong>First Baptist style</strong>. The image AI looks at the pictures below and follows the notes.</p>
    <div class="field"><label class="lbl" for="b-notes">Brand notes</label><textarea id="b-notes" data-bind="brand:notes" rows="9" ${admin?'':'readonly'}>${esc(s.brand.notes)}</textarea>
      ${admin?`<button class="btn ghost sm" data-action="brand-reset-notes" style="align-self:flex-start">Reset to the brand guide text</button>`:''}</div>
    <div class="field"><span class="lbl">Brand images · ${s.brand.assets.filter(a=>a.on!==false).length} in use${s.brand.assets.length>BRAND_MAX?` (the first ${BRAND_MAX} checked are sent)`:''}</span>
      <span class="small muted">Best: past graphics you love, photos of the building and stained glass, textures and patterns, the pillar icons, and a sample title set in your fonts. Avoid images with lots of small text, and leave the logo out.</span>
      <div class="photos">${s.brand.assets.map((a,i)=>`<div class="photo brandimg ${a.on===false?'off':''}"><a href="${esc(fileUrl(a.path))}" target="_blank" rel="noopener" aria-label="Open full size"></a><img src="${esc(fileUrl(a.path))}" alt="${esc(a.name)}" loading="lazy">
        ${admin?`<label class="use"><input type="checkbox" data-action="brand-toggle" data-i="${i}" ${a.on===false?'':'checked'}> Use</label><button class="x" data-action="brand-remove" data-i="${i}" aria-label="Remove">×</button>`:''}</div>`).join('')}
      ${admin?`<label class="addphoto" for="up-brand">+ Add brand images<br><span class="small muted">JPG or PNG</span></label><input type="file" accept="image/*" multiple class="sr" id="up-brand" data-upload="brand:1">`:''}</div>
      ${admin?'':'<span class="small muted">Only admins can change the brand kit.</span>'}</div>
  </section>
  <section class="panel stack"><h2>Writing voice</h2>
    <div class="field"><label class="lbl" for="s-voice">Church voice for AI copy</label><textarea id="s-voice" data-bind="set:voice" rows="6">${esc(s.voice)}</textarea></div>
    <div class="field"><label class="lbl" for="s-handle">Page name in post previews</label><input type="text" id="s-handle" data-bind="set:handle" value="${esc(s.handle)}"></div>
    ${CFG&&CFG.aiEnabled?'':'<p class="small" style="margin:0;color:var(--bad)">AI writing is off until ANTHROPIC_API_KEY is added in Netlify.</p>'}
  </section>
  <section class="panel stack"><h2>Destinations</h2>
    <p class="sub" style="margin:0">The places you publish to. Each becomes a row on the calendar. Click an icon to change it. <strong>Auto-assign</strong> gives every new destination of that type to one person, who gets the task in My work and an email.</p>
    ${s.channels.map(c=>{ const C=esc(c.id); return `<div class="chanset"><div class="setrow"><button class="iconbtn-pick" data-action="pick-icon" data-id="${C}" title="Change icon" aria-label="Change icon for ${esc(c.name)}">${kb(c)}</button><input type="text" id="ch-name-${C}" data-bind="chan:name" data-id="${C}" value="${esc(c.name)}" aria-label="Destination name"><select id="ch-kind-${C}" data-bind="chan:kind" data-id="${C}" aria-label="Destination type">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${c.kind===k?'selected':''}>${v.label}</option>`).join('')}</select><button class="btn ghost iconbtn" data-action="remove-channel" data-id="${C}" aria-label="Remove ${esc(c.name)}">✕</button></div>
      <div class="ownerrow"><label class="small muted" for="ch-owner-${C}">Auto-assign to</label><select class="compact" id="ch-owner-${C}" data-bind="chan:ownerId" data-id="${C}">${memberOptions(c.ownerId||'',true,'Nobody')}</select></div></div>`; }).join('')}
    <div class="row"><button class="btn sm" data-action="add-channel">+ Add destination</button>${s.channels.some(c=>c.kind==='social')?'':'<button class="btn sm dark" data-action="add-social">+ Add Social (Facebook + Instagram)</button>'}</div>
  </section>
  <section class="panel stack"><h2>Team</h2>
    <div>${teamList().map(t=>`<div class="teamrow">${av(t.id,'lg')}<div class="who"><div><strong>${esc(t.name)}</strong>${t.id===(m&&m.id)?' <span class="small muted">(you)</span>':''}</div><div class="small muted">${esc(t.email)}</div></div>
      ${admin&&t.id!==(m&&m.id)?`<select class="compact" id="role-${esc(t.id)}" data-role="${esc(t.id)}" aria-label="Role for ${esc(t.name)}"><option value="editor" ${t.role==='editor'?'selected':''}>Editor</option><option value="admin" ${t.role==='admin'?'selected':''}>Admin</option></select><button class="btn ghost iconbtn" data-action="remove-member" data-id="${esc(t.id)}" aria-label="Remove ${esc(t.name)}">✕</button>`:`<span class="pill ${t.role==='admin'?'st-posted':'st-draft'}">${t.role==='admin'?'Admin':'Editor'}</span><span></span>`}</div>`).join('')}</div>
    ${admin?`<form class="stack" data-form="invite" style="gap:10px"><div class="grid2"><div class="field"><label class="lbl" for="inv-name">Name</label><input type="text" id="inv-name" autocomplete="off"></div><div class="field"><label class="lbl" for="inv-email">Email</label><input type="email" id="inv-email" autocomplete="off" required></div></div>
      <div><button class="btn dark" type="submit" ${V.busy?'disabled':''}>${V.busy?'Sending…':'Send invite'}</button></div></form>
      <p class="small muted" style="margin:0">They'll get an email with a link to choose a password. Admins can invite people, change roles, connect Facebook, and approve or decline requests. Editors can do everything else, including planning requests.</p>`
      :`<p class="small muted" style="margin:0">Ask an admin to invite new staff.</p>`}
  </section>
  </div>`;
}

/* ---------- drawer ---------- */
function aiState(id){ return V.ai[id] ||= {open:false, loading:false, options:[], error:'', tone:'voice', length:'medium', emoji:'light', hashtags:'off', extra:''}; }
function renderDrawer(){
  const d=V.openDest && S.dests[V.openDest]; if(!d) return '';
  const c=campOf(d), ch=channelById(d.channelId), k=kindOf(ch), id=d.id;
  const a=aiState(id); const len=(d.copy||'').length; const imgs=d.imagePaths||[]; const cur=st(d); const s=settings();
  const previewImg = imgs[0] || c.coverPath;
  let html=`<div class="scrim" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(ch.name)} for ${esc(c.title)}">
  ${fillAnnouncement(d)?(setTimeout(()=>saveDest(d),0),''):''}<div class="dhead"><button class="btn ghost sm dback" data-action="close-drawer" aria-label="Back">← Back</button>${kb(ch,'lg')}<div style="flex:1;min-width:0"><div class="t">${esc(ch.name)}</div>${c.oneOff?`<span class="small muted">One-off post</span>`:`<a class="small" href="#campaign-${esc(d.campaignId)}">${esc(c.title)}</a>`}</div><button class="btn ghost iconbtn" data-action="close-drawer" aria-label="Close">✕</button></div>
  <div class="dbody">
    ${c.oneOff?`<div class="field"><label class="lbl" for="d-title-${id}">Post title</label><input type="text" id="d-title-${id}" data-bind="dest:title" data-id="${id}" value="${esc(d.title)}" placeholder="e.g. Thanksgiving office hours, Sermon recap"></div>
    <div class="field"><label class="lbl" for="d-details-${id}">What's it about?</label><textarea id="d-details-${id}" data-bind="dest:details" data-id="${id}" rows="3" placeholder="The key facts. The AI writer uses this.">${esc(d.details)}</textarea></div>`:''}
    <div class="grid2">
      <div class="field"><label class="lbl" for="d-date-${id}">Publish date</label><input type="date" id="d-date-${id}" data-bind="dest:date" data-id="${id}" value="${esc(d.date)}"></div>
      ${k.social?`<div class="field"><label class="lbl" for="d-time-${id}">Time</label><input type="time" id="d-time-${id}" data-bind="dest:time" data-id="${id}" value="${esc(d.time)}"></div>`:''}
      <div class="field"><label class="lbl" for="d-chan-${id}">Destination</label><select id="d-chan-${id}" data-bind="dest:channelId" data-id="${id}">${channelOptions(d.channelId)}</select></div>
      <div class="field"><label class="lbl" for="d-camp-${id}">Campaign</label><select id="d-camp-${id}" data-bind="dest:campaignId" data-id="${id}"><option value="">None (one-off post)</option>${Object.values(S.campaigns).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>`<option value="${esc(x.id)}" ${x.id===d.campaignId?'selected':''}>${esc(x.title)}${x.date?' · '+esc(fmtD(x.date,{month:'short',day:'numeric'})):''}</option>`).join('')}</select></div>
    </div>
    <div class="postbox" style="border-left-color:var(--gold);gap:10px"><span class="lbl" style="margin:0">Assignment</span>
      <div class="grid2">
        <div class="field"><label class="lbl" for="d-assignee-${id}">Assigned to</label><select id="d-assignee-${id}" data-bind="dest:assigneeId" data-id="${id}">${memberOptions(d.assigneeId)}</select></div>
        <div class="field"><span class="lbl">Due</span><div style="padding:9px 0">${d.date?esc(fmtD(d.date,{weekday:'long',month:'short',day:'numeric'})):'<span class="muted">Set a publish date</span>'}</div></div>
      </div>
      <span class="small muted">Due on the day it's scheduled to go out. ${d.assigneeId?`${esc((memberById(d.assigneeId)||{}).name||'They')} gets an email when assigned and a reminder that morning.`:'Pick someone to email them the assignment. They get a reminder that morning.'}</span>
    </div>
    <div class="field"><span class="lbl">Status</span><div class="statusseg" role="group" aria-label="Status">${statusesFor(d).map(([v,l])=>`<button class="st-${stClass(d,v)} ${cur===v?'on':''}" data-action="set-status" data-id="${id}" data-status="${v}" aria-pressed="${cur===v}"><span class="sdot"></span>${l}</button>`).join('')}</div>${isSocialDest(d)?`<span class="small muted" style="margin-top:6px">Mark it <strong>Scheduled</strong> when it’s ready. Scheduled posts go out automatically at their date and time.</span>`:''}</div>
    ${ch.kind==='email'&&CFG&&CFG.newsletter?`<div class="small muted" style="margin:-8px 0 -6px">Goes into the Weekly Update in the Newsletter Studio automatically: the subject line becomes the title, and the copy and first photo are added too.</div>`:''}
    ${k.head?`<div class="field"><label class="lbl" for="d-head-${id}">${k.head}</label><input type="text" id="d-head-${id}" data-bind="dest:headline" data-id="${id}" value="${esc(d.headline)}"></div>`:''}
    <div class="field">
      <div class="copyhead"><label class="lbl" for="d-copy-${id}" style="margin:0">${ch.kind==='announcement'?'Script':k.social?'Caption':'Copy'}</label><span class="counter ${k.limit&&len>k.limit?'over':''}" id="cnt-${id}">${len}${k.limit?' / '+k.limit:''} characters</span><span class="spacer"></span>
        ${d.campaignId&&(S.campaigns[d.campaignId]||{}).description?`<button class="btn sm" data-action="use-desc" data-id="${id}" title="Fill this with the campaign's description">Use campaign description</button>`:''}<button class="btn sm" data-action="copy-text" data-id="${id}">Copy</button>${CFG&&CFG.aiEnabled?`<button class="btn gold sm" data-action="ai-toggle" data-id="${id}">✦ Write with AI</button>`:''}</div>
      <textarea id="d-copy-${id}" data-bind="dest:copy" data-id="${id}" rows="8" placeholder="Write the ${esc(k.label.toLowerCase())} copy, or use Write with AI.">${esc(d.copy)}</textarea>
    </div>
    ${a.open?renderAI(d,a,k):''}
    <div class="field"><span class="lbl">Photos or video for this destination</span>
      <div class="photos">${imgs.map(p=>`<div class="photo ${isVideo(p)?'vid':''}"><a href="${esc(fileUrl(p))}" target="_blank" rel="noopener" aria-label="Open full size"></a>${mediaTag(p)}<button class="x" data-action="remove-photo" data-id="${id}" data-img="${esc(p)}" aria-label="Remove">×</button></div>`).join('')}
      <label class="addphoto" for="up-${id}">+ Add photos<br>or video</label><input type="file" accept="image/*,video/mp4,video/quicktime,.mp4,.mov,.m4v" multiple class="sr" id="up-${id}" data-upload="dest:${id}"></div>
      ${k.social?(()=>{ const gk=d.campaignId||'one-off'; if(!gfxLoaded[gk]){ gfxLoaded[gk]=true; setTimeout(()=>gfxRefresh(d.campaignId||null),0); }
        const jobs=gfxPostJobs(d.campaignId||null,id).filter(j=>j.status!=='done');
        return `<div class="row" style="gap:8px;margin-top:8px"><button class="btn gold sm" data-action="gfx-post-open" data-id="${id}">✦ Generate image</button><span class="small muted">${c.oneOff?'Describe the image you want':'A new image in the style of this campaign\'s graphics'}</span></div>
          ${jobs.map(j=>`<div class="gjob" style="margin-top:6px"><div style="min-width:0;flex:1"><div class="gj-t">AI image: ${esc(String(j.options.prompt||'').slice(0,60))}${String(j.options.prompt||'').length>60?'…':''}</div><div class="small muted">${gfxStatus(j)}</div></div>
            ${(j.status==='failed'||gfxStuck(j))?`<button class="btn sm" data-action="gfx-retry" data-id="${esc(j.id)}">Try again</button>`:''}${!gfxBusy(j)?`<button class="btn ghost iconbtn sm" data-action="gfx-dismiss" data-id="${esc(j.id)}" aria-label="Remove from this list">×</button>`:''}</div>`).join('')}`; })():''}
      ${k.social&&imgs.some(isVideo)&&imgs.length>1?`<span class="small" style="color:var(--bad);margin-top:6px">A video post can have just the one video. Remove the other items, or split them into separate posts.</span>`:''}
      ${k.social&&imgs.some(isVideo)?`<span class="small muted" style="margin-top:6px">Video posts go to Facebook as a Page video and to Instagram as a Reel. Vertical (9:16) MP4 works best. Max ${BIG_VIDEO_MB} MB.</span>`:''}
      ${!imgs.length&&c.coverPath?`<span class="small muted" style="margin-top:6px">Using the campaign's key art until you add a photo here.</span>`:''}
      ${(()=>{ const avail=(c.files||[]).filter(f=>(fileKind(f)==='image'||isVideo(f.path)) && !imgs.includes(f.path)); if(!avail.length) return '';
        return `<span class="small muted" style="margin:10px 0 6px">From campaign files (click to add):</span><div class="photos">${avail.map(f=>`<button class="photo ${isVideo(f.path)?'vid':''}" style="cursor:pointer" data-action="attach-file" data-id="${id}" data-file="${esc(f.path)}" title="Add ${esc(f.name)}">${mediaTag(f.path)}</button>`).join('')}</div>`; })()}
    </div>`;
  if(k.social) html += renderSocial(d,c,ch,previewImg,s);
  html+=renderComments(d.id)+`
    <div class="row"><button class="btn danger sm" data-action="delete-dest" data-id="${id}">Delete this destination</button><span class="spacer"></span><button class="btn primary" data-action="close-drawer">Done</button></div>
  </div></aside>`;
  return html;
}
function renderSocial(d,c,ch,previewImg,s){
  const both = ch.kind==='social', ig = ch.kind==='instagram', needsIG = both||ig; const id=d.id; const so=S.social;
  const where = both?'Facebook & Instagram':ig?'Instagram':'Facebook';
  const vid=(d.imagePaths||[]).find(isVideo);
  const pm=(cls)=> vid ? `<div class="pimg ${cls}"><video src="${esc(fileUrl(vid))}" controls muted playsinline preload="metadata"></video></div>` : `<div class="pimg" style="${previewImg?`background-image:url('${esc(fileUrl(previewImg))}')`:''}">${previewImg?'':'Add a photo or video'}</div>`;
  const fbPrev=`<div class="preview fb"><div class="ph"><img src="/assets/mark-color.svg" alt="">${esc(s.handle)}</div><div class="pcap">${esc(d.copy||'Your post text appears here.')}</div>${pm('')}</div>`;
  const igPrev=`<div class="preview ig"><div class="ph"><img src="/assets/mark-color.svg" alt="">${esc(s.handle)}${vid?' · Reel':''}</div>${pm('reel')}<div class="pcap"><strong>${esc(s.handle)}</strong> ${esc(d.copy||'Your caption appears here.')}</div></div>`;
  const preview=`<div class="field"><span class="lbl">${where} preview</span>${both?`<div class="row" style="align-items:flex-start;gap:12px">${fbPrev}${igPrev}</div>`:ig?igPrev:fbPrev}</div>`;
  const parts=d.publishedParts||{};
  const links=[['facebook','Facebook'],['instagram','Instagram']].filter(([k])=>parts[k]&&parts[k].url).map(([k,l])=>`<a class="btn sm" href="${esc(parts[k].url)}" target="_blank" rel="noopener">View on ${l}</a>`).join('');
  let box;
  if(d.publishedAt){
    box=`<div class="postbox ok"><span class="lbl" style="margin:0">Posted</span><div>Posted ${both?'to Facebook and Instagram ':''}${esc(new Date(d.publishedAt).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}.</div><div class="row">${links || (d.externalUrl?`<a class="btn sm" href="${esc(d.externalUrl)}" target="_blank" rel="noopener">View post</a>`:'')}</div></div>`;
  } else if(d.publishPending){
    box=`<div class="postbox"><span class="lbl" style="margin:0">Processing</span>
      <div class="row"><span class="spinner" aria-hidden="true"></span><span>${vid?'The video is processing':'Posting is in progress'}. It finishes in the background, usually within a few minutes. You can close this.</span></div>
      ${links?`<div class="row"><span class="small">Already posted:</span>${links}</div>`:''}
      <div><button class="btn sm" data-action="check-post" data-id="${id}" ${V.busy?'disabled':''}>${V.busy?'Checking…':'Check now'}</button></div></div>`;
  } else if(so && so.connected && (!needsIG || so.hasInstagram)){
    const when = d.date ? `${fmtD(d.date,{weekday:'long',month:'short',day:'numeric'})}${d.time?' at '+fmtT(d.time):' at 9:00 AM'}` : 'its publish date';
    box=`<div class="postbox ${d.publishError?'err':''}"><span class="lbl" style="margin:0">Post to ${where}</span>
      ${links?`<div class="row"><span class="small">Already posted:</span>${links}</div>`:''}
      ${d.publishError?`<div style="color:var(--bad)"><strong>Last try failed:</strong> ${esc(d.publishError)}</div><div><button class="btn sm" data-action="clear-error" data-id="${id}">Try again</button>${links?' <span class="small muted">Only the part that failed is retried.</span>':''}</div>`:''}
      <label class="check"><input type="checkbox" id="d-auto-${id}" data-bind="dest:autoPublish" data-id="${id}" ${d.autoPublish?'checked':''}><span>Post automatically on ${esc(when)}<br><span class="small muted">Only posts once its status is Scheduled.</span></span></label>
      <div class="row"><button class="btn primary sm" data-action="post-now" data-id="${id}" ${V.busy?'disabled':''}>${V.busy?'Posting…':'Post now'}</button>${needsIG?'<span class="small muted">Instagram needs at least one photo.</span>':''}</div></div>`;
  } else {
    box=`<div class="postbox"><span class="lbl" style="margin:0">Publish by hand</span>
      <ol class="steps"><li><button class="btn sm" data-action="copy-text" data-id="${id}">Copy caption</button></li>
      <li>${previewImg?`<a class="btn sm" href="${esc(fileUrl(previewImg))}" target="_blank" rel="noopener">Open photo to save it</a>`:'<span class="muted small">Add a photo above</span>'}</li>
      <li><a class="btn sm dark" href="${META_COMPOSER}" target="_blank" rel="noopener">Open Meta Business Suite</a></li>
      <li><button class="btn sm" data-action="set-status" data-id="${id}" data-status="${d.date&&d.date>todayStr()?'scheduled':'posted'}">Mark as ${d.date&&d.date>todayStr()?'scheduled':'posted'}</button></li></ol>
      <span class="small muted">${so&&so.connected&&needsIG&&!so.hasInstagram?'The connected Facebook Page has no Instagram professional account linked.':'An admin can connect Facebook in Settings to post straight from here.'}</span></div>`;
  }
  return preview+box;
}
function renderAI(d,a,k){
  const ch=channelById(d.channelId); const id=d.id; const sel=(f,opts)=>`<select id="ai-${f}-${id}" data-ai="${f}" data-id="${id}">${opts.map(([v,l])=>`<option value="${v}" ${a[f]===v?'selected':''}>${l}</option>`).join('')}</select>`;
  return `<div class="aibox" aria-live="polite"><div class="row"><span class="lbl" style="margin:0">Write with AI</span><span class="sub">Uses the campaign details and your church voice.</span></div>
    <div class="grid2">
      <div class="field"><label class="lbl" for="ai-tone-${id}">Tone</label>${sel('tone',[['voice','Our church voice'],['joyful','Joyful & vibrant'],['reverent','Reverent & reflective'],['urgent','Last call'],['playful','Playful (kids & families)']])}</div>
      <div class="field"><label class="lbl" for="ai-length-${id}">Length</label>${(()=>{ const r=l=>lenRange(ch.kind,l); return r('short') ? sel('length',[['short',`Short (${r('short').join('–')} words)`],['medium',`Medium (${r('medium').join('–')} words)`],['long',`Long (${r('long').join('–')} words)`]]) : '<div class="small muted" style="padding-top:10px">Set by this format</div>'; })()}</div>
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
  if(m.type==='graphics') return wrap(renderGfxModal(m), 560);
  if(m.type==='gfx-review') return wrap(renderGfxReview(m), 980);
  if(m.type==='gfx-post') return wrap(renderGfxPost(m), 640);
  if(m.type==='gfx-approve') return wrap(renderGfxApprove(m), 560);
  if(m.type==='change-pw') return wrap(`<h2 id="m-t">Change password</h2><form class="stack" data-form="change-pw" style="gap:12px"><div class="field"><label class="lbl" for="cp-1">New password</label><input type="password" id="cp-1" autocomplete="new-password" minlength="8" required></div><div class="field"><label class="lbl" for="cp-2">Confirm</label><input type="password" id="cp-2" autocomplete="new-password" minlength="8" required></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-action="modal-close">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`);
  if(m.type==='pick-campaign'){
    const ch=channelById(m.channelId); const t=todayStr();
    const list=Object.values(S.campaigns).sort((a,b)=>{ const ua=(a.date||'9999')>=t, ub=(b.date||'9999')>=t; if(ua!==ub) return ua?-1:1; return ua?(a.date||'9999').localeCompare(b.date||'9999'):(b.date||'').localeCompare(a.date||''); });
    return wrap(`<h2 id="m-t">Add ${esc(ch.name)} on ${esc(fmtD(m.date))}</h2><p class="sub" style="margin:0">Is this a one-off post, or part of a campaign?</p>
      <div class="stack" style="gap:8px"><button class="pickrow" data-action="pick-oneoff" style="border-style:dashed"><span class="sw" style="--c:${ONEOFF_COLOR};cursor:inherit"></span><span style="flex:1"><strong>One-off post</strong><br><span class="small muted">Not part of a campaign</span></span></button>${list.map(c=>`<button class="pickrow" data-action="pick-campaign" data-id="${esc(c.id)}"><span class="sw" style="--c:${esc(c.color)};cursor:inherit"></span><span style="flex:1"><strong>${esc(c.title)}</strong><br><span class="small muted">${esc(fmtRange(c))}</span></span></button>`).join('')||'<div class="muted">No campaigns yet.</div>'}</div>
      <div class="row"><button class="btn" data-action="new-campaign">+ New campaign instead</button><span class="spacer"></span><button class="btn" data-action="modal-close">Cancel</button></div>`);
  }
  if(m.type==='icon-picker'){ const ch=channelById(m.channelId); const k=kindOf(ch); const cur=iconOf(ch);
    return wrap(`<h2 id="m-t">Icon for ${esc(ch.name)}</h2>
      <div class="row" style="gap:14px"><div class="iconprev" style="--k:${k.color}"><img src="${esc(iconUrl(cur))}" alt=""></div><div class="small muted">Current: <code>${esc(cur)}</code><br>Search thousands of free icons from Lucide, plus brand logos from Simple Icons.</div></div>
      <div class="field"><label class="lbl" for="icon-q">Search icons</label><input type="text" id="icon-q" placeholder="Try: youtube, calendar, music, kids, coffee" autocomplete="off"></div>
      <div class="icongrid" id="icon-results">${iconCells(SUGGESTED_ICONS, cur)}</div>
      <div class="row"><button class="btn sm" data-action="icon-reset">Use default icon</button><span class="spacer"></span><button class="btn" data-action="modal-close">Done</button></div>`, 680); }
  if(m.type==='req-approve'||m.type==='req-decline'){ const r=S.requests[m.id]; const ap=m.type==='req-approve'; const planned=r.campaign_id&&S.campaigns[r.campaign_id]; const pds=planned?destsOf(r.campaign_id):[];
    return wrap(`<h2 id="m-t">${ap?'Approve':'Decline'} request</h2><p class="prose" style="margin:0">${esc(r.title)} · from ${esc(r.requester_name)}</p>
      ${ap&&!planned?`<label class="check"><input type="checkbox" id="ra-camp" ${m.createCampaign?'checked':''}><span>Create a campaign with the requested destinations<br><span class="small muted">They're scheduled 3 days before the event. To choose the dates yourself first, cancel and use <strong>Plan on calendar</strong>.</span></span></label>`:''}
      ${ap&&planned?`<div class="field"><span class="lbl">Schedule in the email</span><div class="dlist">${pds.map(d=>{ const ch=channelById(d.channelId); return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">${kb(ch)}<strong style="flex:1">${esc(ch.name)}</strong><span class="small">${esc(fmtD(d.date,{weekday:'short',month:'short',day:'numeric'}))}${timeTxt(d)}</span></div>`; }).join('')||'<span class="muted small">No destinations planned.</span>'}</div></div>`:''}
      ${ap?`<label class="check"><input type="checkbox" id="ra-sched" ${m.includeSchedule!==false?'checked':''}><span>Include the destinations and dates in the email</span></label>`:''}
      ${!ap&&planned?`<label class="check"><input type="checkbox" id="ra-rmplan" checked><span>Delete the planned campaign and its ${pds.length} destination${pds.length===1?'':'s'}</span></label>`:''}
      <label class="check"><input type="checkbox" id="ra-notify" ${m.notify?'checked':''}><span>Email ${esc(r.requester_name)} (${esc(r.requester_email)})</span></label>
      <div class="field"><label class="lbl" for="ra-note">Message to include <span class="small muted" style="text-transform:none;letter-spacing:0">optional</span></label><textarea id="ra-note" rows="4" placeholder="${ap?'e.g. We\'ll have this in the Weekly Update on the 12th and on social media the week of the event.':'e.g. This falls outside our communication guidelines. Let\'s talk about other options.'}">${esc(m.note||'')}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn ${ap?'primary':'dark'}" data-action="${ap?'req-approve-go':'req-decline-go'}" ${V.busy?'disabled':''}>${V.busy?'Working…':ap?'Approve':'Decline'}</button></div>`, 600); }
  if(m.type==='camp-review'){ const c=S.campaigns[m.id]; const sub=memberById(c.createdBy); const ds=destsOf(c.id);
    return wrap(`<h2 id="m-t">${m.approve?'Approve':'Decline'} campaign</h2><p class="prose" style="margin:0">${esc(c.title)} · ${esc(fmtRange(c))}</p>
      ${m.approve?`<div class="field"><span class="lbl">${ds.length} destination${ds.length===1?'':'s'}</span><div class="dlist">${ds.map(d=>{ const ch=channelById(d.channelId); return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">${kb(ch)}<strong style="flex:1">${esc(ch.name)}</strong><span class="small">${esc(fmtD(d.date,{weekday:'short',month:'short',day:'numeric'}))}${timeTxt(d)}</span>${d.assigneeId?av(d.assigneeId):''}</div>`; }).join('')||'<span class="muted small">No destinations yet.</span>'}</div><span class="small muted" style="margin-top:6px">Assigned people get their emails when you approve.</span></div>`:''}
      ${sub&&sub.id!==(me()||{}).id?`<label class="check"><input type="checkbox" id="cr-notify" ${m.notify?'checked':''}><span>Email ${esc(sub.name)}</span></label>`:''}
      <div class="field"><label class="lbl" for="cr-note">Message <span class="small muted" style="text-transform:none;letter-spacing:0">optional</span></label><textarea id="cr-note" rows="3" placeholder="${m.approve?'e.g. Looks great!':'e.g. Let\'s move the Facebook post closer to the event.'}">${esc(m.note)}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn ${m.approve?'primary':'dark'}" data-action="camp-review-go" ${V.busy?'disabled':''}>${V.busy?'Working…':m.approve?'Approve':'Decline'}</button></div>`, 600); }
  if(m.type==='pick-channel') return wrap(`<h2 id="m-t">Add a destination on ${esc(fmtD(m.date,{weekday:'long',month:'long',day:'numeric'}))}</h2>
      <div class="stack" style="gap:8px">${settings().channels.map(ch=>`<button class="pickrow" data-action="pick-channel" data-id="${esc(ch.id)}">${kb(ch)}<strong>${esc(ch.name)}</strong></button>`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button></div>`);
  if(m.type==='add-dests'){
    const c=S.campaigns[m.campaignId]; const used=new Set(destsOf(m.campaignId).map(d=>d.channelId));
    const rows=settings().channels.map(ch=>{ const r=m.rows[ch.id]||(m.rows[ch.id]={on:false,date:todayStr(),time:defaultTime(ch.id),assigneeId:defaultOwner(ch.id)}); const C=esc(ch.id); return `<div class="mrow ${r.on?'':'off'}"><input type="checkbox" id="m-on-${C}" data-mrow="${C}:on" ${r.on?'checked':''}><label for="m-on-${C}" class="row" style="gap:8px;cursor:pointer">${kb(ch)}<span><strong>${esc(ch.name)}</strong>${used.has(ch.id)?' <span class="small muted">· already added</span>':''}</span></label>
      <input class="ctl" type="date" id="m-date-${C}" data-mrow="${C}:date" value="${esc(r.date)}" aria-label="${esc(ch.name)} date">${hasTime(ch)?`<input class="ctl" type="time" id="m-time-${C}" data-mrow="${C}:time" value="${esc(r.time)}" aria-label="${esc(ch.name)} time">`:'<span class="ctl small muted">Date only</span>'}<select class="ctl" id="m-who-${C}" data-mrow="${C}:assigneeId" aria-label="${esc(ch.name)} assignee">${memberOptions(r.assigneeId)}</select></div>`; }).join('');
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
// Only Facebook, Instagram and Social destinations have a time (they can post automatically). Everything else is date-only.
const hasTime = chOrId => !!kindOf(typeof chOrId==='string'?channelById(chOrId):chOrId).social;
function defaultTime(chanId){ return hasTime(chanId) ? '09:00' : ''; }
const isSocialDest = d => hasTime(d.channelId);
const statusesFor = d => isSocialDest(d) ? STATUSES : TASK_STATUSES;
// The status to show: tasks are only ever Scheduled or Done, whatever older data says.
// Social posts are Draft, Scheduled or Posted (older In review counts as Draft, older Approved as Scheduled).
const st = d => isSocialDest(d) ? ({review:'draft', approved:'scheduled'}[d.status] || d.status || 'draft') : (d.status==='posted' ? 'posted' : 'scheduled');
const isDone = d => st(d)==='posted';
const needsApproval = d => isSocialDest(d) && st(d)==='draft';
const statusLabel = d => (statusesFor(d).find(x=>x[0]===st(d))||statusesFor(d)[0])[1];
const timeTxt = (d, sep=' · ') => hasTime(d.channelId) && d.time ? sep+fmtT(d.time) : '';
function openAddDests(cid){
  const c=S.campaigns[cid]; const base=c&&parseYmd(c.date);
  let def = base ? addDays(base,-3) : addDays(new Date(),7); if(ymd(def)<todayStr()) def=new Date();
  if(c && c.adStart && ymd(def)<c.adStart) def=parseYmd(c.adStart);
  const rows={}; for(const ch of settings().channels) rows[ch.id]={on:false, date:ymd(def), time:defaultTime(ch.id), assigneeId:defaultOwner(ch.id)};
  V.modal={type:'add-dests', campaignId:cid, rows}; render(true);
}

/* ---------- actions ---------- */
function defaultOwner(chId){ const o=channelById(chId).ownerId; return o && memberById(o) ? o : ''; }
// Announcement destinations (e.g. the announcement video) start with the campaign description as their script,
// and follow it while nobody has edited the script.
const isAnnouncement = ch => !!ch && (ch.kind==='announcement' || /announc/i.test(ch.name||''));
function fillAnnouncement(d){
  const c=S.campaigns[d.campaignId]; if(!c||!c.description||(d.copy||'').trim()) return false;
  if(!isAnnouncement(channelById(d.channelId))) return false;
  d.copy=c.description; return true;
}
function newDest(campaignId, channelId, date, time, assigneeId, opts={}){
  const silent = opts.silent || isPending(campaignId);  // planned requests: email when approved
  const d={id:uid(), campaignId:campaignId||'', title:opts.title||'', details:'', channelId, date:date||'', time:time||'', assigneeId:(assigneeId===undefined||assigneeId===''||assigneeId===null)?defaultOwner(channelId):(assigneeId||''), status:'draft', headline:'', copy:'', notes:'', imagePaths:[], autoPublish:false, publishedAt:'', externalUrl:'', publishError:''};
  d.status = hasTime(channelId) ? 'draft' : 'scheduled';
  fillAnnouncement(d);
  saveDest(d); if(d.assigneeId && !silent) notifyAssigned(d.id); return d;
}
// New campaigns are unsaved drafts until someone clicks "Submit campaign", so blank campaigns are never stored.
function newCampaign(){
  const c={id:uid(), _draft:true, title:'', date:'', endDate:'', time:'', endTime:'', adStart:todayStr(), adEnd:'', location:'', description:'', ministry:'', link:'', color:PALETTE[Object.keys(S.campaigns).length % PALETTE.length], coverPath:'', files:[], status:'pending'};
  S.campaigns[c.id]=c; return c;
}
function confirmBox(title, body, fn, yes){ V.modal={type:'confirm', title, body, fn, yes}; render(true); }
async function copyText(text){ try{ await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }catch(e){ toast('Copy was blocked. Select the text and press Ctrl+C (⌘C on Mac).'); } }
function pathInUse(path){ return Object.values(S.dests).some(d=>(d.imagePaths||[]).includes(path)) || Object.values(S.campaigns).some(c=>c.coverPath===path || (c.files||[]).some(f=>f.path===path)); }
async function deleteFileIfUnused(path){ if(path && !isRemote(path) && !pathInUse(path)) await sb.storage.from('files').remove([path]).catch(()=>{}); }

function applyPostResult(d, r){
  d.publishedParts=r.parts||d.publishedParts; d.publishError='';
  if(r.done){ d.status='posted'; d.publishedAt=new Date().toISOString(); d.externalUrl=r.url||''; d.publishPending=false; toast('Posted!'); }
  else { d.publishPending=true; toast('Started. It will finish posting in the background in a few minutes.'); }
}
const A = {
  async 'newsletter-sync'(){ flushAll(); V.busy=true; render(true);
    try{ const r=await api('newsletter-sync',{});
      V.nlResult = r.skipped ? r.skipped : `Sent ${r.sent} item${r.sent===1?'':'s'}: ${r.added} added, ${r.updated} updated, ${r.removed} removed${r.kept?`, ${r.kept} left alone because they were edited in the studio`:''}.${r.photosCopied?` ${r.photosCopied} photo${r.photosCopied===1?'':'s'} copied to Cloudinary.`:''}${r.photosFailed?` ${r.photosFailed} photo${r.photosFailed===1?'':'s'} couldn't be copied yet and will be tried again next hour.`:''}`;
      toast(r.skipped ? r.skipped : 'Newsletter updated'); }
    catch(e){ V.nlResult=''; toast(e.message); }
    V.busy=false; render(true); },
  'pick-icon'(el){ V.modal={type:'icon-picker', channelId:el.dataset.id}; render(true); setTimeout(()=>{ const q=document.getElementById('icon-q'); if(q) q.focus(); },30); },
  'set-icon'(el){ const ch=settings().channels.find(c=>c.id===V.modal.channelId); if(!ch) return; ch.icon=el.dataset.icon; saveSettings(); V.modal=null; render(true); toast(`Icon updated for ${ch.name}`); },
  'icon-reset'(){ const ch=settings().channels.find(c=>c.id===V.modal.channelId); if(!ch) return; delete ch.icon; saveSettings(); V.modal=null; render(true); },
  'quick-delete'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const copy=clone(d); const name=channelById(d.channelId).name;
    if(V.openDest===d.id) V.openDest=null; removeDest(d.id); render(true);
    toast(`Removed ${name}`, ()=>{ S.dests[copy.id]=copy; writeKey('d:'+copy.id); render(true); toast(`${name} restored`); }); },
  'toast-undo'(){ const fn=toastUndo; toastUndo=null; document.getElementById('toast').innerHTML=''; if(fn) fn(); },
  'req-filter'(el){ V.reqFilter=el.dataset.f; V.requestId=null; if(location.hash!=='#requests') history.replaceState(null,'','#requests'); render(true); },
  'open-request'(el){ V.requestId=el.dataset.id; history.replaceState(null,'','#request-'+el.dataset.id); render(true);
    if(window.matchMedia('(max-width: 860px)').matches) setTimeout(()=>{ const p=document.querySelector('.inbox > .panel'); if(p) p.scrollIntoView({behavior:'smooth', block:'start'}); },30); },
  'copy-form-link'(){ copyText(location.origin+'/request'); },
  'req-approve'(el){ if(!isAdmin()){ toast('Only admins can approve requests.'); return; } V.modal={type:'req-approve', id:el.dataset.id, createCampaign:true, notify:true, includeSchedule:true, note:''}; render(true); },
  'req-decline'(el){ if(!isAdmin()){ toast('Only admins can decline requests.'); return; } V.modal={type:'req-decline', id:el.dataset.id, notify:true, note:''}; render(true); },
  'req-approve-go'(){ const m=V.modal; m.note=(document.getElementById('ra-note')||{}).value||''; m.createCampaign=!!(document.getElementById('ra-camp')||{}).checked; m.notify=!!(document.getElementById('ra-notify')||{}).checked; m.includeSchedule=!!(document.getElementById('ra-sched')||{}).checked; approveRequest(m); },
  'req-decline-go'(){ const m=V.modal; m.note=(document.getElementById('ra-note')||{}).value||''; m.notify=!!(document.getElementById('ra-notify')||{}).checked; m.removePlan=!!(document.getElementById('ra-rmplan')||{}).checked; declineRequest(m); },
  'req-plan'(el){ planRequest(el.dataset.id); },
  'req-delete'(el){ if(!isAdmin()) return; const r=S.requests[el.dataset.id]; confirmBox('Delete this request?', `"${r.title}" from ${r.requester_name} will be removed. Its files stay in storage if a campaign uses them.`, async ()=>{
      const { error } = await sb.from('requests').delete().eq('id',r.id); if(error){ toast(error.message); return; } delete S.requests[r.id]; V.requestId=null; render(true); }); },
  'auth-mode'(el){ V.authMode=el.dataset.mode; V.authErr=''; V.authMsg=''; render(true); },
  'sign-out'(){ flushAll(); sb.auth.signOut(); },
  'change-pw'(){ V.modal={type:'change-pw'}; render(true); },
  async 'submit-campaign'(el){ const c=S.campaigns[el.dataset.id]; if(!c||!c._draft) return;
    if(!c.title.trim()){ toast('Give the campaign a name first.'); const t=document.getElementById('c-title'); if(t) t.focus(); return; }
    if(!c.date && !(c.adStart && c.adEnd)){ toast('Add an event date, or (for things like an offering) the Advertise from and until dates.'); const t=document.getElementById(c.adStart?'c-adEnd':'c-date'); if(t) t.focus(); return; }
    V.busy=true; render(true);
    delete c._draft; c.status = isAdmin() ? 'approved' : 'pending';
    writeKey('c:'+c.id); await waitForSaves();
    for(const d of destsOf(c.id)) writeKey('d:'+d.id);
    await waitForSaves();
    try{
      if(c.status==='approved'){ const n=await notifyCampaignAssignments(c.id); toast(`Campaign created${n?`. ${n} assignment email${n===1?'':'s'} sent.`:'.'}`); }
      else { const r=await api('campaign-action',{action:'submit', id:c.id}); toast(r.emailed===false?'Submitted for approval. (The email to admins didn\'t send.)':'Submitted. The admins have been emailed to approve it.'); }
    }catch(e){ toast('Saved, but: '+e.message); }
    V.busy=false; render(true); },
  'discard-draft'(el){ const c=S.campaigns[el.dataset.id]; if(!c) return;
    const go=()=>{ const paths=[c.coverPath, ...(c.files||[]).map(f=>f.path), ...destsOf(c.id).flatMap(d=>d.imagePaths||[])].filter(Boolean);
      for(const d of destsOf(c.id)) delete S.dests[d.id]; delete S.campaigns[c.id];
      if(paths.length) sb.storage.from('files').remove(paths).catch(()=>{});
      location.hash='campaigns'; toast('Draft discarded'); };
    if(!c.title && !c.date && !c.description && !destsOf(c.id).length && !(c.files||[]).length) return go();
    confirmBox('Discard this draft?', 'It was never saved, so everything on this page will be lost.', go, 'Discard'); },
  async 'resubmit-campaign'(el){ const c=S.campaigns[el.dataset.id]; if(!c) return;
    try{ const r=await api('campaign-action',{action:'submit', id:c.id}); c.status='pending'; c.reviewNote=''; toast('Submitted again for approval.'); }catch(e){ toast(e.message); } render(true); },
  'camp-approve'(el){ V.modal={type:'camp-review', id:el.dataset.id, approve:true, notify:true, note:''}; render(true); },
  'camp-decline'(el){ V.modal={type:'camp-review', id:el.dataset.id, approve:false, notify:true, note:''}; render(true); },
  async 'camp-review-go'(){ const m=V.modal; const c=S.campaigns[m.id]; if(!c) return;
    m.note=(document.getElementById('cr-note')||{}).value||''; m.notify=!!(document.getElementById('cr-notify')||{}).checked; V.busy=true; render(true);
    try{ const r=await api('campaign-action',{action:m.approve?'approve':'decline', id:c.id, note:m.note, notify:m.notify});
      c.status=r.status; c.reviewNote=m.note; V.modal=null;
      const n = m.approve ? await notifyCampaignAssignments(c.id) : 0;
      toast((m.approve?'Approved.':'Declined.') + (r.emailed?' The submitter was emailed.':'') + (n?` ${n} assignment email${n===1?'':'s'} sent.`:''));
    }catch(e){ toast(e.message); }
    V.busy=false; render(true); },
  'new-campaign'(){ const c=newCampaign(); V.modal=null; location.hash='campaign-'+c.id; setTimeout(()=>{ const el=document.getElementById('c-title'); if(el){ el.focus(); el.select(); } },60); },
  'open-campaign'(el){ V.openDest=null; location.hash='campaign-'+el.dataset.id; },
  'open-dest'(el){ V.openDest=el.dataset.id; render(true); },
  'close-drawer'(){ V.openDest=null; render(true); },
  'cal-prev'(){ V.anchor = V.calMode!=='month'? addDays(V.anchor,-7) : new Date(V.anchor.getFullYear(), V.anchor.getMonth()-1, 1); render(true); },
  'cal-next'(){ V.anchor = V.calMode!=='month'? addDays(V.anchor,7) : new Date(V.anchor.getFullYear(), V.anchor.getMonth()+1, 1); render(true); },
  'cal-today'(){ V.anchor=new Date(); render(true); },
  'cal-mode'(el){ V.calMode=el.dataset.mode; ls('cc.calMode',V.calMode); render(true); },
  'cal-goweek'(el){ V.anchor=parseYmd(el.dataset.date); V.calMode=window.matchMedia('(max-width: 760px)').matches?'list':'week'; render(true); },
  'agenda-add'(el){ V.modal={type:'pick-channel', date:el.dataset.date, then:'campaign'}; render(true); },
  'cell-add'(el){ V.modal={type:'pick-campaign', channelId:el.dataset.chan, date:el.dataset.date}; render(true); },
  'new-oneoff'(){ const t=todayStr(); const days=V.calMode!=='month'?[ymd(startOfWeek(V.anchor)), ymd(addDays(startOfWeek(V.anchor),6))]:[ymd(new Date(V.anchor.getFullYear(),V.anchor.getMonth(),1)), ymd(new Date(V.anchor.getFullYear(),V.anchor.getMonth()+1,0))];
    const date = t>=days[0]&&t<=days[1] ? t : (days[0]>t ? days[0] : t);
    const ch = settings().channels.find(c=>c.kind==='social') || settings().channels[0];
    const d=newDest(null, ch.id, date, defaultTime(ch.id), '', {title:'One-off post'}); V.modal=null; V.openDest=d.id; if(V.view!=='calendar') location.hash='calendar'; render(true);
    setTimeout(()=>{ const el=document.getElementById('d-title-'+d.id); if(el){ el.focus(); el.select(); } },60); },
  'pick-oneoff'(){ const m=V.modal; const d=newDest(null, m.channelId, m.date, defaultTime(m.channelId), '', {title:'One-off post'}); V.modal=null; V.openDest=d.id; render(true);
    setTimeout(()=>{ const el=document.getElementById('d-title-'+d.id); if(el){ el.focus(); el.select(); } },60); },
  'pick-campaign'(el){ const m=V.modal; const d=newDest(el.dataset.id, m.channelId, m.date, defaultTime(m.channelId), ''); V.modal=null; V.openDest=d.id; render(true); },
  'ad-add'(el){ V.modal={type:'pick-channel', campaignId:el.dataset.id, date:el.dataset.date}; render(true); },
  'pick-channel'(el){ const m=V.modal; if(m.then==='campaign'){ V.modal={type:'pick-campaign', channelId:el.dataset.id, date:m.date}; render(true); return; } const d=newDest(m.campaignId, el.dataset.id, m.date, defaultTime(el.dataset.id), ''); V.modal=null; V.openDest=d.id; render(true); },
  'add-dests'(el){ openAddDests(el.dataset.id); },
  'modal-close'(){ V.modal=null; render(true); },
  'gfx-post-open'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const c=S.campaigns[d.campaignId];
    const last=gfxPostJobs(d.campaignId||null,d.id).slice(-1)[0]; const o=(last&&last.options)||{};
    const imgs=c ? (c.files||[]).filter(isImgFile).map(f=>f.path) : (d.imagePaths||[]).filter(p=>!isVideo(p));
    const def=o.refs||(c&&c.coverPath&&imgs.includes(c.coverPath)?[c.coverPath]:imgs.slice(0,1));
    V.modal={type:'gfx-post', id:d.id, refs:def.filter(p=>imgs.includes(p)), shape:o.shape||'feed', style:o.style||'fbss', prompt:''}; render(true); setTimeout(()=>{ const t=document.getElementById('gp-prompt'); if(t) t.focus(); },50); },
  async 'gfx-post-go'(){ const m=V.modal; if(!m||V.busy) return; const d=S.dests[m.id]; if(!d) return; const c=S.campaigns[d.campaignId];
    m.prompt=document.getElementById('gp-prompt').value.trim(); m.shape=document.getElementById('gp-shape').value; m.style=document.getElementById('gp-style').value;
    if(!m.prompt){ toast('Describe what the image should show or say'); document.getElementById('gp-prompt').focus(); return; }
    V.busy=true; render(true);
    try{ await gfxStart(c?c.id:null,[{kind:'social', options:{post:true, destId:d.id, refs:m.refs.slice(0,4), inspo:(m.inspo||[]).slice(0,INSPO_MAX), shape:m.shape, style:m.style, prompt:m.prompt, text:{title:c?c.title:(d.title||'')}}}]); V.modal=null; toast('Generating the image. It will appear in this post\'s photos in a minute or two.'); }
    catch(e){ toast(e.message||'Could not start'); }
    V.busy=false; render(true); },
  'inspo-remove'(el){ const m=V.modal; if(!m) return; gfxKeepTyped(); m.inspo=(m.inspo||[]).filter((_,i)=>i!==+el.dataset.i); render(true); },
  'brand-toggle'(el){ const a=settings().brand.assets[+el.dataset.i]; if(!a) return; a.on=el.checked; saveSettings(); render(true); },
  'brand-remove'(el){ const b=settings().brand; const a=b.assets[+el.dataset.i]; if(!a) return;
    confirmBox('Remove this brand image?', 'The AI will stop using it.', ()=>{ b.assets=b.assets.filter(x=>x!==a); saveSettings(); sb.storage.from('files').remove([a.path]).catch(()=>{}); render(true); }, 'Remove'); },
  'brand-reset-notes'(){ settings().brand.notes=DEFAULT_BRAND_NOTES; saveSettings(); render(true); toast('Brand notes reset'); },
  'gfx-open'(el){ const last=gfxJobs(el.dataset.id).filter(j=>j.kind==='concept').slice(-1)[0]; const o=(last&&last.options)||{}; V.modal={type:'graphics', id:el.dataset.id, pick:{poster:true,title:true,background:true}, social:1, socialD:1, inspo:o.inspo||[], style:o.style||'fbss', notes:o.notes||'', title:(o.text&&o.text.title)||S.campaigns[el.dataset.id].title||''}; render(true); },
  async 'gfx-go'(){ const m=V.modal; if(!m||V.busy) return; const c=S.campaigns[m.id];
    const style=document.getElementById('gf-style').value, notes=document.getElementById('gf-notes').value.trim(), title=document.getElementById('gf-name').value.trim();
    Object.assign(m, gfxReadPick(), { style, notes, title });
    if(!title){ toast('Add the title for the graphics'); return; }
    const text={title};
    if(!m.pick.poster&&!m.pick.title&&!m.pick.background&&!m.social&&!m.socialD){ toast('Choose at least one graphic'); return; }
    const plan={...m.pick, social:m.social, socialD:m.socialD}, batch=uid();
    flushAll(); V.busy=true; render(true);
    try{ const dirs=await gfxDirections(c, 2, [], style, notes, title);
      await gfxStart(c.id, dirs.map((d,i)=>({kind:'concept', options:{style, notes, text, plan, batch, inspo:(m.inspo||[]).slice(0,INSPO_MAX), variation:i+1, direction:d.name, brief:d.brief}}))); V.modal=null; toast('Designing two concepts. You can keep working; this takes a minute or two.'); }
    catch(e){ toast(e.message||'Could not start'); }
    V.busy=false; render(true); },
  'gfx-review'(el){ V.modal={type:'gfx-review', id:el.dataset.id}; render(true); gfxSchedule(); },
  async 'gfx-another'(el){ const cid=el.dataset.id; const r=gfxRound(cid); if(!r||V.busy) return; const o=r.list[0].options;
    V.busy=true; render(true);
    try{ const prior=r.list.filter(j=>j.options.brief).map(j=>({name:j.options.direction, brief:j.options.brief}));
      const [d]=await gfxDirections(S.campaigns[cid], 1, prior, o.style, o.notes, o.text&&o.text.title);
      await gfxStart(cid,[{kind:'concept', options:{style:o.style, notes:o.notes, text:o.text, inspo:o.inspo||[], plan:o.plan, batch:o.batch, variation:Math.max(...r.list.map(j=>j.options.variation||1))+1, direction:d.name, brief:d.brief}}]); }
    catch(e){ toast(e.message); }
    V.busy=false; render(true); },
  'gfx-choose'(el){ const j=S.gjobs[el.dataset.id]; if(!j) return; const p=j.options.plan||{}; const c=S.campaigns[j.campaign_id];
    V.modal={type:'gfx-approve', id:j.id, pick:{poster:p.poster!==false, title:p.title!==false, background:p.background!==false}, social:p.social===undefined?1:p.social, socialD:p.socialD||0,
      text:{ title:(j.options.text&&j.options.text.title)||c.title, when:gfxWhenText(c), where:c.location||'', extra:c.link?String(c.link).replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,''):'' }}; render(true); },
  async 'gfx-approve-go'(){ const m=V.modal; if(!m||V.busy) return; const j=S.gjobs[m.id]; if(!j) return;
    Object.assign(m, gfxReadPick()); const {pick,social,socialD}=m;
    const v=id=>document.getElementById(id).value.trim(); m.text={...m.text, when:v('gf-when'), where:v('gf-where'), extra:v('gf-extra')};
    if(!pick.poster&&!pick.title&&!pick.background&&!social&&!socialD){ toast('Choose at least one graphic'); return; }
    V.busy=true; render(true);
    try{
      const round=gfxRound(j.campaign_id);
      const chosenOpts={...j.options, text:m.text};
      await sb.from('graphics_jobs').update({ status:'chosen', options:chosenOpts, updated_at:new Date().toISOString() }).eq('id',j.id); S.gjobs[j.id]={...j,status:'chosen',options:chosenOpts};
      for(const o of (round?round.list:[])) if(o.id!==j.id && o.status!=='chosen'){ await sb.from('graphics_jobs').update({ status:'passed', updated_at:new Date().toISOString() }).eq('id',o.id); S.gjobs[o.id]={...o,status:'passed'}; }
      const base={style:j.options.style, notes:j.options.notes, text:m.text, brief:j.options.brief, direction:j.options.direction, ref:j.art_path, concept:j.id}, list=[];
      if(pick.title) list.push({kind:'title', options:{...base}, artPath:j.art_path});
      if(pick.background) list.push({kind:'background', options:{...base}});
      if(pick.poster) list.push({kind:'poster', options:{...base}});
      for(let i=1;i<=social;i++) list.push({kind:'social', options:{...base, variation:i}});
      for(let i=1;i<=socialD;i++) list.push({kind:'social', options:{...base, details:true, variation:social+i}});
      V.modal=null; await gfxStart(j.campaign_id, list);
      toast('Making your graphics. They\'ll be saved to Campaign files as they finish.');
    }catch(e){ toast(e.message||'Could not start'); }
    V.busy=false; render(true); },
  'gfx-cancel'(el){ const cid=el.dataset.id; const r=gfxRound(cid); if(!r) return;
    confirmBox('Start over?', 'This clears these concepts so you can design graphics again.', async ()=>{ for(const j of r.list){ delete S.gjobs[j.id]; await sb.from('graphics_jobs').update({ status:'passed', updated_at:new Date().toISOString() }).eq('id',j.id); } render(true); }, 'Start over'); },
  async 'gfx-more'(el){ const cid=el.dataset.id; const ch=gfxChosen(cid); if(!ch) return; const n=gfxJobs(cid).filter(j=>j.kind==='social').length+1; const details=!!el.dataset.details;
    const t=ch.options.text||{}; if(details && !t.when && !t.where && !t.extra){ toast('Add the event details first: choose the concept again with Design graphics, or edit the campaign.'); return; }
    try{ await gfxStart(cid,[{kind:'social',options:{style:ch.options.style,notes:ch.options.notes,text:t,brief:ch.options.brief,direction:ch.options.direction,ref:ch.art_path,concept:ch.id,variation:n,details}}]); toast('Making another social post…'); }catch(e){ toast(e.message); } },
  async 'gfx-retry'(el){ const j=S.gjobs[el.dataset.id]; if(!j) return;
    await sb.from('graphics_jobs').delete().eq('id',j.id); delete S.gjobs[j.id];
    try{ await gfxStart(j.campaign_id,[{kind:j.kind,options:j.options}]); }catch(e){ toast(e.message); render(true); } },
  async 'gfx-dismiss'(el){ const id=el.dataset.id; delete S.gjobs[id]; render(true); await sb.from('graphics_jobs').delete().eq('id',id); },
  'modal-bg'(el,e){ if(e.target===el){ V.modal=null; render(true); } },
  'confirm-yes'(){ const fn=V.modal&&V.modal.fn; V.modal=null; if(fn) fn(); render(true); },
  'modal-save-dests'(){ const m=V.modal; let n=0; for(const [cid,r] of Object.entries(m.rows)){ if(r.on){ newDest(m.campaignId,cid,r.date,r.time,r.assigneeId||false); n++; } } V.modal=null; render(true); toast(`Added ${n} destination${n===1?'':'s'}`); },
  'delete-campaign'(el){ const c=S.campaigns[el.dataset.id]; confirmBox('Delete this campaign?', `"${c.title}" and its ${destsOf(c.id).length} destinations will be removed for everyone.`, ()=>{ removeCampaign(c.id); location.hash='campaigns'; }); },
  'delete-dest'(el){ const d=S.dests[el.dataset.id]; confirmBox('Delete this destination?', `${channelById(d.channelId).name} for "${campOf(d).title}" will be removed for everyone.`, ()=>{ V.openDest=null; removeDest(d.id); }); },
  'work-done'(el){
    const sc=el.dataset.scope, list=workDue(el.dataset.person, sc); if(!list.length) return;
    const what={overdue:'overdue', today:'due today', both:'overdue or due today'}[sc];
    confirmBox(`Mark ${list.length} task${list.length===1?'':'s'} done?`, `Every task ${what} on this list will be marked Done. You can change any of them back from the task itself.`,
      ()=>{ for(const d of list){ d.status='posted'; saveDest(d); } render(true); toast(`${list.length} task${list.length===1?'':'s'} marked done`); }, 'Mark done'); },
  'bulk-done'(el){
    const cid=el.dataset.chan, day=el.dataset.date, [a,b]=V.calRange||[];
    const list=filteredDests().filter(d=>d.channelId===cid && !isSocialDest(d) && !isDone(d) && (day ? d.date===day : (d.date>=a && d.date<=b)));
    if(!list.length) return; const ch=channelById(cid);
    const when=day ? fmtD(day,{weekday:'long',month:'long',day:'numeric'}) : 'in this view';
    confirmBox(`Mark ${list.length} ${ch.name} piece${list.length===1?'':'s'} done?`, `Every open ${ch.name} piece ${day?'on '+when:when} will be marked Done. You can change any of them back from the piece itself.`,
      ()=>{ for(const d of list){ d.status='posted'; saveDest(d); } render(true); toast(`${list.length} ${ch.name} piece${list.length===1?'':'s'} marked done`); }, 'Mark done'); },
  'set-status'(el){ const d=S.dests[el.dataset.id]; if(!d) return; d.status=el.dataset.status; saveDest(d); render(true); if(!isSocialDest(d) && d.status==='posted') toast('Marked done'); },
  'send-comment'(el){ sendComment(el.dataset.id); },
  'del-comment'(el){ const id=el.dataset.id, dest=el.dataset.dest;
    confirmBox('Delete this comment?', 'It will be removed for everyone.', async ()=>{ const { error } = await sb.from('destination_comments').delete().eq('id',id); if(error){ toast(error.message); return; } S.comments[dest]=(S.comments[dest]||[]).filter(c=>c.id!==id); render(true); }, 'Delete'); },
  'approve-all'(el){ for(const d of destsOf(el.dataset.id)) if(isSocialDest(d)&&st(d)==='draft'){ d.status='scheduled'; saveDest(d); } render(true); },
  'set-color'(el){ const c=S.campaigns[el.dataset.id]; c.color=el.dataset.color; saveCampaign(c); render(true); },
  'remove-cover'(el){ const c=S.campaigns[el.dataset.id]; const p=c.coverPath; c.coverPath=''; saveCampaign(c); render(true); deleteFileIfUnused(p); },
  'remove-photo'(el){ const d=S.dests[el.dataset.id]; const p=el.dataset.img; d.imagePaths=(d.imagePaths||[]).filter(i=>i!==p); saveDest(d); render(true); deleteFileIfUnused(p); },
  'remove-file'(el){ const c=S.campaigns[el.dataset.id]; const f=(c.files||[]).find(x=>x.path===el.dataset.file); if(!f) return;
    confirmBox(`Remove ${f.name}?`, 'It will be removed from this campaign\'s files.', ()=>{ c.files=(c.files||[]).filter(x=>x.path!==f.path); if(c.coverPath===f.path){ const imgs=c.files.filter(isImgFile); c.coverPath=''; if(imgs.length) syncKeyArt(c); } saveCampaign(c); deleteFileIfUnused(f.path); render(true); }, 'Remove'); },
  async 'attach-file'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const path=el.dataset.file;
    if(/\.jpe?g$/i.test(path) || isVideo(path)){ d.imagePaths=[...(d.imagePaths||[]), path]; saveDest(d); render(true); return; }
    // social posts need JPEG: make a JPEG copy for this destination
    try{ toast('Preparing photo…'); const blob=await fetch(fileUrl(path)).then(r=>r.blob()); const jpg=await toJpeg(blob); const np=`photos/${d.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from('files').upload(np, jpg, {contentType:'image/jpeg'}); if(error) throw error;
      d.imagePaths=[...(d.imagePaths||[]), np]; saveDest(d); render(true); toast('Photo added'); }catch(e){ toast('Could not add that photo: '+(e.message||'')); } },
  'copy-text'(el){ const d=S.dests[el.dataset.id]; const k=kindOf(channelById(d.channelId)); const t=(k.head&&d.headline? d.headline+'\n\n':'')+(d.copy||''); if(!t.trim()){ toast('Nothing to copy yet'); return; } copyText(k.social?(d.copy||''):t); },
  'ai-toggle'(el){ const a=aiState(el.dataset.id); a.open=!a.open; render(true); },
  'ai-generate'(el){ generate(el.dataset.id); },
  'use-desc'(el){ const d=S.dests[el.dataset.id], c=d&&S.campaigns[d.campaignId]; const t=((c&&c.description)||'').trim(); if(!t){ toast('This campaign has no description yet'); return; }
    const apply=()=>{ d.copy=t; saveDest(d); render(true); toast('Campaign description added'); };
    if((d.copy||'').trim() && d.copy.trim()!==t) confirmBox('Replace the current copy?', 'This swaps what\'s written here for the campaign\'s description.', apply, 'Replace');
    else apply(); },
  'ai-use'(el){ const d=S.dests[el.dataset.id], a=aiState(d.id), o=a.options[+el.dataset.i]; if(!o) return; const k=kindOf(channelById(d.channelId)); d.copy=o.text; if(k.head&&o.headline) d.headline=o.headline; saveDest(d); a.open=false; a.options=[]; render(true); toast('Copy added'); },
  async 'post-now'(el){ const d=S.dests[el.dataset.id]; if(!d) return; const ch=channelById(d.channelId);
    confirmBox(`Post to ${ch.kind==='social'?'Facebook and Instagram':kindOf(ch).label} now?`, 'This publishes the caption and photos to the church\'s page right away.', async ()=>{
      flushAll(); V.busy=true; render(true);
      try{ await new Promise(r=>setTimeout(r,400)); const r=await api('publish-now',{id:d.id}); applyPostResult(d,r); }
      catch(e){ d.publishError=e.message; toast('Posting failed: '+e.message); }
      V.busy=false; render(true); }, 'Post now'); },
  async 'check-post'(el){ const d=S.dests[el.dataset.id]; if(!d) return; V.busy=true; render(true);
    try{ applyPostResult(d, await api('publish-now',{id:d.id})); }catch(e){ if(/already/i.test(e.message)) toast('Still working on it in the background.'); else { d.publishError=e.message; d.publishPending=false; toast('Posting failed: '+e.message); } }
    V.busy=false; render(true); },
  async 'clear-error'(el){ const d=S.dests[el.dataset.id]; d.publishError=''; const { error } = await sb.from('destinations').update({publish_error:''}).eq('id',d.id); if(error) toast(error.message); render(true); },
  'add-social'(){ settings().channels.unshift({id:'social', name:'Social (Facebook + Instagram)', kind:'social'}); saveSettings(); render(true); toast('Added Social. It posts one caption to both Facebook and Instagram.'); },
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

/* ---------- @mentions ----------
   Typing @ in a comment box suggests staff members. */
let mention=null;   // { el, box, start, items, i }
function mentionClose(){ if(mention&&mention.box) mention.box.remove(); mention=null; }
const mentionsIn = text => { const t=String(text||'').toLowerCase(); return teamList().filter(m=>t.includes('@'+m.name.toLowerCase())).map(m=>m.id); };
function mentionCheck(el){
  const pos=el.selectionStart, m=/(^|\s)@([^\s@]{0,30})$/.exec(el.value.slice(0,pos));
  if(!m){ mentionClose(); return; }
  const q=m[2].toLowerCase();
  const items=teamList().filter(t=>t.name.toLowerCase().startsWith(q) || t.name.toLowerCase().split(/\s+/).some(w=>w.startsWith(q))).slice(0,6);
  if(!items.length){ mentionClose(); return; }
  if(!mention||mention.el!==el){ mentionClose(); const box=document.createElement('div'); box.className='mentionbox'; box.setAttribute('role','listbox'); box.setAttribute('aria-label','Tag someone'); document.body.appendChild(box); mention={el,box,i:0}; }
  mention.start=pos-m[2].length-1; mention.items=items; mention.i=Math.min(mention.i,items.length-1);
  const r=el.getBoundingClientRect(), b=mention.box;
  b.style.left=Math.min(r.left, innerWidth-250)+'px'; b.style.top=(r.bottom+4)+'px';
  b.innerHTML=items.map((t,i)=>`<button type="button" role="option" aria-selected="${i===mention.i}" class="${i===mention.i?'on':''}" data-mention-i="${i}">${av(t.id)}<span>${esc(t.name)}</span></button>`).join('');
}
function mentionPick(i){
  const m=mention; if(!m) return; const t=m.items[i], el=m.el; const pos=el.selectionStart; const ins='@'+t.name+' ';
  el.value=el.value.slice(0,m.start)+ins+el.value.slice(pos); const c=m.start+ins.length;
  mentionClose(); el.focus(); el.setSelectionRange(c,c); el.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('mousedown', e=>{ const b=e.target.closest&&e.target.closest('[data-mention-i]'); if(b){ e.preventDefault(); mentionPick(+b.dataset.mentionI); } else if(mention && !e.target.closest('.mentionbox')) mentionClose(); });
document.addEventListener('keydown', e=>{
  if(!mention || e.target!==mention.el) return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); mention.i=(mention.i+(e.key==='ArrowDown'?1:mention.items.length-1))%mention.items.length; mentionCheck(mention.el); }
  else if(e.key==='Enter'||e.key==='Tab'){ e.preventDefault(); mentionPick(mention.i); }
  else if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); mentionClose(); }
}, true);
document.addEventListener('scroll', ()=>{ if(mention) mentionClose(); }, true);
document.addEventListener('focusout', e=>{ const el=e.target; if(el.dataset&&el.dataset.mentions) setTimeout(()=>{ if(mention&&mention.el===el&&document.activeElement!==el) mentionClose(); }, 150); });

/* ---------- comments on destinations ----------
   A thread per destination (destination_comments). Send posts a comment; anyone @tagged in it is emailed. */
const commentLoading=new Set();
function loadComments(destId){
  if(S.comments[destId]||commentLoading.has(destId)) return; commentLoading.add(destId);
  sb.from('destination_comments').select('*').eq('destination_id',destId).order('created_at').then(({data,error})=>{ commentLoading.delete(destId); if(!error){ S.comments[destId]=data||[]; render(); } });
}
function commentHtml(text){
  let h=esc(text);
  for(const m of teamList()) h=h.split('@'+esc(m.name)).join(`<strong class="tag">@${esc(m.name)}</strong>`);
  return h.replace(/\n/g,'<br>');
}
function renderComments(destId){
  loadComments(destId);
  const list=S.comments[destId], meId=session&&session.user.id;
  const when=t=>{ const d=new Date(t); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); };
  const items=!list?'<div class="small muted">Loading comments…</div>':!list.length?'<div class="small muted">No comments yet.</div>':list.map(c=>{ const a=memberById(c.author_id);
    return `<div class="cmt"><div class="cmt-h">${c.author_id?av(c.author_id):'<span class="av none" title="Earlier notes">N</span>'}<strong>${esc(a?a.name:c.author_id?'Former staff':'Earlier notes')}</strong><span class="small muted">${esc(when(c.created_at))}</span>
      ${(c.author_id===meId||isAdmin())?`<button class="btn ghost iconbtn sm" data-action="del-comment" data-id="${esc(c.id)}" data-dest="${esc(destId)}" aria-label="Delete comment">×</button>`:''}</div><div class="cmt-b">${commentHtml(c.body)}</div></div>`; }).join('');
  return `<div class="field"><span class="lbl">Comments${list&&list.length?' · '+list.length:''}</span><div class="cmts">${items}</div>
    <div class="composer"><textarea id="cm-${esc(destId)}" data-comment="${esc(destId)}" data-mentions="1" rows="2" aria-label="Write a comment" placeholder="Write a comment. Type @ to tag someone.">${esc((V.commentDraft||{})[destId]||'')}</textarea>
    <button class="btn primary sm" data-action="send-comment" data-id="${esc(destId)}" ${V.sendingComment?'disabled':''}>Send</button></div>
    <span class="small muted">Anyone you tag gets an email with your comment.</span></div>`;
}
async function sendComment(destId){
  const el=document.getElementById('cm-'+destId); const body=(el?el.value:'').trim(); if(!body||V.sendingComment) return;
  V.sendingComment=true; mentionClose();
  try{
    await waitForSaves();
    const { data, error } = await sb.from('destination_comments').insert({ destination_id:destId, body, author_id:session.user.id }).select();
    if(error) throw error;
    const l=S.comments[destId]||(S.comments[destId]=[]); if(data&&data[0]&&!l.some(c=>c.id===data[0].id)) l.push(data[0]);
    (V.commentDraft||(V.commentDraft={}))[destId]=''; if(el) el.value='';
    const tagged=mentionsIn(body).filter(id=>id!==session.user.id);
    if(tagged.length && data&&data[0]){ try{ const r=await api('notify-mention',{commentId:data[0].id}); if(r.emailed){ const n=tagged.map(id=>(memberById(id)||{}).name).filter(Boolean); toast(`Comment sent. Emailed ${n.length===1?n[0]:n.length+' people'}.`); } }
      catch(e){ toast('Comment sent, but the email didn\'t: '+e.message); } }
  }catch(e){ toast('Couldn\'t send the comment: '+((e&&e.message)||'try again')); }
  V.sendingComment=false; render(true);
  const again=document.getElementById('cm-'+destId); if(again) again.focus();
}
// Picking campaign graphics in the Generate image dialog (no redraw, so the typed prompt stays).
document.addEventListener('change', e=>{ const el=e.target; if(!(el.dataset&&el.dataset.gfxRef) || !V.modal || V.modal.type!=='gfx-post') return;
  const refs=V.modal.refs, p=el.dataset.gfxRef;
  if(el.checked){ if(refs.length>=4){ el.checked=false; toast('Pick up to 4 images'); return; } if(!refs.includes(p)) refs.push(p); }
  else V.modal.refs=refs.filter(x=>x!==p);
  el.closest('.ref').classList.toggle('on', el.checked); });
document.addEventListener('keydown', e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&e.target.dataset&&e.target.dataset.comment){ e.preventDefault(); sendComment(e.target.dataset.comment); } });

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
  if(kind==='dest'){ const d=S.dests[id]; if(!d) return; const before=d[field];
    if(field==='channelId'){ const was=st(Object.assign({},d,{channelId:before}));
      if(hasTime(val) && !d.time) d.time='09:00'; if(!hasTime(val)) d.time='';
      if(hasTime(val) && !hasTime(before)) d.status = was==='posted'?'posted':'draft';
      if(!hasTime(val)) d.status = was==='posted'?'posted':'scheduled'; }
    if(field==='campaignId' && !val && before && !d.title){ const oc=S.campaigns[before]; if(oc){ d.title=oc.title; d.details=d.details||oc.description||''; } }
    d[field]=val;
    saveDest(d, committed?0:700);
    if(field==='assigneeId' && val && val!==before) notifyAssigned(d.id);
    if(field==='copy'){ const k=kindOf(channelById(d.channelId)); const cnt=document.getElementById('cnt-'+id); if(cnt){ cnt.textContent=`${val.length}${k.limit?' / '+k.limit:''} characters`; cnt.classList.toggle('over', !!(k.limit&&val.length>k.limit)); } }
    if(committed && !['copy','notes','headline'].includes(field)) render(true); }
  else if(kind==='brand'){ settings().brand[field]=val; saveSettings(committed?0:700); }
  else if(kind==='camp'){ const c=S.campaigns[id]; if(!c) return; const prev=c[field]; c[field]=val;
    if(field==='date' && val){ if(!c.endDate||c.endDate<val||c.endDate===prev) c.endDate=val; if(!c.adEnd||c.adEnd===prev) c.adEnd=c.endDate; }
    if(field==='endDate' && val && c.adEnd===prev) c.adEnd=val;
    if(field==='description'){ for(const d of destsOf(id)) if(isAnnouncement(channelById(d.channelId)) && (!(d.copy||'').trim() || d.copy===prev)){ d.copy=val; saveDest(d, 700); } }
    saveCampaign(c, committed?0:700); if(committed && /date|time|adStart|adEnd/i.test(field)) render(true); }
  else if(kind==='set'){ settings()[field]=val; saveSettings(700); }
  else if(kind==='chan'){ const ch=settings().channels.find(c=>c.id===id); if(!ch) return; ch[field]=val; saveSettings(committed?0:700); if(committed) render(true); }
  else if(kind==='me'){ const m=me(); if(!m) return; m[field]=val; scheduleSave('p:'+m.id,700); }
}
document.addEventListener('input', e=>{
  const el=e.target;
  if(el.dataset.mentions) mentionCheck(el);
  if(el.dataset.comment){ (V.commentDraft||(V.commentDraft={}))[el.dataset.comment]=el.value; return; }
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
async function uploadBigVideo(f){
  const s=await api('video-sign',{});
  const fd=new FormData(); fd.append('file',f); fd.append('api_key',s.apiKey); fd.append('folder',s.folder); fd.append('timestamp',String(s.timestamp)); fd.append('signature',s.signature);
  return await new Promise((res,rej)=>{
    const x=new XMLHttpRequest(); let last=0;
    x.open('POST',`https://api.cloudinary.com/v1_1/${encodeURIComponent(s.cloudName)}/video/upload`);
    x.upload.onprogress=e=>{ if(!e.lengthComputable) return; const pc=Math.floor(e.loaded/e.total*100); if(pc>=last+20){ last=pc; toast(`Uploading ${f.name}… ${pc}%`); } };
    x.onload=()=>{ let j={}; try{ j=JSON.parse(x.responseText); }catch(_){} if(x.status<300&&j.secure_url) res(j.secure_url); else rej(new Error((j.error&&j.error.message)||`Cloudinary answered ${x.status}`)); };
    x.onerror=()=>rej(new Error('the connection dropped'));
    x.send(fd);
  });
}
async function handleUpload(el){
  const [kind,id]=el.dataset.upload.split(':'); const files=[...el.files]; el.value=''; let n=0;
  for(const f of files){
    const vid = /^video\//.test(f.type) || isVideo(f.name);
    if(kind==='dest' && !f.type.startsWith('image/') && !vid){ toast(`${f.name} isn't a photo or video`); continue; }
    if(kind!=='file' && kind!=='dest' && !f.type.startsWith('image/')){ toast(`${f.name} isn't an image`); continue; }
    const big = vid && (kind==='dest'||kind==='file') && f.size>maxMb()*1024*1024;
    if(f.size>(big?BIG_VIDEO_MB:maxMb())*1024*1024){ toast(vid?`${f.name} is over ${BIG_VIDEO_MB} MB. Export it smaller (1080p, under ${BIG_VIDEO_MB} MB) and try again.`:`${f.name} is over ${maxMb()} MB`); continue; }
    toast(`Uploading ${f.name}…`);
    try{
      let body=f, type=f.type||'application/octet-stream', path;
      if(kind==='dest' && vid){ const ext=(f.name.match(/\.(mp4|mov|m4v)$/i)||['','mp4'])[1].toLowerCase(); type=f.type||(ext==='mov'?'video/quicktime':'video/mp4'); path=`photos/${id}/${uid()}.${ext}`; }
      else if(kind==='dest'){ body=await toJpeg(f); type='image/jpeg'; path=`photos/${id}/${uid()}.jpg`; }
      else if(kind==='brand'){ body=await toJpeg(f,1600); type='image/jpeg'; path=`brand/${uid()}.jpg`; }
      else if(kind==='inspo'){ if(!V.modal||(V.modal.inspo||[]).length>=INSPO_MAX) continue; body=await toJpeg(f,1600); type='image/jpeg'; path=`inspo/${uid()}.jpg`; }
      else if(kind==='cover'){ body=await toJpeg(f); type='image/jpeg'; path=`campaigns/${id}/cover-${uid().slice(0,8)}.jpg`; }
      else path=`campaigns/${id}/${uid().slice(0,8)}-${safeName(f.name)}`;
      if(big){ // Too big for our storage: send it straight to Cloudinary and keep its web address.
        const url=await uploadBigVideo(f);
        if(kind==='dest'){ const d=S.dests[id]; if(!d) continue; d.imagePaths=[...(d.imagePaths||[]), url]; saveDest(d); }
        else { const c=S.campaigns[id]; if(!c) continue; c.files=[...(c.files||[]), {path:url, name:f.name, type, size:f.size, at:Date.now()}]; saveCampaign(c); }
        n++; render(true); continue;
      }
      let dims=null; if(kind==='file' && f.type.startsWith('image/')){ const u=URL.createObjectURL(f); dims=await imageSize(u); URL.revokeObjectURL(u); }
      const { error } = await sb.storage.from('files').upload(path, body, { contentType:type, upsert:false });
      if(error) throw error;
      if(kind==='dest'){ const d=S.dests[id]; if(!d) continue; d.imagePaths=[...(d.imagePaths||[]), path]; saveDest(d); }
      else if(kind==='inspo'){ const m=V.modal; if(!m) continue; gfxKeepTyped(); m.inspo=[...(m.inspo||[]), path].slice(0,INSPO_MAX); }
      else if(kind==='brand'){ settings().brand.assets=[...settings().brand.assets, {path, name:f.name, on:true}]; saveSettings(); }
      else if(kind==='file'){ const c=S.campaigns[id]; if(!c) continue; c.files=[...(c.files||[]), {path, name:f.name, type, size:f.size, at:Date.now(), ...(dims?{w:dims.w,h:dims.h}:{})}]; syncKeyArt(c); saveCampaign(c); }
      else { const c=S.campaigns[id]; if(!c) continue; const old=c.coverPath; c.coverPath=path; saveCampaign(c); deleteFileIfUnused(old); }
      n++; render(true);
    }catch(err){ toast('Upload failed: '+((err&&err.message)||'try again')); }
  }
  if(n) toast(`Uploaded ${n} file${n===1?'':'s'}`);
}


/* ---------- AI graphics ----------
   1) "Design graphics" asks for two design concepts: finished 16:9 designs with the title designed in.
   2) Staff review them, ask for another, and choose one. 3) The chosen concept is the title graphic; OpenAI
   adapts it into the background (words removed), poster and social posts. graphics.js saves the files.
   One row per image in graphics_jobs; the Supabase Edge Function "graphics" makes the artwork. */
const GFX_STYLES=[['auto','Let the AI choose'],['fbss','First Baptist style'],['photo','Photographic'],['illustrated','Illustrated'],['watercolor','Watercolor'],['textured','Textured, no people']];
const gfxLabel=j=> j.kind==='concept' ? `Concept ${(j.options&&j.options.variation)||1}${j.options&&j.options.direction?' · '+j.options.direction:''}` : j.kind==='poster' ? 'Poster · 36 × 42 in (PDF)'
  : (j.kind==='title'||j.kind==='wide') ? 'Title graphic · 16 × 9' : j.kind==='background' ? 'Background · 16 × 9'
  : `Social post${(j.options&&j.options.variation>1)?' '+j.options.variation:''}${j.options&&j.options.details?' · with details':''} · 4 × 5`;
const gfxJobs=cid=>Object.values(S.gjobs).filter(j=>j.campaign_id===cid).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
const gfxAge=j=>Date.now()-Date.parse(j.updated_at||j.created_at||0);
const gfxStuck=j=>((j.status==='queued'||j.status==='working')&&gfxAge(j)>6*60e3) || (j.status==='composing'&&gfxAge(j)>3*60e3);
const gfxPostJobs=(cid,destId)=>gfxJobs(cid).filter(j=>j.options&&j.options.post&&j.options.destId===destId);
const gfxBusy=j=>(j.kind==='concept' ? ['queued','working'] : ['queued','working','art','composing']).includes(j.status) && !gfxStuck(j);
// The current round of concepts: the newest batch that hasn't had one chosen yet.
function gfxRound(cid){
  const cs=gfxJobs(cid).filter(j=>j.kind==='concept'); if(!cs.length) return null;
  const batch=cs[cs.length-1].options.batch; const list=cs.filter(j=>j.options.batch===batch);
  if(list.some(j=>j.status==='chosen') || list.every(j=>j.status==='passed')) return null;
  return { batch, list, plan:list[0].options.plan||{} };
}
const gfxChosen=cid=>gfxJobs(cid).filter(j=>j.kind==='concept'&&j.status==='chosen').slice(-1)[0]||null;
const gfxLoaded={}, gfxPrev={}; let gfxTimer=null, gfxComposing=false;
function gfxWhenText(c){
  if(!c.date) return '';
  const d=x=>parseYmd(x); const a=d(c.date), b=c.endDate&&c.endDate>c.date?d(c.endDate):null;
  const day = b ? `${a.toLocaleDateString('en-US',{month:'long',day:'numeric'})} – ${b.toLocaleDateString('en-US',{month:b.getMonth()===a.getMonth()?undefined:'long',day:'numeric'})}`.replace('– ,','–') : a.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const tm=t=>{ if(!t) return ''; const [h,mi]=t.split(':').map(Number); return `${((h+11)%12)+1}${mi?':'+String(mi).padStart(2,'0'):''} ${h>=12?'PM':'AM'}`; };
  const time = c.time ? (c.endTime&&!b ? `${tm(c.time)} – ${tm(c.endTime)}` : tm(c.time)) : '';
  return [day,time].filter(Boolean).join(' · ');
}
const gfxPreview=j=> j.status==='art'&&j.art_path ? fileUrl(j.art_path) : '';
function gfxStatus(j){
  if(gfxStuck(j)) return `<span class="err">This is taking too long.</span>`;
  if(j.status==='queued'||j.status==='working') return `<span class="spin" aria-hidden="true"></span> ${j.kind==='concept'?'Designing this concept…':'Designing…'} usually 1–2 minutes`;
  if(j.status==='art'||j.status==='composing') return j.kind==='concept'?'Ready to review':`<span class="spin" aria-hidden="true"></span> Saving…`;
  if(j.status==='done') return 'Saved to campaign files';
  if(j.status==='chosen') return 'Chosen concept';
  return `<span class="err">${esc(j.error||'Something went wrong.')}</span>`;
}
function renderGfxPanel(c){
  if(c._draft) return `<div class="field"><span class="lbl">AI graphics</span><span class="small muted">Submit the campaign first, then you can design graphics for it.</span></div>`;
  if(!gfxLoaded[c.id]){ gfxLoaded[c.id]=true; gfxRefresh(c.id); }
  const round=gfxRound(c.id), chosen=gfxChosen(c.id);
  const outs=gfxJobs(c.id).filter(j=>j.kind!=='concept' && !(j.options&&j.options.post));
  let h='';
  if(round){
    const ready=round.list.filter(j=>j.status==='art').length;
    h+=`<div class="gconcepts"><div class="row" style="gap:8px"><strong style="flex:1;font-weight:500;color:var(--slate)">Design concepts</strong><button class="btn ghost sm" data-action="gfx-cancel" data-id="${esc(c.id)}">Start over</button></div>
      <div class="gthumbs">${round.list.map(j=>{ const pv=gfxPreview(j); return `<button class="gthumb" data-action="gfx-review" data-id="${esc(c.id)}" aria-label="${esc(gfxLabel(j))}" style="${pv?`background-image:url('${esc(pv)}')`:''}">${pv?'':`<span>${j.status==='failed'||gfxStuck(j)?'!':'<span class="spin"></span>'}</span>`}</button>`; }).join('')}</div>
      <div class="small muted">${ready?`${ready} of ${round.list.length} ready.`:'Designing the concepts. This usually takes 1–2 minutes.'}</div>
      <button class="btn primary sm" data-action="gfx-review" data-id="${esc(c.id)}" ${ready||round.list.some(j=>j.status==='failed')?'':'disabled'}>Review concepts</button></div>`;
  }
  if(outs.length) h+=`<div class="gjobs">${outs.map(j=>`<div class="gjob ${j.status==='done'?'ok':''}"><div style="min-width:0;flex:1"><div class="gj-t">${esc(gfxLabel(j))}</div><div class="small muted">${gfxStatus(j)}</div></div>
    ${(j.status==='failed'||gfxStuck(j))?`<button class="btn sm" data-action="gfx-retry" data-id="${esc(j.id)}">Try again</button>`:''}
    ${!gfxBusy(j)?`<button class="btn ghost iconbtn sm" data-action="gfx-dismiss" data-id="${esc(j.id)}" aria-label="Remove from this list">×</button>`:''}</div>`).join('')}</div>`;
  return `<div class="field"><span class="lbl">AI graphics</span>${h}
    <div class="row" style="gap:8px">${round?'':`<button class="btn gold sm" data-action="gfx-open" data-id="${esc(c.id)}">✦ Design graphics</button>`}${chosen&&!round?`<button class="btn sm" data-action="gfx-more" data-id="${esc(c.id)}">+ Social post</button><button class="btn sm" data-action="gfx-more" data-details="1" data-id="${esc(c.id)}">+ Social post with details</button>`:''}</div>
    ${round?'':`<span class="small muted" style="margin-top:6px">Start with two very different design concepts, each with the title designed in. Once you pick one, the background, poster and social posts are made to match and saved to Campaign files.</span>`}</div>`;
}
function renderGfxModal(m){
  const c=S.campaigns[m.id]; if(!c) return '';
  return `<h2 id="m-t">Design graphics</h2><p class="prose" style="margin:0">${esc(c.title||'Untitled campaign')}${c.date?' · '+esc(fmtRange(c)):''}</p>
    <div class="field"><label class="lbl" for="gf-name">Title on the graphics</label><input type="text" id="gf-name" value="${esc(m.title||'')}" maxlength="80"><span class="small muted">The only words on the graphics. Shorten it if the campaign name is long.</span></div>
    <p class="small muted" style="margin:0">You'll get two design concepts first. Pick one (or ask for another), and these are made to match:</p>
    ${gfxPickHtml(m)}
    <div class="field"><label class="lbl" for="gf-style">Style</label><select id="gf-style">${GFX_STYLES.map(([v,l])=>`<option value="${v}" ${m.style===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Inspiration pictures <span class="small muted" style="text-transform:none;letter-spacing:0">optional, up to ${INSPO_MAX}</span></span>
      <span class="small muted">A design, photo or style you like. The AI borrows its mood, layout or lettering; it won't copy it exactly. Say what you like about it in the box below.</span>
      <div class="photos">${(m.inspo||[]).map((p,i)=>`<div class="photo"><img src="${esc(fileUrl(p))}" alt="Inspiration"><button class="x" data-action="inspo-remove" data-i="${i}" aria-label="Remove">×</button></div>`).join('')}
      ${(m.inspo||[]).length<INSPO_MAX?`<label class="addphoto" for="up-inspo">+ Add inspiration<br><span class="small muted">JPG or PNG</span></label><input type="file" accept="image/*" multiple class="sr" id="up-inspo" data-upload="inspo:1">`:''}</div></div>
    <div class="field"><label class="lbl" for="gf-notes">Ideas for the artwork <span class="small muted" style="text-transform:none;letter-spacing:0">optional</span></label><textarea id="gf-notes" rows="3" placeholder="e.g. candlelight and evergreen branches, a cozy winter feel">${esc(m.notes||'')}</textarea></div>
    <p class="small muted" style="margin:0">OpenAI designs each graphic, title lettering included, from the campaign's title and description. Each image costs a few cents; the poster costs a little more.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn primary" data-action="gfx-go" ${V.busy?'disabled':''}>${V.busy?'Planning concepts…':'Create 2 concepts'}</button></div>`;
}
function gfxPickHtml(m){
  const ck=(id,label,sub)=>`<label class="check"><input type="checkbox" id="gf-${id}" ${m.pick[id]?'checked':''}><span>${label}<br><span class="small muted">${sub}</span></span></label>`;
  return `<div class="stack" style="gap:10px">
      ${ck('poster','Poster · 36 × 42 inches','Print-ready PDF')}
      ${ck('title','Title graphic · 16 × 9','The chosen concept, for screens and slides')}
      ${ck('background','Background graphic · 16 × 9','The same design with the title removed')}
      <div class="row" style="gap:10px"><label class="check" style="flex:1"><input type="checkbox" id="gf-social" ${m.social>0?'checked':''}><span>Social posts with just the title · 4 × 5<br><span class="small muted">For Facebook and Instagram</span></span></label>
        <input type="number" id="gf-count" min="1" max="6" value="${Math.max(1,m.social||1)}" style="width:72px" aria-label="How many social posts with just the title"></div>
      <div class="row" style="gap:10px"><label class="check" style="flex:1"><input type="checkbox" id="gf-socialD" ${m.socialD>0?'checked':''}><span>Social posts with event details · 4 × 5<br><span class="small muted">Title plus date, time and place. You can add more of either later.</span></span></label>
        <input type="number" id="gf-countD" min="1" max="6" value="${Math.max(1,m.socialD||1)}" style="width:72px" aria-label="How many social posts with event details"></div>
    </div>`;
}
// Copy what's typed in an open graphics dialog into V.modal, so a redraw (e.g. after an upload) keeps it.
function gfxKeepTyped(){ const m=V.modal; if(!m) return; const v=id=>{ const e=document.getElementById(id); return e?e.value:undefined; };
  if(m.type==='graphics'){ if(v('gf-name')!==undefined){ m.title=v('gf-name'); m.notes=v('gf-notes'); m.style=v('gf-style'); try{ Object.assign(m, gfxReadPick()); }catch(_){} } }
  if(m.type==='gfx-post'){ if(v('gp-prompt')!==undefined){ m.prompt=v('gp-prompt'); m.shape=v('gp-shape'); m.style=v('gp-style'); } } }
function gfxReadPick(){
  const pick=k=>document.getElementById('gf-'+k).checked; const n=id=>Math.min(6,Math.max(1,parseInt(document.getElementById(id).value,10)||1));
  return { pick:{poster:pick('poster'),title:pick('title'),background:pick('background')}, social:pick('social')?n('gf-count'):0, socialD:pick('socialD')?n('gf-countD'):0 };
}
function renderGfxPost(m){
  const d=S.dests[m.id]; if(!d) return ''; const c=S.campaigns[d.campaignId];
  // Campaign posts match the campaign's images; one-off posts can match their own photos.
  const imgs=c ? (c.files||[]).filter(f=>isImgFile(f)&&f.w!==-1) : (d.imagePaths||[]).filter(p=>!isVideo(p)).map(p=>({path:p,name:'Photo'}));
  return `<h2 id="m-t">Generate an image</h2><p class="prose" style="margin:0">For this ${esc(channelById(d.channelId).name)} post about ${esc(c?c.title:(d.title||'a one-off post'))}.</p>
    <div class="field"><label class="lbl" for="gp-style">Style</label><select id="gp-style"><option value="match" ${m.style!=='fbss'?'selected':''}>${imgs.length?'Match the images below':'Let the AI choose'}</option><option value="fbss" ${m.style==='fbss'?'selected':''}>First Baptist style (from our brand guide)</option></select></div>
    <div class="field"><span class="lbl">${c?'Match these campaign graphics':'Match these photos'}</span>
      ${imgs.length?`<div class="refpick">${imgs.map(f=>`<label class="ref ${m.refs.includes(f.path)?'on':''}" title="${esc(f.name)}"><input type="checkbox" class="sr" data-gfx-ref="${esc(f.path)}" ${m.refs.includes(f.path)?'checked':''}><img src="${esc(fileUrl(f.path))}" alt="${esc(f.name)}" loading="lazy"></label>`).join('')}</div>
      <span class="small muted">Pick up to 4. The new image uses their lettering, colors and look.</span>`
      :`<span class="small muted">${c?'This campaign has no images yet, so the image will be designed from your description alone. Add graphics to Campaign files (or use Design graphics) to match a look.':'No photos to match yet, so the image will be designed from your description and the style above.'}</span>`}</div>
    <div class="field"><label class="lbl" for="gp-prompt">What should it show or say?</label><textarea id="gp-prompt" rows="4" placeholder="e.g. Add &quot;Register by Dec 13&quot; in the same lettering, with a countdown feel">${esc(m.prompt||'')}</textarea>
      <span class="small muted">Put any words you want on the image in quotes, spelled exactly.</span></div>
    <div class="field"><span class="lbl">Inspiration pictures <span class="small muted" style="text-transform:none;letter-spacing:0">optional, up to ${INSPO_MAX}</span></span>
      <span class="small muted">A design, photo or style you like. The AI borrows its mood, layout or lettering; it won't copy it exactly. Say what you like about it in the box above.</span>
      <div class="photos">${(m.inspo||[]).map((p,i)=>`<div class="photo"><img src="${esc(fileUrl(p))}" alt="Inspiration"><button class="x" data-action="inspo-remove" data-i="${i}" aria-label="Remove">×</button></div>`).join('')}
      ${(m.inspo||[]).length<INSPO_MAX?`<label class="addphoto" for="up-inspo">+ Add inspiration<br><span class="small muted">JPG or PNG</span></label><input type="file" accept="image/*" multiple class="sr" id="up-inspo" data-upload="inspo:1">`:''}</div></div>
    <div class="field"><label class="lbl" for="gp-shape">Shape</label><select id="gp-shape">${[['feed','Feed post · 4 × 5'],['square','Square · 1 × 1'],['story','Story or Reel cover · 9 × 16'],['wide','Wide · 16 × 9']].map(([v,l])=>`<option value="${v}" ${m.shape===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <p class="small muted" style="margin:0">Made by OpenAI in a minute or two and added to this post's photos. Check spelling before posting. Each image costs a few cents.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Cancel</button><button class="btn primary" data-action="gfx-post-go" ${V.busy?'disabled':''}>${V.busy?'Starting…':'Generate image'}</button></div>`;
}
function renderGfxReview(m){
  const c=S.campaigns[m.id]; const round=c&&gfxRound(m.id); if(!round) return `<h2 id="m-t">Design concepts</h2><p class="prose">These concepts are no longer waiting for a choice.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-action="modal-close">Close</button></div>`;
  const busy=round.list.some(gfxBusy);
  return `<h2 id="m-t">Choose a concept</h2><p class="prose" style="margin:0">${esc(c.title||'Untitled campaign')}. The one you choose is your title graphic; the background, poster and social posts are made to match. Check the spelling of the title before choosing.</p>
    <div class="gcards">${round.list.map(j=>{ const pv=gfxPreview(j); const ok=j.status==='art';
      return `<div class="gcard"><div class="gprev" style="${pv?`background-image:url('${esc(pv)}')`:''}">${pv?`<a class="open" href="${esc(fileUrl(j.art_path))}" target="_blank" rel="noopener" aria-label="Open ${esc(gfxLabel(j))} artwork full size"></a>`:`<span class="small muted" style="padding:12px;text-align:center">${gfxStatus(j)}</span>`}</div>
        <div class="row" style="gap:8px"><strong style="flex:1;font-weight:500">${esc(gfxLabel(j))}</strong>
        ${ok?`<button class="btn primary sm" data-action="gfx-choose" data-id="${esc(j.id)}">Use this concept</button>`:''}
        ${(j.status==='failed'||gfxStuck(j))?`<button class="btn sm" data-action="gfx-retry" data-id="${esc(j.id)}">Try again</button>`:''}</div></div>`; }).join('')}</div>
    <div class="row"><button class="btn" data-action="gfx-another" data-id="${esc(m.id)}" ${busy||V.busy?'disabled':''}>${round.list.length<3?'Try a third concept':'Try another concept'}</button>${busy?'<span class="small muted"><span class="spin"></span> Designing…</span>':''}<span class="spacer"></span><button class="btn" data-action="modal-close">Close</button></div>`;
}
function renderGfxApprove(m){
  const j=S.gjobs[m.id]; if(!j) return '';
  const t=m.text||{};
  return `<h2 id="m-t">Make the graphics</h2><p class="prose" style="margin:0">Using ${esc(gfxLabel(j).toLowerCase())}. Choose what to make:</p>
    ${gfxPickHtml(m)}
    <div class="field"><span class="lbl">Details for the poster and detail posts</span><span class="small muted" style="margin:-2px 0 6px">Exactly as they should appear. Leave a line empty to skip it. The title graphic and background never include these.</span>
      <div class="stack" style="gap:8px"><input type="text" id="gf-when" value="${esc(t.when||'')}" placeholder="Date and time, e.g. Thursday, December 24 · 4, 5 and 6 PM" aria-label="Date and time">
      <input type="text" id="gf-where" value="${esc(t.where||'')}" placeholder="Place" aria-label="Place">
      <input type="text" id="gf-extra" value="${esc(t.extra||'')}" placeholder="Extra line, e.g. Reserve seats at fbss.church" aria-label="Extra line"></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-action="gfx-review" data-id="${esc(j.campaign_id)}">Back</button><button class="btn primary" data-action="gfx-approve-go" ${V.busy?'disabled':''}>${V.busy?'Starting…':'Create graphics'}</button></div>`;
}
// Each concept gets its own creative direction so the concepts look nothing alike.
// Claude writes them (different subject, composition and medium); built-in directions are the fallback.
const GFX_DIRECTIONS=[
  {name:'Vintage park print', brief:'A vintage national-park print: heavy condensed block-letter title in dark brown ink with a halftone texture, a double-rule border, and silhouettes from the event\'s world on warm cream paper.'},
  {name:'Bold TV show', brief:'A high-energy TV-show look: a heavy italic sans-serif title with neon red and blue outline glows, over a deep blue duotone photograph with streaked light.'},
  {name:'Script and still life', brief:'Elegant hand-lettered script title in white with a gold edge, on a textured midnight-blue sky with a single star; a painted still life of meaningful objects runs along the bottom.'},
  {name:'Editorial serif', brief:'A modern editorial layout: a huge high-contrast serif title in two colors, stacked and centered on off-white, with fine line-drawn botanical illustrations around it and one cut-out photo overlapping the letters.'},
  {name:'Paper cutout', brief:'Layered paper-cutout illustration with soft shadows; a chunky rounded title cut from paper, in bright but warm colors, centered.'},
  {name:'Watercolor wash', brief:'Loose watercolor washes and hand-drawn ink details; a brush-lettered title in deep color across the middle with lots of white space.'},
];
const INSPO_MAX=3;
const BRAND_MAX=6; // brand images sent to the image AI with each First Baptist style design
const FBSS_STYLE_BRIEF='calm, refined and warm; cream or deep slate-blue backgrounds with rust, gold, moss and dusty-blue accents; elegant wide-spaced all-caps serif titles, small spaced all-caps sans subheads, Baskerville-style text; generous space, hairline rules, minimal ornament, faint stained-glass or three-leaf line art; warm natural photography.';
const GFX_DIRECTIONS_FBSS=[
  {name:'Cream and hairlines', brief:'Warm cream background with a wide-spaced all-caps serif title in slate blue, a thin gold hairline rule, and faint tone-on-tone stained-glass arch line art in one corner.'},
  {name:'Slate panel and photo', brief:'A warm, natural photograph from the event\'s world on one side and a deep slate-blue panel on the other carrying the title in cream, wide-spaced all-caps serif, with a small rust accent.'},
  {name:'Moss and gold still life', brief:'A soft, warmly lit still life of a few meaningful objects on cream linen, with the title set in a refined all-caps serif in moss green and gold, lots of open space.'},
];
async function gfxDirections(c, n, prior, style, notes, title){
  const used=prior.map(p=>p.name);
  const pool=style==='fbss'?GFX_DIRECTIONS_FBSS:GFX_DIRECTIONS; const fallback=()=>pool.filter(d=>!used.includes(d.name)).slice(0,n).concat(pool).slice(0,n);
  if(!(CFG&&CFG.aiEnabled)) return fallback();
  const styleRule = style==='fbss' ? `Every direction must follow the First Baptist house style from the church's brand guide: ${(settings().brand.notes||'').trim().slice(0,1500)||FBSS_STYLE_BRIEF} Within that style, make the directions differ completely in layout, imagery, subject and which brand colors lead.`
    : style&&style!=='auto' ? `Every direction must use this imagery style: ${GFX_STYLES.find(x=>x[0]===style)[1]}. Make them differ completely in lettering style, layout, color palette and subject.`
    : 'Make them differ completely in lettering style, layout, color palette, imagery and medium.';
  const prompt=`You are the art director for First Baptist Sulphur Springs, a Baptist church in Sulphur Springs, Texas.
Write ${n} design direction${n>1?'s':''} for an event graphic where the title lettering is designed into the artwork, like professional church media design.
Examples of the range we like (do not copy them): a vintage national-park print with heavy condensed block letters and a double-rule border; a TV-show look with a heavy italic title and neon outline glow over a blue duotone photo; elegant hand-lettered script with a gold edge over a textured night sky and a painted still life; a huge two-color editorial serif with line-drawn botanicals and a cut-out photo.
Title on the graphic: ${title||c.title||'Church event'}
When: ${fmtRange(c)||'not set'}
Where: ${c.location||'not set'}
About: ${(c.description||'').slice(0,800)||'not given'}
${notes?'Ideas from staff: '+notes:''}
${styleRule}
${prior.length?'They must also be completely different from these directions already shown:\n'+prior.map(p=>'- '+p.name+': '+p.brief).join('\n'):''}
Each brief is 2 or 3 sentences, concrete and visual: the lettering style for the title (for example script, condensed block, heavy italic, high-contrast serif, hand-brushed), the layout, the color palette, the imagery and medium, and the texture. The title is the only text. Tasteful and welcoming for a church; no logos or close-up faces.
Reply with only JSON: {"directions":[{"name":"2 to 4 word name","brief":"..."}]}`;
  try{
    const r=await api('ai-copy',{prompt}); const m=(r.text||'').match(/\{[\s\S]*\}/); const d=m?JSON.parse(m[0]).directions:null;
    const ok=Array.isArray(d)?d.filter(x=>x&&x.name&&x.brief).slice(0,n).map(x=>({name:String(x.name).slice(0,40), brief:String(x.brief).slice(0,700)})):[];
    const seen=used.map(x=>String(x).toLowerCase());
    return ok.length===n && ok.every(x=>!seen.includes(x.name.toLowerCase())) ? ok : fallback();
  }catch(e){ return fallback(); }
}
async function gfxRefresh(cid){
  const q=sb.from('graphics_jobs').select('*'); const { data, error } = await (cid ? q.eq('campaign_id',cid) : q.is('campaign_id',null));
  if(error){ console.warn('graphics', error.message); return; }
  for(const k of Object.keys(S.gjobs)) if(S.gjobs[k].campaign_id===cid && !data.some(d=>d.id===k)) delete S.gjobs[k];
  for(const j of data) S.gjobs[j.id]=j;
  render(); gfxSchedule();
  gfxCompose();
}
// Graphics work for the campaign on screen: the campaign page, or the campaign of the post that's open.
const gfxActiveCid=()=> (V.view==='campaign'&&V.campaignId) || (V.openDest&&S.dests[V.openDest]&&S.dests[V.openDest].campaignId) || '';
// What's on screen: a campaign's jobs, or (for an open one-off post) the jobs with no campaign. null = nothing.
function gfxActive(){
  const cid=gfxActiveCid(); if(cid) return { cid, jobs:gfxJobs(cid) };
  const d=V.openDest&&S.dests[V.openDest]; if(d&&!d.campaignId) return { cid:null, jobs:gfxPostJobs(null,d.id) };
  return null;
}
function gfxSchedule(){
  clearTimeout(gfxTimer);
  const a=gfxActive(); if(!a) return;
  if(a.jobs.some(gfxBusy)) gfxTimer=setTimeout(()=>gfxRefresh(a.cid), 4000);
}
async function gfxCall(jobId){
  const { data:{ session:s } } = await sb.auth.getSession();
  const res=await fetch(`${CFG.supabaseUrl}/functions/v1/graphics`,{ method:'POST', headers:{ 'content-type':'application/json', apikey:CFG.supabaseAnonKey, Authorization:'Bearer '+(s?s.access_token:'') }, body:JSON.stringify({ jobId }) });
  const j=await res.json().catch(()=>({}));
  if(!res.ok && res.status!==409) throw new Error(j.error||`The graphics service answered ${res.status}.`);
}
// Add rows and start the artwork. Rows given an artPath already have their artwork (the chosen concept).
async function gfxStart(cid, list){
  const rows=list.map(o=>({ campaign_id:cid, kind:o.kind, options:o.options, status:'queued' }));
  const { data, error } = await sb.from('graphics_jobs').insert(rows).select();
  if(error) throw error;
  const toPaint=[];
  for(const [i,j] of data.entries()){
    if(list[i].artPath){ const { data:u } = await sb.from('graphics_jobs').update({ status:'art', art_path:list[i].artPath, updated_at:new Date().toISOString() }).eq('id',j.id).select(); S.gjobs[j.id]=(u&&u[0])||{...j,status:'art',art_path:list[i].artPath}; }
    else { S.gjobs[j.id]=j; toPaint.push(j); }
  }
  render(true); gfxSchedule(); gfxCompose();
  const results=await Promise.allSettled(toPaint.map(j=>gfxCall(j.id)));
  const bad=results.find(r=>r.status==='rejected');
  if(bad){ const msg=bad.reason.message; for(const [i,r] of results.entries()) if(r.status==='rejected'){ const j=toPaint[i]; await sb.from('graphics_jobs').update({ status:'failed', error:msg, updated_at:new Date().toISOString() }).eq('id',j.id); S.gjobs[j.id]={...j, status:'failed', error:msg}; } toast(msg); render(true); }
}
// Finish any deliverable whose artwork is ready: claim it, add the text, upload, and attach to the campaign.
async function gfxCompose(){
  if(gfxComposing) return; const a=gfxActive(); if(!a) return; const cid=a.cid;
  const j=a.jobs.find(x=>x.kind!=='concept' && (x.status==='art' || (x.status==='composing'&&gfxAge(x)>3*60e3))); if(!j) return;
  gfxComposing=true;
  try{
    const { data:claimed } = await sb.from('graphics_jobs').update({ status:'composing', updated_at:new Date().toISOString() }).eq('id',j.id).eq('status',j.status).eq('updated_at',j.updated_at).select();
    if(!claimed || !claimed.length) return;
    S.gjobs[j.id]=claimed[0]; render();
    const art0=fileUrl(j.art_path);
    if(j.options.post){
      const d=S.dests[j.options.destId]; if(!d) throw new Error('That post no longer exists.');
      const [w,h]={square:[1080,1080],story:[1080,1920],wide:[1920,1080]}[j.options.shape]||[1080,1350];
      const blob=await GFX.makeImage(art0,w,h); const path=`photos/${d.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from('files').upload(path, blob, { contentType:'image/jpeg', upsert:false }); if(error) throw error;
      d.imagePaths=[...(d.imagePaths||[]), path]; saveDest(d);
      const { data:done } = await sb.from('graphics_jobs').update({ status:'done', outputs:[{path,name:'Post image'}], updated_at:new Date().toISOString() }).eq('id',j.id).select();
      if(done&&done[0]) S.gjobs[j.id]=done[0];
      toast('New image added to the post'); return;
    }
    const c=S.campaigns[cid]; const art=fileUrl(j.art_path); const base=safeTitle(c.title);
    const made=[];
    if(j.kind==='poster') made.push([`${base} - Poster 36x42.pdf`, await GFX.makePoster(art)]);
    if(j.kind==='title'||j.kind==='wide') made.push([`${base} - Title 16x9.jpg`, await GFX.makeImage(art,1920,1080)]);
    if(j.kind==='background') made.push([`${base} - Background 16x9.jpg`, await GFX.makeImage(art,1920,1080)]);
    if(j.kind==='social') made.push([`${base} - Social 4x5${j.options.variation>1?' ('+j.options.variation+')':''}.jpg`, await GFX.makeImage(art,1080,1350)]);
    const outputs=[];
    for(const [name, blob] of made){
      const path=`campaigns/${cid}/${uid().slice(0,8)}-${safeName(name)}`;
      const { error } = await sb.storage.from('files').upload(path, blob, { contentType:blob.type, upsert:false }); if(error) throw error;
      const dims=/Title 16x9|Background 16x9/.test(name)?{w:1920,h:1080}:/Social 4x5/.test(name)?{w:1080,h:1350}:{};
      outputs.push({ path, name, type:blob.type, size:blob.size, at:Date.now(), ...dims });
    }
    const cc=S.campaigns[cid]; cc.files=[...(cc.files||[]), ...outputs]; syncKeyArt(cc); saveCampaign(cc);
    const { data:done } = await sb.from('graphics_jobs').update({ status:'done', outputs:outputs.map(o=>({path:o.path,name:o.name})), updated_at:new Date().toISOString() }).eq('id',j.id).select();
    if(done&&done[0]) S.gjobs[j.id]=done[0];
    toast(`${made.length===1?made[0][0]:made.length+' graphics'} saved to campaign files`);
  }catch(e){
    const msg='Couldn\'t finish the graphic: '+((e&&e.message)||'try again');
    await sb.from('graphics_jobs').update({ status:'failed', error:msg, updated_at:new Date().toISOString() }).eq('id',j.id);
    S.gjobs[j.id]={...S.gjobs[j.id], status:'failed', error:msg};
  }finally{ gfxComposing=false; render(); gfxSchedule(); setTimeout(gfxCompose, 50); }
}
const safeTitle = t => (String(t||'Event').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60) || 'Event');

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

Write copy for ONE destination about this ${c.oneOff?'one-off post (not part of a larger campaign)':'campaign'}.
${c.oneOff?'Topic':'Campaign'}: ${c.title}
Event date(s) and time: ${c.date? fmtRange(c,true) : 'not set'}
Location: ${c.location||'not set'}
Ministry: ${c.ministry||'not set'}
Sign-up or info link: ${c.link||'none'}
Details: ${c.description||'(no description given)'}

Destination: ${ch.name} (${k.label})
Format guidance: ${GUIDE[ch.kind]||GUIDE.other}
Timing: ${timing}
Tone: ${tones[a.tone]||tones.voice}
${lenRange(ch.kind,a.length)?`LENGTH (follow strictly): each option's text must be ${lenRange(ch.kind,a.length)[0]} to ${lenRange(ch.kind,a.length)[1]} words, counting every word including the date, time and place. Do not go over ${lenRange(ch.kind,a.length)[1]} words.${a.length==='short'?' Because this is short, include only the essentials: what it is, when, where, and one call to action. Leave out every other detail (lists, prices, deadlines, who to ask), even though they are in the details above.':a.length==='medium'?' Include only the most important details; you do not need to use them all.':''}`:''}
Emoji: ${a.emoji==='none'?'Do not use emoji.':a.emoji==='more'?'Use several emoji where natural.':'At most one or two emoji.'}
${k.social?(a.hashtags==='on'?'Hashtags: add 2-4 relevant hashtags on the last line.':'Hashtags: none.'):''}
${k.limit?`Hard limit: the text must be under ${k.limit} characters.`:''}
${a.extra?'Extra instructions: '+a.extra:''}
${d.copy?'Current draft (use it for ideas, but rewrite it to the length above):\n'+d.copy:''}

Rules: do not invent facts (speakers, prices, deadlines, links) that are not in the details. Leave out anything marked "not set". Plain text, no markdown.
Return ONLY a JSON object, no other text: {"options":[{"headline":"...","text":"..."},{"headline":"...","text":"..."}]}
Give two clearly different options. "headline" is the ${k.head||'headline'}${k.head?'':' and must be an empty string for this destination'}. Use \\n for line breaks inside "text".`;
  a.loading=true; a.error=''; render(true);
  try{
    const r=await api('ai-copy',{prompt}); const m=(r.text||'').match(/\{[\s\S]*\}/); const parsed=m?JSON.parse(m[0]):null;
    const opts=parsed&&Array.isArray(parsed.options)?parsed.options.filter(o=>o&&typeof o.text==='string').slice(0,2).map(o=>({headline:String(o.headline||''), text:o.text.trim()})):[];
    if(!opts.length) throw new Error('The AI response came back in an unexpected format. Click Regenerate.');
    // Check the length ourselves; if an option runs long, ask for it to be cut down (up to twice).
    const range=lenRange(ch.kind,a.length);
    for(let tries=0; range && tries<2; tries++){
      const long=opts.filter(o=>wordCount(o.text)>range[1]); if(!long.length) break;
      const fix=`Shorten each text below to ${range[0]} to ${range[1]} words (counting every word, hashtags not included). Keep the date, time, place and one call to action; cut everything else that doesn't fit. Keep the same voice${k.social&&a.hashtags==='on'?' and keep the hashtags line':''}. Plain text.
Return ONLY a JSON object: {"options":[{"text":"..."}]} with the texts in the same order. Use \\n for line breaks.
${long.map((o,i)=>`Text ${i+1}:\n${o.text}`).join('\n\n')}`;
      const r2=await api('ai-copy',{prompt:fix}); const m2=(r2.text||'').match(/\{[\s\S]*\}/); const p2=m2?JSON.parse(m2[0]):null;
      const short=p2&&Array.isArray(p2.options)?p2.options:[];
      long.forEach((o,i)=>{ const t=short[i]&&typeof short[i].text==='string'&&short[i].text.trim(); if(t) o.text=t; });
    }
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
