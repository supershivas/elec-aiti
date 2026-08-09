function field(labelText, inputEl) {
  const wrapper = document.createElement("label");
  wrapper.className = "properties__field";
  const span = document.createElement("span");
  span.className = "properties__field-label";
  span.textContent = labelText;
  wrapper.append(span, inputEl);
  return wrapper;
}

// Formulaire de création d'un meuble personnalisé (nom, longueur, largeur),
// en modale HTML plutôt que des prompt() système. Résout avec les valeurs
// saisies, ou null si l'utilisateur annule.
export function promptFurnitureDetails({ defaultLabel, defaultWidth, defaultHeight, showElectrifiedCheckbox = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);

    const header = document.createElement("header");
    header.className = "modal__header";
    const title = document.createElement("h2");
    title.textContent = "Nouveau meuble";
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
    nameInput.value = defaultLabel;
    form.appendChild(field("Nom", nameInput));

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.min = "1";
    widthInput.value = defaultWidth;
    form.appendChild(field("Longueur (cm)", widthInput));

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = "1";
    heightInput.value = defaultHeight;
    form.appendChild(field("Largeur (cm)", heightInput));

    let electrifiedInput = null;
    if (showElectrifiedCheckbox) {
      electrifiedInput = document.createElement("input");
      electrifiedInput.type = "checkbox";
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "properties__field properties__field--checkbox";
      checkboxLabel.append(electrifiedInput, document.createTextNode(" Électrifié"));
      form.appendChild(checkboxLabel);
    }

    const actions = document.createElement("div");
    actions.className = "modal__actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "toolbar__button";
    cancelBtn.textContent = "Annuler";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "toolbar__button toolbar__button--primary";
    submitBtn.textContent = "Ajouter le meuble";
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
      finish({
        label: nameInput.value.trim() || defaultLabel,
        width: Math.max(1, Number(widthInput.value)) || defaultWidth,
        height: Math.max(1, Number(heightInput.value)) || defaultHeight,
        electrified: electrifiedInput ? electrifiedInput.checked : false,
      });
    });

    document.body.appendChild(overlay);
    nameInput.focus();
    nameInput.select();
  });
}
