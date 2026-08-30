// Export/import du projet complet (tous les étages) au format .aiti (JSON renommé,
// pas de format binaire propriétaire) : circuit-DDMMYYYY.aiti
import { downloadBlob } from "./download.js";
import { promptSaveFilename } from "./saveFileDialog.js";

function formatDateForFilename(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

// Renvoie le nom de fichier effectivement enregistré (pour l'affichage, voir
// Store.setFileName), ou false si l'utilisateur a annulé.
export async function exportProjectFile(store) {
  const data = JSON.stringify(
    {
      floors: store.state.floors,
      components: store.state.components,
      liaisons: store.state.liaisons,
      walls: store.state.walls,
      openings: store.state.openings,
      rooms: store.state.rooms,
    },
    null,
    2,
  );
  const blob = new Blob([data], { type: "application/json" });
  const suggestedName = `circuit-${formatDateForFilename()}.aiti`;

  // Boîte de dialogue "Enregistrer sous" native (choix de l'emplacement et du
  // nom, nom horodaté suggéré par défaut) là où le navigateur la supporte.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: "Projet Éditeur de schémas électriques", accept: { "application/json": [".aiti"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (error.name === "AbortError") return false; // annulé par l'utilisateur
      // Sinon (API indisponible pour ce contexte, erreur d'écriture...) on
      // retombe sur le téléchargement classique ci-dessous.
    }
  }

  // Navigateurs sans File System Access API (Firefox, Safari...) : pas de
  // choix natif de l'emplacement, mais on propose au moins de personnaliser
  // le nom plutôt que d'enregistrer en silence sous le nom par défaut.
  const filename = await promptSaveFilename({ defaultName: suggestedName, extension: ".aiti" });
  if (!filename) return false; // annulé
  downloadBlob(blob, filename);
  return filename;
}

export async function importProjectFile(store, file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier n'est pas un projet .aiti valide (JSON illisible).");
  }
  if (!data || typeof data !== "object" || (!("components" in data) && !("liaisons" in data))) {
    throw new Error("Le fichier n'est pas un projet .aiti valide.");
  }
  store.loadProject(data, file.name);
}
