// src/sim/engine.js
// Battle simulation engine with typed logs + better AI + status/control rules + costs + buffs affecting stats.
// Comments in English by request.

import { calculateStat } from "../services/calc.js";

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function scaledStat(character, statName) {
  const st = character.stats?.[statName];
  if (!st) return 0;
  return calculateStat(Number(st.base || 0), Number(st.scaling || 0), character.level);
}

function rollChance(pct, rng) {
  const p = clamp(Number(pct || 0), 0, 100) / 100;
  return rng() < p;
}

function secondsFromCooldown(skill) {
  const v = Number(skill.cooldown?.value || 0);
  const unit = skill.cooldown?.unit || "seconds";
  return unit === "minutes" ? v * 60 : v;
}

function effectLabel(e) {
  if (!e) return "";
  if (e.type === "buff" || e.type === "debuff") {
    const sign = e.type === "buff" ? "+" : "-";
    const flat = Number(e.pureChange || 0);
    const rel = Number(e.relativeChangePct || 0);
    if (rel) return `${e.type} ${e.stat} ${sign}${rel}%`;
    if (flat) return `${e.type} ${e.stat} ${sign}${flat}`;
    return `${e.type} ${e.stat}`;
  }
  if (e.type === "control") return `control ${e.controlType}`;
  if (e.type === "status") return `status ${e.statusType}`;
  if (e.type === "dispel") return `dispel ${e.dispelMode}`;
  return e.type;
}

function buildCombatant(ch) {
  const maxHp = scaledStat(ch, "HP");
  const maxMana = scaledStat(ch, "Mana");

  return {
    id: ch.id,
    name: ch.name,
    level: ch.level,
    skills: ch.skills || [],

    maxHp,
    hp: maxHp,
    maxMana,
    mana: maxMana,

    // Active effect instances with expiresAt
    activeEffects: [],

    _raw: ch
  };
}

function getActiveEffects(combatant, now) {
  combatant.activeEffects = (combatant.activeEffects || []).filter(x => x.expiresAt > now);
  return combatant.activeEffects;
}

function hasControl(combatant, now, type) {
  return getActiveEffects(combatant, now).some(e => e.type === "control" && e.controlType === type);
}

function hasStatus(combatant, now, type) {
  return getActiveEffects(combatant, now).some(e => e.type === "status" && e.statusType === type);
}

function isStunned(combatant, now) {
  // unbreakable => immune to stun
  if (hasStatus(combatant, now, "unbreakable")) return false;
  return hasControl(combatant, now, "stun");
}

function isSilenced(combatant, now) { return hasControl(combatant, now, "silence"); }
function isDisarmed(combatant, now) { return hasControl(combatant, now, "disarm"); }
function isBlinded(combatant, now) { return hasControl(combatant, now, "blind"); }

/**
 * Returns effective stat after applying active buff/debuff stacks.
 * Relative change is interpreted as "relative to base", additive per stack:
 * base=100, 2 stacks of -10% => 100 - (100*0.10) - (100*0.10) = 80.
 */
function effectiveStat(combatant, statName, now) {
  const base = Number(scaledStat(combatant._raw, statName) || 0);
  const effects = getActiveEffects(combatant, now).filter(e =>
    (e.type === "buff" || e.type === "debuff") && e.stat === statName
  );

  if (!effects.length) return base;

  let pureSum = 0;
  let relPctSum = 0;

  for (const e of effects) {
    const sign = e.type === "buff" ? 1 : -1;
    pureSum += sign * Number(e.pureChange || 0);
    relPctSum += sign * Number(e.relativeChangePct || 0);
  }

  const withRel = base + (base * (relPctSum / 100));
  const withPure = withRel + pureSum;

  return Math.max(0, withPure);
}

function critMultiplier(attacker, now) {
  // Stored as 150 => 1.5x
  const cd = effectiveStat(attacker, "Crit Damage", now);
  const m = cd > 0 ? cd / 100 : 1;
  return Math.max(1, m);
}

function activeSummaryText(defender, now) {
  const list = getActiveEffects(defender, now);
  const buffs = list.filter(x => x.type === "buff").map(effectLabel);
  const debuffs = list.filter(x => x.type === "debuff").map(effectLabel);

  // We only show buff/debuff in damage/heal lines (as requested)
  const parts = [];
  if (buffs.length) parts.push(`buffs: ${buffs.join(", ")}`);
  if (debuffs.length) parts.push(`debuffs: ${debuffs.join(", ")}`);
  return parts.length ? " | " + parts.join(" | ") : "";
}

function addRow(ctx, kind, targetSide, text) {
  ctx.rows.push({
    t: ctx.now,
    kind, // "damage" | "crit" | "dot_damage" | "heal" | "buff" | "debuff" | "dispel" | "hp_regen" | "mana_regen" | "info"
    a: targetSide === "A" ? text : "",
    b: targetSide === "B" ? text : ""
  });
}

function hitAvoided(defender, impactType, now, rng) {
  const evade = clamp(effectiveStat(defender, "Evade", now), 0, 100);
  const resist = clamp(effectiveStat(defender, "Resist", now), 0, 100);
  return (impactType === "physical") ? rollChance(evade, rng) : rollChance(resist, rng);
}

function baseAttackFromEffect(caster, now, impactType, effect) {
  const mag = effectiveStat(caster, "Magical Damage", now);
  const phys = effectiveStat(caster, "Physical Damage", now);

  const base = (impactType === "magical")
    ? mag * (Number(effect.magicPowerPct || 0) / 100)
    : phys * (Number(effect.physicalPowerPct || 0) / 100);

  return base;
}

// Life% bonus damage: based on target MAX HP.
// IMPORTANT: cap is on the PERCENT (0..100%), NOT "100 damage".
function lifePctBonusDamage(target, pct) {
  const p = clamp(Number(pct || 0), 0, 100);
  if (p <= 0) return 0;
  return Number(target.maxHp || 0) * (p / 100);
}

function currentSkillTag(ctx) {
  return ctx._currentSkillName ? ` (${ctx._currentSkillName})` : "";
}

/**
 * Apply HP damage and log with correct kind.
 * - If isDot is true, logs as "dot_damage" (light red in UI).
 * - If crit and not dot, logs as "crit" (purple in UI).
 * - Immortal caps HP to minimum 1 but we log the actual applied damage.
 */
function applyDamage(ctx, attacker, defender, baseDamage, impactType, defenderSide, isDot = false) {
  if (hitAvoided(defender, impactType, ctx.now, ctx.rng)) {
    addRow(ctx, "info", defenderSide, `avoided (${impactType})`);
    return { dealt: 0, avoided: true, crit: false };
  }

  const defName = impactType === "physical" ? "Physical Defense" : "Magical Defense";
  const defEffective = effectiveStat(defender, defName, ctx.now);
  const defBase = scaledStat(defender._raw, defName);
  const defDelta = defEffective - defBase;

  let dealt = Number(baseDamage || 0) - Number(defEffective || 0);
  if (dealt <= 0) dealt = 1;

  const critChance = clamp(effectiveStat(attacker, "Crit Chance", ctx.now), 0, 100);
  const isCrit = rollChance(critChance, ctx.rng);
  const mult = isCrit ? critMultiplier(attacker, ctx.now) : 1;
  dealt = dealt * mult;

  // invulnerable => 0 damage
  if (hasStatus(defender, ctx.now, "invulnerable")) dealt = 0;

  // immortal => HP can't go below 1
  const immortal = hasStatus(defender, ctx.now, "immortal");

  const before = defender.hp;
  const newHp = defender.hp - dealt;
  defender.hp = immortal ? Math.max(1, newHp) : Math.max(0, newHp);

  const applied = Math.max(0, before - defender.hp);

  const extraText =
    defDelta !== 0
      ? ` | def ${defDelta > 0 ? "+" : ""}${Math.round(defDelta)}`
      : "";

  const kind = isDot ? "dot_damage" : (isCrit ? "crit" : "damage");

  addRow(
    ctx,
    kind,
    defenderSide,
    `${attacker.name}${currentSkillTag(ctx)} hits ${Math.round(applied)} ${impactType}${isCrit ? " CRIT" : ""}${extraText} | HP ${Math.round(before)}→${Math.round(defender.hp)}${activeSummaryText(defender, ctx.now)}`
  );

  return { dealt: applied, avoided: false, crit: isCrit };
}

function applyVamp(ctx, attacker, dealtDamage, vampLifePct, vampManaPct, attackerSide) {
  const healHp = dealtDamage * (Number(vampLifePct || 0) / 100);
  const healMana = dealtDamage * (Number(vampManaPct || 0) / 100);

  if (healHp > 0) {
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healHp);
    addRow(ctx, "heal", attackerSide, `${attacker.name} vamp HP +${Math.round(attacker.hp - before)} | HP ${Math.round(before)}→${Math.round(attacker.hp)}`);
  }
  if (healMana > 0) {
    const before = attacker.mana;
    attacker.mana = Math.min(attacker.maxMana, attacker.mana + healMana);
    addRow(ctx, "heal", attackerSide, `${attacker.name} vamp Mana +${Math.round(attacker.mana - before)} | Mana ${Math.round(before)}→${Math.round(attacker.mana)}`);
  }
}

function applyHeal(ctx, caster, target, amount, targetSide, isDot = false) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  addRow(ctx, "heal", targetSide, `${caster.name}${currentSkillTag(ctx)} heals +${Math.round(target.hp - before)} | HP ${Math.round(before)}→${Math.round(target.hp)}${activeSummaryText(target, ctx.now)}`);
}

function applyManaRestore(ctx, caster, target, amount, targetSide, isDot = false) {
  const before = target.mana;
  target.mana = Math.min(target.maxMana, target.mana + amount);
  addRow(ctx, "heal", targetSide, `${caster.name}${currentSkillTag(ctx)} restores Mana +${Math.round(target.mana - before)} | Mana ${Math.round(before)}→${Math.round(target.mana)}`);
}

function applyManaDamage(ctx, caster, target, amount, impactType, targetSide, isDot = false) {
  if (hitAvoided(target, impactType, ctx.now, ctx.rng)) {
    addRow(ctx, "info", targetSide, `mana avoided (${impactType})`);
    return;
  }
  const before = target.mana;
  target.mana = Math.max(0, target.mana - amount);

  addRow(
    ctx,
    "damage",
    targetSide,
    `${caster.name}${currentSkillTag(ctx)} mana damage ${Math.round(amount)} | Mana ${Math.round(before)}→${Math.round(target.mana)}${activeSummaryText(target, ctx.now)}`
  );
}

function applyEffectInstance(ctx, target, effect, duration, maxStacks, sourceKey = "") {
  const key =
    (effect.type === "buff" || effect.type === "debuff") ? `${effect.type}:${effect.stat}:${sourceKey}` :
    effect.type === "control" ? `${effect.type}:${effect.controlType}:${sourceKey}` :
    effect.type === "status" ? `${effect.type}:${effect.statusType}:${sourceKey}` :
    `${effect.type}:${sourceKey}`;

  const now = ctx.now;
  target.activeEffects = (target.activeEffects || []).filter(x => x.expiresAt > now);

  const same = target.activeEffects.filter(x => x._key === key);
  const ms = Math.max(1, Number(maxStacks || 1));

  if (same.length >= ms) {
    same.sort((a, b) => a.expiresAt - b.expiresAt);
    const oldest = same[0];
    const idx = target.activeEffects.indexOf(oldest);
    if (idx >= 0) target.activeEffects.splice(idx, 1);
  }

  target.activeEffects.push({
    ...JSON.parse(JSON.stringify(effect)),
    _key: key,
    appliedAt: now,
    expiresAt: now + Math.max(0, Number(duration || 0))
  });
}

function dispelTarget(ctx, caster, target, effect, targetSide) {
  const mode = effect.dispelMode || "debuff_only";
  const before = (target.activeEffects || []).length;

  if (mode === "both") {
    target.activeEffects = (target.activeEffects || []).filter(e => !(e.type === "buff" || e.type === "debuff" || e.type === "control"));
  } else if (mode === "buff_only") {
    target.activeEffects = (target.activeEffects || []).filter(e => e.type !== "buff");
  } else {
    target.activeEffects = (target.activeEffects || []).filter(e => !(e.type === "debuff" || e.type === "control"));
  }

  const removed = Math.max(0, before - (target.activeEffects || []).length);
  addRow(ctx, "dispel", targetSide, `${caster.name}${currentSkillTag(ctx)} dispels (${mode}) removed ${removed}`);
}

function resolveInstantEffect(ctx, caster, target, trigger, effect, sides) {
  const impactType = trigger.impactType || "magical";
  const casterSide = sides.attackerSide;
  const targetSide = sides.defenderSide;

  const isDot = !!trigger._isDot;

  if (effect.type === "damage") {
    const base = baseAttackFromEffect(caster, ctx.now, impactType, effect);
    const pure = Number(effect.pureDamage || 0);

    const lifePct = Number(effect.damageLifePct || 0);
    const extraLife = lifePctBonusDamage(target, lifePct);

    const total = base + pure + extraLife;

    const res = applyDamage(ctx, caster, target, total, impactType, targetSide, isDot);

    if (res.dealt > 0) {
      applyVamp(ctx, caster, res.dealt, effect.vampLifePct, effect.vampManaPct, casterSide);
    }
    return;
  }

  if (effect.type === "heal") {
    const base = baseAttackFromEffect(caster, ctx.now, impactType, effect);
    const pure = Number(effect.pureHeal || 0);

    // Heal % of target MAX HP (clamped to 0..100%)
    const lifePct = clamp(Number(effect.healLifePct || 0), 0, 100);
    const extraLife = (lifePct > 0) ? (Number(target.maxHp || 0) * (lifePct / 100)) : 0;

    applyHeal(ctx, caster, target, base + pure + extraLife, targetSide, isDot);
    return;
  }

  if (effect.type === "mana_restore") {
    const pure = Number(effect.pureManaRestore || 0);
    const pct = Number(effect.manaRestorePct || 0) / 100;
    const amount = pure + (target.maxMana * pct);
    applyManaRestore(ctx, caster, target, amount, targetSide, isDot);
    return;
  }

  if (effect.type === "mana_damage") {
    const base = baseAttackFromEffect(caster, ctx.now, impactType, effect);
    const pure = Number(effect.pureManaDamage || 0);
    const pct = Number(effect.manaDamagePct || 0) / 100;
    const amount = base + pure + (target.maxMana * pct);
    applyManaDamage(ctx, caster, target, amount, impactType, targetSide, isDot);
    return;
  }

  if (effect.type === "buff" || effect.type === "debuff" || effect.type === "control" || effect.type === "status") {
    const duration =
      Number(effect.duration || 0) ||
      Number(trigger?.overTime?.duration || 0) ||
      0;

    const sourceKey = trigger?._sourceKey || "";
    applyEffectInstance(ctx, target, effect, duration, 1, sourceKey);

    const kind =
      effect.type === "buff" ? "buff" :
      effect.type === "debuff" ? "debuff" :
      "info";

    addRow(ctx, kind, targetSide, `${caster.name}${currentSkillTag(ctx)} applies ${effectLabel(effect)} (${Math.round(duration)}s)`);
    return;
  }

  if (effect.type === "dispel") {
    dispelTarget(ctx, caster, target, effect, targetSide);
    return;
  }
}

function enqueueOverTime(ctx, caster, target, trigger, effect, sides) {
  const interval = Math.max(0, Number(trigger.overTime?.tickInterval || 0));
  const ticks = Math.max(1, Math.floor(Number(trigger.overTime?.ticks || 1)));
  const maxStacks = Math.max(1, Number(trigger.overTime?.maxStacks || 1));

  const computedDuration = interval * ticks;
  const duration = Number(trigger.overTime?.duration || 0) || computedDuration;

  ctx.dotQueue.push({
    casterId: caster.id,
    targetId: target.id,
    sides,
    impactType: trigger.impactType || "magical",
    effect: JSON.parse(JSON.stringify(effect)),
    nextTick: ctx.now + interval,
    interval,
    remainingTicks: ticks,
    duration,
    maxStacks,
    skillName: ctx._currentSkillName || ""
  });

  addRow(ctx, "info", sides.defenderSide, `OT queued: ${effectLabel(effect)} x${ticks} every ${interval}s (dur ${Math.round(duration)}s)`);
}

function processDotQueue(ctx, A, B) {
  for (let i = ctx.dotQueue.length - 1; i >= 0; i--) {
    const it = ctx.dotQueue[i];
    if (it.nextTick > ctx.now) continue;

    const caster = it.casterId === A.id ? A : (it.casterId === B.id ? B : null);
    const target = it.targetId === A.id ? A : (it.targetId === B.id ? B : null);
    if (!caster || !target) {
      ctx.dotQueue.splice(i, 1);
      continue;
    }

    const prevSkill = ctx._currentSkillName;
    ctx._currentSkillName = it.skillName || prevSkill || null;

    const effect = it.effect;

    // Over-time ticks should ONLY handle ticking effects (damage/heal/mana...).
    // Non-ticking effects are applied immediately at cast time (see applySkill()).
    resolveInstantEffect(ctx, caster, target, { impactType: it.impactType, _isDot: true }, effect, it.sides);

    ctx._currentSkillName = prevSkill;

    it.remainingTicks -= 1;
    if (it.remainingTicks <= 0) ctx.dotQueue.splice(i, 1);
    else it.nextTick += it.interval;
  }
}

function costAmount(skillCost, maxValue) {
  const v = Number(skillCost?.value || 0);
  const type = skillCost?.type || "constant";
  if (v <= 0) return 0;
  if (type === "percent") return maxValue * (v / 100);
  return v;
}

function canPayCosts(attacker, skill) {
  const mpNeed = costAmount(skill.mpCost, attacker.maxMana);
  const hpNeed = costAmount(skill.hpCost, attacker.maxHp);
  return attacker.mana >= mpNeed && attacker.hp >= hpNeed;
}

function payCosts(ctx, attacker, skill, attackerSide) {
  const mpNeed = costAmount(skill.mpCost, attacker.maxMana);
  const hpNeed = costAmount(skill.hpCost, attacker.maxHp);

  if (mpNeed > 0) {
    const before = attacker.mana;
    attacker.mana = Math.max(0, attacker.mana - mpNeed);
    addRow(ctx, "info", attackerSide, `${attacker.name} pays Mana ${Math.round(mpNeed)} | Mana ${Math.round(before)}→${Math.round(attacker.mana)}`);
  }
  if (hpNeed > 0) {
    const before = attacker.hp;
    attacker.hp = Math.max(0, attacker.hp - hpNeed);
    addRow(ctx, "info", attackerSide, `${attacker.name} pays HP ${Math.round(hpNeed)} | HP ${Math.round(before)}→${Math.round(attacker.hp)}`);
  }
}

function skillHasOffensiveMagic(skill) {
  for (const tr of (skill.triggers || [])) {
    if (tr.impactType !== "magical") continue;
    for (const ef of (tr.effects || [])) {
      if (ef.type === "damage" || ef.type === "mana_damage") return true;
    }
  }
  return false;
}

function skillHasOffensivePhysical(skill) {
  for (const tr of (skill.triggers || [])) {
    if (tr.impactType !== "physical") continue;
    for (const ef of (tr.effects || [])) {
      if (ef.type === "damage" || ef.type === "mana_damage") return true;
    }
  }
  return false;
}

/**
 * Skill scoring with better weights.
 * Updated: includes damageLifePct, healLifePct estimation and over_time tick approximation.
 */
function estimateSkillScore(attacker, defender, now, skill) {
  const missingHpRatio = attacker.maxHp > 0 ? (1 - attacker.hp / attacker.maxHp) : 0;
  const missingManaRatio = attacker.maxMana > 0 ? (1 - attacker.mana / attacker.maxMana) : 0;

  const hasNeg = getActiveEffects(attacker, now).some(e => e.type === "debuff" || e.type === "control");

  let score = 0;

  for (const tr of (skill.triggers || [])) {
    const targets = [];
    if (tr.affectsOn?.self) targets.push({ target: attacker, isSelf: true });
    if (tr.affectsOn?.enemy) targets.push({ target: defender, isSelf: false });

    for (const tgt of targets) {
      for (const ef of (tr.effects || [])) {
        const isOverTime = tr.triggerType === "over_time";
        const ticks = Math.max(1, Math.floor(Number(tr.overTime?.ticks || 1)));

        if (ef.type === "damage") {
          const base = baseAttackFromEffect(attacker, now, tr.impactType || "magical", ef);
          const pure = Number(ef.pureDamage || 0);
          const lifeExtra = lifePctBonusDamage(tgt.target, ef.damageLifePct || 0);
          const oneHit = base + pure + lifeExtra;

          score += isOverTime ? oneHit * ticks : oneHit;
        }

        if (ef.type === "mana_damage") {
          const base = baseAttackFromEffect(attacker, now, tr.impactType || "magical", ef);
          const oneHit = 0.25 * (base + Number(ef.pureManaDamage || 0));
          score += isOverTime ? oneHit * ticks : oneHit;
        }

        if (ef.type === "heal") {
          const base = baseAttackFromEffect(attacker, now, tr.impactType || "magical", ef);
          const pure = Number(ef.pureHeal || 0);
          const lifePct = clamp(Number(ef.healLifePct || 0), 0, 100);
          const extraLife = (lifePct > 0) ? (tgt.target.maxHp * (lifePct / 100)) : 0;
          const amount = base + pure + extraLife;

          const w = (1 + 4 * missingHpRatio);
          const one = amount * w;

          score += isOverTime ? one * ticks : one;
        }

        if (ef.type === "mana_restore") {
          const pure = Number(ef.pureManaRestore || 0);
          const pct = Number(ef.manaRestorePct || 0) / 100;
          const amount = pure + (tgt.target.maxMana * pct);
          const w = (1 + 2 * missingManaRatio);
          const one = amount * w;

          score += isOverTime ? one * ticks : one;
        }

        if (ef.type === "buff" || ef.type === "debuff") {
          // Buff/debuff is applied once even if trigger is over_time (by design).
          const key = `${ef.type}:${ef.stat}`;
          const already = getActiveEffects(tgt.target, now).some(x => x._key?.startsWith(key));
          const baseBonus = already ? 10 : 250;
          const urgency = tgt.isSelf ? (50 * missingHpRatio) : 10;
          score += baseBonus + urgency;
        }

        if (ef.type === "control" || ef.type === "status") {
          const key = ef.type === "control" ? `control:${ef.controlType}` : `status:${ef.statusType}`;
          const already = getActiveEffects(tgt.target, now).some(x => x._key?.startsWith(key));
          score += already ? 5 : 180;
        }

        if (ef.type === "dispel") {
          score += hasNeg ? 220 : 5;
        }
      }
    }
  }

  if (missingHpRatio > 0.5) score += 100;

  return score;
}

function pickBestSkill(attacker, defender, now, cooldowns) {
  const usable = (attacker.skills || []).filter((s) => {
    const req = Number(s.requiredLevel || 1);
    if (attacker.level < req) return false;

    const readyAt = cooldowns.get(s.id) || 0;
    if (now < readyAt) return false;

    if (!canPayCosts(attacker, s)) return false;

    if (isSilenced(attacker, now) && skillHasOffensiveMagic(s)) return false;
    if (isDisarmed(attacker, now) && skillHasOffensivePhysical(s)) return false;

    return true;
  });

  if (usable.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const s of usable) {
    const score = estimateSkillScore(attacker, defender, now, s);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function applyRegenTick(ctx, combatant, side) {
  const hpRegen = Math.max(0, effectiveStat(combatant, "HP Regen", ctx.now));
  const manaRegen = Math.max(0, effectiveStat(combatant, "Mana Regen", ctx.now));

  if (hpRegen > 0) {
    const before = combatant.hp;
    combatant.hp = Math.min(combatant.maxHp, combatant.hp + hpRegen);
    const gained = Math.round(combatant.hp - before);
    if (gained > 0) addRow(ctx, "hp_regen", side, `${combatant.name} regen HP +${gained} | HP ${Math.round(before)}→${Math.round(combatant.hp)}`);
  }

  if (manaRegen > 0) {
    const before = combatant.mana;
    combatant.mana = Math.min(combatant.maxMana, combatant.mana + manaRegen);
    const gained = Math.round(combatant.mana - before);
    if (gained > 0) addRow(ctx, "mana_regen", side, `${combatant.name} regen Mana +${gained} | Mana ${Math.round(before)}→${Math.round(combatant.mana)}`);
  }
}

function applySkill(ctx, attacker, defender, skill, sides) {
  if (isBlinded(attacker, ctx.now) && rollChance(50, ctx.rng)) {
    addRow(ctx, "info", sides.attackerSide, `${attacker.name} failed (blind) using ${skill.name}`);
    return;
  }

  payCosts(ctx, attacker, skill, sides.attackerSide);
  addRow(ctx, "info", sides.attackerSide, `USE: ${skill.name}`);

  ctx._currentSkillName = skill.name;

  const castKey = `${attacker.id}:${skill.id}:${ctx.now}:${Math.floor(ctx.rng() * 1e9)}`;

  for (const tr of (skill.triggers || [])) {
    const targets = [];
    if (tr.affectsOn?.self) targets.push({ target: attacker, side: sides.attackerSide, isSelf: true });
    if (tr.affectsOn?.enemy) targets.push({ target: defender, side: sides.defenderSide, isSelf: false });
    if (!targets.length) continue;

    const triggerWithSource = { ...tr, _sourceKey: castKey };

    for (const { target, side } of targets) {
      const localSides = { attackerSide: sides.attackerSide, defenderSide: side };

      // IMPORTANT CHANGE:
      // - For over_time triggers:
      //   - ticking effects (damage/heal/mana_damage/mana_restore/dispel) are queued
      //   - non-ticking effects (buff/debuff/status/control) are applied immediately ONCE and last trigger duration
      if (tr.triggerType === "over_time") {
        const interval = Math.max(0, Number(tr.overTime?.tickInterval || 0));
        const ticks = Math.max(1, Math.floor(Number(tr.overTime?.ticks || 1)));
        const computedDuration = interval * ticks;
        const triggerDuration = Number(tr.overTime?.duration || 0) || computedDuration;

        for (let ei = 0; ei < (tr.effects || []).length; ei++) {
          const ef = tr.effects[ei];
          const sourceKeySuffix = `${castKey}:tr${tr.id || "x"}:ef${ei}:${ef.type}:${ef.stat || ef.controlType || ef.statusType || ""}`;

          const isTicking =
            ef.type === "damage" ||
            ef.type === "heal" ||
            ef.type === "mana_damage" ||
            ef.type === "mana_restore" ||
            ef.type === "dispel";

          if (isTicking) {
            enqueueOverTime(ctx, attacker, target, tr, ef, localSides);
          } else {
            const efWithDuration = { ...ef, duration: Number(ef.duration || triggerDuration) };
            applyEffectInstance(ctx, target, efWithDuration, efWithDuration.duration, 1, sourceKeySuffix);

            const kind =
              efWithDuration.type === "buff" ? "buff" :
              efWithDuration.type === "debuff" ? "debuff" :
              "info";

            addRow(ctx, kind, side, `${attacker.name}${currentSkillTag(ctx)} applies ${effectLabel(efWithDuration)} (${Math.round(efWithDuration.duration)}s)`);
          }
        }
      } else {
        for (const ef of (tr.effects || [])) {
          resolveInstantEffect(ctx, attacker, target, triggerWithSource, ef, localSides);
        }
      }
    }
  }

  ctx._currentSkillName = null;
}

export function simulateBattle(characterA, characterB, options = {}) {
  const maxSeconds = Number(options.maxSeconds || 60);
  const seed = Number(options.seed || 12345);

  let s = seed >>> 0;
  const rng = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const A = buildCombatant(characterA);
  const B = buildCombatant(characterB);

  const ctx = {
    now: 0,
    rng,
    rows: [],
    dotQueue: [],
    _currentSkillName: null
  };

  const cooldownsA = new Map();
  const cooldownsB = new Map();

  addRow(ctx, "info", "A", `START: ${A.name} (Lv ${A.level})`);
  addRow(ctx, "info", "B", `START: ${B.name} (Lv ${B.level})`);

  for (ctx.now = 0; ctx.now <= maxSeconds; ctx.now += 1) {
    // resolve over-time
    processDotQueue(ctx, A, B);

    // regen each 5 seconds (including t=5,10,15...)
    if (ctx.now > 0 && ctx.now % 5 === 0) {
      applyRegenTick(ctx, A, "A");
      applyRegenTick(ctx, B, "B");
    }

    if (A.hp <= 0 || B.hp <= 0) break;

    // A turn
    if (isStunned(A, ctx.now)) {
      addRow(ctx, "info", "A", `${A.name} is stunned (skip)`);
    } else {
      const sA = pickBestSkill(A, B, ctx.now, cooldownsA);
      if (sA) {
        cooldownsA.set(sA.id, ctx.now + secondsFromCooldown(sA));
        applySkill(ctx, A, B, sA, { attackerSide: "A", defenderSide: "B" });
      }
    }

    if (B.hp <= 0) break;

    // B turn
    if (isStunned(B, ctx.now)) {
      addRow(ctx, "info", "B", `${B.name} is stunned (skip)`);
    } else {
      const sB = pickBestSkill(B, A, ctx.now, cooldownsB);
      if (sB) {
        cooldownsB.set(sB.id, ctx.now + secondsFromCooldown(sB));
        applySkill(ctx, B, A, sB, { attackerSide: "B", defenderSide: "A" });
      }
    }

    if (A.hp <= 0 || B.hp <= 0) break;
  }

  const winner =
    A.hp <= 0 && B.hp <= 0 ? "draw" :
    A.hp <= 0 ? B.name :
    B.hp <= 0 ? A.name : "timeout";

  addRow(ctx, "info", "A", `END HP: ${Math.round(A.hp)}/${Math.round(A.maxHp)} | Mana ${Math.round(A.mana)}/${Math.round(A.maxMana)}`);
  addRow(ctx, "info", "B", `END HP: ${Math.round(B.hp)}/${Math.round(B.maxHp)} | Mana ${Math.round(B.mana)}/${Math.round(B.maxMana)}`);
  addRow(ctx, "info", "A", `RESULT: ${winner}`);
  addRow(ctx, "info", "B", `RESULT: ${winner}`);

  return { winner, seed, rows: ctx.rows };
}
