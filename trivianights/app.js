/* Trivia Night Host Mode
   - Local question bank stored in IndexedDB (Indexed DataBase)
   - Category selection + Shuffle All
   - Reveal answer, then Correct/Incorrect advances automatically
   - Numeric questions show "Closest without going over" rule tag
*/

const CATEGORIES = [
  "Maths (Geometry)",
  "Maths (Algebra)",
  "Maths (Arithmetic)",
  "Maths (Logic)",
  "Science (Physics)",
  "Science (Chemistry)",
  "Science (Biology)",
  "Science (Astronomy)",
  "History (Political)",
  "History (Art)",
  "History (Cultural)",
  "History (Social)",
  "Entertainment (Video Games)",
  "Entertainment (Music)",
  "Entertainment (Film)",
  "Entertainment (Television)",
  "Pop Culture (Fashion)",
  "Pop Culture (Current Celebrities)",
  "Pop Culture (Sports)",
  "Pop Culture (Social Media, Memes, Slang)",
  "World and Culture (Language)",
  "World and Culture (Geography)",
  "World and Culture (Countries and Cities)",
  "World and Culture (Famous People)",
  "Mythology (Christian)",
  "Mythology (Greek and Roman)",
  "Mythology (Egyptian)",
  "Mythology (Norse)",
];

const DIFFICULTIES = ["medium", "hard", "very-hard", "christmas-medium", "christmas-hard"];

// ---- IndexedDB ----
const DB_NAME = "trivia_night_db";
const DB_VERSION = 1;
const STORE = "questions";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_category", "category", { unique: false });
        store.createIndex("by_difficulty", "difficulty", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const res = fn(store, tx);
    tx.oncomplete = () => resolve(res);
    tx.onerror = () => reject(tx.error);
  });
}

async function putMany(items) {
  return withStore("readwrite", (store) => {
    for (const item of items) store.put(item);
  });
}

async function clearAll() {
  return withStore("readwrite", (store) => store.clear());
}

async function getAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function countAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function getByCategory(category) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("by_category");
    const req = idx.getAll(category);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ---- Question Schema ----
// {
//   id: string,
//   category: string,
//   difficulty: "medium"|"hard"|"very-hard"|"christmas-medium"|"christmas-hard",
//   question: string,
//   answer: string,
//   numericRule?: { enabled: true }, // host adjudication: closest without going over
//   media?: { type: "image"|"audio"|"video"|"quote", src?: string, text?: string }
// }

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}



// ===============================
// MATHS QUESTION BANK (40 total)
// Categories:
// - Maths (Geometry) x10
// - Maths (Algebra) x10
// - Maths (Arithmetic) x10
// - Maths (Logic) x10
//
// Distribution per category (10):
// 2 × Medium, 3 × Hard, 3 × Very Hard, 1 × Christmas (Medium), 1 × Christmas (Hard)
// ===============================

const mathsQuestionBank = [
  // -----------------------------
  // Maths (Geometry) (10)
  // -----------------------------
  { id: uid(), category: "Maths (Geometry)", difficulty: "medium",
    question: "A triangle has angles 50° and 60°. What is the third angle?",
    answer: "70°" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "medium",
    question: "A rectangle is 8 cm by 5 cm. What is its area?",
    answer: "40 cm²" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "hard",
    question: "A circle has radius 7 cm. What is the circumference? (Leave in terms of π (pi) if you want.)",
    answer: "14π cm (approximately 43.98 cm)" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "hard",
    question: "A right triangle has legs 9 and 12. What is the hypotenuse?",
    answer: "15" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "hard",
    question: "A regular hexagon is made of 6 equilateral triangles. If each side is 4 cm, what is the perimeter?",
    answer: "24 cm" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "very-hard",
    question: "A chord of length 10 cm is in a circle of radius 13 cm. How far is the chord from the centre? (Exact value OK.)",
    answer: "√(13² − 5²) = √(169 − 25) = √144 = 12 cm" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "very-hard",
    question: "A right circular cone has radius 3 cm and height 4 cm. What is its slant height?",
    answer: "5 cm" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "very-hard",
    question: "In a triangle, two sides are 7 cm and 9 cm with included angle 60°. Find the third side. (Exact value OK.)",
    answer: "√(7² + 9² − 2·7·9·cos60°) = √(49 + 81 − 63) = √67" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "christmas-medium",
    question: "Christmas-themed: A star ornament is a regular pentagon with a point-to-point diagonal drawn. In a regular pentagon, what is the sum of the interior angles?",
    answer: "540°" },

  { id: uid(), category: "Maths (Geometry)", difficulty: "christmas-hard",
    question: "Christmas-themed: A circular wreath has circumference 88 cm. Using π (pi) ≈ 22/7, what is its radius?",
    answer: "r = C/(2π) = 88 / (2·22/7) = 88 / (44/7) = 14 cm" },

  // -----------------------------
  // Maths (Algebra) (10)
  // -----------------------------
  { id: uid(), category: "Maths (Algebra)", difficulty: "medium",
    question: "Solve for x: 3x + 5 = 20",
    answer: "x = 5" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "medium",
    question: "Simplify: 2(3x − 4) + x",
    answer: "7x − 8" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "hard",
    question: "Solve for x: x/4 + 3 = 10",
    answer: "x = 28" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "hard",
    question: "Factorise: x² − 9x + 20",
    answer: "(x − 4)(x − 5)" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "hard",
    question: "Solve: 2x² − 8x = 0",
    answer: "2x(x − 4) = 0 → x = 0 or x = 4" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "very-hard",
    question: "Solve: 3x − 2 = 2x + 7",
    answer: "x = 9" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "very-hard",
    question: "Simplify: (x² − 16)/(x − 4) for x ≠ 4",
    answer: "x + 4" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "very-hard",
    question: "Solve: x² + 2x − 15 = 0",
    answer: "(x + 5)(x − 3) = 0 → x = −5 or x = 3" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "christmas-medium",
    question: "Christmas-themed: Santa packs x gifts, then adds 12 more. Total is 45. Write and solve the equation.",
    answer: "x + 12 = 45 → x = 33" },

  { id: uid(), category: "Maths (Algebra)", difficulty: "christmas-hard",
    question: "Christmas-themed: Reindeer feed costs $a per day. For 7 days and an extra $15 fee, total is $99. Solve for a.",
    answer: "7a + 15 = 99 → 7a = 84 → a = 12" },

  // -----------------------------
  // Maths (Arithmetic) (10)
  // -----------------------------
  { id: uid(), category: "Maths (Arithmetic)", difficulty: "medium",
    question: "Compute: 7 × 18",
    answer: "126" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "medium",
    question: "Compute: 3/4 of 80",
    answer: "60" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "hard",
    question: "Compute: 1/2 + 1/3 + 1/6",
    answer: "1" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "hard",
    question: "A price increases from $120 to $150. What is the percentage increase?",
    answer: "25%" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "hard",
    question: "Compute: 2.5 × 0.48",
    answer: "1.2" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "very-hard",
    question: "Compute: 17² − 16²",
    answer: "(17−16)(17+16) = 33" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "very-hard",
    question: "Compute: 0.06 ÷ 0.002",
    answer: "30" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "very-hard",
    question: "Closest without going over: Estimate √500 to 2 decimal places. Closest ≤ actual wins.",
    answer: "Actual √500 ≈ 22.3606…, so 22.36 is the closest without going over.",
    numericRule: { enabled: true } },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "christmas-medium",
    question: "Christmas-themed: You have 6 friends and buy each 4 candy canes. How many candy canes is that?",
    answer: "24" },

  { id: uid(), category: "Maths (Arithmetic)", difficulty: "christmas-hard",
    question: "Christmas-themed: A hamper costs $180. It’s discounted by 15%, then another $10 off. Final price?",
    answer: "$143" },

  // -----------------------------
  // Maths (Logic) (10)
  // -----------------------------
  { id: uid(), category: "Maths (Logic)", difficulty: "medium",
    question: "Logic: If all cats are mammals, and all mammals are animals, then all cats are…?",
    answer: "Animals" },

  { id: uid(), category: "Maths (Logic)", difficulty: "medium",
    question: "Logic: A statement is either true or false. If 'P' is false, what is the truth value of 'NOT P'?",
    answer: "True" },

  { id: uid(), category: "Maths (Logic)", difficulty: "hard",
    question: "Logic: How many outcomes are there when flipping 3 coins?",
    answer: "8" },

  { id: uid(), category: "Maths (Logic)", difficulty: "hard",
    question: "Logic: In a group, everyone shakes hands with everyone else exactly once. If there are 10 people, how many handshakes occur?",
    answer: "45" },

  { id: uid(), category: "Maths (Logic)", difficulty: "hard",
    question: "Logic: What is the next number in the sequence: 2, 6, 12, 20, 30, ?",
    answer: "42 (pattern: n(n+1), starting at 1·2=2, 2·3=6, 3·4=12, ...)" },

  { id: uid(), category: "Maths (Logic)", difficulty: "very-hard",
    question: "Logic: A binary string has length 5 (each position is 0 or 1). How many distinct binary strings are possible?",
    answer: "32" },

  { id: uid(), category: "Maths (Logic)", difficulty: "very-hard",
    question: "Logic: You roll two standard six-sided dice. What is the probability the sum is 9?",
    answer: "4/36 = 1/9" },

  { id: uid(), category: "Maths (Logic)", difficulty: "very-hard",
    question: "Logic: How many permutations of the word 'LEVEL' are there?",
    answer: "5! / (2!·2!) = 30" },

  { id: uid(), category: "Maths (Logic)", difficulty: "christmas-medium",
    question: "Christmas-themed logic: Santa visits 4 houses. Each house is either 'delivered' or 'not delivered'. How many possible delivery patterns are there?",
    answer: "16" },

  { id: uid(), category: "Maths (Logic)", difficulty: "christmas-hard",
    question: "Christmas-themed logic: Closest without going over. A sleigh can carry at most 120 kg. Four sacks weigh 29 kg, 34 kg, 28 kg, and 35 kg. What is the maximum total weight you can load without exceeding the limit?",
    answer: "120 kg (29 + 28 + 34 + 35 = 126 too high; best is 35 + 34 + 29 = 98, or 35 + 34 + 28 = 97, or 34 + 29 + 28 = 91; maximum ≤120 is 98 here).",
    numericRule: { enabled: true } },
];

function buildSeedQuestions() {
  // Minimal set to prove functionality.
  // You will expand this to 10 per category with your distribution:
  // 2 medium, 3 hard, 3 very hard, 2 Christmas-themed (1 medium, 1 hard)
  return [
    // ===============================
    // MATHS QUESTION BANK
    // ===============================
    ...mathsQuestionBank
  ];
}

// ---- UI State ----
let session = {
  queue: [],
  index: 0,
  score: 0,
  correct: 0,
  revealed: false,
};

const $ = (sel) => document.querySelector(sel);

const screens = {
  selection: $("#screenSelection"),
  quiz: $("#screenQuiz"),
  over: $("#screenGameOver"),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", hidden);
}

function difficultyLabel(d) {
  switch (d) {
    case "medium": return "Medium";
    case "hard": return "Hard";
    case "very-hard": return "Very Hard";
    case "christmas-medium": return "Christmas (Medium)";
    case "christmas-hard": return "Christmas (Hard)";
    default: return d;
  }
}

// ---- Render: Selection ----
async function renderSelection() {
  const grid = $("#categoryGrid");
  grid.innerHTML = "";

  const all = await getAll();
  const total = all.length;

  const byCat = new Map();
  for (const c of CATEGORIES) byCat.set(c, 0);
  for (const q of all) byCat.set(q.category, (byCat.get(q.category) || 0) + 1);

  $("#bankStatus").textContent = total > 0 ? `Bank: Ready (${total} questions)` : "Bank: Empty";
  $("#bankCounts").textContent = total > 0 ? "Counts shown per category" : "Seed sample bank to start";

  for (const cat of CATEGORIES) {
    const btn = document.createElement("button");
    btn.className = "category";
    btn.type = "button";
    btn.innerHTML = `
      <div class="name">${cat}</div>
      <div class="count">${byCat.get(cat) || 0} question(s)</div>
    `;
    btn.addEventListener("click", async () => {
      await startGame({ mode: "single", category: cat });
    });
    grid.appendChild(btn);
  }
}

// ---- Game flow ----
async function buildQueueForCategory(category) {
  const items = await getByCategory(category);
  return shuffle(items);
}

async function buildQueueShuffleAll() {
  const items = await getAll();
  return shuffle(items);
}

async function startGame({ mode, category }) {
  const queue = mode === "single" ? await buildQueueForCategory(category) : await buildQueueShuffleAll();

  if (!queue.length) {
    alert("No questions in the bank for that selection. Use Manage Bank → Seed Sample Bank, or add your questions.");
    return;
  }

  session.queue = queue;
  session.index = 0;
  session.score = 0;
  session.correct = 0;
  session.revealed = false;

  showScreen("quiz");
  renderCurrentCard();
}

function currentCard() {
  return session.queue[session.index] || null;
}

function renderCurrentCard() {
  const q = currentCard();
  if (!q) {
    endGame();
    return;
  }

  $("#score").textContent = String(session.score);
  $("#progress").textContent = `${session.index + 1} / ${session.queue.length}`;
  $("#currentCategory").textContent = q.category;
  $("#currentDifficulty").textContent = difficultyLabel(q.difficulty);

  $("#questionText").textContent = q.question;
  $("#answerText").textContent = q.answer;

  // Reveal/Scoring state
  session.revealed = false;
  setHidden($("#answerArea"), true);
  setHidden($("#scoringButtons"), true);
  $("#btnReveal").disabled = false;

  // Rule tag
  const ruleTag = $("#ruleTag");
  const hasNumericRule = !!(q.numericRule && q.numericRule.enabled);
  setHidden(ruleTag, !hasNumericRule);

  // Media
  const mediaArea = $("#mediaArea");
  const mediaTag = $("#mediaTag");

  mediaArea.innerHTML = "";
  const hasMedia = !!q.media;
  setHidden(mediaArea, !hasMedia);
  setHidden(mediaTag, !hasMedia);

  if (hasMedia) {
    const m = q.media;
    if (m.type === "image" && m.src) {
      const img = document.createElement("img");
      img.alt = "Question image";
      img.src = m.src;
      mediaArea.appendChild(img);
    } else if (m.type === "audio" && m.src) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = m.src;
      mediaArea.appendChild(audio);
    } else if (m.type === "video" && m.src) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = m.src;
      mediaArea.appendChild(video);
    } else if (m.type === "quote" && m.text) {
      const block = document.createElement("div");
      block.style.fontSize = "22px";
      block.style.lineHeight = "1.4";
      block.style.textAlign = "center";
      block.style.padding = "10px 8px";
      block.textContent = m.text;
      mediaArea.appendChild(block);
    } else {
      const block = document.createElement("div");
      block.className = "muted";
      block.textContent = "Media configured but missing src/text.";
      mediaArea.appendChild(block);
    }
  }
}

function revealAnswer() {
  if (session.revealed) return;
  session.revealed = true;
  setHidden($("#answerArea"), false);
  setHidden($("#scoringButtons"), false);
  $("#btnReveal").disabled = true;
}

function mark(correct) {
  if (!session.revealed) return; // force reveal before scoring
  if (correct) {
    session.score += 1;
    session.correct += 1;
  }
  session.index += 1;
  renderCurrentCard();
}

function endGame() {
  const total = session.queue.length;
  const correct = session.correct;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  $("#finalScore").textContent = String(session.score);
  $("#finalCorrect").textContent = String(correct);
  $("#finalTotal").textContent = String(total);
  $("#finalPct").textContent = `${pct}%`;

  showScreen("over");
}

// ---- Bank management ----
async function updateBankStatusInDialog() {
  const n = await countAll();
  $("#dialogBankStatus").textContent = n > 0 ? `Bank contains ${n} question(s).` : "Bank is empty.";
}

async function seedBank() {
  const items = buildSeedQuestions();
  await putMany(items);
}

async function clearBank() {
  await clearAll();
}

// ---- Event wiring ----
function bindEvents() {
  $("#btnShuffleAll").addEventListener("click", async () => startGame({ mode: "all" }));

  $("#btnReveal").addEventListener("click", revealAnswer);
  $("#btnIncorrect").addEventListener("click", () => mark(false));
  $("#btnCorrect").addEventListener("click", () => mark(true));

  $("#btnBackToSelection").addEventListener("click", () => showScreen("selection"));

  $("#btnPlayAgain").addEventListener("click", async () => {
    // play again with the same queue settings is ambiguous; simplest is back to categories
    showScreen("selection");
  });
  $("#btnBackHome").addEventListener("click", () => showScreen("selection"));

  $("#btnResetSession").addEventListener("click", () => {
    session = { queue: [], index: 0, score: 0, correct: 0, revealed: false };
    showScreen("selection");
  });

  // Bank dialog
  const dlg = $("#bankDialog");
  $("#btnManageBank").addEventListener("click", async () => {
    await updateBankStatusInDialog();
    dlg.showModal();
  });

  $("#btnSeedBank").addEventListener("click", async (e) => {
    e.preventDefault(); // keep dialog open
    await seedBank();
    await updateBankStatusInDialog();
    await renderSelection();
  });

  $("#btnClearBank").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm("Clear the entire question bank?")) return;
    await clearBank();
    await updateBankStatusInDialog();
    await renderSelection();
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    const quizActive = screens.quiz.classList.contains("active");
    if (!quizActive) {
      if (e.key.toLowerCase() === "r") {
        session = { queue: [], index: 0, score: 0, correct: 0, revealed: false };
        showScreen("selection");
      }
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      revealAnswer();
    }
    if (e.key === "1") mark(false);
    if (e.key === "2") mark(true);
    if (e.key.toLowerCase() === "r") {
      session = { queue: [], index: 0, score: 0, correct: 0, revealed: false };
      showScreen("selection");
    }
  });
}

async function init() {
  bindEvents();
  await renderSelection();
  showScreen("selection");
}

init();
