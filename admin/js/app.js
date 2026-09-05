// Entry point for the unified admin portal: one login for everything, then a
// hash-routed shell over the four sections.
import { $, api, getToken, setToken, clearToken } from "./core.js";
import { registerSection, showSection, startRouter } from "./router.js";
import eventos from "./eventos.js";
import catalogo from "./catalogo.js";
import tests from "./tests.js";
import estado from "./estado.js";

registerSection("eventos", eventos);
registerSection("lanzamientos", catalogo);
registerSection("tests", tests);
registerSection("estado", estado);

const DEFAULT_SECTION = "eventos";

function enterApp() {
  $("gate").style.display = "none";
  $("app").hidden = false;
  startRouter(DEFAULT_SECTION);
}

// Any admin endpoint would do as a token probe; events is the cheapest.
function tokenIsValid() {
  return api("/api/events?admin=1")
    .then(function (r) { return r.ok; })
    .catch(function () { return false; });
}

function attemptLogin() {
  $("gateError").style.display = "none";
  const username = $("gateUser").value.trim();
  const password = $("gatePassword").value;
  fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username, password: password }),
  }).then(function (r) {
    if (!r.ok) throw new Error("invalid");
    return r.json();
  }).then(function (data) {
    setToken(data.token);
    enterApp();
  }).catch(function () {
    $("gateError").style.display = "block";
  });
}

$("gateSubmit").addEventListener("click", attemptLogin);
$("gatePassword").addEventListener("keydown", function (e) {
  if (e.key === "Enter") attemptLogin();
});
$("gateUser").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("gatePassword").focus();
});

$("logoutBtn").addEventListener("click", function () {
  clearToken();
  window.location.reload();
});

document.querySelectorAll(".nav-btn").forEach(function (btn) {
  btn.addEventListener("click", function () { showSection(btn.dataset.section); });
});

if (getToken()) {
  tokenIsValid().then(function (ok) { if (ok) enterApp(); });
}
