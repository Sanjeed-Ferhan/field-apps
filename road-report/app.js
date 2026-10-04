"use strict";

const STORAGE_KEY = "roadwatch.reports.v1";
const SEV_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };

const $ = (sel) => document.querySelector(sel);

let reports = load();
let pendingPhoto = null;
let pendingLocation = null;
let selectedSeverity = null;
let map = null;
let markerLayer = null;
let myLocationMarker = null;

/* ---------- Storage ---------- */
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (e) {
    toast("Storage full - delete some reports to save new ones.");
    throw e;
  }
}

/* ---------- UI helpers ---------- */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString([], {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function updateCount() {
  $("#count").textContent = reports.length;
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $("#view-" + name).classList.add("active");

  if (name === "map") {
    ensureMap();
    setTimeout(() => map && map.invalidateSize(), 60);
  }
}

/* ---------- Photo capture ---------- */
$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    pendingPhoto = await compressImage(file, 1000, 0.6);
    const preview = $("#preview");
    preview.src = pendingPhoto;
    preview.hidden = false;
    $("#photoPlaceholder").hidden = true;
  } catch {
    toast("Could not read that image.");
  }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

/* ---------- Severity ---------- */
document.querySelectorAll(".sev").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedSeverity = btn.dataset.value;
    document.querySelectorAll(".sev").forEach((b) => b.classList.toggle("on", b === btn));
  });
});

/* ---------- Location ---------- */
$("#locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast("Geolocation is not supported on this device.");
    return;
  }
  const btn = $("#locateBtn");
  btn.classList.add("loading");
  btn.classList.remove("ok");
  $("#locText").textContent = "Locating...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      pendingLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      btn.classList.remove("loading");
      btn.classList.add("ok");
      $("#locText").textContent =
        `${pendingLocation.lat.toFixed(5)}, ${pendingLocation.lng.toFixed(5)} (±${Math.round(pendingLocation.accuracy)}m)`;
    },
    (err) => {
      btn.classList.remove("loading");
      $("#locText").textContent = "Get my location";
      toast(err.code === 1 ? "Location permission denied." : "Could not get location.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

/* ---------- Save ---------- */
$("#reportForm").addEventListener("submit", (e) => {
  e.preventDefault();

  if (!selectedSeverity) return toast("Pick a severity level.");
  if (!pendingPhoto) return toast("Add a photo of the road.");

  const report = {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    ts: Date.now(),
    severity: selectedSeverity,
    note: $("#note").value.trim(),
    photo: pendingPhoto,
    lat: pendingLocation ? pendingLocation.lat : null,
    lng: pendingLocation ? pendingLocation.lng : null,
    accuracy: pendingLocation ? pendingLocation.accuracy : null,
  };

  reports.unshift(report);
  try {
    persist();
  } catch {
    reports.shift();
    return;
  }

  resetForm();
  updateCount();
  renderList();
  addMapMarker(report);
  toast("Report saved.");
  switchView("list");
});

function resetForm() {
  pendingPhoto = null;
  pendingLocation = null;
  selectedSeverity = null;
  $("#photo").value = "";
  $("#preview").hidden = true;
  $("#preview").src = "";
  $("#photoPlaceholder").hidden = false;
  $("#note").value = "";
  $("#locText").textContent = "Get my location";
  $("#locateBtn").classList.remove("ok", "loading");
  document.querySelectorAll(".sev").forEach((b) => b.classList.remove("on"));
}

/* ---------- List ---------- */
function renderList() {
  const list = $("#list");
  if (reports.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z"/></svg>
        <p>No reports yet.<br />Tap <b>Report</b> to add the first one.</p>
      </div>`;
    return;
  }

  list.innerHTML = reports
    .map((r) => {
      const geo = r.lat != null
        ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}${r.accuracy ? ` (±${Math.round(r.accuracy)}m)` : ""}`
        : "No location captured";
      return `
        <article class="item" data-sev="${r.severity}">
          ${r.photo ? `<img src="${r.photo}" alt="road damage" loading="lazy" />` : ""}
          <div class="body">
            <div class="row">
              <span class="sev-name">${r.severity}</span>
              <time>${fmtDate(r.ts)}</time>
            </div>
            ${r.note ? `<p class="note">${escapeHtml(r.note)}</p>` : ""}
            <p class="geo">${geo}</p>
          </div>
          <button class="del" data-id="${r.id}" title="Delete" aria-label="Delete report">&times;</button>
        </article>`;
    })
    .join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

$("#list").addEventListener("click", (e) => {
  const btn = e.target.closest(".del");
  if (!btn) return;
  reports = reports.filter((r) => r.id !== btn.dataset.id);
  persist();
  updateCount();
  renderList();
  drawAllMarkers();
});

/* ---------- Map ---------- */
function ensureMap() {
  if (map || typeof L === "undefined") {
    if (typeof L === "undefined") {
      $("#mapHint").textContent = "Map needs an internet connection.";
    }
    return;
  }
  map = L.map("map", { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  drawAllMarkers();
}

function popupHtml(r) {
  const geo = r.lat != null ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : "No location";
  return `${r.photo ? `<img src="${r.photo}" alt="" />` : ""}
    <b style="text-transform:capitalize;color:${SEV_COLORS[r.severity]}">${r.severity}</b><br />
    ${r.note ? escapeHtml(r.note) + "<br />" : ""}
    <small>${fmtDate(r.ts)}</small><br /><small>${geo}</small>`;
}

function addMapMarker(r) {
  if (!map || !markerLayer || r.lat == null) return;
  L.circleMarker([r.lat, r.lng], {
    radius: 9,
    color: "#0f172a",
    weight: 2,
    fillColor: SEV_COLORS[r.severity],
    fillOpacity: 1,
  }).bindPopup(popupHtml(r)).addTo(markerLayer);
}

function drawAllMarkers() {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const located = reports.filter((r) => r.lat != null);
  located.forEach(addMapMarker);
  if (located.length) {
    const bounds = L.latLngBounds(located.map((r) => [r.lat, r.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
}

/* ---------- Export / clear ---------- */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(reports, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `road-reports-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#clearBtn").addEventListener("click", () => {
  if (reports.length === 0) return;
  if (!confirm("Delete all reports? This cannot be undone.")) return;
  reports = [];
  persist();
  updateCount();
  renderList();
  drawAllMarkers();
  toast("All reports cleared.");
});

/* ---------- Init ---------- */
updateCount();
renderList();
