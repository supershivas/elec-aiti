function field(labelText, inputEl) {
  const wrapper = document.createElement("label");
  wrapper.className = "properties__field";
  const span = document.createElement("span");
  span.className = "properties__field-label";
  span.textContent = labelText;
  wrapper.append(span, inputEl);
  return wrapper;
}

// Modale de nom de fichier, pour les navigateurs sans File System Access API
// (Firefox, Safari...) où showSaveFilePicker n'existe pas : on ne peut pas y
// choisir l'emplacement (ça dépend des réglages de téléchargement du
// navigateur, ex. "toujours demander où enregistrer"), mais on peut au moins
// proposer de personnaliser le nom, plutôt que d'enregistrer en silence sous
// le nom par défaut. Résout avec le nom choisi, ou null si annulé.
export function promptSaveFilename({ defaultName, extension }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);

    const header = document.createElement("header");
    header.className = "modal__header";
    const title = document.createElement("h2");
    title.textContent = "Enregistrer le projet";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal__close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Annuler");
    header.append(title, closeBtn);
    modal.appendChild(header);

    const form = document.createElement("form");
    form.className = "modal__body";
    modal.appendChild(form);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = defaultName;
    form.appendChild(field("Nom du fichier", nameInput));

    const note = document.createElement("p");
    note.className = "properties__empty";
    note.textContent =
      "L'emplacement d'enregistrement dépend des réglages de votre navigateur (dossier de téléchargement par défaut, ou invite si votre navigateur est réglé pour toujours demander où enregistrer).";
    form.appendChild(note);

    const actions = document.createElement("div");
    actions.className = "modal__actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "toolbar__button";
    cancelBtn.textContent = "Annuler";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "toolbar__button toolbar__button--primary";
    submitBtn.textContent = "Enregistrer";
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
      let name = nameInput.value.trim() || defaultName;
      if (!name.toLowerCase().endsWith(extension)) name += extension;
      finish(name);
    });

    document.body.appendChild(overlay);
    nameInput.focus();
    nameInput.select();
  });
}
