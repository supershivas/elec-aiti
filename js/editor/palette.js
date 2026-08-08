import { catalog, getCategories } from "../catalog/components.js";

// Palette latérale : liste les types de composants par catégorie, arme la pose au clic
export class Palette {
  constructor({ containerEl, onArm }) {
    this.containerEl = containerEl;
    this.onArm = onArm;
    this.armedType = null;
    this.buttonsByType = new Map();
    this.render();
  }

  render() {
    this.containerEl.replaceChildren();
    for (const category of getCategories()) {
      const section = document.createElement("section");
      section.className = "palette__category";

      const heading = document.createElement("h2");
      heading.className = "palette__category-title";
      heading.textContent = category;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "palette__items";
      for (const entry of catalog.filter((item) => item.category === category)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "palette__item";
        button.textContent = entry.label;
        button.addEventListener("click", () => this.toggle(entry.type));
        this.buttonsByType.set(entry.type, button);
        list.appendChild(button);
      }
      section.appendChild(list);
      this.containerEl.appendChild(section);
    }
  }

  toggle(type) {
    const nextType = this.armedType === type ? null : type;
    this.setArmed(nextType);
    this.onArm(nextType);
  }

  setArmed(type) {
    if (this.armedType) this.buttonsByType.get(this.armedType)?.classList.remove("palette__item--armed");
    this.armedType = type;
    if (this.armedType) this.buttonsByType.get(this.armedType)?.classList.add("palette__item--armed");
  }
}
