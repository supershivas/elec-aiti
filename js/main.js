import { Stage } from "./editor/stage.js";
import { Store } from "./state.js";
import { Palette } from "./editor/palette.js";
import { ComponentsLayer } from "./editor/componentsLayer.js";
import { LinksLayer } from "./editor/linksLayer.js";
import { MeasureTool } from "./editor/measureTool.js";
import { PropertiesPanel } from "./editor/propertiesPanel.js";
import { ElementsListDialog } from "./editor/elementsList.js";
import { MenuBar } from "./editor/menuBar.js";
import { ScaleBar } from "./editor/scaleBar.js";
import { linkTypes } from "./catalog/linkTypes.js";
import { isEditingText } from "./editor/domUtils.js";
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";
import { exportProjectFile, importProjectFile } from "./io/projectFile.js";
import { promptFloorName } from "./editor/floorDialog.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");
const paletteEl = document.querySelector("#palette");
const componentsLayerEl = document.querySelector("#components-layer");
const linksLayerEl = document.querySelector("#links-layer");
const measureLayerEl = document.querySelector("#measure-layer");
const propertiesPanelEl = document.querySelector("#properties-panel");
const undoMenuButton = document.querySelector("#menu-undo");
const linkTypeSelectEl = document.querySelector("#link-type-select");
const selectModeButtonEl = document.querySelector("#mode-select");
const measureModeButtonEl = document.querySelector("#mode-measure");
const importFileInputEl = document.querySelector("#import-file-input");
const scaleBarLineEl = document.querySelector("#scale-bar-line");
const scaleBarLabelEl = document.querySelector("#scale-bar-label");

for (const linkType of linkTypes) {
  const option = document.createElement("option");
  option.value = linkType.type;
  option.textContent = linkType.label;
  linkTypeSelectEl.appendChild(option);
}

const stage = new Stage(svgEl, errorEl);
const store = new Store();
new ScaleBar({ stage, lineEl: scaleBarLineEl, labelEl: scaleBarLabelEl });

// La liste des étages vit dans le Store (création/renommage/suppression) :
// on reconstruit les options à chaque modification plutôt qu'une fois au
// chargement. Ne pas appeler ça depuis store.onChange (qui se déclenche à
// chaque frame de glissé d'un composant) : seulement après une action qui
// touche vraiment la liste des étages.
function renderFloorOptions() {
  const currentValue = floorSelectEl.value;
  floorSelectEl.replaceChildren();
  for (const floor of store.getFloors()) {
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.label;
    floorSelectEl.appendChild(option);
  }
  if (store.getFloorById(currentValue)) floorSelectEl.value = currentValue;
}
renderFloorOptions();

// Déclarées avant d'être assignées : les calques ont besoin de se référencer
// mutuellement pour que sélectionner l'un désélectionne l'autre.
let linksLayer;
let propertiesPanel;

const componentsLayer = new ComponentsLayer({
  layerEl: componentsLayerEl,
  stage,
  store,
  onPlacementConsumed: () => {
    palette.setArmed(null);
    componentsLayer.armPlacement(null);
  },
  onSelect: () => {
    linksLayer.clearSelection();
    syncCrossHighlight();
    propertiesPanel.refresh();
  },
  // Clic simple (pas un glissé) sur un composant déjà posé : propose aussitôt
  // une liaison vers le prochain élément cliqué, sans outil à armer.
  onComponentClicked: (component) => linksLayer.beginFrom(component, linkTypeSelectEl.value),
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => {
    exitMeasuring();
    linksLayer.stopLinking();
    componentsLayer.armPlacement(type);
  },
});

linksLayer = new LinksLayer({
  layerEl: linksLayerEl,
  stage,
  store,
  componentsLayer,
  onSelect: () => {
    componentsLayer.clearSelection();
    syncCrossHighlight();
    propertiesPanel.refresh();
  },
});

const measureTool = new MeasureTool({ layerEl: measureLayerEl, stage });

propertiesPanel = new PropertiesPanel({
  containerEl: propertiesPanelEl,
  store,
  componentsLayer,
  linksLayer,
  // "Aller à l'exemplaire lié" (élément multi-étage) : bascule d'étage puis
  // sélectionne et recentre la vue sur son double.
  onGoToLinkedComponent: async (floorId, componentId) => {
    await switchToFloor(floorId);
    const component = store.getComponentsForFloor(floorId).find((c) => c.id === componentId);
    if (!component) return;
    componentsLayer.select(componentId);
    stage.centerOn(component.x, component.y);
  },
});

// Met en surbrillance les liaisons connectées au composant actuellement
// sélectionné, sans avoir à cliquer sur leur trait fin.
function syncCrossHighlight() {
  linksLayer.highlightForComponent(componentsLayer.selectedId);
}

function refreshUndoState() {
  undoMenuButton.disabled = !store.canUndo();
}

// Point d'entrée unique pour changer d'étage affiché (sélecteur, "aller à
// l'exemplaire lié", création/suppression d'étage) : garde le stage, les
// calques et le sélecteur synchronisés.
async function switchToFloor(floorId) {
  const floor = store.getFloorById(floorId);
  if (!floor) return;
  floorSelectEl.value = floor.id;
  await stage.loadFloor(floor);
  componentsLayer.setFloor(floor.id);
  linksLayer.setFloor(floor.id);
  propertiesPanel.refresh();
}

store.onChange(() => {
  componentsLayer.render();
  linksLayer.render();
  refreshUndoState();
  // Différé : si le changement vient d'un champ du panneau lui-même (évènement
  // "change" en cours), reconstruire son DOM tout de suite fait planter le
  // navigateur ("node no longer a child" pendant le blur de ce même champ).
  queueMicrotask(() => propertiesPanel.refresh());
});

floorSelectEl.addEventListener("change", () => switchToFloor(floorSelectEl.value));

// --- Modes d'interaction -------------------------------------------------
// La liaison se propose directement au clic sur un composant (voir
// onComponentClicked plus haut), plus besoin d'un outil "Tracer" à armer.
// Il reste deux modes exclusifs : sélection (défaut) et mesure.
function exitMeasuring() {
  if (!measureModeButtonEl.classList.contains("toolbar__button--armed")) return;
  measureTool.setActive(false);
  measureModeButtonEl.classList.remove("toolbar__button--armed");
  componentsLayer.setSuspended(false);
  stage.svgEl.classList.remove("stage__svg--measuring");
  selectModeButtonEl.classList.add("toolbar__button--armed");
}

selectModeButtonEl.addEventListener("click", () => {
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linksLayer.stopLinking();
  exitMeasuring();
});

measureModeButtonEl.addEventListener("click", () => {
  const wasActive = measureModeButtonEl.classList.contains("toolbar__button--armed");
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linksLayer.stopLinking();
  exitMeasuring();
  if (wasActive) return;
  selectModeButtonEl.classList.remove("toolbar__button--armed");
  measureModeButtonEl.classList.add("toolbar__button--armed");
  stage.svgEl.classList.add("stage__svg--measuring");
  componentsLayer.setSuspended(true);
  measureTool.setActive(true);
});

// Échap : désélectionne, annule une liaison en attente (déjà géré dans
// ComponentsLayer/LinksLayer), et sort du mode mesure.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || isEditingText(event.target)) return;
  exitMeasuring();
});

// L'annulation peut porter sur la liste des étages elle-même (création,
// renommage, suppression) : après un undo, le sélecteur d'étage doit refléter
// la liste restaurée, et si l'étage affiché n'existe plus on bascule sur le
// premier disponible.
function undoAndSyncFloors() {
  if (!store.undo()) return;
  renderFloorOptions();
  if (!store.getFloorById(componentsLayer.floorId)) {
    switchToFloor(store.getFloors()[0].id);
  }
}

// Ctrl/Cmd+Z : annuler. Si le focus est dans un champ de texte, on laisse le
// navigateur gérer son propre undo natif plutôt que d'annuler une action du plan.
window.addEventListener("keydown", (event) => {
  if (isEditingText(event.target)) return;
  const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
  if (!isUndoShortcut) return;
  event.preventDefault();
  undoAndSyncFloors();
});

const menuBar = new MenuBar([
  { triggerId: "menu-file-trigger", dropdownId: "menu-file-dropdown" },
  { triggerId: "menu-edit-trigger", dropdownId: "menu-edit-dropdown" },
  { triggerId: "menu-plan-trigger", dropdownId: "menu-plan-dropdown" },
]);

menuBar.onAction("#menu-save-project", () => exportProjectFile(store));
menuBar.onAction("#menu-open-project", () => importFileInputEl.click());
importFileInputEl.addEventListener("change", async () => {
  const file = importFileInputEl.files[0];
  importFileInputEl.value = "";
  if (!file) return;
  if (!confirm("Ouvrir ce projet remplacera tous les étages actuels (annulable avec Édition > Annuler). Continuer ?")) {
    return;
  }
  try {
    await importProjectFile(store, file);
    renderFloorOptions();
    await switchToFloor(store.getFloors()[0].id);
  } catch (error) {
    alert(error.message);
  }
});

// Les exports couvrent toujours tous les étages (un fichier par étage pour
// SVG/PNG, une seule PDF multi-pages pour PDF/impression), pas seulement
// celui affiché à l'écran.
menuBar.onAction("#menu-export-svg", () => exportSvg(stage, componentsLayer, linksLayer, store));
menuBar.onAction("#menu-export-png", () => exportPng(stage, componentsLayer, linksLayer, store));
menuBar.onAction("#menu-export-pdf", () => exportPdf(stage, componentsLayer, linksLayer, store));
menuBar.onAction("#menu-print", () => exportPdf(stage, componentsLayer, linksLayer, store));
menuBar.onAction("#menu-undo", () => undoAndSyncFloors());
menuBar.onAction("#menu-clear", () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (confirm(`Effacer tous les composants de l'étage "${floor.label}" ? Cette action peut être annulée avec Édition > Annuler.`)) {
    store.clearFloor(floor.id);
  }
});

const elementsListDialog = new ElementsListDialog({
  store,
  stage,
  componentsLayer,
  getFloor: () => store.getFloorById(floorSelectEl.value),
});
menuBar.onAction("#menu-elements-list", () => elementsListDialog.open());

// Gestion des étages : créer un étage vierge (pas de plan de fond importé,
// voir Stage.loadFloor), renommer ou supprimer l'étage affiché.
menuBar.onAction("#menu-new-floor", async () => {
  const name = await promptFloorName({
    title: "Nouvel étage",
    submitLabel: "Créer l'étage",
    defaultName: `Étage ${store.getFloors().length + 1}`,
  });
  if (!name) return;
  const floor = store.addFloor(name);
  renderFloorOptions();
  await switchToFloor(floor.id);
});

menuBar.onAction("#menu-rename-floor", async () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (!floor) return;
  const name = await promptFloorName({ title: "Renommer l'étage", submitLabel: "Renommer", defaultName: floor.label });
  if (!name) return;
  store.renameFloor(floor.id, name);
  renderFloorOptions();
});

menuBar.onAction("#menu-delete-floor", async () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (!floor) return;
  if (store.getFloors().length <= 1) {
    alert("Impossible de supprimer le dernier étage : il en faut toujours au moins un.");
    return;
  }
  const remainingFloor = store.getFloors().find((f) => f.id !== floor.id);
  if (
    !confirm(
      `Supprimer l'étage "${floor.label}" et tout son contenu (composants, liaisons) ? Cette action peut être annulée avec Édition > Annuler.`,
    )
  ) {
    return;
  }
  if (store.removeFloor(floor.id)) {
    renderFloorOptions();
    await switchToFloor(remainingFloor.id);
  }
});

const initialFloor = store.getFloors()[0];
switchToFloor(initialFloor.id);
refreshUndoState();
