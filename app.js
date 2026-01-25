const API_URL = window.location.origin + '/api';
const BASE_URL = window.location.origin;
let currentUser = null;

// Hilfsfunktion für Profilfoto-URLs
function getProfilePhotoUrl(photoPath) {
    if (!photoPath) return 'https://via.placeholder.com/40';
    // Falls bereits vollständige URL
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
        return photoPath;
    }
    // Relativen Pfad zur vollständigen URL machen
    return BASE_URL + photoPath;
}

// ========== DEAKTIVIERTE BEREICHE ==========
// Hier können Bereiche deaktiviert werden - sie werden dann aus der Navbar entfernt
// Mögliche Werte: 'overview', 'members', 'hero', 'fence', 'warehouse', 'storage', 'recipes', 'intelligence', 'activity'
const DISABLED_PAGES = [
    // 'hero',        // Beispiel: Hero-Verkauf deaktivieren
    // 'fence',       // Beispiel: Hehler-Geschäft deaktivieren
    // 'warehouse',   // Beispiel: Sortier Bereich deaktivieren
    // 'intelligence' // Beispiel: Intel-Sammlung deaktivieren
];

// ========== TOAST NOTIFICATIONS ==========

function showToast(message, type = 'info', title = null, duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const titles = {
        success: title || 'Erfolg',
        error: title || 'Fehler',
        warning: title || 'Warnung',
        info: title || 'Info'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// ========== LOGIN ==========

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            showDashboard();
        } else {
            errorEl.textContent = data.error || 'Login fehlgeschlagen';
            errorEl.classList.add('show');
        }
    } catch (error) {
        errorEl.textContent = 'Verbindungsfehler';
        errorEl.classList.add('show');
    }
});

function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    
    document.getElementById('user-display-name').textContent = currentUser.full_name;
    document.getElementById('user-rank').textContent = currentUser.rank;
    
    // Setze Profilfoto
    const userPhoto = document.getElementById('user-profile-photo');
    userPhoto.src = getProfilePhotoUrl(currentUser.profile_photo);
    
    // Deaktivierte Bereiche aus der Navbar entfernen
    DISABLED_PAGES.forEach(page => {
        const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navItem) {
            navItem.style.display = 'none';
        }
        
        // Verstecke auch die entsprechende Seite
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.style.display = 'none';
        }
    });
    
    // Wenn die aktuelle Seite deaktiviert ist, wechsle zur Übersicht
    const activeNav = document.querySelector('.nav-item.active');
    const activePage = activeNav ? activeNav.dataset.page : null;
    if (activePage && DISABLED_PAGES.includes(activePage)) {
        document.querySelector('.nav-item[data-page="overview"]')?.click();
    }
    
    // Deaktivierte Bereiche aus der Navbar entfernen
    DISABLED_PAGES.forEach(page => {
        const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navItem) {
            navItem.style.display = 'none';
        }
        
        // Verstecke auch die entsprechende Seite
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.style.display = 'none';
        }
    });
    
    // Wenn die aktuelle Seite deaktiviert ist, wechsle zur Übersicht
    const activeNav = document.querySelector('.nav-item.active');
    const activePage = activeNav ? activeNav.dataset.page : null;
    if (activePage && DISABLED_PAGES.includes(activePage)) {
        document.querySelector('.nav-item[data-page="overview"]')?.click();
    }
    
    // Zeige/Verstecke Buttons basierend auf Berechtigungen
    const addMemberBtn = document.getElementById('add-member-btn');
    if (addMemberBtn) {
        addMemberBtn.style.display = currentUser.can_add_members ? 'inline-flex' : 'none';
    }
    
    // Hero-Management-Buttons zeigen/verstecken
    const heroButtons = document.querySelectorAll('#hero-page .hero-header .btn-primary, #hero-page .hero-header .btn-warning');
    const heroNoPermBanner = document.getElementById('hero-no-permission');
    heroButtons.forEach(btn => {
        btn.style.display = currentUser.can_manage_hero ? 'inline-flex' : 'none';
    });
    if (heroNoPermBanner) {
        heroNoPermBanner.style.display = currentUser.can_manage_hero ? 'none' : 'block';
    }
    
    // Hehler-Ankauf-Button zeigen/verstecken
    const fenceBuyButton = document.querySelector('#fence-page .page-header .btn-primary');
    const fenceNoPermBanner = document.getElementById('fence-no-permission');
    if (fenceBuyButton) {
        fenceBuyButton.style.display = currentUser.can_manage_fence ? 'inline-flex' : 'none';
    }
    if (fenceNoPermBanner) {
        fenceNoPermBanner.style.display = currentUser.can_manage_fence ? 'none' : 'block';
    }
    
    loadDashboardData();
    updateTime();
    setInterval(updateTime, 1000);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { 
        method: 'POST',
        credentials: 'include'
    });
    location.reload();
});

function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString('de-DE');
}

// ========== SESSION CHECK ==========

async function checkSession() {
    try {
        const response = await fetch(`${API_URL}/auth/session`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.logged_in) {
            currentUser = data.user;
            showDashboard();
        }
    } catch (error) {
        // Session not found
    }
}

checkSession();

// ========== NAVIGATION ==========

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const page = item.getAttribute('data-page');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}-page`).classList.add('active');
        
        const titles = {
            'overview': 'Übersicht',
            'members': 'Mitglieder',
            'hero': 'Hero-Verkauf',
            'fence': 'Hehler-Geschäft',
            'warehouse': 'Sortier Bereich',
            'storage': 'Lager',
            'intelligence': 'Intel-Sammlung',
            'activity': 'Aktivitäten'
        };
        
        document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
        
        loadPageData(page);
    });
});

function loadPageData(page) {
    switch(page) {
        case 'members':
            loadMembers();
            break;
        case 'hero':
            loadHeroData();
            break;
        case 'fence':
            loadFenceData();
            break;
        case 'warehouse':
            loadWarehouse();
            break;
        case 'storage':
            loadStorageOverview();
            break;
        case 'recipes':
            loadRecipes();
            break;
        case 'intelligence':
            loadIntelligence();
            break;
        case 'activity':
            loadActivity();
            break;
    }
}

// ========== DASHBOARD ==========

function loadDashboardData() {
    loadDashboardStats();
    loadMembers();
}

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_URL}/stats/dashboard`, {
            credentials: 'include'
        });
        const stats = await response.json();
        
        const statMembers = document.getElementById('stat-members');
        const statHero = document.getElementById('stat-hero');
        const statFence = document.getElementById('stat-fence');
        const statWarehouse = document.getElementById('stat-warehouse');
        
        if (statMembers) statMembers.textContent = stats.total_members || 0;
        if (statHero) statHero.textContent = stats.hero_stock || 0;
        if (statFence) statFence.textContent = `$${(stats.fence_pending || 0).toLocaleString()}`;
        if (statWarehouse) statWarehouse.textContent = `$${(stats.warehouse_value || 0).toLocaleString()}`;
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
    }
}

// ========== MITGLIEDER ==========

async function loadMembers() {
    try {
        const response = await fetch(`${API_URL}/members`, {
            credentials: 'include'
        });
        const members = await response.json();
        
        const tbody = document.getElementById('members-table');
        const canEdit = currentUser && currentUser.can_add_members;
        const isBoss = currentUser && currentUser.rank === 'Boss';
        
        tbody.innerHTML = members.map(m => `
            <tr>
                <td>
                    <img src="${getProfilePhotoUrl(m.profile_photo)}" alt="${m.full_name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                </td>
                <td>${m.full_name}</td>
                <td>${m.username}</td>
                <td>${m.rank}</td>
                <td>
                    ${m.is_password_set 
                        ? '<span class="status-badge active"><i class="fas fa-check"></i> Eingerichtet</span>' 
                        : '<span class="status-badge inactive"><i class="fas fa-clock"></i> Ausstehend</span>'}
                    ${isBoss && m.is_password_set ? `<button class="btn-icon-small" onclick="showPassword(${m.id})" title="Passwort anzeigen"><i class="fas fa-eye"></i></button>` : ''}
                </td>
                <td>${m.phone || '-'}</td>
                <td>${m.last_login ? formatDateTime(m.last_login) : 'Nie'}</td>
                <td><span class="status-badge ${m.is_active ? 'active' : 'inactive'}">${m.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                    ${canEdit ? `
                        <button class="btn-icon-small" onclick="editMember(${m.id})" title="Bearbeiten"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon-small" onclick="deleteMember(${m.id}, '${m.full_name}')" title="Löschen" style="background: #dc3545;"><i class="fas fa-trash"></i></button>
                    ` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Mitglieder:', error);
    }
}

// ========== HERO SYSTEM ==========

async function loadHeroData() {
    await loadHeroInventory();
    await loadHeroDistributions();
    await loadHeroPaymentStats();
}

async function loadHeroInventory() {
    try {
        const response = await fetch(`${API_URL}/hero/inventory`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        // Speichere Settings für Berechnungen
        window.heroSettings = {
            sale_price: data.sale_price,
            gang_percentage: data.gang_percentage
        };
        
        const potentialRevenue = data.quantity * data.sale_price;
        const gangPotential = potentialRevenue * (data.gang_percentage / 100);
        
        document.getElementById('hero-stock').textContent = data.quantity;
        document.getElementById('hero-unit-cost').textContent = data.unit_cost;
        document.getElementById('hero-sale-price').textContent = data.sale_price;
        document.getElementById('hero-gang-percent').textContent = data.gang_percentage;
        document.getElementById('hero-gang-potential').textContent = gangPotential.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    } catch (error) {
        console.error('Fehler beim Laden des Hero-Lagers:', error);
    }
}

async function loadHeroPaymentStats() {
    try {
        const response = await fetch(`${API_URL}/hero/payment-stats`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        document.getElementById('hero-total-expected').textContent = '$' + (data.total_expected || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('hero-paid-amount').textContent = (data.paid || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('hero-outstanding-amount').textContent = (data.outstanding || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    } catch (error) {
        console.error('Fehler beim Laden der Zahlungsstatistiken:', error);
    }
}

async function loadHeroSales() {
    try {
        const response = await fetch(`${API_URL}/hero/sales`, {
            credentials: 'include'
        });
        const sales = await response.json();
        
        const tbody = document.getElementById('hero-sales-table');
        
        if (!sales || sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Keine Verkäufe vorhanden</td></tr>';
            return;
        }
        
        tbody.innerHTML = sales.map(s => {
            const totalSale = parseFloat(s.total_sale) || 0;
            const gangShare = parseFloat(s.gang_share) || 0;
            const memberShare = parseFloat(s.member_share) || 0;
            
            return `
                <tr>
                    <td>${s.full_name || 'Unbekannt'}</td>
                    <td>${s.quantity || 0}</td>
                    <td>$${totalSale.toFixed(2)}</td>
                    <td>$${gangShare.toFixed(2)}</td>
                    <td>$${memberShare.toFixed(2)}</td>
                    <td>${formatDateTime(s.sale_date)}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Verkäufe:', error);
    }
}

async function loadHeroDistributions() {
    try {
        const response = await fetch(`${API_URL}/hero/distributions`, {
            credentials: 'include'
        });
        const distributions = await response.json();
        
        const tbody = document.getElementById('hero-distributions-table');
        
        if (!distributions || distributions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">Keine Ausgaben vorhanden</td></tr>';
            return;
        }
        
        tbody.innerHTML = distributions.map(d => {
            let statusBadge = '';
            if (d.status === 'paid') statusBadge = '<span class="badge badge-success">Bezahlt</span>';
            else if (d.status === 'partial') statusBadge = '<span class="badge badge-warning">Teilweise</span>';
            else statusBadge = '<span class="badge badge-danger">Ausstehend</span>';
            
            const expectedSale = parseFloat(d.expected_sale_price) || 0;
            const gangShare = parseFloat(d.gang_share) || 0;
            const paidAmount = parseFloat(d.paid_amount) || 0;
            const remaining = gangShare - paidAmount;
            
            let actionButton = '';
            if (remaining > 0) {
                actionButton = `<button class="btn-success" onclick="showPaymentModal(${d.id}, '${d.full_name}', ${gangShare}, ${paidAmount})">Zahlung buchen</button>`;
            } else {
                actionButton = '<span style="color: var(--success);">Vollständig bezahlt</span>';
            }
            
            return `
                <tr>
                    <td>${d.full_name || 'Unbekannt'}</td>
                    <td>${d.quantity || 0}</td>
                    <td>$${expectedSale.toFixed(2)}</td>
                    <td><strong style="color: var(--warning);">$${gangShare.toFixed(2)}</strong></td>
                    <td>$${paidAmount.toFixed(2)}</td>
                    <td><strong style="color: ${remaining > 0 ? 'var(--danger)' : 'var(--success)'};">$${remaining.toFixed(2)}</strong></td>
                    <td>${formatDateTime(d.distributed_date)}</td>
                    <td>${statusBadge}</td>
                    <td>${actionButton}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Ausgaben:', error);
    }
}

// ========== MODALS ==========

function closeModals() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function showRestockModal() {
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('restock-modal').style.display = 'block';
}

function showEditStockModal() {
    // Zeige aktuellen Bestand
    const currentStock = document.getElementById('hero-stock').textContent || '0';
    document.getElementById('current-stock-display').textContent = currentStock;
    document.getElementById('edit-stock-quantity').value = currentStock;
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('edit-stock-modal').style.display = 'block';
}

function showDistributeModal() {
    loadMemberSelects();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('distribute-modal').style.display = 'block';
}

function showSettingsModal() {
    if (window.heroSettings) {
        document.getElementById('settings-sale-price').value = window.heroSettings.sale_price;
        document.getElementById('settings-gang-percent').value = window.heroSettings.gang_percentage;
        updateMemberPercent();
    }
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('settings-modal').style.display = 'block';
}

function showSaleModal() {
    loadMemberSelects();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('sale-modal').style.display = 'block';
}

function showFencePurchaseModal() {
    loadFenceTemplates();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('fence-purchase-modal').style.display = 'block';
}

// Fence Templates laden
async function loadFenceTemplates() {
    try {
        const response = await fetch(`${API_URL}/fence/templates`, {
            credentials: 'include'
        });
        const templates = await response.json();
        
        const select = document.getElementById('fence-item-select');
        select.innerHTML = '<option value="">-- Artikel auswählen --</option>' +
            templates.map(t => 
                `<option value="${t.id}" data-name="${t.item_name}" data-price="${t.typical_price}">${t.item_name} (${t.category}) - ca. $${t.typical_price}</option>`
            ).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Artikel-Vorlagen:', error);
    }
}

function selectFenceItem() {
    const select = document.getElementById('fence-item-select');
    const option = select.options[select.selectedIndex];
    
    if (option.value) {
        document.getElementById('fence-item-name').value = option.dataset.name;
        document.getElementById('fence-unit-price').value = option.dataset.price;
        calculateFenceTotal();
    }
}

function calculateFenceTotal() {
    const quantity = parseFloat(document.getElementById('fence-quantity').value) || 0;
    const price = parseFloat(document.getElementById('fence-unit-price').value) || 0;
    const total = quantity * price;
    document.getElementById('fence-total-calc').textContent = total.toFixed(2);
}

// Restock Form - nur Menge
const restockForm = document.getElementById('restock-form');
if (restockForm) {
    restockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const quantity = parseInt(document.getElementById('restock-quantity').value);
        
        if (!quantity || quantity < 1) {
            showToast('Bitte eine gültige Menge eingeben', 'error');
            return;
        }
    
    try {
        const response = await fetch(`${API_URL}/hero/inventory/restock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(`${quantity} Hero wurden dem Lager hinzugefügt`, 'success', 'Lager aufgefüllt');
            closeModals();
            document.getElementById('restock-form').reset();
            loadHeroData();
            loadDashboardStats();
        } else {
            showToast(data.error || 'Konnte nicht auffüllen', 'error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
    });
}

// Edit Stock Form
const editStockForm = document.getElementById('edit-stock-form');
if (editStockForm) {
    editStockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newQuantity = parseInt(document.getElementById('edit-stock-quantity').value);
    
    if (newQuantity < 0) {
        showToast('Bestand kann nicht negativ sein', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/hero/inventory/set`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity: newQuantity })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(`Lagerbestand wurde auf ${newQuantity} aktualisiert`, 'success', 'Bestand geändert');
            closeModals();
            document.getElementById('edit-stock-form').reset();
            loadHeroData();
            loadDashboardStats();
        } else {
            showToast(data.error || 'Konnte Bestand nicht ändern', 'error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
    });
}

// Hero Ausgabe Form
const distributeForm = document.getElementById('distribute-form');
if (distributeForm) {
    distributeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const member_id = parseInt(document.getElementById('distribute-member').value);
        const quantity = parseInt(document.getElementById('distribute-quantity').value);
        
        if (!member_id) {
            showToast('Bitte ein Mitglied auswählen', 'error');
        return;
    }
    
    if (!quantity || quantity < 1) {
        showToast('Bitte eine gültige Menge eingeben', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/hero/distributions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ member_id, quantity })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`${quantity} Hero wurden an das Mitglied ausgegeben`, 'success', 'Hero ausgegeben');
            closeModals();
            document.getElementById('distribute-form').reset();
            loadHeroData();
            loadDashboardStats();
        } else {
            showToast(data.error || 'Konnte Hero nicht ausgeben', 'error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
    });
}

// Settings Form
const settingsGangPercent = document.getElementById('settings-gang-percent');
if (settingsGangPercent) {
    settingsGangPercent.addEventListener('input', updateMemberPercent);
}

function updateMemberPercent() {
    const gangPercent = parseInt(document.getElementById('settings-gang-percent').value) || 0;
    document.getElementById('settings-member-percent').textContent = 100 - gangPercent;
}

const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sale_price = parseFloat(document.getElementById('settings-sale-price').value);
        const gang_percentage = parseInt(document.getElementById('settings-gang-percent').value);
        
        try {
            const response = await fetch(`${API_URL}/hero/inventory/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            body: JSON.stringify({ sale_price, gang_percentage })
        });
        
        if (response.ok) {
            showToast('Hero-Verkauf Einstellungen wurden aktualisiert', 'success', 'Einstellungen gespeichert');
            closeModals();
            loadHeroData();
        }
    } catch (error) {
        showToast('Fehler beim Speichern der Einstellungen', 'error');
    }
    });
}

// Sale Form - Berechnung
const saleQuantityInput = document.getElementById('sale-quantity');
if (saleQuantityInput) {
    saleQuantityInput.addEventListener('input', calculateSale);
}

function calculateSale() {
    if (!window.heroSettings) return;
    
    const quantity = parseFloat(document.getElementById('sale-quantity').value) || 0;
    const price = window.heroSettings.sale_price;
    const gangPercent = window.heroSettings.gang_percentage / 100;
    
    const revenue = quantity * price;
    const gangShare = revenue * gangPercent;
    const memberShare = revenue * (1 - gangPercent);
    
    document.getElementById('calc-price').textContent = price.toFixed(2);
    document.getElementById('calc-revenue').textContent = revenue.toFixed(2);
    document.getElementById('calc-gang-percent').textContent = window.heroSettings.gang_percentage;
    document.getElementById('calc-member-percent').textContent = 100 - window.heroSettings.gang_percentage;
    document.getElementById('calc-gang').textContent = gangShare.toFixed(2);
    document.getElementById('calc-member').textContent = memberShare.toFixed(2);
}

// Payment Modal
function showPaymentModal(distributionId, memberName, gangShare, paidAmount) {
    document.getElementById('payment-distribution-id').value = distributionId;
    document.getElementById('payment-member-name').value = memberName;
    document.getElementById('payment-total').value = '$' + gangShare.toFixed(2);
    document.getElementById('payment-already-paid').value = '$' + paidAmount.toFixed(2);
    const remaining = gangShare - paidAmount;
    document.getElementById('payment-remaining').value = '$' + remaining.toFixed(2);
    document.getElementById('payment-amount').value = remaining.toFixed(2);
    document.getElementById('payment-amount').max = remaining;
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('payment-modal').style.display = 'block';
}

// Payment Form Submit
const paymentForm = document.getElementById('payment-form');
if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const distributionId = parseInt(document.getElementById('payment-distribution-id').value);
        const amount = parseFloat(document.getElementById('payment-amount').value);
        
        if (!amount || amount <= 0) {
            showToast('Bitte einen gültigen Betrag eingeben', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/hero/distributions/${distributionId}/payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ amount })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(`Zahlung von $${amount.toFixed(2)} wurde gebucht`, 'success', 'Zahlung erfolgreich');
                closeModals();
                document.getElementById('payment-form').reset();
                loadHeroData();
                loadDashboardStats();
            } else {
                showToast(data.error || 'Zahlung konnte nicht gebucht werden', 'error');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showToast('Verbindungsfehler zum Server', 'error');
        }
    });
}

// ========== HEHLER SYSTEM ==========

async function loadFenceData() {
    await loadFencePurchases();
    await loadFenceSales();
    await loadFenceSummary();
    await loadSalesSummary();
    
    // Lade auch die Produkte für den Schnellankauf-Tab
    await loadProductsGrid();
}

async function loadFenceSummary() {
    try {
        const response = await fetch(`${API_URL}/fence/purchases/summary`, {
            credentials: 'include'
        });
        const summary = await response.json();
        
        // Grundlegende Stats
        const countEl = document.getElementById('fence-count-today');
        const spentEl = document.getElementById('fence-spent-today');
        
        if (countEl) countEl.textContent = summary.total_purchases || 0;
        if (spentEl) spentEl.textContent = `$${parseFloat(summary.total_spent || 0).toFixed(2)}`;
        
        // Stats für Umsatz und Gewinn
        const revenueEl = document.getElementById('fence-revenue-today');
        const profitEl = document.getElementById('fence-profit-today');
        
        if (revenueEl) revenueEl.textContent = `$${parseFloat(summary.total_revenue || 0).toFixed(2)}`;
        if (profitEl) profitEl.textContent = `$${parseFloat(summary.total_profit || 0).toFixed(2)}`;
        
        // Alte Element-ID für Kompatibilität
        const itemsEl = document.getElementById('fence-items-today');
        if (itemsEl) itemsEl.textContent = summary.total_items || 0;
    } catch (error) {
        console.error('Fehler beim Laden der Hehler-Zusammenfassung:', error);
    }
}

async function loadSalesSummary() {
    try {
        const response = await fetch(`${API_URL}/fence/sales/summary`, {
            credentials: 'include'
        });
        const summary = await response.json();
        
        // Verkaufs-Stats für den Verkaufs-Tab
        const salesEl = document.getElementById('fence-sales-today');
        const revenueEl2 = document.getElementById('fence-revenue-today-2');
        const profitEl2 = document.getElementById('fence-profit-today-2');
        const marginEl = document.getElementById('fence-margin-today');
        
        if (salesEl) salesEl.textContent = summary.total_sales || 0;
        if (revenueEl2) revenueEl2.textContent = `$${parseFloat(summary.total_revenue || 0).toFixed(2)}`;
        if (profitEl2) profitEl2.textContent = `$${parseFloat(summary.total_profit || 0).toFixed(2)}`;
        
        // Berechne Marge
        if (marginEl) {
            const revenue = parseFloat(summary.total_revenue || 0);
            const margin = revenue > 0 ? ((summary.total_profit / revenue) * 100).toFixed(1) : 0;
            marginEl.textContent = `${margin}%`;
        }
    } catch (error) {
        console.error('Fehler beim Laden der Verkaufs-Zusammenfassung:', error);
    }
}

async function loadFencePurchases() {
    try {
        const response = await fetch(`${API_URL}/fence/purchases`, {
            credentials: 'include'
        });
        const purchases = await response.json();
        
        const tbody = document.getElementById('fence-purchases-table');
        if (!tbody) {
            // Tabelle existiert nicht mehr (wir verwenden jetzt das Tab-System)
            return;
        }
        
        if (purchases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Keine Ankäufe vorhanden</td></tr>';
            return;
        }
        
        tbody.innerHTML = purchases.map(p => `
            <tr>
                <td>${formatDateTime(p.purchase_date)}</td>
                <td>${p.item_name}</td>
                <td>${p.quantity}</td>
                <td>$${parseFloat(p.unit_price).toFixed(2)}</td>
                <td>$${parseFloat(p.total_price).toFixed(2)}</td>
                <td>${p.seller_info || '-'}</td>
                <td><span class="status-badge ${p.stored_in_warehouse ? 'active' : 'inactive'}">${p.stored_in_warehouse ? 'Ja' : 'Nein'}</span></td>
                <td>
                    <button class="btn-success" onclick="quickSellPurchase(${p.id}, '${p.item_name.replace(/'/g, "\\'")}', ${p.quantity}, ${p.unit_price})" title="Verkaufen">
                        <i class="fas fa-dollar-sign"></i>
                    </button>
                    <button class="btn-edit" onclick="editFencePurchase(${p.id})" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteFencePurchase(${p.id}, '${p.item_name.replace(/'/g, "\\'")})')" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Hehler-Käufe:', error);
    }
}

// Fence Purchase Form
document.getElementById('fence-purchase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        item_name: document.getElementById('fence-item-name').value,
        quantity: parseInt(document.getElementById('fence-quantity').value),
        unit_price: parseFloat(document.getElementById('fence-unit-price').value),
        seller_info: document.getElementById('fence-seller-info').value,
        stored_in_warehouse: document.getElementById('fence-stored-warehouse').checked,
        notes: document.getElementById('fence-notes').value || null
    };
    
    // Validierung
    if (!data.item_name || !data.quantity || !data.unit_price) {
        showToast('Bitte alle erforderlichen Felder ausfüllen', 'error');
        return;
    }
    
    if (data.quantity < 1) {
        showToast('Menge muss mindestens 1 sein', 'error');
        return;
    }
    
    if (data.unit_price < 0) {
        showToast('Preis kann nicht negativ sein', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fence/purchases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const totalPrice = data.quantity * data.unit_price;
            showToast(`Ankauf erfolgreich: ${data.quantity}x ${data.item_name} für $${totalPrice.toFixed(2)}`, 'success', 'Ankauf gespeichert');
            closeModals();
            document.getElementById('fence-purchase-form').reset();
            document.getElementById('fence-item-select').value = '';
            loadFenceData();
            loadDashboardStats();
            if (data.stored_in_warehouse) {
                loadWarehouse();
            }
        } else {
            showToast(result.error || 'Ankauf konnte nicht gespeichert werden', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Eintragen des Ankaufs:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
});

// Hehler Verkauf Modal & Funktionen
function showFenceSaleModal() {
    loadFencePurchasesForSelect();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('fence-sale-modal').style.display = 'block';
}

// Schnell-Verkauf direkt aus der Ankaufs-Liste
function quickSellPurchase(purchaseId, itemName, quantity, unitCost) {
    // Öffne das Verkaufs-Modal und fülle es vorab aus
    showFenceSaleModal();
    
    // Fülle die Felder aus
    document.getElementById('fence-purchase-select').value = purchaseId;
    document.getElementById('fence-sale-item-name').value = itemName;
    document.getElementById('fence-sale-quantity').value = quantity;
    document.getElementById('fence-sale-quantity').max = quantity;
    document.getElementById('fence-sale-unit-cost').value = unitCost;
    document.getElementById('fence-sale-unit-price').value = (unitCost * 1.2).toFixed(2); // 20% Aufschlag
    
    calculateFenceSaleTotal();
}

async function loadFencePurchasesForSelect() {
    try {
        const response = await fetch(`${API_URL}/fence/purchases`, {
            credentials: 'include'
        });
        const purchases = await response.json();
        
        const select = document.getElementById('fence-purchase-select');
        select.innerHTML = '<option value="">-- Bestehender Ankauf --</option>' +
            purchases.filter(p => p.quantity > 0).map(p => 
                `<option value="${p.id}" data-item="${p.item_name}" data-cost="${p.unit_price}" data-qty="${p.quantity}">
                    ${p.item_name} (${p.quantity}x à $${p.unit_price})
                </option>`
            ).join('');
        
        select.addEventListener('change', function() {
            if (this.value) {
                const option = this.options[this.selectedIndex];
                document.getElementById('fence-sale-item-name').value = option.dataset.item;
                document.getElementById('fence-sale-unit-cost').value = option.dataset.cost;
                document.getElementById('fence-sale-quantity').max = option.dataset.qty;
                calculateFenceSaleTotal();
            }
        });
    } catch (error) {
        console.error('Fehler beim Laden der Ankäufe:', error);
    }
}

function calculateFenceSaleTotal() {
    const quantity = parseFloat(document.getElementById('fence-sale-quantity').value) || 0;
    const unitCost = parseFloat(document.getElementById('fence-sale-unit-cost').value) || 0;
    const unitPrice = parseFloat(document.getElementById('fence-sale-unit-price').value) || 0;
    
    const totalSale = quantity * unitPrice;
    const totalCost = quantity * unitCost;
    const profit = totalSale - totalCost;
    
    document.getElementById('fence-sale-total-calc').textContent = totalSale.toFixed(2);
    document.getElementById('fence-sale-profit-calc').textContent = profit.toFixed(2);
}

// Fence Sale Form
document.getElementById('fence-sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        purchase_id: document.getElementById('fence-purchase-select').value || null,
        item_name: document.getElementById('fence-sale-item-name').value,
        quantity: parseInt(document.getElementById('fence-sale-quantity').value),
        unit_cost: parseFloat(document.getElementById('fence-sale-unit-cost').value),
        unit_price: parseFloat(document.getElementById('fence-sale-unit-price').value),
        buyer_info: document.getElementById('fence-sale-buyer-info').value || null
    };
    
    // Validierung
    if (!data.item_name || !data.quantity || !data.unit_cost || !data.unit_price) {
        showToast('Bitte alle erforderlichen Felder ausfüllen', 'error');
        return;
    }
    
    if (data.quantity < 1) {
        showToast('Menge muss mindestens 1 sein', 'error');
        return;
    }
    
    const totalPrice = data.quantity * data.unit_price;
    const profit = totalPrice - (data.quantity * data.unit_cost);
    
    try {
        const response = await fetch(`${API_URL}/fence/sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast(`Verkauf erfolgreich: ${data.quantity}x ${data.item_name} für $${totalPrice.toFixed(2)} (Gewinn: $${profit.toFixed(2)})`, 'success', 'Verkauf gespeichert');
            closeModals();
            document.getElementById('fence-sale-form').reset();
            document.getElementById('fence-purchase-select').value = '';
            loadFenceData();
            loadDashboardStats();
        } else {
            showToast(result.error || 'Verkauf konnte nicht gespeichert werden', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Erfassen des Verkaufs:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
});

async function loadFenceSales() {
    try {
        const response = await fetch(`${API_URL}/fence/sales`, {
            credentials: 'include'
        });
        const sales = await response.json();
        
        const tbody = document.getElementById('fence-sales-table');
        if (!tbody) {
            // Tabelle existiert nicht mehr (wir verwenden jetzt das Tab-System)
            return;
        }
        
        if (sales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Keine Verkäufe vorhanden</td></tr>';
            return;
        }
        
        tbody.innerHTML = sales.map(s => `
            <tr>
                <td>${formatDateTime(s.sale_date)}</td>
                <td>${s.item_name}</td>
                <td>${s.quantity}</td>
                <td>$${parseFloat(s.unit_price).toFixed(2)}</td>
                <td>$${parseFloat(s.total_price).toFixed(2)}</td>
                <td class="${parseFloat(s.profit) >= 0 ? 'positive' : 'negative'}">$${s.profit ? parseFloat(s.profit).toFixed(2) : '0.00'}</td>
                <td>${s.buyer_info || '-'}</td>
                <td>
                    <button class="btn-delete" onclick="deleteFenceSale(${s.id}, '${s.item_name}')" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Verkäufe:', error);
    }
}

// ========== HEHLER BEARBEITEN/LÖSCHEN ==========

async function editFencePurchase(id) {
    try {
        const response = await fetch(`${API_URL}/fence/purchases/${id}`, {
            credentials: 'include'
        });
        const purchase = await response.json();
        
        document.getElementById('edit-fence-purchase-id').value = purchase.id;
        document.getElementById('edit-fence-item-name').value = purchase.item_name;
        document.getElementById('edit-fence-quantity').value = purchase.quantity;
        document.getElementById('edit-fence-unit-price').value = purchase.unit_price;
        document.getElementById('edit-fence-seller-info').value = purchase.seller_info || '';
        document.getElementById('edit-fence-stored-warehouse').checked = purchase.stored_in_warehouse;
        document.getElementById('edit-fence-notes').value = purchase.notes || '';
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('edit-fence-purchase-modal').style.display = 'block';
    } catch (error) {
        showToast('Fehler beim Laden der Ankaufsdaten', 'error');
    }
}

document.getElementById('edit-fence-purchase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('edit-fence-purchase-id').value;
    const data = {
        item_name: document.getElementById('edit-fence-item-name').value,
        quantity: parseInt(document.getElementById('edit-fence-quantity').value),
        unit_price: parseFloat(document.getElementById('edit-fence-unit-price').value),
        seller_info: document.getElementById('edit-fence-seller-info').value || null,
        stored_in_warehouse: document.getElementById('edit-fence-stored-warehouse').checked,
        notes: document.getElementById('edit-fence-notes').value || null
    };
    
    try {
        const response = await fetch(`${API_URL}/fence/purchases/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Ankauf aktualisiert', 'success');
            closeModals();
            loadFencePurchases();
            loadFenceDashboardStats();
        }
    } catch (error) {
        showToast('Fehler beim Aktualisieren', 'error');
    }
});

async function deleteFencePurchase(id, itemName) {
    if (!confirm(`${itemName} Ankauf löschen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fence/purchases/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Ankauf gelöscht', 'success');
            loadFencePurchases();
            loadFenceDashboardStats();
        }
    } catch (error) {
        showToast('Fehler beim Löschen', 'error');
    }
}

async function deleteFenceSale(id, itemName) {
    if (!confirm(`${itemName} Verkauf löschen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fence/sales/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Verkauf gelöscht', 'success');
            loadFenceSales();
            loadFenceDashboardStats();
        }
    } catch (error) {
        showToast('Fehler beim Löschen', 'error');
    }
}

// ========== PRODUKTVERWALTUNG ==========

function showProductManagementModal() {
    loadProductTemplates();
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('product-management-modal').style.display = 'block';
}

function showAddProductModal() {
    document.getElementById('product-management-modal').style.display = 'none';
    document.getElementById('add-product-modal').style.display = 'block';
}

async function loadProductTemplates() {
    try {
        const response = await fetch(`${API_URL}/fence/templates/all`, {
            credentials: 'include'
        });
        const products = await response.json();
        
        const tbody = document.getElementById('product-templates-table');
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Keine Produkte vorhanden</td></tr>';
            return;
        }
        
        tbody.innerHTML = products.map(p => `
            <tr>
                <td>${p.item_name}</td>
                <td>${p.category}</td>
                <td>$${parseFloat(p.typical_price).toFixed(2)}</td>
                <td><span class="status-badge ${p.is_active ? 'active' : 'inactive'}">${p.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                    <button class="btn-edit" onclick="editProduct(${p.id})" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteProduct(${p.id}, '${p.item_name}')" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Produkte:', error);
    }
}

document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        item_name: document.getElementById('new-product-name').value,
        category: document.getElementById('new-product-category').value,
        typical_price: parseFloat(document.getElementById('new-product-price').value)
    };
    
    try {
        const response = await fetch(`${API_URL}/fence/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Produkt hinzugefügt', 'success');
            document.getElementById('add-product-form').reset();
            document.getElementById('add-product-modal').style.display = 'none';
            document.getElementById('product-management-modal').style.display = 'block';
            loadProductTemplates();
            loadFenceItemsForSelect();
        }
    } catch (error) {
        showToast('Fehler beim Hinzufügen', 'error');
    }
});

async function editProduct(id) {
    try {
        const response = await fetch(`${API_URL}/fence/templates/${id}`, {
            credentials: 'include'
        });
        const product = await response.json();
        
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('edit-product-name').value = product.item_name;
        document.getElementById('edit-product-category').value = product.category;
        document.getElementById('edit-product-price').value = product.typical_price;
        document.getElementById('edit-product-active').checked = product.is_active;
        
        document.getElementById('product-management-modal').style.display = 'none';
        document.getElementById('edit-product-modal').style.display = 'block';
    } catch (error) {
        showToast('Fehler beim Laden', 'error');
    }
}

document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('edit-product-id').value;
    const data = {
        item_name: document.getElementById('edit-product-name').value,
        category: document.getElementById('edit-product-category').value,
        typical_price: parseFloat(document.getElementById('edit-product-price').value),
        is_active: document.getElementById('edit-product-active').checked
    };
    
    try {
        const response = await fetch(`${API_URL}/fence/templates/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Produkt aktualisiert', 'success');
            document.getElementById('edit-product-modal').style.display = 'none';
            document.getElementById('product-management-modal').style.display = 'block';
            loadProductTemplates();
            loadFenceItemsForSelect();
        }
    } catch (error) {
        showToast('Fehler beim Aktualisieren', 'error');
    }
});

async function deleteProduct(id, itemName) {
    if (!confirm(`Produkt "${itemName}" löschen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fence/templates/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Produkt gelöscht', 'success');
            loadProductTemplates();
            loadFenceItemsForSelect();
        }
    } catch (error) {
        showToast('Fehler beim Löschen', 'error');
    }
}

// ========== LAGER ==========

async function deleteWarehouseItem(id, itemName) {
    if (!confirm(`${itemName} aus dem Lager löschen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/warehouse/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Artikel gelöscht', 'success');
            loadWarehouse();
        }
    } catch (error) {
        showToast('Fehler beim Löschen', 'error');
    }
}

async function loadWarehouse() {
    try {
        const response = await fetch(`${API_URL}/warehouse`, {
            credentials: 'include'
        });
        const items = await response.json();
        
        // Lade Lagerplätze und dann Artikel
        await loadStorageSlots();
        
        // Lade unsortierte und sortierte Artikel
        loadUnsortedItems(items);
        loadStorageGrid(items);
        loadWarehouseTable(items);
        
    } catch (error) {
        console.error('Fehler beim Laden des Lagers:', error);
    }
}

let storageSlots = [];

async function loadStorageSlots() {
    try {
        const response = await fetch(`${API_URL}/storage-slots`, {
            credentials: 'include'
        });
        storageSlots = await response.json();
        
        // Gruppiere nach Section
        const slotsBySection = {};
        storageSlots.forEach(slot => {
            if (!slotsBySection[slot.section]) {
                slotsBySection[slot.section] = [];
            }
            slotsBySection[slot.section].push(slot);
        });
        
        // Render Sections
        const container = document.getElementById('storage-sections-container');
        if (!container) return;
        
        container.innerHTML = Object.keys(slotsBySection).map(section => `
            <div class="storage-section">
                <h3 class="storage-section-title">
                    <i class="fas fa-warehouse"></i> ${section}
                </h3>
                <div class="storage-slots">
                    ${slotsBySection[section].map(slot => `
                        <div class="storage-slot" data-location="${slot.slot_code}" data-slot-id="${slot.id}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                            <div class="slot-header">
                                <div class="slot-label-area">
                                    <span class="slot-label">${slot.slot_code}</span>
                                    ${slot.owner ? `<span style="color: var(--accent); font-size: 0.8rem; margin-top: 2px;"><i class="fas fa-user"></i> ${slot.owner}</span>` : ''}
                                    ${slot.warehouse_id ? `<span style="color: var(--text-secondary); font-size: 0.75rem;"><i class="fas fa-tag"></i> ID: ${slot.warehouse_id}</span>` : ''}
                                    ${slot.location ? `<span style="color: var(--primary); font-size: 0.75rem;"><i class="fas fa-map-marker-alt"></i> ${slot.location}</span>` : ''}
                                </div>
                                <div class="slot-actions">
                                    <button class="slot-action-btn" onclick="editStorageSlot(${slot.id})" title="Bearbeiten">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="slot-action-btn delete" onclick="deleteStorageSlot(${slot.id}, '${slot.slot_code}')" title="Löschen">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                                <span class="slot-count">0</span>
                            </div>
                            <div class="slot-items"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Fehler beim Laden der Lagerplätze:', error);
        // Fallback zu Standardplätzen
        storageSlots = [
            {id: 1, slot_code: 'A1', section: 'Regal A', name: null},
            {id: 2, slot_code: 'A2', section: 'Regal A', name: null},
            {id: 3, slot_code: 'B1', section: 'Regal B', name: null},
            {id: 4, slot_code: 'B2', section: 'Regal B', name: null}
        ];
    }
}

function loadUnsortedItems(items) {
    // Nur Artikel anzeigen, die noch nicht fertig sortiert sind
    const itemsBeingSorted = items.filter(item => !item.sorting_complete);
    const unsortedItems = itemsBeingSorted.filter(item => !item.storage_location || item.storage_location === 'UNSORTED');
    const grid = document.getElementById('unsorted-items-grid');
    const badge = document.getElementById('unsorted-count-badge');
    const finishBtn = document.getElementById('finish-storage-btn');
    
    if (!grid) return;
    
    badge.textContent = `${unsortedItems.length} Artikel`;
    
    // Zeige "Lagerung fertig" Button wenn es Artikel gibt, die gerade sortiert werden
    if (finishBtn) {
        finishBtn.style.display = itemsBeingSorted.length > 0 ? 'inline-flex' : 'none';
    }
    
    if (unsortedItems.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
                <p>Alle Artikel sortiert!</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = unsortedItems.map(item => `
        <div class="unsorted-item" draggable="true" data-item-id="${item.id}" ondragstart="handleDragStart(event)">
            <div class="unsorted-item-header">
                <div class="unsorted-item-icon">
                    <i class="fas ${getIconForCategory(item.category)}"></i>
                </div>
                <div>
                    <div class="unsorted-item-name">${item.item_name}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85rem;">${item.category}</div>
                </div>
            </div>
            <div class="unsorted-item-details">
                <div class="unsorted-item-quantity">
                    <i class="fas fa-boxes"></i>
                    <span>${item.quantity}x</span>
                </div>
                <div class="unsorted-item-value">$${parseFloat(item.unit_value).toFixed(2)}</div>
            </div>
        </div>
    `).join('');
}

function loadStorageGrid(items) {
    // Zeige nur Artikel, die gerade sortiert werden (sorting_complete = false)
    const sortedItems = items.filter(item => 
        item.storage_location && 
        item.storage_location !== 'UNSORTED' && 
        !item.sorting_complete
    );
    
    // Gruppiere nach Lagerplatz
    const itemsByLocation = {};
    sortedItems.forEach(item => {
        if (!itemsByLocation[item.storage_location]) {
            itemsByLocation[item.storage_location] = [];
        }
        itemsByLocation[item.storage_location].push(item);
    });
    
    // Update alle Slots
    document.querySelectorAll('.storage-slot').forEach(slot => {
        const location = slot.dataset.location;
        const itemsInSlot = itemsByLocation[location] || [];
        const slotCount = slot.querySelector('.slot-count');
        const slotItems = slot.querySelector('.slot-items');
        
        slotCount.textContent = itemsInSlot.length;
        
        if (itemsInSlot.length === 0) {
            slotItems.innerHTML = '<div class="empty-slot-message">Leer</div>';
        } else {
            slotItems.innerHTML = itemsInSlot.map(item => `
                <div class="slot-item" draggable="true" data-item-id="${item.id}" ondragstart="handleDragStart(event)">
                    <div class="slot-item-info">
                        <div class="slot-item-icon">
                            <i class="fas ${getIconForCategory(item.category)}"></i>
                        </div>
                        <div class="slot-item-name">${item.item_name}</div>
                    </div>
                    <div class="slot-item-quantity">${item.quantity}x</div>
                    <button class="slot-item-remove" onclick="removeFromStorage(${item.id})" title="Zurück zu unsortiert">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
    });
}

function loadWarehouseTable(items) {
    const tbody = document.getElementById('warehouse-table');
    if (!tbody) {
        console.error('warehouse-table Element nicht gefunden!');
        return;
    }
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Lager ist leer</td></tr>';
        return;
    }
    
    tbody.innerHTML = items.map(i => `
        <tr>
            <td>${i.item_name}</td>
            <td>${i.category}</td>
            <td>${i.quantity}</td>
            <td>$${parseFloat(i.unit_value).toFixed(2)}</td>
            <td>$${(parseFloat(i.quantity) * parseFloat(i.unit_value)).toFixed(2)}</td>
            <td>${i.storage_location && i.storage_location !== 'UNSORTED' ? i.storage_location : '<span style="color: var(--danger);">Unsortiert</span>'}</td>
            <td>${formatDateTime(i.last_updated)}</td>
            <td>
                <button class="btn-delete" onclick="deleteWarehouseItem(${i.id}, '${i.item_name}')" title="Löschen">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Drag & Drop Funktionen
let draggedItemId = null;

function handleDragStart(event) {
    draggedItemId = event.currentTarget.dataset.itemId;
    event.currentTarget.style.opacity = '0.4';
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedItemId) return;
    
    const targetSlot = event.currentTarget;
    const storageLocation = targetSlot.dataset.location;
    
    try {
        const response = await fetch(`${API_URL}/warehouse/${draggedItemId}/location`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ storage_location: storageLocation })
        });
        
        if (response.ok) {
            showToast(`Artikel nach ${storageLocation} verschoben`, 'success', null, 2000);
            loadWarehouse();
        } else {
            showToast('Fehler beim Verschieben', 'error');
        }
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Verschieben', 'error');
    }
    
    draggedItemId = null;
}

async function removeFromStorage(itemId) {
    try {
        const response = await fetch(`${API_URL}/warehouse/${itemId}/location`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ storage_location: 'UNSORTED' })
        });
        
        if (response.ok) {
            showToast('Artikel zurück zu unsortiert verschoben', 'info', null, 2000);
            loadWarehouse();
        } else {
            showToast('Fehler beim Verschieben', 'error');
        }
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Verschieben', 'error');
    }
}

async function finishStorageOrganization() {
    try {
        // Hole alle Warehouse-Artikel
        const response = await fetch(`${API_URL}/warehouse`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            showToast('Fehler beim Laden der Artikel', 'error');
            return;
        }
        
        const items = await response.json();
        const itemsBeingSorted = items.filter(item => !item.sorting_complete);
        const unsortedItems = itemsBeingSorted.filter(item => !item.storage_location || item.storage_location === 'UNSORTED');
        
        if (unsortedItems.length > 0) {
            showToast(`Noch ${unsortedItems.length} unsortierte Artikel vorhanden!`, 'warning');
            return;
        }
        
        // Markiere alle sortierten Artikel als fertig (sorting_complete = true)
        const sortedItems = itemsBeingSorted.filter(item => 
            item.storage_location && item.storage_location !== 'UNSORTED'
        );
        
        // Update alle sortierten Artikel
        const updatePromises = sortedItems.map(item =>
            fetch(`${API_URL}/warehouse/${item.id}/complete`, {
                method: 'PUT',
                credentials: 'include'
            })
        );
        
        await Promise.all(updatePromises);
        
        // Alle Artikel sind sortiert
        showToast('Lagerung abgeschlossen! Alle Artikel sind sortiert.', 'success', null, 3000);
        
        // Button ausblenden und Warehouse neu laden
        const finishBtn = document.getElementById('finish-storage-btn');
        if (finishBtn) {
            finishBtn.style.display = 'none';
        }
        
        loadWarehouse();
        
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Abschließen der Lagerung', 'error');
    }
}

// ========== LAGER OVERVIEW (ALLE ARTIKEL) ==========

async function loadStorageOverview() {
    try {
        const [itemsResponse, slotsResponse] = await Promise.all([
            fetch(`${API_URL}/warehouse`, { credentials: 'include' }),
            fetch(`${API_URL}/storage-slots`, { credentials: 'include' })
        ]);
        
        if (!itemsResponse.ok || !slotsResponse.ok) {
            showToast('Fehler beim Laden der Daten', 'error');
            return;
        }
        
        const allItems = await itemsResponse.json();
        const slots = await slotsResponse.json();
        
        // Nur fertig sortierte Artikel anzeigen
        const completedItems = allItems.filter(item => item.sorting_complete);
        
        // Statistiken aktualisieren
        const totalItems = completedItems.reduce((sum, item) => sum + parseInt(item.quantity), 0);
        const totalValue = completedItems.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_value)), 0);
        
        document.getElementById('total-storage-items').textContent = totalItems;
        document.getElementById('total-storage-value').textContent = totalValue.toFixed(2);
        
        // Gruppiere Slots nach Section
        const slotsBySection = {};
        slots.forEach(slot => {
            if (!slotsBySection[slot.section]) {
                slotsBySection[slot.section] = [];
            }
            slotsBySection[slot.section].push(slot);
        });
        
        // Gruppiere Items nach Lagerplatz
        const itemsByLocation = {};
        completedItems.forEach(item => {
            if (!itemsByLocation[item.storage_location]) {
                itemsByLocation[item.storage_location] = [];
            }
            itemsByLocation[item.storage_location].push(item);
        });
        
        const container = document.getElementById('storage-overview-sections');
        
        if (Object.keys(slotsBySection).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-warehouse"></i>
                    <p>Noch keine Lagerplätze vorhanden</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = Object.entries(slotsBySection).map(([section, sectionSlots]) => `
            <div class="storage-section">
                <div class="section-header">
                    <h3><i class="fas fa-layer-group"></i> ${section}</h3>
                </div>
                <div class="storage-slots-grid">
                    ${sectionSlots.map(slot => {
                        const items = itemsByLocation[slot.slot_code] || [];
                        const itemCount = items.reduce((sum, item) => sum + parseInt(item.quantity), 0);
                        const slotValue = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_value)), 0);
                        
                        return `
                            <div class="storage-slot-overview ${items.length === 0 ? 'empty' : ''}">
                                <div class="slot-header">
                                    <div style="flex: 1;">
                                        <div class="slot-code">${slot.slot_code}</div>
                                        ${slot.name ? `<div class="slot-name">${slot.name}</div>` : ''}
                                        ${slot.owner ? `<div class="slot-owner"><i class="fas fa-user"></i> ${slot.owner}</div>` : ''}
                                        ${slot.location ? `<div class="slot-location"><i class="fas fa-map-marker-alt"></i> ${slot.location}</div>` : ''}
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                                        <div class="slot-info-badges" style="display: flex; gap: 0.5rem;">
                                            <span class="slot-count">${itemCount}</span>
                                            <span class="slot-value">$${slotValue.toFixed(2)}</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem;">
                                            <button class="btn-secondary" onclick="editStorageSlot(${slot.id})" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                                                <i class="fas fa-edit"></i> Bearbeiten
                                            </button>
                                            <button class="btn-secondary" onclick="deleteStorageSlot(${slot.id}, '${slot.slot_code}')" style="padding: 0.5rem 1rem; font-size: 0.9rem; background: #dc3545; border-color: #dc3545;">
                                                <i class="fas fa-trash"></i> Löschen
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                ${items.length > 0 ? `
                                    <div class="slot-items-list">
                                        ${items.map(item => `
                                            <div class="storage-item-card">
                                                <div class="storage-item-icon">
                                                    <i class="fas ${getIconForCategory(item.category)}"></i>
                                                </div>
                                                <div class="storage-item-info">
                                                    <div class="storage-item-name">${item.item_name}</div>
                                                    <div class="storage-item-category">${item.category}</div>
                                                </div>
                                                <div class="storage-item-details">
                                                    <div class="storage-item-quantity">${item.quantity}x</div>
                                                    <div class="storage-item-value">$${parseFloat(item.unit_value).toFixed(2)}</div>
                                                </div>
                                                <button class="storage-item-delete" onclick="deleteWarehouseItem(${item.id}, '${item.item_name}')" title="Artikel löschen">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : '<div class="empty-slot-message">Leer</div>'}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Laden der Lager-Übersicht', 'error');
    }
}

function toggleWarehouseView() {
    const gridView = document.getElementById('storage-grid-view');
    const tableView = document.getElementById('storage-table-view');
    const btnText = document.getElementById('warehouse-view-text');
    
    if (gridView.style.display === 'none') {
        gridView.style.display = 'block';
        tableView.style.display = 'none';
        btnText.textContent = 'Tabellenansicht';
    } else {
        gridView.style.display = 'none';
        tableView.style.display = 'block';
        btnText.textContent = 'Regalansicht';
    }
}

// ========== LAGERPLATZ VERWALTUNG ==========

// Lade Mitglieder für Besitzer-Dropdown
async function populateOwnerDropdown() {
    try {
        const response = await fetch(`${API_URL}/members`, {
            credentials: 'include'
        });
        const members = await response.json();
        
        const ownerSelect = document.getElementById('storage-slot-owner');
        ownerSelect.innerHTML = '<option value="">-- Kein Besitzer --</option>';
        
        members.forEach(member => {
            const option = document.createElement('option');
            option.value = member.full_name;
            option.textContent = `${member.full_name} (${member.rank})`;
            ownerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Mitglieder:', error);
    }
}

function showAddStorageSlotModal() {
    document.getElementById('storage-slot-modal-title').textContent = 'Lagerplatz hinzufügen';
    document.getElementById('storage-slot-form').reset();
    document.getElementById('storage-slot-id').value = '';
    document.getElementById('storage-slot-old-code').value = '';
    
    // Lade Mitglieder für Besitzer-Dropdown
    populateOwnerDropdown();
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('storage-slot-modal').style.display = 'block';
}

async function editStorageSlot(slotId) {
    const slot = storageSlots.find(s => s.id === slotId);
    if (!slot) return;
    
    document.getElementById('storage-slot-modal-title').textContent = 'Lagerplatz bearbeiten';
    document.getElementById('storage-slot-id').value = slot.id;
    document.getElementById('storage-slot-code').value = slot.slot_code;
    document.getElementById('storage-slot-old-code').value = slot.slot_code;
    
    // Lade Mitglieder für Besitzer-Dropdown
    await populateOwnerDropdown();
    
    document.getElementById('storage-slot-owner').value = slot.owner || '';
    document.getElementById('storage-slot-warehouse-id').value = slot.warehouse_id || '';
    document.getElementById('storage-slot-password').value = ''; // Passwort nicht anzeigen
    document.getElementById('storage-slot-location').value = slot.location || 'Paleto';
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('storage-slot-modal').style.display = 'block';
}

// Lösche Lager-Artikel
async function deleteWarehouseItem(itemId, itemName) {
    // Zeige eigenes Löschbestätigungs-Modal
    document.getElementById('delete-item-name').textContent = itemName;
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('delete-item-modal').style.display = 'block';
    
    // Setze Event Handler für Bestätigung
    const confirmBtn = document.getElementById('confirm-delete-item-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.onclick = async () => {
        closeModals();
        
        try {
            const response = await fetch(`${API_URL}/warehouse/${itemId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                showToast('Artikel erfolgreich gelöscht', 'success');
                loadWarehouse();
                loadStorageOverview();
            } else {
                showToast('Fehler beim Löschen des Artikels', 'error');
            }
        } catch (error) {
            console.error('Fehler:', error);
            showToast('Fehler beim Löschen des Artikels', 'error');
        }
    };
}

async function deleteStorageSlot(slotId, slotCode) {
    // Zeige eigenes Löschbestätigungs-Modal
    document.getElementById('delete-storage-code').textContent = slotCode;
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('delete-storage-modal').style.display = 'block';
    
    // Setze Event Handler für Bestätigung
    const confirmBtn = document.getElementById('confirm-delete-storage-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.onclick = async () => {
        closeModals();
        
        try {
            const response = await fetch(`${API_URL}/storage-slots/${slotId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                showToast('Lagerplatz erfolgreich gelöscht', 'success');
                loadWarehouse();
                loadStorageOverview();
            } else {
                showToast('Fehler beim Löschen des Lagerplatzes', 'error');
            }
        } catch (error) {
            console.error('Fehler:', error);
            showToast('Fehler beim Löschen des Lagerplatzes', 'error');
        }
    };
}

// Form Submit Handler
const storageSlotForm = document.getElementById('storage-slot-form');
if (storageSlotForm) {
    storageSlotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const slotId = document.getElementById('storage-slot-id').value;
        const oldCode = document.getElementById('storage-slot-old-code').value;
        const warehouseId = document.getElementById('storage-slot-warehouse-id').value.trim();
        const owner = document.getElementById('storage-slot-owner').value.trim();
        const password = document.getElementById('storage-slot-password').value.trim();
        const location = document.getElementById('storage-slot-location').value;
        
        const data = {
            warehouse_id: warehouseId,
            old_code: oldCode || null,
            owner: owner || null,
            password: password || null,
            location: location
        };
        
        try {
            const url = slotId ? `${API_URL}/storage-slots/${slotId}` : `${API_URL}/storage-slots`;
            const method = slotId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showToast(slotId ? 'Lagerplatz aktualisiert' : 'Lagerplatz hinzugefügt', 'success');
                closeModals();
                loadWarehouse();
                loadStorageOverview();
            } else {
                const error = await response.json();
                showToast(error.error || 'Fehler beim Speichern', 'error');
            }
        } catch (error) {
            console.error('Fehler:', error);
            showToast('Fehler beim Speichern', 'error');
        }
    });
}

// ========== AKTIVITÄT ==========

async function loadActivity() {
    try {
        const response = await fetch(`${API_URL}/activity/recent`, {
            credentials: 'include'
        });
        const activities = await response.json();
        
        const logDiv = document.getElementById('activity-log');
        
        if (activities.length === 0) {
            logDiv.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>Noch keine Aktivitäten vorhanden</p>
                </div>
            `;
            return;
        }
        
        logDiv.innerHTML = activities.map(a => {
            // Spezielle Formatierung für verschiedene Aktivitätstypen
            let displayText = a.description;
            let iconColor = '';
            let detailsHtml = '';
            
            if (a.action_type === 'fence_purchase') {
                iconColor = 'style="color: var(--secondary);"';
                // Format: "Username kaufte Item für $X an"
                const memberName = a.full_name || a.username || 'Unbekannt';
                
                if (a.details) {
                    try {
                        const details = JSON.parse(a.details);
                        const itemName = details.item_name || details.item || 'Unbekannt';
                        const quantity = details.quantity || 1;
                        const unitPrice = parseFloat(details.unit_price || details.price || 0);
                        const totalPrice = unitPrice * quantity;
                        
                        displayText = `<strong>${memberName}</strong> kaufte <strong>${quantity}x ${itemName}</strong> an`;
                        detailsHtml = `
                            <div class="activity-details">
                                <span class="activity-detail-item">
                                    <i class="fas fa-dollar-sign"></i> $${unitPrice.toFixed(2)}/Stk
                                </span>
                                <span class="activity-detail-item">
                                    <i class="fas fa-calculator"></i> Gesamt: $${totalPrice.toFixed(2)}
                                </span>
                            </div>
                        `;
                    } catch(e) {
                        displayText = `<strong>${memberName}</strong> ${a.description}`;
                    }
                } else {
                    displayText = `<strong>${memberName}</strong> ${a.description}`;
                }
            } else if (a.action_type === 'fence_sale') {
                iconColor = 'style="color: var(--success);"';
                const memberName = a.full_name || a.username || 'Unbekannt';
                
                if (a.details) {
                    try {
                        const details = JSON.parse(a.details);
                        const itemName = details.item_name || details.item || 'Unbekannt';
                        const quantity = details.quantity || 1;
                        const unitPrice = parseFloat(details.unit_price || details.price || 0);
                        const totalPrice = unitPrice * quantity;
                        const profit = parseFloat(details.profit || 0);
                        
                        displayText = `<strong>${memberName}</strong> verkaufte <strong>${quantity}x ${itemName}</strong>`;
                        detailsHtml = `
                            <div class="activity-details">
                                <span class="activity-detail-item">
                                    <i class="fas fa-dollar-sign"></i> $${unitPrice.toFixed(2)}/Stk
                                </span>
                                <span class="activity-detail-item">
                                    <i class="fas fa-calculator"></i> Gesamt: $${totalPrice.toFixed(2)}
                                </span>
                                ${profit > 0 ? `
                                <span class="activity-detail-item" style="color: var(--success);">
                                    <i class="fas fa-chart-line"></i> Gewinn: $${profit.toFixed(2)}
                                </span>
                                ` : ''}
                            </div>
                        `;
                    } catch(e) {
                        displayText = `<strong>${memberName}</strong> ${a.description}`;
                    }
                } else {
                    displayText = `<strong>${memberName}</strong> ${a.description}`;
                }
            } else if (a.action_type === 'login') {
                iconColor = 'style="color: var(--primary);"';
                const memberName = a.full_name || a.username || 'Unbekannt';
                displayText = `<strong>${memberName}</strong> hat sich angemeldet`;
            } else if (a.action_type === 'member_added') {
                iconColor = 'style="color: var(--success);"';
            } else if (a.action_type === 'member_edited') {
                iconColor = 'style="color: var(--warning);"';
            }
            
            return `
                <div class="activity-item">
                    <div class="activity-icon" ${iconColor}>
                        <i class="fas fa-${getActivityIcon(a.action_type)}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-description">${displayText}</div>
                        ${detailsHtml}
                        <div class="activity-time">${formatDateTime(a.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Aktivitäten:', error);
    }
}

function getActivityIcon(type) {
    const icons = {
        'login': 'sign-in-alt',
        'hero_restock': 'box',
        'hero_distribution': 'share',
        'hero_sale': 'dollar-sign',
        'hero_settings': 'cog',
        'fence_purchase': 'cart-shopping',
        'fence_sale': 'hand-holding-dollar',
        'warehouse_add': 'plus-circle',
        'member_added': 'user-plus',
        'member_edited': 'user-edit'
    };
    return icons[type] || 'info-circle';
}

// ========== MITGLIEDER HINZUFÜGEN ==========

function showAddMemberModal() {
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('add-member-modal').style.display = 'block';
}

document.getElementById('add-member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('full_name', document.getElementById('new-member-name').value);
    formData.append('username', document.getElementById('new-member-username').value);
    formData.append('rank', document.getElementById('new-member-rank').value);
    formData.append('phone', document.getElementById('new-member-phone').value);
    formData.append('can_add_members', document.getElementById('new-member-can-add').checked);
    formData.append('can_manage_hero', document.getElementById('new-member-can-hero').checked);
    formData.append('can_manage_fence', document.getElementById('new-member-can-fence').checked);
    formData.append('can_view_activity', document.getElementById('new-member-can-activity').checked);
    
    const photoFile = document.getElementById('new-member-photo').files[0];
    if (photoFile) {
        formData.append('profile_photo', photoFile);
    }
    
    try {
        const response = await fetch(`${API_URL}/members/add`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeModals();
            document.getElementById('add-member-form').reset();
            
            // Zeige Invite-Link Modal
            document.getElementById('invite-link-display').value = result.invite_link;
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('invite-link-modal').style.display = 'block';
            
            loadMembers();
        } else {
            showToast(result.error || 'Mitglied konnte nicht hinzugefügt werden', 'error');
        }
    } catch (error) {
        showToast('Verbindungsfehler zum Server', 'error');
    }
});

async function editMember(id) {
    try {
        const response = await fetch(`${API_URL}/members/${id}`, {
            credentials: 'include'
        });
        const member = await response.json();
        
        document.getElementById('edit-member-id').value = member.id;
        document.getElementById('edit-member-name').value = member.full_name;
        document.getElementById('edit-member-rank').value = member.rank;
        document.getElementById('edit-member-phone').value = member.phone || '';
        document.getElementById('edit-member-active').checked = member.is_active;
        document.getElementById('edit-member-can-add').checked = member.can_add_members;
        document.getElementById('edit-member-can-hero').checked = member.can_manage_hero;
        document.getElementById('edit-member-can-fence').checked = member.can_manage_fence;
        document.getElementById('edit-member-can-activity').checked = member.can_view_activity;
        
        // Zeige aktuelles Foto
        const photoPreview = document.getElementById('current-photo-preview');
        if (member.profile_photo) {
            photoPreview.innerHTML = `<img src="${getProfilePhotoUrl(member.profile_photo)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;"><br><small>Aktuelles Foto</small>`;
        } else {
            photoPreview.innerHTML = '<small style="color: #999;">Kein Foto vorhanden</small>';
        }
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('edit-member-modal').style.display = 'block';
    } catch (error) {
        showToast('Fehler beim Laden der Mitgliedsdaten', 'error');
    }
}

document.getElementById('edit-member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('edit-member-id').value;
    const formData = new FormData();
    formData.append('full_name', document.getElementById('edit-member-name').value);
    formData.append('rank', document.getElementById('edit-member-rank').value);
    formData.append('phone', document.getElementById('edit-member-phone').value);
    formData.append('is_active', document.getElementById('edit-member-active').checked);
    formData.append('can_add_members', document.getElementById('edit-member-can-add').checked);
    formData.append('can_manage_hero', document.getElementById('edit-member-can-hero').checked);
    formData.append('can_manage_fence', document.getElementById('edit-member-can-fence').checked);
    formData.append('can_view_activity', document.getElementById('edit-member-can-activity').checked);
    
    const photoFile = document.getElementById('edit-member-photo').files[0];
    if (photoFile) {
        formData.append('profile_photo', photoFile);
    }
    
    try {
        const response = await fetch(`${API_URL}/members/${id}/edit`, {
            method: 'PUT',
            credentials: 'include',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Mitgliedsdaten wurden aktualisiert', 'success', 'Mitglied gespeichert');
            closeModals();
            loadMembers();
        } else {
            showToast(result.error || 'Konnte Mitglied nicht aktualisieren', 'error');
        }
    } catch (error) {
        showToast('Verbindungsfehler zum Server', 'error');
    }
});

// Mitglied löschen
let deleteMemberId = null;
let deleteMemberNameGlobal = null;

function deleteMember(memberId, memberName) {
    deleteMemberId = memberId;
    deleteMemberNameGlobal = memberName;
    
    document.getElementById('delete-member-name').textContent = memberName;
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('delete-confirm-modal').style.display = 'block';
}

// Bestätigung beim Löschen
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!deleteMemberId) return;
    
    try {
        const response = await fetch(`${API_URL}/members/${deleteMemberId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const text = await response.text();
            console.error('Server-Antwort:', text);
            showToast('Fehler beim Löschen: ' + (response.status === 403 ? 'Keine Berechtigung' : 'Server-Fehler'), 'error');
            return;
        }
        
        const result = await response.json();
        
        if (result.success) {
            showToast(`${deleteMemberNameGlobal} wurde erfolgreich entfernt`, 'success', 'Mitglied gelöscht');
            closeModals();
            loadMembers();
            loadDashboardStats();
        } else {
            showToast(result.error || 'Mitglied konnte nicht gelöscht werden', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Löschen des Mitglieds:', error);
        showToast('Verbindungsfehler zum Server', 'error');
    }
});

// ========== HELPERS ==========

function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Modal schließen bei Klick außerhalb
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
        closeModals();
    }
});

// Member-Select für Formulare laden
async function loadMemberSelects() {
    try {
        const response = await fetch(`${API_URL}/members`, {
            credentials: 'include'
        });
        const members = await response.json();
        
        const selects = ['sale-member', 'distribute-member'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Mitglied wählen...</option>' +
                    members.filter(m => m.is_active).map(m => 
                        `<option value="${m.id}">${m.full_name} (${m.rank})</option>`
                    ).join('');
            }
        });
    } catch (error) {
        console.error('Fehler beim Laden der Mitglieder-Auswahl:', error);
    }
}

// Invite Link kopieren
function copyInviteLink() {
    const linkInput = document.getElementById('invite-link-display');
    linkInput.select();
    document.execCommand('copy');
    showToast('Link wurde in die Zwischenablage kopiert', 'success', 'Kopiert', 2000);
}

// Passwort anzeigen (nur für Boss)
async function showPassword(memberId) {
    if (!confirm('Möchtest du das Passwort dieses Mitglieds anzeigen?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/members/${memberId}/password`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.password) {
            showToast(`Passwort für ${data.full_name} (@${data.username}): ${data.password}`, 'info', 'Passwort', 10000);
        } else {
            showToast(data.error || 'Fehler beim Laden des Passworts', 'error');
        }
    } catch (error) {
        showToast('Verbindungsfehler zum Server', 'error');
    }
}

// ========== HEHLER TAB SYSTEM ==========

function switchFenceTab(tabName) {
    // Alle Tabs deaktivieren
    document.querySelectorAll('.fence-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.fence-tab-content').forEach(content => content.classList.remove('active'));
    
    // Aktiven Tab aktivieren
    event.target.closest('.fence-tab').classList.add('active');
    document.getElementById(`fence-${tabName}-tab`).classList.add('active');
    
    // Daten laden je nach Tab
    if (tabName === 'products') {
        loadProductsGrid();
    } else if (tabName === 'sales') {
        loadSalesProductsGrid();
    } else if (tabName === 'manage') {
        loadProductsManagement();
    }
}

// ========== WARENKORB SYSTEM ==========

let shoppingCart = [];
let salesCart = [];

function addToCart() {
    const productId = document.getElementById('quick-product-id').value;
    const productName = document.getElementById('quick-product-name').value;
    const productIcon = document.getElementById('quick-product-icon').value;
    const productCategory = document.getElementById('quick-product-category').value;
    const quantity = parseInt(document.getElementById('quick-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('quick-unit-price').value) || 0;
    
    if (!productName || quantity < 1 || unitPrice < 0) {
        showToast('Bitte alle Felder korrekt ausfüllen', 'error');
        return;
    }
    
    const cartItem = {
        id: Date.now(),
        productId,
        productName,
        productIcon,
        productCategory,
        quantity,
        unitPrice,
        total: quantity * unitPrice
    };
    
    shoppingCart.push(cartItem);
    updateCartDisplay();
    
    // Reset form
    document.getElementById('quick-quantity').value = 1;
    document.getElementById('quick-unit-price').value = '';
    
    // Modal schließen
    closeModals();
    
    showToast(`${productName} zum Warenkorb hinzugefügt`, 'success', null, 2000);
}

function removeFromCart(itemId) {
    shoppingCart = shoppingCart.filter(item => item.id !== itemId);
    updateCartDisplay();
    showToast('Artikel aus Warenkorb entfernt', 'info', null, 2000);
}

function clearCart() {
    if (shoppingCart.length === 0) return;
    
    if (confirm('Möchten Sie den Warenkorb wirklich leeren?')) {
        shoppingCart = [];
        updateCartDisplay();
        showToast('Warenkorb geleert', 'info', null, 2000);
    }
}

function updateCartDisplay() {
    // Checkout Modal Elements
    const checkoutCartItems = document.getElementById('checkout-cart-items');
    const checkoutItemCount = document.getElementById('checkout-item-count');
    const checkoutTotalQuantity = document.getElementById('checkout-total-quantity');
    const checkoutTotalPrice = document.getElementById('checkout-total-price');
    const checkoutSubmitTotal = document.getElementById('checkout-submit-total');
    
    // Page Cart Elements
    const pageCartItems = document.getElementById('page-cart-items');
    const pageCartBadge = document.getElementById('page-cart-badge');
    const pageCartSummary = document.getElementById('page-cart-summary');
    const pageCartCount = document.getElementById('page-cart-count');
    const pageCartQuantity = document.getElementById('page-cart-quantity');
    const pageCartTotal = document.getElementById('page-cart-total');
    
    // Berechne Summen
    const totalItems = shoppingCart.length;
    const totalQuantity = shoppingCart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = shoppingCart.reduce((sum, item) => sum + item.total, 0);
    
    // Update Badge
    if (pageCartBadge) {
        pageCartBadge.textContent = totalItems;
    }
    
    // Wenn Warenkorb leer
    if (shoppingCart.length === 0) {
        if (pageCartItems) {
            pageCartItems.innerHTML = `
                <div class="cart-empty-state">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Warenkorb ist leer</p>
                    <small>Klicken Sie auf "Schnellankauf" bei einem Produkt</small>
                </div>
            `;
        }
        
        if (pageCartSummary) pageCartSummary.style.display = 'none';
        return;
    }
    
    // Checkout Modal Warenkorb Items rendern
    if (checkoutCartItems) {
        checkoutCartItems.innerHTML = shoppingCart.map(item => `
            <div class="cart-item">
                <div class="cart-item-icon">
                    <i class="fas ${item.productIcon || 'fa-box'}"></i>
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.productName}</div>
                    <div class="cart-item-details">
                        <span>${item.quantity}x</span>
                        <span>$${item.unitPrice.toFixed(2)}/Stück</span>
                        <span class="text-muted">${item.productCategory || ''}</span>
                    </div>
                </div>
                <div class="cart-item-price">
                    <div class="cart-item-price-label">Gesamt</div>
                    <div class="cart-item-price-value">$${item.total.toFixed(2)}</div>
                </div>
                <button type="button" class="cart-item-remove" onclick="removeFromCart(${item.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    // Page Warenkorb Items rendern
    if (pageCartItems) {
        pageCartItems.innerHTML = shoppingCart.map(item => `
            <div class="page-cart-item">
                <div class="page-cart-item-header">
                    <div class="page-cart-item-icon">
                        <i class="fas ${item.productIcon || 'fa-box'}"></i>
                    </div>
                    <div class="page-cart-item-info">
                        <div class="page-cart-item-name">${item.productName}</div>
                        <div class="page-cart-item-category">${item.productCategory || ''}</div>
                    </div>
                    <button type="button" class="page-cart-item-remove" onclick="removeFromCart(${item.id})" title="Entfernen">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="page-cart-item-details">
                    <div class="page-cart-item-qty">
                        <strong>${item.quantity}x</strong> à $${item.unitPrice.toFixed(2)}
                    </div>
                    <div class="page-cart-item-price">$${item.total.toFixed(2)}</div>
                </div>
            </div>
        `).join('');
    }
    
    // Checkout Modal Summen
    if (checkoutItemCount) checkoutItemCount.textContent = totalItems;
    if (checkoutTotalQuantity) checkoutTotalQuantity.textContent = totalQuantity;
    if (checkoutTotalPrice) checkoutTotalPrice.textContent = totalPrice.toFixed(2);
    if (checkoutSubmitTotal) checkoutSubmitTotal.textContent = `$${totalPrice.toFixed(2)}`;
    
    // Page Summen
    if (pageCartCount) pageCartCount.textContent = totalItems;
    if (pageCartQuantity) pageCartQuantity.textContent = totalQuantity;
    if (pageCartTotal) pageCartTotal.textContent = totalPrice.toFixed(2);
    if (pageCartSummary) pageCartSummary.style.display = 'block';
}
function calculateQuickTotal() {
    const quantity = parseFloat(document.getElementById('quick-quantity').value) || 0;
    const price = parseFloat(document.getElementById('quick-unit-price').value) || 0;
    const total = quantity * price;
    document.getElementById('quick-total-display').textContent = total.toFixed(2);
}

function changeQuickQty(delta) {
    const input = document.getElementById('quick-quantity');
    const currentValue = parseInt(input.value) || 1;
    const newValue = Math.max(1, currentValue + delta);
    input.value = newValue;
    calculateQuickTotal();
}

// Quick Purchase Modal öffnen
function showQuickPurchaseModal(productId, productName, productIcon, productCategory, suggestedPrice) {
    document.getElementById('quick-product-id').value = productId;
    document.getElementById('quick-product-name').value = productName;
    document.getElementById('quick-product-icon').value = productIcon;
    document.getElementById('quick-product-category').value = productCategory;
    
    document.getElementById('quick-product-display-name').textContent = productName;
    document.getElementById('quick-product-display-category').textContent = productCategory;
    document.getElementById('quick-product-display-icon').innerHTML = `<i class="fas ${productIcon}"></i>`;
    
    document.getElementById('quick-quantity').value = 1;
    document.getElementById('quick-unit-price').value = suggestedPrice || '';
    
    calculateQuickTotal();
    updateCartDisplay();
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('quick-purchase-modal').style.display = 'block';
}

// Zur Kasse gehen (öffnet Checkout Modal)
function proceedToCheckout() {
    if (shoppingCart.length === 0) {
        showToast('Warenkorb ist leer', 'error');
        return;
    }
    
    // Öffne das Checkout Modal
    updateCartDisplay(); // Aktualisiere Warenkorb-Anzeige
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('cart-checkout-modal').style.display = 'block';
}

// ========== PRODUKTE GRID LADEN ==========

async function loadProductsGrid() {
    try {
        const response = await fetch(`${API_URL}/fence/templates`, {
            credentials: 'include'
        });
        const products = await response.json();
        
        const grid = document.getElementById('products-grid');
        
        if (products.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <p>Noch keine Produkte vorhanden</p>
                    <button class="btn-primary" onclick="switchFenceTab('manage'); showAddProductModal()">
                        <i class="fas fa-plus"></i> Erstes Produkt anlegen
                    </button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = products.filter(p => p.is_active).map(product => `
            <div class="product-card">
                <div class="product-card-header">
                    <div class="product-icon">
                        <i class="fas ${product.icon || 'fa-box'}"></i>
                    </div>
                    <div class="product-info">
                        <div class="product-name">${product.item_name}</div>
                        <div class="product-category">
                            <i class="fas fa-tag"></i> ${product.category}
                        </div>
                    </div>
                </div>
                <div class="product-prices">
                    <div class="product-price-item">
                        <div class="product-price-label">Ankaufspreis</div>
                        <div class="product-price-value">$${parseFloat(product.purchase_price || product.typical_price || 0).toFixed(2)}</div>
                    </div>
                    ${product.sale_price ? `
                    <div class="product-price-item">
                        <div class="product-price-label">Verkaufspreis</div>
                        <div class="product-price-value sale">$${parseFloat(product.sale_price).toFixed(2)}</div>
                    </div>
                    ` : ''}
                </div>
                <div class="product-card-footer">
                    <button class="btn-quick-buy" onclick="showQuickPurchaseModal(${product.id}, '${product.item_name}', '${product.icon || 'fa-box'}', '${product.category}', ${product.purchase_price || product.typical_price || 0})">
                        <i class="fas fa-shopping-cart"></i> Schnellankauf
                    </button>
                    <button class="btn-edit-product" onclick="editProduct(${product.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Produkte:', error);
    }
}

function filterProducts() {
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const cards = document.querySelectorAll('.product-card');
    
    cards.forEach(card => {
        const name = card.querySelector('.product-name').textContent.toLowerCase();
        const category = card.querySelector('.product-category').textContent.toLowerCase();
        
        if (name.includes(searchTerm) || category.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// ========== PRODUKTVERWALTUNG ==========

let currentManageView = 'cards';

function switchManageView(view) {
    currentManageView = view;
    
    // Update Buttons
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`view-${view}-btn`).classList.add('active');
    
    // Update Views
    document.querySelectorAll('.manage-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`manage-${view}-view`).classList.add('active');
}

async function loadProductsManagement() {
    try {
        const response = await fetch(`${API_URL}/fence/templates`, {
            credentials: 'include'
        });
        const products = await response.json();
        
        // Lade Karten-Ansicht
        loadProductsManagementCards(products);
        
        // Lade Tabellen-Ansicht
        loadProductsManagementTable(products);
        
    } catch (error) {
        console.error('Fehler beim Laden der Produktverwaltung:', error);
    }
}

function loadProductsManagementCards(products) {
    const grid = document.getElementById('products-manage-grid');
    
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <p>Noch keine Produkte vorhanden</p>
                <button class="btn-primary" onclick="showAddProductModal()">
                    <i class="fas fa-plus"></i> Erstes Produkt erstellen
                </button>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = products.map(product => {
        const purchasePrice = parseFloat(product.purchase_price || product.typical_price || 0);
        const salePrice = parseFloat(product.sale_price || 0);
        const profit = salePrice - purchasePrice;
        const margin = purchasePrice > 0 && salePrice > 0
            ? ((profit / purchasePrice) * 100).toFixed(1)
            : 0;
        
        return `
            <div class="manage-product-card">
                <div class="manage-product-status">
                    <span class="status-badge ${product.is_active ? 'active' : 'inactive'}">
                        ${product.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                </div>
                
                <div class="manage-product-header">
                    <div class="manage-product-icon">
                        <i class="fas ${product.icon || 'fa-box'}"></i>
                    </div>
                    <div class="manage-product-info">
                        <div class="manage-product-name">${product.item_name}</div>
                        <div class="manage-product-category">
                            <i class="fas fa-tag"></i> ${product.category}
                        </div>
                    </div>
                </div>
                
                <div class="manage-product-prices">
                    <div class="manage-price-box purchase">
                        <div class="manage-price-label">Ankauf</div>
                        <div class="manage-price-value">$${purchasePrice.toFixed(2)}</div>
                    </div>
                    <div class="manage-price-box sale">
                        <div class="manage-price-label">Verkauf</div>
                        <div class="manage-price-value">${salePrice > 0 ? '$' + salePrice.toFixed(2) : '-'}</div>
                    </div>
                </div>
                
                ${salePrice > 0 && purchasePrice > 0 ? `
                <div class="manage-product-margin">
                    <div class="margin-text">Gewinnspanne</div>
                    <div class="margin-value">+${margin}%</div>
                </div>
                ` : ''}
                
                <div class="manage-product-actions">
                    <button class="btn-manage-edit" onclick="editProduct(${product.id})">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="btn-manage-delete" onclick="deleteProduct(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function loadProductsManagementTable(products) {
    const tbody = document.getElementById('products-manage-table');
    
    if (!tbody) return;
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Noch keine Produkte vorhanden</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => {
        const purchasePrice = parseFloat(product.purchase_price || product.typical_price || 0);
        const salePrice = parseFloat(product.sale_price || 0);
        const margin = purchasePrice > 0 && salePrice > 0
            ? ((salePrice - purchasePrice) / purchasePrice * 100).toFixed(1)
            : 0;
        
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 35px; height: 35px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 0.5rem; display: flex; align-items: center; justify-content: center;">
                            <i class="fas ${product.icon || 'fa-box'}" style="color: white; font-size: 1.1rem;"></i>
                        </div>
                        <strong>${product.item_name}</strong>
                    </div>
                </td>
                <td>
                    <span style="background: rgba(139, 92, 246, 0.1); padding: 0.35rem 0.75rem; border-radius: 0.5rem; font-size: 0.85rem;">
                        ${product.category}
                    </span>
                </td>
                <td><strong style="color: var(--danger);">$${purchasePrice.toFixed(2)}</strong></td>
                <td><strong style="color: var(--secondary);">${salePrice > 0 ? '$' + salePrice.toFixed(2) : '-'}</strong></td>
                <td>
                    ${salePrice > 0 && purchasePrice > 0 
                        ? `<span style="color: var(--secondary); font-weight: 600;">+${margin}%</span>` 
                        : '<span style="color: var(--text-secondary);">-</span>'}
                </td>
                <td>
                    <span class="status-badge ${product.is_active ? 'active' : 'inactive'}">
                        ${product.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                </td>
                <td>
                    <button class="btn-icon" onclick="editProduct(${product.id})" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteProduct(${product.id})" title="Löschen" style="color: var(--danger);">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Neues Produkt';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('margin-display').style.display = 'none';
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('product-modal').style.display = 'block';
}

async function editProduct(productId) {
    try {
        const response = await fetch(`${API_URL}/fence/templates`, {
            credentials: 'include'
        });
        const products = await response.json();
        const product = products.find(p => p.id === productId);
        
        if (!product) {
            showToast('Produkt nicht gefunden', 'error');
            return;
        }
        
        document.getElementById('product-modal-title').textContent = 'Produkt bearbeiten';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.item_name;
        document.getElementById('product-icon').value = product.icon || 'fa-box';
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-status').value = product.is_active ? 'active' : 'inactive';
        document.getElementById('product-purchase-price').value = product.purchase_price || product.typical_price || '';
        document.getElementById('product-sale-price').value = product.sale_price || '';
        document.getElementById('product-description').value = product.description || '';
        
        calculateProductMargin();
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('product-modal').style.display = 'block';
    } catch (error) {
        console.error('Fehler beim Laden des Produkts:', error);
        showToast('Fehler beim Laden des Produkts', 'error');
    }
}

function calculateProductMargin() {
    const purchasePrice = parseFloat(document.getElementById('product-purchase-price').value) || 0;
    const salePrice = parseFloat(document.getElementById('product-sale-price').value) || 0;
    
    if (purchasePrice > 0 && salePrice > 0) {
        const margin = salePrice - purchasePrice;
        const marginPercent = ((margin / purchasePrice) * 100).toFixed(1);
        
        document.getElementById('margin-amount').textContent = `$${margin.toFixed(2)}`;
        document.getElementById('margin-percent').textContent = marginPercent;
        document.getElementById('margin-display').style.display = 'block';
    } else {
        document.getElementById('margin-display').style.display = 'none';
    }
}

async function deleteProduct(productId) {
    if (!confirm('Möchten Sie dieses Produkt wirklich löschen?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/fence/templates/${productId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Produkt gelöscht', 'success');
            loadProductsManagement();
            loadProductsGrid();
        } else {
            showToast(data.error || 'Fehler beim Löschen', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Löschen des Produkts:', error);
        showToast('Fehler beim Löschen des Produkts', 'error');
    }
}

// Produkt Form Submit
const productForm = document.getElementById('product-form');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const productId = document.getElementById('product-id').value;
        const productData = {
            item_name: document.getElementById('product-name').value,
            category: document.getElementById('product-category').value,
            icon: document.getElementById('product-icon').value,
            purchase_price: parseFloat(document.getElementById('product-purchase-price').value) || 0,
            sale_price: parseFloat(document.getElementById('product-sale-price').value) || null,
            description: document.getElementById('product-description').value,
            is_active: document.getElementById('product-status').value === 'active'
        };
        
        try {
            const url = productId 
                ? `${API_URL}/fence/templates/${productId}`
                : `${API_URL}/fence/templates`;
            
            const response = await fetch(url, {
                method: productId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(productData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showToast(productId ? 'Produkt aktualisiert' : 'Produkt erstellt', 'success');
                closeModals();
                loadProductsManagement();
                loadProductsGrid();
            } else {
                showToast(data.error || 'Fehler beim Speichern', 'error');
            }
        } catch (error) {
            console.error('Fehler beim Speichern des Produkts:', error);
            showToast('Fehler beim Speichern des Produkts', 'error');
        }
    });
}

// Quick Purchase Form Submit (Warenkorb)
// Checkout Form Handler
const cartCheckoutForm = document.getElementById('cart-checkout-form');
if (cartCheckoutForm) {
    cartCheckoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (shoppingCart.length === 0) {
            showToast('Warenkorb ist leer', 'error');
            return;
        }
        
        const sellerInfo = document.getElementById('checkout-seller-info').value;
        // Alle Ankäufe kommen automatisch ins Lager als UNSORTED
        const storedInWarehouse = true;
        
        try {
            // Alle Artikel im Warenkorb als Ankäufe speichern
            const promises = shoppingCart.map(item => 
                fetch(`${API_URL}/fence/purchases`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        item_name: item.productName,
                        quantity: item.quantity,
                        unit_price: item.unitPrice,
                        seller_info: sellerInfo,
                        stored_in_warehouse: storedInWarehouse
                    })
                })
            );
            
            const results = await Promise.all(promises);
            const allSuccessful = results.every(r => r.ok);
            
            if (allSuccessful) {
                const totalItems = shoppingCart.length;
                const totalPrice = shoppingCart.reduce((sum, item) => sum + item.total, 0);
                
                showToast(`${totalItems} Artikel(n) für $${totalPrice.toFixed(2)} angekauft und ins Lager verschoben`, 'success', 'Ankauf erfolgreich');
                
                shoppingCart = [];
                closeModals();
                loadFenceData();
                loadDashboardStats();
            } else {
                showToast('Einige Artikel konnten nicht gespeichert werden', 'error');
            }
        } catch (error) {
            console.error('Fehler beim Ankauf:', error);
            showToast('Fehler beim Ankauf', 'error');
        }
    });
}

function filterPurchasesByDate() {
    // Implementierung für Datumsfilter
    loadFencePurchases();
}

function filterSalesByDate() {
    // Implementierung für Datumsfilter
    loadFenceSales();
}

// ========== VERKAUFS-WARENKORB SYSTEM ==========

function addToSalesCart(productId, productName, productIcon, productCategory, purchasePrice, salePrice, quantity = 1, cost = null, revenue = null, profit = null) {
    // Berechne Werte falls nicht übergeben
    if (cost === null) cost = purchasePrice * quantity;
    if (revenue === null) revenue = salePrice * quantity;
    if (profit === null) profit = revenue - cost;
    
    const cartItem = {
        id: Date.now(),
        productId,
        productName,
        productIcon,
        productCategory,
        quantity,
        purchasePrice,
        salePrice,
        cost,
        revenue,
        profit
    };
    
    salesCart.push(cartItem);
    updateSalesCartDisplay();
    
    showToast(`${quantity}x ${productName} zum Verkaufskorb hinzugefügt`, 'success', null, 2000);
}

function removeFromSalesCart(itemId) {
    salesCart = salesCart.filter(item => item.id !== itemId);
    updateSalesCartDisplay();
    showToast('Artikel aus Verkaufskorb entfernt', 'info', null, 2000);
}

function clearSalesCart() {
    if (salesCart.length === 0) return;
    
    if (confirm('Möchten Sie den Verkaufskorb wirklich leeren?')) {
        salesCart = [];
        updateSalesCartDisplay();
        showToast('Verkaufskorb geleert', 'info', null, 2000);
    }
}

function updateSalesCartDisplay() {
    const salesCartItems = document.getElementById('sales-cart-items');
    const salesCartBadge = document.getElementById('sales-cart-badge');
    const salesCartSummary = document.getElementById('sales-cart-summary');
    const salesCartCount = document.getElementById('sales-cart-count');
    const salesCartCost = document.getElementById('sales-cart-cost');
    const salesCartRevenue = document.getElementById('sales-cart-revenue');
    const salesCartProfit = document.getElementById('sales-cart-profit');
    
    // Berechne Summen
    const totalItems = salesCart.length;
    const totalCost = salesCart.reduce((sum, item) => sum + item.cost, 0);
    const totalRevenue = salesCart.reduce((sum, item) => sum + item.revenue, 0);
    const totalProfit = totalRevenue - totalCost;
    
    // Update Badge
    if (salesCartBadge) {
        salesCartBadge.textContent = totalItems;
    }
    
    // Wenn Verkaufskorb leer
    if (salesCart.length === 0) {
        if (salesCartItems) {
            salesCartItems.innerHTML = `
                <div class="cart-empty-state">
                    <i class="fas fa-cash-register"></i>
                    <p>Verkaufskorb ist leer</p>
                    <small>Klicken Sie auf "Verkaufen" bei einem Produkt</small>
                </div>
            `;
        }
        
        if (salesCartSummary) salesCartSummary.style.display = 'none';
        return;
    }
    
    // Verkaufskorb Items rendern
    if (salesCartItems) {
        salesCartItems.innerHTML = salesCart.map(item => `
            <div class="page-cart-item">
                <div class="page-cart-item-header">
                    <div class="page-cart-item-icon">
                        <i class="fas ${item.productIcon || 'fa-box'}"></i>
                    </div>
                    <div class="page-cart-item-info">
                        <div class="page-cart-item-name">${item.productName}</div>
                        <div class="page-cart-item-category">${item.productCategory || ''}</div>
                    </div>
                    <button type="button" class="page-cart-item-remove" onclick="removeFromSalesCart(${item.id})" title="Entfernen">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="page-cart-item-details">
                    <div class="page-cart-item-qty">
                        <strong>${item.quantity}x</strong>
                        <span class="text-muted" style="font-size: 0.75rem;">EK: $${item.purchasePrice.toFixed(2)} → VK: $${item.salePrice.toFixed(2)}</span>
                    </div>
                    <div class="page-cart-item-price" style="color: var(--secondary);">+$${item.profit.toFixed(2)}</div>
                </div>
            </div>
        `).join('');
    }
    
    // Summen
    if (salesCartCount) salesCartCount.textContent = totalItems;
    if (salesCartCost) salesCartCost.textContent = totalCost.toFixed(2);
    if (salesCartRevenue) salesCartRevenue.textContent = totalRevenue.toFixed(2);
    if (salesCartProfit) salesCartProfit.textContent = totalProfit.toFixed(2);
    if (salesCartSummary) salesCartSummary.style.display = 'block';
}

async function proceedToSalesCheckout() {
    if (salesCart.length === 0) {
        showToast('Verkaufskorb ist leer', 'error');
        return;
    }
    
    const totalItems = salesCart.reduce((sum, item) => sum + item.quantity, 0);
    const totalRevenue = salesCart.reduce((sum, item) => sum + item.revenue, 0);
    
    if (!confirm(`Möchten Sie ${totalItems} Artikel für $${totalRevenue.toFixed(2)} verkaufen?`)) {
        return;
    }
    
    try {
        // Verkaufe jedes Item im Warenkorb
        for (const item of salesCart) {
            const saleData = {
                purchase_id: null, // Wird automatisch gefunden
                item_name: item.productName,
                quantity: item.quantity,
                unit_cost: item.purchasePrice,
                unit_price: item.salePrice,
                buyer_info: null
            };
            
            const response = await fetch(`${API_URL}/fence/sales`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(saleData)
            });
            
            const result = await response.json();
            
            if (!response.ok || !result.success) {
                showToast(`Fehler beim Verkauf von ${item.productName}: ${result.error || 'Unbekannter Fehler'}`, 'error');
                return;
            }
        }
        
        showToast(`Verkauf erfolgreich: ${totalItems} Artikel für $${totalRevenue.toFixed(2)}`, 'success');
        salesCart = [];
        updateSalesCartDisplay();
        
        // Lade Daten neu
        await loadFenceData();
        await loadSalesProductsGrid();
        loadDashboardStats();
    } catch (error) {
        console.error('Fehler beim Verkaufs-Checkout:', error);
        showToast('Verbindungsfehler beim Verkauf', 'error');
    }
}

// ========== VERKAUFS-PRODUKTE GRID ==========

async function loadSalesProductsGrid() {
    try {
        // Lade Ankäufe die im Lager sind
        const response = await fetch(`${API_URL}/fence/purchases`, {
            credentials: 'include'
        });
        const purchases = await response.json();
        
        const grid = document.getElementById('sales-products-grid');
        
        if (!grid) {
            console.error('sales-products-grid Element nicht gefunden');
            return;
        }
        
        // Filtere nur Ankäufe die im Lager sind
        const warehouseItems = purchases.filter(p => p.stored_in_warehouse);
        
        if (warehouseItems.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <p>Keine Artikel auf Lager</p>
                    <small>Kaufen Sie zuerst Artikel im Schnellankauf-Tab ein und lagern Sie sie ein</small>
                </div>
            `;
            return;
        }
        
        // Gruppiere nach Artikelname
        const itemsMap = new Map();
        warehouseItems.forEach(item => {
            const key = item.item_name;
            if (itemsMap.has(key)) {
                const existing = itemsMap.get(key);
                existing.totalQuantity += item.quantity;
                existing.avgPurchasePrice = ((existing.avgPurchasePrice * existing.count) + (item.unit_price * item.quantity)) / (existing.count + item.quantity);
                existing.count += item.quantity;
                existing.purchaseIds.push(item.id);
            } else {
                itemsMap.set(key, {
                    item_name: item.item_name,
                    totalQuantity: item.quantity,
                    avgPurchasePrice: item.unit_price,
                    count: item.quantity,
                    purchaseIds: [item.id],
                    icon: getIconForCategory(item.item_name),
                    category: getCategoryForItem(item.item_name)
                });
            }
        });
        
        const availableItems = Array.from(itemsMap.values());
        
        grid.innerHTML = availableItems.map(item => {
            const purchasePrice = parseFloat(item.avgPurchasePrice);
            const salePrice = purchasePrice * 1.5; // 50% Aufschlag als Standard
            const profit = salePrice - purchasePrice;
            const margin = ((profit / purchasePrice) * 100).toFixed(1);
            
            return `
                <div class="product-card sales-card">
                    <div class="product-card-header">
                        <div class="product-icon">
                            <i class="fas ${item.icon}"></i>
                        </div>
                        <div class="product-info">
                            <div class="product-name">${item.item_name}</div>
                            <div class="product-category">
                                <i class="fas fa-tag"></i> ${item.category}
                            </div>
                        </div>
                    </div>
                    <div class="stock-info">
                        <i class="fas fa-warehouse"></i>
                        <strong>${item.totalQuantity}</strong> auf Lager
                    </div>
                    <div class="product-prices">
                        <div class="product-price-item">
                            <div class="product-price-label">Ø Einkauf</div>
                            <div class="product-price-value" style="color: var(--danger);">$${purchasePrice.toFixed(2)}</div>
                        </div>
                        <div class="product-price-item">
                            <div class="product-price-label">Verkauf</div>
                            <div class="product-price-value sale">$${salePrice.toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="product-profit-info">
                        <span class="profit-amount">+$${profit.toFixed(2)}</span>
                        <span class="profit-margin">(${margin}%)</span>
                    </div>
                    <div class="product-card-footer">
                        <button class="btn-quick-buy" style="background: var(--secondary);" onclick="showSellItemModal('${item.item_name.replace(/'/g, "\\'")}', ${item.totalQuantity}, ${purchasePrice}, ${salePrice}, '${item.icon}', '${item.category}')">
                            <i class="fas fa-dollar-sign"></i> Verkaufen
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Fehler beim Laden der Lagerartikel:', error);
        const grid = document.getElementById('sales-products-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Fehler beim Laden der Lagerartikel</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
}

// Hilfsfunktionen für Icons und Kategorien
function getIconForCategory(itemName) {
    const name = itemName.toLowerCase();
    if (name.includes('laptop') || name.includes('computer') || name.includes('handy') || name.includes('phone')) return 'fa-laptop';
    if (name.includes('waffe') || name.includes('pistol') || name.includes('gewehr') || name.includes('glock')) return 'fa-gun';
    if (name.includes('gold') || name.includes('schmuck') || name.includes('ring') || name.includes('kette')) return 'fa-gem';
    if (name.includes('uhr') || name.includes('rolex') || name.includes('watch')) return 'fa-watch';
    if (name.includes('auto') || name.includes('car') || name.includes('fahrzeug')) return 'fa-car';
    if (name.includes('droge') || name.includes('hero') || name.includes('kokain')) return 'fa-pills';
    if (name.includes('tv') || name.includes('fernseher')) return 'fa-tv';
    return 'fa-box';
}

function getCategoryForItem(itemName) {
    const name = itemName.toLowerCase();
    if (name.includes('laptop') || name.includes('computer') || name.includes('handy') || name.includes('phone') || name.includes('tv')) return 'Elektronik';
    if (name.includes('waffe') || name.includes('pistol') || name.includes('gewehr') || name.includes('glock')) return 'Waffen';
    if (name.includes('gold') || name.includes('schmuck') || name.includes('ring') || name.includes('kette') || name.includes('uhr') || name.includes('rolex')) return 'Schmuck';
    if (name.includes('auto') || name.includes('car') || name.includes('fahrzeug')) return 'Fahrzeuge';
    if (name.includes('droge') || name.includes('hero') || name.includes('kokain')) return 'Drogen';
    return 'Sonstiges';
}

// Modal für Verkauf eines bestimmten Artikels
function showSellItemModal(itemName, availableQty, purchasePrice, suggestedSalePrice, icon, category) {
    document.getElementById('sell-item-name').value = itemName;
    document.getElementById('sell-max-quantity').value = availableQty;
    document.getElementById('sell-purchase-price').value = purchasePrice;
    document.getElementById('sell-item-icon').value = icon;
    document.getElementById('sell-item-category').value = category;
    
    document.getElementById('sell-item-display-name').textContent = itemName;
    document.getElementById('sell-item-display-category').textContent = category;
    document.getElementById('sell-item-display-icon').innerHTML = `<i class="fas ${icon}"></i>`;
    document.getElementById('sell-item-stock').textContent = availableQty;
    document.getElementById('sell-quantity-hint').textContent = `Max: ${availableQty} Stück`;
    document.getElementById('sell-avg-purchase').textContent = purchasePrice.toFixed(2);
    
    const defaultQuantity = 1;
    document.getElementById('sell-quantity').value = defaultQuantity;
    document.getElementById('sell-quantity').max = availableQty;
    document.getElementById('sell-unit-price').value = suggestedSalePrice.toFixed(2);
    document.getElementById('sell-total-price').value = (defaultQuantity * suggestedSalePrice).toFixed(2);
    document.getElementById('sell-buyer-info').value = '';
    
    updateSellCalculation();
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('sell-item-modal').style.display = 'block';
}

function changeSellQty(delta) {
    const input = document.getElementById('sell-quantity');
    const maxQty = parseInt(document.getElementById('sell-max-quantity').value) || 1;
    const currentValue = parseInt(input.value) || 1;
    const newValue = Math.max(1, Math.min(maxQty, currentValue + delta));
    input.value = newValue;
    
    // Update beide Preisfelder
    const unitPrice = parseFloat(document.getElementById('sell-unit-price').value) || 0;
    const totalPrice = newValue * unitPrice;
    document.getElementById('sell-total-price').value = totalPrice.toFixed(2);
    
    updateSellCalculation();
}

function calculateSellFromQuantity() {
    const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('sell-unit-price').value) || 0;
    
    // Update Gesamtpreis basierend auf Stückpreis
    const totalPrice = quantity * unitPrice;
    document.getElementById('sell-total-price').value = totalPrice.toFixed(2);
    
    updateSellCalculation();
}

function calculateSellFromUnitPrice() {
    const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('sell-unit-price').value) || 0;
    
    // Update Gesamtpreis
    const totalPrice = quantity * unitPrice;
    document.getElementById('sell-total-price').value = totalPrice.toFixed(2);
    
    updateSellCalculation();
}

function calculateSellFromTotalPrice() {
    const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
    const totalPrice = parseFloat(document.getElementById('sell-total-price').value) || 0;
    
    // Update Stückpreis basierend auf Gesamtpreis
    if (quantity > 0) {
        const unitPrice = totalPrice / quantity;
        document.getElementById('sell-unit-price').value = unitPrice.toFixed(2);
    }
    
    updateSellCalculation();
}

function updateSellCalculation() {
    const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
    const purchasePrice = parseFloat(document.getElementById('sell-purchase-price').value) || 0;
    const totalPrice = parseFloat(document.getElementById('sell-total-price').value) || 0;
    
    const totalCost = quantity * purchasePrice;
    const totalRevenue = totalPrice;
    const totalProfit = totalRevenue - totalCost;
    const margin = totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(1) : 0;
    
    document.getElementById('sell-total-cost').textContent = totalCost.toFixed(2);
    document.getElementById('sell-total-revenue').textContent = totalRevenue.toFixed(2);
    document.getElementById('sell-total-profit').textContent = totalProfit.toFixed(2);
    document.getElementById('sell-margin').textContent = margin;
}

function calculateSellTotal() {
    // Alte Funktion für Kompatibilität - ruft neue Funktion auf
    calculateSellFromQuantity();
}

// Sell Item Form Submit
const sellItemForm = document.getElementById('sell-item-form');
if (sellItemForm) {
    sellItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const itemName = document.getElementById('sell-item-name').value;
        const icon = document.getElementById('sell-item-icon').value;
        const category = document.getElementById('sell-item-category').value;
        const quantity = parseInt(document.getElementById('sell-quantity').value);
        const maxQty = parseInt(document.getElementById('sell-max-quantity').value);
        const purchasePrice = parseFloat(document.getElementById('sell-purchase-price').value);
        const salePrice = parseFloat(document.getElementById('sell-unit-price').value);
        
        if (quantity > maxQty) {
            showToast(`Nur ${maxQty} auf Lager!`, 'error');
            return;
        }
        
        if (quantity < 1 || salePrice < 0) {
            showToast('Bitte gültige Werte eingeben', 'error');
            return;
        }
        
        const cost = purchasePrice * quantity;
        const revenue = salePrice * quantity;
        const profit = revenue - cost;
        
        addToSalesCart(
            Date.now(),
            itemName,
            icon,
            category,
            purchasePrice,
            salePrice,
            quantity,
            cost,
            revenue,
            profit
        );
        
        closeModals();
        showToast(`${quantity}x ${itemName} zum Verkaufskorb hinzugefügt`, 'success');
    });
}

function filterSalesProducts() {
    const searchTerm = document.getElementById('sales-product-search').value.toLowerCase();
    const cards = document.querySelectorAll('#sales-products-grid .product-card');
    
    cards.forEach(card => {
        const name = card.querySelector('.product-name').textContent.toLowerCase();
        const category = card.querySelector('.product-category').textContent.toLowerCase();
        
        if (name.includes(searchTerm) || category.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// ========== INTELLIGENCE SYSTEM ==========

async function loadIntelligence() {
    try {
        const response = await fetch(`${API_URL}/intelligence`, {
            credentials: 'include'
        });
        const intel = await response.json();
        
        const grid = document.getElementById('intelligence-grid');
        
        // Check if intel is an array
        if (!Array.isArray(intel)) {
            console.error('Intelligence data is not an array:', intel);
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Fehler beim Laden der Kontakte</p>
                </div>
            `;
            return;
        }
        
        if (intel.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-address-book"></i>
                    <p>Keine Kontakte vorhanden</p>
                    <button class="btn-primary" onclick="showAddIntelModal()">
                        <i class="fas fa-plus"></i> Ersten Kontakt hinzufügen
                    </button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = intel.map(item => {
            const isGang = item.category === 'Gang';
            const categoryIcon = isGang ? 'fa-users' : 'fa-user';
            const gangColor = item.color || '#9c27b0';
            const iconStyle = isGang ? `style="background: ${gangColor}15; color: ${gangColor}; border-color: ${gangColor}50;"` : '';
            const cardStyle = isGang ? `style="border-left-color: ${gangColor};"` : '';
            const phone = item.source || 'Keine Telefonnummer';
            
            // Get gang members (persons associated with this gang)
            const gangMembers = isGang ? intel.filter(p => p.category === 'Person' && p.gang_id === item.id) : [];
            
            // Get gang info for person
            const personGang = !isGang && item.gang_id ? intel.find(g => g.id === item.gang_id) : null;
            
            return `
                <div class="intel-card ${isGang ? 'gang-card' : 'person-card'}" data-category="${item.category}" ${cardStyle}>
                    <div class="intel-header">
                        <div class="intel-icon ${isGang ? 'gang-icon' : 'person-icon'}" ${iconStyle}>
                            <i class="fas ${categoryIcon}"></i>
                        </div>
                        <div class="intel-meta">
                            <span class="intel-category">${item.category}</span>
                        </div>
                    </div>
                    <div class="intel-body">
                        <h3 class="intel-title">${item.subject_name}</h3>
                        ${!isGang ? `
                            <div class="intel-subject">
                                <i class="fas fa-phone"></i> ${phone}
                            </div>
                        ` : ''}
                        ${!isGang && personGang ? `
                            <div class="intel-gang-badge" style="background: ${personGang.color}20; color: ${personGang.color}; border-color: ${personGang.color}50;">
                                <i class="fas fa-users"></i> ${personGang.subject_name}
                            </div>
                        ` : ''}
                        ${item.description ? `<p class="intel-description">${item.description}</p>` : ''}
                        ${isGang && gangMembers.length > 0 ? `
                            <div class="intel-members">
                                <strong><i class="fas fa-users"></i> Mitglieder (${gangMembers.length}):</strong>
                                <div class="members-list">
                                    ${gangMembers.map(m => `<span class="member-tag"><i class="fas fa-user"></i> ${m.subject_name}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="intel-footer">
                        <div class="intel-info">
                            <small>
                                <i class="fas fa-user"></i> ${item.added_by_name || 'Unbekannt'}
                                <br><i class="fas fa-clock"></i> ${new Date(item.created_at).toLocaleDateString('de-DE')}
                            </small>
                        </div>
                        <div class="intel-actions">
                            <button class="btn-edit" onclick="editIntel(${item.id})" title="Bearbeiten">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-delete" onclick="deleteIntel(${item.id}, '${item.subject_name.replace(/'/g, "\\'")}')}" title="Löschen">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Kontakte:', error);
    }
}

function toggleTypeFields() {
    const category = document.getElementById('intel-category').value;
    const gangFields = document.getElementById('gang-fields');
    const personFields = document.getElementById('person-fields');
    const personGangField = document.getElementById('person-gang-field');
    const nameLabel = document.getElementById('intel-name-label');
    
    if (category === 'Gang') {
        gangFields.style.display = 'block';
        personFields.style.display = 'none';
        personGangField.style.display = 'none';
        nameLabel.textContent = 'Gang Name *';
        document.getElementById('intel-subject').placeholder = 'z.B. Los Santos Vagos';
    } else {
        gangFields.style.display = 'none';
        personFields.style.display = 'block';
        personGangField.style.display = 'block';
        nameLabel.textContent = 'Name *';
        document.getElementById('intel-subject').placeholder = 'z.B. John Doe';
    }
}

async function showAddIntelModal() {
    document.getElementById('intel-modal-title').textContent = 'Neuer Kontakt';
    document.getElementById('intel-form').reset();
    document.getElementById('intel-id').value = '';
    await loadGangsForDropdown();
    toggleTypeFields(); // Initialize fields based on default Person selection
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('intel-modal').style.display = 'block';
}

async function loadGangsForDropdown() {
    try {
        const response = await fetch(`${API_URL}/intelligence`, {
            credentials: 'include'
        });
        const intel = await response.json();
        
        if (!Array.isArray(intel)) return;
        
        const gangs = intel.filter(item => item.category === 'Gang');
        const select = document.getElementById('intel-gang-id');
        
        select.innerHTML = '<option value="">Keine Gang</option>' + 
            gangs.map(gang => `<option value="${gang.id}">${gang.subject_name}</option>`).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Gangs:', error);
    }
}

async function editIntel(id) {
    try {
        const response = await fetch(`${API_URL}/intelligence/${id}`, {
            credentials: 'include'
        });
        const intel = await response.json();
        
        document.getElementById('intel-modal-title').textContent = 'Kontakt bearbeiten';
        document.getElementById('intel-id').value = intel.id;
        document.getElementById('intel-category').value = intel.category;
        document.getElementById('intel-subject').value = intel.subject_name;
        document.getElementById('intel-description').value = intel.description || '';
        document.getElementById('intel-source').value = intel.source || '';
        document.getElementById('intel-color').value = intel.color || '#9c27b0';
        
        await loadGangsForDropdown();
        document.getElementById('intel-gang-id').value = intel.gang_id || '';
        
        toggleTypeFields();
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('intel-modal').style.display = 'block';
    } catch (error) {
        console.error('Fehler beim Laden des Kontakts:', error);
        showToast('Fehler beim Laden des Kontakts', 'error');
    }
}

async function deleteIntel(id, name) {
    try {
        // Prüfe zuerst, ob es eine Gang mit zugeordneten Personen ist
        const checkResponse = await fetch(`${API_URL}/intelligence`, {
            credentials: 'include'
        });
        const allIntel = await checkResponse.json();
        
        const item = Array.isArray(allIntel) ? allIntel.find(i => i.id === id) : null;
        const isGang = item && item.category === 'Gang';
        
        let confirmMessage = `Möchten Sie "${name}" wirklich löschen?`;
        
        if (isGang) {
            const associatedPersons = allIntel.filter(i => i.category === 'Person' && i.gang_id === id);
            if (associatedPersons.length > 0) {
                confirmMessage = `Gang "${name}" löschen?\n\n⚠️ ${associatedPersons.length} Person(en) sind dieser Gang zugeordnet:\n${associatedPersons.map(p => '• ' + p.subject_name).join('\n')}\n\nDiese Personen bleiben erhalten, werden aber von der Gang entfernt.`;
            }
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        const response = await fetch(`${API_URL}/intelligence/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast(result.message || 'Kontakt gelöscht', 'success');
            loadIntelligence();
        } else {
            showToast(result.error || 'Fehler beim Löschen', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        showToast('Verbindungsfehler', 'error');
    }
}

document.getElementById('intel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('intel-id').value;
    const category = document.getElementById('intel-category').value;
    const data = {
        category: category,
        title: category, // Use category as title
        subject_name: document.getElementById('intel-subject').value,
        description: document.getElementById('intel-description').value,
        importance: 'Mittel', // Default
        status: 'Aktuell', // Default
        source: category === 'Person' ? document.getElementById('intel-source').value : null,
        tags: null,
        color: category === 'Gang' ? document.getElementById('intel-color').value : null,
        gang_id: category === 'Person' ? (document.getElementById('intel-gang-id').value || null) : null
    };
    
    try {
        const url = id ? `${API_URL}/intelligence/${id}` : `${API_URL}/intelligence`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast(id ? 'Kontakt aktualisiert' : 'Kontakt hinzugefügt', 'success');
            closeModals();
            loadIntelligence();
        } else {
            showToast(result.error || 'Fehler beim Speichern', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Verbindungsfehler', 'error');
    }
});

function filterIntelligence() {
    const searchTerm = document.getElementById('intel-search').value.toLowerCase();
    const categoryFilter = document.getElementById('intel-filter-category').value;
    
    const cards = document.querySelectorAll('.intel-card');
    
    cards.forEach(card => {
        const category = card.getAttribute('data-category');
        const text = card.textContent.toLowerCase();
        
        const matchesSearch = text.includes(searchTerm);
        const matchesCategory = !categoryFilter || category === categoryFilter;
        
        if (matchesSearch && matchesCategory) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// ========== REZEPTE FUNKTIONEN ==========

let allRecipes = [];
let ingredientCounter = 0;

async function loadRecipes() {
    try {
        const response = await fetch(`${API_URL}/recipes`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Laden der Rezepte');
        }
        
        allRecipes = await response.json();
        displayRecipes(allRecipes);
    } catch (error) {
        console.error('Fehler beim Laden der Rezepte:', error);
        showToast('Fehler beim Laden der Rezepte', 'error');
    }
}

function displayRecipes(recipes) {
    const container = document.getElementById('recipes-container');
    const emptyState = document.getElementById('recipes-empty');
    
    if (recipes.length === 0) {
        container.style.display = 'none';
        if (emptyState) {
            emptyState.innerHTML = `
                <i class="fas fa-book-open"></i>
                <h3>Keine Rezepte vorhanden</h3>
                <p>Erstelle dein erstes Rezept, um loszulegen!</p>
            `;
            emptyState.style.display = 'block';
        }
        return;
    }
    
    container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    
    // Kategorie-Icons definieren
    const categoryIcons = {
        'Waffen': 'fa-gun',
        'Drogen': 'fa-pills',
        'Ausrüstung': 'fa-vest',
        'Fahrzeuge': 'fa-car',
        'Sonstiges': 'fa-box'
    };
    
    // Kategorie-Farben definieren
    const categoryColors = {
        'Waffen': '#ef4444',
        'Drogen': '#8b5cf6',
        'Ausrüstung': '#3b82f6',
        'Fahrzeuge': '#f59e0b',
        'Sonstiges': '#6b7280'
    };
    
    container.innerHTML = recipes.map(recipe => `
        <div class="recipe-card" data-category="${recipe.category}">
            <div class="recipe-card-image-wrapper">
                ${recipe.product_image ? `
                    <div class="recipe-image">
                        <img src="${recipe.product_image}" alt="${recipe.recipe_name}" onerror="this.parentElement.innerHTML='<div class=\\'recipe-no-image\\'><i class=\\'fas fa-image\\'></i></div>'">
                    </div>
                ` : `
                    <div class="recipe-no-image">
                        <i class="fas ${categoryIcons[recipe.category] || 'fa-box'}"></i>
                    </div>
                `}
                <span class="recipe-category-badge" style="background: ${categoryColors[recipe.category] || '#6b7280'};">
                    <i class="fas ${categoryIcons[recipe.category] || 'fa-box'}"></i>
                    ${recipe.category}
                </span>
            </div>
            <div class="recipe-card-body">
                <div class="recipe-card-header">
                    <h3>${recipe.recipe_name}</h3>
                    <div class="recipe-card-actions">
                        <button class="btn-icon-small" onclick="showEditRecipeModal(${recipe.id})" title="Bearbeiten">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-small btn-delete" onclick="deleteRecipe(${recipe.id}, '${recipe.recipe_name.replace(/'/g, "\\'")}')" title="Löschen">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                ${recipe.description ? `<p class="recipe-description">${recipe.description.length > 100 ? recipe.description.substring(0, 100) + '...' : recipe.description}</p>` : ''}
                
                <div class="recipe-info-grid">
                    ${recipe.crafting_time > 0 ? `
                        <div class="recipe-info-item">
                            <i class="fas fa-clock"></i>
                            <span>${recipe.crafting_time} Min</span>
                        </div>
                    ` : ''}
                    ${recipe.output_quantity > 1 ? `
                        <div class="recipe-info-item">
                            <i class="fas fa-layer-group"></i>
                            <span>${recipe.output_quantity}x pro Herstellung</span>
                        </div>
                    ` : ''}
                    <div class="recipe-info-item">
                        <i class="fas fa-list"></i>
                        <span>${recipe.ingredient_count || 0} Zutaten</span>
                    </div>
                </div>
                
                ${recipe.notes ? `
                    <div class="recipe-notes-preview">
                        <i class="fas fa-sticky-note"></i>
                        <span>${recipe.notes.length > 50 ? recipe.notes.substring(0, 50) + '...' : recipe.notes}</span>
                    </div>
                ` : ''}
            </div>
            <div class="recipe-card-footer">
                <button class="btn-view-recipe" onclick="viewRecipeDetails(${recipe.id})">
                    <i class="fas fa-eye"></i> Details anzeigen
                </button>
            </div>
        </div>
    `).join('');
}

function showAddRecipeModal() {
    document.getElementById('recipe-modal-title').textContent = 'Neues Rezept';
    document.getElementById('recipe-form').reset();
    document.getElementById('recipe-id').value = '';
    
    // Bild-Preview zurücksetzen
    const preview = document.getElementById('recipe-image-preview');
    preview.innerHTML = '<i class="fas fa-image"></i><span>Bild auswählen oder per URL eingeben</span>';
    preview.style.backgroundImage = '';
    document.getElementById('recipe-image-url').value = '';
    
    // Zutaten-Container leeren und eine leere Zeile hinzufügen
    const container = document.getElementById('ingredients-container');
    container.innerHTML = '';
    ingredientCounter = 0;
    addIngredientRow();
    
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('recipe-modal').style.display = 'block';
}

async function showEditRecipeModal(id) {
    try {
        const response = await fetch(`${API_URL}/recipes/${id}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Laden des Rezepts');
        }
        
        const recipe = await response.json();
        
        document.getElementById('recipe-modal-title').textContent = 'Rezept bearbeiten';
        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-name').value = recipe.recipe_name;
        document.getElementById('recipe-category').value = recipe.category;
        document.getElementById('recipe-description').value = recipe.description || '';
        document.getElementById('recipe-time').value = recipe.crafting_time || 0;
        document.getElementById('recipe-output').value = recipe.output_item || '';
        document.getElementById('recipe-output-quantity').value = recipe.output_quantity || 1;
        document.getElementById('recipe-notes').value = recipe.notes || '';
        
        // Bild laden
        if (recipe.product_image) {
            const preview = document.getElementById('recipe-image-preview');
            preview.style.backgroundImage = `url(${recipe.product_image})`;
            preview.innerHTML = '';
            document.getElementById('recipe-image-url').value = recipe.product_image;
        }
        
        // Zutaten laden
        const container = document.getElementById('ingredients-container');
        container.innerHTML = '';
        ingredientCounter = 0;
        
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => {
                addIngredientRow(ing.ingredient_name, ing.quantity, ing.unit);
            });
        } else {
            addIngredientRow();
        }
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('recipe-modal').style.display = 'block';
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Laden des Rezepts', 'error');
    }
}

function addIngredientRow(name = '', quantity = '', unit = '') {
    const container = document.getElementById('ingredients-container');
    const id = ingredientCounter++;
    
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.id = `ingredient-row-${id}`;
    row.innerHTML = `
        <input type="text" 
               class="ingredient-name" 
               placeholder="Zutat" 
               value="${name}" 
               required>
        <input type="number" 
               class="ingredient-quantity" 
               placeholder="Menge" 
               value="${quantity}" 
               min="1" 
               required>
        <input type="text" 
               class="ingredient-unit" 
               placeholder="Einheit" 
               value="${unit}">
        <button type="button" 
                class="btn-icon btn-danger" 
                onclick="removeIngredientRow(${id})"
                ${container.children.length === 0 ? 'disabled' : ''}>
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(row);
}

function removeIngredientRow(id) {
    const row = document.getElementById(`ingredient-row-${id}`);
    const container = document.getElementById('ingredients-container');
    
    // Mindestens eine Zutat muss bleiben
    if (container.children.length > 1) {
        row.remove();
    } else {
        showToast('Mindestens eine Zutat erforderlich', 'warning');
    }
}

async function viewRecipeDetails(id) {
    try {
        const response = await fetch(`${API_URL}/recipes/${id}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Laden des Rezepts');
        }
        
        const recipe = await response.json();
        
        // Kategorie-Icons
        const categoryIcons = {
            'Waffen': 'fa-gun',
            'Drogen': 'fa-pills',
            'Ausrüstung': 'fa-toolbox',
            'Fahrzeuge': 'fa-car',
            'Sonstiges': 'fa-box'
        };
        const categoryIcon = categoryIcons[recipe.category] || 'fa-box';
        
        // Zutaten-Liste erstellen
        const ingredientsList = recipe.ingredients.map(ing => 
            `<div class="ingredient-item">
                <span class="ingredient-name-display">${ing.ingredient_name}</span>
                <span class="ingredient-qty">${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}</span>
            </div>`
        ).join('');
        
        // Content erstellen
        const content = `
            <div class="recipe-detail-header">
                ${recipe.product_image ? 
                    `<div class="recipe-detail-image" style="background-image: url('${recipe.product_image}')"></div>` : 
                    `<div class="recipe-detail-image recipe-detail-no-image"><i class="fas fa-image"></i></div>`
                }
                <div class="recipe-detail-info">
                    <div class="recipe-detail-category">
                        <i class="fas ${categoryIcon}"></i> ${recipe.category}
                    </div>
                    ${recipe.crafting_time > 0 ? 
                        `<div class="recipe-detail-time"><i class="fas fa-clock"></i> ${recipe.crafting_time} Minuten</div>` : ''
                    }
                </div>
            </div>
            
            ${recipe.description ? `
                <div class="recipe-detail-section">
                    <h4><i class="fas fa-info-circle"></i> Beschreibung</h4>
                    <p>${recipe.description}</p>
                </div>
            ` : ''}
            
            ${recipe.output_item ? `
                <div class="recipe-detail-section recipe-detail-output">
                    <h4><i class="fas fa-arrow-right"></i> Ergebnis</h4>
                    <div class="output-display">
                        <span class="output-item">${recipe.output_item}</span>
                        <span class="output-quantity">x${recipe.output_quantity || 1}</span>
                    </div>
                </div>
            ` : ''}
            
            <div class="recipe-detail-section">
                <h4><i class="fas fa-list"></i> Benötigte Zutaten</h4>
                <div class="ingredients-list">
                    ${ingredientsList}
                </div>
            </div>
            
            ${recipe.notes ? `
                <div class="recipe-detail-section recipe-detail-notes">
                    <h4><i class="fas fa-sticky-note"></i> Notizen</h4>
                    <p>${recipe.notes}</p>
                </div>
            ` : ''}
        `;
        
        document.getElementById('recipe-detail-title').textContent = recipe.recipe_name;
        document.getElementById('recipe-detail-content').innerHTML = content;
        document.getElementById('recipe-detail-edit-btn').onclick = () => {
            closeModals();
            showEditRecipeModal(id);
        };
        
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('recipe-detail-modal').style.display = 'block';
    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Laden der Details', 'error');
    }
}

document.getElementById('recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('recipe-id').value;
    const recipeName = document.getElementById('recipe-name').value;
    const category = document.getElementById('recipe-category').value;
    const description = document.getElementById('recipe-description').value;
    const craftingTime = document.getElementById('recipe-time').value;
    const outputItem = document.getElementById('recipe-output').value;
    const outputQuantity = document.getElementById('recipe-output-quantity').value;
    const notes = document.getElementById('recipe-notes').value;
    
    // Zutaten sammeln
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    const ingredients = [];
    
    for (const row of ingredientRows) {
        const name = row.querySelector('.ingredient-name').value.trim();
        const quantity = parseInt(row.querySelector('.ingredient-quantity').value);
        const unit = row.querySelector('.ingredient-unit').value.trim();
        
        if (name && quantity) {
            ingredients.push({
                ingredient_name: name,
                quantity: quantity,
                unit: unit
            });
        }
    }
    
    if (ingredients.length === 0) {
        showToast('Mindestens eine Zutat erforderlich', 'warning');
        return;
    }
    
    // Bild-URL ermitteln
    let productImage = document.getElementById('recipe-image-url').value.trim();
    if (!productImage) {
        const fileInput = document.getElementById('recipe-image');
        if (fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                productImage = e.target.result;
                saveRecipe(id, recipeName, category, description, craftingTime, outputItem, outputQuantity, notes, ingredients, productImage);
            };
            reader.readAsDataURL(fileInput.files[0]);
            return;
        }
    }
    
    saveRecipe(id, recipeName, category, description, craftingTime, outputItem, outputQuantity, notes, ingredients, productImage);
});

async function saveRecipe(id, recipeName, category, description, craftingTime, outputItem, outputQuantity, notes, ingredients, productImage) {
    const data = {
        recipe_name: recipeName,
        category: category,
        description: description,
        crafting_time: parseInt(craftingTime) || 0,
        output_item: outputItem,
        output_quantity: parseInt(outputQuantity) || 1,
        product_image: productImage,
        notes: notes,
        ingredients: ingredients
    };
    
    try {
        const url = id ? `${API_URL}/recipes/${id}` : `${API_URL}/recipes`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        // Prüfe ob Antwort JSON ist
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Server returned non-JSON:', text);
            showToast('Server-Fehler: Keine JSON-Antwort', 'error');
            return;
        }
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast(id ? 'Rezept aktualisiert' : 'Rezept hinzugefügt', 'success');
            closeModals();
            loadRecipes();
        } else {
            showToast(result.error || 'Fehler beim Speichern', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Verbindungsfehler', 'error');
    }
}

async function deleteRecipe(id, name) {
    if (!confirm(`Möchten Sie das Rezept "${name}" wirklich löschen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/recipes/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showToast('Rezept gelöscht', 'success');
            loadRecipes();
        } else {
            showToast(result.error || 'Fehler beim Löschen', 'error');
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        showToast('Verbindungsfehler', 'error');
    }
}

// Bild-Vorschau und Upload Funktionen
function previewRecipeImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('recipe-image-preview');
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.innerHTML = '';
            document.getElementById('recipe-image-url').value = '';
        };
        reader.readAsDataURL(file);
    }
}

function loadRecipeImageFromUrl() {
    const url = document.getElementById('recipe-image-url').value.trim();
    if (url) {
        const preview = document.getElementById('recipe-image-preview');
        preview.style.backgroundImage = `url(${url})`;
        preview.innerHTML = '';
        document.getElementById('recipe-image').value = '';
    }
}

// Variable für aktuellen Kategorie-Filter
let currentRecipeCategory = '';

function setRecipeCategory(btn, category) {
    // Alle Buttons deaktivieren
    document.querySelectorAll('.recipe-filter-btn').forEach(b => b.classList.remove('active'));
    // Aktuellen Button aktivieren
    btn.classList.add('active');
    // Kategorie setzen
    currentRecipeCategory = category;
    // Filter anwenden
    filterRecipes();
}

function filterRecipes() {
    const searchTerm = document.getElementById('recipe-search').value.toLowerCase();
    const categoryFilter = currentRecipeCategory;
    
    const cards = document.querySelectorAll('.recipe-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const category = card.getAttribute('data-category');
        const text = card.textContent.toLowerCase();
        
        const matchesSearch = text.includes(searchTerm);
        const matchesCategory = !categoryFilter || category === categoryFilter;
        
        if (matchesSearch && matchesCategory) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Empty State anzeigen/verstecken
    const emptyState = document.getElementById('recipes-empty');
    const container = document.getElementById('recipes-container');
    if (emptyState) {
        if (visibleCount === 0 && cards.length > 0) {
            emptyState.style.display = 'block';
            container.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            container.style.display = 'grid';
        }
    }
}
