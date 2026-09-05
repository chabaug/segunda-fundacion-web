// Lanzamientos section: releases + artists, over /api/releases and
// /api/artists. A release only auto-publishes on its date if its artist's
// ficha is complete (bio + photo), so the list surfaces that as a blocked
// state instead of letting it fail silently on release day.
import {
  $, el, clear, api, showToast, addSubrow, readSubrows, todayISO,
} from "./core.js";
import { showSection } from "./router.js";

let releases = [];
let artists = [];
let editingReleaseSlug = null;
let editingArtistSlug = null;
let pendingCoverFile = null;
let pendingPhotoFile = null;
let loadPromise = null;

export function getReleases() { return releases; }
export function getArtists() { return artists; }

export function isArtistComplete(a) {
  return !!a && !!a.bio && a.bio.trim().length > 0 && !!a.photoKey;
}

function findArtist(slug) {
  return artists.find(function (a) { return a.slug === slug; }) || null;
}

// Mirrors slugify() in netlify/lib/releases-store.mts closely enough for
// client-side "does this artist already exist" matching -- the backend's own
// slugify is still the source of truth for the actual slug it saves.
function slugifyGuess(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[¡!¿?]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function loadAll() {
  return Promise.all([
    api("/api/releases?admin=1").then(function (r) { return r.json(); }),
    api("/api/artists?admin=1").then(function (r) { return r.json(); }),
  ]).then(function (results) {
    releases = Array.isArray(results[0]) ? results[0] : [];
    artists = Array.isArray(results[1]) ? results[1] : [];
  });
}

// Shared by init() and by the Estado section's deep links, so a jump into a
// release's form doesn't race the section's own first load (or start a
// second one).
function ensureLoaded() {
  if (!loadPromise) loadPromise = loadAll().then(renderAll);
  return loadPromise;
}

export function reload() {
  loadPromise = loadAll().then(renderAll);
  return loadPromise;
}

function renderAll() {
  renderReleasesList();
  renderArtistsList();
  renderArtistDatalist();
}

// ---------------- tabs ----------------
function switchTab(name) {
  const releasesOn = name === "releases";
  $("tabReleases").hidden = !releasesOn;
  $("tabArtists").hidden = releasesOn;
  $("tabReleasesBtn").className = "tab-btn" + (releasesOn ? " active" : "");
  $("tabArtistsBtn").className = "tab-btn" + (releasesOn ? "" : " active");
}

// ================== RELEASES ==================
export function releaseStatusBadge(rel) {
  if (rel.status === "published") return { cls: "published", text: "Publicado" };
  const due = rel.releaseDate && rel.releaseDate <= todayISO();
  const artist = findArtist(rel.artistSlug);
  if (due && !isArtistComplete(artist)) {
    return { cls: "blocked", text: "⚠ Bloqueado — falta ficha de " + rel.artist };
  }
  return { cls: "scheduled", text: due ? "Programado (publicando…)" : "Programado" };
}

function renderReleasesList() {
  const tbody = clear($("releasesTbody"));
  releases.slice().sort(function (a, b) {
    return (b.releaseDate || "").localeCompare(a.releaseDate || "");
  }).forEach(function (rel) {
    const badge = releaseStatusBadge(rel);
    const actions = el("div", { class: "row-actions" }, [
      el("button", { class: "btn btn-sm", type: "button", text: "Editar", onclick: function () { openReleaseForm(rel); } }),
      rel.status === "scheduled"
        ? el("button", { class: "btn btn-sm", type: "button", text: "Publicar ahora", onclick: function () { patchReleaseStatus(rel, "published"); } })
        : el("button", { class: "btn btn-sm", type: "button", text: "Pasar a programado", onclick: function () { patchReleaseStatus(rel, "scheduled"); } }),
      el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar", onclick: function () { deleteRelease(rel); } }),
    ]);

    tbody.appendChild(el("tr", null, [
      el("td", { text: rel.artist }),
      el("td", { text: rel.title }),
      el("td", { text: rel.releaseDate }),
      el("td", null, [el("span", { class: "status-pill " + badge.cls, text: badge.text })]),
      el("td", null, [actions]),
    ]));
  });
}

function patchReleaseStatus(rel, status) {
  api("/api/releases/" + rel.slug, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status }),
  }).then(function (r) { return r.json(); }).then(function (updated) {
    const idx = releases.findIndex(function (r) { return r.slug === rel.slug; });
    if (idx !== -1) releases[idx] = updated;
    renderReleasesList();
    showToast(status === "published" ? "Publicado" : "Pasado a programado");
  }).catch(function () { showToast("Error al actualizar", true); });
}

function deleteRelease(rel) {
  if (!confirm('¿Eliminar "' + rel.title + '"? No se puede deshacer.')) return;
  api("/api/releases/" + rel.slug, { method: "DELETE" }).then(function () {
    releases = releases.filter(function (r) { return r.slug !== rel.slug; });
    renderReleasesList();
    showToast("Eliminado");
  }).catch(function () { showToast("Error al eliminar", true); });
}

function renderArtistDatalist() {
  const dl = clear($("knownArtists"));
  artists.forEach(function (a) { dl.appendChild(el("option", { value: a.name })); });
}

function releaseForm() { return $("releaseForm"); }

function openReleaseForm(rel) {
  const f = releaseForm();
  editingReleaseSlug = rel ? rel.slug : null;
  pendingCoverFile = null;
  $("releaseFormTitle").textContent = rel ? "Editar lanzamiento" : "Nuevo lanzamiento";
  f.reset();
  clear($("tracksList"));
  $("coverInput").value = "";
  $("artistHint").textContent = "";
  const preview = $("coverPreview");
  const statusHint = $("releaseStatusHint");

  if (rel) {
    f.artist.value = rel.artist || "";
    f.title.value = rel.title || "";
    f.suffix.value = rel.suffix || "single";
    f.releaseDate.value = rel.releaseDate || "";
    f.sfNumber.value = rel.sfNumber || "";
    (rel.tracks || []).forEach(function (t) { addSubrow($("tracksList"), "Nombre de la canción", [t]); });
    f.credits.value = rel.credits || "";
    const s = rel.streaming || {};
    f.streamingSpotify.value = s.spotify || "";
    f.streamingYoutube.value = s.youtube || "";
    f.streamingTidal.value = s.tidal || "";
    f.streamingApple.value = s.apple || "";
    f.streamingDeezer.value = s.deezer || "";
    f.streamingBandcamp.value = s.bandcamp || "";
    f.video.value = typeof rel.video === "string" ? rel.video : "";
    if (rel.coverKey) {
      preview.src = "/api/covers/" + rel.coverKey;
      preview.style.display = "";
    } else {
      preview.style.display = "none";
    }
    const badge = releaseStatusBadge(rel);
    statusHint.textContent = rel.status === "published" ? "Ya publicado." : badge.text;
    statusHint.className = "hint" + (badge.cls === "blocked" ? " warn" : "");
  } else {
    addSubrow($("tracksList"), "Nombre de la canción");
    preview.style.display = "none";
    statusHint.textContent = 'Se crea como "Programado" y se publica solo en la fecha (o con "Publicar ahora").';
    statusHint.className = "hint";
  }
  $("releaseFormSection").hidden = false;
  $("releaseFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Entry points for the Estado section's "Editar" shortcuts.
export function openReleaseBySlug(slug) {
  showSection("lanzamientos");
  switchTab("releases");
  return ensureLoaded().then(function () {
    const rel = releases.find(function (r) { return r.slug === slug; });
    if (rel) openReleaseForm(rel);
  });
}

export function openArtistBySlug(slug) {
  showSection("lanzamientos");
  switchTab("artists");
  return ensureLoaded().then(function () {
    const artist = findArtist(slug);
    if (artist) openArtistForm(artist);
  });
}

function buildReleasePayload() {
  const f = releaseForm();
  const streaming = {};
  ["Spotify", "Youtube", "Tidal", "Apple", "Deezer", "Bandcamp"].forEach(function (key) {
    const val = f["streaming" + key].value.trim();
    if (val) streaming[key.toLowerCase()] = val;
  });
  return {
    artist: f.artist.value.trim(),
    title: f.title.value.trim(),
    suffix: f.suffix.value,
    sfNumber: f.sfNumber.value ? Number(f.sfNumber.value) : undefined,
    releaseDate: f.releaseDate.value,
    tracks: readSubrows($("tracksList")).map(function (row) { return row[0]; }),
    credits: f.credits.value.trim() || undefined,
    streaming: streaming,
    video: f.video.value.trim() || undefined,
  };
}

function uploadCoverIfNeeded(slug) {
  if (!pendingCoverFile) return Promise.resolve();
  return api("/api/releases/" + slug + "/cover", {
    method: "POST",
    headers: { "Content-Type": pendingCoverFile.type || "image/jpeg" },
    body: pendingCoverFile,
  });
}

// ================== ARTISTS ==================
function renderArtistsList() {
  const tbody = clear($("artistsTbody"));
  artists.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (a) {
    const complete = isArtistComplete(a);
    tbody.appendChild(el("tr", null, [
      el("td", { text: a.name }),
      el("td", { text: a.instagram ? "@" + a.instagram : "—" }),
      el("td", null, [
        el("span", {
          class: "status-pill " + (complete ? "complete" : "incomplete"),
          text: complete ? "✓ Completa" : "⚠ Falta bio/foto",
        }),
      ]),
      el("td", null, [
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm", type: "button", text: "Editar", onclick: function () { openArtistForm(a); } }),
          el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar", onclick: function () { deleteArtist(a); } }),
        ]),
      ]),
    ]));
  });
}

function deleteArtist(a) {
  const hasReleases = releases.some(function (r) { return r.artistSlug === a.slug; });
  let msg = '¿Eliminar "' + a.name + '"? No se puede deshacer.';
  if (hasReleases) msg += "\n\nOjo: tiene lanzamientos asociados — van a quedar bloqueados para siempre (el artista ya no va a existir).";
  if (!confirm(msg)) return;
  api("/api/artists/" + a.slug, { method: "DELETE" }).then(function () {
    artists = artists.filter(function (x) { return x.slug !== a.slug; });
    renderArtistsList();
    renderArtistDatalist();
    renderReleasesList();
    showToast("Eliminado");
  }).catch(function () { showToast("Error al eliminar", true); });
}

function artistForm() { return $("artistForm"); }

function updateArtistCompleteHint() {
  const f = artistForm();
  const hasBio = f.bio.value.trim().length > 0;
  const editing = editingArtistSlug ? findArtist(editingArtistSlug) : null;
  const hasPhoto = !!pendingPhotoFile || !!(editing && editing.photoKey);
  const hint = $("artistCompleteHint");
  if (hasBio && hasPhoto) { hint.textContent = ""; return; }
  const missing = [];
  if (!hasBio) missing.push("bio");
  if (!hasPhoto) missing.push("foto");
  hint.textContent = "Falta " + missing.join(" y ") + " — sus lanzamientos no se van a publicar hasta que la ficha esté completa.";
}

function openArtistForm(a) {
  const f = artistForm();
  editingArtistSlug = a ? a.slug : null;
  pendingPhotoFile = null;
  $("artistFormTitle").textContent = a ? "Editar artista" : "Nuevo artista";
  f.reset();
  clear($("membersList"));
  $("artistPhotoInput").value = "";
  const preview = $("artistPhotoPreview");

  if (a) {
    f.name.value = a.name || "";
    f.instagram.value = a.instagram || "";
    f.spotify.value = a.spotify || "";
    f.bio.value = a.bio || "";
    (a.members || []).forEach(function (m) { addSubrow($("membersList"), "Nombre del integrante", [m]); });
    if (a.photoKey) {
      preview.src = "/api/artist-photos/" + a.photoKey;
      preview.style.display = "";
    } else {
      preview.style.display = "none";
    }
  } else {
    preview.style.display = "none";
  }
  updateArtistCompleteHint();
  $("artistFormSection").hidden = false;
  $("artistFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildArtistPayload() {
  const f = artistForm();
  return {
    name: f.name.value.trim(),
    instagram: f.instagram.value.trim().replace(/^@/, "") || null,
    spotify: f.spotify.value.trim() || undefined,
    bio: f.bio.value.trim() || undefined,
    members: readSubrows($("membersList")).map(function (row) { return row[0]; }),
  };
}

function uploadPhotoIfNeeded(slug) {
  if (!pendingPhotoFile) return Promise.resolve();
  return api("/api/artists/" + slug + "/photo", {
    method: "POST",
    headers: { "Content-Type": pendingPhotoFile.type || "image/jpeg" },
    body: pendingPhotoFile,
  });
}

function wire() {
  $("tabReleasesBtn").addEventListener("click", function () { switchTab("releases"); });
  $("tabArtistsBtn").addEventListener("click", function () { switchTab("artists"); });

  $("addTrackBtn").addEventListener("click", function () {
    addSubrow($("tracksList"), "Nombre de la canción");
  });
  $("newReleaseBtn").addEventListener("click", function () { openReleaseForm(null); });
  $("cancelReleaseFormBtn").addEventListener("click", function () { $("releaseFormSection").hidden = true; });

  $("releaseArtistInput").addEventListener("input", function (e) {
    const hint = $("artistHint");
    const name = e.target.value.trim();
    if (!name) { hint.textContent = ""; return; }
    const slug = slugifyGuess(name);
    const exists = artists.some(function (a) { return a.slug === slug; });
    hint.textContent = exists
      ? ""
      : "Artista nuevo — necesita ficha completa (bio + foto) en la pestaña Artistas antes de publicarse.";
  });

  $("coverInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    pendingCoverFile = file || null;
    if (file) {
      const preview = $("coverPreview");
      preview.src = URL.createObjectURL(file);
      preview.style.display = "";
    }
  });

  releaseForm().addEventListener("submit", function (e) {
    e.preventDefault();
    const payload = buildReleasePayload();
    if (!payload.artist || !payload.title || !payload.releaseDate) {
      showToast("Falta artista, título o fecha", true);
      return;
    }
    const req = editingReleaseSlug
      ? api("/api/releases/" + editingReleaseSlug, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : api("/api/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    req.then(function (r) { return r.json(); }).then(function (saved) {
      return uploadCoverIfNeeded(saved.slug);
    }).then(function () {
      return loadAll();
    }).then(function () {
      renderReleasesList();
      renderArtistDatalist();
      $("releaseFormSection").hidden = true;
      showToast("Guardado");
    }).catch(function () { showToast("Error al guardar", true); });
  });

  $("addMemberBtn").addEventListener("click", function () {
    addSubrow($("membersList"), "Nombre del integrante");
  });
  $("newArtistBtn").addEventListener("click", function () { openArtistForm(null); });
  $("cancelArtistFormBtn").addEventListener("click", function () { $("artistFormSection").hidden = true; });
  artistForm().bio.addEventListener("input", updateArtistCompleteHint);

  $("artistPhotoInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    pendingPhotoFile = file || null;
    if (file) {
      const preview = $("artistPhotoPreview");
      preview.src = URL.createObjectURL(file);
      preview.style.display = "";
    }
    updateArtistCompleteHint();
  });

  artistForm().addEventListener("submit", function (e) {
    e.preventDefault();
    const payload = buildArtistPayload();
    if (!payload.name) {
      showToast("Falta el nombre", true);
      return;
    }
    const req = editingArtistSlug
      ? api("/api/artists/" + editingArtistSlug, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : api("/api/artists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    req.then(function (r) { return r.json(); }).then(function (saved) {
      return uploadPhotoIfNeeded(saved.slug);
    }).then(function () {
      return loadAll();
    }).then(function () {
      renderArtistsList();
      renderArtistDatalist();
      renderReleasesList(); // a newly-completed artist can unblock releases
      $("artistFormSection").hidden = true;
      showToast("Guardado");
    }).catch(function () { showToast("Error al guardar", true); });
  });
}

export default {
  init: function () {
    wire();
    return ensureLoaded();
  },
};
