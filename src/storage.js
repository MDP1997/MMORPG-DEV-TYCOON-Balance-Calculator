// src/storage.js
// LocalStorage persistence. Comments in English by request.

import { state } from "./state.js";
import { migrateCharacterStats } from "./models/character.js";
import { ensureGameDesign } from "./models/gameDesign.js";

const KEY = "character_calculator_state_v2";

export function saveToStorage() {
  try {
    const payload = {
      lang: state.lang,
      characters: state.characters,
      selectedCharacterId: state.selectedCharacterId,
      activeTab: state.activeTab,
      mainTab: state.mainTab,
      activeView: state.activeView,

      // Simulation config persistence
      simConfig:      state.simConfig,
      simPanelTab:    state.simPanelTab,

      // Balance / Expected Battles config
      recommendConfig: state.recommendConfig,

      // Game Design persistence
      gameDesign: state.gameDesign,

      // Item generator persistence
      itemGenConfig: state.itemGenConfig,
      generatedItems: state.generatedItems,
      itemsStale: state.itemsStale
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
    if (Array.isArray(payload.characters)) {
      state.characters = payload.characters;
      // Migrate characters from old stat format ({ base, scaling } → { step })
      for (const c of state.characters) migrateCharacterStats(c);
    }
    if (payload.selectedCharacterId !== undefined) state.selectedCharacterId = payload.selectedCharacterId;
    if (payload.activeTab) state.activeTab = payload.activeTab;
    if (payload.mainTab)   state.mainTab   = payload.mainTab;

    // Restore active view (new nav model); ignore old topPanel value
    if (payload.activeView) state.activeView = payload.activeView;
    // Migrate old saves that had topPanel set — map to activeView
    if (!payload.activeView && payload.topPanel) {
      state.activeView = payload.topPanel; // "configStats" | "itemGenerator" | "simulation"
    }

    if (payload.simConfig && typeof payload.simConfig === "object") {
      state.simConfig = { ...state.simConfig, ...payload.simConfig };
    }
    if (payload.simPanelTab) state.simPanelTab = payload.simPanelTab;
    if (payload.recommendConfig && typeof payload.recommendConfig === "object") {
      state.recommendConfig = { ...state.recommendConfig, ...payload.recommendConfig };
      // Ensure charTargets is always an object
      state.recommendConfig.charTargets ??= {};
    }

    if (payload.gameDesign && typeof payload.gameDesign === "object") {
      state.gameDesign = { ...state.gameDesign, ...payload.gameDesign };
      ensureGameDesign(state.gameDesign);
    }

    // Migrate old saves that had mainTab="gameDesign" (now lives in top panel)
    if (state.mainTab === "gameDesign") state.mainTab = "builder";

    if (payload.itemGenConfig && typeof payload.itemGenConfig === "object") {
      state.itemGenConfig = { ...state.itemGenConfig, ...payload.itemGenConfig };
    }
    if (Array.isArray(payload.generatedItems)) state.generatedItems = payload.generatedItems;
    if (payload.itemsStale !== undefined) state.itemsStale = payload.itemsStale;
  } catch (e) {
    console.warn("loadFromStorage failed:", e);
  }
}
