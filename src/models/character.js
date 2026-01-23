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
  "HP Regen",
  "Mana Regen"
];

function createDefaultStats() {
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = { base: 0, scaling: 0 };
  return stats;
}

export function createCharacter() {
  const id = crypto.randomUUID();
  return {
    id,
    name: "New Character",
    level: 1,
    stats: createDefaultStats(),
    skills: []
  };
}
