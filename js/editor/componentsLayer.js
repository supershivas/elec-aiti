import { getCatalogEntry } from "../catalog/components.js";
import { isEditingText } from "./domUtils.js";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const DEFAULT_SYMBOL_SIZE = 40;
const HITBOX_PADDING = 16;
const CLICK_THRESHOLD_PX = 6;

// Gère l'affichage, la sélection, le déplacement et la rotation des composants posés
export class ComponentsLayer {
  constructor({ layerEl, stage, store, onPlacementConsumed, onSelect }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onPlacementConsumed = onPlacementConsumed;
    this.onSelect = onSelect;
    this.floorId = null;
    this.armedType = null;
    this.selectedId = null;
    this.dragState = null;
    this.placementStart = null;
    this.linkPickHandler = null;
    this.pendingHighlightId = null;
    this.snapTargetId = null;

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
    this.stage.svgEl.classList.toggle("stage__svg--placing", Boolean(type));
  }

  setLinkPickHandler(handler) {
    this.linkPickHandler = handler;
  }

  // Ces deux surbrillances changent potentiellement à chaque pointermove pendant
  // le tracé d'une liaison : on bascule juste la classe CSS sur l'élément déjà
  // présent dans le DOM plutôt que de tout reconstruire via render().
  setPendingHighlight(id) {
    this.toggleHighlightClass(this.pendingHighlightId, "component--link-pending", false);
    this.pendingHighlightId = id;
    this.toggleHighlightClass(id, "component--link-pending", true);
  }

  setSnapHighlight(id) {
    this.toggleHighlightClass(this.snapTargetId, "component--link-target", false);
    this.snapTargetId = id;
    this.toggleHighlightClass(id, "component--link-target", true);
  }

  toggleHighlightClass(id, className, add) {
    if (!id) return;
    this.layerEl.querySelector(`[data-component-id="${id}"]`)?.classList.toggle(className, add);
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
    if (component.id === this.pendingHighlightId) group.classList.add("component--link-pending");
    if (component.id === this.snapTargetId) group.classList.add("component--link-target");
    group.setAttribute("transform", `translate(${component.x} ${component.y}) rotate(${component.rotation})`);
    group.dataset.componentId = component.id;

    const width = component.width ?? entry.width ?? DEFAULT_SYMBOL_SIZE;
    const height = component.height ?? entry.height ?? DEFAULT_SYMBOL_SIZE;

    // Zone de clic invisible, plus grande que le pictogramme visible : les symboles
    // fins (traits d'interrupteur, cercles ouverts) sont sinon très difficiles à sélectionner.
    const hitboxSize = Math.max(width, height) + HITBOX_PADDING;
    const hitbox = document.createElementNS(SVG_NS, "rect");
    hitbox.setAttribute("x", -hitboxSize / 2);
    hitbox.setAttribute("y", -hitboxSize / 2);
    hitbox.setAttribute("width", hitboxSize);
    hitbox.setAttribute("height", hitboxSize);
    hitbox.setAttribute("fill", "transparent");
    group.appendChild(hitbox);

    if (entry.shape === "box") {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", -width / 2);
      rect.setAttribute("y", -height / 2);
      rect.setAttribute("width", width);
      rect.setAttribute("height", height);
      rect.setAttribute("rx", 2);
      rect.classList.add("component__shape");
      group.appendChild(rect);

      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = component.label || entry.abbr || entry.label;
      text.classList.add("component__label");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      group.appendChild(text);
    } else {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#sym-${entry.symbolId}`);
      use.setAttribute("x", -width / 2);
      use.setAttribute("y", -height / 2);
      use.setAttribute("width", width);
      use.setAttribute("height", height);
      use.classList.add("component__shape");
      group.appendChild(use);

      // Prises spécialisées : le symbole reste un pictogramme de prise standard,
      // l'abréviation identifie juste le circuit dédié (four, plaque, ...)
      if (entry.abbr) {
        const badge = document.createElementNS(SVG_NS, "text");
        badge.textContent = entry.abbr;
        badge.classList.add("component__badge");
        badge.setAttribute("x", width / 2 - 1);
        badge.setAttribute("y", -height / 2 + 6);
        badge.setAttribute("text-anchor", "end");
        group.appendChild(badge);
      }
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = component.label || entry.label;
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => this.onComponentPointerDown(event, component));
    return group;
  }

  onComponentPointerDown(event, component) {
    event.stopPropagation();
    if (this.linkPickHandler) {
      this.linkPickHandler(component);
      return;
    }
    this.select(component.id);
    this.dragState = {
      pointerId: event.pointerId,
      componentId: component.id,
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      startX: component.x,
      startY: component.y,
      snapshotted: false,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onStagePointerDown(event) {
    if (!this.armedType || !this.floorId) return;
    if (event.target.closest(".component")) return;
    // On ne pose pas encore ici : un clic pose, un glissé doit pouvoir déplacer
    // la vue (pan) même avec un outil armé. Voir onStagePointerUp.
    this.placementStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  onStagePointerMove(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    if (!this.dragState.snapshotted) {
      // Un seul snapshot pour tout le glissé, pris au premier mouvement réel
      // (pas au pointerdown, sinon un simple clic de sélection consommerait
      // un cran d'annulation pour rien).
      this.store.snapshot();
      this.dragState.snapshotted = true;
    }
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const dx = point.x - this.dragState.startPoint.x;
    const dy = point.y - this.dragState.startPoint.y;
    this.store.updateComponent(this.dragState.componentId, {
      x: this.dragState.startX + dx,
      y: this.dragState.startY + dy,
    });
  }

  onStagePointerUp(event) {
    if (this.dragState && this.dragState.pointerId === event.pointerId) {
      this.dragState = null;
      return;
    }
    if (!this.placementStart || this.placementStart.pointerId !== event.pointerId) return;
    const { x, y } = this.placementStart;
    this.placementStart = null;
    const movedPx = Math.hypot(event.clientX - x, event.clientY - y);
    if (movedPx < CLICK_THRESHOLD_PX) {
      this.placeComponent(event);
    }
  }

  placeComponent(event) {
    const entry = getCatalogEntry(this.armedType);
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const extra = {};

    if (entry.customizable) {
      const widthInput = prompt("Largeur du meuble (cm) :", entry.width);
      if (widthInput === null) return;
      const heightInput = prompt("Profondeur du meuble (cm) :", entry.height);
      if (heightInput === null) return;
      const nameInput = prompt("Nom du meuble :", entry.label);
      if (nameInput === null) return;
      extra.width = Math.max(1, Number(widthInput)) || entry.width;
      extra.height = Math.max(1, Number(heightInput)) || entry.height;
      extra.label = nameInput.trim() || entry.label;
    }

    const component = this.store.addComponent({
      type: this.armedType,
      floorId: this.floorId,
      x: point.x,
      y: point.y,
      ...extra,
    });
    this.select(component.id);
    this.onPlacementConsumed?.();
  }

  select(id) {
    this.selectedId = id;
    this.render();
    this.onSelect?.(id);
  }

  clearSelection() {
    if (!this.selectedId) return;
    this.selectedId = null;
    this.render();
  }

  getSelectedComponent() {
    if (!this.selectedId || !this.floorId) return null;
    return this.store.getComponentsForFloor(this.floorId).find((c) => c.id === this.selectedId) ?? null;
  }

  onKeyDown(event) {
    if (!this.selectedId || isEditingText(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeComponent(this.selectedId);
      this.selectedId = null;
    } else if (event.key.toLowerCase() === "r") {
      const component = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === this.selectedId);
      if (component) {
        event.preventDefault();
        this.store.snapshot();
        this.store.updateComponent(this.selectedId, { rotation: (component.rotation + 90) % 360 });
      }
    } else if (event.key === "Escape") {
      this.select(null);
    }
  }
}
