// src/state.js
// Global app state container. Comments in English by request.

export const state = {
  // UI language
  lang: "es",

  // Characters
  characters: [],
  selectedCharacterId: null,

  // Tabs: "stats" | "skills" | "sim"
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
    maxSeconds: 60
  },
  simRuns: [],
  simShowLogs: false
};

export function getSelectedCharacter() {
  return state.characters.find(c => c.id === state.selectedCharacterId) || null;
}

export function setSelectedCharacterId(id) {
  state.selectedCharacterId = id;
}
