import { catalog, getCategories } from "../catalog/components.js";

const SVG_NS = "http://www.w3.org/2000/svg";

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
        button.appendChild(this.buildIcon(entry));

        const label = document.createElement("span");
        label.textContent = entry.label;
        button.appendChild(label);

        button.addEventListener("click", () => this.toggle(entry.type));
        this.buttonsByType.set(entry.type, button);
        list.appendChild(button);
      }
      section.appendChild(list);
      this.containerEl.appendChild(section);
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
