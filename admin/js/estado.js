// Estado del sitio: what's still pending, how complete the catalogue's own
// content is, and which pages the test suite actually covers.
//
// The three blocks answer different questions and come from different places:
// pendientes are hand-curated (Blobs, admin-only), content coverage is
// computed live from the same API the public site reads, and test coverage
// comes from the CI job that scans the specs.
import {
  $, el, clear, api, apiJSON, showToast, fmtDateTime,
} from "./core.js";
import { loadStatus } from "./status.js";
import { openReleaseBySlug, openArtistBySlug } from "./catalogo.js";
import { openEventById } from "./eventos.js";

const MAX_GAPS_SHOWN = 8;

const CATEGORY_LABELS = {
  "esperando-terceros": "Esperando a terceros",
  "decision-pendiente": "Decisión pendiente",
  "implementacion": "A implementar",
  "dato-menor": "Dato menor",
  "info": "Info",
};

let pendientes = [];
let editingPendienteId = null;

// ================== PENDIENTES ==================
function loadPendientes() {
  return apiJSON("/api/pendientes").then(function (list) {
    pendientes = Array.isArray(list) ? list : [];
  });
}

function renderPendientes() {
  const list = clear($("pendientesList"));
  $("pendientesEmpty").hidden = pendientes.length > 0;

  const order = { "esperando-terceros": 0, "decision-pendiente": 1, "implementacion": 2, "dato-menor": 3, "info": 4 };
  pendientes.slice().sort(function (a, b) {
    // Open items first, then by how much they block: something waiting on a
    // third party is the one worth chasing today.
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    const rankA = order[a.category] === undefined ? 9 : order[a.category];
    const rankB = order[b.category] === undefined ? 9 : order[b.category];
    return rankA - rankB;
  }).forEach(function (item) {
    const done = item.status === "done";
    list.appendChild(el("li", { class: done ? "done" : "" }, [
      el("div", { class: "pend-head" }, [
        el("span", { class: "pend-title", text: item.title }),
        el("div", { class: "row-actions" }, [
          el("span", {
            class: "status-pill " + (done ? "ok" : item.category === "esperando-terceros" ? "warn" : "neutral"),
            text: CATEGORY_LABELS[item.category] || item.category,
          }),
          el("button", {
            class: "btn btn-sm", type: "button",
            text: done ? "Reabrir" : "Resuelto",
            onclick: function () { patchPendiente(item, { status: done ? "open" : "done" }); },
          }),
          el("button", { class: "btn btn-sm", type: "button", text: "Editar", onclick: function () { openPendienteForm(item); } }),
          el("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar", onclick: function () { deletePendiente(item); } }),
        ]),
      ]),
      item.detail ? el("div", { class: "pend-detail", text: item.detail }) : null,
    ]));
  });
}

function patchPendiente(item, patch) {
  apiJSON("/api/pendientes/" + item.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(function (updated) {
    pendientes = pendientes.map(function (p) { return p.id === item.id ? updated : p; });
    renderPendientes();
    showToast("Actualizado");
  }).catch(function () { showToast("Error al actualizar", true); });
}

function deletePendiente(item) {
  if (!confirm('¿Eliminar "' + item.title + '"?')) return;
  api("/api/pendientes/" + item.id, { method: "DELETE" }).then(function () {
    pendientes = pendientes.filter(function (p) { return p.id !== item.id; });
    renderPendientes();
    showToast("Eliminado");
  }).catch(function () { showToast("Error al eliminar", true); });
}

function openPendienteForm(item) {
  const f = $("pendienteForm");
  editingPendienteId = item ? item.id : null;
  f.reset();
  if (item) {
    f.title.value = item.title || "";
    f.category.value = item.category || "implementacion";
    f.detail.value = item.detail || "";
  }
  $("pendienteFormWrap").hidden = false;
  f.title.focus();
}

function wirePendientes() {
  $("newPendienteBtn").addEventListener("click", function () { openPendienteForm(null); });
  $("cancelPendienteBtn").addEventListener("click", function () { $("pendienteFormWrap").hidden = true; });

  $("pendienteForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const f = $("pendienteForm");
    const payload = {
      title: f.title.value.trim(),
      category: f.category.value,
      detail: f.detail.value.trim(),
    };
    if (!payload.title) { showToast("Falta el título", true); return; }

    const req = editingPendienteId
      ? apiJSON("/api/pendientes/" + editingPendienteId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : apiJSON("/api/pendientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    req.then(function () { return loadPendientes(); }).then(function () {
      renderPendientes();
      $("pendienteFormWrap").hidden = true;
      showToast("Guardado");
    }).catch(function () { showToast("Error al guardar", true); });
  });
}

// ================== COBERTURA DE CONTENIDO ==================
function covRow(label, done, total, kind) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  const barClass = kind === "info" ? "cov-bar info" : pct >= 100 ? "cov-bar" : pct >= 70 ? "cov-bar warn" : "cov-bar bad";
  const bar = el("div", { class: barClass }, [el("span", { style: "width:" + pct + "%" })]);
  return el("div", { class: "cov-row" }, [
    el("div", { class: "cov-label", text: label }),
    bar,
    el("div", { class: "cov-n", text: done + "/" + total }),
  ]);
}

// One row per item, listing everything it's missing at once. Grouping the
// other way round (a block per check) made the same release show up three
// times, which reads as three problems instead of one incomplete entry.
function gapBlock(title, items, openFn) {
  if (!items.length) return null;
  const list = el("ul", { class: "gap-list" });
  items.slice(0, MAX_GAPS_SHOWN).forEach(function (item) {
    list.appendChild(el("li", null, [
      el("span", null, [
        el("strong", { text: item.label }),
        el("span", { class: "what", text: " — " + item.missing.join(", ") }),
      ]),
      el("button", { class: "btn btn-sm", type: "button", text: "Editar", onclick: function () { openFn(item.key); } }),
    ]));
  });
  if (items.length > MAX_GAPS_SHOWN) {
    list.appendChild(el("li", null, [
      el("span", { class: "what", text: "…y " + (items.length - MAX_GAPS_SHOWN) + " más" }),
    ]));
  }
  return el("div", { style: "margin-top:18px;" }, [
    el("h4", { style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--heading);margin:0;", text: "Falta cargar — " + title }),
    list,
  ]);
}

function hasStreaming(rel) {
  const s = rel.streaming || {};
  return Object.keys(s).some(function (k) { return !!s[k]; });
}

function renderContentCoverage(releases, artists, events) {
  const wrap = clear($("contentCov"));
  const gaps = clear($("contentGaps"));

  const upcoming = events.filter(function (ev) { return ev.status === "active"; });
  $("contentCovMeta").textContent =
    releases.length + " lanzamientos · " + artists.length + " artistas · " + upcoming.length + " shows activos";

  const relChecks = [
    { label: "Lanzamientos con tapa", ok: function (r) { return !!r.coverKey; }, what: "sin tapa", kind: "required" },
    { label: "Con links de streaming", ok: hasStreaming, what: "sin links de streaming", kind: "required" },
    { label: "Con créditos", ok: function (r) { return !!(r.credits && r.credits.trim()); }, what: "sin créditos", kind: "required" },
    // Most releases simply never had a video — this is context, not a gap,
    // so it's shown neutral instead of red.
    { label: "Con videoclip (informativo)", ok: function (r) { return !!r.video; }, what: "sin videoclip", kind: "info" },
  ];
  const artistChecks = [
    { label: "Artistas con bio", ok: function (a) { return !!(a.bio && a.bio.trim()); }, what: "sin bio", kind: "required" },
    { label: "Artistas con foto", ok: function (a) { return !!a.photoKey; }, what: "sin foto", kind: "required" },
    { label: "Con Instagram", ok: function (a) { return !!a.instagram; }, what: "sin Instagram", kind: "info" },
    { label: "Con Spotify", ok: function (a) { return !!a.spotify; }, what: "sin Spotify", kind: "info" },
  ];
  const eventChecks = [
    { label: "Shows activos con flyer", ok: function (e) { return !!e.flyerKey; }, what: "sin flyer", kind: "required" },
    { label: "Shows activos con entradas", ok: function (e) { return !!e.ticketUrl; }, what: "sin link de entradas", kind: "required" },
  ];

  function renderGroup(title, items, checks, labelOf, keyOf, openFn) {
    wrap.appendChild(el("h4", {
      style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--heading);margin:14px 0 10px;",
      text: title,
    }));
    checks.forEach(function (check) {
      const done = items.filter(check.ok).length;
      wrap.appendChild(covRow(check.label, done, items.length, check.kind));
    });

    const required = checks.filter(function (c) { return c.kind === "required"; });
    const incomplete = items.map(function (i) {
      return {
        label: labelOf(i),
        key: keyOf(i),
        missing: required.filter(function (c) { return !c.ok(i); }).map(function (c) { return c.what; }),
      };
    }).filter(function (row) { return row.missing.length > 0; });

    const block = gapBlock(title, incomplete, openFn);
    if (block) gaps.appendChild(block);
  }

  renderGroup("Lanzamientos", releases, relChecks,
    function (r) { return r.artist + " — " + r.title; },
    function (r) { return r.slug; },
    openReleaseBySlug);

  renderGroup("Artistas", artists, artistChecks,
    function (a) { return a.name; },
    function (a) { return a.slug; },
    openArtistBySlug);

  renderGroup("Shows activos", upcoming, eventChecks,
    function (e) { return e.name + " (" + e.date + ")"; },
    function (e) { return e.id; },
    openEventById);
}

// ================== COBERTURA DE TESTS ==================
function renderTestCoverage(coverage) {
  const tbody = clear($("testCovTbody"));
  const empty = $("testCovEmpty");
  const unitWrap = clear($("unitSpecs"));

  if (!coverage || !Array.isArray(coverage.pages)) {
    empty.hidden = false;
    empty.textContent = "Todavía no hay datos de cobertura publicados — los genera el nightly de RTS.";
    $("testCovMeta").textContent = "";
    return;
  }
  empty.hidden = true;

  const t = coverage.totals || {};
  $("testCovMeta").textContent =
    (t.pagesCovered || 0) + "/" + (t.pages || 0) + " páginas con specs · " +
    (t.tests || 0) + " tests (" + (t.batTests || 0) + " @bat) · " +
    (coverage.commit ? coverage.commit + " · " : "") + fmtDateTime(coverage.generatedAt);

  coverage.pages.slice().sort(function (a, b) { return a.tests - b.tests; }).forEach(function (row) {
    const covered = row.specs.length > 0;
    tbody.appendChild(el("tr", null, [
      el("td", { text: row.page }),
      el("td", { text: row.specs.length ? row.specs.join(", ") : "—" }),
      el("td", { text: String(row.tests) }),
      el("td", { text: String(row.batTests) }),
      el("td", null, [
        el("span", {
          class: "status-pill " + (covered ? "ok" : "bad"),
          text: covered ? "Cubierta" : "Sin tests",
        }),
      ]),
    ]));
  });

  const unit = (coverage.specs || []).filter(function (s) { return !s.pages || !s.pages.length; });
  if (unit.length) {
    unitWrap.appendChild(el("p", {
      class: "empty",
      text: "Specs sin página asociada (unit / API): " +
        unit.map(function (s) { return s.file + " (" + s.tests + ")"; }).join(", "),
    }));
  }
}

// ================== SECTION ==================
function loadContent() {
  return Promise.all([
    api("/api/releases?admin=1").then(function (r) { return r.json(); }).catch(function () { return []; }),
    api("/api/artists?admin=1").then(function (r) { return r.json(); }).catch(function () { return []; }),
    api("/api/events?admin=1").then(function (r) { return r.json(); }).catch(function () { return []; }),
  ]).then(function (res) {
    renderContentCoverage(
      Array.isArray(res[0]) ? res[0] : [],
      Array.isArray(res[1]) ? res[1] : [],
      Array.isArray(res[2]) ? res[2] : []
    );
  });
}

function loadAll(force) {
  return Promise.all([
    loadPendientes().then(renderPendientes).catch(function () {
      showToast("No se pudieron cargar los pendientes", true);
    }),
    loadContent(),
    loadStatus(force).then(function (payload) { renderTestCoverage(payload && payload.coverage); })
      .catch(function () { renderTestCoverage(null); }),
  ]);
}

export default {
  init: function () {
    wirePendientes();
    $("estadoReloadBtn").addEventListener("click", function () { loadAll(true); });
    return loadAll(false);
  },
  onShow: function () {
    // Content coverage is derived from data the other two sections edit, so
    // it would go stale the moment you fix something and come back here.
    return loadContent();
  },
};
