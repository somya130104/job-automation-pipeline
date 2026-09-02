const originInput = document.getElementById("origin");
const recentEl = document.getElementById("recent");

chrome.storage.sync.get("appOrigin").then(({ appOrigin }) => {
  originInput.value = appOrigin || "http://localhost:3000";
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ appOrigin: originInput.value.trim().replace(/\/$/, "") });
  const btn = document.getElementById("save");
  btn.textContent = "Saved";
  setTimeout(() => (btn.textContent = "Save"), 1200);
});

chrome.storage.local.get("recent").then(({ recent }) => {
  if (!recent || !recent.length) {
    recentEl.innerHTML = '<p style="margin:0">No captures yet.</p>';
    return;
  }
  recentEl.innerHTML =
    "<label>Recent captures</label>" +
    recent
      .map(
        (r) =>
          `<div class="row">${r.score != null ? `<span class="score">${r.score}%</span>` : ""}<b>${r.title || "Untitled"}</b><br>${r.company || ""}</div>`
      )
      .join("");
});
