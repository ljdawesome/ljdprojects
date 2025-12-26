"use strict";

/*************************************************
 * Helpers
 *************************************************/
const $ = (sel) => document.querySelector(sel);
const clamp0 = (n) => Math.max(0, Number(n) || 0);
const STRICT_QUESTION_VALIDATION = false;

function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid() {
  return crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const isHost = new URLSearchParams(location.search).get("host") === "true";

let projectorTimerTickerId = null;

function clampInt(n, min, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function formatClock(msRemaining) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

function getTimerRemainingMs() {
  if (!state?.timer?.running) return 0;
  const endsAt = Number(state?.timer?.endsAtMs) || 0;
  if (!endsAt) return 0;
  return endsAt - Date.now();
}

function renderProjectorTimer() {
  const el = document.getElementById("projectorTimer");
  if (!el) return;

  const quizCard = document.querySelector('.quiz-card');

  // Only projector shows the digital clock.
  const isProj = document.body.classList.contains("projector");
  if (!isProj) {
    el.classList.add("hidden");
    el.textContent = "";
    if (quizCard) quizCard.classList.remove('timer-active');
    return;
  }

  if (state?.timer?.running && Number(state?.timer?.endsAtMs) > 0) {
    const remaining = getTimerRemainingMs();
    el.textContent = remaining > 0 ? formatClock(remaining) : "Time's Up!";
    el.classList.remove("hidden");
    if (quizCard) quizCard.classList.add('timer-active');
  } else {
    el.classList.add("hidden");
    el.textContent = "";
    if (quizCard) quizCard.classList.remove('timer-active');
  }
}

function ensureProjectorTimerTicker() {
  const isProj = document.body.classList.contains("projector");
  if (!isProj) return;

  if (projectorTimerTickerId != null) return;
  projectorTimerTickerId = window.setInterval(() => {
    renderProjectorTimer();
  }, 250);
}

/* =========================
   Question Bank Loader
========================= */

async function loadSelectedQuestionBank() {
  const select = document.getElementById("bankSelect");
  const filename = select?.value || "questions.json";

  if (location.protocol === "file:") {
    throw new Error(
      "This app must be served over http(s) (not opened as a local file). " +
      "If you're using WAMP, open: http://localhost/ljdprojects/trivianights/"
    );
  }

  const url = `data/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load question bank (${res.status} ${res.statusText}) from ${url}`);
  }

  return await res.json();
}


/*************************************************
 * QUESTION BANK VALIDATION
 *************************************************/

const ALLOWED_DIFFICULTIES = [
  "medium",
  "hard",
  "very-hard",
  "christmas-hard"
];

const REQUIRED_DISTRIBUTION = {
  medium: 2,
  hard: 3,
  "very-hard": 3,
  "christmas-hard": 2
};

const PRESETS = {
  short: { min: 1, max: 2 },
  standard: { min: 2, max: 3 },
  long: { min: 3, max: 4 }
};


function validateQuestionBank(bank) {
  const errors = [];

  if (!Array.isArray(bank) || bank.length === 0) {
    errors.push("Question bank is empty or not an array.");
    return errors;
  }

  // Group by category
  const byCategory = {};
  for (const q of bank) {
    if (!byCategory[q.category]) byCategory[q.category] = [];
    byCategory[q.category].push(q);
  }

  for (const [category, questions] of Object.entries(byCategory)) {

    // ---- Count distribution ----
    const counts = {
      medium: 0,
      hard: 0,
      "very-hard": 0,
      "christmas-hard": 0
    };

    for (const q of questions) {

      // ---- Required fields ----
      if (!q.id) errors.push(`[${category}] Question missing id.`);
      if (!q.question) errors.push(`[${category}] Question text missing.`);
      if (!q.answer) errors.push(`[${category}] Answer missing.`);
      if (!q.hostNotes) errors.push(`[${category}] Host notes missing.`);
      if (!q.type) errors.push(`[${category}] Question type missing.`);

      // ---- Difficulty ----
      if (!ALLOWED_DIFFICULTIES.includes(q.difficulty)) {
        errors.push(
          `[${category}] Invalid difficulty "${q.difficulty}".`
        );
        continue;
      }

      counts[q.difficulty]++;

      // ---- Christmas rules ----
      if (q.difficulty === "christmas-hard" && q.christmas !== true) {
        errors.push(
          `[${category}] Christmas-hard question must have christmas=true.`
        );
      }

      if (q.christmas === true && q.difficulty !== "christmas-hard") {
        errors.push(
          `[${category}] christmas=true requires difficulty=christmas-hard.`
        );
      }

      // ---- Numeric rules ----
      if (q.type === "numeric" && !q.numericRule) {
        errors.push(
          `[${category}] Numeric question missing numericRule.`
        );
      }

      // ---- Media rules ----
      if (q.type === "media") {
        if (!q.media) {
          errors.push(
            `[${category}] Media question missing media object.`
          );
        } else {
          if (!q.media.type || !q.media.src) {
            errors.push(
              `[${category}] Media must have type and src.`
            );
          }
        }
      }
    }

    // ---- Distribution enforcement ----
    for (const [difficulty, required] of Object.entries(REQUIRED_DISTRIBUTION)) {
      if (counts[difficulty] !== required) {
        errors.push(
          `[${category}] Expected ${required} ${difficulty} questions, found ${counts[difficulty]}.`
        );
      }
    }

    // ---- Total count ----
    if (questions.length !== 10) {
      errors.push(
        `[${category}] Expected 10 questions, found ${questions.length}.`
      );
    }
  }

  return errors;
}

function renderCategoryConfig(bank) {
  const wrap = document.getElementById("categoryConfig");
  if (!wrap) return;

  wrap.innerHTML = "";

  const categories = [...new Set(bank.map(q => q.category))];

  categories.forEach(cat => {
    const row = document.createElement("div");
    row.className = "category-row";

    row.innerHTML = `
      <span>${cat}</span>
      <input type="number"
             min="0"
             max="10"
             value="10"
             data-category="${cat}">
    `;

    wrap.appendChild(row);
  });
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  const inputs = document.querySelectorAll("#categoryConfig input");

  inputs.forEach((input, index) => {
    // Alternate min/max to distribute totals evenly
    const value = index % 2 === 0 ? preset.min : preset.max;
    input.value = value;
  });
}


/*************************************************
 * Host -> Projector sync (BroadcastChannel + localStorage fallback)
 *************************************************/

if (!isHost) {
  document.body.classList.add("projector");
}

const modeLabel = document.getElementById("modeLabel");
if (modeLabel) {
  modeLabel.textContent = isHost ? "Host Mode" : "Projector Mode";
}

const CHANNEL_NAME = "trivia_night_sync_v1";
const STORAGE_KEY = "trivia_night_state_v1";
const bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL_NAME) : null;

function publishState() {
  if (!isHost) return;
  const payload = { v: 1, ts: Date.now(), state };
  if (bc) bc.postMessage(payload);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
}

function requestInitialStateFromStorage() {
  const payload = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
  if (payload?.state) applyIncomingStateForce(payload.state);
}

function applyIncomingState(inState) {
  if (isHost) return;
  applyIncomingStateForce(inState);
}

function applyIncomingStateForce(inState) {
  state = sanitiseState(inState);
  renderAll();
}

function sanitiseMedia(m) {
  if (!m) return null;

  // Accept either `media: { ... }` or `media: [ { ... }, ... ]`
  if (Array.isArray(m)) {
    for (const entry of m) {
      const sm = sanitiseMedia(entry);
      if (sm) return sm;
    }
    return null;
  }

  if (typeof m !== "object") return null;
  const type = String(m.type || "").toLowerCase();
  const src = String(m.src || "").trim();
  if (!src) return null;

  if (type === "audio") {
    return {
      type: "audio",
      src,
      title: m.title ? String(m.title) : ""
    };
  }

  if (type === "video") {
    const poster = m.poster ? String(m.poster).trim() : "";
    return {
      type: "video",
      src,
      title: m.title ? String(m.title) : "",
      poster
    };
  }

  if (type === "image") {
    return {
      type: "image",
      src,
      title: m.title ? String(m.title) : ""
    };
  }

  return null;
}

function renderQuestionMedia(q) {
  const area = document.getElementById("mediaArea");
  if (!area) return;

  area.innerHTML = "";
  if (!q || !q.media) return;

  const media = sanitiseMedia(q.media);
  if (!media) return;
  if (media.type === "audio" && media.src) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = media.src;

    // Optional label
    if (media.title) {
      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.opacity = "0.8";
      label.style.marginBottom = "6px";
      label.textContent = media.title;
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.width = "100%";
      wrap.appendChild(label);
      wrap.appendChild(audio);
      area.appendChild(wrap);
    } else {
      area.appendChild(audio);
    }
    return;
  }

  if (media.type === "video" && media.src) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = media.src;
    if (media.poster) video.poster = media.poster;

    if (media.title) {
      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.opacity = "0.8";
      label.style.marginBottom = "6px";
      label.textContent = media.title;

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.width = "100%";
      wrap.appendChild(label);
      wrap.appendChild(video);
      area.appendChild(wrap);
    } else {
      area.appendChild(video);
    }
    return;
  }

  if (media.type === "image" && media.src) {
    const img = document.createElement("img");
    img.src = media.src;
    img.alt = media.title ? String(media.title) : "";
    img.loading = "lazy";
    img.decoding = "async";

    if (media.title) {
      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.opacity = "0.8";
      label.style.marginBottom = "6px";
      label.textContent = media.title;

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.width = "100%";
      wrap.appendChild(label);
      wrap.appendChild(img);
      area.appendChild(wrap);
    } else {
      area.appendChild(img);
    }
  }
}

function buildSessionQueue(bank) {
  const inputs = document.querySelectorAll("#categoryConfig input");
  const queue = [];

  inputs.forEach(input => {
    const category = input.dataset.category;
    const qty = Number(input.value);
    if (qty <= 0) return;

    const questions = bank.filter(q => q.category === category);
    const christmas = questions.filter(q => q.difficulty === "christmas-hard");
    const normal = questions.filter(q => q.difficulty !== "christmas-hard");

    let selected = [];

    if (qty >= christmas.length) {
      selected.push(...christmas);
      selected.push(...shuffle(normal).slice(0, qty - christmas.length));
    } else {
      selected.push(...shuffle(christmas).slice(0, qty));
    }

    queue.push(...selected);
  });

  return shuffle(queue);
}

/*************************************************
 * Points & categories
 *************************************************/
const POINTS_BY_DIFFICULTY = {
  medium: 1,
  hard: 2,
  "very-hard": 3,
  "christmas-hard": 1
};

const GENERAL_CATEGORIES = {
  Maths: ["Maths (Geometry)", "Maths (Algebra)", "Maths (Arithmetic)", "Maths (Logic, Probability)"],
  Science: ["Science (Physics)", "Science (Chemistry)", "Science (Biology)", "Science (Astronomy, Quantum Mechanics)"],
  History: ["History (Political)", "History (Art)", "History (Cultural)", "History (Social)"],
  Entertainment: ["Entertainment (Video Games)", "Entertainment (Music)", "Entertainment (Film)", "Entertainment (Television)"],
  PopCulture: ["Pop Culture (Fashion)", "Pop Culture (Current Celebrities)", "Pop Culture (Sports)", "Pop Culture (Social Media, Trends)"],
  WorldCulture: ["World and Culture (Geography, Language)", "World and Culture (Famous People, Landmarks)", "World and Culture (Philippines)", "World and Culture (Australia)"],
  Mythology: ["Mythology (Christian)", "Mythology (Greek and Roman)", "Mythology (Egyptian)", "Mythology (Norse)"]
};

// Per-general-category metadata: icon (emoji) and accent color
const CATEGORY_META = {
  Maths: { icon: 'maths.svg', color: '#0ea5a4' },
  Science: { icon: 'science.svg', color: '#16a34a' },
  History: { icon: 'history.svg', color: '#f97316' },
  Entertainment: { icon: 'entertainment.svg', color: '#8b5cf6' },
  PopCulture: { icon: 'popculture.svg', color: '#ef4444' },
  WorldCulture: { icon: 'worldculture.svg', color: '#06b6d4' },
  Mythology: { icon: 'mythology.svg', color: '#ef4444' }
};

function getGeneralCategory(category) {
  for (const g of Object.keys(GENERAL_CATEGORIES)) {
    if (GENERAL_CATEGORIES[g].includes(category)) return g;
  }
  return null;
}

function isChristmasQuestion(q) {
  if (!q) return false;
  if (q.christmas === true) return true;
  return String(q.difficulty || "").toLowerCase().startsWith("christmas");
}

function basePoints(q) {
  if (!q) return 0;
  // Your rule: Christmas questions always 1 point
  if (isChristmasQuestion(q)) return 1;
  return POINTS_BY_DIFFICULTY[q.difficulty] ?? 0;
}

/*************************************************
 * Rewards
 *************************************************/
const CHRISTMAS_REWARDS = [
  // Rewards grant ONLY general-category bonuses.
  // Each day can grant up to two +1 bonuses across two general categories.
  { day: 1, name: "Partridge", general: ["Maths", "Science"] },
  { day: 2, name: "Turtle Doves", general: ["History", "WorldCulture"] },
  { day: 3, name: "French Hens", general: ["PopCulture", "Mythology"] },
  { day: 4, name: "Calling Birds", general: ["Entertainment", "Science"] },
  { day: 5, name: "Golden Rings", general: ["Maths", "History"] },
  { day: 6, name: "Geese", general: ["WorldCulture", "Science"] },
  { day: 7, name: "Swans", general: ["Mythology", "History"] },
  { day: 8, name: "Maids", general: ["Entertainment", "WorldCulture"] },
  { day: 9, name: "Dancing Ladies", general: ["Entertainment", "PopCulture"] },
  { day: 10, name: "Leaping Lords", general: ["Maths", "PopCulture"] },
  { day: 11, name: "Pipers", general: ["Science", "Mythology"] },
  { day: 12, name: "Drummers", general: ["WorldCulture", "PopCulture"] }
];

const REWARD_BY_DAY = Object.fromEntries(CHRISTMAS_REWARDS.map((r) => [String(r.day), r]));

function rewardIconPath(day) {
  const d = clampInt(day, 1, 99);
  const dd = String(d).padStart(2, "0");
  const names = {
    1: "partridge",
    2: "turtle-doves",
    3: "french-hens",
    4: "calling-birds",
    5: "golden-rings",
    6: "geese",
    7: "swans",
    8: "maids",
    9: "ladies",
    10: "lords",
    11: "pipers",
    12: "drummers"
  };
  const slug = names[d] || `day-${dd}`;
  return `img/buffs/day-${dd}-${slug}.svg`;
}

function prettyGeneralCategory(g) {
  const labels = {
    PopCulture: "Pop Culture",
    WorldCulture: "World & Culture"
  };
  return labels[g] || g;
}

function rewardTooltipText(day) {
  const r = REWARD_BY_DAY[String(day)];
  if (!r) return "";
  const gen = (r.general || []).map(prettyGeneralCategory).join(", ");
  return `${r.name} (Day ${r.day})\n+1 bonus for: ${gen || "—"}`;
}

function emptyRewardsState() {
  return {
    general: Object.fromEntries(Object.keys(GENERAL_CATEGORIES).map((g) => [g, false])),
    // Track which Christmas reward "days" are currently active for this team.
    // day -> true
    days: {}
  };
}

function applyReward(team, reward) {
  // General-only buffs (up to two categories)
  for (const g of (reward?.general || []).slice(0, 2)) {
    if (team.rewards.general[g] !== undefined) team.rewards.general[g] = true;
  }

  if (!team.rewards.days) team.rewards.days = {};
  if (reward?.day != null) team.rewards.days[String(reward.day)] = true;
}

function revokeReward(team, reward) {
  for (const g of (reward?.general || []).slice(0, 2)) {
    if (team.rewards.general[g] !== undefined) team.rewards.general[g] = false;
  }

  if (team.rewards.days && reward?.day != null) {
    delete team.rewards.days[String(reward.day)];
  }
}

/*************************************************
 * Scoring breakdown (for host visibility)
 *************************************************/
function scoreBreakdown(team, q) {
  // Christmas: always 1 point, buffs do NOT apply to the Christmas question itself
  if (isChristmasQuestion(q)) return { total: 1, base: 1, general: 0 };

  const base = basePoints(q);
  const g = getGeneralCategory(q.category);

  const generalBonus = (g && team.rewards.general[g]) ? 1 : 0;

  return {
    total: base + generalBonus,
    base,
    general: generalBonus
  };
}

/*************************************************
 * State (sanitised for projector sync)
 *************************************************/
let state = sanitiseState({
  teams: [],
  teamsLocked: false,
  session: {
    queue: [],
    index: 0,
    revealed: false,
    appliedByTeamId: {},        // teamId -> bool (score toggled for current Q)
    christmasReward: null       // reward drawn for THIS question (null if not Christmas)
  },
  // whether projectors should render in light mode (host-controlled)
  projectorLight: false,
  // Host-controlled question timer
  timer: {
    durationSec: 30,
    running: false,
    endsAtMs: 0
  },
  rewards: {
    remaining: []
  }
});

function sanitiseState(s) {
  const out = {
    teams: Array.isArray(s?.teams) ? s.teams.map((t) => ({
      id: String(t?.id ?? uid()),
      name: String(t?.name ?? "Team"),
      score: clamp0(t?.score),
      rewards: {
        general: { ...emptyRewardsState().general, ...(t?.rewards?.general || {}) },
        days: { ...(t?.rewards?.days || {}) }
      }
    })) : [],
    teamsLocked: Boolean(s?.teamsLocked),
    session: {
      queue: Array.isArray(s?.session?.queue) ? s.session.queue.map((q) => ({
        id: String(q?.id ?? uid()),
        category: String(q?.category ?? "Unknown"),
        difficulty: String(q?.difficulty ?? "medium"),
        question: String(q?.question ?? ""),
        answer: String(q?.answer ?? ""),
        christmas: Boolean(q?.christmas),
        hostNotes: q?.hostNotes ? String(q.hostNotes) : "",
        media: sanitiseMedia(q?.media)
      })) : [],
      index: clamp0(s?.session?.index),
      revealed: Boolean(s?.session?.revealed),
      appliedByTeamId: (s?.session?.appliedByTeamId && typeof s.session.appliedByTeamId === "object")
        ? { ...s.session.appliedByTeamId }
        : {},
      christmasReward: s?.session?.christmasReward ? { ...s.session.christmasReward } : null
    },
    projectorLight: Boolean(s?.projectorLight),
    timer: {
      durationSec: clampInt(s?.timer?.durationSec ?? 30, 5, 600),
      running: Boolean(s?.timer?.running),
      endsAtMs: Number.isFinite(Number(s?.timer?.endsAtMs)) ? Number(s?.timer?.endsAtMs) : 0
    },
    rewards: {
      remaining: Array.isArray(s?.rewards?.remaining) ? s.rewards.remaining.map((r) => ({ ...r })) : []
    }
  };

  if (out.session.queue.length === 0) out.session.index = 0;
  if (out.session.index > out.session.queue.length) out.session.index = out.session.queue.length;

  return out;
}

/*************************************************
 * Sample questions (until question bank wiring)
 *************************************************/
const sampleQuestions = [
  {
    id: uid(),
    category: "Maths (Geometry)",
    difficulty: "christmas-medium",
    christmas: true,
    question: "Christmas-themed: A Christmas tree looks like an isosceles triangle with equal sides 13 and base 10. What is the height?",
    answer: "12"
  },
  {
    id: uid(),
    category: "Science (Physics)",
    difficulty: "medium",
    question: "What is the SI (International System of Units) unit of force?",
    answer: "Newton"
  },
  {
    id: uid(),
    category: "World and Culture (Famous People, Landmarks)",
    difficulty: "hard",
    question: "Which Australian opera house is a famous landmark in Sydney?",
    answer: "Sydney Opera House"
  }
];

/*************************************************
 * Screens
 *************************************************/
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const id = `#screen${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const el = $(id);
  if (el) el.classList.add("active");
}

function currentQuestion() {
  return state.session.queue[state.session.index] || null;
}

/*************************************************
 * Team setup UI (THIS is what your paste removed)
 *************************************************/
function initTeamSetupUI() {
  const wrap = $("#teamNames");
  const teamCountInput = $("#teamCount");
  const btnConfirm = $("#btnConfirmTeams");

  if (!wrap || !teamCountInput || !btnConfirm) return;

  function renderTeamInputs() {
    wrap.innerHTML = "";

    const raw = clamp0(teamCountInput.value);
    const count = Math.min(Math.max(raw, 1), 10);

    for (let i = 0; i < count; i++) {
      const card = document.createElement("div");
      card.className = "team-card";

      const label = document.createElement("span");
      label.textContent = `Team ${i + 1}`;

      const input = document.createElement("input");
      input.placeholder = "Enter team name";
      input.value = state.teams[i]?.name || "";

      card.appendChild(label);
      card.appendChild(input);
      wrap.appendChild(card);
    }

    const shouldDisable = !isHost || state.teamsLocked;
    teamCountInput.disabled = shouldDisable;
    btnConfirm.disabled = shouldDisable;
    [...wrap.querySelectorAll("input")].forEach((inp) => (inp.disabled = shouldDisable));
  }

  if (!teamCountInput._wired) {
    teamCountInput._wired = true;
    teamCountInput.addEventListener("change", renderTeamInputs);
    teamCountInput.addEventListener("input", renderTeamInputs);
  }

  if (!btnConfirm._wired) {
    btnConfirm._wired = true;
    btnConfirm.addEventListener("click", () => {
      if (!isHost) return;

      const inputs = [...wrap.querySelectorAll("input")];
      state.teams = inputs.map((inp, i) => ({
        id: uid(),
        name: (inp.value || `Team ${i + 1}`).trim(),
        score: 0,
        rewards: emptyRewardsState()
      }));

      state.teamsLocked = true;
      publishState();
      renderAll();
    });
  }

  renderTeamInputs();
}

/*************************************************
 * Game flow
 *************************************************/
function initRewardsForNewGame() {
  state.rewards.remaining = shuffle(CHRISTMAS_REWARDS).map((r) => ({ ...r }));
  state.session.christmasReward = null;
}

function startGame() {
  if (!isHost) return;

  if (!state.teamsLocked || state.teams.length === 0) {
    alert("Lock teams first.");
    return;
  }

  //state.session.queue = shuffle(sampleQuestions);
  //state.session.queue = shuffle(state.questionBank);
  state.session.queue = buildSessionQueue(state.questionBank);
  state.session.index = 0;
  state.session.revealed = false;
  state.session.appliedByTeamId = {};
  initRewardsForNewGame();

  // Reset timer for the first question
  state.timer.running = false;
  state.timer.endsAtMs = 0;

  publishState();
  renderAll();
  showScreen("quiz");
}

function revealAnswer() {
  if (!isHost) return;

  const q = currentQuestion();
  if (!q) return;

  state.session.revealed = true;
  state.session.appliedByTeamId = {};

  // Draw ONE reward for this question if it's Christmas.
  // That same reward can be granted to multiple teams via Correct toggles.
  state.session.christmasReward = isChristmasQuestion(q)
    ? (state.rewards.remaining.shift() || null)
    : null;

  publishState();
  renderAll();
}

function nextQuestion() {
  if (!isHost) return;

  state.session.index += 1;
  state.session.revealed = false;
  state.session.appliedByTeamId = {};
  state.session.christmasReward = null;

  // Reset timer for the next question
  state.timer.running = false;
  state.timer.endsAtMs = 0;

  publishState();
  renderAll();

  if (state.session.index >= state.session.queue.length) {
    showScreen("over");
  }
}

window.nextQuestion = nextQuestion;

/*************************************************
 * Scoreboard: one toggle button "Correct" (undo-safe)
 * - On Christmas question: toggle ALSO applies/revokes the per-question reward.
 *************************************************/
function toggleCorrect(teamId) {
  if (!isHost || !state.session.revealed) return;

  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;

  const q = currentQuestion();
  if (!q) return;

  const applied = Boolean(state.session.appliedByTeamId[teamId]);
  const delta = scoreBreakdown(team, q).total;

  // Reward for this question (same reward for all teams)
  const reward = state.session.christmasReward;

  if (!applied) {
    team.score = clamp0(team.score + delta);
    state.session.appliedByTeamId[teamId] = true;

    // Auto-apply reward ONLY for Christmas questions
    if (reward && isChristmasQuestion(q)) applyReward(team, reward);
  } else {
    team.score = clamp0(team.score - delta);
    state.session.appliedByTeamId[teamId] = false;

    // Undo revokes the same reward
    if (reward && isChristmasQuestion(q)) revokeReward(team, reward);
  }

  publishState();
  renderAll();
}

function renderScoreboard() {
  const wrap = $("#scoreboard");
  if (!wrap) return;

  wrap.innerHTML = "";

  const q = currentQuestion();
  const revealed = state.session.revealed;

  for (const team of state.teams) {
    const row = document.createElement("div");
    row.className = "score-row";

    const nameWrap = document.createElement("div");
    nameWrap.className = "team-name";

    const name = document.createElement("strong");
    name.textContent = team.name;

    const buffs = document.createElement("span");
    buffs.className = "buff-icons";

    const activeDays = Object.entries(team?.rewards?.days || {})
      .filter(([, v]) => Boolean(v))
      .map(([k]) => clampInt(k, 1, 99))
      .sort((a, b) => a - b);

    for (const day of activeDays) {
      const img = document.createElement("img");
      img.className = "buff-icon";
      img.alt = `Reward Day ${day} active`;
      img.src = rewardIconPath(day);
      img.title = rewardTooltipText(day);
      buffs.appendChild(img);
    }

    nameWrap.appendChild(name);
    if (buffs.childNodes.length) nameWrap.appendChild(buffs);

    const score = document.createElement("span");
    score.textContent = String(team.score);

    const controls = document.createElement("span");
    controls.className = "score-controls";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";

    const applied = Boolean(state.session.appliedByTeamId[team.id]);
    btn.textContent = applied ? "Correct ✓ (undo)" : "Correct";

    controls.appendChild(btn);
    row.appendChild(nameWrap);
    row.appendChild(score);
    row.appendChild(controls);
    wrap.appendChild(row);

    if (!isHost) {
      controls.style.display = "none";
      btn.disabled = true;
      continue;
    }

    btn.disabled = !revealed || !q;
    btn.onclick = () => toggleCorrect(team.id);

    // Host-only: show scoring breakdown for confidence
    if (revealed && q) {
      const b = scoreBreakdown(team, q);
      const hint = document.createElement("div");
      hint.style.fontSize = "12px";
      hint.style.opacity = "0.85";
      hint.style.marginTop = "4px";
      hint.textContent = `This question: ${b.total} = base ${b.base} + general ${b.general}`;
      row.appendChild(hint);
    }
  }
}

/*************************************************
 * Host reward panel (display-only; no award buttons)
 *************************************************/
function renderHostRewardsPanel() {
  const panel = $("#hostRewardPanel");
  const logEl = $("#hostRewardLog");
  const teamRewardsEl = $("#hostTeamRewards");
  const btnToggle = $("#btnToggleRewards");

  if (!panel || !logEl || !teamRewardsEl) return;

  if (!isHost) {
    panel.classList.add("hidden");
    if (btnToggle) btnToggle.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  if (btnToggle) btnToggle.classList.remove("hidden");

  if (btnToggle && !btnToggle._wired) {
    btnToggle._wired = true;
    btnToggle.addEventListener("click", () => {
      const hidden = panel.dataset.hidden === "1";
      panel.dataset.hidden = hidden ? "0" : "1";
      panel.style.display = hidden ? "" : "none";
      btnToggle.textContent = hidden ? "Hide Rewards" : "Show Rewards";
    });
    btnToggle.textContent = "Hide Rewards";
  }

  const next = state.rewards.remaining[0];
  const drawn = state.session.christmasReward;

  const lines = [];
  if (drawn) lines.push(`Current question reward: Day ${drawn.day} — ${drawn.name}`);
  lines.push(next ? `Next reward in queue: Day ${next.day} — ${next.name}` : "No rewards remaining.");

  logEl.innerHTML = lines.map((t) => `<div><strong>${t}</strong></div>`).join("");

  // Per-team reward summary
  teamRewardsEl.innerHTML = "";
  for (const team of state.teams) {
    const card = document.createElement("div");
    card.className = "team-card";

    const title = document.createElement("strong");
    title.textContent = team.name;
    card.appendChild(title);

    const tags = document.createElement("div");
    tags.style.marginTop = "8px";

    for (const [g, enabled] of Object.entries(team.rewards.general || {})) {
      if (!enabled) continue;
      const tag = document.createElement("span");
      tag.className = "reward-tag";
      tag.textContent = `General: ${prettyGeneralCategory(g)} (+1)`;
      tags.appendChild(tag);
    }

    if (!tags.childNodes.length) {
      const none = document.createElement("div");
      none.className = "muted";
      none.textContent = "No buffs yet.";
      tags.appendChild(none);
    }

    card.appendChild(tags);
    teamRewardsEl.appendChild(card);
  }
}

/*************************************************
 * Quiz rendering
 *************************************************/
function renderQuizCard() {
  const q = currentQuestion();
  const progressEl = $("#progress");
  const catEl = $("#currentCategory");
  const ptsEl = $("#currentDifficulty");
  const qTextEl = $("#questionText");
  const aTextEl = $("#answerText");
  const ansArea = $("#answerArea");
  const btnReveal = $("#btnReveal");
  const btnNext = $("#btnNextQuestion");
  const hostControls = document.querySelector(".host-controls");

  if (!isHost) {
    if (btnReveal) btnReveal.style.display = "none";
    if (btnNext) btnNext.style.display = "none";
    if (hostControls) hostControls.style.display = "none";
  } else {
    if (btnReveal) btnReveal.style.display = "";
    if (btnNext) btnNext.style.display = "";
    if (hostControls) hostControls.style.display = "";
  }


  if (progressEl) progressEl.textContent = q ? `${state.session.index + 1} / ${state.session.queue.length}` : "0 / 0";
  if (catEl) {
    if (!q) {
      catEl.textContent = "—";
    } else if (!isHost) {
      // Projector view: show only the general category label
      catEl.textContent = getGeneralCategory(q.category) || q.category;
    } else {
      // Host view: keep the full specific category
      catEl.textContent = q.category;
    }
  }

  // Move the currentCategory element out to the right-side of .quiz-top
  try {
    const quizTop = document.querySelector('.quiz-top');
    if (quizTop && catEl && catEl.parentElement !== quizTop) {
      const hostControls = quizTop.querySelector('.host-controls');
      quizTop.insertBefore(catEl, hostControls || null);
    }
  } catch (e) {
    // ignore DOM errors
  }
  if (ptsEl) ptsEl.textContent = q ? `${basePoints(q)} pts` : "—";

  if (qTextEl) qTextEl.textContent = q ? q.question : "No question loaded.";

  renderQuestionMedia(q);

  renderProjectorTimer();

  // Only inject the answer into the DOM when the host has revealed it.
  if (aTextEl) {
    if (q && state.session.revealed) {
      aTextEl.innerHTML = `
        <div class="answer-label">ANSWER</div>
        <div class="answer-value">${String(q.answer)}</div>
      `;
    } else {
      aTextEl.innerHTML = "";
    }
  }

  // Host-only: show host notes after revealing the answer
  try {
    const notesEl = document.getElementById("hostNotes");
    if (notesEl) {
      if (!isHost || !q || !state.session.revealed) {
        notesEl.classList.add("hidden");
        notesEl.textContent = "";
      } else {
        const notes = String(q.hostNotes || "").trim();
        if (!notes) {
          notesEl.classList.add("hidden");
          notesEl.textContent = "";
        } else {
          notesEl.classList.remove("hidden");
          notesEl.textContent = `Host notes: ${notes}`;
        }
      }
    }
  } catch {
    // ignore
  }

  if (btnReveal) {
    btnReveal.disabled = !isHost || !q || state.session.revealed;
    btnReveal.style.display = q ? "" : "none";
  }

  if (ansArea) {
    if (state.session.revealed) ansArea.classList.remove("hidden");
    else ansArea.classList.add("hidden");
  }

  // Apply category icon + accent color on the question card
  try {
    const quizCard = document.querySelector('.quiz-card');
    if (quizCard) {
      const general = q ? getGeneralCategory(q.category) : null;
      const meta = general ? (CATEGORY_META[general] || {}) : {};
      const icon = meta.icon || null;
      const color = meta.color || '#ff7a18';
      quizCard.style.setProperty('--accent', color);
      // inject or update an <img> for the SVG icon
      if (icon) {
        const wrapPath = `img/icons/${icon}`;
        let imgWrap = quizCard.querySelector('.quiz-icon');
        if (!imgWrap) {
          imgWrap = document.createElement('div');
          imgWrap.className = 'quiz-icon';
          const img = document.createElement('img');
          img.alt = '';
          imgWrap.appendChild(img);
          quizCard.appendChild(imgWrap);
        }
        const img = imgWrap.querySelector('img');
        if (img) img.src = wrapPath;
      } else {
        const existing = quizCard.querySelector('.quiz-icon');
        if (existing) existing.remove();
      }
    }
  } catch (e) {
    // ignore
  }

  renderScoreboard();
  renderHostRewardsPanel();
}

function renderGameOver() {
  const final = $("#finalScores");
  if (!final) return;

  final.innerHTML = "";

  const ranked = state.teams.slice().sort((a, b) => b.score - a.score);
  const winner = ranked[0] || null;

  if (winner) {
    const banner = document.createElement("div");
    banner.className = "gameover-winner";

    const label = document.createElement("div");
    label.className = "winner-label";
    label.textContent = "Winner";

    const name = document.createElement("div");
    name.className = "winner-name";
    name.textContent = winner.name;

    const score = document.createElement("div");
    score.className = "winner-score";
    score.textContent = `${winner.score} pts`;

    banner.appendChild(label);
    banner.appendChild(name);
    banner.appendChild(score);
    final.appendChild(banner);
  }

  const list = document.createElement("div");
  list.className = "final-list";

  ranked.forEach((team, idx) => {
    const row = document.createElement("div");
    row.className = "final-row" + (idx === 0 ? " is-winner" : "");

    const rank = document.createElement("div");
    rank.className = "rank-badge";
    rank.textContent = String(idx + 1);

    const name = document.createElement("div");
    name.className = "final-name";
    name.textContent = team.name;

    const score = document.createElement("div");
    score.className = "final-score";
    score.textContent = `${team.score} pts`;

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(score);
    list.appendChild(row);
  });

  final.appendChild(list);
}

function applyProjectorLightClass() {
  const isProj = document.body.classList.contains("projector");
  if (isProj && state.projectorLight) document.body.classList.add("light");
  else document.body.classList.remove("light");
}

function applyProjectorChristmasClass() {
  const isProj = document.body.classList.contains("projector");
  const q = currentQuestion();
  const should = isProj && isChristmasQuestion(q);
  if (should) {
    document.body.classList.add("christmas");
    // ensure a single snowflake node exists (subtle animation)
    if (!document.querySelector('.snowflake')) {
      const s = document.createElement('div');
      s.className = 'snowflake';
      s.textContent = '❄️';
      document.body.appendChild(s);
    }
  } else {
    document.body.classList.remove("christmas");
    const sf = document.querySelectorAll('.snowflake');
    sf.forEach(n => n.remove());
  }
}

/*************************************************
 * Render All
 *************************************************/
function renderAll() {
  initTeamSetupUI();

  if (state.session.queue.length === 0) {
    showScreen("selection");
  } else if (state.session.index >= state.session.queue.length) {
    showScreen("over");
  } else {
    showScreen("quiz");
  }

  renderQuizCard();
  renderGameOver();

  // Host-only buttons already exist in HTML; keep them hidden for projector
  const btnSave = $("#btnSaveState");
  const btnLoad = $("#btnLoadState");
  const btnToggleRewards = $("#btnToggleRewards");
  if (btnSave) btnSave.classList.toggle("hidden", !isHost);
  if (btnLoad) btnLoad.classList.toggle("hidden", !isHost);
  if (btnToggleRewards) btnToggleRewards.classList.toggle("hidden", !isHost);

  // Ensure projector light toggle reflects current state (host UI)
  const projToggle = document.getElementById("projectorLightToggle");
  if (projToggle) projToggle.checked = Boolean(state.projectorLight);

  // Ensure timer input reflects state (host UI)
  const timerSeconds = document.getElementById("timerSeconds");
  if (timerSeconds && isHost) timerSeconds.value = String(state?.timer?.durationSec ?? 30);

  // Apply projector light class on projector clients
  applyProjectorLightClass();
  applyProjectorChristmasClass();
  ensureProjectorTimerTicker();
  renderProjectorTimer();
}

/*************************************************
 * Events
 *************************************************/
function bindEvents() {
  const btnStart = $("#btnShuffleAll");
  const btnReveal = $("#btnReveal");
  const bankSelect = document.getElementById("bankSelect");

  if (bankSelect && isHost) {
    bankSelect.addEventListener("change", async () => {
      const bank = await loadSelectedQuestionBank();
      state.questionBank = bank;
      renderCategoryConfig(bank);
    });
  }

  if (btnStart) {
    btnStart.disabled = !isHost;
    btnStart.addEventListener("click", startGame);
  }

  if (btnReveal) {
    btnReveal.addEventListener("click", revealAnswer);
  }

  // Sync
  if (bc) {
    bc.onmessage = (ev) => {
      const payload = ev?.data;
      if (!payload?.state) return;
      applyIncomingState(payload.state);
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const payload = safeJsonParse(e.newValue, null);
    if (payload?.state) applyIncomingState(payload.state);
  });

  if (!isHost) requestInitialStateFromStorage();
  if (isHost) publishState();

  const presetSelect = document.getElementById("presetSelect");
  if (presetSelect && isHost) {
    presetSelect.addEventListener("change", () => {
      applyPreset(presetSelect.value);
    });
  }

  // Host control: projector light mode toggle
  const projToggle = document.getElementById("projectorLightToggle");
  if (projToggle && isHost) {
    projToggle.addEventListener("change", () => {
      state.projectorLight = Boolean(projToggle.checked);
      publishState();
      renderAll();
    });
  }

  // Host controls: per-question timer
  const timerSeconds = document.getElementById("timerSeconds");
  const btnStartTimer = document.getElementById("btnStartTimer");

  if (timerSeconds && isHost) {
    timerSeconds.addEventListener("change", () => {
      state.timer.durationSec = clampInt(timerSeconds.value, 5, 600);
      publishState();
      renderAll();
    });
  }

  if (btnStartTimer && isHost) {
    btnStartTimer.addEventListener("click", () => {
      const q = currentQuestion();
      if (!q) return;
      const seconds = clampInt(timerSeconds ? timerSeconds.value : state.timer.durationSec, 5, 600);
      state.timer.durationSec = seconds;
      state.timer.running = true;
      state.timer.endsAtMs = Date.now() + (seconds * 1000);
      publishState();
      renderAll();
    });
  }

}

/*************************************************
 * Init
 *************************************************/
(async function init() {
  try {
    //const bank = await loadQuestionBank();
    const bank = await loadSelectedQuestionBank();
    state.questionBank = bank;

    if (isHost) {
      document.getElementById("hostBankControls")?.classList.remove("hidden");
      renderCategoryConfig(bank);
    }

    const errors = validateQuestionBank(bank);


    if (errors.length) {
      console.error("Question bank validation failed:", errors);

      if (STRICT_QUESTION_VALIDATION) {
        alert("Question bank has errors. Check console.");
        return;
      } else {
        console.warn("⚠ Validation bypassed (bank still being built)");
      }
    }


    state.questionBank = bank;

    bindEvents();
    renderAll();
  } catch (err) {
    console.error(err);
    alert(`Unable to load question bank.\n\n${err?.message || String(err)}`);
  }
})();
