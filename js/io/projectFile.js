// Export/import du projet complet (tous les étages) au format .aiti (JSON renommé,
// pas de format binaire propriétaire) : circuit-DDMMYYYY.aiti
import { downloadBlob } from "./download.js";

function formatDateForFilename(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

export function exportProjectFile(store) {
  const data = JSON.stringify({ components: store.state.components, liaisons: store.state.liaisons }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  downloadBlob(blob, `circuit-${formatDateForFilename()}.aiti`);
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
  store.loadProject(data);
}
