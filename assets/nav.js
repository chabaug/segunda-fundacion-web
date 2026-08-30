// Runs immediately (script is loaded un-deferred in <head>) so the stored
// theme applies before first paint — no flash of the wrong palette.
(function(){
  try {
    if (localStorage.getItem('sf-theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();

document.addEventListener('DOMContentLoaded', function(){
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if(toggle && links){
    toggle.addEventListener('click', function(){
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if(themeToggle){
    themeToggle.addEventListener('click', function(){
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if(isDark){
        document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem('sf-theme', 'light'); } catch (e) {}
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        try { localStorage.setItem('sf-theme', 'dark'); } catch (e) {}
      }
    });
  }
});
