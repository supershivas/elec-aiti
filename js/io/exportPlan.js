// Export de tous les étages en SVG / PNG / PDF, sans dépendance externe : un
// fichier par étage pour SVG/PNG, une seule PDF multi-pages (une page par
// étage) pour le PDF/impression. Le PDF passe par la boîte de dialogue
// d'impression du navigateur ("Enregistrer en PDF"), pour éviter d'ajouter
// une librairie de génération PDF juste pour ce besoin.
import { getCatalogEntry } from "../catalog/components.js";
import { floors } from "../floors.js";
import { downloadBlob } from "./download.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LEGEND_ICON_SIZE = 32;
const LEGEND_ROW_HEIGHT = 50;
const LEGEND_COL_WIDTH = 260;
const LEGEND_TOP_PADDING = 40;

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
  }
  return group;
}

// Légende des seuls types de composants réellement posés sur l'étage exporté
// (pas tout le catalogue), en grille sous le plan.
function buildLegendGroup(usedEntries, originX, originY, width) {
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
  usedEntries.forEach((entry, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const itemX = col * LEGEND_COL_WIDTH;
    const itemY = LEGEND_TOP_PADDING + row * LEGEND_ROW_HEIGHT;

    const icon = buildLegendIcon(entry);
    icon.setAttribute("transform", `translate(${itemX + LEGEND_ICON_SIZE / 2}, ${itemY + LEGEND_ICON_SIZE / 2})`);
    group.appendChild(icon);

    const label = document.createElementNS(SVG_NS, "text");
    label.textContent = entry.label;
    label.setAttribute("x", itemX + LEGEND_ICON_SIZE + 12);
    label.setAttribute("y", itemY + LEGEND_ICON_SIZE / 2 + 4);
    label.setAttribute("fill", "#232a30");
    label.setAttribute("font", "400 12px sans-serif");
    group.appendChild(label);
  });

  const rows = Math.ceil(usedEntries.length / columns);
  const height = LEGEND_TOP_PADDING + rows * LEGEND_ROW_HEIGHT;
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
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    .component { color: ${componentColor}; }
    .component .component__shape { fill: ${bgPanel}; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .component__label { fill: currentColor; font: 600 9px sans-serif; }
    .component__badge { fill: currentColor; font: 600 6px sans-serif; }
    .component__door-line { stroke: currentColor; stroke-width: 2; fill: none; }
    .component__door-arc { stroke: currentColor; stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
    .liaison__line { stroke: var(--liaison-color, ${componentColor}); stroke-width: 3; stroke-linecap: round; }
  `;
  clone.insertBefore(style, clone.firstChild);

  // La sélection est un état d'édition, pas une information du schéma exporté
  clone.querySelectorAll(".component--selected, .liaison--selected").forEach((el) => {
    el.classList.remove("component--selected", "liaison--selected");
  });
  // L'outil de mesure est un repère temporaire d'édition, pas une donnée du schéma
  clone.querySelector("#measure-layer")?.remove();

  const usedEntries = [...new Set(store.getComponentsForFloor(floor.id).map((c) => c.type))]
    .map((type) => getCatalogEntry(type))
    .filter(Boolean);

  let totalHeight = height;
  if (usedEntries.length > 0) {
    const legendGap = 24;
    const { group: legendGroup, height: legendHeight } = buildLegendGroup(usedEntries, x, y + height + legendGap, width);
    clone.appendChild(legendGroup);
    totalHeight = height + legendGap + legendHeight;
  }

  clone.setAttribute("viewBox", `${x} ${y} ${width} ${totalHeight}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(totalHeight));

  return { svgString: new XMLSerializer().serializeToString(clone), width, height: totalHeight };
}

// Bascule successivement le stage/les calques sur chaque étage pour en
// construire l'export, puis restaure l'étage et la sélection d'origine.
// C'est le même mécanisme que "Aller à l'exemplaire lié" (multi-étage) : pas
// de rendu hors-écran séparé à maintenir, on réutilise le stage d'édition.
async function forEachFloor(stage, componentsLayer, linksLayer, store, callback) {
  const originalFloorId = componentsLayer.floorId;
  const originalComponentId = componentsLayer.selectedId;
  const originalLiaisonId = linksLayer.selectedId;
  const originalFloor = floors.find((f) => f.id === originalFloorId);

  for (const floor of floors) {
    await stage.loadFloor(floor);
    componentsLayer.setFloor(floor.id);
    linksLayer.setFloor(floor.id);
    const built = buildExportSvgString(stage, floor, store);
    await callback(floor, built);
  }

  if (originalFloor) {
    await stage.loadFloor(originalFloor);
    componentsLayer.setFloor(originalFloor.id);
    linksLayer.setFloor(originalFloor.id);
    if (originalComponentId) componentsLayer.select(originalComponentId);
    if (originalLiaisonId) linksLayer.select(originalLiaisonId);
  }
}

export async function exportSvg(stage, componentsLayer, linksLayer, store) {
  await forEachFloor(stage, componentsLayer, linksLayer, store, async (floor, { svgString }) => {
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

export async function exportPng(stage, componentsLayer, linksLayer, store) {
  await forEachFloor(stage, componentsLayer, linksLayer, store, async (floor, { svgString, width, height }) => {
    const pngBlob = await svgToPngBlob(svgString, width, height);
    downloadBlob(pngBlob, `${floor.id}.png`);
  });
}

export async function exportPdf(stage, componentsLayer, linksLayer, store) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Merci d'autoriser les pop-ups pour exporter en PDF (impression du navigateur).");
    return;
  }
  printWindow.document.write("<title>Génération du PDF…</title>Génération du plan…");

  const pages = [];
  await forEachFloor(stage, componentsLayer, linksLayer, store, async (floor, { svgString, width, height }) => {
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
          .page { break-after: page; }
          .page:last-child { break-after: auto; }
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
