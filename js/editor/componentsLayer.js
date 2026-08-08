import { getCatalogEntry } from "../catalog/components.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SYMBOL_SIZE = 24;

// Gère l'affichage, la sélection, le déplacement et la rotation des composants posés
export class ComponentsLayer {
  constructor({ layerEl, stage, store, onPlacementConsumed }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onPlacementConsumed = onPlacementConsumed;
    this.floorId = null;
    this.armedType = null;
    this.selectedId = null;
    this.dragState = null;

    this.stage.svgEl.addEventListener("pointerdown", (event) => this.onStagePointerDown(event));
    this.stage.svgEl.addEventListener("pointermove", (event) => this.onStagePointerMove(event));
    this.stage.svgEl.addEventListener("pointerup", (event) => this.onStagePointerUp(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  setFloor(floorId) {
    this.floorId = floorId;
    this.selectedId = null;
    this.render();
  }

  armPlacement(type) {
    this.armedType = type;
    this.stage.setPlacementMode(Boolean(type));
    this.stage.svgEl.classList.toggle("stage__svg--placing", Boolean(type));
  }

  render() {
    this.layerEl.replaceChildren();
    if (!this.floorId) return;
    for (const component of this.store.getComponentsForFloor(this.floorId)) {
      this.layerEl.appendChild(this.renderComponent(component));
    }
  }

  renderComponent(component) {
    const entry = getCatalogEntry(component.type);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("component");
    if (component.id === this.selectedId) group.classList.add("component--selected");
    group.setAttribute("transform", `translate(${component.x} ${component.y}) rotate(${component.rotation})`);
    group.dataset.componentId = component.id;

    if (entry.abbr) {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", -SYMBOL_SIZE / 2);
      rect.setAttribute("y", -SYMBOL_SIZE / 2);
      rect.setAttribute("width", SYMBOL_SIZE);
      rect.setAttribute("height", SYMBOL_SIZE);
      rect.setAttribute("rx", 2);
      rect.classList.add("component__shape");
      group.appendChild(rect);

      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = entry.abbr;
      text.classList.add("component__label");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      group.appendChild(text);
    } else {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#sym-${entry.symbolId}`);
      use.setAttribute("x", -SYMBOL_SIZE / 2);
      use.setAttribute("y", -SYMBOL_SIZE / 2);
      use.setAttribute("width", SYMBOL_SIZE);
      use.setAttribute("height", SYMBOL_SIZE);
      use.classList.add("component__shape");
      group.appendChild(use);
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = component.label || entry.label;
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => this.onComponentPointerDown(event, component));
    return group;
  }

  onComponentPointerDown(event, component) {
    event.stopPropagation();
    this.select(component.id);
    this.dragState = {
      pointerId: event.pointerId,
      componentId: component.id,
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      startX: component.x,
      startY: component.y,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onStagePointerDown(event) {
    if (!this.armedType || !this.floorId) return;
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const component = this.store.addComponent({ type: this.armedType, floorId: this.floorId, x: point.x, y: point.y });
    this.select(component.id);
    this.onPlacementConsumed?.();
  }

  onStagePointerMove(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const dx = point.x - this.dragState.startPoint.x;
    const dy = point.y - this.dragState.startPoint.y;
    this.store.updateComponent(this.dragState.componentId, {
      x: this.dragState.startX + dx,
      y: this.dragState.startY + dy,
    });
  }

  onStagePointerUp(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    this.dragState = null;
  }

  select(id) {
    this.selectedId = id;
    this.render();
  }

  onKeyDown(event) {
    if (!this.selectedId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeComponent(this.selectedId);
      this.selectedId = null;
    } else if (event.key.toLowerCase() === "r") {
      const component = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === this.selectedId);
      if (component) {
        this.store.updateComponent(this.selectedId, { rotation: (component.rotation + 90) % 360 });
      }
    } else if (event.key === "Escape") {
      this.selectedId = null;
      this.render();
    }
  }
}
