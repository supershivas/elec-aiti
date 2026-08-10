import { catalog, getCatalogEntry, isElectrifiable } from "../catalog/components.js";
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
  constructor({ containerEl, store, componentsLayer, linksLayer, wallsLayer, onGoToLinkedComponent }) {
    this.containerEl = containerEl;
    this.store = store;
    this.componentsLayer = componentsLayer;
    this.linksLayer = linksLayer;
    this.wallsLayer = wallsLayer;
    this.onGoToLinkedComponent = onGoToLinkedComponent;
  }

  refresh() {
    const component = this.componentsLayer.getSelectedComponent();
    const liaison = component ? null : this.linksLayer.getSelectedLiaison();
    const wall = component || liaison ? null : this.wallsLayer.getSelectedWall();
    this.containerEl.replaceChildren();

    // Titre du panneau lui-même (h2, cohérent avec le h1 du bandeau du haut) :
    // distinct du nom de l'élément sélectionné (h3) et des sous-sections (h4).
    const panelTitle = document.createElement("h2");
    panelTitle.className = "properties__panel-title";
    panelTitle.textContent = "Propriétés";
    this.containerEl.appendChild(panelTitle);

    if (component) {
      this.renderComponentProps(component);
    } else if (liaison) {
      this.renderLiaisonProps(liaison);
    } else if (wall) {
      this.renderWallProps(wall);
    } else {
      const empty = document.createElement("p");
      empty.className = "properties__empty";
      empty.textContent = "Sélectionnez un composant, une liaison ou un mur pour voir ses propriétés.";
      this.containerEl.appendChild(empty);
    }
  }

  renderComponentProps(component) {
    const entry = getCatalogEntry(component.type);

    const title = document.createElement("h3");
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

    // Sens d'ouverture (porte) ou toute autre forme à retourner : la rotation
    // par pas de 90° ne suffit pas seule à couvrir toutes les orientations.
    if (entry.mirrorable) {
      const mirrorBtn = document.createElement("button");
      mirrorBtn.type = "button";
      mirrorBtn.className = "toolbar__button";
      mirrorBtn.textContent = "Inverser le sens d'ouverture";
      mirrorBtn.addEventListener("click", () => {
        this.store.snapshot();
        this.store.updateComponent(component.id, { flipped: !component.flipped });
      });
      this.containerEl.appendChild(mirrorBtn);
    }

    // Un meuble personnalisé n'est électrifiable (donc reliable) que si cette
    // case est cochée ; portes et cloisons n'ont pas ce choix (jamais électrifiées).
    if (entry.electrical === "optional") {
      const electrifiedInput = document.createElement("input");
      electrifiedInput.type = "checkbox";
      electrifiedInput.checked = component.electrified === true;
      electrifiedInput.addEventListener("change", () => {
        this.store.snapshot();
        this.store.updateComponent(component.id, { electrified: electrifiedInput.checked });
      });
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "properties__field properties__field--checkbox";
      checkboxLabel.append(electrifiedInput, document.createTextNode(" Électrifié"));
      this.containerEl.appendChild(checkboxLabel);
    }

    // Seuls les composants dimensionnés en cm réels (électroménager, tableau,
    // meuble, porte) exposent une largeur/profondeur éditable.
    if (entry.width !== undefined) {
      const isDoor = entry.shape === "door";
      const width = component.width ?? entry.width;
      const height = component.height ?? entry.height;

      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "1";
      widthInput.value = width;
      widthInput.addEventListener("change", () => {
        const value = Math.max(1, Number(widthInput.value)) || width;
        this.store.snapshot();
        // Une porte n'a qu'une seule dimension : le vantail est toujours carré
        // (largeur d'ouverture = longueur du vantail).
        this.store.updateComponent(component.id, isDoor ? { width: value, height: value } : { width: value });
      });
      this.containerEl.appendChild(field(isDoor ? "Largeur de la porte (cm)" : "Largeur (cm)", widthInput));

      if (!isDoor) {
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
    }

    this.containerEl.appendChild(
      this.buildCommentField(component.comment, (value) => {
        this.store.snapshot();
        this.store.updateComponent(component.id, { comment: value });
      }),
    );

    this.renderLiaisonsSection(component);
    this.renderMultiFloorSection(component);

    // Divider avant les actions globales sur l'élément (dupliquer/supprimer) :
    // ce ne sont pas des propriétés mais des opérations, à distinguer visuellement
    // des sections précédentes (liaisons, multi-étage).
    const divider = document.createElement("hr");
    divider.className = "properties__divider";
    this.containerEl.appendChild(divider);

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.className = "properties__duplicate";
    duplicateBtn.textContent = "Dupliquer";
    duplicateBtn.addEventListener("click", () => {
      const clone = this.store.duplicateComponent(component.id);
      if (clone) this.componentsLayer.select(clone.id);
    });
    this.containerEl.appendChild(duplicateBtn);

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeComponent(component.id)));
  }

  // Un même équipement physique (ex: applique de cage d'escalier) peut être
  // représenté sur deux étages, avec une position propre à chacun mais un lien
  // mutuel entre les deux exemplaires (voir Store.linkToOtherFloor).
  renderMultiFloorSection(component) {
    const heading = document.createElement("h4");
    heading.className = "properties__subtitle";
    heading.textContent = "Multi-étage";
    this.containerEl.appendChild(heading);

    const linked = component.linkedComponentId ? this.store.getComponentById(component.linkedComponentId) : null;

    if (linked) {
      const linkedFloor = this.store.getFloorById(linked.floorId);
      const info = document.createElement("p");
      info.className = "properties__empty";
      info.textContent = `Également posé sur : ${linkedFloor?.label || linked.floorId}.`;
      this.containerEl.appendChild(info);

      const goToBtn = document.createElement("button");
      goToBtn.type = "button";
      goToBtn.className = "toolbar__button";
      goToBtn.textContent = `Aller à l'exemplaire (${linkedFloor?.label || linked.floorId})`;
      goToBtn.addEventListener("click", () => this.onGoToLinkedComponent?.(linked.floorId, linked.id));
      this.containerEl.appendChild(goToBtn);

      const unlinkBtn = document.createElement("button");
      unlinkBtn.type = "button";
      unlinkBtn.className = "toolbar__button";
      unlinkBtn.textContent = "Dissocier les deux étages";
      unlinkBtn.addEventListener("click", () => this.store.unlinkComponent(component.id));
      this.containerEl.appendChild(unlinkBtn);
    } else {
      for (const floor of this.store.getFloors().filter((f) => f.id !== component.floorId)) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "toolbar__button";
        addBtn.textContent = `Ajouter aussi sur : ${floor.label}`;
        addBtn.addEventListener("click", () => {
          const clone = this.store.linkToOtherFloor(component.id, floor.id);
          if (clone) this.onGoToLinkedComponent?.(floor.id, clone.id);
        });
        this.containerEl.appendChild(addBtn);
      }
    }
  }

  buildCommentField(value, onChange) {
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value || "";
    textarea.placeholder = "Note libre (emplacement, remarque, à vérifier...)";
    textarea.addEventListener("change", () => onChange(textarea.value.trim() || undefined));
    return field("Commentaire", textarea);
  }

  // Liste les liaisons connectées à ce composant : pas besoin de cliquer sur le
  // trait fin de la liaison sur le plan pour voir/éditer son type.
  renderLiaisonsSection(component) {
    const liaisons = this.store
      .getLiaisonsForFloor(component.floorId)
      .filter((l) => l.fromComponentId === component.id || l.toComponentId === component.id);
    if (liaisons.length === 0) return;

    const heading = document.createElement("h4");
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
    const title = document.createElement("h3");
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

    this.containerEl.appendChild(
      this.buildCommentField(liaison.comment, (value) => {
        this.store.updateLiaison(liaison.id, { comment: value });
      }),
    );

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeLiaison(liaison.id)));
  }

  // L'épaisseur d'un mur est indépendante de chaque côté (pas centrée sur le
  // segment) : un repère pointillé sur le plan (voir WallsLayer) indique quelle
  // face correspond à "côté 1", pour que ces deux champs restent compréhensibles.
  renderWallProps(wall) {
    const title = document.createElement("h3");
    title.className = "properties__title";
    title.textContent = "Mur";
    this.containerEl.appendChild(title);

    const hint = document.createElement("p");
    hint.className = "properties__empty";
    hint.textContent = "Le repère pointillé sur le plan indique le côté 1.";
    this.containerEl.appendChild(hint);

    const leftInput = document.createElement("input");
    leftInput.type = "number";
    leftInput.min = "0";
    leftInput.value = wall.thicknessLeft;
    leftInput.addEventListener("change", () => {
      const value = Math.max(0, Number(leftInput.value)) || 0;
      this.store.snapshot();
      this.store.updateWall(wall.id, { thicknessLeft: value });
    });
    this.containerEl.appendChild(field("Épaisseur côté 1 (cm)", leftInput));

    const rightInput = document.createElement("input");
    rightInput.type = "number";
    rightInput.min = "0";
    rightInput.value = wall.thicknessRight;
    rightInput.addEventListener("change", () => {
      const value = Math.max(0, Number(rightInput.value)) || 0;
      this.store.snapshot();
      this.store.updateWall(wall.id, { thicknessRight: value });
    });
    this.containerEl.appendChild(field("Épaisseur côté 2 (cm)", rightInput));

    const swapBtn = document.createElement("button");
    swapBtn.type = "button";
    swapBtn.className = "toolbar__button";
    swapBtn.textContent = "Inverser les côtés";
    swapBtn.addEventListener("click", () => {
      this.store.snapshot();
      this.store.updateWall(wall.id, { thicknessLeft: wall.thicknessRight, thicknessRight: wall.thicknessLeft });
    });
    this.containerEl.appendChild(swapBtn);

    const divider = document.createElement("hr");
    divider.className = "properties__divider";
    this.containerEl.appendChild(divider);

    this.containerEl.appendChild(this.buildDeleteButton(() => this.store.removeWall(wall.id)));
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
