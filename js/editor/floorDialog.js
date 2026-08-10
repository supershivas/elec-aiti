function field(labelText, inputEl) {
  const wrapper = document.createElement("label");
  wrapper.className = "properties__field";
  const span = document.createElement("span");
  span.className = "properties__field-label";
  span.textContent = labelText;
  wrapper.append(span, inputEl);
  return wrapper;
}

// Modale de nom d'étage (création ou renommage), en HTML plutôt que prompt()
// système, cohérente avec les autres modales de l'appli (meuble, fichier).
// Résout avec le nom saisi, ou null si annulé.
export function promptFloorName({ title, submitLabel, defaultName }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);

    const header = document.createElement("header");
    header.className = "modal__header";
    const titleEl = document.createElement("h2");
    titleEl.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal__close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Annuler");
    header.append(titleEl, closeBtn);
    modal.appendChild(header);

    const form = document.createElement("form");
    form.className = "modal__body";
    modal.appendChild(form);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = defaultName;
    form.appendChild(field("Nom de l'étage", nameInput));

    const actions = document.createElement("div");
    actions.className = "modal__actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "toolbar__button";
    cancelBtn.textContent = "Annuler";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "toolbar__button toolbar__button--primary";
    submitBtn.textContent = submitLabel;
    actions.append(cancelBtn, submitBtn);
    form.appendChild(actions);

    function finish(result) {
      overlay.remove();
      resolve(result);
    }

    closeBtn.addEventListener("click", () => finish(null));
    cancelBtn.addEventListener("click", () => finish(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });
    document.addEventListener("keydown", function onKeyDown(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", onKeyDown);
      finish(null);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      finish(name || defaultName);
    });

    document.body.appendChild(overlay);
    nameInput.focus();
    nameInput.select();
  });
}
