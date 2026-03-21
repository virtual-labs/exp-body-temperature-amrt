/**
 * HUMAN PHYSIOLOGY SIMULATOR v2.0
 * Vanilla JS Implementation
 */

// ==========================================
// 1. CONSTANTS & CONFIG
// ==========================================
// ==========================================
// 0. ORIENTATION / PORTRAIT VIDEO HELPERS
// ==========================================

/**
 * Returns true when the viewport is in portrait orientation
 * (taller than wide), i.e. phone/tablet in portrait.
 */
function isPortrait() {
    return window.innerHeight > window.innerWidth;
}

/**
 * Portrait filename overrides.
 * Add entries here whenever you have a portrait video with a
 * custom name (i.e. not stored in the portrait/ subfolder).
 * Key   = landscape filename
 * Value = portrait filename to use instead
 */
const PORTRAIT_VIDEO_MAP = {
    // ── Physiological Scenarios ─────────────────────────────────────────
    // Resting
    'desktop/resting.mp4': 'android/Resting_homeostasis_android.mp4',
    'desktop/resting_hypothermia.mp4': 'android/Resting_hypothermia_android.mp4',
    'desktop/resting_hyperthermia.mp4': 'android/Resting_hyperthermia_android.mp4',
    // Walking
    'desktop/walking.mp4': 'android/Walking_homeostasis_android.mp4',
    'desktop/walking_hypothermia.mp4': 'android/Walking_hypothermia_android.mp4',
    'desktop/walking_hyperthermia.mp4': 'android/Walking_hyperthermia_android.mp4',
    // Running / Sprinting
    'desktop/running.mp4': 'android/Running_homeostasis_android.mp4',
    'desktop/running_hypothermia.mp4': 'android/Running_hypothermia_android.mp4',
    'desktop/running_hyperthermia.mp4': 'android/Running_hyperthermia_android.mp4',
    
    // ── Body Organ Scenarios ──────────────────────────────────────────────
    // Heart
    'desktop/Heart_homeostasis.mp4': 'android/Heart_homeostasis_android.mp4',
    'desktop/Heart_hypothermia.mp4': 'android/Heart_hypothermia_android.mp4',
    'desktop/Heart_hyperthermia.mp4': 'android/Heart_hyperthermia_android.mp4',
    // Skin (Hand)
    'desktop/Hand_vasodilation.mp4': 'android/Hand_homeostasis_android.mp4',
    'desktop/Hand_hypothermia.mp4': 'android/Hand_hypothermia_android.mp4',
    'desktop/Hand_hyperthermia.mp4': 'android/Hand_hyperthermia_android.mp4',
    // Eye
    'desktop/eye_homeostasis.mp4': 'android/Eye_homeostasis_android.mp4',
    'desktop/eye_hypothermia.mp4': 'android/Eye_hypothermia_android.mp4',
    'desktop/eye_hyperthermia.mp4': 'android/Eye_hyperthermia_android.mp4',
};

/**
 * Cache-busting version token — update this value whenever videos are replaced
 * so the browser fetches fresh files instead of serving cached copies.
 */
const VIDEO_VERSION = '20260319_v3';

/**
 * Returns the correct video path for the current orientation.
 *  - In landscape: returns desktop/<filename>.
 *  - In portrait:  checks PORTRAIT_VIDEO_MAP for an android override first,
 *    then falls back to desktop/<filename> if no entry exists.
 * Appends ?v=VIDEO_VERSION to bust the browser cache after video updates.
 */
function getVideoSrc(filename) {
    const desktopPath = filename.startsWith('desktop/') ? filename : 'desktop/' + filename;
    const resolved = isPortrait() ? (PORTRAIT_VIDEO_MAP[desktopPath] ?? desktopPath) : desktopPath;
    return `${resolved}?v=${VIDEO_VERSION}`;
}

const CONSTANTS = {
    BASE_METABOLIC_RATE: 80, // Watts
    BODY_MASS: 75, // kg
    SPECIFIC_HEAT: 3470, // J/(kg*K)
    SURFACE_AREA: 1.8, // m^2
    SIM_SPEED: 5, // time multiplier
    TICK_RATE: 100, // ms
};

const ACTIVITY_LEVELS = {
    resting: { label: 'Resting', met: 1.0, video: 'resting' },
    walking: { label: 'Walking', met: 3.0, video: 'walking' },
    sprinting: { label: 'Sprinting', met: 10.0, video: 'running' },
};

const CLOTHING_INSULATION = {
    naked: { label: 'Naked', clo: 0.1 },
    light: { label: 'Light Clothes', clo: 0.6 },
    winter: { label: 'Winter Gear', clo: 1.5 },
};

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
const state = {
    // Inputs
    inputs: {
        ambientTemp: 22,
        humidity: 50,
        windSpeed: 0,
        activityLevel: 'resting',
        clothing: 'light'
    },
    // Outputs
    outputs: {
        coreTemp: 37.0,
        heartRate: 70,
        spO2: 99,                    // Blood oxygen saturation %
        respiratoryRate: 14,         // Breaths per minute
        bloodPressureSystolic: 120,  // mmHg
        physiologicalState: {
            shivering: false,
            sweating: false,
            vasodilation: false,
            vasoconstriction: false,
            status: 'Homeostasis Stable'
        }
    },
    // UI State
    ui: {
        started: true,
        activeTab: 'body', // 'body' | 'organs'
        showNav: false,
        activeBodyPart: null,      // 'heart' | 'skin' | 'eye'
        activeBodyPartState: null, // 'cold' | 'normal' | 'heat'
        activeSection: null        // 'physiological' | 'bodypart'
    }
};

// Subscriber system for reactive updates
const listeners = new Set();
function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function setState(updater) {
    if (typeof updater === 'function') {
        updater(state);
    } else {
        Object.assign(state, updater);
    }
    // Notify listeners
    listeners.forEach(l => l(state));
    // Trigger render updates where necessary
    renderApp();
    updateUI();
}

// ==========================================
// 3. SIMULATION LOGIC (Physics Engine)
// ==========================================
function startSimulation() {
    setInterval(() => {
        const { inputs, outputs } = state;

        // --- 1. Heat Production ---
        const met = ACTIVITY_LEVELS[inputs.activityLevel].met;
        let heatProd = CONSTANTS.BASE_METABOLIC_RATE * met;

        // Shivering thermogenesis
        if (outputs.coreTemp < 36.5) {
            heatProd += 200;
        }

        // --- 2. Heat Loss ---
        const clo = CLOTHING_INSULATION[inputs.clothing].clo;
        // Wind Chill logic
        const windFactor = 1 + 0.1 * Math.sqrt(inputs.windSpeed);
        const insulation = (0.155 * clo + 0.1) / windFactor;

        let heatLoss = (CONSTANTS.SURFACE_AREA * (outputs.coreTemp - inputs.ambientTemp)) / insulation;

        // Evaporative Cooling
        // Sweating
        if (outputs.coreTemp > 37.5) {
            const humidityFactor = 1 - (inputs.humidity / 100) * 0.8;
            const windEvapFactor = 1 + (inputs.windSpeed / 20);
            const maxSweatCooling = 500 * humidityFactor * windEvapFactor;

            // Proportional control
            const sweatIntensity = Math.min(1, (outputs.coreTemp - 37.5) / 1.0);
            heatLoss += maxSweatCooling * sweatIntensity;
        } else {
            // Basal evaporation
            heatLoss += 15;
        }

        // --- 3. Update Core Temp ---
        const netHeat = heatProd - heatLoss;
        const deltaTemp = (netHeat * (CONSTANTS.TICK_RATE / 1000) * CONSTANTS.SIM_SPEED) / (CONSTANTS.BODY_MASS * CONSTANTS.SPECIFIC_HEAT);

        let newTemp = outputs.coreTemp + deltaTemp;
        // Clamp
        if (newTemp > 44) newTemp = 44;
        if (newTemp < 30) newTemp = 30;

        // --- 4. Heart Rate Logic ---
        let targetBPM = 70;
        if (inputs.activityLevel === 'walking') targetBPM = 100;
        if (inputs.activityLevel === 'sprinting') targetBPM = 145;

        // Thermal Drift
        if (newTemp > 37.5) targetBPM += (newTemp - 37.5) * 15;
        else if (newTemp < 36.5) targetBPM += 10; // Shivering strain

        if (newTemp < 34.0) targetBPM -= (34.0 - newTemp) * 10; // Metabolic slowdown

        if (newTemp > 40 || newTemp < 32) targetBPM += 20; // Panic

        // Smooth transition
        const newHR = outputs.heartRate + (targetBPM - outputs.heartRate) * 0.05;
        const clampedHR = Math.max(30, Math.min(220, newHR));

        // --- 5. Determine Physiological State ---
        const newState = {
            shivering: newTemp < 36.5,
            sweating: newTemp > 37.5,
            vasoconstriction: newTemp < 36.8,
            vasodilation: newTemp > 37.2,
            status: 'Homeostasis Stable'
        };

        if (newTemp < 35.0) newState.status = 'HYPOTHERMIA WARNING';
        else if (newTemp < 36.4) newState.status = 'Cold Stress';
        else if (newTemp > 40.0) newState.status = 'HEAT STROKE WARNING';
        else if (newTemp > 37.6) newState.status = 'Heat Stress';
        else newState.status = 'Homeostasis Stable';

        // Update State
        setState(s => {
            s.outputs.coreTemp = newTemp;
            s.outputs.heartRate = clampedHR;
            s.outputs.physiologicalState = newState;
        });

    }, CONSTANTS.TICK_RATE);
}


// ==========================================
// 4. COMPONENT RENDERING
// ==========================================

const app = document.getElementById('app');

function renderApp() {
    if (!state.ui.started) {
        app.innerHTML = RenderLandingPage();
        setTimeout(initIcons, 0);
    } else {
        if (!document.getElementById('simulator-root')) {
            app.innerHTML = RenderSimulator();
            setTimeout(() => {
                initIcons();
                renderMenuPanel();
                // Video player remains intentionally blank here as per user request
            }, 0);
        }
    }
}

// Helpers
function initIcons() {
    if (window.lucide) lucide.createIcons();
}

function clsx(...args) {
    return args.filter(Boolean).join(' ');
}

// ==========================================
// DRILL-DOWN MENU STATE & LOGIC
// ==========================================

const menuState = {
    level: 'categories',   // 'categories' | 'temperatures'
    category: null,        // e.g. 'resting', 'heart', 'skin', 'eye'
    temperature: null      // 'cold' | 'normal' | 'heat'
};

// Video path mapping (desktop; getVideoSrc handles portrait fallback)
const VIDEO_MAP = {
    resting: {
        cold:   'desktop/resting_hypothermia.mp4',
        normal: 'desktop/resting.mp4',
        heat:   'desktop/resting_hyperthermia.mp4'
    },
    walking: {
        cold:   'desktop/walking_hypothermia.mp4',
        normal: 'desktop/walking.mp4',
        heat:   'desktop/walking_hyperthermia.mp4'
    },
    running: {
        cold:   'desktop/running_hypothermia.mp4',
        normal: 'desktop/running.mp4',
        heat:   'desktop/running_hyperthermia.mp4'
    },
    heart: {
        cold:   'desktop/Heart_hypothermia.mp4',
        normal: 'desktop/Heart_homeostasis.mp4',
        heat:   'desktop/Heart_hyperthermia.mp4'
    },
    skin: {
        cold:   'desktop/Hand_hypothermia.mp4',
        normal: 'desktop/Hand_vasodilation.mp4',
        heat:   'desktop/Hand_hyperthermia.mp4'
    },
    eye: {
        cold:   'desktop/eye_hypothermia.mp4',
        normal: 'desktop/eye_homeostasis.mp4',
        heat:   'desktop/eye_hyperthermia.mp4'
    }
};

const CATEGORY_META = {
    resting: { label: 'Resting', icon: '', group: 'scenarios' },
    walking: { label: 'Walking', icon: '', group: 'scenarios' },
    running: { label: 'Running', icon: '', group: 'scenarios' },
    heart:   { label: 'Heart',   icon: '', group: 'organ' },
    skin:    { label: 'Skin',    icon: '', group: 'organ' },
    eye:     { label: 'Eye',     icon: '', group: 'organ' }
};

/** Render the drill-down menu into #menu-panel (categories view) */
function renderCategoriesView() {
    return `
    <div class="flex flex-col gap-5 pt-1">
        <div class="px-1 mb-0">
            <div class="text-xl font-black text-slate-800 mb-2">Navigation Menu</div>
        </div>
        <!-- SCENARIOS -->
        <div class="mb-1">
            <div class="text-lg font-bold text-slate-700 px-1 mb-2">
                Activity Level
            </div>
            <div class="flex flex-col gap-1.5">
                ${['resting','walking','running'].map(k => `
                <button class="btn-category" onclick="selectCategory('${k}')">
                    ${CATEGORY_META[k].label}
                </button>`).join('')}
            </div>
        </div>
        <!-- BODY ORGAN -->
        <div class="mb-1">
            <div class="text-lg font-bold text-slate-700 px-1 mb-2">
                Physiological View
            </div>
            <div class="flex flex-col gap-1.5">
                ${['heart','skin','eye'].map(k => `
                <button class="btn-category" onclick="selectCategory('${k}')">
                    ${CATEGORY_META[k].label}
                </button>`).join('')}
            </div>
        </div>
    </div>`;
}

/** Render the temperature sub-menu for a chosen category */
function renderTemperaturesView(cat) {
    const meta = CATEGORY_META[cat];
    const activeCold   = menuState.temperature === 'cold'   ? ' active-cold'   : '';
    const activeNormal = menuState.temperature === 'normal' ? ' active-normal' : '';
    const activeHeat   = menuState.temperature === 'heat'   ? ' active-heat'   : '';
    return `
    <div class="flex flex-col gap-4">
        <!-- Selected category badge -->
        <div class="selected-category-label">
            ${meta.icon} ${meta.label}
        </div>
        <!-- Temperature buttons -->
        <div class="flex flex-col gap-2">
            <button class="btn-temp cold${activeCold}" onclick="selectTemperature('cold')">
                Hypothermia
            </button>
            <button class="btn-temp normal${activeNormal}" onclick="selectTemperature('normal')">
                Homeostasis
            </button>
            <button class="btn-temp heat${activeHeat}" onclick="selectTemperature('heat')">
                Hyperthermia
            </button>
        </div>
        <!-- Back -->
        <div style="margin-top:4px">
            <button class="btn-back" onclick="menuGoBack()">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
            </button>
        </div>

        <!-- Vitals Showcase (Fades in when a temperature is selected) -->
        <div id="vitals-showcase" class="mt-4 flex flex-col gap-3 opacity-0 transition-opacity duration-1000 hidden pb-6">
        </div>
    </div>`;
}

/** Main render dispatcher for #menu-panel */
function renderMenuPanel() {
    const panel = document.getElementById('menu-panel');
    if (!panel) return;
    const html = menuState.level === 'categories'
        ? renderCategoriesView()
        : renderTemperaturesView(menuState.category);
    panel.innerHTML = html;
    panel.classList.remove('fading');
    panel.classList.add('visible');
}

/** Fade out panel, swap content, fade back in */
function swapMenuPanel(fn) {
    const panel = document.getElementById('menu-panel');
    if (!panel) { fn(); return; }
    panel.classList.remove('visible');
    panel.classList.add('fading');
    setTimeout(() => { fn(); renderMenuPanel(); }, 320);
}

/** Called when a category button is clicked */
window.selectCategory = function(cat) {
    swapMenuPanel(() => {
        menuState.level = 'temperatures';
        menuState.category = cat;
        menuState.temperature = null;
    });
    
    // Clear the currently playing video so the background is blank 
    // until a specific scenario is chosen.
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    if (vid1) { vid1.pause(); vid1.removeAttribute('src'); vid1.classList.remove('opacity-100'); vid1.classList.add('opacity-0'); }
    if (vid2) { vid2.pause(); vid2.removeAttribute('src'); vid2.classList.remove('opacity-100'); vid2.classList.add('opacity-0'); }
    
    // Also hide the core temp gauge when returning to a blank state
    const gauge = document.getElementById('status-gauge-container');
    if (gauge) { gauge.classList.add('opacity-0'); }

    // Show the instructional overlay
    const inst = document.getElementById('instructions-overlay');
    if (inst) { inst.classList.remove('opacity-0', 'pointer-events-none'); inst.classList.add('opacity-100'); }
};

/** Called when a temperature button is clicked */
window.selectTemperature = function(temp) {
    menuState.temperature = temp;
    // Keep physics in sync
    syncPhysicsState(menuState.category, temp);

    // Re-render the temperature view to update active styles (no fade needed since it's same view)
    renderMenuPanel();
    const src = getVideoSrc(VIDEO_MAP[menuState.category][temp]);
    crossFadeVideo(src);

    // Fade in the vitals showcase
    const vitals = document.getElementById('vitals-showcase');
    if (vitals) {
        vitals.classList.remove('hidden');
        // small timeout to allow display:block to apply before opacity transition
        setTimeout(() => {
            vitals.classList.add('opacity-100');
            updateVitalsData();
        }, 50);
    }

    // Hide the instructional overlay since a video is going to play
    const inst = document.getElementById('instructions-overlay');
    if (inst) { inst.classList.remove('opacity-100'); inst.classList.add('opacity-0', 'pointer-events-none'); }
};

/** Back button in temperature view */
window.menuGoBack = function() {
    swapMenuPanel(() => {
        menuState.level = 'categories';
        menuState.category = null;
        menuState.temperature = null;
    });
    
    // Clear the currently playing video so the background is blank 
    // until a specific scenario is chosen.
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    if (vid1) { vid1.pause(); vid1.removeAttribute('src'); vid1.classList.remove('opacity-100'); vid1.classList.add('opacity-0'); }
    if (vid2) { vid2.pause(); vid2.removeAttribute('src'); vid2.classList.remove('opacity-100'); vid2.classList.add('opacity-0'); }
    
    // Also hide the core temp gauge when returning to a blank state
    const gauge = document.getElementById('status-gauge-container');
    if (gauge) { gauge.classList.add('opacity-0'); }

    // Show the instructional overlay
    const inst = document.getElementById('instructions-overlay');
    if (inst) { inst.classList.remove('opacity-0', 'pointer-events-none'); inst.classList.add('opacity-100'); }
};

/** Cross-fade between the two buffered <video> elements */
function crossFadeVideo(src, force = false) {
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    if (!vid1 || !vid2) return;
    const activeIs1 = vid1.classList.contains('opacity-100');
    const activeVid = activeIs1 ? vid1 : vid2;
    const nextVid   = activeIs1 ? vid2 : vid1;
    if (!force && activeVid.getAttribute('data-src') === src) return; // already playing
    if (nextVid.dataset.transitioning === '1') return;
    nextVid.dataset.transitioning = '1';
    nextVid.setAttribute('data-src', src);
    nextVid.src = src;
    nextVid.load();
    nextVid.play().then(() => {
        nextVid.classList.remove('opacity-0');   nextVid.classList.add('opacity-100');
        activeVid.classList.remove('opacity-100'); activeVid.classList.add('opacity-0');
        setTimeout(() => {
            activeVid.pause();
            activeVid.currentTime = 0;
            nextVid.dataset.transitioning = '0';
        }, 1100);
    }).catch(() => { nextVid.dataset.transitioning = '0'; });
}

/** 
 * Monitors the active video and triggers a cross-fade to the same source
 * about 1 second before it ends to create a smooth loop.
 */
function initLoopMonitoring() {
    setInterval(() => {
        const vid1 = document.getElementById('video-1');
        const vid2 = document.getElementById('video-2');
        if (!vid1 || !vid2) return;

        const activeVid = vid1.classList.contains('opacity-100') ? vid1 : vid2;
        const nextVid = vid1.classList.contains('opacity-100') ? vid2 : vid1;

        if (activeVid && activeVid.readyState >= 2 && !activeVid.paused) {
            const timeLeft = activeVid.duration - activeVid.currentTime;
            const isTransitioning = nextVid.dataset.transitioning === '1';
            
            // Trigger 1.2s before end to allow for 1s transition
            if (timeLeft < 1.2 && !isTransitioning) {
                const src = activeVid.getAttribute('data-src');
                if (src) {
                    crossFadeVideo(src, true);
                }
            }
        }
    }, 200);
}

// Start monitoring as soon as script loads (or after DOM is ready)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoopMonitoring);
} else {
    initLoopMonitoring();
}

/** Keep physics sim roughly in sync with chosen category+temp and apply instant clinical snapshot */
function syncPhysicsState(cat, temp) {
    // cat is 'resting', 'walking', 'running', 'heart', 'skin', 'eye'
    // temp is 'cold', 'normal', 'heat'
    const actMap = { resting: 'resting', walking: 'walking', running: 'sprinting', heart: 'resting', skin: 'resting', eye: 'resting' };
    const tempMap = { cold: -10, normal: 22, heat: 50 };
    
    const act = actMap[cat] || 'resting';
    const condition = temp;

    if (actMap[cat]) {
        setState(s => {
            s.inputs.activityLevel = act;
            s.inputs.ambientTemp   = tempMap[temp] || 22;
        });
    }

    // Instantly snap vitals to the clinical baseline for this condition + activity
    applyScenarioVitals(condition, act);
}



function RenderLandingPage() {
    return `
    <div class="relative h-full w-full flex items-center justify-center overflow-hidden bg-background fade-enter">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-100/80 via-background to-background"></div>

        <!-- Amrita Logo — bottom-left on all screen sizes -->
        <div class="absolute bottom-5 left-4 md:bottom-6 md:left-6 z-20 flex items-center gap-3">
            <img src="amrita_logo.jpg" alt="Amrita University"
                 class="h-9 md:h-14 w-auto object-contain drop-shadow-md transition-transform hover:scale-105"
                 style="max-width:150px">
        </div>

        <div class="relative z-10 text-center space-y-8 p-4">
            <div class="space-y-2">
                <h1 class="text-4xl md:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-500">
                    THERMOREGULATION SIMULATOR
                </h1>
            </div>

            <button onclick="handleStart()" 
                class="group relative inline-flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-lg font-bold tracking-wide overflow-hidden transition-all hover:scale-105 hover:shadow-[0_8px_30px_rgba(2,132,199,0.35)]">
                <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span>INITIALIZE SIMULATION</span>
                <i data-lucide="chevron-right" class="w-5 h-5 group-hover:translate-x-1 transition-transform"></i>
            </button>
        </div>
    </div>
    `;
}

function RenderSimulator() {
    return `
    <div id="simulator-root" class="h-screen w-full bg-background flex flex-col md:flex-row overflow-hidden relative fade-enter">

        <!-- BOTTOM/LEFT SIDEBAR -->
        <div id="nav-drawer" class="relative flex-shrink-0 w-full h-[35%] md:h-auto md:w-72 bg-white border-t md:border-t-0 md:border-r border-slate-200 z-30 flex flex-col order-2 md:order-1" style="min-height:0">

            <!-- Header -->
            <div class="flex flex-col gap-1 border-b border-slate-200 p-3 md:p-5 md:pb-4">
                <img src="amrita_logo.jpg" alt="Amrita University"
                     class="h-7 md:h-9 w-auto object-contain mb-1"
                     style="max-width:130px">

            </div>

            <!-- Drill-Down Menu Panel -->
            <div id="menu-panel" class="visible flex-[1_1_0%] overflow-y-auto custom-scrollbar p-3 md:p-4" style="min-height:0">
                <!-- Rendered by renderMenuPanel() -->
            </div>

        </div>

        <!-- TOP/RIGHT: VIDEO PLAYER AREA -->
        <div class="flex-1 relative overflow-hidden bg-slate-50 order-1 md:order-2" id="video-area">
            
            <!-- INSTRUCTIONS OVERLAY (Shown when no scenario is active) -->
            <div id="instructions-overlay" class="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-6 md:p-8 transition-opacity duration-700 opacity-100 z-10 overflow-y-auto bg-slate-50">
                <div class="max-w-2xl text-center space-y-6">
                    <div class="inline-flex items-center justify-center p-3 sm:p-4 bg-red-100 rounded-full mb-2 border border-red-200 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                        <i data-lucide="heart" class="w-6 h-6 sm:w-8 sm:h-8 fill-red-500 text-red-500 animate-heartbeat"></i>
                    </div>
                    <h2 class="text-2xl sm:text-3xl font-bold text-slate-800 tracking-wide">Thermoregulation Simulator</h2>
                    <p class="text-slate-600 text-sm sm:text-base leading-relaxed">
                        Select an <strong class="text-slate-800">Activity Level</strong> or <strong class="text-slate-800">Physiological View</strong> from the navigation menu, then choose an ambient temperature to observe how the human body reacts to different thermal stress levels.
                    </p>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left mt-8 w-full">
                        <div class="bg-white p-4 rounded-xl border border-blue-200 shadow-sm transition-transform hover:-translate-y-1">
                            <h3 class="text-blue-600 font-bold mb-2 flex items-center gap-2"><i data-lucide="snowflake" class="w-4 h-4"></i> Hypothermia</h3>
                            <p class="text-[11px] sm:text-xs text-slate-500 leading-relaxed">Occurs when the body loses heat faster than it can produce it, causing a dangerously low core temperature (below 35°C).</p>
                        </div>
                        <div class="bg-white p-4 rounded-xl border border-green-200 shadow-sm transition-transform hover:-translate-y-1">
                            <h3 class="text-green-600 font-bold mb-2 flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4"></i> Homeostasis</h3>
                            <p class="text-[11px] sm:text-xs text-slate-500 leading-relaxed">The state of steady internal, physical, and chemical conditions maintained by living systems, ideal core temp ~37°C.</p>
                        </div>
                        <div class="bg-white p-4 rounded-xl border border-red-200 shadow-sm transition-transform hover:-translate-y-1">
                            <h3 class="text-red-600 font-bold mb-2 flex items-center gap-2"><i data-lucide="flame" class="w-4 h-4"></i> Hyperthermia</h3>
                            <p class="text-[11px] sm:text-xs text-slate-500 leading-relaxed">An abnormally high body temperature caused by a failure of the heat-regulating mechanisms of the body (above 37.5°C).</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Dual-buffer video for cross-fade -->
            <video id="video-1" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-linear opacity-100" muted playsinline></video>
            <video id="video-2" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-linear opacity-0" muted playsinline></video>

            <!-- Medical corner frame -->
            <div class="absolute inset-2 md:inset-4 pointer-events-none hidden md:block">
                <div class="absolute top-0 left-0 w-5 h-5 border-l-2 border-t-2 border-primary/60 rounded-tl"></div>
                <div class="absolute top-0 right-0 w-5 h-5 border-r-2 border-t-2 border-primary/60 rounded-tr"></div>
                <div class="absolute bottom-0 left-0 w-5 h-5 border-l-2 border-b-2 border-primary/60 rounded-bl"></div>
                <div class="absolute bottom-0 right-0 w-5 h-5 border-r-2 border-b-2 border-primary/60 rounded-br"></div>
            </div>

            <!-- Status / Core Temp Gauge (top-right) -->
            <div class="absolute top-2 right-2 md:top-10 md:right-10 z-20 transition-opacity duration-500 scale-75 origin-top-right md:scale-100" id="status-gauge-container"></div>
        </div>

    </div>
    `;
}


function RenderBodyDisplay() {
    // Note: Video logic handlers will manage the src tags
    return `
    <div class="relative w-full h-full flex items-center justify-center overflow-hidden fade-enter">
        <div class="relative w-full h-full">
            <!-- Video Container -->
            <div id="video-wrapper" class="absolute inset-0 w-full h-full bg-slate-50">
                <video id="video-1" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-linear opacity-100" muted playsinline></video>
                <video id="video-2" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-linear opacity-0" muted playsinline></video>
            </div>

            <!-- Body-Part Image Overlay — two layers for cross-fade (shown for skin scenarios) -->
            <div id="img-wrapper" class="absolute inset-0 w-full h-full z-10 opacity-0 transition-opacity duration-700 ease-in-out pointer-events-none">
                <img id="img-layer-1" src="" alt="" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out opacity-100">
                <img id="img-layer-2" src="" alt="" class="absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out opacity-0">
            </div>

            <!-- Sweating Overlay -->
            <div id="sweat-overlay" class="absolute inset-0 bg-blue-400/10 mix-blend-overlay pointer-events-none opacity-0 transition-opacity duration-500">
                <div class="w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_70%)] animate-pulse-slow"></div>
            </div>

            <!-- Medical Frame -->
            <div class="absolute inset-4 pointer-events-none p-1">
                <div class="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary rounded-tl"></div>
                <div class="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-primary rounded-tr"></div>
                <div class="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-primary rounded-bl"></div>
                <div class="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary rounded-br"></div>
            </div>

            <!-- Status Gauge -->
            <div class="absolute top-8 right-8 md:top-12 md:right-12 z-20 transition-opacity duration-500" id="status-gauge-container">
                <!-- Injected via updateUI -->
            </div>
        </div>
    </div>
    `;
}

function RenderOrganSystems() {
    return `
    <div class="absolute inset-0 pt-20 pb-4 px-4 md:px-12 flex items-center justify-center fade-enter">
        <div class="w-full h-full max-w-6xl p-6 overflow-y-auto custom-scrollbar">
            <h2 class="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-widest border-b border-slate-200 pb-4">
                 <i data-lucide="activity" class="text-primary"></i> Physiological Systems Monitor
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="organs-grid">
                <!-- Cards injected via updateUI -->
            </div>
        </div>
    </div>
    `;
}

// ==========================================
// 5. UPDATE LOOPS & HANDLERS
// ==========================================

// Main UI Update Loop — only handles the live core-temp gauge and the live vitals showcase
function updateUI() {
    if (!state.ui.started) return;
    updateGauge();
    updateVitalsData();
}


function updateControlPanel() {
    const telemetry = document.getElementById('telemetry-data');
    if (telemetry) {
        const { heartRate, coreTemp, physiologicalState } = state.outputs;

        let tempColorClass = 'text-success drop-shadow-[0_0_3px_green]';
        if (coreTemp > 37.5) tempColorClass = 'text-danger drop-shadow-[0_0_3px_red]';
        if (coreTemp < 36.5) tempColorClass = 'text-primary drop-shadow-[0_0_3px_blue]';

        const { spO2, respiratoryRate, bloodPressureSystolic } = state.outputs;

        // Colour coding for SpO2
        let spO2Color = 'text-success';
        if (spO2 < 95) spO2Color = 'text-warning';
        if (spO2 < 90) spO2Color = 'text-danger';

        // Blood pressure colour
        let bpColor = 'text-success';
        if (bloodPressureSystolic < 90 || bloodPressureSystolic > 140) bpColor = 'text-danger';
        else if (bloodPressureSystolic < 100 || bloodPressureSystolic > 130) bpColor = 'text-warning';

        telemetry.innerHTML = `
             <div class="flex justify-between border-b border-slate-200 pb-1">
                <span>Heart Rate:</span>
                <span class="text-slate-800 font-mono animate-pulse">${Math.round(heartRate)} <span class="text-[10px] text-slate-400">BPM</span></span>
            </div>
            <div class="flex justify-between border-b border-slate-200 pb-1">
                <span>Resp. Rate:</span>
                <span class="text-slate-800 font-mono">${Math.round(respiratoryRate)} <span class="text-[10px] text-slate-400">br/min</span></span>
            </div>
            <div class="flex justify-between border-b border-slate-200 pb-1">
                <span>SpO2:</span>
                <span class="font-mono font-semibold ${spO2Color}">${Math.round(spO2)} <span class="text-[10px] text-slate-400">%</span></span>
            </div>
            <div class="flex justify-between border-b border-slate-200 pb-1">
                <span>Blood Pressure:</span>
                <span class="font-mono font-semibold ${bpColor}">${Math.round(bloodPressureSystolic)} <span class="text-[10px] text-slate-400">mmHg</span></span>
            </div>
            <div class="flex justify-between border-b border-slate-200 pb-1"><span>Vasodilation:</span> <span class="${physiologicalState.vasodilation ? 'text-slate-800 font-semibold' : 'text-slate-300'}">${physiologicalState.vasodilation ? 'ACTIVE' : 'OFF'}</span></div>
            <div class="flex justify-between border-b border-slate-200 pb-1"><span>Sweating:</span> <span class="${physiologicalState.sweating ? 'text-slate-800 font-semibold' : 'text-slate-300'}">${physiologicalState.sweating ? 'ACTIVE' : 'OFF'}</span></div>
            <div class="flex justify-between border-b border-slate-200 pb-1"><span>Shivering:</span> <span class="${physiologicalState.shivering ? 'text-amber-600 font-semibold' : 'text-slate-300'}">${physiologicalState.shivering ? 'ACTIVE' : 'OFF'}</span></div>
            <div class="flex justify-between pt-1"><span>Status:</span> <span class="text-slate-800 font-bold">${physiologicalState.status}</span></div>
        `;
    }

    const presets = document.getElementById('presets-container');
    if (presets && presets.children.length === 0) {
        // Render presets buttons once
        const acts = [
            { id: 'resting', label: 'Resting' },
            { id: 'walking', label: 'Walking' },
            { id: 'sprinting', label: 'Run' }
        ];

        presets.innerHTML = acts.map(act => `
            <div class="grid grid-cols-4 gap-2 items-center">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right pr-2">${act.label}</div>
                <button onclick="setSnapshot('${act.id}', -10)" class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 cold-btn" data-act="${act.id}">Hypothermia</button>
                <button onclick="setSnapshot('${act.id}', 22)" class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 norm-btn" data-act="${act.id}">Homeostasis</button>
                <button onclick="setSnapshot('${act.id}', 50)" class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 hot-btn" data-act="${act.id}">Hyperthermia</button>
            </div>
        `).join('');
    }

    // Update active highlight classes on preset buttons
    if (presets) {
        const btns = presets.querySelectorAll('button');
        btns.forEach(btn => {
            btn.className = "py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700";
            // Only highlight if physiological section is the active one
            if (state.ui.activeSection !== 'physiological') return;
            const act = btn.getAttribute('data-act');
            const type = btn.innerText;

            if (act === state.inputs.activityLevel) {
                if (type === 'Hypothermia' && state.inputs.ambientTemp === -10) {
                    btn.className = "py-2 px-1 rounded transition-all border bg-blue-500/20 border-blue-500 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]";
                }
                if (type === 'Homeostasis' && state.inputs.ambientTemp === 22) {
                    btn.className = "py-2 px-1 rounded transition-all border bg-green-500/20 border-green-500 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]";
                }
                if (type === 'Hyperthermia' && state.inputs.ambientTemp === 50) {
                    btn.className = "py-2 px-1 rounded transition-all border bg-red-500/20 border-red-500 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
                }
            }
        });
    }

    // ---- Body Part Scenarios Section ----
    const bodyPartPresets = document.getElementById('body-part-presets-container');
    if (bodyPartPresets && bodyPartPresets.children.length === 0) {
        // Render body part preset buttons once
        const bodyParts = [
            { id: 'heart', label: 'Heart' },
            { id: 'skin', label: 'Skin' },
            { id: 'eye', label: 'Eye' }
        ];

        bodyPartPresets.innerHTML = bodyParts.map(part => `
            <div class="grid grid-cols-4 gap-2 items-center">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right pr-2">${part.label}</div>
                <button onclick="setBodyPartSnapshot('${part.id}', 'cold')"   class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-blue-400  hover:text-blue-500  bp-cold-btn"  data-part="${part.id}">Hypothermia</button>
                <button onclick="setBodyPartSnapshot('${part.id}', 'normal')" class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-green-500 hover:text-green-600 bp-norm-btn"  data-part="${part.id}">Homeostasis</button>
                <button onclick="setBodyPartSnapshot('${part.id}', 'heat')"   class="py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-red-400   hover:text-red-500   bp-hot-btn"   data-part="${part.id}">Hyperthermia</button>
            </div>
        `).join('');
    }

    // Update active highlight classes on body part buttons
    if (bodyPartPresets) {
        const bpBtns = bodyPartPresets.querySelectorAll('button');
        bpBtns.forEach(btn => {
            btn.className = "py-2 px-1 rounded transition-all border bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700";
            // Only highlight if body part section is the active one
            if (state.ui.activeSection !== 'bodypart') return;
            const part = btn.getAttribute('data-part');
            const type = btn.innerText;

            if (state.ui.activeBodyPart === part) {
                if (type === 'Hypothermia' && state.ui.activeBodyPartState === 'cold') {
                    btn.className = "py-2 px-1 rounded transition-all border bg-blue-500/20 border-blue-500 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]";
                }
                if (type === 'Homeostasis' && state.ui.activeBodyPartState === 'normal') {
                    btn.className = "py-2 px-1 rounded transition-all border bg-green-500/20 border-green-500 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]";
                }
                if (type === 'Hyperthermia' && state.ui.activeBodyPartState === 'heat') {
                    btn.className = "py-2 px-1 rounded transition-all border bg-red-500/20 border-red-500 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.3)]";
                }
            }
        });
    }
}

function updateGauge() {
    const container = document.getElementById('status-gauge-container');
    if (!container) return;

    // Hide the capsule while the video is blank (no temperature scenario active)
    if (!menuState.temperature) {
        container.classList.add('opacity-0', 'pointer-events-none');
        container.classList.remove('opacity-100');
    } else {
        container.classList.remove('opacity-0', 'pointer-events-none');
        container.classList.add('opacity-100');
    }

    const { coreTemp, physiologicalState } = state.outputs;

    let colorClass = "text-emerald-400";
    let bgClass = "bg-emerald-500/20";
    let borderClass = "border-emerald-500/50";
    let glowClass = "shadow-[0_0_10px_rgba(52,211,153,0.3)]";
    let label = physiologicalState.status === 'Homeostasis Stable' ? 'STABLE' : physiologicalState.status.replace(' WARNING', '');

    if (coreTemp < 36.5) {
        colorClass = "text-blue-400";
        bgClass = "bg-blue-500/20";
        borderClass = "border-blue-500/50";
        glowClass = "shadow-[0_0_10px_rgba(96,165,250,0.3)]";
    }
    if (coreTemp > 37.5) {
        colorClass = "text-red-400";
        bgClass = "bg-red-500/20";
        borderClass = "border-red-500/50";
        glowClass = "shadow-[0_0_10px_rgba(248,113,113,0.3)]";
    }

    // Check mount vs update
    if (container.children.length === 0) {
        container.innerHTML = `
        <div id="gauge-wrapper" class="flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border transition-colors duration-500 bg-white/90 ${borderClass} ${glowClass}">
            <div id="gauge-icon-bg" class="p-1.5 rounded-full ${bgClass}">
                <i id="gauge-icon" data-lucide="thermometer" class="w-4 h-4 transition-colors duration-500 ${colorClass}"></i>
            </div>
            <div class="flex flex-col">
                <div class="flex items-baseline gap-1">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">CORE</span>
                </div>
                <div class="flex items-baseline gap-0.5">
                    <span id="gauge-temp" class="text-2xl font-mono font-bold leading-none tabular-nums transition-colors duration-500 ${colorClass}">
                        ${coreTemp.toFixed(1)}
                    </span>
                    <span class="text-xs text-slate-400 font-medium">°C</span>
                </div>
            </div>
            <div class="hidden sm:block h-8 w-px bg-slate-200 mx-1"></div>
            <div class="hidden sm:flex flex-col justify-center">
                <span id="gauge-label" class="text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${colorClass}">
                    ${label}
                </span>
                <span class="text-[9px] text-slate-400 uppercase tracking-wider">Condition</span>
            </div>
        </div>
        `;
        initIcons();
    } else {
        // Update existing
        const elWrapper = document.getElementById('gauge-wrapper');
        if (elWrapper) elWrapper.className = `flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border transition-colors duration-500 bg-white/90 ${borderClass} ${glowClass}`;

        const elIconBg = document.getElementById('gauge-icon-bg');
        if (elIconBg) elIconBg.className = `p-1.5 rounded-full ${bgClass}`;

        const elIcon = document.getElementById('gauge-icon');
        if (elIcon) elIcon.className = `w-4 h-4 transition-colors duration-500 ${colorClass}`;

        const elTemp = document.getElementById('gauge-temp');
        if (elTemp) {
            elTemp.innerText = coreTemp.toFixed(1);
            elTemp.className = `text-2xl font-mono font-bold leading-none tabular-nums transition-colors duration-500 ${colorClass}`;
        }

        const elLabel = document.getElementById('gauge-label');
        if (elLabel) {
            elLabel.innerText = label;
            elLabel.className = `text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${colorClass}`;
        }
    }
}

function updateVitalsData() {
    const showcase = document.getElementById('vitals-showcase');
    // Only update if the showcase is currently visible on screen
    if (!showcase || showcase.classList.contains('hidden')) return;

    const { coreTemp, heartRate, physiologicalState, respiratoryRate } = state.outputs;
    const isNormal = !physiologicalState.vasoconstriction && !physiologicalState.vasodilation;

    // Derived values
    const brainStatus = isNormal ? 'MONITORING' : coreTemp > 37.5 ? 'INITIATE COOLING' : 'PRESERVE HEAT';
    const brainColor = isNormal ? 'text-green-500' : coreTemp > 37.5 ? 'text-red-500' : 'text-blue-500';
    const co = ((heartRate * 70) / 1000).toFixed(1);
    
    // Sweat logic
    const sweatText = physiologicalState.sweating ? 'ACTIVE' : 'IDLE';
    
    // Capillaries logic
    let capText = 'NORMAL';
    if (physiologicalState.vasoconstriction) capText = 'CONSTRICTED';
    if (physiologicalState.vasodilation) capText = 'DILATED';
    
    // Shivering
    const shiverText = physiologicalState.shivering ? 'ACTIVE' : 'INACTIVE';
    const shiverDesc = physiologicalState.shivering 
        ? "Rapid muscle contractions generating heat." 
        : "Normal muscle tone. No additional heat generation.";
        
    // Respiratory
    const rr = Math.max(12, Math.round(respiratoryRate || heartRate / 4));
    let rrDesc = "Eupnea (Normal breathing).";
    if (rr > 20) rrDesc = "Tachypnea (Increased rate).";
    if (rr < 12) rrDesc = "Bradypnea (Decreased rate).";

    // First mount
    if (showcase.children.length === 0) {
        showcase.innerHTML = `
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 px-1 border-b border-slate-200 pb-1 flex items-center gap-1.5">
            <i data-lucide="activity" class="w-3 h-3 text-primary"></i> Physiological Systems
        </div>

        <!-- HYPOTHALAMUS -->
        <div class="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden text-slate-600 shadow-sm">
            <div class="absolute top-1 right-1 p-1 opacity-5"><i data-lucide="brain" class="w-10 h-10 text-slate-800"></i></div>
            <h3 class="text-[10px] font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase"><i data-lucide="brain" class="w-3 h-3 text-cyan-500"></i> HYPOTHALAMUS</h3>
            <div class="space-y-1 text-[10px] font-mono">
                <div class="flex justify-between"><span class="text-slate-500">Command:</span> <span id="v-brain-status" class="${brainColor} font-bold">${brainStatus}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Set Point:</span> <span class="text-slate-800 font-semibold">37.0°C</span></div>
                <div class="pt-1.5 mt-1.5 border-t border-slate-100">
                    <span class="text-[9px] text-slate-500 uppercase block mb-1">Efferent Signals</span>
                    <span class="inline-block px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 text-[9px] font-semibold">Basal Tone</span>
                </div>
            </div>
        </div>

        <!-- CARDIOVASCULAR -->
        <div class="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden text-slate-600 shadow-sm">
             <div class="absolute top-1 right-1 p-1 opacity-5"><i data-lucide="activity" class="w-10 h-10 text-slate-800"></i></div>
             <h3 class="text-[10px] font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase"><i data-lucide="activity" class="w-3 h-3 text-red-500"></i> CARDIOVASCULAR</h3>
             <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                    <i data-lucide="heart" class="w-4 h-4 text-red-500"></i>
                </div>
                <div><div id="v-heart-rate" class="text-xl font-bold text-slate-800 font-mono leading-none">${Math.round(heartRate)}</div><div class="text-[8px] text-slate-500 uppercase tracking-wider">BPM</div></div>
             </div>
             <div class="space-y-1 text-[10px] font-mono border-t border-slate-100 pt-1.5">
                <div class="flex justify-between"><span class="text-slate-500">Cardiac Output:</span> <span id="v-cardiac-output" class="text-slate-800 font-semibold">${co} L/min</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Peripheral Flow:</span> <span class="text-slate-800 font-semibold">Normal</span></div>
             </div>
        </div>

         <!-- SKIN / SUDOMOTOR -->
        <div class="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden text-slate-600 shadow-sm">
             <div class="absolute top-1 right-1 p-1 opacity-5"><i data-lucide="droplets" class="w-10 h-10 text-slate-800"></i></div>
             <h3 class="text-[10px] font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase"><i data-lucide="droplets" class="w-3 h-3 text-cyan-500"></i> SKIN / SUDOMOTOR</h3>
             <div class="grid grid-cols-2 gap-1.5 mb-1.5">
                <div class="p-1.5 rounded bg-slate-50 border border-slate-200">
                    <div class="text-[8px] text-slate-500 mb-0.5 uppercase">Sweat Glands</div>
                    <div id="v-sweat-status" class="font-bold text-[10px] text-slate-800">${sweatText}</div>
                </div>
                <div class="p-1.5 rounded bg-slate-50 border border-slate-200">
                    <div class="text-[8px] text-slate-500 mb-0.5 uppercase">Capillaries</div>
                    <div id="v-cap-status" class="font-bold text-[10px] text-slate-800 uppercase">${capText}</div>
                </div>
             </div>
             <div class="flex justify-between text-[9px] font-mono mt-1 pt-1 border-t border-slate-100">
                 <span class="text-slate-500">Evaporation Rate:</span>
                 <span class="text-slate-600 font-semibold">Basal</span>
             </div>
        </div>

        <!-- MUSCLES -->
        <div class="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden text-slate-600 shadow-sm">
             <div class="absolute top-1 right-1 p-1 opacity-5"><i data-lucide="zap" class="w-10 h-10 text-slate-800"></i></div>
             <h3 class="text-[10px] font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase"><i data-lucide="zap" class="w-3 h-3 text-yellow-500"></i> MUSCLES</h3>
             <div class="flex items-center gap-2 mb-1.5">
                <div id="v-shiver-dot" class="w-2 h-2 rounded-full ${physiologicalState.shivering ? 'bg-amber-500 animate-ping' : 'bg-slate-300'}"></div>
                <span class="font-mono text-[10px] text-slate-500 flex-1">Shivering: <span id="v-shiver-status" class="font-bold text-slate-800 ml-1">${shiverText}</span></span>
             </div>
             <div id="v-shiver-desc" class="text-[9px] text-slate-500 leading-tight">
                 ${shiverDesc}
             </div>
        </div>

        <!-- LUNGS -->
        <div class="bg-white border border-slate-200 rounded-lg p-3 relative overflow-hidden text-slate-600 shadow-sm">
             <div class="absolute top-1 right-1 p-1 opacity-5"><i data-lucide="wind" class="w-10 h-10 text-slate-800"></i></div>
             <h3 class="text-[10px] font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase"><i data-lucide="wind" class="w-3 h-3 text-sky-500"></i> RESPIRATORY</h3>
             <div class="flex items-baseline gap-1.5 mb-1">
                <div id="v-resp-rate" class="text-xl font-bold text-slate-800 font-mono leading-none">${rr}</div>
                <div class="text-[8px] text-slate-500 uppercase tracking-wider">Breaths / min</div>
             </div>
             <div id="v-resp-desc" class="text-[9px] text-slate-500 leading-tight border-t border-slate-100 pt-1.5 mt-1">
                 ${rrDesc}
             </div>
        </div>
        `;
        initIcons();
    } else {
        // Update Existing Elements (Fast Path)
        const elBrain = document.getElementById('v-brain-status');
        if (elBrain) { elBrain.innerText = brainStatus; elBrain.className = brainColor; }

        const elBPM = document.getElementById('v-heart-rate');
        if (elBPM) elBPM.innerText = Math.round(heartRate);
        const elCO = document.getElementById('v-cardiac-output');
        if (elCO) elCO.innerText = `${co} L/min`;

        const elSweatStat = document.getElementById('v-sweat-status');
        if (elSweatStat) elSweatStat.innerText = sweatText;
        
        const elCapStat = document.getElementById('v-cap-status');
        if (elCapStat) elCapStat.innerText = capText;

        const elShivDot = document.getElementById('v-shiver-dot');
        if (elShivDot) elShivDot.className = `w-2 h-2 rounded-full ${physiologicalState.shivering ? 'bg-amber-500 animate-ping' : 'bg-slate-300'}`;
        const elShivStat = document.getElementById('v-shiver-status');
        if (elShivStat) elShivStat.innerText = shiverText;
        const elShivDesc = document.getElementById('v-shiver-desc');
        if (elShivDesc) elShivDesc.innerText = shiverDesc;

        const elRR = document.getElementById('v-resp-rate');
        if (elRR) elRR.innerText = rr;
        const elRRDesc = document.getElementById('v-resp-desc');
        if (elRRDesc) elRRDesc.innerText = rrDesc;
    }
}

// ==========================================
// 6. GLOBAL FUNCTIONS (Event Handlers)
// ==========================================

window.handleStart = function () {
    setState(s => s.ui.started = true);
    startSimulation(); // Start loop
};

window.handleBack = function () {
    setState(s => {
        s.ui.showNav = false;
        s.ui.activeSection = null;
        s.ui.activeBodyPart = null;
        s.ui.activeBodyPartState = null;
        s.ui.activeTab = 'body';
    });

    // Clear video cache so thermoregulation_home.mp4 plays immediately
    const wrapper = document.getElementById('video-wrapper');
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    if (wrapper) wrapper.dataset.currentSrc = '';
    if (vid1) vid1.dataset.transitioning = '0';
    if (vid2) vid2.dataset.transitioning = '0';

    // Hide body-part image overlay if visible
    hideBodyPartImage();
};

window.toggleNav = function (show) {
    setState(s => s.ui.showNav = show);
};

window.toggleControls = function (show) {
    setState(s => s.ui.showControls = show);
};

window.setTab = function (tabName) {
    setState(s => {
        s.ui.activeTab = tabName;
        s.ui.showNav = false;
        // If coming from the home screen (no active section), activate the
        // physiological section so that videos/gauge render correctly.
        if (!s.ui.activeSection) {
            s.ui.activeSection = 'physiological';
        }
    });

    // When switching BACK to body view, clear the video-wrapper cache so that
    // restoreBodyViewVideo() (called after DOM re-creation) always triggers a
    // fresh play of the correct video.
    if (tabName === 'body') {
        const wrapper = document.getElementById('video-wrapper');
        const vid1 = document.getElementById('video-1');
        const vid2 = document.getElementById('video-2');
        if (wrapper) wrapper.dataset.currentSrc = '';
        if (vid1) vid1.dataset.transitioning = '0';
        if (vid2) vid2.dataset.transitioning = '0';
    }
};

// ---- Clinical vital snapshot lookup ----
// condition: 'cold' | 'normal' | 'heat'
// activity:  'resting' | 'walking' | 'sprinting'
function applyScenarioVitals(condition, activity) {
    // Base clinical values per condition (resting baseline)
    const base = {
        cold: {
            coreTemp: 34.0,
            heartRate: 95,
            spO2: 94,
            respiratoryRate: 22,
            bloodPressureSystolic: 90,
            shivering: true,
            sweating: false,
            vasoconstriction: true,
            vasodilation: false,
            status: 'HYPOTHERMIA WARNING'
        },
        normal: {
            coreTemp: 37.0,
            heartRate: 70,
            spO2: 99,
            respiratoryRate: 15,
            bloodPressureSystolic: 120,
            shivering: false,
            sweating: false,
            vasoconstriction: false,
            vasodilation: false,
            status: 'Homeostasis Stable'
        },
        heat: {
            coreTemp: 39.5,
            heartRate: 105,
            spO2: 97,
            respiratoryRate: 24,
            bloodPressureSystolic: 105,
            shivering: false,
            sweating: true,
            vasoconstriction: false,
            vasodilation: true,
            status: 'Heat Stress'
        }
    };

    // Walking-specific overrides (exact clinical values, not offsets)
    const walkingOverrides = {
        cold: { coreTemp: 35.0, heartRate: 115, respiratoryRate: 26 },
        normal: { coreTemp: 37.5, heartRate: 110, respiratoryRate: 22 },
        heat: { coreTemp: 40.0, heartRate: 135, respiratoryRate: 30 },
    };

    // Sprinting-specific overrides (exact clinical values, not offsets)
    const sprintingOverrides = {
        cold: { coreTemp: 35.5, heartRate: 155, respiratoryRate: 45 },
        normal: { coreTemp: 38.5, heartRate: 150, respiratoryRate: 40 },
        heat: { coreTemp: 40.5, heartRate: 180, respiratoryRate: 50 },
    };

    const v = base[condition];
    if (!v) return;
    const act = activity || 'resting';

    // Pick coreTemp, heartRate, respiratoryRate — use activity-specific overrides if applicable
    const wo = act === 'walking' ? walkingOverrides[condition]
        : act === 'sprinting' ? sprintingOverrides[condition]
            : null;

    setState(s => {
        s.outputs.coreTemp = wo ? wo.coreTemp : v.coreTemp;
        s.outputs.heartRate = wo ? wo.heartRate : v.heartRate;
        s.outputs.spO2 = v.spO2;
        s.outputs.respiratoryRate = wo ? wo.respiratoryRate : v.respiratoryRate;
        s.outputs.bloodPressureSystolic = v.bloodPressureSystolic;
        s.outputs.physiologicalState = {
            shivering: v.shivering,
            sweating: v.sweating,
            vasoconstriction: v.vasoconstriction,
            vasodilation: v.vasodilation,
            status: v.status
        };
    });
}

window.setSnapshot = function (act, temp) {
    // Map ambient temp to condition
    const condition = temp <= 0 ? 'cold' : temp >= 40 ? 'heat' : 'normal';

    setState(s => {
        s.inputs.activityLevel = act;
        s.inputs.ambientTemp = temp;
        s.ui.showControls = false;
        s.ui.activeSection = 'physiological';
        s.ui.activeBodyPart = null;
        s.ui.activeBodyPartState = null;
    });

    // Snap vitals instantly to the clinical baseline for this condition + activity
    applyScenarioVitals(condition, act);

    // Hide skin image overlay so the video can show through
    hideBodyPartImage();

    // Clear the cached video src and any in-flight transition guards so the
    // activity video always switches immediately on the very first click,
    // even if a body-part transition was still running.
    const wrapper = document.getElementById('video-wrapper');
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    if (wrapper) wrapper.dataset.currentSrc = '';
    if (vid1) vid1.dataset.transitioning = '0';
    if (vid2) vid2.dataset.transitioning = '0';
};

// ---------- restore body-view video/image after tab switch-back ----------
// Called after the body display DOM is freshly created (e.g. returning from
// the Organ Systems tab). Reads current state and immediately plays the
// correct video/image without touching any state fields.
function restoreBodyViewVideo() {
    const portrait = isPortrait();
    const { activeSection, activeBodyPart, activeBodyPartState } = state.ui;

    if (activeSection === 'bodypart' && activeBodyPart && activeBodyPartState) {
        // Re-play the body-part video/image that was active before the tab switch.
        // Reuse setBodyPartSnapshot logic without duplicating state changes — just
        // call the video-routing portion directly.
        const part = activeBodyPart;
        const thermalState = activeBodyPartState;

        if (part === 'heart') {
            if (portrait) {
                if (thermalState === 'cold') playVideoSrc('android/Heart_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Heart_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Heart_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/Heart_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/Heart_homeostasis.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/Heart_hyperthermia.mp4');
            }
        } else if (part === 'skin') {
            if (portrait) {
                if (thermalState === 'cold') playVideoSrc('android/Hand_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Hand_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Hand_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/Hand_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/Hand_vasodilation.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/Hand_hyperthermia.mp4');
            }
        } else if (part === 'eye') {
            if (portrait) {
                if (thermalState === 'cold') playVideoSrc('android/Eye_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Eye_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Eye_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/eye_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/eye_hyperthermia.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/eye_homeostasis.mp4');
            }
        }
    } else if (activeSection === 'physiological') {
        // Let updateBodyView() handle the physiological video — just force it
        // to re-evaluate by calling it. The cache was already cleared in setTab.
        updateBodyView();
    }
    // If no section is active the default home video will play via updateBodyView().
}

// ---------- shared video-switch helper ----------
function playVideoSrc(targetSrc) {
    const vid1 = document.getElementById('video-1');
    const vid2 = document.getElementById('video-2');
    const wrapper = document.getElementById('video-wrapper');
    if (!vid1 || !vid2 || !wrapper) return;

    // Hide image overlay if visible
    hideBodyPartImage();

    // If the same video is already playing, do nothing
    if (wrapper.dataset.currentSrc === targetSrc) return;
    wrapper.dataset.currentSrc = targetSrc;

    const activeIs1 = vid1.classList.contains('opacity-100');
    const activeVid = activeIs1 ? vid1 : vid2;
    const nextVid = activeIs1 ? vid2 : vid1;

    if (nextVid.dataset.transitioning === '1') return;
    nextVid.dataset.transitioning = '1';
    setTimeout(() => { nextVid.dataset.transitioning = '0'; }, 2000);

    nextVid.src = targetSrc;
    nextVid.load();
    nextVid.play().then(() => {
        nextVid.classList.remove('opacity-0');
        nextVid.classList.add('opacity-100');
        activeVid.classList.remove('opacity-100');
        activeVid.classList.add('opacity-0');
        setTimeout(() => {
            activeVid.pause();
            activeVid.currentTime = 0;
            nextVid.dataset.transitioning = '0';
        }, 1000);
    }).catch(e => {
        nextVid.dataset.transitioning = '0';
        console.log('Video play failed', e);
    });
}

// ---------- image overlay helpers ----------
function showBodyPartImage(src) {
    const wrapper = document.getElementById('img-wrapper');
    const img1 = document.getElementById('img-layer-1');
    const img2 = document.getElementById('img-layer-2');
    if (!wrapper || !img1 || !img2) return;

    // Which layer is the current solid background?
    const activeIs1 = img1.classList.contains('opacity-100');
    const activeImg = activeIs1 ? img1 : img2;
    const nextImg = activeIs1 ? img2 : img1;

    // If same image is already fully shown, do nothing
    if (activeImg.src.endsWith(src) && wrapper.classList.contains('opacity-100')) return;

    // Load new image into the hidden back layer
    nextImg.src = src;

    // Make the wrapper visible on first call (no-op if already visible)
    wrapper.classList.remove('opacity-0');
    wrapper.classList.add('opacity-100');

    // Double rAF so the browser has painted nextImg at opacity-0 before we start
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // Fade NEW image IN — activeImg stays at opacity-100 (solid backdrop)
            nextImg.classList.remove('opacity-0');
            nextImg.classList.add('opacity-100');

            // Only hide the OLD image AFTER the fade-in is complete (700 ms)
            // so there is never a gap where both layers are semi-transparent
            setTimeout(() => {
                activeImg.classList.remove('opacity-100');
                activeImg.classList.add('opacity-0');
            }, 700);
        });
    });
}

function hideBodyPartImage() {
    const wrapper = document.getElementById('img-wrapper');
    if (!wrapper) return;
    wrapper.classList.remove('opacity-100');
    wrapper.classList.add('opacity-0');
}

// Body Part Scenarios handler
window.setBodyPartSnapshot = function (part, thermalState) {
    setState(s => {
        s.ui.activeBodyPart = part;
        s.ui.activeBodyPartState = thermalState;
        s.ui.showControls = false;
        // Deselect physiological panel
        s.ui.activeSection = 'bodypart';
        // Switch to body view so the video element is visible
        s.ui.activeTab = 'body';
    });

    // Snap vitals to the clinical baseline for this body-part condition
    applyScenarioVitals(thermalState, 'resting');

    // Small delay to allow tab-switch + DOM render before touching video/image elements
    setTimeout(() => {
        const portrait = isPortrait();

        // --- Heart video mapping ---
        if (part === 'heart') {
            if (portrait) {
                if (thermalState === 'cold') playVideoSrc('android/Heart_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Heart_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Heart_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/Heart_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/Heart_homeostasis.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/Heart_hyperthermia.mp4');
            }
        }

        // --- Skin mapping ---
        else if (part === 'skin') {
            if (portrait) {
                // Always play android video in portrait (no image overlay)
                if (thermalState === 'cold') playVideoSrc('android/Hand_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Hand_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Hand_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/Hand_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/Hand_vasodilation.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/Hand_hyperthermia.mp4');
            }
        }

        // --- Eye mapping ---
        else if (part === 'eye') {
            if (portrait) {
                if (thermalState === 'cold') playVideoSrc('android/Eye_hypothermia_android.mp4');
                else if (thermalState === 'normal') playVideoSrc('android/Eye_homeostasis_android.mp4');
                else if (thermalState === 'heat') playVideoSrc('android/Eye_hyperthermia_android.mp4');
            } else {
                if (thermalState === 'cold') playVideoSrc('desktop/eye_hypothermia.mp4');
                else if (thermalState === 'normal') playVideoSrc('desktop/eye_hyperthermia.mp4');
                else if (thermalState === 'heat') playVideoSrc('desktop/eye_homeostasis.mp4');
            }
        }
    }, 50);
};

// ==========================================
// 7. INITIALIZATION
// ==========================================

function initVideoPlayer() {
    const v1 = document.getElementById('video-1');
    const v2 = document.getElementById('video-2');
    if (!v1 || !v2) return;

    v1.play().catch(e => console.log('Init play fail', e));

    // Cross-fade loop handler:
    // When a video is ~1.5 s from its end, seamlessly cross-fade into a
    // fresh copy of the same video playing from the beginning on the other layer.
    const loopHandler = function (e) {
        const activeVid = e.target;
        const buffer = 1.5;
        if (!activeVid.duration || activeVid.currentTime < activeVid.duration - buffer) return;
        if (activeVid.dataset.looping === '1') return; // already mid-loop

        // Only cross-fade-loop for videos that are actually visible (opacity-100)
        if (!activeVid.classList.contains('opacity-100')) return;

        const nextVid = activeVid === v1 ? v2 : v1;
        if (nextVid.dataset.transitioning === '1') return;

        activeVid.dataset.looping = '1';
        nextVid.dataset.transitioning = '1';

        // Load the same source from the start into the hidden layer
        nextVid.src = activeVid.src;
        nextVid.load();
        nextVid.currentTime = 0;
        nextVid.play().then(() => {
            // Cross-fade: bring next in, fade active out
            nextVid.classList.remove('opacity-0');
            nextVid.classList.add('opacity-100');
            activeVid.classList.remove('opacity-100');
            activeVid.classList.add('opacity-0');

            setTimeout(() => {
                activeVid.pause();
                activeVid.currentTime = 0;
                activeVid.dataset.looping = '0';
                nextVid.dataset.transitioning = '0';
            }, 1000);
        }).catch(() => {
            // Fallback: just restart in place
            activeVid.currentTime = 0;
            activeVid.dataset.looping = '0';
            nextVid.dataset.transitioning = '0';
        });
    };

    v1.addEventListener('timeupdate', loopHandler);
    v2.addEventListener('timeupdate', loopHandler);

    // ---- Orientation Change Handler ----
    // When the viewport switches between landscape and portrait (or vice
    // versa) we need to reload the correct video variant.  We watch the
    // video-wrapper element with a ResizeObserver so this works both in
    // the DevTools device emulator and on real devices.
    let _lastPortrait = isPortrait();
    const _orientObserver = new ResizeObserver(() => {
        const nowPortrait = isPortrait();
        if (nowPortrait === _lastPortrait) return; // no orientation flip — skip
        _lastPortrait = nowPortrait;

        // Force a full video refresh by clearing the cached src.
        // updateBodyView() will then pick the correct landscape / portrait
        // file on its very next tick.
        const wrapper = document.getElementById('video-wrapper');
        const vid1el = document.getElementById('video-1');
        const vid2el = document.getElementById('video-2');
        if (wrapper) wrapper.dataset.currentSrc = '';
        if (vid1el) vid1el.dataset.transitioning = '0';
        if (vid2el) vid2el.dataset.transitioning = '0';
    });

    const wrapperEl = document.getElementById('video-wrapper');
    if (wrapperEl) _orientObserver.observe(wrapperEl);
}

function initDragHandlers() {
    // Close panels when clicking anywhere outside them
    document.addEventListener('click', function (e) {
        // ------- Nav panel -------
        if (state.ui.showNav) {
            const navDrawer = document.getElementById('nav-drawer');
            const navHandle = document.getElementById('nav-handle');
            // If the click is NOT inside the nav drawer AND NOT on the nav handle, close it
            if (navDrawer && !navDrawer.contains(e.target) &&
                navHandle && !navHandle.contains(e.target)) {
                setState(s => s.ui.showNav = false);
            }
        }

        // ------- Controls panel -------
        if (state.ui.showControls) {
            const controlPanel = document.getElementById('control-panel');
            const controlsHandle = document.getElementById('controls-handle');
            // If the click is NOT inside the control panel AND NOT on the controls handle, close it
            if (controlPanel && !controlPanel.contains(e.target) &&
                controlsHandle && !controlsHandle.contains(e.target)) {
                setState(s => s.ui.showControls = false);
            }
        }
    }, true); // use capture so it fires before child handlers
}

// Start Render Loop
setInterval(updateUI, 100);

// Initial Render
renderApp();
startSimulation();
