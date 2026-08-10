const CONTAINER_ID = "toast-container";
const DURATION_MS = 3500;

// type: 'default' (neutre) ou 'danger' (suppression)
export function showToast(message, { type = "default" } = {}) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, DURATION_MS);
}
