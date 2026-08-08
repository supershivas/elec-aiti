import { floors, getFloorById } from "./floors.js";
import { Stage } from "./editor/stage.js";
import { Store } from "./state.js";
import { Palette } from "./editor/palette.js";
import { ComponentsLayer } from "./editor/componentsLayer.js";
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");
const paletteEl = document.querySelector("#palette");
const componentsLayerEl = document.querySelector("#components-layer");
const exportSvgButton = document.querySelector("#export-svg");
const exportPngButton = document.querySelector("#export-png");
const exportPdfButton = document.querySelector("#export-pdf");

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
    stage.setPlacementMode(false);
  },
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => componentsLayer.armPlacement(type),
});

store.onChange(() => componentsLayer.render());

floorSelectEl.addEventListener("change", () => {
  const floor = getFloorById(floorSelectEl.value);
  stage.loadFloor(floor);
  componentsLayer.setFloor(floor.id);
});

exportSvgButton.addEventListener("click", () => exportSvg(stage, getFloorById(floorSelectEl.value)));
exportPngButton.addEventListener("click", () => exportPng(stage, getFloorById(floorSelectEl.value)));
exportPdfButton.addEventListener("click", () => exportPdf(stage, getFloorById(floorSelectEl.value)));

const initialFloor = floors[0];
floorSelectEl.value = initialFloor.id;
stage.loadFloor(initialFloor);
componentsLayer.setFloor(initialFloor.id);
