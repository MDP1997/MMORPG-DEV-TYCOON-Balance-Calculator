import { applyLanguage } from "./i18n.js";
import { renderLanguageButtons, renderCharacterList, renderCharacterEditor, renderSkillModal, renderTopBar, renderTopPanel } from "./ui/render.js";
import { wireGlobalEvents } from "./ui/events.js";
import { loadFromStorage } from "./storage.js";

// Load saved state (if any) BEFORE rendering
loadFromStorage();

// App entry point
wireGlobalEvents();
renderTopBar();
renderTopPanel();
renderLanguageButtons();
renderCharacterList();
renderCharacterEditor();
renderSkillModal();
applyLanguage(document);
