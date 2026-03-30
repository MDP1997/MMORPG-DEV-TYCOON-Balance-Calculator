// src/models/gameDesign.js
// Global game-design reference values, stat types, and rarity configuration.

// Stat types:
//  "absolute"   - HP, damage, defense. Raw number; reference does not change when max level changes.
//  "percentage" - Crit chance, evade, resist. Reference value IS the max-level percentage; recalculates
//                 linearly so that the value at max level always equals the reference.
export const STAT_TYPE_ABSOLUTE   = "absolute";
export const STAT_TYPE_PERCENTAGE = "percentage";

// Tier percentage arrays (11 values for steps 0–10).
// Each value is a percentage of the reference value at that tier.
const T_DAMAGE   = [  0,  50,  62,  75,  87, 100, 120, 140, 160, 180, 200];
const T_DEFENSE  = [ 50,  60,  70,  80,  90, 100, 140, 180, 220, 260, 300];
const T_HP_P     = [ 50,  60,  70,  80,  90, 100, 110, 120, 130, 140, 150]; // player
const T_HP_N     = [  5,  50,  62,  75,  87, 100, 110, 120, 130, 140, 150]; // NPC
const T_MANA     = [ 50,  60,  70,  80,  90, 100, 120, 140, 160, 180, 200];
const T_CRIT_CH  = [  0,  20,  40,  60,  80, 100, 120, 140, 160, 180, 200];
const T_CRIT_DMG = [  5,  20,  40,  60,  80, 100, 160, 220, 280, 340, 400];
const T_DODGE    = [  0,  20,  40,  60,  80, 100, 140, 180, 220, 260, 300];

// Default reference values (at tier 5 / max level) and their type.
// tierPcts:       percentage array for players.
// npcTierPcts:    percentage array for NPCs (only when different from players).
// noLevelScaling: if true the value is constant regardless of level.
// autoCalc:       if true the stat is hidden from the builder sliders.
export const DEFAULT_STAT_REFS = {
  "HP":               { value: 50000, type: STAT_TYPE_ABSOLUTE,   tierPcts: T_HP_P,     npcTierPcts: T_HP_N  },
  "Mana":             { value: 5000,  type: STAT_TYPE_ABSOLUTE,   tierPcts: T_MANA                           },
  "Physical Damage":  { value: 5000,  type: STAT_TYPE_ABSOLUTE,   tierPcts: T_DAMAGE                         },
  "Magical Damage":   { value: 5000,  type: STAT_TYPE_ABSOLUTE,   tierPcts: T_DAMAGE                         },
  "Physical Defense": { value: 2500,  type: STAT_TYPE_ABSOLUTE,   tierPcts: T_DEFENSE                        },
  "Magical Defense":  { value: 2500,  type: STAT_TYPE_ABSOLUTE,   tierPcts: T_DEFENSE                        },
  "Crit Chance":      { value: 25,    type: STAT_TYPE_PERCENTAGE, tierPcts: T_CRIT_CH                        },
  "Crit Damage":      { value: 100,   type: STAT_TYPE_PERCENTAGE, tierPcts: T_CRIT_DMG, noLevelScaling: true },
  "Evade":            { value: 25,    type: STAT_TYPE_PERCENTAGE, tierPcts: T_DODGE                          },
  "Resist":           { value: 25,    type: STAT_TYPE_PERCENTAGE, tierPcts: T_DODGE                          },
  "HP Regen":         { value: 500,   type: STAT_TYPE_ABSOLUTE,   autoCalc: true                             },
  "Mana Regen":       { value: 200,   type: STAT_TYPE_ABSOLUTE,   autoCalc: true                             }
};

export const DEFAULT_MAX_LEVEL = 50;

// ── Stat distribution table ───────────────────────────────────────────────────
// For each item slot, what % of each stat comes from that slot.
// Per-stat columns must sum to 100.

export const DISTRIBUTION_SLOTS = [
  "helmet", "chest", "gloves", "pants", "boots",
  "weapon", "ring1", "ring2", "necklace"
];

// Stat keys in order (must match character.js STAT_KEYS)
const DS = ["HP","Mana","Physical Damage","Magical Damage","Physical Defense","Magical Defense","Crit Chance","Crit Damage","Evade","Resist","HP Regen","Mana Regen"];

function dist(hp,mn,pd,md,pdef,mdef,cc,cd,ev,re,hpr,mnr) {
  return { "HP":hp,"Mana":mn,"Physical Damage":pd,"Magical Damage":md,"Physical Defense":pdef,"Magical Defense":mdef,"Crit Chance":cc,"Crit Damage":cd,"Evade":ev,"Resist":re,"HP Regen":hpr,"Mana Regen":mnr };
}

export const DEFAULT_STAT_DISTRIBUTION = {
  //          HP  Mn  PDmg MDmg PDef MDef  CC  CD  Ev  Re HPR MnR
  helmet:   dist(20,  0,   0,   0,  15,  15,   0,  0,  5, 10, 20,  0),
  chest:    dist(30,  0,   0,   0,  25,  25,   0,  0,  5, 10, 30,  0),
  gloves:   dist(10,  0,  10,  10,  10,  10,  20, 20, 10,  5, 10, 10),
  pants:    dist(20,  0,   0,   0,  20,  20,   0,  0, 20, 15, 20,  0),
  boots:    dist(10,  0,   0,   0,  10,  10,   0,  0, 30, 10, 10,  0),
  weapon:   dist( 0, 20,  60,  60,   0,   0,  40, 40,  0,  0,  0, 40),
  ring1:    dist( 5, 20,  15,  15,  10,  10,  20, 20, 15, 25,  5, 25),
  ring2:    dist( 5, 20,  15,  15,  10,  10,  20, 20, 15, 25,  5, 25),
  necklace: dist( 0, 40,   0,   0,   0,   0,   0,  0,  0,  0,  0,  0),
};
// Verify: each stat column sums to 100 (validated at definition).

// Default rarity tiers — each has a key, display label, color, and quality (100 = ×1.0).
export const DEFAULT_RARITIES = [
  { key: "common",    label: "Common",    color: "#b0b0b0", quality: 100 },
  { key: "uncommon",  label: "Uncommon",  color: "#4fc66a", quality: 105 },
  { key: "rare",      label: "Rare",      color: "#4a9eff", quality: 110 },
  { key: "elite",     label: "Elite",     color: "#c77dff", quality: 120 },
  { key: "legendary", label: "Legendary", color: "#ffaa00", quality: 150 },
];

// Kept for backward compat — derived from DEFAULT_RARITIES.
export const RARITY_LEVELS = DEFAULT_RARITIES.map(r => ({ key: r.key, multiplier: r.quality / 100 }));

/**
 * Return the effective max-level denominator for a stat.
 * Absolute stats always use DEFAULT_MAX_LEVEL so their value at a given level
 * doesn't change when the designer adjusts maxLevel. Percentage stats scale
 * with the current maxLevel so they always reach refValue at max level.
 */
export function effectiveMaxLevel(statName, gameDesign) {
  const type = DEFAULT_STAT_REFS[statName]?.type ?? STAT_TYPE_ABSOLUTE;
  return type === STAT_TYPE_ABSOLUTE
    ? DEFAULT_MAX_LEVEL
    : Number(gameDesign?.maxLevel ?? DEFAULT_MAX_LEVEL);
}

/**
 * Return the rarity multiplier for a given key.
 * Accepts an optional rarities array (from gameDesign.rarities); falls back to DEFAULT_RARITIES.
 */
export function getRarityMultiplier(rarityKey, rarities) {
  const list = rarities ?? DEFAULT_RARITIES;
  return (list.find(r => r.key === rarityKey)?.quality ?? 100) / 100;
}

/** Create a fresh game-design config with all defaults filled in. */
export function createDefaultGameDesign() {
  return {
    maxLevel: DEFAULT_MAX_LEVEL,
    statRefs: JSON.parse(JSON.stringify(DEFAULT_STAT_REFS)),
    statDistribution: JSON.parse(JSON.stringify(DEFAULT_STAT_DISTRIBUTION)),
    rarities: JSON.parse(JSON.stringify(DEFAULT_RARITIES))
  };
}

/**
 * Mutates `gd` in place, filling in any missing fields with defaults.
 * Safe to call on partially-saved objects from localStorage.
 */
export function ensureGameDesign(gd) {
  gd.maxLevel ??= DEFAULT_MAX_LEVEL;
  gd.statRefs ??= {};
  for (const [stat, def] of Object.entries(DEFAULT_STAT_REFS)) {
    gd.statRefs[stat] ??= { ...def };
    gd.statRefs[stat].value          ??= def.value;
    gd.statRefs[stat].type           ??= def.type;
    gd.statRefs[stat].tierPcts       ??= def.tierPcts       ?? null;
    gd.statRefs[stat].npcTierPcts    ??= def.npcTierPcts    ?? null;
    gd.statRefs[stat].noLevelScaling ??= def.noLevelScaling ?? false;
    gd.statRefs[stat].autoCalc       ??= def.autoCalc       ?? false;
  }
  gd.statDistribution ??= {};
  for (const slot of DISTRIBUTION_SLOTS) {
    gd.statDistribution[slot] ??= {};
    const def = DEFAULT_STAT_DISTRIBUTION[slot];
    for (const stat of DS) {
      gd.statDistribution[slot][stat] ??= def[stat] ?? 0;
    }
  }
  // Migrate: ensure rarities array exists and each entry has required fields.
  if (!gd.rarities || !Array.isArray(gd.rarities) || gd.rarities.length === 0) {
    gd.rarities = JSON.parse(JSON.stringify(DEFAULT_RARITIES));
  }
  for (const r of gd.rarities) {
    r.label   ??= r.key;
    r.color   ??= "#aaaaaa";
    r.quality ??= 100;
  }
}
