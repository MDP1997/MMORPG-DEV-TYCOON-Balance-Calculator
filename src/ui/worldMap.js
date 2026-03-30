// src/ui/worldMap.js
// Canvas-based pixel-art world map: central city + 20 monster zones + biomes + paths + islands.
// Rendered entirely via 2D Canvas with a pixel-art aesthetic (no external assets required).

import { t } from "../i18n.js";

// Polyfill for CanvasRenderingContext2D.roundRect (if not available in older browsers)
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

/* ─────────────────────────────────────────────
   ZONE DATA
   Each zone has:
     id, name, biome, level range, position (cx, cy = center),
     radius (approx. ellipse half-size), shape ('circle'|'ellipse'|'irregular'),
     color palette, and a list of decoration hints.
───────────────────────────────────────────────*/
export const WORLD_ZONES = [
  // ── Central city ──────────────────────────────────────────────────────────
  {
    id: "city", nameKey: "zoneCity", biome: "city",
    level: null, cx: 600, cy: 450,
    rx: 70, ry: 60,
    fillColor: "#c8a97e", borderColor: "#7a5c3a",
    decorations: ["building", "building", "building", "building", "well", "tree", "tree"],
    isCity: true
  },

  // ── Inner ring – levels 1-20 (6 zones) ───────────────────────────────────
  {
    id: "z1", nameKey: "zoneVerdantForest", biome: "grass",
    level: [1, 10], cx: 450, cy: 290,
    rx: 80, ry: 65,
    fillColor: "#4a9e3f", borderColor: "#2d6b25",
    decorations: ["tree", "tree", "tree", "rock", "mushroom"]
  },
  {
    id: "z2", nameKey: "zoneSandyShores", biome: "sand",
    level: [1, 10], cx: 750, cy: 290,
    rx: 75, ry: 55,
    fillColor: "#e8d56a", borderColor: "#b8a030",
    decorations: ["rock", "rock", "seaweed", "seaweed", "crystal"]
  },
  {
    id: "z3", nameKey: "zoneRockyHills", biome: "rock",
    level: [11, 20], cx: 850, cy: 430,
    rx: 70, ry: 80,
    fillColor: "#8b7355", borderColor: "#5a4a35",
    decorations: ["rock", "rock", "rock", "rock", "tree"]
  },
  {
    id: "z4", nameKey: "zoneSnowyPines", biome: "snow",
    level: [11, 20], cx: 750, cy: 610,
    rx: 80, ry: 60,
    fillColor: "#cce8f5", borderColor: "#7ab8d8",
    decorations: ["tree", "tree", "rock", "snowflake", "snowflake"]
  },
  {
    id: "z5", nameKey: "zoneMeadows", biome: "grass",
    level: [1, 15], cx: 450, cy: 610,
    rx: 75, ry: 65,
    fillColor: "#6dbf55", borderColor: "#3d8030",
    decorations: ["tree", "mushroom", "mushroom", "rock", "flower"]
  },
  {
    id: "z6", nameKey: "zoneDryPlains", biome: "desert",
    level: [11, 20], cx: 350, cy: 430,
    rx: 70, ry: 75,
    fillColor: "#d4a855", borderColor: "#a07030",
    decorations: ["rock", "cactus", "cactus", "skull", "rock"]
  },

  // ── Middle ring – levels 21-60 (8 zones) ─────────────────────────────────
  {
    id: "z7", nameKey: "zoneMushroomGrove", biome: "mushroom",
    level: [21, 36], cx: 290, cy: 220,
    rx: 90, ry: 70,
    fillColor: "#7d3fa0", borderColor: "#4a1a70",
    decorations: ["mushroom", "mushroom", "mushroom", "mushroom", "tree", "tree"]
  },
  {
    id: "z8", nameKey: "zoneDesertWasteland", biome: "desert",
    level: [21, 36], cx: 600, cy: 175,
    rx: 95, ry: 60,
    fillColor: "#d4874a", borderColor: "#9a5520",
    decorations: ["cactus", "skull", "rock", "rock", "bone"]
  },
  {
    id: "z9", nameKey: "zoneSwampMarsh", biome: "swamp",
    level: [37, 52], cx: 900, cy: 270,
    rx: 85, ry: 75,
    fillColor: "#4a7040", borderColor: "#2a4520",
    decorations: ["tree", "mushroom", "seaweed", "crystal", "rock"]
  },
  {
    id: "z10", nameKey: "zoneCrystalCaves", biome: "rock",
    level: [37, 52], cx: 960, cy: 540,
    rx: 80, ry: 90,
    fillColor: "#6070b0", borderColor: "#303888",
    decorations: ["crystal", "crystal", "crystal", "rock", "rock"]
  },
  {
    id: "z11", nameKey: "zonePoisonousGrove", biome: "violet",
    level: [37, 52], cx: 900, cy: 640,
    rx: 85, ry: 65,
    fillColor: "#8a3fa0", borderColor: "#501060",
    decorations: ["mushroom", "flower", "tree", "skull", "seaweed"]
  },
  {
    id: "z12", nameKey: "zoneVolcanicPlains", biome: "volcano",
    level: [53, 60], cx: 600, cy: 720,
    rx: 100, ry: 65,
    fillColor: "#b03010", borderColor: "#701a00",
    decorations: ["rock", "rock", "skull", "bone", "crystal"]
  },
  {
    id: "z13", nameKey: "zoneAncientRuins", biome: "rock",
    level: [53, 60], cx: 290, cy: 650,
    rx: 85, ry: 75,
    fillColor: "#9a8060", borderColor: "#605040",
    decorations: ["building", "building", "rock", "rock", "skull"]
  },
  {
    id: "z14", nameKey: "zoneFrozenTundra", biome: "snow",
    level: [37, 52], cx: 180, cy: 430,
    rx: 80, ry: 80,
    fillColor: "#a8d8f0", borderColor: "#5098c8",
    decorations: ["snowflake", "snowflake", "rock", "tree", "crystal"]
  },

  // ── Outer ring – levels 61-100 (6 zones) ──────────────────────────────────
  {
    id: "z15", nameKey: "zoneHauntedForest", biome: "dark",
    level: [61, 75], cx: 145, cy: 210,
    rx: 95, ry: 80,
    fillColor: "#2a3d20", borderColor: "#101808",
    decorations: ["tree", "tree", "tree", "skull", "bone"]
  },
  {
    id: "z16", nameKey: "zoneBurningDesert", biome: "desert",
    level: [61, 75], cx: 380, cy: 100,
    rx: 100, ry: 60,
    fillColor: "#c85010", borderColor: "#802000",
    decorations: ["rock", "cactus", "skull", "bone", "crystal"]
  },
  {
    id: "z17", nameKey: "zoneStormyPeaks", biome: "rock",
    level: [61, 75], cx: 820, cy: 100,
    rx: 95, ry: 70,
    fillColor: "#708090", borderColor: "#404858",
    decorations: ["rock", "rock", "snowflake", "crystal", "rock"]
  },
  {
    id: "z18", nameKey: "zoneLavaFields", biome: "volcano",
    level: [76, 90], cx: 1050, cy: 400,
    rx: 85, ry: 90,
    fillColor: "#e04010", borderColor: "#902000",
    decorations: ["skull", "bone", "rock", "crystal", "rock"]
  },
  {
    id: "z19", nameKey: "zoneDragonsLair", biome: "dark",
    level: [76, 100], cx: 1050, cy: 680,
    rx: 90, ry: 80,
    fillColor: "#401020", borderColor: "#200010",
    decorations: ["skull", "bone", "rock", "crystal", "building"]
  },
  {
    id: "z20", nameKey: "zoneCelestialGarden", biome: "violet",
    level: [91, 100], cx: 145, cy: 660,
    rx: 85, ry: 75,
    fillColor: "#6040a0", borderColor: "#301060",
    decorations: ["flower", "crystal", "mushroom", "tree", "tree"]
  },
];

// Islands (positioned beyond the main continent)
const ISLANDS = [
  { cx: 140, cy: 80,   rx: 55, ry: 38, fillColor: "#d4c860", borderColor: "#909020",
    nameKey: "islandGolden",   level: [28, 45],
    decorations: ["building", "tree", "crystal", "seaweed"] },
  { cx: 1090, cy: 130, rx: 60, ry: 40, fillColor: "#70c8d8", borderColor: "#308898",
    nameKey: "islandCoral",    level: [65, 82],
    decorations: ["seaweed", "seaweed", "crystal", "building"] },
  { cx: 1090, cy: 820, rx: 55, ry: 42, fillColor: "#b040b0", borderColor: "#601060",
    nameKey: "islandShadow",   level: [83, 100],
    decorations: ["skull", "crystal", "building", "bone"] },
  { cx: 140, cy: 820,  rx: 58, ry: 38, fillColor: "#3890a0", borderColor: "#185868",
    nameKey: "islandMystic",   level: [53, 72],
    decorations: ["mushroom", "tree", "crystal", "seaweed"] },
];

// Paths – pairs of zone IDs to connect with a road
const PATHS = [
  // City → inner ring
  ["city", "z1"], ["city", "z2"], ["city", "z3"],
  ["city", "z4"], ["city", "z5"], ["city", "z6"],
  // Inner → middle
  ["z1", "z7"], ["z1", "z8"], ["z2", "z8"], ["z2", "z9"],
  ["z3", "z9"], ["z3", "z10"], ["z4", "z10"], ["z4", "z11"],
  ["z4", "z12"], ["z5", "z12"], ["z5", "z13"], ["z6", "z13"],
  ["z6", "z14"], ["z6", "z7"],
  // Middle → outer
  ["z7", "z15"], ["z8", "z16"], ["z8", "z17"], ["z9", "z17"],
  ["z10", "z18"], ["z11", "z18"], ["z11", "z19"], ["z12", "z19"],
  ["z13", "z20"], ["z14", "z15"], ["z14", "z20"],
];

/* ─────────────────────────────────────────────
   PIXEL-ART DRAWING HELPERS
───────────────────────────────────────────────*/

/** Draw a single pixel-art "pixel" (upscaled square) */
function px(ctx, x, y, color, size = 3) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

/** Blocky pixel-art text */
function pixelText(ctx, text, x, y, color = "#fff", size = 10) {
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Pixel-art tree (3 stacked triangles + trunk) */
function drawTree(ctx, x, y, scale = 1, dark = false) {
  const s = Math.max(1, Math.round(scale));
  const trunk = dark ? "#3a2010" : "#6a3e1a";
  const leaf1 = dark ? "#143010" : "#2a8020";
  const leaf2 = dark ? "#0a2008" : "#1a6015";

  // trunk
  ctx.fillStyle = trunk;
  ctx.fillRect(x - s, y + 4 * s, 2 * s, 3 * s);
  // canopy – three layers
  [[0, 0, 5], [-1, -2, 7], [-2, -4, 9]].forEach(([dx, dy, w]) => {
    ctx.fillStyle = dy === 0 ? leaf1 : leaf2;
    ctx.fillRect(x - Math.round(w / 2) * s + dx * s, y + dy * s, w * s, 2 * s);
  });
}

/** Pixel-art rock */
function drawRock(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#888070";
  ctx.fillRect(x - 2 * s, y + s, 5 * s, 3 * s);
  ctx.fillRect(x - s, y - s, 3 * s, 3 * s);
  ctx.fillStyle = "#aaa090";
  ctx.fillRect(x - s, y, s, s);
}

/** Pixel-art mushroom */
function drawMushroom(ctx, x, y, scale = 1, purple = false) {
  const s = Math.max(1, Math.round(scale));
  const capC = purple ? "#9a3aaa" : "#cc3030";
  const dotC = "#ffffff";
  const stmC = "#e0d8a0";

  ctx.fillStyle = stmC;
  ctx.fillRect(x - s, y + 2 * s, 2 * s, 3 * s);
  ctx.fillStyle = capC;
  ctx.fillRect(x - 3 * s, y - s, 6 * s, 3 * s);
  ctx.fillRect(x - 2 * s, y - 3 * s, 4 * s, 2 * s);
  ctx.fillStyle = dotC;
  px(ctx, x - s, y - 2 * s, dotC, s);
  px(ctx, x + s, y - s, dotC, s);
}

/** Pixel-art cactus */
function drawCactus(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#3a8040";
  ctx.fillRect(x - s, y - 4 * s, 2 * s, 8 * s);
  ctx.fillRect(x - 3 * s, y - 2 * s, 2 * s, 2 * s);
  ctx.fillRect(x + s, y - 3 * s, 2 * s, 2 * s);
}

/** Pixel-art crystal */
function drawCrystal(ctx, x, y, scale = 1, hue = 180) {
  const s = Math.max(1, Math.round(scale));
  const colors = { 180: "#50d8f0", 270: "#a060e0", 0: "#f05050" };
  const c = colors[hue] ?? "#50d8f0";
  ctx.fillStyle = c;
  ctx.fillRect(x - s, y, 2 * s, 4 * s);
  ctx.fillRect(x - 2 * s, y + s, s, 2 * s);
  ctx.fillRect(x + s, y + s, s, 2 * s);
  ctx.fillStyle = "#ffffff88";
  ctx.fillRect(x - s, y, s, s);
}

/** Pixel-art skull */
function drawSkull(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#e8e0c0";
  ctx.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s);
  ctx.fillStyle = "#302818";
  px(ctx, x - s, y - s, "#302818", s);
  px(ctx, x,     y - s, "#302818", s);
  ctx.fillRect(x - s, y + s, 2 * s, s);
}

/** Pixel-art bone */
function drawBone(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#d8d0b0";
  ctx.fillRect(x - 3 * s, y, 6 * s, s);
  [[-3, -1], [-3, 1], [2, -1], [2, 1]].forEach(([dx, dy]) => {
    ctx.fillRect(x + dx * s, y + dy * s, 2 * s, s);
  });
}

/** Pixel-art snowflake */
function drawSnowflake(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#c8eeff";
  [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    .forEach(([dx, dy]) => ctx.fillRect(x + dx * s, y + dy * s, s, s));
}

/** Pixel-art flower */
function drawFlower(ctx, x, y, scale = 1, violet = false) {
  const s = Math.max(1, Math.round(scale));
  const petalC = violet ? "#b060e0" : "#f0a020";
  ctx.fillStyle = "#50a030";
  ctx.fillRect(x, y + s, s, 3 * s);
  ctx.fillStyle = petalC;
  [[-s, 0], [s, 0], [0, -s], [0, s]].forEach(([dx, dy]) =>
    ctx.fillRect(x + dx, y + dy, s, s));
  ctx.fillStyle = "#f8e040";
  ctx.fillRect(x, y, s, s);
}

/** Pixel-art seaweed/reed */
function drawSeaweed(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#208840";
  ctx.fillRect(x, y, s, 5 * s);
  ctx.fillStyle = "#30b050";
  ctx.fillRect(x - 2 * s, y + s, 2 * s, s);
  ctx.fillRect(x + s, y + 3 * s, 2 * s, s);
}

/** Pixel-art building (pixel art house) */
function drawBuilding(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  // walls
  ctx.fillStyle = "#c8a880";
  ctx.fillRect(x - 3 * s, y, 6 * s, 5 * s);
  // roof
  ctx.fillStyle = "#c03020";
  ctx.fillRect(x - 4 * s, y - 2 * s, 8 * s, s);
  ctx.fillRect(x - 3 * s, y - 3 * s, 6 * s, s);
  ctx.fillRect(x - 2 * s, y - 4 * s, 4 * s, s);
  ctx.fillRect(x - s, y - 5 * s, 2 * s, s);
  // door
  ctx.fillStyle = "#804820";
  ctx.fillRect(x - s, y + 2 * s, 2 * s, 3 * s);
  // window
  ctx.fillStyle = "#a0d8f0";
  ctx.fillRect(x - 2 * s, y + s, s, s);
  ctx.fillRect(x + s, y + s, s, s);
}

/** Pixel-art well */
function drawWell(ctx, x, y, scale = 1) {
  const s = Math.max(1, Math.round(scale));
  ctx.fillStyle = "#808898";
  ctx.fillRect(x - 2 * s, y, 4 * s, 3 * s);
  ctx.fillStyle = "#606878";
  ctx.fillRect(x - 3 * s, y - s, 6 * s, s);
  ctx.fillStyle = "#4080c8";
  ctx.fillRect(x - s, y + s, 2 * s, s);
}

const DECO_DRAW = {
  tree:      (ctx, x, y, s, biome) => drawTree(ctx, x, y, s, biome === "dark"),
  rock:      drawRock,
  mushroom:  (ctx, x, y, s, biome) => drawMushroom(ctx, x, y, s, biome === "violet" || biome === "mushroom"),
  cactus:    drawCactus,
  crystal:   (ctx, x, y, s, biome) =>
               drawCrystal(ctx, x, y, s, biome === "volcano" ? 0 : biome === "violet" ? 270 : 180),
  skull:     drawSkull,
  bone:      drawBone,
  snowflake: drawSnowflake,
  flower:    (ctx, x, y, s, biome) => drawFlower(ctx, x, y, s, biome === "violet"),
  seaweed:   drawSeaweed,
  building:  drawBuilding,
  well:      drawWell,
};

/* ─────────────────────────────────────────────
   BIOME BACKGROUND PATTERNS
───────────────────────────────────────────────*/

const BIOME_BG = {
  grass:    { base: "#52c442", spots: ["#70d85a", "#3ea030"], ground: "#4aaa38" },
  sand:     { base: "#f0da60", spots: ["#ffe888", "#d0b840"], ground: "#e0ca50" },
  rock:     { base: "#9a8870", spots: ["#b09a88", "#786858"], ground: "#8a7860" },
  snow:     { base: "#e0f4ff", spots: ["#f8ffff", "#c0e0f8"], ground: "#d0eeff" },
  mushroom: { base: "#9848c8", spots: ["#b060e0", "#703098"], ground: "#8038b8" },
  desert:   { base: "#e09840", spots: ["#f8b060", "#c07828"], ground: "#d08830" },
  swamp:    { base: "#507848", spots: ["#609858", "#385830"], ground: "#406838" },
  volcano:  { base: "#d04818", spots: ["#f06030", "#a02800"], ground: "#c03808" },
  violet:   { base: "#9840c8", spots: ["#b858e0", "#702898"], ground: "#8830b8" },
  dark:     { base: "#304830", spots: ["#405840", "#182018"], ground: "#203020" },
  city:     { base: "#d0b078", spots: ["#e0c888", "#b09060"], ground: "#c0a068" },
  island:   { base: "#e0d068", spots: ["#f0e880", "#c0b048"], ground: "#d0c058" },
  coral:    { base: "#60d8e8", spots: ["#80f0ff", "#4098a8"], ground: "#50c8d8" },
  shadow:   { base: "#c040c0", spots: ["#e060e0", "#903090"], ground: "#b030b0" },
  mystic:   { base: "#30a0b8", spots: ["#50c0d0", "#206878"], ground: "#2890a8" },
};

function getBiomeBg(biome) {
  return BIOME_BG[biome] ?? BIOME_BG.grass;
}

/* ─────────────────────────────────────────────
   MAP RENDERER
───────────────────────────────────────────────*/

// Seeded random for deterministic decoration placement
function seededRand(seed) {
  let s = seed | 0;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

/** Draw the ocean/water background */
function drawOcean(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1a4870");
  grad.addColorStop(0.5, "#1e5888");
  grad.addColorStop(1, "#152c50");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle wave dots
  const rng = seededRand(42);
  ctx.fillStyle = "#2860a0";
  for (let i = 0; i < 400; i++) {
    const wx = rng() * w;
    const wy = rng() * h;
    ctx.fillRect(wx, wy, 2, 1);
  }
}

/** Draw the continent landmass behind all zones */
function drawContinent(ctx) {
  ctx.save();
  // Lighter, neutral base so biome zones pop against it
  ctx.fillStyle = "#8a7858";
  ctx.beginPath();
  // rough blob polygon
  const pts = [
    [110, 80], [390, 55], [620, 80], [860, 55], [1080, 90],
    [1130, 280], [1140, 520], [1120, 730], [1080, 850],
    [820, 870], [600, 880], [380, 870], [140, 850],
    [80, 680], [70, 450], [80, 230],
  ];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px1, py1] = pts[i - 1];
    const [px2, py2] = pts[i];
    ctx.quadraticCurveTo(
      (px1 + px2) / 2 + (i % 2 === 0 ? 15 : -15),
      (py1 + py2) / 2 + (i % 3 === 0 ? 10 : -10),
      px2, py2
    );
  }
  ctx.closePath();
  ctx.fill();

  // Ground texture dots
  const rng = seededRand(888);
  ctx.fillStyle = "#786848";
  for (let i = 0; i < 200; i++) {
    const tx = 80 + rng() * 1060;
    const ty = 55 + rng() * 810;
    ctx.fillRect(tx, ty, 3 + rng() * 5, 2 + rng() * 3);
  }

  // Coastline highlight
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px1, py1] = pts[i - 1];
    const [px2, py2] = pts[i];
    ctx.quadraticCurveTo(
      (px1 + px2) / 2 + (i % 2 === 0 ? 15 : -15),
      (py1 + py2) / 2 + (i % 3 === 0 ? 10 : -10),
      px2, py2
    );
  }
  ctx.closePath();
  ctx.strokeStyle = "#9a8860";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

/** Draw a zone (ellipse + biome texture + border) */
function drawZone(ctx, zone, highlighted, scale) {
  const { cx, cy, rx, ry, borderColor, biome } = zone;
  const bg = getBiomeBg(biome);

  // Drop shadow for depth
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 5, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fill();
  ctx.restore();

  ctx.save();

  // Ellipse clip
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  // Base fill
  ctx.fillStyle = bg.base;
  ctx.fill();

  // Scattered spot texture
  const rng = seededRand(zone.id.charCodeAt(0) * 31 + (zone.id.charCodeAt(1) ?? 7));
  for (let i = 0; i < 28; i++) {
    const sx = cx - rx + rng() * rx * 2;
    const sy = cy - ry + rng() * ry * 2;
    const r = 4 + rng() * 10;
    ctx.fillStyle = bg.spots[i % 2];
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.55, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // Border ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (highlighted) {
    ctx.strokeStyle = "#ffee44";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#ffdd00";
    ctx.shadowBlur = 16;
  } else {
    // Inner bright ring
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Outer dark border
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
  }
  ctx.stroke();
  ctx.restore();
}

/** Place decoration items pseudo-randomly inside the zone ellipse */
function drawDecorations(ctx, zone) {
  const { cx, cy, rx, ry, decorations, biome, id } = zone;
  const rng = seededRand(id.charCodeAt(0) * 17 + 99);
  const placed = [];
  let attempts = 0;

  for (const decoType of decorations) {
    let placed_ok = false;
    for (let t = 0; t < 20 && !placed_ok; t++, attempts++) {
      const angle = rng() * Math.PI * 2;
      const dist  = rng() * 0.75; // keep away from edge
      const dx = Math.cos(angle) * rx * dist;
      const dy = Math.sin(angle) * ry * dist;
      const px_ = cx + dx;
      const py_ = cy + dy;

      // Avoid clustering
      const tooClose = placed.some(([px2, py2]) => Math.hypot(px_ - px2, py_ - py2) < 18);
      if (!tooClose) {
        placed.push([px_, py_]);
        const fn = DECO_DRAW[decoType];
        if (fn) fn(ctx, Math.round(px_), Math.round(py_), 2, biome);
        placed_ok = true;
      }
    }
  }
}

/** Draw a pixel-art island */
function drawIsland(ctx, island) {
  const { cx, cy, rx, ry, borderColor, decorations, nameKey, level } = island;
  const bg = getBiomeBg(island.biome ?? "island");

  // Drop shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 4, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();
  ctx.restore();

  // Sandy beach ring
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 6, ry + 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#d8c860";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bg.base;
  ctx.fill();
  const rng = seededRand(nameKey.length * 37);
  for (let i = 0; i < 14; i++) {
    const sx = cx - rx + rng() * rx * 2;
    const sy = cy - ry + rng() * ry * 2;
    ctx.fillStyle = bg.spots[i % 2];
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5 + rng() * 8, 3 + rng() * 6, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Decorations
  const rng2 = seededRand(nameKey.length * 53 + 1);
  decorations.slice(0, 3).forEach((dt, i) => {
    const angle = (i / 3) * Math.PI * 2;
    const x = cx + Math.cos(angle) * rx * 0.4;
    const y = cy + Math.sin(angle) * ry * 0.4;
    const fn = DECO_DRAW[dt];
    if (fn) fn(ctx, Math.round(x), Math.round(y), 1.5, island.biome ?? "island");
  });
}

/** Draw a path (road) between two zones */
function drawPath(ctx, zoneA, zoneB) {
  const ax = zoneA.cx, ay = zoneA.cy;
  const bx = zoneB.cx, by = zoneB.cy;

  // Determine exit points on zone ellipse edges
  const angle = Math.atan2(by - ay, bx - ax);
  const x1 = ax + Math.cos(angle) * zoneA.rx;
  const y1 = ay + Math.sin(angle) * zoneA.ry;
  const x2 = bx - Math.cos(angle) * zoneB.rx;
  const y2 = by - Math.sin(angle) * zoneB.ry;

  // Curved dirt path
  const mx = (x1 + x2) / 2 + (ay - by) * 0.15;
  const my = (y1 + y2) / 2 + (bx - ax) * 0.15;

  ctx.save();
  ctx.strokeStyle = "#c8a060";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();

  // Darker border below
  ctx.strokeStyle = "#907040";
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Draw zone name label + level range badge */
function drawZoneLabel(ctx, zone) {
  const { cx, cy, ry, nameKey, level, isCity } = zone;
  const name = t(nameKey) || nameKey;

  ctx.save();
  ctx.font = "bold 10px monospace";
  const tw = ctx.measureText(name).width;

  const ly = cy + ry + 15;

  // Background pill
  ctx.fillStyle = isCity ? "rgba(80,50,0,0.75)" : "rgba(0,0,0,0.65)";
  const pad = 5;
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2 - pad, ly - 10, tw + pad * 2, 14, 4);
  ctx.fill();

  ctx.fillStyle = isCity ? "#ffd060" : "#f0f0f0";
  ctx.textAlign = "center";
  ctx.fillText(name, cx, ly);

  if (level) {
    const lvlText = `Lv ${level[0]}–${level[1]}`;
    ctx.font = "9px monospace";
    const lw = ctx.measureText(lvlText).width;
    ctx.fillStyle = "rgba(0,0,20,0.65)";
    ctx.beginPath();
    ctx.roundRect(cx - lw / 2 - 4, ly + 4, lw + 8, 13, 4);
    ctx.fill();
    ctx.fillStyle = "#66ccff";
    ctx.fillText(lvlText, cx, ly + 14);
  }

  ctx.restore();
}

/** Draw the central city as a pixel-art miniature */
function drawCity(ctx, zone) {
  const { cx, cy, rx, ry, borderColor } = zone;

  // Drop shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 5, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#d0b078";
  ctx.fill();

  // Stone-paved ground tiles
  const rng = seededRand(777);
  for (let i = 0; i < 24; i++) {
    const sx = cx - rx + rng() * rx * 2;
    const sy = cy - ry + rng() * ry * 2;
    ctx.fillStyle = i % 3 === 0 ? "#b89860" : "#c8a870";
    ctx.fillRect(sx, sy, 7 + rng() * 10, 5 + rng() * 5);
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx, sy, 7 + rng() * 10, 5 + rng() * 5);
  }

  ctx.restore();

  // City border with glow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,220,100,0.4)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Pixel-art buildings
  const buildings = [
    [cx - 30, cy - 15], [cx + 10, cy - 20], [cx - 5, cy - 30],
    [cx + 28, cy], [cx - 28, cy + 10], [cx + 5, cy + 20],
  ];
  buildings.forEach(([bx, by]) => drawBuilding(ctx, bx, by, 2));

  // Well in center
  drawWell(ctx, cx, cy - 5, 2);

  // Trees around the walls
  [[cx + rx - 15, cy], [cx - rx + 15, cy],
   [cx, cy + ry - 12], [cx, cy - ry + 12]].forEach(([tx, ty]) =>
    drawTree(ctx, tx, ty, 1.5));
}

/** Draw a compass rose */
function drawCompass(ctx, x, y) {
  ctx.save();
  const labels = [["N", 0, -22], ["S", 0, 24], ["E", 24, 4], ["W", -27, 4]];
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#e0d090";
  labels.forEach(([lbl, dx, dy]) => {
    ctx.fillStyle = lbl === "N" ? "#ff8844" : "#e0d090";
    ctx.fillText(lbl, x + dx, y + dy);
  });

  // Arrow lines
  ctx.strokeStyle = "#e0d090";
  ctx.lineWidth = 1.5;
  [[0, -16], [0, 16], [16, 0], [-16, 0]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  });

  // North arrowhead
  ctx.fillStyle = "#ff8844";
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x - 4, y - 8);
  ctx.lineTo(x + 4, y - 8);
  ctx.fill();

  ctx.restore();
}

/** Draw legend */
function drawLegend(ctx, x, y) {
  const items = [
    { color: "#5cb84a", label: t("legendGrass")    || "Grass" },
    { color: "#e8d070", label: t("legendSand")     || "Sand" },
    { color: "#887060", label: t("legendRock")     || "Rock" },
    { color: "#d8eef8", label: t("legendSnow")     || "Snow" },
    { color: "#8040a8", label: t("legendMushroom") || "Mushroom" },
    { color: "#d4904a", label: t("legendDesert")   || "Desert" },
    { color: "#486840", label: t("legendSwamp")    || "Swamp" },
    { color: "#b04020", label: t("legendVolcano")  || "Volcano" },
    { color: "#8838b0", label: t("legendViolet")   || "Violet" },
    { color: "#283828", label: t("legendDark")     || "Dark" },
  ];

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, 130, items.length * 14 + 22, 5);
  ctx.fill();

  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#ffdd88";
  ctx.fillText(t("legendBiomes") || "Biomes", x + 8, y + 14);

  ctx.font = "9px monospace";
  items.forEach((item, i) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(x + 8, y + 22 + i * 14, 10, 10);
    ctx.fillStyle = "#e0e0e0";
    ctx.fillText(item.label, x + 22, y + 31 + i * 14);
  });
  ctx.restore();
}

/* ─────────────────────────────────────────────
   MAIN RENDER FUNCTION
───────────────────────────────────────────────*/

export function renderWorldMapPanel() {
  return `
    <div class="world-map-panel">
      <div class="world-map-toolbar">
        <span class="world-map-title">${t("worldMapTitle") || "World Map"}</span>
        <span class="world-map-hint">${t("worldMapHint") || "Hover a zone to see details"}</span>
        <button class="nav-action-btn" id="worldMapZoomIn"  title="Zoom in">＋</button>
        <button class="nav-action-btn" id="worldMapZoomOut" title="Zoom out">－</button>
        <button class="nav-action-btn" id="worldMapReset"   title="Reset view">${t("worldMapReset") || "Reset"}</button>
      </div>
      <div class="world-map-container">
        <canvas id="worldMapCanvas" width="1200" height="900"></canvas>
        <div id="worldMapTooltip" class="world-map-tooltip" style="display:none;"></div>
      </div>
    </div>
  `;
}

/** Called after renderWorldMapPanel HTML is inserted into the DOM */
export function initWorldMap() {
  const canvas  = document.getElementById("worldMapCanvas");
  if (!canvas) return;
  const ctx     = canvas.getContext("2d");
  const tooltip = document.getElementById("worldMapTooltip");

  const W = canvas.width;
  const H = canvas.height;

  // ── Build zone lookup ───────────────────────────────────────────────────
  const zoneById = Object.fromEntries(WORLD_ZONES.map(z => [z.id, z]));

  // ── Viewport / pan / zoom state ─────────────────────────────────────────
  const view = { scale: 1, offX: 0, offY: 0 };

  // ── Draw full map ────────────────────────────────────────────────────────
  function drawMap(highlightId = null) {
    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);

    // Ocean background
    drawOcean(ctx, W / view.scale, H / view.scale);

    // Continent
    drawContinent(ctx);

    // Islands (below paths)
    ISLANDS.forEach(isl => drawIsland(ctx, isl));

    // Paths
    PATHS.forEach(([a, b]) => {
      const za = zoneById[a];
      const zb = zoneById[b];
      if (za && zb) drawPath(ctx, za, zb);
    });

    // Zones (non-city first, city on top)
    const nonCity = WORLD_ZONES.filter(z => !z.isCity);
    const cityZone = WORLD_ZONES.find(z => z.isCity);

    nonCity.forEach(zone => drawZone(ctx, zone, zone.id === highlightId, view.scale));
    nonCity.forEach(zone => drawDecorations(ctx, zone));

    if (cityZone) {
      drawCity(ctx, cityZone);
    }

    // Island labels
    ISLANDS.forEach(isl => {
      const name = t(isl.nameKey) || isl.nameKey;
      ctx.font = "bold 8px monospace";
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(isl.cx - tw / 2 - 3, isl.cy + isl.ry + 3, tw + 6, 11);
      ctx.fillStyle = "#ffe080";
      ctx.textAlign = "center";
      ctx.fillText(name, isl.cx, isl.cy + isl.ry + 13);
      if (isl.level) {
        const lvl = `Lv ${isl.level[0]}–${isl.level[1]}`;
        const lw  = ctx.measureText(lvl).width;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(isl.cx - lw / 2 - 3, isl.cy + isl.ry + 14, lw + 6, 11);
        ctx.fillStyle = "#88ddff";
        ctx.fillText(lvl, isl.cx, isl.cy + isl.ry + 24);
      }
    });

    // Zone labels
    nonCity.forEach(zone => drawZoneLabel(ctx, zone));
    if (cityZone) drawZoneLabel(ctx, cityZone);

    // Compass
    drawCompass(ctx, W - 55, 55);

    // Legend
    drawLegend(ctx, 8, H - 168);

    ctx.restore();
  }

  drawMap();

  // ── Zoom controls ──────────────────────────────────────────────────────
  function clampView() {
    view.scale  = Math.min(3, Math.max(0.4, view.scale));
    view.offX   = Math.min(0, Math.max(canvas.width * (1 - view.scale), view.offX));
    view.offY   = Math.min(0, Math.max(canvas.height * (1 - view.scale), view.offY));
  }

  document.getElementById("worldMapZoomIn")?.addEventListener("click", () => {
    view.scale *= 1.25;
    clampView();
    drawMap();
  });
  document.getElementById("worldMapZoomOut")?.addEventListener("click", () => {
    view.scale /= 1.25;
    clampView();
    drawMap();
  });
  document.getElementById("worldMapReset")?.addEventListener("click", () => {
    view.scale = 1; view.offX = 0; view.offY = 0;
    drawMap();
  });

  // ── Mouse wheel zoom ────────────────────────────────────────────────────
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const cssX  = e.clientX - rect.left;
    const cssY  = e.clientY - rect.top;
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = cssX * scaleX;
    const my = cssY * scaleY;

    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const prevScale = view.scale;
    view.scale *= delta;
    clampView();
    // Zoom toward mouse pointer
    view.offX += (mx - view.offX) * (1 - view.scale / prevScale);
    view.offY += (my - view.offY) * (1 - view.scale / prevScale);
    clampView();
    drawMap();
  }, { passive: false });

  // ── Pan (drag) ─────────────────────────────────────────────────────────
  let drag = null;
  canvas.addEventListener("mousedown", (e) => {
    drag = { sx: e.clientX - view.offX, sy: e.clientY - view.offY };
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("mousemove", (e) => {
    if (drag) {
      view.offX = e.clientX - drag.sx;
      view.offY = e.clientY - drag.sy;
      clampView();
      drawMap();
      return;
    }

    // Tooltip hit-test
    const rect   = canvas.getBoundingClientRect();
    const cssX   = e.clientX - rect.left;
    const cssY   = e.clientY - rect.top;
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (cssX * scaleX - view.offX) / view.scale;
    const my = (cssY * scaleY - view.offY) / view.scale;

    let hit = null;
    for (const zone of WORLD_ZONES) {
      const dx = (mx - zone.cx) / zone.rx;
      const dy = (my - zone.cy) / zone.ry;
      if (dx * dx + dy * dy <= 1) { hit = zone; break; }
    }
    if (!hit) {
      for (const isl of ISLANDS) {
        const dx = (mx - isl.cx) / isl.rx;
        const dy = (my - isl.cy) / isl.ry;
        if (dx * dx + dy * dy <= 1) { hit = isl; break; }
      }
    }

    if (hit) {
      const name = t(hit.nameKey) || hit.nameKey;
      const biome = (t("biome_" + hit.biome) || hit.biome || "").charAt(0).toUpperCase()
                  + (t("biome_" + hit.biome) || hit.biome || "").slice(1);
      const lvl  = hit.level ? `Lv ${hit.level[0]}–${hit.level[1]}` : "—";
      tooltip.innerHTML = `<strong>${name}</strong><br>
        ${t("tooltipBiome") || "Biome"}: ${biome}<br>
        ${t("tooltipLevel") || "Level"}: ${lvl}`;
      tooltip.style.display = "block";
      tooltip.style.left = (e.clientX - rect.left + 10) + "px";
      tooltip.style.top  = (e.clientY - rect.top  + 10) + "px";
      drawMap(hit.id);
      canvas.style.cursor = "pointer";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "grab";
      drawMap();
    }
  });
  canvas.addEventListener("mouseup",   () => { drag = null; canvas.style.cursor = "grab"; });
  canvas.addEventListener("mouseleave",() => { drag = null; canvas.style.cursor = "grab"; tooltip.style.display = "none"; drawMap(); });

  canvas.style.cursor = "grab";
}
