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
    const closeMenu = function(){
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', function(){
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function(e){
      if(!links.classList.contains('open')) return;
      if(links.contains(e.target) || toggle.contains(e.target)) return;
      closeMenu();
    });

    window.addEventListener('scroll', function(){
      if(!links.classList.contains('open')) return;
      closeMenu();
    }, {passive:true});
  }

  // Live from the Eventos API — see assets/ticket-banner.js for the same
  // fetch on pages that also render the banner.
  fetch('/api/events')
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(events){
      if (!events || !events.some(function(e){ return e.ticketUrl; })) return;
      document.querySelectorAll('.nav-links a[href="eventos.html"]').forEach(function(a){
        a.classList.add('event-live');
      });
    })
    .catch(function(){});

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
