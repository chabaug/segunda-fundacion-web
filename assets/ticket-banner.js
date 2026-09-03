// Shared ticket banner (scrolling "Entradas para ..." marquee) — shown on
// every page except eventos.html (which already lists the same info as a
// full card). Fetches live active events from the Eventos API
// (netlify/functions/events.mts) instead of reading a build-time const, so
// a new event created in admin/eventos.html shows up here without a
// redeploy. Depends on the banner markup existing in the page
// (#ticketBanner / #ticketBannerTrack — see index.html for the reference
// markup, right after <body>).
(function(){
  fetch('/api/events')
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(events){ renderBanner(events || []); })
    .catch(function(){});

  function renderBanner(allEvents){
    const active = allEvents
      .filter(function(e){ return e.ticketUrl; })
      .sort(function(a, b){ return a.date.localeCompare(b.date); });
    if(!active.length) return;

    const banner = document.getElementById('ticketBanner');
    const text = active.map(function(e){ return 'Entradas para ' + e.name; }).join('   ·   ');

    if(active.length === 1){
      banner.href = active[0].ticketUrl;
      banner.target = '_blank';
      banner.rel = 'noopener';
    } else {
      banner.href = 'eventos.html';
    }

    banner.classList.add('show');

    // Build enough repeated copies of the text to comfortably fill the
    // banner regardless of viewport width or how long the concatenated
    // event names are, then duplicate that whole run once more so the
    // marquee can loop seamlessly (translateX(-50%) lands exactly back
    // at the start of the second, identical run).
    const track = document.getElementById('ticketBannerTrack');
    const probe = document.createElement('span');
    probe.className = 'ticket-banner-text';
    probe.textContent = text;
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    document.body.appendChild(probe);
    const singleWidth = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);

    const containerWidth = banner.getBoundingClientRect().width || window.innerWidth;
    const copies = Math.max(2, Math.ceil(containerWidth / singleWidth) + 1);

    function buildGroup(){
      const group = document.createElement('div');
      group.className = 'ticket-banner-group';
      for(let i = 0; i < copies; i++){
        const span = document.createElement('span');
        span.className = 'ticket-banner-text';
        span.textContent = text;
        if(i > 0) span.setAttribute('aria-hidden', 'true');
        group.appendChild(span);
      }
      return group;
    }

    const group1 = buildGroup();
    track.appendChild(group1);
    track.appendChild(buildGroup());
    group1.querySelectorAll('.ticket-banner-text')[0].removeAttribute('aria-hidden');
    track.querySelectorAll('.ticket-banner-group')[1].setAttribute('aria-hidden', 'true');

    const pxPerSecond = 90;
    track.style.animationDuration = Math.max(group1.getBoundingClientRect().width / pxPerSecond, 6) + 's';
  }
})();
