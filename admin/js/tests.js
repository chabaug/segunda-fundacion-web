// Tests section: the latest BAT and RTS runs as a stacked bar (same read as
// the sf-status dashboard), an expandable line chart of the last 10 runs of
// whichever suite is selected, and the curated reasons behind the skips.
import {
  $, el, clear, statCard, showToast, fmtDateTime, fmtDuration, chartAvailable,
} from "./core.js";
import { loadStatus } from "./status.js";

const HISTORY_RUNS = 10;

const COLORS = {
  passed: "#2E8358",
  failed: "#B5502A",
  skipped: "#B8860B",
  duration: "#5E5E67",
};

let data = null;
let selectedSuite = "BAT";
let latestChart = null;
let historyChart = null;

function suites() {
  return [data && data.bat, data && data.rts].filter(Boolean);
}

function historyFor(suite) {
  const list = suite === "RTS" ? (data && data.rtsHistory) : (data && data.batHistory);
  return Array.isArray(list) ? list.slice(-HISTORY_RUNS) : [];
}

function renderLatest() {
  const statsEl = clear($("testStats"));
  const list = suites();
  const empty = $("testsEmpty");

  if (!list.length) {
    empty.hidden = false;
    $("testsMeta").textContent = "";
    document.querySelector("#testsChart").closest(".chart-wrap").hidden = true;
    return;
  }
  empty.hidden = true;
  document.querySelector("#testsChart").closest(".chart-wrap").hidden = false;

  const newest = list.reduce(function (a, b) {
    return new Date(a.generatedAt) > new Date(b.generatedAt) ? a : b;
  });
  $("testsMeta").textContent = "último dato: " + fmtDateTime(newest.generatedAt);

  list.forEach(function (s) {
    statsEl.appendChild(statCard(s.counts.total, s.suite + " total"));
    statsEl.appendChild(statCard(s.counts.passed, s.suite + " passed", "ok"));
    statsEl.appendChild(statCard(s.counts.failed, s.suite + " failed", s.counts.failed ? "bad" : "ok"));
    statsEl.appendChild(statCard(s.counts.skipped, s.suite + " skipped", s.counts.skipped ? "warn" : ""));
  });

  if (!chartAvailable()) {
    document.querySelector("#testsChart").closest(".chart-wrap").hidden = true;
    return;
  }
  if (latestChart) latestChart.destroy();
  latestChart = new window.Chart($("testsChart"), {
    type: "bar",
    data: {
      labels: list.map(function (s) { return s.suite + (s.commit ? " (" + s.commit + ")" : ""); }),
      datasets: [
        { label: "Passed", data: list.map(function (s) { return s.counts.passed; }), backgroundColor: COLORS.passed },
        { label: "Failed", data: list.map(function (s) { return s.counts.failed; }), backgroundColor: COLORS.failed },
        { label: "Skipped", data: list.map(function (s) { return s.counts.skipped; }), backgroundColor: COLORS.skipped },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function renderHistory() {
  const runs = historyFor(selectedSuite);
  const tbody = clear($("histTbody"));
  const empty = $("histEmpty");
  const chartWrap = document.querySelector("#histChart").closest(".chart-wrap");

  if (!runs.length) {
    empty.hidden = false;
    empty.textContent = "Todavía no hay historial de " + selectedSuite +
      " — se empieza a llenar con la próxima corrida que publique el workflow.";
    chartWrap.hidden = true;
    if (historyChart) { historyChart.destroy(); historyChart = null; }
    return;
  }
  empty.hidden = true;

  runs.slice().reverse().forEach(function (run) {
    const counts = run.counts || {};
    tbody.appendChild(el("tr", null, [
      el("td", { text: fmtDateTime(run.generatedAt) }),
      el("td", { text: run.commit || "—" }),
      el("td", { text: String(counts.passed != null ? counts.passed : "—") }),
      el("td", null, [
        el("span", {
          class: "status-pill " + (counts.failed ? "bad" : "ok"),
          text: String(counts.failed != null ? counts.failed : "—"),
        }),
      ]),
      el("td", { text: String(counts.skipped != null ? counts.skipped : "—") }),
      el("td", { text: fmtDuration(run.durationMs) }),
      el("td", null, [
        run.runUrl
          ? el("a", { href: run.runUrl, target: "_blank", rel: "noopener", class: "btn btn-sm", text: "Ver corrida" })
          : null,
      ]),
    ]));
  });

  if (!chartAvailable()) {
    chartWrap.hidden = true;
    empty.hidden = false;
    empty.textContent = "No se pudo cargar la librería de gráficos — la tabla de abajo tiene los mismos datos.";
    return;
  }
  chartWrap.hidden = false;

  const labels = runs.map(function (run) {
    return (run.generatedAt || "").slice(5, 10) + (run.commit ? " " + run.commit : "");
  });

  if (historyChart) historyChart.destroy();
  historyChart = new window.Chart($("histChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        { label: "Passed", data: runs.map(function (r) { return r.counts && r.counts.passed; }), borderColor: COLORS.passed, backgroundColor: "rgba(46,131,88,.12)", fill: true, tension: 0.25, yAxisID: "y" },
        { label: "Failed", data: runs.map(function (r) { return r.counts && r.counts.failed; }), borderColor: COLORS.failed, tension: 0.25, yAxisID: "y" },
        { label: "Skipped", data: runs.map(function (r) { return r.counts && r.counts.skipped; }), borderColor: COLORS.skipped, tension: 0.25, yAxisID: "y" },
        // Duration rides a second axis: it's the number that quietly creeps
        // up while the counts stay green.
        { label: "Duración (min)", data: runs.map(function (r) { return r.durationMs ? +(r.durationMs / 60000).toFixed(1) : null; }), borderColor: COLORS.duration, borderDash: [5, 4], tension: 0.25, yAxisID: "y1" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "tests" } },
        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "min" } },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });
}

// ---------- detalle de fallas y skips ----------

// The curated notes in sf-status quote the test title, sometimes truncated
// with an ellipsis and followed by the projects it applies to. Match on a
// prefix of the quoted part rather than on equality, so a note keeps
// attaching to its test even when the quote was shortened by hand.
function curatedNoteFor(title) {
  const items = (data && data.testPendientes && data.testPendientes.items) || [];
  const normalized = String(title || "").toLowerCase();
  for (const item of items) {
    const quoted = String(item.title || "").match(/"([^"]+)"/);
    if (!quoted) continue;
    const needle = quoted[1].replace(/[.…]+$/, "").toLowerCase().trim();
    if (!needle) continue;
    if (normalized.indexOf(needle.slice(0, 40)) !== -1) return item.reason || null;
  }
  return null;
}

// One row per test, not per project: the same skip reported on desktop,
// firefox and webkit is one thing to understand, not three.
function groupByTest(entries) {
  const groups = new Map();
  (entries || []).forEach(function (entry) {
    const key = (entry.file || "") + " ▸ " + (entry.title || "");
    if (!groups.has(key)) {
      groups.set(key, {
        file: entry.file,
        title: entry.title,
        location: entry.location || null,
        projects: [],
        reason: entry.reason || null,
        error: entry.error || null,
      });
    }
    const group = groups.get(key);
    if (entry.project && group.projects.indexOf(entry.project) === -1) group.projects.push(entry.project);
    if (!group.reason && entry.reason) group.reason = entry.reason;
    if (!group.error && entry.error) group.error = entry.error;
    if (!group.location && entry.location) group.location = entry.location;
  });
  return Array.from(groups.values());
}

function detailItem(group, kind, runUrl) {
  const curated = curatedNoteFor(group.title);
  const own = kind === "failure" ? group.error : group.reason;

  const why = el("div", { class: "pend-detail" });
  if (own) {
    why.appendChild(el("div", { class: kind === "failure" ? "detail-mono" : "", text: own }));
  }
  if (curated) {
    why.appendChild(el("div", { style: own ? "margin-top:6px;" : "" }, [
      el("span", { class: "what", text: "Nota: " }),
      el("span", { text: curated }),
    ]));
  }
  if (!own && !curated) {
    why.appendChild(el("span", {
      class: "what",
      text: kind === "failure"
        ? "Sin detalle en el reporte — abrí la corrida para ver el error completo."
        : "Sin motivo registrado. Se toma del segundo argumento de test.skip(cond, \"motivo\"), o de una nota curada en sf-status.",
    }));
  }

  const chips = el("span", { class: "row-actions" });
  group.projects.forEach(function (project) {
    chips.appendChild(el("span", { class: "status-pill neutral", text: project }));
  });
  if (kind === "failure" && runUrl) {
    chips.appendChild(el("a", { class: "btn btn-sm", href: runUrl, target: "_blank", rel: "noopener", text: "Ver corrida" }));
  }

  return el("li", null, [
    el("div", { class: "pend-head" }, [
      el("span", { class: "pend-title", text: group.title }),
      chips,
    ]),
    el("div", { class: "what", text: group.file + (group.location ? " · " + group.location : "") }),
    why,
  ]);
}

function plural(n, singular, many) {
  return n + " " + (n === 1 ? singular : many);
}

function suiteDetailBlock(summary) {
  const failures = groupByTest(summary.failures);
  const skips = groupByTest(summary.skips);
  if (!failures.length && !skips.length) return null;

  const block = el("div", { style: "margin-bottom:22px;" });
  block.appendChild(el("h4", {
    style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--heading);margin:0 0 10px;",
    text: summary.suite + " — " + plural(summary.counts.failed, "falla", "fallas")
      + " · " + plural(summary.counts.skipped, "skip", "skips")
      + (summary.commit ? " · " + summary.commit : ""),
  }));

  if (failures.length) {
    const list = el("ul", { class: "pend-list" });
    failures.forEach(function (group) { list.appendChild(detailItem(group, "failure", summary.runUrl)); });
    block.appendChild(el("div", { class: "detail-group bad" }, [
      el("div", { class: "detail-group-label", text: "Fallas" }),
      list,
    ]));
  }
  if (skips.length) {
    const list = el("ul", { class: "pend-list" });
    skips.forEach(function (group) { list.appendChild(detailItem(group, "skip", summary.runUrl)); });
    block.appendChild(el("div", { class: "detail-group" + (failures.length ? " spaced" : "") }, [
      el("div", { class: "detail-group-label", text: "Skips" }),
      list,
    ]));
  }
  return block;
}

function renderRunDetail() {
  const card = $("runDetailCard");
  const wrap = clear($("runDetail"));
  const blocks = suites().map(suiteDetailBlock).filter(Boolean);

  if (!blocks.length) {
    card.hidden = suites().length === 0;
    if (!card.hidden) {
      $("runDetailMeta").textContent = "";
      wrap.appendChild(el("p", { class: "empty", text: "Sin fallas ni skips en la última corrida de ninguna de las dos suites." }));
    }
    return;
  }
  card.hidden = false;

  const totalFailed = suites().reduce(function (n, s) { return n + s.counts.failed; }, 0);
  const totalSkipped = suites().reduce(function (n, s) { return n + s.counts.skipped; }, 0);
  $("runDetailMeta").textContent = plural(totalFailed, "falla", "fallas")
    + " · " + plural(totalSkipped, "skip", "skips") + " en total";
  blocks.forEach(function (block) { wrap.appendChild(block); });
}

function renderTestPendientes() {
  const list = clear($("testPendList"));
  const items = (data && Array.isArray(data.testPendientes && data.testPendientes.items))
    ? data.testPendientes.items
    : [];

  if (!items.length) {
    list.appendChild(el("li", null, [el("span", { class: "empty", text: "Sin pendientes de tests registrados." })]));
    return;
  }

  items.forEach(function (item) {
    list.appendChild(el("li", null, [
      el("div", { class: "pend-head" }, [
        el("span", { class: "pend-title", text: item.title }),
        el("span", {
          class: "status-pill " + (item.category === "skip" ? "warn" : "neutral"),
          text: (item.suite ? item.suite + " · " : "") + (item.category === "skip" ? "skip" : item.category),
        }),
      ]),
      el("div", { class: "pend-detail", text: item.reason || "" }),
    ]));
  });
}

function renderAll() {
  renderLatest();
  renderRunDetail();
  renderTestPendientes();
  if (!$("histPanel").hidden) renderHistory();
}

function load(force) {
  return loadStatus(force).then(function (payload) {
    data = payload;
    renderAll();
  }).catch(function () {
    data = null;
    $("testsEmpty").hidden = false;
    $("testsEmpty").textContent = "No se pudo leer el estado de los tests (/api/status).";
    showToast("No se pudo cargar el estado de los tests", true);
  });
}

function wire() {
  $("histToggleBtn").addEventListener("click", function () {
    const panel = $("histPanel");
    const opening = panel.hidden;
    panel.hidden = !opening;
    this.setAttribute("aria-expanded", String(opening));
    this.textContent = opening ? "Ocultar historial" : "Ver últimas 10 corridas";
    if (opening) renderHistory();
  });

  ["BAT", "RTS"].forEach(function (suite) {
    $("histSuite" + suite).addEventListener("click", function () {
      selectedSuite = suite;
      $("histSuiteBAT").className = "tab-btn" + (suite === "BAT" ? " active" : "");
      $("histSuiteRTS").className = "tab-btn" + (suite === "RTS" ? " active" : "");
      if (!$("histPanel").hidden) renderHistory();
    });
  });

  $("testsReloadBtn").addEventListener("click", function () { load(true); });
}

export default {
  init: function () {
    wire();
    return load(false);
  },
};
