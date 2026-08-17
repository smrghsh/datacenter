import Experience from "./Experience/Experience.js";

const experience = new Experience(document.querySelector("canvas.webgl"));

// ---- view toggle (top left) ----
const viewToggle = document.getElementById("view-toggle");
viewToggle.addEventListener("click", (e) => {
  const mode = e.target.dataset?.view;
  if (mode) experience.setView(mode);
});
experience.on("viewChanged", (mode) => {
  for (const b of viewToggle.querySelectorAll("button")) {
    b.setAttribute("aria-checked", String(b.dataset.view === mode));
  }
});

// ---- HUD: count-up + coverage note ----
experience.on("worldReady", () => {
  const data = experience.resources.items.sites;
  const countEl = document.getElementById("count");
  const coverageEl = document.getElementById("coverage");
  coverageEl.textContent = `${data.geocoded.toLocaleString()} of ${data.total_records.toLocaleString()}`;

  const total = data.geocoded;
  const t0 = performance.now();
  const tick = () => {
    const shown = Math.min(total, Math.floor((performance.now() - t0) / 0.35));
    countEl.textContent = shown.toLocaleString();
    if (shown < total) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
