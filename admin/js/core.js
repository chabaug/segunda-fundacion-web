// Shared plumbing for the admin portal: the single auth token, the fetch
// wrapper that carries it, and a couple of DOM helpers every section uses.

// One key for the whole portal. The two pre-unification panels each kept
// their own (and the catálogo one made you paste the raw token by hand), so
// an existing session in either is adopted here instead of forcing a
// re-login.
const TOKEN_KEY = "sfAdminToken";
const LEGACY_TOKEN_KEYS = ["sfEventsAdminToken", "sfCatalogAdminToken"];

let token = readStoredToken();

function readStoredToken() {
  try {
    const own = localStorage.getItem(TOKEN_KEY);
    if (own) return own;
    for (const key of LEGACY_TOKEN_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
  } catch (e) {
    // Private mode / blocked storage: fall through to an empty token, which
    // just means the gate asks for the password.
  }
  return "";
}

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value || "";
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) { /* nothing to do — the session still works in memory */ }
}

export function clearToken() {
  token = "";
  try {
    localStorage.removeItem(TOKEN_KEY);
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  } catch (e) { /* ignore */ }
}

export function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: "Bearer " + token }, opts.headers || {});
  return fetch(path, opts);
}

export function apiJSON(path, opts) {
  return api(path, opts).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " on " + path);
    return r.status === 204 ? null : r.json();
  });
}

let toastTimer = null;
export function showToast(msg, danger) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = danger ? "danger" : "";
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
}

export function $(id) {
  return document.getElementById(id);
}

export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      if (key === "class") node.className = props[key];
      else if (key === "text") node.textContent = props[key];
      else if (key === "html") node.innerHTML = props[key];
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), props[key]);
      else if (props[key] !== null && props[key] !== undefined) node.setAttribute(key, props[key]);
    }
  }
  (children || []).forEach(function (child) {
    if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

export function clear(node) {
  node.innerHTML = "";
  return node;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(ms) {
  if (!ms && ms !== 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return min ? min + "m " + String(sec).padStart(2, "0") + "s" : sec + "s";
}

// Small reusable list-of-inputs builder (tracks, members, artist rows...).
// `placeholders` takes one string for a single-input row, or two for a pair.
export function addSubrow(container, placeholders, values) {
  const list = Array.isArray(placeholders) ? placeholders : [placeholders];
  const vals = values || [];
  const row = el("div", { class: "subrow" });
  const inputs = list.map(function (placeholder, i) {
    return el("input", { type: "text", placeholder: placeholder, value: vals[i] || "" });
  });
  inputs.forEach(function (input) { row.appendChild(input); });
  row.appendChild(el("button", {
    type: "button",
    class: "btn btn-sm",
    text: "×",
    onclick: function () { row.remove(); },
  }));
  container.appendChild(row);
  return row;
}

export function readSubrows(container) {
  return Array.from(container.querySelectorAll(".subrow")).map(function (row) {
    return Array.from(row.querySelectorAll("input")).map(function (input) { return input.value.trim(); });
  }).filter(function (values) {
    return values.some(function (v) { return v; });
  });
}

export function statCard(value, label, kind) {
  return el("div", { class: "stat" + (kind ? " " + kind : "") }, [
    el("div", { class: "n", text: String(value) }),
    el("div", { class: "l", text: label }),
  ]);
}

// Chart.js comes from a CDN — every caller has to survive it not being there
// (offline, blocked, CDN hiccup) rather than throwing and taking the whole
// section down with it.
export function chartAvailable() {
  return typeof window.Chart !== "undefined";
}
