import Experience from "./Experience/Experience.js";

const experience = new Experience(document.querySelector("canvas.webgl"));

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

// ---- ambient audio (user-gesture gated) ----
const audio = document.getElementById("ambient");
const soundBtn = document.getElementById("sound");
audio.volume = 0.35;
let soundOn = false;

function setSound(on) {
  soundOn = on;
  soundBtn.textContent = on ? "sound on" : "sound off";
  soundBtn.setAttribute("aria-pressed", String(on));
  if (on) audio.play().catch(() => {});
  else audio.pause();
}
soundBtn.addEventListener("click", () => setSound(!soundOn));

// Entering immersive counts as a gesture: bring the hum with you.
experience.on("xrSessionStarted", () => {
  if (!soundOn) setSound(true);
});
