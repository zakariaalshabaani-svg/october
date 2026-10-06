/* =====================================================================
   1. PERSONALIZATION  — edit only this block to customize everything
   ===================================================================== */
const CONFIG = {
  name: "[NAME]",            // replaces every [NAME] in the texts below
  typingSpeed: 42,           // ms per character while a letter is being written (lower = faster)
  musicFile: "",             // optional royalty-free track, e.g. "assets/music.mp3". Empty = built-in synth music

  // Volume levels, 0 to 1. Music values are the target level for each scene.
  volume: {
    intro: .12,              // music in the first dark seconds (almost silent)
    music: .45,              // music while envelopes fly
    calm: .14,               // after the owl leaves, when everything goes quiet
    envelope: .1,            // while the main envelope opens
    reading: .2,             // warm background while a letter is read
    sfx: .55,                // paper, seal, wing sounds
    wind: .05                // distant wind
  },

  // Timeline in ms from the start. (0-1.5s: dark night, then the first far envelope)
  t: {
    firstEnvelope: 1500,     // first far-away envelope appears
    owl: 7800,               // owl enters (during the end of the flood)
    calm: 12600,             // flying envelopes stop, scene goes quiet
    hero: 13600,             // the one remaining envelope appears
    psDelay: 1300,           // pause before the P.S. appears
    memoryGap: 1800,         // delay between each memory mote appearing
    memoriesTimeout: 30000,  // the ending starts by itself after this, even if memories are unopened
    endingHold: 7000         // how long the final sentence stays before the scene fades
  },

  // ---- Envelope escalation: slow mystery → more letters → sudden flood → owl takes over ----
  // Times are ms from the start. For an even faster flood: lower floodInterval and floodSpeed,
  // raise maxDesktop/maxMobile, and/or lengthen floodDuration.
  envelopes: {
    slowInterval: 1300,      // phase 1: gap between letters (a few mysterious ones)
    moreAt: 3600,            // phase 2 begins
    moreInterval: 600,       // phase 2: gap between letters
    floodAt: 5200,           // phase 3: the sudden flood begins
    floodDuration: 3000,     // how long the flood lasts
    floodInterval: 110,      // gap between letters during the flood (smaller = more letters)
    afterInterval: 900,      // gap after the flood while the owl crosses
    duration: [2200, 3600],  // normal flight time (ms) [min, max]
    floodSpeed: .6,          // flight-time multiplier during the flood (smaller = faster)
    maxDesktop: 34,          // max envelopes on screen at once (desktop)
    maxMobile: 16            // max envelopes on screen at once (phones)
  },
  letterDir: "rtl",          // text direction of the letters: "rtl" for Arabic, "ltr" for English
  letterLang: "ar",          // language tag of the letters (helps Arabic font/shaping)

  // ---- All texts. Use [NAME] anywhere. Empty string = blank line. ----
  letter1: [
    "نأسف، لم يتم قبولك في هوجورتس.",
    "ولكننا نتمنى لك كل التوفيق في حياتك."
  ],
  ps: "P.S. — This letter took a rather long time to arrive.\nBlame the distance.",
  nextButton: "Open the second letter →",
  letter2: [
    "يبدو أنه عيد ميلادك،",
    "فكل عام وأنتِ بخير."
  ],
  finalLine: "Until the next letter arrives...",

  // Hidden memories: each string becomes a tiny glowing mote after the second letter.
  // Leave empty to skip. Example: ["A memory from the first time we talked."]
  memories: []
};
// Short aliases used by the code below (no need to edit)
const LETTER_1 = CONFIG.letter1, POSTSCRIPT = CONFIG.ps, NEXT_BUTTON = CONFIG.nextButton,
      LETTER_2 = CONFIG.letter2, FINAL_LINE = CONFIG.finalLine, memories = CONFIG.memories;

/* =====================================================================
   2. HELPERS & DEVICE DETECTION
   ===================================================================== */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const fill = s => s.replaceAll("[NAME]", CONFIG.name);
// RESPONSIVE: detect phones and reduced-motion to simplify effects
const isMobile = matchMedia("(max-width:700px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const reduceMotion = matchMedia("(prefers-reduced-motion:reduce)").matches;
let W = innerWidth, H = innerHeight;

/* =====================================================================
   3. AUDIO — synthesized (original, no copyrighted music). All subtle.
   ===================================================================== */
const A = (() => {
  let ctx, master, music, sfx, noise, muted = false, file = null, chordTimer, chimeTimer, windG;
  const chords = [[146.8, 220, 293.7, 349.2], [116.5, 174.6, 233.1, 293.7], [98, 196, 233.1, 293.7], [110, 164.8, 220, 277.2]];
  const bells = [587.3, 698.5, 880, 1046.5, 1318.5];

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0; music.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = CONFIG.volume.sfx; sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const running = () => ctx && ctx.state === "running";
  function burst({ dur = .3, type = "bandpass", f = 2000, q = .8, gain = .2, delay = 0, attack = .02 }) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(), t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, rnd(0, 1)); s.stop(t + dur + .05);
  }
  function tone(f, { dur = 3, gain = .05, type = "sine", delay = 0, dest, attack = .01 }) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + .1);
  }
  function padChord() {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(music);
    chords[Math.floor(Date.now() / 8000) % chords.length].forEach(f => {
      tone(f, { dur: 9, gain: .05, type: "triangle", attack: 3, dest: lp });
      tone(f * 1.004, { dur: 9, gain: .035, type: "sine", attack: 3.5, dest: lp });
    });
  }
  function bell(f = bells[Math.floor(Math.random() * bells.length)], gain = .035) {
    if (!running()) return;
    tone(f, { dur: 3.2, gain, dest: music }); tone(f * 2.76, { dur: 1.4, gain: gain * .3, dest: music });
  }
  return {
    init, running,
    resume: () => ctx && ctx.resume(),
    start() {
      if (!ctx) return;
      if (CONFIG.musicFile) {
        file = new Audio(CONFIG.musicFile); file.loop = true;
        ctx.createMediaElementSource(file).connect(music); file.play().catch(() => {});
      } else {
        padChord(); chordTimer = setInterval(padChord, 8000);
        chimeTimer = setInterval(() => Math.random() < .5 && bell(), 3500);
      }
      // distant wind
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 380; bp.Q.value = .6;
      const g = ctx.createGain(); g.gain.value = 1;
      windG = ctx.createGain(); windG.gain.value = CONFIG.volume.wind * .35;   // starts almost silent
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .08; lg.gain.value = .3;
      lfo.connect(lg); lg.connect(g.gain); s.connect(bp); bp.connect(g); g.connect(windG); windG.connect(sfx); s.start(); lfo.start();
    },
    music(v, secs = 2) { if (!ctx) return; music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setValueAtTime(music.gain.value, ctx.currentTime); music.gain.linearRampToValueAtTime(v, ctx.currentTime + secs); },
    wind(v, secs = 3) { if (!windG) return; const t = ctx.currentTime; windG.gain.cancelScheduledValues(t); windG.gain.setValueAtTime(windG.gain.value, t); windG.gain.linearRampToValueAtTime(v, t + secs); },
    fadeAll(secs = 6) {   // ending: everything fades to silence
      if (!ctx) return; const t = ctx.currentTime;
      [music.gain, windG && windG.gain, sfx.gain].forEach(g => { if (!g) return; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + secs); });
      clearInterval(chimeTimer); setTimeout(() => clearInterval(chordTimer), secs * 1000);
    },
    toggle() { muted = !muted; if (ctx) master.gain.value = muted ? 0 : 1; return muted; },
    paper: () => burst({ dur: .35, f: 3200, q: .5, gain: .12 }),
    flutter: () => burst({ dur: .18, f: 1800, q: 1, gain: .04 }),
    wings() { for (let i = 0; i < 9; i++) burst({ dur: .22, type: "lowpass", f: 500, gain: .09 * (1 - i / 11), delay: i * .32, attack: .06 }); },
    seal() { burst({ dur: .08, f: 2500, gain: .3, attack: .003 }); if (ctx) tone(110, { dur: .25, gain: .12, attack: .005 }); },
    unfold() { burst({ dur: 1.2, f: 2400, q: .4, gain: .1, attack: .3 }); },
    chime() { bell(1046.5, .06); setTimeout(() => bell(1568, .04), 220); }
  };
})();

/* =====================================================================
   4. VISUAL EFFECTS — stars, dust & golden motes on one canvas
   ===================================================================== */
const cv = $("fx"), cx = cv.getContext("2d");
let stars = [], dust = [], motes = [];
function sizeCanvas() {
  W = innerWidth; H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
  cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars = Array.from({ length: isMobile ? 55 : 120 }, () => ({ x: rnd(0, W), y: rnd(0, H * .8), r: rnd(.3, 1.1), p: rnd(0, 6.3), s: rnd(.4, 1.2) }));
  dust = Array.from({ length: isMobile ? 22 : 55 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(.5, 1.6), vx: rnd(-.01, .02), vy: rnd(-.02, .005), a: rnd(.1, .4) }));
}
function addMote(x, y) { if (motes.length < (isMobile ? 40 : 90)) motes.push({ x, y, vx: rnd(-.02, .02), vy: rnd(-.03, .01), life: 0, max: rnd(900, 1800) }); }
function drawFx(t, dt) {
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = "#dfe8ff";
  for (const s of stars) { cx.globalAlpha = .25 + .45 * Math.abs(Math.sin(t / 1000 * s.s + s.p)); cx.fillRect(s.x, s.y, s.r, s.r); }
  cx.fillStyle = "#cfd8f0";
  for (const d of dust) {
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.x > W) d.x = 0; if (d.y < 0) d.y = H; if (d.x < 0) d.x = W;
    cx.globalAlpha = d.a; cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 6.3); cx.fill();
  }
  cx.fillStyle = "rgb(255,205,120)";
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i]; m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.life > m.max) { motes.splice(i, 1); continue; }
    const k = m.life / m.max; cx.globalAlpha = Math.sin(k * Math.PI) * .75;
    cx.beginPath(); cx.arc(m.x, m.y, 1.4, 0, 6.3); cx.fill();
  }
  cx.globalAlpha = 1;
}
// ambient golden motes, a few at a time
setInterval(() => { if (reduceMotion || (calm && Math.random() < .7)) return; addMote(rnd(0, W), rnd(H * .2, H)); }, isMobile ? 700 : 380);

/* =====================================================================
   5. ANIMATION ENGINE — flying envelopes + owl (depth via scale/blur)
   ===================================================================== */
const stage = $("stage"), owl = $("owl");
const stageF = Object.assign(document.createElement("div"), { id: "stageF" }); document.body.appendChild(stageF); // front layer: near envelopes pass in front of the owl
let envs = [], calm = false, owlStart = 0;
const MAX_ENVS = reduceMotion ? 6 : isMobile ? CONFIG.envelopes.maxMobile : CONFIG.envelopes.maxDesktop;

// ENVELOPES: far = small, blurred, dim; near = large, sharp, brighter
function spawnEnvelope(first = false, flood = false) {
  if (envs.length >= MAX_ENVS) return;
  const E = CONFIG.envelopes, el = document.createElement("div"); el.className = "env";
  const FS = flood ? E.floodSpeed : 1, mob = isMobile ? .8 : 1, r = Math.random();
  // flight types: far/near/close = coming out of the depth; side = crossing; vert = from above/below
  const kind = first ? "far" : !flood ? (r < .4 ? "far" : r < .8 ? "near" : r < .9 ? "side" : "close")
                                      : (r < .2 ? "far" : r < .45 ? "near" : r < .6 ? "close" : r < .85 ? "side" : "vert");
  let e;
  if (kind === "side" || kind === "vert") {
    const flip = Math.random() < .5, s0 = rnd(.5, 1.3) * mob;
    e = kind === "side"
      ? { sx: (flip ? -.15 : 1.15) * W, sy: rnd(.1, .9) * H, ex: (flip ? 1.15 : -.15) * W, ey: rnd(.1, .9) * H }
      : { sx: rnd(.1, .9) * W, sy: (flip ? -.15 : 1.15) * H, ex: rnd(.05, .95) * W, ey: (flip ? 1.15 : -.15) * H };
    Object.assign(e, { s0, s1: s0 * rnd(.8, 1.5), pw: 1, dur: rnd(1500, 2600) * FS, op: 1 });
  } else {
    const sx = rnd(.2, .8) * W, sy = rnd(.2, .6) * H, ang = Math.atan2(rnd(-.8, .8), (sx < W / 2 ? -1 : 1) * rnd(.4, 1.2));
    const reach = kind === "far" ? rnd(.4, .8) : rnd(.9, 1.4), [d0, d1] = E.duration;
    e = { sx, sy, ex: sx + Math.cos(ang) * W * reach, ey: sy + Math.sin(ang) * H * reach + rnd(-.1, .25) * H, s0: .08, pw: 1.6,
      s1: kind === "far" ? rnd(.25, .5) : kind === "near" ? rnd(.9, 1.9) * mob : rnd(2.6, 3.6) * mob,
      dur: (kind === "far" ? rnd(d0, d1) * 1.4 : kind === "close" ? rnd(d0, d1) * .6 : rnd(d0, d1)) * FS,
      op: kind === "far" ? rnd(.45, .65) : 1 };
  }
  if (first) e.dur = 5600;                     // the very first letter drifts in slowly
  Object.assign(e, { el, r0: rnd(-50, 50), spin: rnd(-90, 90) * (reduceMotion ? .3 : 1), wob: rnd(8, 26), ph: rnd(0, 6.3), t0: performance.now() });
  if (e.s1 < .55) el.classList.add("far");     // distant = blurred
  const near = e.s1 > 1.3; if (near) el.style.filter = "brightness(1.12)";
  (near ? stageF : stage).appendChild(el); envs.push(e);
  if (!flood || Math.random() < .25) A.flutter();
}
function updateEnvs(t) {
  for (let i = envs.length - 1; i >= 0; i--) {
    const e = envs[i]; let p = (t - e.t0) / e.dur;
    if (calm) p += .004 * 16 * 3;            // after the calm moment, drift away faster
    if (p >= 1) { e.el.remove(); envs.splice(i, 1); continue; }
    const q = Math.pow(p, e.pw), sc = e.s0 + (e.s1 - e.s0) * Math.pow(p, e.pw > 1 ? 1.25 : 1);
    const x = e.sx + (e.ex - e.sx) * q, y = e.sy + (e.ey - e.sy) * q + Math.sin(p * 5 + e.ph) * e.wob * p;
    e.el.style.opacity = e.op * Math.min(1, p * 5) * (p > .85 ? (1 - p) / .15 : 1);
    e.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${e.r0 + e.spin * p}deg) scale(${sc})`;
    if (Math.random() < .12) addMote(x, y);  // faint golden trail
  }
}
// OWL: original white messenger owl, kept modest in size
function updateOwl(t) {
  if (!owlStart) return;
  const p = (t - owlStart) / 4800;
  if (p >= 1) { owl.style.opacity = 0; owlStart = 0; return; }
  const base = isMobile ? 170 : 240, sc = 1 - .55 * p;
  const x = -base * 1.1 + (W + base * 1.3) * p, y = H * (isMobile ? .3 : .34) - H * .2 * p + Math.sin(p * 18) * 10;
  owl.style.opacity = Math.min(1, p * 6) * (p > .8 ? (1 - p) / .2 : 1);
  owl.style.transform = `translate3d(${x}px,${y}px,0) rotate(${-6 - 4 * Math.sin(p * 9)}deg) scale(${sc})`;
}
let last = performance.now();
(function frame(t) {
  const dt = Math.min(50, t - last); last = t;
  drawFx(t, dt); updateEnvs(t); updateOwl(t);
  requestAnimationFrame(frame);
})(last);

/* =====================================================================
   6. LETTER — writing animation & scenes
   ===================================================================== */
const hero = $("hero"), letter = $("letter"), paper = $("paper");
const textBox = $("text"), ps = $("ps"), nextBtn = $("next");
textBox.dir = CONFIG.letterDir; textBox.lang = CONFIG.letterLang;   // Arabic = right-to-left

async function write(lines) {
  textBox.innerHTML = "";
  for (const raw of lines) {
    const line = document.createElement("div"); textBox.appendChild(line);
    for (const ch of fill(raw)) { line.textContent += ch; await sleep(CONFIG.typingSpeed * rnd(.6, 1.5)); }
    line.textContent += "\u200b"; paper.scrollTop = paper.scrollHeight; await sleep(raw ? 260 : 120);
  }
}
// MAIN LETTER: the envelope opens, then the parchment is written
async function openEnvelope(fast = false) {
  hero.className = "hero"; void hero.offsetWidth;
  hero.classList.add("in"); A.paper(); A.music(CONFIG.volume.envelope, 3);
  await sleep(fast ? 2200 : 3300);          // glides toward the viewer
  await sleep(fast ? 400 : 1000);           // the important pause
  hero.classList.add("glow"); document.body.classList.add("focus"); await sleep(fast ? 400 : 1200);  // seal glows, focus shifts
  hero.classList.add("shake"); await sleep(520);
  hero.classList.add("broken"); A.seal(); await sleep(450);
  hero.classList.add("open"); A.paper(); await sleep(950);
  hero.classList.add("rise"); A.unfold(); A.music(CONFIG.volume.envelope, 2); await sleep(1250);
  hero.classList.add("gone"); document.body.classList.add("reading");
}
async function showLetter(lines, { withPS }) {
  ps.className = "ps"; ps.textContent = ""; nextBtn.className = "tab"; nextBtn.style.display = "none";
  letter.className = "letter" + (withPS ? "" : " warm"); paper.scrollTop = 0; textBox.innerHTML = "";
  void letter.offsetWidth; letter.classList.add("show"); A.chime(); A.music(CONFIG.volume.reading, 4);
  await sleep(1400); await write(lines);
  if (withPS) {
    await sleep(CONFIG.t.psDelay); ps.textContent = fill(POSTSCRIPT); ps.classList.add("on"); paper.scrollTop = paper.scrollHeight;
    await sleep(2200); nextBtn.textContent = NEXT_BUTTON; nextBtn.style.display = "block";
    void nextBtn.offsetWidth; nextBtn.classList.add("on"); paper.scrollTop = paper.scrollHeight;
  }
}
// MEMORIES: motes appear slowly; tap one to read it on a small parchment card
const card = document.createElement("div"); card.className = "memcard"; document.body.appendChild(card);
let openMote = null, pending = 0, ended = false;
function closeCard() {
  if (!card.classList.contains("on")) return;
  card.classList.remove("on"); A.paper();
  if (openMote) { const m = openMote; openMote = null; m.style.opacity = 0; setTimeout(() => m.remove(), 1200); }
  if (pending === 0) setTimeout(endScene, 2000);   // all memories read → ending
}
card.addEventListener("click", closeCard);
async function runMemories() {
  if (!memories.length) { await sleep(2500); return endScene(); }
  pending = memories.length;
  for (const m of memories) {
    await sleep(CONFIG.t.memoryGap);
    const b = document.createElement("button"); b.className = "mote"; b.setAttribute("aria-label", "A hidden memory");
    b.style.left = (Math.random() < .5 ? rnd(5, 18) : rnd(82, 94)) + "vw"; b.style.top = rnd(18, 72) + "vh";
    b.onclick = () => {
      if (card.classList.contains("on") || b.dataset.done) return;
      b.dataset.done = 1; b.classList.add("lit"); pending--; openMote = b; A.chime();
      card.textContent = fill(m); card.classList.add("on");
    };
    document.body.appendChild(b); void b.offsetWidth; b.classList.add("in");
  }
  setTimeout(endScene, CONFIG.t.memoriesTimeout);
}
// ENDING: darkness, one sentence, a tiny glowing envelope, then everything fades
async function endScene() {
  if (ended) return;
  if (card.classList.contains("on")) return setTimeout(endScene, 3000);
  ended = true;
  document.querySelectorAll(".mote").forEach(m => { m.style.opacity = 0; setTimeout(() => m.remove(), 1500); });
  letter.classList.add("fadeout"); document.body.classList.add("ending"); A.music(CONFIG.volume.reading * .5, 4);
  await sleep(3500);
  $("finalLine").textContent = fill(FINAL_LINE); $("finale").classList.add("on"); A.chime();
  await sleep(CONFIG.t.endingHold);
  $("finale").classList.remove("on"); document.body.classList.add("fadeall"); A.fadeAll(6);
}

/* =====================================================================
   7. MAIN TIMELINE  (dark night → envelopes → owl → calm → letters)
   ===================================================================== */
let started = false;
// OPENING: dark night, faint wind → one far envelope → more → owl → calm → main envelope
async function begin() {
  if (started) return; started = true;
  const T = CONFIG.t, V = CONFIG.volume, t0 = performance.now();
  $("mute").style.display = "block";
  A.start(); A.music(V.intro, 4);                 // almost silent at first, no envelopes yet
  // envelopes in phases: few (slow) → more → sudden flood → thinner while the owl crosses
  const E = CONFIG.envelopes;
  const loop = () => {
    if (calm) return;
    const el = performance.now() - t0, flood = el >= E.floodAt && el < E.floodAt + E.floodDuration;
    const gap = el < E.moreAt ? E.slowInterval : el < E.floodAt ? E.moreInterval : flood ? E.floodInterval : E.afterInterval;
    spawnEnvelope(false, flood);
    setTimeout(loop, gap * rnd(.7, 1.3) * (flood && isMobile ? 1.6 : 1));
  };
  setTimeout(() => { spawnEnvelope(true); A.wind(V.wind, 5); A.music(V.music, 8); setTimeout(loop, 1100); }, T.firstEnvelope);
  setTimeout(() => { A.music(Math.min(1, V.music * 1.35), 1.5); A.wind(V.wind * 1.8, 1.5); }, E.floodAt);                 // flood swells
  setTimeout(() => { A.music(V.music, 2.5); A.wind(V.wind, 2.5); }, E.floodAt + E.floodDuration);                        // and settles
  setTimeout(() => { owlStart = performance.now(); A.wings(); }, T.owl);
  await sleep(T.calm); calm = true;               // envelopes stop, particles/wind/music fall away
  cv.style.opacity = .3; A.music(V.calm, 5); A.wind(V.wind * .2, 5);
  await sleep(T.hero - T.calm);
  await openEnvelope();
  await showLetter(LETTER_1, { withPS: true });
}
// SECOND LETTER: first letter fades, second envelope opens
nextBtn.addEventListener("click", async () => {
  nextBtn.disabled = true; letter.classList.add("leaving"); A.paper();
  await sleep(1700); document.body.classList.remove("reading");
  await openEnvelope(true);
  await showLetter(LETTER_2, { withPS: false });
  await sleep(1800); runMemories();
});

/* =====================================================================
   8. START-UP & MUTE CONTROL
   ===================================================================== */
$("mute").addEventListener("click", e => { const m = A.toggle(); e.currentTarget.classList.toggle("off", m); e.currentTarget.setAttribute("aria-label", m ? "Unmute sound" : "Mute sound"); });
addEventListener("resize", sizeCanvas);
sizeCanvas();
(async function boot() {
  A.init();
  await sleep(150);
  if (A.running()) { begin(); return; }       // autoplay allowed → start by itself
  const gate = $("gate"); gate.classList.add("show");
  $("enter").addEventListener("click", async () => {
    A.init(); await A.resume(); gate.classList.add("hide");
    setTimeout(() => gate.remove(), 1700); begin();
  }, { once: true });
})();
