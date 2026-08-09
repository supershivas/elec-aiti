import { catalog, getCatalogEntry } from "../catalog/components.js";
import { linkTypes, getLinkType } from "../catalog/linkTypes.js";

function field(labelText, inputEl) {
  const wrapper = document.createElement("label");
  wrapper.className = "properties__field";
  const span = document.createElement("span");
  span.className = "properties__field-label";
  span.textContent = labelText;
  wrapper.append(span, inputEl);
  return wrapper;
}

// Panneau de propriétés du composant ou de la liaison sélectionné(e).
// Se contente de relire l'état courant à chaque refresh() : pas d'état interne.
export class PropertiesPanel {
  constructor({ containerEl, store, componentsLayer, linksLayer }) {
    this.containerEl = containerEl;
    this.store = store;
    this.componentsLayer = componentsLayer;
    this.linksLayer = linksLayer;
  }

  refresh() {
    const component = this.componentsLayer.getSelectedComponent();
    const liaison = component ? null : this.linksLayer.getSelectedLiaison();
    this.containerEl.replaceChildren();

    if (component) {
      this.renderComponentProps(component);
    } else if (liaison) {
      this.renderLiaisonProps(liaison);
    } else {
      const empty = document.createElement("p");
      empty.className = "properties__empty";
      empty.textContent = "Sélectionnez un composant ou une liaison pour voir ses propriétés.";
      this.containerEl.appendChild(empty);
    }
  }

  renderComponentProps(component) {
    const entry = getCatalogEntry(component.type);

    const title = document.createElement("h2");
    title.className = "properties__title";
    title.textContent = entry.label;
    this.containerEl.appendChild(title);

    // Changer de type au sein de la même famille (ex: interrupteur simple ->
    // va-et-vient, ou plafonnier -> spot) sans avoir à supprimer/reposer.
    const family = catalog.filter((c) => c.category === entry.category);
    if (family.length > 1) {
      const typeSelect = document.createElement("select");
      for (const familyEntry of family) {
        const option = document.createElement("option");
        option.value = familyEntry.type;
        option.textContent = familyEntry.label;
        if (familyEntry.type === component.type) option.selected = true;
        typeSelect.appendChild(option);
      }
      typeSelect.addEventListener("change", () => {
        this.store.snapshot();
        this.store.updateComponent(component.id, { type: typeSelect.value });
      });
      this.containerEl.appendChild(field("Type", typeSelect));
    }

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = component.label || "";
    labelInput.placeholder = entry.label;
    labelInput.addEventListener("change", () => {
      this.store.snapshot();
      this.store.updateComponent(component.id, { label: labelInput.value.trim() || undefined });
    });
    this.containerEl.appendChild(field("Nom", labelInput));

    const rotationRow = document.createElement("div");
    rotationRow.className = "properties__rotation";
    const rotateLeftBtn = document.createElement("button");
    rotateLeftBtn.type = "button";
    rotateLeftBtn.textContent = "⟲";
    rotateLeftBtn.title = "Pivoter -90°";
    rotateLeftBtn.addEventListener("click", () => {
      this.store.snapshot();
      this.store.updateComponent(component.id, { rotation: (component.rotation + 270) % 360 });
    });
    const rotationValue = document.createElement("span");
    rotationValue.textContent = `${component.rotation}°`;
    const rotateRightBtn = document.createElement("button");
    rotateRightBtn.type = "button";
    rotateRightBtn.textContent = "⟳";
    rotateRightBtn.title = "Pivoter +90°";
    rotateRightBtn.addEventListener("click", () => {
      this.store.snapshot();
      this.store.updateComponent(component.id, { rotation: (component.rotation + 90) % 360 });
    });
    rotationRow.append(rotateLeftBtn, rotationValue, rotateRightBtn);
    this.containerEl.appendChild(field("Rotation", rotationRow));

    // Seuls les composants dimensionnés en cm réels (électroménager, tableau,
    // meuble) exposent une largeur/profondeur éditable.
    if (entry.width !== undefined) {
      const width = component.width ?? entry.width;
      const height = component.height ?? entry.height;

      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "1";
      widthInput.value = width;
      widthInput.addEventListener("change", () => {
        const value = Math.max(1, Number(widthInput.value)) || width;
        this.store.snapshot();
        this.store.updateComponent(component.id, { width: value });
      });
      this.containerEl.appendChild(field("Largeur (cm)", widthInput));

      const heightInput = document.createElement("input");
      heightInput.type = "number";
      heightInput.min = "1";
      heightInput.value = height;
      heightInput.addEventListener("change", () => {
        const value = Math.max(1, Number(heightInput.value)) || height;
        this.store.snapshot();
        this.store.updateComponent(component.id, { height: value });
      });
      this.containerEl.appendChild(field("Profondeur (cm)", heightInput));
    }

    this.renderLiaisonsSection(component);

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeComponent(component.id)));
  }

  // Liste les liaisons connectées à ce composant : pas besoin de cliquer sur le
  // trait fin de la liaison sur le plan pour voir/éditer son type.
  renderLiaisonsSection(component) {
    const liaisons = this.store
      .getLiaisonsForFloor(component.floorId)
      .filter((l) => l.fromComponentId === component.id || l.toComponentId === component.id);
    if (liaisons.length === 0) return;

    const heading = document.createElement("h3");
    heading.className = "properties__subtitle";
    heading.textContent = `Liaisons (${liaisons.length})`;
    this.containerEl.appendChild(heading);

    const components = this.store.getComponentsForFloor(component.floorId);
    for (const liaison of liaisons) {
      const otherId = liaison.fromComponentId === component.id ? liaison.toComponentId : liaison.fromComponentId;
      const other = components.find((c) => c.id === otherId);
      const otherEntry = other ? getCatalogEntry(other.type) : null;
      const linkType = getLinkType(liaison.type);

      const row = document.createElement("button");
      row.type = "button";
      row.className = "properties__liaison-row";

      const swatch = document.createElement("span");
      swatch.className = "properties__liaison-swatch";
      swatch.style.background = getComputedStyle(document.documentElement).getPropertyValue(linkType.colorVar).trim();
      row.appendChild(swatch);

      const text = document.createElement("span");
      text.textContent = `${linkType.label} → ${other?.label || otherEntry?.label || "composant supprimé"}`;
      row.appendChild(text);

      row.addEventListener("click", () => this.linksLayer.select(liaison.id));
      this.containerEl.appendChild(row);
    }
  }

  renderLiaisonProps(liaison) {
    const title = document.createElement("h2");
    title.className = "properties__title";
    title.textContent = "Liaison";
    this.containerEl.appendChild(title);

    const typeSelect = document.createElement("select");
    for (const linkType of linkTypes) {
      const option = document.createElement("option");
      option.value = linkType.type;
      option.textContent = linkType.label;
      if (linkType.type === liaison.type) option.selected = true;
      typeSelect.appendChild(option);
    }
    typeSelect.addEventListener("change", () => {
      this.store.updateLiaison(liaison.id, { type: typeSelect.value });
    });
    this.containerEl.appendChild(field("Type", typeSelect));

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeLiaison(liaison.id)));
  }

  buildDeleteButton(onDelete) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "properties__delete";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", onDelete);
    return deleteBtn;
  }
}
