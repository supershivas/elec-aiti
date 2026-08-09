// Échelle graphique du plan (le viewBox est en cm réels, cf. CLAUDE.md)
const NICE_CM = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const TARGET_PX = 100;

export class ScaleBar {
  constructor({ stage, lineEl, labelEl }) {
    this.stage = stage;
    this.lineEl = lineEl;
    this.labelEl = labelEl;
    stage.onViewChange = () => this.update();
    window.addEventListener("resize", () => this.update());
  }

  update() {
    const ctm = this.stage.svgEl.getScreenCTM();
    if (!ctm) return;
    const pxPerCm = ctm.a;
    if (!pxPerCm) return;

    let chosenCm = NICE_CM[0];
    for (const cm of NICE_CM) {
      if (cm * pxPerCm <= TARGET_PX) chosenCm = cm;
      else break;
    }

    this.lineEl.style.width = `${chosenCm * pxPerCm}px`;
    this.labelEl.textContent = chosenCm >= 100 ? `${chosenCm / 100} m` : `${chosenCm} cm`;
  }
}
