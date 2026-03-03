/* ============================================
   SHIPT TIPPER TRACKER - Application Logic
   ============================================ */

(function () {
  'use strict';

  // ── Storage ──────────────────────────────────────────
  const STORAGE_KEY = 'shipt_tipper_tracker';

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveData(deliveries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveries));
  }

  let deliveries = loadData();

  // ── DOM Refs ─────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const tabs = $$('.tab');
  const panels = $$('.panel');
  const searchInput = $('#searchInput');
  const clearSearchBtn = $('#clearSearch');
  const searchResults = $('#searchResults');
  const deliveryList = $('#deliveryList');
  const emptyState = $('#emptyState');
  const deliveryForm = $('#deliveryForm');
  const addressInput = $('#addressInput');
  const zoneInput = $('#zoneInput');
  const orderTotalInput = $('#orderTotal');
  const tipAmountInput = $('#tipAmount');
  const shiptPayInput = $('#shiptPay');
  const itemCountInput = $('#itemCount');
  const deliveryDateInput = $('#deliveryDate');
  const notesInput = $('#notesInput');
  const submitBtn = $('#submitBtn');
  const sortSelect = $('#sortSelect');
  const filterChips = $$('.filter-chip');
  const menuBtn = $('#menuBtn');
  const dropdownMenu = $('#dropdownMenu');
  const exportBtn = $('#exportBtn');
  const importBtn = $('#importBtn');
  const importFile = $('#importFile');
  const clearAllBtn = $('#clearAllBtn');
  const editModal = $('#editModal');
  const editForm = $('#editForm');
  const modalClose = $('#modalClose');
  const deleteBtn = $('#deleteBtn');
  const addressSuggestions = $('#addressSuggestions');

  let currentFilter = 'all';
  let currentSort = 'recent';
  let starRating = 0;
  let editStarRating = 0;

  // ── Helpers ──────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function tipCategory(tip) {
    if (tip >= 10) return 'great';
    if (tip > 0) return 'decent';
    return 'none';
  }

  function formatCurrency(val) {
    return '$' + (Number(val) || 0).toFixed(2);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function normalizeAddress(addr) {
    return addr.trim().toLowerCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ');
  }

  function getDeliveriesForAddress(address) {
    const norm = normalizeAddress(address);
    return deliveries.filter(d => normalizeAddress(d.address) === norm);
  }

  function getUniqueAddresses() {
    const map = new Map();
    for (const d of deliveries) {
      const key = normalizeAddress(d.address);
      if (!map.has(key)) {
        map.set(key, { address: d.address, deliveries: [] });
      }
      map.get(key).deliveries.push(d);
    }
    return Array.from(map.values());
  }

  function showToast(msg, isError) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── Tab Navigation ───────────────────────────────────

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach(p => p.classList.remove('active'));

      const panelMap = {
        deliveries: 'deliveriesPanel',
        add: 'addPanel',
        stats: 'statsPanel',
        map: 'mapPanel'
      };
      $('#' + panelMap[target]).classList.add('active');

      if (target === 'stats') renderStats();
      if (target === 'map') renderZones();
      if (target === 'deliveries') renderDeliveries();
    });
  });

  // ── Star Rating ──────────────────────────────────────

  function setupStars(container, callback) {
    const stars = container.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value);
        callback(val);
        stars.forEach(s => {
          s.classList.toggle('active', parseInt(s.dataset.value) <= val);
        });
      });
    });
  }

  setupStars($('#starRating'), (val) => { starRating = val; });
  setupStars($('#editStarRating'), (val) => { editStarRating = val; });

  function setStars(container, rating) {
    container.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.value) <= rating);
    });
  }

  // ── Address Suggestions (autocomplete from history) ──

  addressInput.addEventListener('input', () => {
    const val = addressInput.value.trim().toLowerCase();
    if (val.length < 2) {
      addressSuggestions.classList.remove('show');
      return;
    }
    const unique = getUniqueAddresses();
    const matches = unique.filter(u =>
      u.address.toLowerCase().includes(val)
    ).slice(0, 5);

    if (matches.length === 0) {
      addressSuggestions.classList.remove('show');
      return;
    }

    addressSuggestions.innerHTML = matches.map(m => {
      const avgTip = m.deliveries.reduce((s, d) => s + d.tip, 0) / m.deliveries.length;
      const cat = tipCategory(avgTip);
      return `<div class="suggestion-item" data-address="${escapeAttr(m.address)}" data-zone="${escapeAttr(m.deliveries[0].zone || '')}">
        <div>${escapeHtml(m.address)}</div>
        <div class="suggestion-tip">Avg tip: ${formatCurrency(avgTip)} (${m.deliveries.length} delivery${m.deliveries.length > 1 ? 'ies' : ''})</div>
      </div>`;
    }).join('');
    addressSuggestions.classList.add('show');
  });

  addressSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    addressInput.value = item.dataset.address;
    if (item.dataset.zone && !zoneInput.value) {
      zoneInput.value = item.dataset.zone;
    }
    addressSuggestions.classList.remove('show');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
      addressSuggestions.classList.remove('show');
    }
  });

  // ── Form Submission ──────────────────────────────────

  deliveryForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const address = addressInput.value.trim();
    const tip = parseFloat(tipAmountInput.value) || 0;

    if (!address) {
      showToast('Please enter an address', true);
      return;
    }

    const delivery = {
      id: generateId(),
      address: address,
      zone: zoneInput.value.trim(),
      orderTotal: parseFloat(orderTotalInput.value) || 0,
      tip: tip,
      shiptPay: parseFloat(shiptPayInput.value) || 0,
      items: parseInt(itemCountInput.value) || 0,
      date: deliveryDateInput.value || new Date().toISOString().split('T')[0],
      notes: notesInput.value.trim(),
      rating: starRating,
      createdAt: Date.now()
    };

    deliveries.push(delivery);
    saveData(deliveries);

    // Reset form
    deliveryForm.reset();
    starRating = 0;
    setStars($('#starRating'), 0);
    deliveryDateInput.value = new Date().toISOString().split('T')[0];

    showToast('Delivery saved!');

    // Switch to deliveries tab
    tabs[0].click();
  });

  // Set default date to today
  deliveryDateInput.value = new Date().toISOString().split('T')[0];

  // ── Render Deliveries ────────────────────────────────

  function renderDeliveries() {
    let list = [...deliveries];

    // Filter
    if (currentFilter !== 'all') {
      if (currentFilter === 'new') {
        const addrCount = {};
        deliveries.forEach(d => {
          const k = normalizeAddress(d.address);
          addrCount[k] = (addrCount[k] || 0) + 1;
        });
        list = list.filter(d => addrCount[normalizeAddress(d.address)] === 1);
      } else {
        list = list.filter(d => tipCategory(d.tip) === currentFilter);
      }
    }

    // Sort
    switch (currentSort) {
      case 'recent':
        list.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'tip-high':
        list.sort((a, b) => b.tip - a.tip);
        break;
      case 'tip-low':
        list.sort((a, b) => a.tip - b.tip);
        break;
      case 'frequency': {
        const freq = {};
        deliveries.forEach(d => {
          const k = normalizeAddress(d.address);
          freq[k] = (freq[k] || 0) + 1;
        });
        list.sort((a, b) => freq[normalizeAddress(b.address)] - freq[normalizeAddress(a.address)]);
        break;
      }
      case 'alpha':
        list.sort((a, b) => a.address.localeCompare(b.address));
        break;
    }

    if (list.length === 0) {
      deliveryList.innerHTML = '';
      emptyState.classList.add('show');
      return;
    }

    emptyState.classList.remove('show');

    const addrCount = {};
    deliveries.forEach(d => {
      const k = normalizeAddress(d.address);
      addrCount[k] = (addrCount[k] || 0) + 1;
    });

    deliveryList.innerHTML = list.map(d => {
      const cat = tipCategory(d.tip);
      const count = addrCount[normalizeAddress(d.address)];
      const isRepeat = count > 1;
      const starsHtml = d.rating ? '<div class="card-stars">' + '&#9733;'.repeat(d.rating) + '&#9734;'.repeat(5 - d.rating) + '</div>' : '';
      const detailParts = [];
      if (d.shiptPay > 0) detailParts.push('Pay: ' + formatCurrency(d.shiptPay));
      if (d.items > 0) detailParts.push(d.items + ' items');
      if (d.orderTotal > 0) detailParts.push('Order: ' + formatCurrency(d.orderTotal));

      return `<div class="delivery-card ${cat}" data-id="${d.id}">
        <div class="card-top">
          <div class="card-address">${escapeHtml(d.address)}</div>
          <div class="card-tip ${cat}">${formatCurrency(d.tip)}</div>
        </div>
        <div class="card-meta">
          <span class="card-badge ${cat}">${cat === 'great' ? 'Great Tipper' : cat === 'decent' ? 'Decent' : 'No Tip'}</span>
          ${isRepeat ? '<span class="card-badge repeat">' + count + 'x Repeat</span>' : ''}
          ${d.zone ? '<span class="card-zone">' + escapeHtml(d.zone) + '</span>' : ''}
          <span class="card-date">${formatDate(d.date)}</span>
        </div>
        ${detailParts.length > 0 ? '<div class="card-details">' + detailParts.join(' &middot; ') + '</div>' : ''}
        ${starsHtml}
        ${d.notes ? '<div class="card-notes">' + escapeHtml(d.notes) + '</div>' : ''}
      </div>`;
    }).join('');
  }

  // Card click → edit
  deliveryList.addEventListener('click', (e) => {
    const card = e.target.closest('.delivery-card');
    if (!card) return;
    openEditModal(card.dataset.id);
  });

  // ── Filters & Sort ──────────────────────────────────

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderDeliveries();
    });
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderDeliveries();
  });

  // ── Search ───────────────────────────────────────────

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    clearSearchBtn.classList.toggle('visible', val.length > 0);

    if (val.length < 2) {
      searchResults.classList.remove('active');
      return;
    }

    const query = val.toLowerCase();
    const unique = getUniqueAddresses();
    const matches = unique.filter(u =>
      u.address.toLowerCase().includes(query) ||
      (u.deliveries[0].zone && u.deliveries[0].zone.toLowerCase().includes(query)) ||
      (u.deliveries.some(d => d.notes && d.notes.toLowerCase().includes(query)))
    );

    if (matches.length === 0) {
      searchResults.innerHTML = `<div class="search-no-results">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <h3>No matches found</h3>
        <p>This address isn't in your records yet — could be a new customer!</p>
      </div>`;
      searchResults.classList.add('active');
      return;
    }

    searchResults.innerHTML = matches.map(m => {
      const avgTip = m.deliveries.reduce((s, d) => s + d.tip, 0) / m.deliveries.length;
      const cat = tipCategory(avgTip);
      const lastDate = m.deliveries.sort((a, b) => b.createdAt - a.createdAt)[0].date;
      const totalDeliveries = m.deliveries.length;
      return `<div class="search-result-item" data-address="${escapeAttr(m.address)}">
        <div class="result-indicator ${cat}"></div>
        <div class="result-info">
          <div class="result-address">${escapeHtml(m.address)}</div>
          <div class="result-meta">${totalDeliveries} deliver${totalDeliveries > 1 ? 'ies' : 'y'} &middot; Last: ${formatDate(lastDate)}${m.deliveries[0].zone ? ' &middot; ' + escapeHtml(m.deliveries[0].zone) : ''}</div>
        </div>
        <div class="result-tip ${cat}">Avg ${formatCurrency(avgTip)}</div>
      </div>`;
    }).join('');

    searchResults.classList.add('active');
  });

  searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    const addr = item.dataset.address;
    const records = getDeliveriesForAddress(addr);
    if (records.length > 0) {
      openEditModal(records[records.length - 1].id);
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    searchResults.classList.remove('active');
  });

  // ── Edit Modal ───────────────────────────────────────

  function openEditModal(id) {
    const d = deliveries.find(x => x.id === id);
    if (!d) return;

    $('#editId').value = d.id;
    $('#editAddress').value = d.address;
    $('#editZone').value = d.zone || '';
    $('#editOrderTotal').value = d.orderTotal || '';
    $('#editTipAmount').value = d.tip || '';
    $('#editShiptPay').value = d.shiptPay || '';
    $('#editItemCount').value = d.items || '';
    $('#editNotes').value = d.notes || '';
    editStarRating = d.rating || 0;
    setStars($('#editStarRating'), editStarRating);

    editModal.classList.add('show');
  }

  modalClose.addEventListener('click', () => editModal.classList.remove('show'));
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) editModal.classList.remove('show');
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#editId').value;
    const idx = deliveries.findIndex(x => x.id === id);
    if (idx === -1) return;

    deliveries[idx].address = $('#editAddress').value.trim();
    deliveries[idx].zone = $('#editZone').value.trim();
    deliveries[idx].orderTotal = parseFloat($('#editOrderTotal').value) || 0;
    deliveries[idx].tip = parseFloat($('#editTipAmount').value) || 0;
    deliveries[idx].shiptPay = parseFloat($('#editShiptPay').value) || 0;
    deliveries[idx].items = parseInt($('#editItemCount').value) || 0;
    deliveries[idx].notes = $('#editNotes').value.trim();
    deliveries[idx].rating = editStarRating;

    saveData(deliveries);
    editModal.classList.remove('show');
    renderDeliveries();
    showToast('Delivery updated!');
  });

  deleteBtn.addEventListener('click', () => {
    const id = $('#editId').value;
    if (!confirm('Delete this delivery record?')) return;
    deliveries = deliveries.filter(x => x.id !== id);
    saveData(deliveries);
    editModal.classList.remove('show');
    renderDeliveries();
    showToast('Delivery deleted');
  });

  // ── Stats ────────────────────────────────────────────

  function renderStats() {
    const total = deliveries.length;
    if (total === 0) {
      $('#statTotal').textContent = '0';
      $('#statTipRate').textContent = '0%';
      $('#statAvgTip').textContent = '$0';
      $('#statBestTip').textContent = '$0';
      $('#statTotalTips').textContent = '$0';
      $('#statTotalPay').textContent = '$0';
      $('#statAvgOrder').textContent = '$0';
      $('#statRepeat').textContent = '0';
      return;
    }

    const tipped = deliveries.filter(d => d.tip > 0);
    const totalTips = deliveries.reduce((s, d) => s + d.tip, 0);
    const totalPay = deliveries.reduce((s, d) => s + (d.shiptPay || 0), 0);
    const totalOrders = deliveries.reduce((s, d) => s + (d.orderTotal || 0), 0);
    const bestTip = Math.max(...deliveries.map(d => d.tip));

    const addrCount = {};
    deliveries.forEach(d => {
      const k = normalizeAddress(d.address);
      addrCount[k] = (addrCount[k] || 0) + 1;
    });
    const repeatCount = Object.values(addrCount).filter(c => c > 1).length;

    $('#statTotal').textContent = total;
    $('#statTipRate').textContent = Math.round((tipped.length / total) * 100) + '%';
    $('#statAvgTip').textContent = formatCurrency(totalTips / total);
    $('#statBestTip').textContent = formatCurrency(bestTip);
    $('#statTotalTips').textContent = formatCurrency(totalTips);
    $('#statTotalPay').textContent = formatCurrency(totalPay);
    $('#statAvgOrder').textContent = totalOrders > 0 ? formatCurrency(totalOrders / total) : '$0';
    $('#statRepeat').textContent = repeatCount;

    // Tip breakdown bar
    const greatCount = deliveries.filter(d => d.tip >= 10).length;
    const decentCount = deliveries.filter(d => d.tip > 0 && d.tip < 10).length;
    const noneCount = deliveries.filter(d => d.tip === 0).length;

    $('#barGreat').style.width = (greatCount / total * 100) + '%';
    $('#barDecent').style.width = (decentCount / total * 100) + '%';
    $('#barNone').style.width = (noneCount / total * 100) + '%';

    // Weekly chart (last 8 weeks)
    renderWeeklyChart();

    // Day grid
    renderDayGrid();
  }

  function renderWeeklyChart() {
    const container = $('#weeklyChart');
    const now = new Date();
    const weeks = [];

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekDeliveries = deliveries.filter(d => {
        const dd = new Date(d.date + 'T00:00:00');
        return dd >= weekStart && dd <= weekEnd;
      });

      const tips = weekDeliveries.reduce((s, d) => s + d.tip, 0);
      weeks.push({
        label: (weekStart.getMonth() + 1) + '/' + weekStart.getDate(),
        tips: tips,
        count: weekDeliveries.length
      });
    }

    const maxTips = Math.max(...weeks.map(w => w.tips), 1);

    container.innerHTML = `<div class="chart-bars">
      ${weeks.map(w => `<div class="chart-bar-wrap">
        <div class="chart-value">${w.tips > 0 ? formatCurrency(w.tips) : ''}</div>
        <div class="chart-bar" style="height: ${Math.max((w.tips / maxTips) * 100, 2)}%"></div>
        <div class="chart-label">${w.label}</div>
      </div>`).join('')}
    </div>`;
  }

  function renderDayGrid() {
    const grid = $('#dayGrid');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayData = days.map(() => ({ tips: 0, count: 0 }));

    deliveries.forEach(d => {
      const day = new Date(d.date + 'T00:00:00').getDay();
      dayData[day].tips += d.tip;
      dayData[day].count += 1;
    });

    grid.innerHTML = days.map((name, i) => {
      const avg = dayData[i].count > 0 ? dayData[i].tips / dayData[i].count : 0;
      const cat = tipCategory(avg);
      const color = cat === 'great' ? 'var(--great)' : cat === 'decent' ? 'var(--decent)' : 'var(--text-muted)';
      return `<div class="day-cell">
        <div class="day-name">${name}</div>
        <div class="day-value" style="color:${color}">${dayData[i].count > 0 ? formatCurrency(avg) : '-'}</div>
        <div class="day-count">${dayData[i].count} del.</div>
      </div>`;
    }).join('');
  }

  // ── Zones ────────────────────────────────────────────

  function renderZones() {
    const zoneMap = {};
    deliveries.forEach(d => {
      const zone = d.zone || '';
      if (!zone) return;
      if (!zoneMap[zone]) zoneMap[zone] = { tips: 0, count: 0, tipped: 0, totalPay: 0 };
      zoneMap[zone].tips += d.tip;
      zoneMap[zone].count += 1;
      if (d.tip > 0) zoneMap[zone].tipped += 1;
      zoneMap[zone].totalPay += (d.shiptPay || 0);
    });

    const zones = Object.entries(zoneMap)
      .map(([name, data]) => ({
        name,
        avgTip: data.tips / data.count,
        tipRate: (data.tipped / data.count) * 100,
        total: data.count,
        totalTips: data.tips,
        totalPay: data.totalPay
      }))
      .sort((a, b) => b.avgTip - a.avgTip);

    const zoneList = $('#zoneList');
    const zoneEmpty = $('#zoneEmpty');

    if (zones.length === 0) {
      zoneList.innerHTML = '';
      zoneEmpty.classList.add('show');
      return;
    }

    zoneEmpty.classList.remove('show');
    const maxAvg = Math.max(...zones.map(z => z.avgTip), 1);

    zoneList.innerHTML = zones.map(z => {
      const cat = tipCategory(z.avgTip);
      const barColor = cat === 'great' ? 'var(--great)' : cat === 'decent' ? 'var(--decent)' : 'var(--none)';
      return `<div class="zone-card">
        <div class="zone-header">
          <div class="zone-name">${escapeHtml(z.name)}</div>
          <div class="zone-avg ${cat}">Avg ${formatCurrency(z.avgTip)}</div>
        </div>
        <div class="zone-stats">
          <span>${z.total} deliveries</span>
          <span>${Math.round(z.tipRate)}% tip rate</span>
          <span>Total: ${formatCurrency(z.totalTips)}</span>
        </div>
        <div class="zone-bar">
          <div class="zone-bar-fill" style="width:${(z.avgTip / maxAvg * 100)}%; background:${barColor}"></div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Menu / Export / Import ───────────────────────────

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdownMenu.classList.remove('show');
  });

  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(deliveries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipt-tipper-data-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!');
    dropdownMenu.classList.remove('show');
  });

  importBtn.addEventListener('click', () => {
    importFile.click();
    dropdownMenu.classList.remove('show');
  });

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        // Merge: skip duplicates by id
        const existingIds = new Set(deliveries.map(d => d.id));
        let added = 0;
        for (const d of imported) {
          if (d.id && !existingIds.has(d.id)) {
            deliveries.push(d);
            added++;
          }
        }
        saveData(deliveries);
        renderDeliveries();
        showToast(added + ' deliveries imported!');
      } catch {
        showToast('Invalid file format', true);
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  clearAllBtn.addEventListener('click', () => {
    if (!confirm('This will permanently delete ALL your delivery data. Are you sure?')) return;
    if (!confirm('Really? This cannot be undone. Delete everything?')) return;
    deliveries = [];
    saveData(deliveries);
    renderDeliveries();
    showToast('All data cleared');
    dropdownMenu.classList.remove('show');
  });

  // ── XSS Protection ──────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Service Worker Registration ──────────────────────

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ── Initial Render ───────────────────────────────────

  renderDeliveries();
})();
