'use strict';

const STORAGE_KEY = 'bigpickle.sales.v1';
const PAYMENTS = ['Card', 'Cash', 'Bank transfer', 'Other'];
const PERIODS = ['7', '30', '90', 'all'];
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY', 'NGN', 'ZAR', 'BRL', 'MXN', 'AED'];

const DEMO_PRODUCTS = [
  { name: 'Classic Dill Jar', min: 9, max: 14 },
  { name: 'Spicy Spears', min: 11, max: 16 },
  { name: 'Bread & Butter Chips', min: 9, max: 13 },
  { name: 'Pickle Gift Box', min: 32, max: 45 },
  { name: 'Big Pickle Tee', min: 22, max: 30 }
];
const DEMO_CUSTOMERS = ['Alex Morgan', 'Jamie Lee', 'Priya Patel', 'Sam Rivera', 'Jordan Kim', 'Taylor Brooks', 'Casey Nguyen', 'Morgan Bell'];
const PRODUCT_COLORS = ['#10724a', '#d78a2c', '#4c6fd1', '#b3588a', '#7a6a2c', '#2e8b8b', '#9a5b2f'];

const state = { sales: [], settings: { businessName: 'Big Pickle', currency: 'USD', period: '30' } };
let demoBannerDismissed = false;
let els = {};

/* ------------------------------------------------------------------ */
/* Dates, numbers and text helpers                                     */
/* ------------------------------------------------------------------ */

function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(iso, amount) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
}

function diffDays(start, end) {
  return Math.round((parseISO(end) - parseISO(start)) / 86400000);
}

function formatMoney(value, options = {}) {
  const currency = state.settings.currency || 'USD';
  const config = options.compact
    ? { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }
    : { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat(undefined, config).format(Number.isFinite(value) ? value : 0);
  } catch (error) {
    return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  }
}

function currencySymbol() {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: state.settings.currency || 'USD'
    }).formatToParts(0);
    const found = parts.find((part) => part.type === 'currency');
    return found ? found.value : '$';
  } catch (error) {
    return '$';
  }
}

function formatRange(start, end) {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startText = startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  const endText = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startText} \u2013 ${endText}`;
}

function formatLongDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTableDate(iso) {
  const date = parseISO(iso);
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(undefined, options);
}

function plural(count, singular, pluralWord) {
  return count === 1 ? singular : pluralWord || `${singular}s`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[0][0];
}

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* Persistence and demo data                                           */
/* ------------------------------------------------------------------ */

function normalizeSale(input) {
  if (!input || typeof input !== 'object') return null;
  const amount = Number(input.amount);
  const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : '';
  const product = typeof input.product === 'string' ? input.product.trim().slice(0, 80) : '';
  if (!Number.isFinite(amount) || amount <= 0 || !date || !product) return null;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid(),
    date,
    amount: Math.round(amount * 100) / 100,
    product,
    customer: typeof input.customer === 'string' ? input.customer.trim().slice(0, 80) : '',
    payment: PAYMENTS.includes(input.payment) ? input.payment : 'Other',
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) : '',
    demo: Boolean(input.demo),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    const sales = Array.isArray(parsed.sales) ? parsed.sales.map(normalizeSale).filter(Boolean) : [];
    const settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
    const businessName = typeof settings.businessName === 'string' && settings.businessName.trim()
      ? settings.businessName.trim().slice(0, 40)
      : 'Big Pickle';
    return {
      sales,
      settings: {
        businessName,
        currency: CURRENCY_CODES.includes(settings.currency) ? settings.currency : 'USD',
        period: PERIODS.includes(String(settings.period)) ? String(settings.period) : '30'
      }
    };
  } catch (error) {
    console.warn('Could not read saved sales.', error);
    return createInitialState();
  }
}

function createInitialState() {
  return {
    sales: generateDemoSales(36),
    settings: { businessName: 'Big Pickle', currency: 'USD', period: '30' }
  };
}

function generateDemoSales(days) {
  const sales = [];
  const today = toISO(new Date());
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const weekday = parseISO(date).getDay();
    let count = Math.random() < 0.2 ? 0 : Math.random() < 0.56 ? 1 : Math.random() < 0.87 ? 2 : 3;
    if (offset === 0 && count === 0) count = 2;
    if ((weekday === 0 || weekday === 6) && Math.random() < 0.45) count += 1;
    for (let index = 0; index < count; index += 1) {
      const product = pick(DEMO_PRODUCTS);
      const base = product.min + Math.random() * (product.max - product.min);
      const ending = pick([0, 0.25, 0.5, 0.95, 0.99]);
      const amount = Math.max(1, Math.round(base) + ending);
      const customer = Math.random() < 0.42 ? '' : pick(DEMO_CUSTOMERS);
      const payment = pickWeighted([['Card', 55], ['Cash', 25], ['Bank transfer', 15], ['Other', 5]]);
      const notes = Math.random() < 0.12
        ? pick(['Repeat customer', 'Gift order', 'Local pickup', 'Bulk order', 'Left a nice review'])
        : '';
      sales.push(normalizeSale({
        id: uid(),
        date,
        amount: Math.round(amount * 100) / 100,
        product: product.name,
        customer,
        payment,
        notes,
        demo: true,
        createdAt: new Date().toISOString()
      }));
    }
  }
  return sales.filter(Boolean);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings, sales: state.sales }));
  } catch (error) {
    console.warn('Could not save sales.', error);
  }
}

/* ------------------------------------------------------------------ */
/* Filtering helpers                                                   */
/* ------------------------------------------------------------------ */

function getRange() {
  const today = toISO(new Date());
  const value = els.periodSelect ? els.periodSelect.value : state.settings.period;
  if (value === 'all') {
    const dates = state.sales.map((sale) => sale.date).sort();
    return {
      start: dates[0] || today,
      end: today,
      period: 'all',
      days: dates.length ? diffDays(dates[0], today) + 1 : 1
    };
  }
  const days = Number(value) || 30;
  return { start: addDays(today, -(days - 1)), end: today, period: String(days), days };
}

function salesInRange(start, end) {
  return state.sales.filter((sale) => sale.date >= start && sale.date <= end);
}

function sumSales(sales) {
  return sales.reduce((total, sale) => total + sale.amount, 0);
}

function matchesFilters(sale, query, payment) {
  if (payment !== 'all' && sale.payment !== payment) return false;
  if (!query) return true;
  const haystack = [sale.product, sale.customer, sale.notes, sale.payment, sale.date, sale.amount.toFixed(2)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function getPeriodSales(range) {
  return salesInRange(range.start, range.end)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function getFilteredSales(range) {
  const query = els.searchInput ? els.searchInput.value.trim().toLowerCase() : '';
  const payment = els.paymentFilter ? els.paymentFilter.value : 'all';
  return getPeriodSales(range).filter((sale) => matchesFilters(sale, query, payment));
}

/* ------------------------------------------------------------------ */
/* Startup and events                                                  */
/* ------------------------------------------------------------------ */

function cacheElements() {
  const ids = [
    'brandName', 'footerBrand', 'periodSelect', 'exportBtn', 'settingsBtn', 'addSaleBtn',
    'demoBanner', 'demoBannerText', 'clearDemoBtn', 'dismissDemoBtn', 'periodLabel',
    'kpiRevenue', 'kpiSales', 'kpiAvg', 'kpiToday', 'todayCount',
    'deltaRevenue', 'deltaRevenueNote', 'deltaSales', 'deltaSalesNote',
    'deltaAvg', 'deltaAvgNote', 'deltaToday',
    'chart', 'chartSubtitle', 'chartTotal', 'productBreakdown',
    'salesCountLabel', 'searchInput', 'paymentFilter', 'salesTable', 'salesBody',
    'emptyState', 'emptyTitle', 'emptyText', 'emptyAddBtn', 'emptyClearBtn', 'emptyAllBtn',
    'saleDialog', 'saleForm', 'saleAmount', 'saleDate', 'salePayment', 'saleProduct',
    'saleCustomer', 'saleNotes', 'saleError', 'amountCurrency', 'productOptions',
    'settingsDialog', 'settingsForm', 'businessNameInput', 'currencyInput',
    'settingsExportBtn', 'loadDemoBtn', 'deleteAllBtn', 'toastRegion'
  ];
  els = {};
  ids.forEach((id) => { els[id] = document.getElementById(id); });
}

function init() {
  const loaded = loadState();
  state.sales = loaded.sales;
  state.settings = loaded.settings;

  cacheElements();
  els.periodSelect.value = state.settings.period;
  els.amountCurrency.textContent = currencySymbol();

  els.periodSelect.addEventListener('change', () => {
    state.settings.period = els.periodSelect.value;
    persist();
    renderAll();
  });
  els.addSaleBtn.addEventListener('click', openSaleDialog);
  els.emptyAddBtn.addEventListener('click', openSaleDialog);
  els.exportBtn.addEventListener('click', () => exportCsv(false));
  els.settingsBtn.addEventListener('click', openSettingsDialog);

  els.clearDemoBtn.addEventListener('click', clearDemoSales);
  els.dismissDemoBtn.addEventListener('click', () => {
    demoBannerDismissed = true;
    renderDemoBanner();
  });

  els.searchInput.addEventListener('input', () => renderTable(getRange()));
  els.paymentFilter.addEventListener('change', () => renderTable(getRange()));
  els.emptyClearBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.paymentFilter.value = 'all';
    renderTable(getRange());
  });
  els.emptyAllBtn.addEventListener('click', () => {
    els.periodSelect.value = 'all';
    state.settings.period = 'all';
    persist();
    renderAll();
  });

  els.saleForm.addEventListener('submit', handleSaleSubmit);
  els.settingsForm.addEventListener('submit', handleSettingsSubmit);
  els.settingsExportBtn.addEventListener('click', () => {
    els.settingsDialog.close();
    exportCsv(true);
  });
  els.loadDemoBtn.addEventListener('click', () => {
    const demo = generateDemoSales(36);
    state.sales.push(...demo);
    demoBannerDismissed = false;
    persist();
    els.settingsDialog.close();
    renderAll();
    toast(`Added ${demo.length} sample ${plural(demo.length, 'sale')}.`);
  });
  els.deleteAllBtn.addEventListener('click', deleteAllSales);

  els.salesBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete]');
    if (button) deleteSale(button.dataset.delete);
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = button.closest('dialog');
      if (dialog) dialog.close();
    });
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
      if (clickedOutside) dialog.close();
    });
  });

  renderAll();
  persist();
}

function openSaleDialog() {
  const today = toISO(new Date());
  els.saleForm.reset();
  els.saleDate.value = today;
  els.saleDate.max = today;
  els.salePayment.value = 'Card';
  els.amountCurrency.textContent = currencySymbol();
  els.saleError.hidden = true;
  els.saleError.textContent = '';
  populateProductOptions();
  els.saleDialog.showModal();
  window.setTimeout(() => els.saleAmount.focus(), 40);
}

function showSaleError(message, field) {
  els.saleError.textContent = message;
  els.saleError.hidden = false;
  if (field) field.focus();
}

function handleSaleSubmit(event) {
  event.preventDefault();
  els.saleError.hidden = true;

  const amount = Number(els.saleAmount.value);
  const date = els.saleDate.value;
  const product = els.saleProduct.value.trim();
  const today = toISO(new Date());

  if (!Number.isFinite(amount) || amount <= 0) {
    showSaleError('Enter an amount greater than zero.', els.saleAmount);
    return;
  }
  if (!date) {
    showSaleError('Choose a date for this sale.', els.saleDate);
    return;
  }
  if (date > today) {
    showSaleError('The date cannot be in the future.', els.saleDate);
    return;
  }
  if (!product) {
    showSaleError('Add a product or service name.', els.saleProduct);
    return;
  }

  const sale = normalizeSale({
    date,
    amount,
    product,
    customer: els.saleCustomer.value,
    payment: els.salePayment.value,
    notes: els.saleNotes.value,
    demo: false,
    createdAt: new Date().toISOString()
  });
  if (!sale) {
    showSaleError('Check the sale details and try again.', els.saleAmount);
    return;
  }

  state.sales.push(sale);
  persist();
  els.saleDialog.close();
  renderAll();

  const message = `Sale added: ${sale.product} \u00b7 ${formatMoney(sale.amount)}`;
  const range = getRange();
  if (sale.date < range.start && range.period !== 'all') {
    toast(message, {
      actionLabel: 'View all',
      onAction: () => {
        els.periodSelect.value = 'all';
        state.settings.period = 'all';
        persist();
        renderAll();
      }
    });
  } else {
    toast(message);
  }
}

function openSettingsDialog() {
  els.businessNameInput.value = state.settings.businessName;
  els.currencyInput.value = state.settings.currency;
  els.settingsDialog.showModal();
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  const name = els.businessNameInput.value.trim() || 'Your business';
  const currency = CURRENCY_CODES.includes(els.currencyInput.value) ? els.currencyInput.value : 'USD';
  state.settings.businessName = name.slice(0, 40);
  state.settings.currency = currency;
  persist();
  els.settingsDialog.close();
  renderAll();
  toast('Settings saved.');
}

function clearDemoSales() {
  const before = state.sales.length;
  state.sales = state.sales.filter((sale) => !sale.demo);
  const removed = before - state.sales.length;
  if (!removed) {
    toast('There are no sample sales to clear.');
    return;
  }
  persist();
  renderAll();
  toast(`Cleared ${removed} sample ${plural(removed, 'sale')}.`);
}

function deleteAllSales() {
  if (!state.sales.length) {
    toast('There are no sales to delete.');
    return;
  }
  if (!window.confirm('Delete all sales? This cannot be undone.')) return;
  state.sales = [];
  persist();
  els.settingsDialog.close();
  renderAll();
  toast('All sales deleted.');
}

function deleteSale(id) {
  const index = state.sales.findIndex((sale) => sale.id === id);
  if (index === -1) return;
  const [sale] = state.sales.splice(index, 1);
  persist();
  renderAll();
  toast(`Deleted ${sale.product} \u00b7 ${formatMoney(sale.amount)}`, {
    actionLabel: 'Undo',
    onAction: () => {
      state.sales.push(sale);
      persist();
      renderAll();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderAll() {
  document.title = `${state.settings.businessName} \u00b7 Sales dashboard`;
  els.brandName.textContent = state.settings.businessName;
  els.brandName.title = state.settings.businessName;
  els.footerBrand.textContent = state.settings.businessName;
  els.amountCurrency.textContent = currencySymbol();

  const range = getRange();
  renderPeriodLabel(range);
  renderKpis(range);
  renderChart(range);
  renderProducts(range);
  renderTable(range);
  renderDemoBanner();
  populateProductOptions();
}

function renderPeriodLabel(range) {
  const selected = els.periodSelect.selectedOptions[0]
    ? els.periodSelect.selectedOptions[0].textContent
    : 'Last 30 days';
  if (range.period === 'all') {
    if (!state.sales.length) {
      els.periodLabel.textContent = 'All time \u00b7 no sales yet';
    } else {
      const startText = parseISO(range.start).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      els.periodLabel.textContent = `All time \u00b7 since ${startText}`;
    }
    return;
  }
  els.periodLabel.textContent = `${selected} \u00b7 ${formatRange(range.start, range.end)}`;
}

function setDelta(chip, note, current, previous, noteText) {
  chip.hidden = false;
  if (previous <= 0) {
    if (current <= 0) {
      chip.textContent = '0%';
      chip.className = 'delta flat';
    } else {
      chip.textContent = 'New';
      chip.className = 'delta up';
    }
  } else {
    const change = ((current - previous) / previous) * 100;
    const rounded = Math.abs(change) >= 100 ? Math.round(change) : Math.round(change * 10) / 10;
    if (change > 0.05) {
      chip.textContent = `\u25b2 ${Math.abs(rounded)}%`;
      chip.className = 'delta up';
    } else if (change < -0.05) {
      chip.textContent = `\u25bc ${Math.abs(rounded)}%`;
      chip.className = 'delta down';
    } else {
      chip.textContent = '0%';
      chip.className = 'delta flat';
    }
  }
  if (note) note.textContent = noteText;
}

function renderKpis(range) {
  const current = salesInRange(range.start, range.end);
  const revenue = sumSales(current);
  const count = current.length;
  const average = count ? revenue / count : 0;

  els.kpiRevenue.textContent = formatMoney(revenue);
  els.kpiSales.textContent = count.toLocaleString();
  els.kpiAvg.textContent = formatMoney(average);

  const today = toISO(new Date());
  const todaySales = state.sales.filter((sale) => sale.date === today);
  const todayRevenue = sumSales(todaySales);
  const yesterdayRevenue = sumSales(state.sales.filter((sale) => sale.date === addDays(today, -1)));
  els.kpiToday.textContent = formatMoney(todayRevenue);
  els.todayCount.textContent = `${todaySales.length} ${plural(todaySales.length, 'sale')}`;
  setDelta(els.deltaToday, null, todayRevenue, yesterdayRevenue, 'vs yesterday');

  if (range.period === 'all') {
    [els.deltaRevenue, els.deltaSales, els.deltaAvg].forEach((chip) => { chip.hidden = true; });
    els.deltaRevenueNote.textContent = 'All time view';
    els.deltaSalesNote.textContent = 'All time view';
    els.deltaAvgNote.textContent = 'All time view';
    return;
  }

  const previousEnd = addDays(range.start, -1);
  const previousStart = addDays(previousEnd, -(range.days - 1));
  const previous = salesInRange(previousStart, previousEnd);
  const previousRevenue = sumSales(previous);
  const previousCount = previous.length;
  const previousAverage = previousCount ? previousRevenue / previousCount : 0;
  const note = `vs previous ${range.days} days`;

  setDelta(els.deltaRevenue, els.deltaRevenueNote, revenue, previousRevenue, note);
  setDelta(els.deltaSales, els.deltaSalesNote, count, previousCount, note);
  setDelta(els.deltaAvg, els.deltaAvgNote, average, previousAverage, note);
}

function bucketLabel(start, unit, span) {
  const date = parseISO(start);
  if (unit === 'day') {
    return span <= 7
      ? date.toLocaleDateString(undefined, { weekday: 'short' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (unit === 'week') return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (unit === 'month') return date.toLocaleDateString(undefined, { month: 'short' });
  return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function bucketFullLabel(start, end, unit) {
  if (unit === 'day') return formatLongDate(start);
  if (unit === 'week') {
    const startText = parseISO(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endText = parseISO(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startText} \u2013 ${endText}`;
  }
  if (unit === 'month') {
    return parseISO(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return `Q${Math.floor(parseISO(start).getMonth() / 3) + 1} ${parseISO(start).getFullYear()}`;
}

function buildBuckets(range, sales) {
  const span = diffDays(range.start, range.end) + 1;
  const unit = span <= 31 ? 'day' : span <= 126 ? 'week' : span <= 800 ? 'month' : 'quarter';
  const buckets = [];
  let cursor = range.start;

  if (unit === 'day') {
    while (cursor <= range.end) {
      buckets.push({ start: cursor, end: cursor, label: '', full: '', value: 0, count: 0 });
      cursor = addDays(cursor, 1);
    }
  } else if (unit === 'week') {
    while (cursor <= range.end) {
      let end = addDays(cursor, 6);
      if (end > range.end) end = range.end;
      buckets.push({ start: cursor, end, label: '', full: '', value: 0, count: 0 });
      cursor = addDays(end, 1);
    }
  } else if (unit === 'month') {
    while (cursor <= range.end) {
      const date = parseISO(cursor);
      const monthEnd = toISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      const end = monthEnd > range.end ? range.end : monthEnd;
      buckets.push({ start: cursor, end, label: '', full: '', value: 0, count: 0 });
      cursor = addDays(end, 1);
    }
  } else {
    while (cursor <= range.end) {
      const date = parseISO(cursor);
      const quarter = Math.floor(date.getMonth() / 3);
      const quarterEnd = toISO(new Date(date.getFullYear(), quarter * 3 + 3, 0));
      const end = quarterEnd > range.end ? range.end : quarterEnd;
      buckets.push({ start: cursor, end, label: '', full: '', value: 0, count: 0 });
      cursor = addDays(end, 1);
    }
  }

  buckets.forEach((bucket) => {
    bucket.label = bucketLabel(bucket.start, unit, span);
    bucket.full = bucketFullLabel(bucket.start, bucket.end, unit);
  });

  sales.forEach((sale) => {
    const bucket = buckets.find((item) => sale.date >= item.start && sale.date <= item.end);
    if (bucket) {
      bucket.value += sale.amount;
      bucket.count += 1;
    }
  });

  return { buckets, unit };
}

function niceCeiling(value) {
  if (!(value > 0)) return 0;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let nice;
  if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 2.5) nice = 2.5;
  else if (fraction <= 5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exponent);
}

function renderChart(range) {
  const sales = salesInRange(range.start, range.end);
  const total = sumSales(sales);
  const built = buildBuckets(range, sales);
  const labels = { day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly' };

  els.chartTotal.textContent = formatMoney(total);
  els.chartSubtitle.textContent = `${labels[built.unit]} revenue`;

  if (!built.buckets.length || total <= 0) {
    els.chart.innerHTML = '<div class="chart-empty">No sales in this period</div>';
    els.chart.setAttribute('aria-label', 'No sales in this period');
    return;
  }

  const ceiling = niceCeiling(Math.max(...built.buckets.map((bucket) => bucket.value))) || 1;
  const yLabels = [ceiling, ceiling / 2, 0]
    .map((value) => `<span>${escapeHtml(formatMoney(value, { compact: true }))}</span>`)
    .join('');
  const labelEvery = Math.max(1, Math.ceil(built.buckets.length / 8));

  const bars = built.buckets.map((bucket, index) => {
    const showLabel = index % labelEvery === 0 || index === built.buckets.length - 1;
    const height = bucket.value > 0 ? Math.max((bucket.value / ceiling) * 100, 1.2) : 0;
    const countText = `${bucket.count} ${plural(bucket.count, 'sale')}`;
    const aria = `${bucket.full}: ${formatMoney(bucket.value)}, ${countText}`;
    return `<div class="chart-col" tabindex="0" role="img" aria-label="${escapeHtml(aria)}">
      <div class="chart-bar${bucket.value > 0 ? '' : ' is-zero'}" style="height:${height.toFixed(2)}%">
        <span class="chart-tip"><strong>${escapeHtml(formatMoney(bucket.value))}</strong><span>${escapeHtml(bucket.full)}</span></span>
      </div>
      <span class="chart-label">${showLabel ? escapeHtml(bucket.label) : ''}</span>
    </div>`;
  }).join('');

  els.chart.innerHTML = `<div class="chart-y" aria-hidden="true">${yLabels}</div>
    <div class="chart-area">
      <div class="chart-grid" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="chart-bars">${bars}</div>
    </div>`;
  els.chart.setAttribute('aria-label', `Revenue chart, ${formatMoney(total)} total`);
}

function renderProducts(range) {
  const sales = salesInRange(range.start, range.end);
  const products = new Map();
  sales.forEach((sale) => {
    const entry = products.get(sale.product) || { revenue: 0, count: 0 };
    entry.revenue += sale.amount;
    entry.count += 1;
    products.set(sale.product, entry);
  });

  const list = Array.from(products.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  if (!list.length) {
    els.productBreakdown.innerHTML = '<div class="mini-empty">No sales in this period yet.</div>';
    return;
  }

  const max = list[0][1].revenue || 1;
  els.productBreakdown.innerHTML = list.map(([name, data]) => {
    const width = Math.max(4, (data.revenue / max) * 100);
    return `<div class="product-row">
      <div class="product-top">
        <span class="product-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="product-value">${escapeHtml(formatMoney(data.revenue))}</span>
      </div>
      <div class="product-meta">
        <div class="product-bar"><span style="width:${width.toFixed(1)}%"></span></div>
        <span class="product-count">${data.count} ${plural(data.count, 'sale')}</span>
      </div>
    </div>`;
  }).join('');
}

const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></svg>';

function colorFor(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return PRODUCT_COLORS[Math.abs(hash) % PRODUCT_COLORS.length];
}

function paymentClass(payment) {
  if (payment === 'Card') return 'card';
  if (payment === 'Cash') return 'cash';
  if (payment === 'Bank transfer') return 'bank';
  return 'other';
}

function saleRow(sale) {
  const customer = sale.customer
    ? escapeHtml(sale.customer)
    : '<span class="walkin">Walk-in</span>';
  return `<tr>
    <td class="cell-date">${escapeHtml(formatTableDate(sale.date))}</td>
    <td class="cell-product"><span class="name"><span class="product-dot" style="background:${colorFor(sale.product)}"></span><span title="${escapeHtml(sale.product)}">${escapeHtml(sale.product)}</span></span></td>
    <td class="cell-customer">${customer}</td>
    <td><span class="pill pill--${paymentClass(sale.payment)}">${escapeHtml(sale.payment)}</span></td>
    <td class="num">${escapeHtml(formatMoney(sale.amount))}</td>
    <td class="row-actions"><button type="button" class="icon-btn danger" data-delete="${escapeHtml(sale.id)}" aria-label="Delete sale of ${escapeHtml(sale.product)}">${TRASH_ICON}</button></td>
  </tr>`;
}

function renderTable(range) {
  const periodSales = getPeriodSales(range);
  const query = els.searchInput.value.trim().toLowerCase();
  const payment = els.paymentFilter.value;
  const filtered = periodSales.filter((sale) => matchesFilters(sale, query, payment));
  const filteredTotal = sumSales(filtered);

  els.salesBody.innerHTML = filtered.map(saleRow).join('');
  els.salesTable.hidden = filtered.length === 0;
  els.emptyState.hidden = filtered.length > 0;

  if (filtered.length === periodSales.length) {
    els.salesCountLabel.textContent = `${periodSales.length} ${plural(periodSales.length, 'sale')} \u00b7 ${formatMoney(filteredTotal)}`;
  } else {
    els.salesCountLabel.textContent = `${filtered.length} of ${periodSales.length} sales \u00b7 ${formatMoney(filteredTotal)}`;
  }

  if (!filtered.length) {
    const filterActive = Boolean(query) || payment !== 'all';
    els.emptyAddBtn.hidden = filterActive;
    els.emptyClearBtn.hidden = !filterActive;
    els.emptyAllBtn.hidden = true;

    if (filterActive) {
      els.emptyTitle.textContent = 'No matching sales';
      els.emptyText.textContent = 'Try a different search term or payment method.';
    } else if (state.sales.length && range.period !== 'all') {
      els.emptyTitle.textContent = 'No sales in this period';
      els.emptyText.textContent = 'Try a wider time range, or add a sale for this period.';
      els.emptyAllBtn.hidden = false;
    } else {
      els.emptyTitle.textContent = 'No sales yet';
      els.emptyText.textContent = 'Record your first sale to start seeing totals, trends and top products.';
    }
  }
}

function renderDemoBanner() {
  const demoCount = state.sales.filter((sale) => sale.demo).length;
  const show = demoCount > 0 && !demoBannerDismissed;
  els.demoBanner.hidden = !show;
  if (show) {
    const verb = demoCount === 1 ? 'is' : 'are';
    els.demoBannerText.textContent = `${demoCount} sample ${plural(demoCount, 'sale')} ${verb} mixed into this dashboard. Clear them when you are ready.`;
  }
}

function populateProductOptions() {
  const names = Array.from(new Set(state.sales.map((sale) => sale.product)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 60);
  els.productOptions.innerHTML = names
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join('');
}

/* ------------------------------------------------------------------ */
/* Export and notifications                                            */
/* ------------------------------------------------------------------ */

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'business';
}

function exportCsv(allSales) {
  let rows;
  if (allSales) {
    rows = state.sales.slice();
  } else {
    rows = getFilteredSales(getRange());
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));

  if (!rows.length) {
    toast('No sales to export.');
    return;
  }

  const header = ['Date', 'Product', 'Customer', 'Payment', 'Amount', 'Notes'];
  const lines = [header].concat(rows.map((sale) => [
    sale.date,
    sale.product,
    sale.customer,
    sale.payment,
    sale.amount.toFixed(2),
    sale.notes
  ])).map((row) => row.map(csvEscape).join(','));

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(state.settings.businessName)}-sales-${toISO(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`Exported ${rows.length} ${plural(rows.length, 'sale')} to CSV.`);
}

function toast(message, options = {}) {
  const element = document.createElement('div');
  element.className = 'toast';

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  element.appendChild(text);

  let timer = null;
  const remove = () => {
    if (element.dataset.closing) return;
    element.dataset.closing = 'true';
    if (timer) window.clearTimeout(timer);
    element.classList.remove('show');
    window.setTimeout(() => element.remove(), 240);
  };

  if (options.actionLabel && typeof options.onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = options.actionLabel;
    action.addEventListener('click', () => {
      remove();
      options.onAction();
    });
    element.appendChild(action);
  }

  els.toastRegion.appendChild(element);
  window.requestAnimationFrame(() => element.classList.add('show'));
  timer = window.setTimeout(remove, options.duration || 6000);
}

init();
