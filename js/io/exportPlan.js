// Export de tous les étages en SVG / PNG / PDF, sans dépendance externe : un
// fichier par étage pour SVG/PNG, une seule PDF multi-pages (une page par
// étage) pour le PDF/impression. Le PDF passe par la boîte de dialogue
// d'impression du navigateur ("Enregistrer en PDF"), pour éviter d'ajouter
// une librairie de génération PDF juste pour ce besoin.
import { getCatalogEntry } from "../catalog/components.js";
import { getLinkType } from "../catalog/linkTypes.js";
import { downloadBlob } from "./download.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LEGEND_ICON_SIZE = 32;
const LEGEND_ROW_HEIGHT = 50;
const LEGEND_COL_WIDTH = 260;
const LEGEND_TOP_PADDING = 40;
const NOTE_MARKER_RADIUS = 6;
const NOTE_ROW_HEIGHT = 16;
const NOTES_TOP_PADDING = 28;

function buildLegendIcon(entry) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("color", "#dc2626");

  if (entry.shape === "door") {
    const half = LEGEND_ICON_SIZE / 2;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      `M ${-half} ${-half} L ${-half} ${half} L ${half} ${-half} M ${-half} ${half} A ${LEGEND_ICON_SIZE} ${LEGEND_ICON_SIZE} 0 0 1 ${half} ${-half}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    group.appendChild(path);
  } else if (entry.shape === "box") {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", -LEGEND_ICON_SIZE / 2);
    rect.setAttribute("y", -LEGEND_ICON_SIZE / 2);
    rect.setAttribute("width", LEGEND_ICON_SIZE);
    rect.setAttribute("height", LEGEND_ICON_SIZE);
    rect.setAttribute("rx", 2);
    rect.setAttribute("fill", "#ffffff");
    rect.setAttribute("stroke", "currentColor");
    rect.setAttribute("stroke-width", "2");
    group.appendChild(rect);
    if (entry.abbr) {
      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = entry.abbr;
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("font", "600 9px sans-serif");
      group.appendChild(text);
    }
  } else {
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#sym-${entry.symbolId}`);
    use.setAttribute("x", -LEGEND_ICON_SIZE / 2);
    use.setAttribute("y", -LEGEND_ICON_SIZE / 2);
    use.setAttribute("width", LEGEND_ICON_SIZE);
    use.setAttribute("height", LEGEND_ICON_SIZE);
    use.setAttribute("fill", "#ffffff");
    use.setAttribute("stroke", "currentColor");
    use.setAttribute("stroke-width", "2");
    use.setAttribute("stroke-linecap", "round");
    use.setAttribute("stroke-linejoin", "round");
    group.appendChild(use);

    // Prises spécialisées : même abréviation centrée que sur le plan (voir
    // ComponentsLayer.renderComponent), pour une légende cohérente.
    if (entry.abbr) {
      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = entry.abbr;
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("font", "600 8px sans-serif");
      group.appendChild(text);
    }
  }
  return group;
}

// Icône de légende pour un type de liaison : un court trait de sa couleur,
// même style que sur le plan (.liaison__line), pour décoder les couleurs de
// circuit (ex: vert = prises, bleu = va-et-vient/éclairage...).
function buildLinkTypeLegendIcon(color) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", -LEGEND_ICON_SIZE / 2);
  line.setAttribute("y1", 0);
  line.setAttribute("x2", LEGEND_ICON_SIZE / 2);
  line.setAttribute("y2", 0);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  return line;
}

// Légende des seuls types de composants réellement posés et types de
// liaisons réellement tracées sur l'étage exporté (pas tout le catalogue),
// en grille sous le plan.
function buildLegendGroup(items, originX, originY, width) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", `translate(${originX}, ${originY})`);

  const title = document.createElementNS(SVG_NS, "text");
  title.textContent = "Légende";
  title.setAttribute("x", 0);
  title.setAttribute("y", 16);
  title.setAttribute("fill", "#232a30");
  title.setAttribute("font", "700 16px sans-serif");
  group.appendChild(title);

  const columns = Math.max(1, Math.floor(width / LEGEND_COL_WIDTH));
  items.forEach(({ label: itemLabel, icon }, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const itemX = col * LEGEND_COL_WIDTH;
    const itemY = LEGEND_TOP_PADDING + row * LEGEND_ROW_HEIGHT;

    icon.setAttribute("transform", `translate(${itemX + LEGEND_ICON_SIZE / 2}, ${itemY + LEGEND_ICON_SIZE / 2})`);
    group.appendChild(icon);

    const label = document.createElementNS(SVG_NS, "text");
    label.textContent = itemLabel;
    label.setAttribute("x", itemX + LEGEND_ICON_SIZE + 12);
    label.setAttribute("y", itemY + LEGEND_ICON_SIZE / 2 + 4);
    label.setAttribute("fill", "#232a30");
    label.setAttribute("font", "400 12px sans-serif");
    group.appendChild(label);
  });

  const rows = Math.ceil(items.length / columns);
  const height = LEGEND_TOP_PADDING + rows * LEGEND_ROW_HEIGHT;
  return { group, height };
}

// Pastille numérotée façon "note de bas de page" (voir buildNotesGroup),
// dupliquée à l'identique sur le plan (à côté du composant commenté) et dans
// la liste de notes en dessous de la légende.
function buildFootnoteMarker(number) {
  const group = document.createElementNS(SVG_NS, "g");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("r", NOTE_MARKER_RADIUS);
  circle.setAttribute("fill", "#d97706");
  circle.setAttribute("stroke", "#ffffff");
  circle.setAttribute("stroke-width", "1");
  group.appendChild(circle);
  const text = document.createElementNS(SVG_NS, "text");
  text.textContent = String(number);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("fill", "#ffffff");
  text.setAttribute("font", "700 7px sans-serif");
  group.appendChild(text);
  return group;
}

// Liste des commentaires des composants sous forme de notes numérotées : un
// commentaire n'est sinon visible que dans le <title> (survol), invisible
// dans un export statique (SVG isolé, PNG, PDF imprimé). Taille distincte de
// la légende (plus petite) : secondaire, et pour rester compact même avec
// beaucoup de notes.
function buildNotesGroup(notedComponents, originX, originY, width) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("transform", `translate(${originX}, ${originY})`);

  const title = document.createElementNS(SVG_NS, "text");
  title.textContent = "Notes";
  title.setAttribute("x", 0);
  title.setAttribute("y", 14);
  title.setAttribute("fill", "#232a30");
  title.setAttribute("font", "700 14px sans-serif");
  group.appendChild(title);

  notedComponents.forEach(({ number, component, entry }, i) => {
    const rowY = NOTES_TOP_PADDING + i * NOTE_ROW_HEIGHT;
    const marker = buildFootnoteMarker(number);
    marker.setAttribute("transform", `translate(${NOTE_MARKER_RADIUS}, ${rowY - 3})`);
    group.appendChild(marker);

    const text = document.createElementNS(SVG_NS, "text");
    text.textContent = `${component.label || entry?.label || component.type} — ${component.comment}`;
    text.setAttribute("x", NOTE_MARKER_RADIUS * 2 + 6);
    text.setAttribute("y", rowY);
    text.setAttribute("fill", "#232a30");
    text.setAttribute("font", "400 10px sans-serif");
    group.appendChild(text);
  });

  const height = NOTES_TOP_PADDING + notedComponents.length * NOTE_ROW_HEIGHT;
  return { group, height };
}

function buildExportSvgString(stage, floor, store) {
  const clone = stage.svgEl.cloneNode(true);
  const { x, y, width, height } = stage.baseViewBox;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");

  // Les classes CSS des composants (couleur rouge, etc.) sont définies dans editor.css,
  // un fichier externe non accessible une fois le SVG exporté seul : on les réécrit en dur.
  const root = getComputedStyle(document.documentElement);
  const componentColor = root.getPropertyValue("--color-component").trim();
  const bgPanel = root.getPropertyValue("--color-bg-panel").trim();
  const planStroke = root.getPropertyValue("--color-plan-stroke").trim();
  const roomFill = root.getPropertyValue("--color-room-fill").trim();
  const borderColor = root.getPropertyValue("--color-border").trim();
  const textMuted = root.getPropertyValue("--color-text-muted").trim();
  const accentHover = root.getPropertyValue("--color-accent-hover").trim();
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    .component { color: ${componentColor}; }
    .component .component__shape { fill: ${bgPanel}; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .component__label { fill: currentColor; font: 600 9px sans-serif; }
    .component__badge { fill: currentColor; font: 600 6px sans-serif; }
    .component__door-line { stroke: currentColor; stroke-width: 2; fill: none; }
    .component__door-arc { stroke: currentColor; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
    .component-note-marker__circle { fill: ${accentHover}; stroke: ${bgPanel}; stroke-width: 1; }
    .component-note-marker__text { fill: #fff; font: 700 7px sans-serif; }
    .liaison__line { stroke: var(--liaison-color, ${componentColor}); stroke-width: 3; stroke-linecap: round; }
    .wall__shape, .wall__joint { fill: ${planStroke}; stroke: none; }
    .opening__door-line { stroke: ${planStroke}; stroke-width: 2; fill: none; }
    .opening__door-arc { stroke: ${planStroke}; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
    .opening__window { fill: ${bgPanel}; stroke: ${planStroke}; stroke-width: 1.5; }
    .room__shape { fill: ${roomFill}; stroke: ${borderColor}; stroke-width: 1; }
    .room__label { fill: ${textMuted}; font: 600 14px sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
  `;
  clone.insertBefore(style, clone.firstChild);

  // La sélection est un état d'édition, pas une information du schéma exporté
  clone
    .querySelectorAll(
      ".component--selected, .liaison--selected, .wall--selected, .wall__joint--selected, .opening--selected, .room--selected",
    )
    .forEach((el) => {
      el.classList.remove(
        "component--selected",
        "liaison--selected",
        "wall--selected",
        "wall__joint--selected",
        "opening--selected",
        "room--selected",
      );
    });
  // Les repères d'édition (outil de mesure, prévisualisation de mur/pièce,
  // poignées d'extrémité/de sommet/repère de côté d'un élément sélectionné,
  // zone de clic d'une ouverture) ne sont pas des données du schéma
  clone.querySelector("#measure-layer")?.remove();
  clone.querySelector("#wall-preview-layer")?.remove();
  clone.querySelector("#room-preview-layer")?.remove();
  clone.querySelector("#diff-layer")?.remove();
  clone
    .querySelectorAll(".wall__endpoint-handle, .wall__side-marker, .wall__hit, .wall__vertex-marker, .opening__hit, .room__vertex-handle")
    .forEach((el) => el.remove());

  // Légende réservée aux éléments électriques : ni les repères non électrifiés
  // (porte, cloison, sanitaire), ni le meuble personnalisé (électrifié ou non,
  // ce n'est pas un composant électrique du catalogue à proprement parler).
  const usedEntries = [...new Set(store.getComponentsForFloor(floor.id).map((c) => c.type))]
    .map((type) => getCatalogEntry(type))
    .filter((entry) => entry && entry.electrical !== false && entry.electrical !== "optional");

  // Types de liaisons réellement tracées sur l'étage (pas tout le catalogue),
  // pour décoder les couleurs de circuit sans avoir à deviner.
  const usedLinkTypes = [...new Set(store.getLiaisonsForFloor(floor.id).map((l) => l.type))].map(getLinkType).filter(Boolean);

  const legendItems = [
    ...usedEntries.map((entry) => ({ label: entry.label, icon: buildLegendIcon(entry) })),
    ...usedLinkTypes.map((linkType) => ({
      label: linkType.label,
      icon: buildLinkTypeLegendIcon(root.getPropertyValue(linkType.colorVar).trim()),
    })),
  ];

  // Commentaires -> notes numérotées (voir buildNotesGroup) : la pastille sur
  // le plan lui-même est déjà dans le clone (ComponentsLayer.renderNoteMarker
  // la rend en direct, comme dans l'appli) ; reste à construire la liste en
  // dessous de la légende, propre à l'export.
  const notedComponents = store
    .getComponentsForFloor(floor.id)
    .filter((c) => c.comment && c.comment.trim())
    .map((component, i) => ({ number: i + 1, component, entry: getCatalogEntry(component.type) }));

  let cursorY = y + height;
  if (legendItems.length > 0) {
    const legendGap = 24;
    const { group: legendGroup, height: legendHeight } = buildLegendGroup(legendItems, x, cursorY + legendGap, width);
    clone.appendChild(legendGroup);
    cursorY += legendGap + legendHeight;
  }
  if (notedComponents.length > 0) {
    const notesGap = 24;
    const { group: notesGroup, height: notesHeight } = buildNotesGroup(notedComponents, x, cursorY + notesGap, width);
    clone.appendChild(notesGroup);
    cursorY += notesGap + notesHeight;
  }
  const totalHeight = cursorY - y;

  clone.setAttribute("viewBox", `${x} ${y} ${width} ${totalHeight}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(totalHeight));

  return { svgString: new XMLSerializer().serializeToString(clone), width, height: totalHeight };
}

// Bascule successivement le stage/les calques sur chaque étage pour en
// construire l'export, puis restaure l'étage et la sélection d'origine.
// C'est le même mécanisme que "Aller à l'exemplaire lié" (multi-étage) : pas
// de rendu hors-écran séparé à maintenir, on réutilise le stage d'édition.
async function forEachFloor(stage, componentsLayer, linksLayer, wallsLayer, store, callback) {
  const originalFloorId = componentsLayer.floorId;
  const originalComponentId = componentsLayer.selectedId;
  const originalLiaisonId = linksLayer.selectedId;
  const allFloors = store.getFloors();
  const originalFloor = allFloors.find((f) => f.id === originalFloorId);

  for (const floor of allFloors) {
    await stage.loadFloor(floor);
    componentsLayer.setFloor(floor.id);
    linksLayer.setFloor(floor.id);
    wallsLayer.setFloor(floor.id);
    const built = buildExportSvgString(stage, floor, store);
    await callback(floor, built);
  }

  if (originalFloor) {
    await stage.loadFloor(originalFloor);
    componentsLayer.setFloor(originalFloor.id);
    linksLayer.setFloor(originalFloor.id);
    wallsLayer.setFloor(originalFloor.id);
    if (originalComponentId) componentsLayer.select(originalComponentId);
    if (originalLiaisonId) linksLayer.select(originalLiaisonId);
  }
}

export async function exportSvg(stage, componentsLayer, linksLayer, wallsLayer, store) {
  await forEachFloor(stage, componentsLayer, linksLayer, wallsLayer, store, async (floor, { svgString }) => {
    downloadBlob(new Blob([svgString], { type: "image/svg+xml" }), `${floor.id}.svg`);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de générer l'image du plan"));
    img.src = url;
  });
}

async function svgToPngBlob(svgString, width, height, scale = 2) {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function exportPng(stage, componentsLayer, linksLayer, wallsLayer, store) {
  await forEachFloor(stage, componentsLayer, linksLayer, wallsLayer, store, async (floor, { svgString, width, height }) => {
    const pngBlob = await svgToPngBlob(svgString, width, height);
    downloadBlob(pngBlob, `${floor.id}.png`);
  });
}

export async function exportPdf(stage, componentsLayer, linksLayer, wallsLayer, store) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Merci d'autoriser les pop-ups pour exporter en PDF (impression du navigateur).");
    return;
  }
  printWindow.document.write("<title>Génération du PDF…</title>Génération du plan…");

  const pages = [];
  await forEachFloor(stage, componentsLayer, linksLayer, wallsLayer, store, async (floor, { svgString, width, height }) => {
    const pngBlob = await svgToPngBlob(svgString, width, height);
    pages.push({ floor, url: URL.createObjectURL(pngBlob), width, height });
  });

  const landscape = pages[0].width >= pages[0].height;
  const pagesHtml = pages
    .map(({ floor, url }) => `<div class="page"><img src="${url}" alt="${floor.label}" /></div>`)
    .join("\n");

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Éditeur de schémas électriques</title>
        <style>
          @page { size: ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
          html, body { margin: 0; padding: 0; }
          img { display: block; width: 100%; height: auto; }
          .page { page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: avoid; break-after: avoid; }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          let loaded = 0;
          const total = document.images.length;
          for (const img of document.images) {
            img.addEventListener("load", () => {
              loaded += 1;
              if (loaded === total) window.print();
            });
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
