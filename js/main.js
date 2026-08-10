import { Stage } from "./editor/stage.js";
import { Store } from "./state.js";
import { Palette } from "./editor/palette.js";
import { ComponentsLayer } from "./editor/componentsLayer.js";
import { LinksLayer } from "./editor/linksLayer.js";
import { WallsLayer } from "./editor/wallsLayer.js";
import { WallTool } from "./editor/wallTool.js";
import { OpeningTool } from "./editor/openingTool.js";
import { MeasureTool } from "./editor/measureTool.js";
import { PropertiesPanel } from "./editor/propertiesPanel.js";
import { ElementsListDialog } from "./editor/elementsList.js";
import { MenuBar } from "./editor/menuBar.js";
import { ScaleBar } from "./editor/scaleBar.js";
import { linkTypes } from "./catalog/linkTypes.js";
import { isEditingText } from "./editor/domUtils.js";
import { exportSvg, exportPng, exportPdf } from "./io/exportPlan.js";
import { exportProjectFile, importProjectFile } from "./io/projectFile.js";
import { promptFloorName } from "./editor/floorDialog.js";

const svgEl = document.querySelector("#stage-svg");
const errorEl = document.querySelector("#stage-error");
const floorSelectEl = document.querySelector("#floor-select");
const paletteEl = document.querySelector("#palette");
const componentsLayerEl = document.querySelector("#components-layer");
const linksLayerEl = document.querySelector("#links-layer");
const wallsLayerEl = document.querySelector("#walls-layer");
const wallPreviewLayerEl = document.querySelector("#wall-preview-layer");
const measureLayerEl = document.querySelector("#measure-layer");
const propertiesPanelEl = document.querySelector("#properties-panel");
const undoMenuButton = document.querySelector("#menu-undo");
const linkTypeSelectEl = document.querySelector("#link-type-select");
const selectModeButtonEl = document.querySelector("#mode-select");
const wallModeButtonEl = document.querySelector("#mode-wall");
const measureModeButtonEl = document.querySelector("#mode-measure");
// Outil bêta uniquement (voir beta/index.html) : absent du DOM sur l'appli
// principale, donc potentiellement null ici.
const openingModeButtonEl = document.querySelector("#mode-opening");
const openingTypeSelectEl = document.querySelector("#opening-type-select");
const importFileInputEl = document.querySelector("#import-file-input");
const scaleBarLineEl = document.querySelector("#scale-bar-line");
const scaleBarLabelEl = document.querySelector("#scale-bar-label");

for (const linkType of linkTypes) {
  const option = document.createElement("option");
  option.value = linkType.type;
  option.textContent = linkType.label;
  linkTypeSelectEl.appendChild(option);
}

const stage = new Stage(svgEl, errorEl);
const store = new Store();
new ScaleBar({ stage, lineEl: scaleBarLineEl, labelEl: scaleBarLabelEl });

// La liste des étages vit dans le Store (création/renommage/suppression) :
// on reconstruit les options à chaque modification plutôt qu'une fois au
// chargement. Ne pas appeler ça depuis store.onChange (qui se déclenche à
// chaque frame de glissé d'un composant) : seulement après une action qui
// touche vraiment la liste des étages.
function renderFloorOptions() {
  const currentValue = floorSelectEl.value;
  floorSelectEl.replaceChildren();
  for (const floor of store.getFloors()) {
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.label;
    floorSelectEl.appendChild(option);
  }
  if (store.getFloorById(currentValue)) floorSelectEl.value = currentValue;
}
renderFloorOptions();

// Déclarées avant d'être assignées : les calques ont besoin de se référencer
// mutuellement pour que sélectionner l'un désélectionne les autres.
let linksLayer;
let wallsLayer;
let propertiesPanel;

const componentsLayer = new ComponentsLayer({
  layerEl: componentsLayerEl,
  stage,
  store,
  onPlacementConsumed: () => {
    palette.setArmed(null);
    componentsLayer.armPlacement(null);
  },
  onSelect: () => {
    linksLayer.clearSelection();
    wallsLayer.clearSelection();
    syncCrossHighlight();
    propertiesPanel.refresh();
  },
  // Clic simple (pas un glissé) sur un composant déjà posé : propose aussitôt
  // une liaison vers le prochain élément cliqué, sans outil à armer.
  onComponentClicked: (component) => linksLayer.beginFrom(component, linkTypeSelectEl.value),
});
const palette = new Palette({
  containerEl: paletteEl,
  onArm: (type) => {
    setMode("select");
    linksLayer.stopLinking();
    componentsLayer.armPlacement(type);
  },
});

linksLayer = new LinksLayer({
  layerEl: linksLayerEl,
  stage,
  store,
  componentsLayer,
  onSelect: () => {
    componentsLayer.clearSelection();
    wallsLayer.clearSelection();
    syncCrossHighlight();
    propertiesPanel.refresh();
  },
});

wallsLayer = new WallsLayer({
  layerEl: wallsLayerEl,
  stage,
  store,
  onSelect: () => {
    componentsLayer.clearSelection();
    linksLayer.clearSelection();
    propertiesPanel.refresh();
  },
});

const wallTool = new WallTool({ layerEl: wallPreviewLayerEl, stage, store });
const openingTool = new OpeningTool({ stage, store });
const measureTool = new MeasureTool({ layerEl: measureLayerEl, stage });

propertiesPanel = new PropertiesPanel({
  containerEl: propertiesPanelEl,
  store,
  componentsLayer,
  linksLayer,
  wallsLayer,
  // "Aller à l'exemplaire lié" (élément multi-étage) : bascule d'étage puis
  // sélectionne et recentre la vue sur son double.
  onGoToLinkedComponent: async (floorId, componentId) => {
    await switchToFloor(floorId);
    const component = store.getComponentsForFloor(floorId).find((c) => c.id === componentId);
    if (!component) return;
    componentsLayer.select(componentId);
    stage.centerOn(component.x, component.y);
  },
});

// Met en surbrillance les liaisons connectées au composant actuellement
// sélectionné, sans avoir à cliquer sur leur trait fin.
function syncCrossHighlight() {
  linksLayer.highlightForComponent(componentsLayer.selectedId);
}

function refreshUndoState() {
  undoMenuButton.disabled = !store.canUndo();
}

// Point d'entrée unique pour changer d'étage affiché (sélecteur, "aller à
// l'exemplaire lié", création/suppression d'étage) : garde le stage, les
// calques et le sélecteur synchronisés.
async function switchToFloor(floorId) {
  const floor = store.getFloorById(floorId);
  if (!floor) return;
  floorSelectEl.value = floor.id;
  await stage.loadFloor(floor);
  componentsLayer.setFloor(floor.id);
  linksLayer.setFloor(floor.id);
  wallsLayer.setFloor(floor.id);
  wallTool.setFloor(floor.id);
  openingTool.setFloor(floor.id);
  propertiesPanel.refresh();
}

store.onChange(() => {
  componentsLayer.render();
  linksLayer.render();
  wallsLayer.render();
  refreshUndoState();
  // Différé : si le changement vient d'un champ du panneau lui-même (évènement
  // "change" en cours), reconstruire son DOM tout de suite fait planter le
  // navigateur ("node no longer a child" pendant le blur de ce même champ).
  queueMicrotask(() => propertiesPanel.refresh());
});

floorSelectEl.addEventListener("change", () => switchToFloor(floorSelectEl.value));

// --- Modes d'interaction -------------------------------------------------
// La liaison se propose directement au clic sur un composant (voir
// onComponentClicked plus haut), plus besoin d'un outil "Tracer" à armer.
// Modes exclusifs : sélection (défaut), murs, ouvertures (bêta uniquement),
// mesure. En dehors du mode sélection, composants et murs sont "suspendus"
// (plus de sélection/glissé sur l'existant) pour ne pas intercepter les
// clics destinés à l'outil actif.
let currentMode = "select";

function setMode(mode) {
  currentMode = mode;
  selectModeButtonEl.classList.toggle("toolbar__button--armed", mode === "select");
  wallModeButtonEl.classList.toggle("toolbar__button--armed", mode === "wall");
  measureModeButtonEl.classList.toggle("toolbar__button--armed", mode === "measure");
  openingModeButtonEl?.classList.toggle("toolbar__button--armed", mode === "opening");
  stage.svgEl.classList.toggle("stage__svg--measuring", mode === "measure");
  stage.svgEl.classList.toggle("stage__svg--wall-drawing", mode === "wall" || mode === "opening");
  componentsLayer.setSuspended(mode !== "select");
  wallsLayer.setSuspended(mode !== "select");
  measureTool.setActive(mode === "measure");
  wallTool.setActive(mode === "wall");
  openingTool.setActive(mode === "opening");
}

selectModeButtonEl.addEventListener("click", () => {
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linksLayer.stopLinking();
  setMode("select");
});

wallModeButtonEl.addEventListener("click", () => {
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linksLayer.stopLinking();
  setMode(currentMode === "wall" ? "select" : "wall");
});

measureModeButtonEl.addEventListener("click", () => {
  palette.setArmed(null);
  componentsLayer.armPlacement(null);
  linksLayer.stopLinking();
  setMode(currentMode === "measure" ? "select" : "measure");
});

if (openingModeButtonEl) {
  openingModeButtonEl.addEventListener("click", () => {
    palette.setArmed(null);
    componentsLayer.armPlacement(null);
    linksLayer.stopLinking();
    setMode(currentMode === "opening" ? "select" : "opening");
  });
}

if (openingTypeSelectEl) {
  openingTool.setType(openingTypeSelectEl.value);
  openingTypeSelectEl.addEventListener("change", () => openingTool.setType(openingTypeSelectEl.value));
}

// Échap : désélectionne, annule une liaison/mur en attente (déjà géré dans
// ComponentsLayer/LinksLayer/WallTool), et revient au mode sélection.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || isEditingText(event.target)) return;
  setMode("select");
});

// L'annulation peut porter sur la liste des étages elle-même (création,
// renommage, suppression) : après un undo, le sélecteur d'étage doit refléter
// la liste restaurée, et si l'étage affiché n'existe plus on bascule sur le
// premier disponible.
function undoAndSyncFloors() {
  if (!store.undo()) return;
  renderFloorOptions();
  if (!store.getFloorById(componentsLayer.floorId)) {
    switchToFloor(store.getFloors()[0].id);
  }
}

// Ctrl/Cmd+Z : annuler. Si le focus est dans un champ de texte, on laisse le
// navigateur gérer son propre undo natif plutôt que d'annuler une action du plan.
window.addEventListener("keydown", (event) => {
  if (isEditingText(event.target)) return;
  const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
  if (!isUndoShortcut) return;
  event.preventDefault();
  undoAndSyncFloors();
});

const menuBar = new MenuBar([
  { triggerId: "menu-file-trigger", dropdownId: "menu-file-dropdown" },
  { triggerId: "menu-edit-trigger", dropdownId: "menu-edit-dropdown" },
  { triggerId: "menu-plan-trigger", dropdownId: "menu-plan-dropdown" },
]);

menuBar.onAction("#menu-save-project", () => exportProjectFile(store));
menuBar.onAction("#menu-open-project", () => importFileInputEl.click());
importFileInputEl.addEventListener("change", async () => {
  const file = importFileInputEl.files[0];
  importFileInputEl.value = "";
  if (!file) return;
  if (!confirm("Ouvrir ce projet remplacera tous les étages actuels (annulable avec Édition > Annuler). Continuer ?")) {
    return;
  }
  try {
    await importProjectFile(store, file);
    renderFloorOptions();
    await switchToFloor(store.getFloors()[0].id);
  } catch (error) {
    alert(error.message);
  }
});

// Les exports couvrent toujours tous les étages (un fichier par étage pour
// SVG/PNG, une seule PDF multi-pages pour PDF/impression), pas seulement
// celui affiché à l'écran.
menuBar.onAction("#menu-export-svg", () => exportSvg(stage, componentsLayer, linksLayer, wallsLayer, store));
menuBar.onAction("#menu-export-png", () => exportPng(stage, componentsLayer, linksLayer, wallsLayer, store));
menuBar.onAction("#menu-export-pdf", () => exportPdf(stage, componentsLayer, linksLayer, wallsLayer, store));
menuBar.onAction("#menu-print", () => exportPdf(stage, componentsLayer, linksLayer, wallsLayer, store));
menuBar.onAction("#menu-undo", () => undoAndSyncFloors());
menuBar.onAction("#menu-clear", () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (
    confirm(
      `Effacer tout le contenu de l'étage "${floor.label}" (composants, liaisons, murs, ouvertures) ? Cette action peut être annulée avec Édition > Annuler.`,
    )
  ) {
    store.clearFloor(floor.id);
  }
});

const elementsListDialog = new ElementsListDialog({
  store,
  stage,
  componentsLayer,
  getFloor: () => store.getFloorById(floorSelectEl.value),
});
menuBar.onAction("#menu-elements-list", () => elementsListDialog.open());

// Gestion des étages : créer un étage vierge (pas de plan de fond importé,
// voir Stage.loadFloor), renommer ou supprimer l'étage affiché.
menuBar.onAction("#menu-new-floor", async () => {
  const name = await promptFloorName({
    title: "Nouvel étage",
    submitLabel: "Créer l'étage",
    defaultName: `Étage ${store.getFloors().length + 1}`,
  });
  if (!name) return;
  const floor = store.addFloor(name);
  renderFloorOptions();
  await switchToFloor(floor.id);
});

menuBar.onAction("#menu-rename-floor", async () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (!floor) return;
  const name = await promptFloorName({ title: "Renommer l'étage", submitLabel: "Renommer", defaultName: floor.label });
  if (!name) return;
  store.renameFloor(floor.id, name);
  renderFloorOptions();
});

menuBar.onAction("#menu-delete-floor", async () => {
  const floor = store.getFloorById(floorSelectEl.value);
  if (!floor) return;
  if (store.getFloors().length <= 1) {
    alert("Impossible de supprimer le dernier étage : il en faut toujours au moins un.");
    return;
  }
  const remainingFloor = store.getFloors().find((f) => f.id !== floor.id);
  if (
    !confirm(
      `Supprimer l'étage "${floor.label}" et tout son contenu (composants, liaisons) ? Cette action peut être annulée avec Édition > Annuler.`,
    )
  ) {
    return;
  }
  if (store.removeFloor(floor.id)) {
    renderFloorOptions();
    await switchToFloor(remainingFloor.id);
  }
});

const initialFloor = store.getFloors()[0];
switchToFloor(initialFloor.id);
refreshUndoState();
