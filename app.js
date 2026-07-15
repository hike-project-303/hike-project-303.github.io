/* =========================================================
   Gratlinie — Klettersteig & Kletter Atlas
   ========================================================= */

const MONTHS = ['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const TYPE_LABEL = {ferrata:'Klettersteig', climbing:'Klettern', climbinggarden:'Klettergarten'};
const DIFF_KEY = {leicht:'easy', mittel:'medium', schwierig:'hard'};

const ICONS = {
  diff: '<path d="M3 20l6-13 4 7 2-3 6 9H3z"/>',
  shield: '<path d="M12 3l7 3v6c0 4.6-3 8.3-7 9-4-.7-7-4.4-7-9V6l7-3z"/>',
  up: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5V7.5M8 11.5L12 7.5L16 11.5"/>',
  down: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V16.5M8 12.5L12 16.5L16 12.5"/>',
  route: '<path d="M3 20l3-7 4 4 3-9 3 5 3-5 2 5"/><circle cx="3" cy="20" r="1" fill="currentColor" stroke="none"/><circle cx="21" cy="13" r="1" fill="currentColor" stroke="none"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};

function eckItem(iconPath, label, lines){
  return `<div class="eck-item">
    <div class="eck-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg></div>
    <div class="eck-body">
      <div class="eck-label">${label}</div>
      ${lines.map(l => `<div class="eck-value">${escapeHtml(String(l))}</div>`).join('')}
    </div>
  </div>`;
}

function formatDate(unixSec){
  if (!unixSec) return '';
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString('de-DE', {year:'numeric', month:'long'});
}

const state = {
  types: new Set(),
  diffs: new Set(),
  country: '',
  search: '',
  areaOnly: true,
  selectedId: null,
  renderLimit: 150,
};

let map, clusterGroup, markersById = {}, trackLayer = null, currentGallery = [], galleryIndex = 0;

/* ---------------- Map setup ---------------- */
function initMap(){
  map = L.map('map', {zoomControl:true, minZoom:3, maxZoom:17}).setView([47.3, 12.5], 7);

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Karte: © OpenTopoMap (CC-BY-SA), Daten: © OpenStreetMap-Mitwirkende — Touren: bergsteigen.com'
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 46,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      const size = count < 20 ? 32 : count < 100 ? 40 : 48;
      return L.divIcon({
        html: `<div class="marker-cluster-custom" style="width:${size}px;height:${size}px;font-size:${count<100?12:11}px;">${count}</div>`,
        className: '', iconSize: [size, size]
      });
    }
  });

  TOURS_DATA.forEach(t => {
    const marker = L.marker([t.lat, t.lng], {icon: buildIcon(t, false)});
    marker.on('click', () => selectTour(t.id));
    marker.tourId = t.id;
    markersById[t.id] = marker;
    clusterGroup.addLayer(marker);
  });
  map.addLayer(clusterGroup);

  map.on('moveend', debounce(() => { renderList(); updateStats(); }, 180));
}

function buildIcon(t, selected){
  const diffClass = DIFF_KEY[t.globalDifficultyLabel] || 'medium';
  const size = selected ? 20 : 14;
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin ${diffClass} ${t.type} ${selected?'selected':''}" style="width:${size}px;height:${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
}

/* ---------------- Filtering ---------------- */
function matchesFilters(t){
  if (state.types.size && !state.types.has(t.type)) return false;
  if (state.diffs.size && !state.diffs.has(t.globalDifficultyLabel)) return false;
  if (state.country){
    const inCountry = t.regions.some(r => r.parent === null ? r.title === state.country : r.parent === state.country);
    if (!inCountry) return false;
  }
  if (state.search){
    const hay = t.searchBlob || (t.searchBlob = buildSearchBlob(t));
    if (!hay.includes(state.search)) return false;
  }
  return true;
}
function buildSearchBlob(t){
  const parts = [t.title, t.difficulty, ...t.regions.map(r=>r.title), ...t.mountains];
  return parts.join(' ').toLowerCase();
}

function inMapBounds(t){
  if (!map) return true;
  return map.getBounds().contains([t.lat, t.lng]);
}

function getFiltered(applyAreaFilter){
  return TOURS_DATA.filter(t => matchesFilters(t) && (!applyAreaFilter || inMapBounds(t)));
}

/* ---------------- List rendering ---------------- */
function renderList(){
  const listEl = document.getElementById('list');
  const filtered = getFiltered(state.areaOnly).slice().sort((a,b) => b.rating - a.rating);
  const total = filtered.length;

  document.getElementById('list-count').textContent = `${total} Tour${total===1?'':'en'}`;

  if (!total){
    listEl.innerHTML = `<div id="empty-state">Keine Touren gefunden.<br>Filter anpassen oder Karte verschieben.</div>`;
    updateVisibleStat(filtered.length);
    return;
  }

  const shown = filtered.slice(0, state.renderLimit);
  listEl.innerHTML = shown.map(cardHtml).join('') +
    (filtered.length > shown.length ? `<div id="load-more" class="card" style="justify-content:center;color:var(--teal);font-weight:600;cursor:pointer;">Weitere ${Math.min(150, filtered.length - shown.length)} laden…</div>` : '');

  listEl.querySelectorAll('.card[data-id]').forEach(el => {
    el.addEventListener('click', () => selectTour(Number(el.dataset.id)));
  });
  const loadMore = document.getElementById('load-more');
  if (loadMore) loadMore.addEventListener('click', () => { state.renderLimit += 150; renderList(); });

  updateVisibleStat(filtered.length);
}

function cardHtml(t){
  const diffClass = DIFF_KEY[t.globalDifficultyLabel] || '';
  const region = t.regions.find(r => r.parent) || t.regions[0];
  return `<div class="card ${t.id===state.selectedId?'selected':''}" data-id="${t.id}">
    <img class="card-thumb" src="${t.thumb || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="card-body">
      <div class="card-title">${escapeHtml(t.title)}</div>
      <div class="card-meta">
        ${t.globalDifficultyLabel ? `<span class="badge ${diffClass}">${t.difficulty || t.globalDifficultyLabel}</span>` : ''}
        <span><span class="type-icon ${t.type}"></span> ${TYPE_LABEL[t.type]||t.type}</span>
      </div>
      <div class="card-meta">${region ? escapeHtml(region.title) : ''}${t.rating ? ' · ★ '+t.rating.toFixed(1) : ''}</div>
    </div>
  </div>`;
}

function updateStats(){
  document.getElementById('stat-total').textContent = TOURS_DATA.length;
  const countries = new Set();
  TOURS_DATA.forEach(t => t.regions.forEach(r => { if(!r.parent) countries.add(r.title); }));
  document.getElementById('stat-countries').textContent = countries.size;
}
function updateVisibleStat(n){
  document.getElementById('stat-visible').textContent = n;
}

/* ---------------- Detail drawer ---------------- */
function selectTour(id){
  const t = TOURS_DATA.find(x => x.id === id);
  if (!t) return;
  state.selectedId = id;

  if (trackLayer){ map.removeLayer(trackLayer); trackLayer = null; }

  // update marker highlighting
  Object.values(markersById).forEach(m => m.setIcon(buildIcon(TOURS_DATA.find(x=>x.id===m.tourId), false)));
  const marker = markersById[id];
  if (marker){
    marker.setIcon(buildIcon(t, true));
    if (clusterGroup.hasLayer(marker)) {
      clusterGroup.zoomToShowLayer(marker, () => {
        map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 13), {duration:0.5});
      });
    } else {
      map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 13), {duration:0.5});
    }
  }

  document.querySelectorAll('.card').forEach(c => c.classList.toggle('selected', Number(c.dataset.id)===id));

  renderDrawer(t);
  document.getElementById('drawer').classList.add('open');
  closeSidebar();
}

function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
}

function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  state.selectedId = null;
  if (trackLayer){ map.removeLayer(trackLayer); trackLayer = null; }
  Object.values(markersById).forEach(m => m.setIcon(buildIcon(TOURS_DATA.find(x=>x.id===m.tourId), false)));
  document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
}

function renderDrawer(t){
  const scroll = document.getElementById('drawer-scroll');
  const diffClass = DIFF_KEY[t.globalDifficultyLabel] || '';
  const hero = t.thumb ?
    `<img class="hero-photo" src="${t.thumb.replace('_400','_1600')}" onerror="this.src='${t.thumb}'">` :
    `<div class="hero-empty"></div>`;

  const region = t.regions.find(r => r.parent);
  const country = t.regions.find(r => !r.parent);

  const ratings = [
    ['Kondition', t.precondition], ['Kraft', t.strength],
    ['Erfahrung', t.experience], ['Landschaft', t.landscape],
  ].filter(r => r[1] > 0);

  const gallery = [...(t.gallery||[])];
  const topos = [...(t.topo||[])];

  const seasonStr = (t.seasons||[]).map(m => MONTHS[m]).join(' · ');

  const eckItems = [];
  if (t.difficulty) eckItems.push(eckItem(ICONS.diff, 'Schwierigkeit', [t.difficulty]));
  if (t.safeguard) eckItems.push(eckItem(ICONS.shield, 'Absicherung', [t.safeguard]));
  if (t.accessUp) eckItems.push(eckItem(ICONS.up, 'Zustieg', [t.accessUp]));
  if (t.time) {
    eckItems.push(eckItem(ICONS.route, 'Strecke &amp; Zeit', t.time.split('\n')));
  } else if (t.totalHeight || t.routeLength) {
    const line = [t.routeLength ? t.routeLength+' m' : '', t.totalHeight].filter(Boolean).join(' / ');
    eckItems.push(eckItem(ICONS.route, 'Strecke &amp; Zeit', [line]));
  }
  if (t.orientation) eckItems.push(eckItem(ICONS.compass, 'Ausrichtung', [t.orientation]));
  if (t.accessDown) eckItems.push(eckItem(ICONS.down, 'Abstieg', [t.accessDown]));

  const metaFacts = [];
  if (t.accessHeight) metaFacts.push(['Ausgangshöhe', t.accessHeight]);
  if (t.mountains && t.mountains.length) metaFacts.push(['Berg' + (t.mountains.length>1?'e':''), t.mountains.join(', ')]);
  if (t.guides && t.guides.length) metaFacts.push(['Quelle', t.guides.map(g => g.title + (g.year ? ' ('+g.year+')' : '')).join('; ')]);
  if (t.date) metaFacts.push(['Aktualisiert', formatDate(t.date)]);

  scroll.innerHTML = `
    ${hero}
    <div class="drawer-content">
      <div class="drawer-eyebrow">${escapeHtml(TYPE_LABEL[t.type]||t.type)}${country ? ' · '+escapeHtml(country.title) : ''}${region ? ' · '+escapeHtml(region.title) : ''}</div>
      <h1 class="drawer-title">${escapeHtml(t.title)}</h1>
      <div class="drawer-badges">
        ${t.difficulty ? `<span class="grade-badge">${escapeHtml(t.difficulty)}</span>` : ''}
        ${t.globalDifficultyLabel ? `<span class="badge ${diffClass}">${t.globalDifficultyLabel}</span>` : ''}
        ${t.rating ? `<span class="badge" style="background:rgba(79,184,166,.18);color:var(--teal)">★ ${t.rating.toFixed(1)}</span>` : ''}
        ${t.childFriendly ? `<span class="badge" style="background:rgba(79,184,166,.18);color:var(--teal)">kinderfreundlich</span>` : ''}
      </div>

      <div class="action-row">
        ${t.gpx ? `<button class="btn primary" id="toggle-track-btn">▲ Track auf Karte zeigen</button>` : ''}
        ${t.gpx ? `<a class="btn" href="${t.gpx}" target="_blank" rel="noopener">⬇ GPX</a>` : ''}
        <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}" target="_blank" rel="noopener">Google Maps</a>
      </div>
      ${t.gpx ? `<div class="track-status" id="track-status"></div>` : ''}

      ${eckItems.length ? `
      <div class="contour-divider">${contourSvg()}<span>Eckdaten</span><div class="line"></div></div>
      <div class="eck-grid">${eckItems.join('')}</div>` : ''}

      ${metaFacts.length ? `
      <div class="meta-facts">
        ${metaFacts.map(([k,v]) => `<div class="meta-fact"><span class="mk">${k}</span><span class="mv">${escapeHtml(v)}</span></div>`).join('')}
      </div>` : ''}

      ${seasonStr ? `<div class="contour-divider">${contourSvg()}<span>Saison</span><div class="line"></div></div>
      <div class="prose">${seasonStr}</div>` : ''}

      ${ratings.length ? `
      <div class="contour-divider">${contourSvg()}<span>Anforderungen</span><div class="line"></div></div>
      <div class="rating-bars">
        ${ratings.map(([k,v]) => `<div class="rating-row"><div class="rk">${k}</div><div class="rating-track"><div class="rating-fill" style="width:${v/5*100}%"></div></div></div>`).join('')}
      </div>` : ''}

      ${t.description ? `
      <div class="contour-divider">${contourSvg()}<span>Charakter</span><div class="line"></div></div>
      <div class="prose">${escapeHtml(t.description)}</div>` : ''}

      ${t.journey ? `
      <div class="contour-divider">${contourSvg()}<span>Anreise</span><div class="line"></div></div>
      <div class="prose">${escapeHtml(t.journey)}</div>` : ''}

      ${topos.length ? `
      <div class="contour-divider">${contourSvg()}<span>Topo (${topos.length})</span><div class="line"></div></div>
      <div class="topo-strip">
        ${topos.map((g,i) => `<img src="${g}" loading="lazy" data-gallery="topo" data-idx="${i}">`).join('')}
      </div>` : ''}

      ${gallery.length ? `
      <div class="contour-divider">${contourSvg()}<span>Fotos (${gallery.length})</span><div class="line"></div></div>
      <div class="gallery-strip">
        ${gallery.map((g,i) => `<img src="${g}" loading="lazy" data-gallery="photo" data-idx="${i}">`).join('')}
      </div>` : ''}

      ${t.regions.length ? `
      <div class="contour-divider">${contourSvg()}<span>Regionen</span><div class="line"></div></div>
      <div class="region-tags">${t.regions.map(r => `<span class="region-tag">${escapeHtml(r.title)}</span>`).join('')}</div>` : ''}
    </div>
  `;

  scroll.scrollTop = 0;
  scroll.querySelectorAll('[data-gallery]').forEach(img => {
    img.addEventListener('click', () => {
      const set = img.dataset.gallery === 'topo' ? topos : gallery;
      openLightbox(set, Number(img.dataset.idx));
    });
  });
  if (t.gpx){
    const btn = document.getElementById('toggle-track-btn');
    if (btn) btn.addEventListener('click', () => toggleTrack(t));
  }
}

function contourSvg(){
  return `<svg width="20" height="12" viewBox="0 0 20 12" style="opacity:.5"><polyline points="0,10 4,4 7,9 11,2 14,8 17,5 20,10" fill="none" stroke="var(--accent)" stroke-width="1.4"/></svg>`;
}

/* ---------------- GPX track ---------------- */
function toggleTrack(t){
  const btn = document.getElementById('toggle-track-btn');
  const statusEl = () => document.getElementById('track-status');

  if (trackLayer){
    map.removeLayer(trackLayer);
    trackLayer = null;
    if (btn) btn.textContent = '▲ Track auf Karte zeigen';
    if (statusEl()) statusEl().textContent = '';
    return;
  }

  if (btn){ btn.textContent = '⏳ Track wird geladen…'; btn.disabled = true; }
  if (statusEl()) statusEl().textContent = '';

  fetch(t.gpx).then(r => {
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.text();
  }).then(xmlText => {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const pts = Array.from(xml.getElementsByTagName('trkpt')).map(p => [
      parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))
    ]);
    if (!pts.length) throw new Error('keine Punkte');
    if (state.selectedId !== t.id) return; // user moved on in the meantime
    trackLayer = L.polyline(pts, {color: '#e0492d', weight: 4, opacity: 0.9}).addTo(map);
    map.fitBounds(trackLayer.getBounds(), {padding:[80,80]});
    if (btn){ btn.textContent = '▼ Track ausblenden'; btn.disabled = false; }
    if (statusEl()) statusEl().textContent = `${pts.length} Track-Punkte geladen`;
  }).catch(err => {
    if (btn){ btn.textContent = '▲ Track auf Karte zeigen'; btn.disabled = false; }
    if (statusEl()) statusEl().textContent = 'Track konnte nicht direkt geladen werden (Serverbeschränkung) — GPX-Download nutzen';
  });
}

/* ---------------- Lightbox ---------------- */
function openLightbox(images, idx){
  currentGallery = images;
  galleryIndex = idx;
  document.getElementById('lightbox').classList.add('open');
  updateLightbox();
}
function updateLightbox(){
  const img = document.getElementById('lightbox-img');
  img.src = currentGallery[galleryIndex];
  document.getElementById('lightbox-count').textContent = `${galleryIndex+1} / ${currentGallery.length}`;
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }

/* ---------------- Helpers ---------------- */
function debounce(fn, ms){ let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }
function formatDuration(sec){
  if (!sec) return '';
  const h = Math.floor(sec/3600), m = Math.round((sec%3600)/60);
  return h ? `${h}:${String(m).padStart(2,'0')} Std.` : `${m} Min.`;
}
function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

/* ---------------- Wiring ---------------- */
function initUI(){
  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.filter === 'type' ? state.types : state.diffs;
      const val = chip.dataset.value;
      if (group.has(val)) group.delete(val); else group.add(val);
      chip.classList.toggle('active');
      state.renderLimit = 150;
      renderList();
    });
  });

  const countrySelect = document.getElementById('country-select');
  const countries = new Set();
  TOURS_DATA.forEach(t => t.regions.forEach(r => { if(!r.parent) countries.add(r.title); }));
  Array.from(countries).sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    countrySelect.appendChild(opt);
  });
  countrySelect.addEventListener('change', () => {
    state.country = countrySelect.value;
    state.renderLimit = 150;
    renderList();
  });

  document.getElementById('area-only').addEventListener('change', e => {
    state.areaOnly = e.target.checked;
    state.renderLimit = 150;
    renderList();
  });

  let searchTimer;
  document.getElementById('search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim().toLowerCase();
      state.renderLimit = 150;
      renderList();
    }, 200);
  });

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => { galleryIndex = (galleryIndex-1+currentGallery.length)%currentGallery.length; updateLightbox(); });
  document.getElementById('lightbox-next').addEventListener('click', () => { galleryIndex = (galleryIndex+1)%currentGallery.length; updateLightbox(); });
  document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') document.getElementById('lightbox-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('lightbox-next').click();
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    if (!sidebar.classList.contains('open')) return;
    if (e.target === sidebar || sidebar.contains(e.target) || e.target === toggle) return;
    if (window.innerWidth <= 900) sidebar.classList.remove('open');
  });
}

/* ---------------- Init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUI();
  updateStats();
  renderList();
});
