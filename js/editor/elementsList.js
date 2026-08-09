import { getCatalogEntry } from "../catalog/components.js";

// Boîte de dialogue "Liste des éléments" : inventaire des composants posés sur
// l'étage courant, groupés par type, avec un clic pour sélectionner et centrer
// la vue sur un élément précis.
export class ElementsListDialog {
  constructor({ store, stage, componentsLayer, getFloor }) {
    this.store = store;
    this.stage = stage;
    this.componentsLayer = componentsLayer;
    this.getFloor = getFloor;
    this.overlayEl = null;
  }

  open() {
    this.close();
    const floor = this.getFloor();
    const components = this.store.getComponentsForFloor(floor.id);
    const liaisonCount = this.store.getLiaisonsForFloor(floor.id).length;

    const groups = new Map();
    for (const component of components) {
      if (!groups.has(component.type)) groups.set(component.type, []);
      groups.get(component.type).push(component);
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.close();
    });

    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);

    const header = document.createElement("header");
    header.className = "modal__header";
    const title = document.createElement("h2");
    title.textContent = `Éléments du plan — ${floor.label}`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal__close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Fermer");
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "modal__body";
    modal.appendChild(body);

    const summary = document.createElement("p");
    summary.className = "modal__summary";
    summary.textContent = `${components.length} composant${components.length > 1 ? "s" : ""} · ${liaisonCount} liaison${liaisonCount > 1 ? "s" : ""}`;
    body.appendChild(summary);

    if (components.length === 0) {
      const empty = document.createElement("p");
      empty.className = "properties__empty";
      empty.textContent = "Aucun composant posé sur cet étage.";
      body.appendChild(empty);
    }

    for (const [type, items] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const entry = getCatalogEntry(type);
      const group = document.createElement("div");
      group.className = "elements-group";

      const groupTitle = document.createElement("h3");
      groupTitle.className = "elements-group__title";
      groupTitle.textContent = `${entry?.label ?? type} (${items.length})`;
      group.appendChild(groupTitle);

      const list = document.createElement("ul");
      list.className = "elements-group__list";
      for (const component of items) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "elements-group__item";
        button.textContent = component.label || entry?.label || type;
        button.addEventListener("click", () => this.goTo(component));
        li.appendChild(button);
        list.appendChild(li);
      }
      group.appendChild(list);
      body.appendChild(group);
    }

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
  }

  goTo(component) {
    this.stage.centerOn(component.x, component.y);
    this.componentsLayer.select(component.id);
    this.close();
  }

  close() {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}
