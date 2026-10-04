"use strict";

const STORAGE_KEY = "civildesk.requests.v1";
const PRI_COLORS = { low: "#38bdf8", medium: "#f59e0b", high: "#ef4444" };
const STATUS_NEXT = { open: "progress", progress: "done", done: "open" };

const $ = (s) => document.querySelector(s);

let requests = load();
let pendingPhoto = null;
let pendingLocation = null;
let priority = null;
let filter = "all";
let map = null;
let markerLayer = null;

/* ---------- Storage ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(requests)); }
  catch { toast("Storage full - delete some requests first."); throw new Error("quota"); }
}

/* ---------- Helpers ---------- */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}
const fmtDate = (ts) => new Date(ts).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function updateCount() {
  const open = requests.filter((r) => r.status !== "done").length;
  $("#count").textContent = open;
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $("#view-" + name).classList.add("active");
  if (name === "map") { ensureMap(); setTimeout(() => map && map.invalidateSize(), 60); }
}

/* ---------- Photo ---------- */
$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    pendingPhoto = await compressImage(file, 1000, 0.6);
    const p = $("#preview");
    p.src = pendingPhoto; p.hidden = false;
    $("#photoPlaceholder").hidden = true;
  } catch { toast("Could not read that image."); }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

/* ---------- Priority ---------- */
document.querySelectorAll(".pri").forEach((b) => b.addEventListener("click", () => {
  priority = b.dataset.value;
  document.querySelectorAll(".pri").forEach((x) => x.classList.toggle("on", x === b));
}));

/* ---------- GPS ---------- */
$("#locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Geolocation is not supported here.");
  const btn = $("#locateBtn");
  btn.classList.add("loading"); btn.classList.remove("ok");
  $("#locText").textContent = "Locating...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      pendingLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      btn.classList.remove("loading"); btn.classList.add("ok");
      $("#locText").textContent = `${pendingLocation.lat.toFixed(5)}, ${pendingLocation.lng.toFixed(5)} (±${Math.round(pendingLocation.accuracy)}m)`;
      $("#clearLoc").hidden = false;
    },
    (err) => {
      btn.classList.remove("loading");
      $("#locText").textContent = "Use my GPS location";
      toast(err.code === 1 ? "Location permission denied." : "Could not get location.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

$("#clearLoc").addEventListener("click", () => {
  pendingLocation = null;
  $("#locText").textContent = "Use my GPS location";
  $("#locateBtn").classList.remove("ok", "loading");
  $("#clearLoc").hidden = true;
});

/* ---------- Submit ---------- */
$("#reqForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const category = $("#category").value;
  const place = $("#place").value.trim();
  const desc = $("#desc").value.trim();

  if (!category) return toast("Select a work category.");
  if (!priority) return toast("Pick a priority.");
  if (!place && !pendingLocation) return toast("Add a location (type it or use GPS).");
  if (!desc) return toast("Describe the work required.");
  if (!pendingPhoto) return toast("Attach a photo.");

  const req = {
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    ts: Date.now(),
    category, priority, place, desc,
    requester: $("#requester").value.trim(),
    photo: pendingPhoto,
    lat: pendingLocation ? pendingLocation.lat : null,
    lng: pendingLocation ? pendingLocation.lng : null,
    accuracy: pendingLocation ? pendingLocation.accuracy : null,
    status: "open",
  };

  requests.unshift(req);
  try { persist(); } catch { requests.shift(); return; }

  resetForm(); updateCount(); renderList(); addMapMarker(req);
  toast("Request submitted.");
  switchView("list");
});

function resetForm() {
  pendingPhoto = null; pendingLocation = null; priority = null;
  $("#photo").value = ""; $("#preview").hidden = true; $("#preview").src = "";
  $("#photoPlaceholder").hidden = false;
  $("#category").value = ""; $("#requester").value = ""; $("#place").value = ""; $("#desc").value = "";
  $("#locText").textContent = "Use my GPS location";
  $("#locateBtn").classList.remove("ok", "loading");
  $("#clearLoc").hidden = true;
  document.querySelectorAll(".pri").forEach((b) => b.classList.remove("on"));
}

/* ---------- Filters ---------- */
$("#filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  filter = chip.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === chip));
  renderList();
});

/* ---------- List ---------- */
function renderList() {
  const list = $("#list");
  const shown = requests.filter((r) => filter === "all" || r.status === filter);

  if (shown.length === 0) {
    list.innerHTML = `<div class="empty">
      <svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z"/></svg>
      <p>${requests.length ? "No requests in this filter." : "No requests yet.<br />Tap <b>New</b> to raise one."}</p>
    </div>`;
    return;
  }

  list.innerHTML = shown.map((r) => {
    const meta = [];
    if (r.place) meta.push(`📍 ${escapeHtml(r.place)}`);
    if (r.lat != null) meta.push(`GPS ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}${r.accuracy ? ` (±${Math.round(r.accuracy)}m)` : ""}`);
    if (r.requester) meta.push(`👤 ${escapeHtml(r.requester)}`);
    return `<article class="item ${r.status === "done" ? "is-done" : ""}" data-pri="${r.priority}">
      ${r.photo ? `<img src="${r.photo}" alt="work photo" loading="lazy" />` : ""}
      <div class="body">
        <div class="row">
          <span class="cat">${escapeHtml(r.category)}</span>
          <time>${fmtDate(r.ts)}</time>
        </div>
        <p class="desc">${escapeHtml(r.desc)}</p>
        <p class="meta">${meta.join("")}</p>
        <button type="button" class="status" data-status="${r.status}" data-id="${r.id}">${r.status === "progress" ? "in progress" : r.status}</button>
      </div>
      <button class="del" data-id="${r.id}" title="Delete" aria-label="Delete request">&times;</button>
    </article>`;
  }).join("");
}

$("#list").addEventListener("click", (e) => {
  const del = e.target.closest(".del");
  if (del) {
    requests = requests.filter((r) => r.id !== del.dataset.id);
    persist(); updateCount(); renderList(); drawAllMarkers();
    return;
  }
  const st = e.target.closest(".status");
  if (st) {
    const r = requests.find((x) => x.id === st.dataset.id);
    if (!r) return;
    r.status = STATUS_NEXT[r.status] || "open";
    persist(); updateCount(); renderList();
  }
});

/* ---------- Map ---------- */
function ensureMap() {
  if (map) return;
  if (typeof L === "undefined") { $("#mapHint").textContent = "Map needs an internet connection."; return; }
  map = L.map("map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  drawAllMarkers();
}

function popupHtml(r) {
  const geo = r.lat != null ? `GPS ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : "No GPS";
  return `${r.photo ? `<img src="${r.photo}" alt="" />` : ""}
    <b style="color:${PRI_COLORS[r.priority]};text-transform:capitalize">${r.priority} priority</b><br />
    <b>${escapeHtml(r.category)}</b><br />
    ${escapeHtml(r.desc)}<br />
    ${r.place ? escapeHtml(r.place) + "<br />" : ""}
    ${r.requester ? "By " + escapeHtml(r.requester) + "<br />" : ""}
    <small>${fmtDate(r.ts)} · ${geo} · ${r.status}</small>`;
}

function addMapMarker(r) {
  if (!map || !markerLayer || r.lat == null) return;
  L.circleMarker([r.lat, r.lng], { radius: 9, color: "#0b1220", weight: 2, fillColor: PRI_COLORS[r.priority], fillOpacity: 1 })
    .bindPopup(popupHtml(r)).addTo(markerLayer);
}

function drawAllMarkers() {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const located = requests.filter((r) => r.lat != null);
  located.forEach(addMapMarker);
  if (located.length) map.fitBounds(L.latLngBounds(located.map((r) => [r.lat, r.lng])), { padding: [40, 40], maxZoom: 17 });
}

/* ---------- Export / clear ---------- */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(requests, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `civil-requests-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
});

$("#clearBtn").addEventListener("click", () => {
  if (!requests.length) return;
  if (!confirm("Delete all requests? This cannot be undone.")) return;
  requests = []; persist(); updateCount(); renderList(); drawAllMarkers();
  toast("All requests cleared.");
});

/* ---------- Init ---------- */
updateCount();
renderList();
