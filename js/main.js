import { floors, getFloorById } from "./floors.js";
import { Stage } from "./editor/stage.js";
import { Store } from "./state.js";
import { Palette } from "./editor/palette.js";
import { ComponentsLayer } from "./editor/componentsLayer.js";
import { MenuBar } from "./editor/menuBar.js";
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");
const paletteEl = document.querySelector("#palette");
const componentsLayerEl = document.querySelector("#components-layer");
const undoMenuButton = document.querySelector("#menu-undo");

for (const floor of floors) {
  const option = document.createElement("option");
  option.value = floor.id;
  option.textContent = floor.label;
  floorSelectEl.appendChild(option);
}

const stage = new Stage(svgEl, errorEl);
const store = new Store();
const componentsLayer = new ComponentsLayer({
  layerEl: componentsLayerEl,
  stage,
  store,
  onPlacementConsumed: () => {
    palette.setArmed(null);
    componentsLayer.armPlacement(null);
  },
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => componentsLayer.armPlacement(type),
});

function refreshUndoState() {
  undoMenuButton.disabled = !store.canUndo();
}

store.onChange(() => {
  componentsLayer.render();
  refreshUndoState();
});

floorSelectEl.addEventListener("change", () => {
  const floor = getFloorById(floorSelectEl.value);
  stage.loadFloor(floor);
  componentsLayer.setFloor(floor.id);
});

const menuBar = new MenuBar([
  { triggerId: "menu-file-trigger", dropdownId: "menu-file-dropdown" },
  { triggerId: "menu-edit-trigger", dropdownId: "menu-edit-dropdown" },
]);

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
refreshUndoState();
