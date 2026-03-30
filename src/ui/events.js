// src/ui/events.js
// All UI events + modal logic + simulation runs.
// Comments in English by request.

import { state, getSelectedCharacter, setSelectedCharacterId } from "../state.js";
import { applyLanguage, t } from "../i18n.js";
import { createCharacter, STAT_KEYS } from "../models/character.js";
import { createDefaultSkill, createDefaultTriggerForUI, createDefaultEffectForUI } from "../models/skill.js";
import {
  renderLanguageButtons,
  renderCharacterList,
  renderCharacterEditor,
  renderSkillModal,
  renderTopBar,
  renderTopPanel,
  renderSimItemsModal,
  renderPowerScoreModal,
  updateAllStatResultsOnly,
  getSimItemsBySlot,
  sumItemStats
} from "./render.js";
import { ensureGameDesign, DEFAULT_RARITIES } from "../models/gameDesign.js";
import { WEAPON_KEYS_2H } from "../models/character.js";
import { generateItemsForCharacters } from "../models/itemGenerator.js";
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

function exportAllConfig() {
  // Export full configuration (version 2): characters + game design + items + configs
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    characters:      state.characters || [],
    gameDesign:      state.gameDesign || {},
    generatedItems:  state.generatedItems || [],
    simConfig:       state.simConfig || {},
    recommendConfig: state.recommendConfig || {},
    itemGenConfig:   state.itemGenConfig || {}
  };
  downloadJson("mmorpg_calc_export.json", payload);
}

// Keep backward-compat alias
function exportAllCharacters() {
  exportAllConfig();
}

async function importAllConfig(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  // Support version 1 (characters only) and version 2 (full config)
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : null;
  if (!chars) throw new Error("Invalid file format (missing characters array).");

  for (const c of chars) {
    if (!c || typeof c !== "object") throw new Error("Invalid character entry.");
    if (!c.id || !c.name) throw new Error("Each character must include id and name.");
    c.stats  ??= {};
    c.skills ??= [];
    c.charType ??= "player";
  }

  state.characters = chars;

  if (parsed.version >= 2) {
    if (parsed.gameDesign)      state.gameDesign      = parsed.gameDesign;
    if (parsed.generatedItems)  state.generatedItems  = parsed.generatedItems;
    if (parsed.simConfig)       state.simConfig       = { ...(state.simConfig || {}), ...parsed.simConfig };
    if (parsed.recommendConfig) state.recommendConfig = { ...(state.recommendConfig || {}), ...parsed.recommendConfig };
    if (parsed.itemGenConfig)   state.itemGenConfig   = { ...(state.itemGenConfig || {}), ...parsed.itemGenConfig };
  }

  setSelectedCharacterId(chars[0]?.id ?? "");
  state.activeView = "characters";
  state.activeTab  = "stats";
  state.isSkillModalOpen = false;
  state.skillDraft = null;
  state.skillEditingIndex = null;
  state.balanceRecommendation = null;
  state.allBalanceRecommendations = null;
  state.recommendations = null;
  state.allRecommendations = null;
  state.balanceSnapshot = null;

  renderTopBar();
  renderTopPanel();
  renderCharacterList();
  renderCharacterEditor();
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
  state.simConfig.opponentType ??= "players";
  state.simConfig.balanceLevel ??= 1;
  state.simConfig.balanceTolerancePct ??= 10;
  state.simRuns ??= [];
  state.simShowLogs ??= false;
  // Ensure new nav model field is set
  state.activeView ??= "characters";
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

  // Item level + max rarity (from top panel)
  const itemLevelEl = document.getElementById("simItemLevel");
  if (itemLevelEl !== null) {
    const v = itemLevelEl.value;
    cfg.itemLevel = v ? Number(v) : null;
  }
  const maxRarityEl = document.getElementById("simMaxRarity");
  if (maxRarityEl !== null) cfg.maxRarity = maxRarityEl.value || "legendary";
  cfg.balanceTolerancePct = Math.max(0, Math.min(100, Number(balanceTolerancePct)));
  const opponentTypeEl = document.getElementById("simOpponentType");
  if (opponentTypeEl !== null) cfg.opponentType = opponentTypeEl.value || "players";
}

function setLanguage(lang) {
  state.lang = lang;
  renderLanguageButtons();
  renderCharacterList();
  renderCharacterEditor();
  renderSkillModal();
  renderTopBar();
  renderTopPanel();
  renderSimItemsModal();
  applyLanguage(document);
  saveToStorage();
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
  const order = ["tank","warrior","assassin","mage","healer","enchanter","support","antitank","crowdcontrol"];
  const picked = order.filter(k => !!r[k]);
  if (picked.length === 0) return "unclassified";
  return picked.join("-");
}


function getSecondaryClassKeys(ch) {
  const m = ch?.subClassTypes || {};
  return Object.keys(m).filter((k) => !!m[k]).sort();
}

function getPrimaryClassKeys(ch) {
  const r = ch?.classTypes || ch?.roles || {};
  const order = ["tank","warrior","assassin","mage","healer","enchanter","support","antitank","crowdcontrol"];
  const picked = order.filter(k => !!r[k]);
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

  // Filter opponents by opponentType (players/npcs/all)
  const opponentType = cfg?.opponentType ?? "players";
  const opponents = (state.characters || []).filter(c => {
    if (opponentType === "players") return c.charType !== "npc";
    if (opponentType === "npcs")    return c.charType === "npc";
    return true;
  });

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

      const res = simulateBattle(A, B, { seed, maxSeconds, gameDesign: state.gameDesign });

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

// Fallback stat lists used when no class profile matches
const OFFENSIVE_STATS = ["Physical Damage","Magical Damage","Crit Chance","Crit Damage"];
const DEFENSIVE_STATS = ["HP","Physical Defense","Magical Defense","Evade","Resist","HP Regen"];

/**
 * Per-class stat profiles for MMORPG-style balance.
 * offenseStats: stats to buff/nerf when win rate is off target.
 * defenseStats: stats to buff/nerf when battle duration is off target.
 * mpCostDir:    "reduce" = lower mp cost helps (DPS wants to spam skills);
 *               "keep"   = mana management is part of the class identity.
 */
const CLASS_PROFILES = {
  tank: {
    label: "Tank",
    color: "#4a9eff",
    description: "High HP and defense. Absorbs damage for the team. Very long fights are expected.",
    offenseStats: ["HP", "Physical Defense", "Magical Defense", "Resist", "HP Regen"],
    defenseStats: ["HP", "HP Regen", "Resist", "Physical Defense", "Magical Defense"],
    mpCostDir: "keep",
    durMult: 1.8,
    weakVs: ["antitank", "mage", "crowdcontrol"],
    strongVs: ["assassin", "warrior"],
    skillFocus: "defensive",
    balanceTips: [
      "Long fight duration is expected for tanks — target the upper end of the duration range.",
      "Assassins naturally lose to tanks — low assassin win rate vs tank is expected.",
      "Anti-tank classes are designed to counter tanks; lower win rate vs antitank is expected.",
      "If losing too much: increase HP or Physical/Magical Defense sliders.",
      "If winning too easily: reduce HP Regen or increase defensive skill cooldowns."
    ]
  },
  warrior: {
    label: "Warrior",
    color: "#ff6b35",
    description: "Physical melee DPS. Balanced archetype focused on Physical Damage and Crit.",
    offenseStats: ["Physical Damage", "Crit Chance", "Crit Damage", "HP"],
    defenseStats: ["HP", "Physical Defense", "HP Regen"],
    mpCostDir: "reduce",
    durMult: 1.0,
    weakVs: ["mage", "healer", "crowdcontrol"],
    strongVs: ["support", "enchanter", "assassin"],
    skillFocus: "physical",
    balanceTips: [
      "Physical Damage and Crit are the primary offensive stats for warriors.",
      "Warriors struggle against mages due to magical damage and elemental advantage.",
      "If losing too much: increase Physical Damage or Crit Chance.",
      "If winning too easily: reduce Crit Damage or increase skill cooldowns."
    ]
  },
  assassin: {
    label: "Assassin",
    color: "#c77dff",
    description: "Burst physical damage dealer. Short, explosive fights. Weak against high-defense targets.",
    offenseStats: ["Physical Damage", "Crit Chance", "Crit Damage", "Evade"],
    defenseStats: ["Evade", "HP"],
    mpCostDir: "reduce",
    durMult: 0.5,
    weakVs: ["tank", "healer", "support"],
    strongVs: ["mage", "enchanter", "crowdcontrol"],
    skillFocus: "burst",
    balanceTips: [
      "Short fight duration is by design — assassins rely on burst, not sustained damage.",
      "Low win rate vs tanks is EXPECTED and correct. Tanks counter assassin burst.",
      "Low win rate vs healers is also expected — healing outlasts burst damage.",
      "If losing too much vs non-tank/healer: increase Crit Damage or Evade.",
      "If winning too easily: increase skill cooldowns or reduce Crit Damage."
    ]
  },
  mage: {
    label: "Mage",
    color: "#4fc66a",
    description: "High magical burst damage. Fragile but devastating. Countered by magical resistance.",
    offenseStats: ["Magical Damage", "Crit Chance", "Crit Damage", "Mana Regen"],
    defenseStats: ["HP", "Mana", "Magical Defense"],
    mpCostDir: "reduce",
    durMult: 0.8,
    weakVs: ["tank", "crowdcontrol", "support"],
    strongVs: ["warrior", "assassin", "healer"],
    skillFocus: "magical",
    balanceTips: [
      "Magical Damage is the primary stat. Mana Regen enables sustained spell casting.",
      "Mages naturally counter warriors — higher win rate vs warriors is expected.",
      "Tanks counter mages due to high HP and resistance — lower win rate vs tanks is normal.",
      "If winning too much: increase MP costs on main offensive skills.",
      "If losing too much: increase Magical Damage or reduce skill cooldowns."
    ]
  },
  healer: {
    label: "Healer",
    color: "#ffaa00",
    description: "Sustain through HP/Mana regeneration. Very long fights. Low offensive output by design.",
    offenseStats: ["HP Regen", "Mana Regen", "Mana", "HP"],
    defenseStats: ["HP", "HP Regen", "Mana", "Mana Regen"],
    mpCostDir: "reduce",
    durMult: 2.5,
    weakVs: ["assassin", "antitank", "crowdcontrol"],
    strongVs: ["warrior", "mage"],
    skillFocus: "sustain",
    balanceTips: [
      "Very long fight duration is by design for healers — target the maximum duration range.",
      "Low win rate is expected due to low damage output. Healers outlast enemies, not burst them.",
      "Assassin burst counters healing — low healer win rate vs assassins is EXPECTED.",
      "If fights end too quickly: increase HP Regen and Mana Regen.",
      "If winning too much: reduce HP Regen or increase heal skill cooldowns."
    ]
  },
  enchanter: {
    label: "Enchanter",
    color: "#ff70a6",
    description: "Magic support through powerful buffs, debuffs and enchantments. Moderate damage, strong through skills.",
    offenseStats: ["Magical Damage", "Mana", "Mana Regen", "Crit Chance"],
    defenseStats: ["HP", "Mana", "Magical Defense", "Mana Regen"],
    mpCostDir: "reduce",
    durMult: 1.1,
    weakVs: ["assassin", "warrior", "antitank"],
    strongVs: ["support", "mage", "healer"],
    skillFocus: "enchant",
    balanceTips: [
      "Enchanters excel through skill effects. Prioritize skill magnitude and power.",
      "Mana management is critical — balance MP costs of buff/debuff skills carefully.",
      "Weak against burst damage (assassins, warriors) — this is expected behavior.",
      "If losing too much: increase Magical Damage or skill buff magnitude.",
      "If winning too easily: increase MP costs on high-power skills."
    ]
  },
  support: {
    label: "Support",
    color: "#70d6ff",
    description: "Utility and shields. High resistance and defense. Moderate sustain but limited offense.",
    offenseStats: ["Mana Regen", "Physical Defense", "Magical Defense", "Resist"],
    defenseStats: ["HP", "Physical Defense", "Magical Defense", "Resist", "HP Regen"],
    mpCostDir: "keep",
    durMult: 1.5,
    weakVs: ["mage", "crowdcontrol", "enchanter"],
    strongVs: ["assassin", "warrior"],
    skillFocus: "defensive",
    balanceTips: [
      "Support classes are durable but deal low damage — long fights are normal.",
      "High resistance and defense are the core stats for support.",
      "Mage classes counter support through magical damage bypass.",
      "If losing too much: increase Resist and Magical Defense.",
      "If winning too easily: reduce HP Regen or increase defensive skill cooldowns."
    ]
  },
  antitank: {
    label: "Anti-Tank",
    color: "#e63946",
    description: "Specialized penetration. Designed to bypass high-defense targets. Effective vs tanks but fragile.",
    offenseStats: ["Physical Damage", "Magical Damage", "Crit Damage", "Crit Chance"],
    defenseStats: ["HP", "Evade", "Physical Defense"],
    mpCostDir: "reduce",
    durMult: 1.2,
    weakVs: ["assassin", "mage", "crowdcontrol"],
    strongVs: ["tank", "support", "warrior"],
    skillFocus: "penetration",
    balanceTips: [
      "Anti-tank should have HIGHER win rate vs tanks — that is their designed counter-role.",
      "Both Physical and Magical Damage contribute to armor penetration.",
      "Crit Damage amplifier is the key stat for bypassing high-defense targets.",
      "If not winning vs tanks: increase Crit Damage or add armor-penetration skills.",
      "If winning too much overall: reduce max damage output stats."
    ]
  },
  crowdcontrol: {
    label: "Crowd Control",
    color: "#ff9f1c",
    description: "Debuff and control specialist. Wins through skill effects, not raw damage.",
    offenseStats: ["Magical Damage", "Crit Chance", "Mana", "Mana Regen"],
    defenseStats: ["HP", "Magical Defense", "Resist", "Mana"],
    mpCostDir: "reduce",
    durMult: 1.1,
    weakVs: ["healer", "tank", "support"],
    strongVs: ["mage", "enchanter", "assassin"],
    skillFocus: "control",
    balanceTips: [
      "Crowd Control effectiveness relies entirely on skill effects — prioritize debuff magnitude.",
      "High Mana Regen allows sustained crowd control over time.",
      "Healers naturally counter CC through sustained healing — lower win rate vs healers is expected.",
      "If losing too much: increase skill debuff magnitude or reduce skill cooldowns.",
      "If winning too easily: increase MP costs on high-impact CC skills."
    ]
  }
};

// ── Global balance optimizer ───────────────────────────────────────────────
// Runs a time-bounded cross-sim optimization that considers ALL players together.
// Instead of optimizing each character independently, it tries all possible single-stat
// changes across all chars, picks the globally best one each iteration, and repeats
// until the time limit is reached (always finishing the current iteration).

function deepCloneCrossSim(crossSim) {
  const clone = new Map();
  for (const [charId, oppMap] of crossSim) clone.set(charId, new Map(oppMap));
  return clone;
}

function globalBalanceScore(crossSim, players, recCfg) {
  let score = 0;
  for (const p of players) {
    const charT  = recCfg.charTargets?.[p.id] ?? {};
    const minWR  = charT.minWinPct   ?? recCfg.minWinPct   ?? 40;
    const maxWR  = charT.maxWinPct   ?? recCfg.maxWinPct   ?? 60;
    const minDur = charT.minDuration ?? recCfg.minDuration  ?? 20;
    const maxDur = charT.maxDuration ?? recCfg.maxDuration  ?? 40;
    const oppMap = crossSim.get(p.id);
    if (!oppMap) continue;
    for (const [, d] of oppMap) {
      const wr  = d.games ? d.wins / d.games * 100 : 50;
      const dur = d.games ? d.durSum / d.games : 0;
      if (wr  < minWR)  score += (minWR  - wr)  ** 2;
      if (wr  > maxWR)  score += (wr  - maxWR)  ** 2;
      if (dur < minDur) score += ((minDur - dur) * 0.5) ** 2;
      if (dur > maxDur) score += ((dur - maxDur) * 0.5) ** 2;
    }
  }
  return score;
}

function buildRecommendationsFromOptimizer(players, bestWorkChars, originalCrossSim, bestCrossSim, recCfg, iterationsRun, finalScore) {
  return players.map(p => {
    const optimized = bestWorkChars.find(c => c.id === p.id) ?? p;

    // Stat changes: diff original stats vs optimized stats
    const statChanges = [];
    for (const stat of STAT_KEYS) {
      const from = Number(p.stats?.[stat]?.step ?? 5);
      const to   = Number(optimized.stats?.[stat]?.step ?? from);
      if (from !== to) statChanges.push({ stat, from, to, direction: to > from ? "up" : "down" });
    }

    // Skill changes: diff original skills vs optimized skills
    const skillChanges = [];
    const SKILL_EFFECT_FIELDS = ["physicalPowerPct","magicPowerPct","pureDamage","pureHeal","healLifePct","pureManaRestore","pureChange","relativeChangePct","duration"];
    for (let si = 0; si < (p.skills || []).length; si++) {
      const orig = p.skills[si];
      const opt  = optimized.skills?.[si];
      if (!opt) continue;
      if (orig.cooldown?.value !== opt.cooldown?.value && opt.cooldown?.value != null) {
        skillChanges.push({ skillIndex: si, skillName: orig.name, field: "cooldown", unit: orig.cooldown?.unit ?? "seconds",
          from: orig.cooldown.value, to: opt.cooldown.value, direction: opt.cooldown.value > orig.cooldown.value ? "up" : "down", reason: "balance" });
      }
      if (orig.mpCost?.value !== opt.mpCost?.value && opt.mpCost?.value != null) {
        skillChanges.push({ skillIndex: si, skillName: orig.name, field: "mpCost",
          from: orig.mpCost.value, to: opt.mpCost.value, direction: opt.mpCost.value > orig.mpCost.value ? "up" : "down", reason: "balance" });
      }
      for (let ti = 0; ti < (orig.triggers || []).length; ti++) {
        for (let ei = 0; ei < (orig.triggers[ti]?.effects || []).length; ei++) {
          const oe = orig.triggers[ti].effects[ei];
          const ne = opt.triggers?.[ti]?.effects?.[ei];
          if (!ne) continue;
          for (const field of SKILL_EFFECT_FIELDS) {
            if (oe[field] != null && ne[field] != null && oe[field] !== ne[field]) {
              skillChanges.push({ skillIndex: si, skillName: orig.name, triggerIndex: ti, effectIndex: ei, field,
                from: oe[field], to: ne[field], direction: ne[field] > oe[field] ? "up" : "down", reason: "balance" });
            }
          }
        }
      }
    }

    // byChar display: uses ORIGINAL (pre-optimization) crossSim — shows current state
    const oppMap = originalCrossSim.get(p.id) ?? new Map();
    const byChar = Array.from(oppMap.entries()).map(([oppId, d]) => {
      const opp = players.find(c => c.id === oppId);
      return { charId: oppId, charName: opp?.name ?? oppId, wins: d.wins, games: d.games,
               winRate: d.games ? d.wins / d.games : 0,
               avgDuration: d.games ? d.durSum / d.games : 0 };
    });

    const charT  = recCfg.charTargets?.[p.id] ?? {};
    const minWR  = charT.minWinPct   ?? recCfg.minWinPct   ?? 40;
    const maxWR  = charT.maxWinPct   ?? recCfg.maxWinPct   ?? 60;
    const minDur = charT.minDuration ?? recCfg.minDuration  ?? 20;
    const maxDur = charT.maxDuration ?? recCfg.maxDuration  ?? 40;

    const matchupsBelow    = byChar.filter(d => d.winRate * 100 < minWR);
    const matchupsAbove    = byChar.filter(d => d.winRate * 100 > maxWR);
    const matchupsDurShort = byChar.filter(d => d.avgDuration < minDur);
    const matchupsDurLong  = byChar.filter(d => d.avgDuration > maxDur);

    // isFullyBalanced: per-player balance score from OPTIMIZED crossSim must be zero
    // (avoids false-positive from empty bestByChar or noisy quick-run results)
    const bestOppMap = bestCrossSim.get(p.id) ?? new Map();
    let playerOptScore = bestOppMap.size === 0 ? Infinity : 0;
    for (const [, d] of bestOppMap) {
      const wr  = d.games ? d.wins / d.games * 100 : 50;
      const dur = d.games ? d.durSum / d.games : 0;
      if (wr  < minWR)  playerOptScore += (minWR  - wr)  ** 2;
      if (wr  > maxWR)  playerOptScore += (wr  - maxWR)  ** 2;
      if (dur < minDur) playerOptScore += ((minDur - dur) * 0.5) ** 2;
      if (dur > maxDur) playerOptScore += ((dur - maxDur) * 0.5) ** 2;
    }
    const isFullyBalanced = playerOptScore === 0;

    const totalGames  = byChar.reduce((s, d) => s + d.games, 0);
    const totalWins   = byChar.reduce((s, d) => s + d.wins, 0);
    const totalDurSum = byChar.reduce((s, d) => s + d.avgDuration * d.games, 0);

    // Build byClass from byChar
    const byClassMap2 = new Map();
    for (const d of byChar) {
      const opp      = players.find(c => c.id === d.charId);
      const classKey = opp ? getPrimaryClassKey(opp) : "unknown";
      const ce       = byClassMap2.get(classKey) || { wins: 0, games: 0, durSum: 0 };
      ce.wins += d.wins; ce.games += d.games; ce.durSum += d.avgDuration * d.games;
      byClassMap2.set(classKey, ce);
    }
    const byClass = Array.from(byClassMap2.entries()).map(([classKey, d]) => ({
      classKey, wins: d.wins, games: d.games,
      winRate:     d.games ? d.wins / d.games : 0,
      avgDuration: d.games ? d.durSum / d.games : 0
    })).sort((a, b) => a.winRate - b.winRate);

    const subjectClassKey = getPrimaryClassKey(p);
    const profile = CLASS_PROFILES[subjectClassKey] ?? {
      label: subjectClassKey, offenseStats: OFFENSIVE_STATS, defenseStats: DEFENSIVE_STATS,
      mpCostDir: "reduce", weakVs: [], strongVs: [], balanceTips: []
    };

    const matchupInsights = byClass.map(bc => {
      const wr = bc.winRate * 100;
      const inRange  = wr >= minWR && wr <= maxWR;
      const isWeak   = profile.weakVs?.includes(bc.classKey);
      const isStrong = profile.strongVs?.includes(bc.classKey);
      let status, note;
      if (inRange)                  { status = "ok";            note = ""; }
      else if (wr < minWR && isWeak){ status = "expected_low";  note = `Low WR vs ${bc.classKey} (designed counter).`; }
      else if (wr > maxWR && isStrong){status= "expected_high"; note = `High WR vs ${bc.classKey} (natural advantage).`;}
      else if (wr < minWR)          { status = "low";           note = `WR vs ${bc.classKey} below target.`; }
      else                          { status = "high";          note = `WR vs ${bc.classKey} above target.`; }
      return { ...bc, status, note, isExpected: status.startsWith("expected") };
    });

    return {
      subjectId: p.id,
      winRate:     totalGames ? totalWins / totalGames : 0,
      avgDuration: totalGames ? totalDurSum / totalGames : 0,
      statChanges, skillChanges,
      isOOM: false, oomBattles: 0, totalGames,
      isFullyBalanced, byClass, byChar, byLevel: [],
      matchupInsights,
      mirrorWinRate: null, mirrorAvgDuration: null, mirrorIsSelVsSelf: false,
      winConflict: matchupsBelow.length > 0 && matchupsAbove.length > 0,
      durConflict: matchupsDurShort.length > 0 && matchupsDurLong.length > 0,
      classesBelow: matchupInsights.filter(m => m.status === "low").map(c => c.classKey),
      classesAbove: matchupInsights.filter(m => m.status === "high").map(c => c.classKey),
      classesShort: byClass.filter(c => c.avgDuration < minDur).map(c => c.classKey),
      classesLong:  byClass.filter(c => c.avgDuration > maxDur).map(c => c.classKey),
      classProfile: profile.label ?? subjectClassKey,
      balanceTips:  profile.balanceTips ?? [],
      globalScore: finalScore, iterationsRun
    };
  });
}

async function runGlobalBalanceOptimizer(players, recCfg, simCfg, timeLimitMs, onProgress) {
  const yield$     = () => new Promise(r => setTimeout(r, 0));
  const maxSeconds = 300;
  const gd         = state.gameDesign;
  const maxItemLvl = Number(gd?.maxLevel ?? 50);
  const allRarities = DEFAULT_RARITIES.map(r => r.key);
  const BASELINE_RUNS = 15;
  const QUICK_RUNS    = 8;
  const startTime     = Date.now();

  const elapsed = () => Date.now() - startTime;
  const durationFromRows = (rows) => {
    let d = 0;
    for (const r of rows || []) d = Math.max(d, Number(r.t || 0));
    return d;
  };

  // Prepare chars with best legendary items at max level
  const bestItemLvl = (ch) => {
    let best = 0;
    for (const item of state.generatedItems) {
      const lv = item.targetLevel ?? 0;
      if (lv > best && (item.usableByIds?.includes(ch.id) || item.designedForIds?.includes(ch.id))) best = lv;
    }
    return best || ch.level;
  };

  const prepWorkChar = (ch) => {
    const c = JSON.parse(JSON.stringify(ch));
    // Always simulate at max level so balancing reflects end-game power, not the builder tab level
    c.level = maxItemLvl;
    const lv = simCfg.itemLevel ?? bestItemLvl(ch);
    c.itemStats = sumItemStats(getSimItemsBySlot(ch.id, lv, "legendary", state.generatedItems));
    return c;
  };

  let workChars = players.map(prepWorkChar);

  // ── Phase 1: Baseline cross-sim (all unique pairs, derive both directions) ──
  const pairs = [];
  for (let i = 0; i < workChars.length; i++)
    for (let j = i + 1; j < workChars.length; j++)
      pairs.push([i, j]);

  const crossSim = new Map(workChars.map(c => [c.id, new Map()]));

  for (let p = 0; p < pairs.length; p++) {
    const [i, j]  = pairs[p];
    const A = workChars[i], B = workChars[j];
    let wins_a = 0, wins_b = 0, durSum = 0;
    for (let r = 0; r < BASELINE_RUNS; r++) {
      const res = simulateBattle(
        JSON.parse(JSON.stringify(A)), JSON.parse(JSON.stringify(B)),
        { seed: randomSeed32(), maxSeconds, gameDesign: gd }
      );
      durSum += durationFromRows(res.rows);
      if (winnerIsA(res.winner, A.name)) wins_a++; else wins_b++;
    }
    crossSim.get(A.id).set(B.id, { wins: wins_a, games: BASELINE_RUNS, durSum });
    crossSim.get(B.id).set(A.id, { wins: wins_b, games: BASELINE_RUNS, durSum });

    onProgress?.({ phase: "baseline", pairsDone: p + 1, pairsTotal: pairs.length,
                   iteration: 0, score: null, elapsed: elapsed(), timeLimit: timeLimitMs });
    await yield$();
  }

  // Save the baseline state (BEFORE optimization) for the "current WR" display
  const originalCrossSim = deepCloneCrossSim(crossSim);

  let currentScore = globalBalanceScore(crossSim, players, recCfg);
  let bestScore    = currentScore;
  let bestWorkChars   = workChars.map(c => JSON.parse(JSON.stringify(c)));
  let bestCrossSim    = deepCloneCrossSim(crossSim);
  let iteration    = 0;

  // Helper: quick-sim a modified char vs all others, returns { patchedCrossSim, score }
  const quickSimAndScore = (readyChar, charId, charName, others) => {
    const patchedCrossSim = deepCloneCrossSim(crossSim);
    const cMap = new Map(crossSim.get(charId));
    patchedCrossSim.set(charId, cMap);
    for (const other of others) {
      let wa = 0, wb = 0, ds = 0;
      for (let r = 0; r < QUICK_RUNS; r++) {
        const res = simulateBattle(
          JSON.parse(JSON.stringify(readyChar)),
          JSON.parse(JSON.stringify(other)),
          { seed: randomSeed32(), maxSeconds, gameDesign: gd }
        );
        ds += durationFromRows(res.rows);
        if (winnerIsA(res.winner, charName)) wa++; else wb++;
      }
      cMap.set(other.id, { wins: wa, games: QUICK_RUNS, durSum: ds });
      const otherMap = new Map(crossSim.get(other.id));
      otherMap.set(charId, { wins: wb, games: QUICK_RUNS, durSum: ds });
      patchedCrossSim.set(other.id, otherMap);
    }
    return { patchedCrossSim, score: globalBalanceScore(patchedCrossSim, players, recCfg) };
  };

  const recMode    = recCfg.recMode ?? "both";
  const MAX_RESTARTS = 8; // random perturbations before truly stopping at local minimum
  let localMinCount  = 0;

  // ── Phase 2: Time-bounded iterated steepest-descent optimization ───────────
  while (currentScore > 0) {
    // Time check: only start a new iteration if time remains
    if (elapsed() >= timeLimitMs) break;
    iteration++;

    let bestCandidate      = null;
    let bestCandidateScore = currentScore;   // must strictly improve
    let bestCandidateCrossSim = null;

    for (let ci = 0; ci < workChars.length; ci++) {
      const workChar   = workChars[ci];
      const origPlayer = players[ci]; // original values before any optimization (for bounds)
      const others     = workChars.filter((_, idx) => idx !== ci);

      // ── Stat candidates (skip when recMode is "skills") ──
      if (recMode !== "skills") {
        for (const stat of STAT_KEYS) {
          for (const dir of [1, -1]) {
            const step    = Number(workChar.stats?.[stat]?.step ?? 5);
            const newStep = step + dir;
            if (newStep < 0 || newStep > 10) continue;

            // Tentatively apply
            const prevStep = workChar.stats?.[stat]?.step;
            workChar.stats[stat] ??= {};
            workChar.stats[stat].step = newStep;

            // Regenerate items (they scale with stats)
            const candidateItems = generateItemsForCharacters([workChar], [workChar.id], maxItemLvl, allRarities, gd);
            const readyChar = JSON.parse(JSON.stringify(workChar));
            readyChar.itemStats = sumItemStats(getSimItemsBySlot(workChar.id, maxItemLvl, "legendary", candidateItems));

            const { patchedCrossSim, score: candidateScore } = quickSimAndScore(readyChar, workChar.id, workChar.name, others);

            // Revert
            if (prevStep !== undefined) workChar.stats[stat].step = prevStep;
            else delete workChar.stats[stat];

            if (candidateScore < bestCandidateScore) {
              bestCandidateScore    = candidateScore;
              bestCandidate         = { type: "stat", charIdx: ci, stat, newStep };
              bestCandidateCrossSim = patchedCrossSim;
            }
          }
        }
      }

      // ── Skill candidates (skip when recMode is "stats") ──
      if (recMode !== "stats") {
        // Numeric effect fields that directly affect combat
        const EFFECT_FIELDS = ["magicPowerPct","physicalPowerPct","pureDamage","pureHeal",
          "healLifePct","pureChange","relativeChangePct","pureManaRestore","pureManaDamage",
          "manaDamagePct","vampLifePct","vampManaPct","damageLifePct"];

        const skills = workChar.skills ?? [];
        for (let si = 0; si < skills.length; si++) {
          const sk = workChar.skills[si];

          // Helper: run quick-sim with current workChar state (items already in .itemStats)
          const trySkillCandidate = (label) => {
            const readyChar = JSON.parse(JSON.stringify(workChar));
            readyChar.itemStats = workChar.itemStats;
            const { patchedCrossSim, score } = quickSimAndScore(readyChar, workChar.id, workChar.name, others);
            if (score < bestCandidateScore) {
              bestCandidateScore    = score;
              bestCandidate         = label;
              bestCandidateCrossSim = patchedCrossSim;
            }
          };

          // Cooldown ±1 second, bounded to ±20% of the ORIGINAL (pre-optimization) value
          const cd     = Number(sk.cooldown?.value ?? 0);
          const cdOrig = Number(origPlayer.skills?.[si]?.cooldown?.value ?? cd);
          const cdMin  = Math.max(1, Math.floor(cdOrig * 0.8));
          const cdMax  = Math.ceil(cdOrig * 1.2);
          for (const newCd of [cd - 1, cd + 1]) {
            if (newCd < cdMin || newCd > cdMax) continue;
            sk.cooldown ??= { value: 0, unit: "seconds" };
            sk.cooldown.value = newCd;
            trySkillCandidate({ type: "skill", field: "cooldown", charIdx: ci, skillIdx: si, newVal: newCd });
            sk.cooldown.value = cd;
          }

          // mpCost ±10% (min delta 5)
          const mc = Number(sk.mpCost?.value ?? 0);
          const mcDelta = Math.max(5, Math.round(mc * 0.1));
          for (const newMc of [Math.max(0, mc - mcDelta), mc + mcDelta]) {
            if (newMc === mc) continue;
            sk.mpCost ??= { type: "constant", value: 0 };
            sk.mpCost.value = newMc;
            trySkillCandidate({ type: "skill", field: "mpCost", charIdx: ci, skillIdx: si, newVal: newMc });
            sk.mpCost.value = mc;
          }

          // All numeric effect fields ×0.85 / ×1.15
          for (let ti = 0; ti < (sk.triggers ?? []).length; ti++) {
            for (let ei = 0; ei < (sk.triggers[ti]?.effects ?? []).length; ei++) {
              const eff = sk.triggers[ti].effects[ei];
              for (const ef of EFFECT_FIELDS) {
                const val = Number(eff[ef] ?? 0);
                if (val === 0) continue;
                for (const factor of [0.85, 1.15]) {
                  const newVal = Math.round(val * factor * 100) / 100;
                  if (Math.abs(newVal - val) < 0.001) continue;
                  eff[ef] = newVal;
                  trySkillCandidate({ type: "skill", field: "effect", charIdx: ci, skillIdx: si,
                    triggerIdx: ti, effectIdx: ei, effectField: ef, newVal, prevVal: val });
                  eff[ef] = val;
                }
              }
            }
          }
        }
      }
      // Yield after each character's candidates so the tab stays responsive
      await yield$();
    }

    if (bestCandidate === null) {
      // Local minimum — perturb to escape (up to MAX_RESTARTS times)
      localMinCount++;
      if (localMinCount > MAX_RESTARTS) break;

      // Randomly perturb: pick a char and mutate one field
      const ci = Math.floor(Math.random() * workChars.length);
      const wc = workChars[ci];
      if (recMode !== "skills" && STAT_KEYS.length > 0) {
        const stat = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
        const step = Number(wc.stats?.[stat]?.step ?? 5);
        const newStep = Math.max(0, Math.min(10, step + (Math.random() < 0.5 ? 1 : -1)));
        wc.stats[stat] ??= {};
        wc.stats[stat].step = newStep;
        const updItems = generateItemsForCharacters([wc], [wc.id], maxItemLvl, allRarities, gd);
        wc.itemStats = sumItemStats(getSimItemsBySlot(wc.id, maxItemLvl, "legendary", updItems));
      }
      // Re-sim the perturbed char vs all others to update crossSim
      const perturbOthers = workChars.filter((_, idx) => idx !== ci);
      const { patchedCrossSim: pp } = quickSimAndScore(wc, wc.id, wc.name, perturbOthers);
      for (const [k, v] of pp) crossSim.set(k, v);
      currentScore = globalBalanceScore(crossSim, players, recCfg);
      onProgress?.({ phase: "optimizing", iteration, score: currentScore, bestScore,
                     elapsed: elapsed(), timeLimit: timeLimitMs,
                     charName: wc.name, stat: `restart #${localMinCount}`, newStep: 0 });
      await yield$();
      continue;
    }

    // Apply best candidate
    const { charIdx } = bestCandidate;
    if (bestCandidate.type === "skill") {
      const { skillIdx, field, newVal } = bestCandidate;
      const sk = workChars[charIdx].skills[skillIdx];
      if (field === "cooldown") {
        sk.cooldown ??= { value: 0, unit: "seconds" };
        sk.cooldown.value = newVal;
      } else if (field === "mpCost") {
        sk.mpCost ??= { type: "constant", value: 0 };
        sk.mpCost.value = newVal;
      } else if (field === "effect") {
        sk.triggers[bestCandidate.triggerIdx].effects[bestCandidate.effectIdx][bestCandidate.effectField] = newVal;
      }
      // Items unchanged for skill tweaks; itemStats stays valid
    } else {
      const { stat, newStep } = bestCandidate;
      workChars[charIdx].stats[stat] ??= {};
      workChars[charIdx].stats[stat].step = newStep;
      // Rebuild items (they scale with stats)
      const updItems = generateItemsForCharacters([workChars[charIdx]], [workChars[charIdx].id], maxItemLvl, allRarities, gd);
      workChars[charIdx].itemStats = sumItemStats(getSimItemsBySlot(workChars[charIdx].id, maxItemLvl, "legendary", updItems));
    }

    for (const [k, v] of bestCandidateCrossSim) crossSim.set(k, v);
    currentScore = bestCandidateScore;

    if (currentScore < bestScore) {
      bestScore     = currentScore;
      bestWorkChars = workChars.map(c => JSON.parse(JSON.stringify(c)));
      bestCrossSim  = deepCloneCrossSim(crossSim);
    }

    const changeLabel = bestCandidate.field === "effect"
      ? `skill[${bestCandidate.skillIdx}].${bestCandidate.effectField}→${bestCandidate.newVal}`
      : bestCandidate.type === "skill"
        ? `skill[${bestCandidate.skillIdx}].${bestCandidate.field}→${bestCandidate.newVal}`
        : `${bestCandidate.stat}→${bestCandidate.newStep}`;
    onProgress?.({ phase: "optimizing", iteration, score: currentScore, bestScore,
                   elapsed: elapsed(), timeLimit: timeLimitMs,
                   charName: workChars[charIdx].name, stat: changeLabel,
                   newStep: bestCandidate.newVal ?? bestCandidate.newStep });
    await yield$();
  }

  state.balanceNotOptimal = bestScore > 0;
  // byChar display uses the ORIGINAL baseline (what the characters look like NOW),
  // while statChanges/skillChanges come from the diff between original and best optimized.
  return buildRecommendationsFromOptimizer(players, bestWorkChars, originalCrossSim, bestCrossSim, recCfg, iteration, bestScore);
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

  // Self-battle: give the second copy a distinct name so winrate is meaningful
  if (aId === bId) B.name = B.name + " 2";

  if (cfg.itemLevel) {
    A.itemStats = sumItemStats(getSimItemsBySlot(A0.id, cfg.itemLevel, cfg.maxRarity, state.generatedItems));
    B.itemStats = sumItemStats(getSimItemsBySlot(B0.id, cfg.itemLevel, cfg.maxRarity, state.generatedItems));
  }

  const seed = Number(seedOverride ?? cfg.seed ?? 12345);
  const res = simulateBattle(A, B, { seed, maxSeconds: cfg.maxSeconds, gameDesign: state.gameDesign });

  return {
    seed: res.seed,
    winner: res.winner,
    rows: res.rows,
    duration: res.duration,
    nameA: A.name,
    nameB: B.name
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

  /* Top bar — nav tab clicks + export/import actions */
  document.getElementById("topBar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='navTab']");
    if (btn) {
      state.activeView = btn.dataset.view ?? "characters";
      renderTopBar();
      renderTopPanel();
      debouncedSave();
      return;
    }

    if (e.target.closest("[data-action='exportAllConfig']")) {
      try { exportAllConfig(); } catch (err) { console.error(err); }
      return;
    }
    if (e.target.closest("[data-action='importAllConfig']")) {
      const input = document.getElementById("importFileInput");
      if (input) { input.value = ""; input.click(); }
      return;
    }
  });

  // File input change — handles full config import
  document.getElementById("importFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importAllConfig(file);
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
      return;
    }

    if (target.dataset.action === "statStep") {
      const c = getSelectedCharacter();
      if (!c) return;
      const stat = target.dataset.stat;
      if (!stat) return;

      const statRef  = state.gameDesign?.statRefs?.[stat];
      const isNpc    = c.charType === "npc";
      const tierPcts = (isNpc && statRef?.npcTierPcts) ? statRef.npcTierPcts : (statRef?.tierPcts ?? null);
      const tierMax  = tierPcts ? tierPcts.length - 1 : 10;
      const step = Math.max(0, Math.min(tierMax, Number(target.value)));
      c.stats[stat] ??= {};
      c.stats[stat].step = step;

      // Patch the step label live, then refresh result cells
      const sid = stat.toLowerCase().replaceAll(" ", "_").replaceAll("%", "pct");
      const stepLabel = document.getElementById(`step-label-${sid}`);
      if (stepLabel) {
        const tierPct = tierPcts ? tierPcts[step] : step * 20;
        stepLabel.innerHTML = `${tierPct}% <small>[${step}/${tierMax}]</small>`;
      }
      updateAllStatResultsOnly();
      debouncedSave();
    }
  });

  /* Game Design inputs — also in top panel */
  function handleGameDesignChange(target) {
    const action = target.dataset.action;
    if (!action) return false;

    if (action === "gdMaxLevel") {
      ensureGameDesign(state.gameDesign);
      state.gameDesign.maxLevel = Math.max(1, Math.min(999, Math.floor(Number(target.value) || 1)));
      state.itemsStale = true;
      debouncedSave();
      return true;
    }

    if (action === "gdRefValue") {
      ensureGameDesign(state.gameDesign);
      const stat = target.dataset.stat;
      if (stat && state.gameDesign.statRefs[stat]) {
        state.gameDesign.statRefs[stat].value = Math.max(0, Number(target.value) || 0);
        state.itemsStale = true;
        debouncedSave();
      }
      return true;
    }

    if (action === "gdDistValue") {
      ensureGameDesign(state.gameDesign);
      const slot = target.dataset.slot;
      const stat = target.dataset.stat;
      if (slot && stat) {
        state.gameDesign.statDistribution ??= {};
        state.gameDesign.statDistribution[slot] ??= {};
        state.gameDesign.statDistribution[slot][stat] = Math.max(0, Math.min(100, Math.round(Number(target.value) || 0)));
        state.itemsStale = true;
        debouncedSave();
        // Update the displayed value label next to the slider
        const valSpan = target.parentElement?.querySelector(".dist-box-val");
        if (valSpan) {
          valSpan.textContent = String(state.gameDesign.statDistribution[slot][stat]);
        }
      }
      return true;
    }

    return false;
  }

content.addEventListener("change", (e) => {
    handleGameDesignChange(e.target);
  });

  /* Main view — replaces the old topPanelRoot slide-in panel */
  const topPanelRoot = document.getElementById("mainView");

  topPanelRoot.addEventListener("change", (e) => {
    const target = e.target;
    const action = target.dataset.action;

    // Game design fields inside the Config Stats panel
    if (handleGameDesignChange(target)) return;

    if (action === "itemGenMinLevel") {
      state.itemGenConfig.minLevel = Math.max(1, Math.min(999, Math.floor(Number(target.value) || 1)));
      state.itemsStale = true; renderTopPanel(); debouncedSave(); return;
    }
    if (action === "itemGenMaxLevel") {
      state.itemGenConfig.maxLevel = Math.max(1, Math.min(999, Math.floor(Number(target.value) || 1)));
      state.itemsStale = true; renderTopPanel(); debouncedSave(); return;
    }
    if (action === "itemGenLevelStep") {
      state.itemGenConfig.levelStep = Math.max(1, Math.min(100, Math.floor(Number(target.value) || 1)));
      state.itemsStale = true; renderTopPanel(); debouncedSave(); return;
    }

    if (action === "gdRarityLabel") {
      const idx = Number(target.dataset.idx);
      if (state.gameDesign.rarities?.[idx]) {
        state.gameDesign.rarities[idx].label = target.value.trim() || state.gameDesign.rarities[idx].label;
        renderTopPanel(); debouncedSave();
      }
      return;
    }
    if (action === "gdRarityColor") {
      const idx = Number(target.dataset.idx);
      if (state.gameDesign.rarities?.[idx]) {
        state.gameDesign.rarities[idx].color = target.value;
        renderTopPanel(); debouncedSave();
      }
      return;
    }
    if (action === "gdRarityQuality") {
      const idx = Number(target.dataset.idx);
      if (state.gameDesign.rarities?.[idx]) {
        const q = Math.max(1, Math.min(1000, Math.floor(Number(target.value) || 100)));
        state.gameDesign.rarities[idx].quality = q;
        renderTopPanel(); debouncedSave();
      }
      return;
    }

    if (action === "charTypeChange") {
      const c = getSelectedCharacter();
      if (c) { c.charType = target.value; state.itemsStale = true; renderCharacterEditor(); debouncedSave(); }
      return;
    }

    if (action === "itemGenRarity") {
      const rarity = target.dataset.rarity;
      if (!rarity) return;
      if (target.checked) {
        if (!state.itemGenConfig.selectedRarities.includes(rarity))
          state.itemGenConfig.selectedRarities.push(rarity);
      } else {
        state.itemGenConfig.selectedRarities = state.itemGenConfig.selectedRarities.filter(r => r !== rarity);
      }
      debouncedSave();
      return;
    }

    if (action === "itemGenClass") {
      const id = target.dataset.id;
      if (!id) return;
      state.itemGenConfig.selectedCharacterIds ??= [];
      // If currently empty → means "all" — populate with all before removing
      if (state.itemGenConfig.selectedCharacterIds.length === 0) {
        state.itemGenConfig.selectedCharacterIds = state.characters.map(c => c.id);
      }
      if (target.checked) {
        if (!state.itemGenConfig.selectedCharacterIds.includes(id))
          state.itemGenConfig.selectedCharacterIds.push(id);
      } else {
        state.itemGenConfig.selectedCharacterIds = state.itemGenConfig.selectedCharacterIds.filter(x => x !== id);
      }
      debouncedSave();
      return;
    }

    // Sim config selects (item level, max rarity) live inside the simulation top panel
    if (action === "simCfg") {
      syncSimConfigFromDom();
      debouncedSave();
      return;
    }
  });

  topPanelRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "gdRarityAdd") {
      state.gameDesign.rarities ??= [];
      const newKey = "rarity_" + Date.now();
      state.gameDesign.rarities.push({ key: newKey, label: "New Rarity", color: "#aaaaaa", quality: 100 });
      renderTopPanel(); debouncedSave(); return;
    }
    if (action === "gdRarityDelete") {
      const idx = Number(btn.dataset.idx);
      if ((state.gameDesign.rarities?.length ?? 0) > 1) {
        state.gameDesign.rarities.splice(idx, 1);
        renderTopPanel(); debouncedSave();
      }
      return;
    }

    if (action === "itemGenGenerate") {
      const cfg = state.itemGenConfig;
      const players = state.characters.filter(c => c.charType !== "npc");
      const charIds = (cfg.selectedCharacterIds?.length ?? 0) > 0
        ? cfg.selectedCharacterIds.filter(id => players.find(c => c.id === id))
        : players.map(c => c.id);

      const min  = Number(cfg.minLevel  ?? 1);
      const max  = Number(cfg.maxLevel  ?? min);
      const step = Math.max(1, Number(cfg.levelStep ?? 1));

      const allItems = [];
      for (let lv = min; lv <= max; lv += step) {
        const items = generateItemsForCharacters(
          state.characters,
          charIds,
          lv,
          cfg.selectedRarities,
          state.gameDesign
        );
        allItems.push(...items);
      }
      state.generatedItems = allItems;
      state.itemsStale = false;
      renderTopPanel(); debouncedSave(); return;
    }

    if (action === "itemGenRegenerate") {
      // Re-run generation using same config but fresh data.
      const cfg = state.itemGenConfig;
      const players = state.characters.filter(c => c.charType !== "npc");
      // Use levels from existing items, or fall back to config range.
      const existingLevels = [...new Set((state.generatedItems || []).map(i => i.targetLevel ?? 1))].sort((a, b) => a - b);
      const levelsToGen = existingLevels.length > 0 ? existingLevels : [Number(cfg.minLevel ?? 1)];
      const charIds = (cfg.selectedCharacterIds?.length ?? 0) > 0
        ? cfg.selectedCharacterIds.filter(id => players.find(c => c.id === id))
        : players.map(c => c.id);

      const allItems = [];
      for (const lv of levelsToGen) {
        const items = generateItemsForCharacters(
          state.characters,
          charIds,
          lv,
          cfg.selectedRarities,
          state.gameDesign
        );
        allItems.push(...items);
      }
      state.generatedItems = allItems;
      state.itemsStale = false;
      renderTopPanel(); debouncedSave(); return;
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


    if (action === "charTypeChange") {
      c.charType = target.value;
      state.itemsStale = true;
      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "charRarity") {
      c.rarity = target.value;
      updateAllStatResultsOnly();
      debouncedSave();
      return;
    }

    if (action === "charPrimaryWeapon") {
      c.primaryWeapon = target.value || null;
      if (WEAPON_KEYS_2H.includes(c.primaryWeapon ?? "")) c.secondaryWeapon = null;
      renderCharacterEditor();
      debouncedSave();
      return;
    }

    if (action === "charSecondaryWeapon") {
      c.secondaryWeapon = target.value || null;
      renderCharacterEditor();
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

    if (action === "toggleCharStats") {
      const which = e.target.closest("[data-which]")?.dataset.which ?? e.target.dataset.which;
      if (which === "A") state.simStatsOpenA = !state.simStatsOpenA;
      else if (which === "B") state.simStatsOpenB = !state.simStatsOpenB;
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
        state.simRuns = [{ seed: "-", winner: out.error, rows: [] }];
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
          state.simRuns = [{ seed: "-", winner: out.error, rows: [] }];
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

      for (const opp0 of (state.characters || [])) {
        if (opp0.id === aId) continue; // skip self
        const A = JSON.parse(JSON.stringify(A0));
        const B = JSON.parse(JSON.stringify(opp0));
        A.level = cfg.levelA;
        B.level = cfg.levelB;

        const res = simulateBattle(A, B, { seed: randomSeed32(), maxSeconds: cfg.maxSeconds, gameDesign: state.gameDesign });

        runs.push({
          seed: res.seed,
          winner: res.winner,
          oppName: opp0.name,
          oppId: opp0.id,
          rows: res.rows,
          duration: res.duration
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

  /* Live input updates inside the main view (sliders + sim config) */
  topPanelRoot.addEventListener("input", (e) => {
    const target = e.target;
    const action = target?.dataset?.action;

    if (action === "simCfg") {
      syncSimConfigFromDom();
      debouncedSave();
      return;
    }

    // Dist slider — update displayed value live without full re-render
    if (action === "gdDistValue") {
      const slot = target.dataset.slot;
      const stat = target.dataset.stat;
      const val  = Math.max(0, Math.min(100, Number(target.value) || 0));
      state.gameDesign.statDistribution ??= {};
      state.gameDesign.statDistribution[slot] ??= {};
      state.gameDesign.statDistribution[slot][stat] = val;
      // Patch the value label next to the slider
      const valSpan = target.parentElement?.querySelector(".dist-box-val");
      if (valSpan) {
        valSpan.textContent = String(val);
        // Update color based on total across all slots for this stat
        const SLOTS = ["helmet","chest","gloves","pants","boots","weapon","ring1","ring2","necklace"];
        const total = SLOTS.reduce((s, sl) => s + Number(state.gameDesign.statDistribution?.[sl]?.[stat] ?? 0), 0);
        valSpan.className = `dist-box-val ${total === 100 ? "dist-ok" : "dist-warn"}`;
      }
      target.title = `${val}%`;
      state.itemsStale = true;
      debouncedSave();
    }
  });

  /* ================= TOP PANEL (Simulation sub-tabs + items modal) ================= */

  topPanelRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "simPanelTab") {
      state.simPanelTab = btn.dataset.tab;
      renderTopPanel();
      return;
    }

    if (action === "simViewItems") {
      syncSimConfigFromDom();
      const charId   = btn.dataset.charId;
      const charName = btn.dataset.charName;
      state.simItemsModal = { charId, charName };
      renderSimItemsModal();
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

    if (action === "toggleSimLogs") {
      state.simShowLogs = !state.simShowLogs;
      renderTopPanel();
      return;
    }

    if (action === "toggleCharStats") {
      const which = btn.dataset.which;
      if (which === "A") state.simStatsOpenA = !state.simStatsOpenA;
      else if (which === "B") state.simStatsOpenB = !state.simStatsOpenB;
      renderTopPanel();
      return;
    }

    if (action === "runSim") {
      const out = runOneSim(null);
      if (out.error) {
        state.simRuns = [{ seed: "-", winner: out.error, rows: [] }];
        state.simShowLogs = true;
      } else {
        state.simRuns = [out];
        state.simShowLogs = true;
      }
      renderTopPanel();
      debouncedSave();
      return;
    }

    if (action === "runSim10") {
      const runs = [];
      for (let i = 0; i < 10; i++) {
        const out = runOneSim(randomSeed32());
        if (out.error) {
          state.simRuns = [{ seed: "-", winner: out.error, rows: [] }];
          state.simShowLogs = true;
          renderTopPanel();
          return;
        }
        runs.push(out);
      }
      state.simRuns = runs;
      state.simShowLogs = false;
      renderTopPanel();
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
      for (const opp0 of (state.characters || [])) {
        if (opp0.id === aId) continue; // skip self
        const A = JSON.parse(JSON.stringify(A0));
        const B = JSON.parse(JSON.stringify(opp0));
        A.level = cfg.levelA;
        B.level = cfg.levelB;
        if (cfg.itemLevel) {
          A.itemStats = sumItemStats(getSimItemsBySlot(A0.id, cfg.itemLevel, cfg.maxRarity, state.generatedItems));
          B.itemStats = sumItemStats(getSimItemsBySlot(opp0.id, cfg.itemLevel, cfg.maxRarity, state.generatedItems));
        }
        const res = simulateBattle(A, B, { seed: randomSeed32(), maxSeconds: cfg.maxSeconds, gameDesign: state.gameDesign });
        runs.push({ seed: res.seed, winner: res.winner, oppName: opp0.name, oppId: opp0.id, rows: res.rows, duration: res.duration });
      }
      state.simRuns = runs;
      state.simShowLogs = false;
      state.balanceRecommendation = null;
      renderTopPanel();
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
      renderTopPanel();
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
      state.balanceRecommendation = null;
      state.allBalanceRecommendations = out;
      state.simShowLogs = false;
      renderTopPanel();
      debouncedSave();
      return;
    }
  });

  topPanelRoot.addEventListener("change", (e) => {
    const target = e.target;
    const action = target.dataset.action;

    if (action === "simOpponentType") {
      state.simConfig ??= {};
      state.simConfig.opponentType = target.value;
      debouncedSave();
      return;
    }

    if (action === "recCfg") {
      const field = target.dataset.field;
      if (!field) return;
      state.recommendConfig ??= {};
      // recMode is a string; everything else is a number
      state.recommendConfig[field] = field === "recMode" ? target.value : Number(target.value);
      debouncedSave();
    }

    if (action === "recCharTarget") {
      const charId = target.dataset.charId;
      const field  = target.dataset.field;
      if (!charId || !field) return;
      state.recommendConfig ??= {};
      state.recommendConfig.charTargets ??= {};
      state.recommendConfig.charTargets[charId] ??= {};
      const val = target.value === "" ? undefined : Number(target.value);
      if (val === undefined) {
        delete state.recommendConfig.charTargets[charId][field];
      } else {
        state.recommendConfig.charTargets[charId][field] = val;
      }
      debouncedSave();
    }
  });

  topPanelRoot.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='recRunAll']");
    if (!btn) return;

    ensureSimConfig();
    syncSimConfigFromDom();
    const cfg       = state.simConfig;
    const recCfg    = state.recommendConfig ?? {};
    const timeLimitMs = (recCfg.balanceTimeLimit ?? 60) * 1000;

    const players = state.characters.filter(c => c.charType !== "npc");
    if (players.length < 2) return;

    state.balanceAnalyzing = true;
    state.balanceProgress  = {
      startTime: Date.now(), phase: "baseline",
      pairsDone: 0, pairsTotal: players.length * (players.length - 1) / 2,
      iteration: 0, score: null, bestScore: null,
      overallFraction: 0, eta: null, timeLimit: timeLimitMs
    };
    renderTopPanel();
    await new Promise(r => setTimeout(r, 30));

    const results = await runGlobalBalanceOptimizer(players, recCfg, cfg, timeLimitMs, (prog) => {
      const startTime = state.balanceProgress.startTime;
      const elapsedMs = Date.now() - startTime;

      let overallFraction;
      if (prog.phase === "baseline") {
        // First half of progress bar covers the baseline phase
        overallFraction = 0.5 * prog.pairsDone / Math.max(1, prog.pairsTotal);
      } else {
        // Second half covers the optimization phase, bounded by time
        overallFraction = 0.5 + 0.5 * Math.min(1, elapsedMs / timeLimitMs);
      }

      const eta = overallFraction > 0.02
        ? Math.round(elapsedMs * (1 - overallFraction) / overallFraction / 1000)
        : null;

      state.balanceProgress = {
        ...state.balanceProgress, ...prog,
        overallFraction, eta, startTime
      };
      renderTopPanel();
    });

    state.allRecommendations = results;
    state.balanceApplied     = new Set(); // reset per-char applied flags on new run
    state.balanceAnalyzing   = false;
    state.balanceProgress    = null;
    state.recommendations    = null;
    renderTopPanel();
    debouncedSave();
  });

  // Toggle expanded detail for a balance result card
  topPanelRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='recToggleCard']");
    if (!btn) return;
    const subjectId = btn.dataset.subjectId;
    if (!subjectId) return;
    state.recExpandedCards ??= [];
    const idx = state.recExpandedCards.indexOf(subjectId);
    if (idx >= 0) state.recExpandedCards.splice(idx, 1);
    else state.recExpandedCards.push(subjectId);
    renderTopPanel();
  });

  // Revert applied balance changes to the last snapshot
  topPanelRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='recRevert']");
    if (!btn) return;
    const snapshot = state.balanceSnapshot;
    if (!snapshot) return;
    if (!confirm(t("recRevertConfirm"))) return;
    state.characters = JSON.parse(JSON.stringify(snapshot.characters));
    state.balanceSnapshot = null;
    state.allRecommendations = null;
    state.recommendations = null;
    state.itemsStale = true;
    renderTopBar();
    renderTopPanel();
    renderCharacterList();
    renderCharacterEditor();
    debouncedSave();
  });

  topPanelRoot.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='recApplyAll']");
    if (!btn) return;

    const allRecs = state.allRecommendations;
    if (!allRecs?.length) return;

    // Save snapshot before applying so changes can be reverted
    state.balanceSnapshot = {
      characters: JSON.parse(JSON.stringify(state.characters)),
      savedAt: Date.now()
    };

    for (const recs of allRecs) {
      const hasAny = recs.statChanges?.length || recs.skillChanges?.length;
      if (!hasAny) continue;

      const ch = state.characters.find(c => c.id === recs.subjectId);
      if (!ch) continue;

      for (const sc of (recs.statChanges || [])) {
        if (ch.stats?.[sc.stat]) ch.stats[sc.stat].step = sc.to;
      }
      for (const ch2 of (recs.skillChanges || [])) {
        const skill = ch.skills?.[ch2.skillIndex];
        if (!skill) continue;
        if (ch2.field === "cooldown") { skill.cooldown ??= {}; skill.cooldown.value = ch2.to; }
        else if (ch2.field === "mpCost") { skill.mpCost ??= {}; skill.mpCost.value = ch2.to; }
        else if (ch2.field === "hpCost") { skill.hpCost ??= {}; skill.hpCost.value = ch2.to; }
        else if (ch2.triggerIndex != null && ch2.effectIndex != null) {
          const effect = skill.triggers?.[ch2.triggerIndex]?.effects?.[ch2.effectIndex];
          if (effect != null) effect[ch2.field] = ch2.to;
        }
      }
    }

    state.itemsStale = true;
    // Clear recommendations + applied flags — user re-runs the global optimizer to see new state
    state.allRecommendations = null;
    state.balanceApplied     = new Set();
    renderTopPanel();
    renderCharacterEditor();
    debouncedSave();
  });

  topPanelRoot.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action='recApplyOne']");
    if (!btn) return;

    const subjectId = btn.dataset.subjectId;
    const allRecs = state.allRecommendations;
    if (!allRecs || !subjectId) return;

    const recs = allRecs.find(r => r.subjectId === subjectId);
    if (!recs) return;

    const ch = state.characters.find(c => c.id === subjectId);
    if (!ch) return;

    // Save snapshot before applying so changes can be reverted
    state.balanceSnapshot = {
      characters: JSON.parse(JSON.stringify(state.characters)),
      savedAt: Date.now()
    };

    for (const sc of (recs.statChanges || [])) {
      if (ch.stats?.[sc.stat]) ch.stats[sc.stat].step = sc.to;
    }
    for (const ch2 of (recs.skillChanges || [])) {
      const skill = ch.skills?.[ch2.skillIndex];
      if (!skill) continue;
      if (ch2.field === "cooldown") { skill.cooldown ??= {}; skill.cooldown.value = ch2.to; }
      else if (ch2.field === "mpCost") { skill.mpCost ??= {}; skill.mpCost.value = ch2.to; }
      else if (ch2.field === "hpCost") { skill.hpCost ??= {}; skill.hpCost.value = ch2.to; }
      else if (ch2.effectIndex != null) {
        const effect = skill.triggers?.[ch2.triggerIndex]?.effects?.[ch2.effectIndex];
        if (effect != null) effect[ch2.field] = ch2.to;
      } else if (ch2.triggerIndex != null) {
        const trigger = skill.triggers?.[ch2.triggerIndex];
        if (trigger != null) trigger[ch2.field] = ch2.to;
      }
    }

    state.itemsStale = true;
    // Keep allRecommendations so the user can continue applying other chars;
    // just mark this char as applied and update only its button in-place.
    state.balanceApplied ??= new Set();
    state.balanceApplied.add(subjectId);

    btn.disabled = true;
    btn.textContent = "✓ Aplicado";
    const badge = document.createElement("span");
    badge.className = "rec-applied-badge";
    badge.textContent = t("recAppliedNote") || "Cambio aplicado";
    btn.insertAdjacentElement("afterend", badge);

    debouncedSave();
  });

  topPanelRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='recApply']");
    if (!btn) return;

    const recs = state.recommendations;
    const hasAny = recs?.statChanges?.length || recs?.skillChanges?.length;
    if (!hasAny) return;

    const subjectId = btn.dataset.subjectId || recs.subjectId;
    const subject   = state.characters.find(c => c.id === subjectId);
    if (!subject) return;

    // Apply stat changes
    for (const ch of (recs.statChanges || [])) {
      subject.stats[ch.stat] ??= {};
      subject.stats[ch.stat].step = ch.to;
    }

    // Apply skill changes
    for (const ch of (recs.skillChanges || [])) {
      const skill = subject.skills?.[ch.skillIndex];
      if (!skill) continue;
      if (ch.field === "cooldown") {
        skill.cooldown ??= {};
        skill.cooldown.value = ch.to;
      } else if (ch.field === "mpCost") {
        skill.mpCost ??= {};
        skill.mpCost.value = ch.to;
      } else if (ch.field === "hpCost") {
        skill.hpCost ??= {};
        skill.hpCost.value = ch.to;
      } else if (ch.field === "power" || ch.field === "magnitude") {
        const effect = skill.triggers?.[ch.triggerIndex]?.effects?.[ch.effectIndex];
        if (effect) effect[ch.field] = ch.to;
      }
    }

    state.recommendations = null;
    renderTopPanel();
    renderCharacterEditor();
    renderCharacterList();
    saveToStorage();
  });

  /* Items modal root */
  const itemsModalRoot = document.getElementById("itemsModalRoot");
  itemsModalRoot.addEventListener("click", (e) => {
    const isOverlay = e.target.classList.contains("modal-overlay");
    const btn = e.target.closest("[data-action='closeItemsModal']");
    if (!isOverlay && !btn) return;
    state.simItemsModal = null;
    renderSimItemsModal();
  });

  // Power score modal
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='openPowerModal']");
    if (!btn) return;
    state.powerScoreModal = { charId: btn.dataset.subjectId };
    renderPowerScoreModal();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-stop-propagation]")) return; // don't close when clicking inside box
    const btn = e.target.closest("[data-action='closePowerModal']");
    if (!btn) return;
    state.powerScoreModal = null;
    renderPowerScoreModal();
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
