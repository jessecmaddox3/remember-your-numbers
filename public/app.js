import { DEMO_CONFIG } from './data.mjs';
import {guardedWrite} from './persistence.mjs';
import {validateConfig,normalizeStore,numberSignature,validateBackup} from './state.mjs';
import {
  chunkDigits,
  levelsFor,
  makeChoices,
  newProgress,
  completeLevel,
  isLevelAvailable,
  isReviewDue,
  recordReviewMiss,
} from './logic.mjs';

const STORE_KEY = 'remember-your-numbers-v1';
const app = document.getElementById('app');

const LEVEL_TITLES = {
  learn: 'Say it with me',
  spot: 'Spot the missing piece',
  hint: 'Type it with a hint',
  cold: 'Type it all by yourself',
  prove: 'Prove it!',
};

const PRAISE = [
  'You worked hard on that!',
  'Your brain just got stronger!',
  'All that practice is working!',
  'You stuck with it. That’s how you learn!',
];

let baseline=null;
let writeGeneration=0;
let stale=false;
let storageIssue = '';
let recoveryRaw = null;
let message = '';
let bundle = loadBundle();
let config = bundle.config;
let store = bundle.store;
let state = { screen: 'profiles', profile: null, number: null, levels: null, levelIndex: 0 };
let roundEpoch = 0;
const pending = new Set();

function loadBundle() {
  const fresh = {config:validateConfig(DEMO_CONFIG),store:normalizeStore(null,DEMO_CONFIG)};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    baseline=raw;
    if (!raw) return fresh;
    try { return validateBackup(JSON.parse(raw)); }
    catch { recoveryRaw=raw; storageIssue='Your saved file could not be read. The original is preserved. This demo is temporary until you import a valid backup or save a new setup.';return fresh; }
  } catch { storageIssue='Browser storage is unavailable. You can play, but export a backup before closing.';return fresh; }
}
function storageNotice(){
  document.getElementById('save-notice')?.remove();
  if(storageIssue&&!stale)app.prepend(el('p',{id:'save-notice',class:'notice',role:'status',text:storageIssue}));
}
function markConflict(){
  if(stale)return;
  stale=true;writeGeneration++;cancelRound();settingsDraft=null;state.screen='conflict';render();
}
async function writeSaved(value){
  if(stale)return false;
  const generation=writeGeneration;
  let result;
  try{result=await guardedWrite({storage:localStorage,locks:navigator.locks,key:STORE_KEY,expected:()=>baseline,value,onSaved:value=>{baseline=value;},isCurrent:()=>!stale&&generation===writeGeneration});}
  catch{result={status:'unavailable'};}
  if(generation!==writeGeneration)return false;
  if(result.status==='conflict'){markConflict();return false;}
  if(result.status==='cancelled')return false;
  storageIssue=result.status==='saved'?'':'This browser could not save safely. Your current play is temporary; export a backup before closing.';
  storageNotice();return result.status==='saved';
}
async function saveStore(){
  if(recoveryRaw!==null)return false;
  return writeSaved(JSON.stringify({format:'remember-your-numbers',version:1,config,store}));
}
window.addEventListener('storage',event=>{
  if(event.storageArea!==localStorage||(event.key!==STORE_KEY&&event.key!==null))return;
  try{if(localStorage.getItem(STORE_KEY)!==baseline)markConflict();}catch{markConflict();}
});
function getProgress(profileId, numberId) {
  return {...store.progress[profileId][numberId]};
}
function setProgress(profileId, numberId, progress) {
  const number=config.profiles.find(p=>p.id===profileId).numbers.find(n=>n.id===numberId);
  store.progress[profileId][numberId]={...progress,signature:numberSignature(number)};
  saveStore();
}
function cancelRound() {
  roundEpoch++;for(const timer of pending)clearTimeout(timer);pending.clear();
  window.speechSynthesis?.cancel();state.round=null;
}
function navigate(screen) { cancelRound();if(screen!=='settings')settingsDraft=null;state.screen=screen;message='';render(); }
function later(callback,delay) {
  const epoch=roundEpoch,profile=state.profile?.id,number=state.number?.id;
  const timer=setTimeout(()=>{
    pending.delete(timer);
    if(epoch===roundEpoch&&state.screen==='play'&&state.profile?.id===profile&&state.number?.id===number)callback();
  },delay);
  pending.add(timer);return timer;
}

/* ---------- speech ---------- */
function localVoice() {
  const voices=window.speechSynthesis?.getVoices()||[];
  return voices.find(v=>v.localService&&v.lang?.startsWith('en'))||voices.find(v=>v.localService);
}
function speak(text, rate = 1) {
  if(store.muted)return;
  const voice=localVoice();if(!voice)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.rate=rate;speechSynthesis.speak(u);
}
function speakDigits(digits) { speak(digits.split('').join(', '),0.85); }
function toggleSound() {
  window.speechSynthesis?.cancel();
  if(store.muted&&!localVoice())message='No local speech voice is available yet. You can practice silently. A voice installed in your device settings may become available after reopening the browser.';
  else {store.muted=!store.muted;message='';saveStore();}
  render();
}

/* ---------- tiny dom helper ---------- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  if(tag==='button')node.type='button';
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if(k==='value') node.value=v;
    else if(v!==false&&v!==null&&v!==undefined) node.setAttribute(k,v);
  }
  for (const child of children) node.append(child);
  return node;
}

function chunkClass(i) { return `c${i % 3}`; }

function levelTitle(level) {
  if (level.kind === 'fill') {
    return level.hiddenChunks.length === 1 ? 'Fill in the hidden piece' : 'Fill in the hidden pieces';
  }
  return LEVEL_TITLES[level.id];
}

/* ---------- screens ---------- */

function render() {
  app.replaceChildren();
  if(storageIssue&&!stale)app.append(el('div',{id:'save-notice',class:'notice',role:'status'},[
    el('p',{text:storageIssue}),
    ...(recoveryRaw!==null?[el('button',{class:'smallbtn',text:'Save original recovery file',onclick:()=>download('numbers-recovery.txt',recoveryRaw,'text/plain')})]:[]),
  ]));
  if(message)app.append(el('p',{class:'notice',role:'status',text:message}));
  if (state.screen === 'profiles') renderProfiles();
  else if (state.screen === 'home') renderHome();
  else if (state.screen === 'play') renderPlay();
  else if (state.screen === 'done') renderDone();
  else if(state.screen==='settings')renderSettings();
  else if(state.screen==='saving')app.append(el('h1',{text:'Saving your setup…'}));
  else if(state.screen==='conflict')app.append(el('h1',{text:'This game changed in another tab'}),
    el('p',{text:'This older tab has stopped saving, so it cannot overwrite or restore the newer setup. Reload to use the current version. If you want to keep this tab’s older copy, you can export it first.'}),
    el('button',{class:'bigbtn',text:'Reload current setup',onclick:()=>location.reload()}),
    el('button',{class:'bigbtn quiet',text:'Export this tab’s older copy',onclick:()=>download('remember-your-numbers-older-copy.json',JSON.stringify({format:'remember-your-numbers',version:1,config,store},null,2))}));
}

function topbar(backTo) {
  const left = backTo
    ? el('button', { class: 'backbtn', text: '← Back', onclick: () => navigate(backTo) })
    : el('span');
  const mute = el('button', {
    class: 'iconbtn',
    'aria-label': store.muted ? 'Turn sound on' : 'Turn sound off',
    text: store.muted ? '\u{1F507}' : '\u{1F50A}',
    onclick: toggleSound,
  });
  return el('div', { class: 'topbar' }, [left, mute]);
}

function renderProfiles() {
  app.append(
    topbar(null),
    el('h1', { text: 'Remember Your Numbers' }),
    el('p', { class: 'subtitle', text: 'Who’s playing?' }),
    el('p',{class:'setup-note',text:JSON.stringify(config)===JSON.stringify(validateConfig(DEMO_CONFIG))?'These are fictional demo learners and numbers. Use Setup to add your own.':'Your learners and numbers stay in this browser. Export a backup in Setup.'}),
    el('button',{class:'smallbtn',text:'Setup and backups',onclick:()=>navigate('settings')}),
    el('button',{class:'smallbtn',text:'Add my own numbers',onclick:()=>{settingsDraft=[blankProfile()];navigate('settings');}}),
    el('div', { class: 'profiles' }, config.profiles.map((p) =>
      el('button', { class: 'profile-card', onclick: () => { state.profile=p;navigate('home'); } }, [
        el('span', { class: 'emoji', text: p.emoji }),
        el('span', { text: p.name }),
      ])
    )),
    el('details', { class: 'grownups' }, [
      el('summary', { text: 'For grown-ups' }),
      el('p', { text: 'Each number is learned in small steps: hear it, spot it, fill in the end first, then type the whole thing from memory. A number only counts as mastered after your kid can type it cold on a later day, and the game asks for a quick pop quiz now and then so it sticks. Sessions are meant to be short: one or two wins and done.' }),
    ])
  );
}

function statusFor(profile, def) {
  const progress = getProgress(profile.id, def.id);
  const levels = levelsFor(def.chunks);
  const now = Date.now();
  if (progress.mastered) {
    return isReviewDue(progress, now)
      ? { badge: 'Pop quiz!', badgeClass: 'badge quiz', line: 'Show me you still know it' }
      : { badge: '⭐ Mastered', badgeClass: 'badge', line: 'You know this one!' };
  }
  const frontier = levels[progress.unlocked];
  if (frontier.id === 'prove' && !isLevelAvailable(progress, levels, progress.unlocked, now)) {
    return { badge: 'Come back tomorrow!', badgeClass: 'badge quiz', line: 'One sleep, then prove it' };
  }
  return { badge: null, line: `Step ${progress.unlocked + 1} of ${levels.length}` };
}

function renderHome() {
  const profile = state.profile;
  app.append(
    topbar('profiles'),
    el('h1', { text: `Hi, ${profile.name}!` }),
    el('p', { class: 'subtitle', text: 'Pick a number to practice' }),
    el('div', { class: 'number-cards' }, profile.numbers.map((def) => {
      const progress = getProgress(profile.id, def.id);
      const levels = levelsFor(def.chunks);
      const status = statusFor(profile, def);
      const chunks = chunkDigits(def.digits, def.chunks);
      const hideDigits = progress.unlocked >= levels.findIndex((l) => l.id === 'hint');
      const digitsRow = hideDigits
        ? el('div', { class: 'digits secret', text: '●'.repeat(def.digits.length) })
        : el('div', { class: 'digits' }, chunks.map((c, i) => el('span', { class: chunkClass(i), text: (i ? '‑' : '') + c })));
      const pct = Math.round(100 * Math.min(progress.unlocked, levels.length) / levels.length);
      return el('button', { class: 'number-card', onclick: () => startRound(def) }, [
        el('div', { class: 'label' }, [
          el('span', { text: def.label }),
          ...(status.badge ? [el('span', { class: status.badgeClass, text: status.badge })] : []),
        ]),
        digitsRow,
        el('div', { class: 'progress-row' }, [
          el('div', { class: 'meter' }, [el('i', { style: `width:${progress.mastered ? 100 : pct}%` })]),
          el('span', { text: status.line }),
        ]),
      ]);
    }))
  );
}

function startRound(def) {
  cancelRound();
  const profile = state.profile;
  const progress = getProgress(profile.id, def.id);
  const levels = levelsFor(def.chunks);
  const now = Date.now();
  let index;
  if (progress.mastered) {
    index = isReviewDue(progress, now)
      ? levels.findIndex((l) => l.id === 'prove')
      : levels.findIndex((l) => l.id === 'cold');
  } else if (!isLevelAvailable(progress, levels, progress.unlocked, now)) {
    index = levels.findIndex((l) => l.id === 'cold'); // prove is resting: practice cold
  } else {
    index = progress.unlocked;
  }
  state.number = def;
  state.levels = levels;
  state.levelIndex = index;
  state.round = null;
  state.screen = 'play';
  render();
}

/* ---------- play ---------- */

function renderPlay() {
  const level = state.levels[state.levelIndex];
  app.append(topbar('home'));
  app.append(el('h1', { text: levelTitle(level) }));
  app.append(el('p', { class: 'subtitle', text: state.number.label }));
  if (level.kind === 'learn') renderLearn();
  else if (level.kind === 'choice') renderSpot();
  else renderFill(level);
}

function chunksOf(def) { return chunkDigits(def.digits, def.chunks); }

function renderLearn() {
  const chunks = chunksOf(state.number);
  if (!state.round) state.round = { pass: 1, tapped: new Set(), lock:false };
  const round = state.round;
  const prompt = el('p', {
    class: 'prompt',
    text: round.pass === 1
      ? 'Tap each piece and say it out loud'
      : 'Again! One more time makes it stick',
  });
  const line = el('div', { class: 'number-line' }, chunks.map((c, i) =>
    el('button', {
      class: `chunk ${chunkClass(i)}${round.tapped.has(i) ? ' done' : ''}`,
      text: c,
      onclick: () => {
        if(round.lock)return;
        speakDigits(c);
        round.tapped.add(i);
        if (round.tapped.size === chunks.length) {
          round.lock=true;
          if (round.pass === 1) {
            state.round = { pass: 2, tapped: new Set(), lock:false };
            later(render, 700);
            return;
          }
          later(() => finishRound(true), 700);
          return;
        }
        render();
      },
    })
  ));
  app.append(prompt, line);
}

function renderSpot() {
  const chunks = chunksOf(state.number);
  if (!state.round) {
    // Backward chained: quiz the last chunk first.
    const order = chunks.map((_, i) => i).reverse();
    state.round = { order, q: 0, mistakes: 0, choices: null, lock: false };
  }
  const round = state.round;
  const hidden = round.order[round.q];
  if (!round.choices) round.choices = makeChoices(chunks, hidden, Math.random);
  const prompt = el('p', { class: 'prompt', text: 'Which piece is missing?' });
  const line = el('div', { class: 'number-line' }, chunks.map((c, i) =>
    el('span', {
      class: `chunk ${i === hidden ? 'mystery' : chunkClass(i)}`,
      text: i === hidden ? '?'.repeat(c.length) : c,
    })
  ));
  const choices = el('div', { class: 'choices' }, round.choices.map((c) => {
    const btn = el('button', { class: `choice ${chunkClass(hidden)}` , text: c });
    btn.addEventListener('click', () => {
      if (round.lock) return;
      if (c === chunks[hidden]) {
        round.lock = true;
        btn.classList.add('right');
        speakDigits(c);
        prompt.textContent = 'Yes!';
        prompt.className = 'prompt yay';
        later(() => {
          round.q += 1;
          round.choices = null;
          round.lock = false;
          if (round.q >= round.order.length) finishRound(round.mistakes === 0);
          else render();
        }, 900);
      } else {
        round.mistakes += 1;
        btn.classList.add('wrong');
        prompt.textContent = 'Almost! Look closely.';
        prompt.className = 'prompt oops';
      }
    });
    return btn;
  }));
  app.append(prompt, line, choices);
}

function renderFill(level) {
  const def = state.number;
  const chunks = chunksOf(def);
  const hiddenChunks = level.kind === 'fill' ? level.hiddenChunks : chunks.map((_, i) => i);
  if (!state.round) {
    const slots = [];
    chunks.forEach((chunk, ci) => {
      chunk.split('').forEach((digit, di) => {
        slots.push({ ci, digit, hidden: hiddenChunks.includes(ci), filled: false });
      });
    });
    if (level.firstDigitShown && slots[0].hidden) slots[0].filled = true;
    state.round = { slots, mistakes: 0, streakMiss: 0, peeking: false, lock:false };
  }
  const round = state.round;
  const cursor = round.slots.find((s) => s.hidden && !s.filled);

  const prompt = el('p', {
    class: 'prompt',
    text: level.kind === 'fill' ? 'Type the missing part' : 'Type the whole number',
  });

  let slotIndex = 0;
  const line = el('div', { class: 'number-line' }, chunks.map((chunk, ci) =>
    el('span', { class: `chunk ${chunkClass(ci)}` }, chunk.split('').map(() => {
      const s = round.slots[slotIndex++];
      if (!s.hidden || s.filled) return el('span', { class: 'digit-box', text: s.digit });
      return el('span', { class: `digit-box empty${s === cursor ? ' cursor' : ''}`, text: ' ' });
    }))
  ));

  const keypad = el('div', { class: 'keypad' }, [...'123456789', '0'].map((d) =>
    el('button', {
      class: `key${d === '0' ? ' zero' : ''}`,
      text: d,
      onclick: (e) => {
        if (!cursor || round.peeking || round.lock) return;
        if (d === cursor.digit) {
          cursor.filled = true;
          round.streakMiss = 0;
          speak(d, 1.1);
          if (round.slots.every((s) => !s.hidden || s.filled)) {
            round.lock=true;
            const clean = level.id === 'prove' ? round.mistakes === 0 : round.mistakes <= 1;
            speakDigits(def.digits);
            later(() => finishRound(clean), 900);
            return;
          }
          render();
        } else {
          const key = e.currentTarget;
          round.mistakes += 1;
          round.streakMiss += 1;
          key.classList.add('shake');
          later(() => key.classList.remove('shake'), 350);
          prompt.textContent = 'Not that one. Think about what comes next.';
          prompt.className = 'prompt oops';
          if (round.streakMiss >= 2) {
            round.streakMiss = 0;
            round.peeking = true;
            const peek = el('div', { class: 'peek' }, chunks.map((c, i) =>
              el('span', { class: chunkClass(i), text: (i ? '‑' : '') + c })));
            line.after(peek);
            speakDigits(def.digits);
            later(() => { peek.remove(); round.peeking = false; }, 2600);
          }
        }
      },
    })
  ));

  app.append(prompt, line, keypad);
}

/* ---------- round end ---------- */

function finishRound(clean) {
  if(state.screen!=='play'||!state.round||state.round.completed)return;
  state.round.completed=true;
  const { profile, number, levels, levelIndex } = state;
  let progress = getProgress(profile.id, number.id);
  const level = levels[levelIndex];
  const now = Date.now();
  if (clean) {
    progress = completeLevel(progress, levels, levelIndex, now);
    setProgress(profile.id, number.id, progress);
  } else if (level.id === 'prove' && progress.mastered) {
    progress = recordReviewMiss(progress, now);
    setProgress(profile.id, number.id, progress);
  }
  cancelRound();
  state.result = { clean, level };
  state.screen = 'done';
  render();
}

function renderDone() {
  const { clean, level } = state.result;
  const progress = getProgress(state.profile.id, state.number.id);
  const now = Date.now();
  const mastered = clean && level.id === 'prove';
  const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
  const canContinue = !progress.mastered && isLevelAvailable(progress, state.levels, progress.unlocked, now);

  const actions = [];
  if (clean && canContinue) {
    actions.push(el('button', { class: 'bigbtn', text: 'Next challenge →', onclick: () => startRound(state.number) }));
  }
  if (!clean) {
    actions.push(el('button', { class: 'bigbtn', text: 'Try that again', onclick: () => startRound(state.number) }));
  }
  actions.push(el('button', { class: 'bigbtn quiet', text: 'Back to my numbers', onclick: () => navigate('home') }));

  const heading = mastered
    ? `You mastered ${state.number.label.toLowerCase()}!`
    : clean ? 'You did it!' : 'Great practice!';
  const note = mastered
    ? 'I’ll pop quiz you in a couple of days to keep it strong.'
    : clean
      ? (canContinue ? praise : (level.id === 'cold' ? 'Come back tomorrow to prove you still know it!' : praise))
      : 'One more try makes it stick. You’ve got this.';

  speak(heading);
  app.append(
    topbar('home'),
    el('div', { class: 'celebrate' }, [
      el('div', { class: 'stars', text: clean ? '⭐⭐⭐' : '⭐' }),
      el('h2', { text: heading }),
      el('p', { class: 'note', text: note }),
      el('div', { class: 'actions' }, actions),
    ])
  );
}

/* ---------- local setup and backups ---------- */
let settingsDraft=null;
let importGeneration=0;
const uniqueId=prefix=>prefix+crypto.getRandomValues(new Uint32Array(2)).join('_');
const blankNumber=()=>({id:uniqueId('n'),label:'',digits:'',chunksText:''});
const blankProfile=()=>({id:uniqueId('p'),name:'',emoji:'⭐',numbers:[blankNumber()]});
function draftFor(config){return config.profiles.map(p=>({...p,numbers:p.numbers.map(n=>({...n,chunksText:n.chunks.join(', ')}))}));}
function download(name,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const anchor=el('a',{href:url,download:name});document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function field(label,value,oninput,extra={}){
  return el('label',{class:'field'},[el('span',{text:label}),el('input',{value,...extra,oninput:event=>oninput(event.target.value)})]);
}
async function applyConfiguration(nextConfig,nextStore){
  writeGeneration++;cancelRound();config=nextConfig;store=nextStore;recoveryRaw=null;settingsDraft=null;state.profile=null;state.number=null;
  state.screen='saving';render();
  const saved=await saveStore();if(stale)return;state.screen='profiles';message=saved?'Your setup is saved in this browser. Export a backup whenever you make changes.':'You can use this setup now, but export a backup before closing.';render();
}
function renderSettings(){
  if(!settingsDraft)settingsDraft=draftFor(config);
  const epoch=roundEpoch;
  const error=el('p',{class:'form-error',role:'alert'});
  app.append(topbar('profiles'),el('h1',{text:'Setup and backups'}),
    el('p',{text:'Add a nickname and the numbers you want to learn. Everything stays in this browser; there is no account or cloud save. Use a private device. Anyone who uses this browser can open these numbers.'}),
    el('p',{text:'Sound starts off. When enabled, the game uses only voices your browser reports as local. Voice availability and handling depend on your browser and operating system.'}));
  const form=el('form',{class:'settings-form',onsubmit:event=>{
    event.preventDefault();
    try{
      const next=validateConfig({version:1,profiles:settingsDraft.map(p=>({...p,numbers:p.numbers.map(n=>({...n,digits:n.digits.replace(/[\s()-]/g,''),chunks:n.chunksText.trim().split(/[,\s]+/).map(Number)}))}))});
      if(recoveryRaw!==null&&!confirm('Replace the unreadable saved file? Save the original recovery file first if you want to keep it.'))return;
      applyConfiguration(next,normalizeStore(store,next));
    }catch(e){error.textContent=e.message;error.scrollIntoView({block:'nearest'});}
  }});
  settingsDraft.forEach((profile,pi)=>{
    const group=el('fieldset',{class:'learner-editor'},[el('legend',{text:`Learner ${pi+1}`}),
      field('Nickname',profile.name,v=>profile.name=v,{maxlength:40,required:true,autocomplete:'off'}),
      field('Symbol or emoji',profile.emoji,v=>profile.emoji=v,{maxlength:16,required:true,autocomplete:'off'})]);
    profile.numbers.forEach((number,ni)=>{
      group.append(el('fieldset',{class:'number-editor'},[el('legend',{text:`Number ${ni+1}`}),
        field('Label',number.label,v=>number.label=v,{maxlength:64,required:true,placeholder:'e.g. A phone number',autocomplete:'off'}),
        field('Digits (leading zeros are kept)',number.digits,v=>number.digits=v,{maxlength:48,required:true,inputmode:'numeric',autocomplete:'off'}),
        field('Chunk sizes',number.chunksText,v=>number.chunksText=v,{maxlength:32,required:true,placeholder:'e.g. 3, 3, 4',inputmode:'numeric',autocomplete:'off'}),
        el('button',{class:'smallbtn quiet',text:'Remove this number',onclick:()=>{profile.numbers.splice(ni,1);render();}}),
      ]));
    });
    group.append(el('button',{class:'smallbtn',text:'Add a number',disabled:profile.numbers.length>=12,onclick:()=>{profile.numbers.push(blankNumber());render();}}),
      el('button',{class:'smallbtn quiet',text:'Remove this learner',onclick:()=>{settingsDraft.splice(pi,1);render();}}));
    form.append(group);
  });
  form.append(el('p',{text:'Use 2 to 24 digits per number. Spaces, parentheses and hyphens are removed. Chunk sizes say how many digits go in each piece: a ten-digit number can use 3, 3, 4. Each chunk holds 1 to 8 digits.'}),
    el('button',{class:'smallbtn',text:'Add a learner',disabled:settingsDraft.length>=12,onclick:()=>{settingsDraft.push(blankProfile());render();}}),
    error,el('button',{class:'bigbtn',type:'submit',text:'Save setup'}),
    el('p',{class:'setup-note',text:'Changing a number or its chunk sizes starts its learning progress over. Renaming a learner or label keeps progress. Removed learners and numbers are deleted when you save.'}));
  app.append(form);
  const importInput=el('input',{type:'file',accept:'.json,application/json',onchange:async event=>{
    const file=event.target.files[0];if(!file)return;const generation=++importGeneration;
    try{
      if(file.size>1_000_000)throw new Error('That file is too large. Choose a backup smaller than 1 MB.');
      const raw=await file.text();if(state.screen!=='settings'||epoch!==roundEpoch||generation!==importGeneration)return;
      const imported=validateBackup(JSON.parse(raw));
      if(!confirm('Replace this browser’s learners and progress with the backup? Export your current backup first if you want to keep it.'))return;
      applyConfiguration(imported.config,imported.store);
    }catch(e){if(state.screen==='settings'&&epoch===roundEpoch){error.textContent='Import failed: '+e.message;error.scrollIntoView({block:'nearest'});}}
    finally{event.target.value='';}
  }});
  app.append(el('section',{class:'backup-panel','aria-labelledby':'backup-title'},[
    el('h2',{id:'backup-title',text:'Keep a backup'}),
    el('p',{text:'A backup contains all saved learners, their numbers and progress in readable text. Keep it private. Export uses the saved setup, not unsaved edits above. Import replaces the saved setup only after validation and your confirmation.'}),
    el('button',{class:'bigbtn quiet',text:'Export backup',onclick:()=>download('remember-your-numbers-backup.json',JSON.stringify({format:'remember-your-numbers',version:1,config,store},null,2))}),
    el('label',{class:'field'},[el('span',{text:'Import a backup'}),importInput]),
    el('button',{class:'smallbtn danger',text:'Erase this browser’s setup and progress',onclick:async()=>{
      if(!confirm('Erase all learners, numbers and progress saved by this app in this browser? Backups you downloaded are separate.'))return;
      writeGeneration++;cancelRound();state.screen='saving';render();
      if(!await writeSaved(null)){if(!stale){storageIssue='Your saved setup was not erased. This browser could not safely remove it; use your browser’s site-data settings if needed.';state.screen='settings';render();}return;}
      recoveryRaw=null;storageIssue='';config=validateConfig(DEMO_CONFIG);store=normalizeStore(null,config);settingsDraft=null;state.screen='profiles';state.profile=null;state.number=null;message='Saved setup erased. Only fictional demo data is shown now.';render();
    }}),
  ]));
}

window.addEventListener('keydown',event=>{
  if(state.screen!=='play'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||!/^\d$/.test(event.key)||event.target.closest?.('input,textarea,[contenteditable="true"]'))return;
  const key=[...app.querySelectorAll('.key')].find(button=>button.textContent===event.key);
  if(key){event.preventDefault();key.click();}
});

render();
