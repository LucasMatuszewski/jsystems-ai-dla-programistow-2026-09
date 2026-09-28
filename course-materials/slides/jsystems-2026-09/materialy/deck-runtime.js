/* Deck controls: works from file://. Set window.COURSE_SCHEDULE before this script for a live course. */
(() => {
  'use strict';
  const slides = [...document.querySelectorAll('#deck > .slide')];
  const bar = document.getElementById('bar');
  const num = document.getElementById('num');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const clock = document.getElementById('clock');
  const breakbar = document.getElementById('breakbar');
  const schedule = window.COURSE_SCHEDULE || {courseId:'developer-course', timeZone:'Europe/Warsaw', date:null, breaks:[]};
  const intro = slides[0]?.querySelector('.slide-body');
  if (intro && !intro.querySelector('.schedule-strip')) {
    const strip = document.createElement('div');
    strip.className = 'schedule-strip';
    strip.setAttribute('aria-label', 'Godziny szkolenia i przerwy');
    const timed = (schedule.breaks || []).filter(b => b.time).map(b => `${b.time} ${b.label} (${b.duration} min)`);
    strip.textContent = `${schedule.start || '09:00'}-${schedule.end || '17:00'} · ${timed.join(' · ')} · ${schedule.timeZone || 'Europe/Warsaw'}`;
    (intro.querySelector('.subtitle') || intro.firstElementChild)?.after(strip);
  }
  let current = 0;
  // Break de-duplication survives reload via sessionStorage; a blocked or
  // malformed store only loses persistence, never correctness (in-memory Set).
  const memFired = new Set();
  let store = null;
  try { const k='__deck_probe'; sessionStorage.setItem(k,'1'); sessionStorage.removeItem(k); store = sessionStorage; } catch (_) {}
  function alertKey(date,b){
    return [schedule.courseId||'course', schedule.day==null?'-':schedule.day, date, b.time].join(':');
  }
  function wasFired(key){
    if(memFired.has(key)) return true;
    if(store){ try { return store.getItem('bb:'+key)==='1'; } catch (_) {} }
    return false;
  }
  function markFired(key){
    memFired.add(key);
    if(store){ try { store.setItem('bb:'+key,'1'); } catch (_) {} }
  }
  function toMin(hm){ const [h,m]=hm.split(':').map(Number); return h*60+m; }
  const HAS_TIME = b => typeof b.time==='string' && /^\d{2}:\d{2}$/.test(b.time);
  function show(index, updateHash=true) {
    current = Math.max(0,Math.min(slides.length-1,index));
    slides.forEach((slide,i) => {
      slide.classList.toggle('on',i===current);
      slide.setAttribute('aria-hidden',i===current?'false':'true');
    });
    slides[current].scrollTop = 0;
    num.textContent = `${current+1}/${slides.length}`;
    bar.style.width = `${(current+1)/slides.length*100}%`;
    prev.disabled = current===0;
    next.disabled = current===slides.length-1;
    if(updateHash) try { history.replaceState(null,'',`#${current+1}`); } catch (_) {}
  }
  function fromHash() {
    const n=Number(location.hash.slice(1));
    return Number.isInteger(n)&&n>0?n-1:0;
  }
  prev.addEventListener('click',() => { show(current-1); prev.blur(); });
  next.addEventListener('click',() => { show(current+1); next.blur(); });
  window.addEventListener('hashchange',() => show(fromHash(),false));
  document.addEventListener('keydown',e => {
    if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('button,a,input,textarea,select,pre,[contenteditable]')) return;
    if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(current+1)}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(current-1)}
    else if(e.key==='Home'){e.preventDefault();show(0)}
    else if(e.key==='End'){e.preventDefault();show(slides.length-1)}
    else if(['ArrowDown','ArrowUp'].includes(e.key)){
      const delta=(e.key==='ArrowDown'?1:-1)*Math.round(slides[current].clientHeight*.5);
      slides[current].scrollBy({top:delta,behavior:'smooth'});e.preventDefault();
    }
    else if(e.key.toLowerCase()==='f'){
      if(document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.();
    }
    else if(e.key.toLowerCase()==='d') document.querySelector('[data-theme-toggle]')?.click();
  });
  document.getElementById('deck').addEventListener('click',e => {
    if(e.target.closest('a,button,pre,input,textarea,select,[contenteditable]')) return;
    if(String(window.getSelection?.()||'')) return;
    if(e.clientX<innerWidth/2) show(current-1); else show(current+1);
  });
  document.querySelectorAll('#deck a[href^="http"]').forEach(a => {a.target='_blank';a.rel='noopener'});
  let formatter, dateFormatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timeZone||'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    dateFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:schedule.timeZone||'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'});
  } catch (_) {
    clock.textContent='Sprawdź strefę';
    show(fromHash(),false);
    return;
  }
  function tick(){
    const now = new Date();
    const hm=formatter.format(now);
    const date=dateFormatter.format(now);
    clock.textContent=`${hm} · ${schedule.timeZone||'Europe/Warsaw'}`;
    if(!schedule.date||date!==schedule.date) return;
    const nowMin=toMin(hm);
    for(const b of (schedule.breaks||[])){
      if(!HAS_TIME(b)) continue;
      if(b.optional && !b.confirmed) continue;
      const diff=nowMin-toMin(b.time);
      if(diff<0||diff>10) continue; // exact minute, max 10 min sleep catch-up
      const key=alertKey(date,b);
      if(wasFired(key)) continue;
      markFired(key);
      document.getElementById('bb-t').textContent=b.label||'Przerwa';
      document.getElementById('bb-s').textContent=b.duration?`${b.duration} minut`:'';
      breakbar.classList.add('show');
      try{const audio=new AudioContext();const tone=audio.createOscillator();const gain=audio.createGain();tone.connect(gain);gain.connect(audio.destination);gain.gain.value=.08;tone.frequency.value=880;tone.start();tone.stop(audio.currentTime+.18)}catch(_){}
    }
  }
  document.getElementById('bb-x').addEventListener('click',()=>breakbar.classList.remove('show'));
  tick();setInterval(tick,15000);show(fromHash(),false);
})();
