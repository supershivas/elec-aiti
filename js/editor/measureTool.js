const SVG_NS = "http://www.w3.org/2000/svg";
const CLICK_THRESHOLD_PX = 6;

function formatDistance(cm) {
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(0)} cm`;
}

// Outil de mesure : clic sur un premier point, une ligne pointillée suit le
// curseur avec la distance affichée, clic sur un second point fige la mesure
// (visible jusqu'à la mesure suivante ou la désactivation de l'outil). Purement
// visuel, non sauvegardé (exclu de l'export, voir exportPlan.js).
export class MeasureTool {
  constructor({ layerEl, stage }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.active = false;
    this.startPoint = null;
    this.pointerDownAt = null;
    this.group = null;

    this.stage.svgEl.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.stage.svgEl.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.stage.svgEl.addEventListener("pointerup", (event) => this.onPointerUp(event));
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.stage.svgEl.classList.toggle("stage__svg--measuring", active);
    this.reset();
  }

  reset() {
    this.startPoint = null;
    this.pointerDownAt = null;
    this.group?.remove();
    this.group = null;
  }

  onPointerDown(event) {
    if (!this.active) return;
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    if (!this.active || !this.pointerDownAt) return;
    const movedPx = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
    this.pointerDownAt = null;
    if (movedPx >= CLICK_THRESHOLD_PX) return; // glissé = pan, pas un point de mesure

    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    if (!this.startPoint) {
      this.group?.remove();
      this.startPoint = point;
      this.group = this.buildGroup();
      this.group.classList.add("measure--pending");
      this.updateLine(point);
    } else {
      this.updateLine(point);
      this.group.classList.remove("measure--pending");
      this.startPoint = null;
    }
  }

  onPointerMove(event) {
    if (!this.active || !this.startPoint) return;
    this.updateLine(this.stage.clientToViewBoxPoint(event.clientX, event.clientY));
  }

  buildGroup() {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("measure");
    const line = document.createElementNS(SVG_NS, "line");
    line.classList.add("measure__line");
    const label = document.createElementNS(SVG_NS, "text");
    label.classList.add("measure__label");
    label.setAttribute("text-anchor", "middle");
    group.append(line, label);
    this.layerEl.appendChild(group);
    return group;
  }

  updateLine(to) {
    const from = this.startPoint;
    const line = this.group.querySelector(".measure__line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);

    const label = this.group.querySelector(".measure__label");
    label.setAttribute("x", (from.x + to.x) / 2);
    label.setAttribute("y", (from.y + to.y) / 2 - 8);
    label.textContent = formatDistance(Math.hypot(to.x - from.x, to.y - from.y));
  }
}
