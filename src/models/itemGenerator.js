// src/models/itemGenerator.js
// Per-class item generation using the stat distribution table.

import { DISTRIBUTION_SLOTS, DEFAULT_STAT_DISTRIBUTION, getRarityMultiplier, effectiveMaxLevel } from "./gameDesign.js";
import { calculateStat } from "../services/calc.js";
import { STAT_KEYS, WEAPON_KEYS_2H } from "./character.js";

// ── Slot definitions ──────────────────────────────────────────────────────────

export const EQUIPMENT_SLOTS = ["helmet", "chest", "gloves", "pants", "boots"];

// Each weapon entry: key + hands (1 = 1H, 2 = 2H)
export const WEAPON_SLOTS = [
  { key: "sword",    hands: 1 },
  { key: "shield",   hands: 1 },
  { key: "axe",      hands: 1 },
  { key: "dagger",   hands: 1 },
  { key: "mace",     hands: 1 },
  { key: "hammer",   hands: 1 },
  { key: "staff",    hands: 2 },
  { key: "bow",      hands: 2 },
  { key: "crossbow", hands: 2 },
  { key: "spear",    hands: 2 },
  { key: "2h_sword", hands: 2 }
];

export const ACCESSORY_SLOTS = ["ring1", "ring2", "necklace"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function is2H(weaponKey) {
  return WEAPON_KEYS_2H.includes(weaponKey);
}

/**
 * True if a character is dual-wielding:
 * primary is 1H AND secondary is set.
 */
function isDualWield(character) {
  return !!character.primaryWeapon
    && !is2H(character.primaryWeapon)
    && !!character.secondaryWeapon;
}

/**
 * Compute item stats for a character at a given distribution slot.
 * handUnits: 1.0 = full budget, 0.5 = dual-wield half-budget.
 */
function computeItemStats(character, distSlotKey, handUnits, targetLevel, rarityKey, gameDesign) {
  const rMult = getRarityMultiplier(rarityKey, gameDesign?.rarities);
  const dist  = gameDesign?.statDistribution?.[distSlotKey]
             ?? DEFAULT_STAT_DISTRIBUTION[distSlotKey]
             ?? {};

  const stats = {};
  for (const stat of STAT_KEYS) {
    const pct      = Number(dist[stat] ?? 0) / 100;
    const step     = Number(character.stats?.[stat]?.step ?? 5);
    const refValue = Number(gameDesign?.statRefs?.[stat]?.value ?? 0);

    if (pct <= 0) { stats[stat] = 0; continue; }

    // Items provide 90% of the total stat budget (10% comes from character level).
    // effectiveMaxLevel ensures absolute stats use a fixed denominator.
    const maxLvl = effectiveMaxLevel(stat, gameDesign);
    stats[stat] = Math.round(
      calculateStat(refValue, targetLevel, maxLvl, step, rMult) * 0.90 * pct * handUnits
    );
  }
  return stats;
}

/** Two stat objects are equal if all STAT_KEYS values match */
function statsEqual(a, b) {
  for (const s of STAT_KEYS) {
    if ((a[s] ?? 0) !== (b[s] ?? 0)) return false;
  }
  return true;
}

/**
 * Character A can use an item designed for character B if, for every stat
 * where the slot has a non-zero distribution share, A's effective step is
 * >= B's effective step.
 * effective step = character.stats[stat].step × handUnits
 *
 * "Effective step" accounts for dual-wield half-budget.
 */
function canUseItem(charA, handUnitsA, charB, handUnitsB, distSlotKey, gameDesign) {
  const dist = gameDesign?.statDistribution?.[distSlotKey]
             ?? DEFAULT_STAT_DISTRIBUTION[distSlotKey]
             ?? {};

  for (const stat of STAT_KEYS) {
    if (Number(dist[stat] ?? 0) <= 0) continue;
    const effA = Number(charA.stats?.[stat]?.step ?? 5) * handUnitsA;
    const effB = Number(charB.stats?.[stat]?.step ?? 5) * handUnitsB;
    if (effA < effB) return false;
  }
  return true;
}

/**
 * Group character-stat entries by identical stats.
 * Returns [{stats, forIds, forNames, repHandUnits}]
 */
function groupByStats(entries) {
  const groups = [];
  for (const e of entries) {
    const found = groups.find(g => statsEqual(g.stats, e.stats));
    if (found) {
      found.forIds.push(e.id);
      found.forNames.push(e.name);
    } else {
      groups.push({ stats: e.stats, forIds: [e.id], forNames: [e.name], repChar: e.char, repHandUnits: e.handUnits });
    }
  }
  return groups;
}

/**
 * Build item records for a single (slot, category, rarity).
 * charEntries: [{ char, handUnits }]
 * allSelectedChars: all selected chars (for usability check)
 * allHandUnitsMap: { charId → handUnits } for the usability handUnits lookup
 */
function buildItems(slot, distSlotKey, category, charEntries, allSelectedChars, allHandUnitsMap, rarity, targetLevel, gameDesign) {
  // Compute stats per char
  const entries = charEntries.map(({ char, handUnits }) => ({
    id: char.id,
    name: char.name,
    char,
    handUnits,
    stats: computeItemStats(char, distSlotKey, handUnits, targetLevel, rarity, gameDesign)
  }));

  const groups = groupByStats(entries);

  return groups.map(g => {
    // Usability: chars with effective stats >= this item's required stats
    const usableByIds   = [];
    const usableByNames = [];

    for (const c of allSelectedChars) {
      const cHandUnits = allHandUnitsMap[c.id] ?? 1.0;
      if (canUseItem(c, cHandUnits, g.repChar, g.repHandUnits, distSlotKey, gameDesign)) {
        usableByIds.push(c.id);
        usableByNames.push(c.name);
      }
    }

    return {
      id: crypto.randomUUID(),
      category,
      slot,
      rarity,
      targetLevel,
      stats: g.stats,
      handUnits: g.repHandUnits,
      designedForIds:   g.forIds,
      designedForNames: g.forNames,
      usableByIds,
      usableByNames
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate items for the selected characters.
 *
 * @param {object[]} characters           - all characters in state
 * @param {string[]} selectedCharacterIds - which chars to generate items for
 * @param {number}   targetLevel
 * @param {string[]} rarities             - rarity keys to include
 * @param {object}   gameDesign
 * @returns {object[]} generated item objects
 */
export function generateItemsForCharacters(characters, selectedCharacterIds, targetLevel, rarities, gameDesign) {
  // Only generate items for player characters, not NPCs.
  const selectedChars = characters.filter(c => selectedCharacterIds.includes(c.id) && c.charType !== "npc");
  if (!selectedChars.length) return [];

  const allItems = [];

  for (const rarity of rarities) {
    // ── Equipment ──────────────────────────────────────────────────────────
    for (const slot of EQUIPMENT_SLOTS) {
      const entries = selectedChars.map(c => ({ char: c, handUnits: 1.0 }));
      const huMap   = Object.fromEntries(selectedChars.map(c => [c.id, 1.0]));
      allItems.push(...buildItems(slot, slot, "equipment", entries, selectedChars, huMap, rarity, targetLevel, gameDesign));
    }

    // ── Weapons ────────────────────────────────────────────────────────────
    // Build a map: weaponKey → [{ char, handUnits }]
    const weaponMap = new Map();

    for (const c of selectedChars) {
      if (!c.primaryWeapon) continue;
      const dual          = isDualWield(c);
      const primaryUnits  = dual ? 0.5 : 1.0;

      const pList = weaponMap.get(c.primaryWeapon) ?? [];
      pList.push({ char: c, handUnits: primaryUnits });
      weaponMap.set(c.primaryWeapon, pList);

      if (dual && c.secondaryWeapon) {
        const sList = weaponMap.get(c.secondaryWeapon) ?? [];
        sList.push({ char: c, handUnits: 0.5 });
        weaponMap.set(c.secondaryWeapon, sList);
      }
    }

    for (const [weaponKey, entries] of weaponMap) {
      // Build a handUnits map covering ALL selected chars
      // (chars that don't use this weapon type have handUnits = 0, but
      //  we only check usability for chars that actually use a weapon,
      //  so default to 1.0 for the canUseItem comparison)
      const huMap = Object.fromEntries(
        entries.map(e => [e.char.id, e.handUnits])
      );
      // For chars not in entries (not using this weapon), default to 1.0
      // so the comparison is fair (they'd need their own weapon anyway,
      // but we include them in usability if their sliders >= item's sliders)
      for (const c of selectedChars) {
        huMap[c.id] ??= 1.0;
      }

      allItems.push(...buildItems(
        weaponKey, "weapon", "weapon",
        entries, selectedChars, huMap,
        rarity, targetLevel, gameDesign
      ));
    }

    // ── Accessories ────────────────────────────────────────────────────────
    for (const slot of ACCESSORY_SLOTS) {
      const entries = selectedChars.map(c => ({ char: c, handUnits: 1.0 }));
      const huMap   = Object.fromEntries(selectedChars.map(c => [c.id, 1.0]));
      allItems.push(...buildItems(slot, slot, "accessory", entries, selectedChars, huMap, rarity, targetLevel, gameDesign));
    }
  }

  return allItems;
}
