// Shared release modal (cover, tracklist, credits, streaming/video links) —
// used by catalogo.html and segunda-fundacion.html. Depends on RELEASES being loaded
// first (assets/releases-data.js) and on the modal markup existing in the
// page: #releaseModal, #modalCard, #listenModal, #coverLightbox and their
// children (see catalogo.html for the reference markup).

const releaseModal = document.getElementById('releaseModal');
const modalCard = document.getElementById('modalCard');
let currentRelease = null;

// Reference-counted scroll lock so a modal opened on top of another (e.g. a
// release modal opened from inside the artist modal) doesn't re-enable page
// scroll when only the top one closes.
window.__modalOpenCount = window.__modalOpenCount || 0;
function lockScroll(){
  window.__modalOpenCount++;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}
function unlockScroll(){
  window.__modalOpenCount = Math.max(0, window.__modalOpenCount - 1);
  if(window.__modalOpenCount === 0){
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
}

function openReleaseModal(slug){
  const r = RELEASES[slug];
  if(!r) return;
  currentRelease = r;

  const cover = document.getElementById('modalCover');
  cover.src = 'assets/covers/' + slug + '.jpg';
  cover.alt = r.title + ' — ' + r.artist;

  const sfEl = document.getElementById('modalSfNumber');
  if(sfEl) sfEl.textContent = r.sfNumber ? 'SF-' + String(r.sfNumber).padStart(3, '0') : '';

  document.getElementById('modalArtist').textContent = r.artist;
  document.getElementById('modalTitle').textContent = r.title;
  document.getElementById('modalType').textContent = r.suffix === 'single' ? 'Single' : r.suffix === 'ep' ? 'EP' : 'Álbum';

  const d = new Date(r.date + 'T00:00:00');
  document.getElementById('modalDate').textContent = d.toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' });

  const tl = document.getElementById('modalTracklist');
  tl.innerHTML = '';
  r.tracks.forEach(function(t){
    const li = document.createElement('li');
    li.textContent = t;
    tl.appendChild(li);
  });
  document.getElementById('modalTracksSection').style.display = r.tracks.length > 1 ? '' : 'none';

  if(r.credits){
    const escaped = r.credits.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const linked = escaped.replace(/@([a-zA-Z0-9_.]+)/g, '<a href="https://instagram.com/$1" target="_blank" rel="noopener">@$1</a>');
    document.getElementById('modalCredits').innerHTML = linked;
    document.getElementById('modalCreditsSection').style.display = '';
    document.getElementById('modalPendingSection').style.display = 'none';
  } else {
    document.getElementById('modalCreditsSection').style.display = 'none';
    document.getElementById('modalPendingSection').style.display = '';
  }

  const videoLinks = document.getElementById('modalVideoLinks');
  videoLinks.innerHTML = '';
  if(r.video){
    const entries = typeof r.video === 'string' ? [[null, r.video]] : Object.entries(r.video);
    entries.forEach(function(entry){
      const a = document.createElement('a');
      a.className = 'modal-link modal-link-video';
      a.href = entry[1];
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = entry[0] ? 'Video Oficial: ' + entry[0] : 'Video Oficial';
      videoLinks.appendChild(a);
    });
  }

  releaseModal.classList.add('open');
  lockScroll();

  modalCard.scrollTop = 0;
  requestAnimationFrame(updateScrollHint);
}

function closeReleaseModal(){
  releaseModal.classList.remove('open');
  unlockScroll();
}

const scrollHint = document.getElementById('modalScrollHint');

function updateScrollHint(){
  const canScroll = modalCard.scrollHeight > modalCard.clientHeight + 4;
  if(!canScroll){
    scrollHint.style.display = 'none';
    return;
  }
  scrollHint.style.display = 'flex';
  const atBottom = modalCard.scrollTop + modalCard.clientHeight >= modalCard.scrollHeight - 4;
  scrollHint.textContent = atBottom ? '↑' : '↓';
  scrollHint.setAttribute('aria-label', atBottom ? 'Volver arriba' : 'Ver más');
}

modalCard.addEventListener('scroll', updateScrollHint);

scrollHint.addEventListener('click', function(){
  const atBottom = modalCard.scrollTop + modalCard.clientHeight >= modalCard.scrollHeight - 4;
  modalCard.scrollTo({ top: atBottom ? 0 : modalCard.scrollHeight, behavior: 'smooth' });
});

const SERVICE_ICONS = {
  spotify: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.59 14.44a.62.62 0 0 1-.86.21c-2.36-1.44-5.33-1.77-8.83-.97a.62.62 0 1 1-.28-1.22c3.83-.88 7.12-.5 9.76 1.11.3.18.4.57.21.87Zm1.22-2.72a.78.78 0 0 1-1.07.26c-2.7-1.66-6.82-2.14-10.02-1.17a.78.78 0 1 1-.45-1.49c3.65-1.11 8.19-.57 11.28 1.33.37.23.49.72.26 1.07Zm.1-2.83c-3.24-1.92-8.6-2.1-11.7-1.16a.93.93 0 1 1-.54-1.78c3.56-1.08 9.47-.87 13.2 1.34a.93.93 0 1 1-.96 1.6Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 10.7-5.2 3a.55.55 0 0 1-.8-.48V8.78a.55.55 0 0 1 .8-.48l5.2 3a.55.55 0 0 1 0 .96Z"/></svg>',
  tidal: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 4 4 8l4 4-4 4 4 4 4-4-4-4 4-4Zm8 0-4 4 4 4 4-4Zm0 8-4 4 4 4 4-4Z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.7 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.4-.8s2 .8 3.3.8 2.3-1.2 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-2.9-1.1-2.9-4Zm-2.6-7.3c.7-.9 1.2-2 1-3.4-1 0-2.3.7-3.1 1.6-.6.7-1.2 1.9-1 3.2 1.3.1 2.4-.6 3.1-1.4Z"/></svg>',
  deezer: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M2 17h3v3H2zm5-3h3v6H7zm5-4h3v10h-3zm5-3h3v13h-3zm-5-3.5h3V6h-3z"/></svg>',
  bandcamp: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M14.5 6 8 18H2l6.5-12Z"/><path fill="currentColor" d="M14.5 18h7.5L15.5 6H8Z" opacity="0.45"/></svg>',
};

function serviceUrls(artist, title){
  const q = encodeURIComponent(artist + ' ' + title);
  const s = (currentRelease.streaming) || {};
  const urls = {
    spotify: s.spotify || 'https://open.spotify.com/search/' + q,
    youtube: s.youtube || 'https://music.youtube.com/search?q=' + q,
    tidal: s.tidal || 'https://tidal.com/search?q=' + q,
    apple: s.apple || 'https://music.apple.com/search?term=' + q,
    deezer: s.deezer || 'https://www.deezer.com/search/' + q,
  };
  if(s.bandcamp) urls.bandcamp = s.bandcamp;
  return urls;
}

const SERVICE_NAMES = { spotify: 'Spotify', youtube: 'YouTube Music', tidal: 'Tidal', apple: 'Apple Music', deezer: 'Deezer', bandcamp: 'Bandcamp' };
const listenModal = document.getElementById('listenModal');

function openListenModal(){
  if(!currentRelease) return;
  const urls = serviceUrls(currentRelease.artist, currentRelease.title);
  const container = document.getElementById('listenOptions');
  container.innerHTML = '';
  Object.keys(SERVICE_NAMES).forEach(function(key){
    if(!urls[key]) return; // Bandcamp only shown when a real link is confirmed
    const a = document.createElement('a');
    a.className = 'listen-option';
    a.href = urls[key];
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = '<span class="listen-icon">' + SERVICE_ICONS[key] + '</span><span>' + SERVICE_NAMES[key] + '</span>';
    container.appendChild(a);
  });
  listenModal.classList.add('open');
}

function closeListenModal(){
  listenModal.classList.remove('open');
}

const coverLightbox = document.getElementById('coverLightbox');
document.getElementById('modalCoverWrap').addEventListener('click', function(){
  // On touch devices, opening this modal from a coverflow tap can be
  // followed a moment later by a browser-synthesized "ghost" click at the
  // same screen coordinates (a compatibility mouse event some engines still
  // fire after touch input despite preventDefault on the originating
  // pointerdown). Landing on this exact element — the cover, now sitting
  // where the tapped coverflow item just was — it would pop the lightbox
  // open immediately on top of the modal from a single tap.
  //
  // window.__suppressCoverClickUntil is set only by the coverflow's own tap
  // handler, and only when that tap's pointerType was "touch" — so this
  // never touches a genuine click on the grid, an artist's release row, or a
  // real desktop click on the coverflow itself, all of which open this same
  // modal but have no such ghost-click risk to guard against.
  if(window.__suppressCoverClickUntil && Date.now() < window.__suppressCoverClickUntil) return;
  document.getElementById('lightboxImg').src = document.getElementById('modalCover').src;
  document.getElementById('lightboxImg').alt = document.getElementById('modalCover').alt;
  coverLightbox.classList.add('open');
});

function closeCoverLightbox(){
  coverLightbox.classList.remove('open');
}

releaseModal.addEventListener('click', function(e){
  if(e.target === releaseModal) closeReleaseModal();
});

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeReleaseModal();
});
