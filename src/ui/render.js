// src/ui/render.js
// UI rendering (Stats / Skills / Simulation) + Skill modal.
// Comments in English by request.

import { state, getSelectedCharacter } from "../state.js";
import { t, applyLanguage } from "../i18n.js";
import { STAT_KEYS } from "../models/character.js";
import { calculateStat } from "../services/calc.js";
import { EFFECT_TYPES, BUFFABLE_STATS, CONTROL_TYPES, STATUS_TYPES } from "../models/skill.js";
import { ensureGameDesign, getRarityMultiplier, effectiveMaxLevel, DEFAULT_RARITIES, DEFAULT_STAT_REFS, STAT_TYPE_ABSOLUTE, STAT_TYPE_PERCENTAGE, DISTRIBUTION_SLOTS } from "../models/gameDesign.js";
import { WEAPON_SLOTS } from "../models/itemGenerator.js";
import { ALL_WEAPON_KEYS, WEAPON_KEYS_2H } from "../models/character.js";

/* ================= Utilities ================= */

export function statDomId(statKey) {
  return statKey.toLowerCase().replaceAll(" ", "_").replaceAll("%", "pct");
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

function getEnsuredGameDesign() {
  ensureGameDesign(state.gameDesign);
  return state.gameDesign;
}

function scaledStatValue(character, statName) {
  const gd       = getEnsuredGameDesign();
  const step     = Number(character.stats?.[statName]?.step ?? 5);
  const statRef  = gd.statRefs?.[statName];
  const refValue = Number(statRef?.value ?? 0);
  const maxLvl   = effectiveMaxLevel(statName, gd);
  const rMult    = getRarityMultiplier(character.rarity, gd.rarities);
  const isNpc    = character.charType === "npc";
  const tierPcts = (isNpc && statRef?.npcTierPcts) ? statRef.npcTierPcts : (statRef?.tierPcts ?? null);
  const noLvl    = statRef?.noLevelScaling ?? false;
  return calculateStat(refValue, Number(character.level || 1), maxLvl, step, rMult, tierPcts, noLvl);
}

/* ================= Class types ================= */

// Primary MMO archetypes — matches CLASS_PROFILES in events.js
const CLASS_TYPE_KEYS = [
  { key: "tank",         i18n: "classTypeTank",         desc: "High HP and defense. Absorbs damage. Long fights." },
  { key: "warrior",      i18n: "classTypeWarrior",       desc: "Physical melee DPS. Balanced Physical Damage + Crit." },
  { key: "assassin",     i18n: "classTypeAssassin",      desc: "Burst physical damage dealer. Short explosive fights." },
  { key: "mage",         i18n: "classTypeMage",          desc: "High magical burst damage. Fragile but devastating." },
  { key: "healer",       i18n: "classTypeHealer",        desc: "Sustain through HP/Mana regeneration. Very long fights." },
  { key: "enchanter",    i18n: "classTypeEnchanter",     desc: "Magic support through buffs, debuffs and enchantments." },
  { key: "support",      i18n: "classTypeSupport",       desc: "Utility and shields. High resistance and defense." },
  { key: "antitank",     i18n: "classTypeAntitank",      desc: "Penetration specialist. Designed to bypass high-defense targets." },
  { key: "crowdcontrol", i18n: "classTypeCrowdControl",  desc: "Debuff and control specialist. Wins through skill effects." }
];

export const SECONDARY_CLASS_KEYS = [];

function renderClassTypesRow(character) {
  // Store as a boolean map on the character.
  character.classTypes ??= {};
  character.subClassTypes ??= {};

  return `
    <!-- Primary class types (MMO archetypes) -->
    <div class="class-types-row">
      <div class="class-category-title">
        ${t("classType")}
      </div>

      ${CLASS_TYPE_KEYS.map(ct => `
        <label class="class-type-item" title="${escapeAttr(ct.desc)}">
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
    </div>
  `;

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
        <input id="levelRange" type="range" min="1" max="${getEnsuredGameDesign().maxLevel ?? 50}" step="1" value="${Math.min(c.level, getEnsuredGameDesign().maxLevel ?? 50)}" />
        <strong id="levelValue">${c.level}</strong>
      </div>
      <div class="small-note">${t("scaling")}</div>
    </div>

    ${tabsHtml}
  `;

  const tabContent = state.activeTab === "skills" ? renderSkillsTab(c) : renderBalanceTab(c);
  html += `<div id="char-tab-content">${tabContent}</div>`;

  content.innerHTML = html;
  applyLanguage(content);
}


/* ================= Game Design Tab ================= */

export function renderGameDesignTab() {
  const gd = getEnsuredGameDesign();

  // Pre-compute column totals for the distribution table (skip autoCalc stats)
  const distTotals = {};
  for (const stat of STAT_KEYS) {
    if (gd.statRefs[stat]?.autoCalc) continue;
    distTotals[stat] = DISTRIBUTION_SLOTS.reduce(
      (sum, slot) => sum + Number(gd.statDistribution?.[slot]?.[stat] ?? 0), 0
    );
  }

  const gdSlotLabel = (slot) => {
    const key = "slot" + slot.charAt(0).toUpperCase() + slot.slice(1);
    return t(key) || slot;
  };

  // 3-category layout with sliders (0-100) instead of number inputs
  const DIST_CATEGORIES = [
    { label: t("distCatArmor"),       slots: ["helmet","chest","gloves","pants","boots"] },
    { label: t("distCatWeapons"),     slots: ["weapon"] },
    { label: t("distCatAccessories"), slots: ["ring1","ring2","necklace"] }
  ];

  const distCatHtml = `
    <div class="dist-categories">
      ${DIST_CATEGORIES.map(cat => `
        <div class="dist-category">
          <div class="dist-category-title">${escapeHtml(cat.label)}</div>
          <div class="dist-boxes">
            ${cat.slots.map(slot => {
              const rows = STAT_KEYS.filter(stat => !gd.statRefs[stat]?.autoCalc).map(stat => {
                const val = Number(gd.statDistribution?.[slot]?.[stat] ?? 0);
                const tot = distTotals[stat];
                const ok  = tot === 100;
                return `
                  <div class="dist-box-row">
                    <span class="dist-box-stat" title="${escapeAttr(stat)}">${escapeHtml(stat)}</span>
                    <input class="dist-slider" type="range" min="0" max="100" step="1"
                      value="${val}"
                      data-action="gdDistValue"
                      data-slot="${escapeAttr(slot)}"
                      data-stat="${escapeAttr(stat)}"
                      title="${val}%"
                    />
                    <span class="dist-box-val ${ok ? "dist-ok" : "dist-warn"}" data-stat="${escapeAttr(stat)}" data-slot="${escapeAttr(slot)}">${val}</span>
                  </div>`;
              }).join("");
              return `
                <div class="dist-box">
                  <div class="dist-box-title">${escapeHtml(gdSlotLabel(slot))}</div>
                  ${rows}
                </div>`;
            }).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  let html = `
    <h3>${t("tabGameDesign")}</h3>

    <div class="gd-section">
      <label class="gd-field">
        <span class="gd-label">${t("gdMaxLevel")}</span>
        <input
          class="gd-input"
          type="number" min="1" max="999" step="1"
          value="${Number(gd.maxLevel ?? 50)}"
          data-action="gdMaxLevel"
        />
      </label>
    </div>

    <div class="gd-section">
      <div class="gd-section-title">${t("gdStatRefs")}</div>
      <div class="small-note" style="margin-bottom:10px;">${escapeHtml(t("gdStatRefsHint"))}</div>

      <div class="gd-refs-grid">
        <div class="gd-refs-header">
          <span>${t("stats") || "Stat"}</span>
          <span>${t("gdStatType")}</span>
          <span>${t("gdRefValue")}</span>
        </div>
        ${STAT_KEYS.filter(stat => !gd.statRefs[stat]?.autoCalc).map(stat => {
          const ref     = gd.statRefs[stat];
          const defType = DEFAULT_STAT_REFS[stat]?.type ?? STAT_TYPE_ABSOLUTE;
          const typeLabel = defType === STAT_TYPE_ABSOLUTE
            ? t("gdStatTypeAbsolute")
            : t("gdStatTypePercentage");
          return `
            <div class="gd-refs-row">
              <span class="gd-stat-name">${escapeHtml(stat)}</span>
              <span class="gd-stat-type-badge gd-stat-type-${defType}">${escapeHtml(typeLabel)}</span>
              <input
                class="gd-input"
                type="number" min="0" step="1"
                value="${Number(ref.value ?? 0)}"
                data-action="gdRefValue"
                data-stat="${escapeAttr(stat)}"
              />
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div class="gd-section">
      <div class="gd-section-title">${t("gdStatDistribution")}</div>
      <div class="small-note" style="margin-bottom:10px;">${escapeHtml(t("gdStatDistHint"))}</div>
      ${distCatHtml}
    </div>
  `;

  // Rarity config section
  const rarityRows = (gd.rarities ?? []).map((r, idx) => `
    <tr class="gd-rarity-row">
      <td><input class="gd-input gd-rarity-name-input" type="text" value="${escapeAttr(r.label)}"
        data-action="gdRarityLabel" data-idx="${idx}" maxlength="32"/></td>
      <td>
        <input type="color" class="gd-rarity-color-input" value="${escapeAttr(r.color)}"
          data-action="gdRarityColor" data-idx="${idx}"/>
        <span class="gd-rarity-color-preview" style="background:${r.color};color:${r.color};">■</span>
      </td>
      <td><input class="gd-input gd-rarity-quality-input" type="number" min="1" max="1000" step="1"
        value="${r.quality}" data-action="gdRarityQuality" data-idx="${idx}"/></td>
      <td class="gd-rarity-mult">×${(r.quality / 100).toFixed(2)}</td>
      <td>
        <button class="gd-rarity-delete-btn" data-action="gdRarityDelete" data-idx="${idx}"
          title="${t("gdRarityDelete")}" ${(gd.rarities ?? []).length <= 1 ? "disabled" : ""}>✕</button>
      </td>
    </tr>
  `).join("");

  html += `
    <div class="gd-section">
      <div class="gd-section-title">${t("gdRarities")}</div>
      <div class="small-note" style="margin-bottom:10px;">${escapeHtml(t("gdRaritiesHint"))}</div>
      <table class="gd-rarity-table">
        <thead>
          <tr>
            <th>${t("gdRarityName")}</th>
            <th>${t("gdRarityColor")}</th>
            <th>${t("gdRarityQuality")}</th>
            <th>${t("gdRarityMult")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rarityRows}</tbody>
      </table>
      <button class="secondary-btn gd-rarity-add-btn" data-action="gdRarityAdd" style="margin-top:8px;">
        + ${t("gdRarityAdd")}
      </button>
    </div>
  `;

  return html;
}

/* ================= Balance Tab ================= */

function formatStatResult(value, statType) {
  const n = Math.round(Number(value));
  return statType === STAT_TYPE_PERCENTAGE ? `${n}%` : String(n);
}

function renderBalanceTab(c) {
  const gd    = getEnsuredGameDesign();
  const rMult = getRarityMultiplier(c.rarity, gd.rarities);

  const rarityOptions = (gd.rarities ?? []).map(r => `
    <option value="${r.key}" ${c.rarity === r.key ? "selected" : ""}>
      ${escapeHtml(r.label)} (×${(r.quality / 100).toFixed(2)})
    </option>
  `).join("");

  // Build weapon dropdowns
  const weaponNoneOption = `<option value="">${escapeHtml(t("weaponNone"))}</option>`;
  const primaryOptions = ALL_WEAPON_KEYS.map(wk => {
    const wSlot = WEAPON_SLOTS.find(w => w.key === wk);
    const label = t("slot" + wk.charAt(0).toUpperCase() + wk.slice(1)) || wk;
    const badge = wSlot?.hands === 2 ? ` [${t("itemGen2H")}]` : ` [${t("itemGen1H")}]`;
    return `<option value="${wk}" ${c.primaryWeapon === wk ? "selected" : ""}>${escapeHtml(label + badge)}</option>`;
  }).join("");

  // Secondary: only 1H weapons or none; disable if primary is 2H
  const primary2H = WEAPON_KEYS_2H.includes(c.primaryWeapon ?? "");
  const secondaryOptions = ALL_WEAPON_KEYS
    .filter(wk => !WEAPON_KEYS_2H.includes(wk))
    .map(wk => {
      const label = t("slot" + wk.charAt(0).toUpperCase() + wk.slice(1)) || wk;
      return `<option value="${wk}" ${c.secondaryWeapon === wk ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");

  const isDual = !primary2H && !!c.primaryWeapon && !!c.secondaryWeapon;

  // Player/NPC type selector
  const charTypeHtml = `
    <div class="char-type-row">
      <span class="char-type-label">${t("charType")}</span>
      <label class="char-type-option">
        <input type="radio" name="charType_${c.id}" value="player"
          data-action="charTypeChange" ${(c.charType ?? "player") !== "npc" ? "checked" : ""}/>
        ${escapeHtml(t("charTypePlayer"))}
      </label>
      <label class="char-type-option">
        <input type="radio" name="charType_${c.id}" value="npc"
          data-action="charTypeChange" ${c.charType === "npc" ? "checked" : ""}/>
        ${escapeHtml(t("charTypeNpc"))}
      </label>
      ${c.charType === "npc" ? '<span class="npc-badge">NPC</span>' : ""}
    </div>`;

  let html = `
    ${charTypeHtml}
    <div class="balance-header-row">
      <label class="balance-rarity-label">
        <span>${t("rarity")}</span>
        <select data-action="charRarity">${rarityOptions}</select>
      </label>
    </div>

    <div class="weapon-loadout-row">
      <span class="weapon-loadout-title">${t("weaponLoadout")}</span>
      <label class="weapon-loadout-field">
        <span class="weapon-loadout-label">${t("primaryWeapon")}</span>
        <select class="weapon-select" data-action="charPrimaryWeapon">
          ${weaponNoneOption}${primaryOptions}
        </select>
      </label>
      <label class="weapon-loadout-field ${primary2H ? "weapon-field-disabled" : ""}">
        <span class="weapon-loadout-label">${t("secondaryWeapon")}</span>
        <select class="weapon-select" data-action="charSecondaryWeapon" ${primary2H ? "disabled" : ""}>
          ${weaponNoneOption}${secondaryOptions}
        </select>
      </label>
      ${isDual ? `<span class="weapon-dual-badge">${t("itemGenDualWield")} ×0.5</span>` : ""}
    </div>

    <div class="balance-grid-header">
      <span>Stat</span>
      <span>${t("sliderStep")}</span>
      <span>${t("statValue")}</span>
    </div>
  `;

  for (const stat of STAT_KEYS) {
    const statRef  = gd.statRefs?.[stat];
    // HP Regen / Mana Regen are auto-calculated — hidden from builder sliders
    if (statRef?.autoCalc) continue;

    const step     = Number(c.stats?.[stat]?.step ?? 5);
    const refValue = Number(statRef?.value ?? 0);
    const statType = DEFAULT_STAT_REFS[stat]?.type ?? STAT_TYPE_ABSOLUTE;
    const maxLvl   = effectiveMaxLevel(stat, gd);
    const isNpc    = c.charType === "npc";
    const tierPcts = (isNpc && statRef?.npcTierPcts) ? statRef.npcTierPcts : (statRef?.tierPcts ?? null);
    const noLvl    = statRef?.noLevelScaling ?? false;
    const tierMax  = tierPcts ? tierPcts.length - 1 : 10;
    const clampedStep = Math.max(0, Math.min(tierMax, step));
    const raw      = calculateStat(refValue, c.level, maxLvl, clampedStep, rMult, tierPcts, noLvl);
    const tierPct  = tierPcts ? tierPcts[clampedStep] : clampedStep * 20;
    const sid      = statDomId(stat);
    const noLvlBadge = noLvl ? `<span class="stat-no-level-badge" title="Constant — does not scale with level">const</span>` : "";

    html += `
      <div class="balance-stat-row">
        <span class="balance-stat-name">${escapeHtml(stat)}${noLvlBadge}</span>

        <div class="balance-slider-cell">
          <input
            class="balance-slider"
            type="range" min="0" max="${tierMax}" step="1"
            value="${clampedStep}"
            data-action="statStep"
            data-stat="${escapeAttr(stat)}"
          />
          <span class="balance-step-label" id="step-label-${sid}">${clampedStep}/${tierMax} (${tierPct}%)</span>
        </div>

        <span class="balance-result" id="result-${sid}">${formatStatResult(raw, statType)}</span>
      </div>
    `;
  }

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
  if (kind === "hp_cost") return "log-hp-cost";
  if (kind === "evaded")  return "log-evaded";
  return "log-info";
}

// Build per-side summary: side = "A" or "B"
// Damage received = rows targeting this side (r.a / r.b non-empty)
// Heals received  = heal/regen rows targeting this side
function buildSideSummary(rows, side) {
  const bySkill = new Map();
  let hpRegenTotal = 0, hpRegenTimes = 0;

  const get = (key) => {
    if (!bySkill.has(key)) bySkill.set(key, { normalDmg: 0, critDmg: 0, heal: 0, evaded: 0, mitigated: 0 });
    return bySkill.get(key);
  };

  for (const row of rows) {
    const onThisSide = side === "A" ? !!row.a : !!row.b;
    if (!onThisSide) continue;

    if (row.kind === "damage" || row.kind === "crit" || row.kind === "dot_damage") {
      if (!row.amount) continue;
      const e = get(row.skillName || "—");
      if (row.isCrit) e.critDmg  += row.amount;
      else            e.normalDmg += row.amount;
      e.mitigated += row.mitigated || 0;
    } else if (row.kind === "heal") {
      if (!row.amount) continue;
      get(row.skillName || "—").heal += row.amount;
    } else if (row.kind === "hp_regen") {
      if (!row.amount) continue;
      hpRegenTotal += row.amount; hpRegenTimes++;
    } else if (row.kind === "evaded") {
      if (!row.amount) continue;
      get(row.skillName || "—").evaded += row.amount;
    }
  }
  return { bySkill, hpRegenTotal, hpRegenTimes };
}

function fmt(n) { return Math.round(n).toLocaleString(); }

function simSumTable(headHtml, bodyHtml, footHtml) {
  return `<table class="sim-sum-table">
    <thead>${headHtml}</thead>
    <tbody>${bodyHtml}</tbody>
    ${footHtml ? `<tfoot>${footHtml}</tfoot>` : ""}
  </table>`;
}

// Render the 3-subsection block (Damage | Heals | Mitigation) for one side
function renderSideSummaryBlock(rows, side) {
  const { bySkill, hpRegenTotal, hpRegenTimes } = buildSideSummary(rows, side);
  if (bySkill.size === 0 && hpRegenTotal === 0) return "";

  /* 1. DAMAGE received */
  let dmgBody = "", totalNormal = 0, totalCrit = 0;
  for (const [name, e] of bySkill) {
    if (e.normalDmg === 0 && e.critDmg === 0) continue;
    const tot = e.normalDmg + e.critDmg;
    totalNormal += e.normalDmg; totalCrit += e.critDmg;
    dmgBody += `<tr>
      <td class="sim-sum-skill-name">${escapeHtml(name)}</td>
      <td class="sim-sum-val">${fmt(e.normalDmg)}</td>
      <td class="sim-sum-val sim-sum-crit">${e.critDmg > 0 ? fmt(e.critDmg) : "—"}</td>
      <td class="sim-sum-val sim-sum-bold">${fmt(tot)}</td>
    </tr>`;
  }
  const dmgSection = dmgBody ? `
    <div class="sim-sum-section">
      <div class="sim-sum-label">${t("simSumDamage")||"Daño recibido"}</div>
      ${simSumTable(
        `<tr><th>${t("simSumSkill")||"Skill"}</th><th>${t("simSumNormal")||"Normal"}</th><th>${t("simSumCrit")||"Crítico"}</th><th>${t("simSumTotal")||"Total"}</th></tr>`,
        dmgBody,
        `<tr><td>${t("simSumGrandTotal")||"Total"}</td>
             <td class="sim-sum-val">${fmt(totalNormal)}</td>
             <td class="sim-sum-val sim-sum-crit">${totalCrit > 0 ? fmt(totalCrit) : "—"}</td>
             <td class="sim-sum-val sim-sum-bold">${fmt(totalNormal + totalCrit)}</td></tr>`
      )}
    </div>` : "";

  /* 2. HEALS received (skills + regen + vamp) */
  let healBody = "", totalHeal = 0;
  for (const [name, e] of bySkill) {
    if (e.heal === 0) continue;
    totalHeal += e.heal;
    healBody += `<tr>
      <td class="sim-sum-skill-name">${escapeHtml(name)}</td>
      <td class="sim-sum-val sim-sum-heal">${fmt(e.heal)}</td>
    </tr>`;
  }
  if (hpRegenTotal > 0) {
    totalHeal += hpRegenTotal;
    healBody += `<tr>
      <td class="sim-sum-skill-name sim-sum-regen">${t("simSumRegen")||"Regen HP"} (${hpRegenTimes}×)</td>
      <td class="sim-sum-val sim-sum-regen">${fmt(hpRegenTotal)}</td>
    </tr>`;
  }
  const healSection = healBody ? `
    <div class="sim-sum-section">
      <div class="sim-sum-label">${t("simSumHeals")||"Curación recibida"}</div>
      ${simSumTable(
        `<tr><th>${t("simSumSource")||"Fuente"}</th><th>${t("simSumTotal")||"Total"}</th></tr>`,
        healBody,
        `<tr><td>${t("simSumGrandTotal")||"Total"}</td><td class="sim-sum-val sim-sum-heal">${fmt(totalHeal)}</td></tr>`
      )}
    </div>` : "";

  /* 3. MITIGATION (evasion + defense) */
  let mitBody = "", totalEvaded = 0, totalMitigated = 0;
  for (const [name, e] of bySkill) {
    if (e.evaded === 0 && e.mitigated === 0) continue;
    totalEvaded   += e.evaded;
    totalMitigated += e.mitigated;
    mitBody += `<tr>
      <td class="sim-sum-skill-name">${escapeHtml(name)}</td>
      <td class="sim-sum-val sim-sum-evaded">${e.evaded > 0 ? fmt(e.evaded) : "—"}</td>
      <td class="sim-sum-val sim-sum-mitigated">${e.mitigated > 0 ? fmt(e.mitigated) : "—"}</td>
      <td class="sim-sum-val sim-sum-bold">${fmt(e.evaded + e.mitigated)}</td>
    </tr>`;
  }
  const mitSection = mitBody ? `
    <div class="sim-sum-section">
      <div class="sim-sum-label">${t("simSumMitigation")||"Daño mitigado"}</div>
      ${simSumTable(
        `<tr><th>${t("simSumSkill")||"Skill"}</th><th>${t("simSumEvaded")||"Evasión"}</th><th>${t("simSumDefense")||"Defensa"}</th><th>${t("simSumTotal")||"Total"}</th></tr>`,
        mitBody,
        `<tr><td>${t("simSumGrandTotal")||"Total"}</td>
             <td class="sim-sum-val sim-sum-evaded">${totalEvaded > 0 ? fmt(totalEvaded) : "—"}</td>
             <td class="sim-sum-val sim-sum-mitigated">${totalMitigated > 0 ? fmt(totalMitigated) : "—"}</td>
             <td class="sim-sum-val sim-sum-bold">${fmt(totalEvaded + totalMitigated)}</td></tr>`
      )}
    </div>` : "";

  return `${dmgSection}${healSection}${mitSection}`;
}

function renderBattleSummary(rows, nameA, nameB) {
  const blockA = renderSideSummaryBlock(rows, "A");
  const blockB = renderSideSummaryBlock(rows, "B");
  if (!blockA && !blockB) return "";

  const playerLabel = (name, block) => block ? `
    <div class="sim-sum-player">
      <div class="sim-sum-player-name">${escapeHtml(name)}</div>
      <div class="sim-sum-sections">${block}</div>
    </div>` : "";

  return `<div class="sim-summary">
    <div class="sim-sum-title">${t("simSumTitle")||"Resumen de combate"}</div>
    <div class="sim-sum-players">
      ${playerLabel(nameA || "A", blockA)}
      ${playerLabel(nameB || "B", blockB)}
    </div>
  </div>`;
}

// Render a single log entry with a styled time badge and optional HP/Mana bars
function logLine(kind, timeS, text, row) {
  const cls = rowClass(kind);
  let bars = "";
  if (row && row.hpTarget != null && row.maxHpTarget > 0) {
    const hpPct = Math.max(0, Math.min(100, row.hpTarget / row.maxHpTarget * 100));
    bars += `<div class="log-bar log-bar-hp">
      <div class="log-bar-fill" style="width:${hpPct.toFixed(1)}%"></div>
      <span class="log-bar-label">${row.hpTarget.toLocaleString()}/${row.maxHpTarget.toLocaleString()}</span>
    </div>`;
  }
  if (row && row.manaTarget != null && row.maxManaTarget > 0) {
    const manaPct = Math.max(0, Math.min(100, row.manaTarget / row.maxManaTarget * 100));
    bars += `<div class="log-bar log-bar-mana">
      <div class="log-bar-fill" style="width:${manaPct.toFixed(1)}%"></div>
      <span class="log-bar-label">${row.manaTarget.toLocaleString()}/${row.maxManaTarget.toLocaleString()}</span>
    </div>`;
  }
  return `<div class="log-line ${cls}">
    <span class="log-time-badge">${timeS}s</span>
    <span class="log-body">${escapeHtml(text)}</span>
    ${bars}
  </div>`;
}

function renderRunsLogs(runs) {
  if (!runs || !runs.length) return "";

  return `
    <div style="margin-top:12px; display:flex; flex-direction:column; gap:14px;">
      ${runs.map((run, idx) => {
        const seed     = run.seed   ?? "";
        const winner   = run.winner ?? "";
        const rows     = run.rows   ?? [];
        const duration = run.duration;

        // Prefer stored names (handles self-battle "Name 2"), fall back to START row text
        const nameA = run.nameA
          || (rows.find(r => r.a?.startsWith("START:"))?.a || "").replace(/^START:\s*/, "").split(" (Lv")[0] || "A";
        const nameB = run.nameB
          || (rows.find(r => r.b?.startsWith("START:"))?.b || "").replace(/^START:\s*/, "").split(" (Lv")[0] || "B";
        const winnerIsA = winner === nameA;
        const durBadge = duration != null
          ? `<span class="sim-run-dur">${duration}s</span>` : "";

        return `
          <div class="sim-run-card">
            <div class="sim-run-header">
              <span class="sim-run-num">#${idx + 1}</span>
              <span class="sim-run-vs">${escapeHtml(nameA)} <span class="sim-run-vs-sep">vs</span> ${escapeHtml(nameB)}</span>
              <span class="sim-run-winner ${winnerIsA ? "winner-a" : "winner-b"}">🏆 ${escapeHtml(winner)} ${durBadge}</span>
              <span class="sim-run-seed">seed ${seed}</span>
            </div>

            <div class="logs-grid">
              <div>
                <div class="log-col-header">${t("damageReceivedBy")} <b>${nameA}</b></div>
                <div class="log-panel">
                  ${(rows || []).map(r => r.a ? logLine(r.kind, r.t, r.a, r) : "").join("")}
                </div>
              </div>
              <div>
                <div class="log-col-header">${t("damageReceivedBy")} <b>${nameB}</b></div>
                <div class="log-panel">
                  ${(rows || []).map(r => r.b ? logLine(r.kind, r.t, r.b, r) : "").join("")}
                </div>
              </div>
            </div>
            ${renderBattleSummary(rows, nameA, nameB)}
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

  if (state.activeTab === "skills") {
    const el = document.getElementById("char-tab-content");
    if (el) {
      el.innerHTML = renderSkillsTab(c);
      applyLanguage(el);
    }
    return;
  }

  if (state.activeTab !== "stats") return;

  const gd    = getEnsuredGameDesign();
  const rMult = getRarityMultiplier(c.rarity, gd.rarities);

  for (const stat of STAT_KEYS) {
    const statRef  = gd.statRefs?.[stat];
    if (statRef?.autoCalc) continue;
    const step     = Number(c.stats?.[stat]?.step ?? 5);
    const refValue = Number(statRef?.value ?? 0);
    const statType = DEFAULT_STAT_REFS[stat]?.type ?? STAT_TYPE_ABSOLUTE;
    const maxLvl   = effectiveMaxLevel(stat, gd);
    const isNpc    = c.charType === "npc";
    const tierPcts = (isNpc && statRef?.npcTierPcts) ? statRef.npcTierPcts : (statRef?.tierPcts ?? null);
    const noLvl    = statRef?.noLevelScaling ?? false;
    const tierMax  = tierPcts ? tierPcts.length - 1 : 10;
    const clamped  = Math.max(0, Math.min(tierMax, step));
    const sid      = statDomId(stat);

    const resultEl = document.getElementById(`result-${sid}`);
    if (resultEl) {
      const raw = calculateStat(refValue, c.level, maxLvl, clamped, rMult, tierPcts, noLvl);
      resultEl.textContent = formatStatResult(raw, statType);
    }
  }
}

/* ================= Top Bar ================= */

export function renderTopBar() {
  const bar = document.getElementById("topBar");
  if (!bar) return;
  const v = state.activeView ?? "characters";
  bar.innerHTML = `
    <button class="nav-tab-btn ${v === "characters" ? "active" : ""}"
      data-action="navTab" data-view="characters" title="${t("navCharactersHint")}">${t("navCharacters")}</button>
    <button class="nav-tab-btn ${v === "configStats" ? "active" : ""}"
      data-action="navTab" data-view="configStats" title="${t("navConfigStatsHint")}">${t("topBarConfigStats")}</button>
    <button class="nav-tab-btn ${v === "itemGenerator" ? "active" : ""}"
      data-action="navTab" data-view="itemGenerator" title="${t("navItemGeneratorHint")}">${t("topBarItemGenerator")}</button>
    <button class="nav-tab-btn ${v === "simulation" ? "active" : ""}"
      data-action="navTab" data-view="simulation" title="${t("navSimulationHint")}">${t("topBarSimulation")}</button>
    <div class="nav-spacer"></div>
    <button class="nav-action-btn" data-action="exportAllConfig" title="${t("exportAllHint")}">${t("exportAll")}</button>
    <button class="nav-action-btn" data-action="importAllConfig" title="${t("importAllHint")}">${t("importAll")}</button>
  `;
}

/* ================= Top Panel / Main View (full-page tabs) ================= */

export function renderTopPanel() {
  const view    = state.activeView ?? "characters";
  const mainView = document.getElementById("mainView");
  const appView  = document.getElementById("appView");

  if (!mainView || !appView) return;

  if (view === "characters") {
    // Show the character builder; hide main view
    mainView.style.display = "none";
    mainView.innerHTML = "";
    appView.style.display  = "flex";
  } else {
    // Show main view as full page; hide character builder
    appView.style.display  = "none";
    mainView.style.display = "flex";
    mainView.style.flexDirection = "column";

    const bodyHtml = view === "configStats"
      ? renderGameDesignTab()
      : view === "itemGenerator"
      ? renderItemGeneratorPanel()
      : renderSimulationPanel();

    mainView.innerHTML = bodyHtml;
    applyLanguage(mainView);
  }
}

/* ================= Item Generator Panel ================= */

function slotLabel(slot) {
  const key = "slot" + slot.charAt(0).toUpperCase() + slot.slice(1);
  return t(key) || slot;
}

function rarityLabel(rarityKey) {
  const gd = getEnsuredGameDesign();
  return gd.rarities?.find(r => r.key === rarityKey)?.label
    || t("rarity" + rarityKey.charAt(0).toUpperCase() + rarityKey.slice(1))
    || rarityKey;
}

function rarityColor(rarityKey) {
  const gd = getEnsuredGameDesign();
  return gd.rarities?.find(r => r.key === rarityKey)?.color ?? "#aaaaaa";
}

function renderItemGeneratorPanel() {
  const cfg  = state.itemGenConfig;
  // Only show player characters in the item generator.
  const chars = (state.characters || []).filter(c => c.charType !== "npc");
  const gd = getEnsuredGameDesign();

  // Character checkboxes
  const selectedIds = cfg.selectedCharacterIds ?? [];

  const charCheckboxes = chars.length === 0
    ? `<span class="small-note">${t("selectCharacter")}</span>`
    : chars.map(c => {
        const checked = selectedIds.length === 0 || selectedIds.includes(c.id);
        return `
          <label class="item-gen-class-label">
            <input type="checkbox" data-action="itemGenClass" data-id="${escapeAttr(c.id)}" ${checked ? "checked" : ""}/>
            <span>${escapeHtml(c.name)}</span>
          </label>`;
      }).join("");

  // Rarity checkboxes using configurable rarities.
  const rarityCheckboxes = (gd.rarities ?? []).map(r => `
    <label class="item-gen-rarity-label">
      <input type="checkbox" data-action="itemGenRarity" data-rarity="${r.key}"
        ${cfg.selectedRarities.includes(r.key) ? "checked" : ""}/>
      <span class="rarity-badge" style="color:${r.color};background:${r.color}22;border-color:${r.color}55">${escapeHtml(r.label)}</span>
    </label>
  `).join("");

  const staleHtml = state.itemsStale
    ? `<div class="item-gen-stale">${t("itemGenStale")}</div>` : "";

  return `
    <div class="item-gen-controls">
      <div class="item-gen-field">
        <span class="item-gen-label">${t("itemGenLevelRange")}</span>
        <div class="item-gen-level-range">
          <input class="item-gen-input" type="number" min="1" max="999" step="1"
            value="${Number(cfg.minLevel ?? 1)}" data-action="itemGenMinLevel" title="${t("itemGenMinLevel")}"/>
          <span class="item-gen-level-sep">–</span>
          <input class="item-gen-input" type="number" min="1" max="999" step="1"
            value="${Number(cfg.maxLevel ?? 1)}" data-action="itemGenMaxLevel" title="${t("itemGenMaxLevel")}"/>
          <span class="item-gen-level-step-label">${t("itemGenStep")}</span>
          <input class="item-gen-input" type="number" min="1" max="100" step="1"
            value="${Number(cfg.levelStep ?? 1)}" data-action="itemGenLevelStep" title="${t("itemGenStep")}"/>
        </div>
      </div>

      <div class="item-gen-field">
        <span class="item-gen-label">${t("itemGenRarities")}</span>
        <div class="item-gen-rarities">${rarityCheckboxes}</div>
      </div>

      <div class="item-gen-field">
        <span class="item-gen-label">${t("itemGenClasses")}</span>
        <div class="item-gen-classes">${charCheckboxes}</div>
      </div>

      <div class="item-gen-btn-row">
        <button class="primary-btn item-gen-btn" type="button" data-action="itemGenGenerate">
          ${t("itemGenGenerate")}
        </button>
        <button class="secondary-btn item-gen-btn" type="button" data-action="itemGenRegenerate"
          title="${t("itemGenRegenerateHint")}">
          ${t("itemGenRegenerate")}
        </button>
      </div>
    </div>

    ${staleHtml}
    ${renderGeneratedItemsGrid()}
  `;
}

function renderGeneratedItemsGrid() {
  const items = state.generatedItems || [];
  if (items.length === 0) return `<p class="small-note item-gen-empty">${t("itemGenEmpty")}</p>`;

  const gd = getEnsuredGameDesign();
  // Determine rarity order from game design.
  const rarityOrder = (gd.rarities ?? DEFAULT_RARITIES).map(r => r.key);

  // Group by level first.
  const levels = [...new Set(items.map(i => i.targetLevel ?? 1))].sort((a, b) => a - b);

  let html = "";

  for (const lv of levels) {
    const lvItems = items.filter(i => (i.targetLevel ?? 1) === lv);
    html += `<div class="item-gen-level-section"><div class="item-gen-level-title">Lv. ${lv}</div>`;

    // Within this level, group by rarity in configured order.
    const lvRarities = rarityOrder.filter(rk => lvItems.some(i => i.rarity === rk));

    for (const rarity of lvRarities) {
      const rarityItems = lvItems.filter(i => i.rarity === rarity);
      const equipment   = rarityItems.filter(i => i.category === "equipment");
      const weapons     = rarityItems.filter(i => i.category === "weapon");
      const accessories = rarityItems.filter(i => i.category === "accessory");
      const rColor = rarityColor(rarity);

      html += `<div class="item-gen-rarity-section">
        <div class="item-gen-rarity-title" style="color:${rColor}">${escapeHtml(rarityLabel(rarity))}</div>`;

      if (equipment.length) {
        html += `<div class="item-gen-category-title">${t("itemGenEquipment")}</div><div class="item-cards-row">`;
        for (const item of equipment) html += renderItemCard(item, gd);
        html += `</div>`;
      }
      if (weapons.length) {
        html += `<div class="item-gen-category-title">${t("itemGenWeapon")}</div><div class="item-cards-row">`;
        for (const item of weapons) html += renderItemCard(item, gd);
        html += `</div>`;
      }
      if (accessories.length) {
        html += `<div class="item-gen-category-title">${t("itemGenAccessory")}</div><div class="item-cards-row">`;
        for (const item of accessories) html += renderItemCard(item, gd);
        html += `</div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  return html;
}

function renderItemCard(item, gd) {
  const label = slotLabel(item.slot);
  const rColor = rarityColor(item.rarity);

  // Hand badge for weapons
  const wSlot = WEAPON_SLOTS.find(w => w.key === item.slot);
  const handsBadge = wSlot
    ? `<span class="item-hands-badge">${wSlot.hands === 2 ? t("itemGen2H") : t("itemGen1H")}${item.handUnits === 0.5 ? " ×½" : ""}</span>`
    : "";

  const statsRows = (gd ? Object.keys(gd.statRefs || {}) : [])
    .filter(s => (item.stats?.[s] ?? 0) !== 0)
    .map(s => {
      const statType = DEFAULT_STAT_REFS[s]?.type ?? STAT_TYPE_ABSOLUTE;
      const val      = item.stats[s] ?? 0;
      const display  = statType === STAT_TYPE_PERCENTAGE ? `${val}%` : String(val);
      return `<div class="item-card-stat">
        <span class="item-stat-name">${escapeHtml(s)}</span>
        <span class="item-stat-val">${display}</span>
      </div>`;
    }).join("");

  // Class badges
  const designedNames = (item.designedForNames || []);
  const usableNames   = (item.usableByNames   || []).filter(n => !designedNames.includes(n));

  const classBadges = designedNames.length
    ? `<div class="item-card-classes">
        <span class="item-class-label">${t("itemGenDesignedFor")}:</span>
        ${designedNames.map(n => `<span class="item-class-badge designed">${escapeHtml(n)}</span>`).join("")}
        ${usableNames.map(n => `<span class="item-class-badge usable">${escapeHtml(n)}</span>`).join("")}
       </div>`
    : "";

  return `
    <div class="item-card" style="border-left: 3px solid ${rColor}">
      <div class="item-card-header">
        <span class="item-card-name">${escapeHtml(label)}</span>
        ${handsBadge}
        <span class="item-level-badge" style="color:${rColor}">Lv.${item.targetLevel ?? "?"}</span>
      </div>
      <div class="item-card-stats">${statsRows}</div>
      ${classBadges}
    </div>
  `;
}

/* ================= Simulation Panel (top panel) ================= */

/** Collect items for a character given level + maxRarity. Returns { slotKey: item } */
export function getSimItemsBySlot(charId, itemLevel, maxRarity, generatedItems) {
  if (!itemLevel || !charId) return {};
  const gd = getEnsuredGameDesign();
  const rarities = gd.rarities ?? DEFAULT_RARITIES;
  const rarityKeys = rarities.map(r => r.key);
  const maxIdx = rarityKeys.indexOf(maxRarity ?? rarityKeys[rarityKeys.length - 1]);
  const eligible = (generatedItems || []).filter(item =>
    Number(item.targetLevel) === Number(itemLevel) &&
    rarityKeys.indexOf(item.rarity) <= maxIdx &&
    (item.usableByIds?.includes(charId) || item.designedForIds?.includes(charId))
  );
  const bySlot = {};
  for (const item of eligible) {
    const cur = bySlot[item.slot];
    if (!cur || rarityKeys.indexOf(item.rarity) > rarityKeys.indexOf(cur.rarity)) {
      bySlot[item.slot] = item;
    }
  }
  return bySlot;
}

/** Sum stats across all equipped item slots */
export function sumItemStats(itemsBySlot) {
  const totals = {};
  for (const item of Object.values(itemsBySlot)) {
    for (const [stat, val] of Object.entries(item.stats || {})) {
      totals[stat] = (totals[stat] || 0) + Number(val || 0);
    }
  }
  return totals;
}

export function renderSimulationPanel() {
  return renderSimTabWithItems();
}

function renderSimTabWithItems() {
  const chars = state.characters || [];
  state.simConfig ??= {};
  state.simConfig.expectedBalanceSeconds ??= 30;
  state.simConfig.balanceLevel         ??= 1;
  state.simConfig.balanceTolerancePct  ??= 10;
  state.simConfig.itemLevel            ??= null;
  state.simConfig.maxRarity            ??= "legendary";
  state.simConfig.opponentType         ??= "players";
  const cfg = state.simConfig;

  const aId = cfg.aId || (chars[0]?.id ?? "");
  const bId = cfg.bId || (chars[1]?.id ?? chars[0]?.id ?? "");
  const charA = chars.find(c => c.id === aId);
  const charB = chars.find(c => c.id === bId);

  const optionsA = chars.map(c => `<option value="${c.id}" ${c.id===aId?"selected":""}>${escapeHtml(c.name)}</option>`).join("");
  const optionsB = chars.map(c => `<option value="${c.id}" ${c.id===bId?"selected":""}>${escapeHtml(c.name)}</option>`).join("");

  const availableLevels = [...new Set((state.generatedItems||[]).map(i=>i.targetLevel))].sort((a,b)=>a-b);
  const levelOptions = [`<option value="">${t("simItemLevelNone")}</option>`,
    ...availableLevels.map(lvl => `<option value="${lvl}" ${String(cfg.itemLevel)===String(lvl)?"selected":""}>${lvl}</option>`)
  ].join("");

  const simGd = getEnsuredGameDesign();
  const rarityOptions = (simGd.rarities ?? []).map(r =>
    `<option value="${r.key}" ${cfg.maxRarity===r.key?"selected":""}>${escapeHtml(r.label)}</option>`
  ).join("");

  const runs = state.simRuns || [];
  const showLogs = !!state.simShowLogs;

  // ── Post-battle analysis ──────────────────────────────────────────────────
  let battleAnalysis = "";
  if (runs.length > 0) {
    const recCfg = state.recommendConfig ?? {};
    const isVsAll = runs.some(r => r.oppName != null);

    // Helper: render expandable stat breakdown for a character
    const renderCharStatsPanel = (char, itemStats, open) => {
      if (!char) return "";
      const gd = getEnsuredGameDesign();
      const rows = STAT_KEYS.map(stat => {
        const base  = scaledStatValue(char, stat);
        const item  = Number(itemStats?.[stat] || 0);
        const total = base + item;
        if (base === 0 && item === 0) return "";
        const isPercent = (gd.statRefs?.[stat]?.type ?? "absolute") === "percentage";
        const fmt2 = v => isPercent ? v.toFixed(1) + "%" : Math.round(v).toLocaleString();
        return `<tr>
          <td class="bpc-stat-name">${escapeHtml(stat)}</td>
          <td class="bpc-stat-val">${fmt2(base)}</td>
          <td class="bpc-stat-val bpc-stat-item">${item > 0 ? "+" + fmt2(item) : "—"}</td>
          <td class="bpc-stat-val bpc-stat-total">${fmt2(total)}</td>
        </tr>`;
      }).join("");
      return `
        <div class="bpc-stats-panel ${open ? "" : "bpc-stats-hidden"}">
          <table class="bpc-stats-table">
            <thead><tr><th>Stat</th><th>Base</th><th>Items</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    };

    // Average duration across all runs
    const runsWithDur = runs.filter(r => r.duration != null);
    const avgDurStr   = runsWithDur.length
      ? (runsWithDur.reduce((s, r) => s + r.duration, 0) / runsWithDur.length).toFixed(1) + "s"
      : "—";

    if (isVsAll) {
      const charAName = escapeHtml(charA?.name ?? "A");
      const totalRuns = runs.length;
      const winsA     = runs.filter(r => r.winner === charA?.name).length;
      const wrAPct    = totalRuns ? (winsA / totalRuns * 100).toFixed(1) : "0.0";

      const vsAllRows = runs.map(r => {
        const won = r.winner === charA?.name;
        return `<tr class="vsall-row vsall-${won ? "win" : "loss"}">
          <td class="vsall-opp">${escapeHtml(r.oppName ?? "")}</td>
          <td class="vsall-result ${won ? "vsall-win-txt" : "vsall-loss-txt"}">${won ? "Win" : "Loss"}</td>
          <td class="vsall-dur">${r.duration != null ? r.duration + "s" : "—"}</td>
        </tr>`;
      }).join("");

      const itemStatsA = cfg.itemLevel
        ? sumItemStats(getSimItemsBySlot(aId, cfg.itemLevel, cfg.maxRarity, state.generatedItems ?? []))
        : {};
      const statsOpenA = !!state.simStatsOpenA;

      battleAnalysis = `
        <div class="battle-analysis">
          <div class="battle-analysis-title">${charAName} — RUN VS ALL</div>
          <div class="vsall-summary">
            <span class="vsall-wr">${winsA}W / ${totalRuns - winsA}L &nbsp;·&nbsp; WR: ${wrAPct}%</span>
            <span class="vsall-dur small-note">Avg: ${avgDurStr}</span>
          </div>
          <div class="battle-cards-row" style="margin-bottom:8px;">
            <div class="battle-player-card bpc-ok">
              <div class="bpc-name-row">
                <span class="bpc-name">${charAName}</span>
                <button class="bpc-stats-toggle" type="button" data-action="toggleCharStats" data-which="A">
                  ${statsOpenA ? "▲" : "▼"} Stats
                </button>
              </div>
              ${renderCharStatsPanel(charA, itemStatsA, statsOpenA)}
            </div>
          </div>
          <table class="vsall-table">
            <thead><tr><th>Opponent</th><th>Result</th><th>Duration</th></tr></thead>
            <tbody>${vsAllRows}</tbody>
          </table>
        </div>
      `;
    } else {
      // Standard A vs B analysis
      // Use stored names from runs so self-battle ("Mago vs Mago 2") compares correctly
      const effNameA = runs[0]?.nameA ?? charA?.name ?? "";
      const effNameB = runs[0]?.nameB ?? charB?.name ?? "";
      const totalRuns = runs.length;
      const winsA = runs.filter(r => r.winner === effNameA).length;
      const winsB = runs.filter(r => r.winner === effNameB).length;
      const draws = totalRuns - winsA - winsB;
      const wrA = totalRuns ? winsA / totalRuns : 0;
      const wrB = totalRuns ? winsB / totalRuns : 0;
      const wrAPct = (wrA * 100).toFixed(1);
      const wrBPct = (wrB * 100).toFixed(1);

      const itemStatsA = cfg.itemLevel
        ? sumItemStats(getSimItemsBySlot(aId, cfg.itemLevel, cfg.maxRarity, state.generatedItems ?? []))
        : {};
      const itemStatsB = cfg.itemLevel
        ? sumItemStats(getSimItemsBySlot(bId, cfg.itemLevel, cfg.maxRarity, state.generatedItems ?? []))
        : {};
      const statsOpenA = !!state.simStatsOpenA;
      const statsOpenB = !!state.simStatsOpenB;

      battleAnalysis = `
        <div class="battle-analysis">
          <div class="battle-analysis-title">POST-BATTLE ANALYSIS
            <span class="bpa-avg-dur small-note">Avg duration: ${avgDurStr}</span>
          </div>
          <div class="battle-cards-row">
            <div class="battle-player-card ${wrA > wrB ? "bpc-ok" : "bpc-warn"}">
              <div class="bpc-name-row">
                <span class="bpc-name">${escapeHtml(effNameA || "A")}</span>
                <button class="bpc-stats-toggle" type="button"
                  data-action="toggleCharStats" data-which="A"
                  title="Ver estadísticas base / ítems / total">
                  ${statsOpenA ? "▲" : "▼"} Stats
                </button>
              </div>
              <div class="bpc-wr">${winsA}W / ${totalRuns - winsA}L${draws > 0 ? ` / ${draws}D` : ""} &nbsp;·&nbsp; WR: ${wrAPct}%</div>
              ${renderCharStatsPanel(charA, itemStatsA, statsOpenA)}
            </div>
            <div class="battle-vs-sep">VS</div>
            <div class="battle-player-card ${wrB > wrA ? "bpc-ok" : "bpc-warn"}">
              <div class="bpc-name-row">
                <span class="bpc-name">${escapeHtml(effNameB || "B")}</span>
                <button class="bpc-stats-toggle" type="button"
                  data-action="toggleCharStats" data-which="B"
                  title="Ver estadísticas base / ítems / total">
                  ${statsOpenB ? "▲" : "▼"} Stats
                </button>
              </div>
              <div class="bpc-wr">${winsB}W / ${totalRuns - winsB}L${draws > 0 ? ` / ${draws}D` : ""} &nbsp;·&nbsp; WR: ${wrBPct}%</div>
              ${renderCharStatsPanel(charB, itemStatsB, statsOpenB)}
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="battle-controls-grid">
      <div class="battle-ctrl-section">
        <div class="battle-ctrl-label">PLAYERS</div>
        <div class="skill-row">
          <div>
            <div class="small-note">${t("playerA")}</div>
            <select id="simA" data-action="simCfg">${optionsA}</select>
          </div>
          <div>
            <div class="small-note">${t("level")} (A)</div>
            <input id="simLevelA" data-action="simCfg" type="number" min="1" max="100" value="${cfg.levelA??1}"/>
          </div>
          <div>
            <div class="small-note">${t("playerB")}</div>
            <select id="simB" data-action="simCfg">${optionsB}</select>
          </div>
          <div>
            <div class="small-note">${t("level")} (B)</div>
            <input id="simLevelB" data-action="simCfg" type="number" min="1" max="100" value="${cfg.levelB??1}"/>
          </div>
        </div>
      </div>

      <div class="battle-ctrl-section">
        <div class="battle-ctrl-label">ITEMS</div>
        <div class="skill-row">
          <div>
            <div class="small-note">${t("simItemLevel")}</div>
            <select id="simItemLevel" data-action="simCfg" data-field="itemLevel">${levelOptions}</select>
          </div>
          <div>
            <div class="small-note">${t("simItemMaxRarity")}</div>
            <select id="simMaxRarity" data-action="simCfg" data-field="maxRarity">${rarityOptions}</select>
          </div>
          ${cfg.itemLevel ? `
            <div style="align-self:flex-end;display:flex;gap:6px;">
              <button class="secondary-btn" type="button" data-action="simViewItems" data-char-id="${aId}"
                data-char-name="${escapeAttr(charA?.name??"")}">Items (A)</button>
              <button class="secondary-btn" type="button" data-action="simViewItems" data-char-id="${bId}"
                data-char-name="${escapeAttr(charB?.name??"")}">Items (B)</button>
            </div>
          ` : ""}
        </div>
      </div>

      <div class="battle-ctrl-section">
        <div class="battle-ctrl-label">SIMULATION</div>
        <div class="skill-row">
          <div>
            <div class="small-note">${t("seed")}</div>
            <input id="simSeed" data-action="simCfg" type="number" value="${cfg.seed??12345}"/>
          </div>
          <div style="align-self:flex-end;">
            <button class="secondary-btn" type="button" data-action="randomSeed">${t("randomSeed")}</button>
          </div>
          <div>
            <div class="small-note">${t("maxSeconds")}</div>
            <input id="simMaxSeconds" data-action="simCfg" type="number" min="10" max="600" value="${cfg.maxSeconds??60}"/>
          </div>
          <div style="align-self:flex-end;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="primary-btn" type="button" data-action="runSim">${t("run")}</button>
            <button class="secondary-btn" type="button" data-action="runSim10">${t("run10")}</button>
            <button class="secondary-btn" type="button" data-action="runSimAll">${t("runVsAll")}</button>
          </div>
        </div>
      </div>
    </div>

    ${battleAnalysis}

    <div class="battle-logs-bar">
      <button class="secondary-btn" type="button" data-action="toggleSimLogs">
        ${showLogs ? t("hideLogs") : t("viewLogs")}
      </button>
      ${runs.length ? `<span class="small-note">${runs.length} run(s) stored</span>` : ""}
    </div>

    ${showLogs ? renderRunsLogs(runs) : ""}
  `;
}

/* ================= Expected Battles Tab ================= */

function renderExpectedBattlesTab() {
  const cfg     = state.recommendConfig ?? {};
  const players = state.characters.filter(c => c.charType !== "npc");

  // ── Global defaults ──────────────────────────────────────────────────────
  const globalSection = `
    <div class="exp-section">
      <div class="exp-section-title">${t("recExpectedGlobal")}</div>
      <p class="small-note" style="margin-bottom:10px;">${t("recExpectedNote")}</p>
      <div class="exp-global-row">
        <div><div class="small-note">Min WR %</div>
          <input class="rec-input" type="number" min="0" max="100" value="${cfg.minWinPct ?? 40}"
            data-action="recCfg" data-field="minWinPct"/></div>
        <div><div class="small-note">Max WR %</div>
          <input class="rec-input" type="number" min="0" max="100" value="${cfg.maxWinPct ?? 60}"
            data-action="recCfg" data-field="maxWinPct"/></div>
        <div><div class="small-note">Min Dur (s)</div>
          <input class="rec-input" type="number" min="1" max="999" value="${cfg.minDuration ?? 20}"
            data-action="recCfg" data-field="minDuration"/></div>
        <div><div class="small-note">Max Dur (s)</div>
          <input class="rec-input" type="number" min="1" max="999" value="${cfg.maxDuration ?? 40}"
            data-action="recCfg" data-field="maxDuration"/></div>
      </div>
    </div>`;

  // ── Per-character targets — card style, one per row ───────────────────────
  const targetCards = players.map(c => {
    const ct    = cfg.charTargets?.[c.id] ?? {};
    const minWr = ct.minWinPct   ?? "";
    const maxWr = ct.maxWinPct   ?? "";
    const minDr = ct.minDuration ?? "";
    const maxDr = ct.maxDuration ?? "";

    // Use CLASS_TYPE_KEYS i18n to get the proper translated label
    const classTypes = c.classTypes ?? {};
    const classKeys  = Object.keys(classTypes).filter(k => classTypes[k]);
    const classLabel = classKeys.length
      ? classKeys.map(k => {
          const ctEntry = CLASS_TYPE_KEYS.find(e => e.key === k);
          return ctEntry ? t(ctEntry.i18n) || k : k;
        }).join(", ")
      : "—";

    const rec       = (state.allRecommendations ?? []).find(r => r.subjectId === c.id);
    const mirrorDur = rec?.mirrorAvgDuration != null ? `${rec.mirrorAvgDuration.toFixed(1)}s` : null;

    const phMin = cfg.minWinPct  ?? 40;
    const phMax = cfg.maxWinPct  ?? 60;
    const phMnD = cfg.minDuration ?? 20;
    const phMxD = cfg.maxDuration ?? 40;

    return `
      <div class="exp-char-row">
        <div class="exp-char-identity">
          <span class="exp-char-name">${escapeHtml(c.name)}</span>
          <span class="rec-target-class">${escapeHtml(classLabel)}</span>
          ${mirrorDur ? `<span class="exp-mirror-pill" title="${t("recExpectedSelfBattle")}">⚔ ${mirrorDur}</span>` : ""}
        </div>
        <div class="exp-char-inputs">
          <label class="exp-inp-group">
            <span class="small-note">Min WR%</span>
            <input class="rec-target-input" type="number" min="0" max="100" step="1"
              placeholder="${phMin}" value="${minWr}"
              data-action="recCharTarget" data-char-id="${escapeAttr(c.id)}" data-field="minWinPct"/>
          </label>
          <label class="exp-inp-group">
            <span class="small-note">Max WR%</span>
            <input class="rec-target-input" type="number" min="0" max="100" step="1"
              placeholder="${phMax}" value="${maxWr}"
              data-action="recCharTarget" data-char-id="${escapeAttr(c.id)}" data-field="maxWinPct"/>
          </label>
          <label class="exp-inp-group">
            <span class="small-note">Min Dur(s)</span>
            <input class="rec-target-input" type="number" min="1" max="999" step="1"
              placeholder="${phMnD}" value="${minDr}"
              data-action="recCharTarget" data-char-id="${escapeAttr(c.id)}" data-field="minDuration"/>
          </label>
          <label class="exp-inp-group">
            <span class="small-note">Max Dur(s)</span>
            <input class="rec-target-input" type="number" min="1" max="999" step="1"
              placeholder="${phMxD}" value="${maxDr}"
              data-action="recCharTarget" data-char-id="${escapeAttr(c.id)}" data-field="maxDuration"/>
          </label>
        </div>
      </div>`;
  }).join("");

  const targetsSection = players.length
    ? `<div class="exp-section">
        <div class="exp-section-title">${t("recExpectedTargets")}</div>
        <div class="exp-char-list">${targetCards}</div>
       </div>`
    : `<p class="small-note">No player characters found.</p>`;

  return `${globalSection}${targetsSection}`;
}

/* ================= Recommended Stats Tab ================= */

function renderRecommendedStatsTab() {
  const cfg  = state.recommendConfig ?? {};
  const mode = cfg.recMode ?? "both";

  const modeOptions = [
    { val: "stats",  key: "recModeStats"  },
    { val: "skills", key: "recModeSkills" },
    { val: "both",   key: "recModeBoth"   }
  ].map(o => `<option value="${o.val}" ${mode === o.val ? "selected" : ""}>${t(o.key)}</option>`).join("");

  // ── All-players analysis view ─────────────────────────────────────────
  let allRecsHtml = "";
  const allRecs = state.allRecommendations;
  if (allRecs && allRecs.length > 0) {
    const minWr = cfg.minWinPct ?? 40;
    const maxWr = cfg.maxWinPct ?? 60;
    const minDr = cfg.minDuration ?? 20;
    const maxDr = cfg.maxDuration ?? 40;

    const dirArrow = d => d === "up" ? "↑" : "↓";
    const unitLabel = sk => {
      if (sk.field !== "cooldown") return "";
      return sk.unit === "minutes" ? " min" : " s";
    };

    // Compute power scores: normalize WR across all characters (1=weakest, 10=strongest)
    const allWRs = allRecs.map(r => r.winRate);
    const wrMin  = Math.min(...allWRs);
    const wrMax  = Math.max(...allWRs);
    const wrRange = wrMax - wrMin;
    const getPowerScore = (wr) => wrRange < 0.001
      ? 5
      : Math.max(1, Math.min(10, Math.round(1 + (wr - wrMin) / wrRange * 9)));

    const cards = allRecs.map(r => {
      const powerScore = getPowerScore(r.winRate);
      const powerColor = powerScore <= 3 ? "#5588ff"
        : powerScore <= 5 ? "#aabb44"
        : powerScore <= 7 ? "#ffb347"
        : "#ff5544";

      const wr       = (r.winRate * 100).toFixed(1);
      const dr       = r.avgDuration.toFixed(1);
      const wrOk     = r.winRate * 100 >= minWr && r.winRate * 100 <= maxWr;
      const drOk     = r.avgDuration >= minDr && r.avgDuration <= maxDr;
      const hasVariance = r.winConflict || r.durConflict;
      const hasChanges  = (r.statChanges?.length ?? 0) + (r.skillChanges?.length ?? 0) > 0;
      const charName = state.characters.find(c => c.id === r.subjectId)?.name ?? r.subjectId;

      // ── Status pills ─────────────────────────────────────────────────
      const oomPct = r.totalGames > 0 ? Math.round((r.oomBattles ?? 0) / r.totalGames * 100) : 0;
      const oomPill = r.isOOM
        ? `<span class="rec-oom-badge" title="Mana depleted in ${oomPct}% of battles — mana fix prioritized">⚡ OOM ${oomPct}%</span>`
        : "";
      const variancePill = hasVariance
        ? `<span class="rec-variance-badge" title="${t("recVarianceHint")}">⚠ ${t("recVariance")}</span>`
        : "";
      const statusPill = r.isFullyBalanced
        ? `<span class="rec-ok-badge rec-ok-full">✓ ${t("recFullyBalanced") || "Fully Balanced"}</span>`
        : (!hasChanges ? `<span class="rec-ok-badge">✓ ${t("recOkBadge")}</span>` : "");

      // ── Stat change tags ─────────────────────────────────────────────
      const statTags = (r.statChanges ?? []).map(sc =>
        `<span class="rec-change-tag rec-change-${sc.direction}">
          ${escapeHtml(sc.stat)}: ${sc.from}→${sc.to} ${dirArrow(sc.direction)}
        </span>`
      ).join("");

      // ── Skill change tags (cooldown shows unit) ──────────────────────
      const skillTags = (r.skillChanges ?? []).map(sk => {
        const u = unitLabel(sk);
        return `<span class="rec-change-tag rec-change-${sk.direction}">
          ${escapeHtml(sk.skillName)} (${escapeHtml(sk.field)}): ${sk.from}${u}→${sk.to}${u} ${dirArrow(sk.direction)}
        </span>`;
      }).join("");

      const changeSection = (statTags || skillTags)
        ? `<div class="rec-player-changes">${statTags}${skillTags}</div>`
        : "";

      const alreadyApplied = state.balanceApplied?.has(r.subjectId);
      const applyBtn = hasChanges
        ? alreadyApplied
          ? `<button class="secondary-btn rec-apply-one-btn" type="button" disabled>✓ Aplicado</button>
             <span class="rec-applied-badge">${t("recAppliedNote") || "Cambio aplicado"}</span>`
          : `<button class="secondary-btn rec-apply-one-btn" type="button"
              data-action="recApplyOne" data-subject-id="${escapeAttr(r.subjectId)}">${t("recApply")}</button>`
        : "";

      const cardClass = !hasChanges ? "rec-card-ok" : hasVariance ? "rec-card-variance" : "rec-card-changes";
      const isExpanded = (state.recExpandedCards ?? []).includes(r.subjectId);
      const expandArrow = isExpanded ? "▲" : "▼";

      // ── Expandable: per-character and per-level breakdown ────────────
      let expandedHtml = "";
      if (isExpanded) {
        // Per-opponent win rates
        const charRows = (r.byChar ?? []).map(bc => {
          const bwrOk = bc.winRate * 100 >= minWr && bc.winRate * 100 <= maxWr;
          const bdrOk = bc.avgDuration >= minDr && bc.avgDuration <= maxDr;
          return `<tr>
            <td>${escapeHtml(bc.charName)}</td>
            <td class="${bwrOk ? "rec-exp-ok" : "rec-exp-warn"}">${(bc.winRate*100).toFixed(1)}%</td>
            <td class="${bdrOk ? "rec-exp-ok" : "rec-exp-warn"}">${bc.avgDuration.toFixed(1)}s</td>
          </tr>`;
        }).join("");

        // Per-level win rates
        const lvlRows = (r.byLevel ?? []).map(bl => {
          const blwrOk = bl.winRate * 100 >= minWr && bl.winRate * 100 <= maxWr;
          const bldrOk = bl.avgDuration >= minDr && bl.avgDuration <= maxDr;
          return `<tr>
            <td>Lv.${bl.level}</td>
            <td class="${blwrOk ? "rec-exp-ok" : "rec-exp-warn"}">${(bl.winRate*100).toFixed(1)}%</td>
            <td class="${bldrOk ? "rec-exp-ok" : "rec-exp-warn"}">${bl.avgDuration.toFixed(1)}s</td>
          </tr>`;
        }).join("");

        expandedHtml = `
          <div class="rec-expanded">
            <div class="rec-exp-cols">
              ${charRows ? `<div class="rec-exp-section">
                <div class="rec-exp-title">${t("recExpVsChars")}
                  <span class="rec-exp-wr-note">${t("balanceWRNote")}</span>
                </div>
                <table class="rec-exp-table"><thead><tr>
                  <th>${t("opponent")}</th><th title="${t("balanceWRNote")}">Win %</th><th>Dur</th>
                </tr></thead><tbody>${charRows}</tbody></table>
              </div>` : ""}
              ${lvlRows ? `<div class="rec-exp-section">
                <div class="rec-exp-title">${t("recExpByLevel")}</div>
                <table class="rec-exp-table"><thead><tr>
                  <th>Level</th><th>WR%</th><th>Dur</th>
                </tr></thead><tbody>${lvlRows}</tbody></table>
              </div>` : ""}
            </div>
          </div>`;
      }

      return `
        <div class="rec-player-card ${cardClass}">
          <div class="rec-player-header rec-player-header-clickable"
            data-action="recToggleCard" data-subject-id="${escapeAttr(r.subjectId)}">
            <span class="rec-player-name">${escapeHtml(charName)}</span>
            <span class="rec-player-class">${escapeHtml(r.classProfile ?? "—")}</span>
            <span class="rec-metric ${wrOk ? "" : "rec-warn-val"}">WR: ${wr}%</span>
            <span class="rec-metric ${drOk ? "" : "rec-warn-val"}">Dur: ${dr}s</span>
            ${oomPill}${variancePill}${statusPill}
            <span class="rec-power-score" style="background:${powerColor}22;border-color:${powerColor}55;color:${powerColor}"
              data-action="openPowerModal" data-subject-id="${escapeAttr(r.subjectId)}"
              title="${t('powerScore')}">${powerScore}/10</span>
            <span class="rec-expand-arrow">${expandArrow}</span>
          </div>
          ${changeSection}
          ${expandedHtml}
          ${applyBtn ? `<div class="rec-player-footer">${applyBtn}</div>` : ""}
        </div>`;
    }).join("");

    const hasNonConflict = allRecs.some(r => r.statChanges?.length || r.skillChanges?.length);
    const hasSnapshot    = !!state.balanceSnapshot;

    allRecsHtml = `
      <div class="rec-results rec-all-results">
        <div class="rec-section-title">${t("recAllTitle")}</div>
        <div class="rec-player-list">${cards}</div>
        <div class="rec-action-row">
          <button class="primary-btn" type="button" data-action="recApplyAll"
            ${hasNonConflict ? "" : "disabled"}
            title="${hasNonConflict ? "" : t("recNoChanges")}">${t("recApplyAll")}</button>
          <button class="secondary-btn rec-revert-btn" type="button" data-action="recRevert"
            ${hasSnapshot ? "" : "disabled"}
            title="${hasSnapshot ? t("recRevertHint") : t("recNoSnapshot")}">↩ ${t("recRevert")}</button>
        </div>
      </div>`;
  }

  return `
    <div class="rec-controls">
      <div>
        <div class="small-note">${t("recMode")}</div>
        <select data-action="recCfg" data-field="recMode">${modeOptions}</select>
      </div>
      <div>
        <div class="small-note">${t("simOpponentType")}</div>
        <select data-action="simCfg" data-field="opponentType">
          <option value="players" ${(state.simConfig?.opponentType ?? "players")==="players"?"selected":""}>${t("simVsPlayers")}</option>
          <option value="npcs" ${(state.simConfig?.opponentType ?? "players")==="npcs"?"selected":""}>${t("simVsNpcs")}</option>
          <option value="all" ${(state.simConfig?.opponentType ?? "players")==="all"?"selected":""}>${t("simVsAll")}</option>
        </select>
      </div>
      <div>
        <div class="small-note">${t("balanceTimeLimitLabel")}</div>
        <select data-action="recCfg" data-field="balanceTimeLimit">
          ${[30, 60, 120, 180, 300].map(s => {
            const lbl = s < 60 ? `${s}s` : `${s/60} min`;
            const sel = (cfg.balanceTimeLimit ?? 60) === s ? "selected" : "";
            return `<option value="${s}" ${sel}>${lbl}</option>`;
          }).join("")}
        </select>
      </div>
      <div style="align-self:flex-end;">
        <button class="primary-btn" type="button" data-action="recRunAll"
          title="${t("recRunAllHint")}">${t("recRunAll")}</button>
      </div>
    </div>
    ${state.balanceAnalyzing
      ? renderBalanceProgressBar()
      : (state.balanceNotOptimal ? `<div class="rec-not-optimal-warn">⚠ ${t("balanceNotOptimal") || "Optimal balance not found — closest approximation shown."}</div>${allRecsHtml}` : allRecsHtml)}
    ${!state.balanceAnalyzing && !state.allRecommendations ? `<p class="small-note">${t("recNoData")}</p>` : ""}
  `;
}

function renderBalanceProgressBar() {
  const prog = state.balanceProgress;
  if (!prog) return `<div class="rec-analyzing"><div class="rec-spinner"></div></div>`;

  const phaseLabelMap = {
    baseline:  t("balancePhaseBaseline")  || "Running baseline",
    optimizing:t("balancePhaseOptimizing")|| "Optimizing",
    sim:       t("balancePhaseMainSim")   || "Main simulation",
    bylevel:   t("balancePhaseByLevel")   || "Level sampling",
    iterating: t("balancePhaseIterating") || "Iterative balance",
    mirror:    t("balancePhaseMirror")    || "Mirror matchup"
  };
  const phaseLabel = phaseLabelMap[prog.phase] ?? prog.phase;
  const pct = Math.min(100, Math.round((prog.overallFraction ?? 0) * 100));

  // Phase-specific detail line
  let detail = "";
  if (prog.phase === "baseline") {
    detail = `${prog.pairsDone ?? 0} / ${prog.pairsTotal ?? "?"} pairs`;
  } else if (prog.phase === "optimizing") {
    const iter = prog.iteration ?? 0;
    const score = prog.score != null ? prog.score.toFixed(1) : "…";
    const best  = prog.bestScore != null ? prog.bestScore.toFixed(1) : "…";
    const timeLimitS = prog.timeLimit ? Math.round(prog.timeLimit / 1000) : 60;
    const elapsedS   = prog.elapsed  ? Math.round(prog.elapsed / 1000) : 0;
    detail = `${t("balanceIterLabel")} ${iter} &nbsp;·&nbsp; ${t("balanceScoreLabel")}: ${score} (best: ${best}) &nbsp;·&nbsp; ${elapsedS}s / ${timeLimitS}s`;
    if (prog.charName && prog.stat) detail += ` &nbsp;·&nbsp; ${escapeHtml(prog.charName)} ${prog.stat} → ${prog.newStep}`;
  } else if (prog.phase === "sim"       && prog.detail) detail = `vs ${escapeHtml(prog.detail)}`;
  else if   (prog.phase === "bylevel"   && prog.detail) detail = `Lv ${prog.detail}`;
  else if   (prog.phase === "iterating" && prog.detail) detail = `${t("balancePhaseIterating")} ${prog.detail} / 8`;

  let etaStr = "";
  if (prog.eta != null && prog.eta > 0) {
    const etaLabel = prog.eta < 60 ? `~${prog.eta}s` : `~${Math.round(prog.eta / 60)}m`;
    etaStr = `<span class="rec-progress-eta">${etaLabel} ${t("balanceETA") || "remaining"}</span>`;
  }

  return `
    <div class="rec-analyzing">
      <div class="rec-progress-header">
        <span class="rec-progress-label">${phaseLabel}</span>
        ${etaStr}
      </div>
      <div class="rec-progress-bar-wrap">
        <div class="rec-progress-bar" style="width:${Math.max(pct, 2)}%"></div>
      </div>
      <div class="rec-progress-detail">${detail ? `${detail} &nbsp;·&nbsp; ` : ""}${pct}%</div>
    </div>
  `;
}

/* ================= Items Modal ================= */

export function renderSimItemsModal() {
  const root = document.getElementById("itemsModalRoot");
  if (!root) return;

  const modal = state.simItemsModal;
  if (!modal) { root.innerHTML = ""; return; }

  const { charId, charName } = modal;
  const cfg = state.simConfig ?? {};
  const itemsBySlot = getSimItemsBySlot(charId, cfg.itemLevel, cfg.maxRarity, state.generatedItems);
  const gd = getEnsuredGameDesign();
  const entries = Object.entries(itemsBySlot);

  const cardsHtml = entries.length
    ? `<div class="item-cards-row" style="flex-wrap:wrap;">
        ${entries.map(([,item]) => renderItemCard(item, gd)).join("")}
       </div>`
    : `<p class="small-note">${t("simNoItemsFound")}</p>`;

  root.innerHTML = `
    <div class="modal-overlay" data-action="closeItemsModal"></div>
    <div class="modal sim-items-modal">
      <div class="modal-header">
        <span>${t("simItemsModal")}: <b>${escapeHtml(charName)}</b></span>
        <button class="top-panel-close" data-action="closeItemsModal" type="button">✕</button>
      </div>
      <div class="modal-body" style="padding:16px;overflow-y:auto;max-height:70vh;">
        ${cardsHtml}
      </div>
    </div>
  `;
}

/* ================= Power Score Modal ================= */

export function renderPowerScoreModal() {
  const root = document.getElementById("powerScoreModalRoot");
  if (!root) return;

  const modal = state.powerScoreModal;
  if (!modal?.charId) { root.innerHTML = ""; return; }

  const ch  = state.characters.find(c => c.id === modal.charId);
  const gd  = getEnsuredGameDesign();
  if (!ch) { root.innerHTML = ""; return; }

  const classTypes = ch.classTypes ?? {};
  const classKeys  = Object.keys(classTypes).filter(k => classTypes[k]);
  const classLabel = classKeys.length ? classKeys.map(k => t("classType_" + k) || k).join(", ") : "—";

  // Stats rows
  const statsHtml = Object.keys(gd.statRefs ?? {}).map(stat => {
    const step = ch.stats?.[stat]?.step ?? 0;
    if (!step) return "";
    const refValue = Number(gd.statRefs[stat]?.value ?? 0);
    const statType = DEFAULT_STAT_REFS[stat]?.type ?? STAT_TYPE_ABSOLUTE;
    const maxLvl   = effectiveMaxLevel(stat, gd);
    const rMult    = getRarityMultiplier(ch.rarity ?? "common", gd.rarities);
    const val      = calculateStat(refValue, Number(ch.level || 1), maxLvl, step, rMult);
    const display  = formatStatResult(val, statType);
    return `<div class="psm-stat-row">
      <span class="psm-stat-name">${escapeHtml(stat)}</span>
      <span class="psm-stat-step">${step}/10</span>
      <span class="psm-stat-val">${display}</span>
    </div>`;
  }).join("");

  // Skills summary
  const skillsHtml = (ch.skills ?? []).map(sk => {
    const cdVal  = sk.cooldown?.value ?? 0;
    const cdUnit = sk.cooldown?.unit === "minutes" ? "min" : "s";
    const mpCost = sk.mpCost?.value ?? 0;
    const effectSummary = (sk.triggers ?? []).flatMap(tr =>
      (tr.effects ?? []).map(e => e.type)
    ).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    return `<div class="psm-skill-row">
      <span class="psm-skill-name">${escapeHtml(sk.name)}</span>
      <span class="psm-skill-cd">${cdVal}${cdUnit}</span>
      ${mpCost ? `<span class="psm-skill-mp">${mpCost} MP</span>` : ""}
      <span class="psm-skill-fx">${escapeHtml(effectSummary)}</span>
    </div>`;
  }).join("");

  const allRecs   = state.allRecommendations ?? [];
  const rec       = allRecs.find(r => r.subjectId === ch.id);
  const allWRs    = allRecs.map(r => r.winRate);
  const wrMin     = Math.min(...allWRs);
  const wrMax     = Math.max(...allWRs);
  const wrRange   = wrMax - wrMin;
  const ps        = wrRange < 0.001 ? 5 : Math.max(1, Math.min(10, Math.round(1 + ((rec?.winRate ?? 0) - wrMin) / wrRange * 9)));
  const psColor   = ps <= 3 ? "#5588ff" : ps <= 5 ? "#aabb44" : ps <= 7 ? "#ffb347" : "#ff5544";

  root.innerHTML = `
    <div class="modal-overlay" data-action="closePowerModal">
      <div class="modal-box psm-box" data-stop-propagation>
        <div class="psm-header">
          <div>
            <div class="psm-char-name">${escapeHtml(ch.name)}</div>
            <div class="psm-class-label small-note">${escapeHtml(classLabel)}</div>
          </div>
          <div class="psm-score-big" style="color:${psColor}">${ps}<span class="psm-score-denom">/10</span></div>
          <button class="modal-close-btn" data-action="closePowerModal">✕</button>
        </div>
        <div class="psm-cols">
          <div class="psm-col">
            <div class="psm-col-title">Stats (Lv.${ch.level})</div>
            ${statsHtml || "<div class='small-note'>No stats configured</div>"}
          </div>
          <div class="psm-col">
            <div class="psm-col-title">Skills</div>
            ${skillsHtml || "<div class='small-note'>No skills</div>"}
          </div>
        </div>
        ${rec ? `<div class="psm-footer small-note">Overall WR: ${(rec.winRate*100).toFixed(1)}% | Avg duration: ${rec.avgDuration.toFixed(1)}s</div>` : ""}
      </div>
    </div>`;
}
