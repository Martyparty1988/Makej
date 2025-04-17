// Globální proměnné a nastavení
const RATES = {
    'maru': 275,
    'marty': 400
};

const DEDUCTION_RATES = {
    'maru': 0.3333, // 1/3
    'marty': 0.5    // 1/2
};

// Inicializace aplikace po načtení dokumentu
document.addEventListener('DOMContentLoaded', function() {
    // Inicializace databáze (IndexedDB)
    initDatabase().then(() => {
        console.log('Databáze inicializována');
        
        // Načtení a zpracování dat
        loadAllData();
    });

    // Nastavení aktuálního roku v patičce
    document.getElementById('footer-year').textContent = new Date().getFullYear();

    // Inicializace tmavého režimu
    initThemeToggle();

    // Inicializace navigace
    initNavigation();

    // Inicializace časovače
    initTimer();

    // Formulář pro ruční zadání záznamu
    initManualEntryForm();

    // Formulář pro přidání finančního záznamu
    initFinanceForm();

    // Inicializace správy dluhů
    initDebtManagement();

    // Inicializace filtrů a přehledů
    initFilters();

    // Inicializace grafů
    initCharts();

    // Inicializace exportu dat
    initExportFunctions();

    // Inicializace nastavení
    initSettings();

    // Nastavení dnešního data ve formulářích
    setTodaysDate();

    // Inicializace rychlých akcí
    initQuickActions();

    // Kontrola platby nájmu
    checkRentPayment();

    // Inicializace notifikací
    initNotifications();
});

// ===== DATABÁZE A PERZISTENCE =====
let db;

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WorkTrackerDB', 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;

            // Work logs store
            if (!db.objectStoreNames.contains('workLogs')) {
                const workLogsStore = db.createObjectStore('workLogs', { keyPath: 'id' });
                workLogsStore.createIndex('person', 'person', { unique: false });
                workLogsStore.createIndex('startTime', 'startTime', { unique: false });
            }

            // Finance records store
            if (!db.objectStoreNames.contains('financeRecords')) {
                const financeStore = db.createObjectStore('financeRecords', { keyPath: 'id' });
                financeStore.createIndex('type', 'type', { unique: false });
                financeStore.createIndex('date', 'date', { unique: false });
            }

            // Categories stores
            if (!db.objectStoreNames.contains('taskCategories')) {
                db.createObjectStore('taskCategories', { keyPath: 'name' });
            }

            if (!db.objectStoreNames.contains('expenseCategories')) {
                db.createObjectStore('expenseCategories', { keyPath: 'name' });
            }

            // Debts store
            if (!db.objectStoreNames.contains('debts')) {
                const debtsStore = db.createObjectStore('debts', { keyPath: 'id' });
                debtsStore.createIndex('person', 'person', { unique: false });
                debtsStore.createIndex('date', 'date', { unique: false });
            }

            // Debt payments store
            if (!db.objectStoreNames.contains('debtPayments')) {
                const paymentsStore = db.createObjectStore('debtPayments', { keyPath: 'id' });
                paymentsStore.createIndex('debtId', 'debtId', { unique: false });
                paymentsStore.createIndex('date', 'date', { unique: false });
            }

            // Settings store
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            // Shared budget store
            if (!db.objectStoreNames.contains('sharedBudget')) {
                db.createObjectStore('sharedBudget', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            
            // Inicializační data při prvním spuštění
            initializeDefaultData();
            
            resolve();
        };

        request.onerror = function(event) {
            console.error('Chyba při otevírání databáze:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function initializeDefaultData() {
    // Kontrola, zda již existují data
    const settings = await getSettings('initialized');
    if (settings && settings.value) return;

    // Výchozí kategorie úkolů
    const taskCategories = [
        'Wellness', 
        'Příprava vily', 
        'Pracovní hovor', 
        'Marketing', 
        'Administrativa'
    ];
    
    for (const category of taskCategories) {
        await addTaskCategory(category);
    }

    // Výchozí kategorie výdajů
    const expenseCategories = [
        'Nákupy', 
        'Účty', 
        'Nájem', 
        'Doprava', 
        'Zábava', 
        'Jídlo'
    ];
    
    for (const category of expenseCategories) {
        await addExpenseCategory(category);
    }

    // Výchozí nastavení nájmu
    await saveSettings('rentAmount', 24500);
    await saveSettings('rentDay', 1);
    
    // Inicializace společného rozpočtu
    await saveSharedBudget({
        balance: 0,
        lastUpdated: new Date().toISOString()
    });

    // Označení, že byla data inicializována
    await saveSettings('initialized', true);
    await saveSettings('theme', 'light');
    await saveSettings('colorTheme', 'blue');
}

// Společný rozpočet
async function saveSharedBudget(budgetData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sharedBudget'], 'readwrite');
        const store = transaction.objectStore('sharedBudget');
        
        const request = store.put(budgetData);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getSharedBudget() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sharedBudget'], 'readonly');
        const store = transaction.objectStore('sharedBudget');
        
        const request = store.getAll();
        
        request.onsuccess = () => {
            if (request.result.length > 0) {
                resolve(request.result[0]);
            } else {
                resolve({ balance: 0, lastUpdated: new Date().toISOString() });
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateSharedBudget(amount) {
    const budget = await getSharedBudget();
    budget.balance += amount;
    budget.lastUpdated = new Date().toISOString();
    await saveSharedBudget(budget);
    
    // Aktualizace UI
    document.getElementById('shared-budget').textContent = formatCurrency(budget.balance);
    
    // Kontrola splácení dluhů z přebytku v rozpočtu
    if (budget.balance > 0) {
        await checkDebtPayments();
    }
}

// Nastavení
async function saveSettings(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        
        const request = store.put({ key, value });
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getSettings(key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Work logs
async function saveWorkLog(workLog) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.put(workLog);
        
        request.onsuccess = () => {
            resolve(request.result);
            
            // Aktualizace UI a přidání srážky do společného rozpočtu
            const deductionRate = DEDUCTION_RATES[workLog.person];
            const deduction = Math.round(workLog.earnings * deductionRate);
            
            updateSharedBudget(deduction);
            loadRecentWorkLogs();
            updateTodaySummary();
            loadDeductionsSummary();
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateWorkLog(workLog) {
    // Nejprve získáme starý záznam pro výpočet rozdílu srážky
    const oldWorkLog = await getWorkLog(workLog.id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.put(workLog);
        
        request.onsuccess = async () => {
            // Výpočet rozdílu srážky mezi starým a novým záznamem
            if (oldWorkLog) {
                const oldDeduction = Math.round(oldWorkLog.earnings * DEDUCTION_RATES[oldWorkLog.person]);
                const newDeduction = Math.round(workLog.earnings * DEDUCTION_RATES[workLog.person]);
                const deductionDifference = newDeduction - oldDeduction;
                
                // Aktualizace společného rozpočtu o rozdíl
                if (deductionDifference !== 0) {
                    await updateSharedBudget(deductionDifference);
                }
            }
            
            // Aktualizace UI
            loadRecentWorkLogs();
            updateTodaySummary();
            loadDeductionsSummary();
            loadWorkLogs();
            
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function getWorkLog(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readonly');
        const store = transaction.objectStore('workLogs');
        
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteWorkLog(id) {
    // Nejprve získáme záznam, abychom mohli odebrat správnou částku ze společného rozpočtu
    const workLog = await getWorkLog(id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.delete(id);
        
        request.onsuccess = async () => {
            // Odebrat srážku ze společného rozpočtu
            if (workLog) {
                const deduction = Math.round(workLog.earnings * DEDUCTION_RATES[workLog.person]);
                await updateSharedBudget(-deduction);
            }
            
            // Aktualizace UI
            loadRecentWorkLogs();
            updateTodaySummary();
            loadDeductionsSummary();
            loadWorkLogs();
            
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllWorkLogs(filters = {}) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readonly');
        const store = transaction.objectStore('workLogs');
        
        const request = store.getAll();
        
        request.onsuccess = () => {
            let logs = request.result;
            
            // Aplikace filtrů
            if (filters.person) {
                logs = logs.filter(log => log.person === filters.person);
            }
            
            if (filters.activity) {
                logs = logs.filter(log => log.activity === filters.activity);
            }
            
            if (filters.startDate) {
                const startDate = new Date(filters.startDate);
                startDate.setHours(0, 0, 0, 0);
                logs = logs.filter(log => new Date(log.startTime) >= startDate);
            }
            
            if (filters.endDate) {
                const endDate = new Date(filters.endDate);
                endDate.setHours(23, 59, 59, 999);
                logs = logs.filter(log => new Date(log.startTime) <= endDate);
            }
            
            resolve(logs);
        };
        request.onerror = () => reject(request.error);
    });
}

// Finance records
async function saveFinanceRecord(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.put(record);
        
        request.onsuccess = async () => {
            // Pokud se jedná o výdaj v CZK, odečíst ze společného rozpočtu
            if (record.type === 'expense' && record.currency === 'CZK') {
                await updateSharedBudget(-record.amount);
            }
            
            // Pokud se jedná o příjem v CZK, přičíst do společného rozpočtu
            if (record.type === 'income' && record.currency === 'CZK') {
                await updateSharedBudget(record.amount);
            }
            
            // Aktualizace UI
            loadFinanceRecords();
            updateFinanceSummary();
            
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateFinanceRecord(record) {
    // Nejprve získáme starý záznam pro výpočet rozdílu
    const oldRecord = await getFinanceRecord(record.id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.put(record);
        
        request.onsuccess = async () => {
            // Výpočet rozdílu mezi starým a novým záznamem
            if (oldRecord && oldRecord.currency === 'CZK') {
                let difference = 0;
                
                // Výpočet rozdílu pro výdaj
                if (oldRecord.type === 'expense' && record.type === 'expense') {
                    difference = oldRecord.amount - record.amount;
                }
                // Výpočet rozdílu pro příjem
                else if (oldRecord.type === 'income' && record.type === 'income') {
                    difference = record.amount - oldRecord.amount;
                }
                // Změna typu z výdaje na příjem
                else if (oldRecord.type === 'expense' && record.type === 'income') {
                    difference = oldRecord.amount + record.amount;
                }
                // Změna typu z příjmu na výdaj
                else if (oldRecord.type === 'income' && record.type === 'expense') {
                    difference = -(oldRecord.amount + record.amount);
                }
                
                // Aktualizace společného rozpočtu o rozdíl
                if (difference !== 0 && record.currency === 'CZK') {
                    await updateSharedBudget(difference);
                }
            }
            
            // Aktualizace UI
            loadFinanceRecords();
            updateFinanceSummary();
            
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function getFinanceRecord(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readonly');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFinanceRecord(id) {
    // Nejprve získáme záznam, abychom mohli provést správnou úpravu společného rozpočtu
    const record = await getFinanceRecord(id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.delete(id);
        
        request.onsuccess = async () => {
            // Úprava společného rozpočtu
            if (record && record.currency === 'CZK') {
                if (record.type === 'expense') {
                    await updateSharedBudget(record.amount);
                } else if (record.type === 'income') {
                    await updateSharedBudget(-record.amount);
                }
            }
            
            // Aktualizace UI
            loadFinanceRecords();
            updateFinanceSummary();
            
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllFinanceRecords() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readonly');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Task categories
async function addTaskCategory(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['taskCategories'], 'readwrite');
        const store = transaction.objectStore('taskCategories');
        
        const request = store.put({ name });
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteTaskCategory(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['taskCategories'], 'readwrite');
        const store = transaction.objectStore('taskCategories');
        
        const request = store.delete(name);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllTaskCategories() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['taskCategories'], 'readonly');
        const store = transaction.objectStore('taskCategories');
        
        const request = store.getAll();
        
        request.onsuccess = () => {
            const categories = request.result.map(item => item.name);
            resolve(categories);
        };
        request.onerror = () => reject(request.error);
    });
}

// Expense categories
async function addExpenseCategory(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['expenseCategories'], 'readwrite');
        const store = transaction.objectStore('expenseCategories');
        
        const request = store.put({ name });
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteExpenseCategory(name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['expenseCategories'], 'readwrite');
        const store = transaction.objectStore('expenseCategories');
        
        const request = store.delete(name);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllExpenseCategories() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['expenseCategories'], 'readonly');
        const store = transaction.objectStore('expenseCategories');
        
        const request = store.getAll();
        
        request.onsuccess = () => {
            const categories = request.result.map(item => item.name);
            resolve(categories);
        };
        request.onerror = () => reject(request.error);
    });
}

// Debts
async function saveDebt(debt) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debts'], 'readwrite');
        const store = transaction.objectStore('debts');
        
        const request = store.put(debt);
        
        request.onsuccess = () => {
            resolve(request.result);
            loadDebts();
            loadDebtsForPaymentForm();
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateDebt(debt) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debts'], 'readwrite');
        const store = transaction.objectStore('debts');
        
        const request = store.put(debt);
        
        request.onsuccess = () => {
            resolve(request.result);
            loadDebts();
            loadDebtsForPaymentForm();
        };
        request.onerror = () => reject(request.error);
    });
}

async function getDebt(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debts'], 'readonly');
        const store = transaction.objectStore('debts');
        
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteDebt(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debts', 'debtPayments'], 'readwrite');
        const debtStore = transaction.objectStore('debts');
        const paymentStore = transaction.objectStore('debtPayments');
        const paymentIndex = paymentStore.index('debtId');
        
        // Nejprve smazat dluh
        const debtRequest = debtStore.delete(id);
        
        debtRequest.onsuccess = () => {
            // Poté získat a smazat všechny související platby
            const paymentRequest = paymentIndex.getAllKeys(id);
            
            paymentRequest.onsuccess = () => {
                const paymentIds = paymentRequest.result;
                let deletedCount = 0;
                
                if (paymentIds.length === 0) {
                    resolve();
                    loadDebts();
                    loadDebtsForPaymentForm();
                    return;
                }
                
                paymentIds.forEach(paymentId => {
                    const deleteRequest = paymentStore.delete(paymentId);
                    
                    deleteRequest.onsuccess = () => {
                        deletedCount++;
                        if (deletedCount === paymentIds.length) {
                            resolve();
                            loadDebts();
                            loadDebtsForPaymentForm();
                        }
                    };
                    
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                });
            };
            
            paymentRequest.onerror = () => reject(paymentRequest.error);
        };
        
        debtRequest.onerror = () => reject(debtRequest.error);
    });
}

async function getAllDebts() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debts'], 'readonly');
        const store = transaction.objectStore('debts');
        
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Debt payments
async function savePayment(payment) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debtPayments'], 'readwrite');
        const store = transaction.objectStore('debtPayments');
        
        const request = store.put(payment);
        
        request.onsuccess = () => {
            resolve(request.result);
            loadDebts();
            loadDebtsForPaymentForm();
        };
        request.onerror = () => reject(request.error);
    });
}

async function getPaymentsForDebt(debtId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debtPayments'], 'readonly');
        const store = transaction.objectStore('debtPayments');
        const index = store.index('debtId');
        
        const request = index.getAll(debtId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllPayments() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['debtPayments'], 'readonly');
        const store = transaction.objectStore('debtPayments');
        
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Načtení všech dat pro inicializaci
async function loadAllData() {
    // Načtení kategorií
    await loadCategories();
    
    // Načtení posledních záznamů o práci
    await loadRecentWorkLogs();
    
    // Aktualizace souhrnů
    await updateTodaySummary();
    await updateFinanceSummary();
    
    // Načtení finančních záznamů
    await loadFinanceRecords();
    
    // Načtení dluhů
    await loadDebts();
    await loadDebtsForPaymentForm();
    
    // Načtení přehledu srážek
    await loadDeductionsSummary();
    
    // Aktualizace grafů
    await updateCharts();
}

// ===== TMAVÝ REŽIM =====
async function initThemeToggle() {
    const themeSetting = await getSettings('theme');
    const theme = themeSetting ? themeSetting.value : 'light';
    
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('checkbox').checked = true;
        document.getElementById('theme-toggle').checked = true;
    }
    
    // Přepínač v hlavičce
    document.getElementById('checkbox').addEventListener('change', async function() {
        document.body.classList.toggle('dark-mode');
        await saveSettings('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        document.getElementById('theme-toggle').checked = document.body.classList.contains('dark-mode');
    });
    
    // Přepínač v nastavení
    document.getElementById('theme-toggle').addEventListener('change', async function() {
        document.body.classList.toggle('dark-mode');
        await saveSettings('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        document.getElementById('checkbox').checked = document.body.classList.contains('dark-mode');
    });
    
    // Nastavení barevného schématu
    const colorThemeSetting = await getSettings('colorTheme');
    const colorTheme = colorThemeSetting ? colorThemeSetting.value : 'blue';
    
    document.documentElement.style.setProperty('--primary-color', getColorValue(colorTheme));
    document.documentElement.style.setProperty('--primary-light', getLightColorValue(colorTheme));
    document.documentElement.style.setProperty('--primary-dark', getDarkColorValue(colorTheme));
    
    // Označení aktivní barvy
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-color') === colorTheme) {
            option.classList.add('active');
        }
    });
    
    // Nastavení posluchače událostí pro barevné přepínače
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', async function() {
            const color = this.getAttribute('data-color');
            document.documentElement.style.setProperty('--primary-color', getColorValue(color));
            document.documentElement.style.setProperty('--primary-light', getLightColorValue(color));
            document.documentElement.style.setProperty('--primary-dark', getDarkColorValue(color));
            
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            await saveSettings('colorTheme', color);
        });
    });
}

function getColorValue(color) {
    switch(color) {
        case 'blue': return '#0d6efd';
        case 'green': return '#28a745';
        case 'purple': return '#6f42c1';
        case 'orange': return '#fd7e14';
        default: return '#0d6efd';
    }
}

function getLightColorValue(color) {
    switch(color) {
        case 'blue': return '#4d94ff';
        case 'green': return '#48d368';
        case 'purple': return '#9270d8';
        case 'orange': return '#ff9f45';
        default: return '#4d94ff';
    }
}

function getDarkColorValue(color) {
    switch(color) {
        case 'blue': return '#0a58ca';
        case 'green': return '#1e7e34';
        case 'purple': return '#5a32a3';
        case 'orange': return '#d96909';
        default: return '#0a58ca';
    }
}

// ===== NAVIGACE =====
function initNavigation() {
    // Menu toggle
    const menuToggle = document.getElementById('toggle-menu');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('show');
        });
    }

    // Navigační odkazy
    const navLinks = document.querySelectorAll('.main-nav a');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();

            // Skrytí menu na mobilních zařízeních po kliknutí
            mainNav.classList.remove('show');

            // Odstranění aktivní třídy ze všech odkazů
            navLinks.forEach(l => l.classList.remove('active'));

            // Přidání aktivní třídy na aktuální odkaz
            this.classList.add('active');

            // Zobrazení příslušné sekce
            const targetId = this.getAttribute('data-section');
            document.querySelectorAll('main > section').forEach(section => {
                section.classList.remove('active');
            });

            document.getElementById(targetId).classList.add('active');

            // Aktualizace URL hash
            window.location.hash = targetId;
        });
    });

    // Kontrola URL hash při načtení stránky
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`.main-nav a[data-section="${targetId}"]`);

        if (targetLink) {
            targetLink.click();
        }
    }
}

// ===== NAČTENÍ KATEGORIÍ =====
async function loadCategories() {
    try {
        // Načtení kategorií úkolů
        const taskCategories = await getAllTaskCategories();
        const taskSelects = document.querySelectorAll('#task-select, #manual-activity, #filter-activity');

        taskSelects.forEach(select => {
            // Zachování první možnosti (placeholder)
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);

            // Přidání kategorií
            taskCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                select.appendChild(option);
            });
        });

        // Načtení kategorií výdajů
        const expenseCategories = await getAllExpenseCategories();
        const financeCategory = document.getElementById('finance-category');

        if (financeCategory) {
            // Zachování první možnosti (placeholder)
            const firstOption = financeCategory.options[0];
            financeCategory.innerHTML = '';
            financeCategory.appendChild(firstOption);

            // Přidání kategorií
            expenseCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                financeCategory.appendChild(option);
            });
        }

        // Zobrazení seznamů kategorií v nastavení
        displayCategoryLists(taskCategories, expenseCategories);

    } catch (error) {
        console.error('Chyba při načítání kategorií:', error);
        showNotification('Chyba při načítání kategorií', 'error');
    }
}

// Zobrazení seznamů kategorií v nastavení
function displayCategoryLists(taskCategories, expenseCategories) {
    // Seznam kategorií úkolů
    const taskCategoriesList = document.getElementById('task-categories-list');

    if (taskCategoriesList) {
        taskCategoriesList.innerHTML = '';

        if (taskCategories.length === 0) {
            taskCategoriesList.innerHTML = '<li class="empty-placeholder">Žádné kategorie úkolů.</li>';
        } else {
            taskCategories.forEach(category => {
                const li = document.createElement('li');
                li.innerHTML = `
                    ${category}
                    <button class="btn delete-btn" data-category="${category}" data-type="task">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                taskCategoriesList.appendChild(li);
            });

            // Posluchače událostí pro tlačítka smazání
            taskCategoriesList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', deleteCategoryHandler);
            });
        }
    }

    // Seznam kategorií výdajů
    const expenseCategoriesList = document.getElementById('expense-categories-list');

    if (expenseCategoriesList) {
        expenseCategoriesList.innerHTML = '';

        if (expenseCategories.length === 0) {
            expenseCategoriesList.innerHTML = '<li class="empty-placeholder">Žádné kategorie výdajů.</li>';
        } else {
            expenseCategories.forEach(category => {
                const li = document.createElement('li');
                li.innerHTML = `
                    ${category}
                    <button class="btn delete-btn" data-category="${category}" data-type="expense">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                expenseCategoriesList.appendChild(li);
            });

            // Posluchače událostí pro tlačítka smazání
            expenseCategoriesList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', deleteCategoryHandler);
            });
        }
    }
}

// Obsluha smazání kategorie
async function deleteCategoryHandler() {
    const category = this.getAttribute('data-category');
    const type = this.getAttribute('data-type');

    if (confirm(`Opravdu chcete smazat kategorii "${category}"?`)) {
        try {
            if (type === 'task') {
                await deleteTaskCategory(category);
            } else if (type === 'expense') {
                await deleteExpenseCategory(category);
            }

            // Aktualizace seznamů a select elementů
            await loadCategories();
            showNotification('Kategorie byla smazána', 'success');
        } catch (error) {
            console.error('Chyba při mazání kategorie:', error);
            showNotification('Chyba při mazání kategorie', 'error');
        }
    }
}

// Načtení dluhů pro formulář splátky
async function loadDebtsForPaymentForm() {
    const paymentDebtSelect = document.getElementById('payment-debt-id');

    if (!paymentDebtSelect) return;

    // Zachování první možnosti (placeholder)
    const firstOption = paymentDebtSelect.options[0];
    paymentDebtSelect.innerHTML = '';
    paymentDebtSelect.appendChild(firstOption);

    try {
        const debts = await getAllDebts();
        const payments = await getAllPayments();

        // Filtrování dluhů, které mají zbývající částku k zaplacení
        const activeDebts = debts.filter(debt => {
            const debtPayments = payments.filter(payment => payment.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, payment) => sum + payment.amount, 0);
            return totalPaid < debt.amount;
        });

        if (activeDebts.length > 0) {
            activeDebts.forEach(debt => {
                const option = document.createElement('option');
                option.value = debt.id;
                
                // Výpočet zbývající částky
                const debtPayments = payments.filter(payment => payment.debtId === debt.id);
                const totalPaid = debtPayments.reduce((sum, payment) => sum + payment.amount, 0);
                const remaining = debt.amount - totalPaid;
                
                option.textContent = `${debt.description} (${debt.person === 'maru' ? 'Maru' : 'Marty'}) - ${formatCurrency(remaining)} ${debt.currency}`;
                paymentDebtSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "-- Žádné aktivní dluhy --";
            option.disabled = true;
            paymentDebtSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Chyba při načítání dluhů:', error);
        showNotification('Chyba při načítání dluhů', 'error');
    }
}

// Nastavení dnešního data ve formulářích
function setTodaysDate() {
    const today = new Date().toISOString().substring(0, 10);
    const dateInputs = document.querySelectorAll('input[type="date"]');

    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
}

// ===== ČASOVAČ =====
let timerState = {
    running: false,
    startTime: null,
    pausedTime: 0,
    timerInterval: null,
    person: 'maru',
    activity: '',
    subcategory: '',
    note: ''
};

function initTimer() {
    // Elementy časovače
    const startBtn = document.getElementById('timer-start');
    const stopBtn = document.getElementById('timer-stop');
    const taskSelect = document.getElementById('task-select');
    const taskSubcategory = document.getElementById('task-subcategory');
    const taskNote = document.getElementById('task-note');
    
    // Inicializace dropdown pro výběr osoby
    initPersonSelector();
    
    // Posluchače událostí pro tlačítka časovače
    if (startBtn) {
        startBtn.addEventListener('click', startTimer);
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', stopTimer);
    }

    // Posluchač události pro výběr úkolu
    if (taskSelect) {
        taskSelect.addEventListener('change', function() {
            timerState.activity = this.value;
        });
    }
    
    // Posluchač události pro podkategorii
    if (taskSubcategory) {
        taskSubcategory.addEventListener('input', function() {
            timerState.subcategory = this.value;
        });
    }

    // Posluchač události pro poznámku
    if (taskNote) {
        taskNote.addEventListener('input', function() {
            timerState.note = this.value;
        });
    }
    
    // Obnovení běžícího časovače z lokálního úložiště
    restoreTimerState();
}

function initPersonSelector() {
    const personDropdown = document.getElementById('person-dropdown');
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    
    // Toggle dropdown
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', function() {
            personDropdown.classList.toggle('show');
        });
    }
    
    // Kliknutí mimo dropdown - zavřít
    document.addEventListener('click', function(event) {
        if (!event.target.matches('.dropdown-toggle') && !event.target.closest('.dropdown-toggle')) {
            personDropdown.classList.remove('show');
        }
    });
    
    // Výběr osoby
    if (personDropdown) {
        const dropdownItems = personDropdown.querySelectorAll('.dropdown-item');
        
        dropdownItems.forEach(item => {
            item.addEventListener('click', function() {
                const person = this.getAttribute('data-person');
                const rate = this.getAttribute('data-rate');
                
                timerState.person = person;
                
                // Aktualizace UI
                document.getElementById('selected-person').textContent = person.charAt(0).toUpperCase() + person.slice(1);
                document.getElementById('selected-rate').textContent = rate + ' Kč/h';
                
                personDropdown.classList.remove('show');
                
                // Pokud běží časovač, aktualizovat výdělek
                if (timerState.running) {
                    updateEarningsDisplay();
                }
            });
        });
    }
}

// Spuštění časovače
function startTimer() {
    // Kontrola, zda je vybrán úkol
    if (!document.getElementById('task-select').value) {
        showNotification('Vyberte prosím úkol před spuštěním časovače.', 'warning');
        return;
    }

    // Aktualizace stavu tlačítek
    document.getElementById('timer-start').disabled = true;
    document.getElementById('timer-stop').disabled = false;

    timerState.running = true;
    timerState.activity = document.getElementById('task-select').value;
    timerState.subcategory = document.getElementById('task-subcategory').value;
    timerState.note = document.getElementById('task-note').value;

    if (!timerState.startTime) {
        // První spuštění
        timerState.startTime = new Date().getTime() - timerState.pausedTime;
    } else {
        // Obnovení po pauze
        timerState.startTime = new Date().getTime() - timerState.pausedTime;
    }

    // Spuštění intervalu pro aktualizaci časovače
    timerState.timerInterval = setInterval(updateTimer, 1000);

    // Přidání třídy pro animaci
    document.querySelector('.timer-display-container').classList.add('timer-running');
    
    // Uložení stavu časovače
    saveTimerState();
    
    // Zobrazení časovače v hlavičce
    document.getElementById('header-timer').classList.remove('hidden');
    document.getElementById('header-timer-person').textContent = timerState.person.charAt(0).toUpperCase() + timerState.person.slice(1);
    document.getElementById('header-timer-activity').textContent = timerState.activity;
    
    // Oznámení uživateli
    showNotification('Časovač byl spuštěn.', 'success');
}

// Zastavení a uložení časovače
function stopTimer() {
    if (!timerState.startTime) return;

    // Zastavení časovače
    clearInterval(timerState.timerInterval);
    
    // Aktualizace stavu tlačítek
    document.getElementById('timer-start').disabled = false;
    document.getElementById('timer-stop').disabled = true;
    
    // Odstranění třídy pro animaci
    document.querySelector('.timer-display-container').classList.remove('timer-running');

    // Výpočet celkového času a výdělku
    const endTime = new Date().getTime();
    const totalTime = endTime - timerState.startTime;
    const totalHours = totalTime / (1000 * 60 * 60);
    const rate = RATES[timerState.person];
    const earnings = totalHours * rate;
    const deductionRate = DEDUCTION_RATES[timerState.person];
    const deduction = earnings * deductionRate;

    // Vytvoření záznamu o práci
    const workLog = {
        id: generateId(),
        person: timerState.person,
        activity: timerState.activity,
        subcategory: timerState.subcategory,
        note: timerState.note,
        startTime: new Date(timerState.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        duration: totalTime,
        earnings: Math.round(earnings)
    };

    // Uložení záznamu
    saveWorkLog(workLog).then(() => {
        // Resetování časovače
        resetTimer();
        
        // Informování uživatele
        showNotification(`Záznam byl uložen. Výdělek: ${Math.round(earnings)} Kč, Srážka: ${Math.round(deduction)} Kč.`, 'success');
    }).catch(error => {
        console.error('Chyba při ukládání záznamu:', error);
        showNotification('Chyba při ukládání záznamu.', 'error');
    });
}

// Aktualizace zobrazení časovače
function updateTimer() {
    if (!timerState.running || !timerState.startTime) return;

    const currentTime = new Date().getTime();
    const elapsedTime = currentTime - timerState.startTime;

    // Formátování času a aktualizace digitů
    updateTimerDigits(elapsedTime);

    // Aktualizace zobrazení výdělku
    updateEarningsDisplay();

    // Aktualizace časovače v hlavičce
    document.getElementById('header-timer-time').textContent = formatTime(elapsedTime);
    
    // Uložení stavu časovače
    saveTimerState();
}

// Aktualizace jednotlivých digitů časovače
function updateTimerDigits(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;
    
    // Rozdělení na jednotlivé číslice
    const hoursTens = Math.floor(hours / 10);
    const hoursOnes = hours % 10;
    const minutesTens = Math.floor(minutes / 10);
    const minutesOnes = minutes % 10;
    const secondsTens = Math.floor(seconds / 10);
    const secondsOnes = seconds % 10;
    
    // Aktualizace digitů
    document.getElementById('hours-tens').textContent = hoursTens;
    document.getElementById('hours-ones').textContent = hoursOnes;
    document.getElementById('minutes-tens').textContent = minutesTens;
    document.getElementById('minutes-ones').textContent = minutesOnes;
    document.getElementById('seconds-tens').textContent = secondsTens;
    document.getElementById('seconds-ones').textContent = secondsOnes;
}

// Formátování času v milisekundách na HH:MM:SS
function formatTime(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Formátování času v milisekundách na hodiny a minuty
function formatTimeDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

// Aktualizace zobrazení výdělku
function updateEarningsDisplay() {
    if (!timerState.startTime) return;
    
    const currentTime = new Date().getTime();
    const elapsedTime = currentTime - timerState.startTime;
    const hours = elapsedTime / (1000 * 60 * 60);
    const rate = RATES[timerState.person];
    const earnings = hours * rate;
    const deductionRate = DEDUCTION_RATES[timerState.person];
    const deduction = earnings * deductionRate;

    document.getElementById('current-earnings').textContent = `${Math.round(earnings)} Kč`;
    document.getElementById('current-deduction').textContent = `${Math.round(deduction)} Kč`;
}

// Resetování časovače
function resetTimer() {
    // Zastavení časovače
    clearInterval(timerState.timerInterval);

    // Resetování stavu časovače
    timerState.running = false;
    timerState.startTime = null;
    timerState.pausedTime = 0;
    timerState.activity = '';
    timerState.subcategory = '';
    timerState.note = '';

    // Aktualizace zobrazení
    document.getElementById('hours-tens').textContent = '0';
    document.getElementById('hours-ones').textContent = '0';
    document.getElementById('minutes-tens').textContent = '0';
    document.getElementById('minutes-ones').textContent = '0';
    document.getElementById('seconds-tens').textContent = '0';
    document.getElementById('seconds-ones').textContent = '0';
    
    document.getElementById('current-earnings').textContent = '0 Kč';
    document.getElementById('current-deduction').textContent = '0 Kč';

    // Aktualizace stavu tlačítek
    document.getElementById('timer-start').disabled = false;
    document.getElementById('timer-stop').disabled = true;
    
    // Resetování formuláře
    document.getElementById('task-select').value = '';
    document.getElementById('task-subcategory').value = '';
    document.getElementById('task-note').value = '';
    
    // Odstranění třídy pro animaci
    document.querySelector('.timer-display-container').classList.remove('timer-running');

    // Skrytí časovače v hlavičce
    document.getElementById('header-timer').classList.add('hidden');
    
    // Vyčištění stavu časovače v lokálním úložišti
    localStorage.removeItem('timerState');
}

// Uložení stavu časovače do lokálního úložiště
function saveTimerState() {
    if (timerState.running) {
        localStorage.setItem('timerState', JSON.stringify({
            running: timerState.running,
            startTime: timerState.startTime,
            pausedTime: timerState.pausedTime,
            person: timerState.person,
            activity: timerState.activity,
            subcategory: timerState.subcategory,
            note: timerState.note
        }));
    }
}

// Obnovení stavu časovače z lokálního úložiště
function restoreTimerState() {
    const savedState = localStorage.getItem('timerState');
    
    if (savedState) {
        const state = JSON.parse(savedState);
        
        // Kontrola, zda byl časovač spuštěn
        if (state.running) {
            // Obnovení stavu
            timerState.running = state.running;
            timerState.startTime = state.startTime;
            timerState.pausedTime = state.pausedTime;
            timerState.person = state.person;
            timerState.activity = state.activity;
            timerState.subcategory = state.subcategory;
            timerState.note = state.note;
            
            // Aktualizace UI
            document.getElementById('selected-person').textContent = timerState.person.charAt(0).toUpperCase() + timerState.person.slice(1);
            document.getElementById('selected-rate').textContent = RATES[timerState.person] + ' Kč/h';
            document.getElementById('task-select').value = timerState.activity;
            document.getElementById('task-subcategory').value = timerState.subcategory;
            document.getElementById('task-note').value = timerState.note;
            
            // Spuštění časovače
            timerState.timerInterval = setInterval(updateTimer, 1000);
            updateTimer();
            
            // Aktualizace stavu tlačítek
            document.getElementById('timer-start').disabled = true;
            document.getElementById('timer-stop').disabled = false;
            
            // Přidání třídy pro animaci
            document.querySelector('.timer-display-container').classList.add('timer-running');
            
            // Zobrazení časovače v hlavičce
            document.getElementById('header-timer').classList.remove('hidden');
            document.getElementById('header-timer-person').textContent = timerState.person.charAt(0).toUpperCase() + timerState.person.slice(1);
            document.getElementById('header-timer-activity').textContent = timerState.activity;
        }
    }
}

// ===== RUČNÍ ZADÁNÍ ZÁZNAMU =====
function initManualEntryForm() {
    const manualEntryForm = document.getElementById('manual-entry-form');
    const cancelEditButton = document.getElementById('cancel-edit-button');

    if (manualEntryForm) {
        manualEntryForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Kontrola, zda je vybrán úkol
            if (!document.getElementById('manual-activity').value) {
                showNotification('Vyberte prosím úkol.', 'warning');
                return;
            }

            // Získání hodnot z formuláře
            const id = document.getElementById('edit-log-id').value || generateId();
            const person = document.getElementById('manual-person').value;
            const date = document.getElementById('manual-date').value;
            const startTime = document.getElementById('manual-start-time').value;
            const endTime = document.getElementById('manual-end-time').value;
            const breakTime = parseInt(document.getElementById('manual-break-time').value) || 0;
            const activity = document.getElementById('manual-activity').value;
            const subcategory = document.getElementById('manual-subcategory').value;
            const note = document.getElementById('manual-note').value;

            // Vytvoření objektů Date pro začátek a konec
            const startDate = new Date(`${date}T${startTime}`);
            const endDate = new Date(`${date}T${endTime}`);

            // Kontrola, zda je konec po začátku
            if (endDate <= startDate) {
                showNotification('Konec musí být po začátku.', 'warning');
                return;
            }

            // Výpočet trvání v milisekundách (s odečtením pauzy)
            const durationMs = endDate.getTime() - startDate.getTime() - (breakTime * 60 * 1000);

            if (durationMs <= 0) {
                showNotification('Celková doba práce (po odečtení pauzy) musí být větší než 0.', 'warning');
                return;
            }

            // Výpočet výdělku
            const durationHours = durationMs / (1000 * 60 * 60);
            const rate = RATES[person];
            const earnings = durationHours * rate;

            // Vytvoření záznamu o práci
            const workLog = {
                id: id,
                person: person,
                activity: activity,
                subcategory: subcategory,
                note: note,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                breakTime: breakTime,
                duration: durationMs,
                earnings: Math.round(earnings)
            };

            // Uložení nebo aktualizace záznamu
            if (document.getElementById('edit-log-id').value) {
                // Editace existujícího záznamu
                updateWorkLog(workLog).then(() => {
                    showNotification('Záznam byl upraven.', 'success');
                    resetManualForm();
                }).catch(error => {
                    console.error('Chyba při úpravě záznamu:', error);
                    showNotification('Chyba při úpravě záznamu.', 'error');
                });
            } else {
                // Nový záznam
                saveWorkLog(workLog).then(() => {
                    showNotification(`Záznam byl uložen. Výdělek: ${Math.round(earnings)} Kč.`, 'success');
                    resetManualForm();
                }).catch(error => {
                    console.error('Chyba při ukládání záznamu:', error);
                    showNotification('Chyba při ukládání záznamu.', 'error');
                });
            }
        });
    }

    // Tlačítko pro zrušení úpravy
    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', resetManualForm);
    }
}

function resetManualForm() {
    const manualEntryForm = document.getElementById('manual-entry-form');
    manualEntryForm.reset();
    document.getElementById('edit-log-id').value = '';
    document.getElementById('save-log-button').innerHTML = '<i class="fas fa-plus"></i> Přidat záznam';
    document.getElementById('cancel-edit-button').style.display = 'none';
    setTodaysDate();
}

// Načtení posledních záznamů o práci
async function loadRecentWorkLogs() {
    const recentLogsTable = document.getElementById('recent-logs-table');
    if (!recentLogsTable) return;
    
    try {
        // Získání všech záznamů
        const allLogs = await getAllWorkLogs();
        
        // Řazení podle data (nejnovější první)
        allLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        // Omezení na posledních 5 záznamů
        const recentLogs = allLogs.slice(0, 5);
        
        const tbody = recentLogsTable.querySelector('tbody');
        
        if (recentLogs.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Žádné nedávné záznamy k zobrazení</td></tr>';
            return;
        }
        
        // Vytvoření HTML řádků
        let html = '';
        
        recentLogs.forEach(log => {
            const startDate = new Date(log.startTime);
            const endDate = new Date(log.endTime);
            
            const formattedDate = startDate.toLocaleDateString('cs-CZ');
            const startTime = startDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
            const endTime = endDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
            
            const durationFormatted = formatTimeDuration(log.duration);
            
            html += `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${log.person === 'maru' ? 'Maru' : 'Marty'}</td>
                    <td>${log.activity}${log.subcategory ? ' - ' + log.subcategory : ''}</td>
                    <td>${startTime} - ${endTime}</td>
                    <td>${durationFormatted}</td>
                    <td>${log.earnings} Kč</td>
                    <td>
                        <button class="btn edit-log-button" data-id="${log.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn delete-log-button" data-id="${log.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // Přidání posluchačů událostí pro tlačítka
        tbody.querySelectorAll('.edit-log-button').forEach(button => {
            button.addEventListener('click', editWorkLogHandler);
        });
        
        tbody.querySelectorAll('.delete-log-button').forEach(button => {
            button.addEventListener('click', deleteWorkLogHandler);
        });
        
    } catch (error) {
        console.error('Chyba při načítání posledních záznamů:', error);
        showNotification('Chyba při načítání posledních záznamů.', 'error');
    }
}

// Editace záznamu o práci
async function editWorkLogHandler() {
    const logId = this.getAttribute('data-id');
    
    try {
        const log = await getWorkLog(logId);
        
        if (log) {
            // Přepnutí na sekci Docházka
            document.querySelector('a[data-section="dochazka"]').click();
            
            // Naplnění formuláře pro ruční zadání záznamu
            document.getElementById('edit-log-id').value = log.id;
            document.getElementById('manual-person').value = log.person;
            
            // Formátování data a časů
            const startDate = new Date(log.startTime);
            const endDate = new Date(log.endTime);

            document.getElementById('manual-date').value = startDate.toISOString().substring(0, 10);
            document.getElementById('manual-start-time').value = startDate.toTimeString().substring(0, 5);
            document.getElementById('manual-end-time').value = endDate.toTimeString().substring(0, 5);

            document.getElementById('manual-break-time').value = log.breakTime || 0;
            document.getElementById('manual-activity').value = log.activity;
            document.getElementById('manual-subcategory').value = log.subcategory || '';
            document.getElementById('manual-note').value = log.note || '';

            // Změna textu tlačítka a zobrazení tlačítka pro zrušení
            document.getElementById('save-log-button').innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            document.getElementById('cancel-edit-button').style.display = 'inline-block';

            // Posun na formulář
            document.getElementById('manual-entry-form').scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Záznam byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Chyba při úpravě záznamu:', error);
        showNotification('Chyba při načítání záznamu k úpravě.', 'error');
    }
}

// Smazání záznamu o práci
async function deleteWorkLogHandler() {
    const logId = this.getAttribute('data-id');
    
    if (confirm('Opravdu chcete smazat tento záznam o práci?')) {
        try {
            await deleteWorkLog(logId);
            showNotification('Záznam byl úspěšně smazán.', 'success');
        } catch (error) {
            console.error('Chyba při mazání záznamu:', error);
            showNotification('Chyba při mazání záznamu.', 'error');
        }
    }
}

// Aktualizace souhrnu dnešních záznamů
async function updateTodaySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const logs = await getAllWorkLogs({
            startDate: today.toISOString()
        });
        
        // Výpočet celkových hodnot
        let totalDuration = 0;
        let totalEarnings = 0;
        let totalDeductions = 0;
        
        logs.forEach(log => {
            totalDuration += log.duration;
            totalEarnings += log.earnings;
            totalDeductions += Math.round(log.earnings * DEDUCTION_RATES[log.person]);
        });
        
        // Aktualizace UI
        document.getElementById('total-hours-today').textContent = formatTimeDuration(totalDuration);
        document.getElementById('total-earnings-today').textContent = `${totalEarnings} Kč`;
        document.getElementById('total-deductions-today').textContent = `${totalDeductions} Kč`;
        document.getElementById('net-earnings-today').textContent = `${totalEarnings - totalDeductions} Kč`;
        
    } catch (error) {
        console.error('Chyba při aktualizaci denního souhrnu:', error);
    }
}

// ===== FINANCE FORM =====
function initFinanceForm() {
    const financeForm = document.getElementById('finance-form');
    const cancelFinanceEditButton = document.getElementById('cancel-finance-edit-button');
    
    // Inicializace rychlých akcí
    const addIncomeBtn = document.getElementById('add-income-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    
    if (addIncomeBtn) {
        addIncomeBtn.addEventListener('click', function() {
            document.querySelector('a[data-section="finance"]').click();
            document.querySelector('input[name="finance-type"][value="income"]').checked = true;
            document.getElementById('finance-description').focus();
        });
    }
    
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', function() {
            document.querySelector('a[data-section="finance"]').click();
            document.querySelector('input[name="finance-type"][value="expense"]').checked = true;
            document.getElementById('finance-description').focus();
        });
    }

    if (financeForm) {
        financeForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Získání hodnot z formuláře
            const id = document.getElementById('edit-finance-id').value || generateId();
            const type = document.querySelector('input[name="finance-type"]:checked').value;
            const date = document.getElementById('finance-date').value;
            const description = document.getElementById('finance-description').value;
            const category = document.getElementById('finance-category').value;
            const amount = parseFloat(document.getElementById('finance-amount').value);
            const currency = document.getElementById('finance-currency').value;

            // Kontrola platnosti částky
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }

            // Vytvoření finančního záznamu
            const financeRecord = {
                id: id,
                type: type,
                date: date,
                description: description,
                category: category,
                amount: amount,
                currency: currency,
                createdAt: new Date().toISOString()
            };

            // Uložení nebo aktualizace záznamu
            if (document.getElementById('edit-finance-id').value) {
                // Editace existujícího záznamu
                updateFinanceRecord(financeRecord).then(() => {
                    showNotification('Finanční záznam byl upraven.', 'success');
                    resetFinanceForm();
                }).catch(error => {
                    console.error('Chyba při úpravě finančního záznamu:', error);
                    showNotification('Chyba při úpravě finančního záznamu.', 'error');
                });
            } else {
                // Nový záznam
                saveFinanceRecord(financeRecord).then(() => {
                    showNotification('Finanční záznam byl uložen.', 'success');
                    resetFinanceForm();
                }).catch(error => {
                    console.error('Chyba při ukládání finančního záznamu:', error);
                    showNotification('Chyba při ukládání finančního záznamu.', 'error');
                });
            }
        });
    }

    // Tlačítko pro zrušení úpravy
    if (cancelFinanceEditButton) {
        cancelFinanceEditButton.addEventListener('click', resetFinanceForm);
    }
}

function resetFinanceForm() {
    const financeForm = document.getElementById('finance-form');
    financeForm.reset();
    document.getElementById('edit-finance-id').value = '';
    document.getElementById('save-finance-button').innerHTML = '<i class="fas fa-plus"></i> Přidat';
    document.getElementById('cancel-finance-edit-button').style.display = 'none';
    setTodaysDate();
}

// Načtení finančních záznamů
async function loadFinanceRecords() {
    const financeTable = document.getElementById('finance-table');
    
    if (!financeTable) return;
    
    try {
        const financeRecords = await getAllFinanceRecords();
        
        if (financeRecords.length === 0) {
            financeTable.innerHTML = '<tr class="empty-row"><td colspan="7">Žádné finanční záznamy.</td></tr>';
            return;
        }
        
        // Seřazení záznamů podle data (nejnovější první)
        financeRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Vytvoření HTML pro záznamy
        const html = financeRecords.map(record => {
            // Formátování data
            const date = new Date(record.date).toLocaleDateString('cs-CZ');
            
            // Formátování typu
            const typeText = record.type === 'income' ? 'Příjem' : 'Výdaj';
            const typeClass = record.type === 'income' ? 'success-color' : 'danger-color';
            
            return `
                <tr>
                    <td class="${typeClass}">${typeText}</td>
                    <td>${record.description}</td>
                    <td>${record.amount.toFixed(2)}</td>
                    <td>${record.currency}</td>
                    <td>${date}</td>
                    <td>${record.category || '-'}</td>
                    <td>
                        <button class="btn edit-finance-button" data-id="${record.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn delete-finance-button" data-id="${record.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        financeTable.innerHTML = html;
        
        // Přidání posluchačů událostí pro tlačítka úpravy a smazání
        financeTable.querySelectorAll('.edit-finance-button').forEach(button => {
            button.addEventListener('click', editFinanceRecord);
        });
        
        financeTable.querySelectorAll('.delete-finance-button').forEach(button => {
            button.addEventListener('click', deleteFinanceRecord);
        });
    } catch (error) {
        console.error('Chyba při načítání finančních záznamů:', error);
        showNotification('Chyba při načítání finančních záznamů.', 'error');
    }
}

// Aktualizace souhrnu financí
async function updateFinanceSummary() {
    try {
        const financeRecords = await getAllFinanceRecords();
        const budget = await getSharedBudget();
        
        // Výpočet příjmů a výdajů
        let totalIncome = 0;
        let totalExpenses = 0;
        
        financeRecords.forEach(record => {
            if (record.currency === 'CZK') {
                if (record.type === 'income') {
                    totalIncome += record.amount;
                } else {
                    totalExpenses += record.amount;
                }
            }
        });
        
        // Aktualizace UI
        document.getElementById('total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);
        document.getElementById('shared-budget').textContent = formatCurrency(budget.balance);
        document.getElementById('current-balance').textContent = formatCurrency(budget.balance);
        
        // Aktualizace kruhu
        const balanceCircle = document.getElementById('balance-circle-fill');
        if (balanceCircle) {
            // Procento zaplnění kruhu (max. 100000 Kč = 100%)
            const maxBalance = 100000;
            const percentage = Math.min(100, Math.max(0, (budget.balance / maxBalance) * 100));
            balanceCircle.setAttribute('stroke-dasharray', `${percentage}, 100`);
            
            // Nastavení barvy podle zůstatku
            if (budget.balance < 0) {
                balanceCircle.style.stroke = 'var(--danger-color)';
            } else if (budget.balance < 5000) {
                balanceCircle.style.stroke = 'var(--warning-color)';
            } else {
                balanceCircle.style.stroke = 'var(--success-color)';
            }
        }
    } catch (error) {
        console.error('Chyba při aktualizaci souhrnu financí:', error);
    }
}

// Úprava finančního záznamu
async function editFinanceRecord() {
    const recordId = this.getAttribute('data-id');
    
    try {
        const record = await getFinanceRecord(recordId);
        
        if (record) {
            // Naplnění formuláře daty
            document.getElementById('edit-finance-id').value = record.id;
            document.querySelector(`input[name="finance-type"][value="${record.type}"]`).checked = true;
            document.getElementById('finance-date').value = record.date;
            document.getElementById('finance-description').value = record.description;
            document.getElementById('finance-category').value = record.category || '';
            document.getElementById('finance-amount').value = record.amount;
            document.getElementById('finance-currency').value = record.currency;
            
            // Změna textu tlačítka a zobrazení tlačítka pro zrušení
            document.getElementById('save-finance-button').innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            document.getElementById('cancel-finance-edit-button').style.display = 'inline-block';
            
            // Posun na formulář
            document.getElementById('finance-form').scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Finanční záznam byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Chyba při úpravě finančního záznamu:', error);
        showNotification('Chyba při načítání záznamu k úpravě.', 'error');
    }
}

// Smazání finančního záznamu
async function deleteFinanceRecord() {
    const recordId = this.getAttribute('data-id');
    
    if (confirm('Opravdu chcete smazat tento finanční záznam?')) {
        try {
            await deleteFinanceRecord(recordId);
            showNotification('Finanční záznam byl úspěšně smazán.', 'success');
        } catch (error) {
            console.error('Chyba při mazání finančního záznamu:', error);
            showNotification('Chyba při mazání finančního záznamu.', 'error');
        }
    }
}

// ===== SPRÁVA DLUHŮ =====
function initDebtManagement() {
    const debtForm = document.getElementById('debt-form');
    const paymentForm = document.getElementById('payment-form');
    const cancelDebtEditButton = document.getElementById('cancel-debt-edit-button');
    
    // Rychlé akce pro přidání dluhu a splátky
    const addDebtBtn = document.getElementById('add-debt-btn');
    const addPaymentBtn = document.getElementById('add-payment-btn');
    
    if (addDebtBtn) {
        addDebtBtn.addEventListener('click', function() {
            document.querySelector('a[data-section="srazky"]').click();
            document.getElementById('debt-form').scrollIntoView({ behavior: 'smooth' });
            document.getElementById('debt-description').focus();
        });
    }
    
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', function() {
            document.querySelector('a[data-section="srazky"]').click();
            document.getElementById('payment-form').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Inicializace formuláře pro dluh
    if (debtForm) {
        debtForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Získání hodnot z formuláře
            const id = document.getElementById('edit-debt-id').value || generateId();
            const person = document.getElementById('debt-person').value;
            const description = document.getElementById('debt-description').value;
            const amount = parseFloat(document.getElementById('debt-amount').value);
            const currency = document.getElementById('debt-currency').value;
            const date = document.getElementById('debt-date').value;
            const dueDate = document.getElementById('debt-due-date').value || null;

            // Kontrola platnosti částky
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }

            // Vytvoření záznamu o dluhu
            const debt = {
                id: id,
                person: person,
                description: description,
                amount: amount,
                currency: currency,
                date: date,
                dueDate: dueDate,
                createdAt: new Date().toISOString()
            };

            // Uložení nebo aktualizace záznamu
            if (document.getElementById('edit-debt-id').value) {
                // Editace existujícího záznamu
                updateDebt(debt).then(() => {
                    showNotification('Dluh byl upraven.', 'success');
                    resetDebtForm();
                }).catch(error => {
                    console.error('Chyba při úpravě dluhu:', error);
                    showNotification('Chyba při úpravě dluhu.', 'error');
                });
            } else {
                // Nový záznam
                saveDebt(debt).then(() => {
                    showNotification('Dluh byl uložen.', 'success');
                    resetDebtForm();
                }).catch(error => {
                    console.error('Chyba při ukládání dluhu:', error);
                    showNotification('Chyba při ukládání dluhu.', 'error');
                });
            }
        });
    }

    // Tlačítko pro zrušení úpravy dluhu
    if (cancelDebtEditButton) {
        cancelDebtEditButton.addEventListener('click', resetDebtForm);
    }

    // Inicializace formuláře pro splátku
    if (paymentForm) {
        paymentForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Získání hodnot z formuláře
            const debtId = document.getElementById('payment-debt-id').value;
            const amount = parseFloat(document.getElementById('payment-amount').value);
            const date = document.getElementById('payment-date').value;
            const note = document.getElementById('payment-note').value;

            // Kontrola, zda je vybrán dluh
            if (!debtId) {
                showNotification('Vyberte prosím dluh pro splátku.', 'warning');
                return;
            }

            // Kontrola platnosti částky
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }

            // Kontrola, zda splátka nepřevyšuje zbývající částku dluhu
            getDebt(debtId).then(async (debt) => {
                if (debt) {
                    const payments = await getPaymentsForDebt(debtId);
                    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                    const remaining = debt.amount - totalPaid;

                    if (amount > remaining) {
                        showNotification(`Splátka nemůže být vyšší než zbývající částka dluhu (${remaining.toFixed(2)} ${debt.currency}).`, 'warning');
                        return;
                    }

                    // Vytvoření záznamu o splátce
                    const payment = {
                        id: generateId(),
                        debtId: debtId,
                        amount: amount,
                        date: date,
                        note: note,
                        createdAt: new Date().toISOString()
                    };

                    // Uložení splátky
                    savePayment(payment).then(() => {
                        showNotification('Splátka byla uložena.', 'success');
                        resetPaymentForm();
                    }).catch(error => {
                        console.error('Chyba při ukládání splátky:', error);
                        showNotification('Chyba při ukládání splátky.', 'error');
                    });
                }
            }).catch(error => {
                console.error('Chyba při kontrole dluhu:', error);
                showNotification('Chyba při kontrole dluhu.', 'error');
            });
        });
    }
}

function resetDebtForm() {
    const debtForm = document.getElementById('debt-form');
    debtForm.reset();
    document.getElementById('edit-debt-id').value = '';
    document.getElementById('save-debt-button').innerHTML = '<i class="fas fa-plus"></i> Přidat dluh';
    document.getElementById('cancel-debt-edit-button').style.display = 'none';
    setTodaysDate();
}

function resetPaymentForm() {
    const paymentForm = document.getElementById('payment-form');
    paymentForm.reset();
    setTodaysDate();
}

// Načtení přehledu dluhů
async function loadDebts() {
    const debtsList = document.getElementById('debts-list');
    
    if (!debtsList) return;
    
    try {
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        if (debts.length === 0) {
            debtsList.innerHTML = '<div class="empty-placeholder">Žádné dluhy k zobrazení. Přidejte dluh níže.</div>';
            return;
        }
        
        // Výpočet celkových dluhů a splátek pro grafy
        let totalDebtAmount = 0;
        let totalPaidAmount = 0;
        
        // Vytvoření HTML pro dluhy
        let html = '';
        
        for (const debt of debts) {
            // Výpočet zaplacené částky
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            const isPaid = remaining <= 0;
            
            // Přidání k celkovým hodnotám (pouze CZK)
            if (debt.currency === 'CZK') {
                totalDebtAmount += debt.amount;
                totalPaidAmount += totalPaid;
            }
            
            // Formátování dat
            const dateCreated = new Date(debt.date).toLocaleDateString('cs-CZ');
            const dateDue = debt.dueDate ? new Date(debt.dueDate).toLocaleDateString('cs-CZ') : '-';
            
            // Vytvoření HTML pro splátky
            let paymentsHtml = '';
            
            if (debtPayments.length > 0) {
                // Seřazení splátek podle data (nejnovější první)
                debtPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
                
                paymentsHtml = `
                    <div class="payments-list">
                        <h4>Splátky</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Datum</th>
                                    <th>Částka</th>
                                    <th>Poznámka</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${debtPayments.map(payment => {
                                    const paymentDate = new Date(payment.date).toLocaleDateString('cs-CZ');
                                    return `
                                        <tr>
                                            <td>${paymentDate}</td>
                                            <td>${payment.amount.toFixed(2)} ${debt.currency}</td>
                                            <td>${payment.note || '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            // Výpočet procenta splacení
            const paymentPercentage = (totalPaid / debt.amount) * 100;
            
            html += `
                <div class="accordion-item">
                    <div class="accordion-header" data-id="${debt.id}">
                        <div class="debt-header-info">
                            <span class="debt-person">${debt.person === 'maru' ? 'Maru' : 'Marty'}</span>
                            <span class="debt-description">${debt.description}</span>
                        </div>
                        <div class="debt-header-amount">
                            <span class="debt-status ${isPaid ? 'success-color' : 'warning-color'}">
                                ${isPaid ? 'Splaceno' : 'Aktivní'}
                            </span>
                            <span class="debt-amount">
                                ${totalPaid.toFixed(2)} / ${debt.amount.toFixed(2)} ${debt.currency}
                            </span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                    <div class="accordion-content">
                        <div class="debt-details">
                            <div class="debt-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${paymentPercentage}%; background-color: ${isPaid ? 'var(--success-color)' : 'var(--primary-color)'}"></div>
                                </div>
                                <div class="progress-text">
                                    Splaceno: ${paymentPercentage.toFixed(1)}%
                                </div>
                            </div>

                            <div class="debt-info">
                                <p><strong>Osoba:</strong> ${debt.person === 'maru' ? 'Maru' : 'Marty'}</p>
                                <p><strong>Popis:</strong> ${debt.description}</p>
                                <p><strong>Celková částka:</strong> ${debt.amount.toFixed(2)} ${debt.currency}</p>
                                <p><strong>Zaplaceno:</strong> ${totalPaid.toFixed(2)} ${debt.currency}</p>
                                <p><strong>Zbývá:</strong> ${remaining.toFixed(2)} ${debt.currency}</p>
                                <p><strong>Datum vzniku:</strong> ${dateCreated}</p>
                                <p><strong>Datum splatnosti:</strong> ${dateDue}</p>
                            </div>

                            ${paymentsHtml}

                            <div class="debt-actions">
                                <button class="btn primary-btn edit-debt-button" data-id="${debt.id}">
                                    <i class="fas fa-edit"></i> Upravit
                                </button>
                                <button class="btn delete-btn delete-debt-button" data-id="${debt.id}">
                                    <i class="fas fa-trash-alt"></i> Smazat
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        debtsList.innerHTML = html;
        
        // Aktualizace přehledu dluhů
        document.getElementById('active-debts').textContent = formatCurrency(totalDebtAmount - totalPaidAmount);
        document.getElementById('paid-debts').textContent = formatCurrency(totalPaidAmount);
        
        // Přidání posluchačů událostí pro akordeony
        debtsList.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', function() {
                this.classList.toggle('active');
                this.classList.toggle('active');
                const content = this.nextElementSibling;

                if (content.classList.contains('active')) {
                    content.classList.remove('active');
                } else {
                    content.classList.add('active');
                }
            });
        });

        // Přidání posluchačů událostí pro tlačítka úpravy a smazání
        debtsList.querySelectorAll('.edit-debt-button').forEach(button => {
            button.addEventListener('click', editDebtHandler);
        });

        debtsList.querySelectorAll('.delete-debt-button').forEach(button => {
            button.addEventListener('click', deleteDebtHandler);
        });
    } catch (error) {
        console.error('Chyba při načítání dluhů:', error);
        showNotification('Chyba při načítání dluhů.', 'error');
    }
}

// Úprava dluhu
async function editDebtHandler(e) {
    e.stopPropagation();
    const debtId = this.getAttribute('data-id');

    try {
        const debt = await getDebt(debtId);

        if (debt) {
            // Naplnění formuláře daty
            document.getElementById('edit-debt-id').value = debt.id;
            document.getElementById('debt-person').value = debt.person;
            document.getElementById('debt-description').value = debt.description;
            document.getElementById('debt-amount').value = debt.amount;
            document.getElementById('debt-currency').value = debt.currency;
            document.getElementById('debt-date').value = debt.date;

            if (debt.dueDate) {
                document.getElementById('debt-due-date').value = debt.dueDate;
            } else {
                document.getElementById('debt-due-date').value = '';
            }

            // Změna textu tlačítka a zobrazení tlačítka pro zrušení
            document.getElementById('save-debt-button').innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            document.getElementById('cancel-debt-edit-button').style.display = 'inline-block';

            // Posun na formulář
            document.getElementById('debt-form').scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Dluh byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Chyba při úpravě dluhu:', error);
        showNotification('Chyba při úpravě dluhu.', 'error');
    }
}

// Smazání dluhu
async function deleteDebtHandler(e) {
    e.stopPropagation();
    const debtId = this.getAttribute('data-id');

    if (confirm('Opravdu chcete smazat tento dluh a všechny jeho splátky?')) {
        try {
            await deleteDebt(debtId);
            showNotification('Dluh byl úspěšně smazán včetně všech splátek.', 'success');
        } catch (error) {
            console.error('Chyba při mazání dluhu:', error);
            showNotification('Chyba při mazání dluhu.', 'error');
        }
    }
}

// Načtení přehledu srážek
async function loadDeductionsSummary() {
    const deductionsTable = document.getElementById('deductions-summary-table');

    if (!deductionsTable) return;

    try {
        const workLogs = await getAllWorkLogs();

        if (workLogs.length === 0) {
            deductionsTable.innerHTML = '<tr class="empty-row"><td colspan="5">Žádné záznamy pro výpočet srážek.</td></tr>';
            return;
        }

        // Získání unikátních osob a měsíců
        const workLogsByMonth = {};

        workLogs.forEach(log => {
            const date = new Date(log.startTime);
            const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthKey = `${month}-${log.person}`;

            if (!workLogsByMonth[monthKey]) {
                workLogsByMonth[monthKey] = {
                    person: log.person,
                    month: month,
                    totalDuration: 0,
                    totalEarnings: 0
                };
            }

            workLogsByMonth[monthKey].totalDuration += log.duration;
            workLogsByMonth[monthKey].totalEarnings += log.earnings;
        });

        // Příprava dat pro tabulku
        const summaryData = Object.values(workLogsByMonth);

        // Seřazení podle data a osoby
        summaryData.sort((a, b) => {
            if (a.month !== b.month) {
                return b.month.localeCompare(a.month);
            }
            return a.person.localeCompare(b.person);
        });

        // Kontrola, zda je měsíc kompletní
        const currentDate = new Date();
        const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;

        // Výpočet celkových srážek pro graf
        let totalDeductions = 0;
        
        // Vytvoření HTML pro tabulku
        const html = summaryData.map(summary => {
            // Přeskočení aktuálního měsíce (není ještě kompletní)
            if (summary.month === currentMonth) {
                return '';
            }

            // Formátování měsíce
            const [year, month] = summary.month.split('-');
            const monthText = new Date(year, month - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

            // Výpočet srážky
            const deductionRate = DEDUCTION_RATES[summary.person];
            const deduction = Math.round(summary.totalEarnings * deductionRate);
            
            // Přičtení k celkovým srážkám
            totalDeductions += deduction;

            // Formátování doby
            const hours = Math.floor(summary.totalDuration / (1000 * 60 * 60));
            const minutes = Math.floor((summary.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
            const formattedDuration = `${hours} h ${minutes} min`;

            return `
                <tr>
                    <td>${summary.person === 'maru' ? 'Maru' : 'Marty'}</td>
                    <td>${monthText}</td>
                    <td>${formattedDuration}</td>
                    <td>${summary.totalEarnings.toFixed(0)} Kč</td>
                    <td>${deduction.toFixed(0)} Kč</td>
                </tr>
            `;
        }).filter(html => html !== '').join('');

        if (html === '') {
            deductionsTable.innerHTML = '<tr class="empty-row"><td colspan="5">Žádné záznamy pro výpočet srážek.</td></tr>';
        } else {
            deductionsTable.innerHTML = html;
        }
        
        // Aktualizovat celkové srážky
        document.getElementById('total-deductions').textContent = formatCurrency(totalDeductions);
        
        // Aktualizovat graf srážek
        updateDeductionsChart(totalDeductions);
        
    } catch (error) {
        console.error('Chyba při načítání přehledu srážek:', error);
        showNotification('Chyba při načítání přehledu srážek.', 'error');
    }
}

// Aktualizace grafu srážek
function updateDeductionsChart(totalDeductions) {
    const deductionsChart = document.getElementById('deductions-chart');
    
    if (!deductionsChart) return;
    
    const ctx = deductionsChart.getContext('2d');
    
    // Načtení dat o dluzích
    getAllDebts().then(debts => {
        getAllPayments().then(payments => {
            // Výpočet celkových a aktivních dluhů
            let totalDebtAmount = 0;
            let totalPaidAmount = 0;
            
            debts.forEach(debt => {
                if (debt.currency === 'CZK') {
                    totalDebtAmount += debt.amount;
                    
                    // Výpočet zaplacené částky
                    const debtPayments = payments.filter(p => p.debtId === debt.id);
                    const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
                    
                    totalPaidAmount += totalPaid;
                }
            });
            
            const remainingDebt = totalDebtAmount - totalPaidAmount;
            
            // Vytvoření nebo aktualizace grafu
            if (window.deductionsChart) {
                window.deductionsChart.destroy();
            }
            
            window.deductionsChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Srážky', 'Splacené dluhy', 'Aktivní dluhy'],
                    datasets: [{
                        data: [totalDeductions, totalPaidAmount, remainingDebt],
                        backgroundColor: [
                            'rgba(40, 167, 69, 0.7)',
                            'rgba(13, 110, 253, 0.7)',
                            'rgba(255, 193, 7, 0.7)'
                        ],
                        borderColor: [
                            'rgba(40, 167, 69, 1)',
                            'rgba(13, 110, 253, 1)',
                            'rgba(255, 193, 7, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    let value = context.parsed || 0;
                                    return `${label}: ${formatCurrency(value)}`;
                                }
                            }
                        }
                    }
                }
            });
        });
    });
}

// Automatické splácení dluhů
async function checkDebtPayments() {
    try {
        // Načtení společného rozpočtu
        const budget = await getSharedBudget();
        
        // Pokud nemáme dostatek peněz, nic neděláme
        if (budget.balance <= 0) return;
        
        // Načtení dluhů
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        // Filtrování nesplacených dluhů
        const activeDebts = debts.filter(debt => {
            if (debt.currency !== 'CZK') return false; // Pouze CZK dluhy
            
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            
            return totalPaid < debt.amount;
        });
        
        // Seřazení dluhů podle priority (nejstarší první)
        activeDebts.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Pokus se splatit dluhy
        let remainingBudget = budget.balance;
        
        for (const debt of activeDebts) {
            // Výpočet zbývající částky dluhu
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            
            // Kolik můžeme zaplatit
            const paymentAmount = Math.min(remaining, remainingBudget);
            
            if (paymentAmount > 0) {
                // Vytvoření záznamu o splátce
                const payment = {
                    id: generateId(),
                    debtId: debt.id,
                    amount: paymentAmount,
                    date: new Date().toISOString().substring(0, 10),
                    note: 'Automatická splátka ze společného rozpočtu',
                    createdAt: new Date().toISOString()
                };
                
                // Uložení splátky
                await savePayment(payment);
                
                // Aktualizace zbývajícího rozpočtu
                remainingBudget -= paymentAmount;
                
                // Aktualizace společného rozpočtu
                await updateSharedBudget(-paymentAmount);
                
                showNotification(`Automaticky splaceno ${formatCurrency(paymentAmount)} z dluhu: ${debt.description}`, 'success');
                
                // Pokud jsme vyčerpali rozpočet, končíme
                if (remainingBudget <= 0) break;
            }
        }
    } catch (error) {
        console.error('Chyba při automatickém splácení dluhů:', error);
    }
}

// Kontrola platby nájmu
async function checkRentPayment() {
    try {
        // Načtení nastavení nájmu
        const rentAmountSetting = await getSettings('rentAmount');
        const rentDaySetting = await getSettings('rentDay');
        
        if (!rentAmountSetting || !rentDaySetting) return;
        
        const rentAmount = rentAmountSetting.value;
        const rentDay = rentDaySetting.value;
        
        // Aktuální datum
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        
        // Datum příští platby nájmu
        const nextRentDate = new Date(currentYear, currentMonth - 1, rentDay);
        
        // Pokud je datum v minulosti, přejdeme na další měsíc
        if (nextRentDate < today) {
            nextRentDate.setMonth(nextRentDate.getMonth() + 1);
        }
        
        // Formátování data další platby
        document.getElementById('next-rent-date').textContent = nextRentDate.toLocaleDateString('cs-CZ');
        
        // Kontrola, zda už byl v tomto měsíci zaplacen nájem
        const financeRecords = await getAllFinanceRecords();
        
        const rentPaidThisMonth = financeRecords.some(record => {
            if (record.type !== 'expense' || !record.description.toLowerCase().includes('nájem')) return false;
            
            const recordDate = new Date(record.date);
            return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear();
        });
        
        // Aktualizace UI
        const rentStatusValue = document.getElementById('rent-status-value');
        
        if (rentPaidThisMonth) {
            rentStatusValue.innerHTML = '<i class="fas fa-check-circle"></i> Zaplaceno';
            rentStatusValue.classList.add('success-color');
            rentStatusValue.classList.remove('danger-color');
        } else {
            // Kontrola, zda by měl být již zaplacen (jsme po dni splatnosti)
            if (currentDay >= rentDay) {
                rentStatusValue.innerHTML = '<i class="fas fa-exclamation-circle"></i> Nezaplaceno';
                rentStatusValue.classList.add('danger-color');
                rentStatusValue.classList.remove('success-color');
                
                // Automatické vytvoření platby nebo dluhu, pokud jsme přesně na dni splatnosti
                if (currentDay === rentDay) {
                    // Pokus o automatickou platbu z rozpočtu
                    const budget = await getSharedBudget();
                    
                    if (budget.balance >= rentAmount) {
                        // Vytvoření záznamu o platbě
                        const record = {
                            id: generateId(),
                            type: 'expense',
                            date: today.toISOString().substring(0, 10),
                            description: `Nájem za ${today.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}`,
                            category: 'Nájem',
                            amount: rentAmount,
                            currency: 'CZK',
                            createdAt: new Date().toISOString()
                        };
                        
                        await saveFinanceRecord(record);
                        
                        showNotification(`Automaticky zaplacen nájem ve výši ${formatCurrency(rentAmount)} ze společného rozpočtu.`, 'success');
                    } else {
                        // Vytvoření dluhu
                        const debt = {
                            id: generateId(),
                            person: 'maru', // Výchozí osoba pro dluh
                            description: `Nájem za ${today.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}`,
                            amount: rentAmount,
                            currency: 'CZK',
                            date: today.toISOString().substring(0, 10),
                            dueDate: null,
                            createdAt: new Date().toISOString()
                        };
                        
                        await saveDebt(debt);
                        
                        showNotification(`Vytvořen dluh za nájem ve výši ${formatCurrency(rentAmount)}, protože ve společném rozpočtu není dostatek prostředků.`, 'warning');
                    }
                    
                    // Aktualizace stavu nájmu
                    loadDebts();
                }
            } else {
                rentStatusValue.innerHTML = '<i class="fas fa-clock"></i> Čeká na platbu';
                rentStatusValue.classList.remove('danger-color');
                rentStatusValue.classList.remove('success-color');
            }
        }
    } catch (error) {
        console.error('Chyba při kontrole platby nájmu:', error);
    }
}

// ===== FILTRY A PŘEHLEDY =====
function initFilters() {
    const applyFiltersButton = document.getElementById('apply-filters');
    const resetFiltersButton = document.getElementById('reset-filters');
    
    // Tlačítka přepínače období pro grafy
    const periodButtons = document.querySelectorAll('.period-btn');
    
    if (periodButtons.length > 0) {
        periodButtons.forEach(button => {
            button.addEventListener('click', function() {
                periodButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                // Aktualizace grafů podle vybraného období
                updateCharts();
            });
        });
    }

    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', function() {
            loadWorkLogs();
            updateCharts();
        });
    }

    if (resetFiltersButton) {
        resetFiltersButton.addEventListener('click', function() {
            // Resetování formuláře filtrů
            document.getElementById('filter-person').value = '';
            document.getElementById('filter-activity').value = '';
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';

            // Znovu načtení záznamů a grafů
            loadWorkLogs();
            updateCharts();
        });
    }

    // Načtení přehledů při zobrazení sekce
    const prehledyLink = document.querySelector('a[data-section="prehledy"]');
    if (prehledyLink) {
        prehledyLink.addEventListener('click', function() {
            loadWorkLogs();
            updateCharts();
        });
    }
}

// Načtení záznamů o práci (s filtry)
async function loadWorkLogs() {
    const workLogsAccordion = document.getElementById('work-logs-accordion');

    if (!workLogsAccordion) return;

    try {
        // Získání hodnot filtrů
        const filterPerson = document.getElementById('filter-person').value;
        const filterActivity = document.getElementById('filter-activity').value;
        const filterStartDate = document.getElementById('filter-start-date').value;
        const filterEndDate = document.getElementById('filter-end-date').value;
        
        // Získání záznamů s filtry
        const filteredLogs = await getAllWorkLogs({
            person: filterPerson,
            activity: filterActivity,
            startDate: filterStartDate,
            endDate: filterEndDate
        });
        
        if (filteredLogs.length === 0) {
            workLogsAccordion.innerHTML = '<div class="empty-placeholder">Žádné záznamy odpovídající filtrům. Zkuste změnit filtry.</div>';
            return;
        }

        // Seřazení záznamů podle data (nejnovější první)
        filteredLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        // Seskupení záznamů podle data
        const logsByDate = {};

        filteredLogs.forEach(log => {
            const date = new Date(log.startTime).toISOString().substring(0, 10);

            if (!logsByDate[date]) {
                logsByDate[date] = [];
            }

            logsByDate[date].push(log);
        });

        // Vytvoření HTML pro akordeon
        let html = '';

        Object.keys(logsByDate).sort((a, b) => b.localeCompare(a)).forEach(date => {
            const logs = logsByDate[date];
            const formattedDate = new Date(date).toLocaleDateString('cs-CZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Výpočet celkového času a výdělku za den
            const totalDuration = logs.reduce((sum, log) => sum + log.duration, 0);
            const totalEarnings = logs.reduce((sum, log) => sum + log.earnings, 0);

            // Formátování celkového času
            const hours = Math.floor(totalDuration / (1000 * 60 * 60));
            const minutes = Math.floor((totalDuration % (1000 * 60 * 60)) / (1000 * 60));
            const formattedDuration = `${hours} h ${minutes} min`;

            html += `
                <div class="accordion-item">
                    <div class="accordion-header" data-date="${date}">
                        <div class="date-header-info">
                            <span class="date-text">${formattedDate}</span>
                            <span class="date-summary">${logs.length} záznam(ů), celkem ${formattedDuration}</span>
                        </div>
                        <div class="date-header-amount">
                            <span class="date-earnings">${totalEarnings.toFixed(0)} Kč</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                    <div class="accordion-content">
                        <div class="logs-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Osoba</th>
                                        <th>Úkol</th>
                                        <th>Začátek</th>
                                        <th>Konec</th>
                                        <th>Doba</th>
                                        <th>Výdělek</th>
                                        <th>Poznámka</th>
                                        <th>Akce</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${logs.map(log => {
                                        // Formátování časů
                                        const startTime = new Date(log.startTime).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                                        const endTime = new Date(log.endTime).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

                                        // Formátování doby
                                        const logHours = Math.floor(log.duration / (1000 * 60 * 60));
                                        const logMinutes = Math.floor((log.duration % (1000 * 60 * 60)) / (1000 * 60));
                                        const logDuration = `${logHours} h ${logMinutes} min`;

                                        return `
                                            <tr>
                                                <td>${log.person === 'maru' ? 'Maru' : 'Marty'}</td>
                                                <td>${log.activity}${log.subcategory ? ' - ' + log.subcategory : ''}</td>
                                                <td>${startTime}</td>
                                                <td>${endTime}</td>
                                                <td>${logDuration}</td>
                                                <td>${log.earnings.toFixed(0)} Kč</td>
                                                <td>${log.note || '-'}</td>
                                                <td>
                                                    <button class="btn edit-log-button" data-id="${log.id}">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn delete-log-button" data-id="${log.id}">
                                                        <i class="fas fa-trash-alt"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        workLogsAccordion.innerHTML = html;

        // Přidání posluchačů událostí pro akordeon
        workLogsAccordion.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', function() {
                this.classList.toggle('active');
                const content = this.nextElementSibling;

                if (content.classList.contains('active')) {
                    content.classList.remove('active');
                } else {
                    content.classList.add('active');
                }
            });
        });

        // Přidání posluchačů událostí pro tlačítka úpravy a smazání
        workLogsAccordion.querySelectorAll('.edit-log-button').forEach(button => {
            button.addEventListener('click', editWorkLogHandler);
        });

        workLogsAccordion.querySelectorAll('.delete-log-button').forEach(button => {
            button.addEventListener('click', deleteWorkLogHandler);
        });
    } catch (error) {
        console.error('Chyba při načítání záznamů o práci:', error);
        showNotification('Chyba při načítání záznamů o práci.', 'error');
    }
}

// ===== GRAFY =====
function initCharts() {
    // Inicializace grafů při načtení aplikace
    loadChartsData();
}

async function updateCharts() {
    // Aktualizace všech grafů
    loadChartsData();
}

async function loadChartsData() {
    try {
        // Načtení záznamů o práci pro grafy
        const filterPerson = document.getElementById('filter-person')?.value;
        const filterActivity = document.getElementById('filter-activity')?.value;
        const filterStartDate = document.getElementById('filter-start-date')?.value;
        const filterEndDate = document.getElementById('filter-end-date')?.value;
        
        const filters = {
            person: filterPerson,
            activity: filterActivity,
            startDate: filterStartDate,
            endDate: filterEndDate
        };
        
        const logs = await getAllWorkLogs(filters);
        
        // Načtení aktivního období pro statistiky
        const activePeriod = document.querySelector('.period-btn.active')?.getAttribute('data-period') || 'month';
        
        // Aktualizace statistik
        updateStatsChart(logs, activePeriod);
        
        // Aktualizace grafu úkolů
        updateTasksChart(logs);
        
    } catch (error) {
        console.error('Chyba při načítání dat pro grafy:', error);
        showNotification('Chyba při aktualizaci grafů.', 'error');
    }
}

// Aktualizace grafu statistik
function updateStatsChart(logs, period) {
    const statsChart = document.getElementById('stats-chart');
    
    if (!statsChart) return;
    
    const ctx = statsChart.getContext('2d');
    
    // Příprava dat podle období
    const currentDate = new Date();
    let startDate;
    
    switch (period) {
        case 'week':
            // Začátek aktuálního týdne (pondělí)
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() - currentDate.getDay() + (currentDate.getDay() === 0 ? -6 : 1));
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            // Začátek aktuálního měsíce
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            break;
        case 'year':
            // Začátek aktuálního roku
            startDate = new Date(currentDate.getFullYear(), 0, 1);
            break;
    }
    
    // Filtrování záznamů podle období
    const filteredLogs = logs.filter(log => new Date(log.startTime) >= startDate);
    
    // Příprava dat pro graf
    let labels = [];
    let dataPoints = [];
    
    if (period === 'week') {
        // Denní statistiky
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        
        // Vytvoření prázdného pole pro dny
        const logsByDay = Array(7).fill(0);
        
        filteredLogs.forEach(log => {
            const date = new Date(log.startTime);
            const dayOfWeek = date.getDay() || 7; // 1-7 (pondělí-neděle)
            const dayIndex = dayOfWeek === 7 ? 0 : dayOfWeek; // 0-6 pro indexování pole
            
            logsByDay[dayIndex] += log.duration;
        });
        
        // Převod milisekund na hodiny
        const logsByDayHours = logsByDay.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
        
        labels = dayNames;
        dataPoints = logsByDayHours;
    } else if (period === 'month') {
        // Týdenní statistiky
        const weeksInMonth = Math.ceil(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() / 7);
        
        // Vytvoření prázdného pole pro týdny
        const logsByWeek = Array(weeksInMonth).fill(0);
        
        filteredLogs.forEach(log => {
            const date = new Date(log.startTime);
            const weekOfMonth = Math.floor((date.getDate() - 1) / 7);
            
            logsByWeek[weekOfMonth] += log.duration;
        });
        
        // Převod milisekund na hodiny
        const logsByWeekHours = logsByWeek.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
        
        labels = Array(weeksInMonth).fill(0).map((_, i) => `Týden ${i + 1}`);
        dataPoints = logsByWeekHours;
    } else if (period === 'year') {
        // Měsíční statistiky
        const monthNames = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
        
        // Vytvoření prázdného pole pro měsíce
        const logsByMonth = Array(12).fill(0);
        
        filteredLogs.forEach(log => {
            const date = new Date(log.startTime);
            const month = date.getMonth();
            
            logsByMonth[month] += log.duration;
        });
        
        // Převod milisekund na hodiny
        const logsByMonthHours = logsByMonth.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
        
        labels = monthNames;
        dataPoints = logsByMonthHours;
    }
    
    // Vytvoření nebo aktualizace grafu
    if (window.statsChart) {
        window.statsChart.destroy();
    }
    
    window.statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Odpracované hodiny',
                data: dataPoints,
                backgroundColor: 'rgba(13, 110, 253, 0.7)',
                borderColor: 'rgba(13, 110, 253, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Hodiny'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: `Odpracované hodiny (${period === 'week' ? 'týden' : period === 'month' ? 'měsíc' : 'rok'})`
                }
            }
        }
    });
}

// Aktualizace grafu úkolů
function updateTasksChart(logs) {
    const tasksChart = document.getElementById('tasks-chart');
    
    if (!tasksChart) return;
    
    const ctx = tasksChart.getContext('2d');
    
    // Seskupení podle úkolů
    const taskData = {};
    
    logs.forEach(log => {
        if (!taskData[log.activity]) {
            taskData[log.activity] = 0;
        }
        
        taskData[log.activity] += log.duration;
    });
    
    // Převod na pole pro graf
    const labels = Object.keys(taskData);
    const data = Object.values(taskData).map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
    
    // Generování barev
    const colors = labels.map((_, index) => {
        const hue = (index * 137) % 360;
        return `hsla(${hue}, 70%, 60%, 0.7)`;
    });
    
    const borderColors = colors.map(color => color.replace('0.7', '1'));
    
    // Vytvoření nebo aktualizace grafu
    if (window.tasksChart) {
        window.tasksChart.destroy();
    }
    
    window.tasksChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                },
                title: {
                    display: true,
                    text: 'Rozdělení času podle úkolů (v hodinách)'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} h (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ===== EXPORT DAT =====
function initExportFunctions() {
    // Inicializace tlačítek pro export
    document.getElementById('export-work-logs')?.addEventListener('click', exportWorkLogs);
    document.getElementById('export-finance')?.addEventListener('click', exportFinance);
    document.getElementById('export-deductions')?.addEventListener('click', exportDeductions);
    document.getElementById('export-debts')?.addEventListener('click', exportDebts);
    
    // Inicializace správy dat
    document.getElementById('backup-data')?.addEventListener('click', backupData);
    document.getElementById('import-data-input')?.addEventListener('change', importData);
    document.getElementById('clear-all-data')?.addEventListener('click', clearAllData);
}

// Export záznamů o práci
async function exportWorkLogs() {
    try {
        // Získání hodnot filtrů
        const filterPerson = document.getElementById('filter-person')?.value;
        const filterActivity = document.getElementById('filter-activity')?.value;
        const filterStartDate = document.getElementById('filter-start-date')?.value;
        const filterEndDate = document.getElementById('filter-end-date')?.value;
        
        // Získání záznamů s filtry
        const logs = await getAllWorkLogs({
            person: filterPerson,
            activity: filterActivity,
            startDate: filterStartDate,
            endDate: filterEndDate
        });
        
        if (logs.length === 0) {
            showNotification('Žádné záznamy k exportu.', 'warning');
            return;
        }
        
        // Vytvoření CSV dat
        let csvContent = 'Osoba,Úkol,Podkategorie,Začátek,Konec,Doba (h),Výdělek (Kč),Poznámka\n';
        
        logs.forEach(log => {
            const person = log.person === 'maru' ? 'Maru' : 'Marty';
            const startTime = new Date(log.startTime).toLocaleString('cs-CZ');
            const endTime = new Date(log.endTime).toLocaleString('cs-CZ');
            const duration = (log.duration / (1000 * 60 * 60)).toFixed(2);
            const earnings = log.earnings.toFixed(0);
            const subcategory = log.subcategory ? `"${log.subcategory.replace(/"/g, '""')}"` : '';
            const note = log.note ? `"${log.note.replace(/"/g, '""')}"` : '';
            
            csvContent += `${person},"${log.activity}",${subcategory},${startTime},${endTime},${duration},${earnings},${note}\n`;
        });
        
        // Export do souboru
        downloadCSV(csvContent, 'pracovni-vykazy-export');
        
        showNotification('Export záznamů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Chyba při exportu záznamů:', error);
        showNotification('Chyba při exportu záznamů.', 'error');
    }
}

// Export finančních záznamů
async function exportFinance() {
    try {
        const financeRecords = await getAllFinanceRecords();
        
        if (financeRecords.length === 0) {
            showNotification('Žádné finanční záznamy k exportu.', 'warning');
            return;
        }
        
        // Vytvoření CSV dat
        let csvContent = 'Typ,Popis,Částka,Měna,Datum,Kategorie\n';
        
        financeRecords.forEach(record => {
            const type = record.type === 'income' ? 'Příjem' : 'Výdaj';
            const date = new Date(record.date).toLocaleDateString('cs-CZ');
            const description = `"${record.description.replace(/"/g, '""')}"`;
            const category = record.category ? `"${record.category.replace(/"/g, '""')}"` : '';
            
            csvContent += `${type},${description},${record.amount.toFixed(2)},${record.currency},${date},${category}\n`;
        });
        
        // Export do souboru
        downloadCSV(csvContent, 'finance-export');
        
        showNotification('Export finančních záznamů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Chyba při exportu finančních záznamů:', error);
        showNotification('Chyba při exportu finančních záznamů.', 'error');
    }
}

// Export srážek
async function exportDeductions() {
    try {
        const workLogs = await getAllWorkLogs();
        
        if (workLogs.length === 0) {
            showNotification('Žádné záznamy pro výpočet srážek.', 'warning');
            return;
        }
        
        // Získání unikátních osob a měsíců
        const workLogsByMonth = {};
        
        workLogs.forEach(log => {
            const date = new Date(log.startTime);
            const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthKey = `${month}-${log.person}`;
            
            if (!workLogsByMonth[monthKey]) {
                workLogsByMonth[monthKey] = {
                    person: log.person,
                    month: month,
                    totalDuration: 0,
                    totalEarnings: 0
                };
            }
            
            workLogsByMonth[monthKey].totalDuration += log.duration;
            workLogsByMonth[monthKey].totalEarnings += log.earnings;
        });
        
        // Příprava dat pro CSV
        const summaryData = Object.values(workLogsByMonth);
        
        // Seřazení podle data a osoby
        summaryData.sort((a, b) => {
            if (a.month !== b.month) {
                return b.month.localeCompare(a.month);
            }
            return a.person.localeCompare(b.person);
        });
        
        // Kontrola, zda je měsíc kompletní
        const currentDate = new Date();
        const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Filtrace kompletních měsíců
        const completeMonths = summaryData.filter(summary => summary.month !== currentMonth);
        
        if (completeMonths.length === 0) {
            showNotification('Žádné kompletní měsíce pro výpočet srážek.', 'warning');
            return;
        }
        
        // Vytvoření CSV dat
        let csvContent = 'Osoba,Měsíc,Celkem odpracováno (h),Hrubý výdělek (Kč),Srážka (%),Srážka (Kč)\n';
        
        completeMonths.forEach(summary => {
            const person = summary.person === 'maru' ? 'Maru' : 'Marty';
            const [year, month] = summary.month.split('-');
            const monthText = new Date(year, month - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
            
            // Výpočet srážky
            const deductionRate = DEDUCTION_RATES[summary.person] * 100;
            const deduction = Math.round(summary.totalEarnings * DEDUCTION_RATES[summary.person]);
            
            // Formátování doby
            const hours = (summary.totalDuration / (1000 * 60 * 60)).toFixed(2);
            
            csvContent += `${person},${monthText},${hours},${summary.totalEarnings.toFixed(0)},${deductionRate.toFixed(2)},${deduction}\n`;
        });
        
        // Export do souboru
        downloadCSV(csvContent, 'srazky-export');
        
        showNotification('Export srážek byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Chyba při exportu srážek:', error);
        showNotification('Chyba při exportu srážek.', 'error');
    }
}

// Export dluhů
async function exportDebts() {
    try {
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        if (debts.length === 0) {
            showNotification('Žádné dluhy k exportu.', 'warning');
            return;
        }
        
        // Vytvoření CSV dat pro dluhy
        let csvContent = 'Osoba,Popis,Celková částka,Měna,Datum vzniku,Datum splatnosti,Zaplaceno,Zbývá\n';
        
        debts.forEach(debt => {
            const person = debt.person === 'maru' ? 'Maru' : 'Marty';
            const dateCreated = new Date(debt.date).toLocaleDateString('cs-CZ');
            const dateDue = debt.dueDate ? new Date(debt.dueDate).toLocaleDateString('cs-CZ') : '';
            
            // Výpočet zaplacené částky
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            
            // Popis (escapování uvozovek)
            const description = `"${debt.description.replace(/"/g, '""')}"`;
            
            csvContent += `${person},${description},${debt.amount.toFixed(2)},${debt.currency},${dateCreated},${dateDue},${totalPaid.toFixed(2)},${remaining.toFixed(2)}\n`;
        });
        
        // Export do souboru
        downloadCSV(csvContent, 'dluhy-export');
        
        showNotification('Export dluhů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Chyba při exportu dluhů:', error);
        showNotification('Chyba při exportu dluhů.', 'error');
    }
}

// Stáhnout CSV soubor
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const now = new Date();
    const dateStr = now.toISOString().substring(0, 10);
    const fullFilename = `${filename}-${dateStr}.csv`;
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fullFilename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

// Záloha dat
async function backupData() {
    try {
        // Načtení všech dat z databáze
        const workLogs = await getAllWorkLogs();
        const financeRecords = await getAllFinanceRecords();
        const taskCategories = await getAllTaskCategories();
        const expenseCategories = await getAllExpenseCategories();
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        const rentSettings = {
            amount: (await getSettings('rentAmount'))?.value || 24500,
            day: (await getSettings('rentDay'))?.value || 1
        };
        const budget = await getSharedBudget();
        
        // Vytvoření objektu zálohy
        const backup = {
            workLogs,
            financeRecords,
            taskCategories,
            expenseCategories,
            debts,
            debtPayments: payments,
            rentSettings,
            sharedBudget: budget,
            createdAt: new Date().toISOString()
        };
        
        // Převod na JSON
        const jsonData = JSON.stringify(backup, null, 2);
        
        // Vytvoření a stažení souboru
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const now = new Date();
        const dateStr = now.toISOString().substring(0, 10);
        const filename = `pracovni-vykazy-zaloha-${dateStr}.json`;
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        showNotification('Záloha dat byla úspěšně vytvořena.', 'success');
    } catch (error) {
        console.error('Chyba při zálohování dat:', error);
        showNotification('Chyba při zálohování dat.', 'error');
    }
}

// Import dat ze zálohy
function importData(e) {
    if (e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        showNotification('Vyberte platný soubor JSON.', 'warning');
        return;
    }
    
    if (confirm('Obnovením dat ze zálohy přepíšete všechna existující data. Chcete pokračovat?')) {
        const reader = new FileReader();
        
        reader.onload = async function(event) {
            try {
                const data = JSON.parse(event.target.result);
                
                // Kontrola platnosti dat
                if (!data.workLogs || !data.financeRecords || !data.taskCategories || 
                    !data.expenseCategories || !data.debts || !data.debtPayments) {
                    throw new Error('Neplatný formát dat.');
                }
                
                // Smazání stávajících dat
                await clearDatabase();
                
                // Import dat
                
                // Task categories
                for (const category of data.taskCategories) {
                    await addTaskCategory(category);
                }
                
                // Expense categories
                for (const category of data.expenseCategories) {
                    await addExpenseCategory(category);
                }
                
                // Work logs
                for (const log of data.workLogs) {
                    await saveWorkLog(log);
                }
                
                // Finance records
                for (const record of data.financeRecords) {
                    await saveFinanceRecord(record);
                }
                
                // Debts
                for (const debt of data.debts) {
                    await saveDebt(debt);
                }
                
                // Debt payments
                for (const payment of data.debtPayments) {
                    await savePayment(payment);
                }
                
                // Rent settings
                if (data.rentSettings) {
                    await saveSettings('rentAmount', data.rentSettings.amount);
                    await saveSettings('rentDay', data.rentSettings.day);
                }
                
                // Shared budget
                if (data.sharedBudget) {
                    await saveSharedBudget(data.sharedBudget);
                }
                
                // Inicializace
                await saveSettings('initialized', true);
                
                showNotification('Data byla úspěšně obnovena ze zálohy. Stránka bude obnovena.', 'success');
                
                // Obnovení stránky po krátkém zpoždění
                setTimeout(() => {
                    location.reload();
                }, 2000);
                
            } catch (error) {
                console.error('Chyba při obnovování dat:', error);
                showNotification('Chyba při obnovování dat. Ujistěte se, že máte platný soubor zálohy.', 'error');
            }
        };
        
        reader.readAsText(file);
    }
    
    // Vyčištění vstupu
    e.target.value = '';
}

// Smazání všech dat
async function clearAllData() {
    if (confirm('POZOR! Opravdu chcete smazat všechna data? Tato akce je nevratná!')) {
        if (confirm('Poslední varování: Všechna vaše data budou smazána. Pokračovat?')) {
            try {
                await clearDatabase();
                
                // Inicializace výchozích dat
                await initializeDefaultData();
                
                showNotification('Všechna data byla smazána. Stránka bude obnovena.', 'success');
                
                // Obnovení stránky po krátkém zpoždění
                setTimeout(() => {
                    location.reload();
                }, 2000);
                
            } catch (error) {
                console.error('Chyba při mazání dat:', error);
                showNotification('Chyba při mazání dat.', 'error');
            }
        }
    }
}

// Vyčištění databáze
async function clearDatabase() {
    return new Promise((resolve, reject) => {
        try {
            // Smazání všech úložišť
            const stores = ['workLogs', 'financeRecords', 'taskCategories', 'expenseCategories', 
                           'debts', 'debtPayments', 'settings', 'sharedBudget'];
            
            const transaction = db.transaction(stores, 'readwrite');
            let completed = 0;
            
            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = function() {
                    completed++;
                    if (completed === stores.length) {
                        resolve();
                    }
                };
                
                request.onerror = function(event) {
                    reject(event.target.error);
                };
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// ===== NOTIFIKACE =====
function initNotifications() {
    const notification = document.getElementById('notification');
    const closeBtn = notification.querySelector('.notification-close');
    
    closeBtn.addEventListener('click', function() {
        notification.classList.remove('show');
    });
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const title = notification.querySelector('.notification-title');
    const messageEl = notification.querySelector('.notification-message');
    const icon = notification.querySelector('.notification-icon i');
    
    // Odstranění předchozích tříd typů
    notification.classList.remove('success', 'error', 'warning', 'info');
    
    // Nastavení textu a třídy podle typu
    switch (type) {
        case 'success':
            title.textContent = 'Úspěch';
            icon.className = 'fas fa-check-circle';
            notification.classList.add('success');
            break;
        case 'error':
            title.textContent = 'Chyba';
            icon.className = 'fas fa-exclamation-circle';
            notification.classList.add('error');
            break;
        case 'warning':
            title.textContent = 'Upozornění';
            icon.className = 'fas fa-exclamation-triangle';
            notification.classList.add('warning');
            break;
        default:
            title.textContent = 'Informace';
            icon.className = 'fas fa-info-circle';
            notification.classList.add('info');
    }
    
    messageEl.textContent = message;
    
    // Zobrazení notifikace
    notification.classList.add('show');
    
    // Automatické skrytí po 5 sekundách (kromě chyb)
    if (type !== 'error') {
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }
}

// ===== RYCHLÉ AKCE =====
function initQuickActions() {
    // Již inicializováno v rámci příslušných formulářů
}

// ===== POMOCNÉ FUNKCE =====
// Generování ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// Formátování měny
function formatCurrency(amount) {
    return new Intl.NumberFormat('cs-CZ', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' Kč';
}