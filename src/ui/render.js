// src/ui/render.js
// UI rendering (Stats / Skills / Simulation) + Skill modal.
// Comments in English by request.

import { state, getSelectedCharacter } from "../state.js";
import { t, applyLanguage } from "../i18n.js";
import { STAT_KEYS } from "../models/character.js";
import { calculateStat } from "../services/calc.js";
import { EFFECT_TYPES, BUFFABLE_STATS, CONTROL_TYPES, STATUS_TYPES } from "../models/skill.js";

/* ================= Utilities ================= */

export function statDomId(statKey) {
  return statKey.toLowerCase().replaceAll(" ", "_").replaceAll("%", "pct");
}

function formatPercent(scalingDecimal) {
  const pct = Number(scalingDecimal || 0) * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
}

function formatResultNumber(value) {
  const n = Number(value || 0);
  return String(Math.round(n));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) { return escapeHtml(str); }

function getAllowedEffectTypesForTrigger(triggerType) {
  const overOnly = new Set(["buff", "debuff", "control", "status"]);
  if (triggerType === "over_time") return EFFECT_TYPES;
  return EFFECT_TYPES.filter(x => !overOnly.has(x));
}

function effectTypeToKey(type) {
  if (type === "mana_damage") return "manaDamage";
  if (type === "mana_restore") return "manaRestore";
  return type;
}

function scaledStatValue(character, statName) {
  const entry = character.stats?.[statName];
  if (!entry) return 0;
  return calculateStat(Number(entry.base || 0), Number(entry.scaling || 0), Number(character.level || 1));
}

/* ================= Class types ================= */

const CLASS_TYPE_KEYS = [
  { key: "mage", i18n: "classMage" },
  { key: "tank", i18n: "classTank" },
  { key: "warrior", i18n: "classWarrior" },
  { key: "assassin", i18n: "classAssassin" },
  { key: "support", i18n: "classSupport" },
  { key: "healer", i18n: "classHealer" }
];

const SECONDARY_CLASS_TYPE_KEYS = [
  { key: "burst_damage", i18n: "classBurstDamage" },
  { key: "dot_damage", i18n: "classDotDamage" },
  { key: "enchanter", i18n: "classEnchanter" },
  { key: "dot_dps", i18n: "classDotDps" },
  { key: "high_magic_defense", i18n: "classHighMagicDefense" },
  { key: "high_physical_defense", i18n: "classHighPhysicalDefense" },
  { key: "high_magic_damage", i18n: "classHighMagicDamage" },
  { key: "high_physical_damage", i18n: "classHighPhysicalDamage" },
  { key: "high_hp", i18n: "classHighHp" },
  { key: "high_defense", i18n: "classHighDefense" },
  { key: "crit_damage", i18n: "classCritDamage" },
  { key: "cleanser", i18n: "classCleanser" },
  { key: "anti_tank", i18n: "classAntiTank" }
];

export const SECONDARY_CLASS_KEYS = [
  "burst_damage",
  "dot_damage",
  "enchanter",
  "dot_dps",
  "high_magic_defense",
  "high_physical_defense",
  "high_magic_damage",
  "high_hp",
  "high_defense",
  "high_physical_damage",
  "crit_damage",
  "cleanser",
  "anti-tank",  
];

function renderClassTypesRow(character) {
  // Store as a boolean map on the character for simplicity.
  character.classTypes ??= {};
  character.subClassTypes ??= {};

  return `
    <!-- Primary class types -->
    <div class="class-types-row">
      <div class="class-category-title">
        ${t("classType")}
      </div>

      <div class="skill-pill">
        ${t("classTypes")}
      </div>

      ${CLASS_TYPE_KEYS.map(ct => `
        <label class="class-type-item">
          <input
            type="checkbox"
            data-action="classType"
            data-key="${ct.key}"
            ${character.classTypes[ct.key] ? "checked" : ""}
          />
          <span>${t(ct.i18n)}</span>
        </label>
      `).join("")}
    </div>

    <!-- Sub-category -->
    <div class="sub-class-types-row">
      <div class="sub-category-title">
        ${t("subCategory")}
      </div>

      ${SECONDARY_CLASS_TYPE_KEYS.map(sct => `
        <label class="class-type-item sub">
          <input
            type="checkbox"
            data-action="subClassType"
            data-key="${sct.key}"
            ${character.subClassTypes[sct.key] ? "checked" : ""}
          />
          <span>${t(sct.i18n)}</span>
        </label>
      `).join("")}
    </div>
  `;
}


/* ================= Main UI ================= */

export function renderLanguageButtons() {
  const es = document.getElementById("lang-es");
  const en = document.getElementById("lang-en");
  if (!es || !en) return;

  es.classList.toggle("active", state.lang === "es");
  en.classList.toggle("active", state.lang === "en");
}

export function renderCharacterList() {
  const list = document.getElementById("characterList");
  list.innerHTML = "";

  for (const c of state.characters) {
    const div = document.createElement("div");
    div.className = "character-item" + (c.id === state.selectedCharacterId ? " active" : "");
    div.textContent = c.name;
    div.dataset.action = "selectCharacter";
    div.dataset.id = c.id;
    list.appendChild(div);
  }
}

export function renderCharacterEditor() {
  const content = document.getElementById("content");
  const c = getSelectedCharacter();

  // Main screen: builder vs simulation
  state.mainTab ??= "builder"; // "builder" | "simulation"

  const mainTabsHtml = `
    <div class="main-tabs">
      <button class="tab-btn ${state.mainTab === "builder" ? "active" : ""}" data-action="switchMainTab" data-tab="builder">${t("tabBuilder")}</button>
      <button class="tab-btn ${state.mainTab === "simulation" ? "active" : ""}" data-action="switchMainTab" data-tab="simulation">${t("tabSim")}</button>
    </div>
  `;

  if (state.mainTab === "simulation") {
    if (!state.characters || state.characters.length < 1) {
      content.innerHTML = mainTabsHtml + `<p class="small-note" data-i18n="selectCharacter"></p>`;
      applyLanguage(content);
      return;
    }
    content.innerHTML = mainTabsHtml + renderSimTab();
    applyLanguage(content);
    return;
  }

  // Builder tab requires a selected character
  if (!c) {
    content.innerHTML = mainTabsHtml + `<p data-i18n="selectCharacter"></p>`;
    applyLanguage(content);
    return;
  }

  const tabsHtml = `
    <div class="tabs">
      <button class="tab-btn ${state.activeTab === "stats" ? "active" : ""}" data-action="switchTab" data-tab="stats">${t("tabStats")}</button>
      <button class="tab-btn ${state.activeTab === "skills" ? "active" : ""}" data-action="switchTab" data-tab="skills">${t("tabSkills")}</button>
    </div>
  `;

  let html = `
    ${mainTabsHtml}

    <div class="char-header">
      <input id="charName" class="char-name-input" value="${escapeHtml(c.name)}" />
      <button class="skill-pill skill-pill-danger char-delete-pill" type="button" data-action="deleteCharacter" title="${t("deleteCharacter")}">✕</button>
    </div>

    ${renderClassTypesRow(c)}

    <div class="skill-row">
      <div>
        <span>${t("level")}:</span>
        <input id="levelRange" type="range" min="1" max="100" step="1" value="${c.level}" />
        <strong id="levelValue">${c.level}</strong>
      </div>
      <div class="small-note">${t("scaling")}</div>
    </div>

    ${tabsHtml}
  `;

  if (state.activeTab === "skills") html += renderSkillsTab(c);
  else html += renderStatsTab(c);

  content.innerHTML = html;
  applyLanguage(content);
}


/* ================= Stats Tab ================= */

function renderStatsTab(c) {
  let html = `
    <h3>${t("stats")}</h3>
    <table>
      <tr>
        <th>Stat</th>
        <th>${t("base")}</th>
        <th>${t("scaling")}</th>
        <th>${t("result")}</th>
      </tr>
  `;

  for (const stat of STAT_KEYS) {
    const s = c.stats[stat];
    const raw = calculateStat(Number(s.base || 0), Number(s.scaling || 0), c.level);
    const sid = statDomId(stat);

    html += `
      <tr>
        <td>${escapeHtml(stat)}</td>
        <td><input type="number" data-action="statBase" data-stat="${escapeAttr(stat)}" value="${Number(s.base || 0)}" /></td>
        <td><input type="number" step="0.1" data-action="statScalingPercent" data-stat="${escapeAttr(stat)}" value="${formatPercent(Number(s.scaling || 0))}" /></td>
        <td id="result-${sid}">${formatResultNumber(raw)}</td>
      </tr>
    `;
  }

  html += `</table>`;
  return html;
}

/* ================= Skills Tab ================= */

function summarizeSkill(character, skill) {
  // Preview: not 100% identical to simulation but useful.
  const mag = scaledStatValue(character, "Magical Damage");
  const phys = scaledStatValue(character, "Physical Damage");

  let estDamage = 0;
  let estHeal = 0;
  const states = [];

  for (const tr of (skill.triggers || [])) {
    for (const ef of (tr.effects || [])) {
      if (ef.type === "damage") {
        const base = (tr.impactType === "magical")
          ? mag * (Number(ef.magicPowerPct || 0) / 100)
          : phys * (Number(ef.physicalPowerPct || 0) / 100);
        estDamage += base + Number(ef.pureDamage || 0);
      }
      if (ef.type === "heal") {
        const base = (tr.impactType === "magical")
          ? mag * (Number(ef.magicPowerPct || 0) / 100)
          : phys * (Number(ef.physicalPowerPct || 0) / 100);
        estHeal += base + Number(ef.pureHeal || 0);
      }
      if (ef.type === "buff" || ef.type === "debuff") {
        const sign = ef.type === "buff" ? "+" : "-";
        const rel = Number(ef.relativeChangePct || 0);
        const flat = Number(ef.pureChange || 0);
        if (rel) states.push(`${ef.type}: ${ef.stat} ${sign}${rel}%`);
        else if (flat) states.push(`${ef.type}: ${ef.stat} ${sign}${flat}`);
      }
      if (ef.type === "control") states.push(`${ef.controlType} (${Number(ef.duration || 0)}s)`);
      if (ef.type === "status") states.push(`${ef.statusType} (${Number(ef.duration || 0)}s)`);
      if (ef.type === "dispel") states.push(`dispel`);
    }
  }

  return {
    damage: Math.round(estDamage),
    heal: Math.round(estHeal),
    states: states.slice(0, 4)
  };
}

function renderSkillsTab(c) {
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <h3 style="margin:0;">${t("skills")}</h3>
      <button class="primary-btn" type="button" data-action="openSkillModal">${t("addSkill")}</button>
    </div>
  `;

  if ((c.skills || []).length === 0) {
    html += `<p class="small-note">—</p>`;
    return html;
  }

  html += `<div class="skills-grid">`;

  c.skills.forEach((skill, idx) => {
    const sum = summarizeSkill(c, skill);
    const req = Number(skill.requiredLevel || 1);
    const locked = c.level < req;

    const line =
      sum.damage > 0 ? `${t("damage")}: ${sum.damage}` :
      sum.heal > 0 ? `${t("heal")}: ${sum.heal}` : "—";

    html += `
      <div class="skill-card" data-action="editSkill" data-skill-index="${idx}">
        <div class="skill-card-title">
          <div>${escapeHtml(skill.name)}</div>
          <div class="skill-card-actions">
            <div class="skill-pill ${locked ? "locked" : ""}">
              ${t("requiredLevel")}: ${req}${locked ? " • " + t("locked") : ""}
            </div>
            <button class="skill-pill skill-pill-danger skill-delete-pill" type="button" data-action="deleteSkill" data-skill-index="${idx}" title="Delete skill">✕</button>
          </div>
        </div>

        <div class="skill-meta">
          <div><b>${escapeHtml(line)}</b></div>
          <div class="small-note">${t("cooldown")}: ${skill.cooldown.value} ${skill.cooldown.unit} • ${t("castTime")}: ${Number(skill.castTime || 0).toFixed(1)}s</div>
          <div class="small-note">States: ${escapeHtml(sum.states.length ? sum.states.join(", ") : "—")}</div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

/* ================= Simulation Tab ================= */

function renderSimTab() {
  const chars = state.characters || [];
  state.simConfig ??= { aId: "", bId: "", levelA: 1, levelB: 1, seed: 12345, maxSeconds: 60, expectedBalanceSeconds: 30, balanceLevel: 1, balanceTolerancePct: 10 };
  // Backwards-safe defaults
  state.simConfig.expectedBalanceSeconds ??= 30;
  state.simConfig.balanceLevel ??= 1;
  state.simConfig.balanceTolerancePct ??= 10;

  const cfg = state.simConfig;

  const aId = cfg.aId || (chars[0]?.id ?? "");
  const bId = cfg.bId || (chars[1]?.id ?? chars[0]?.id ?? "");

  const optionsA = chars.map(c => `<option value="${c.id}" ${c.id === aId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const optionsB = chars.map(c => `<option value="${c.id}" ${c.id === bId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");

  const runs = state.simRuns || [];
  const showLogs = !!state.simShowLogs;

  const balance = state.balanceRecommendation || null;
  const allBalance = state.allBalanceRecommendations || null;

  return `
    <h3>${t("simulation")}</h3>

    <div class="skill-row">
      <div>
        <div class="small-note">${t("playerA")}</div>
        <select id="simA" data-action="simCfg">${optionsA}</select>
      </div>
      <div>
        <div class="small-note">${t("level")} (${t("playerA")})</div>
        <input id="simLevelA" data-action="simCfg" type="number" min="1" max="100" value="${cfg.levelA ?? 1}" />
      </div>

      <div>
        <div class="small-note">${t("playerB")}</div>
        <select id="simB" data-action="simCfg">${optionsB}</select>
      </div>
      <div>
        <div class="small-note">${t("level")} (${t("playerB")})</div>
        <input id="simLevelB" data-action="simCfg" type="number" min="1" max="100" value="${cfg.levelB ?? 1}" />
      </div>
    </div>

    <div class="skill-row">
      <div>
        <div class="small-note">${t("seed")}</div>
        <input id="simSeed" data-action="simCfg" type="number" value="${cfg.seed ?? 12345}" />
      </div>

      <div style="align-self:flex-end;">
        <button class="secondary-btn" type="button" data-action="randomSeed">${t("randomSeed")}</button>
      </div>

      <div>
        <div class="small-note">${t("maxSeconds")}</div>
        <input id="simMaxSeconds" data-action="simCfg" type="number" min="10" max="600" value="${cfg.maxSeconds ?? 60}" />
      </div>

      <div style="align-self:flex-end; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="primary-btn" type="button" data-action="runSim">${t("run")}</button>
        <button class="secondary-btn" type="button" data-action="runSim10">${t("run10")}</button>
        <button class="secondary-btn" type="button" data-action="runSimAll">${t("runVsAll")}</button>
      </div>
    </div>

    <div class="skill-row" style="justify-content:space-between; align-items:flex-end; flex-wrap:wrap;">
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div>
          <div class="small-note">${t("expectedBattleDurationForBalance")}</div>
          <input id="expectedBalanceSeconds" data-action="simCfg" type="number" min="1" max="500" value="${cfg.expectedBalanceSeconds ?? 30}" />
        </div>
        <div>
          <div class="small-note">${t("toleranceDurationPct")}</div>
          <input id="balanceTolerancePct" data-action="simCfg" type="number" min="0" max="100" value="${cfg.balanceTolerancePct ?? 10}" />
        </div>
        <div>
          <div class="small-note">${t("levelForBalance")}</div>
          <input id="balanceLevel" data-action="simCfg" type="number" min="1" max="100" value="${cfg.balanceLevel ?? 1}" />
        </div>
        <div style="align-self:flex-end; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="secondary-btn" type="button" data-action="balanceRecommend">${t("balanceRecommendation")}</button>
          <button class="secondary-btn" type="button" data-action="balanceRecommendAll">${t("allBalancing")}</button>
        </div>
      </div>

      <button class="secondary-btn" type="button" data-action="toggleSimLogs">
        ${showLogs ? t("hideLogs") : t("viewLogs")}
      </button>
    </div>

    ${runs.length ? renderRunsSummary(runs) : `
      <div class="skill-box" style="margin-top:12px;">
        <div class="small-note">${t("battleLog")}</div>
        <div class="small-note">—</div>
      </div>
    `}

    ${balance ? renderBalanceRecommendation(balance) : ""}
    ${allBalance ? renderAllBalance(allBalance) : ""}

    ${showLogs ? renderRunsLogs(runs) : ""}
  `;
}

function renderRunsSummary(runs) {
  const counts = {};
  for (const r of runs) counts[r.winner] = (counts[r.winner] || 0) + 1;

  const lines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${escapeHtml(k)}: ${v}`)
    .join(" • ");

  return `
    <div class="skill-box" style="margin-top:12px;">
      <div class="small-note">${t("summary")}</div>
      <div>${lines || "—"}</div>
      <div class="small-note">${t("runsStored")}: ${runs.length}</div>
    </div>
  `;
}



function formatPct(p) {
  return `${(Number(p || 0) * 100).toFixed(1)}%`;
}

function renderRecList(recs) {
  if (!recs || !recs.length) return `<div class="small-note">—</div>`;
  return `<ul class="balance-recs">
    ${recs.map(r => `<li>${escapeHtml(t(r.key))}</li>`).join("")}
  </ul>`;
}

function classLabelFromKey(k) {
  if (!k) return "";

  // If it's a composite key like "tank-healer", translate each part.
  if (String(k).includes("-")) {
    return String(k)
      .split("-")
      .map(part => t(`class_${part}`) || part)
      .join(" - ");
  }

  return t(`class_${k}`) || k;
}


function renderClassListForBalance(primaryKeys = [], secondaryKeys = []) {
  const prim = (primaryKeys || []).map(k => escapeHtml(classLabelFromKey(k))).join(", ");
  const sec = (secondaryKeys || []).map(k => escapeHtml(t(`class_${k}`) || t(`class${k}`) || k)).join(", ");

  const primLine = prim ? `<span class="small-note">${escapeHtml(t("classType"))}: ${prim}</span>` : "";
  const secLine = sec ? `<span class="small-note">${escapeHtml(t("subCategory"))}: ${sec}</span>` : "";

  if (!primLine && !secLine) return "";
  return `<div class="balance-class-note">${[primLine, secLine].filter(Boolean).join(" • ")}</div>`;
}

function renderBalanceRecommendation(balance) {
  const overall = balance.overall || {};
  const byPlayer = (balance.byPlayer || []).slice().sort((a, b) => a.winRate - b.winRate);
  const byClass = (balance.byClass || []).slice().sort((a, b) => a.winRate - b.winRate);

  return `
    <div class="skill-box" style="margin-top:12px;">
      <div class="balance-header">
        <div>
          <div class="small-note">${t("balanceRecommendation")}</div>
          <div class="balance-subject">
            <b>${escapeHtml(balance.subjectName)}</b>
            ${renderClassListForBalance(balance.subjectPrimaryKeys, balance.subjectSecondaryKeys)}
            <span class="small-note">• ${t("expectedBattleDurationForBalance")}: ${Number(balance.expectedSeconds || 0)}s • ${t("toleranceDurationPct")}: ${Number(balance.tolerancePct ?? 0)}% • ${t("levelForBalance")}: ${Number(balance.balanceLevel ?? 1)} • ${t("maxSeconds")}: ${Number(balance.maxSeconds || 0)}s</span>
          </div>
          <div class="balance-metrics">
            ${t("wins")}: ${overall.wins ?? 0}/${overall.games ?? 0} • ${t("draws")}: ${overall.draws ?? 0} • ${t("winrate")}: ${formatPct(overall.winRate)} • ${t("avgDuration")}: ${(Number(overall.avgDuration || 0)).toFixed(1)}s
          </div>
          ${renderRecList(overall.recs)}
        </div>
      </div>

      <div class="balance-grid">
        <div class="balance-col">
          <div class="balance-col-title">${t("balancingAgainstPlayers")}</div>

          ${byPlayer.length ? byPlayer.map(p => `
            <div class="balance-card">
              <div class="balance-card-title">
                <div>
                  <div><b>${escapeHtml(p.opponentName)}</b></div>
                  ${renderClassListForBalance(p.opponentPrimaryKeys || [p.opponentClassKey], p.opponentSecondaryKeys || [])}
                </div>
                <span class="small-note">${t("wins")}: ${p.wins}/${p.games} • ${t("draws")}: ${p.draws ?? 0} • ${t("winrate")}: ${formatPct(p.winRate)} • ${t("avgDuration")}: ${(Number(p.avgDuration || 0)).toFixed(1)}s</span>
              </div>
              ${renderRecList(p.recs)}
            </div>
          `).join("") : `<div class="small-note">—</div>`}
        </div>

        <div class="balance-col">
          <div class="balance-col-title">${t("balancingAgainstClassType")}</div>

          ${byClass.length ? byClass.map(c => `
            <div class="balance-card">
              <div class="balance-card-title">
                <span><b>${escapeHtml(classLabelFromKey(c.classKey))}</b></span>
                <span class="small-note">${t("wins")}: ${c.wins}/${c.games} • ${t("draws")}: ${c.draws ?? 0} • ${t("winrate")}: ${formatPct(c.winRate)} • ${t("avgDuration")}: ${(Number(c.avgDuration || 0)).toFixed(1)}s</span>
              </div>
              ${renderRecList(c.recs)}
            </div>
          `).join("") : `<div class="small-note">—</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderAllBalance(allBalances) {
  const list = (allBalances || []).slice().sort((a, b) => String(a.subjectName).localeCompare(String(b.subjectName)));

  return `
    <div class="skill-box" style="margin-top:12px;">
      <div class="small-note">${t("allBalancing")}</div>

      <div class="all-balance-list">
        ${list.length ? list.map(b => {
          const overall = b.overall || {};
          return `
            <details class="all-balance-item">
              <summary>
                <span><b>${escapeHtml(b.subjectName)}</b></span>
                <span class="small-note">${t("winrate")}: ${formatPct(overall.winRate)} • ${t("avgDuration")}: ${(Number(overall.avgDuration || 0)).toFixed(1)}s</span>
              </summary>
              ${renderBalanceRecommendation(b)}
            </details>
          `;
        }).join("") : `<div class="small-note">—</div>`}
      </div>
    </div>
  `;
}


function rowClass(kind) {
  if (kind === "heal") return "log-heal";
  if (kind === "mana_vamp") return "log-mana-vamp";
  if (kind === "hp_regen") return "log-hp-regen";
  if (kind === "mana_regen") return "log-mana-regen";
  if (kind === "buff") return "log-buff";
  if (kind === "debuff") return "log-debuff";
  if (kind === "dispel") return "log-dispel";
  if (kind === "crit") return "log-crit";
  if (kind === "dot_damage") return "log-dot-damage";
  if (kind === "damage") return "log-damage";
  return "log-info";
}

function renderRunsLogs(runs) {
  if (!runs || !runs.length) return "";

  return `
    <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">
      ${runs.map((run, idx) => {
        const seed = run.seed ?? run.result?.seed ?? "";
        const winner = run.winner ?? run.result?.winner ?? "";
        const rows = run.rows ?? run.result?.rows ?? [];
        const colAHtml = run.colAHtml ?? run.result?.colAHtml ?? null;
        const colBHtml = run.colBHtml ?? run.result?.colBHtml ?? null;

        return `
          <div class="skill-box">
            <div class="small-note">
              #${idx + 1} • ${t("seed")}: ${seed} • ${t("winner")}: <b>${escapeHtml(winner)}</b>
            </div>

            <div class="logs-grid">
              <div>
                <div class="small-note">${t("damageReceivedBy")} A</div>
                <div class="log-panel">
                  ${
                    colAHtml
                      ? (colAHtml || []).join("")
                      : (rows || []).map(r => r.a ? `<div class="log-line ${rowClass(r.kind)}">[${r.t}s] ${escapeHtml(r.a)}</div>` : "").join("")
                  }
                </div>
              </div>

              <div>
                <div class="small-note">${t("damageReceivedBy")} B</div>
                <div class="log-panel">
                  ${
                    colBHtml
                      ? (colBHtml || []).join("")
                      : (rows || []).map(r => r.b ? `<div class="log-line ${rowClass(r.kind)}">[${r.t}s] ${escapeHtml(r.b)}</div>` : "").join("")
                  }
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}


export function renderSkillModal() {
  const modalRoot = document.getElementById("modalRoot");
  const c = getSelectedCharacter();

  if (!state.isSkillModalOpen || !c || !state.skillDraft) {
    modalRoot.innerHTML = "";
    return;
  }

  const s = state.skillDraft;

  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-title">${t("createSkill")}</div>
          <button class="modal-close" type="button" data-action="closeSkillModal">✕</button>
        </div>

        <div class="modal-tabs">
          <button class="modal-tab-btn ${state.skillModalTab === "basic" ? "active" : ""}" type="button" data-action="switchSkillModalTab" data-tab="basic">${t("basicTab")}</button>
          <button class="modal-tab-btn ${state.skillModalTab === "mechanic" ? "active" : ""}" type="button" data-action="switchSkillModalTab" data-tab="mechanic">${t("mechanicTab")}</button>
        </div>

        <div class="modal-body modal-scroll">
          ${state.skillModalTab === "basic" ? renderSkillBasics(s) : renderSkillMechanics(s)}
        </div>

        <div class="modal-actions">
          <button class="secondary-btn" type="button" data-action="closeSkillModal">${t("cancel")}</button>
          <button class="primary-btn" type="button" data-action="createSkill">${t("create")}</button>
        </div>
      </div>
    </div>
  `;

  applyLanguage(modalRoot);
}

function renderSkillBasics(s) {
  return `
    <div class="skill-row">
      <div style="flex:1; min-width:260px;">
        <div class="small-note">${t("name")}</div>
        <input style="width:100%;" type="text" data-action="draftName" value="${escapeHtml(s.name)}" />
      </div>
    </div>

    <div class="skill-row">
      <div>
        <div class="small-note">${t("requiredLevel")}</div>
        <input type="number" min="1" max="100" data-action="draftRequiredLevel" value="${Number(s.requiredLevel || 1)}" />
      </div>
    </div>

    <div class="skill-row">
      <div>
        <div class="small-note">${t("cooldown")}</div>
        <input type="number" min="0" data-action="draftCooldownValue" value="${Number(s.cooldown.value || 0)}" />
        <select data-action="draftCooldownUnit">
          <option value="seconds" ${s.cooldown.unit === "seconds" ? "selected" : ""}>${t("seconds")}</option>
          <option value="minutes" ${s.cooldown.unit === "minutes" ? "selected" : ""}>${t("minutes")}</option>
        </select>
      </div>

      <div>
        <div class="small-note">${t("mpCost")}</div>
        <input type="number" min="0" data-action="draftMpCostValue" value="${Number(s.mpCost.value || 0)}" />
        <select data-action="draftMpCostType">
          <option value="constant" ${s.mpCost.type === "constant" ? "selected" : ""}>${t("constant")}</option>
          <option value="percent" ${s.mpCost.type === "percent" ? "selected" : ""}>${t("percent")}</option>
        </select>
      </div>

      <div>
        <div class="small-note">${t("hpCost")}</div>
        <input type="number" min="0" data-action="draftHpCostValue" value="${Number(s.hpCost.value || 0)}" />
        <select data-action="draftHpCostType">
          <option value="constant" ${s.hpCost.type === "constant" ? "selected" : ""}>${t("constant")}</option>
          <option value="percent" ${s.hpCost.type === "percent" ? "selected" : ""}>${t("percent")}</option>
        </select>
      </div>
    </div>

    <div class="skill-row">
      <div style="min-width:340px;">
        <div class="small-note">${t("castTime")}</div>
        <input type="range" min="0" max="10" step="0.1" data-action="draftCastTime" value="${Number(s.castTime || 0)}" />
        <strong id="draftCastTimeLabel">${Number(s.castTime || 0).toFixed(1)}s</strong>
      </div>

      <div>
        <div class="small-note">${t("targetType")}</div>
        <select data-action="draftTargetType">
          <option value="targeted" ${s.targetType === "targeted" ? "selected" : ""}>${t("targeted")}</option>
          <option value="aoe" ${s.targetType === "aoe" ? "selected" : ""}>${t("aoe")}</option>
        </select>
      </div>
    </div>

    <div class="skill-row">
      <div>
        <div class="small-note">${t("useOn")}</div>
        <label><input type="checkbox" data-action="draftUseOn" data-useon="enemy" ${s.useOn.enemy ? "checked" : ""}> ${t("enemy")}</label>
        <label><input type="checkbox" data-action="draftUseOn" data-useon="ally" ${s.useOn.ally ? "checked" : ""}> ${t("ally")}</label>
        <label><input type="checkbox" data-action="draftUseOn" data-useon="self" ${s.useOn.self ? "checked" : ""}> ${t("self")}</label>
      </div>
    </div>
  `;
}

function renderSkillMechanics(s) {
  const triggers = s.triggers ?? [];
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div class="small-note">${t("triggers")}: ${triggers.length}</div>
      <button class="primary-btn" type="button" data-action="draftAddTrigger">${t("addTrigger")}</button>
    </div>

    ${triggers.map((tr, ti) => renderTriggerCard(tr, ti)).join("")}
  `;
}

function renderTriggerCard(tr, ti) {
  const over = tr.overTime ?? {};
  const effects = tr.effects ?? [];
  const allowed = getAllowedEffectTypesForTrigger(tr.triggerType);

  return `
    <div class="skill-box">
      <div class="skill-row">
        <div><strong>Trigger #${ti + 1}</strong></div>
        <div style="flex:1"></div>
        <button class="secondary-btn" type="button" data-action="draftRemoveTrigger" data-ti="${ti}">✕</button>
      </div>

      <div class="skill-row">
        <div>
          <div class="small-note">${t("triggerType")}</div>
          <select data-action="draftTriggerType" data-ti="${ti}">
            <option value="instant" ${tr.triggerType === "instant" ? "selected" : ""}>${t("instant")}</option>
            <option value="over_time" ${tr.triggerType === "over_time" ? "selected" : ""}>${t("overTime")}</option>
          </select>
        </div>

        <div>
          <div class="small-note">${t("impactType")}</div>
          <select data-action="draftImpactType" data-ti="${ti}">
            <option value="magical" ${(tr.impactType || "magical") === "magical" ? "selected" : ""}>${t("magical")}</option>
            <option value="physical" ${(tr.impactType || "magical") === "physical" ? "selected" : ""}>${t("physical")}</option>
          </select>
        </div>

        <div>
          <div class="small-note">${t("useOn")}</div>
          <label><input type="checkbox" data-action="draftAffectsOn" data-ti="${ti}" data-k="enemy" ${tr.affectsOn.enemy ? "checked" : ""}> ${t("enemy")}</label>
          <label><input type="checkbox" data-action="draftAffectsOn" data-ti="${ti}" data-k="ally" ${tr.affectsOn.ally ? "checked" : ""}> ${t("ally")}</label>
          <label><input type="checkbox" data-action="draftAffectsOn" data-ti="${ti}" data-k="self" ${tr.affectsOn.self ? "checked" : ""}> ${t("self")}</label>
        </div>
      </div>

      ${tr.triggerType === "over_time" ? (() => {
          const immediate = new Set(["buff","debuff","control","status"]);
          const hasImmediate = effects.some(e => immediate.has(e.type));
          const hasNonImmediate = effects.some(e => !immediate.has(e.type));
          const immediateOnly = hasImmediate && !hasNonImmediate;

          if (immediateOnly) {
            return `
        <div class="skill-row">
          <div>
            <div class="small-note">${t("duration")}</div>
            <input type="number" min="0" step="0.1" data-action="draftOverDuration" data-ti="${ti}" value="${Number(over.duration ?? 0)}" />
          </div>

          <div>
            <div class="small-note">${t("maxStacks")}</div>
            <input type="number" min="1" step="1" data-action="draftOverMaxStacks" data-ti="${ti}" value="${Number(over.maxStacks ?? 1)}" />
          </div>

          <div>
            <div class="small-note">${t("canBeDispelled")}</div>
            <label>
              <input type="checkbox" data-action="draftOverDispel" data-ti="${ti}" ${over.canBeDispelled ? "checked" : ""}>
              ${t("canBeDispelled")}
            </label>
          </div>
        </div>
            `;
          }

          return `
        <div class="skill-row">
          <div>
            <div class="small-note">${t("tickInterval")}</div>
            <input type="number" min="0" step="0.1" data-action="draftOverTickInterval" data-ti="${ti}" value="${Number(over.tickInterval ?? 2)}" />
          </div>

          <div>
            <div class="small-note">${t("ticks")}</div>
            <input type="number" min="1" step="1" data-action="draftOverTicks" data-ti="${ti}" value="${Number(over.ticks ?? 1)}" />
          </div>

          <div>
            <div class="small-note">${t("duration")}</div>
            <input type="number" disabled value="${Number(over.duration ?? 0)}" />
          </div>

          <div>
            <div class="small-note">${t("maxStacks")}</div>
            <input type="number" min="1" step="1" data-action="draftOverMaxStacks" data-ti="${ti}" value="${Number(over.maxStacks ?? 1)}" />
          </div>

          <div>
            <div class="small-note">${t("canBeDispelled")}</div>
            <label>
              <input type="checkbox" data-action="draftOverDispel" data-ti="${ti}" ${over.canBeDispelled ? "checked" : ""}>
              ${t("canBeDispelled")}
            </label>
          </div>
        </div>
          `;
        })() : ""}

      <div class="skill-row" style="justify-content:space-between;">
        <div class="small-note">Effects: ${effects.length}</div>
        <button class="primary-btn" type="button" data-action="draftAddEffect" data-ti="${ti}">${t("addEffect")}</button>
      </div>

      ${effects.map((ef, ei) => renderEffectCard(ef, ti, ei, allowed, (tr.impactType || "magical"), tr.triggerType)).join("")}
    </div>
  `;
}

function renderEffectCard(ef, ti, ei, allowedTypes, impactType, triggerType) {
  return `
    <div class="skill-box" style="background: rgba(255,255,255,0.04);">
      <div class="skill-row">
        <div><strong>Effect #${ei + 1}</strong></div>
        <div style="flex:1"></div>
        <button class="secondary-btn" type="button" data-action="draftRemoveEffect" data-ti="${ti}" data-ei="${ei}">✕</button>
      </div>

      <div class="skill-row">
        <div>
          <div class="small-note">${t("effectType")}</div>
          <select data-action="draftEffectType" data-ti="${ti}" data-ei="${ei}">
            ${allowedTypes.map(x => `<option value="${x}" ${ef.type === x ? "selected" : ""}>${t(effectTypeToKey(x))}</option>`).join("")}
          </select>
        </div>
      </div>

      ${renderEffectFields(ef, ti, ei, impactType, triggerType)}
    </div>
  `;
}

function inputNumber(label, action, ti, ei, value) {
  return `
    <div>
      <div class="small-note">${label}</div>
      <input type="number" data-action="${action}" data-ti="${ti}" data-ei="${ei}" value="${Number(value ?? 0)}" />
    </div>
  `;
}

function renderEffectFields(ef, ti, ei, impactType, triggerType) {
  const row = (fields) => `<div class="skill-row">${fields.join("")}</div>`;

  if (ef.type === "damage") {
    const powerField = (impactType === "magical")
      ? inputNumber(t("magicalPowerPct"), "draftEfMagicPct", ti, ei, ef.magicPowerPct)
      : inputNumber(t("physicalPowerPct"), "draftEfPhysPct", ti, ei, ef.physicalPowerPct);

    return row([
      powerField,
      inputNumber(t("pureDamage"), "draftEfPureDamage", ti, ei, ef.pureDamage),
      inputNumber(t("damageLifePct"), "draftEfDamageLifePct", ti, ei, ef.damageLifePct),
      inputNumber(t("vampLifePct"), "draftEfVampLifePct", ti, ei, ef.vampLifePct),
      inputNumber(t("vampManaPct"), "draftEfVampManaPct", ti, ei, ef.vampManaPct),
    ]);
  }

  if (ef.type === "heal") {
    const powerField = (impactType === "magical")
      ? inputNumber(t("magicalPowerPct"), "draftEfMagicPct", ti, ei, ef.magicPowerPct)
      : inputNumber(t("physicalPowerPct"), "draftEfPhysPct", ti, ei, ef.physicalPowerPct);

    return row([
      powerField,
      inputNumber(t("pureHeal"), "draftEfPureHeal", ti, ei, ef.pureHeal),
      inputNumber(t("healLifePct"), "draftEfHealLifePct", ti, ei, ef.healLifePct),
    ]);
  }

  if (ef.type === "mana_damage") {
    const powerField = (impactType === "magical")
      ? inputNumber(t("magicalPowerPct"), "draftEfMagicPct", ti, ei, ef.magicPowerPct)
      : inputNumber(t("physicalPowerPct"), "draftEfPhysPct", ti, ei, ef.physicalPowerPct);

    return row([
      powerField,
      inputNumber(t("pureManaDamage"), "draftEfPureManaDamage", ti, ei, ef.pureManaDamage),
      inputNumber(t("manaDamagePct"), "draftEfManaDamagePct", ti, ei, ef.manaDamagePct),
    ]);
  }

  if (ef.type === "mana_restore") {
    return row([
      inputNumber(t("pureManaRestore"), "draftEfPureManaRestore", ti, ei, ef.pureManaRestore),
      inputNumber(t("manaRestorePct"), "draftEfManaRestorePct", ti, ei, ef.manaRestorePct),
    ]);
  }

  if (ef.type === "buff" || ef.type === "debuff") {
    return `
      <div class="skill-row">
        <div>
          <div class="small-note">${t("affectedStat")}</div>
          <select data-action="draftEfBuffStat" data-ti="${ti}" data-ei="${ei}">
            ${BUFFABLE_STATS.map(st => `<option value="${escapeAttr(st)}" ${ef.stat === st ? "selected" : ""}>${escapeHtml(st)}</option>`).join("")}
          </select>
        </div>
        ${inputNumber(t("pureChange"), "draftEfPureChange", ti, ei, ef.pureChange)}
        ${inputNumber(t("relativeChangePct"), "draftEfRelChangePct", ti, ei, ef.relativeChangePct)}
      </div>
    `;
  }

  if (ef.type === "control") {
    // For over-time triggers, control duration is driven by trigger.overTime.duration.
    // For instant triggers, keep per-effect duration.
    const durField = triggerType === "over_time" ? "" : inputNumber(t("duration"), "draftEfDuration", ti, ei, ef.duration);
    return `
      <div class="skill-row">
        <div>
          <div class="small-note">${t("controlType")}</div>
          <select data-action="draftEfControlType" data-ti="${ti}" data-ei="${ei}">
            ${CONTROL_TYPES.map(x => `<option value="${x}" ${ef.controlType === x ? "selected" : ""}>${t(x)}</option>`).join("")}
          </select>
        </div>
        ${durField}
      </div>
    `;
  }

  if (ef.type === "status") {
    // For over-time triggers, status duration is driven by trigger.overTime.duration.
    // For instant triggers, keep per-effect duration.
    const durField = triggerType === "over_time" ? "" : inputNumber(t("duration"), "draftEfDuration", ti, ei, ef.duration);
    return `
      <div class="skill-row">
        <div>
          <div class="small-note">${t("statusType")}</div>
          <select data-action="draftEfStatusType" data-ti="${ti}" data-ei="${ei}">
            ${STATUS_TYPES.map(x => `<option value="${x}" ${ef.statusType === x ? "selected" : ""}>${t(x)}</option>`).join("")}
          </select>
        </div>
        ${durField}
      </div>
    `;
  }

  if (ef.type === "dispel") {
    return `
      <div class="skill-row">
        <div>
          <div class="small-note">${t("dispelMode")}</div>
          <select data-action="draftEfDispelMode" data-ti="${ti}" data-ei="${ei}">
            <option value="debuff_only" ${ef.dispelMode === "debuff_only" ? "selected" : ""}>${t("debuffOnly")}</option>
            <option value="buff_only" ${ef.dispelMode === "buff_only" ? "selected" : ""}>${t("buffOnly")}</option>
            <option value="both" ${ef.dispelMode === "both" ? "selected" : ""}>${t("both")}</option>
          </select>
        </div>
      </div>
    `;
  }

  return "";
}

/* ================= Live updates ================= */

export function updateAllStatResultsOnly() {
  const c = getSelectedCharacter();
  if (!c) return;

  const levelEl = document.getElementById("levelValue");
  if (levelEl) levelEl.textContent = String(c.level);

  if (state.activeTab !== "stats") return;

  for (const stat of STAT_KEYS) {
    const s = c.stats[stat];
    const sid = statDomId(stat);
    const cell = document.getElementById(`result-${sid}`);
    if (!cell) continue;

    const raw = calculateStat(Number(s.base || 0), Number(s.scaling || 0), c.level);
    cell.textContent = formatResultNumber(raw);
  }
}
