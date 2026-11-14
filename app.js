(function(){
'use strict';
const NAME='Wordle Masters';             // rename the game here (and in index.html <title>/<h1>)
const EPOCH=Date.UTC(2026,10,14);   // puzzle #1 = 14 Nov 2026 (local date)
const ANSWERS=window.DF_ANSWERS, VALID=new Set(window.DF_VALID);
ANSWERS.forEach(w=>VALID.add(w));
const LS='wordlemasters:';
const qs=new URLSearchParams(location.search);
const isLocal=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);

// ---------- daily word ----------
function dayIndex(d){return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-EPOCH)/864e5);}
let today=new Date();
if(isLocal&&qs.get('date')){const p=qs.get('date').split('-').map(Number);today=new Date(p[0],p[1]-1,p[2]);}
const puzzleNo=dayIndex(today)+1;
const answer=ANSWERS[((puzzleNo-1)%ANSWERS.length+ANSWERS.length)%ANSWERS.length];
if(isLocal&&qs.has('debug')){window.__wb={answer,puzzleNo};console.log('[debug] answer:',answer);}

// ---------- storage ----------
const load=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(LS+k));return v==null?d:v;}catch(e){return d;}};
const save=(k,v)=>{try{localStorage.setItem(LS+k,JSON.stringify(v));}catch(e){}};
const settings=Object.assign({hard:false,dark:true,contrast:false},load('settings',{}));
let stats=Object.assign({played:0,wins:0,cur:0,max:0,dist:[0,0,0,0,0,0],lastWon:null,lastPlayed:null},load('stats',{}));
let state=load('state',null);
if(!state||state.puzzle!==puzzleNo) state={puzzle:puzzleNo,guesses:[],status:'playing',hard:settings.hard};

// ---------- leaderboard backend (Supabase RPCs; publishable key is safe client-side) ----------
const SB_URL='https://jhhjfgydktndtlhsjzvo.supabase.co',SB_KEY='sb_publishable_bdds9iFlNTu6ZpyobwADuA_dJ5s6wnP';
let deviceId=load('device',null);
if(!deviceId){deviceId=(crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));save('device',deviceId);}
async function rpc(fn,body){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
  try{const r=await fetch(SB_URL+'/rest/v1/rpc/wm_'+fn,{method:'POST',signal:ac.signal,headers:{'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}

// ---------- scoring with duplicate handling ----------
function score(guess,ans){
  const res=Array(5).fill('absent'),counts={};
  for(let i=0;i<5;i++){if(guess[i]===ans[i])res[i]='correct';else counts[ans[i]]=(counts[ans[i]]||0)+1;}
  for(let i=0;i<5;i++){if(res[i]!=='correct'&&counts[guess[i]]>0){res[i]='present';counts[guess[i]]--;}}
  return res;
}
const ORD=['1st','2nd','3rd','4th','5th'];
function hardModeError(guess){
  for(const g of state.guesses){
    const r=score(g,answer);
    for(let i=0;i<5;i++) if(r[i]==='correct'&&guess[i]!==g[i]) return ORD[i]+' letter must be '+g[i].toUpperCase();
    const need={};for(let i=0;i<5;i++) if(r[i]!=='absent') need[g[i]]=(need[g[i]]||0)+1;
    for(const ch in need){const have=guess.split('').filter(c=>c===ch).length;if(have<need[ch])return 'Guess must contain '+ch.toUpperCase();}
  }
  return null;
}

// ---------- DOM ----------
const $=s=>document.querySelector(s);
const board=$('#board'),kb=$('#keyboard');
const rows=[];
for(let r=0;r<6;r++){const row=document.createElement('div');row.className='row';const tiles=[];
  for(let c=0;c<5;c++){const t=document.createElement('div');t.className='tile';t.dataset.state='empty';row.appendChild(t);tiles.push(t);}
  board.appendChild(row);rows.push({el:row,tiles});}
const KEYS=['qwertyuiop','-asdfghjkl-','>zxcvbnm<'];
const keyEls={};
KEYS.forEach(line=>{const kr=document.createElement('div');kr.className='krow';
  for(const ch of line){
    if(ch==='-'){const s=document.createElement('div');s.className='half';kr.appendChild(s);continue;}
    const b=document.createElement('button');b.className='key';b.type='button';
    if(ch==='>'){b.textContent='enter';b.dataset.key='enter';b.classList.add('wide');}
    else if(ch==='<'){b.dataset.key='back';b.classList.add('wide');b.setAttribute('aria-label','backspace');
      b.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';}
    else {b.textContent=ch;b.dataset.key=ch;keyEls[ch]=b;}
    kr.appendChild(b);}
  kb.appendChild(kr);});

function sizeBoard(){const c=$('#board-container');const h=Math.min(420,c.clientHeight),w=Math.min(350,c.clientWidth,Math.floor(h*5/6));
  board.style.width=w+'px';board.style.height=Math.floor(w*6/5)+'px';
  const fs=Math.max(16,Math.floor(w/11));rows.forEach(r=>r.tiles.forEach(t=>t.style.fontSize=fs+'px'));}
window.addEventListener('resize',sizeBoard);

function toast(msg,ms=1000){const t=document.createElement('div');t.className='toast';t.textContent=msg;$('#toaster').prepend(t);
  if(ms>0)setTimeout(()=>{t.classList.add('fade');setTimeout(()=>t.remove(),300);},ms);}

const RANK={absent:1,present:2,correct:3};
function colorKeys(guess,res){for(let i=0;i<5;i++){const k=keyEls[guess[i]];if(!k)continue;const cur=k.dataset.state;
  if(!cur||RANK[res[i]]>RANK[cur])k.dataset.state=res[i];}}

// ---------- game ----------
let current='',busy=false;
const rowIdx=()=>state.guesses.length;
function updateEnter(){const k=kb.querySelector('.key[data-key=enter]');if(k)k.classList.toggle('ready',state.status==='playing'&&current.length===5&&VALID.has(current));}
function renderCurrent(){updateEnter();const r=rows[rowIdx()];if(!r)return;
  r.tiles.forEach((t,i)=>{const ch=current[i]||'';if(t.textContent!==ch){t.textContent=ch;t.dataset.state=ch?'tbd':'empty';}});}

function restore(){state.guesses.forEach((g,ri)=>{const res=score(g,answer);rows[ri].tiles.forEach((t,i)=>{t.textContent=g[i];t.dataset.state=res[i];});colorKeys(g,res);});}

function shake(){const el=rows[rowIdx()].el;el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake');setTimeout(()=>el.classList.remove('shake'),600);}

function press(k){
  if(busy||state.status!=='playing'||anyModalOpen())return;
  if(startPending())return toast('Loading today’s starting word…',1200);
  if(k==='enter')return submit();
  if(k==='back'){current=current.slice(0,-1);return renderCurrent();}
  if(/^[a-z]$/.test(k)&&current.length<5){current+=k;renderCurrent();}
}

function submit(){
  if(current.length<5){shake();return toast('Not enough letters');}
  if(!VALID.has(current)){shake();return toast('Not a real word');}
  if(state.hard){const e=hardModeError(current);if(e){shake();return toast(e);}}
  const guess=current,res=score(guess,answer),r=rows[rowIdx()];
  busy=true;current='';updateEnter();
  state.guesses.push(guess);
  const won=guess===answer,lost=!won&&state.guesses.length===6;
  if(won||lost){state.status=won?'won':'lost';updateStats(won);state.pendingSubmit=true;}
  save('state',state);if(state.pendingSubmit)submitResult();
  r.tiles.forEach((t,i)=>{setTimeout(()=>{t.classList.add('flip-in');
    setTimeout(()=>{t.classList.remove('flip-in');t.dataset.state=res[i];t.classList.add('flip-out');
      setTimeout(()=>t.classList.remove('flip-out'),250);},250);},i*300);});
  setTimeout(()=>{colorKeys(guess,res);busy=false;
    if(won){const msgs=['Genius','Magnificent','Impressive','Splendid','Great','Phew'];
      toast(msgs[state.guesses.length-1],2000);
      r.tiles.forEach((t,i)=>setTimeout(()=>{t.classList.add('bounce');setTimeout(()=>t.classList.remove('bounce'),1000);},i*100));
      setTimeout(()=>openModal('stats'),2400);}
    else if(lost){toast(answer.toUpperCase(),-1);setTimeout(()=>openModal('stats'),2400);}
  },4*300+500);
}

function updateStats(won){
  const hist=load('history',{});hist[puzzleNo]={won,guesses:state.guesses.length};save('history',hist);
  if(stats.lastPlayed===puzzleNo)return;
  stats.played++;stats.lastPlayed=puzzleNo;
  if(won){stats.wins++;stats.dist[state.guesses.length-1]++;stats.cur=(stats.lastWon===puzzleNo-1)?stats.cur+1:1;stats.lastWon=puzzleNo;stats.max=Math.max(stats.max,stats.cur);}
  else stats.cur=0;
  save('stats',stats);
}
// streak breaks if a day was missed
if(stats.lastWon!=null&&stats.lastWon<puzzleNo-1&&stats.cur){stats.cur=0;save('stats',stats);}

// ---------- modals ----------
const anyModalOpen=()=>!!document.querySelector('.overlay:not([hidden]),.screen:not([hidden])');
function openModal(n){closeModals();if(n==='stats')renderStats();$('#modal-'+n).hidden=false;}
function closeModals(){document.querySelectorAll('.overlay').forEach(o=>o.hidden=true);}
document.querySelectorAll('.overlay').forEach(o=>{o.addEventListener('click',e=>{if(o.dataset.required)return;if(e.target===o||e.target.closest('.close'))closeModals();});});
$('#btn-help').onclick=()=>openModal('help');
$('#btn-stats').onclick=()=>openModal('stats');
$('#btn-settings').onclick=()=>{openModal('settings');renderCode();};

function renderStats(){
  $('#st-played').textContent=stats.played;
  $('#st-win').textContent=stats.played?Math.round(stats.wins/stats.played*100):0;
  $('#st-cur').textContent=stats.cur;$('#st-max').textContent=stats.max;
  const max=Math.max(1,...stats.dist),d=$('#dist');d.innerHTML='';
  stats.dist.forEach((n,i)=>{const row=document.createElement('div');row.className='drow';
    const hl=state.status==='won'&&state.guesses.length===i+1;
    row.innerHTML=`<div class="g">${i+1}</div><div class="barw"><div class="bar${hl?' hl':''}" style="width:${Math.max(7,Math.round(n/max*100))}%">${n}</div></div>`;d.appendChild(row);});
  $('#stats-footer').hidden=state.status==='playing';
  renderRot();renderRem();
}
function tick(){const now=new Date(),next=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
  let s=Math.max(0,Math.floor((next-now)/1000));if(qs.get('date'))s=Math.max(0,Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now)/1000));
  const p=n=>String(n).padStart(2,'0');$('#timer').textContent=`${p(Math.floor(s/3600))}:${p(Math.floor(s/60)%60)}:${p(s%60)}`;
  if(s===0&&!qs.get('date'))setTimeout(()=>location.reload(),1500);}
setInterval(tick,1000);tick();

// ---------- share ----------
function shareText(){const sq={correct:settings.contrast?'🟧':'🟩',present:settings.contrast?'🟦':'🟨',absent:settings.dark?'⬛':'⬜'};
  const n=state.status==='won'?state.guesses.length:'X';
  return `${NAME} ${puzzleNo.toLocaleString()} ${n}/6${state.hard?'*':''}${username?' — @'+username:''}\n\n`+state.guesses.map(g=>score(g,answer).map(s=>sq[s]).join('')).join('\n');}
async function copy(text){
  try{await navigator.clipboard.writeText(text);return true;}catch(e){}
  try{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}catch(e){return false;}
}
$('#btn-share').onclick=async()=>{const t=shareText();window.__lastShare=t;
  if(await copy(t))toast('Copied results to clipboard',2000);
  else if(navigator.share){try{await navigator.share({text:t});}catch(e){}}
  else toast('Share failed',2000);};

// ---------- settings ----------
function applySettings(){
  document.body.classList.toggle('dark',settings.dark);document.body.classList.toggle('contrast',settings.contrast);
  document.querySelector('meta[name=theme-color]').content=settings.dark?'#121213':'#ffffff';
  $('#sw-hard').setAttribute('aria-checked',state.status==='playing'&&state.guesses.length?state.hard:settings.hard);$('#sw-dark').setAttribute('aria-checked',settings.dark);$('#sw-contrast').setAttribute('aria-checked',settings.contrast);
  $('#sw-hard').classList.toggle('disabled',state.guesses.length>0&&state.status==='playing');
  save('settings',settings);}
$('#sw-hard').onclick=()=>{
  if(state.guesses.length>0&&state.status==='playing'&&!state.hard)return toast('Hard mode can only be enabled at the start of a round',1500);
  settings.hard=!state.hard;if(state.status==='playing'&&state.guesses.length===0){state.hard=settings.hard;save('state',state);}
  applySettings();$('#sw-hard').setAttribute('aria-checked',settings.hard);};
$('#sw-dark').onclick=()=>{settings.dark=!settings.dark;applySettings();};
$('#sw-contrast').onclick=()=>{settings.contrast=!settings.contrast;applySettings();};
$('#puzzle-no').textContent='#'+puzzleNo;

// help examples
document.querySelectorAll('.ex-row').forEach(r=>{const w=r.dataset.word,[pos,st]=r.dataset.state.split(':');
  [...w].forEach((ch,i)=>{const t=document.createElement('div');t.className='tile';t.textContent=ch;t.dataset.state=i==+pos?st:'tbd';t.style.animation='none';r.appendChild(t);});});

// ---------- username ----------
let afterUserSaved=()=>{};
let username=load('username',null);
const AV_COLORS=['#538d4e','#b59f3b','#3a7ca5','#a0522d','#7b5ea7','#c0504d','#2a9d8f'];
function avatarHTML(name,url,size=26){const s=`width:${size}px;height:${size}px`;
  if(url)return `<img class="av" style="${s}" src="${String(url).replace(/"/g,'&quot;')}" alt="" loading="lazy">`;
  let h=0;for(const ch of String(name||'?').toLowerCase())h=(h*31+ch.charCodeAt(0))>>>0;
  return `<span class="av" style="${s};background:${AV_COLORS[h%AV_COLORS.length]};font-size:${Math.round(size*.46)}px">${String(name||'?').charAt(0).toUpperCase().replace(/[<>&"]/g,'')}</span>`;}
let myAvatar=load('avatar',null);
const USER_RE=/^[A-Za-z0-9_]{2,20}$/;
function renderUser(){const u=username?'@'+username:'';
  $('#hdr-user').textContent=u;$('#hdr-user').hidden=!username;$('#stats-user').textContent=u;$('#set-user').textContent=u;
  $('#set-av').innerHTML=username?avatarHTML(username,myAvatar,44):'';
  const me=$('#wl-me');if(username){me.innerHTML=avatarHTML(username,myAvatar,30)+'<span>@'+username.replace(/[<>&"]/g,'')+'</span>';me.hidden=false;}else me.hidden=true;
  $('#ph-add').textContent=myAvatar?'Change photo':'Add photo';$('#ph-remove').hidden=!myAvatar;}
function openUser(changing){closeModals();const m=$('#modal-user');m.hidden=false;$('#si-form').hidden=true;$('#user-form').hidden=false;$('#si-err').textContent='';
  $('#user-close').hidden=!changing;m.dataset.required=changing?'':'1';
  const i=$('#user-input');i.value=username||'';i.classList.remove('bad');$('#user-err').textContent='';
  $('#user-save').textContent=changing?'Save':'Play';setTimeout(()=>i.focus(),50);}
// ---------- sign in with code (move to Home Screen app / new phone) ----------
let myCode=null;
async function fetchCode(){if(!username||!load('userSynced',false))return null;
  if(myCode&&new Date(myCode.expires_at)>new Date(Date.now()+60000))return myCode;
  try{const r=await rpc('get_my_code',{p_device:deviceId});if(r&&r.status==='ok')myCode=r;}catch(e){}return myCode;}
const fmtExp=c=>new Date(c.expires_at).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});
async function renderCode(){const v=$('#set-code-val'),d=$('#set-code');const c=await fetchCode();
  if(!c){v.textContent='—';d.textContent='Available once you’re online with a username.';return;}
  v.textContent=c.code;d.textContent=`Use it once to sign in on the Home Screen app or another phone. Valid for 24 hours (until ${fmtExp(c)}).`;}
$('#si-toggle').onclick=()=>{const f=$('#si-form');f.hidden=!f.hidden;$('#user-form').hidden=!f.hidden;if(!f.hidden)setTimeout(()=>$('#si-user').focus(),50);};
function rebuildFromHistory(rows){
  const st={played:0,wins:0,cur:0,max:0,dist:[0,0,0,0,0,0],lastWon:null,lastPlayed:null},hist={};let run=0,prev=null;
  rows.forEach(r=>{st.played++;st.lastPlayed=r.puzzle;hist[r.puzzle]={won:r.won,guesses:r.guesses};
    if(r.won){st.wins++;st.dist[r.guesses-1]++;run=(prev!==null&&r.puzzle===prev+1&&run>0)?run+1:1;st.lastWon=r.puzzle;st.max=Math.max(st.max,run);}else run=0;
    prev=r.puzzle;});
  st.cur=(st.lastWon!==null&&st.lastWon===st.lastPlayed&&st.lastWon>=puzzleNo-1)?run:0;
  return {st,hist};}
$('#si-form').addEventListener('submit',async e=>{e.preventDefault();
  const u=$('#si-user').value.trim(),c=$('#si-code').value.trim().toUpperCase(),err=t=>{$('#si-err').textContent=t;};
  if(!USER_RE.test(u))return err('Enter your username');if(!/^[A-Z0-9]{6}$/.test(c))return err('The code is 6 letters and numbers');
  const btn=$('#si-save');btn.disabled=true;btn.textContent='Signing in…';
  try{const r=await rpc('sign_in',{p_username:u,p_code:c});
    if(r.status!=='ok'){btn.disabled=false;btn.textContent='Sign in';
      return err(r.status==='locked'?'Too many tries. Please wait an hour and try again.':r.status==='expired'?'That code has expired. Get a fresh one from Settings in your other game.':'Username or code is wrong');}
    const rows=await rpc('get_my_history',{p_device:r.device_id});
    const {st,hist}=rebuildFromHistory(rows);const mine=rows.find(x=>x.puzzle===puzzleNo);
    let ns;
    if(mine)ns={puzzle:puzzleNo,guesses:(mine.words||[]).slice(0,6),status:mine.won?'won':'lost',hard:mine.hard_mode,pendingSubmit:false};
    else{ns=Object.assign({},state);if(ns.status!=='playing'){ns.pendingSubmit=true;hist[puzzleNo]={won:ns.status==='won',guesses:ns.guesses.length};}}
    save('device',r.device_id);save('username',r.username);save('userSynced',true);save('nameTaken',false);save('pushSaved',null);
    save('stats',st);save('history',hist);save('state',ns);save('seenHelp',true);
    sessionStorage.setItem('wm-signed-in',r.username);location.reload();
  }catch(x){btn.disabled=false;btn.textContent='Sign in';err('No connection, try again');}
});
if(sessionStorage.getItem('wm-signed-in')){const n=sessionStorage.getItem('wm-signed-in');sessionStorage.removeItem('wm-signed-in');setTimeout(()=>toast('Welcome back, @'+n+'!',2200),300);}

$('#user-form').addEventListener('submit',async e=>{e.preventDefault();
  const v=$('#user-input').value.trim();
  const bad=m=>{$('#user-input').classList.add('bad');$('#user-err').textContent=m;};
  if(!USER_RE.test(v))return bad(v.length<2?'Username must be at least 2 characters':v.length>20?'Username must be 20 characters or fewer':'Use only letters, numbers or _');
  const btn=$('#user-save'),label=btn.textContent;btn.disabled=true;btn.textContent='Checking…';
  let synced=false;
  try{const r=await rpc('claim_username',{p_device:deviceId,p_name:v});
    if(r==='taken'){btn.disabled=false;btn.textContent=label;return bad('That username is taken');}
    if(r==='invalid'){btn.disabled=false;btn.textContent=label;return bad('Use only letters, numbers or _');}
    if(r==='locked'){btn.disabled=false;btn.textContent=label;return bad('Usernames can’t be changed once set');}
    synced=r==='ok';
  }catch(err){/* offline: keep it locally, sync later */}
  btn.disabled=false;btn.textContent=label;
  const first=!username;username=v;save('username',v);save('userSynced',synced);renderUser();closeModals();
  if(synced)submitResult();
  if(synced){save('nameTaken',false);syncPush();}
  if(first)afterUserSaved(true);
  else{afterUserSaved(false);afterUserSaved=f=>{if(f)openCalendar();};toast(synced?'Username saved':'Saved on this phone (offline)',1400);}});
$('#user-input').addEventListener('input',()=>{$('#user-input').classList.remove('bad');$('#user-err').textContent='';});

// ---------- starting word rotation ----------
let rot=null,rotTried=false;
const answerFor=n=>ANSWERS[((n-1)%ANSWERS.length+ANSWERS.length)%ANSWERS.length];
function seeded(n){let x=(Math.imul(n,2654435761)^0x5bd1e995)>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};}
function fallbackWord(n,avoid){const r=seeded(n);for(let i=0;i<100;i++){const w=ANSWERS[Math.floor(r()*ANSWERS.length)];if(w!==answerFor(n)&&w!==avoid)return w;}return answerFor(n+1)===avoid?'about':answerFor(n+1);}
function prevEffective(n){if(n-1<2)return null;return rot&&rot.prev_word?rot.prev_word:fallbackWord(n-1,null);}
function effectiveStart(){if(!rot||rot.status!=='ok'||puzzleNo<2)return null;
  if(rot.start_status==='chosen')return rot.start_word;
  if(rot.start_status==='skipped')return fallbackWord(puzzleNo,prevEffective(puzzleNo));return null;}
const startPending=()=>puzzleNo>=2&&!rotTried&&state.guesses.length===0;
function applyStart(){
  const w=effectiveStart();
  if(w&&state.status==='playing'&&state.guesses.length===0&&!current){
    state.guesses.push(w);state.startWord=w;state.startBy=rot.start_by;state.startSkipped=rot.start_status==='skipped';save('state',state);
    const res=score(w,answer);rows[0].tiles.forEach((t,i)=>{t.textContent=w[i];setTimeout(()=>{t.classList.add('flip-in');
      setTimeout(()=>{t.classList.remove('flip-in');t.dataset.state=res[i];t.classList.add('flip-out');setTimeout(()=>t.classList.remove('flip-out'),250);},250);},i*200);});
    setTimeout(()=>colorKeys(w,res),1300);}
  renderStartLabel();}
function renderStartLabel(){const el=$('#start-label');
  if(state.startWord&&state.startBy){el.innerHTML=state.startSkipped?`@${esc(state.startBy)} skipped their turn, so today’s starting word is random 🎲`:`Starting word chosen by <b>@${esc(state.startBy)}</b>`;el.hidden=false;}
  else el.hidden=true;}
async function loadRot(){
  try{rot=await rpc('get_rotation_state',{p_puzzle:puzzleNo,p_device:deviceId});}catch(e){rot=null;}
  rotTried=true;applyStart();renderTurnNotes();}
function renderTurnNotes(){if(!$('#modal-stats').hidden)renderRot();}
function renderRot(){const box=$('#rot-box');
  if(!rot||rot.status!=='ok'||!rot.next_by){box.hidden=true;return;}
  box.hidden=false;
  if(rot.can_nominate){
    box.innerHTML=`<div class="rot-h">🎉 It’s your turn to pick tomorrow’s starting word!</div><div class="rot-s">Everyone starts tomorrow with your word as guess 1. Choose wisely… or wickedly. Pick before midnight or your turn is skipped.</div>
      <form id="rot-form" autocomplete="off"><input id="rot-input" maxlength="5" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="5-letter word"><button class="btn-small" id="rot-save" type="submit">Lock it in</button></form><div class="user-err" id="rot-err"></div>`;
    $('#rot-form').onsubmit=nominate;}
  else if(rot.my_turn&&!rot.next_chosen){if(state.status==='playing'){box.hidden=true;return;}box.innerHTML='<div class="rot-s">Saving your result…</div>';}
  else if(rot.my_turn)box.innerHTML='<div class="rot-s">✓ You’ve locked in tomorrow’s starting word. No peeking!</div>';
  else box.innerHTML=`<div class="rot-s">Tomorrow’s starting word: <b>@${esc(rot.next_by)}</b>’s pick ${rot.next_chosen?'✓':'(not chosen yet)'}</div>`;}
async function nominate(e){e.preventDefault();const w=$('#rot-input').value.trim().toLowerCase(),err=t=>{$('#rot-err').textContent=t;};
  if(!/^[a-z]{5}$/.test(w))return err('It needs to be exactly 5 letters');
  if(!VALID.has(w))return err('Not a real word');
  if(w===answerFor(puzzleNo+1))return err('Sneaky! That word can’t be used. Try another');
  if(w===(state.startWord||null))return err('That was today’s starting word. Pick a different one');
  $('#rot-save').disabled=true;
  try{const r=await rpc('submit_start_word',{p_device:deviceId,p_puzzle:puzzleNo+1,p_word:w});
    const m={ok:null,already_set:'Already chosen',not_your_turn:'It’s not your turn',not_finished:'Finish today’s puzzle first',too_late:'Too late, the day has ended',same_as_yesterday:'That was today’s starting word. Pick a different one',invalid:'Not a real word'};
    if(r==='ok'){toast('Locked in! Tomorrow starts with '+w.toUpperCase(),2500);}else err(m[r]||'Something went wrong');
  }catch(x){err('No connection, try again');}
  $('#rot-save')&&($('#rot-save').disabled=false);
  if(rot)await loadRot();}

// ---------- reminders (web push) ----------
const VAPID_PUBLIC='BO6krdLS-R2FiMEn2uLsonpef2YWIjdgEqq25qRz1aFVhRzYvY3k1Hsu4hkMcBstAyraC0DraAItqEmeF7_0Qds';
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const pushSupported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
let swReg=null;
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
function keyBytes(s){const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function getSub(){const reg=swReg||await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(VAPID_PUBLIC)});}
async function saveSub(sub){if(!username||!load('userSynced',false))return;const j=sub.toJSON();
  try{const r=await rpc('save_push_subscription',{p_device:deviceId,p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});if(r==='ok')save('pushSaved',j.endpoint);}catch(e){}}
async function syncPush(){if(!pushSupported||Notification.permission!=='granted')return;try{const s=await getSub();if(load('pushSaved',null)!==s.endpoint)await saveSub(s);}catch(e){}renderRem();}
async function enablePush(){if(!pushSupported)return 'unsupported';
  const p=await Notification.requestPermission();if(p!=='granted'){renderRem();return p;}
  try{await saveSub(await getSub());}catch(e){}renderRem();return 'granted';}
function renderRem(){const box=$('#rem-box');if(!box)return;
  if(state.status==='playing'){box.hidden=true;return;}
  if(isIOS&&!isStandalone){box.innerHTML='🔔 Want daily reminders? Tap <b>Share</b> then <b>Add to Home Screen</b>, open Wordle Masters from your Home Screen and turn them on there.<div class="code-line" id="hint-code" hidden></div>';box.hidden=false;
    fetchCode().then(c=>{const el=$('#hint-code');if(c&&el){el.innerHTML=`Your code: <b>${c.code}</b>. You’ll need it once in the Home Screen app, with your username @${esc(username)}. Valid for 24 hours.`;el.hidden=false;}});return;}
  if(!pushSupported||Notification.permission==='denied'){box.hidden=true;return;}
  if(Notification.permission==='granted'&&load('pushSaved',null)){box.innerHTML='🔔 Reminders are on';box.hidden=false;return;}
  box.innerHTML='<button class="btn-small" id="rem-btn">🔔 Turn on reminders</button>';box.hidden=false;
  $('#rem-btn').onclick=async()=>{const r=await enablePush();toast(r==='granted'?'Reminders on! See you at 6pm 😉':'Reminders not turned on',2000);};}
$('#rem-allow').onclick=async()=>{$('#modal-rem').hidden=true;const r=await enablePush();if(r==='granted')toast('Reminders on! See you at 6pm 😉',2000);};
$('#rem-later').onclick=()=>{save('remDismissed',dayKey());$('#modal-rem').hidden=true;};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js',{scope:'./'}).then(r=>{swReg=r;syncPush();}).catch(()=>{});
if(isStandalone&&pushSupported&&Notification.permission==='default'&&load('remDismissed',null)!==dayKey())$('#modal-rem').hidden=false;

// ---------- result submission ----------
async function submitResult(){
  if(!state.pendingSubmit||!username||!load('userSynced',false))return;
  try{const res=await rpc('submit_result',{p_device:deviceId,p_puzzle:state.puzzle,p_won:state.status==='won',p_guesses:state.status==='won'?state.guesses.length:6,p_hard:!!state.hard,p_words:state.guesses.slice(0,6)});
    if(res==='ok'||res==='duplicate'||res==='invalid'){state.pendingSubmit=false;save('state',state);loadRot();}
    else if(res==='no_player'){save('userSynced',false);syncUser();}
  }catch(e){/* offline: retry on next load */}
}
async function syncUser(){
  if(!username||load('userSynced',false))return submitResult();
  try{const r=await rpc('claim_username',{p_device:deviceId,p_name:username});
    if(r==='ok'){save('userSynced',true);save('nameTaken',false);submitResult();syncPush();}
    else if(r==='taken')save('nameTaken',true);
  }catch(e){}
}

// ---------- leaderboard modal ----------
let boardTab='today';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadBoard(){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===boardTab));
  const list=$('#board-list'),sub=$('#board-sub');list.innerHTML='<div class="board-empty">Loading…</div>';
  sub.textContent=boardTab==='today'?`Puzzle #${puzzleNo} · fewest guesses, then earliest finish`:'Most wins, then win %, then avg guesses';
  const tab=boardTab;
  try{const rows=tab==='today'?await rpc('get_today_board',{p_puzzle:puzzleNo,p_limit:50}):await rpc('get_alltime_board',{p_limit:50});
    if(tab!==boardTab)return;
    if(!rows.length){list.innerHTML='<div class="board-empty">'+(tab==='today'?'No results yet today. Be the first!':'No results yet.')+'</div>';return;}
    const me=(username||'').toLowerCase();
    list.innerHTML=rows.map(r=>{const mine=r.username.toLowerCase()===me;
      const val=tab==='today'?`${r.won?r.guesses:'X'}/6<small>${new Date(r.finished_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>`
        :`${r.wins} wins<small>${r.win_pct}% · ${r.avg_guesses??'–'} avg · 🔥${r.current_streak}</small>`;
      return `<div class="brow${mine?' me':''}"><div class="rk">${r.rank}</div><div class="nm">${avatarHTML(r.username,r.avatar_url)}${tab==='today'?`<button class="pname" data-user="${esc(r.username)}">@${esc(r.username)}</button>`:'<span class="uname">@'+esc(r.username)+'</span>'}${tab==='today'&&r.hard_mode?'<span class="hm">★ hard</span>':''}</div><div class="vl">${val}</div></div>`;}).join('');
  }catch(e){if(tab===boardTab)list.innerHTML='<div class="board-empty">Leaderboard unavailable right now. Check your connection.</div>';}
}
$('#btn-board').onclick=()=>{openModal('board');loadBoard();};
// ---------- view another player's board (today only, after you finish) ----------
$('#board-list').addEventListener('click',e=>{const b=e.target.closest('.pname');if(b&&boardTab==='today')viewPlayer(b.dataset.user);});
let pbFrom='board',pbPuzzle=0;
async function viewPlayer(name,p=puzzleNo,from='board'){pbFrom=from;pbPuzzle=p;
  openModal('pboard');$('#pb-title').textContent='@'+name;$('#pb-result').textContent='';$('#pb-av').innerHTML='';const grid=$('#pb-grid');
  $('#pb-back').innerHTML=from==='day'?'&#8249; Puzzle #'+p:'&#8249; Leaderboard';
  const msg=t=>{grid.innerHTML=`<div class="board-empty">${t}</div>`;};
  if(p>=puzzleNo&&state.status==='playing')return msg("Finish today's puzzle to see everyone's guesses");
  msg('Loading…');
  try{const r=await rpc('get_player_board',{p_viewer:deviceId,p_username:name,p_puzzle:p});
    if(r.status==='locked')return msg("Finish today's puzzle to see everyone's guesses");
    if(r.status==='ok')$('#pb-av').innerHTML=avatarHTML(r.username,r.avatar_url,56);
    if(r.status!=='ok'||!r.words)return msg(r.status==='ok'?`${r.won?r.guesses:'X'}/6. This board wasn’t saved.`:'Board not available.');
    const ans=answerFor(p);
    $('#pb-result').textContent=(r.won?r.guesses:'X')+'/6'+(r.hard_mode?' ★ hard':'');
    let html='';for(let i=0;i<6;i++){const w=r.words[i];const res=w?score(w,ans):null;
      html+='<div class="pb-row">'+[0,1,2,3,4].map(j=>`<div class="tile" data-state="${w?res[j]:'empty'}">${w?w[j]:''}</div>`).join('')+'</div>';}
    grid.innerHTML=html;
  }catch(e){msg('Couldn’t load this board. Check your connection.');}
}
$('#pb-back').onclick=()=>{if(pbFrom==='day')openDay(pbPuzzle);else{openModal('board');loadBoard();}};

// ---------- past days (read-only) ----------
const dayDate=n=>new Date(2026,10,14+n-1).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}).replace(',','');
async function openDay(n){openModal('day');
  $('#day-h').textContent='Puzzle #'+n;$('#day-date').textContent=dayDate(n)+' · fewest guesses, then earliest finish';
  const ans=answerFor(n);$('#day-ans').innerHTML=[...ans].map(ch=>`<div class="tile" data-state="correct">${ch}</div>`).join('');
  const st=$('#day-start'),list=$('#day-list');st.textContent='';list.innerHTML='<div class="board-empty">Loading…</div>';
  try{const [d,rows]=await Promise.all([rpc('get_day_start',{p_puzzle:n}),rpc('get_today_board',{p_puzzle:n,p_limit:100})]);
    if(d.start_status==='chosen')st.innerHTML=`Starting word <b>${esc(d.start_word.toUpperCase())}</b> chosen by <b>@${esc(d.start_by)}</b>`;
    else if(d.start_status==='skipped'){const prev=d.prev_word||(n-1>=2?fallbackWord(n-1,null):null);st.innerHTML=`Random starting word <b>${fallbackWord(n,prev).toUpperCase()}</b> (@${esc(d.start_by)} skipped)`;}
    else st.textContent=n<2?'No starting word this day':'';
    if(!rows.length){list.innerHTML='<div class="board-empty">Nobody played this day</div>';return;}
    const me=(username||'').toLowerCase();
    list.innerHTML=rows.map(r=>`<div class="brow${r.username.toLowerCase()===me?' me':''}"><div class="rk">${r.rank}</div><div class="nm">${avatarHTML(r.username,r.avatar_url)}<button class="pname" data-user="${esc(r.username)}">@${esc(r.username)}</button>${r.hard_mode?'<span class="hm">★</span>':''}</div><div class="vl">${r.won?r.guesses:'X'}/6</div></div>`).join('');
  }catch(e){list.innerHTML='<div class="board-empty">Couldn’t load this day. Check your connection.</div>';}
}
$('#day-list').addEventListener('click',e=>{const b=e.target.closest('.pname');const n=Number(($('#day-h').textContent.match(/\d+/)||[0])[0]);if(b&&n)viewPlayer(b.dataset.user,n,'day');});

// ---------- profile photo ----------
const AVATAR_FN=SB_URL+'/functions/v1/wm-avatar';
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),i=new Image();i.onload=()=>{res(i);};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('img'));};i.src=u;});}
async function squareJpeg(file){const img=await loadImg(file);const side=Math.min(img.naturalWidth,img.naturalHeight);
  const cv=document.createElement('canvas');cv.width=cv.height=256;const cx=cv.getContext('2d');
  cx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,256,256);URL.revokeObjectURL(img.src);
  for(const q of [0.85,0.75,0.6,0.45]){const d=cv.toDataURL('image/jpeg',q);if(d.length*0.75<=200*1024)return d;}
  throw new Error('too_big');}
async function avatarCall(body){const r=await fetch(AVATAR_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({device_id:deviceId},body))});return r.json();}
$('#ph-input').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  if(!username||!load('userSynced',false))return toast('Go online with your username first',1800);
  $('#ph-desc').textContent='Uploading…';
  try{const d=await squareJpeg(f);const r=await avatarCall({image:d});
    if(r.status!=='ok')throw new Error(r.status);myAvatar=r.avatar_url;save('avatar',myAvatar);renderUser();toast('Photo updated',1400);}
  catch(x){toast(x.message==='too_big'?'That photo is too big':'Couldn’t upload the photo',1800);}
  $('#ph-desc').textContent='Shown next to your name';});
$('#ph-remove').onclick=async()=>{try{const r=await avatarCall({remove:true});if(r.status==='ok'){myAvatar=null;save('avatar',null);renderUser();toast('Photo removed',1400);}}catch(x){toast('Couldn’t remove the photo',1600);}};
async function syncAvatar(){if(!username||!load('userSynced',false))return;try{const u=await rpc('get_my_avatar',{p_device:deviceId});if((u||null)!==myAvatar){myAvatar=u||null;save('avatar',myAvatar);renderUser();}}catch(e){}}

// ---------- yesterday's winner splash (once per day per device) ----------
async function maybeSplash(){
  const y=puzzleNo-1;if(y<1||load('splashDay',null)===puzzleNo)return;
  let w=null;try{const rows=await Promise.race([rpc('get_today_board',{p_puzzle:y,p_limit:1}),new Promise((_,rj)=>setTimeout(()=>rj(),2500))]);w=rows&&rows[0];}catch(e){return;}
  save('splashDay',puzzleNo);if(!w||!w.won)return;
  $('#win-av').innerHTML=avatarHTML(w.username,w.avatar_url,120);$('#win-name').textContent='@'+w.username;
  $('#win-for').textContent='for '+dayDate(y);$('#win-score').textContent=w.guesses+'/6';
  const cf=$('#confetti');cf.innerHTML='';const cols=['#538d4e','#b59f3b','#c9b458','#6aaa64','#ffffff','#3a3a3c'];
  for(let i=0;i<70;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=cols[i%cols.length];
    p.style.animationDuration=(2.2+Math.random()*1.8)+'s';p.style.animationDelay=(Math.random()*1.2)+'s';p.style.transform=`rotate(${Math.random()*360}deg)`;cf.appendChild(p);}
  const s=$('#screen-win');s.classList.remove('leaving');s.hidden=false;
  await new Promise(res=>{let done=false;const fin=()=>{if(done)return;done=true;s.onclick=null;res();};s.onclick=fin;setTimeout(fin,4000);});
}
async function goCalendar(){await maybeSplash();openCalendar();}

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{boardTab=t.dataset.tab;loadBoard();});

// ---------- input ----------
kb.addEventListener('click',e=>{const b=e.target.closest('.key');if(b){press(b.dataset.key);b.blur();}});
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Escape'){if(!$('#modal-user').hidden&&$('#modal-user').dataset.required)return;return closeModals();}
  if(!$('#modal-user').hidden)return;
  if(e.key==='Enter'){e.preventDefault();press('enter');}
  else if(e.key==='Backspace')press('back');
  else if(/^[a-zA-Z]$/.test(e.key))press(e.key.toLowerCase());
});

// ---------- init ----------
applySettings();restore();renderUser();sizeBoard();
// ---------- welcome + calendar ----------
(function(){const words=['WORDLE','MASTERS'],cols=[['g','a','y','g','a','g'],['y','g','a','g','y','a','g']];let k=0;
  words.forEach((w,ri)=>{const row=document.createElement('div');row.className='wl-row';
    [...w].forEach((ch,i)=>{const t=document.createElement('div');t.className='wl-tile '+cols[ri][i];t.textContent=ch;t.style.setProperty('--d',(0.15+k++*0.18)+'s');row.appendChild(t);});
    $('#wl-tiles').appendChild(row);});})();
const FIRST=new Date(2026,10,14);
let calMonth=new Date(today.getFullYear(),today.getMonth(),1);
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>{if(s.id!==id&&!s.hidden){s.classList.add('leaving');setTimeout(()=>{s.hidden=true;s.classList.remove('leaving');},350);}});
  if(id){const s=$('#'+id);s.hidden=false;}}
function renderCal(){
  const hist=load('history',{});if(state.status!=='playing')hist[puzzleNo]={won:state.status==='won',guesses:state.guesses.length};
  $('#cal-user').textContent=username?'@'+username:'';
  $('#cal-month').textContent=calMonth.toLocaleDateString([],{month:'long',year:'numeric'});
  $('#cal-prev').disabled=calMonth<=new Date(FIRST.getFullYear(),FIRST.getMonth(),1);
  $('#cal-next').disabled=calMonth>=new Date(today.getFullYear(),today.getMonth(),1);
  const g=$('#cal-days');g.innerHTML='';
  for(let i=0;i<calMonth.getDay();i++)g.appendChild(document.createElement('span'));
  const days=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,0).getDate();
  for(let d=1;d<=days;d++){const dt=new Date(calMonth.getFullYear(),calMonth.getMonth(),d),n=dayIndex(dt)+1;
    const b=document.createElement('button');b.className='cday';b.type='button';b.innerHTML=`<span>${d}</span>`;b.disabled=true;
    const h=hist[n];
    if(n===puzzleNo){b.classList.add('today');b.disabled=false;b.setAttribute('aria-label','Play today’s challenge');
      if(h){b.classList.add(h.won?'won':'lost');b.innerHTML+=`<span class="r">${h.won?'✓ '+h.guesses+'/6':'✗ X/6'}</span>`;}
      else{b.classList.add('open');b.innerHTML+='<span class="r">PLAY</span>';}
      b.onclick=state.status!=='playing'?()=>openDay(puzzleNo):openGame;}
    else if(n>=1&&n<puzzleNo){b.classList.add('past');b.disabled=false;b.setAttribute('aria-label','View puzzle #'+n);b.onclick=()=>openDay(n);if(h){b.classList.add(h.won?'won':'lost');b.innerHTML+=`<span class="r">${h.won?'✓ '+h.guesses+'/6':'✗'}</span>`;}}
    g.appendChild(b);}
}
$('#cal-prev').onclick=()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);renderCal();};
$('#cal-next').onclick=()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);renderCal();};
$('#btn-cal').onclick=()=>openCalendar();
$('#cal-back').onclick=()=>showScreen('screen-welcome');
function openCalendar(){renderCal();showScreen('screen-cal');}
function openGame(){showScreen(null);
  if(!load('seenHelp',false)){save('seenHelp',true);setTimeout(()=>openModal('help'),360);}
  else if(state.status!=='playing')setTimeout(()=>openModal('stats'),500);}
afterUserSaved=first=>{if(first)goCalendar();};
$('#btn-start').onclick=()=>{if(!username)openUser(false);
  else if(load('nameTaken',false)){openUser(true);$('#user-err').textContent='That username is taken – please choose another';$('#user-input').classList.add('bad');afterUserSaved=()=>openCalendar();}
  else goCalendar();};
if(username){syncUser();syncAvatar();}
renderStartLabel();loadRot();
// ---------- sign-in code on the welcome page: off in Wordle Masters (code is in Settings) ----------
const WL_CODE_UNTIL=0;
async function renderWelcomeCode(){const el=$('#wl-code');
  if(!username||isStandalone||Date.now()>=WL_CODE_UNTIL){el.hidden=true;return;}
  const c=await fetchCode();if(!c||Date.now()>=WL_CODE_UNTIL){el.hidden=true;return;}
  el.innerHTML=`Moving to your Home Screen? Your sign-in code: <b>${esc(c.code)}</b> (valid 24 hrs) · tap to copy`;el.hidden=false;
  el.onclick=async()=>{toast((await copy(c.code))?'Code copied':'Your code: '+c.code,1600);};}
renderWelcomeCode();setTimeout(()=>{if(Date.now()>=WL_CODE_UNTIL)$('#wl-code').hidden=true;},Math.max(0,Math.min(WL_CODE_UNTIL-Date.now(),2147483000)));
})();
