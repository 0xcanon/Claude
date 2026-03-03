/* ============================================
   SHIPT TIP TRACKER - Core Application Logic
   ============================================ */

(function () {
  'use strict';

  // ---- DATA LAYER (IndexedDB with localStorage fallback) ----

  const DB_NAME = 'ShiptTipTracker';
  const DB_VERSION = 1;
  const STORE_NAME = 'orders';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('address', 'addressNorm', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function getAllOrders() {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(getOrdersFromLS()); return; }
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(getOrdersFromLS());
    });
  }

  function putOrder(order) {
    return new Promise((resolve, reject) => {
      if (!db) { saveOrderToLS(order); resolve(); return; }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(order);
      tx.oncomplete = () => { syncToLS(order); resolve(); };
      tx.onerror = () => { saveOrderToLS(order); resolve(); };
    });
  }

  function deleteOrder(id) {
    return new Promise((resolve, reject) => {
      if (!db) { deleteOrderFromLS(id); resolve(); return; }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { deleteOrderFromLS(id); resolve(); };
      tx.onerror = () => { deleteOrderFromLS(id); resolve(); };
    });
  }

  function clearAllOrders() {
    return new Promise((resolve, reject) => {
      if (!db) { localStorage.removeItem('stt_orders'); resolve(); return; }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => { localStorage.removeItem('stt_orders'); resolve(); };
      tx.onerror = () => { localStorage.removeItem('stt_orders'); resolve(); };
    });
  }

  // LocalStorage fallback helpers
  function getOrdersFromLS() {
    try {
      return JSON.parse(localStorage.getItem('stt_orders') || '[]');
    } catch {
      return [];
    }
  }

  function saveOrderToLS(order) {
    const orders = getOrdersFromLS();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) orders[idx] = order; else orders.push(order);
    localStorage.setItem('stt_orders', JSON.stringify(orders));
  }

  function deleteOrderFromLS(id) {
    const orders = getOrdersFromLS().filter(o => o.id !== id);
    localStorage.setItem('stt_orders', JSON.stringify(orders));
  }

  function syncToLS(order) {
    saveOrderToLS(order);
  }

  // ---- ADDRESS NORMALIZATION ----

  function normalizeAddress(addr) {
    if (!addr) return '';
    return addr
      .toLowerCase()
      .replace(/[.,#\-]/g, ' ')
      .replace(/\b(street|st)\b/g, 'st')
      .replace(/\b(avenue|ave)\b/g, 'ave')
      .replace(/\b(boulevard|blvd)\b/g, 'blvd')
      .replace(/\b(drive|dr)\b/g, 'dr')
      .replace(/\b(lane|ln)\b/g, 'ln')
      .replace(/\b(road|rd)\b/g, 'rd')
      .replace(/\b(court|ct)\b/g, 'ct')
      .replace(/\b(place|pl)\b/g, 'pl')
      .replace(/\b(apartment|apt)\b/g, 'apt')
      .replace(/\b(suite|ste)\b/g, 'ste')
      .replace(/\b(unit)\b/g, 'unit')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract just the street address (remove apt/unit for matching)
  function streetKey(addr) {
    const norm = normalizeAddress(addr);
    return norm
      .replace(/\b(apt|ste|unit|#)\s*\w*\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- TIP RATING LOGIC ----

  function rateTipper(orders) {
    if (!orders || orders.length === 0) return { rating: 'unknown', label: 'New', class: 'unknown' };

    const tips = orders.map(o => parseFloat(o.tipAmount) || 0);
    const avgTip = tips.reduce((a, b) => a + b, 0) / tips.length;
    const tipRate = tips.filter(t => t > 0).length / tips.length;

    // Calculate tip percentage if we have order totals
    const withTotals = orders.filter(o => o.orderTotal > 0 && o.tipAmount > 0);
    let avgPct = 0;
    if (withTotals.length > 0) {
      avgPct = withTotals.reduce((sum, o) => sum + (o.tipAmount / o.orderTotal), 0) / withTotals.length;
    }

    if (tipRate === 0) return { rating: 'none', label: 'No Tipper', class: 'none' };
    if (avgTip >= 10 || avgPct >= 0.15) return { rating: 'great', label: 'Great Tipper', class: 'great' };
    if (avgTip >= 5) return { rating: 'decent', label: 'Decent', class: 'decent' };
    return { rating: 'low', label: 'Low Tipper', class: 'low' };
  }

  function tipDotColor(tipAmount) {
    const t = parseFloat(tipAmount) || 0;
    if (t >= 10) return 'var(--green)';
    if (t >= 5) return 'var(--yellow)';
    if (t > 0) return 'var(--orange)';
    return 'var(--red)';
  }

  // ---- GENERATE UNIQUE ID ----

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- UI ELEMENTS ----

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    tabs: $$('.tab'),
    tabContents: $$('.tab-content'),
    lookupInput: $('#lookupInput'),
    lookupBtn: $('#lookupBtn'),
    lookupResults: $('#lookupResults'),
    logForm: $('#logForm'),
    orderAddress: $('#orderAddress'),
    customerName: $('#customerName'),
    orderTotal: $('#orderTotal'),
    orderPay: $('#orderPay'),
    tipAmount: $('#tipAmount'),
    orderDate: $('#orderDate'),
    orderNotes: $('#orderNotes'),
    addressSuggestions: $('#addressSuggestions'),
    historySearch: $('#historySearch'),
    historySort: $('#historySort'),
    historyList: $('#historyList'),
    statsContent: $('#statsContent'),
    menuBtn: $('#menuBtn'),
    closeMenu: $('#closeMenu'),
    sideMenu: $('#sideMenu'),
    overlay: $('#overlay'),
    importCsvBtn: $('#importCsvBtn'),
    csvFileInput: $('#csvFileInput'),
    exportDataBtn: $('#exportDataBtn'),
    importJsonBtn: $('#importJsonBtn'),
    jsonFileInput: $('#jsonFileInput'),
    clearDataBtn: $('#clearDataBtn'),
    toast: $('#toast'),
  };

  // ---- TOAST ----

  let toastTimer;
  function showToast(msg, isError) {
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (isError ? ' error' : '');
    toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 2500);
  }

  // ---- TAB SWITCHING ----

  function switchTab(tabName) {
    els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    els.tabContents.forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tabName));

    if (tabName === 'history') renderHistory();
    if (tabName === 'stats') renderStats();
  }

  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // ---- SIDE MENU ----

  function openMenu() {
    els.sideMenu.classList.add('open');
    els.overlay.classList.add('visible');
  }

  function closeMenu() {
    els.sideMenu.classList.remove('open');
    els.overlay.classList.remove('visible');
  }

  els.menuBtn.addEventListener('click', openMenu);
  els.closeMenu.addEventListener('click', closeMenu);
  els.overlay.addEventListener('click', closeMenu);

  // ---- LOOKUP ----

  async function doLookup() {
    const query = els.lookupInput.value.trim();
    if (!query) return;

    const orders = await getAllOrders();
    const queryNorm = normalizeAddress(query);
    const queryKey = streetKey(query);

    // Find matching addresses (fuzzy)
    const addressMap = {};
    orders.forEach(order => {
      const key = streetKey(order.address);
      if (!addressMap[key]) {
        addressMap[key] = {
          address: order.address,
          customerName: order.customerName,
          orders: []
        };
      }
      addressMap[key].orders.push(order);
      if (order.customerName) addressMap[key].customerName = order.customerName;
    });

    // Score and filter matches
    const matches = [];
    Object.entries(addressMap).forEach(([key, data]) => {
      const addrNorm = normalizeAddress(data.address);
      let score = 0;

      if (key === queryKey) score = 100;
      else if (key.includes(queryKey) || queryKey.includes(key)) score = 80;
      else if (addrNorm.includes(queryNorm)) score = 70;
      else {
        // Partial word matching
        const queryWords = queryNorm.split(' ').filter(w => w.length > 1);
        const matchedWords = queryWords.filter(w => addrNorm.includes(w));
        if (matchedWords.length > 0) {
          score = (matchedWords.length / queryWords.length) * 60;
        }
      }

      if (score > 20) {
        matches.push({ ...data, key, score });
      }
    });

    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      els.lookupResults.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">&#128566;</span>
          <p>No matching addresses found</p>
          <p class="hint">This address hasn't been logged yet. Deliver and log it to start tracking!</p>
        </div>`;
      return;
    }

    els.lookupResults.innerHTML = matches.slice(0, 10).map(m => {
      const rating = rateTipper(m.orders);
      const tips = m.orders.map(o => parseFloat(o.tipAmount) || 0);
      const avgTip = tips.reduce((a, b) => a + b, 0) / tips.length;
      const totalTips = tips.reduce((a, b) => a + b, 0);
      const sortedOrders = [...m.orders].sort((a, b) => new Date(b.date) - new Date(a.date));

      return `
        <div class="address-card">
          <div class="card-header">
            <div>
              <div class="address-text">${escHtml(m.address)}</div>
              ${m.customerName ? `<div class="customer-name">${escHtml(m.customerName)}</div>` : ''}
            </div>
            <span class="tip-badge ${rating.class}">${rating.label}</span>
          </div>
          <div class="card-stats">
            <div class="stat-item">
              <div class="stat-value">$${avgTip.toFixed(2)}</div>
              <div class="stat-label">Avg Tip</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${m.orders.length}</div>
              <div class="stat-label">Deliveries</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">$${totalTips.toFixed(2)}</div>
              <div class="stat-label">Total Tips</div>
            </div>
          </div>
          <div class="card-orders">
            <h4>Recent Orders</h4>
            ${sortedOrders.slice(0, 5).map(o => `
              <div class="order-row">
                <span class="order-date">${formatDate(o.date)}</span>
                ${o.orderTotal ? `<span class="order-detail">$${parseFloat(o.orderTotal).toFixed(2)} order</span>` : ''}
                <span class="order-tip ${parseFloat(o.tipAmount) > 0 ? 'tipped' : 'no-tip'}">
                  ${parseFloat(o.tipAmount) > 0 ? '+$' + parseFloat(o.tipAmount).toFixed(2) : '$0.00'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }).join('');
  }

  els.lookupBtn.addEventListener('click', doLookup);
  els.lookupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLookup();
  });

  // ---- LOG ORDER ----

  // Set default date to today
  els.orderDate.value = new Date().toISOString().split('T')[0];

  // Quick tip buttons
  $$('.quick-tip').forEach(btn => {
    btn.addEventListener('click', () => {
      els.tipAmount.value = btn.dataset.tip;
      $$('.quick-tip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Address autocomplete from history
  let suggestionTimeout;
  els.orderAddress.addEventListener('input', () => {
    clearTimeout(suggestionTimeout);
    suggestionTimeout = setTimeout(showAddressSuggestions, 200);
  });

  async function showAddressSuggestions() {
    const val = els.orderAddress.value.trim();
    if (val.length < 3) {
      els.addressSuggestions.classList.remove('visible');
      return;
    }

    const orders = await getAllOrders();
    const seen = new Set();
    const query = normalizeAddress(val);
    const suggestions = [];

    orders.forEach(o => {
      const key = streetKey(o.address);
      if (seen.has(key)) return;
      if (normalizeAddress(o.address).includes(query)) {
        seen.add(key);
        suggestions.push(o.address);
      }
    });

    if (suggestions.length === 0) {
      els.addressSuggestions.classList.remove('visible');
      return;
    }

    els.addressSuggestions.innerHTML = suggestions.slice(0, 5).map(addr =>
      `<div class="suggestion-item" data-address="${escAttr(addr)}">${escHtml(addr)}</div>`
    ).join('');
    els.addressSuggestions.classList.add('visible');

    els.addressSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        els.orderAddress.value = item.dataset.address;
        els.addressSuggestions.classList.remove('visible');
      });
    });
  }

  // Close suggestions when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
      els.addressSuggestions.classList.remove('visible');
    }
  });

  // Submit order
  els.logForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const address = els.orderAddress.value.trim();
    const tipAmount = parseFloat(els.tipAmount.value) || 0;

    if (!address) { showToast('Please enter an address', true); return; }

    const order = {
      id: genId(),
      address: address,
      addressNorm: normalizeAddress(address),
      customerName: els.customerName.value.trim(),
      orderTotal: parseFloat(els.orderTotal.value) || 0,
      orderPay: parseFloat(els.orderPay.value) || 0,
      tipAmount: tipAmount,
      date: els.orderDate.value || new Date().toISOString().split('T')[0],
      notes: els.orderNotes.value.trim(),
      createdAt: new Date().toISOString(),
    };

    await putOrder(order);
    showToast('Delivery saved!');

    // Reset form
    els.logForm.reset();
    els.orderDate.value = new Date().toISOString().split('T')[0];
    $$('.quick-tip').forEach(b => b.classList.remove('active'));
  });

  // ---- HISTORY ----

  async function renderHistory() {
    const orders = await getAllOrders();
    const filter = els.historySearch.value.toLowerCase().trim();
    const sort = els.historySort.value;

    let filtered = orders;
    if (filter) {
      filtered = orders.filter(o =>
        o.address.toLowerCase().includes(filter) ||
        (o.customerName && o.customerName.toLowerCase().includes(filter))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case 'date-desc': return new Date(b.date) - new Date(a.date);
        case 'date-asc': return new Date(a.date) - new Date(b.date);
        case 'tip-desc': return (b.tipAmount || 0) - (a.tipAmount || 0);
        case 'tip-asc': return (a.tipAmount || 0) - (b.tipAmount || 0);
        default: return 0;
      }
    });

    if (filtered.length === 0) {
      els.historyList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">&#128203;</span>
          <p>${filter ? 'No matching deliveries' : 'No deliveries logged yet'}</p>
          <p class="hint">${filter ? 'Try a different search' : 'Log your first delivery to get started!'}</p>
        </div>`;
      return;
    }

    els.historyList.innerHTML = filtered.map(o => {
      const tip = parseFloat(o.tipAmount) || 0;
      return `
        <div class="history-item" data-id="${o.id}">
          <span class="tip-dot" style="background:${tipDotColor(tip)}"></span>
          <div class="hi-address">
            ${escHtml(o.address)}
            <div class="hi-meta">${formatDate(o.date)}${o.customerName ? ' &middot; ' + escHtml(o.customerName) : ''}</div>
          </div>
          <span class="hi-tip ${tip > 0 ? 'tipped' : 'no-tip'}">
            ${tip > 0 ? '+$' + tip.toFixed(2) : '$0'}
          </span>
          <button class="delete-btn" data-id="${o.id}" title="Delete">&times;</button>
        </div>`;
    }).join('');

    // Delete handlers
    els.historyList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this delivery record?')) {
          await deleteOrder(btn.dataset.id);
          showToast('Deleted');
          renderHistory();
        }
      });
    });

    // Click to lookup
    els.historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        const order = filtered.find(o => o.id === item.dataset.id);
        if (order) {
          els.lookupInput.value = order.address;
          switchTab('lookup');
          doLookup();
        }
      });
    });
  }

  els.historySearch.addEventListener('input', debounce(renderHistory, 300));
  els.historySort.addEventListener('change', renderHistory);

  // ---- STATS ----

  async function renderStats() {
    const orders = await getAllOrders();

    if (orders.length === 0) {
      els.statsContent.innerHTML = `
        <div class="stats-card full-width">
          <div class="sc-value">No Data</div>
          <div class="sc-label">Log deliveries to see your stats</div>
        </div>`;
      return;
    }

    const tips = orders.map(o => parseFloat(o.tipAmount) || 0);
    const totalTips = tips.reduce((a, b) => a + b, 0);
    const avgTip = totalTips / tips.length;
    const tippedOrders = tips.filter(t => t > 0).length;
    const tipRate = (tippedOrders / orders.length * 100);
    const totalPay = orders.reduce((s, o) => s + (parseFloat(o.orderPay) || 0), 0);
    const maxTip = Math.max(...tips);

    // Unique addresses
    const addressMap = {};
    orders.forEach(o => {
      const key = streetKey(o.address);
      if (!addressMap[key]) addressMap[key] = { address: o.address, tips: [], orders: 0 };
      addressMap[key].tips.push(parseFloat(o.tipAmount) || 0);
      addressMap[key].orders++;
    });

    const addresses = Object.values(addressMap);
    const uniqueAddresses = addresses.length;

    // Top tippers (by avg, min 2 orders)
    const repeatAddresses = addresses.filter(a => a.orders >= 2);
    const topTippers = [...repeatAddresses]
      .map(a => ({ ...a, avg: a.tips.reduce((x, y) => x + y, 0) / a.tips.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    // Worst (no tip repeat offenders)
    const noTippers = [...repeatAddresses]
      .map(a => ({ ...a, avg: a.tips.reduce((x, y) => x + y, 0) / a.tips.length }))
      .filter(a => a.avg < 1)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);

    // Monthly breakdown
    const monthMap = {};
    orders.forEach(o => {
      const month = (o.date || '').slice(0, 7);
      if (!month) return;
      if (!monthMap[month]) monthMap[month] = { tips: 0, count: 0 };
      monthMap[month].tips += parseFloat(o.tipAmount) || 0;
      monthMap[month].count++;
    });

    els.statsContent.innerHTML = `
      <div class="stats-card">
        <div class="sc-value">${orders.length}</div>
        <div class="sc-label">Total Deliveries</div>
      </div>
      <div class="stats-card">
        <div class="sc-value">$${totalTips.toFixed(2)}</div>
        <div class="sc-label">Total Tips</div>
      </div>
      <div class="stats-card">
        <div class="sc-value">$${avgTip.toFixed(2)}</div>
        <div class="sc-label">Avg Tip</div>
      </div>
      <div class="stats-card">
        <div class="sc-value">${tipRate.toFixed(0)}%</div>
        <div class="sc-label">Tip Rate</div>
      </div>
      <div class="stats-card">
        <div class="sc-value">$${maxTip.toFixed(2)}</div>
        <div class="sc-label">Best Tip</div>
      </div>
      <div class="stats-card">
        <div class="sc-value">${uniqueAddresses}</div>
        <div class="sc-label">Unique Addresses</div>
      </div>
      ${totalPay > 0 ? `
        <div class="stats-card full-width">
          <div class="sc-value">$${(totalTips + totalPay).toFixed(2)}</div>
          <div class="sc-label">Total Earnings (Pay + Tips)</div>
        </div>` : ''}
      ${topTippers.length > 0 ? `
        <div class="stats-card full-width">
          <div class="sc-label" style="margin-bottom:8px;">TOP TIPPERS (2+ deliveries)</div>
          <div class="top-tippers-list">
            ${topTippers.map((t, i) => `
              <div class="top-tipper-row">
                <span class="rank">#${i + 1}</span>
                <span class="tt-address">${escHtml(t.address)}</span>
                <span class="tt-avg">$${t.avg.toFixed(2)} avg</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      ${noTippers.length > 0 ? `
        <div class="stats-card full-width">
          <div class="sc-label" style="margin-bottom:8px;">NO-TIP REPEAT OFFENDERS</div>
          <div class="top-tippers-list worst-list">
            ${noTippers.map((t, i) => `
              <div class="top-tipper-row">
                <span class="rank">#${i + 1}</span>
                <span class="tt-address">${escHtml(t.address)}</span>
                <span class="tt-avg">${t.orders} orders, $${t.avg.toFixed(2)} avg</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
    `;
  }

  // ---- CSV IMPORT (Shipt Earnings Export) ----

  els.importCsvBtn.addEventListener('click', () => els.csvFileInput.click());
  els.csvFileInput.addEventListener('change', handleCsvImport);

  async function handleCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      showToast('CSV file appears empty', true);
      return;
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    // Try to find relevant columns - Shipt CSV formats may vary
    const addressIdx = findCol(headers, ['address', 'delivery address', 'deliver to', 'delivery_address']);
    const tipIdx = findCol(headers, ['tip', 'tip amount', 'tip_amount', 'promo tip', 'member tip']);
    const dateIdx = findCol(headers, ['date', 'delivery date', 'order date', 'delivery_date', 'completed']);
    const totalIdx = findCol(headers, ['order total', 'total', 'order_total', 'subtotal']);
    const payIdx = findCol(headers, ['order pay', 'pay', 'shipt pay', 'base pay', 'order_pay', 'earnings']);
    const nameIdx = findCol(headers, ['customer', 'customer name', 'member', 'name', 'member name']);

    if (addressIdx === -1) {
      showToast('Could not find address column in CSV. Check the format.', true);
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const address = (cols[addressIdx] || '').trim();
      if (!address) { skipped++; continue; }

      const order = {
        id: genId(),
        address: address,
        addressNorm: normalizeAddress(address),
        customerName: nameIdx >= 0 ? (cols[nameIdx] || '').trim() : '',
        orderTotal: totalIdx >= 0 ? parseFloat(cols[totalIdx]) || 0 : 0,
        orderPay: payIdx >= 0 ? parseFloat(cols[payIdx]) || 0 : 0,
        tipAmount: tipIdx >= 0 ? parseFloat(cols[tipIdx]) || 0 : 0,
        date: dateIdx >= 0 ? parseDate(cols[dateIdx]) : new Date().toISOString().split('T')[0],
        notes: 'Imported from CSV',
        createdAt: new Date().toISOString(),
      };

      await putOrder(order);
      imported++;
    }

    showToast(`Imported ${imported} orders${skipped ? ` (${skipped} skipped)` : ''}`);
    els.csvFileInput.value = '';
    closeMenu();
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function findCol(headers, candidates) {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx >= 0) return idx;
    }
    // Fuzzy match
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseDate(str) {
    if (!str) return new Date().toISOString().split('T')[0];
    const cleaned = str.replace(/"/g, '').trim();
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  }

  // ---- JSON EXPORT / IMPORT ----

  els.exportDataBtn.addEventListener('click', async () => {
    const orders = await getAllOrders();
    const blob = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipt-tips-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${orders.length} orders`);
    closeMenu();
  });

  els.importJsonBtn.addEventListener('click', () => els.jsonFileInput.click());
  els.jsonFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Invalid format');

      let imported = 0;
      for (const order of data) {
        if (order.address && order.id) {
          order.addressNorm = normalizeAddress(order.address);
          await putOrder(order);
          imported++;
        }
      }
      showToast(`Imported ${imported} orders`);
    } catch (err) {
      showToast('Invalid JSON file', true);
    }
    els.jsonFileInput.value = '';
    closeMenu();
  });

  // ---- CLEAR DATA ----

  els.clearDataBtn.addEventListener('click', async () => {
    if (confirm('Delete ALL delivery data? This cannot be undone!')) {
      if (confirm('Are you really sure? All tip tracking data will be lost.')) {
        await clearAllOrders();
        showToast('All data cleared');
        closeMenu();
      }
    }
  });

  // ---- HELPERS ----

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ---- INIT ----

  async function init() {
    try {
      await openDB();
    } catch {
      console.warn('IndexedDB unavailable, using localStorage fallback');
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();

})();
