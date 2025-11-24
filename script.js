// --- Configuration ---
// Using face-api models from a reliable raw GitHub source to ensure CDN stability
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const COLORMIND_API = 'http://colormind.io/api/'; // Note: Can be flaky on HTTPS, fallback implemented

// DOM Elements
const video = document.getElementById('video-feed');
const canvasFX = document.getElementById('fx-canvas');
const ctxFX = canvasFX.getContext('2d');
const loader = document.getElementById('loader');
const mainCard = document.getElementById('main-card');
const emotionNameEl = document.getElementById('emotion-name');
const confidenceEl = document.getElementById('confidence-text');
const paletteContainer = document.getElementById('palette-container');
const recalibrateBtn = document.getElementById('recalibrate-btn');
const dlBtn = document.getElementById('dl-btn');
const copyBtn = document.getElementById('copy-btn');
const spotifyLink = document.getElementById('spotify-link');
const swatches = document.querySelectorAll('.color-swatch');

// State
let isScanning = false;
let currentPalette = ['#333', '#444', '#555', '#666', '#777'];
let currentEmotion = 'neutral';
let animationFrameId;

// --- Emotion Data & Mappings ---
const emotionData = {
    happy: { 
        seed: [255, 200, 0], // Yellow/Gold
        vibe: "uplifting summer pop", 
        bgKeywords: "sunshine,abstract,yellow", 
        effect: 'confetti' 
    },
    sad: { 
        seed: [50, 80, 120], // Muted Blue
        vibe: "melancholy lofi rainy", 
        bgKeywords: "rain,blue,moody", 
        effect: 'rain' 
    },
    angry: { 
        seed: [200, 20, 20], // Red
        vibe: "aggressive phonk metal", 
        bgKeywords: "red,fire,abstract", 
        effect: 'pulse' 
    },
    surprised: { 
        seed: [255, 0, 255], // Magenta/Neon
        vibe: "hyperpop energetic", 
        bgKeywords: "neon,purple,abstract", 
        effect: 'confetti' 
    },
    fearful: { 
        seed: [30, 0, 60], // Dark Purple/Black
        vibe: "dark ambient suspense", 
        bgKeywords: "shadow,dark,abstract", 
        effect: 'fog' 
    },
    disgusted: { 
        seed: [80, 100, 50], // Sickly Green
        vibe: "experimental grunge", 
        bgKeywords: "texture,green,slime", 
        effect: 'none' 
    },
    neutral: { 
        seed: [200, 190, 180], // Beige/Sage
        vibe: "chill acoustic coffee", 
        bgKeywords: "minimal,beige,calm", 
        effect: 'none' 
    }
};

// --- Initialization ---
async function init() {
    try {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Load Models
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);

        // Start Video
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;

        video.addEventListener('play', () => {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 800);
            video.classList.add('active');
            startScanning();
        });

    } catch (err) {
        console.error("Init error:", err);
        document.querySelector('.loader-text').innerText = "CAMERA ACCESS DENIED OR ERROR";
    }
}

function resizeCanvas() {
    canvasFX.width = window.innerWidth;
    canvasFX.height = window.innerHeight;
}

// --- Detection Logic ---
function startScanning() {
    isScanning = true;
    recalibrateBtn.innerText = "Scanning...";
    recalibrateBtn.classList.add('pulse-active');
    emotionNameEl.innerText = "Reading Face...";
    confidenceEl.innerText = "Hold still";
    
    const interval = setInterval(async () => {
        if (!isScanning) {
            clearInterval(interval);
            return;
        }

        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();

        if (detections.length > 0) {
            const expressions = detections[0].expressions;
            // Find dominant emotion
            const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
            const dominant = sorted[0]; // [emotion, score]

            if (dominant[1] > 0.65) { // Threshold
                finalizeMood(dominant[0], dominant[1]);
            }
        }
    }, 500);
}

// --- Mood Generation ---
async function finalizeMood(emotion, confidence) {
    isScanning = false;
    recalibrateBtn.classList.remove('pulse-active');
    recalibrateBtn.innerText = "Recalibrate Mood";
    currentEmotion = emotion;

    // UI Update
    const confPercent = Math.round(confidence * 100);
    emotionNameEl.innerText = emotion.charAt(0).toUpperCase() + emotion.slice(1);
    confidenceEl.innerText = `${confPercent}% Confidence`;

    // Spotify
    const vibe = emotionData[emotion].vibe;
    spotifyLink.href = `https://open.spotify.com/search/${encodeURIComponent(vibe)}`;
    spotifyLink.innerHTML = `Listen to: ${vibe}`;

    // Generate Palette
    await generatePalette(emotion);
    
    // Trigger Effects
    handleVisualEffects(emotion);
}

async function generatePalette(emotion) {
    const seed = emotionData[emotion].seed;
    let palette = [];

    // Try Colormind API
    try {
        const response = await fetch(COLORMIND_API, {
            method: 'POST',
            body: JSON.stringify({
                model: "default",
                input: [seed, "N", "N", "N", "N"]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            palette = data.result.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
        } else {
            throw new Error("API Fail");
        }
    } catch (e) {
        console.log("Falling back to procedural generation");
        palette = generateProceduralPalette(seed);
    }

    currentPalette = palette;
    applyPalette(palette, emotion);
}

// Fallback generator using HSL manipulation
function generateProceduralPalette(rgbSeed) {
    // Convert RGB to HSL, shift Hue/Lightness for harmony
    const r = rgbSeed[0], g = rgbSeed[1], b = rgbSeed[2];
    const hsl = rgbToHsl(r,g,b);
    
    let colors = [];
    // Monochromatic + Analogous mix strategy
    colors.push(hslToHex(hsl[0], hsl[1], Math.max(10, hsl[2] - 30))); // Darker
    colors.push(hslToHex(hsl[0], hsl[1], hsl[2])); // Base
    colors.push(hslToHex((hsl[0] + 20) % 360, Math.max(0, hsl[1] - 10), Math.min(100, hsl[2] + 20))); // Brighter Analogous
    colors.push(hslToHex((hsl[0] - 20 + 360) % 360, hsl[1], Math.min(100, hsl[2] + 40))); // Very Bright
    colors.push(hslToHex((hsl[0] + 180) % 360, 20, 90)); // Complementary / Neutral light
    
    return colors;
}

function applyPalette(colors, emotion) {
    // Update Swatches
    swatches.forEach((swatch, i) => {
        swatch.style.backgroundColor = colors[i];
        swatch.querySelector('.hex-code').innerText = colors[i];
        // CSS Vars for grid
        document.documentElement.style.setProperty(`--c${i+1}`, colors[i]);
    });

    // Update Background (Complex Gradient)
    const gradient = `radial-gradient(circle at 50% 50%, ${colors[2]} 0%, ${colors[1]} 40%, ${colors[0]} 100%)`;
    document.body.style.background = gradient;

    // Text Contrast Logic
    const brightness = getBrightness(hexToRgb(colors[0]));
    if (brightness > 128) {
        document.body.classList.remove('dark-mode-text');
        document.body.classList.add('light-mode-text');
    } else {
        document.body.classList.remove('light-mode-text');
        document.body.classList.add('dark-mode-text');
    }
}

// --- Visual Effects (Canvas) ---
let particles = [];
function handleVisualEffects(emotion) {
    const effectType = emotionData[emotion].effect;
    particles = []; // Clear previous

    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    if (effectType === 'confetti') {
        for(let i=0; i<100; i++) particles.push(createConfetti());
        animateConfetti();
    } else if (effectType === 'rain') {
        for(let i=0; i<200; i++) particles.push(createRain());
        animateRain();
    } else {
        ctxFX.clearRect(0, 0, canvasFX.width, canvasFX.height);
    }
}

function createConfetti() {
    return {
        x: Math.random() * canvasFX.width,
        y: Math.random() * canvasFX.height - canvasFX.height,
        size: Math.random() * 10 + 5,
        color: currentPalette[Math.floor(Math.random() * 5)],
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 2 - 1,
        rotation: Math.random() * 360
    };
}

function animateConfetti() {
    ctxFX.clearRect(0, 0, canvasFX.width, canvasFX.height);
    particles.forEach(p => {
        p.y += p.speedY;
        p.x += Math.sin(p.y * 0.01) + p.speedX;
        p.rotation += 2;
        
        if (p.y > canvasFX.height) p.y = -20;

        ctxFX.save();
        ctxFX.translate(p.x, p.y);
        ctxFX.rotate(p.rotation * Math.PI / 180);
        ctxFX.fillStyle = p.color;
        ctxFX.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctxFX.restore();
    });
    animationFrameId = requestAnimationFrame(animateConfetti);
}

function createRain() {
    return {
        x: Math.random() * canvasFX.width,
        y: Math.random() * canvasFX.height,
        length: Math.random() * 20 + 10,
        speed: Math.random() * 5 + 5,
        opacity: Math.random() * 0.5 + 0.1
    };
}

function animateRain() {
    ctxFX.clearRect(0, 0, canvasFX.width, canvasFX.height);
    ctxFX.strokeStyle = 'rgba(255,255,255,0.5)';
    ctxFX.lineWidth = 1;
    
    particles.forEach(p => {
        p.y += p.speed;
        if (p.y > canvasFX.height) p.y = -p.length;

        ctxFX.beginPath();
        ctxFX.moveTo(p.x, p.y);
        ctxFX.lineTo(p.x, p.y + p.length);
        ctxFX.stroke();
    });
    animationFrameId = requestAnimationFrame(animateRain);
}

// --- Utilities ---
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function getBrightness(rgb) {
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max == min) { h = s = 0; } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// --- Event Listeners ---
recalibrateBtn.addEventListener('click', startScanning);

copyBtn.addEventListener('click', () => {
    const css = `
/* MoodPalette: ${currentEmotion} */
:root {
    --color-1: ${currentPalette[0]};
    --color-2: ${currentPalette[1]};
    --color-3: ${currentPalette[2]};
    --color-4: ${currentPalette[3]};
    --color-5: ${currentPalette[4]};
}`;
    navigator.clipboard.writeText(css);
    copyBtn.innerText = "Copied!";
    setTimeout(() => copyBtn.innerText = "Copy CSS", 2000);
});

dlBtn.addEventListener('click', () => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    c.width = 1080; c.height = 1080;

    // Background
    ctx.fillStyle = currentPalette[0];
    ctx.fillRect(0,0,1080,1080);

    // Palette bars
    currentPalette.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(i * (1080/5), 200, (1080/5), 600);
    });

    // Text
    ctx.fillStyle = "#fff";
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.fillText(currentEmotion.toUpperCase(), 540, 150);

    ctx.font = "30px monospace";
    currentPalette.forEach((col, i) => {
        ctx.fillText(col, (i * (1080/5)) + 108, 850);
    });

    const link = document.createElement('a');
    link.download = `MoodPalette-${currentEmotion}.png`;
    link.href = c.toDataURL();
    link.click();
});

// Start App
init();
