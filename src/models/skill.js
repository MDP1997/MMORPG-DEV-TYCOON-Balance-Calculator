// src/models/skill.js
// Skill model used by the UI + simulation. Comments in English by request.

export const EFFECT_TYPES = [
  "damage",
  "heal",
  "mana_damage",
  "mana_restore",
  "buff",
  "debuff",
  "control",
  "status",
  "dispel"
];

export const BUFFABLE_STATS = [
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

export const CONTROL_TYPES = ["stun", "silence", "disarm", "blind"];
export const STATUS_TYPES = ["invulnerable", "unbreakable", "immortal"];

export function createDefaultEffectForUI(defaultType = "damage") {
  const base = { id: crypto.randomUUID(), type: defaultType };

  if (defaultType === "damage") {
    return {
      ...base,
      magicPowerPct: 0,
      physicalPowerPct: 0,
      pureDamage: 0,
      damageLifePct: 0,   // extra damage based on target current HP%
      vampLifePct: 0,
      vampManaPct: 0
    };
  }

  if (defaultType === "heal") {
    return {
      ...base,
      magicPowerPct: 0,
      physicalPowerPct: 0,
      pureHeal: 0,
      healLifePct: 0 // based on caster max HP%
    };
  }

  if (defaultType === "mana_damage") {
    return {
      ...base,
      magicPowerPct: 0,
      physicalPowerPct: 0,
      pureManaDamage: 0,
      manaDamagePct: 0 // based on target max mana%
    };
  }

  if (defaultType === "mana_restore") {
    return {
      ...base,
      pureManaRestore: 0,
      manaRestorePct: 0 // based on target max mana%
    };
  }

  if (defaultType === "buff" || defaultType === "debuff") {
    return {
      ...base,
      stat: "Physical Damage",
      pureChange: 0,
      relativeChangePct: 0
    };
  }

  if (defaultType === "control") {
    return {
      ...base,
      controlType: "stun",
      duration: 2
    };
  }

  if (defaultType === "status") {
    return {
      ...base,
      statusType: "invulnerable",
      duration: 2
    };
  }

  if (defaultType === "dispel") {
    return {
      ...base,
      dispelMode: "debuff_only" // "debuff_only" | "buff_only" | "both"
    };
  }

  return base;
}

export function createDefaultTriggerForUI() {
  return {
    id: crypto.randomUUID(),
    triggerType: "instant", // "instant" | "over_time"
    impactType: "magical",  // "magical" | "physical"
    affectsOn: { enemy: true, ally: false, self: false },

    overTime: {
      tickInterval: 2,
      ticks: 1,
      duration: 2,      // derived: tickInterval * ticks
      maxStacks: 1,
      canBeDispelled: true
    },

    effects: [createDefaultEffectForUI("damage")]
  };
}

export function createDefaultSkill() {
  return {
    id: crypto.randomUUID(),
    name: "New Skill",
    requiredLevel: 1,
    cooldown: { value: 1, unit: "seconds" },
    castTime: 0,

    // UI-only (legacy), triggers also have affectsOn which is used by sim
    targetType: "targeted",
    useOn: { enemy: true, ally: false, self: false },

    // Costs
    mpCost: { type: "constant", value: 0 },
    hpCost: { type: "constant", value: 0 },

    triggers: [createDefaultTriggerForUI()]
  };
}
