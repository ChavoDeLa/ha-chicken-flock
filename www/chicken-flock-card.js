/**
 * Chicken Flock Card — Lovelace custom element
 * config/www/chicken-flock-card.js?v=26
 */

const DOMAIN = "chicken_flock";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const BAR_COLORS = ["#1a6b4a","#2563eb","#0891b2","#7c3aed","#059669","#d97706","#dc2626","#0284c7","#4f46e5","#0d9488"];

// ─── Theme system ────────────────────────────────────────────────────────────────

const THEME_KEY = "flock_card_theme";

const PRESETS = {
  green: {
    name: "Forest Green",
    accent:    "#1a6b4a",
    accentDark:"#0f4f36",
    accentLight:"#d1fae5",
    accentText: "#065f46",
    highlight:  "#1a6b4a",
    badgeEgg:   "#dbeafe",
    badgeEggText:"#1e40af",
  },
  blue: {
    name: "Ocean Blue",
    accent:    "#1d4ed8",
    accentDark:"#1e3a8a",
    accentLight:"#dbeafe",
    accentText: "#1e40af",
    highlight:  "#1d4ed8",
    badgeEgg:   "#dcfce7",
    badgeEggText:"#166534",
  },
  teal: {
    name: "Deep Teal",
    accent:    "#0f766e",
    accentDark:"#115e59",
    accentLight:"#ccfbf1",
    accentText: "#134e4a",
    highlight:  "#0f766e",
    badgeEgg:   "#dbeafe",
    badgeEggText:"#1e40af",
  },
  purple: {
    name: "Violet",
    accent:    "#6d28d9",
    accentDark:"#4c1d95",
    accentLight:"#ede9fe",
    accentText: "#4c1d95",
    highlight:  "#6d28d9",
    badgeEgg:   "#dbeafe",
    badgeEggText:"#1e40af",
  },
  slate: {
    name: "Slate",
    accent:    "#334155",
    accentDark:"#1e293b",
    accentLight:"#e2e8f0",
    accentText: "#1e293b",
    highlight:  "#334155",
    badgeEgg:   "#dbeafe",
    badgeEggText:"#1e40af",
  },
  custom: {
    name: "Custom",
    accent:    "#1a6b4a",
    accentDark:"#0f4f36",
    accentLight:"#d1fae5",
    accentText: "#065f46",
    highlight:  "#1a6b4a",
    badgeEgg:   "#dbeafe",
    badgeEggText:"#1e40af",
  },
};

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return {...PRESETS.green, ...JSON.parse(saved)};
  } catch(e) {}
  return {...PRESETS.green};
}

function saveTheme(t) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch(e) {}
}

function applyTheme(shadowRoot, t) {
  let s = shadowRoot.querySelector("#fc-theme-vars");
  if (!s) { s = document.createElement("style"); s.id = "fc-theme-vars"; shadowRoot.appendChild(s); }
  s.textContent = `:host {
    --fc-accent:       ${t.accent};
    --fc-accent-dark:  ${t.accentDark};
    --fc-accent-light: ${t.accentLight};
    --fc-accent-text:  ${t.accentText};
    --fc-highlight:    ${t.highlight};
    --fc-badge-egg:    ${t.badgeEgg};
    --fc-badge-egg-t:  ${t.badgeEggText};
  }`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function toSlug(n){return n.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");}
function isoToday(){return new Date().toISOString().slice(0,10);}
function isoYear(){return new Date().toISOString().slice(0,4);}
function isoMonth(){return new Date().toISOString().slice(0,7);}
function isoWeekStart(){const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().slice(0,10);}
function getAge(birth,death){
  if(!birth)return null;
  const end=death?new Date(death):new Date();
  const mo=(end.getFullYear()-new Date(birth).getFullYear())*12+(end.getMonth()-new Date(birth).getMonth());
  return mo<24?`${mo} mo`:`${Math.floor(mo/12)} yr`;
}
function fmtShort(iso){const[,m,d]=iso.split("-");return`${MONTHS[+m-1]} ${+d}`;}
function fmtFull(iso){const[y,m,d]=iso.split("-");return`${MONTHS[+m-1]} ${+d} ${y}`;}
function monthKey(iso){return iso.slice(0,7);}
function yearKey(iso){return iso.slice(0,4);}
function weekKey(iso){const d=new Date(iso);d.setDate(d.getDate()-d.getDay());return d.toISOString().slice(0,10);}
function sumByChicken(days){const t={};for(const d of days)for(const[n,c]of Object.entries(d.per_chicken||{}))t[n]=(t[n]||0)+c;return t;}
function topN(obj,n=5){return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([name,count])=>({name,count}));}

function exportCSV(history){
  if(!history.length)return;
  const ns=new Set();history.forEach(d=>Object.keys(d.per_chicken||{}).forEach(n=>ns.add(n)));
  const names=[...ns].sort();
  const rows=history.map(d=>[d.date,d.total,...names.map(n=>d.per_chicken?.[n]??0)].join(","));
  const csv=[["date","total",...names].join(","),...rows].join("\n");
  _download(csv, `flock_eggs_${isoToday()}.csv`, "text/csv");
}

function exportJSON(history, chickens){
  const data = {
    exported: new Date().toISOString(),
    flock: Object.values(chickens).map(c=>({
      name:c.name, sex:c.sex, breed:c.breed, birthdate:c.birthdate,
      deathdate:c.deathdate, active:c.active, track_eggs:c.track_eggs, notes:c.notes
    })),
    daily_log: {}
  };
  history.forEach(d=>{ data.daily_log[d.date] = d.per_chicken; });
  _download(JSON.stringify(data,null,2), `flock_export_${isoToday()}.json`, "application/json");
}

function backupStorage(hass){
  // Trigger HA to return the raw storage data via the roster sensor attributes
  // We reconstruct a full backup from what the card knows
  const roster = hass.states["sensor.flock_roster"]?.attributes?.chickens || [];
  const history = hass.states["sensor.flock_egg_history"]?.attributes?.recent_days || [];
  const backup = {
    backup_date: new Date().toISOString(),
    version: "1.1.0",
    chickens: roster,
    daily_log: {}
  };
  history.forEach(d=>{ backup.daily_log[d.date] = d.per_chicken; });
  _download(JSON.stringify(backup,null,2), `flock_backup_${isoToday()}.json`, "application/json");
}

function _download(content, filename, type){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=filename; a.click();
}

async function restoreFromFile(hass, file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        // Validate structure
        if (!data.chickens || !data.daily_log) {
          reject(new Error("Invalid backup file — missing chickens or daily_log"));
          return;
        }
        resolve(data);
      } catch(err) {
        reject(new Error("Could not parse file: " + err.message));
      }
    };
    reader.readAsText(file);
  });
}


// ─── Design tokens ────────────────────────────────────────────────────────────
// Warm farmstead palette — works over HA's light and dark themes

const CARD_STYLES = `
  :host { display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Card shell ── */
  .fc {
    background: var(--card-background-color, #ffffff);
    border-radius: 12px;
    overflow: hidden;
    color: var(--primary-text-color, #111111);
  }

  /* ── Header ── */
  .fc-header {
    background: linear-gradient(135deg, var(--fc-accent) 0%, var(--fc-accent-dark) 100%);
    padding: 16px 18px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .fc-header-left { flex: 1; min-width: 0; }
  .fc-title {
    font-size: 16px; font-weight: 600; color: #ffffff;
    display: flex; align-items: center; gap: 8px; letter-spacing: -.01em;
  }
  .fc-subtitle { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 2px; }
  .fc-header-actions { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }

  .hbtn {
    cursor: pointer; border: 1px solid rgba(255,255,255,.25); border-radius: 6px;
    background: rgba(255,255,255,.1); color: #ffffff; font-size: 11px;
    padding: 5px 11px; font-family: inherit; transition: background .15s; white-space: nowrap;
  }
  .hbtn:hover { background: rgba(255,255,255,.2); }
  .hbtn.add { background: rgba(255,255,255,.18); font-weight: 600; }
  .hbtn.danger { border-color: rgba(255,120,100,.5); color: #ffb3a7; }
  .hbtn.danger:hover { background: rgba(255,80,60,.2); }

  /* ── Stats strip ── */
  .fc-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    background: var(--secondary-background-color, #f8f9fa);
    border-bottom: 1px solid var(--divider-color, #e5e7eb);
  }
  .fc-stat {
    padding: 12px 14px; border-right: 1px solid var(--divider-color, #e5e7eb); text-align: center;
  }
  .fc-stat:last-child { border-right: none; }
  .fc-stat-val { font-size: 22px; font-weight: 700; color: var(--fc-accent); line-height: 1; }
  .fc-stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }

  /* ── Tabs ── */
  .fc-tabs {
    display: flex; background: var(--secondary-background-color, #f8f9fa);
    border-bottom: 1px solid var(--divider-color, #e5e7eb);
    padding: 0 16px;
  }
  .fc-tab {
    font-size: 12px; padding: 10px 14px 9px; cursor: pointer; border: none;
    background: none; color: #6b7280; border-bottom: 2px solid transparent;
    margin-bottom: -1px; font-family: inherit; font-weight: 500;
    text-transform: uppercase; letter-spacing: .04em; transition: color .15s;
  }
  .fc-tab.on { color: var(--fc-accent); border-bottom-color: var(--fc-accent); }
  .fc-tab:hover:not(.on) { color: var(--fc-highlight); }

  /* ── Body ── */
  .fc-body { padding: 16px; background: var(--card-background-color, #ffffff); }

  /* ── Flock grid ── */
  .flock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; }

  .ch-card {
    background: var(--card-background-color, #ffffff);
    border: 1px solid var(--divider-color, #e5e7eb);
    border-radius: 10px; overflow: hidden;
    transition: box-shadow .2s, transform .15s;
  }
  .ch-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); transform: translateY(-1px); }
  .ch-card.dim { opacity: .45; }

  .ch-card-inner { display: flex; }
  .ch-accent { width: 3px; flex-shrink: 0; }
  .ch-content { flex: 1; padding: 12px 14px; min-width: 0; }

  .ch-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
  .ch-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ch-avatar {
    width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 19px; border: 1px solid var(--divider-color, #e5e7eb);
    overflow: hidden; background: var(--secondary-background-color, #f8f9fa);
  }
  .ch-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .ch-name { font-size: 14px; font-weight: 600; color: var(--primary-text-color, #111); line-height: 1.2; }
  .ch-breed { font-size: 11px; color: #6b7280; margin-top: 2px; }

  .edit-btn {
    font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer;
    border: 1px solid var(--divider-color, #e5e7eb);
    background: var(--secondary-background-color, #f8f9fa);
    color: #374151; flex-shrink: 0; font-family: inherit; transition: background .15s;
  }
  .edit-btn:hover { background: var(--divider-color, #e5e7eb); }

  .ch-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 7px; }
  .badge { font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 600; letter-spacing: .02em; }
  .b-active  { background: var(--fc-accent-light); color: var(--fc-accent-text); }
  .b-inactive { background: #f3f4f6; color: #6b7280; }
  .b-eggs    { background: var(--fc-badge-egg); color: var(--fc-badge-egg-t); }
  .b-dead    { background: #fee2e2; color: #991b1b; }
  .b-molt    { background: #ede9fe; color: #4c1d95; }

  .ch-meta  { font-size: 11px; color: #6b7280; margin-bottom: 5px; }
  .ch-notes { font-size: 11px; color: #9ca3af; font-style: italic; margin-bottom: 7px; line-height: 1.4; }

  .counter-row {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 9px; border-top: 1px solid var(--divider-color, #e5e7eb); margin-top: 4px;
  }
  .counter-left { display: flex; align-items: center; gap: 8px; }
  .egg-thumb { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; border: 1px solid var(--divider-color, #e5e7eb); flex-shrink: 0; }
  .egg-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .counter-label { font-size: 11px; color: #6b7280; }
  .eid { font-size: 9px; color: #9ca3af; font-family: monospace; margin-top: 1px; }
  .cnt-row { display: flex; align-items: center; gap: 8px; }
  .cnt-btn {
    width: 28px; height: 28px; border-radius: 50%;
    border: 1.5px solid var(--fc-accent); background: transparent; cursor: pointer;
    font-size: 17px; display: flex; align-items: center; justify-content: center;
    color: var(--fc-accent); transition: all .15s; line-height: 1;
  }
  .cnt-btn:hover { background: var(--fc-accent); color: #ffffff; }
  .cnt-val { font-size: 17px; font-weight: 700; min-width: 26px; text-align: center; color: var(--primary-text-color, #111); }

  .fc-empty { text-align: center; padding: 3rem 1rem; color: #9ca3af; font-size: 13px; }
  .fc-empty-icon { font-size: 36px; margin-bottom: 10px; opacity: .4; }

  .flock-controls {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 8px; margin-bottom: 12px;
    padding-bottom: 10px; border-bottom: 1px solid var(--divider-color, #e5e7eb);
  }
  .flock-sort-group { display: flex; align-items: center; gap: 6px; }
  .flock-ctrl-label { font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .sort-pill {
    font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer;
    border: 1px solid var(--divider-color, #e5e7eb);
    background: transparent; color: #6b7280; font-family: inherit; transition: all .15s;
  }
  .sort-pill:hover { border-color: var(--fc-accent); color: var(--fc-accent); }
  .sort-pill.on { background: var(--fc-accent); border-color: var(--fc-accent); color: #fff; font-weight: 600; }
  .rooster-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .rooster-toggle input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--fc-accent); cursor: pointer; }
  .rooster-toggle-label { font-size: 12px; color: #6b7280; }

  /* ── Stats ── */
  .sec-label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; margin-bottom: 18px; }
  .kpi { background: var(--secondary-background-color, #f8f9fa); border-radius: 8px; padding: 11px 13px; border: 1px solid var(--divider-color, #e5e7eb); }
  .kpi-val { font-size: 24px; font-weight: 700; color: var(--fc-accent); line-height: 1; }
  .kpi-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .05em; }
  .kpi-sub { font-size: 10px; color: #9ca3af; margin-top: 2px; }

  .lb { display: flex; flex-direction: column; gap: 7px; }
  .lb-row { display: flex; align-items: center; gap: 8px; }
  .lb-rank { font-size: 13px; width: 22px; text-align: center; flex-shrink: 0; }
  .lb-name { font-size: 13px; flex: 1; }
  .lb-bar-wrap { width: 110px; flex-shrink: 0; }
  .lb-bar-track { background: var(--divider-color, #e5e7eb); border-radius: 3px; height: 7px; overflow: hidden; }
  .lb-bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }
  .lb-count { font-size: 12px; font-weight: 600; width: 36px; text-align: right; flex-shrink: 0; color: var(--fc-accent); }

  .lb-box { background: var(--secondary-background-color, #f8f9fa); border-radius: 10px; padding: 13px 15px; margin-bottom: 10px; border: 1px solid var(--divider-color, #e5e7eb); }
  .lb-box-title { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 10px; }

  .pills { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
  .pill {
    font-size: 11px; padding: 4px 11px; border-radius: 5px; cursor: pointer;
    border: 1px solid var(--divider-color, #e5e7eb);
    background: transparent; color: #6b7280; font-family: inherit; transition: all .15s;
  }
  .pill:hover { border-color: var(--fc-accent); color: var(--fc-accent); }
  .pill.on { background: var(--fc-accent); border-color: var(--fc-accent); color: #ffffff; font-weight: 600; }

  .hen-table { width: 100%; border-collapse: collapse; }
  .hen-table th { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; padding: 0 8px 8px; text-align: right; border-bottom: 1px solid var(--divider-color, #e5e7eb); }
  .hen-table th:first-child { text-align: left; padding-left: 0; }
  .hen-table td { padding: 6px 8px; font-size: 12px; text-align: right; border-bottom: 1px solid var(--secondary-background-color, #f8f9fa); color: var(--primary-text-color, #111); }
  .hen-table td:first-child { text-align: left; padding-left: 0; font-weight: 600; }
  .hen-table tr:last-child td { border-bottom: none; }
  .hen-table tr:hover td { background: rgba(26,107,74,.04); }
  .td-today { font-weight: 700; color: var(--fc-accent); }

  /* ── History ── */
  .hc-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
  .h-scroll { max-height: 480px; overflow-y: auto; padding-right: 2px; }
  .bar-chart { display: flex; flex-direction: column; gap: 5px; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-date { font-size: 11px; color: #6b7280; width: 80px; flex-shrink: 0; }
  .bar-track { flex: 1; background: var(--secondary-background-color, #f3f4f6); border-radius: 4px; height: 13px; position: relative; overflow: hidden; cursor: pointer; }
  .bar-seg { position: absolute; height: 100%; top: 0; }
  .bar-total { font-size: 11px; font-weight: 600; width: 28px; text-align: right; flex-shrink: 0; color: var(--primary-text-color, #111); }
  .bar-track:hover::after {
    content: attr(data-tip); position: absolute; right: 0; top: -28px;
    background: #111827; color: #ffffff; font-size: 10px; padding: 3px 7px;
    border-radius: 4px; white-space: nowrap; z-index: 20; pointer-events: none;
  }
  .psep { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .07em; padding: 8px 0 4px; border-top: 1px solid var(--divider-color, #e5e7eb); margin-top: 4px; }
  .psep:first-child { border-top: none; margin-top: 0; padding-top: 0; }
  .hsum { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
  .hsum-item { font-size: 12px; color: #6b7280; }
  .hsum-item b { color: var(--primary-text-color, #111); font-weight: 600; }
  .legend { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
  .leg-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6b7280; }
  .leg-sw { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
  .sel-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select.psel {
    font-size: 12px; padding: 4px 8px; border-radius: 6px;
    border: 1px solid var(--divider-color, #e5e7eb);
    background: var(--card-background-color, #ffffff);
    color: var(--primary-text-color, #111); font-family: inherit; cursor: pointer;
  }
  select.psel:focus { outline: none; border-color: var(--fc-accent); }
  .no-data { text-align: center; padding: 2.5rem; font-size: 13px; color: #9ca3af; }

  /* ── Export / Backup ── */
  .backup-section { margin-bottom: 18px; }
  .backup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .backup-card {
    background: var(--secondary-background-color, #f8f9fa);
    border: 1px solid var(--divider-color, #e5e7eb); border-radius: 10px;
    padding: 14px 16px; text-align: center; cursor: pointer; transition: all .15s;
  }
  .backup-card:hover { border-color: var(--fc-accent); box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  .backup-card-icon { font-size: 26px; margin-bottom: 6px; }
  .backup-card-title { font-size: 13px; font-weight: 600; color: var(--primary-text-color, #111); margin-bottom: 3px; }
  .backup-card-sub { font-size: 11px; color: #6b7280; line-height: 1.4; }
  .backup-card.restore-card { border-color: #3b82f6; }
  .backup-card.restore-card:hover { border-color: #1d4ed8; box-shadow: 0 2px 8px rgba(59,130,246,.15); }
  .restore-input { display: none; }
  #restore-status { font-size: 12px; margin-top: 10px; padding: 8px 12px; border-radius: 7px; display: none; }
  #restore-status.ok { background: var(--fc-accent-light); color: var(--fc-accent-text); border: 1px solid var(--fc-accent); }
  #restore-status.err { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

  /* ── Settings ── */
  .settings-section { margin-bottom: 22px; }
  .settings-section-title {
    font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;
    letter-spacing: .08em; margin-bottom: 12px; padding-bottom: 6px;
    border-bottom: 1px solid var(--divider-color, #e5e7eb);
  }
  .preset-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .preset-swatch {
    width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
    border: 3px solid transparent; transition: all .15s; flex-shrink: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,.15);
  }
  .preset-swatch.active { border-color: var(--primary-text-color, #111); transform: scale(1.15); }
  .preset-swatch:hover:not(.active) { transform: scale(1.1); }
  .preset-label { font-size: 11px; color: #6b7280; margin-top: 4px; text-align: center; }
  .preset-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }

  .color-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid var(--secondary-background-color, #f3f4f6);
  }
  .color-row:last-child { border-bottom: none; }
  .color-row-label { font-size: 13px; color: var(--primary-text-color, #111); }
  .color-row-sub { font-size: 11px; color: #6b7280; margin-top: 1px; }
  .color-input-wrap { display: flex; align-items: center; gap: 8px; }
  .color-input-wrap input[type="color"] {
    width: 36px; height: 28px; border: 1px solid var(--divider-color, #e5e7eb);
    border-radius: 6px; cursor: pointer; padding: 1px 2px; background: none;
  }
  .color-hex {
    font-size: 11px; font-family: monospace; color: #6b7280;
    width: 58px; padding: 3px 6px; border: 1px solid var(--divider-color, #e5e7eb);
    border-radius: 5px; background: var(--secondary-background-color, #f8f9fa);
    color: var(--primary-text-color, #111);
  }
  .settings-btn {
    font-size: 12px; padding: 7px 16px; border-radius: 7px; cursor: pointer;
    border: 1px solid var(--divider-color, #e5e7eb); font-family: inherit;
    background: var(--secondary-background-color, #f8f9fa);
    color: var(--primary-text-color, #111); transition: background .15s;
  }
  .settings-btn:hover { background: var(--divider-color, #e5e7eb); }
  .settings-btn.primary {
    background: var(--fc-accent); color: #fff; border-color: var(--fc-accent);
  }
  .settings-btn.primary:hover { opacity: .88; }
  .settings-actions { display: flex; gap: 8px; margin-top: 14px; }
  .theme-preview {
    height: 8px; border-radius: 4px; margin-top: 10px;
    background: linear-gradient(90deg, var(--fc-accent) 0%, var(--fc-accent-dark) 50%, var(--fc-accent-light) 100%);
  }
`;

const FlockModal = (() => {
  let _el = null;      // the root div on document.body
  let _r = {};         // cached input refs
  let _hass = null;    // kept current via updateHass(), never triggers field reset
  let _chickenId = null;
  let _open = false;
  // Photo state — module-level so open() and save() can both access
  let _photoData = null;
  let _photoDelete = false;
  let _photoFilename = "photo.jpg";
  let photoInput = null;
  let photoPreview = null;
  let photoRemove = null;
  let photoStatus = null;
  // Egg photo state
  let _eggPhotoData = null;
  let _eggPhotoDelete = false;
  let _eggPhotoFilename = "egg.jpg";
  let eggPhotoInput = null;
  let eggPhotoPreview = null;
  let eggPhotoRemove = null;
  let eggPhotoStatus = null;

  function _init() {
    if (_el) return;

    const style = document.createElement("style");
    style.textContent = `
      .fm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;
        align-items:center;justify-content:center;z-index:999999;padding:16px;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      .fm-overlay.fm-hidden{display:none!important}
      .fm-box{background:#fff;border-radius:14px;width:380px;max-width:100%;
        max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);
        color:#111}
      @media(prefers-color-scheme:dark){
        .fm-box{background:#1c1c1e;color:#f0f0f0}
        .fm-sep{border-color:#333!important}
        .fm-field input,.fm-field select,.fm-field textarea
          {background:#2c2c2e!important;border-color:#444!important;color:#f0f0f0!important}
        .fm-tog-track{background:#444!important}
        .fm-hint{background:#2c2c2e!important;color:#aaa!important}
        .fm-hint-off{color:#888!important}
        .fm-footer{border-color:#333!important}
        .fm-actions{border-color:#333!important}
      }
      .fm-header{padding:18px 20px 0;display:flex;align-items:center;justify-content:space-between}
      .fm-title{font-size:17px;font-weight:600;letter-spacing:-.01em}
      .fm-body{padding:16px 20px}
      .fm-field{margin-bottom:11px}
      .fm-field label{display:block;font-size:11px;font-weight:500;color:#888;
        text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
      .fm-field input,.fm-field select,.fm-field textarea{
        width:100%;padding:9px 11px;border-radius:9px;border:1px solid #ddd;
        background:#fff;color:#111;font-size:14px;font-family:inherit;
        box-sizing:border-box;outline:none;transition:border-color .15s}
      .fm-field input:focus,.fm-field select:focus,.fm-field textarea:focus
        {border-color:#639922}
      .fm-field textarea{height:64px;resize:vertical}
      .fm-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .fm-sep{border:none;border-top:1px solid #eee;margin:12px 0 4px}
      .fm-toggle-row{display:flex;align-items:center;justify-content:space-between;
        padding:9px 0;border-top:1px solid #eee}
      .fm-toggle-row:first-of-type{border-top:none}
      .fm-toggle-lbl{font-size:14px}
      .fm-tog{position:relative;width:40px;height:22px;flex-shrink:0;cursor:pointer}
      .fm-tog input{opacity:0;position:absolute;width:0;height:0}
      .fm-tog-track{position:absolute;inset:0;background:#ccc;border-radius:22px;
        transition:background .2s}
      .fm-tog-thumb{position:absolute;width:16px;height:16px;background:#fff;
        border-radius:50%;top:3px;left:3px;transition:transform .2s;
        box-shadow:0 1px 3px rgba(0,0,0,.25)}
      .fm-tog input:checked~.fm-tog-track{background:#639922}
      .fm-tog input:checked~.fm-tog-thumb{transform:translateX(18px)}
      .fm-hint{font-size:11px;padding:7px 9px;background:#f5f5f5;border-radius:7px;
        font-family:monospace;margin-top:8px;color:#555;word-break:break-all}
      .fm-hint-off{font-size:11px;color:#999;padding:6px 0}
      .fm-footer{padding:12px 20px;border-top:1px solid #eee;
        display:flex;align-items:center;gap:8px}
      .fm-btn{cursor:pointer;border:1px solid #ddd;border-radius:9px;
        background:transparent;font-size:13px;padding:8px 16px;font-family:inherit;
        color:#111;transition:background .15s}
      .fm-btn:hover{background:#f5f5f5}
      .fm-btn.fm-primary{background:#111;color:#fff;border-color:#111;margin-left:auto}
      .fm-btn.fm-primary:hover{background:#333}
      .fm-del{cursor:pointer;border:1px solid #f09595;border-radius:9px;
        background:transparent;font-size:13px;padding:8px 14px;font-family:inherit;
        color:#c0392b;margin-right:auto}
      .fm-del:hover{background:#fcebeb}
      .fm-close{background:none;border:none;cursor:pointer;font-size:22px;
        color:#aaa;line-height:1;padding:0;margin:0}
      .fm-close:hover{color:#555}
    `;
    document.head.appendChild(style);

    _el = document.createElement("div");
    _el.className = "fm-overlay fm-hidden";
    _el.innerHTML = `
      <div class="fm-box" id="fm-box">
        <div class="fm-header">
          <div class="fm-title" id="fm-title">Add chicken</div>
          <button class="fm-close" id="fm-close">×</button>
        </div>
        <div class="fm-body">
          <div class="fm-field">
            <label>Name</label>
            <input id="fm-name" placeholder="e.g. Henrietta" autocomplete="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="fm-two">
            <div class="fm-field">
              <label>Breed</label>
              <input id="fm-breed" placeholder="e.g. Buff Orpington" autocomplete="off">
            </div>
            <div class="fm-field">
              <label>Sex</label>
              <select id="fm-sex">
                <option value="hen">Hen</option>
                <option value="rooster">Rooster</option>
              </select>
            </div>
          </div>
          <div class="fm-two">
            <div class="fm-field"><label>Birthdate</label><input type="date" id="fm-birth"></div>
            <div class="fm-field"><label>Death date</label><input type="date" id="fm-death"></div>
          </div>
          <div class="fm-field">
            <label>Notes</label>
            <textarea id="fm-notes" placeholder="Any notes about this bird..."></textarea>
          </div>
          <div class="fm-field">
            <label>Photo</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:2px">
              <div id="fm-photo-preview" style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:#f5f5f5;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🐔</div>
              <div style="flex:1">
                <label style="display:inline-block;cursor:pointer;font-size:12px;padding:5px 12px;border:1px solid #ddd;border-radius:7px;background:#fff;color:#111">
                  Choose photo
                  <input type="file" id="fm-photo-input" accept="image/*" style="display:none">
                </label>
                <button id="fm-photo-remove" style="display:none;margin-left:6px;font-size:12px;padding:5px 10px;border:1px solid #f09595;border-radius:7px;background:transparent;color:#a32d2d;cursor:pointer;font-family:inherit">Remove</button>
                <div id="fm-photo-status" style="font-size:11px;color:#888;margin-top:4px"></div>
              </div>
            </div>
          </div>
          <div class="fm-field">
            <label>Egg photo <span style="font-weight:normal;color:#aaa">(for identification)</span></label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:2px">
              <div id="fm-egg-photo-preview" style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:#faeeda;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🥚</div>
              <div style="flex:1">
                <label style="display:inline-block;cursor:pointer;font-size:12px;padding:5px 12px;border:1px solid #ddd;border-radius:7px;background:#fff;color:#111">
                  Choose egg photo
                  <input type="file" id="fm-egg-photo-input" accept="image/*" style="display:none">
                </label>
                <button id="fm-egg-photo-remove" style="display:none;margin-left:6px;font-size:12px;padding:5px 10px;border:1px solid #f09595;border-radius:7px;background:transparent;color:#a32d2d;cursor:pointer;font-family:inherit">Remove</button>
                <div id="fm-egg-photo-status" style="font-size:11px;color:#888;margin-top:4px"></div>
              </div>
            </div>
          </div>
          <hr class="fm-sep">
          <div class="fm-toggle-row">
            <span class="fm-toggle-lbl">Active in flock</span>
            <label class="fm-tog">
              <input type="checkbox" id="fm-active" checked>
              <div class="fm-tog-track"></div>
              <div class="fm-tog-thumb"></div>
            </label>
          </div>
          <div class="fm-toggle-row">
            <span class="fm-toggle-lbl">Track eggs</span>
            <label class="fm-tog">
              <input type="checkbox" id="fm-eggs" checked>
              <div class="fm-tog-track"></div>
              <div class="fm-tog-thumb"></div>
            </label>
          </div>
          <div id="fm-hint"></div>
        </div>
        <div class="fm-footer">
          <button class="fm-del" id="fm-del" style="display:none">Remove chicken</button>
          <button class="fm-btn" id="fm-cancel">Cancel</button>
          <button class="fm-btn fm-primary" id="fm-save">Save</button>
        </div>
      </div>`;

    document.body.appendChild(_el);

    // Cache refs once — never change
    _r = {
      title:  _el.querySelector("#fm-title"),
      name:   _el.querySelector("#fm-name"),
      breed:  _el.querySelector("#fm-breed"),
      sex:    _el.querySelector("#fm-sex"),
      birth:  _el.querySelector("#fm-birth"),
      death:  _el.querySelector("#fm-death"),
      notes:  _el.querySelector("#fm-notes"),
      active: _el.querySelector("#fm-active"),
      eggs:   _el.querySelector("#fm-eggs"),
      hint:   _el.querySelector("#fm-hint"),
      del:    _el.querySelector("#fm-del"),
    };

    const hint = () => {
      const name = _r.name.value.trim() || "chicken";
      _r.hint.innerHTML = (_r.active.checked && _r.eggs.checked)
        ? `<div class="fm-hint">Entity: number.flock_${toSlug(name)}_eggs</div>`
        : `<div class="fm-hint-off">No counter — requires active + track eggs.</div>`;
    };
    _r.name.addEventListener("input", hint);
    _r.active.addEventListener("change", hint);
    _r.eggs.addEventListener("change", hint);

    // Assign photo element refs to module-level vars
    photoInput   = _el.querySelector("#fm-photo-input");
    photoPreview = _el.querySelector("#fm-photo-preview");
    photoRemove  = _el.querySelector("#fm-photo-remove");
    photoStatus  = _el.querySelector("#fm-photo-status");

    photoInput.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { photoStatus.textContent = "Too large (max 5 MB)"; return; }
      _photoFilename = file.name;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        _photoData = dataUrl.split(",")[1];
        _photoDelete = false;
        photoPreview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
        photoRemove.style.display = "";
        photoStatus.textContent = file.name;
      };
      reader.readAsDataURL(file);
    });

    photoRemove.addEventListener("click", () => {
      _photoData = null;
      _photoDelete = true;
      photoPreview.innerHTML = "🐔";
      photoRemove.style.display = "none";
      photoStatus.textContent = "Photo will be removed on save";
    });

    // Egg photo wiring
    eggPhotoInput   = _el.querySelector("#fm-egg-photo-input");
    eggPhotoPreview = _el.querySelector("#fm-egg-photo-preview");
    eggPhotoRemove  = _el.querySelector("#fm-egg-photo-remove");
    eggPhotoStatus  = _el.querySelector("#fm-egg-photo-status");

    eggPhotoInput.addEventListener("change", () => {
      const file = eggPhotoInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { eggPhotoStatus.textContent = "Too large (max 5 MB)"; return; }
      _eggPhotoFilename = file.name;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        _eggPhotoData = dataUrl.split(",")[1];
        _eggPhotoDelete = false;
        eggPhotoPreview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
        eggPhotoRemove.style.display = "";
        eggPhotoStatus.textContent = file.name;
      };
      reader.readAsDataURL(file);
    });

    eggPhotoRemove.addEventListener("click", () => {
      _eggPhotoData = null;
      _eggPhotoDelete = true;
      eggPhotoPreview.innerHTML = "🥚";
      eggPhotoRemove.style.display = "none";
      eggPhotoStatus.textContent = "Egg photo will be removed on save";
    });

    // Close on backdrop click (not box click)
    _el.addEventListener("mousedown", e => { if (e.target === _el) close(); });
    _el.querySelector("#fm-close").addEventListener("click", close);
    _el.querySelector("#fm-cancel").addEventListener("click", close);
    _el.querySelector("#fm-save").addEventListener("click", save);
    _r.del.addEventListener("click", () => {
      if (_chickenId && confirm("Remove this chicken from the flock?\nThis cannot be undone.")) {
        _hass.callService(DOMAIN, "remove_chicken", {chicken_id: _chickenId});
        close();
      }
    });
  }

  function open(hass, chickenId, chickens) {
    _init();
    // If already open for this exact chicken, only refresh hass ref — don't touch fields
    if (_open && _chickenId === (chickenId||null)) { _hass = hass; return; }
    _hass = hass;
    _chickenId = chickenId || null;
    _open = true;

    if (chickenId && chickens[chickenId]) {
      const ch = chickens[chickenId];
      _r.title.textContent = `Edit ${ch.name}`;
      _r.name.value   = ch.name    || "";
      _r.breed.value  = ch.breed   || "";
      _r.sex.value    = ch.sex     || "hen";
      _r.birth.value  = ch.birthdate || "";
      _r.death.value  = ch.deathdate || "";
      _r.notes.value  = ch.notes   || "";
      _r.active.checked = ch.active !== false;
      _r.eggs.checked   = ch.track_eggs !== false;
      _r.del.style.display = "";
    } else {
      _r.title.textContent = "Add chicken to flock";
      _r.name.value = _r.breed.value = _r.birth.value = _r.death.value = _r.notes.value = "";
      _r.sex.value = "hen";
      _r.active.checked = _r.eggs.checked = true;
      _r.del.style.display = "none";
    }

    // Reset / set photo preview
    _photoData = null;
    _photoDelete = false;
    _photoFilename = "photo.jpg";
    photoInput.value = "";
    _eggPhotoData = null;
    _eggPhotoDelete = false;
    _eggPhotoFilename = "egg.jpg";
    if (eggPhotoInput) eggPhotoInput.value = "";
    const existingEggUrl = chickenId && chickens[chickenId] ? chickens[chickenId].egg_photo_url : null;
    if (existingEggUrl) {
      eggPhotoPreview.innerHTML = `<img src="${existingEggUrl}" style="width:100%;height:100%;object-fit:cover">`;
      eggPhotoRemove.style.display = "";
      eggPhotoStatus.textContent = "";
    } else {
      eggPhotoPreview.innerHTML = "🥚";
      eggPhotoRemove.style.display = "none";
      eggPhotoStatus.textContent = "";
    }
    const existingUrl = chickenId && chickens[chickenId] ? chickens[chickenId].photo_url : null;
    if (existingUrl) {
      photoPreview.innerHTML = `<img src="${existingUrl}" style="width:100%;height:100%;object-fit:cover">`;
      photoRemove.style.display = "";
      photoStatus.textContent = "";
    } else {
      photoPreview.innerHTML = (chickenId && chickens[chickenId]?.sex === "rooster") ? "🐓" : "🐔";
      photoRemove.style.display = "none";
      photoStatus.textContent = "";
    }

    _r.name.dispatchEvent(new Event("input")); // update hint
    _el.classList.remove("fm-hidden");
    requestAnimationFrame(() => _r.name.focus());
  }

  function close() {
    _open = false;
    if (_el) _el.classList.add("fm-hidden");
    _chickenId = null;
  }

  function updateHass(hass) {
    _hass = hass; // keep current without touching fields
  }

  function save() {
    const name = _r.name.value.trim();
    if (!name) { _r.name.focus(); _r.name.style.borderColor="#e74c3c"; return; }
    _r.name.style.borderColor = "";
    const data = {
      name,
      breed:      _r.breed.value.trim() || undefined,
      sex:        _r.sex.value,
      birthdate:  _r.birth.value || undefined,
      deathdate:  _r.death.value || undefined,
      active:     _r.active.checked,
      track_eggs: _r.eggs.checked,
      notes:      _r.notes.value.trim() || undefined,
    };
    if (_chickenId) {
      _hass.callService(DOMAIN, "update_chicken", {chicken_id: _chickenId, ...data});
      if (_photoData) {
        _hass.callService(DOMAIN, "upload_photo", {
          chicken_id: _chickenId,
          image_data: _photoData,
          filename: _photoFilename,
        });
      } else if (_photoDelete) {
        _hass.callService(DOMAIN, "delete_photo", {chicken_id: _chickenId});
      }
      if (_eggPhotoData) {
        _hass.callService(DOMAIN, "upload_egg_photo", {
          chicken_id: _chickenId,
          image_data: _eggPhotoData,
          filename: _eggPhotoFilename,
        });
      } else if (_eggPhotoDelete) {
        _hass.callService(DOMAIN, "delete_egg_photo", {chicken_id: _chickenId});
      }
    } else {
      _hass.callService(DOMAIN, "add_chicken", data);
      // Photo for new birds: store pending — uploaded after card refreshes with new ID
      if (_photoData) {
        window._flockPendingPhoto = {
          name: data.name,
          data: _photoData,
          filename: _photoFilename,
          ts: Date.now(),
        };
      }
    }
    close();
  }

  return {
    open,
    close,
    updateHass,
    isOpen: () => _open,
  };
})();


// ─── Card element ─────────────────────────────────────────────────────────────

class ChickenFlockCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._hass = null;
    this._tab = "active";
    this._chickens = {};
    this._history = [];
    this._initialized = false;
    this._histPeriod = "month";
    this._histYear = isoYear(); this._histMonth = isoMonth();
    this._histWeek = isoWeekStart(); this._histDay = isoToday();
    this._statsPeriod = "month";
    this._statsHenYear = "alltime";
    this._theme = loadTheme();
    this._flockSort = "name";   // "name" | "age"
    this._hideRoosters = false;
  }

  setConfig(c){ this._config = c||{}; }

  set hass(hass) {
    this._hass = hass;
    this._syncFromHass();
    if (!this._initialized) { this._initialized = true; this._buildDOM(); return; }
    FlockModal.updateHass(hass);
    if (FlockModal.isOpen()) return;
    // Only rebuild if no select in our shadow root currently has focus.
    // If one does, the user is mid-interaction — skip this update entirely.
    // The next hass update (or their next tab/pill click) will pick up fresh data.
    const focused = this.shadowRoot?.activeElement;
    if (focused && (focused.tagName === "SELECT" || focused.closest("select"))) return;
    // Debounce: wait for a 600ms quiet window before rebuilding.
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      // Check focus again at fire time
      const stillFocused = this.shadowRoot?.activeElement;
      if (stillFocused && (stillFocused.tagName === "SELECT" || stillFocused.closest("select"))) return;
      try { this._refreshBody(); }
      catch(e) { console.error("[FlockCard] render error:", e); }
    }, 600);
  }

  _syncFromHass() {
    if (!this._hass) return;
    const hs = this._hass.states["sensor.flock_egg_history"];
    if (hs?.attributes?.recent_days) this._history = hs.attributes.recent_days;

    const liveEggs = {};
    for (const [eid, st] of Object.entries(this._hass.states)) {
      if (!eid.startsWith("number.flock_") || !eid.endsWith("_eggs")) continue;
      const a = st.attributes; if (!a.chicken_id) continue;
      liveEggs[a.chicken_id] = { egg_count: parseFloat(st.state)||0, entity_id: eid };
    }

    const roster = this._hass.states["sensor.flock_roster"];
    const ch = {};
    if (roster?.attributes?.chickens) {
      for (const c of roster.attributes.chickens) {
        const live = liveEggs[c.id] || {};
        ch[c.id] = {
          id: c.id, name: c.name, sex: c.sex||"hen", breed: c.breed||"",
          birthdate: c.birthdate||null, deathdate: c.deathdate||null,
          active: c.active, track_eggs: c.track_eggs, notes: c.notes||null,
          photo_url: c.photo_url||null, egg_photo_url: c.egg_photo_url||null,
          egg_count: live.egg_count ?? c.egg_count ?? 0,
          entity_id: live.entity_id||null,
        };
      }
    } else {
      for (const [eid, st] of Object.entries(this._hass.states)) {
        if (!eid.startsWith("number.flock_")||!eid.endsWith("_eggs")) continue;
        const a = st.attributes; if (!a.chicken_id) continue;
        ch[a.chicken_id] = {
          id:a.chicken_id, name:(a.friendly_name||eid).replace(/ eggs$/i,""),
          breed:a.breed||"", sex:a.sex||"hen", birthdate:a.birthdate||null,
          deathdate:null, active:true, track_eggs:true,
          photo_url:null, egg_photo_url:null,
          egg_count:parseFloat(st.state)||0, entity_id:eid,
        };
      }
    }
    this._chickens = ch;

    if (window._flockPendingPhoto && Date.now()-window._flockPendingPhoto.ts < 30000) {
      const p = window._flockPendingPhoto;
      const match = Object.values(ch).find(c=>c.name===p.name);
      if (match) {
        window._flockPendingPhoto = null;
        this._hass.callService(DOMAIN,"upload_photo",{chicken_id:match.id,image_data:p.data,filename:p.filename});
      }
    }
  }

  _buildDOM() {
    const root = this.shadowRoot; root.innerHTML = "";
    const s = document.createElement("style"); s.textContent = CARD_STYLES; root.appendChild(s);
    applyTheme(root, this._theme);
    this._cardEl = document.createElement("div"); this._cardEl.className = "fc";
    root.appendChild(this._cardEl);
    this._refreshBody();
  }

  _refreshBody() {
    if (!this._cardEl || FlockModal.isOpen()) return;
    // Save select state
    const sv = {};
    this._cardEl.querySelectorAll("select[data-hist-year],select[data-hist-month],select[data-hist-week],select[data-hist-day],select[data-stats-hen-year]")
      .forEach(el => {
        const k = Object.keys(el.dataset).find(k=>k.startsWith("hist")||k==="statsHenYear");
        if(k) sv[k] = el.value;
      });
    if(sv.histYear)     this._histYear     = sv.histYear;
    if(sv.histMonth)    this._histMonth    = sv.histMonth;
    if(sv.histWeek)     this._histWeek     = sv.histWeek;
    if(sv.histDay)      this._histDay      = sv.histDay;
    if(sv.statsHenYear) this._statsHenYear = sv.statsHenYear;
    try {
      this._cardEl.innerHTML = this._render();
    } catch(e) {
      console.error("[FlockCard] render threw:", e);
      this._cardEl.innerHTML = `<div style="padding:1rem;font-family:sans-serif;color:#8a3030">Card error: ${e.message}</div>`;
    }
    this._bindEvents();
  }

  _render() {
    const birds = Object.values(this._chickens);
    const active = birds.filter(c=>c.active&&!c.deathdate).length;
    const today = birds.reduce((s,c)=>s+(c.egg_count||0),0);
    const yest = parseInt(this._hass?.states["sensor.flock_eggs_yesterday"]?.state||"0");
    return `
      <div class="fc-header">
        <div class="fc-header-left">
          <div class="fc-title">🐔 Flock Manager</div>
          <div class="fc-subtitle">Home Assistant • ${birds.length} birds</div>
        </div>
        <div class="fc-header-actions">
          <button class="hbtn" data-action="open-import">⇪ Import</button>
          <button class="hbtn danger" data-action="clear-all">✕ Clear</button>
          <button class="hbtn add" data-action="open-add">+ Add</button>
        </div>
      </div>
      <div class="fc-stats">
        <div class="fc-stat"><div class="fc-stat-val">${birds.length}</div><div class="fc-stat-label">Total birds</div></div>
        <div class="fc-stat"><div class="fc-stat-val">${active}</div><div class="fc-stat-label">Active</div></div>
        <div class="fc-stat"><div class="fc-stat-val">${today}</div><div class="fc-stat-label">Today</div></div>
        <div class="fc-stat"><div class="fc-stat-val">${yest}</div><div class="fc-stat-label">Yesterday</div></div>
      </div>
      <div class="fc-tabs">
        <button class="fc-tab ${this._tab==="active"?"on":""}" data-tab="active">Active</button>
        <button class="fc-tab ${this._tab==="all"?"on":""}" data-tab="all">All birds</button>
        <button class="fc-tab ${this._tab==="stats"?"on":""}" data-tab="stats">Statistics</button>
        <button class="fc-tab ${this._tab==="history"?"on":""}" data-tab="history">History</button>
        <button class="fc-tab ${this._tab==="export"?"on":""}" data-tab="export">Export</button>
        <button class="fc-tab ${this._tab==="settings"?"on":""}" data-tab="settings">⚙ Settings</button>
      </div>
      <div class="fc-body">
        ${this._tab==="stats"?this._renderStats():this._tab==="history"?this._renderHistory():this._tab==="export"?this._renderExportPanel():this._tab==="settings"?this._renderSettings():this._renderFlock()}
      </div>`;
  }

  _renderFlock() {
    let birds = Object.values(this._chickens);
    if (this._tab==="active") birds = birds.filter(c=>c.active&&!c.deathdate);
    if (this._tab==="active" && this._hideRoosters) birds = birds.filter(c=>c.sex!=="rooster");

    // Sort
    birds = [...birds].sort((a,b) => {
      if (this._flockSort==="age") {
        // Sort by birthdate ascending (oldest first); nulls last
        if (!a.birthdate && !b.birthdate) return a.name.localeCompare(b.name);
        if (!a.birthdate) return 1;
        if (!b.birthdate) return -1;
        return a.birthdate.localeCompare(b.birthdate);
      }
      return a.name.localeCompare(b.name);
    });

    if (!birds.length) return `<div class="fc-empty"><div class="fc-empty-icon">🐣</div>No chickens in this view yet.</div>`;

    const sortBar = `
      <div class="flock-controls">
        <div class="flock-sort-group">
          <span class="flock-ctrl-label">Sort</span>
          <button class="sort-pill ${this._flockSort==="name"?"on":""}" data-sort="name">A–Z</button>
          <button class="sort-pill ${this._flockSort==="age"?"on":""}" data-sort="age">Age</button>
        </div>
        ${this._tab==="active" ? `
        <label class="rooster-toggle">
          <input type="checkbox" data-toggle="roosters" ${this._hideRoosters?"checked":""}>
          <span class="rooster-toggle-label">Hide roosters</span>
        </label>` : ""}
      </div>`;

    return sortBar + `<div class="flock-grid">${birds.map((c,i)=>this._renderChickenCard(c,i)).join("")}</div>`;
  }

  _renderChickenCard(ch, idx) {
    const color = BAR_COLORS[idx % BAR_COLORS.length];
    const age = getAge(ch.birthdate, ch.deathdate);
    const meta = [ch.breed, age?`${age} old`:null].filter(Boolean).join(" · ");
    const avatar = ch.photo_url
      ? `<div class="ch-avatar"><img src="${ch.photo_url}" alt="${ch.name}"></div>`
      : `<div class="ch-avatar">${ch.sex==="rooster"?"🐓":"🐔"}</div>`;
    return `
      <div class="ch-card ${(!ch.active||ch.deathdate)?"dim":""}">
        <div class="ch-card-inner">
          <div class="ch-accent" style="background:${color}"></div>
          <div class="ch-content">
            <div class="ch-top">
              <div class="ch-identity">
                ${avatar}
                <div>
                  <div class="ch-name">${ch.name}</div>
                  ${ch.breed?`<div class="ch-breed">${ch.breed}</div>`:""}
                </div>
              </div>
              <button class="edit-btn" data-action="open-edit" data-id="${ch.id}">Edit</button>
            </div>
            <div class="ch-badges">
              ${ch.deathdate?`<span class="badge b-dead">Deceased</span>`:ch.active?`<span class="badge b-active">● Active</span>`:`<span class="badge b-inactive">Inactive</span>`}
              ${ch.track_eggs&&!ch.deathdate?`<span class="badge b-eggs">🥚 Tracking</span>`:""}
              ${ch.sex==="rooster"?`<span class="badge b-inactive">Rooster</span>`:""}
            </div>
            ${meta?`<div class="ch-meta">${meta}</div>`:""}
            ${ch.notes?`<div class="ch-notes">"${ch.notes}"</div>`:""}
            ${ch.entity_id?`
              <div class="counter-row">
                <div class="counter-left">
                  ${ch.egg_photo_url?`<div class="egg-thumb"><img src="${ch.egg_photo_url}" title="${ch.name}'s egg"></div>`:""}
                  <div>
                    <div class="counter-label">Egg counter</div>
                    <div class="eid">${ch.entity_id}</div>
                  </div>
                </div>
                <div class="cnt-row">
                  <button class="cnt-btn" data-action="dec" data-eid="${ch.entity_id}" data-val="${ch.egg_count}">−</button>
                  <div class="cnt-val">${Math.round(ch.egg_count)}</div>
                  <button class="cnt-btn" data-action="inc" data-eid="${ch.entity_id}" data-val="${ch.egg_count}">+</button>
                </div>
              </div>`:""}
          </div>
        </div>
      </div>`;
  }

  _renderStats() {
    const today=isoToday(),ws=isoWeekStart(),mo=isoMonth(),yr=isoYear();
    const todayObj={date:today,total:0,per_chicken:{}};
    for(const ch of Object.values(this._chickens))
      if(ch.egg_count>0){todayObj.per_chicken[ch.name]=ch.egg_count;todayObj.total+=ch.egg_count;}
    const hist=[...this._history.filter(d=>d.date!==today),todayObj];
    const yrD=hist.filter(d=>yearKey(d.date)===yr);
    const moD=hist.filter(d=>monthKey(d.date)===mo);
    const wkD=hist.filter(d=>d.date>=ws);
    const allT=hist.reduce((s,d)=>s+d.total,0);
    const yrT=yrD.reduce((s,d)=>s+d.total,0);
    const moT=moD.reduce((s,d)=>s+d.total,0);
    const wkT=wkD.reduce((s,d)=>s+d.total,0);
    const avgD=hist.length?(allT/hist.length).toFixed(1):"—";
    const avgW=hist.length?(allT/(hist.length/7)).toFixed(1):"—";
    const best=hist.reduce((b,d)=>d.total>b.total?d:b,{total:0,date:""});
    const sp=this._statsPeriod;
    const lbDays=sp==="week"?wkD:sp==="month"?moD:sp==="year"?yrD:hist;
    const lbTop=topN(sumByChicken(lbDays),5);
    const lbMax=lbTop.length?lbTop[0].count:1;
    const rc=i=>i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`;
    const spL=sp==="week"?"This week":sp==="month"?"This month":sp==="year"?"This year":"All time";

    const availYears=[...new Set(hist.map(d=>yearKey(d.date)))].sort().reverse();
    if(this._statsHenYear!=="alltime"&&!availYears.includes(this._statsHenYear)) this._statsHenYear="alltime";
    const shy=this._statsHenYear;
    const scopeDays=shy==="alltime"?hist:hist.filter(d=>yearKey(d.date)===shy);
    const scopeMo=scopeDays.filter(d=>monthKey(d.date)===mo);
    const scopeWk=scopeDays.filter(d=>d.date>=ws);
    const henScope=sumByChicken(scopeDays);
    const henMonth2=sumByChicken(scopeMo);
    const henWeek2=sumByChicken(scopeWk);
    const henToday={};
    for(const ch of Object.values(this._chickens)) if(ch.egg_count>0) henToday[ch.name]=ch.egg_count;
    const allHens=[...new Set([...Object.keys(henScope),...Object.values(this._chickens).map(c=>c.name)])].sort()
      .filter(name=>shy==="alltime"||(henScope[name]||0)>0);
    const scopeColLabel=shy==="alltime"?"All time":shy;

    const henRows=allHens.map((name,i)=>{
      const lt=henScope[name]||0,mo2=henMonth2[name]||0,wk2=henWeek2[name]||0,td=henToday[name]||0;
      const color=BAR_COLORS[i%BAR_COLORS.length];
      return `<tr>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;vertical-align:middle"></span>${name}</td>
        <td>${lt.toLocaleString()}</td><td>${mo2||"—"}</td><td>${wk2||"—"}</td>
        <td class="${td>0?"td-today":""}">${td||"—"}</td>
      </tr>`;
    }).join("");

    return `
      <div class="sec-label">Overall totals</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">All time</div><div class="kpi-val">${allT.toLocaleString()}</div><div class="kpi-sub">eggs total</div></div>
        <div class="kpi"><div class="kpi-label">This year</div><div class="kpi-val">${yrT.toLocaleString()}</div><div class="kpi-sub">${yr}</div></div>
        <div class="kpi"><div class="kpi-label">This month</div><div class="kpi-val">${moT.toLocaleString()}</div><div class="kpi-sub">${MONTHS[+mo.slice(5)-1]}</div></div>
        <div class="kpi"><div class="kpi-label">This week</div><div class="kpi-val">${wkT.toLocaleString()}</div><div class="kpi-sub">since ${fmtShort(ws)}</div></div>
        <div class="kpi"><div class="kpi-label">Daily avg</div><div class="kpi-val">${avgD}</div><div class="kpi-sub">all time</div></div>
        <div class="kpi"><div class="kpi-label">Weekly avg</div><div class="kpi-val">${avgW}</div><div class="kpi-sub">all time</div></div>
        <div class="kpi"><div class="kpi-label">Best day</div><div class="kpi-val">${best.total}</div><div class="kpi-sub">${best.date?fmtShort(best.date):"—"}</div></div>
        <div class="kpi"><div class="kpi-label">Days logged</div><div class="kpi-val">${hist.filter(d=>d.total>0).length}</div><div class="kpi-sub">with eggs</div></div>
      </div>

      ${allHens.length?`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="sec-label" style="margin-bottom:0">Per hen breakdown</div>
          <select class="psel" data-stats-hen-year>
            <option value="alltime" ${shy==="alltime"?"selected":""}>All time</option>
            ${availYears.map(y=>`<option value="${y}" ${y===shy?"selected":""}>${y}</option>`).join("")}
          </select>
        </div>
        <div class="lb-box" style="overflow-x:auto">
          <table class="hen-table">
            <thead><tr>
              <th style="text-align:left">Hen</th>
              <th>${scopeColLabel}</th>
              <th>${MONTHS[+mo.slice(5)-1]}</th>
              <th>This wk</th>
              <th>Today</th>
            </tr></thead>
            <tbody>${henRows}</tbody>
          </table>
        </div>`:""}

      <div class="sec-label" style="margin-bottom:8px;margin-top:4px">Top layers</div>
      <div class="pills">
        ${["week","month","year","alltime"].map(p=>`<button class="pill ${sp===p?"on":""}" data-stats-period="${p}">${p==="week"?"This week":p==="month"?"This month":p==="year"?"This year":"All time"}</button>`).join("")}
      </div>
      <div class="lb-box">
        <div class="lb-box-title">Top 5 — ${spL}</div>
        ${lbTop.length?`<div class="lb">${lbTop.map((e,i)=>`
          <div class="lb-row">
            <div class="lb-rank">${rc(i)}</div>
            <div class="lb-name">${e.name}</div>
            <div class="lb-bar-wrap"><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.round(e.count/lbMax*100)}%;background:${BAR_COLORS[i%BAR_COLORS.length]}"></div></div></div>
            <div class="lb-count">${e.count}</div>
          </div>`).join("")}</div>`:`<div style="font-size:12px;color:#9e7d5e;font-family:sans-serif">No data for this period.</div>`}
      </div>`;
  }

  _renderHistory() {
    const all=[...this._history];
    if(!all.length) return `<div class="no-data">🥚 No history yet — data is recorded each time the daily reset fires at midnight.</div>`;
    const years=[...new Set(all.map(d=>yearKey(d.date)))].sort().reverse();
    const months=[...new Set(all.filter(d=>yearKey(d.date)===this._histYear).map(d=>monthKey(d.date)))].sort().reverse();
    const weeks=[...new Set(all.map(d=>weekKey(d.date)))].sort().reverse();
    const days=[...new Set(all.map(d=>d.date))].sort().reverse();
    if(!years.includes(this._histYear)) this._histYear=years[0];
    if(months.length&&!months.includes(this._histMonth)) this._histMonth=months[0];
    if(!weeks.includes(this._histWeek)) this._histWeek=weeks[0];
    if(!days.includes(this._histDay)) this._histDay=days[0];
    let shown,groupBy;
    if(this._histPeriod==="year"){shown=all.filter(d=>yearKey(d.date)===this._histYear);groupBy="month";}
    else if(this._histPeriod==="month"){shown=all.filter(d=>monthKey(d.date)===this._histMonth);groupBy=null;}
    else if(this._histPeriod==="week"){shown=all.filter(d=>weekKey(d.date)===this._histWeek);groupBy=null;}
    else{shown=all.filter(d=>d.date===this._histDay);groupBy=null;}
    shown=[...shown].reverse();
    const winTotal=shown.reduce((s,d)=>s+d.total,0);
    const winAvg=shown.length?(winTotal/shown.length).toFixed(1):"0";
    const winBest=shown.reduce((b,d)=>d.total>b.total?d:b,{total:0,date:""});
    const nameSet=new Set();shown.forEach(d=>Object.keys(d.per_chicken||{}).forEach(n=>nameSet.add(n)));
    const names=[...nameSet].sort(),max=Math.max(...shown.map(d=>d.total),1);
    let rows="",lastGrp="";
    for(const day of shown){
      if(groupBy==="month"){const gk=monthKey(day.date);if(gk!==lastGrp){const[y,m]=gk.split("-");rows+=`<div class="psep">${MONTHS[+m-1]} ${y}</div>`;lastGrp=gk;}}
      const perC=day.per_chicken||{};
      if(this._histPeriod==="day"){
        rows+=`<div style="padding:6px 0;border-bottom:1px dashed #e8d9c8">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#6b4226">${fmtFull(day.date)} — ${day.total} eggs</div>
          ${names.map((n,i)=>`<div class="lb-row" style="margin-bottom:5px">
            <div class="lb-name" style="font-family:sans-serif">${n}</div>
            <div class="lb-bar-wrap" style="width:140px"><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${Math.round(((perC[n]||0)/Math.max(day.total,1))*100)}%;background:${BAR_COLORS[i%BAR_COLORS.length]}"></div></div></div>
            <div class="lb-count">${perC[n]||0}</div>
          </div>`).join("")}
        </div>`;
      } else {
        let off=0;
        const segs=names.map((n,i)=>{const pct=Math.round(((perC[n]||0)/max)*100);const s=`<div class="bar-seg" style="left:${off}%;width:${pct}%;background:${BAR_COLORS[i%BAR_COLORS.length]}"></div>`;off+=pct;return s;}).join("");
        const tip=names.filter(n=>perC[n]>0).map(n=>`${n}:${perC[n]}`).join(" | ")||"0";
        rows+=`<div class="bar-row"><div class="bar-date">${fmtShort(day.date)}</div><div class="bar-track" data-tip="${tip}">${segs}</div><div class="bar-total">${day.total}</div></div>`;
      }
    }
    if(!shown.length) rows=`<div class="no-data">No eggs logged for this period.</div>`;
    const legend=names.map((n,i)=>`<div class="leg-item"><div class="leg-sw" style="background:${BAR_COLORS[i%BAR_COLORS.length]}"></div>${n}</div>`).join("");
    const pills=["year","month","week","day"].map(p=>`<button class="pill ${this._histPeriod===p?"on":""}" data-hist-period="${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join("");
    const sels=this._histPeriod==="year"
      ?`<select class="psel" data-hist-year>${years.map(y=>`<option value="${y}" ${y===this._histYear?"selected":""}>${y}</option>`).join("")}</select>`
      :this._histPeriod==="month"
      ?`<select class="psel" data-hist-year>${years.map(y=>`<option value="${y}" ${y===this._histYear?"selected":""}>${y}</option>`).join("")}</select><select class="psel" data-hist-month>${months.map(mo=>{const[,m]=mo.split("-");return`<option value="${mo}" ${mo===this._histMonth?"selected":""}>${MONTHS[+m-1]} ${mo.slice(0,4)}</option>`;}).join("")}</select>`
      :this._histPeriod==="week"
      ?`<select class="psel" data-hist-week>${weeks.slice(0,52).map(w=>`<option value="${w}" ${w===this._histWeek?"selected":""}>${"Wk of "+fmtShort(w)}</option>`).join("")}</select>`
      :`<select class="psel" data-hist-day>${days.slice(0,90).map(d=>`<option value="${d}" ${d===this._histDay?"selected":""}>${fmtFull(d)}</option>`).join("")}</select>`;
    return `
      <div>
        <div class="hc-row">
          <div class="pills">${pills}</div>
          <div class="sel-row">
            ${sels}
            <button class="sort-pill" data-action="open-history-edit" style="border-color:#1a6b4a;color:#1a6b4a">✎ Edit</button>
          </div>
        </div>
        ${this._histPeriod!=="day"?`<div class="hsum"><div class="hsum-item">Total <b>${winTotal}</b></div><div class="hsum-item">Avg/day <b>${winAvg}</b></div><div class="hsum-item">Best <b>${winBest.total}</b>${winBest.date?` (${fmtShort(winBest.date)})`:"" }</div><div class="hsum-item">Days <b>${shown.length}</b></div></div>`:""}
        ${names.length>1?`<div class="legend">${legend}</div>`:""}
        <div class="h-scroll"><div class="bar-chart">${rows}</div></div>
      </div>`;
  }

  // ── Settings panel ───────────────────────────────────────────────────
  _renderSettings() {
    const t = this._theme;
    const isCustom = !Object.entries(PRESETS).filter(([k])=>k!=="custom")
      .some(([,p])=>p.accent===t.accent);

    const presetSwatches = Object.entries(PRESETS)
      .filter(([k])=>k!=="custom")
      .map(([key,p])=>`
        <div class="preset-item">
          <div class="preset-swatch ${t.accent===p.accent&&!isCustom?"active":""}"
               style="background:linear-gradient(135deg,${p.accent},${p.accentDark})"
               data-preset="${key}" title="${p.name}"></div>
          <div class="preset-label">${p.name}</div>
        </div>`).join("");

    const colorFields = [
      {key:"accent",      label:"Accent / header",  sub:"Header background, buttons, active states"},
      {key:"accentDark",  label:"Accent dark",       sub:"Header gradient end, hover states"},
      {key:"accentLight", label:"Accent light",      sub:"Badge backgrounds, highlights"},
      {key:"accentText",  label:"Accent text",       sub:"Text on light accent backgrounds"},
      {key:"badgeEgg",    label:"Egg badge fill",    sub:"Background of the egg tracking badge"},
      {key:"badgeEggText",label:"Egg badge text",    sub:"Text colour on egg tracking badge"},
    ];

    const rows = colorFields.map(f=>`
      <div class="color-row">
        <div>
          <div class="color-row-label">${f.label}</div>
          <div class="color-row-sub">${f.sub}</div>
        </div>
        <div class="color-input-wrap">
          <input type="color" data-color-key="${f.key}" value="${t[f.key]||"#000000"}">
          <input type="text" class="color-hex" data-hex-key="${f.key}" value="${t[f.key]||"#000000"}" maxlength="7" spellcheck="false">
        </div>
      </div>`).join("");

    return `
      <div>
        <div class="settings-section">
          <div class="settings-section-title">Colour presets</div>
          <div class="preset-grid">${presetSwatches}</div>
          ${isCustom?`<div style="font-size:11px;color:#6b7280;margin-top:4px">Custom theme active</div>`:""}
          <div class="theme-preview"></div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Custom colours</div>
          ${rows}
        </div>
        <div class="settings-actions">
          <button class="settings-btn" data-action="reset-theme">Reset to default</button>
          <button class="settings-btn primary" data-action="save-theme">Apply &amp; save</button>
        </div>
      </div>`;
  }

  // ── Export / backup panel ─────────────────────────────────────────────
  _renderExportPanel() {
    return `
      <div class="backup-section">
        <div class="sec-label" style="margin-bottom:12px">Export data</div>
        <div class="backup-grid">
          <div class="backup-card" data-action="export-csv">
            <div class="backup-card-icon">📊</div>
            <div class="backup-card-title">Export CSV</div>
            <div class="backup-card-sub">Egg history as a spreadsheet — one row per day, one column per hen</div>
          </div>
          <div class="backup-card" data-action="export-json">
            <div class="backup-card-icon">{ }</div>
            <div class="backup-card-title">Export JSON</div>
            <div class="backup-card-sub">Full egg history as JSON — includes flock list and daily log</div>
          </div>
        </div>
      </div>
      <div class="backup-section">
        <div class="sec-label" style="margin-bottom:12px">Backup &amp; restore</div>
        <div class="backup-grid">
          <div class="backup-card" data-action="backup-json">
            <div class="backup-card-icon">💾</div>
            <div class="backup-card-title">Download backup</div>
            <div class="backup-card-sub">Full backup of all flock data and egg history as JSON</div>
          </div>
          <div class="backup-card restore-card" data-action="trigger-restore">
            <div class="backup-card-icon">♻️</div>
            <div class="backup-card-title">Restore from backup</div>
            <div class="backup-card-sub">Import a previously downloaded backup file</div>
            <input type="file" class="restore-input" id="restore-file-input" accept=".json">
          </div>
        </div>
        <div id="restore-status"></div>
      </div>`;
  }

  // ── Events ────────────────────────────────────────────────────────────
  _bindEvents() {
    const r = this._cardEl;
    r.querySelectorAll("[data-tab]").forEach(el=>el.addEventListener("click",()=>{this._tab=el.dataset.tab;this._refreshBody();}));
    r.querySelectorAll("[data-action='open-add']").forEach(el=>el.addEventListener("click",()=>FlockModal.open(this._hass,null,this._chickens)));
    r.querySelectorAll("[data-action='open-edit']").forEach(el=>el.addEventListener("click",()=>FlockModal.open(this._hass,el.dataset.id,this._chickens)));
    r.querySelectorAll("[data-action='inc']").forEach(el=>el.addEventListener("click",()=>this._setEgg(el.dataset.eid,parseFloat(el.dataset.val)+1)));
    r.querySelectorAll("[data-action='dec']").forEach(el=>el.addEventListener("click",()=>this._setEgg(el.dataset.eid,Math.max(0,parseFloat(el.dataset.val)-1))));
    r.querySelectorAll("[data-action='open-import']").forEach(el=>el.addEventListener("click",()=>ImportModal.open(this._hass)));
    r.querySelectorAll("[data-action='open-history-edit']").forEach(el=>el.addEventListener("click",()=>HistoryEditModal.open(this._hass,this._chickens)));
    r.querySelectorAll("[data-action='clear-all']").forEach(el=>el.addEventListener("click",()=>{
      if(!confirm("⚠️ Clear all flock data?\n\nThis will permanently delete all chickens, all egg history, and remove all counter entities.\n\nThis cannot be undone.")) return;
      if(!confirm("Are you absolutely sure?\n\nThere is no backup and no undo. All data will be gone.")) return;
      this._hass.callService("chicken_flock","clear_all_data",{});
    }));
    // Export / backup actions
    r.querySelectorAll("[data-action='export-csv']").forEach(el=>el.addEventListener("click",()=>exportCSV([...this._history])));
    r.querySelectorAll("[data-action='export-json']").forEach(el=>el.addEventListener("click",()=>exportJSON([...this._history],this._chickens)));
    r.querySelectorAll("[data-action='backup-json']").forEach(el=>el.addEventListener("click",()=>backupStorage(this._hass)));
    r.querySelectorAll("[data-action='trigger-restore']").forEach(el=>el.addEventListener("click",()=>{
      const inp = r.querySelector("#restore-file-input");
      if(inp) inp.click();
    }));
    const restoreInput = r.querySelector("#restore-file-input");
    if(restoreInput) restoreInput.addEventListener("change",()=>this._doRestore(restoreInput));
    // Settings bindings
    r.querySelectorAll("[data-preset]").forEach(el=>el.addEventListener("click",()=>{
      const key = el.dataset.preset;
      if (PRESETS[key]) {
        this._theme = {...PRESETS[key]};
        saveTheme(this._theme);
        applyTheme(this.shadowRoot, this._theme);
        this._refreshBody();
      }
    }));
    // Colour pickers — update hex field and preview live
    r.querySelectorAll("input[data-color-key]").forEach(el=>el.addEventListener("input",()=>{
      const key = el.dataset.colorKey;
      const hex = r.querySelector(`input[data-hex-key="${key}"]`);
      if (hex) hex.value = el.value;
      this._theme[key] = el.value;
      applyTheme(this.shadowRoot, this._theme);
    }));
    // Hex text fields — update picker and live preview on valid hex
    r.querySelectorAll("input[data-hex-key]").forEach(el=>el.addEventListener("input",()=>{
      const val = el.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        const key = el.dataset.hexKey;
        const picker = r.querySelector(`input[data-color-key="${key}"]`);
        if (picker) picker.value = val;
        this._theme[key] = val;
        applyTheme(this.shadowRoot, this._theme);
      }
    }));
    r.querySelectorAll("[data-action='save-theme']").forEach(el=>el.addEventListener("click",()=>{
      saveTheme(this._theme);
      applyTheme(this.shadowRoot, this._theme);
      this._refreshBody();
    }));
    r.querySelectorAll("[data-action='reset-theme']").forEach(el=>el.addEventListener("click",()=>{
      this._theme = {...PRESETS.green};
      saveTheme(this._theme);
      applyTheme(this.shadowRoot, this._theme);
      this._refreshBody();
    }));
    r.querySelectorAll("[data-sort]").forEach(el=>el.addEventListener("click",()=>{this._flockSort=el.dataset.sort;this._refreshBody();}));
    r.querySelectorAll("[data-toggle='roosters']").forEach(el=>el.addEventListener("change",()=>{this._hideRoosters=el.checked;this._refreshBody();}));
    r.querySelectorAll("[data-stats-period]").forEach(el=>el.addEventListener("click",()=>{this._statsPeriod=el.dataset.statsPeriod;this._refreshBody();}));
    const shy=r.querySelector("[data-stats-hen-year]"); if(shy) shy.addEventListener("change",e=>{this._statsHenYear=e.target.value;this._refreshBody();});
    r.querySelectorAll("[data-hist-period]").forEach(el=>el.addEventListener("click",()=>{this._histPeriod=el.dataset.histPeriod;this._refreshBody();}));
    const hy=r.querySelector("[data-hist-year]");  if(hy)hy.addEventListener("change",e=>{this._histYear=e.target.value;this._histMonth=isoMonth();this._refreshBody();});
    const hm=r.querySelector("[data-hist-month]"); if(hm)hm.addEventListener("change",e=>{this._histMonth=e.target.value;this._refreshBody();});
    const hw=r.querySelector("[data-hist-week]");  if(hw)hw.addEventListener("change",e=>{this._histWeek=e.target.value;this._refreshBody();});
    const hd=r.querySelector("[data-hist-day]");   if(hd)hd.addEventListener("change",e=>{this._histDay=e.target.value;this._refreshBody();});
  }

  async _doRestore(input) {
    const file = input.files[0];
    if (!file) return;
    const status = this._cardEl.querySelector("#restore-status");
    try {
      const data = await restoreFromFile(this._hass, file);
      const henCount = data.chickens?.length || 0;
      const dayCount = Object.keys(data.daily_log||{}).length;
      if (!confirm(`Restore backup?\n\n${henCount} birds, ${dayCount} days of history.\n\nThis will MERGE into your existing data — existing entries will not be deleted. Continue?`)) return;
      // Restore chickens
      let added = 0;
      for (const ch of data.chickens||[]) {
        try {
          await this._hass.callService(DOMAIN,"add_chicken",{
            name:ch.name,breed:ch.breed||undefined,sex:ch.sex||"hen",
            birthdate:ch.birthdate||undefined,deathdate:ch.deathdate||undefined,
            active:ch.active??true,track_eggs:ch.track_eggs??true,notes:ch.notes||undefined,
          });
          added++;
          await new Promise(r=>setTimeout(r,80));
        } catch(e){ /* skip duplicates */ }
      }
      // Restore history in batches
      const logDates = Object.keys(data.daily_log||{}).sort();
      for (let i=0;i<logDates.length;i+=25){
        const batch={};
        logDates.slice(i,i+25).forEach(d=>{batch[d]=data.daily_log[d];});
        await this._hass.callService(DOMAIN,"import_history",{daily_log:batch});
        await new Promise(r=>setTimeout(r,120));
      }
      if(status){
        status.className="ok"; status.style.display="block";
        status.textContent=`✓ Restored — ${added} birds added, ${logDates.length} days of history merged`;
        setTimeout(()=>{status.style.display="none";},5000);
      }
    } catch(e) {
      if(status){
        status.className="err"; status.style.display="block";
        status.textContent=`✗ Restore failed: ${e.message}`;
      }
    }
    input.value="";
  }

  _setEgg(entity_id,value) {
    this._hass.callService("number","set_value",{entity_id,value:String(value)});
  }

  static getStubConfig(){ return {}; }
}

customElements.define("chicken-flock-card",ChickenFlockCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"chicken-flock-card",name:"Chicken Flock",description:"Manage your flock and track eggs"});

// ─── History Edit Modal ──────────────────────────────────────────────────────

const HistoryEditModal = (() => {
  let _el = null;
  let _hass = null;
  let _delta = 1;

  const STYLES = `
    .he-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;
      align-items:center;justify-content:center;z-index:999997;padding:16px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .he-overlay.he-hidden{display:none!important}
    .he-box{background:#fff;border-radius:14px;width:380px;max-width:100%;
      box-shadow:0 20px 60px rgba(0,0,0,.22);color:#111;overflow:hidden}
    @media(prefers-color-scheme:dark){
      .he-box{background:#1c1c1e;color:#f0f0f0}
      .he-field input,.he-field select{background:#2c2c2e!important;border-color:#444!important;color:#f0f0f0!important}
      .he-sep{border-color:#333!important}.he-footer{border-color:#333!important}
      .he-preview{background:#2c2c2e!important;border-color:#444!important}}
    .he-header{padding:16px 20px 12px;border-bottom:1px solid #eee}
    .he-title{font-size:16px;font-weight:600;margin-bottom:2px}
    .he-sub{font-size:11px;color:#6b7280}
    .he-body{padding:16px 20px}
    .he-field{margin-bottom:14px}
    .he-field label{display:block;font-size:11px;font-weight:600;color:#6b7280;
      text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
    .he-field input,.he-field select{width:100%;padding:9px 11px;border-radius:8px;
      border:1px solid #ddd;background:#fff;color:#111;font-size:14px;
      font-family:inherit;box-sizing:border-box;outline:none}
    .he-field input:focus,.he-field select:focus{border-color:#1a6b4a}
    .he-delta-row{display:flex;align-items:center;gap:10px}
    .he-delta-btn{width:36px;height:36px;border-radius:50%;border:2px solid #1a6b4a;
      background:transparent;cursor:pointer;font-size:20px;display:flex;align-items:center;
      justify-content:center;color:#1a6b4a;transition:all .15s;flex-shrink:0;line-height:1}
    .he-delta-btn:hover{background:#1a6b4a;color:#fff}
    .he-delta-val{font-size:22px;font-weight:700;min-width:40px;text-align:center}
    .he-delta-val.pos{color:#1a6b4a}.he-delta-val.neg{color:#dc2626}
    .he-preview{background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;
      padding:10px 14px;margin-top:14px;font-size:12px;color:#374151;line-height:1.6}
    .he-preview strong{color:#111;font-weight:600}
    .he-sep{border:none;border-top:1px solid #eee;margin:0}
    .he-footer{padding:12px 20px;display:flex;gap:8px;justify-content:flex-end}
    .he-btn{cursor:pointer;border:1px solid #ddd;border-radius:8px;background:transparent;
      font-size:13px;padding:8px 16px;font-family:inherit;color:#111;transition:background .15s}
    .he-btn:hover{background:#f0f0f0}
    .he-btn.primary{background:#1a6b4a;color:#fff;border-color:#1a6b4a;font-weight:600}
    .he-btn.primary:hover{background:#145c3e}
    .he-btn.primary:disabled{background:#9ca3af;border-color:#9ca3af;cursor:not-allowed}
  `;

  function _init() {
    if (_el) return;
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    _el = document.createElement("div");
    _el.className = "he-overlay he-hidden";
    _el.innerHTML = `
      <div class="he-box">
        <div class="he-header">
          <div class="he-title">Edit egg history</div>
          <div class="he-sub">Adjust a hen's count for a specific past day</div>
        </div>
        <div class="he-body">
          <div class="he-field"><label>Date</label><input type="date" id="he-date"></div>
          <div class="he-field"><label>Hen</label><select id="he-hen"></select></div>
          <div class="he-field">
            <label>Adjustment</label>
            <div class="he-delta-row">
              <button class="he-delta-btn" id="he-dec">−</button>
              <div class="he-delta-val pos" id="he-dval">+1</div>
              <button class="he-delta-btn" id="he-inc">+</button>
            </div>
          </div>
          <div class="he-preview" id="he-preview">Select a date and hen to preview the change.</div>
        </div>
        <hr class="he-sep">
        <div class="he-footer">
          <button class="he-btn" id="he-cancel">Cancel</button>
          <button class="he-btn primary" id="he-apply">Apply edit</button>
        </div>
      </div>`;
    document.body.appendChild(_el);

    _el.querySelector("#he-dec").addEventListener("click", () => { _delta--; _updateDisplay(); });
    _el.querySelector("#he-inc").addEventListener("click", () => { _delta++; _updateDisplay(); });
    _el.querySelector("#he-date").addEventListener("change", _updatePreview);
    _el.querySelector("#he-hen").addEventListener("change", _updatePreview);
    _el.addEventListener("mousedown", e => { if(e.target===_el) close(); });
    _el.querySelector("#he-cancel").addEventListener("click", close);
    _el.querySelector("#he-apply").addEventListener("click", _apply);
  }

  function _updateDisplay() {
    const dval = _el.querySelector("#he-dval");
    dval.textContent = _delta >= 0 ? `+${_delta}` : `${_delta}`;
    dval.className = "he-delta-val " + (_delta < 0 ? "neg" : "pos");
    _updatePreview();
  }

  function _updatePreview() {
    const d    = _el.querySelector("#he-date").value;
    const name = _el.querySelector("#he-hen").value;
    const prev = _el.querySelector("#he-preview");
    const btn  = _el.querySelector("#he-apply");
    if (!d || !name) { prev.innerHTML="Select a date and hen."; btn.disabled=true; return; }
    if (_delta===0)  { prev.innerHTML="Adjustment is zero — nothing will change."; btn.disabled=true; return; }
    btn.disabled = false;
    const abs = Math.abs(_delta);
    const word = abs===1?"egg":"eggs";
    const verb = _delta>0?`<span style="color:#1a6b4a">add <strong>${abs}</strong> ${word}</span>`:`<span style="color:#dc2626">remove <strong>${abs}</strong> ${word}</span>`;
    prev.innerHTML = `Will ${verb} for <strong>${name}</strong> on <strong>${d}</strong>.<br>
      <span style="font-size:11px;color:#6b7280">If no entry exists for that day/hen, one will be created.</span>`;
  }

  function _apply() {
    const d    = _el.querySelector("#he-date").value;
    const name = _el.querySelector("#he-hen").value;
    if (!d || !name || _delta===0) return;
    const abs = Math.abs(_delta);
    const verb = _delta>0 ? `add ${abs} egg${abs!==1?"s":""}` : `remove ${abs} egg${abs!==1?"s":""}`;
    if (!confirm(`Apply history edit?\n\nThis will ${verb} for ${name} on ${d}.\n\nThe history log will be updated immediately.`)) return;
    const btn = _el.querySelector("#he-apply");
    btn.disabled = true; btn.textContent = "Applying…";
    _hass.callService("chicken_flock","edit_history",{
      target_date: d, chicken_name: name, delta: _delta,
    });
    setTimeout(close, 900);
  }

  function open(hass, chickens, preselectDate) {
    _init();
    _hass = hass;
    _delta = 1;

    const henEl = _el.querySelector("#he-hen");
    const names = [...new Set(Object.values(chickens).map(c=>c.name))].sort();
    henEl.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join("");

    const dateEl = _el.querySelector("#he-date");
    if (preselectDate) {
      dateEl.value = preselectDate;
    } else {
      const y = new Date(); y.setDate(y.getDate()-1);
      dateEl.value = y.toISOString().slice(0,10);
    }

    const btn = _el.querySelector("#he-apply");
    btn.disabled = false; btn.textContent = "Apply edit";
    _updateDisplay();
    _el.classList.remove("he-hidden");
    requestAnimationFrame(() => dateEl.focus());
  }

  function close() { if(_el) _el.classList.add("he-hidden"); }

  return { open, close };
})();

const ImportModal = (() => {
  let _el = null;
  let _hass = null;
  let _mode = "members"; // "members" | "history"
  let _parsed = null;    // parsed preview data waiting for confirmation

  const STYLES = `
    .im-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;
      align-items:center;justify-content:center;z-index:999998;padding:16px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .im-overlay.im-hidden{display:none!important}
    .im-box{background:#fff;border-radius:14px;width:560px;max-width:100%;
      max-height:90vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(0,0,0,.25);color:#111}
    @media(prefers-color-scheme:dark){
      .im-box{background:#1c1c1e;color:#f0f0f0}
      .im-tabs{border-color:#333!important}
      .im-tab{color:#aaa!important}
      .im-tab.im-tab-on{color:#f0f0f0!important;border-color:#f0f0f0!important}
      .im-body{border-color:#333!important}
      .im-footer{border-color:#333!important}
      .im-drop{border-color:#555!important;background:#2c2c2e!important}
      .im-drop:hover,.im-drop.im-over{border-color:#639922!important;background:#1a2e10!important}
      .im-preview-wrap{background:#2c2c2e!important}
      .im-tbl th{background:#333!important;color:#aaa!important}
      .im-tbl td{border-color:#444!important}
      .im-tbl tr:hover td{background:#2a2a2a!important}
      .im-btn{border-color:#555!important;color:#f0f0f0!important}
      .im-btn:hover{background:#333!important}
      .im-result{background:#1a2e10!important;border-color:#3b6d11!important;color:#c0dd97!important}
    }
    .im-header{padding:18px 20px 0;display:flex;align-items:center;justify-content:space-between}
    .im-title{font-size:17px;font-weight:600}
    .im-close{background:none;border:none;cursor:pointer;font-size:22px;color:#aaa;line-height:1}
    .im-close:hover{color:#555}
    .im-tabs{display:flex;gap:0;border-bottom:1px solid #eee;margin:14px 20px 0;padding:0}
    .im-tab{font-size:13px;padding:8px 16px;cursor:pointer;border:none;background:none;
      color:#888;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit}
    .im-tab.im-tab-on{color:#111;border-bottom-color:#111;font-weight:500}
    .im-body{flex:1;overflow-y:auto;padding:16px 20px;border-top:1px solid #eee;margin-top:0}
    .im-footer{padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;align-items:center}
    .im-btn{cursor:pointer;border:1px solid #ddd;border-radius:9px;background:transparent;
      font-size:13px;padding:8px 16px;font-family:inherit;color:#111}
    .im-btn:hover{background:#f5f5f5}
    .im-btn.im-primary{background:#111;color:#fff;border-color:#111;margin-left:auto}
    .im-btn.im-primary:hover{background:#333}
    .im-btn.im-primary:disabled{background:#ccc;border-color:#ccc;cursor:not-allowed}
    .im-drop{border:2px dashed #ccc;border-radius:10px;padding:28px 20px;text-align:center;
      cursor:pointer;transition:all .15s;background:#fafafa;margin-bottom:12px}
    .im-drop:hover,.im-drop.im-over{border-color:#639922;background:#f0f9e8}
    .im-drop-icon{font-size:28px;margin-bottom:8px}
    .im-drop-text{font-size:14px;font-weight:500;margin-bottom:4px}
    .im-drop-sub{font-size:12px;color:#888}
    .im-preview-wrap{background:#f5f5f5;border-radius:8px;overflow:auto;max-height:280px;margin-top:12px}
    .im-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:400px}
    .im-tbl th{position:sticky;top:0;background:#e8e8e8;padding:6px 10px;text-align:left;
      font-weight:500;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
    .im-tbl td{padding:5px 10px;border-bottom:1px solid #eee;white-space:nowrap}
    .im-tbl tr:hover td{background:#efefef}
    .im-tbl td.ok{color:#3b6d11} .im-tbl td.skip{color:#888;font-style:italic}
    .im-count{font-size:12px;color:#888;margin-top:8px}
    .im-result{background:#eaf3de;border:1px solid #97c459;border-radius:8px;
      padding:10px 14px;font-size:13px;color:#3b6d11;margin-bottom:8px}
    .im-error{background:#fcebeb;border:1px solid #f09595;border-radius:8px;
      padding:10px 14px;font-size:13px;color:#a32d2d;margin-bottom:8px}
    .im-hint{font-size:12px;color:#888;line-height:1.5;margin-bottom:12px}
    .im-hint code{background:#eee;padding:1px 5px;border-radius:4px;font-size:11px}
  `;

  // ── Date normaliser ──────────────────────────────────────────────────
  function normaliseDate(raw) {
    if (!raw) return null;
    raw = String(raw).trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // M/D/YYYY or M/D/YY
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [,mo,d,y] = m;
      if (y.length === 2) y = +y < 50 ? "20"+y : "19"+y;
      return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
    return null;
  }

  // ── Bool normaliser ──────────────────────────────────────────────────
  function normaliseBool(raw, def=true) {
    if (raw === undefined || raw === null || raw === "") return def;
    const s = String(raw).trim().toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
    if (s === "true"  || s === "1" || s === "yes") return true;
    return def;
  }

  // ── Sex normaliser ───────────────────────────────────────────────────
  function normaliseSex(raw) {
    const s = String(raw||"").trim().toLowerCase();
    if (s === "male" || s === "rooster" || s === "m") return "rooster";
    return "hen";
  }

  // ── CSV parser ───────────────────────────────────────────────────────
  function parseCSV(text) {
    // Handle both comma and tab delimiters; strip BOM
    text = text.replace(/^\uFEFF/, "").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
    const delim = text.includes("\t") ? "\t" : ",";
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(delim).map(h => h.trim().toLowerCase()
      .replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""));
    return lines.slice(1).map(line => {
      const cells = line.split(delim).map(c => c.trim().replace(/^"|"$/g,""));
      const row = {};
      headers.forEach((h,i) => { row[h] = cells[i] || ""; });
      return row;
    }).filter(r => Object.values(r).some(v => v));
  }

  // ── Parse member rows ────────────────────────────────────────────────
  function parseMemberRows(rows) {
    // Flexible header mapping
    const nameKey   = r => r.name || r.chicken_name || r.bird || "";
    const sexKey    = r => r.sex || r.gender || "";
    const breedKey  = r => r.breed || r.variety || "";
    const birthKey  = r => r.hatched || r.birthdate || r.birth_date || r.dob || "";
    const activeKey = r => (r.active  !== undefined && r.active  !== "") ? r.active  : (r.status || "true");
    const eggsKey   = r => (r.track_eggs !== undefined && r.track_eggs !== "") ? r.track_eggs : (r.eggs || "true");
    const notesKey  = r => r.notes || r.note || r.comments || "";

    return rows.map(r => ({
      name:       nameKey(r).trim(),
      sex:        normaliseSex(sexKey(r)),
      breed:      breedKey(r).trim() || null,
      birthdate:  normaliseDate(birthKey(r)),
      active:     normaliseBool(activeKey(r)),
      track_eggs: normaliseBool(eggsKey(r)),
      notes:      notesKey(r).trim() || null,
    })).filter(r => r.name);
  }

  // ── Parse history rows ───────────────────────────────────────────────
  // Each row is {date, member} — one row = one egg
  function parseHistoryRows(rows) {
    const dateKey   = r => r.date || r.day || r.egg_date || "";
    const memberKey = r => r.member || r.name || r.chicken || r.hen || "";
    const log = {};
    for (const r of rows) {
      const ds = normaliseDate(dateKey(r));
      const name = memberKey(r).trim();
      if (!ds || !name) continue;
      if (!log[ds]) log[ds] = {};
      log[ds][name] = (log[ds][name] || 0) + 1;
    }
    return log;
  }

  // ── Build DOM ────────────────────────────────────────────────────────
  function _init() {
    if (_el) return;
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    _el = document.createElement("div");
    _el.className = "im-overlay im-hidden";
    _el.innerHTML = `
      <div class="im-box">
        <div class="im-header">
          <div class="im-title">Import data</div>
          <button class="im-close" id="im-close">×</button>
        </div>
        <div class="im-tabs">
          <button class="im-tab im-tab-on" data-imtab="members">Flock members</button>
          <button class="im-tab" data-imtab="history">Egg history</button>
        </div>
        <div class="im-body" id="im-body"></div>
        <div class="im-footer">
          <span id="im-status" style="font-size:12px;color:#888"></span>
          <button class="im-btn" id="im-cancel">Cancel</button>
          <button class="im-btn im-primary" id="im-confirm" disabled>Import</button>
        </div>
      </div>`;
    document.body.appendChild(_el);

    _el.addEventListener("mousedown", e => { if (e.target === _el) close(); });
    _el.querySelector("#im-close").addEventListener("click", close);
    _el.querySelector("#im-cancel").addEventListener("click", close);
    _el.querySelector("#im-confirm").addEventListener("click", confirm);
    _el.querySelectorAll("[data-imtab]").forEach(btn => {
      btn.addEventListener("click", () => {
        _mode = btn.dataset.imtab;
        _parsed = null;
        _el.querySelectorAll("[data-imtab]").forEach(b => b.classList.toggle("im-tab-on", b === btn));
        _el.querySelector("#im-confirm").disabled = true;
        _el.querySelector("#im-status").textContent = "";
        _renderBody();
      });
    });
  }

  function _renderBody() {
    const body = _el.querySelector("#im-body");
    if (_mode === "members") {
      body.innerHTML = `
        <div class="im-hint">
          Upload a CSV or TSV with columns: <code>Name</code>, <code>Sex</code>, <code>Breed</code>,
          <code>Hatched</code>, <code>Active</code>, <code>Track Eggs</code>, <code>Notes</code>.
          Dates can be M/D/YYYY or YYYY-MM-DD. Existing birds with the same name are skipped.
        </div>
        <div class="im-drop" id="im-drop">
          <div class="im-drop-icon">📄</div>
          <div class="im-drop-text">Drop CSV/TSV here or click to browse</div>
          <div class="im-drop-sub">Comma or tab delimited</div>
          <input type="file" id="im-file" accept=".csv,.tsv,.txt" style="display:none">
        </div>
        <div id="im-preview"></div>`;
    } else {
      body.innerHTML = `
        <div class="im-hint">
          Upload a CSV or TSV with columns: <code>Date</code>, <code>Member</code>.
          Each row represents one egg laid. Dates can be M/D/YYYY or YYYY-MM-DD.
          Member names must match existing flock members (or will be imported as-is into history).
          Existing dates are merged — counts are added, not replaced.
        </div>
        <div class="im-drop" id="im-drop">
          <div class="im-drop-icon">📊</div>
          <div class="im-drop-text">Drop CSV/TSV here or click to browse</div>
          <div class="im-drop-sub">One row per egg</div>
          <input type="file" id="im-file" accept=".csv,.tsv,.txt" style="display:none">
        </div>
        <div id="im-preview"></div>`;
    }
    _bindDropzone();
  }

  function _bindDropzone() {
    const drop = _el.querySelector("#im-drop");
    const file = _el.querySelector("#im-file");
    drop.addEventListener("click", () => file.click());
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("im-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("im-over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("im-over"); _loadFile(e.dataTransfer.files[0]); });
    file.addEventListener("change", () => _loadFile(file.files[0]));
  }

  function _loadFile(f) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => _processText(e.target.result);
    reader.readAsText(f);
  }

  function _processText(text) {
    const rows = parseCSV(text);
    const confirm_btn = _el.querySelector("#im-confirm");
    const status = _el.querySelector("#im-status");
    const preview = _el.querySelector("#im-preview");

    if (!rows.length) {
      preview.innerHTML = `<div class="im-error">No data rows found. Check the file format.</div>`;
      confirm_btn.disabled = true;
      return;
    }

    if (_mode === "members") {
      const members = parseMemberRows(rows);
      if (!members.length) {
        preview.innerHTML = `<div class="im-error">No valid member rows found. Make sure there is a Name column.</div>`;
        confirm_btn.disabled = true;
        return;
      }
      _parsed = members;
      confirm_btn.disabled = false;
      status.textContent = `${members.length} bird${members.length!==1?"s":""} ready to import`;

      const thead = `<tr>
        <th>Name</th><th>Sex</th><th>Breed</th><th>Hatched</th>
        <th>Active</th><th>Track eggs</th><th>Notes</th>
      </tr>`;
      const tbody = members.map(m => `<tr>
        <td class="ok">${m.name}</td>
        <td>${m.sex}</td>
        <td>${m.breed||"—"}</td>
        <td>${m.birthdate||"—"}</td>
        <td>${m.active?"✓":"✗"}</td>
        <td>${m.track_eggs?"✓":"✗"}</td>
        <td>${m.notes||"—"}</td>
      </tr>`).join("");
      preview.innerHTML = `
        <div class="im-preview-wrap"><table class="im-tbl"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
        <div class="im-count">${members.length} birds parsed from ${rows.length} rows</div>`;

    } else {
      const log = parseHistoryRows(rows);
      const dates = Object.keys(log).sort();
      if (!dates.length) {
        preview.innerHTML = `<div class="im-error">No valid egg records found. Make sure there are Date and Member columns.</div>`;
        confirm_btn.disabled = true;
        return;
      }
      _parsed = log;
      const totalEggs = Object.values(log).reduce((s,d)=>s+Object.values(d).reduce((a,b)=>a+b,0),0);
      const hens = [...new Set(Object.values(log).flatMap(d=>Object.keys(d)))].sort();
      confirm_btn.disabled = false;
      status.textContent = `${totalEggs} eggs across ${dates.length} days ready to import`;

      const thead = `<tr><th>Date</th>${hens.map(h=>`<th>${h}</th>`).join("")}<th>Total</th></tr>`;
      const tbody = dates.map(d => {
        const day = log[d];
        const tot = Object.values(day).reduce((a,b)=>a+b,0);
        return `<tr>
          <td>${d}</td>
          ${hens.map(h=>`<td>${day[h]||""}</td>`).join("")}
          <td style="font-weight:500">${tot}</td>
        </tr>`;
      }).join("");
      preview.innerHTML = `
        <div class="im-preview-wrap"><table class="im-tbl"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
        <div class="im-count">${totalEggs} total eggs · ${dates.length} days · ${hens.length} birds</div>`;
    }
  }

  async function confirm() {
    if (!_parsed || !_hass) return;
    const btn = _el.querySelector("#im-confirm");
    const status = _el.querySelector("#im-status");
    const preview = _el.querySelector("#im-preview");
    btn.disabled = true;

    if (_mode === "members") {
      // Build a set of names already in the flock (case-insensitive) so we
      // can skip duplicates without relying on the service to error.
      const existingNames = new Set(
        Object.values(_hass.states)
          .filter(s => s.entity_id.startsWith("number.flock_") && s.entity_id.endsWith("_eggs"))
          .map(s => (s.attributes.friendly_name || "").replace(/ eggs$/i, "").trim().toLowerCase())
          .filter(Boolean)
      );

      const members = _parsed;
      let added = 0, skipped = 0;
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        btn.textContent = `Importing ${i+1}/${members.length}…`;

        if (existingNames.has(m.name.toLowerCase())) {
          status.textContent = `Skipping ${m.name} (already exists)`;
          skipped++;
          await new Promise(r => setTimeout(r, 20));
          continue;
        }

        status.textContent = `Adding ${m.name}…`;
        try {
          await _hass.callService("chicken_flock", "add_chicken", {
            name:       m.name,
            breed:      m.breed      || undefined,
            sex:        m.sex,
            birthdate:  m.birthdate  || undefined,
            deathdate:  m.deathdate  || undefined,
            active:     m.active,
            track_eggs: m.track_eggs,
            notes:      m.notes      || undefined,
          });
          existingNames.add(m.name.toLowerCase());
          added++;
        } catch(e) {
          skipped++;
        }
        await new Promise(r => setTimeout(r, 80));
      }
      status.textContent = "";
      preview.innerHTML = `<div class="im-result">✓ Done — ${added} bird${added!==1?"s":""} added${skipped?`, ${skipped} skipped (already existed)`:""}</div>`;
      btn.textContent = "Import";
      setTimeout(close, 2500);

    } else {
      // History: send in batches of 90 days to stay well within any size limits
      const log = _parsed;
      const allDates = Object.keys(log).sort();
      const BATCH = 25;  // keep each service call under HA's 32KB event limit
      let sent = 0;
      for (let i = 0; i < allDates.length; i += BATCH) {
        const batchDates = allDates.slice(i, i + BATCH);
        const batchLog = {};
        batchDates.forEach(d => { batchLog[d] = log[d]; });
        btn.textContent = `Importing ${Math.min(i+BATCH, allDates.length)}/${allDates.length} days…`;
        await _hass.callService("chicken_flock", "import_history", {daily_log: batchLog});
        sent += batchDates.length;
        await new Promise(r => setTimeout(r, 120));
      }
      const totalEggs = Object.values(log).reduce((s,d)=>s+Object.values(d).reduce((a,b)=>a+b,0),0);
      status.textContent = "";
      preview.innerHTML = `<div class="im-result">✓ Done — ${sent} days / ${totalEggs} eggs imported</div>`;
      btn.textContent = "Import";
      setTimeout(close, 2500);
    }
  }

  function open(hass) {
    _init();
    _hass = hass;
    _parsed = null;
    _mode = "members";
    _el.querySelectorAll("[data-imtab]").forEach(b => b.classList.toggle("im-tab-on", b.dataset.imtab==="members"));
    _el.querySelector("#im-confirm").disabled = true;
    _el.querySelector("#im-confirm").textContent = "Import";
    _el.querySelector("#im-status").textContent = "";
    _renderBody();
    _el.classList.remove("im-hidden");
  }

  function close() {
    if (_el) _el.classList.add("im-hidden");
    _parsed = null;
  }

  return { open, close };
})();
