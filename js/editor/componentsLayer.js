import { getCatalogEntry, isElectrifiable } from "../catalog/components.js";
import { isEditingText } from "./domUtils.js";
import { snapPosition } from "./snapping.js";
import { promptFurnitureDetails } from "./furnitureDialog.js";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const DEFAULT_SYMBOL_SIZE = 40;
const SYMBOL_HITBOX_PADDING = 10;
const BOX_HITBOX_PADDING = 4;
const CLICK_THRESHOLD_PX = 6;
const RESIZE_HANDLE_SIZE = 10;
const MIN_SIZE_CM = 10;
// Postes d'un appareillage groupé (interrupteur double/triple...) : chaque
// poste répète le même pictogramme, plus petit et rapproché, plutôt qu'un
// symbole dédié par variante (voir catalog/components.js, entry.gangable).
const GANG_ICON_SIZE = 22;
const GANG_SPACING = 26;

// Gère l'affichage, la sélection, le déplacement et la rotation des composants posés
export class ComponentsLayer {
  constructor({ layerEl, stage, store, onPlacementConsumed, onSelect, onComponentClicked }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.onPlacementConsumed = onPlacementConsumed;
    this.onSelect = onSelect;
    this.onComponentClicked = onComponentClicked;
    this.floorId = null;
    this.armedType = null;
    this.selectedId = null;
    this.pendingDrag = null;
    this.resizeState = null;
    this.placementStart = null;
    this.linkPickHandler = null;
    this.pendingHighlightId = null;
    this.snapTargetId = null;
    this.suspended = false;

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

  // Pendant l'outil de mesure, les clics sur un composant doivent atteindre le
  // canvas (coordonnées brutes) plutôt que sélectionner/déplacer ce composant.
  setSuspended(suspended) {
    this.suspended = suspended;
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
    const flip = component.flipped ? " scale(-1,1)" : "";
    group.setAttribute("transform", `translate(${component.x} ${component.y}) rotate(${component.rotation})${flip}`);
    group.dataset.componentId = component.id;

    const width = component.width ?? entry.width ?? DEFAULT_SYMBOL_SIZE;
    const height = component.height ?? entry.height ?? DEFAULT_SYMBOL_SIZE;
    const gang = entry.gangable ? Math.min(entry.gangMax ?? 4, Math.max(1, component.gang ?? 1)) : 1;
    const gangWidth = gang > 1 ? (gang - 1) * GANG_SPACING + GANG_ICON_SIZE : width;
    const gangHeight = gang > 1 ? GANG_ICON_SIZE : height;

    // Zone de clic invisible. Pour les éléments à emprise réelle (meubles,
    // électroménager, porte...), elle colle à la forme même (rectangulaire,
    // pas un carré qui déborderait) ; pour les petits symboles (prises,
    // interrupteurs...), une marge modeste compense leur trait fin.
    const isRealFootprint = entry.shape === "box" || entry.shape === "door";
    const hitboxWidth = isRealFootprint ? width + BOX_HITBOX_PADDING : Math.max(gangWidth, gangHeight) + SYMBOL_HITBOX_PADDING;
    const hitboxHeight = isRealFootprint ? height + BOX_HITBOX_PADDING : Math.max(gangWidth, gangHeight) + SYMBOL_HITBOX_PADDING;
    const hitbox = document.createElementNS(SVG_NS, "rect");
    hitbox.setAttribute("x", -hitboxWidth / 2);
    hitbox.setAttribute("y", -hitboxHeight / 2);
    hitbox.setAttribute("width", hitboxWidth);
    hitbox.setAttribute("height", hitboxHeight);
    hitbox.setAttribute("fill", "transparent");
    group.appendChild(hitbox);

    if (entry.shape === "door") {
      // Vantail (ligne du seuil + vantail ouvert à 90°) et arc de débattement
      // pointillé, comme sur le plan de fond.
      const half = width / 2;
      const hinge = { x: -half, y: half };
      const leafTip = { x: -half, y: -half };
      const otherJamb = { x: half, y: half };

      const openingLine = document.createElementNS(SVG_NS, "line");
      openingLine.setAttribute("x1", hinge.x);
      openingLine.setAttribute("y1", hinge.y);
      openingLine.setAttribute("x2", otherJamb.x);
      openingLine.setAttribute("y2", otherJamb.y);
      openingLine.classList.add("component__door-line");
      group.appendChild(openingLine);

      const leafLine = document.createElementNS(SVG_NS, "line");
      leafLine.setAttribute("x1", hinge.x);
      leafLine.setAttribute("y1", hinge.y);
      leafLine.setAttribute("x2", leafTip.x);
      leafLine.setAttribute("y2", leafTip.y);
      leafLine.classList.add("component__door-line");
      group.appendChild(leafLine);

      const arc = document.createElementNS(SVG_NS, "path");
      arc.setAttribute("d", `M ${leafTip.x} ${leafTip.y} A ${width} ${width} 0 0 1 ${otherJamb.x} ${otherJamb.y}`);
      arc.classList.add("component__door-arc");
      group.appendChild(arc);
    } else if (entry.shape === "box") {
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
    } else if (gang > 1) {
      // Appareillage à plusieurs postes : le même pictogramme répété, plus
      // petit et rapproché, plutôt qu'un symbole dédié par variante.
      const span = (gang - 1) * GANG_SPACING;
      for (let i = 0; i < gang; i++) {
        const cx = -span / 2 + i * GANG_SPACING;
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#sym-${entry.symbolId}`);
        use.setAttribute("x", cx - GANG_ICON_SIZE / 2);
        use.setAttribute("y", -GANG_ICON_SIZE / 2);
        use.setAttribute("width", GANG_ICON_SIZE);
        use.setAttribute("height", GANG_ICON_SIZE);
        use.classList.add("component__shape");
        group.appendChild(use);
      }
    } else {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#sym-${entry.symbolId}`);
      use.setAttribute("x", -width / 2);
      use.setAttribute("y", -height / 2);
      use.setAttribute("width", width);
      use.setAttribute("height", height);
      use.classList.add("component__shape");
      group.appendChild(use);

      // Prises spécialisées : le symbole reste un pictogramme de prise standard
      // (sans broches, voir sym-prise-specialisee), l'abréviation au centre du
      // cercle identifie le circuit dédié (four, plaque, ...).
      if (entry.abbr) {
        const badge = document.createElementNS(SVG_NS, "text");
        badge.textContent = entry.abbr;
        badge.classList.add("component__badge");
        badge.setAttribute("x", 0);
        badge.setAttribute("y", 0.5);
        badge.setAttribute("text-anchor", "middle");
        badge.setAttribute("dominant-baseline", "central");
        group.appendChild(badge);
      }
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = component.comment ? `${component.label || entry.label}\n${component.comment}` : component.label || entry.label;
    group.appendChild(title);

    // Poignée de redimensionnement à la main, uniquement sur le meuble
    // personnalisé sélectionné (les autres tailles réelles se règlent dans
    // le panneau de propriétés, en cm précis).
    if (entry.customizable && component.id === this.selectedId) {
      const handle = document.createElementNS(SVG_NS, "rect");
      handle.setAttribute("x", width / 2 - RESIZE_HANDLE_SIZE / 2);
      handle.setAttribute("y", height / 2 - RESIZE_HANDLE_SIZE / 2);
      handle.setAttribute("width", RESIZE_HANDLE_SIZE);
      handle.setAttribute("height", RESIZE_HANDLE_SIZE);
      handle.classList.add("component__resize-handle");
      handle.addEventListener("pointerdown", (event) => this.onResizeHandlePointerDown(event, component));
      group.appendChild(handle);
    }

    group.addEventListener("pointerdown", (event) => this.onComponentPointerDown(event, component));
    return group;
  }

  onResizeHandlePointerDown(event, component) {
    event.stopPropagation();
    this.store.snapshot();
    this.resizeState = {
      pointerId: event.pointerId,
      componentId: component.id,
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      startWidth: component.width,
      startHeight: component.height,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  onComponentPointerDown(event, component) {
    if (this.suspended) return;
    event.stopPropagation();
    if (this.linkPickHandler) {
      const entry = getCatalogEntry(component.type);
      if (isElectrifiable(component, entry)) this.linkPickHandler(component);
      return;
    }
    // On ne sait pas encore si ce sera un clic (sélection + proposition de
    // liaison) ou un glissé (déplacement) : voir onStagePointerMove/Up.
    this.pendingDrag = {
      pointerId: event.pointerId,
      componentId: component.id,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: this.stage.clientToViewBoxPoint(event.clientX, event.clientY),
      startX: component.x,
      startY: component.y,
      dragging: false,
      snapshotted: false,
    };
    this.layerEl.setPointerCapture(event.pointerId);
  }

  handleComponentClick(componentId) {
    const component = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === componentId);
    if (!component) return;
    // Un premier clic sélectionne seulement (sinon on démarre une liaison
    // sans le vouloir juste en regardant les propriétés d'un composant) : la
    // proposition de liaison n'arrive qu'au 2e clic sur ce même composant déjà
    // sélectionné, ou via le bouton "Ajouter une liaison" du panneau de
    // propriétés (voir PropertiesPanel.onAddLiaison).
    const alreadySelected = this.selectedId === componentId;
    this.select(componentId);
    if (!alreadySelected) return;
    // Pas de proposition de liaison si on est en train de poser un autre
    // composant depuis la palette (ça n'aurait pas de sens), ni pour un
    // élément non électrifié (porte, cloison, meuble non coché "Électrifié").
    const entry = getCatalogEntry(component.type);
    if (!this.armedType && isElectrifiable(component, entry)) this.onComponentClicked?.(component);
  }

  onStagePointerDown(event) {
    if (!this.armedType || !this.floorId) return;
    if (event.target.closest(".component")) return;
    // On ne pose pas encore ici : un clic pose, un glissé doit pouvoir déplacer
    // la vue (pan) même avec un outil armé. Voir onStagePointerUp.
    this.placementStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  onStagePointerMove(event) {
    if (this.resizeState && this.resizeState.pointerId === event.pointerId) {
      const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
      // Le centre reste fixe : la poignée (coin bas-droit) déplace donc les
      // deux bords opposés symétriquement, d'où le facteur 2.
      const dx = (point.x - this.resizeState.startPoint.x) * 2;
      const dy = (point.y - this.resizeState.startPoint.y) * 2;
      const width = Math.max(MIN_SIZE_CM, Math.round(this.resizeState.startWidth + dx));
      const height = Math.max(MIN_SIZE_CM, Math.round(this.resizeState.startHeight + dy));
      this.store.updateComponent(this.resizeState.componentId, { width, height });
      return;
    }
    if (!this.pendingDrag || this.pendingDrag.pointerId !== event.pointerId) return;
    const drag = this.pendingDrag;
    if (!drag.dragging) {
      const movedPx = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y);
      if (movedPx < CLICK_THRESHOLD_PX) return;
      drag.dragging = true;
      // Un seul snapshot pour tout le glissé, pris au premier mouvement réel
      // (pas au pointerdown, sinon un simple clic de sélection consommerait
      // un cran d'annulation pour rien).
      this.store.snapshot();
    }
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const rawX = drag.startX + (point.x - drag.startPoint.x);
    const rawY = drag.startY + (point.y - drag.startPoint.y);

    const component = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === drag.componentId);
    const entry = component && getCatalogEntry(component.type);
    const { x, y } = entry
      ? snapPosition(component, entry, rawX, rawY, this.store.getComponentsForFloor(this.floorId))
      : { x: rawX, y: rawY };

    this.store.updateComponent(drag.componentId, { x, y });
  }

  onStagePointerUp(event) {
    if (this.resizeState && this.resizeState.pointerId === event.pointerId) {
      this.resizeState = null;
      return;
    }
    if (this.pendingDrag && this.pendingDrag.pointerId === event.pointerId) {
      const { dragging, componentId } = this.pendingDrag;
      this.pendingDrag = null;
      if (!dragging) this.handleComponentClick(componentId);
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

  async placeComponent(event) {
    const entry = getCatalogEntry(this.armedType);
    const point = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    const extra = {};

    if (entry.customizable) {
      const details = await promptFurnitureDetails({
        defaultLabel: entry.label,
        defaultWidth: entry.width,
        defaultHeight: entry.height,
        showElectrifiedCheckbox: entry.electrical === "optional",
      });
      if (!details) return; // annulé
      extra.label = details.label;
      extra.width = details.width;
      extra.height = details.height;
      if (entry.electrical === "optional") extra.electrified = details.electrified;
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
