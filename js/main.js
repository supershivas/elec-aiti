import { floors, getFloorById } from "./floors.js";
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
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";
import { exportProjectFile, importProjectFile } from "./io/projectFile.js";

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
const linkToolToggleEl = document.querySelector("#link-tool-toggle");
const selectModeButtonEl = document.querySelector("#mode-select");
const measureModeButtonEl = document.querySelector("#mode-measure");
const importFileInputEl = document.querySelector("#import-file-input");
const scaleBarLineEl = document.querySelector("#scale-bar-line");
const scaleBarLabelEl = document.querySelector("#scale-bar-label");

for (const floor of floors) {
  const option = document.createElement("option");
  option.value = floor.id;
  option.textContent = floor.label;
  floorSelectEl.appendChild(option);
}

for (const linkType of linkTypes) {
  const option = document.createElement("option");
  option.value = linkType.type;
  option.textContent = linkType.label;
  linkTypeSelectEl.appendChild(option);
}

const stage = new Stage(svgEl, errorEl);
const store = new Store();
new ScaleBar({ stage, lineEl: scaleBarLineEl, labelEl: scaleBarLabelEl });

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
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => {
    exitLinkingAndMeasuring();
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
});

// Met en surbrillance les liaisons connectées au composant actuellement
// sélectionné, sans avoir à cliquer sur leur trait fin.
function syncCrossHighlight() {
  linksLayer.highlightForComponent(componentsLayer.selectedId);
}

function refreshUndoState() {
  undoMenuButton.disabled = !store.canUndo();
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

floorSelectEl.addEventListener("change", () => {
  const floor = getFloorById(floorSelectEl.value);
  stage.loadFloor(floor);
  componentsLayer.setFloor(floor.id);
  linksLayer.setFloor(floor.id);
  propertiesPanel.refresh();
});

// --- Modes d'interaction -------------------------------------------------
// Un seul outil actif à la fois : sélection (défaut), pose depuis la palette,
// tracé de liaison, ou mesure. Chaque outil sait comment se désarmer proprement.
function exitLinkingAndMeasuring() {
  linksLayer.stopLinking();
  linkToolToggleEl.classList.remove("toolbar__button--armed");
  measureTool.setActive(false);
  measureModeButtonEl.classList.remove("toolbar__button--armed");
  componentsLayer.setSuspended(false);
  stage.svgEl.classList.remove("stage__svg--linking", "stage__svg--measuring");
  selectModeButtonEl.classList.add("toolbar__button--armed");
}

selectModeButtonEl.addEventListener("click", () => {
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  exitLinkingAndMeasuring();
});

linkToolToggleEl.addEventListener("click", () => {
  const wasActive = linkToolToggleEl.classList.contains("toolbar__button--armed");
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  exitLinkingAndMeasuring();
  if (wasActive) return;
  selectModeButtonEl.classList.remove("toolbar__button--armed");
  linkToolToggleEl.classList.add("toolbar__button--armed");
  stage.svgEl.classList.add("stage__svg--linking");
  linksLayer.startLinking(linkTypeSelectEl.value);
});

linkTypeSelectEl.addEventListener("change", () => {
  if (linkToolToggleEl.classList.contains("toolbar__button--armed")) {
    linksLayer.startLinking(linkTypeSelectEl.value);
  }
});

measureModeButtonEl.addEventListener("click", () => {
  const wasActive = measureModeButtonEl.classList.contains("toolbar__button--armed");
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  exitLinkingAndMeasuring();
  if (wasActive) return;
  selectModeButtonEl.classList.remove("toolbar__button--armed");
  measureModeButtonEl.classList.add("toolbar__button--armed");
  stage.svgEl.classList.add("stage__svg--measuring");
  componentsLayer.setSuspended(true);
  measureTool.setActive(true);
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
  } catch (error) {
    alert(error.message);
  }
});

menuBar.onAction("#menu-export-svg", () => exportSvg(stage, getFloorById(floorSelectEl.value), store));
menuBar.onAction("#menu-export-png", () => exportPng(stage, getFloorById(floorSelectEl.value), store));
menuBar.onAction("#menu-export-pdf", () => exportPdf(stage, getFloorById(floorSelectEl.value), store));
menuBar.onAction("#menu-print", () => exportPdf(stage, getFloorById(floorSelectEl.value), store));
menuBar.onAction("#menu-undo", () => store.undo());
menuBar.onAction("#menu-clear", () => {
  const floor = getFloorById(floorSelectEl.value);
  if (confirm(`Effacer tous les composants de l'étage "${floor.label}" ? Cette action peut être annulée avec Édition > Annuler.`)) {
    store.clearFloor(floor.id);
  }
});

const elementsListDialog = new ElementsListDialog({
  store,
  stage,
  componentsLayer,
  getFloor: () => getFloorById(floorSelectEl.value),
});
menuBar.onAction("#menu-elements-list", () => elementsListDialog.open());

const initialFloor = floors[0];
floorSelectEl.value = initialFloor.id;
stage.loadFloor(initialFloor);
componentsLayer.setFloor(initialFloor.id);
linksLayer.setFloor(initialFloor.id);
refreshUndoState();
propertiesPanel.refresh();
