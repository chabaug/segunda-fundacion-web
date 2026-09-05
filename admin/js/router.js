// Hash router for the portal's sections (#eventos, #lanzamientos, #tests,
// #estado). Lives in its own module so sections can navigate to each other
// -- Estado sends you to a release's form in Lanzamientos -- without an
// import cycle through app.js.

const registry = new Map();
let started = false;

export function registerSection(name, handlers) {
  registry.set(name, { handlers: handlers, initialized: false });
}

export function sectionNames() {
  return Array.from(registry.keys());
}

export function showSection(name) {
  if (!registry.has(name)) name = registry.keys().next().value;

  registry.forEach(function (entry, key) {
    const panel = document.getElementById("section-" + key);
    if (panel) panel.hidden = key !== name;
    const navBtn = document.querySelector('.nav-btn[data-section="' + key + '"]');
    if (navBtn) navBtn.classList.toggle("active", key === name);
  });

  const entry = registry.get(name);
  if (!entry) return;
  if (!entry.initialized) {
    entry.initialized = true;
    if (entry.handlers.init) entry.handlers.init();
  } else if (entry.handlers.onShow) {
    entry.handlers.onShow();
  }

  if (started && window.location.hash.slice(1) !== name) {
    // replaceState, not a hash assignment: navigating between sections
    // shouldn't pile up history entries you then have to back out of one
    // by one.
    window.history.replaceState(null, "", "#" + name);
  }
}

export function startRouter(defaultName) {
  const fromHash = window.location.hash.slice(1);
  started = true;
  showSection(registry.has(fromHash) ? fromHash : defaultName);
  window.addEventListener("hashchange", function () {
    const name = window.location.hash.slice(1);
    if (registry.has(name)) showSection(name);
  });
}
