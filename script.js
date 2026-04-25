// ── MOBILE DETECTION & OPTIMIZATION ──────────────────────
const isMobileDevice = /iPhone|iPad|iPod|Android|Windows Phone|Mobile/.test(navigator.userAgent);
const isTablet = /iPad|Android(?!.*Mobile)/.test(navigator.userAgent);
const isTouchDevice = () => (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
const isSmallScreen = () => window.innerWidth < 768;
const isMobile = isMobileDevice || isTouchDevice() || isSmallScreen();
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedData = window.matchMedia('(prefers-reduced-data: reduce)');
let shouldReduceMotion = reducedMotionQuery.matches || isMobile;
let shouldReduceData = prefersReducedData.matches;

// Listen for preference changes
reducedMotionQuery.addEventListener('change', (e) => { shouldReduceMotion = e.matches || isMobile; });
prefersReducedData.addEventListener('change', (e) => { shouldReduceData = e.matches; });

// ── Setup ────────────────────────────────────────────────
const canvas = document.getElementById('treeCanvas');
const ctx = canvas.getContext('2d');
const birdCursorRoot = document.getElementById('birdCursorRoot');
const birdCursor = document.getElementById('birdCursor');
const birdGhost1 = document.querySelector('.bird-ghost--1');
const birdGhost2 = document.querySelector('.bird-ghost--2');
const birdSvg = birdCursor && birdCursor.querySelector('.bird-svg');

// ── Ambient audio: soft wind / forest (interaction-gated) ─
// Disabled on mobile to reduce battery drain
let ambientAudioCtx = null;
let ambientMaster = null;
let ambientStarted = false;
let chirpTimer = null;
const audioEnabled = !isMobileDevice; // Disable audio on mobile for battery optimization

function initAmbientAudio() {
    if (!audioEnabled || ambientAudioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ambientAudioCtx = new Ctx();

    ambientMaster = ambientAudioCtx.createGain();
    ambientMaster.gain.value = 0.0;
    ambientMaster.connect(ambientAudioCtx.destination);

    // Wind bed: filtered brown-ish noise at very low volume.
    const sampleRate = ambientAudioCtx.sampleRate;
    const noiseBuf = ambientAudioCtx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + (0.02 * white)) / 1.02;
        data[i] = last * 3.2;
    }
    const noise = ambientAudioCtx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const low = ambientAudioCtx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 650;
    low.Q.value = 0.25;

    const band = ambientAudioCtx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 260;
    band.Q.value = 0.65;

    const windGain = ambientAudioCtx.createGain();
    windGain.gain.value = 0.024;

    // Slow wind breathing.
    const windLfo = ambientAudioCtx.createOscillator();
    const windLfoGain = ambientAudioCtx.createGain();
    windLfo.frequency.value = 0.06;
    windLfoGain.gain.value = 110;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(low.frequency);

    const windAmpLfo = ambientAudioCtx.createOscillator();
    const windAmpLfoGain = ambientAudioCtx.createGain();
    windAmpLfo.frequency.value = 0.045;
    windAmpLfoGain.gain.value = 0.005;
    windAmpLfo.connect(windAmpLfoGain);
    windAmpLfoGain.connect(windGain.gain);

    noise.connect(low);
    low.connect(band);
    band.connect(windGain);
    windGain.connect(ambientMaster);

    noise.start();
    windLfo.start();
    windAmpLfo.start();
}

function playForestChirp() {
    if (!ambientAudioCtx || !ambientMaster || ambientAudioCtx.state !== "running") return;
    const now = ambientAudioCtx.currentTime;
    const o = ambientAudioCtx.createOscillator();
    const g = ambientAudioCtx.createGain();
    const f = ambientAudioCtx.createBiquadFilter();

    o.type = "sine";
    const base = 1200 + Math.random() * 900;
    o.frequency.setValueAtTime(base, now);
    o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.22), now + 0.07);
    o.frequency.exponentialRampToValueAtTime(base * (0.78 + Math.random() * 0.15), now + 0.18);

    f.type = "bandpass";
    f.frequency.value = 1800;
    f.Q.value = 1.1;

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.006 + Math.random() * 0.004, now + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    o.connect(f);
    f.connect(g);
    g.connect(ambientMaster);
    o.start(now);
    o.stop(now + 0.24);
}

function scheduleNextChirp() {
    if (!ambientStarted) return;
    const delay = 2800 + Math.random() * 5200;
    chirpTimer = window.setTimeout(() => {
        playForestChirp();
        scheduleNextChirp();
    }, delay);
}

function startAmbientAudio() {
    if (ambientStarted) return;
    initAmbientAudio();
    if (!ambientAudioCtx || !ambientMaster) return;
    ambientStarted = true;
    ambientAudioCtx.resume().then(() => {
        const now = ambientAudioCtx.currentTime;
        ambientMaster.gain.cancelScheduledValues(now);
        ambientMaster.gain.setValueAtTime(0.0001, now);
        ambientMaster.gain.exponentialRampToValueAtTime(0.045, now + 1.6);
        // Tiny startup chirp confirms audio unlocked.
        playForestChirp();
        scheduleNextChirp();
    }).catch(() => { });
}

function setupAmbientAudioGate() {
    const unlock = () => {
        startAmbientAudio();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("click", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });

    // If browser suspends context, resume on visibility/focus.
    const resumeIfNeeded = () => {
        if (ambientAudioCtx && ambientStarted && ambientAudioCtx.state !== "running") {
            ambientAudioCtx.resume().catch(() => { });
        }
    };
    document.addEventListener("visibilitychange", resumeIfNeeded);
    window.addEventListener("focus", resumeIfNeeded);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    buildGrain();
    layoutMindmap();
}
window.addEventListener('resize', resize);

// ── Mind map: floating link positions + SVG edges ─────────
function layoutMindmap() {
    const hub = document.getElementById('mindmapHub');
    const svg = document.getElementById('mindmapSvg');
    const edges = document.getElementById('mindmapEdges');
    const links = document.querySelectorAll('.link-item');
    if (!hub || !svg || !edges || !links.length) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const n = links.length;
    const isMobile = w < 768;

    if (isMobile) {
        hub.style.top = '22%';
        hub.style.left = '50%';
        
        const startY = h * 0.45;
        const totalHeight = h - startY - 40;
        const spacing = Math.min(80, totalHeight / n);

        links.forEach((a, i) => {
            const x = cx;
            const y = startY + i * spacing;
            a.style.left = `${x}px`;
            a.style.top = `${y}px`;
        });
    } else {
        hub.style.top = '50%';
        hub.style.left = '50%';
        const margin = Math.min(w, h) * 0.11;
        const rx = Math.max(120, (w - margin * 2) * 0.37);
        const ry = Math.max(100, (h - margin * 2) * 0.31);

        links.forEach((a, i) => {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(angle) * rx;
            const y = cy + Math.sin(angle) * ry;
            a.style.left = `${x}px`;
            a.style.top = `${y}px`;
        });
    }

    requestAnimationFrame(() => {
        const hubRect = hub.getBoundingClientRect();
        const hx = hubRect.left + hubRect.width * 0.5;
        const hy = hubRect.top + hubRect.height * 0.5;

        edges.replaceChildren();
        links.forEach((a, i) => {
            const r = a.getBoundingClientRect();
            const lx = r.left + r.width * 0.5;
            const ly = r.top + r.height * 0.5;
            
            let mx, my;
            if (isMobile) {
                const isLeft = (i % 2 === 0);
                mx = (hx + lx) * 0.5 + (isLeft ? -45 : 45);
                my = (hy + ly) * 0.5;
            } else {
                mx = (hx + lx) * 0.5 + (ly - hy) * 0.18;
                my = (hy + ly) * 0.5 - (lx - hx) * 0.18;
            }
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${hx} ${hy} Q ${mx} ${my} ${lx} ${ly}`);
            path.setAttribute('opacity', '0.82');
            edges.appendChild(path);
        });
    });
}
window.addEventListener('load', () => {
    layoutMindmap();
});

// ── Bird cursor: inertia, bob, rotation, trail ───────────
const birdPointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, active: false };
const rawPointer = { x: birdPointer.x, y: birdPointer.y };
const bird = {
    x: birdPointer.x,
    y: birdPointer.y,
    vx: 0,
    vy: 0,
};
const birdVelSmooth = { x: 0, y: 0 };
const birdEcho1 = { x: bird.x, y: bird.y };
const birdEcho2 = { x: bird.x, y: bird.y };
const birdWind = { x: 0, y: 0 };
let birdDisplayAngle = 0;
let birdLastT = performance.now();

function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

function tfBird(x, y, rad, scale) {
    return `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%) rotate(${rad.toFixed(4)}rad) scale(${scale.toFixed(3)})`;
}

function getMagneticPointer() {
    let mx = rawPointer.x;
    let my = rawPointer.y;
    let totalW = 0;

    for (const el of document.querySelectorAll('.link-item')) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        const dx = cx - rawPointer.x;
        const dy = cy - rawPointer.y;
        const d = Math.hypot(dx, dy) || 1;
        const radius = Math.max(110, Math.min(220, Math.max(r.width, r.height) * 1.2));
        if (d >= radius) continue;

        // Stronger pull close to center, smooth falloff to edge.
        const pull = 1 - d / radius;
        const w = pull * pull;
        const strength = Math.min(26, radius * 0.16);
        mx += (dx / d) * strength * w;
        my += (dy / d) * strength * w;
        totalW += w;
    }

    // Clamp magnetic offset so cursor never snaps too hard.
    const offX = mx - rawPointer.x;
    const offY = my - rawPointer.y;
    const offMag = Math.hypot(offX, offY);
    const maxOffset = 34;
    if (offMag > maxOffset) {
        const k = maxOffset / offMag;
        mx = rawPointer.x + offX * k;
        my = rawPointer.y + offY * k;
    }

    return { x: mx, y: my, engaged: totalW > 0 };
}

let birdIdleTimer = null;
let isBirdSitting = false;

function startIdleTimer() {
    clearTimeout(birdIdleTimer);
    birdIdleTimer = setTimeout(() => {
        isBirdSitting = true;
    }, 5000);
}

function resetIdleTimer() {
    if (isBirdSitting) {
        isBirdSitting = false;
    }
    startIdleTimer();
}

window.addEventListener('mousemove', resetIdleTimer);
window.addEventListener('mousedown', resetIdleTimer);
window.addEventListener('touchstart', resetIdleTimer, { passive: true });
startIdleTimer();

function updateBirdCursor(now) {
    if (!birdCursor || !birdGhost1 || !birdGhost2) return;

    const dt = Math.min(0.05, (now - birdLastT) / 1000) || 0.016;
    birdLastT = now;

    const magnetic = getMagneticPointer();
    let targetX = magnetic.x;
    let targetY = magnetic.y;

    if (isBirdSitting) {
        const usernameEl = document.getElementById('username');
        if (usernameEl) {
            const rect = usernameEl.getBoundingClientRect();
            // Sit on top of the text
            targetX = rect.left + rect.width / 2;
            targetY = rect.top - 10;
        }
    }

    birdPointer.x += (targetX - birdPointer.x) * 0.22;
    birdPointer.y += (targetY - birdPointer.y) * 0.22;

    const ptr = birdPointer;
    const dx = ptr.x - bird.x;
    const dy = ptr.y - bird.y;
    const spring = 4.35;
    const damp = 11.5;
    const maxAcc = 3400;

    let ax = dx * spring - bird.vx * damp;
    let ay = dy * spring - bird.vy * damp;
    const am = Math.hypot(ax, ay) || 1;
    if (am > maxAcc) {
        ax *= maxAcc / am;
        ay *= maxAcc / am;
    }

    birdWind.x += (Math.random() - 0.5) * 34 * dt;
    birdWind.y += (Math.random() - 0.5) * 26 * dt;
    birdWind.x *= Math.pow(0.965, dt * 60);
    birdWind.y *= Math.pow(0.965, dt * 60);
    ax += birdWind.x;
    ay += birdWind.y;

    bird.vx += ax * dt;
    bird.vy += ay * dt;
    const drag = Math.pow(0.885, dt * 60);
    bird.vx *= drag;
    bird.vy *= drag;

    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;

    const bob = Math.sin(now * 0.0046) * 4.2 + Math.sin(now * 0.0021 + 1.1) * 1.8;
    const renderX = bird.x;
    const renderY = bird.y + bob;

    birdVelSmooth.x += (bird.vx - birdVelSmooth.x) * 0.12;
    birdVelSmooth.y += (bird.vy - birdVelSmooth.y) * 0.12;

    const speed = Math.hypot(bird.vx, bird.vy);
    const vm = Math.hypot(birdVelSmooth.x, birdVelSmooth.y);
    const towardPtr = Math.atan2(ptr.y - bird.y, ptr.x - bird.x);
    let angleTarget = vm > 2 ? Math.atan2(birdVelSmooth.y, birdVelSmooth.x) : towardPtr;
    if (vm < 55) {
        const blend = 1 - vm / 55;
        angleTarget = lerpAngle(angleTarget, towardPtr, blend * 0.42);
    }
    birdDisplayAngle = lerpAngle(birdDisplayAngle, angleTarget, 0.16);

    birdEcho1.x += (bird.x - birdEcho1.x) * 0.16;
    birdEcho1.y += (bird.y - birdEcho1.y) * 0.16;
    birdEcho2.x += (birdEcho1.x - birdEcho2.x) * 0.14;
    birdEcho2.y += (birdEcho1.y - birdEcho2.y) * 0.14;

    const flap = isBirdSitting ? 0.8 : Math.max(0.09, Math.min(0.52, 0.52 - speed * 0.00135));
    if (birdSvg) birdSvg.style.setProperty('--flap-dur', `${flap}s`);

    const gBob1 = Math.sin((now - 40) * 0.0046) * 3.2;
    const gBob2 = Math.sin((now - 90) * 0.0046) * 2.4;

    birdGhost1.style.transform = tfBird(birdEcho1.x, birdEcho1.y + gBob1, birdDisplayAngle, 0.92);
    birdGhost2.style.transform = tfBird(birdEcho2.x, birdEcho2.y + gBob2, birdDisplayAngle, 0.84);

    birdCursor.style.transform = tfBird(renderX, renderY, birdDisplayAngle, 1);
}

// ── Mouse / pointer (canvas wind uses same target) ───────
const mouse = { x: 0, y: 0 };
const target = { x: birdPointer.x, y: birdPointer.y };

function setPointer(clientX, clientY) {
    target.x = clientX;
    target.y = clientY;
    rawPointer.x = clientX;
    rawPointer.y = clientY;
    birdPointer.x += (clientX - birdPointer.x) * 0.35;
    birdPointer.y += (clientY - birdPointer.y) * 0.35;
    birdPointer.active = true;
    if (birdCursorRoot) birdCursorRoot.classList.add('is-active');
}

window.addEventListener('mousemove', e => {
    setPointer(e.clientX, e.clientY);
});
window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    setPointer(t.clientX, t.clientY);
}, { passive: true });
window.addEventListener('touchstart', e => {
    const t = e.touches[0];
    setPointer(t.clientX, t.clientY);
}, { passive: true });

// ── Pre-generate grain texture ───────────────────────────
let grainCanvas, grainCtx;
function buildGrain() {
    const W = 512, H = 512;
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = W; grainCanvas.height = H;
    grainCtx = grainCanvas.getContext('2d');
    const id = grainCtx.createImageData(W, H);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        // Warm-tinted noise (slightly warm bias for oil painting feel)
        const v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v * 0.95;
        d[i + 2] = v * 0.85;
        d[i + 3] = 255;
    }
    grainCtx.putImageData(id, 0, 0);
}

// ── Pre-generate brush stroke texture ───────────────────
let brushCanvas, brushCtx;
function buildBrush() {
    const W = 800, H = 600;
    brushCanvas = document.createElement('canvas');
    brushCanvas.width = W; brushCanvas.height = H;
    brushCtx = brushCanvas.getContext('2d');

    // Random horizontal brush strokes
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const len = 30 + Math.random() * 120;
        const thick = 0.5 + Math.random() * 2.5;
        const alpha = 0.01 + Math.random() * 0.04;
        const warm = Math.random() > 0.5;

        brushCtx.strokeStyle = warm
            ? `rgba(200,170,120,${alpha})`
            : `rgba(160,185,160,${alpha})`;
        brushCtx.lineWidth = thick;
        brushCtx.lineCap = 'round';
        brushCtx.beginPath();
        brushCtx.moveTo(x, y);
        // Slight curve
        const cpx = x + len / 2 + (Math.random() - 0.5) * 20;
        const cpy = y + (Math.random() - 0.5) * 10;
        brushCtx.quadraticCurveTo(cpx, cpy, x + len, y + (Math.random() - 0.5) * 4);
        brushCtx.stroke();
    }
}

// ── Film dust particles ───────────────────────────────────
class Dust {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.r = Math.random() < 0.6 ? 0.5 : 1;
        this.alpha = 0;
        this.maxA = 0.08 + Math.random() * 0.18;
        this.life = 0;
        this.maxL = 20 + Math.random() * 50;
        this.white = Math.random() > 0.4;
    }
    update() {
        this.life++;
        const t = this.life / this.maxL;
        this.alpha = t < 0.3
            ? (t / 0.3) * this.maxA
            : t > 0.7
                ? ((1 - t) / 0.3) * this.maxA
                : this.maxA;
        if (this.life >= this.maxL) this.reset();
    }
    draw() {
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.white ? '#fff8e8' : '#2a1800';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
    }
}
const dustParticles = Array.from({ length: 40 }, () => new Dust());
let treeGroundY = null;

// ── Squirrels running in background ───────────────────────
class Squirrel {
    constructor(seed = Math.random()) {
        this.seed = seed;
        this.turnCooldown = 0;
        this.reset(Math.random() > 0.5);
    }
    reset(fromLeft = true) {
        this.dir = fromLeft ? 1 : -1;
        this.scale = 0.72 + Math.random() * 0.44;
        this.baseSpeed = 0.42 + Math.random() * 0.62;
        this.speedMult = 1.0;
        this.speed = this.baseSpeed * this.dir * this.speedMult;
        const ground = treeGroundY ?? (canvas.height - 6);
        this.baseY = ground - (10 + Math.random() * 18);
        this.minY = ground - 28;
        this.maxY = ground - 4;
        this.x = fromLeft ? -80 - Math.random() * 220 : canvas.width + 80 + Math.random() * 220;
        this.phase = Math.random() * Math.PI * 2;
        this.hue = 24 + Math.random() * 10;
        this.alpha = 0;
    }
    update(t, isNight) {
        if (isNight) {
            this.alpha *= 0.92;
            return;
        }
        this.alpha = Math.min(1.0, this.alpha + 0.05);

        if (this.turnCooldown > 0) this.turnCooldown--;

        const cursorNearX = Math.abs(mouse.x - this.x) < 120;
        const cursorNearY = Math.abs(mouse.y - this.y) < 52;
        if (cursorNearX && cursorNearY && this.turnCooldown === 0) {
            const fleeRight = this.x < mouse.x ? -1 : 1;
            this.dir = fleeRight;
            this.speedMult = Math.min(6, this.speedMult + 0.5); // Increase speed on each touch
            this.speed = (this.baseSpeed + Math.random() * 0.2) * this.dir * this.speedMult;
            this.turnCooldown = 26;
        }

        this.x += this.speed;
        this.phase += 0.17 + Math.abs(this.speed) * 0.12;
        const ground = treeGroundY ?? (canvas.height - 6);
        this.minY = ground - 28;
        this.maxY = ground - 4;
        this.y = this.baseY + Math.sin(t * 0.014 + this.phase) * 1.4;
        this.y = Math.min(this.maxY, Math.max(this.minY, this.y));

        if (this.dir > 0 && this.x > canvas.width + 120) this.reset(false);
        if (this.dir < 0 && this.x < -120) this.reset(true);
    }
    draw(t) {
        if (this.alpha <= 0.01) return;
        const bob = Math.sin(t * 0.026 + this.phase) * 1.3;
        const legSwing = Math.sin(t * 0.045 + this.phase) * 4.4;
        const tailSway = Math.sin(t * 0.025 + this.phase) * 0.3;

        ctx.save();
        ctx.translate(this.x, this.y + bob);
        ctx.scale(this.dir * this.scale, this.scale);
        ctx.globalAlpha = this.alpha;

        ctx.fillStyle = `hsla(${this.hue}, 50%, 24%, 1)`;
        ctx.beginPath();
        ctx.ellipse(-20, -18, 14, 20, -0.7 + tailSway, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${this.hue}, 48%, 20%, 1)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 8, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(13, -5, 6.8, 5.2, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${this.hue}, 46%, 18%, 1)`;
        ctx.beginPath();
        ctx.moveTo(13, -11);
        ctx.lineTo(16, -18);
        ctx.lineTo(18, -10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(8, 6, 4, 0.95)";
        ctx.beginPath();
        ctx.arc(15.2, -5.5, 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `hsla(${this.hue}, 42%, 18%, 0.98)`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, 5);
        ctx.lineTo(-8 + legSwing * 0.35, 11);
        ctx.moveTo(4, 5);
        ctx.lineTo(9 - legSwing * 0.35, 11);
        ctx.stroke();

        ctx.restore();
    }
}
const squirrels = Array.from({ length: 6 }, (_, i) => new Squirrel(i / 6));

// ── Owls flying in dark mode ──────────────────────────────
class FlyingOwl {
    constructor() {
        this.reset();
    }
    reset() {
        this.dir = Math.random() > 0.5 ? 1 : -1;
        this.scale = 0.4 + Math.random() * 0.3;
        this.baseScale = this.scale;
        this.speedX = (1.5 + Math.random() * 2) * this.dir;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.x = this.dir > 0 ? -100 - Math.random() * 500 : canvas.width + 100 + Math.random() * 500;
        this.y = Math.random() * (canvas.height * 0.6);
        this.phase = Math.random() * Math.PI * 2;
        this.flapSpeed = 0.08 + Math.random() * 0.04;
        this.alpha = 0;
        this.active = false;
        this.turnCooldown = 0;
        this.pokeCount = 0;
        this.isAttacking = false;
        this.attackProgress = 0;
        this.attackCooldown = 0;
    }
    update(t, isNight) {
        if (!isNight) {
            this.active = false;
            this.alpha *= 0.9;
            if (this.alpha < 0.01) this.reset();
            return;
        }

        this.active = true;
        this.alpha = Math.min(0.8, this.alpha + 0.02);

        if (this.turnCooldown > 0) this.turnCooldown--;
        if (this.attackCooldown > 0) this.attackCooldown--;

        const cursorNearX = Math.abs(mouse.x - this.x) < 150;
        const cursorNearY = Math.abs(mouse.y - this.y) < 100;

        if (this.isAttacking) {
            this.attackProgress += 0.03;
            // Scale up much larger
            const peakScale = 12;
            this.scale = this.baseScale + Math.sin(this.attackProgress * Math.PI) * peakScale;

            if (this.attackProgress < 0.5) {
                // Moving towards screen
                this.x += (mouse.x - this.x) * 0.12;
                this.y += (mouse.y - this.y) * 0.12;
            } else if (this.attackProgress < 1) {
                // Moving away
                this.speedX = (6 + Math.random() * 4) * (this.x < canvas.width / 2 ? -1 : 1);
                this.x += this.speedX;
            } else {
                // Reset after attack
                this.isAttacking = false;
                this.attackProgress = 0;
                this.pokeCount = 0;
                this.attackCooldown = 180;
                this.scale = this.baseScale;
            }
        } else if (cursorNearX && cursorNearY && this.turnCooldown === 0 && this.attackCooldown === 0) {
            this.pokeCount++;
            if (this.pokeCount >= 3) {
                this.isAttacking = true;
                this.attackProgress = 0;
            } else {
                this.dir = this.x < mouse.x ? -1 : 1;
                this.speedX = (1.5 + Math.random() * 2) * this.dir;
                this.turnCooldown = 50;
            }
        }

        if (!this.isAttacking) {
            this.x += this.speedX;
            this.y += this.speedY + Math.sin(t * 0.02 + this.phase) * 0.5;
        }

        this.phase += this.isAttacking ? this.flapSpeed * 2.5 : this.flapSpeed;

        if (this.dir > 0 && this.x > canvas.width + 1000) this.reset();
        if (this.dir < 0 && this.x < -1000) this.reset();
    }
    draw() {
        if (this.alpha <= 0) return;

        const flap = Math.sin(this.phase) * (this.isAttacking ? 30 : 15);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.dir * this.scale, this.scale);
        ctx.globalAlpha = this.alpha;

        // Shadow/Glow during attack
        if (this.isAttacking) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = 'rgba(245, 158, 11, 0.6)'; // Warm Amber glow
        }

        // --- Owl Body & Wings (Deep Indigo & Midnight Blue) ---

        // Wings (with Silver-Blue shimmer)
        const wingGrad = ctx.createLinearGradient(-30, 0, 30, 0);
        wingGrad.addColorStop(0, '#0F172A'); // Midnight Blue
        wingGrad.addColorStop(0.5, '#1A2238'); // Deep Indigo
        wingGrad.addColorStop(1, '#0F172A');

        ctx.fillStyle = wingGrad;
        ctx.beginPath();
        // Left wing
        ctx.ellipse(-15, flap, 22, 10, -0.2, 0, Math.PI * 2);
        // Right wing
        ctx.ellipse(15, flap, 22, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Wing Highlights (Silver-Blue shimmer)
        ctx.strokeStyle = 'rgba(125, 143, 169, 0.4)'; // Silver-Blue
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(-15, flap, 18, 6, -0.2, 0, Math.PI);
        ctx.ellipse(15, flap, 18, 6, 0.2, 0, Math.PI);
        ctx.stroke();

        // Body (Deep Indigo)
        ctx.fillStyle = '#1A2238';
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Face & Eyes (Warm Amber & Pale Moonlight) ---

        // Eye Sockets (Pale Moonlight)
        ctx.fillStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.arc(-6, -6, this.isAttacking ? 6 : 5, 0, Math.PI * 2);
        ctx.arc(6, -6, this.isAttacking ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (Warm Amber)
        ctx.fillStyle = this.isAttacking ? '#ff3300' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(-6, -6, this.isAttacking ? 2 : 2.5, 0, Math.PI * 2);
        ctx.arc(6, -6, this.isAttacking ? 2 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Fierce Eyebrows during attack
        if (this.isAttacking) {
            ctx.strokeStyle = '#121212'; // Charcoal
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-10, -12);
            ctx.lineTo(-2, -7);
            ctx.moveTo(10, -12);
            ctx.lineTo(2, -7);
            ctx.stroke();
        }

        // Beak (Warm Amber)
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, 6);
        ctx.lineTo(4, 6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}
const flyingOwls = Array.from({ length: 4 }, () => new FlyingOwl());

// ── Leaf particles ────────────────────────────────────────
const LEAF_COL = [
    'rgba(110,140,85,',
    'rgba(150,175,110,',
    'rgba(90,120,70,',
    'rgba(170,190,130,',
    'rgba(190,175,105,',
];
class Leaf {
    constructor() { this.init(true); }
    init(scatter = false) {
        this.x = Math.random() * canvas.width;
        this.y = scatter ? Math.random() * canvas.height : -20;
        this.sz = 2.5 + Math.random() * 4.5;
        this.vx = (Math.random() - 0.5) * 0.7;
        this.vy = 0.35 + Math.random() * 0.75;
        this.rot = Math.random() * Math.PI * 2;
        this.vrot = (Math.random() - 0.5) * 0.035;
        this.a = 0.45 + Math.random() * 0.5;
        this.col = LEAF_COL[Math.floor(Math.random() * LEAF_COL.length)];
        this.wob = Math.random() * Math.PI * 2;
        this.ws = 0.018 + Math.random() * 0.018;
        this.kx = 0;
        this.ky = 0;
    }
    update(wx) {
        this.wob += this.ws;

        // Cursor interaction field: leaves near cursor sway/push away.
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const influenceR = 145;
        if (d2 < influenceR * influenceR) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / influenceR) * 0.72;
            this.kx += (dx / d) * f + ((mouse.x - target.x) * -0.003);
            this.ky += (dy / d) * f + ((mouse.y - target.y) * -0.0015);
        }

        this.kx *= 0.91;
        this.ky *= 0.91;

        this.x += this.vx + Math.sin(this.wob) * 0.5 + wx * 0.14 + this.kx;
        this.y += this.vy + this.ky * 0.5;
        this.rot += this.vrot;
        if (this.y > canvas.height + 20) this.init();
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.globalAlpha = this.a;
        ctx.fillStyle = this.col + '0.9)';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.sz, this.sz * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this.col + '0.35)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(-this.sz, 0); ctx.lineTo(this.sz, 0);
        ctx.stroke();
        ctx.restore();
    }
}
const leaves = Array.from({ length: 55 }, () => new Leaf());

// ── Offscreen for displacement ────────────────────────────
let off, offCtx;
function ensureOff() {
    if (!off || off.width !== canvas.width || off.height !== canvas.height) {
        off = document.createElement('canvas');
        off.width = canvas.width; off.height = canvas.height;
        offCtx = off.getContext('2d');
    }
}

// ── Draw tree with wind + cursor ─────────────────────────
const imgDay = new Image();
imgDay.src = 'tree.png';
const imgNight = new Image();
imgNight.src = 'night_tree.png';

function drawTree(t) {
    ensureOff();
    const isNight = document.body.classList.contains('night-mode');
    const img = (isNight && imgNight.complete && imgNight.naturalWidth > 0) ? imgNight : imgDay;
    if (!img.complete || img.naturalWidth === 0) return;
    const sc = Math.max(canvas.width / img.width, canvas.height / img.height);
    const sw = img.width * sc, sh = img.height * sc;
    const ox = (canvas.width - sw) / 2, oy = (canvas.height - sh) / 2;
    treeGroundY = Math.max(4, Math.min(canvas.height - 4, oy + sh));

    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.drawImage(img, ox, oy, sw, sh);

    // Smooth mouse
    mouse.x += (target.x - mouse.x) * 0.055;
    mouse.y += (target.y - mouse.y) * 0.055;

    const STRIP = 3;
    for (let y = 0; y < canvas.height; y += STRIP) {
        // Wind: stronger at top of canopy
        const norm = 1 - Math.min(1, Math.max(0, (y - canvas.height * 0.05) / (canvas.height * 0.9)));
        const amp = 16 * norm * norm;
        const wind = Math.sin(y * 0.011 + t * 0.0017) * amp
            + Math.sin(y * 0.024 + t * 0.0029) * amp * 0.38;

        // Cursor push
        const dy = y - mouse.y;
        const push = Math.exp(-dy * dy / 16000) * ((mouse.x - canvas.width / 2) / (canvas.width / 2)) * -28;

        ctx.drawImage(
            off,
            0, y, canvas.width, STRIP,
            wind + push, y, canvas.width, STRIP
        );
    }
}

// ── Grain pass ───────────────────────────────────────────
let grainOff = 0;
function drawGrain() {
    if (!grainCanvas) return;
    grainOff = (grainOff + 1) % 60;
    const ox = (Math.random() * 40) | 0;
    const oy = (Math.random() * 40) | 0;
    ctx.save();
    ctx.globalAlpha = 0.038;
    ctx.globalCompositeOperation = 'overlay';
    // Tile grain across canvas
    for (let x = -ox; x < canvas.width; x += grainCanvas.width) {
        for (let y = -oy; y < canvas.height; y += grainCanvas.height) {
            ctx.drawImage(grainCanvas, x, y);
        }
    }
    ctx.restore();
}

// ── Brush stroke pass ────────────────────────────────────
function drawBrush() {
    if (!brushCanvas) return;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.globalCompositeOperation = 'overlay';
    const sc = Math.max(canvas.width / brushCanvas.width, canvas.height / brushCanvas.height);
    ctx.drawImage(brushCanvas, 0, 0, brushCanvas.width * sc, brushCanvas.height * sc);
    ctx.restore();
}

// ── Warm vignette ────────────────────────────────────────
function drawVignette() {
    const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.85
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,5,2,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Cursor light halo ────────────────────────────────────
function drawCursorHalo() {
    const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 100);
    g.addColorStop(0, 'rgba(230,190,120,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Atmosphere ───────────────────────────────────────────
function drawAtmos(t) {
    const pulse = 0.03 + Math.sin(t * 0.0008) * 0.015;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.45);
    g.addColorStop(0, `rgba(210,225,235,${pulse})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Main loop ────────────────────────────────────────────
let t = 0;
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isNight = document.body.classList.contains('night-mode');
    const currentImg = (isNight && imgNight.complete && imgNight.naturalWidth > 0) ? imgNight : imgDay;

    if (currentImg.complete && currentImg.naturalWidth > 0) {
        drawTree(t);
    } else {
        // Fallback warm gradient
        const fb = ctx.createLinearGradient(0, 0, 0, canvas.height);
        fb.addColorStop(0, '#b8c8d0'); fb.addColorStop(1, '#d4c090');
        ctx.fillStyle = fb;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Skip decorative effects on mobile for performance
    if (!isMobile || t % 4 === 0) {
        drawBrush();
        if (!shouldReduceData) drawGrain();
    }
    
    drawAtmos(t);
    drawVignette();

    // Squirrels (only in light mode, skip on mobile to save battery)
    if (!isMobile) {
        ctx.globalCompositeOperation = 'source-over';
        for (const s of squirrels) { s.update(t, isNight); s.draw(t); }
    }

    // Owls (only in dark mode, reduce on mobile)
    ctx.globalCompositeOperation = 'source-over';
    const owlSkip = isMobile ? 3 : 0;
    for (let i = 0; i < flyingOwls.length; i++) {
        if (t % (owlSkip + 1) !== 0) continue;
        flyingOwls[i].update(t, isNight);
        flyingOwls[i].draw();
    }

    // Leaves (reduce update frequency on mobile)
    const wx = Math.sin(t * (isMobile ? 0.0011 : 0.0017)) * 0.55;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const leafSkip = isMobile ? 2 : 0;
    for (let i = 0; i < leaves.length; i++) {
        if (isMobile && t % (leafSkip + 1) !== 0) continue;
        leaves[i].update(wx);
        leaves[i].draw();
    }

    // Film dust (skip on mobile)
    if (!isMobile) {
        ctx.globalCompositeOperation = 'source-over';
        for (const d of dustParticles) { d.update(); d.draw(); }
    }
    ctx.globalAlpha = 1;

    drawCursorHalo();

    if (!isMobile) updateBirdCursor(performance.now());

    t++;
    requestAnimationFrame(animate);
}

// ── Init ─────────────────────────────────────────────────
resize();
buildBrush();
layoutMindmap();
setupAmbientAudioGate();
imgDay.onload = () => { if (t === 0) animate(); };
imgDay.onerror = () => { if (t === 0) animate(); };
imgNight.onload = () => { if (t === 0) animate(); };
imgNight.onerror = () => { if (t === 0) animate(); };

// ═══════════════════════════════════════════════════════════════════════════
// NIGHT MODE FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

// Night mode state
let isNightMode = localStorage.getItem('nightMode') === 'true';
const nightSky = document.getElementById('nightSky');

// Create night sky elements
function createNightSkyElements() {
    if (!nightSky) return;

    // Create night background
    const nightBg = document.createElement('div');
    nightBg.className = 'night-bg';
    document.body.insertBefore(nightBg, document.getElementById('treeCanvas'));

    // Create moon container
    const moonContainer = document.createElement('div');
    moonContainer.className = 'night-moon-container';
    moonContainer.innerHTML = `
        <div class="moon-halo"></div>
        <div class="moon-crescent"></div>
        <div class="moon-mist"></div>
        <svg class="moon-constellation" viewBox="0 0 200 200">
            <polyline points="40,150 70,110 120,120 160,70" fill="none" stroke="rgba(175, 196, 214, 0.3)" stroke-width="0.8" stroke-dasharray="3, 3"/>
            <circle cx="40" cy="150" r="1.5" fill="#E6EDF5" filter="drop-shadow(0 0 2px #E6EDF5)"/>
            <circle cx="70" cy="110" r="2" fill="#E6EDF5" filter="drop-shadow(0 0 3px #E6EDF5)"/>
            <circle cx="120" cy="120" r="1.5" fill="#E6EDF5" filter="drop-shadow(0 0 2px #E6EDF5)"/>
            <circle cx="160" cy="70" r="2.5" fill="#E6EDF5" filter="drop-shadow(0 0 4px #E6EDF5)"/>
        </svg>
    `;
    nightSky.appendChild(moonContainer);

    // Create stars container
    const starsContainer = document.createElement('div');
    starsContainer.className = 'stars-container';
    nightSky.appendChild(starsContainer);

    // Generate stars
    const starCount = 45;
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 2 + 1;
        const x = Math.random() * 100;
        const y = Math.random() * 60;
        const baseOpacity = Math.random() * 0.4 + 0.2;
        const peakOpacity = Math.random() * 0.5 + 0.5;
        const scale = Math.random() * 0.5 + 1;
        const duration = Math.random() * 3 + 1.5;
        const delay = Math.random() * 5;

        star.style.cssText = `
      left: ${x}%;
      top: ${y}%;
      width: ${size}px;
      height: ${size}px;
      --base-opacity: ${baseOpacity};
      --peak-opacity: ${peakOpacity};
      --scale: ${scale};
      --duration: ${duration}s;
      --delay: ${delay}s;
    `;
        starsContainer.appendChild(star);
    }

    // Create mist
    const mist = document.createElement('div');
    mist.className = 'night-mist';
    nightSky.appendChild(mist);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'night-overlay';
    nightSky.appendChild(overlay);

    // Create tree glow
    const treeGlow = document.createElement('div');
    treeGlow.className = 'tree-glow';
    nightSky.appendChild(treeGlow);

    // Create fireflies container
    const firefliesContainer = document.createElement('div');
    firefliesContainer.className = 'fireflies-container';
    nightSky.appendChild(firefliesContainer);

    // Generate fireflies
    const fireflyCount = 15;
    for (let i = 0; i < fireflyCount; i++) {
        const firefly = document.createElement('div');
        firefly.className = 'firefly';
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 6 + 6;
        const delay = Math.random() * 8;
        const tx1 = (Math.random() - 0.5) * 80;
        const ty1 = -Math.random() * 60 - 20;
        const tx2 = (Math.random() - 0.5) * 60;
        const ty2 = -Math.random() * 80 - 40;
        const tx3 = (Math.random() - 0.5) * 80;
        const ty3 = -Math.random() * 40 - 10;

        firefly.style.cssText = `
      left: ${x}%;
      top: ${y}%;
      --duration: ${duration}s;
      --delay: ${delay}s;
      --tx1: ${tx1}px;
      --ty1: ${ty1}px;
      --tx2: ${tx2}px;
      --ty2: ${ty2}px;
      --tx3: ${tx3}px;
      --ty3: ${ty3}px;
    `;
        firefliesContainer.appendChild(firefly);
    }

    // Create floating particles
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'night-particles';
    nightSky.appendChild(particlesContainer);

    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'night-particle';
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 8 + 8;
        const delay = Math.random() * 10;

        particle.style.cssText = `
      left: ${x}%;
      top: ${y}%;
      --duration: ${duration}s;
      --delay: ${delay}s;
    `;
        particlesContainer.appendChild(particle);
    }

    // Create owl
    const owlContainer = document.createElement('div');
    owlContainer.className = 'owl-container';
    owlContainer.id = 'owlContainer';
    owlContainer.innerHTML = `
    <div class="owl" id="owl">
      <div class="owl-ear owl-ear--left"></div>
      <div class="owl-ear owl-ear--right"></div>
      <div class="owl-body"></div>
      <div class="owl-wing owl-wing--left"></div>
      <div class="owl-wing owl-wing--right"></div>
      <div class="owl-face">
        <div class="owl-eye owl-eye--left">
          <div class="owl-pupil" id="owlPupilLeft"></div>
        </div>
        <div class="owl-eye owl-eye--right">
          <div class="owl-pupil" id="owlPupilRight"></div>
        </div>
        <div class="owl-beak"></div>
      </div>
    </div>
  `;
    nightSky.appendChild(owlContainer);

    // Position owl on a branch (will be updated based on tree)
    positionOwl();

    // Create cursor glow
    const cursorGlow = document.createElement('div');
    cursorGlow.className = 'cursor-glow';
    document.body.appendChild(cursorGlow);
}

// Position owl on tree branch
function positionOwl() {
    const owlContainer = document.getElementById('owlContainer');
    if (!owlContainer) return;

    // Position owl on a branch area - adjust based on canvas size
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Position on left side of tree
    const owlX = w * 0.28;
    const owlY = h * 0.42;

    owlContainer.style.left = `${owlX}px`;
    owlContainer.style.top = `${owlY}px`;
}

// Owl follows cursor
function updateOwlHead(cursorX, cursorY) {
    const owl = document.getElementById('owl');
    const owlContainer = document.getElementById('owlContainer');
    if (!owl || !owlContainer) return;

    const owlRect = owlContainer.getBoundingClientRect();
    const owlCenterX = owlRect.left + owlRect.width / 2;
    const owlCenterY = owlRect.top + owlRect.height / 2;

    const angle = Math.atan2(cursorY - owlCenterY, cursorX - owlCenterX);
    const maxRotation = 25;
    const rotation = Math.max(-maxRotation, Math.min(maxRotation, angle * (180 / Math.PI)));

    owl.style.transform = `rotate(${rotation}deg)`;

    // Update pupils
    const pupilLeft = document.getElementById('owlPupilLeft');
    const pupilRight = document.getElementById('owlPupilRight');
    if (pupilLeft && pupilRight) {
        const pupilOffset = 1.5;
        const offsetX = Math.cos(angle) * pupilOffset;
        const offsetY = Math.sin(angle) * pupilOffset;
        pupilLeft.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
        pupilRight.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    }
}

// Update cursor glow position
function updateCursorGlow(x, y) {
    const cursorGlow = document.querySelector('.cursor-glow');
    if (cursorGlow) {
        cursorGlow.style.left = `${x}px`;
        cursorGlow.style.top = `${y}px`;
    }
}

// Toggle night mode
function toggleNightMode() {
    isNightMode = !isNightMode;
    document.body.classList.toggle('night-mode', isNightMode);
    localStorage.setItem('nightMode', isNightMode);
}

// Create day sky elements
function createDaySkyElements() {
    const daySky = document.getElementById('daySky');
    if (!daySky) return;

    // Create sun
    const sun = document.createElement('div');
    sun.className = 'day-sun';
    sun.addEventListener('click', toggleNightMode);
    daySky.appendChild(sun);

    // Create sun rays
    const rays = document.createElement('div');
    rays.className = 'sun-rays';
    daySky.appendChild(rays);
}

// Initialize night mode
function initNightMode() {
    createDaySkyElements();
    createNightSkyElements();

    // Apply saved preference
    if (isNightMode) {
        document.body.classList.add('night-mode');
    }



    // Track cursor for owl and glow
    document.addEventListener('mousemove', (e) => {
        if (isNightMode) {
            updateOwlHead(e.clientX, e.clientY);
            updateCursorGlow(e.clientX, e.clientY);
        }
    });

    // Handle window resize for owl position
    window.addEventListener('resize', () => {
        if (isNightMode) {
            positionOwl();
        }
    });
}

// Start night mode
initNightMode();

// Parallax effect for night mode
let lastMouseX = 0;
let lastMouseY = 0;

function initParallax() {
    document.addEventListener('mousemove', (e) => {
        if (!isNightMode) return;

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Calculate movement from center
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const moveX = (mouseX - centerX) / centerX;
        const moveY = (mouseY - centerY) / centerY;

        // Apply parallax to different layers
        // Sky (stars, moon) - subtle movement
        const starsContainer = document.querySelector('.stars-container');
        const moonlightRays = document.querySelector('.moonlight-rays');
        const nightMoon = document.querySelector('.night-moon');
        if (starsContainer) {
            starsContainer.style.transform = `translate(${moveX * -3}px, ${moveY * -2}px)`;
        }
        if (moonlightRays) {
            moonlightRays.style.transform = `translate(calc(30% + ${moveX * 5}px), calc(20% + ${moveY * 3}px))`;
        }
        if (nightMoon) {
            nightMoon.style.transform = `translate(${moveX * -2}px, ${moveY * -1}px)`;
        }

        // Tree canvas - slight movement
        const treeCanvas = document.getElementById('treeCanvas');
        if (treeCanvas) {
            treeCanvas.style.transform = `translate(${moveX * 2}px, ${moveY * 1}px)`;
        }

        // UI layer - opposite direction for depth
        const overlay = document.getElementById('overlay');
        const mindmap = document.getElementById('mindmap');
        if (overlay) {
            overlay.style.transform = `translate(${moveX * 1}px, ${moveY * 0.5}px)`;
        }
        if (mindmap) {
            mindmap.style.transform = `translate(${moveX * 1.5}px, ${moveY * 0.8}px)`;
        }

        lastMouseX = mouseX;
        lastMouseY = mouseY;
    });

    // Reset parallax on mouse leave
    document.addEventListener('mouseleave', () => {
        if (!isNightMode) return;
        const starsContainer = document.querySelector('.stars-container');
        const moonlightRays = document.querySelector('.moonlight-rays');
        const nightMoon = document.querySelector('.night-moon');
        const treeCanvas = document.getElementById('treeCanvas');
        const overlay = document.getElementById('overlay');
        const mindmap = document.getElementById('mindmap');

        if (starsContainer) starsContainer.style.transform = 'translate(0, 0)';
        if (moonlightRays) moonlightRays.style.transform = 'translate(30%, 20%)';
        if (nightMoon) nightMoon.style.transform = 'translate(0, 0)';
        if (treeCanvas) treeCanvas.style.transform = 'translate(0, 0)';
        if (overlay) overlay.style.transform = 'translate(0, 0)';
        if (mindmap) mindmap.style.transform = 'translate(0, 0)';
    });
}

initParallax();

// --- Leaf Burst Transition ---
const PINK_LEAF_COL = [
    'rgba(255, 182, 193,', // Light Pink
    'rgba(255, 105, 180,', // Hot Pink
    'rgba(255, 192, 203,', // Pink
    'rgba(219, 112, 147,', // Pale Violet Red
    'rgba(255, 20, 147,',  // Deep Pink
];

const transCanvas = document.getElementById('transitionCanvas');
const transCtx = transCanvas ? transCanvas.getContext('2d') : null;
let transLeaves = [];
let transActive = false;

function initTransitionCanvas() {
    if (!transCanvas) return;
    transCanvas.width = window.innerWidth;
    transCanvas.height = window.innerHeight;
}
window.addEventListener('resize', initTransitionCanvas);
initTransitionCanvas();

function triggerLeafBurst(url) {
    if (transActive || !transCanvas) return;
    transActive = true;
    transCanvas.classList.add('active');

    // Spawn 1000 leaves for a very dense pink "curtain"
    transLeaves = Array.from({ length: 1000 }, () => {
        const l = new Leaf();
        l.init(false);
        l.col = PINK_LEAF_COL[Math.floor(Math.random() * PINK_LEAF_COL.length)];
        l.y = -Math.random() * 1200;
        l.vy = 12 + Math.random() * 14; // Faster fall
        l.sz = 8 + Math.random() * 12; // Large bold pink petals
        l.vx = (Math.random() - 0.5) * 6;
        return l;
    });



    function animateBurst() {
        if (!transActive) return;
        transCtx.clearRect(0, 0, transCanvas.width, transCanvas.height);

        let stillFalling = false;
        transLeaves.forEach(l => {
            l.y += l.vy;
            l.x += l.vx + Math.sin(l.wob += l.ws) * 3;
            l.rot += l.vrot * 3;

            // Draw on transition canvas
            transCtx.save();
            transCtx.translate(l.x, l.y);
            transCtx.rotate(l.rot);
            transCtx.globalAlpha = l.a;
            transCtx.fillStyle = l.col + '1.0)';
            transCtx.beginPath();
            transCtx.ellipse(0, 0, l.sz, l.sz * 0.45, 0, 0, Math.PI * 2);
            transCtx.fill();
            transCtx.restore();

            if (l.y < transCanvas.height + 100) stillFalling = true;
        });

        if (!stillFalling) {
            transActive = false;
            transCanvas.classList.remove('active');
            transCtx.clearRect(0, 0, transCanvas.width, transCanvas.height);
        } else {
            requestAnimationFrame(animateBurst);
        }
    }

    animateBurst();

    // Open link after 1s (when the screen is most densely filled)
    setTimeout(() => {
        window.open(url, '_blank');
        // Keep the animation running for a bit longer so it looks smooth if they return
    }, 1000);
}

// Hook links to transition
function initLinkTransitions() {
    const links = document.querySelectorAll('.link-item');
    links.forEach(link => {
        link.addEventListener('click', function (e) {
            const url = this.getAttribute('href');
            if (!url || url === '#' || url.startsWith('mailto:')) return;

            e.preventDefault();
            triggerLeafBurst(url);
        });
    });
}

initLinkTransitions();