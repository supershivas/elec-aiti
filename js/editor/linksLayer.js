import { getLinkType } from "../catalog/linkTypes.js";
import { getCatalogEntry } from "../catalog/components.js";
import { isEditingText } from "./domUtils.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HIT_STROKE_WIDTH = 14;

// Si un deuxième interrupteur/commande se retrouve câblé sur le même élément
// (typiquement un point lumineux), c'est un montage va-et-vient : on bascule
// automatiquement toutes les liaisons "commande" de ce hub sur ce type, avec
// un circuitId partagé (cf. modèle de données dans CLAUDE.md).
function autoConvertVaEtVient(store, floorId, hubComponentId) {
  const components = store.getComponentsForFloor(floorId);
  const isCommandeFamily = (componentId) => {
    const component = components.find((c) => c.id === componentId);
    return component && getCatalogEntry(component.type)?.category === "Commandes";
  };

  const candidates = store
    .getLiaisonsForFloor(floorId)
    .filter((l) => l.fromComponentId === hubComponentId || l.toComponentId === hubComponentId)
    .filter((l) => isCommandeFamily(l.fromComponentId === hubComponentId ? l.toComponentId : l.fromComponentId));

  if (candidates.length < 2) return;

  const circuitId = candidates.find((l) => l.circuitId)?.circuitId ?? `circuit-${hubComponentId}`;
  for (const liaison of candidates) {
    if (liaison.type !== "va_et_vient" || liaison.circuitId !== circuitId) {
      store.updateLiaison(liaison.id, { type: "va_et_vient", circuitId });
    }
  }
}

// Gère l'affichage, la sélection et le tracé des liaisons entre composants.
// Une liaison ne stocke que les deux ID de composants : sa géométrie est
// recalculée à chaque rendu à partir de leur position courante.
export class LinksLayer {
  constructor({ layerEl, stage, store, componentsLayer, onSelect }) {
    this.layerEl = layerEl;
    this.stage = stage;
    this.store = store;
    this.componentsLayer = componentsLayer;
    this.onSelect = onSelect;
    this.floorId = null;
    this.selectedId = null;
    this.highlightedComponentId = null;
    this.linking = null; // { type, fromId }
    this.previewLineEl = null;

    this.stage.svgEl.addEventListener("pointermove", (event) => this.onStagePointerMove(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  setFloor(floorId) {
    this.floorId = floorId;
    this.selectedId = null;
    this.stopLinking();
    this.render();
  }

  render() {
    this.layerEl.replaceChildren();
    if (!this.floorId) return;
    const components = this.store.getComponentsForFloor(this.floorId);
    const findComponent = (id) => components.find((c) => c.id === id);
    for (const liaison of this.store.getLiaisonsForFloor(this.floorId)) {
      const from = findComponent(liaison.fromComponentId);
      const to = findComponent(liaison.toComponentId);
      if (!from || !to) continue; // liaison orpheline (ne devrait pas arriver, suppression en cascade)
      this.layerEl.appendChild(this.renderLiaison(liaison, from, to));
    }
  }

  renderLiaison(liaison, from, to) {
    const linkType = getLinkType(liaison.type);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("liaison");
    if (liaison.id === this.selectedId) group.classList.add("liaison--selected");
    if (this.highlightedComponentId && (liaison.fromComponentId === this.highlightedComponentId || liaison.toComponentId === this.highlightedComponentId)) {
      group.classList.add("liaison--connected");
    }
    group.dataset.liaisonId = liaison.id;

    // Couleur résolue en dur (pas de var() vers le token) pour rester correcte
    // dans un export SVG/PNG autonome, qui n'a pas accès à design-tokens.css.
    group.style.setProperty("--liaison-color", this.resolveColor(linkType));

    const hit = document.createElementNS(SVG_NS, "line");
    hit.setAttribute("x1", from.x);
    hit.setAttribute("y1", from.y);
    hit.setAttribute("x2", to.x);
    hit.setAttribute("y2", to.y);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", HIT_STROKE_WIDTH);
    group.appendChild(hit);

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.classList.add("liaison__line");
    group.appendChild(line);

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = liaison.comment ? `${linkType.label}\n${liaison.comment}` : linkType.label;
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this.select(liaison.id);
    });
    return group;
  }

  resolveColor(linkType) {
    return getComputedStyle(document.documentElement).getPropertyValue(linkType.colorVar).trim();
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

  // Met en évidence les liaisons connectées au composant sélectionné (dans
  // ComponentsLayer), sans avoir à cliquer directement sur le trait fin de la
  // liaison elle-même.
  highlightForComponent(componentId) {
    if (this.highlightedComponentId === componentId) return;
    this.highlightedComponentId = componentId;
    this.render();
  }

  getSelectedLiaison() {
    if (!this.selectedId || !this.floorId) return null;
    return this.store.getLiaisonsForFloor(this.floorId).find((l) => l.id === this.selectedId) ?? null;
  }

  // Démarre une liaison en attente depuis un composant qu'on vient de cliquer
  // (clic simple, pas de glissé) : pas besoin d'armer un outil "Tracer" au
  // préalable, ça se propose directement.
  beginFrom(component, type) {
    this.linking = { type, fromId: component.id };
    this.componentsLayer.setLinkPickHandler((c) => this.pick(c));
    this.componentsLayer.setPendingHighlight(component.id);
    this.stage.svgEl.classList.add("stage__svg--linking");
    this.showPreviewLine();
  }

  stopLinking() {
    if (!this.linking) return;
    this.linking = null;
    this.componentsLayer.setLinkPickHandler(null);
    this.componentsLayer.setPendingHighlight(null);
    this.componentsLayer.setSnapHighlight(null);
    this.stage.svgEl.classList.remove("stage__svg--linking");
    this.removePreviewLine();
  }

  pick(component) {
    if (!this.linking) return;
    if (this.linking.fromId === component.id) {
      // Reclic sur le même composant : on annule la liaison en cours plutôt
      // que de créer une liaison vers soi-même.
      this.stopLinking();
      return;
    }
    const liaison = this.store.addLiaison({
      floorId: this.floorId,
      type: this.linking.type,
      fromComponentId: this.linking.fromId,
      toComponentId: component.id,
    });
    autoConvertVaEtVient(this.store, this.floorId, liaison.fromComponentId);
    autoConvertVaEtVient(this.store, this.floorId, liaison.toComponentId);
    this.stopLinking();
    this.select(liaison.id);
  }

  // Ligne pointillée qui suit le curseur pendant le tracé, avec "aimantation"
  // sur le composant survolé (l'extrémité se cale pile sur son centre).
  showPreviewLine() {
    this.previewLineEl = document.createElementNS(SVG_NS, "line");
    this.previewLineEl.classList.add("liaison-preview");
    this.previewLineEl.style.setProperty("--liaison-color", this.resolveColor(getLinkType(this.linking.type)));
    this.layerEl.appendChild(this.previewLineEl);
  }

  removePreviewLine() {
    this.previewLineEl?.remove();
    this.previewLineEl = null;
  }

  onStagePointerMove(event) {
    if (!this.linking?.fromId || !this.previewLineEl) return;
    const from = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === this.linking.fromId);
    if (!from) return;

    const hoverEl = event.target.closest(".component");
    const hoverId = hoverEl?.dataset.componentId;
    const snapId = hoverId && hoverId !== this.linking.fromId ? hoverId : null;
    if (snapId !== this.componentsLayer.snapTargetId) {
      this.componentsLayer.setSnapHighlight(snapId);
    }

    let end = this.stage.clientToViewBoxPoint(event.clientX, event.clientY);
    if (snapId) {
      const target = this.store.getComponentsForFloor(this.floorId).find((c) => c.id === snapId);
      if (target) end = { x: target.x, y: target.y };
    }

    this.previewLineEl.setAttribute("x1", from.x);
    this.previewLineEl.setAttribute("y1", from.y);
    this.previewLineEl.setAttribute("x2", end.x);
    this.previewLineEl.setAttribute("y2", end.y);
  }

  onKeyDown(event) {
    if (isEditingText(event.target)) return;
    if (event.key === "Escape") {
      // Échap annule aussi une liaison en attente, même si rien n'est
      // sélectionné (le composant de départ peut avoir été désélectionné).
      this.stopLinking();
      if (this.selectedId) this.select(null);
      return;
    }
    if (!this.selectedId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.store.removeLiaison(this.selectedId);
      this.selectedId = null;
    }
  }
}
