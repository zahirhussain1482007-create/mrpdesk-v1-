/*
 * MRP Desk V1
 * ES5 only. No fetch, Promise, modules, arrow functions, template strings,
 * Array.from/find/includes or other APIs missing from iOS 9 Safari.
 */
(function () {
  'use strict';

  var PRODUCTS_URL = 'data/products.json';
  var PRICES_URL = 'data/prices.json';
  var THICKNESSES = [2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 9, 10];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BASE_TITLE = 'MRP Desk V1 \u00b7 Mattress Price Finder';

  var state = {
    brand: 'all',
    thickness: 5,
    length: 75,
    breadth: 36,
    view: 'finder',
    detailReturn: '#finder',
    searchQuery: '',
    searchMatches: [],
    detail: null,
    finderRendered: false
  };

  var DATA = {
    ready: false,
    products: [],
    prices: [],
    productById: {},
    byProduct: [],
    priceIndex: {},
    productsMeta: null,
    pricesMeta: null
  };

  var DOM = {};
  var searchTimer = null;
  var toastTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function text(el, value) {
    if (el) el.textContent = value;
  }

  function html(el, value) {
    if (el) el.innerHTML = value;
  }

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function brandClass(brand) {
    return brand === 'Sleepwell' ? 'is-sw' : 'is-ybm';
  }

  function brandLabel() {
    return state.brand === 'all' ? 'All Brands' : state.brand;
  }

  function thicknessText(t) {
    return String(t) + ' inch';
  }

  function thicknessShort(t) {
    return String(t) + ' in';
  }

  function sizeText(l, b) {
    return String(l) + ' \u00d7 ' + String(b);
  }

  function groupDigits(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function priceMarkup(value) {
    return '<span class="rupee">\u20b9</span>' + groupDigits(value);
  }

  function formatDate(value) {
    if (!value) return '';
    var part = String(value).slice(0, 10).split('-');
    if (part.length !== 3) return String(value);
    var month = MONTHS[parseInt(part[1], 10) - 1];
    if (!month) return String(value);
    return parseInt(part[2], 10) + ' ' + month + ' ' + part[0];
  }

  function countText(n, singular, plural) {
    return groupDigits(n) + ' ' + (n === 1 ? singular : (plural || singular + 's'));
  }

  function warrantyText(years) {
    if (years === null || years === undefined || years === '' || isNaN(years)) return '';
    return String(years) + '-year warranty';
  }

  function bedIcon(size) {
    return '<svg viewBox="0 0 32 32" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="9" width="26" height="14" rx="3"></rect>' +
      '<path d="M3 17h26"></path>' +
      '<path d="M7 9v7"></path>' +
      '<path d="M5 25v2M27 25v2"></path>' +
      '</svg>';
  }

  function searchIcon(size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="6.5"></circle>' +
      '<path d="M16 16l4.2 4.2"></path>' +
      '</svg>';
  }

  function findUp(el, attr) {
    while (el && el !== document) {
      if (el.getAttribute && el.getAttribute(attr) !== null) return el;
      el = el.parentNode;
    }
    return null;
  }

  function on(el, eventName, handler) {
    if (el) el.addEventListener(eventName, handler, false);
  }

  function effectiveFor(brand) {
    var map = (DATA.pricesMeta && DATA.pricesMeta.effectiveByBrand) || {};
    return map[brand] || '';
  }

  /* ---------------------------------------------------------------- data -- */

  function loadData(bustCache, callback) {
    var suffix = bustCache ? ('?t=' + new Date().getTime()) : '';
    var loaded = [];
    var finished = 0;
    var failed = false;

    function one(url, index) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url + suffix, true);
      xhr.timeout = 20000;

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || failed) return;
        var ok = (xhr.status >= 200 && xhr.status < 300) || xhr.status === 304 || (xhr.status === 0 && xhr.responseText);
        if (!ok) {
          failed = true;
          callback(new Error('HTTP ' + xhr.status));
          return;
        }
        var parsed;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch (parseError) {
          failed = true;
          callback(parseError);
          return;
        }
        loaded[index] = parsed;
        finished++;
        if (finished === 2) callback(null, loaded[0], loaded[1]);
      };

      xhr.ontimeout = function () {
        if (failed) return;
        failed = true;
        callback(new Error('The price list timed out.'));
      };

      xhr.onerror = function () {
        if (failed) return;
        failed = true;
        callback(new Error('The price list could not be reached.'));
      };

      xhr.send(null);
    }

    one(PRODUCTS_URL, 0);
    one(PRICES_URL, 1);
  }

  function applyData(productsFile, pricesFile) {
    if (!productsFile || !productsFile.products || !pricesFile || !pricesFile.prices) {
      throw new Error('The catalogue files are not in the expected format.');
    }

    DATA.products = productsFile.products;
    DATA.prices = pricesFile.prices;
    DATA.productsMeta = productsFile;
    DATA.pricesMeta = pricesFile;
    DATA.productById = {};
    DATA.byProduct = [];
    DATA.priceIndex = {};

    var i;
    var j;

    for (i = 0; i < DATA.products.length; i++) {
      DATA.products[i]._index = i;
      DATA.productById[DATA.products[i].id] = DATA.products[i];
      DATA.byProduct[i] = {
        thicknesses: [],
        sizesByThickness: {},
        sizeKeys: {},
        priceLookup: {},
        sizeCount: 0,
        records: 0,
        min: Infinity
      };
    }

    for (i = 0; i < DATA.prices.length; i++) {
      var row = DATA.prices[i];
      var pi = row[0];
      var t = row[1];
      var l = row[2];
      var b = row[3];
      var m = row[4];
      if (!DATA.products[pi]) continue;

      var key = String(t) + '|' + l + '|' + b;
      if (!DATA.priceIndex[key]) DATA.priceIndex[key] = [];
      DATA.priceIndex[key].push({ p: pi, t: t, l: l, b: b, m: m });

      var bp = DATA.byProduct[pi];
      if (!bp.sizesByThickness[t]) {
        bp.sizesByThickness[t] = [];
        bp.thicknesses.push(t);
      }
      bp.sizesByThickness[t].push({ l: l, b: b, m: m });
      bp.priceLookup[key] = m;
      bp.sizeKeys[String(l) + 'x' + b] = true;
      bp.records++;
      if (m < bp.min) bp.min = m;
    }

    for (i = 0; i < DATA.byProduct.length; i++) {
      var stats = DATA.byProduct[i];
      stats.thicknesses.sort(function (a, b) { return a - b; });
      stats.sizeCount = 0;
      for (j in stats.sizeKeys) {
        if (Object.prototype.hasOwnProperty.call(stats.sizeKeys, j)) stats.sizeCount++;
      }
      for (j = 0; j < stats.thicknesses.length; j++) {
        stats.sizesByThickness[stats.thicknesses[j]].sort(function (a, b) {
          if (a.l !== b.l) return a.l - b.l;
          return a.b - b.b;
        });
      }
    }

    for (j in DATA.priceIndex) {
      if (!Object.prototype.hasOwnProperty.call(DATA.priceIndex, j)) continue;
      DATA.priceIndex[j].sort(function (a, b) {
        if (a.m !== b.m) return a.m - b.m;
        var an = DATA.products[a.p].name;
        var bn = DATA.products[b.p].name;
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
    }

    DATA.ready = true;
  }

  function updateMetaUI() {
    var count = DATA.prices.length;
    var synced = formatDate(DATA.productsMeta.syncedAt);
    var swDate = formatDate(effectiveFor('Sleepwell'));
    var ybmDate = formatDate(effectiveFor('YBM'));

    text(DOM.recordCount, groupDigits(count));
    text(DOM.productCount, groupDigits(DATA.products.length));
    text(DOM.syncTime, 'Synced ' + synced);
    text(DOM.topbarNote, groupDigits(count) + ' prices \u00b7 synced ' + synced);
    text(DOM.menuNote, groupDigits(count) + ' price records \u00b7 synced ' + synced + ' \u00b7 ' + groupDigits(DATA.products.length) + ' mattresses');
    text(DOM.footEffective, 'Sleepwell list: ' + swDate + ' \u00b7 YBM list: ' + ybmDate);
  }

  /* -------------------------------------------------------------- finder -- */

  function renderThicknessChips() {
    var markup = '';
    for (var i = 0; i < THICKNESSES.length; i++) {
      var t = THICKNESSES[i];
      var active = t === state.thickness;
      markup += '<button type="button" class="chip' + (active ? ' is-active' : '') + '" data-thickness="' + t + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + thicknessText(t) + '">' + thicknessShort(t) + '</button>';
    }
    html(DOM.thicknessChips, markup);
  }

  function syncBrandChips() {
    var chips = document.querySelectorAll('.brand-chip');
    for (var i = 0; i < chips.length; i++) {
      var brand = chips[i].getAttribute('data-brand');
      var active = brand === state.brand;
      if (active) {
        chips[i].className = chips[i].className.replace(/\s*is-active/g, '') + ' is-active';
        chips[i].setAttribute('aria-pressed', 'true');
      } else {
        chips[i].className = chips[i].className.replace(/\s*is-active/g, '');
        chips[i].setAttribute('aria-pressed', 'false');
      }
    }
  }

  function setBrand(brand) {
    if (brand !== 'all' && brand !== 'Sleepwell' && brand !== 'YBM') return;
    if (state.brand === brand) return;
    state.brand = brand;
    syncBrandChips();
    if (DATA.ready) {
      if (state.view === 'search') {
        renderSearch();
        state.finderRendered = false;
      } else if (state.view === 'finder') {
        scheduleFinderSearch(80);
      } else {
        state.finderRendered = false;
      }
    }
  }

  function readSizeInput() {
    var rawLength = String(DOM.lengthInput.value).replace(/^\s+|\s+$/g, '');
    var rawBreadth = String(DOM.breadthInput.value).replace(/^\s+|\s+$/g, '');
    if (rawLength === '' || rawBreadth === '') {
      return { error: 'Enter both length and breadth in inches.' };
    }
    var length = Number(rawLength);
    var breadth = Number(rawBreadth);
    if (isNaN(length) || isNaN(breadth) || length % 1 !== 0 || breadth % 1 !== 0) {
      return { error: 'Use whole numbers for length and breadth.' };
    }
    if (length < 1 || breadth < 1 || length > 120 || breadth > 120) {
      return { error: 'Enter a size between 1 and 120 inches.' };
    }
    return { length: length, breadth: breadth };
  }

  function scheduleFinderSearch(delay) {
    if (!DATA.ready) return;
    if (state.view === 'finder') show(DOM.updatingFlag);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = null;
      performFinderSearch(false);
    }, typeof delay === 'number' ? delay : 140);
  }

  function performFinderSearch(initial) {
    if (!DATA.ready) return;
    var size = readSizeInput();

    if (size.error) {
      hide(DOM.updatingFlag);
      text(DOM.sizeError, size.error);
      show(DOM.sizeError);
      text(DOM.resultsTitle, 'Check the bed size');
      text(DOM.resultsSub, size.error);
      html(DOM.resultsWrap, '<div class="empty-state"><div class="empty-icon">' + bedIcon(22) + '</div><h3>Enter a valid bed size</h3><p>' + esc(size.error) + ' Standard sizes such as 75 \u00d7 36 work best.</p></div>');
      text(DOM.liveStatus, 'Enter a valid bed size.');
      return;
    }

    hide(DOM.sizeError);
    state.length = size.length;
    state.breadth = size.breadth;

    var key = String(state.thickness) + '|' + state.length + '|' + state.breadth;
    var rows = DATA.priceIndex[key] || [];
    var filtered = [];
    var i;

    for (i = 0; i < rows.length; i++) {
      var product = DATA.products[rows[i].p];
      if (!product) continue;
      if (state.brand === 'all' || product.brand === state.brand) filtered.push(rows[i]);
    }

    var count = filtered.length;
    var countLabel = countText(count, 'mattress', 'mattresses');
    html(DOM.resultsTitle, countLabel + ' <span class="results-sep">\u00b7</span> ' + esc(thicknessText(state.thickness)));
    text(DOM.resultsSub, 'Lowest MRP first \u00b7 ' + brandLabel() + ' \u00b7 ' + sizeText(state.length, state.breadth));

    if (count === 0) {
      var hint = state.brand === 'all'
        ? 'No mattress in the catalogue has a published MRP at ' + sizeText(state.length, state.breadth) + ' in ' + thicknessText(state.thickness) + '. Check the size, or reset to a common 75 \u00d7 36.'
        : 'No ' + state.brand + ' mattress has a published MRP at ' + sizeText(state.length, state.breadth) + ' in ' + thicknessText(state.thickness) + '. Try All Brands or reset the size.';
      var actions = '';
      if (state.brand !== 'all') actions += '<button type="button" class="text-btn" data-action="all-brands">Show all brands</button> ';
      actions += '<button type="button" class="text-btn" data-action="reset">Reset to 75 \u00d7 36</button> <a class="text-btn" href="#search">Search by name</a>';
      html(DOM.resultsWrap,
        '<div class="empty-state">' +
          '<div class="empty-icon">' + searchIcon(22) + '</div>' +
          '<h3>No matching prices</h3>' +
          '<p>' + esc(hint) + '</p>' +
          '<div class="empty-actions">' + actions + '</div>' +
        '</div>');
      text(DOM.liveStatus, 'No matching prices. ' + hint);
      hide(DOM.updatingFlag);
      state.finderRendered = true;
      return;
    }

    var cards = '';
    for (i = 0; i < filtered.length; i++) {
      cards += resultCard(DATA.products[filtered[i].p], filtered[i].t, filtered[i].l, filtered[i].b, filtered[i].m);
    }

    html(DOM.resultsWrap, cards);
    text(DOM.liveStatus, countLabel + ' at ' + thicknessText(state.thickness) + ', ' + sizeText(state.length, state.breadth) + '.');
    hide(DOM.updatingFlag);
    state.finderRendered = true;
    if (initial) hide(DOM.updatingFlag);
  }

  function resultCard(product, t, l, b, mrp) {
    var warranty = warrantyText(product.warrantyYears);
    var foot = warranty
      ? esc(warranty) + ' <span class="card-foot-sep">\u00b7</span> <span class="card-cta">Sizes &amp; details &rarr;</span>'
      : '<span class="card-cta">Sizes &amp; details &rarr;</span>';

    return '<a class="result-card ' + brandClass(product.brand) + '" href="#product/' + esc(product.id) + '">' +
      '<span class="card-body">' +
        '<span class="card-icon">' + bedIcon(27) + '</span>' +
        '<span class="card-main">' +
          '<span class="card-brand-pill">' + esc(product.brand) + '</span>' +
          '<span class="card-name">' + esc(product.name) + '</span>' +
          '<span class="card-meta">' + esc(thicknessText(t)) + ' \u00b7 ' + sizeText(l, b) + '</span>' +
          '<span class="card-foot">' + foot + '</span>' +
        '</span>' +
        '<span class="card-price">' +
          '<span class="mrp-label">MRP</span>' +
          '<span class="price">' + priceMarkup(mrp) + '</span>' +
        '</span>' +
      '</span>' +
    '</a>';
  }

  function resetFinder() {
    state.brand = 'all';
    state.thickness = 5;
    DOM.lengthInput.value = '75';
    DOM.breadthInput.value = '36';
    state.length = 75;
    state.breadth = 36;
    syncBrandChips();
    renderThicknessChips();
    hide(DOM.sizeError);
    performFinderSearch(true);
  }

  /* -------------------------------------------------------------- search -- */

  function renderSearch() {
    if (!DATA.ready) {
      text(DOM.searchMeta, 'Loading the price list\u2026');
      html(DOM.searchResults, '<div class="search-note">Reading the catalogue on this device\u2026</div>');
      return;
    }

    var query = state.searchQuery.replace(/^\s+|\s+$/g, '');
    var lower = query.toLowerCase();
    var tokens = lower ? lower.split(/\s+/) : [];
    var available = [];
    var i;

    for (i = 0; i < DATA.products.length; i++) {
      var p = DATA.products[i];
      if (state.brand === 'all' || p.brand === state.brand) available.push(p);
    }

    DOM.clearName.hidden = state.searchQuery.length === 0;

    if (!query) {
      state.searchMatches = [];
      text(DOM.searchMeta, groupDigits(available.length) + ' ' + (available.length === 1 ? 'mattress' : 'mattresses') + ' in ' + (state.brand === 'all' ? 'the catalogue' : state.brand) + '.');
      html(DOM.searchResults,
        '<div class="search-note">' +
          '<strong>Start typing a mattress name</strong>' +
          'Try a model, a series or part of a word. Suggestions appear as you type.' +
          '<div class="query-chips">' +
            '<button type="button" class="query-chip" data-query="Durafirm">Durafirm</button>' +
            '<button type="button" class="query-chip" data-query="Ortho">Ortho</button>' +
            '<button type="button" class="query-chip" data-query="Coir">Coir</button>' +
            '<button type="button" class="query-chip" data-query="PUF">PUF</button>' +
            '<button type="button" class="query-chip" data-query="Pro Spinetech">Pro Spinetech</button>' +
            '<button type="button" class="query-chip" data-query="Utsav">Utsav</button>' +
          '</div>' +
        '</div>');
      return;
    }

    var matches = [];
    for (i = 0; i < available.length; i++) {
      var name = available[i].name.toLowerCase();
      var allTokens = true;
      for (var t = 0; t < tokens.length; t++) {
        if (name.indexOf(tokens[t]) === -1) { allTokens = false; break; }
      }
      if (allTokens) matches.push(available[i]);
    }

    matches.sort(function (a, b) {
      var an = a.name.toLowerCase();
      var bn = b.name.toLowerCase();
      var aStart = an.indexOf(lower) === 0 ? 0 : 1;
      var bStart = bn.indexOf(lower) === 0 ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

    state.searchMatches = matches;

    if (matches.length === 0) {
      text(DOM.searchMeta, '0 matches for \u201c' + query + '\u201d \u00b7 ' + brandLabel());
      var brandHint = state.brand === 'all' ? '' : ' No ' + state.brand + ' mattress matches this name.';
      html(DOM.searchResults,
        '<div class="search-note">' +
          '<strong>No mattress found</strong>' +
          'Nothing matches \u201c' + esc(query) + '\u201d' + esc(brandHint) + ' Try a shorter phrase or a different spelling.' +
          (state.brand !== 'all' ? '<div class="query-chips"><button type="button" class="query-chip" data-action="all-brands">Search all brands</button></div>' : '') +
        '</div>');
      return;
    }

    var limit = matches.length > 8 ? 8 : matches.length;
    var meta = groupDigits(matches.length) + ' ' + (matches.length === 1 ? 'match' : 'matches') + ' for \u201c' + query + '\u201d';
    if (matches.length > limit) meta += ' \u00b7 showing the first ' + limit;
    meta += ' \u00b7 ' + brandLabel();
    text(DOM.searchMeta, meta);

    var rows = '';
    for (i = 0; i < limit; i++) rows += suggestionRow(matches[i], tokens);
    html(DOM.searchResults, '<div class="suggestion-list">' + rows + '</div>');
  }

  function suggestionRow(product, tokens) {
    var stats = DATA.byProduct[product._index];
    var price = stats.min === Infinity ? '' : 'from ' + priceMarkup(stats.min);
    return '<a class="suggestion ' + brandClass(product.brand) + '" href="#product/' + esc(product.id) + '">' +
      '<span class="suggestion-icon">' + bedIcon(21) + '</span>' +
      '<span class="suggestion-main">' +
        '<span class="suggestion-name">' + highlightName(product.name, tokens) + '</span>' +
        '<span class="suggestion-meta">' + countText(stats.thicknesses.length, 'thickness', 'thicknesses') + ' \u00b7 ' + countText(stats.sizeCount, 'size') + '</span>' +
      '</span>' +
      '<span class="suggestion-side">' +
        '<span class="suggestion-brand">' + esc(product.brand) + '</span>' +
        '<span class="suggestion-price">' + price + '</span>' +
      '</span>' +
    '</a>';
  }

  function highlightName(name, tokens) {
    var lower = name.toLowerCase();
    var ranges = [];
    var i;
    var from;
    var at;

    for (i = 0; i < tokens.length; i++) {
      if (!tokens[i]) continue;
      from = 0;
      while (from < lower.length) {
        at = lower.indexOf(tokens[i], from);
        if (at === -1) break;
        ranges.push([at, at + tokens[i].length]);
        from = at + tokens[i].length;
      }
    }

    if (!ranges.length) return esc(name);

    ranges.sort(function (a, b) {
      if (a[0] !== b[0]) return a[0] - b[0];
      return b[1] - a[1];
    });

    var merged = [];
    for (i = 0; i < ranges.length; i++) {
      var last = merged[merged.length - 1];
      if (last && ranges[i][0] <= last[1]) {
        if (ranges[i][1] > last[1]) last[1] = ranges[i][1];
      } else {
        merged.push([ranges[i][0], ranges[i][1]]);
      }
    }

    var out = '';
    var cursor = 0;
    for (i = 0; i < merged.length; i++) {
      out += esc(name.slice(cursor, merged[i][0]));
      out += '<mark>' + esc(name.slice(merged[i][0], merged[i][1])) + '</mark>';
      cursor = merged[i][1];
    }
    out += esc(name.slice(cursor));
    return out;
  }

  /* -------------------------------------------------------------- detail -- */

  function findSize(sizes, l, b) {
    for (var i = 0; i < sizes.length; i++) {
      if (sizes[i].l === l && sizes[i].b === b) return sizes[i];
    }
    return null;
  }

  function showDetail(pid) {
    if (!DATA.ready) return;
    var previous = state.view;
    if (previous === 'search') state.detailReturn = '#search';
    else if (previous !== 'detail') state.detailReturn = '#finder';

    state.view = 'detail';
    switchView('detail');
    DOM.detailBack.setAttribute('href', state.detailReturn);

    var product = DATA.productById[pid];
    if (!product) {
      state.detail = null;
      renderDetailNotFound();
      document.title = 'Mattress not found \u00b7 MRP Desk V1';
      window.scrollTo(0, 0);
      return;
    }

    var stats = DATA.byProduct[product._index];
    var t = state.thickness;
    if (stats.thicknesses.indexOf(t) === -1) t = stats.thicknesses[0];

    state.detail = { pid: product.id, t: t, l: null, b: null };
    renderDetail(product, stats);
    document.title = product.name + ' \u00b7 MRP Desk V1';
    window.scrollTo(0, 0);
  }

  function renderDetail(product, stats) {
    var cls = brandClass(product.brand);
    var d = state.detail;
    var effective = formatDate(effectiveFor(product.brand));
    var media = product.image
      ? '<img id="detailImage" src="' + esc(product.image) + '" alt="' + esc(product.name) + ' by ' + esc(product.brand) + '">'
      : '<div class="media-placeholder">' + bedIcon(54) + '<span>No catalogue image for this model</span></div>';

    var description = product.description
      ? '<p class="detail-desc">' + esc(product.description) + '</p>'
      : '<p class="detail-desc">Published ' + esc(product.brand) + ' MRP details. Choose a thickness and size below to see the exact price.</p>';

    var series = product.series ? '<p class="detail-series">' + esc(product.series) + ' series</p>' : '';
    var warrantyFact = product.warrantyYears !== null && product.warrantyYears !== undefined
      ? '<span class="fact"><strong>' + esc(String(product.warrantyYears)) + ' yr</strong>Warranty</span>'
      : '';
    var facts = '<span class="fact"><strong>' + stats.thicknesses.length + '</strong>Thicknesses</span>' +
      '<span class="fact"><strong>' + stats.sizeCount + '</strong>Available sizes</span>' +
      warrantyFact;

    var features = '';
    if (product.features && product.features.length) {
      var list = '';
      for (var i = 0; i < product.features.length; i++) {
        list += '<li><span>\u2713</span>' + esc(product.features[i]) + '</li>';
      }
      features = '<div class="detail-block"><h2>Features</h2><p class="block-note">From the ' + esc(product.brand) + ' product catalogue.</p><ul class="features-list">' + list + '</ul></div>';
    }

    var noteDate = effective ? ' effective ' + esc(effective) : '';
    var dataNote = '<div class="detail-block data-note">' +
      '<h2>Price list</h2>' +
      '<p><strong>' + esc(product.brand) + ' MRP list' + noteDate + '.</strong> This mattress has ' + stats.records + ' price records across ' + stats.thicknesses.length + ' thicknesses. Sizes are generated from those records only, so unavailable combinations are never shown. Prices are MRP, not a selling price.</p>' +
      '</div>';

    html(DOM.detailBody,
      '<div class="detail-hero ' + cls + '">' +
        '<div class="detail-media">' + media + '</div>' +
        '<div class="detail-summary">' +
          '<span class="detail-brand-pill">' + esc(product.brand) + '</span>' +
          '<h1 class="detail-title" id="detailTitle">' + esc(product.name) + '</h1>' +
          series +
          description +
          '<div class="detail-facts">' + facts + '</div>' +
        '</div>' +
      '</div>' +
      '<div id="detailControls"></div>' +
      features +
      dataNote);

    renderDetailControls(product, stats);
    updateDetailPrice(product, stats);

    var img = $('detailImage');
    if (img) {
      img.onerror = function () {
        this.parentNode.innerHTML = '<div class="media-placeholder">' + bedIcon(54) + '<span>No catalogue image for this model</span></div>';
      };
    }

    DOM.detailDataTag.textContent = product.brand + (effective ? ' \u00b7 MRP list effective ' + effective : '');
    DOM.detailDataTag.className = 'detail-data-tag ' + cls;
  }

  function renderDetailControls(product, stats) {
    var d = state.detail;
    var t = d.t;
    var sizes = stats.sizesByThickness[t];
    var chips = '';
    var sizeChips = '';
    var i;

    for (i = 0; i < stats.thicknesses.length; i++) {
      var th = stats.thicknesses[i];
      var thActive = th === t;
      chips += '<button type="button" class="chip' + (thActive ? ' is-active' : '') + '" data-detail-thickness="' + th + '" aria-pressed="' + (thActive ? 'true' : 'false') + '">' + thicknessShort(th) + '</button>';
    }

    for (i = 0; i < sizes.length; i++) {
      var active = sizes[i].l === d.l && sizes[i].b === d.b;
      sizeChips += '<button type="button" class="size-chip' + (active ? ' is-active' : '') + '" data-detail-length="' + sizes[i].l + '" data-detail-breadth="' + sizes[i].b + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + sizeText(sizes[i].l, sizes[i].b) + '</button>';
    }

    html($('detailControls'),
      '<div class="detail-block ' + brandClass(product.brand) + '">' +
        '<h2>Thickness</h2>' +
        '<p class="block-note">Every thickness published for this mattress. Choosing one updates the available sizes and price.</p>' +
        '<div class="chips">' + chips + '</div>' +
      '</div>' +
      '<div class="detail-block ' + brandClass(product.brand) + '">' +
        '<h2>Available sizes <span class="block-count">' + sizes.length + ' at ' + esc(thicknessText(t)) + '</span></h2>' +
        '<p class="block-note">Generated from this model\u2019s price records. Select a size for its exact MRP.</p>' +
        '<div class="size-grid">' + sizeChips + '</div>' +
        '<div class="detail-price-panel ' + brandClass(product.brand) + '" aria-live="polite">' +
          '<div><span class="price-label">MRP</span><span class="detail-price" id="detailPriceValue"></span></div>' +
          '<div class="detail-price-context"><strong id="detailPriceSize"></strong><span id="detailPriceThickness"></span></div>' +
        '</div>' +
      '</div>');
  }

  function updateDetailPrice(product, stats) {
    var d = state.detail;
    var value = $('detailPriceValue');
    if (!value) return;

    if (d.l === null || d.b === null) {
      value.className = 'detail-price is-empty';
      text(value, 'Select size to view price');
      text($('detailPriceSize'), '');
      text($('detailPriceThickness'), '');
      return;
    }

    var key = String(d.t) + '|' + d.l + '|' + d.b;
    var mrp = stats.priceLookup[key];
    value.className = 'detail-price';

    if (mrp === undefined || mrp === null) {
      html(value, '&mdash;');
      text($('detailPriceSize'), 'Price not listed');
      text($('detailPriceThickness'), '');
    } else {
      html(value, priceMarkup(mrp));
      text($('detailPriceSize'), sizeText(d.l, d.b));
      text($('detailPriceThickness'), thicknessText(d.t));
    }
  }

  function refreshDetailAfterReload() {
    var d = state.detail;
    if (!d) {
      showDetail('');
      return;
    }
    var product = DATA.productById[d.pid];
    if (!product) {
      state.detail = null;
      renderDetailNotFound();
      return;
    }
    var stats = DATA.byProduct[product._index];
    if (stats.thicknesses.indexOf(d.t) === -1) d.t = stats.thicknesses[0];
    var sizes = stats.sizesByThickness[d.t];
    if (d.l !== null && d.b !== null) {
      var found = findSize(sizes, d.l, d.b);
      d.l = found ? found.l : null;
      d.b = found ? found.b : null;
    }
    state.detail = d;
    renderDetail(product, stats);
  }

  function renderDetailNotFound() {
    html(DOM.detailBody,
      '<div class="empty-state is-error">' +
        '<div class="empty-icon">' + bedIcon(22) + '</div>' +
        '<h3>Mattress not found</h3>' +
        '<p>This product is not in the current price list. It may have been removed when the dataset was updated.</p>' +
        '<div class="empty-actions"><a class="text-btn" href="#finder">Back to price finder</a> <button type="button" class="text-btn" data-action="reload">Reload price data</button></div>' +
      '</div>');
    DOM.detailDataTag.textContent = '';
    DOM.detailDataTag.className = 'detail-data-tag';
  }

  /* --------------------------------------------------------------- views -- */

  function switchView(name) {
    DOM.finderView.hidden = name !== 'finder';
    DOM.searchView.hidden = name !== 'search';
    DOM.detailView.hidden = name !== 'detail';
  }

  function showFinder() {
    var changed = state.view !== 'finder';
    state.view = 'finder';
    switchView('finder');
    document.title = BASE_TITLE;
    if (changed) window.scrollTo(0, 0);
    if (DATA.ready && !state.finderRendered) performFinderSearch(true);
  }

  function showSearch() {
    var changed = state.view !== 'search';
    state.view = 'search';
    switchView('search');
    document.title = 'Search by name \u00b7 MRP Desk V1';
    if (changed) window.scrollTo(0, 0);
    if (DATA.ready) renderSearch();
    if (!('ontouchstart' in window)) {
      setTimeout(function () {
        if (state.view === 'search') DOM.nameInput.focus();
      }, 60);
    }
  }

  function handleRoute() {
    closeMenu();
    if (!DATA.ready) return;
    var hash = String(location.hash || '').replace(/^#\/?/, '');
    if (hash.indexOf('product/') === 0) {
      var pid = hash.slice(8);
      try {
        pid = decodeURIComponent(pid);
      } catch (ignore) {}
      showDetail(pid);
    } else if (hash === 'search') {
      showSearch();
    } else {
      showFinder();
    }
  }

  /* -------------------------------------------------------------- errors -- */

  function showDataError(error) {
    DATA.ready = false;
    state.view = 'finder';
    switchView('finder');
    text(DOM.recordCount, '\u2014');
    text(DOM.productCount, '\u2014');
    text(DOM.syncTime, 'Not synced');
    text(DOM.topbarNote, 'Catalogue unavailable');
    text(DOM.menuNote, 'The price list could not be loaded.');
    text(DOM.footEffective, '');
    text(DOM.resultsTitle, 'Price list unavailable');
    text(DOM.resultsSub, 'The catalogue could not be read');

    var local = location.protocol === 'file:';
    var hint = local
      ? 'This page was opened as a local file, so the browser blocked the JSON price list. Open MRP Desk from its website address, or start the included local server with <strong>node tools/serve.js</strong>.'
      : 'The catalogue files could not be reached. Check the connection, then reload the price data.';
    if (error && error.message && !local) hint += ' <span class="error-detail">(' + esc(error.message) + ')</span>';

    html(DOM.resultsWrap,
      '<div class="empty-state is-error">' +
        '<div class="empty-icon">' + bedIcon(22) + '</div>' +
        '<h3>The price list did not load</h3>' +
        '<p>' + hint + '</p>' +
        '<div class="empty-actions"><button type="button" class="text-btn" data-action="reload">Try again</button></div>' +
      '</div>');
    text(DOM.liveStatus, 'The price list did not load.');
    hide(DOM.updatingFlag);
  }

  function showToast(message, isError) {
    text(DOM.toast, message);
    DOM.toast.className = isError ? 'toast is-error' : 'toast';
    show(DOM.toast);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      hide(DOM.toast);
    }, 3400);
  }

  /* ---------------------------------------------------------------- menu -- */

  function openMenu() {
    show(DOM.menu);
    DOM.menuBtn.setAttribute('aria-expanded', 'true');
    DOM.menuBtn.className = 'icon-btn is-open';
  }

  function closeMenu() {
    if (!DOM.menu) return;
    hide(DOM.menu);
    DOM.menuBtn.setAttribute('aria-expanded', 'false');
    DOM.menuBtn.className = 'icon-btn';
  }

  function reloadData() {
    closeMenu();
    if (DOM.reloadBtn) DOM.reloadBtn.disabled = true;
    showToast('Reloading price data\u2026', false);
    loadData(true, function (error, productsFile, pricesFile) {
      if (DOM.reloadBtn) DOM.reloadBtn.disabled = false;
      if (error) {
        showToast('Could not reload the price list. The current copy is still in use.', true);
        return;
      }
      try {
        applyData(productsFile, pricesFile);
      } catch (formatError) {
        showToast('The reloaded price list is not valid. The current copy is still in use.', true);
        return;
      }
      state.finderRendered = false;
      updateMetaUI();
      renderThicknessChips();
      syncBrandChips();
      if (state.view === 'detail') {
        refreshDetailAfterReload();
      } else if (state.view === 'search') {
        renderSearch();
      } else {
        performFinderSearch(true);
      }
      showToast('Price data reloaded \u00b7 ' + groupDigits(DATA.prices.length) + ' records', false);
    });
  }

  /* ---------------------------------------------------------------- init -- */

  function cacheDom() {
    DOM.finderView = $('finderView');
    DOM.searchView = $('searchView');
    DOM.detailView = $('detailView');
    DOM.main = $('main');

    DOM.topbarNote = $('topbarNote');
    DOM.menuWrap = $('menuWrap');
    DOM.menuBtn = $('menuBtn');
    DOM.menu = $('menu');
    DOM.menuNote = $('menuNote');
    DOM.reloadBtn = $('reloadBtn');

    DOM.brandChips = $('brandChips');
    DOM.thicknessChips = $('thicknessChips');
    DOM.lengthInput = $('lengthInput');
    DOM.breadthInput = $('breadthInput');
    DOM.findBtn = $('findBtn');
    DOM.sizeError = $('sizeError');

    DOM.resultsWrap = $('resultsWrap');
    DOM.resultsTitle = $('resultsTitle');
    DOM.resultsSub = $('resultsSub');
    DOM.updatingFlag = $('updatingFlag');
    DOM.liveStatus = $('liveStatus');

    DOM.recordCount = $('recordCount');
    DOM.productCount = $('productCount');
    DOM.syncTime = $('syncTime');
    DOM.footEffective = $('footEffective');

    DOM.searchBrandChips = $('searchBrandChips');
    DOM.nameBox = $('nameBox');
    DOM.nameInput = $('nameInput');
    DOM.clearName = $('clearName');
    DOM.searchMeta = $('searchMeta');
    DOM.searchResults = $('searchResults');

    DOM.detailBody = $('detailBody');
    DOM.detailBack = $('detailBack');
    DOM.detailDataTag = $('detailDataTag');
    DOM.toast = $('toast');
  }

  function bindEvents() {
    on(DOM.brandChips, 'click', function (event) {
      var chip = findUp(event.target, 'data-brand');
      if (chip) setBrand(chip.getAttribute('data-brand'));
    });

    on(DOM.searchBrandChips, 'click', function (event) {
      var chip = findUp(event.target, 'data-brand');
      if (chip) setBrand(chip.getAttribute('data-brand'));
    });

    on(DOM.thicknessChips, 'click', function (event) {
      var chip = findUp(event.target, 'data-thickness');
      if (!chip) return;
      var value = parseFloat(chip.getAttribute('data-thickness'));
      if (isNaN(value) || value === state.thickness) return;
      state.thickness = value;
      renderThicknessChips();
      scheduleFinderSearch(70);
    });

    on(DOM.lengthInput, 'input', function () { scheduleFinderSearch(160); });
    on(DOM.breadthInput, 'input', function () { scheduleFinderSearch(160); });
    on(DOM.lengthInput, 'keydown', enterSearch);
    on(DOM.breadthInput, 'keydown', enterSearch);

    on(DOM.findBtn, 'click', function () {
      if (!DATA.ready) {
        showToast('The price list is still loading.', true);
        return;
      }
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }
      performFinderSearch(true);
    });

    on(DOM.resultsWrap, 'click', function (event) {
      var actionEl = findUp(event.target, 'data-action');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');
      if (action === 'reset') {
        event.preventDefault();
        resetFinder();
      } else if (action === 'all-brands') {
        event.preventDefault();
        setBrand('all');
        if (state.view === 'finder') performFinderSearch(true);
      } else if (action === 'reload') {
        event.preventDefault();
        reloadData();
      }
    });

    on(DOM.nameInput, 'input', function () {
      state.searchQuery = DOM.nameInput.value;
      renderSearch();
    });

    on(DOM.nameInput, 'focus', function () {
      DOM.nameBox.className = 'name-box is-focused';
    });

    on(DOM.nameInput, 'blur', function () {
      DOM.nameBox.className = 'name-box';
    });

    on(DOM.nameInput, 'keydown', function (event) {
      if (event.keyCode === 13) {
        if (state.searchMatches.length) {
          event.preventDefault();
          location.hash = '#product/' + state.searchMatches[0].id;
        }
      } else if (event.keyCode === 27) {
        if (DOM.nameInput.value) {
          DOM.nameInput.value = '';
          state.searchQuery = '';
          renderSearch();
        } else {
          DOM.nameInput.blur();
        }
      }
    });

    on(DOM.clearName, 'click', function () {
      DOM.nameInput.value = '';
      state.searchQuery = '';
      renderSearch();
      DOM.nameInput.focus();
    });

    on(DOM.searchResults, 'click', function (event) {
      var queryEl = findUp(event.target, 'data-query');
      if (queryEl) {
        event.preventDefault();
        var query = queryEl.getAttribute('data-query');
        DOM.nameInput.value = query;
        state.searchQuery = query;
        renderSearch();
        DOM.nameInput.focus();
        return;
      }
      var actionEl = findUp(event.target, 'data-action');
      if (actionEl && actionEl.getAttribute('data-action') === 'all-brands') {
        event.preventDefault();
        setBrand('all');
      }
    });

    on(DOM.detailBody, 'click', function (event) {
      var actionEl = findUp(event.target, 'data-action');
      if (actionEl && actionEl.getAttribute('data-action') === 'reload') {
        event.preventDefault();
        reloadData();
        return;
      }

      var thEl = findUp(event.target, 'data-detail-thickness');
      if (thEl && state.detail) {
        var product = DATA.productById[state.detail.pid];
        if (!product) return;
        var stats = DATA.byProduct[product._index];
        var t = parseFloat(thEl.getAttribute('data-detail-thickness'));
        var sizes = stats.sizesByThickness[t];
        if (!sizes || !sizes.length) return;
        var found = findSize(sizes, state.detail.l, state.detail.b);
        state.detail.t = t;
        state.detail.l = found ? found.l : null;
        state.detail.b = found ? found.b : null;
        renderDetailControls(product, stats);
        updateDetailPrice(product, stats);
        return;
      }

      var sizeEl = findUp(event.target, 'data-detail-length');
      if (sizeEl && state.detail) {
        var product2 = DATA.productById[state.detail.pid];
        if (!product2) return;
        var stats2 = DATA.byProduct[product2._index];
        state.detail.l = parseInt(sizeEl.getAttribute('data-detail-length'), 10);
        state.detail.b = parseInt(sizeEl.getAttribute('data-detail-breadth'), 10);
        renderDetailControls(product2, stats2);
        updateDetailPrice(product2, stats2);
      }
    });

    on(DOM.menuBtn, 'click', function () {
      if (DOM.menu.hidden) openMenu();
      else closeMenu();
    });

    on(DOM.menu, 'click', function (event) {
      var el = event.target;
      while (el && el !== DOM.menu && el.tagName !== 'A' && el.tagName !== 'BUTTON') {
        el = el.parentNode;
      }
      if (el && el !== DOM.menu) closeMenu();
    });

    on(DOM.reloadBtn, 'click', function (event) {
      event.preventDefault();
      reloadData();
    });

    on(document, 'click', function (event) {
      if (DOM.menu.hidden) return;
      if (DOM.menuWrap.contains(event.target) || DOM.menuBtn === event.target) return;
      closeMenu();
    });

    on(document, 'keydown', function (event) {
      if (event.keyCode === 27) closeMenu();
    });

    on(window, 'hashchange', handleRoute);
  }

  function enterSearch(event) {
    if (event.keyCode === 13) {
      event.preventDefault();
      if (!DATA.ready) return;
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
      }
      performFinderSearch(true);
    }
  }

  function init() {
    cacheDom();
    renderThicknessChips();
    syncBrandChips();
    state.searchQuery = DOM.nameInput.value || '';
    bindEvents();

    loadData(false, function (error, productsFile, pricesFile) {
      if (error) {
        showDataError(error);
        return;
      }
      try {
        applyData(productsFile, pricesFile);
      } catch (formatError) {
        showDataError(formatError);
        return;
      }
      updateMetaUI();
      syncBrandChips();
      handleRoute();
    });
  }

  init();
})();
