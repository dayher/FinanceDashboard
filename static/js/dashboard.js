// State variables
let rawTransactions = [];
let transactions = [];
let rules = { categories: {} };
let manualOverrides = {};
let activeTab = 'tab-charts';

// Pagination state
let currentPage = 1;
const rowsPerPage = 20;

// Sorting state
let sortColumn = 'fecha_operacion';
let sortDirection = 'desc';

// Charts references
let chartBalance = null;
let chartMonthly = null;
let chartCategories = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// Load initial data
async function initApp() {
    loadManualOverrides();
    showLoadingState();
    
    try {
        // Fetch rules first
        const rulesResponse = await fetch('/api/rules');
        const rulesData = await rulesResponse.json();
        if (rulesData && rulesData.categories) {
            rules = rulesData;
        } else {
            console.warn('Formato de reglas inválido o vacío. Usando por defecto.');
        }

        // Fetch transactions
        const transResponse = await fetch('/api/data');
        const transData = await transResponse.json();
        
        if (transData.status === 'success') {
            rawTransactions = transData.data;
            processAndCategorize();
            populateFilterOptions();
            updateUI();
        } else {
            alert('Error al cargar datos: ' + transData.message);
        }
    } catch (err) {
        console.error('Error al inicializar la app:', err);
        alert('Error de conexión con el servidor.');
    }
}

// Set up UI listeners
function setupEventListeners() {
    // Tabs Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Save Rules Button
    document.getElementById('btn-save-rules').addEventListener('click', saveRulesToServer);

    // Search & Filter Listeners
    document.getElementById('search-input').addEventListener('input', () => { currentPage = 1; filterAndRenderTable(); });
    document.getElementById('filter-category').addEventListener('change', () => { currentPage = 1; filterAndRenderTable(); });
    document.getElementById('filter-type').addEventListener('change', () => { currentPage = 1; filterAndRenderTable(); });
    document.getElementById('filter-month').addEventListener('change', () => { currentPage = 1; filterAndRenderTable(); });
    document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);

    // Pagination Listeners
    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTablePage();
        }
    });
    document.getElementById('btn-next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(getFilteredTransactions().length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTablePage();
        }
    });

    // Table Header Sorts
    document.querySelectorAll('.transactions-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            handleSort(col);
        });
    });

    // Rules Management Listeners
    document.getElementById('btn-add-category').addEventListener('click', addNewCategory);
    
    // Modal Listeners
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-save-modal').addEventListener('click', saveManualOverride);
}

// Load manual overrides from localStorage
function loadManualOverrides() {
    const saved = localStorage.getItem('finance_manual_overrides');
    if (saved) {
        try {
            manualOverrides = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing manual overrides', e);
        }
    }
}

// Save manual overrides to localStorage
function saveManualOverrides() {
    localStorage.setItem('finance_manual_overrides', JSON.stringify(manualOverrides));
}

// Loading indicator
function showLoadingState() {
    document.getElementById('transactions-body').innerHTML = `
        <tr>
            <td colspan="6" class="text-center" style="padding: 3rem;">
                <div class="loading-spinner">Cargando transacciones...</div>
            </td>
        </tr>
    `;
}

// Categorization engine
function getCategoryForConcept(concept, id) {
    // 1. Check manual override first
    if (manualOverrides[id] !== undefined) {
        return manualOverrides[id];
    }
    
    const conceptLower = concept.toLowerCase();

    // 2. Run matchers for each category in order
    for (const [categoryName, matchers] of Object.entries(rules.categories)) {
        for (const matcher of matchers) {
            const val = matcher.value.toLowerCase();
            if (matcher.type === 'contains' && conceptLower.includes(val)) {
                return categoryName;
            } else if (matcher.type === 'starts_with' && conceptLower.startsWith(val)) {
                return categoryName;
            } else if (matcher.type === 'ends_with' && conceptLower.endsWith(val)) {
                return conceptLower.endsWith(val);
            } else if (matcher.type === 'equals' && conceptLower === val) {
                return categoryName;
            }
        }
    }

    return 'Sin categoría';
}

// Process and categorize transactions
function processAndCategorize() {
    transactions = rawTransactions.map(t => {
        const cat = getCategoryForConcept(t.concepto, t.id);
        return {
            ...t,
            category: cat
        };
    });
}

// Populate filters dropdowns
function populateFilterOptions() {
    // Categories dropdown
    const catSelect = document.getElementById('filter-category');
    // Save current selection
    const currentSel = catSelect.value;
    
    // Clear and rebuild options
    catSelect.innerHTML = '<option value="all">Todas las categorías</option><option value="Sin categoría">Sin categoría</option>';
    
    const categoriesList = Object.keys(rules.categories).sort();
    categoriesList.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
    });
    
    if (currentSel) {
        catSelect.value = currentSel;
    }

    // Months dropdown
    const monthSelect = document.getElementById('filter-month');
    const currentMonthSel = monthSelect.value;
    monthSelect.innerHTML = '<option value="all">Todos los meses</option>';

    // Group dates to find unique year-month
    const months = new Set();
    transactions.forEach(t => {
        const parts = t.fecha_operacion.split('/');
        if (parts.length === 3) {
            months.add(`${parts[2]}-${parts[1]}`); // YYYY-MM
        }
    });

    const sortedMonths = Array.from(months).sort().reverse();
    sortedMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        
        // Pretty print month name (Spanish)
        const [year, month] = m.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, 1);
        const name = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        
        monthSelect.appendChild(opt);
    });

    if (currentMonthSel) {
        monthSelect.value = currentMonthSel;
    }
}

// Update the entire user interface
function updateUI() {
    calculateKPIs();
    renderCharts();
    filterAndRenderTable();
    renderRulesTab();
}

// Calculate and render KPI Summary cards
function calculateKPIs() {
    let totalIncome = 0;
    let totalExpense = 0;
    
    transactions.forEach(t => {
        if (t.importe > 0) {
            totalIncome += t.importe;
        } else {
            totalExpense += t.importe;
        }
    });

    // Santander balances are descending, so transactions[0] is the latest chronological transaction.
    // Let's verify by sorting and getting the latest date balance.
    // If we parse dates:
    let latestTransaction = transactions[0];
    if (transactions.length > 0) {
        let maxDateObj = new Date(0);
        transactions.forEach(t => {
            const [d, m, y] = t.fecha_operacion.split('/');
            const dateObj = new Date(y, m - 1, d);
            if (dateObj > maxDateObj) {
                maxDateObj = dateObj;
                latestTransaction = t;
            }
        });
    }

    const currentBalance = latestTransaction ? latestTransaction.saldo : 0;
    
    // Savings calculation
    const netSavings = totalIncome + totalExpense; // totalExpense is negative
    let savingsRate = 0;
    if (totalIncome > 0) {
        savingsRate = (netSavings / totalIncome) * 100;
    }
    if (savingsRate < 0) savingsRate = 0; // limit visual rate

    // Update HTML
    document.getElementById('kpi-balance').textContent = formatCurrency(currentBalance);
    document.getElementById('kpi-income').textContent = formatCurrency(totalIncome);
    document.getElementById('kpi-expense').textContent = formatCurrency(Math.abs(totalExpense));
    document.getElementById('kpi-savings').textContent = `${savingsRate.toFixed(1)}%`;
    
    // Animate progress bar
    document.getElementById('kpi-savings-progress').style.width = `${Math.min(savingsRate, 100)}%`;
    
    // Change savings rate progress color based on value
    const progressEl = document.getElementById('kpi-savings-progress');
    if (savingsRate >= 30) {
        progressEl.style.backgroundColor = 'var(--accent-success)';
    } else if (savingsRate >= 10) {
        progressEl.style.backgroundColor = 'var(--accent-info)';
    } else {
        progressEl.style.backgroundColor = 'var(--accent-warning)';
    }
}

// Switch between tabs
function switchTab(tabId) {
    activeTab = tabId;
    
    // Toggle active classes on buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Toggle active panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    // If charts tab, trigger resize/updates to avoid layout issues with canvas
    if (tabId === 'tab-charts') {
        renderCharts();
    }
}

// Get clean category class name for styling badges
function getCategoryClassName(cat) {
    if (cat === 'Sin categoría') return 'uncategorized';
    
    const mapping = {
        'Nómina': 'cat-nomina',
        'Supermercado': 'cat-supermercado',
        'Ocio y Restauración': 'cat-ocio',
        'Bizum Enviado': 'cat-bizum-enviado',
        'Bizum Recibido': 'cat-bizum-recibido',
        'Inversiones': 'cat-inversiones',
        'Suscripciones y Formación': 'cat-suscripciones',
        'Compras': 'cat-compras',
        'Efectivo': 'cat-efectivo',
        'Deportes': 'cat-deportes'
    };
    
    return mapping[cat] || '';
}

// Get the transactions list filtered by current filter state
function getFilteredTransactions() {
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    const catVal = document.getElementById('filter-category').value;
    const typeVal = document.getElementById('filter-type').value;
    const monthVal = document.getElementById('filter-month').value;

    return transactions.filter(t => {
        // Text search (concept or category)
        const matchesSearch = !searchVal || 
            t.concepto.toLowerCase().includes(searchVal) || 
            t.category.toLowerCase().includes(searchVal);

        // Category filter
        const matchesCategory = catVal === 'all' || t.category === catVal;

        // Type filter (income vs expense)
        let matchesType = true;
        if (typeVal === 'income') matchesType = t.importe > 0;
        if (typeVal === 'expense') matchesType = t.importe < 0;

        // Month filter
        let matchesMonth = true;
        if (monthVal !== 'all') {
            const parts = t.fecha_operacion.split('/');
            if (parts.length === 3) {
                const ym = `${parts[2]}-${parts[1]}`;
                matchesMonth = ym === monthVal;
            }
        }

        return matchesSearch && matchesCategory && matchesType && matchesMonth;
    });
}

// Filter and re-render transaction table with sorting
function filterAndRenderTable() {
    let list = getFilteredTransactions();
    
    // Sort transactions
    list.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];
        
        // Date sorting needs conversion
        if (sortColumn === 'fecha_operacion') {
            const [da, ma, ya] = a.fecha_operacion.split('/');
            const [db, mb, yb] = b.fecha_operacion.split('/');
            valA = new Date(ya, ma - 1, da).getTime();
            valB = new Date(yb, mb - 1, db).getTime();
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    document.getElementById('transaction-count').textContent = transactions.length;
    document.getElementById('filtered-info').textContent = `Mostrando ${list.length} de ${transactions.length} transacciones`;
    
    // Calculate total pages
    const totalPages = Math.max(1, Math.ceil(list.length / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    // Enable/disable page buttons
    document.getElementById('btn-prev-page').disabled = currentPage === 1;
    document.getElementById('btn-next-page').disabled = currentPage === totalPages;
    document.getElementById('page-indicator').textContent = `Página ${currentPage} de ${totalPages}`;
    
    renderTablePage(list);
}

// Render the specific page slice of sorted/filtered transactions
function renderTablePage(list) {
    if (!list) list = getFilteredTransactions();
    
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';
    
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted" style="padding: 2rem;">
                    No se encontraron transacciones con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, list.length);
    const pageItems = list.slice(startIndex, endIndex);

    pageItems.forEach(t => {
        const tr = document.createElement('tr');
        
        const isExpense = t.importe < 0;
        const amtClass = isExpense ? 'text-danger' : 'text-success';
        const amtSign = isExpense ? '' : '+';
        const catClass = getCategoryClassName(t.category);
        
        tr.innerHTML = `
            <td>${t.fecha_operacion}</td>
            <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.concepto}">
                ${t.concepto}
            </td>
            <td class="text-right ${amtClass} font-semibold">${amtSign}${formatCurrency(t.importe)}</td>
            <td class="text-right text-muted">${formatCurrency(t.saldo)}</td>
            <td>
                <span class="category-badge ${catClass}">${t.category}</span>
            </td>
            <td class="text-center">
                <button class="btn-icon-only edit-cat-btn" data-id="${t.id}" title="Reasignar categoría">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
                </button>
            </td>
        `;

        // Add override event listener
        tr.querySelector('.edit-cat-btn').addEventListener('click', () => {
            openOverrideModal(t.id, t.concepto, t.category);
        });

        tbody.appendChild(tr);
    });
}

// Handle sorting column headers
function handleSort(col) {
    if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = col;
        sortDirection = 'desc';
    }

    // Toggle arrow graphics in table headers
    document.querySelectorAll('.transactions-table th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.getAttribute('data-sort') === sortColumn) {
            th.classList.add(sortDirection);
        }
    });

    filterAndRenderTable();
}

// Clear all active filter selectors
function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('filter-type').value = 'all';
    document.getElementById('filter-month').value = 'all';
    currentPage = 1;
    filterAndRenderTable();
}

// Open override modal
let currentOverrideId = null;
function openOverrideModal(id, concept, currentCategory) {
    currentOverrideId = id;
    document.getElementById('modal-transaction-concept').textContent = concept;
    
    const select = document.getElementById('modal-select-category');
    select.innerHTML = '<option value="Sin categoría">Sin categoría</option>';
    
    Object.keys(rules.categories).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });
    
    select.value = currentCategory;
    
    document.getElementById('override-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('override-modal').classList.remove('active');
    currentOverrideId = null;
}

// Save manual category override
function saveManualOverride() {
    if (currentOverrideId !== null) {
        const newCat = document.getElementById('modal-select-category').value;
        manualOverrides[currentOverrideId] = newCat;
        saveManualOverrides();
        
        // Re-categorize and update
        processAndCategorize();
        updateUI();
        
        closeModal();
    }
}

// Render rules layout view
function renderRulesTab() {
    const container = document.getElementById('rules-container');
    container.innerHTML = '';

    // Sort categories alphabetically
    const categoriesList = Object.keys(rules.categories).sort();

    if (categoriesList.length === 0) {
        container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">No hay categorías definidas. Crea una para comenzar.</div>`;
        return;
    }

    categoriesList.forEach(catName => {
        const catBox = document.createElement('div');
        catBox.className = 'category-rules-box';
        
        const catClass = getCategoryClassName(catName);
        const matchers = rules.categories[catName] || [];

        // Build HTML for rule list item
        let matchersHtml = '';
        if (matchers.length === 0) {
            matchersHtml = `<div class="text-muted" style="font-size: 0.8rem; font-style: italic;">Sin reglas. Clasificación solo manual.</div>`;
        } else {
            matchersHtml = matchers.map((matcher, idx) => `
                <div class="rule-item-row">
                    <span class="rule-type-badge">${matcher.type}</span>
                    <span class="rule-val-badge">"${matcher.value}"</span>
                    <button class="btn-icon-only btn-delete-rule" data-cat="${catName}" data-idx="${idx}" title="Eliminar regla" style="margin-left: auto;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `).join('');
        }

        catBox.innerHTML = `
            <div class="category-box-header">
                <div class="category-title-area">
                    <span class="category-badge ${catClass}" style="font-size: 0.9rem;">${catName}</span>
                </div>
                <button class="btn-icon-only btn-delete-category" data-cat="${catName}" title="Eliminar categoría entera">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-danger);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
            
            <div class="rules-sublist">
                ${matchersHtml}
            </div>
            
            <!-- Inline Form to Add Rule Matcher -->
            <div class="rule-adder-row">
                <select class="add-rule-type" data-cat="${catName}">
                    <option value="contains">contiene</option>
                    <option value="starts_with">empieza con</option>
                    <option value="equals">es igual a</option>
                </select>
                <input type="text" class="add-rule-value" data-cat="${catName}" placeholder="texto a buscar...">
                <button class="btn btn-primary btn-sm btn-add-rule" data-cat="${catName}">
                    Añadir
                </button>
            </div>
        `;

        // Event listeners inside rule category box
        catBox.querySelector('.btn-delete-category').addEventListener('click', () => {
            deleteCategory(catName);
        });

        catBox.querySelectorAll('.btn-delete-rule').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = btn.getAttribute('data-cat');
                const idx = parseInt(btn.getAttribute('data-idx'));
                deleteRule(cat, idx);
            });
        });

        catBox.querySelector('.btn-add-rule').addEventListener('click', () => {
            const cat = catName;
            const type = catBox.querySelector(`.add-rule-type[data-cat="${cat}"]`).value;
            const value = catBox.querySelector(`.add-rule-value[data-cat="${cat}"]`).value.trim();
            if (value) {
                addRule(cat, type, value);
            } else {
                alert('Escribe una palabra clave o valor.');
            }
        });

        // Enter key support in input
        catBox.querySelector('.add-rule-value').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                catBox.querySelector('.btn-add-rule').click();
            }
        });

        container.appendChild(catBox);
    });
}

// Add new empty category
function addNewCategory() {
    const name = prompt('Escribe el nombre de la nueva categoría:');
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    if (rules.categories[cleanName]) {
        alert('Esa categoría ya existe.');
        return;
    }

    rules.categories[cleanName] = [];
    
    // Refresh
    processAndCategorize();
    populateFilterOptions();
    updateUI();
    markRulesModified();
}

// Delete category
function deleteCategory(catName) {
    if (confirm(`¿Seguro que deseas eliminar la categoría "${catName}" y todas sus reglas? Las transacciones clasificadas volverán a 'Sin categoría'.`)) {
        delete rules.categories[catName];
        
        // Clean up manual overrides of this category too
        for (const [id, val] of Object.entries(manualOverrides)) {
            if (val === catName) {
                delete manualOverrides[id];
            }
        }
        saveManualOverrides();
        
        processAndCategorize();
        populateFilterOptions();
        updateUI();
        markRulesModified();
    }
}

// Add matcher rule to category
function addRule(catName, type, value) {
    rules.categories[catName].push({ type, value });
    
    processAndCategorize();
    updateUI();
    markRulesModified();
}

// Delete rule from category
function deleteRule(catName, index) {
    rules.categories[catName].splice(index, 1);
    
    processAndCategorize();
    updateUI();
    markRulesModified();
}

// Visual status for modified rules
function markRulesModified() {
    const badge = document.getElementById('rules-status');
    badge.textContent = 'Cambios sin guardar';
    badge.className = 'status-badge warning';
}

function markRulesSaved() {
    const badge = document.getElementById('rules-status');
    badge.textContent = 'Reglas guardadas';
    badge.className = 'status-badge success';
}

// Save rules back to Disk (Flask endpoint)
async function saveRulesToServer() {
    const btn = document.getElementById('btn-save-rules');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    
    try {
        const response = await fetch('/api/rules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rules)
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            markRulesSaved();
            alert('Reglas guardadas correctamente en config.json.');
        } else {
            alert('Error al guardar en el servidor: ' + result.message);
        }
    } catch (e) {
        console.error(e);
        alert('Error al guardar las reglas en config.json. Comprueba la consola.');
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
}

// Format number to EUR Currency format
function formatCurrency(val) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
}

// Toggle light/dark themes
function toggleTheme() {
    const body = document.body;
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
        localStorage.setItem('finance_theme', 'light');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
        localStorage.setItem('finance_theme', 'dark');
    }
    
    // Re-render charts to adjust text colors
    renderCharts();
}

// Load saved theme on boot
(function loadTheme() {
    const savedTheme = localStorage.getItem('finance_theme');
    // Dark mode is default, only need to change if light is saved
    if (savedTheme === 'light') {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            document.getElementById('theme-icon-sun').classList.remove('hidden');
            document.getElementById('theme-icon-moon').classList.add('hidden');
        });
    }
})();

/* ---------------------------------
   CHARTS RENDERING WITH CHART.JS
   --------------------------------- */
function renderCharts() {
    // If we're not on the charts tab, don't waste energy rendering
    if (activeTab !== 'tab-charts') return;

    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#f3f4f6' : '#1e293b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

    // Chronologically sort all transactions for the timeline
    // The raw data from server is reverse chronological (newest first). Let's copy and reverse.
    const chronologicalData = [...transactions].reverse();

    // 1. Balance Evolution Chart (Line Chart)
    const ctxBalance = document.getElementById('chart-balance').getContext('2d');
    if (chartBalance) chartBalance.destroy();

    const balanceLabels = chronologicalData.map(t => t.fecha_operacion);
    const balanceValues = chronologicalData.map(t => t.saldo);

    // Keep data density readable - sample if we have too many items (e.g. max 100 points)
    let sampledLabels = balanceLabels;
    let sampledValues = balanceValues;
    if (chronologicalData.length > 150) {
        const step = Math.ceil(chronologicalData.length / 100);
        sampledLabels = [];
        sampledValues = [];
        for (let i = 0; i < chronologicalData.length; i += step) {
            sampledLabels.push(chronologicalData[i].fecha_operacion);
            sampledValues.push(chronologicalData[i].saldo);
        }
        // Always add the last point to show final balance
        if (chronologicalData.length - 1 % step !== 0) {
            sampledLabels.push(chronologicalData[chronologicalData.length - 1].fecha_operacion);
            sampledValues.push(chronologicalData[chronologicalData.length - 1].saldo);
        }
    }

    chartBalance = new Chart(ctxBalance, {
        type: 'line',
        data: {
            labels: sampledLabels,
            datasets: [{
                label: 'Saldo de Cuenta (€)',
                data: sampledValues,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                borderWidth: 2.5,
                pointRadius: sampledValues.length > 50 ? 0 : 3,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Saldo: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: function(value) {
                            return value + ' €';
                        }
                    }
                }
            }
        }
    });

    // 2. Monthly Income vs Expenses (Bar Chart)
    const ctxMonthly = document.getElementById('chart-monthly').getContext('2d');
    if (chartMonthly) chartMonthly.destroy();

    // Grouping by Year-Month
    const monthlyGroups = {}; // key: "YYYY-MM", val: {income: 0, expense: 0}
    transactions.forEach(t => {
        const parts = t.fecha_operacion.split('/');
        if (parts.length === 3) {
            const key = `${parts[2]}-${parts[1]}`; // "YYYY-MM"
            if (!monthlyGroups[key]) {
                monthlyGroups[key] = { income: 0, expense: 0 };
            }
            if (t.importe > 0) {
                monthlyGroups[key].income += t.importe;
            } else {
                monthlyGroups[key].expense += Math.abs(t.importe);
            }
        }
    });

    // Sort months chronologically
    const sortedYMs = Object.keys(monthlyGroups).sort();
    
    // Labels (Month Names) and Values
    const monthlyLabels = sortedYMs.map(ym => {
        const [year, month] = ym.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, 1);
        return dateObj.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    });
    
    const monthlyIncomes = sortedYMs.map(ym => monthlyGroups[ym].income);
    const monthlyExpenses = sortedYMs.map(ym => monthlyGroups[ym].expense);

    chartMonthly = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: monthlyLabels,
            datasets: [
                {
                    label: 'Ingresos',
                    data: monthlyIncomes,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Gastos',
                    data: monthlyExpenses,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        callback: function(value) { return value + ' €'; }
                    }
                }
            }
        }
    });

    // 3. Category Expenses (Doughnut Chart)
    const ctxCategories = document.getElementById('chart-categories').getContext('2d');
    if (chartCategories) chartCategories.destroy();

    // Group expense sums by category
    const catExpenses = {};
    transactions.forEach(t => {
        if (t.importe < 0) {
            // Usually we filter out investments from normal consumption categories,
            // but let's include all negative transactions and display them.
            const cat = t.category;
            const amt = Math.abs(t.importe);
            catExpenses[cat] = (catExpenses[cat] || 0) + amt;
        }
    });

    // Sort categories by amount descending
    const sortedCats = Object.keys(catExpenses).sort((a, b) => catExpenses[b] - catExpenses[a]);
    const catLabels = sortedCats;
    const catValues = sortedCats.map(cat => catExpenses[cat]);

    // Beautiful palette corresponding to category badge styles
    const categoryColors = {
        'Nómina': '#10b981',
        'Supermercado': '#f59e0b',
        'Ocio y Restauración': '#8b5cf6',
        'Bizum Enviado': '#ef4444',
        'Bizum Recibido': '#06b6d4',
        'Inversiones': '#3b82f6',
        'Suscripciones y Formación': '#7c68e3',
        'Compras': '#ec4899',
        'Efectivo': '#a1a1aa',
        'Deportes': '#a3e635',
        'Sin categoría': '#4b5563'
    };

    const doughnutColors = catLabels.map(cat => categoryColors[cat] || '#6b7280');

    chartCategories = new Chart(ctxCategories, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catValues,
                backgroundColor: doughnutColors,
                borderWidth: isDark ? 2 : 1,
                borderColor: isDark ? '#121621' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        padding: 15,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const sum = context.dataset.data.reduce((a, b) => a + b, 0);
                            const val = context.parsed;
                            const pct = ((val / sum) * 100).toFixed(1);
                            return ` ${context.label}: ${formatCurrency(val)} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}
