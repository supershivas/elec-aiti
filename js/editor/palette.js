import { catalog, getCategories } from "../catalog/components.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Palette latérale : liste les types de composants par catégorie, arme la pose au clic
export class Palette {
  constructor({ containerEl, onArm }) {
    this.containerEl = containerEl;
    this.onArm = onArm;
    this.armedType = null;
    this.buttonsByType = new Map();
    this.query = "";

    const searchBar = document.createElement("div");
    searchBar.className = "palette__search-bar";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.className = "palette__search";
    this.searchInput.placeholder = "Rechercher un élément…";
    this.searchInput.setAttribute("aria-label", "Rechercher un élément");
    this.searchInput.addEventListener("input", () => {
      this.query = this.searchInput.value.trim().toLowerCase();
      this.render();
    });
    searchBar.appendChild(this.searchInput);
    this.containerEl.appendChild(searchBar);

    this.listEl = document.createElement("div");
    this.containerEl.appendChild(this.listEl);

    this.render();
  }

  render() {
    this.listEl.replaceChildren();
    this.buttonsByType.clear();
    const matches = (entry) => entry.label.toLowerCase().includes(this.query);

    for (const category of getCategories()) {
      const entries = catalog.filter((item) => item.category === category && matches(item));
      if (entries.length === 0) continue;

      const section = document.createElement("section");
      section.className = "palette__category";

      const heading = document.createElement("h2");
      heading.className = "palette__category-title";
      heading.textContent = category;
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "palette__items";
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "palette__item";
        if (entry.type === this.armedType) button.classList.add("palette__item--armed");
        button.appendChild(this.buildIcon(entry));

        const label = document.createElement("span");
        label.textContent = entry.label;
        button.appendChild(label);

        button.addEventListener("click", () => this.toggle(entry.type));
        this.buttonsByType.set(entry.type, button);
        list.appendChild(button);
      }
      section.appendChild(list);
      this.listEl.appendChild(section);
    }

    if (this.query && this.listEl.children.length === 0) {
      const empty = document.createElement("p");
      empty.className = "palette__empty";
      empty.textContent = "Aucun élément ne correspond à cette recherche.";
      this.listEl.appendChild(empty);
    }
  }

  buildIcon(entry) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("palette__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = entry.label;
    svg.appendChild(title);

    if (entry.shape === "box") {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", 2);
      rect.setAttribute("y", 2);
      rect.setAttribute("width", 20);
      rect.setAttribute("height", 20);
      rect.setAttribute("rx", 2);
      svg.appendChild(rect);

      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = entry.abbr;
      text.setAttribute("x", 12);
      text.setAttribute("y", 12);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      svg.appendChild(text);
    } else {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#sym-${entry.symbolId}`);
      svg.appendChild(use);

      // Prises spécialisées : même abréviation centrée que sur le plan (voir
      // ComponentsLayer.renderComponent), pour reconnaître le type dans la liste.
      if (entry.abbr) {
        const text = document.createElementNS(SVG_NS, "text");
        text.textContent = entry.abbr;
        text.setAttribute("x", 12);
        text.setAttribute("y", 12.5);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        svg.appendChild(text);
      }
    }
    return svg;
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
