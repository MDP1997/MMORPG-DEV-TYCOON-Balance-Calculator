// src/models/character.js
// Character model + default stats. Comments in English by request.

export const STAT_KEYS = [
  "HP",
  "Mana",
  "Physical Damage",
  "Magical Damage",
  "Physical Defense",
  "Magical Defense",
  "Crit Chance",
  "Crit Damage",
  "Evade",
  "Resist",
  "Movement Speed",
  "HP Regen",
  "Mana Regen"
];

// ── Weapon definitions ────────────────────────────────────────────────────────

export const WEAPON_KEYS_1H = ["sword", "shield", "axe", "dagger", "mace", "hammer"];
export const WEAPON_KEYS_2H = ["staff", "bow", "crossbow", "spear", "2h_sword"];
export const ALL_WEAPON_KEYS = [...WEAPON_KEYS_1H, ...WEAPON_KEYS_2H];

// ── Stats ─────────────────────────────────────────────────────────────────────

// Each stat stores a slider step (0–10).
// Step 5 = 100% of the reference value for that stat.
// Each step represents 20%, so the range is 0%–200%.
function createDefaultStats() {
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = { step: 5 };
  return stats;
}

export function createCharacter() {
  const id = crypto.randomUUID();
  return {
    id,
    name: "New Character",
    level: 1,
    rarity: "common",
    charType: "player",    // "player" | "npc"
    stats: createDefaultStats(),
    skills: [],
    // Weapon loadout
    primaryWeapon: null,   // weapon key or null
    secondaryWeapon: null  // 1H weapon key or null (null = single / 2H)
  };
}

/**
 * Migrate an older character (stats stored as { base, scaling }) to the new
 * step-based format in place. No-op if already migrated.
 */
export function migrateCharacterStats(character) {
  for (const k of STAT_KEYS) {
    const s = character.stats?.[k];
    if (!s) {
      character.stats ??= {};
      character.stats[k] = { step: 5 };
    } else if (s.step === undefined && (s.base !== undefined || s.scaling !== undefined)) {
      // Old format detected — use step 5 (100%) as a neutral default.
      character.stats[k] = { step: 5 };
    }
  }
  character.rarity ??= "common";
  character.charType ??= "player";
  character.primaryWeapon  ??= null;
  character.secondaryWeapon ??= null;
}
