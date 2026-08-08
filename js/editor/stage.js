const SVG_NS = "http://www.w3.org/2000/svg";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.1;

// Gère l'affichage du plan de fond dans le SVG hôte, avec pan/zoom
export class Stage {
  constructor(svgEl, errorEl) {
    this.svgEl = svgEl;
    this.errorEl = errorEl;
    this.planLayer = svgEl.querySelector("#plan-layer");
    this.baseViewBox = { x: 0, y: 0, width: 1558, height: 801.32 };
    this.viewBox = { ...this.baseViewBox };
    this.isPanning = false;
    this.panStart = null;

    this.svgEl.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.svgEl.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.svgEl.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.svgEl.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.svgEl.addEventListener("pointerleave", (event) => this.onPointerUp(event));
  }

  async loadFloor(floor) {
    this.hideError();
    try {
      const response = await fetch(encodeURI(floor.planPath));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
      const planSvg = parsed.querySelector("svg");
      if (!planSvg || parsed.querySelector("parsererror")) {
        throw new Error("SVG invalide");
      }

      const viewBoxAttr = planSvg.getAttribute("viewBox");
      if (viewBoxAttr) {
        const [x, y, width, height] = viewBoxAttr.split(/\s+/).map(Number);
        this.baseViewBox = { x, y, width, height };
      }
      this.resetView();

      this.planLayer.replaceChildren(...Array.from(planSvg.children).map((node) => node.cloneNode(true)));
    } catch (error) {
      this.planLayer.replaceChildren();
      this.showError(`Impossible de charger le plan "${floor.label}" (${error.message}).`);
    }
  }

  resetView() {
    this.viewBox = { ...this.baseViewBox };
    this.applyViewBox();
  }

  applyViewBox() {
    const { x, y, width, height } = this.viewBox;
    this.svgEl.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  }

  showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
  }

  hideError() {
    this.errorEl.hidden = true;
  }

  onWheel(event) {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const nextWidth = this.viewBox.width / zoomFactor;
    const nextZoom = this.baseViewBox.width / nextWidth;
    if (nextZoom < ZOOM_MIN || nextZoom > ZOOM_MAX) {
      return;
    }
    const scale = nextWidth / this.viewBox.width;

    const cursor = this.clientToViewBoxPoint(event.clientX, event.clientY);
    this.viewBox = {
      x: cursor.x - (cursor.x - this.viewBox.x) * scale,
      y: cursor.y - (cursor.y - this.viewBox.y) * scale,
      width: this.viewBox.width * scale,
      height: this.viewBox.height * scale,
    };
    this.applyViewBox();
  }

  onPointerDown(event) {
    // Le pan reste possible même avec un outil de pose armé : c'est le geste
    // (clic vs glissé) qui décide, voir ComponentsLayer.onStagePointerUp.
    if (event.target.closest(".component")) return;
    this.isPanning = true;
    this.svgEl.setPointerCapture(event.pointerId);
    this.svgEl.classList.add("stage__svg--panning");
    this.panStart = { clientX: event.clientX, clientY: event.clientY, viewBox: { ...this.viewBox } };
  }

  onPointerMove(event) {
    if (!this.isPanning) return;
    const start = this.clientToViewBoxPoint(this.panStart.clientX, this.panStart.clientY);
    const current = this.clientToViewBoxPoint(event.clientX, event.clientY);
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    this.viewBox = {
      ...this.viewBox,
      x: this.panStart.viewBox.x - dx,
      y: this.panStart.viewBox.y - dy,
    };
    this.applyViewBox();
  }

  onPointerUp(event) {
    if (!this.isPanning) return;
    this.isPanning = false;
    this.svgEl.classList.remove("stage__svg--panning");
    if (this.svgEl.hasPointerCapture(event.pointerId)) {
      this.svgEl.releasePointerCapture(event.pointerId);
    }
  }

  // Convertit un point écran en coordonnées du viewBox, en tenant compte du
  // "letterboxing" (preserveAspectRatio="xMidYMid meet" par défaut) via la
  // matrice native du SVG plutôt qu'un calcul manuel basé sur le rect CSS.
  clientToViewBoxPoint(clientX, clientY) {
    const point = this.svgEl.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = this.svgEl.getScreenCTM();
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
}

export { SVG_NS };
