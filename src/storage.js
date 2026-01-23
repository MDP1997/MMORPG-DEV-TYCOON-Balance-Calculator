// src/storage.js
// LocalStorage persistence. Comments in English by request.

import { state } from "./state.js";

const KEY = "character_calculator_state_v2";

export function saveToStorage() {
  try {
    const payload = {
      lang: state.lang,
      characters: state.characters,
      selectedCharacterId: state.selectedCharacterId,
      activeTab: state.activeTab,

      // Simulation config persistence
      simConfig: state.simConfig
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    // Ignore storage errors (private mode, quota, etc.)
    console.warn("saveToStorage failed:", e);
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);

    if (!payload || typeof payload !== "object") return;

    if (payload.lang) state.lang = payload.lang;
    if (Array.isArray(payload.characters)) state.characters = payload.characters;
    if (payload.selectedCharacterId !== undefined) state.selectedCharacterId = payload.selectedCharacterId;
    if (payload.activeTab) state.activeTab = payload.activeTab;

    if (payload.simConfig && typeof payload.simConfig === "object") {
      state.simConfig = {
        ...state.simConfig,
        ...payload.simConfig
      };
    }
  } catch (e) {
    console.warn("loadFromStorage failed:", e);
  }
}
