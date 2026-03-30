// src/state.js
// Global app state container. Comments in English by request.

import { createDefaultGameDesign } from "./models/gameDesign.js";

export const state = {
  // UI language
  lang: "es",

  // Characters
  characters: [],
  selectedCharacterId: null,

  // Main tab: "builder" only (simulation moved to top bar)
  mainTab: "builder",

  // Simulation panel sub-tab: "battle" | "recommended"
  simPanelTab: "battle",

  // Builder inner tabs: "stats" | "skills"
  activeTab: "stats",

  // Skill modal
  isSkillModalOpen: false,
  skillModalTab: "basic", // "basic" | "mechanic"
  skillEditingIndex: null, // number | null
  skillDraft: null,

  // Simulation UI state
  simConfig: {
    aId: "",
    bId: "",
    levelA: 1,
    levelB: 1,
    seed: 12345,
    maxSeconds: 60,
    // Item config for simulation (null = no items)
    itemLevel: null,
    maxRarity: "legendary",
    opponentType: "players"
  },
  simRuns: [],
  simShowLogs: false,

  // Items modal for simulation
  simItemsModal: null,  // null | { charId, charName }

  // Balance recommendation (from balanceRecommend action)
  balanceRecommendation: null,
  allBalanceRecommendations: null,
  recExpandedCards: [],   // subjectIds of expanded balance result cards

  // Recommended Stats tab
  recommendConfig: {
    recMode: "both",        // "stats" | "skills" | "both"
    minWinPct: 40,          // global defaults (used when no per-char override exists)
    maxWinPct: 60,
    minDuration: 20,
    maxDuration: 40,
    charTargets: {},        // { [charId]: { minWinPct, maxWinPct, minDuration, maxDuration } }
    balanceTimeLimit: 60    // seconds to spend searching for optimal config
  },
  recommendations: null,  // null | { statChanges, skillChanges, subjectId }
  allRecommendations: null,
  balanceAnalyzing: false,
  balanceNotOptimal: false,    // true when iterative balance couldn't reach full balance
  balanceProgress: null,       // null | { playerIdx, totalPlayers, currentPlayerName, phase, battlesCompleted, totalBattlesEst, overallFraction, eta, startTime }
  powerScoreModal: null,       // { charId } — which character's power-score modal is open
  balanceTrialItems: [],       // trial items generated during iterative balance (for display)

  // Global game-design settings (max level, stat references)
  gameDesign: createDefaultGameDesign(),

  // Active top-level view: "characters" | "configStats" | "itemGenerator" | "simulation"
  activeView: "configStats",

  // Snapshot of characters before a balance apply (for revert)
  balanceSnapshot: null,

  // Item generator settings
  itemGenConfig: {
    minLevel: 1,
    maxLevel: 1,
    levelStep: 1,
    selectedRarities: ["common", "uncommon", "rare", "elite", "legendary"],
    selectedCharacterIds: []  // empty = all characters
  },

  // Generated items array + stale flag
  generatedItems: [],
  itemsStale: false
};

export function getSelectedCharacter() {
  return state.characters.find(c => c.id === state.selectedCharacterId) || null;
}

export function setSelectedCharacterId(id) {
  state.selectedCharacterId = id;
}
