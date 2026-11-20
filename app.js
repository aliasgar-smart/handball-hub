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

const LS_KEY = "handballhub_v2";
const store = JSON.parse(localStorage.getItem(LS_KEY) || localStorage.getItem("handballhub_v1") || "{}");
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

function dateStrOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function prettyDate(ymd) {
  const t0 = dateStrOffset(0), t1 = dateStrOffset(1), tm1 = dateStrOffset(-1);
  const [y, m, d] = ymd.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (ymd === t0) return `📅 ${label} (Today)`;
  if (ymd === t1) return `📅 ${label} (Tomorrow)`;
  if (ymd === tm1) return `📅 ${label} (Yesterday)`;
  return `📅 ${label}`;
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let viewMode = "calendar", quickMode = "all", maxDayOffset = 3, currentGames = [];

function renderGroupedGames(games) {
  const box = document.getElementById("gamesContainer");
  const q = document.getElementById("leagueFilter").value.trim().toLowerCase();
  box.innerHTML = "";
  let list = games || [];
  if (quickMode === "live") list = list.filter(g => ["1H","2H","HT","ET","BT","PT"].includes(g.status?.short));
  else if (quickMode === "ehf") list = list.filter(g => /ehf|european/i.test(g.league?.name || ""));
  else if (quickMode === "ihf") list = list.filter(g => /ihf|world|olympic/i.test(g.league?.name || ""));
  if (q) list = list.filter(g => `${g.league?.name} ${g.teams?.home?.name} ${g.teams?.away?.name} ${g.country?.name}`.toLowerCase().includes(q));

  if (!list.length) {
    box.innerHTML = `<div class="card"><p class="muted">No matches found in this date range. Tap <strong>➕ Load Next 5 Days</strong> or check the Official Match Centers below.</p></div>`;
    return;
  }

  const groups = {};
  list.forEach(g => {
    const dk = (g.date || "").slice(0, 10) || "Unknown";
    if (!groups[dk]) groups[dk] = [];
    groups[dk].push(g);
  });

  Object.keys(groups).sort().forEach(dk => {
    const dayGames = groups[dk].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const hdr = document.createElement("div"); hdr.className = "date-header";
    hdr.innerHTML = `<span>${prettyDate(dk)}</span><span>${dayGames.length} match${dayGames.length>1?"es":""}</span>`;
    box.appendChild(hdr);

    dayGames.slice(0, 35).forEach(g => {
      const st = g.status?.short || "NS";
      const live = ["1H","2H","HT","ET","BT","PT"].includes(st);
      const ft = ["FT","AET","AP"].includes(st);
      const card = document.createElement("div"); card.className = "match-card";
      card.innerHTML = `<div class="match-top"><span></span><span class="badge ${live?"live":ft?"ft":""}"></span></div><div class="team-row"><span></span><span class="score-num"></span></div><div class="team-row"><span></span><span class="score-num"></span></div>`;
      card.querySelector(".match-top span").textContent = `${g.country?.name || "Int'l"} • ${g.league?.name || "Handball"}`;
      card.querySelector(".badge").textContent = live ? `🔴 ${g.status?.long || st}` : (st === "NS" ? (g.time || "Scheduled") : `${st} ${g.time || ""}`);
      const rows = card.querySelectorAll(".team-row");
      rows[0].children[0].textContent = g.teams?.home?.name || "Home";
      rows[0].children[1].textContent = g.scores?.home ?? "-";
      rows[1].children[0].textContent = g.teams?.away?.name || "Away";
      rows[1].children[1].textContent = g.scores?.away ?? "-";
      box.appendChild(card);
    });
  });
}

async function apiGet(path) {
  const res = await fetch(`https://v1.handball.api-sports.io/${path}`, { headers: { "x-apisports-key": store.apiKey } });
  return res.json();
}

async function loadCalendar(force = false) {
  const statusEl = document.getElementById("apiStatusText");
  const moreBtn = document.getElementById("moreDaysBtn");
  if (!store.apiKey) {
    statusEl.innerHTML = `Use the <strong>Official Match Centers</strong> below for free live IHF &amp; EHF scores, or add an API key in <strong>⚙️ Setup</strong>.`;
    moreBtn.style.display = "none";
    document.getElementById("gamesContainer").innerHTML = "";
    return;
  }
  moreBtn.style.display = "inline-flex";
  const dates = [];
  for (let i = -1; i <= maxDayOffset; i++) dates.push(dateStrOffset(i));
  statusEl.textContent = "Loading match dates...";
  const all = [];
  try {
    for (const d of dates) {
      const ck = `d_${d}_${tz}`;
      if (!force && store.cache[ck]) { all.push(...store.cache[ck]); continue; }
      const data = await apiGet(`games?date=${d}&timezone=${encodeURIComponent(tz)}`);
      if (data.errors && Object.keys(data.errors).length) { statusEl.textContent = `API Notice: ${Object.values(data.errors).join(" ")}`; break; }
      store.cache[ck] = data.response || [];
      all.push(...store.cache[ck]);
      await new Promise(r => setTimeout(r, 180));
    }
    saveStore(); currentGames = all;
    const activeDates = new Set(all.map(g => (g.date || "").slice(0, 10))).size;
    statusEl.textContent = `Found ${all.length} matches across ${activeDates} dates.`;
    renderGroupedGames(currentGames);
  } catch { statusEl.textContent = "Network error. Check internet connection."; }
}

async function loadLeaguesList() {
  const sel = document.getElementById("leagueSelect");
  if (!store.apiKey) return;
  if (!store.leagues) {
    try {
      const data = await apiGet("leagues");
      if (data.response) {
        store.leagues = data.response.map(x => ({
          id: x.league.id, name: `${x.country?.name || "Int'l"}: ${x.league.name}`,
          season: (x.seasons?.find(s => s.current) || x.seasons?.[x.seasons.length - 1])?.season || new Date().getFullYear()
        })).sort((a, b) => (/ehf|ihf|world|champions/i.test(b.name)?1:0) - (/ehf|ihf|world|champions/i.test(a.name)?1:0) || a.name.localeCompare(b.name));
        saveStore();
      }
    } catch {}
  }
  sel.innerHTML = "";
  (store.leagues || []).forEach(l => {
    const o = document.createElement("option"); o.value = `${l.id}|${l.season}`; o.textContent = `${l.name} (${l.season})`;
    sel.appendChild(o);
  });
}

async function loadLeagueGames() {
  const val = document.getElementById("leagueSelect").value;
  const statusEl = document.getElementById("apiStatusText");
  if (!val || !store.apiKey) return;
  const [id, season] = val.split("|");
  statusEl.textContent = "Loading competition dates...";
  try {
    const data = await apiGet(`games?league=${id}&season=${season}&timezone=${encodeURIComponent(tz)}`);
    if (data.errors && Object.keys(data.errors).length) { statusEl.textContent = `API Notice: ${Object.values(data.errors).join(" ")}`; return; }
    currentGames = data.response || [];
    const today = dateStrOffset(-3);
    const upcoming = currentGames.filter(g => (g.date || "").slice(0, 10) >= today);
    const list = upcoming.length ? upcoming : currentGames.slice(-40);
    statusEl.textContent = `Showing ${list.length} matches for this competition.`;
    renderGroupedGames(list);
  } catch { statusEl.textContent = "Network error loading league."; }
}

document.querySelectorAll(".view-btn").forEach(b => b.onclick = () => {
  document.querySelectorAll(".view-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); viewMode = b.dataset.mode;
  document.getElementById("leaguePickerBox").style.display = viewMode === "league" ? "block" : "none";
  document.getElementById("moreDaysBtn").style.display = (viewMode === "calendar" && store.apiKey) ? "inline-flex" : "none";
  if (viewMode === "league") loadLeaguesList(); else loadCalendar(false);
});

document.getElementById("refreshScheduleBtn").onclick = () => viewMode === "calendar" ? loadCalendar(true) : loadLeagueGames();
document.getElementById("loadLeagueBtn").onclick = loadLeagueGames;
document.getElementById("moreDaysBtn").onclick = () => { maxDayOffset += 5; loadCalendar(false); };
document.getElementById("leagueFilter").oninput = () => renderGroupedGames(currentGames);
document.querySelectorAll("[data-quick]").forEach(ch => ch.onclick = () => {
  document.querySelectorAll("[data-quick]").forEach(c => c.classList.remove("active"));
  ch.classList.add("active"); quickMode = ch.dataset.quick;
  renderGroupedGames(currentGames);
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
  store.apiKey = k; saveStore(); showToast("API key saved!"); loadCalendar(true);
};
document.getElementById("clearKeyBtn").onclick = () => {
  delete store.apiKey; document.getElementById("apiKeyInput").value = ""; saveStore(); loadCalendar(); showToast("Key cleared.");
};

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

loadCalendar(false); renderRules(); renderNotes();
