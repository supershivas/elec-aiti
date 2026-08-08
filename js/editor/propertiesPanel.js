import { getCatalogEntry } from "../catalog/components.js";
import { linkTypes } from "../catalog/linkTypes.js";

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

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeComponent(component.id)));
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
