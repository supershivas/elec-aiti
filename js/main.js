import { floors, getFloorById } from "./floors.js";
import { Stage } from "./editor/stage.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");

for (const floor of floors) {
  const option = document.createElement("option");
  option.value = floor.id;
  option.textContent = floor.label;
  floorSelectEl.appendChild(option);
}

const stage = new Stage(svgEl, errorEl);

floorSelectEl.addEventListener("change", () => {
  const floor = getFloorById(floorSelectEl.value);
  stage.loadFloor(floor);
});

const initialFloor = floors[0];
floorSelectEl.value = initialFloor.id;
stage.loadFloor(initialFloor);
