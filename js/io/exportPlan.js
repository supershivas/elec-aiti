// Export du plan de l'étage courant en SVG / PNG / PDF, sans dépendance externe.
// Le PDF passe par la boîte de dialogue d'impression du navigateur ("Enregistrer en PDF"),
// pour éviter d'ajouter une librairie de génération PDF juste pour ce besoin.

function buildExportSvgString(stage) {
  const clone = stage.svgEl.cloneNode(true);
  const { x, y, width, height } = stage.baseViewBox;
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");

  // Les classes CSS des composants (couleur rouge, etc.) sont définies dans editor.css,
  // un fichier externe non accessible une fois le SVG exporté seul : on les réécrit en dur.
  const root = getComputedStyle(document.documentElement);
  const componentColor = root.getPropertyValue("--color-component").trim();
  const bgPanel = root.getPropertyValue("--color-bg-panel").trim();
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .component { color: ${componentColor}; }
    .component .component__shape { fill: ${bgPanel}; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .component__label { fill: currentColor; font: 600 9px sans-serif; }
    .component__badge { fill: currentColor; font: 600 6px sans-serif; }
  `;
  clone.insertBefore(style, clone.firstChild);

  // La sélection est un état d'édition, pas une information du schéma exporté
  clone.querySelectorAll(".component--selected").forEach((el) => el.classList.remove("component--selected"));

  return { svgString: new XMLSerializer().serializeToString(clone), width, height };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSvg(stage, floor) {
  const { svgString } = buildExportSvgString(stage);
  downloadBlob(new Blob([svgString], { type: "image/svg+xml" }), `${floor.id}.svg`);
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

export async function exportPng(stage, floor) {
  const { svgString, width, height } = buildExportSvgString(stage);
  const pngBlob = await svgToPngBlob(svgString, width, height);
  downloadBlob(pngBlob, `${floor.id}.png`);
}

export async function exportPdf(stage, floor) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Merci d'autoriser les pop-ups pour exporter en PDF (impression du navigateur).");
    return;
  }
  printWindow.document.write("<title>Génération du PDF…</title>Génération du plan…");

  const { svgString, width, height } = buildExportSvgString(stage);
  const pngBlob = await svgToPngBlob(svgString, width, height);
  const pngUrl = URL.createObjectURL(pngBlob);
  const landscape = width >= height;

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>${floor.label}</title>
        <style>
          @page { size: ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
          html, body { margin: 0; padding: 0; }
          img { display: block; width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <img src="${pngUrl}" alt="${floor.label}" onload="window.print();" />
      </body>
    </html>
  `);
  printWindow.document.close();
}
