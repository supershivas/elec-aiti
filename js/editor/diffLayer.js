import { getCatalogEntry } from "../catalog/components.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER_RADIUS = 22;

// Superpose au plan affiché les différences entre le projet ouvert et un
// second fichier .aiti chargé pour comparaison (voir main.js, menu Fichier >
// Comparer avec un fichier). Ne touche jamais au Store : le fichier comparé
// reste en mémoire ici, purement pour l'affichage. Diff limité aux
// composants (ajoutés/supprimés/déplacés), identifiés par id — pertinent
// pour comparer deux versions sauvegardées du même projet, pas deux projets
// sans rapport (les id ne correspondraient à rien).
export class DiffLayer {
  constructor({ layerEl, store }) {
    this.layerEl = layerEl;
    this.store = store;
    this.comparisonData = null;
    this.comparisonName = null;
    this.floorId = null;
  }

  isActive() {
    return this.comparisonData !== null;
  }

  getComparisonName() {
    return this.comparisonName;
  }

  setComparisonData(data, name) {
    this.comparisonData = data;
    this.comparisonName = name;
    this.render();
  }

  clear() {
    this.comparisonData = null;
    this.comparisonName = null;
    this.render();
  }

  setFloor(floorId) {
    this.floorId = floorId;
    this.render();
  }

  // Résumé pour la bannière de comparaison (voir main.js) : null si la
  // comparaison n'est pas active, { floorMissing: true } si l'étage affiché
  // n'existe pas dans le fichier comparé (rien à diffuser), sinon les comptes.
  getSummary() {
    if (!this.comparisonData || !this.floorId) return null;
    const floorExists = (this.comparisonData.floors || []).some((f) => f.id === this.floorId);
    if (!floorExists) return { floorMissing: true };
    const { added, removed, modified } = this.computeDiff();
    return { floorMissing: false, added: added.length, removed: removed.length, modified: modified.length };
  }

  computeDiff() {
    const current = this.store.getComponentsForFloor(this.floorId);
    const comparison = (this.comparisonData.components || []).filter((c) => c.floorId === this.floorId);
    const comparisonById = new Map(comparison.map((c) => [c.id, c]));
    const currentById = new Map(current.map((c) => [c.id, c]));

    const added = [];
    const modified = [];
    for (const component of current) {
      const previous = comparisonById.get(component.id);
      if (!previous) {
        added.push(component);
        continue;
      }
      const moved = previous.x !== component.x || previous.y !== component.y;
      const changed =
        moved ||
        previous.rotation !== component.rotation ||
        previous.type !== component.type ||
        (previous.label || "") !== (component.label || "");
      if (changed) modified.push({ current: component, previous, moved });
    }

    const removed = comparison.filter((previous) => !currentById.has(previous.id));

    return { added, removed, modified };
  }

  render() {
    this.layerEl.replaceChildren();
    if (!this.comparisonData || !this.floorId) return;
    const floorExists = (this.comparisonData.floors || []).some((f) => f.id === this.floorId);
    if (!floorExists) return;

    const { added, removed, modified } = this.computeDiff();

    for (const component of added) this.drawRing(component.x, component.y, "diff-marker--added");
    for (const { current, previous, moved } of modified) {
      this.drawRing(current.x, current.y, "diff-marker--modified");
      if (moved) this.drawLink(previous.x, previous.y, current.x, current.y);
    }
    for (const previous of removed) this.drawGhost(previous);
  }

  drawRing(x, y, className) {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", MARKER_RADIUS);
    circle.setAttribute("class", `diff-marker ${className}`);
    this.layerEl.appendChild(circle);
  }

  drawLink(x1, y1, x2, y2) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", "diff-marker__link");
    this.layerEl.appendChild(line);
  }

  // Composant présent dans le fichier comparé mais plus dans le projet
  // ouvert : silhouette pointillée à son ancien emplacement, pour voir ce qui
  // a disparu sans avoir à rouvrir l'autre fichier.
  drawGhost(component) {
    const entry = getCatalogEntry(component.type);
    const width = component.width ?? entry?.width ?? 40;
    const height = component.height ?? entry?.height ?? 40;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "diff-ghost");
    group.setAttribute("transform", `translate(${component.x} ${component.y}) rotate(${component.rotation ?? 0})`);

    if (entry?.shape === "symbol") {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#sym-${entry.symbolId}`);
      use.setAttribute("x", -width / 2);
      use.setAttribute("y", -height / 2);
      use.setAttribute("width", width);
      use.setAttribute("height", height);
      group.appendChild(use);
    } else {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", -width / 2);
      rect.setAttribute("y", -height / 2);
      rect.setAttribute("width", width);
      rect.setAttribute("height", height);
      rect.setAttribute("rx", 2);
      group.appendChild(rect);
    }

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `Supprimé depuis la comparaison : ${component.label || entry?.label || component.type}`;
    group.appendChild(title);

    this.layerEl.appendChild(group);
    this.drawRing(component.x, component.y, "diff-marker--removed");
  }
}
