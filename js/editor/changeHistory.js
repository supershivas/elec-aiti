const MAX_ENTRIES = 200;

// Journal des modifications de la session courante : chaque action structurelle
// émise par Store.onAction (voir main.js) y est consignée avec un horodatage,
// pour affichage dans ChangeHistoryDialog. Volontairement en mémoire seule (pas
// persisté en localStorage/.aiti) : c'est un journal de session, pas une donnée
// du projet.
export class ChangeHistory {
  constructor() {
    this.entries = [];
  }

  record(message, type) {
    this.entries.unshift({ message, type, timestamp: Date.now() });
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
  }
}
