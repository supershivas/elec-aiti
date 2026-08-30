function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Boîte de dialogue "Historique" : journal chronologique des actions de la
// session (voir ChangeHistory), le plus récent en haut.
export class ChangeHistoryDialog {
  constructor({ history }) {
    this.history = history;
    this.overlayEl = null;
  }

  open() {
    this.close();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.close();
    });

    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);

    const header = document.createElement("header");
    header.className = "modal__header";
    const title = document.createElement("h2");
    title.textContent = "Historique des modifications";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal__close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Fermer");
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "modal__body";
    modal.appendChild(body);

    if (this.history.entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "properties__empty";
      empty.textContent = "Aucune modification enregistrée durant cette session.";
      body.appendChild(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "history-list";
      for (const entry of this.history.entries) {
        const li = document.createElement("li");
        li.className = "history-list__item";
        if (entry.type === "danger") li.classList.add("history-list__item--danger");

        const time = document.createElement("span");
        time.className = "history-list__time";
        time.textContent = formatTime(entry.timestamp);

        const message = document.createElement("span");
        message.className = "history-list__message";
        message.textContent = entry.message;

        li.append(time, message);
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
  }

  close() {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}
