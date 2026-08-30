import { getLinkType } from "../catalog/linkTypes.js";
import { getCatalogEntry } from "../catalog/components.js";
import { DEFAULT_SYMBOL_SIZE } from "./componentsLayer.js";
import { isEditingText } from "./domUtils.js";
import { getNotedItems, noteNumbersByKind } from "./notesRegistry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HIT_STROKE_WIDTH = 14;
const GAP_PADDING = 4;

// Rayon approximatif de l'emprise visuelle d'un composant (voir
// ComponentsLayer.renderComponent), pour savoir où s'arrête la portion
// "au-dessus" du trait près de chacune de ses deux extrémités (voir
// renderLiaison) : passé ce rayon, on entre dans l'emprise du composant
// lui-même, où le trait doit au contraire passer derrière lui.
function componentGapRadius(component) {
  const entry = getCatalogEntry(component.type);
  const width = component.width ?? entry?.width ?? DEFAULT_SYMBOL_SIZE;
  const height = component.height ?? entry?.height ?? DEFAULT_SYMBOL_SIZE;
  return Math.max(width, height) / 2 + GAP_PADDING;
}

// Intersection d'un segment [x1,y1]-[x2,y2] avec le cercle (cx,cy,r) : renvoie
// l'intervalle [t1,t2] (paramètre du segment, 0=départ, 1=arrivée) où le
// segment est à l'intérieur du cercle, ou null s'il n'y entre pas.
function segmentCircleIntersection(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = Math.max(0, Math.min(1, (-b - sqrtD) / (2 * a)));
  const t2 = Math.max(0, Math.min(1, (-b + sqrtD) / (2 * a)));
  if (t1 >= t2) return null;
  return [t1, t2];
}

function intersectRange(a, b) {
  const start = Math.max(a[0], b[0]);
  const end = Math.min(a[1], b[1]);
  return end > start ? [start, end] : null;
}

function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// Portions [t1,t2] du trait (voir renderLiaison) à dupliquer au-dessus des
// composants :
// - le milieu du trajet, en excluant l'emprise de chacune de ses deux
//   propres extrémités (là, le trait ne doit rester que dans le calque de
//   base, donc passer derrière son propre composant) ;
// - MAIS, dans cette emprise d'extrémité, la portion qui se trouve aussi
//   sous un composant tiers (ex: un plafonnier posé par-dessus un
//   électroménager) : sans ça, ce composant tiers — pas le sien — cache le
//   trait juste avant qu'il n'atteigne sa propre cible, qui semble alors ne
//   jamais y arriver.
function overlaySegments(from, to, otherComponents) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const totalLength = Math.hypot(dx, dy);
  if (totalLength === 0) return [[0, 1]];

  let tStart = Math.min(0.49, componentGapRadius(from) / totalLength);
  let tEnd = 1 - Math.min(0.49, componentGapRadius(to) / totalLength);
  if (tStart >= tEnd) {
    tStart = 0;
    tEnd = 1;
  }

  const ranges = tEnd > tStart ? [[tStart, tEnd]] : [];
  for (const component of otherComponents) {
    const crossing = segmentCircleIntersection(from.x, from.y, to.x, to.y, component.x, component.y, componentGapRadius(component));
    if (!crossing) continue;
    if (tStart > 0) {
      const overlap = intersectRange(crossing, [0, tStart]);
      if (overlap) ranges.push(overlap);
    }
    if (tEnd < 1) {
      const overlap = intersectRange(crossing, [tEnd, 1]);
      if (overlap) ranges.push(overlap);
    }
  }
  return mergeRanges(ranges);
}

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
  constructor({ layerEl, overlayLayerEl, stage, store, componentsLayer, onSelect }) {
    this.layerEl = layerEl;
    // Calque séparé, situé APRÈS #components-layer dans le SVG hôte : la
    // portion d'une liaison qui traverse un composant tiers y est dupliquée
    // pour toujours rester visible par-dessus les composants (#components-layer
    // est avant, donc en dessous, dans le SVG hôte).
    this.overlayLayerEl = overlayLayerEl;
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
    this.overlayLayerEl?.replaceChildren();
    if (!this.floorId) return;
    const components = this.store.getComponentsForFloor(this.floorId);
    const findComponent = (id) => components.find((c) => c.id === id);
    // Numérotation partagée avec les composants commentés (voir
    // notesRegistry.js) et la légende à l'export (io/exportPlan.js).
    const noteNumbers = noteNumbersByKind(getNotedItems(this.store, this.floorId), "liaison");
    for (const liaison of this.store.getLiaisonsForFloor(this.floorId)) {
      const from = findComponent(liaison.fromComponentId);
      const to = findComponent(liaison.toComponentId);
      if (!from || !to) continue; // liaison orpheline (ne devrait pas arriver, suppression en cascade)
      const others = components.filter((c) => c.id !== from.id && c.id !== to.id);
      this.renderLiaison(liaison, from, to, others);
      const number = noteNumbers.get(liaison.id);
      if (number) this.renderNoteMarker(liaison, from, to, number);
    }
  }

  // Pastille au milieu du trait, dans le calque au-dessus des composants
  // (toujours lisible, comme le reste de la liaison) : même style que les
  // notes de composant (voir ComponentsLayer.renderNoteMarker).
  renderNoteMarker(liaison, from, to, number) {
    const target = this.overlayLayerEl ?? this.layerEl;
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("component-note-marker");
    group.setAttribute("transform", `translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", 6);
    circle.classList.add("component-note-marker__circle");
    group.appendChild(circle);

    const text = document.createElementNS(SVG_NS, "text");
    text.textContent = String(number);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("y", 0.5);
    text.classList.add("component-note-marker__text");
    group.appendChild(text);

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `Note ${number} — ${liaison.comment}`;
    group.appendChild(title);

    target.appendChild(group);
  }

  renderLiaison(liaison, from, to, otherComponents = []) {
    const linkType = getLinkType(liaison.type);
    const color = this.resolveColor(linkType);
    const stateClasses = [];
    if (liaison.id === this.selectedId) stateClasses.push("liaison--selected");
    if (this.highlightedComponentId && (liaison.fromComponentId === this.highlightedComponentId || liaison.toComponentId === this.highlightedComponentId)) {
      stateClasses.push("liaison--connected");
    }

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("liaison", ...stateClasses);
    group.dataset.liaisonId = liaison.id;
    // Couleur résolue en dur (pas de var() vers le token) pour rester correcte
    // dans un export SVG/PNG autonome, qui n'a pas accès à design-tokens.css.
    group.style.setProperty("--liaison-color", color);

    const hit = document.createElementNS(SVG_NS, "line");
    hit.setAttribute("x1", from.x);
    hit.setAttribute("y1", from.y);
    hit.setAttribute("x2", to.x);
    hit.setAttribute("y2", to.y);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", HIT_STROKE_WIDTH);
    group.appendChild(hit);

    // Trait plein et continu, centre à centre (touche vraiment ses deux
    // composants, sans vide ni pointillé sur le trajet). Rendu une première
    // fois dans le calque de base (#links-layer, sous les composants) : ses
    // deux bouts passent donc naturellement derrière leurs propres
    // composants respectifs. Le milieu du trajet (hors emprise de ses deux
    // extrémités) est en plus dupliqué dans le calque au-dessus des
    // composants, pour rester visible s'il traverse un composant tiers en
    // chemin plutôt que de disparaître dessous.
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.classList.add("liaison__line");
    group.appendChild(line);

    if (this.overlayLayerEl) {
      const segments = overlaySegments(from, to, otherComponents);
      if (segments.length > 0) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const overlayGroup = document.createElementNS(SVG_NS, "g");
        overlayGroup.classList.add("liaison", "liaison--overlay", ...stateClasses);
        overlayGroup.style.setProperty("--liaison-color", color);
        overlayGroup.style.pointerEvents = "none";
        for (const [t1, t2] of segments) {
          const overlayLine = document.createElementNS(SVG_NS, "line");
          overlayLine.setAttribute("x1", from.x + t1 * dx);
          overlayLine.setAttribute("y1", from.y + t1 * dy);
          overlayLine.setAttribute("x2", from.x + t2 * dx);
          overlayLine.setAttribute("y2", from.y + t2 * dy);
          overlayLine.classList.add("liaison__line");
          overlayGroup.appendChild(overlayLine);
        }
        this.overlayLayerEl.appendChild(overlayGroup);
      }
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = liaison.comment ? `${linkType.label}\n${liaison.comment}` : linkType.label;
    group.appendChild(title);

    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this.select(liaison.id);
    });
    this.layerEl.appendChild(group);
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
