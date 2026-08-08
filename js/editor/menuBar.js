// Menu "Fichier" / "Édition" en haut de l'appli : ouverture/fermeture des menus déroulants
export class MenuBar {
  constructor(itemIds) {
    this.items = itemIds.map(({ triggerId, dropdownId }) => ({
      trigger: document.querySelector(`#${triggerId}`),
      dropdown: document.querySelector(`#${dropdownId}`),
    }));

    for (const item of this.items) {
      item.trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !item.dropdown.hidden;
        this.closeAll();
        if (!isOpen) this.open(item);
      });
    }

    document.addEventListener("click", () => this.closeAll());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeAll();
    });
  }

  open(item) {
    item.dropdown.hidden = false;
    item.trigger.setAttribute("aria-expanded", "true");
    item.trigger.parentElement.classList.add("menubar__item--open");
  }

  closeAll() {
    for (const item of this.items) {
      item.dropdown.hidden = true;
      item.trigger.setAttribute("aria-expanded", "false");
      item.trigger.parentElement.classList.remove("menubar__item--open");
    }
  }

  // Ferme le menu après avoir cliqué une action, pour les câbler simplement :
  // menuBar.onAction('#menu-undo', () => store.undo())
  onAction(selector, handler) {
    document.querySelector(selector).addEventListener("click", () => {
      this.closeAll();
      handler();
    });
  }
}
