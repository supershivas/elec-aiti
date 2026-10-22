// Enregistrer / ouvrir un fichier .aiti3d (JSON renommé).
const EXTENSION = '.aiti3d';
const PICKER_TYPES = [{ description: 'Cuisine Aiti (3D)', accept: { 'application/json': [EXTENSION] } }];

let fileHandle = null; // fichier choisi via l'API native : « Enregistrer » le réécrit sans redemander

function defaultName() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `cuisine-${two(d.getDate())}${two(d.getMonth() + 1)}${d.getFullYear()}${EXTENSION}`;
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function write(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Rend true si enregistré, false si annulé.
export async function saveScene(store, { saveAs = false } = {}) {
  const blob = new Blob([JSON.stringify(store.toFile(), null, 2)], { type: 'application/json' });
  const suggested = store.fileName || defaultName();

  if (fileHandle && !saveAs) {
    try {
      await write(fileHandle, blob);
      store.markSaved(fileHandle.name);
      return true;
    } catch {
      fileHandle = null; // droit d'écriture perdu : on redemande ci-dessous
    }
  }

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: suggested, types: PICKER_TYPES });
      await write(handle, blob);
      fileHandle = handle;
      store.markSaved(handle.name);
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      // API indisponible dans ce contexte : repli sur le téléchargement
    }
  }

  // Navigateurs sans API native (Firefox, Safari) : on propose au moins de choisir le nom.
  let name = window.prompt('Nom du fichier', suggested);
  if (name === null) return false;
  name = name.trim() || suggested;
  if (!name.toLowerCase().endsWith(EXTENSION)) name += EXTENSION;
  download(blob, name);
  store.markSaved(name);
  return true;
}

// Ouvre un fichier : sélecteur natif si possible (pour pouvoir le réécrire ensuite),
// sinon le champ <input type="file"> fourni.
export async function openScene(store, fallbackInput) {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES });
      const file = await handle.getFile();
      store.loadFile(await file.text(), file.name);
      fileHandle = handle;
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      throw error;
    }
  }
  fallbackInput.click();
  return false;
}

export async function loadFromInput(store, file) {
  store.loadFile(await file.text(), file.name);
  fileHandle = null;
}

// Après « Nouveau » ou une ouverture : on ne réécrit plus l'ancien fichier par erreur.
export function forgetFile() {
  fileHandle = null;
}
