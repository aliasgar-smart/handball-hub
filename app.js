if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
const isApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const badge = document.getElementById("appModeBadge");
if (isApp) { badge.textContent = "App Mode ✓"; badge.classList.add("app"); }

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove("show"), 2600);
}

const LS_KEY = "handballhub_v1";
const store = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
if (!store.savedRules) store.savedRules = [];
if (!store.notes) store.notes = [];
if (!store.cache) store.cache = {};
function saveStore() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  };
});

const todayStr = new Date().toISOString().split("T")[0];
const scoreDateEl = document.getElementById("scoreDate");
scoreDateEl.value = todayStr;
let quickMode = "today";

function renderGames(games) {
  const box = document.getElementById("gamesContainer");
  const q = document.getElementById("leagueFilter").value.trim().toLowerCase();
  box.innerHTML = "";
  let list = games || [];
  if (quickMode === "live") list = list.filter(g => ["1H","2H","HT","ET","BT","PT"].includes(g.status?.short));
  else if (quickMode === "ehf") list = list.filter(g => /ehf|european/i.test(g.league?.name || ""));
  else if (quickMode === "ihf") list = list.filter(g => /ihf|world|olympic/i.test(g.league?.name || ""));
  if (q) list = list.filter(g => `${g.league?.name} ${g.teams?.home?.name} ${g.teams?.away?.name} ${g.country?.name}`.toLowerCase().includes(q));
  if (!list.length) { box.innerHTML = `<div class="card"><p class="muted">No matches matched your filter for this date.</p></div>`; return; }
  list.slice(0, 50).forEach(g => {
    const st = g.status?.short || "NS";
    const live = ["1H","2H","HT","ET","BT","PT"].includes(st);
    const ft = ["FT","AET","AP"].includes(st);
    const card = document.createElement("div"); card.className = "match-card";
    card.innerHTML = `<div class="match-top"><span></span><span class="badge ${live?"live":ft?"ft":""}"></span></div><div class="team-row"><span></span><span class="score-num"></span></div><div class="team-row"><span></span><span class="score-num"></span></div>`;
    card.querySelector(".match-top span").textContent = `${g.country?.name || "Int'l"} • ${g.league?.name || "Handball"}`;
    card.querySelector(".badge").textContent = live ? `🔴 ${g.status?.long || st}` : (st === "NS" ? (g.time || "Scheduled") : st);
    const rows = card.querySelectorAll(".team-row");
    rows[0].children[0].textContent = g.teams?.home?.name || "Home";
    rows[0].children[1].textContent = g.scores?.home ?? "-";
    rows[1].children[0].textContent = g.teams?.away?.name || "Away";
    rows[1].children[1].textContent = g.scores?.away ?? "-";
    box.appendChild(card);
  });
}

async function loadGames(force = false) {
  const statusEl = document.getElementById("apiStatusText");
  const dateVal = scoreDateEl.value || todayStr;
  if (!store.apiKey) {
    statusEl.innerHTML = `No API key saved yet. Tap <strong>⚙️ Setup</strong> above to add your free API-Sports key.`;
    document.getElementById("gamesContainer").innerHTML = "";
    return;
  }
  const key = `date_${dateVal}`;
  if (!force && store.cache[key]) { statusEl.textContent = `Cached matches for ${dateVal} (tap Load Scores to refresh).`; renderGames(store.cache[key]); return; }
  statusEl.textContent = "Fetching live handball matches...";
  try {
    const res = await fetch(`https://v1.handball.api-sports.io/games?date=${encodeURIComponent(dateVal)}`, { headers: { "x-apisports-key": store.apiKey } });
    const data = await res.json();
    if (data.errors && Object.keys(data.errors).length) { statusEl.textContent = `API Error: ${Object.values(data.errors).join(" ")}`; return; }
    store.cache[key] = data.response || []; saveStore();
    statusEl.textContent = `Loaded ${store.cache[key].length} matches for ${dateVal}.`;
    renderGames(store.cache[key]);
  } catch { statusEl.textContent = "Network error. Check internet connection."; }
}

document.getElementById("fetchGamesBtn").onclick = () => loadGames(true);
document.getElementById("leagueFilter").oninput = () => renderGames(store.cache[`date_${scoreDateEl.value || todayStr}`] || []);
document.querySelectorAll("[data-quick]").forEach(ch => ch.onclick = () => {
  document.querySelectorAll("[data-quick]").forEach(c => c.classList.remove("active"));
  ch.classList.add("active"); quickMode = ch.dataset.quick;
  renderGames(store.cache[`date_${scoreDateEl.value || todayStr}`] || []);
});

const RULES = [
  { id:"r2", num:"Rule 2:4–2:10", cat:"play", title:"Playing Time, Final Signal & Time-Out", body:"2 × 30 mins. Free throw or 7m awarded before/at final signal must be taken. Up to 3 Team Time-Outs (1 min) per game (max 2/half, max 1 in last 5 mins)." },
  { id:"r5", num:"Rule 5 & 6", cat:"throws", title:"Goalkeeper & 6-Metre Goal Area", body:"Only the goalkeeper may enter the 6m area. Attacker entering with ball = GK throw. Defender entering to gain advantage & stop a clear scoring chance = 7m throw." },
  { id:"r7", num:"Rule 7:1–7:4", cat:"play", title:"3 Steps, 3 Seconds & Double Dribble", body:"Max 3 steps holding the ball, max 3 seconds standing/lying/kneeling. Cannot dribble again after catching a dribble." },
  { id:"r7_11", num:"Rule 7:11–7:12", cat:"play", title:"Passive Play (4-Pass Rule)", body:"After referees raise the forewarning hand signal, the attacking team has max 4 passes to take a shot on goal before a free throw is called." },
  { id:"r8_8", num:"Rule 8:8d/e (2025)", cat:"fouls", title:"Hitting Goalkeeper's / Defender's Head", body:"July 2025 amendment: An unhindered shot hitting a stationary goalkeeper's head (GK did not move head toward ball) is a 2-minute suspension instead of direct red card. Same for free-throw after final signal hitting stationary defender's head." },
  { id:"r8_10", num:"Rule 8:10c/d", cat:"fouls", title:"Last 30 Seconds — Red + Blue + 7m", body:"Preventing/delaying a throw or fouling to stop a clear chance/fast break in the last 30 seconds results in Red Card + Blue Card (written report) + 7m throw." },
  { id:"r10", num:"Rule 10", cat:"throws", title:"Throw-Off Area", body:"Taken inside the center circle area within 3 seconds of whistle while at least one foot remains inside the throw-off area." },
  { id:"r14", num:"Rule 14", cat:"throws", title:"7-Metre Throw Criteria", body:"Awarded when a clear chance of scoring is illegally destroyed anywhere on court, unwarranted whistle stops a clear chance, or defender enters goal area for advantage." },
  { id:"r16", num:"Rule 16", cat:"fouls", title:"Yellow, 2-Min, Red & Blue Cards", body:"Yellow: max 1/player, 3/team. 3rd 2-min suspension = Red Card. Direct Red: excluded for game (team short 2 mins). Blue: written report follows Red Card." }
];

let ruleCat = "all";
function renderRules() {
  const q = document.getElementById("ruleSearch").value.trim().toLowerCase();
  const box = document.getElementById("rulesContainer"); box.innerHTML = "";
  const list = RULES.filter(r => (ruleCat === "all" || (ruleCat === "saved" ? store.savedRules.includes(r.id) : r.cat === ruleCat)) && (!q || `${r.num} ${r.title} ${r.body}`.toLowerCase().includes(q)));
  if (!list.length) { box.innerHTML = `<div class="card"><p class="muted">No rules matched.</p></div>`; return; }
  list.forEach(r => {
    const saved = store.savedRules.includes(r.id);
    const c = document.createElement("div"); c.className = "rule-card";
    c.innerHTML = `<div class="rule-head"><span class="rule-num">${r.num}</span><button class="bookmark-btn">${saved?"⭐":"☆"}</button></div><div class="rule-title">${r.title}</div><div class="rule-body">${r.body}</div>`;
    c.querySelector(".bookmark-btn").onclick = () => {
      store.savedRules = saved ? store.savedRules.filter(x => x !== r.id) : [...store.savedRules, r.id];
      saveStore(); renderRules();
    };
    box.appendChild(c);
  });
}

document.getElementById("ruleSearch").oninput = renderRules;
document.querySelectorAll("#ruleCategoryChips .chip").forEach(ch => ch.onclick = () => {
  document.querySelectorAll("#ruleCategoryChips .chip").forEach(c => c.classList.remove("active"));
  ch.classList.add("active"); ruleCat = ch.dataset.cat; renderRules();
});

function renderNotes() {
  const box = document.getElementById("notesContainer"); box.innerHTML = "";
  if (!store.notes.length) { box.innerHTML = `<div class="card"><p class="muted">No review notes yet.</p></div>`; return; }
  store.notes.forEach(n => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="card-title"><span></span><button class="btn btn-secondary" style="padding:4px 10px;font-size:0.75rem;">Delete</button></div><p class="muted"></p><small style="color:var(--accent);display:block;margin-top:6px;"></small>`;
    card.querySelector(".card-title span").textContent = n.match;
    card.querySelector("p").textContent = n.body;
    card.querySelector("small").textContent = n.date;
    card.querySelector("button").onclick = () => { store.notes = store.notes.filter(x => x.id !== n.id); saveStore(); renderNotes(); };
    box.appendChild(card);
  });
}

document.getElementById("saveNoteBtn").onclick = () => {
  const m = document.getElementById("noteMatchInput").value.trim(), b = document.getElementById("noteBodyInput").value.trim();
  if (!m || !b) return showToast("Enter both match/topic and note.");
  store.notes.unshift({ id: Date.now(), match: m, body: b, date: new Date().toLocaleDateString() });
  document.getElementById("noteMatchInput").value = ""; document.getElementById("noteBodyInput").value = "";
  saveStore(); renderNotes(); showToast("Review note saved!");
};

if (store.apiKey) document.getElementById("apiKeyInput").value = store.apiKey;
document.getElementById("saveKeyBtn").onclick = () => {
  const k = document.getElementById("apiKeyInput").value.trim();
  if (!k) return showToast("Paste an API key first.");
  store.apiKey = k; saveStore(); showToast("API key saved!"); loadGames(true);
};
document.getElementById("clearKeyBtn").onclick = () => { delete store.apiKey; document.getElementById("apiKeyInput").value = ""; saveStore(); loadGames(); showToast("Key cleared."); };

function dlIcon(size, name) {
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const ctx = c.getContext("2d"), g = ctx.createLinearGradient(0,0,size,size);
  g.addColorStop(0,"#f97316"); g.addColorStop(1,"#0b1220");
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
  ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(size*0.45)}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🤾", size/2, size/2);
  c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }, "image/png");
}

document.getElementById("downloadIconsBtn").onclick = () => {
  dlIcon(192, "icon-192.png");
  setTimeout(() => dlIcon(512, "icon-512.png"), 450);
  showToast("Downloading icon-192.png & icon-512.png!");
};

loadGames(false); renderRules(); renderNotes();
