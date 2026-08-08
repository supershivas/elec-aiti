import { floors, getFloorById } from "./floors.js";
import { Stage } from "./editor/stage.js";
import { Store } from "./state.js";
import { Palette } from "./editor/palette.js";
import { ComponentsLayer } from "./editor/componentsLayer.js";
import { LinksLayer } from "./editor/linksLayer.js";
import { PropertiesPanel } from "./editor/propertiesPanel.js";
import { MenuBar } from "./editor/menuBar.js";
import { linkTypes } from "./catalog/linkTypes.js";
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";
import { exportProjectFile, importProjectFile } from "./io/projectFile.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");
const paletteEl = document.querySelector("#palette");
const componentsLayerEl = document.querySelector("#components-layer");
const linksLayerEl = document.querySelector("#links-layer");
const propertiesPanelEl = document.querySelector("#properties-panel");
const undoMenuButton = document.querySelector("#menu-undo");
const linkTypeSelectEl = document.querySelector("#link-type-select");
const linkToolToggleEl = document.querySelector("#link-tool-toggle");
const importFileInputEl = document.querySelector("#import-file-input");

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

// Déclarée avant d'être assignée : les calques ont besoin de se référencer
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
    propertiesPanel.refresh();
  },
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => {
    disarmLinking();
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
    propertiesPanel.refresh();
  },
});

propertiesPanel = new PropertiesPanel({
  containerEl: propertiesPanelEl,
  store,
  componentsLayer,
  linksLayer,
});

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

let linkingArmed = false;
function disarmLinking() {
  if (!linkingArmed) return;
  linkingArmed = false;
  linkToolToggleEl.classList.remove("toolbar__button--armed");
  stage.svgEl.classList.remove("stage__svg--linking");
  linksLayer.stopLinking();
}

linkToolToggleEl.addEventListener("click", () => {
  if (linkingArmed) {
    disarmLinking();
    return;
  }
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linkingArmed = true;
  linkToolToggleEl.classList.add("toolbar__button--armed");
  stage.svgEl.classList.add("stage__svg--linking");
  linksLayer.startLinking(linkTypeSelectEl.value);
});

linkTypeSelectEl.addEventListener("change", () => {
  if (linkingArmed) linksLayer.startLinking(linkTypeSelectEl.value);
});

const menuBar = new MenuBar([
  { triggerId: "menu-file-trigger", dropdownId: "menu-file-dropdown" },
  { triggerId: "menu-edit-trigger", dropdownId: "menu-edit-dropdown" },
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

const initialFloor = floors[0];
floorSelectEl.value = initialFloor.id;
stage.loadFloor(initialFloor);
componentsLayer.setFloor(initialFloor.id);
linksLayer.setFloor(initialFloor.id);
refreshUndoState();
propertiesPanel.refresh();
