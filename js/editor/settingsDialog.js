import { loadVersion, loadChangelog } from "../app-update.js";

// Fichiers à la racine du site, que la page soit / ou /beta/.
export const VERSION_URL = new URL("../../version.json", import.meta.url).href;
const CHANGELOG_URL = new URL("../../CHANGELOG.md", import.meta.url).href;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Boîte de dialogue "Réglages" (roue crantée de la barre du haut) : export
// des données en JSON, numéro de version et 5 dernières versions.
export class SettingsDialog {
  constructor({ onExport }) {
    this.onExport = onExport;
    this.overlayEl = null;
  }

  async open() {
    this.close();

    const overlay = el("div", "modal-overlay");
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.close();
    });
    const modal = el("div", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Réglages");
    overlay.appendChild(modal);

    const header = el("header", "modal__header");
    const closeBtn = el("button", "modal__close", "×");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fermer");
    closeBtn.addEventListener("click", () => this.close());
    header.append(el("h2", null, "Réglages"), closeBtn);

    const body = el("div", "modal__body settings");
    const exportBtn = el("button", "toolbar__button toolbar__button--primary", "Exporter mes données (JSON)");
    exportBtn.type = "button";
    exportBtn.addEventListener("click", () => this.onExport());
    const version = el("p", "settings__version", "");
    const changelog = el("div", "settings__changelog");
    body.append(el("h3", "settings__title", "Sauvegarde"), exportBtn, version, changelog);

    modal.append(header, body);
    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    const [current, entries] = await Promise.all([loadVersion(VERSION_URL), loadChangelog(CHANGELOG_URL)]);
    if (current) version.textContent = `Version ${current}`;
    if (entries.length) {
      changelog.append(el("h3", "settings__title", "Nouveautés"));
      const list = el("ol", "settings__list");
      for (const entry of entries) {
        const item = el("li");
        item.append(el("strong", null, `v${entry.version}`), document.createTextNode(entry.date ? ` · ${entry.date}` : ""));
        const changes = el("ul");
        changes.append(...entry.changes.map((change) => el("li", null, change)));
        item.append(changes);
        list.append(item);
      }
      changelog.append(list);
    }
  }

  close() {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}
