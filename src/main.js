import { applyLanguage } from "./i18n.js";
import { renderLanguageButtons, renderCharacterList, renderCharacterEditor, renderSkillModal } from "./ui/render.js";
import { wireGlobalEvents } from "./ui/events.js";
import { loadFromStorage } from "./storage.js";

// Load saved state (if any) BEFORE rendering
loadFromStorage();

// App entry point
wireGlobalEvents();
renderLanguageButtons();
renderCharacterList();
renderCharacterEditor();
renderSkillModal();
applyLanguage(document);
