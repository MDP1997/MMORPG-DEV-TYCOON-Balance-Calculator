// src/services/calc.js
// Stat calculation formula.
//
// Default (legacy): sliderPct = step * 20 / 100  →  step 0..10 maps to 0%..200%
// With per-stat tiers: sliderPct = tierPcts[step] / 100
//
// noLevelScaling = true  →  stat is constant regardless of level (e.g. Crit Damage)
// autoCalc       = true  →  stat is not user-configurable (hidden from sliders)
//
// effectiveMaxLevel depends on stat type:
//   absolute  → always DEFAULT_MAX_LEVEL (50) so values don't shift when maxLevel changes
//   percentage → current gameDesign.maxLevel

import { getRarityMultiplier, effectiveMaxLevel } from "../models/gameDesign.js";

/**
 * Core stat formula.
 * @param {number}   refValue        Reference value at max level / tier 5.
 * @param {number}   level           Current character level.
 * @param {number}   maxLevel        Effective max level for this stat.
 * @param {number}   step            Tier step 0–10.
 * @param {number}   rarityMultiplier Rarity quality factor (1.0 = common).
 * @param {number[]|null} tierPcts   11-element array of percentages (0–10). If null, uses step×20.
 * @param {boolean}  noLevelScaling  If true, level does not affect the value.
 */
export function calculateStat(refValue, level, maxLevel, step, rarityMultiplier = 1.0, tierPcts = null, noLevelScaling = false) {
  const clampedStep = Math.max(0, Math.min(10, Math.round(step)));
  const sliderPct   = tierPcts ? tierPcts[clampedStep] / 100 : (clampedStep * 20) / 100;
  const levelRatio  = noLevelScaling ? 1 : level / Math.max(1, maxLevel);
  return refValue * levelRatio * sliderPct * rarityMultiplier;
}
