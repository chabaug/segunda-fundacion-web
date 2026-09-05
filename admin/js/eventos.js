// Eventos section: CRUD over /api/events, plus the active/inactive toggle
// that drives the homepage banner and the Próximos shows cards.
import {
  $, el, clear, api, showToast, addSubrow, readSubrows,
} from "./core.js";
import { showSection } from "./router.js";

let events = [];
let editingId = null;      // null = creating a new one
let editingStatus = null;  // status of the event being edited, null when creating
let pendingFlyerFile = null;
let loadPromise = null;

export function getEvents() {
  return events;
}

function load() {
  return api("/api/events?admin=1")
    .then(function (r) { return r.json(); })
    .then(function (list) { events = Array.isArray(list) ? list : []; });
}

// Shared by init() and by the Estado section's deep links, so a jump into an
// event's form doesn't race the section's own first load.
function ensureLoaded() {
  if (!loadPromise) loadPromise = load().then(renderList);
  return loadPromise;
}

export function reload() {
  loadPromise = load().then(renderList);
  return loadPromise;
}

function renderList() {
  const tbody = clear($("eventsTbody"));
  events.slice().sort(function (a, b) {
    return (b.date || "").localeCompare(a.date || "");
  }).forEach(function (ev) {
    const chk = el("input", { type: "checkbox" });
    chk.checked = ev.status === "active";
    if (ev.status === "past") chk.title = "Reactivar (vuelve a Próximos shows)";
    chk.addEventListener("change", function () { toggleActive(ev.id, chk.checked); });

    const statusText = el("span", {
      class: "status-pill " + (ev.status === "active" ? "active" : ev.status === "past" ? "bad" : "inactive"),
      text: ev.status === "active" ? "Activo" : ev.status === "past" ? "Pasado" : "Inactivo",
    });

    tbody.appendChild(el("tr", null, [
      el("td", { text: ev.name }),
      el("td", { text: ev.date + (ev.time ? " · " + ev.time : "") }),
      el("td", null, [
        el("label", { class: "toggle" }, [chk, el("span", { class: "toggle-slider" })]),
        el("span", { style: "margin-left:8px;" }, [statusText]),
      ]),
      el("td", null, [
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", type: "button", text: "Editar", onclick: function () { openForm(ev); } }),
          el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar", onclick: function () { deleteEvent(ev); } }),
        ]),
      ]),
    ]));
  });
}

function toggleActive(id, checked) {
  const status = checked ? "active" : "inactive";
  api("/api/events/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status }),
  }).then(function (r) { return r.json(); }).then(function (updated) {
    const idx = events.findIndex(function (e) { return e.id === id; });
    if (idx !== -1) events[idx] = updated;
    renderList();
    showToast(checked ? "Evento activado" : "Evento desactivado");
  }).catch(function () { showToast("Error al actualizar", true); });
}

function deleteEvent(ev) {
  if (!confirm('¿Eliminar "' + ev.name + '"? No se puede deshacer.')) return;
  api("/api/events/" + ev.id, { method: "DELETE" }).then(function () {
    events = events.filter(function (e) { return e.id !== ev.id; });
    renderList();
    showToast("Eliminado");
  }).catch(function () { showToast("Error al eliminar", true); });
}

// ---------------- form ----------------
function form() { return $("eventForm"); }

function openForm(ev) {
  const f = form();
  editingId = ev ? ev.id : null;
  editingStatus = ev ? ev.status : null;
  pendingFlyerFile = null;
  $("pastNotice").style.display = (ev && ev.status === "past") ? "" : "none";
  $("eventFormTitle").textContent = ev ? "Editar evento" : "Nuevo evento";
  f.reset();
  clear($("artistsList"));
  clear($("otherLinksList"));
  $("flyerInput").value = "";
  const preview = $("flyerPreview");

  if (ev) {
    f.name.value = ev.name || "";
    f.date.value = ev.date || "";
    f.time.value = ev.time || "";
    f.venueName.value = (ev.venue && ev.venue.name) || "";
    f.venueAddress.value = (ev.venue && ev.venue.address) || "";
    f.venueLink.value = (ev.venue && ev.venue.link) || "";
    f.ticketUrl.value = ev.ticketUrl || "";
    f.description.value = ev.description || "";
    $("activeToggle").checked = ev.status !== "inactive";
    (ev.artists || []).forEach(function (a) {
      addSubrow($("artistsList"), ["Nombre del artista", "Link"], [a.name, a.link]);
    });
    (ev.otherLinks || []).forEach(function (l) {
      addSubrow($("otherLinksList"), ["Label", "URL"], [l.label, l.url]);
    });
    if (ev.flyerKey) {
      preview.src = "/api/flyers/" + ev.flyerKey;
      preview.style.display = "";
    } else {
      preview.style.display = "none";
    }
  } else {
    $("activeToggle").checked = true;
    preview.style.display = "none";
  }
  $("eventFormSection").hidden = false;
  $("eventFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Used by the Estado section to jump straight from "este evento no tiene
// flyer" to the form that fixes it.
export function openEventById(id) {
  showSection("eventos");
  return ensureLoaded().then(function () {
    const ev = events.find(function (e) { return e.id === id; });
    if (ev) openForm(ev);
  });
}

function buildPayload() {
  const f = form();
  return {
    name: f.name.value.trim(),
    date: f.date.value,
    time: f.time.value || undefined,
    venue: {
      name: f.venueName.value.trim(),
      address: f.venueAddress.value.trim(),
      link: f.venueLink.value.trim(),
    },
    ticketUrl: f.ticketUrl.value.trim() || undefined,
    description: f.description.value.trim(),
    artists: readSubrows($("artistsList")).map(function (p) { return { name: p[0], link: p[1] || undefined }; }),
    otherLinks: readSubrows($("otherLinksList")).map(function (p) { return { label: p[0], url: p[1] }; }),
    // Unchecked always means "pause it". Checked means "active" for a new
    // event, but for an existing "past" one it means "leave it in the
    // archive" — the form isn't how you un-archive something, the list
    // toggle is (see toggleActive), so a routine edit-save never silently
    // promotes a past show back into Próximos shows.
    status: $("activeToggle").checked
      ? (editingStatus === "past" ? "past" : "active")
      : "inactive",
  };
}

function uploadFlyerIfNeeded(id) {
  if (!pendingFlyerFile) return Promise.resolve();
  return api("/api/events/" + id + "/flyer", {
    method: "POST",
    headers: { "Content-Type": pendingFlyerFile.type || "image/jpeg" },
    body: pendingFlyerFile,
  });
}

function wireForm() {
  $("addArtistBtn").addEventListener("click", function () {
    addSubrow($("artistsList"), ["Nombre del artista", "Link (Instagram, Spotify...)"]);
  });
  $("addLinkBtn").addEventListener("click", function () {
    addSubrow($("otherLinksList"), ["Label (ej: Reservas)", "URL"]);
  });
  $("newEventBtn").addEventListener("click", function () { openForm(null); });
  $("cancelEventFormBtn").addEventListener("click", function () { $("eventFormSection").hidden = true; });

  $("flyerInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    pendingFlyerFile = file || null;
    if (file) {
      const preview = $("flyerPreview");
      preview.src = URL.createObjectURL(file);
      preview.style.display = "";
    }
  });

  form().addEventListener("submit", function (e) {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload.name || !payload.date) {
      showToast("Falta nombre o fecha", true);
      return;
    }
    const req = editingId
      ? api("/api/events/" + editingId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : api("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    req.then(function (r) { return r.json(); }).then(function (saved) {
      return uploadFlyerIfNeeded(saved.id);
    }).then(function () {
      return load();
    }).then(function () {
      renderList();
      $("eventFormSection").hidden = true;
      showToast("Guardado");
    }).catch(function () { showToast("Error al guardar", true); });
  });
}

export default {
  init: function () {
    wireForm();
    return ensureLoaded();
  },
};
