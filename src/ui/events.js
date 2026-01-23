// src/ui/events.js
// All UI events + modal logic + simulation runs.
// Comments in English by request.

import { state, getSelectedCharacter, setSelectedCharacterId } from "../state.js";
import { applyLanguage } from "../i18n.js";
import { createCharacter } from "../models/character.js";
import { createDefaultSkill, createDefaultTriggerForUI, createDefaultEffectForUI } from "../models/skill.js";
import {
  renderLanguageButtons,
  renderCharacterList,
  renderCharacterEditor,
  renderSkillModal,
  updateAllStatResultsOnly,
  statDomId
} from "./render.js";
import { calculateStat } from "../services/calc.js";
import { saveToStorage } from "../storage.js";
import { simulateBattle } from "../sim/engine.js";

function downloadJson(filename, obj) {
  const data = JSON.stringify(obj, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportAllCharacters() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    characters: state.characters || []
  };
  downloadJson("characters_export.json", payload);
}

async function importAllCharactersFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  const chars = Array.isArray(parsed?.characters) ? parsed.characters : null;
  if (!chars) throw new Error("Invalid file format (missing characters array).");

  // Basic sanity: ensure each character has id + name + stats + skills
  for (const c of chars) {
    if (!c || typeof c !== "object") throw new Error("Invalid character entry.");
    if (!c.id || !c.name) throw new Error("Each character must include id and name.");
    c.stats ??= {};
    c.skills ??= [];
  }

  state.characters = chars;
  setSelectedCharacterId(chars[0]?.id ?? "");
  state.activeTab = "stats";
  state.isSkillModalOpen = false;
  state.skillDraft = null;
  state.skillEditingIndex = null;
  state.simRuns = [];

  renderLanguageButtons();
  renderCharacterList();
  renderCharacterEditor();
  renderSkillModal();
  applyLanguage(document);
  saveToStorage();
}

function debounce(fn, waitMs = 250) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
const debouncedSave = debounce(saveToStorage, 250);

function randomSeed32() {
  return Math.floor(Math.random() * 2147483647) + 1;
}

function isOverTimeBuffOnly(trigger) {
  // "Buff-only" here means: over-time trigger where ALL effects are immediate-only effects.
  // Immediate-only effects are applied instantly when the trigger starts (buff/debuff/control/status),
  // and do NOT require tickInterval/ticks to make sense.
  if (!trigger || trigger.triggerType !== "over_time") return false;
  const effects = trigger.effects || [];
  const immediate = new Set(["buff", "debuff", "control", "status"]);
  const hasImmediate = effects.some(e => immediate.has(e.type));
  const hasNonImmediate = effects.some(e => !immediate.has(e.type));
  return hasImmediate && !hasNonImmediate;
}

/** duration rule: duration = ticks * tickInterval */
function recomputeOverTimeDuration(trigger) {
  // For over-time triggers that include non-buff effects, duration is derived from ticks*interval.
  // For buff-only over-time triggers, we keep trigger.overTime.duration as an explicit input.
  if (!trigger || !trigger.overTime) return;
  if (isOverTimeBuffOnly(trigger)) return;

  const interval = Math.max(0, Number(trigger.overTime?.tickInterval || 0));
  const ticks = Math.max(1, Math.floor(Number(trigger.overTime?.ticks || 1)));
  trigger.overTime.ticks = ticks;
  trigger.overTime.duration = interval * ticks;
}


function ensureSimConfig() {
  state.simConfig ??= { aId: "", bId: "", levelA: 1, levelB: 1, seed: 12345, maxSeconds: 60, expectedBalanceSeconds: 30, balanceLevel: 1, balanceTolerancePct: 10 };
  // Backwards-safe defaults in case older state was loaded from storage.
  state.simConfig.expectedBalanceSeconds ??= 30;
  state.simConfig.balanceLevel ??= 1;
  state.simConfig.balanceTolerancePct ??= 10;
  state.simRuns ??= [];
  state.simShowLogs ??= false;
}

function syncSimConfigFromDom() {
  ensureSimConfig();
  const cfg = state.simConfig;

  const aId = document.getElementById("simA")?.value;
  const bId = document.getElementById("simB")?.value;
  const levelA = Number(document.getElementById("simLevelA")?.value || cfg.levelA || 1);
  const levelB = Number(document.getElementById("simLevelB")?.value || cfg.levelB || 1);
  const seed = Number(document.getElementById("simSeed")?.value || cfg.seed || 12345);
  const maxSeconds = Number(document.getElementById("simMaxSeconds")?.value || cfg.maxSeconds || 60);
  const expectedBalanceSeconds = Number(document.getElementById("expectedBalanceSeconds")?.value || cfg.expectedBalanceSeconds || 30);
  const balanceLevel = Number(document.getElementById("balanceLevel")?.value || cfg.balanceLevel || 1);
  const balanceTolerancePct = Number(document.getElementById("balanceTolerancePct")?.value || cfg.balanceTolerancePct || 10);

  if (aId != null) cfg.aId = aId;
  if (bId != null) cfg.bId = bId;

  cfg.levelA = Math.max(1, Math.min(100, Math.floor(levelA)));
  cfg.levelB = Math.max(1, Math.min(100, Math.floor(levelB)));
  cfg.seed = seed;
  cfg.maxSeconds = Math.max(10, Math.min(600, Math.floor(maxSeconds)));
  cfg.expectedBalanceSeconds = Math.max(1, Math.min(500, Math.floor(expectedBalanceSeconds)));
  cfg.balanceLevel = Math.max(1, Math.min(100, Math.floor(balanceLevel)));
  cfg.balanceTolerancePct = Math.max(0, Math.min(100, Number(balanceTolerancePct)));
}

function setLanguage(lang) {
  state.lang = lang;
  renderLanguageButtons();
  renderCharacterList();
  renderCharacterEditor();
  renderSkillModal();
  applyLanguage(document);
  saveToStorage();
}

function updateSingleStatResult(stat) {
  const c = getSelectedCharacter();
  if (!c || state.activeTab !== "stats") return;

  const s = c.stats[stat];
  const sid = statDomId(stat);
  const cell = document.getElementById(`result-${sid}`);
  if (!cell) return;

  const raw = calculateStat(Number(s.base || 0), Number(s.scaling || 0), c.level);
  cell.textContent = String(Math.round(raw));
}

/* ===== logs -> HTML columns ===== */

function cssClassForKind(kind) {
  if (kind === "heal") return "log-line log-heal";
  if (kind === "mana_vamp") return "log-line log-mana-vamp";
  if (kind === "hp_regen") return "log-line log-hp-regen";
  if (kind === "mana_regen") return "log-line log-mana-regen";
  if (kind === "buff") return "log-line log-buff";
  if (kind === "debuff") return "log-line log-debuff";
  if (kind === "dispel") return "log-line log-dispel";
  if (kind === "crit") return "log-line log-crit";
  if (kind === "dot_damage") return "log-line log-dot-damage";
  if (kind === "damage") return "log-line log-damage";
  return "log-line log-info";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rowsToColumnsHtml(rows) {
  const colAHtml = [];
  const colBHtml = [];

  for (const r of rows || []) {
    const time = `[${r.t}s] `;
    const cls = cssClassForKind(r.kind);

    if (r.a) colAHtml.push(`<div class="${cls}">${escapeHtml(time + r.a)}</div>`);
    if (r.b) colBHtml.push(`<div class="${cls}">${escapeHtml(time + r.b)}</div>`);
  }

  return { colAHtml, colBHtml };
}


function winnerIsA(resWinner, aName) {
  const w = String(resWinner ?? "");
  if (!w) return false;
  if (w === "draw" || w === "timeout") return false;
  return w === aName;
}

function getPrimaryClassKey(ch) {
  // Prefer UI-selected classTypes; fall back to legacy roles for older saves.
  const r = ch?.classTypes || ch?.roles || {};

  // Priority order (controls output order).
  const order = ["tank", "warrior", "assassin", "mage", "healer", "support"];

  // Collect all active primary roles (not "first match wins")
  const picked = order.filter((k) => !!r[k]);

  if (picked.length === 0) return "unclassified";

  // Combined key, example: mage-support, mage-assassin, tank-warrior, etc.
  return picked.join("-");
}


function getSecondaryClassKeys(ch) {
  const m = ch?.subClassTypes || {};
  return Object.keys(m).filter((k) => !!m[k]).sort();
}

function getPrimaryClassKeys(ch) {
  const r = ch?.classTypes || ch?.roles || {};
  const order = ["tank", "warrior", "assassin", "mage", "healer", "support"];
  const picked = order.filter((k) => !!r[k]);
  return picked.length ? picked : ["unclassified"];
}

function durationAssessment(avgSeconds, expectedSeconds, tolerancePct) {
  const expected = Math.max(1, Number(expectedSeconds || 1));
  const tol = Math.max(0, Number(tolerancePct || 0)) / 100;
  const minOk = expected * (1 - tol);
  const maxOk = expected * (1 + tol);

  const avg = Number(avgSeconds || 0);
  if (avg >= minOk && avg <= maxOk) {
    return { band: "ok", direction: "ok", severity: 0, minOk, maxOk };
  }

  const longer = avg > maxOk;
  const base = longer ? maxOk : minOk;
  const diffRatio = Math.abs(avg - base) / Math.max(1e-9, base);

  // Severity thresholds (as requested): 20% => a little, 40% => very, 60% => totally.
  let severity = 1;
  if (diffRatio >= 0.6) severity = 3;
  else if (diffRatio >= 0.4) severity = 2;
  else if (diffRatio >= 0.2) severity = 1;
  else severity = 0; // slightly out of range

  return { band: longer ? "long" : "short", direction: longer ? "long" : "short", severity, minOk, maxOk, diffRatio };
}

function computeBalanceRecommendation(subject0, cfg) {
  const subjectName = subject0.name;
  const expected = Number(cfg.expectedBalanceSeconds || 30);
  const tolerancePct = Number(cfg.balanceTolerancePct || 10);
  const balanceLevel = Number(cfg.balanceLevel || 1);
  const maxSeconds = 500; // required: balance runs always simulate up to 500s
  const runsPerOpp = 10;

  // Include self-vs-self as well (requested)
  const opponents = (state.characters || []);

  const durationFromRows = (rows) => {
    let maxT = 0;
    for (const r of rows || []) maxT = Math.max(maxT, Number(r.t || 0));
    return maxT;
  };

  const byPlayer = [];
  const byClassMap = new Map();

  let totalWins = 0;
  let totalGames = 0;
  let totalDur = 0;

  for (const opp0 of opponents) {
    let wins = 0;
    let draws = 0;
    let games = 0;
    let durSum = 0;

    for (let i = 0; i < runsPerOpp; i++) {
      const seed = randomSeed32();

      const A = JSON.parse(JSON.stringify(subject0));
      const B = JSON.parse(JSON.stringify(opp0));
      // Balance runs use a unified level for everyone.
      A.level = balanceLevel;
      B.level = balanceLevel;

      const res = simulateBattle(A, B, { seed, maxSeconds });

      games += 1;
      totalGames += 1;

      const d = durationFromRows(res.rows);
      durSum += d;
      totalDur += d;

      const winner = String(res.winner ?? "");
      const won = winnerIsA(winner, subjectName);
      const draw = (winner === "draw" || winner === "timeout");
      if (won) { wins += 1; totalWins += 1; }
      else if (draw) { draws += 1; }
    }

    const winRate = games ? wins / games : 0;
    const avgDur = games ? durSum / games : 0;

    const classKey = getPrimaryClassKey(opp0);

    const opponentPrimaryKeys = getPrimaryClassKeys(opp0);
    const opponentSecondaryKeys = getSecondaryClassKeys(opp0);

    // Player-level recommendations
    const recs = [];
    if (winRate < 0.40) recs.push({ key: "rec_increasePowerOrReduceCd" });
    if (winRate > 0.60) recs.push({ key: "rec_reducePowerOrIncreaseCd" });

    const dur = durationAssessment(avgDur, expected, tolerancePct);
    if (dur.direction === "long") {
      if (dur.severity >= 3) recs.push({ key: "rec_duration_totallyLong" });
      else if (dur.severity >= 2) recs.push({ key: "rec_duration_veryLong" });
      else if (dur.severity >= 1) recs.push({ key: "rec_duration_aLittleLong" });
      else recs.push({ key: "rec_duration_slightlyLong" });
    } else if (dur.direction === "short") {
      if (dur.severity >= 3) recs.push({ key: "rec_duration_totallyShort" });
      else if (dur.severity >= 2) recs.push({ key: "rec_duration_veryShort" });
      else if (dur.severity >= 1) recs.push({ key: "rec_duration_aLittleShort" });
      else recs.push({ key: "rec_duration_slightlyShort" });
    }

    byPlayer.push({
      opponentId: opp0.id,
      opponentName: opp0.name,
      opponentClassKey: classKey,
      opponentPrimaryKeys,
      opponentSecondaryKeys,
      wins,
      draws,
      games,
      winRate,
      avgDuration: avgDur,
      recs
    });

    // Class aggregation
    const entry = byClassMap.get(classKey) || { classKey, wins: 0, draws: 0, games: 0, durSum: 0 };
    entry.wins += wins;
    entry.draws += draws;
    entry.games += games;
    entry.durSum += durSum;
    byClassMap.set(classKey, entry);
  }

  const byClass = Array.from(byClassMap.values()).map(x => ({
    classKey: x.classKey,
    wins: x.wins,
    draws: x.draws,
    games: x.games,
    winRate: x.games ? x.wins / x.games : 0,
    avgDuration: x.games ? x.durSum / x.games : 0,
    recs: []
  }));

  // Class-level recommendations based on expected duration + winrate
  for (const c of byClass) {
    if (c.winRate < 0.40) c.recs.push({ key: "rec_underperform_vs_class" });
    if (c.winRate > 0.60) c.recs.push({ key: "rec_overperform_vs_class" });

    const dur = durationAssessment(c.avgDuration, expected, tolerancePct);
    if (dur.direction === "long") {
      if (dur.severity >= 3) c.recs.push({ key: "rec_class_duration_totallyLong" });
      else if (dur.severity >= 2) c.recs.push({ key: "rec_class_duration_veryLong" });
      else if (dur.severity >= 1) c.recs.push({ key: "rec_class_duration_aLittleLong" });
      else c.recs.push({ key: "rec_class_duration_slightlyLong" });
    } else if (dur.direction === "short") {
      if (dur.severity >= 3) c.recs.push({ key: "rec_class_duration_totallyShort" });
      else if (dur.severity >= 2) c.recs.push({ key: "rec_class_duration_veryShort" });
      else if (dur.severity >= 1) c.recs.push({ key: "rec_class_duration_aLittleShort" });
      else c.recs.push({ key: "rec_class_duration_slightlyShort" });
    }
  }

  const overallWinRate = totalGames ? totalWins / totalGames : 0;
  const overallAvgDuration = totalGames ? totalDur / totalGames : 0;

  // Overall recommendations
  const overallRecs = [];
  if (overallWinRate < 0.40) overallRecs.push({ key: "rec_overall_lowWinrate" });
  if (overallWinRate > 0.60) overallRecs.push({ key: "rec_overall_highWinrate" });
  const overallDur = durationAssessment(overallAvgDuration, expected, tolerancePct);
  if (overallDur.direction === "long") {
    if (overallDur.severity >= 3) overallRecs.push({ key: "rec_overall_duration_totallyLong" });
    else if (overallDur.severity >= 2) overallRecs.push({ key: "rec_overall_duration_veryLong" });
    else if (overallDur.severity >= 1) overallRecs.push({ key: "rec_overall_duration_aLittleLong" });
    else overallRecs.push({ key: "rec_overall_duration_slightlyLong" });
  } else if (overallDur.direction === "short") {
    if (overallDur.severity >= 3) overallRecs.push({ key: "rec_overall_duration_totallyShort" });
    else if (overallDur.severity >= 2) overallRecs.push({ key: "rec_overall_duration_veryShort" });
    else if (overallDur.severity >= 1) overallRecs.push({ key: "rec_overall_duration_aLittleShort" });
    else overallRecs.push({ key: "rec_overall_duration_slightlyShort" });
  }

  return {
    subjectId: subject0.id,
    subjectName,
    subjectPrimaryKeys: getPrimaryClassKeys(subject0),
    subjectSecondaryKeys: getSecondaryClassKeys(subject0),
    expectedSeconds: expected,
    tolerancePct,
    balanceLevel,
    maxSeconds,
    overall: { wins: totalWins, games: totalGames, winRate: overallWinRate, avgDuration: overallAvgDuration, recs: overallRecs },
    byPlayer,
    byClass
  };
}

function runOneSim(seedOverride = null) {
  ensureSimConfig();
  syncSimConfigFromDom();
  const cfg = state.simConfig;

  const aId = cfg.aId;
  const bId = cfg.bId;

  if (!aId || !bId) return { error: "Select both players." };

  const A0 = state.characters.find(x => x.id === aId);
  const B0 = state.characters.find(x => x.id === bId);
  if (!A0 || !B0) return { error: "Character not found." };

  const A = JSON.parse(JSON.stringify(A0));
  const B = JSON.parse(JSON.stringify(B0));

  A.level = cfg.levelA;
  B.level = cfg.levelB;

  const seed = Number(seedOverride ?? cfg.seed ?? 12345);
  const res = simulateBattle(A, B, { seed, maxSeconds: cfg.maxSeconds });

  const cols = rowsToColumnsHtml(res.rows);

  return {
    seed: res.seed,
    winner: res.winner,
    colAHtml: cols.colAHtml,
    colBHtml: cols.colBHtml
  };
}

/* ===== modal open/close ===== */

function openSkillModal(editIndex) {
  const c = getSelectedCharacter();
  if (!c) return;

  state.isSkillModalOpen = true;
  state.skillModalTab = "basic";
  state.skillEditingIndex = Number.isInteger(editIndex) ? editIndex : null;

  state.skillDraft = (state.skillEditingIndex !== null)
    ? JSON.parse(JSON.stringify(c.skills[state.skillEditingIndex]))
    : createDefaultSkill();

  for (const tr of (state.skillDraft.triggers || [])) {
    if (tr.triggerType === "over_time" && !isOverTimeBuffOnly(tr)) recomputeOverTimeDuration(tr);
  }

  renderSkillModal();
  applyLanguage(document);
}

function closeSkillModal() {
  state.isSkillModalOpen = false;
  state.skillDraft = null;
  state.skillEditingIndex = null;
  renderSkillModal();
}

function getEffectIndex(target) {
  return {
    ti: parseInt(target.dataset.ti, 10),
    ei: parseInt(target.dataset.ei, 10),
  };
}

function patchEffectNumber(actionName, field, target) {
  if (target.dataset.action !== actionName) return;
  const { ti, ei } = getEffectIndex(target);
  state.skillDraft.triggers[ti].effects[ei][field] = Number(target.value);
}

/* ================= WIRE ================= */

export function wireGlobalEvents() {
  ensureSimConfig();

  window.addEventListener("beforeunload", () => {
    try { saveToStorage(); } catch (_) {}
  });

  document.getElementById("btnAddCharacter").addEventListener("click", () => {
    const c = createCharacter();
    state.characters.push(c);
    setSelectedCharacterId(c.id);
    state.activeTab = "stats";

    renderCharacterList();
    renderCharacterEditor();
    renderSkillModal();
    applyLanguage(document);

    saveToStorage();
  });

  document.getElementById("lang-es").addEventListener("click", () => setLanguage("es"));
  document.getElementById("lang-en").addEventListener("click", () => setLanguage("en"));

  // Import / Export (all characters + skills)
  document.getElementById("btnExportAll")?.addEventListener("click", () => {
    try { exportAllCharacters(); } catch (e) { console.error(e); }
  });

  document.getElementById("btnImportAll")?.addEventListener("click", () => {
    const input = document.getElementById("importFileInput");
    if (!input) return;
    input.value = "";
    input.click();
  });

  document.getElementById("importFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importAllCharactersFromFile(file);
    } catch (err) {
      console.error(err);
      alert(err?.message || "Import failed");
    }
  });

  document.getElementById("characterList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-action='selectCharacter']");
    if (!item) return;

    setSelectedCharacterId(item.dataset.id);

    renderCharacterList();
    renderCharacterEditor();
    renderSkillModal();

    saveToStorage();
  });

  const content = document.getElementById("content");
  const modalRoot = document.getElementById("modalRoot");

  /* Live: level slider */
  content.addEventListener("input", (e) => {
    const target = e.target;
    if (target.id === "levelRange") {
      const c = getSelectedCharacter();
      if (!c) return;
      c.level = parseInt(target.value, 10);
      updateAllStatResultsOnly();
      debouncedSave();
    }
  });

  /* Persist sim config while editing (so Run won't reset UI) */
  content.addEventListener("input", (e) => {
    const el = e.target;
    if (el?.dataset?.action === "simCfg") {
      syncSimConfigFromDom();
      debouncedSave();
    }
  });
  content.addEventListener("change", (e) => {
    const el = e.target;
    if (el?.dataset?.action === "simCfg") {
      syncSimConfigFromDom();
      debouncedSave();
    }
  });

  /* Editor change (stats/name) */
  content.addEventListener("change", (e) => {
    const target = e.target;
    const c = getSelectedCharacter();
    if (!c) return;

    if (target.id === "charName") {
      c.name = target.value;
      renderCharacterList();
      debouncedSave();
      return;
    }

    const action = target.dataset.action;
    if (!action) return;

    if (action === "classType") {
      // Use data-key (preferred). Keep data-type as a backwards-safe fallback.
      const typeKey = target.dataset.key || target.dataset.type || "";
      if (!typeKey) return;

      c.classTypes = c.classTypes || {};
      // Store as boolean map: { tank: true, mage: false, ... }
      c.classTypes[typeKey] = !!target.checked;

      persist();
      render();
      debouncedSave();
      return;
    }

    if (action === "subClassType") {
      // Use data-key (preferred). Keep data-type as a backwards-safe fallback.
      const typeKey = target.dataset.key || target.dataset.type || "";
      if (!typeKey) return;

      c.subClassTypes = c.subClassTypes || {};
      // Store as boolean map: { burst_damage: true, dot_damage: false, ... }
      c.subClassTypes[typeKey] = !!target.checked;

      persist();
      render();
      debouncedSave();
      return;
    }


    if (action === "statBase") {
      const stat = target.dataset.stat;
      c.stats[stat].base = Number(target.value);
      updateSingleStatResult(stat);
      debouncedSave();
      return;
    }

    if (action === "statScalingPercent") {
      const stat = target.dataset.stat;
      c.stats[stat].scaling = Number(target.value) / 100;
      updateSingleStatResult(stat);
      debouncedSave();
      return;
    }
  });

  /* Editor clicks */
  content.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "switchMainTab") {
      state.mainTab = btn.dataset.tab; // builder | simulation
      // When entering builder, default to stats if previous tab was sim
      if (state.mainTab === "builder" && state.activeTab === "sim") state.activeTab = "stats";
      renderCharacterEditor();
      renderSkillModal();
      debouncedSave();
      return;
    }

    if (action === "switchTab") {
      state.activeTab = btn.dataset.tab; // stats | skills | sim
      renderCharacterEditor();
      renderSkillModal();
      debouncedSave();
      return;
    }

    if (action === "openSkillModal") {
      openSkillModal(null);
      return;
    }

    if (action === "editSkill") {
      openSkillModal(parseInt(btn.dataset.skillIndex, 10));
      return;
    }

    if (action === "deleteSkill") {
      const c = getSelectedCharacter();
      if (!c) return;
      const idx = parseInt(btn.dataset.skillIndex, 10);
      if (!Number.isFinite(idx)) return;

      c.skills = c.skills || [];
      if (idx < 0 || idx >= c.skills.length) return;

      c.skills.splice(idx, 1);
      renderCharacterEditor();
      renderSkillModal();
      saveToStorage();
      return;
    }

    if (action === "deleteCharacter") {
      const c = getSelectedCharacter();
      if (!c) return;

      const idx = state.characters.findIndex(x => x.id === c.id);
      if (idx >= 0) state.characters.splice(idx, 1);

      // Select next available character
      const next = state.characters[idx] || state.characters[idx - 1] || state.characters[0] || null;
      setSelectedCharacterId(next ? next.id : "");

      renderCharacterList();
      renderCharacterEditor();
      renderSkillModal();
      saveToStorage();
      return;
    }

    if (action === "toggleSimLogs") {
      state.simShowLogs = !state.simShowLogs;
      renderCharacterEditor();
      return;
    }

    if (action === "randomSeed") {
      ensureSimConfig();
      const seed = randomSeed32();
      state.simConfig.seed = seed;
      const seedEl = document.getElementById("simSeed");
      if (seedEl) seedEl.value = String(seed);
      debouncedSave();
      return;
    }

    if (action === "runSim") {
      const out = runOneSim(null);
      if (out.error) {
        state.simRuns = [{ seed: "-", winner: out.error, colAHtml: [], colBHtml: [] }];
        state.simShowLogs = true;
      } else {
        state.simRuns = [out];
        state.simShowLogs = true;
      }
      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "runSim10") {
      const runs = [];
      for (let i = 0; i < 10; i++) {
        const out = runOneSim(randomSeed32());
        if (out.error) {
          state.simRuns = [{ seed: "-", winner: out.error, colAHtml: [], colBHtml: [] }];
          state.simShowLogs = true;
          renderCharacterEditor();
          return;
        }
        runs.push(out);
      }
      state.simRuns = runs;
      state.simShowLogs = false; // show summary first
      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "runSimAll") {
      ensureSimConfig();
      syncSimConfigFromDom();
      const cfg = state.simConfig;

      const aId = cfg.aId || "";
      if (!aId) return;

      const A0 = state.characters.find(x => x.id === aId);
      if (!A0) return;

      const runs = [];
      const opponents = state.characters || [];

      for (const opp0 of opponents) {
        const seed = randomSeed32();

        const A = JSON.parse(JSON.stringify(A0));
        const B = JSON.parse(JSON.stringify(opp0));
        A.level = cfg.levelA;
        B.level = cfg.levelB;

        const res = simulateBattle(A, B, { seed, maxSeconds: cfg.maxSeconds });
        const cols = rowsToColumnsHtml(res.rows);

        runs.push({
          seed: res.seed,
          winner: res.winner,
          colAHtml: cols.colAHtml,
          colBHtml: cols.colBHtml
        });
      }

      state.simRuns = runs;
      state.simShowLogs = false; // summary first
      state.balanceRecommendation = null;

      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "balanceRecommend") {
      ensureSimConfig();
      syncSimConfigFromDom();
      const cfg = state.simConfig;

      const aId = cfg.aId || "";
      if (!aId) return;

      const subject0 = state.characters.find(c => c.id === aId);
      if (!subject0) return;

      state.balanceRecommendation = computeBalanceRecommendation(subject0, cfg);
      state.allBalanceRecommendations = null;

      state.simShowLogs = false;
      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "balanceRecommendAll") {
      ensureSimConfig();
      syncSimConfigFromDom();
      const cfg = state.simConfig;

      const out = [];
      for (const ch of (state.characters || [])) {
        out.push(computeBalanceRecommendation(ch, cfg));
      }

      // Keep the single-subject panel hidden when running the all-balancing view.
      state.balanceRecommendation = null;
      state.allBalanceRecommendations = out;
      state.simShowLogs = false;
      renderCharacterEditor();
      debouncedSave();
      return;
    }
  });

  /* ================= MODAL ================= */

  modalRoot.addEventListener("click", (e) => {
    // Close ONLY when clicking the overlay background
    if (e.target.classList.contains("modal-overlay")) {
      closeSkillModal();
      return;
    }

    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "closeSkillModal") {
      closeSkillModal();
      return;
    }

    if (action === "switchSkillModalTab") {
      state.skillModalTab = btn.dataset.tab; // basic | mechanic
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (action === "draftAddTrigger") {
      const tr = createDefaultTriggerForUI();
      if (tr.triggerType === "over_time") recomputeOverTimeDuration(tr);
      state.skillDraft.triggers.push(tr);
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (action === "draftRemoveTrigger") {
      const ti = parseInt(btn.dataset.ti, 10);
      state.skillDraft.triggers.splice(ti, 1);
      if (state.skillDraft.triggers.length === 0) {
        const tr = createDefaultTriggerForUI();
        if (tr.triggerType === "over_time") recomputeOverTimeDuration(tr);
        state.skillDraft.triggers.push(tr);
      }
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (action === "draftAddEffect") {
      const ti = parseInt(btn.dataset.ti, 10);
      const trigger = state.skillDraft.triggers[ti];
      trigger.effects = trigger.effects || [];
      trigger.effects.push(createDefaultEffectForUI("damage"));

      if (trigger.triggerType === "over_time" && !isOverTimeBuffOnly(trigger)) {
        recomputeOverTimeDuration(trigger);
      }

      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (action === "draftRemoveEffect") {
      const ti = parseInt(btn.dataset.ti, 10);
      const ei = parseInt(btn.dataset.ei, 10);
      const trigger = state.skillDraft.triggers[ti];

      trigger.effects.splice(ei, 1);
      if (trigger.effects.length === 0) trigger.effects.push(createDefaultEffectForUI("damage"));

      if (trigger.triggerType === "over_time" && !isOverTimeBuffOnly(trigger)) {
        recomputeOverTimeDuration(trigger);
      }

      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (action === "createSkill") {
      const c = getSelectedCharacter();
      if (!c || !state.skillDraft) return;

      const clone = JSON.parse(JSON.stringify(state.skillDraft));

      if (state.skillEditingIndex !== null) c.skills[state.skillEditingIndex] = clone;
      else c.skills.push(clone);

      saveToStorage();

      closeSkillModal();
      state.activeTab = "skills";
      renderCharacterEditor();
      renderSkillModal();
      return;
    }
  });

  modalRoot.addEventListener("input", (e) => {
    const target = e.target;
    if (!state.isSkillModalOpen || !state.skillDraft) return;

    if (target.dataset.action === "draftCastTime") {
      state.skillDraft.castTime = Number(target.value);
      const lbl = document.getElementById("draftCastTimeLabel");
      if (lbl) lbl.textContent = `${state.skillDraft.castTime.toFixed(1)}s`;
      return;
    }
  });

  modalRoot.addEventListener("change", (e) => {
    const target = e.target;
    if (!state.isSkillModalOpen || !state.skillDraft) return;

    const a = target.dataset.action;

    // Basic
    if (a === "draftName") state.skillDraft.name = target.value;
    if (a === "draftRequiredLevel") state.skillDraft.requiredLevel = Number(target.value);

    if (a === "draftCooldownValue") state.skillDraft.cooldown.value = Number(target.value);
    if (a === "draftCooldownUnit") state.skillDraft.cooldown.unit = target.value;

    if (a === "draftMpCostValue") state.skillDraft.mpCost.value = Number(target.value);
    if (a === "draftMpCostType") state.skillDraft.mpCost.type = target.value;

    if (a === "draftHpCostValue") state.skillDraft.hpCost.value = Number(target.value);
    if (a === "draftHpCostType") state.skillDraft.hpCost.type = target.value;

    if (a === "draftTargetType") state.skillDraft.targetType = target.value;

    if (a === "draftUseOn") {
      const k = target.dataset.useon;
      state.skillDraft.useOn[k] = target.checked;
    }

    // Trigger
    if (a === "draftTriggerType") {
      const ti = parseInt(target.dataset.ti, 10);
      const trigger = state.skillDraft.triggers[ti];
      trigger.triggerType = target.value;

      if (trigger.triggerType !== "over_time") {
        // Remove over-time-only effect types
        const overOnly = new Set(["buff", "debuff", "control", "status"]);
        trigger.effects = (trigger.effects || []).map(ef => {
          if (!overOnly.has(ef.type)) return ef;
          return createDefaultEffectForUI("damage");
        });
      } else {
        recomputeOverTimeDuration(trigger);
      }

      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (a === "draftImpactType") {
      const ti = parseInt(target.dataset.ti, 10);
      state.skillDraft.triggers[ti].impactType = target.value;
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (a === "draftAffectsOn") {
      const ti = parseInt(target.dataset.ti, 10);
      const k = target.dataset.k;
      state.skillDraft.triggers[ti].affectsOn[k] = target.checked;
      return;
    }

    // Over time
    if (a === "draftOverDuration") {
      const ti = parseInt(target.dataset.ti, 10);
      const trigger = state.skillDraft.triggers[ti];
      trigger.overTime.duration = Math.max(0, Number(target.value));
      return;
    }

    if (a === "draftOverTickInterval") {
      const ti = parseInt(target.dataset.ti, 10);
      const trigger = state.skillDraft.triggers[ti];
      trigger.overTime.tickInterval = Number(target.value);
      recomputeOverTimeDuration(trigger);
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (a === "draftOverTicks") {
      const ti = parseInt(target.dataset.ti, 10);
      const trigger = state.skillDraft.triggers[ti];
      trigger.overTime.ticks = Number(target.value);
      recomputeOverTimeDuration(trigger);
      renderSkillModal();
      applyLanguage(document);
      return;
    }

    if (a === "draftOverMaxStacks") {
      const ti = parseInt(target.dataset.ti, 10);
      state.skillDraft.triggers[ti].overTime.maxStacks = Number(target.value);
      return;
    }

    if (a === "draftOverDispel") {
      const ti = parseInt(target.dataset.ti, 10);
      state.skillDraft.triggers[ti].overTime.canBeDispelled = target.checked;
      return;
    }

    // Effect type
    if (a === "draftEffectType") {
      const ti = parseInt(target.dataset.ti, 10);
      const ei = parseInt(target.dataset.ei, 10);
      state.skillDraft.triggers[ti].effects[ei] = createDefaultEffectForUI(target.value);

      const trigger = state.skillDraft.triggers[ti];
      if (trigger.triggerType === "over_time" && !isOverTimeBuffOnly(trigger)) {
        recomputeOverTimeDuration(trigger);
      }

      renderSkillModal();
      applyLanguage(document);
      return;
    }

    // Numbers
    patchEffectNumber("draftEfMagicPct", "magicPowerPct", target);
    patchEffectNumber("draftEfPhysPct", "physicalPowerPct", target);

    patchEffectNumber("draftEfPureDamage", "pureDamage", target);
    patchEffectNumber("draftEfDamageLifePct", "damageLifePct", target);
    patchEffectNumber("draftEfVampLifePct", "vampLifePct", target);
    patchEffectNumber("draftEfVampManaPct", "vampManaPct", target);

    patchEffectNumber("draftEfPureHeal", "pureHeal", target);
    patchEffectNumber("draftEfHealLifePct", "healLifePct", target);

    patchEffectNumber("draftEfPureManaDamage", "pureManaDamage", target);
    patchEffectNumber("draftEfManaDamagePct", "manaDamagePct", target);

    patchEffectNumber("draftEfPureManaRestore", "pureManaRestore", target);
    patchEffectNumber("draftEfManaRestorePct", "manaRestorePct", target);

    // Buff/debuff
    if (a === "draftEfBuffStat") {
      const { ti, ei } = getEffectIndex(target);
      state.skillDraft.triggers[ti].effects[ei].stat = target.value;
      return;
    }
    patchEffectNumber("draftEfPureChange", "pureChange", target);
    patchEffectNumber("draftEfRelChangePct", "relativeChangePct", target);

    // Control/status/dispel
    if (a === "draftEfControlType") {
      const { ti, ei } = getEffectIndex(target);
      state.skillDraft.triggers[ti].effects[ei].controlType = target.value;
      return;
    }
    if (a === "draftEfStatusType") {
      const { ti, ei } = getEffectIndex(target);
      state.skillDraft.triggers[ti].effects[ei].statusType = target.value;
      return;
    }
    if (a === "draftEfDuration") {
      const { ti, ei } = getEffectIndex(target);
      state.skillDraft.triggers[ti].effects[ei].duration = Number(target.value);
      return;
    }
    if (a === "draftEfDispelMode") {
      const { ti, ei } = getEffectIndex(target);
      state.skillDraft.triggers[ti].effects[ei].dispelMode = target.value;
      return;
    }
  });
}
