import Experience from "./Experience/Experience.js";

const experience = new Experience(document.querySelector("canvas.webgl"));

// ---- filter panel (top left) ----
import {
  OPERATOR_CLASSES,
  CARBON_RAMP,
  CLOUD_PROVIDERS,
  CABLE_COLOR,
} from "./Experience/World/palettes.js";

const panel = document.getElementById("panel");
const legend = document.getElementById("legend");

panel.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.toggle) {
    experience.setState({
      [btn.dataset.toggle]: !experience.state[btn.dataset.toggle],
    });
  } else if (btn.dataset.val) {
    experience.setState({ [btn.closest(".seg").dataset.key]: btn.dataset.val });
  }
});

function legendRow(color, label) {
  return `<div class="li"><span class="dot" style="background:${color}"></span>${label}</div>`;
}

function syncPanel(s) {
  for (const seg of panel.querySelectorAll(".seg[data-key]")) {
    for (const b of seg.querySelectorAll("button")) {
      b.setAttribute("aria-checked", String(s[seg.dataset.key] === b.dataset.val));
    }
  }
  for (const b of panel.querySelectorAll("button[data-toggle]")) {
    b.setAttribute("aria-pressed", String(!!s[b.dataset.toggle]));
  }
  // color modes only apply to the columns view
  panel
    .querySelector('.seg[data-key="color"]')
    .setAttribute("data-disabled", String(s.view !== "columns"));

  // contextual legend
  let html = "";
  if (s.view === "columns" && s.color === "operator") {
    html += OPERATOR_CLASSES.map((c) => legendRow(c.color, c.label)).join("");
  }
  if (s.view === "columns" && s.color === "carbon") {
    html += `<div class="li"><span class="ramp" style="background:linear-gradient(90deg,${CARBON_RAMP.clean},${CARBON_RAMP.mid},${CARBON_RAMP.dirty})"></span>grid gCO₂/kWh</div>`;
  }
  if (s.clouds) {
    html += CLOUD_PROVIDERS.map((p) => legendRow(p.color, p.label)).join("");
  }
  if (s.cables) {
    html += legendRow(CABLE_COLOR, "submarine cables");
  }
  legend.innerHTML = html;
  legend.hidden = html === "";
}

experience.on("stateChanged", (s) => syncPanel(s));
syncPanel(experience.state);

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
