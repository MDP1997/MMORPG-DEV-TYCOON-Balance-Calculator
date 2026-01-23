// Stat scaling formula:
// levelValue = base + (base * scaling * (level - 1))
export function calculateStat(base, scalingDecimal, level) {
  return base + (base * scalingDecimal * (level - 1));
}
