// Constants & Configurations
const RATES = {
    'maru': 275,
    'marty': 400
};

const DEDUCTION_RATES = {
    'maru': 0.3333, // 1/3
    'marty': 0.5    // 1/2
};

// Database variables
let db;

// Timer state
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

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize database
    initDatabase().then(() => {
        console.log('Database initialized');
        loadAllData();
    });

    // Initialize navigation
    initNavigation();

    // Initialize timer
    initTimer();

    // Initialize manual entry form
    initManualEntryForm();

    // Initialize finance form
    initFinanceForm();

    // Initialize debt management
    initDebtManagement();

    // Initialize filters
    initFilters();

    // Initialize charts
    initCharts();

    // Initialize export functions
    initExportFunctions();

    // Initialize settings
    initSettings();

    // Initialize notifications
    initNotifications();

    // Set today's date in all date inputs
    setTodaysDate();

    // Check rent payment
    checkRentPayment();
});

// =========================
// DATABASE INITIALIZATION
// =========================
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WorkTrackerDB', 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;

            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains('workLogs')) {
                const workLogsStore = db.createObjectStore('workLogs', { keyPath: 'id' });
                workLogsStore.createIndex('person', 'person', { unique: false });
                workLogsStore.createIndex('startTime', 'startTime', { unique: false });
            }

            if (!db.objectStoreNames.contains('financeRecords')) {
                const financeStore = db.createObjectStore('financeRecords', { keyPath: 'id' });
                financeStore.createIndex('type', 'type', { unique: false });
                financeStore.createIndex('date', 'date', { unique: false });
            }

            if (!db.objectStoreNames.contains('taskCategories')) {
                db.createObjectStore('taskCategories', { keyPath: 'name' });
            }

            if (!db.objectStoreNames.contains('expenseCategories')) {
                db.createObjectStore('expenseCategories', { keyPath: 'name' });
            }

            if (!db.objectStoreNames.contains('debts')) {
                const debtsStore = db.createObjectStore('debts', { keyPath: 'id' });
                debtsStore.createIndex('person', 'person', { unique: false });
                debtsStore.createIndex('date', 'date', { unique: false });
            }

            if (!db.objectStoreNames.contains('debtPayments')) {
                const paymentsStore = db.createObjectStore('debtPayments', { keyPath: 'id' });
                paymentsStore.createIndex('debtId', 'debtId', { unique: false });
                paymentsStore.createIndex('date', 'date', { unique: false });
            }

            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains('sharedBudget')) {
                db.createObjectStore('sharedBudget', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            initializeDefaultData();
            resolve();
        };

        request.onerror = function(event) {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function initializeDefaultData() {
    // Check if data is already initialized
    const settings = await getSettings('initialized');
    if (settings && settings.value) return;

    // Default task categories
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

    // Default expense categories
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

    // Default rent settings
    await saveSettings('rentAmount', 24500);
    await saveSettings('rentDay', 1);
    
    // Initialize shared budget
    await saveSharedBudget({
        balance: 0,
        lastUpdated: new Date().toISOString()
    });

    // Mark as initialized
    await saveSettings('initialized', true);
    await saveSettings('theme', 'light');
    await saveSettings('colorTheme', 'blue');
}

// =========================
// SHARED BUDGET FUNCTIONS
// =========================
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
    
    // Update UI elements showing the budget
    updateBudgetDisplay(budget.balance);
    
    // Check for debt payments from surplus
    if (budget.balance > 0) {
        await checkDebtPayments();
    }
}

function updateBudgetDisplay(balance) {
    // Update all UI elements showing the shared budget
    const sharedBudgetElements = document.querySelectorAll('#shared-budget, #finance-budget');
    sharedBudgetElements.forEach(el => {
        if (el) el.textContent = formatCurrency(balance);
    });
    
    // Update circle display
    const balanceCircle = document.getElementById('balance-circle-fill');
    if (balanceCircle) {
        // Percentage fill (max 100000 Kč = 100%)
        const maxBalance = 100000;
        const percentage = Math.min(100, Math.max(0, (balance / maxBalance) * 100));
        balanceCircle.setAttribute('stroke-dasharray', `${percentage}, 100`);
        
        // Set color based on balance
        if (balance < 0) {
            balanceCircle.style.stroke = 'var(--danger-color)';
        } else if (balance < 5000) {
            balanceCircle.style.stroke = 'var(--warning-color)';
        } else {
            balanceCircle.style.stroke = 'var(--success-color)';
        }
    }
}

// =========================
// SETTINGS FUNCTIONS
// =========================
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

// =========================
// WORK LOG FUNCTIONS
// =========================
async function saveWorkLog(workLog) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.put(workLog);
        
        request.onsuccess = async () => {
            // Calculate deduction for shared budget
            const deductionRate = DEDUCTION_RATES[workLog.person];
            const deduction = Math.round(workLog.earnings * deductionRate);
            
            // Update shared budget with deduction
            await updateSharedBudget(deduction);
            
            // Update UI
            loadRecentWorkLogs();
            updateTodaySummary();
            loadDeductionsSummary();
            
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateWorkLog(workLog) {
    // Get the old record to calculate deduction difference
    const oldWorkLog = await getWorkLog(workLog.id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.put(workLog);
        
        request.onsuccess = async () => {
            // Calculate deduction difference
            if (oldWorkLog) {
                const oldDeduction = Math.round(oldWorkLog.earnings * DEDUCTION_RATES[oldWorkLog.person]);
                const newDeduction = Math.round(workLog.earnings * DEDUCTION_RATES[workLog.person]);
                const deductionDifference = newDeduction - oldDeduction;
                
                // Update shared budget with difference
                if (deductionDifference !== 0) {
                    await updateSharedBudget(deductionDifference);
                }
            }
            
            // Update UI
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
    // Get the log first to calculate deduction to remove
    const workLog = await getWorkLog(id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['workLogs'], 'readwrite');
        const store = transaction.objectStore('workLogs');
        
        const request = store.delete(id);
        
        request.onsuccess = async () => {
            // Remove deduction from shared budget
            if (workLog) {
                const deduction = Math.round(workLog.earnings * DEDUCTION_RATES[workLog.person]);
                await updateSharedBudget(-deduction);
            }
            
            // Update UI
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
            
            // Apply filters
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

// =========================
// FINANCE RECORD FUNCTIONS
// =========================
async function saveFinanceRecord(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.put(record);
        
        request.onsuccess = async () => {
            // Handle CZK records - impact on shared budget
            if (record.currency === 'CZK') {
                // Expense decreases shared budget
                if (record.type === 'expense') {
                    await updateSharedBudget(-record.amount);
                }
                // Income increases shared budget
                else if (record.type === 'income') {
                    await updateSharedBudget(record.amount);
                }
            }
            
            // Update UI
            loadFinanceRecords();
            updateFinanceSummary();
            
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateFinanceRecord(record) {
    // Get the old record to calculate budget impact
    const oldRecord = await getFinanceRecord(record.id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.put(record);
        
        request.onsuccess = async () => {
            // Calculate impact on shared budget (CZK only)
            if (oldRecord && oldRecord.currency === 'CZK' && record.currency === 'CZK') {
                let budgetDifference = 0;
                
                // Same type calculations
                if (oldRecord.type === 'expense' && record.type === 'expense') {
                    // Higher expense = more negative, lower expense = more positive
                    budgetDifference = oldRecord.amount - record.amount;
                }
                else if (oldRecord.type === 'income' && record.type === 'income') {
                    // Higher income = more positive, lower income = more negative
                    budgetDifference = record.amount - oldRecord.amount;
                }
                // Type change calculations
                else if (oldRecord.type === 'expense' && record.type === 'income') {
                    // Changed from expense to income = double positive
                    budgetDifference = oldRecord.amount + record.amount;
                }
                else if (oldRecord.type === 'income' && record.type === 'expense') {
                    // Changed from income to expense = double negative
                    budgetDifference = -(oldRecord.amount + record.amount);
                }
                
                // Update budget if there's a difference
                if (budgetDifference !== 0) {
                    await updateSharedBudget(budgetDifference);
                }
            }
            // Currency change
            else if (oldRecord && oldRecord.currency !== record.currency) {
                // If old record was CZK, revert its effect
                if (oldRecord.currency === 'CZK') {
                    if (oldRecord.type === 'expense') {
                        await updateSharedBudget(oldRecord.amount); // Add back expense
                    } else if (oldRecord.type === 'income') {
                        await updateSharedBudget(-oldRecord.amount); // Remove income
                    }
                }
                
                // If new record is CZK, add its effect
                if (record.currency === 'CZK') {
                    if (record.type === 'expense') {
                        await updateSharedBudget(-record.amount); // Remove expense
                    } else if (record.type === 'income') {
                        await updateSharedBudget(record.amount); // Add income
                    }
                }
            }
            
            // Update UI
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
    // Get the record first to calculate budget impact
    const record = await getFinanceRecord(id);
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['financeRecords'], 'readwrite');
        const store = transaction.objectStore('financeRecords');
        
        const request = store.delete(id);
        
        request.onsuccess = async () => {
            // Revert impact on shared budget (CZK only)
            if (record && record.currency === 'CZK') {
                if (record.type === 'expense') {
                    // Removing expense = adding back to budget
                    await updateSharedBudget(record.amount);
                } else if (record.type === 'income') {
                    // Removing income = subtracting from budget
                    await updateSharedBudget(-record.amount);
                }
            }
            
            // Update UI
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

// =========================
// CATEGORY FUNCTIONS
// =========================
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

// =========================
// DEBT FUNCTIONS
// =========================
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
        
        // Delete the debt first
        const debtRequest = debtStore.delete(id);
        
        debtRequest.onsuccess = () => {
            // Then get and delete all associated payments
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

// =========================
// DEBT PAYMENT FUNCTIONS
// =========================
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

// =========================
// UI INITIALIZATION & UPDATES
// =========================
async function loadAllData() {
    try {
        // Load categories for select elements
        await loadCategories();
        
        // Load recent work logs
        await loadRecentWorkLogs();
        
        // Update summaries
        await updateTodaySummary();
        await updateFinanceSummary();
        
        // Load finance records
        await loadFinanceRecords();
        
        // Load debts
        await loadDebts();
        await loadDebtsForPaymentForm();
        
        // Load deductions summary
        await loadDeductionsSummary();
        
        // Update charts
        await updateCharts();
        
        // Initialize theme
        await initTheme();
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('Chyba při načítání dat. Zkuste obnovit stránku.', 'error');
    }
}

// Initialize navigation
function initNavigation() {
    const navLinks = document.querySelectorAll('nav a');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and sections
            navLinks.forEach(l => l.classList.remove('active'));
            document.querySelectorAll('main > section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('data-section');
            document.getElementById(targetId).classList.add('active');
            
            // Update URL hash
            window.location.hash = targetId;
        });
    });
    
    // Check URL hash on page load
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const targetLink = document.querySelector(`nav a[data-section="${targetId}"]`);
        
        if (targetLink) {
            targetLink.click();
        }
    }
}

// Load categories into select elements
async function loadCategories() {
    try {
        // Load task categories
        const taskCategories = await getAllTaskCategories();
        const taskSelects = document.querySelectorAll('#task-select, #manual-activity, #filter-activity');
        
        taskSelects.forEach(select => {
            // Save the first option (placeholder)
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            // Add categories
            taskCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                select.appendChild(option);
            });
        });
        
        // Load expense categories
        const expenseCategories = await getAllExpenseCategories();
        const financeCategory = document.getElementById('finance-category');
        
        if (financeCategory) {
            // Save the first option (placeholder)
            const firstOption = financeCategory.options[0];
            financeCategory.innerHTML = '';
            financeCategory.appendChild(firstOption);
            
            // Add categories
            expenseCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                financeCategory.appendChild(option);
            });
        }
        
        // Display categories in settings
        displayCategoryLists(taskCategories, expenseCategories);
    } catch (error) {
        console.error('Error loading categories:', error);
        showNotification('Chyba při načítání kategorií', 'error');
    }
}

// Display category lists in settings
function displayCategoryLists(taskCategories, expenseCategories) {
    // Task categories list
    const taskCategoriesList = document.getElementById('task-categories-list');
    
    if (taskCategoriesList) {
        taskCategoriesList.innerHTML = '';
        
        if (taskCategories.length === 0) {
            taskCategoriesList.innerHTML = '<li class="empty-placeholder">Žádné kategorie úkolů</li>';
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
            
            // Add event listeners to delete buttons
            taskCategoriesList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', deleteCategoryHandler);
            });
        }
    }
    
    // Expense categories list
    const expenseCategoriesList = document.getElementById('expense-categories-list');
    
    if (expenseCategoriesList) {
        expenseCategoriesList.innerHTML = '';
        
        if (expenseCategories.length === 0) {
            expenseCategoriesList.innerHTML = '<li class="empty-placeholder">Žádné kategorie výdajů</li>';
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
            
            // Add event listeners to delete buttons
            expenseCategoriesList.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', deleteCategoryHandler);
            });
        }
    }
}

// Category delete handler
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
            
            await loadCategories();
            showNotification('Kategorie byla smazána', 'success');
        } catch (error) {
            console.error('Error deleting category:', error);
            showNotification('Chyba při mazání kategorie', 'error');
        }
    }
}

// Load debts for payment form
async function loadDebtsForPaymentForm() {
    const paymentDebtSelect = document.getElementById('payment-debt-id');
    
    if (!paymentDebtSelect) return;
    
    try {
        // Clear select
        paymentDebtSelect.innerHTML = '';
        paymentDebtSelect.appendChild(new Option('-- Vyberte dluh --', ''));
        
        // Get debts and payments
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        // Filter active debts (with remaining balance)
        const activeDebts = debts.filter(debt => {
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            return totalPaid < debt.amount;
        });
        
        if (activeDebts.length > 0) {
            activeDebts.forEach(debt => {
                // Calculate remaining amount
                const debtPayments = payments.filter(p => p.debtId === debt.id);
                const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
                const remaining = debt.amount - totalPaid;
                
                const option = new Option(
                    `${debt.description} (${debt.person === 'maru' ? 'Maru' : 'Marty'}) - ${formatCurrency(remaining, debt.currency)}`,
                    debt.id
                );
                paymentDebtSelect.appendChild(option);
            });
        } else {
            const option = new Option('-- Žádné aktivní dluhy --', '');
            option.disabled = true;
            paymentDebtSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading debts for payment form:', error);
        showNotification('Chyba při načítání dluhů', 'error');
    }
}

// Set today's date in all date inputs
function setTodaysDate() {
    const today = new Date().toISOString().substring(0, 10);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
}

// =========================
// TIMER FUNCTIONALITY
// =========================
function initTimer() {
    // Person selector
    initPersonSelector();
    
    // Timer buttons
    const startBtn = document.getElementById('timer-start');
    const stopBtn = document.getElementById('timer-stop');
    
    if (startBtn) {
        startBtn.addEventListener('click', startTimer);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopTimer);
    }
    
    // Form fields
    const taskSelect = document.getElementById('task-select');
    const taskSubcategory = document.getElementById('task-subcategory');
    const taskNote = document.getElementById('task-note');
    
    if (taskSelect) {
        taskSelect.addEventListener('change', function() {
            timerState.activity = this.value;
        });
    }
    
    if (taskSubcategory) {
        taskSubcategory.addEventListener('input', function() {
            timerState.subcategory = this.value;
        });
    }
    
    if (taskNote) {
        taskNote.addEventListener('input', function() {
            timerState.note = this.value;
        });
    }
    
    // Restore timer state from local storage
    restoreTimerState();
}

// Initialize person selector dropdown
function initPersonSelector() {
    const dropdown = document.getElementById('person-dropdown');
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    
    // Toggle dropdown
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.matches('.dropdown-toggle') && !e.target.closest('.dropdown-toggle')) {
            if (dropdown) dropdown.classList.remove('show');
        }
    });
    
    // Person selection
    if (dropdown) {
        const dropdownItems = dropdown.querySelectorAll('.dropdown-item');
        
        dropdownItems.forEach(item => {
            item.addEventListener('click', function() {
                const person = this.getAttribute('data-person');
                const rate = this.getAttribute('data-rate');
                
                timerState.person = person;
                
                // Update UI
                const selectedPerson = document.getElementById('selected-person');
                const selectedRate = document.getElementById('selected-rate');
                
                if (selectedPerson) selectedPerson.textContent = person.charAt(0).toUpperCase() + person.slice(1);
                if (selectedRate) selectedRate.textContent = rate + ' Kč/h';
                
                if (dropdown) dropdown.classList.remove('show');
                
                // If timer is running, update earnings display
                if (timerState.running) {
                    updateEarningsDisplay();
                }
            });
        });
    }
}

// Start timer
function startTimer() {
    // Check if task is selected
    const taskSelect = document.getElementById('task-select');
    if (!taskSelect || !taskSelect.value) {
        showNotification('Vyberte prosím úkol před spuštěním časovače.', 'warning');
        return;
    }
    
    // Update button states
    document.getElementById('timer-start').disabled = true;
    document.getElementById('timer-stop').disabled = false;
    
    // Update timer state
    timerState.running = true;
    timerState.activity = taskSelect.value;
    timerState.subcategory = document.getElementById('task-subcategory').value;
    timerState.note = document.getElementById('task-note').value;
    
    // Initialize start time
    if (!timerState.startTime) {
        timerState.startTime = new Date().getTime() - timerState.pausedTime;
    } else {
        timerState.startTime = new Date().getTime() - timerState.pausedTime;
    }
    
    // Start interval for updating timer
    timerState.timerInterval = setInterval(updateTimer, 1000);
    
    // Add running class to timer
    document.querySelector('.timer-display').classList.add('running');
    
    // Save timer state
    saveTimerState();
    
    // Show notification
    showNotification('Časovač byl spuštěn.', 'success');
}

// Stop timer and save work log
function stopTimer() {
    if (!timerState.startTime) return;
    
    // Stop timer interval
    clearInterval(timerState.timerInterval);
    
    // Update button states
    document.getElementById('timer-start').disabled = false;
    document.getElementById('timer-stop').disabled = true;
    
    // Remove running class
    document.querySelector('.timer-display').classList.remove('running');
    
    // Calculate total time and earnings
    const endTime = new Date().getTime();
    const totalTime = endTime - timerState.startTime;
    const totalHours = totalTime / (1000 * 60 * 60);
    const rate = RATES[timerState.person];
    const earnings = totalHours * rate;
    const deductionRate = DEDUCTION_RATES[timerState.person];
    const deduction = earnings * deductionRate;
    
    // Create work log
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
    
    // Save work log
    saveWorkLog(workLog).then(() => {
        // Reset timer
        resetTimer();
        
        // Show notification
        showNotification(`Záznam byl uložen. Výdělek: ${Math.round(earnings)} Kč, Srážka: ${Math.round(deduction)} Kč.`, 'success');
    }).catch(error => {
        console.error('Error saving work log:', error);
        showNotification('Chyba při ukládání záznamu.', 'error');
    });
}

// Update timer display
function updateTimer() {
    if (!timerState.running || !timerState.startTime) return;
    
    const currentTime = new Date().getTime();
    const elapsedTime = currentTime - timerState.startTime;
    
    // Update timer digits
    updateTimerDigits(elapsedTime);
    
    // Update earnings display
    updateEarningsDisplay();
    
    // Save timer state
    saveTimerState();
}

// Update timer digits
function updateTimerDigits(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    
    seconds = seconds % 60;
    minutes = minutes % 60;
    
    // Split into individual digits
    const hoursTens = Math.floor(hours / 10);
    const hoursOnes = hours % 10;
    const minutesTens = Math.floor(minutes / 10);
    const minutesOnes = minutes % 10;
    const secondsTens = Math.floor(seconds / 10);
    const secondsOnes = seconds % 10;
    
    // Update digit elements
    const digits = {
        'hours-tens': hoursTens,
        'hours-ones': hoursOnes,
        'minutes-tens': minutesTens,
        'minutes-ones': minutesOnes,
        'seconds-tens': secondsTens,
        'seconds-ones': secondsOnes
    };
    
    Object.keys(digits).forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = digits[id];
    });
}

// Update earnings display
function updateEarningsDisplay() {
    if (!timerState.startTime) return;
    
    const currentTime = new Date().getTime();
    const elapsedTime = currentTime - timerState.startTime;
    const hours = elapsedTime / (1000 * 60 * 60);
    const rate = RATES[timerState.person];
    const earnings = hours * rate;
    const deductionRate = DEDUCTION_RATES[timerState.person];
    const deduction = earnings * deductionRate;
    const netEarnings = earnings - deduction;
    
    // Update UI elements
    const currentEarningsEl = document.getElementById('current-earnings');
    const currentDeductionEl = document.getElementById('current-deduction');
    const currentNetEl = document.getElementById('current-net');
    
    if (currentEarningsEl) currentEarningsEl.textContent = `${Math.round(earnings)} Kč`;
    if (currentDeductionEl) currentDeductionEl.textContent = `${Math.round(deduction)} Kč`;
    if (currentNetEl) currentNetEl.textContent = `${Math.round(netEarnings)} Kč`;
}

// Reset timer
function resetTimer() {
    // Stop interval
    clearInterval(timerState.timerInterval);
    
    // Reset state
    timerState.running = false;
    timerState.startTime = null;
    timerState.pausedTime = 0;
    timerState.activity = '';
    timerState.subcategory = '';
    timerState.note = '';
    
    // Reset UI - digits
    const digitIds = ['hours-tens', 'hours-ones', 'minutes-tens', 'minutes-ones', 'seconds-tens', 'seconds-ones'];
    digitIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
    });
    
    // Reset UI - earnings
    const currentEarningsEl = document.getElementById('current-earnings');
    const currentDeductionEl = document.getElementById('current-deduction');
    const currentNetEl = document.getElementById('current-net');
    
    if (currentEarningsEl) currentEarningsEl.textContent = '0 Kč';
    if (currentDeductionEl) currentDeductionEl.textContent = '0 Kč';
    if (currentNetEl) currentNetEl.textContent = '0 Kč';
    
    // Reset button states
    const startBtn = document.getElementById('timer-start');
    const stopBtn = document.getElementById('timer-stop');
    
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    
    // Reset form
    const taskSelect = document.getElementById('task-select');
    const taskSubcategory = document.getElementById('task-subcategory');
    const taskNote = document.getElementById('task-note');
    
    if (taskSelect) taskSelect.value = '';
    if (taskSubcategory) taskSubcategory.value = '';
    if (taskNote) taskNote.value = '';
    
    // Remove running class
    document.querySelector('.timer-display').classList.remove('running');
    
    // Clear local storage
    localStorage.removeItem('timerState');
}

// Save timer state to local storage
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

// Restore timer state from local storage
function restoreTimerState() {
    const savedState = localStorage.getItem('timerState');
    
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            
            if (state.running) {
                // Restore state
                timerState.running = state.running;
                timerState.startTime = state.startTime;
                timerState.pausedTime = state.pausedTime;
                timerState.person = state.person;
                timerState.activity = state.activity;
                timerState.subcategory = state.subcategory;
                timerState.note = state.note;
                
                // Update UI
                const selectedPersonEl = document.getElementById('selected-person');
                const selectedRateEl = document.getElementById('selected-rate');
                const taskSelectEl = document.getElementById('task-select');
                const taskSubcategoryEl = document.getElementById('task-subcategory');
                const taskNoteEl = document.getElementById('task-note');
                
                if (selectedPersonEl) selectedPersonEl.textContent = timerState.person.charAt(0).toUpperCase() + timerState.person.slice(1);
                if (selectedRateEl) selectedRateEl.textContent = RATES[timerState.person] + ' Kč/h';
                if (taskSelectEl) taskSelectEl.value = timerState.activity;
                if (taskSubcategoryEl) taskSubcategoryEl.value = timerState.subcategory;
                if (taskNoteEl) taskNoteEl.value = timerState.note;
                
                // Start timer
                timerState.timerInterval = setInterval(updateTimer, 1000);
                updateTimer();
                
                // Update button states
                const startBtn = document.getElementById('timer-start');
                const stopBtn = document.getElementById('timer-stop');
                
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                
                // Add running class
                document.querySelector('.timer-display').classList.add('running');
            }
        } catch (error) {
            console.error('Error restoring timer state:', error);
            localStorage.removeItem('timerState');
        }
    }
}

// =========================
// MANUAL ENTRY FORM
// =========================
function initManualEntryForm() {
    const manualEntryForm = document.getElementById('manual-entry-form');
    const cancelEditButton = document.getElementById('cancel-edit-button');
    
    if (manualEntryForm) {
        manualEntryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Check if activity is selected
            if (!document.getElementById('manual-activity').value) {
                showNotification('Vyberte prosím úkol.', 'warning');
                return;
            }
            
            // Get form values
            const id = document.getElementById('edit-log-id').value || generateId();
            const person = document.getElementById('manual-person').value;
            const date = document.getElementById('manual-date').value;
            const startTime = document.getElementById('manual-start-time').value;
            const endTime = document.getElementById('manual-end-time').value;
            const breakTime = parseInt(document.getElementById('manual-break-time').value) || 0;
            const activity = document.getElementById('manual-activity').value;
            const subcategory = document.getElementById('manual-subcategory').value;
            const note = document.getElementById('manual-note').value;
            
            // Create Date objects
            const startDate = new Date(`${date}T${startTime}`);
            const endDate = new Date(`${date}T${endTime}`);
            
            // Validate end time is after start time
            if (endDate <= startDate) {
                showNotification('Konec musí být po začátku.', 'warning');
                return;
            }
            
            // Calculate duration (minus break time)
            const durationMs = endDate.getTime() - startDate.getTime() - (breakTime * 60 * 1000);
            
            if (durationMs <= 0) {
                showNotification('Celková doba práce (po odečtení pauzy) musí být větší než 0.', 'warning');
                return;
            }
            
            // Calculate earnings
            const durationHours = durationMs / (1000 * 60 * 60);
            const rate = RATES[person];
            const earnings = durationHours * rate;
            
            // Create work log
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
            
            // Save or update work log
            if (document.getElementById('edit-log-id').value) {
                // Edit existing log
                updateWorkLog(workLog).then(() => {
                    showNotification('Záznam byl upraven.', 'success');
                    resetManualForm();
                }).catch(error => {
                    console.error('Error updating work log:', error);
                    showNotification('Chyba při úpravě záznamu.', 'error');
                });
            } else {
                // New log
                saveWorkLog(workLog).then(() => {
                    showNotification(`Záznam byl uložen. Výdělek: ${Math.round(earnings)} Kč.`, 'success');
                    resetManualForm();
                }).catch(error => {
                    console.error('Error saving work log:', error);
                    showNotification('Chyba při ukládání záznamu.', 'error');
                });
            }
        });
    }
    
    // Cancel edit button
    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', resetManualForm);
    }
}

// Reset manual entry form
function resetManualForm() {
    const manualEntryForm = document.getElementById('manual-entry-form');
    if (!manualEntryForm) return;
    
    // Reset form
    manualEntryForm.reset();
    
    // Reset hidden ID and button text
    const editLogId = document.getElementById('edit-log-id');
    const saveLogButton = document.getElementById('save-log-button');
    const cancelEditButton = document.getElementById('cancel-edit-button');
    
    if (editLogId) editLogId.value = '';
    if (saveLogButton) saveLogButton.innerHTML = '<i class="fas fa-plus"></i> Přidat záznam';
    if (cancelEditButton) cancelEditButton.style.display = 'none';
    
    // Set today's date
    setTodaysDate();
}

// Load recent work logs
async function loadRecentWorkLogs() {
    const recentLogsTable = document.getElementById('recent-logs-table');
    if (!recentLogsTable) return;
    
    try {
        // Get all logs
        const allLogs = await getAllWorkLogs();
        
        // Sort by date (newest first)
        allLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        // Get last 5 logs
        const recentLogs = allLogs.slice(0, 5);
        
        const tbody = recentLogsTable.querySelector('tbody');
        
        if (recentLogs.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Žádné nedávné záznamy</td></tr>';
            return;
        }
        
        // Create HTML for logs
        let html = '';
        
        recentLogs.forEach(log => {
            const startDate = new Date(log.startTime);
            
            const formattedDate = startDate.toLocaleDateString('cs-CZ');
            const durationFormatted = formatTimeDuration(log.duration);
            
            // Calculate net earnings (after deduction)
            const deductionRate = DEDUCTION_RATES[log.person];
            const netEarnings = log.earnings - Math.round(log.earnings * deductionRate);
            
            html += `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${log.person === 'maru' ? 'Maru' : 'Marty'}</td>
                    <td>${log.activity}${log.subcategory ? ' - ' + log.subcategory : ''}</td>
                    <td>${durationFormatted}</td>
                    <td>${netEarnings} Kč</td>
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
        
        // Add event listeners to buttons
        tbody.querySelectorAll('.edit-log-button').forEach(button => {
            button.addEventListener('click', editWorkLogHandler);
        });
        
        tbody.querySelectorAll('.delete-log-button').forEach(button => {
            button.addEventListener('click', deleteWorkLogHandler);
        });
        
    } catch (error) {
        console.error('Error loading recent logs:', error);
        showNotification('Chyba při načítání posledních záznamů.', 'error');
    }
}

// Edit work log handler
async function editWorkLogHandler() {
    const logId = this.getAttribute('data-id');
    
    try {
        const log = await getWorkLog(logId);
        
        if (log) {
            // Make sure we're on the attendance section
            document.querySelector('a[data-section="dochazka"]')?.click();
            
            // Populate form fields
            const formFields = {
                'edit-log-id': log.id,
                'manual-person': log.person,
                'manual-activity': log.activity,
                'manual-subcategory': log.subcategory || '',
                'manual-note': log.note || '',
                'manual-break-time': log.breakTime || 0
            };
            
            // Format date and times
            const startDate = new Date(log.startTime);
            const endDate = new Date(log.endTime);
            
            formFields['manual-date'] = startDate.toISOString().substring(0, 10);
            formFields['manual-start-time'] = startDate.toTimeString().substring(0, 5);
            formFields['manual-end-time'] = endDate.toTimeString().substring(0, 5);
            
            // Set form values
            Object.keys(formFields).forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.value = formFields[fieldId];
            });
            
            // Update button text and show cancel button
            const saveLogButton = document.getElementById('save-log-button');
            const cancelEditButton = document.getElementById('cancel-edit-button');
            
            if (saveLogButton) saveLogButton.innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            if (cancelEditButton) cancelEditButton.style.display = 'inline-block';
            
            // Scroll to form
            const manualEntryForm = document.getElementById('manual-entry-form');
            if (manualEntryForm) manualEntryForm.scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Záznam byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Error editing work log:', error);
        showNotification('Chyba při načítání záznamu k úpravě.', 'error');
    }
}

// Delete work log handler
async function deleteWorkLogHandler() {
    const logId = this.getAttribute('data-id');
    
    if (confirm('Opravdu chcete smazat tento záznam o práci?')) {
        try {
            await deleteWorkLog(logId);
            showNotification('Záznam byl úspěšně smazán.', 'success');
        } catch (error) {
            console.error('Error deleting work log:', error);
            showNotification('Chyba při mazání záznamu.', 'error');
        }
    }
}

// Update today's summary
async function updateTodaySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
        const logs = await getAllWorkLogs({
            startDate: today.toISOString()
        });
        
        // Calculate totals
        let totalDuration = 0;
        let totalEarningsMaru = 0;
        let totalEarningsMarty = 0;
        let totalDeductions = 0;
        
        logs.forEach(log => {
            totalDuration += log.duration;
            
            // Add to person-specific earnings
            if (log.person === 'maru') {
                totalEarningsMaru += log.earnings;
            } else if (log.person === 'marty') {
                totalEarningsMarty += log.earnings;
            }
            
            // Calculate deduction
            const deduction = Math.round(log.earnings * DEDUCTION_RATES[log.person]);
            totalDeductions += deduction;
        });
        
        // Calculate net earnings
        const netEarningsMaru = totalEarningsMaru - Math.round(totalEarningsMaru * DEDUCTION_RATES['maru']);
        const netEarningsMarty = totalEarningsMarty - Math.round(totalEarningsMarty * DEDUCTION_RATES['marty']);
        const totalNetEarnings = netEarningsMaru + netEarningsMarty;
        
        // Update UI
        const elements = {
            'total-hours-today': formatTimeDuration(totalDuration),
            'net-maru-today': `${netEarningsMaru} Kč`,
            'net-marty-today': `${netEarningsMarty} Kč`,
            'total-net-today': `${totalNetEarnings} Kč`,
            'total-deductions-today': `${totalDeductions} Kč`
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = elements[id];
        });
        
    } catch (error) {
        console.error('Error updating today summary:', error);
    }
}

// =========================
// FINANCE FORM
// =========================
function initFinanceForm() {
    const financeForm = document.getElementById('finance-form');
    const cancelFinanceEditButton = document.getElementById('cancel-finance-edit-button');
    
    // Quick action buttons
    const addIncomeBtn = document.getElementById('add-income-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    
    if (addIncomeBtn) {
        addIncomeBtn.addEventListener('click', function() {
            // Navigate to finance section
            document.querySelector('a[data-section="finance"]').click();
            // Set income type
            document.querySelector('input[name="finance-type"][value="income"]').checked = true;
            // Focus on description field
            document.getElementById('finance-description').focus();
        });
    }
    
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', function() {
            // Navigate to finance section
            document.querySelector('a[data-section="finance"]').click();
            // Set expense type
            document.querySelector('input[name="finance-type"][value="expense"]').checked = true;
            // Focus on description field
            document.getElementById('finance-description').focus();
        });
    }
    
    if (financeForm) {
        financeForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const id = document.getElementById('edit-finance-id').value || generateId();
            const type = document.querySelector('input[name="finance-type"]:checked').value;
            const date = document.getElementById('finance-date').value;
            const description = document.getElementById('finance-description').value;
            const category = document.getElementById('finance-category').value;
            const amount = parseFloat(document.getElementById('finance-amount').value);
            const currency = document.getElementById('finance-currency').value;
            
            // Validate amount
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }
            
            // Create finance record
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
            
            // Save or update record
            if (document.getElementById('edit-finance-id').value) {
                // Edit existing record
                updateFinanceRecord(financeRecord).then(() => {
                    showNotification('Finanční záznam byl upraven.', 'success');
                    resetFinanceForm();
                }).catch(error => {
                    console.error('Error updating finance record:', error);
                    showNotification('Chyba při úpravě finančního záznamu.', 'error');
                });
            } else {
                // New record
                saveFinanceRecord(financeRecord).then(() => {
                    showNotification('Finanční záznam byl uložen.', 'success');
                    resetFinanceForm();
                }).catch(error => {
                    console.error('Error saving finance record:', error);
                    showNotification('Chyba při ukládání finančního záznamu.', 'error');
                });
            }
        });
    }
    
    // Cancel edit button
    if (cancelFinanceEditButton) {
        cancelFinanceEditButton.addEventListener('click', resetFinanceForm);
    }
}

// Reset finance form
function resetFinanceForm() {
    const financeForm = document.getElementById('finance-form');
    if (!financeForm) return;
    
    // Reset form
    financeForm.reset();
    
    // Reset hidden ID and button text
    const editFinanceId = document.getElementById('edit-finance-id');
    const saveFinanceButton = document.getElementById('save-finance-button');
    const cancelFinanceEditButton = document.getElementById('cancel-finance-edit-button');
    
    if (editFinanceId) editFinanceId.value = '';
    if (saveFinanceButton) saveFinanceButton.innerHTML = '<i class="fas fa-plus"></i> Přidat';
    if (cancelFinanceEditButton) cancelFinanceEditButton.style.display = 'none';
    
    // Set today's date
    setTodaysDate();
}

// Load finance records
async function loadFinanceRecords() {
    const financeTable = document.getElementById('finance-table');
    
    if (!financeTable) return;
    
    try {
        const financeRecords = await getAllFinanceRecords();
        
        if (financeRecords.length === 0) {
            financeTable.innerHTML = '<tr class="empty-row"><td colspan="6">Žádné finanční záznamy</td></tr>';
            return;
        }
        
        // Sort by date (newest first)
        financeRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Create HTML for records
        const html = financeRecords.map(record => {
            // Format date
            const date = new Date(record.date).toLocaleDateString('cs-CZ');
            
            // Format type
            const typeText = record.type === 'income' ? 'Příjem' : 'Výdaj';
            const typeClass = record.type === 'income' ? 'success-color' : 'danger-color';
            
            return `
                <tr>
                    <td class="${typeClass}">${typeText}</td>
                    <td>${record.description}</td>
                    <td>${record.amount.toFixed(2)}</td>
                    <td>${record.currency}</td>
                    <td>${date}</td>
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
        
        // Add event listeners to buttons
        financeTable.querySelectorAll('.edit-finance-button').forEach(button => {
            button.addEventListener('click', editFinanceRecord);
        });
        
        financeTable.querySelectorAll('.delete-finance-button').forEach(button => {
            button.addEventListener('click', deleteFinanceRecordHandler);
        });
    } catch (error) {
        console.error('Error loading finance records:', error);
        showNotification('Chyba při načítání finančních záznamů.', 'error');
    }
}

// Update finance summary
async function updateFinanceSummary() {
    try {
        const financeRecords = await getAllFinanceRecords();
        const budget = await getSharedBudget();
        
        // Calculate totals (CZK only)
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
        
        // Update UI
        const elements = {
            'total-income': formatCurrency(totalIncome),
            'total-expenses': formatCurrency(totalExpenses),
            'finance-income': formatCurrency(totalIncome),
            'finance-expenses': formatCurrency(totalExpenses)
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = elements[id];
        });
        
        // Update budget display
        updateBudgetDisplay(budget.balance);
        
    } catch (error) {
        console.error('Error updating finance summary:', error);
    }
}

// Edit finance record
async function editFinanceRecord() {
    const recordId = this.getAttribute('data-id');
    
    try {
        const record = await getFinanceRecord(recordId);
        
        if (record) {
            // Populate form fields
            const formFields = {
                'edit-finance-id': record.id,
                'finance-date': record.date,
                'finance-description': record.description,
                'finance-category': record.category || '',
                'finance-amount': record.amount,
                'finance-currency': record.currency
            };
            
            // Set form values
            Object.keys(formFields).forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.value = formFields[fieldId];
            });
            
            // Set type (radio button)
            const typeRadio = document.querySelector(`input[name="finance-type"][value="${record.type}"]`);
            if (typeRadio) typeRadio.checked = true;
            
            // Update button text and show cancel button
            const saveFinanceButton = document.getElementById('save-finance-button');
            const cancelFinanceEditButton = document.getElementById('cancel-finance-edit-button');
            
            if (saveFinanceButton) saveFinanceButton.innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            if (cancelFinanceEditButton) cancelFinanceEditButton.style.display = 'inline-block';
            
            // Scroll to form
            const financeForm = document.getElementById('finance-form');
            if (financeForm) financeForm.scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Finanční záznam byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Error editing finance record:', error);
        showNotification('Chyba při načítání záznamu k úpravě.', 'error');
    }
}

// Delete finance record handler
async function deleteFinanceRecordHandler() {
    const recordId = this.getAttribute('data-id');
    
    if (confirm('Opravdu chcete smazat tento finanční záznam?')) {
        try {
            await deleteFinanceRecord(recordId);
            showNotification('Finanční záznam byl úspěšně smazán.', 'success');
        } catch (error) {
            console.error('Error deleting finance record:', error);
            showNotification('Chyba při mazání finančního záznamu.', 'error');
        }
    }
}

// =========================
// DEBT MANAGEMENT
// =========================
function initDebtManagement() {
    // Debt buttons
    const addDebtBtn = document.getElementById('add-debt-btn');
    const addPaymentBtn = document.getElementById('add-payment-btn');
    
    if (addDebtBtn) {
        addDebtBtn.addEventListener('click', function() {
            document.querySelector('.debt-form-container').style.display = 'block';
            document.querySelector('.payment-form-container').style.display = 'none';
            document.getElementById('debt-description').focus();
        });
    }
    
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', function() {
            document.querySelector('.debt-form-container').style.display = 'none';
            document.querySelector('.payment-form-container').style.display = 'block';
        });
    }
    
    // Debt form
    const debtForm = document.getElementById('debt-form');
    const cancelDebtEditButton = document.getElementById('cancel-debt-edit-button');
    
    if (debtForm) {
        debtForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const id = document.getElementById('edit-debt-id').value || generateId();
            const person = document.getElementById('debt-person').value;
            const description = document.getElementById('debt-description').value;
            const amount = parseFloat(document.getElementById('debt-amount').value);
            const currency = document.getElementById('debt-currency').value;
            const date = document.getElementById('debt-date').value;
            const dueDate = document.getElementById('debt-due-date').value || null;
            
            // Validate amount
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }
            
            // Create debt record
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
            
            // Save or update debt
            if (document.getElementById('edit-debt-id').value) {
                // Edit existing debt
                updateDebt(debt).then(() => {
                    showNotification('Dluh byl upraven.', 'success');
                    resetDebtForm();
                }).catch(error => {
                    console.error('Error updating debt:', error);
                    showNotification('Chyba při úpravě dluhu.', 'error');
                });
            } else {
                // New debt
                saveDebt(debt).then(() => {
                    showNotification('Dluh byl uložen.', 'success');
                    resetDebtForm();
                }).catch(error => {
                    console.error('Error saving debt:', error);
                    showNotification('Chyba při ukládání dluhu.', 'error');
                });
            }
        });
    }
    
    // Cancel debt edit button
    if (cancelDebtEditButton) {
        cancelDebtEditButton.addEventListener('click', resetDebtForm);
    }
    
    // Payment form
    const paymentForm = document.getElementById('payment-form');
    const cancelPaymentButton = document.getElementById('cancel-payment-button');
    
    if (paymentForm) {
        paymentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const debtId = document.getElementById('payment-debt-id').value;
            const amount = parseFloat(document.getElementById('payment-amount').value);
            const date = document.getElementById('payment-date').value;
            const note = document.getElementById('payment-note').value;
            
            // Validate debt selection
            if (!debtId) {
                showNotification('Vyberte prosím dluh pro splátku.', 'warning');
                return;
            }
            
            // Validate amount
            if (isNaN(amount) || amount <= 0) {
                showNotification('Zadejte platnou částku větší než 0.', 'warning');
                return;
            }
            
            // Check if payment isn't more than remaining debt
            getDebt(debtId).then(async (debt) => {
                if (debt) {
                    const payments = await getPaymentsForDebt(debtId);
                    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                    const remaining = debt.amount - totalPaid;
                    
                    if (amount > remaining) {
                        showNotification(`Splátka nemůže být vyšší než zbývající částka dluhu (${remaining.toFixed(2)} ${debt.currency}).`, 'warning');
                        return;
                    }
                    
                    // Create payment record
                    const payment = {
                        id: generateId(),
                        debtId: debtId,
                        amount: amount,
                        date: date,
                        note: note,
                        createdAt: new Date().toISOString()
                    };
                    
                    // Save payment
                    savePayment(payment).then(() => {
                        showNotification('Splátka byla uložena.', 'success');
                        resetPaymentForm();
                    }).catch(error => {
                        console.error('Error saving payment:', error);
                        showNotification('Chyba při ukládání splátky.', 'error');
                    });
                }
            }).catch(error => {
                console.error('Error checking debt:', error);
                showNotification('Chyba při kontrole dluhu.', 'error');
            });
        });
    }
    
    // Cancel payment button
    if (cancelPaymentButton) {
        cancelPaymentButton.addEventListener('click', function() {
            resetPaymentForm();
            document.querySelector('.payment-form-container').style.display = 'none';
        });
    }
}

// Reset debt form
function resetDebtForm() {
    const debtForm = document.getElementById('debt-form');
    if (!debtForm) return;
    
    // Reset form
    debtForm.reset();
    
    // Reset hidden ID and button text
    const editDebtId = document.getElementById('edit-debt-id');
    const saveDebtButton = document.getElementById('save-debt-button');
    const cancelDebtEditButton = document.getElementById('cancel-debt-edit-button');
    
    if (editDebtId) editDebtId.value = '';
    if (saveDebtButton) saveDebtButton.innerHTML = '<i class="fas fa-plus"></i> Přidat dluh';
    if (cancelDebtEditButton) cancelDebtEditButton.style.display = 'none';
    
    // Set today's date
    setTodaysDate();
    
    // Hide form container
    document.querySelector('.debt-form-container').style.display = 'none';
}

// Reset payment form
function resetPaymentForm() {
    const paymentForm = document.getElementById('payment-form');
    if (!paymentForm) return;
    
    // Reset form
    paymentForm.reset();
    
    // Set today's date
    setTodaysDate();
}

// Load debts
async function loadDebts() {
    const debtsList = document.getElementById('debts-list');
    
    if (!debtsList) return;
    
    try {
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        if (debts.length === 0) {
            debtsList.innerHTML = '<div class="empty-placeholder">Žádné dluhy k zobrazení</div>';
            return;
        }
        
        // Calculate totals for summary
        let totalDebtAmount = 0;
        let totalPaidAmount = 0;
        
        // Create HTML for debts
        let html = '';
        
        for (const debt of debts) {
            // Calculate payments for this debt
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            const isPaid = remaining <= 0;
            
            // Add to totals (CZK only)
            if (debt.currency === 'CZK') {
                totalDebtAmount += debt.amount;
                totalPaidAmount += totalPaid;
            }
            
            // Format dates
            const dateCreated = new Date(debt.date).toLocaleDateString('cs-CZ');
            const dateDue = debt.dueDate ? new Date(debt.dueDate).toLocaleDateString('cs-CZ') : '-';
            
            // Calculate payment percentage
            const paymentPercentage = (totalPaid / debt.amount) * 100;
            
            // Create HTML for this debt
            html += `
                <div class="debt-item">
                    <div class="debt-header">
                        <div class="debt-info">
                            <div class="debt-title">${debt.description}</div>
                            <div class="debt-person">${debt.person === 'maru' ? 'Maru' : 'Marty'}</div>
                        </div>
                        <div class="debt-amount">
                            <div class="debt-status ${isPaid ? 'paid' : 'active'}">
                                ${isPaid ? 'Splaceno' : 'Aktivní'}
                            </div>
                            <div class="debt-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${paymentPercentage}%"></div>
                                </div>
                                <div class="progress-text">
                                    ${totalPaid.toFixed(0)} / ${debt.amount.toFixed(0)} ${debt.currency}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="debt-details">
                        <div class="detail-row">
                            <span class="label">Datum vzniku:</span>
                            <span class="value">${dateCreated}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Datum splatnosti:</span>
                            <span class="value">${dateDue}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Zbývá:</span>
                            <span class="value">${remaining.toFixed(0)} ${debt.currency}</span>
                        </div>
                    </div>
                    <div class="debt-actions">
                        <button class="btn edit-debt-button" data-id="${debt.id}">
                            <i class="fas fa-edit"></i> Upravit
                        </button>
                        <button class="btn delete-debt-button" data-id="${debt.id}">
                            <i class="fas fa-trash-alt"></i> Smazat
                        </button>
                    </div>
                </div>
            `;
        }
        
        debtsList.innerHTML = html;
        
        // Update summary information
        const activeDebtsEl = document.getElementById('active-debts');
        const paidDebtsEl = document.getElementById('paid-debts');
        
        if (activeDebtsEl) activeDebtsEl.textContent = formatCurrency(totalDebtAmount - totalPaidAmount);
        if (paidDebtsEl) paidDebtsEl.textContent = formatCurrency(totalPaidAmount);
        
        // Add event listeners for buttons
        debtsList.querySelectorAll('.edit-debt-button').forEach(button => {
            button.addEventListener('click', editDebtHandler);
        });
        
        debtsList.querySelectorAll('.delete-debt-button').forEach(button => {
            button.addEventListener('click', deleteDebtHandler);
        });
    } catch (error) {
        console.error('Error loading debts:', error);
        showNotification('Chyba při načítání dluhů.', 'error');
    }
}

// Edit debt handler
async function editDebtHandler() {
    const debtId = this.getAttribute('data-id');
    
    try {
        const debt = await getDebt(debtId);
        
        if (debt) {
            // Show debt form
            document.querySelector('.debt-form-container').style.display = 'block';
            document.querySelector('.payment-form-container').style.display = 'none';
            
            // Populate form fields
            const formFields = {
                'edit-debt-id': debt.id,
                'debt-person': debt.person,
                'debt-description': debt.description,
                'debt-amount': debt.amount,
                'debt-currency': debt.currency,
                'debt-date': debt.date,
                'debt-due-date': debt.dueDate || ''
            };
            
            // Set form values
            Object.keys(formFields).forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.value = formFields[fieldId];
            });
            
            // Update button text
            const saveDebtButton = document.getElementById('save-debt-button');
            const cancelDebtEditButton = document.getElementById('cancel-debt-edit-button');
            
            if (saveDebtButton) saveDebtButton.innerHTML = '<i class="fas fa-save"></i> Uložit změny';
            if (cancelDebtEditButton) cancelDebtEditButton.style.display = 'inline-block';
            
            // Scroll to form
            document.querySelector('.debt-form-container').scrollIntoView({ behavior: 'smooth' });
            
            showNotification('Dluh byl načten k úpravě.', 'info');
        }
    } catch (error) {
        console.error('Error editing debt:', error);
        showNotification('Chyba při úpravě dluhu.', 'error');
    }
}

// Delete debt handler
async function deleteDebtHandler() {
    const debtId = this.getAttribute('data-id');
    
    if (confirm('Opravdu chcete smazat tento dluh a všechny jeho splátky?')) {
        try {
            await deleteDebt(debtId);
            showNotification('Dluh byl úspěšně smazán včetně všech splátek.', 'success');
        } catch (error) {
            console.error('Error deleting debt:', error);
            showNotification('Chyba při mazání dluhu.', 'error');
        }
    }
}

// Load deductions summary
async function loadDeductionsSummary() {
    const deductionsTable = document.getElementById('deductions-summary-table');
    
    if (!deductionsTable) return;
    
    try {
        const workLogs = await getAllWorkLogs();
        
        if (workLogs.length === 0) {
            deductionsTable.innerHTML = '<tr class="empty-row"><td colspan="5">Žádné záznamy pro výpočet srážek</td></tr>';
            return;
        }
        
        // Group by month and person
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
        
        // Prepare data for table
        const summaryData = Object.values(workLogsByMonth);
        
        // Sort by date (newest first) and person
        summaryData.sort((a, b) => {
            if (a.month !== b.month) {
                return b.month.localeCompare(a.month);
            }
            return a.person.localeCompare(b.person);
        });
        
        // Skip current month (incomplete)
        const currentDate = new Date();
        const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Calculate total deductions for chart
        let totalDeductions = 0;
        
        // Create HTML for table
        const html = summaryData.map(summary => {
            // Skip current month
            if (summary.month === currentMonth) {
                return '';
            }
            
            // Format month
            const [year, month] = summary.month.split('-');
            const monthText = new Date(year, month - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
            
            // Calculate deduction
            const deductionRate = DEDUCTION_RATES[summary.person];
            const deduction = Math.round(summary.totalEarnings * deductionRate);
            
            // Add to total deductions
            totalDeductions += deduction;
            
            // Format duration
            const formattedDuration = formatTimeDuration(summary.totalDuration);
            
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
            deductionsTable.innerHTML = '<tr class="empty-row"><td colspan="5">Žádné záznamy pro výpočet srážek</td></tr>';
        } else {
            deductionsTable.innerHTML = html;
        }
        
        // Update total deductions display
        const totalDeductionsEl = document.getElementById('total-deductions');
        if (totalDeductionsEl) totalDeductionsEl.textContent = formatCurrency(totalDeductions);
        
        // Store total deductions for chart use
        window.totalDeductionsAmount = totalDeductions;
        
        // Update deductions chart
        updateDeductionsChart(totalDeductions);
        
    } catch (error) {
        console.error('Error loading deductions summary:', error);
        showNotification('Chyba při načítání přehledu srážek.', 'error');
    }
}

// Update deductions chart
function updateDeductionsChart(totalDeductions) {
    const deductionsChart = document.getElementById('deductions-chart');
    
    if (!deductionsChart) return;
    
    try {
        const ctx = deductionsChart.getContext('2d');
        
        // Get debt data
        getAllDebts().then(debts => {
            getAllPayments().then(payments => {
                // Calculate total debts and paid amounts
                let totalDebtAmount = 0;
                let totalPaidAmount = 0;
                
                debts.forEach(debt => {
                    if (debt.currency === 'CZK') {
                        totalDebtAmount += debt.amount;
                        
                        // Calculate payments for this debt
                        const debtPayments = payments.filter(p => p.debtId === debt.id);
                        const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
                        
                        totalPaidAmount += totalPaid;
                    }
                });
                
                const remainingDebt = totalDebtAmount - totalPaidAmount;
                
    // Create or update chart
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
                                position: 'bottom',
                                labels: {
                                    color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                                }
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
            }).catch(error => {
                console.error('Error loading payments:', error);
            });
        }).catch(error => {
            console.error('Error loading debts:', error);
        });
    } catch (error) {
        console.error('Error rendering deductions chart:', error);
    }
}

// Automatic debt payment
async function checkDebtPayments() {
    try {
        // Get budget
        const budget = await getSharedBudget();
        
        // If budget is negative or zero, can't pay debts
        if (budget.balance <= 0) return;
        
        // Get debts and payments
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        // Filter active CZK debts
        const activeDebts = debts.filter(debt => {
            if (debt.currency !== 'CZK') return false;
            
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            
            return totalPaid < debt.amount;
        });
        
        // Sort by oldest first
        activeDebts.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Try to pay debts
        let remainingBudget = budget.balance;
        
        for (const debt of activeDebts) {
            // Calculate remaining amount
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            
            // How much can we pay
            const paymentAmount = Math.min(remaining, remainingBudget);
            
            if (paymentAmount > 0) {
                // Create payment record
                const payment = {
                    id: generateId(),
                    debtId: debt.id,
                    amount: paymentAmount,
                    date: new Date().toISOString().substring(0, 10),
                    note: 'Automatická splátka ze společného rozpočtu',
                    createdAt: new Date().toISOString()
                };
                
                // Save payment
                await savePayment(payment);
                
                // Update remaining budget
                remainingBudget -= paymentAmount;
                
                // Update shared budget
                await updateSharedBudget(-paymentAmount);
                
                showNotification(`Automaticky splaceno ${formatCurrency(paymentAmount)} z dluhu: ${debt.description}`, 'success');
                
                // If budget depleted, stop
                if (remainingBudget <= 0) break;
            }
        }
    } catch (error) {
        console.error('Error processing automatic debt payments:', error);
    }
}

// Rent payment check
async function checkRentPayment() {
    try {
        // Get rent settings
        const rentAmountSetting = await getSettings('rentAmount');
        const rentDaySetting = await getSettings('rentDay');
        
        if (!rentAmountSetting || !rentDaySetting) return;
        
        const rentAmount = rentAmountSetting.value;
        const rentDay = rentDaySetting.value;
        
        // Current date
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        
        // Next rent date
        const nextRentDate = new Date(currentYear, currentMonth - 1, rentDay);
        
        // If date is in the past, move to next month
        if (nextRentDate < today) {
            nextRentDate.setMonth(nextRentDate.getMonth() + 1);
        }
        
        // Format next rent date
        const nextRentDateEl = document.getElementById('next-rent-date');
        if (nextRentDateEl) nextRentDateEl.textContent = nextRentDate.toLocaleDateString('cs-CZ');
        
        // Check if rent has been paid this month
        const financeRecords = await getAllFinanceRecords();
        
        const rentPaidThisMonth = financeRecords.some(record => {
            if (record.type !== 'expense' || !record.description.toLowerCase().includes('nájem')) return false;
            
            const recordDate = new Date(record.date);
            return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear();
        });
        
        // Update UI
        const rentStatusValue = document.getElementById('rent-status-value');
        
        if (rentPaidThisMonth) {
            if (rentStatusValue) {
                rentStatusValue.innerHTML = '<i class="fas fa-check-circle"></i> Zaplaceno';
                rentStatusValue.classList.add('paid');
                rentStatusValue.classList.remove('unpaid');
            }
        } else {
            // Check if we're past the due date
            if (currentDay >= rentDay) {
                if (rentStatusValue) {
                    rentStatusValue.innerHTML = '<i class="fas fa-exclamation-circle"></i> Nezaplaceno';
                    rentStatusValue.classList.add('unpaid');
                    rentStatusValue.classList.remove('paid');
                }
                
                // Create payment or debt on due date
                if (currentDay === rentDay) {
                    // Try automatic payment from budget
                    const budget = await getSharedBudget();
                    
                    if (budget.balance >= rentAmount) {
                        // Create expense record
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
                        // Create debt
                        const debt = {
                            id: generateId(),
                            person: 'maru', // Default person
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
                    
                    // Update rent status
                    loadDebts();
                }
            } else {
                if (rentStatusValue) {
                    rentStatusValue.innerHTML = '<i class="fas fa-clock"></i> Čeká na platbu';
                    rentStatusValue.classList.remove('unpaid');
                    rentStatusValue.classList.remove('paid');
                }
            }
        }
    } catch (error) {
        console.error('Error checking rent payment:', error);
    }
}

// =========================
// FILTERS AND REPORTS
// =========================
function initFilters() {
    const applyFiltersButton = document.getElementById('apply-filters');
    const resetFiltersButton = document.getElementById('reset-filters');
    
    // Period buttons
    const periodButtons = document.querySelectorAll('.period-btn');
    
    if (periodButtons.length > 0) {
        periodButtons.forEach(button => {
            button.addEventListener('click', function() {
                periodButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                // Update charts with selected period
                updateCharts();
            });
        });
    }
    
    // Apply filters button
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', function() {
            loadWorkLogs();
            updateCharts();
        });
    }
    
    // Reset filters button
    if (resetFiltersButton) {
        resetFiltersButton.addEventListener('click', function() {
            // Reset filter form
            const filterFields = ['filter-person', 'filter-activity', 'filter-start-date', 'filter-end-date'];
            filterFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.value = '';
            });
            
            // Reload data with reset filters
            loadWorkLogs();
            updateCharts();
        });
    }
    
    // Load reports when section is shown
    const prehledyLink = document.querySelector('a[data-section="prehledy"]');
    if (prehledyLink) {
        prehledyLink.addEventListener('click', function() {
            loadWorkLogs();
            updateCharts();
        });
    }
}

// Load work logs with filters
async function loadWorkLogs() {
    const workLogsAccordion = document.getElementById('work-logs-accordion');
    
    if (!workLogsAccordion) return;
    
    try {
        // Get filter values
        const filterPerson = document.getElementById('filter-person')?.value || '';
        const filterActivity = document.getElementById('filter-activity')?.value || '';
        const filterStartDate = document.getElementById('filter-start-date')?.value || '';
        const filterEndDate = document.getElementById('filter-end-date')?.value || '';
        
        // Get filtered logs
        const filteredLogs = await getAllWorkLogs({
            person: filterPerson,
            activity: filterActivity,
            startDate: filterStartDate,
            endDate: filterEndDate
        });
        
        if (filteredLogs.length === 0) {
            workLogsAccordion.innerHTML = '<div class="empty-placeholder">Žádné záznamy odpovídající filtrům</div>';
            return;
        }
        
        // Sort by date (newest first)
        filteredLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        // Group by date
        const logsByDate = {};
        
        filteredLogs.forEach(log => {
            const date = new Date(log.startTime).toISOString().substring(0, 10);
            
            if (!logsByDate[date]) {
                logsByDate[date] = [];
            }
            
            logsByDate[date].push(log);
        });
        
        // Create HTML for accordion
        let html = '';
        
        Object.keys(logsByDate).sort((a, b) => b.localeCompare(a)).forEach(date => {
            const logs = logsByDate[date];
            const formattedDate = new Date(date).toLocaleDateString('cs-CZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            // Calculate daily totals
            const totalDuration = logs.reduce((sum, log) => sum + log.duration, 0);
            const totalEarnings = logs.reduce((sum, log) => sum + log.earnings, 0);
            
            // Format duration
            const formattedDuration = formatTimeDuration(totalDuration);
            
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
                                        <th>Akce</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${logs.map(log => {
                                        // Format times
                                        const startTime = new Date(log.startTime).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                                        const endTime = new Date(log.endTime).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                                        
                                        // Format duration
                                        const logDuration = formatTimeDuration(log.duration);
                                        
                                        return `
                                            <tr>
                                                <td>${log.person === 'maru' ? 'Maru' : 'Marty'}</td>
                                                <td>${log.activity}${log.subcategory ? ' - ' + log.subcategory : ''}</td>
                                                <td>${startTime}</td>
                                                <td>${endTime}</td>
                                                <td>${logDuration}</td>
                                                <td>${log.earnings.toFixed(0)} Kč</td>
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
        
        // Add event listeners to accordion headers
        workLogsAccordion.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', function() {
                this.classList.toggle('active');
                const content = this.nextElementSibling;
                
                if (content.style.maxHeight) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + 'px';
                }
            });
        });
        
        // Add event listeners to buttons
        workLogsAccordion.querySelectorAll('.edit-log-button').forEach(button => {
            button.addEventListener('click', editWorkLogHandler);
        });
        
        workLogsAccordion.querySelectorAll('.delete-log-button').forEach(button => {
            button.addEventListener('click', deleteWorkLogHandler);
        });
    } catch (error) {
        console.error('Error loading work logs:', error);
        showNotification('Chyba při načítání záznamů o práci.', 'error');
    }
}

// =========================
// CHARTS
// =========================
function initCharts() {
    // Initialize charts (they'll be populated when data is loaded)
    loadChartsData();
}

async function updateCharts() {
    // Update all charts with current data and filters
    loadChartsData();
}

async function loadChartsData() {
    try {
        // Get filter values
        const filterPerson = document.getElementById('filter-person')?.value || '';
        const filterActivity = document.getElementById('filter-activity')?.value || '';
        const filterStartDate = document.getElementById('filter-start-date')?.value || '';
        const filterEndDate = document.getElementById('filter-end-date')?.value || '';
        
        const filters = {
            person: filterPerson,
            activity: filterActivity,
            startDate: filterStartDate,
            endDate: filterEndDate
        };
        
        // Get work logs with applied filters
        const logs = await getAllWorkLogs(filters);
        
        // Get active period for stats chart
        const activePeriodBtn = document.querySelector('.period-btn.active');
        const activePeriod = activePeriodBtn ? activePeriodBtn.getAttribute('data-period') : 'month';
        
        // Update statistics chart
        updateStatsChart(logs, activePeriod);
        
        // Update tasks distribution chart
        updateTasksChart(logs);
        
    } catch (error) {
        console.error('Error loading chart data:', error);
        showNotification('Chyba při aktualizaci grafů.', 'error');
    }
}

// Update statistics chart
function updateStatsChart(logs, period) {
    const statsChart = document.getElementById('stats-chart');
    
    if (!statsChart) return;
    
    try {
        const ctx = statsChart.getContext('2d');
        
        // Prepare data based on period
        const currentDate = new Date();
        let startDate;
        
        switch (period) {
            case 'week':
                // Start of current week (Monday)
                startDate = new Date(currentDate);
                startDate.setDate(currentDate.getDate() - currentDate.getDay() + (currentDate.getDay() === 0 ? -6 : 1));
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'month':
                // Start of current month
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                break;
            case 'year':
                // Start of current year
                startDate = new Date(currentDate.getFullYear(), 0, 1);
                break;
            default:
                // Default to month
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        }
        
        // Filter logs by period
        const filteredLogs = logs.filter(log => new Date(log.startTime) >= startDate);
        
        // Prepare data for chart
        let labels = [];
        let dataPoints = [];
        
        if (period === 'week') {
            // Daily statistics
            const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
            
            // Initialize empty array for days
            const logsByDay = Array(7).fill(0);
            
            filteredLogs.forEach(log => {
                const date = new Date(log.startTime);
                // Convert to 1-7 (Monday-Sunday)
                const dayOfWeek = date.getDay() || 7;
                // Convert to 0-6 for array indexing
                const dayIndex = dayOfWeek === 7 ? 0 : dayOfWeek - 1;
                
                logsByDay[dayIndex] += log.duration;
            });
            
            // Convert ms to hours
            const logsByDayHours = logsByDay.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
            
            labels = dayNames;
            dataPoints = logsByDayHours;
        } else if (period === 'month') {
            // Weekly statistics
            const weeksInMonth = Math.ceil(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() / 7);
            
            // Initialize empty array for weeks
            const logsByWeek = Array(weeksInMonth).fill(0);
            
            filteredLogs.forEach(log => {
                const date = new Date(log.startTime);
                const weekOfMonth = Math.floor((date.getDate() - 1) / 7);
                
                logsByWeek[weekOfMonth] += log.duration;
            });
            
            // Convert ms to hours
            const logsByWeekHours = logsByWeek.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
            
            labels = Array(weeksInMonth).fill(0).map((_, i) => `Týden ${i + 1}`);
            dataPoints = logsByWeekHours;
        } else if (period === 'year') {
            // Monthly statistics
            const monthNames = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
            
            // Initialize empty array for months
            const logsByMonth = Array(12).fill(0);
            
            filteredLogs.forEach(log => {
                const date = new Date(log.startTime);
                const month = date.getMonth();
                
                logsByMonth[month] += log.duration;
            });
            
            // Convert ms to hours
            const logsByMonthHours = logsByMonth.map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
            
            labels = monthNames;
            dataPoints = logsByMonthHours;
        }
        
        // Create or update chart
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
                            text: 'Hodiny',
                            color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                        },
                        ticks: {
                            color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                        },
                        grid: {
                            color: document.body.classList.contains('dark-mode') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                        },
                        grid: {
                            color: document.body.classList.contains('dark-mode') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                        }
                    },
                    title: {
                        display: true,
                        text: `Odpracované hodiny (${period === 'week' ? 'týden' : period === 'month' ? 'měsíc' : 'rok'})`,
                        color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error updating stats chart:', error);
    }
}

// Update tasks distribution chart
function updateTasksChart(logs) {
    const tasksChart = document.getElementById('tasks-chart');
    
    if (!tasksChart) return;
    
    try {
        const ctx = tasksChart.getContext('2d');
        
        // Group by activity
        const taskData = {};
        
        logs.forEach(log => {
            if (!taskData[log.activity]) {
                taskData[log.activity] = 0;
            }
            
            taskData[log.activity] += log.duration;
        });
        
        // Convert to arrays for chart
        const labels = Object.keys(taskData);
        const data = Object.values(taskData).map(ms => Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
        
        // Generate colors
        const colors = labels.map((_, index) => {
            const hue = (index * 137) % 360;
            return `hsla(${hue}, 70%, 60%, 0.7)`;
        });
        
        const borderColors = colors.map(color => color.replace('0.7', '1'));
        
        // Create or update chart
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
                        position: 'right',
                        labels: {
                            color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Rozdělení času podle úkolů (v hodinách)',
                        color: document.body.classList.contains('dark-mode') ? '#fff' : '#333'
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
    } catch (error) {
        console.error('Error updating tasks chart:', error);
    }
}

// =========================
// EXPORT FUNCTIONS
// =========================
function initExportFunctions() {
    // Export buttons
    const exportButtons = {
        'export-work-logs': exportWorkLogs,
        'export-finance': exportFinance,
        'export-deductions': exportDeductions,
        'export-debts': exportDebts
    };
    
    Object.keys(exportButtons).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', exportButtons[buttonId]);
        }
    });
    
    // Data management buttons
    const dataManagementButtons = {
        'backup-data': backupData,
        'clear-all-data': clearAllData
    };
    
    Object.keys(dataManagementButtons).forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', dataManagementButtons[buttonId]);
        }
    });
    
    // Import data input
    const importDataInput = document.getElementById('import-data-input');
    if (importDataInput) {
        importDataInput.addEventListener('change', importData);
    }
}

// Export work logs
async function exportWorkLogs() {
    try {
        // Get filter values
        const filterPerson = document.getElementById('filter-person')?.value || '';
        const filterActivity = document.getElementById('filter-activity')?.value || '';
        const filterStartDate = document.getElementById('filter-start-date')?.value || '';
        const filterEndDate = document.getElementById('filter-end-date')?.value || '';
        
        // Get filtered logs
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
        
        // Create CSV content
        let csvContent = 'Osoba,Úkol,Podkategorie,Začátek,Konec,Doba (h),Výdělek (Kč),Srážka (Kč),Čistý výdělek (Kč),Poznámka\n';
        
        logs.forEach(log => {
            const person = log.person === 'maru' ? 'Maru' : 'Marty';
            const startTime = new Date(log.startTime).toLocaleString('cs-CZ');
            const endTime = new Date(log.endTime).toLocaleString('cs-CZ');
            const duration = (log.duration / (1000 * 60 * 60)).toFixed(2);
            const earnings = log.earnings.toFixed(0);
            const deduction = Math.round(log.earnings * DEDUCTION_RATES[log.person]).toFixed(0);
            const netEarnings = (log.earnings - deduction).toFixed(0);
            const subcategory = log.subcategory ? `"${log.subcategory.replace(/"/g, '""')}"` : '';
            const note = log.note ? `"${log.note.replace(/"/g, '""')}"` : '';
            
            csvContent += `${person},"${log.activity}",${subcategory},${startTime},${endTime},${duration},${earnings},${deduction},${netEarnings},${note}\n`;
        });
        
        // Download CSV file
        downloadCSV(csvContent, 'pracovni-vykazy-export');
        
        showNotification('Export záznamů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Error exporting work logs:', error);
        showNotification('Chyba při exportu záznamů.', 'error');
    }
}

// Export finance records
async function exportFinance() {
    try {
        const financeRecords = await getAllFinanceRecords();
        
        if (financeRecords.length === 0) {
            showNotification('Žádné finanční záznamy k exportu.', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = 'Typ,Popis,Částka,Měna,Datum,Kategorie\n';
        
        financeRecords.forEach(record => {
            const type = record.type === 'income' ? 'Příjem' : 'Výdaj';
            const date = new Date(record.date).toLocaleDateString('cs-CZ');
            const description = `"${record.description.replace(/"/g, '""')}"`;
            const category = record.category ? `"${record.category.replace(/"/g, '""')}"` : '';
            
            csvContent += `${type},${description},${record.amount.toFixed(2)},${record.currency},${date},${category}\n`;
        });
        
        // Download CSV file
        downloadCSV(csvContent, 'finance-export');
        
        showNotification('Export finančních záznamů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Error exporting finance records:', error);
        showNotification('Chyba při exportu finančních záznamů.', 'error');
    }
}

// Export deductions
async function exportDeductions() {
    try {
        const workLogs = await getAllWorkLogs();
        
        if (workLogs.length === 0) {
            showNotification('Žádné záznamy pro výpočet srážek.', 'warning');
            return;
        }
        
        // Group by month and person
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
        
        // Convert to array
        const summaryData = Object.values(workLogsByMonth);
        
        // Sort by date (newest first) and person
        summaryData.sort((a, b) => {
            if (a.month !== b.month) {
                return b.month.localeCompare(a.month);
            }
            return a.person.localeCompare(b.person);
        });
        
        // Skip current month (incomplete)
        const currentDate = new Date();
        const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Filter complete months
        const completeMonths = summaryData.filter(summary => summary.month !== currentMonth);
        
        if (completeMonths.length === 0) {
            showNotification('Žádné kompletní měsíce pro výpočet srážek.', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = 'Osoba,Měsíc,Celkem odpracováno (h),Hrubý výdělek (Kč),Srážka (%),Srážka (Kč)\n';
        
        completeMonths.forEach(summary => {
            const person = summary.person === 'maru' ? 'Maru' : 'Marty';
            const [year, month] = summary.month.split('-');
            const monthText = new Date(year, month - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
            
            // Calculate deduction
            const deductionRate = DEDUCTION_RATES[summary.person] * 100;
            const deduction = Math.round(summary.totalEarnings * DEDUCTION_RATES[summary.person]);
            
            // Format duration
            const hours = (summary.totalDuration / (1000 * 60 * 60)).toFixed(2);
            
            csvContent += `${person},${monthText},${hours},${summary.totalEarnings.toFixed(0)},${deductionRate.toFixed(2)},${deduction}\n`;
        });
        
        // Download CSV file
        downloadCSV(csvContent, 'srazky-export');
        
        showNotification('Export srážek byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Error exporting deductions:', error);
        showNotification('Chyba při exportu srážek.', 'error');
    }
}

// Export debts
async function exportDebts() {
    try {
        const debts = await getAllDebts();
        const payments = await getAllPayments();
        
        if (debts.length === 0) {
            showNotification('Žádné dluhy k exportu.', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = 'Osoba,Popis,Celková částka,Měna,Datum vzniku,Datum splatnosti,Zaplaceno,Zbývá\n';
        
        debts.forEach(debt => {
            const person = debt.person === 'maru' ? 'Maru' : 'Marty';
            const dateCreated = new Date(debt.date).toLocaleDateString('cs-CZ');
            const dateDue = debt.dueDate ? new Date(debt.dueDate).toLocaleDateString('cs-CZ') : '';
            
            // Calculate payments
            const debtPayments = payments.filter(p => p.debtId === debt.id);
            const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount, 0);
            const remaining = debt.amount - totalPaid;
            
            // Format description (escape quotes)
            const description = `"${debt.description.replace(/"/g, '""')}"`;
            
            csvContent += `${person},${description},${debt.amount.toFixed(2)},${debt.currency},${dateCreated},${dateDue},${totalPaid.toFixed(2)},${remaining.toFixed(2)}\n`;
        });
        
        // Download CSV file
        downloadCSV(csvContent, 'dluhy-export');
        
        showNotification('Export dluhů byl úspěšně dokončen.', 'success');
    } catch (error) {
        console.error('Error exporting debts:', error);
        showNotification('Chyba při exportu dluhů.', 'error');
    }
}

// Download CSV file
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

// Data backup
async function backupData() {
    try {
        // Get all data from database
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
        
        // Create backup object
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
        
        // Convert to JSON
        const jsonData = JSON.stringify(backup, null, 2);
        
        // Download JSON file
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
        console.error('Error backing up data:', error);
        showNotification('Chyba při zálohování dat.', 'error');
    }
}

// Import data from backup
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
                
                // Validate data structure
                if (!data.workLogs || !data.financeRecords || !data.taskCategories || 
                    !data.expenseCategories || !data.debts || !data.debtPayments) {
                    throw new Error('Neplatný formát dat.');
                }
                
                // Clear existing data
                await clearDatabase();
                
                // Import data
                
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
                
                // Mark as initialized
                await saveSettings('initialized', true);
                
                showNotification('Data byla úspěšně obnovena ze zálohy. Stránka bude obnovena.', 'success');
                
                // Reload page after short delay
                setTimeout(() => {
                    location.reload();
                }, 2000);
                
            } catch (error) {
                console.error('Error restoring data:', error);
                showNotification('Chyba při obnovování dat. Ujistěte se, že máte platný soubor zálohy.', 'error');
            }
        };
        
        reader.readAsText(file);
    }
    
    // Clear input
    e.target.value = '';
}

// Clear all data
async function clearAllData() {
    if (confirm('POZOR! Opravdu chcete smazat všechna data? Tato akce je nevratná!')) {
        if (confirm('Poslední varování: Všechna vaše data budou smazána. Pokračovat?')) {
            try {
                await clearDatabase();
                
                // Reinitialize default data
                await initializeDefaultData();
                
                showNotification('Všechna data byla smazána. Stránka bude obnovena.', 'success');
                
                // Reload page after short delay
                setTimeout(() => {
                    location.reload();
                }, 2000);
                
            } catch (error) {
                console.error('Error clearing data:', error);
                showNotification('Chyba při mazání dat.', 'error');
            }
        }
    }
}

// Clear database
async function clearDatabase() {
    return new Promise((resolve, reject) => {
        try {
            // All object stores to clear
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

// =========================
// SETTINGS
// =========================
function initSettings() {
    // Category management
    initCategoryManagement();
    
    // Rent settings
    initRentSettings();
    
    // Theme settings
    initTheme();
}

// Initialize category management
function initCategoryManagement() {
    // Add task category
    const addTaskCategoryButton = document.getElementById('add-task-category');
    if (addTaskCategoryButton) {
        addTaskCategoryButton.addEventListener('click', async function() {
            const input = document.getElementById('new-task-category');
            if (!input) return;
            
            const newCategory = input.value.trim();
            
            if (newCategory) {
                try {
                    await addTaskCategory(newCategory);
                    input.value = '';
                    loadCategories();
                    showNotification('Kategorie úkolu byla přidána.', 'success');
                } catch (error) {
                    console.error('Error adding task category:', error);
                    showNotification('Chyba při přidávání kategorie úkolu.', 'error');
                }
            } else {
                showNotification('Zadejte název kategorie.', 'warning');
            }
        });
    }
    
    // Add expense category
    const addExpenseCategoryButton = document.getElementById('add-expense-category');
    if (addExpenseCategoryButton) {
        addExpenseCategoryButton.addEventListener('click', async function() {
            const input = document.getElementById('new-expense-category');
            if (!input) return;
            
            const newCategory = input.value.trim();
            
            if (newCategory) {
                try {
                    await addExpenseCategory(newCategory);
                    input.value = '';
                    loadCategories();
                    showNotification('Kategorie výdaje byla přidána.', 'success');
                } catch (error) {
                    console.error('Error adding expense category:', error);
                    showNotification('Chyba při přidávání kategorie výdaje.', 'error');
                }
            } else {
                showNotification('Zadejte název kategorie.', 'warning');
            }
        });
    }
}

// Initialize rent settings
function initRentSettings() {
    // Save rent settings button
    const saveRentSettingsButton = document.getElementById('save-rent-settings');
    if (saveRentSettingsButton) {
        saveRentSettingsButton.addEventListener('click', async function() {
            const rentAmount = parseFloat(document.getElementById('rent-amount').value);
            const rentDay = parseInt(document.getElementById('rent-day').value);
            
            if (isNaN(rentAmount) || rentAmount <= 0) {
                showNotification('Zadejte platnou částku nájmu.', 'warning');
                return;
            }
            
            if (isNaN(rentDay) || rentDay < 1 || rentDay > 31) {
                showNotification('Zadejte platný den splatnosti (1-31).', 'warning');
                return;
            }
            
            try {
                await saveSettings('rentAmount', rentAmount);
                await saveSettings('rentDay', rentDay);
                
                showNotification('Nastavení nájmu bylo uloženo.', 'success');
                
                // Check rent payment
                checkRentPayment();
            } catch (error) {
                console.error('Error saving rent settings:', error);
                showNotification('Chyba při ukládání nastavení nájmu.', 'error');
            }
        });
    }
    
    // Load rent settings
    loadRentSettings();
}

// Load rent settings
async function loadRentSettings() {
    try {
        const rentAmountSetting = await getSettings('rentAmount');
        const rentDaySetting = await getSettings('rentDay');
        
        const rentAmountInput = document.getElementById('rent-amount');
        const rentDayInput = document.getElementById('rent-day');
        
        if (rentAmountInput && rentAmountSetting) {
            rentAmountInput.value = rentAmountSetting.value;
        }
        
        if (rentDayInput && rentDaySetting) {
            rentDayInput.value = rentDaySetting.value;
        }
    } catch (error) {
        console.error('Error loading rent settings:', error);
    }
}

// Initialize theme settings
async function initTheme() {
    const themeSetting = await getSettings('theme');
    const theme = themeSetting ? themeSetting.value : 'light';
    
    // Apply theme on page load
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-toggle').checked = true;
    }
    
    // Theme toggle in settings
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', async function() {
            document.body.classList.toggle('dark-mode');
            await saveSettings('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }
    
    // Color theme
    const colorThemeSetting = await getSettings('colorTheme');
    const colorTheme = colorThemeSetting ? colorThemeSetting.value : 'blue';
    
    applyColorTheme(colorTheme);
    
    // Mark active color
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-color') === colorTheme) {
            option.classList.add('active');
        }
    });
    
    // Color option click handlers
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', async function() {
            const color = this.getAttribute('data-color');
            applyColorTheme(color);
            
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            await saveSettings('colorTheme', color);
        });
    });
}

// Apply color theme
function applyColorTheme(color) {
    document.documentElement.style.setProperty('--primary-color', getColorValue(color));
    document.documentElement.style.setProperty('--primary-light', getLightColorValue(color));
    document.documentElement.style.setProperty('--primary-dark', getDarkColorValue(color));
}

// Get color values
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

// =========================
// NOTIFICATIONS
// =========================
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
    
    // Remove previous type classes
    notification.classList.remove('success', 'error', 'warning', 'info');
    
    // Set text and class based on type
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
    
    // Show notification
    notification.classList.add('show');
    
    // Auto-hide after 4 seconds (except errors)
    if (type !== 'error') {
        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

// =========================
// HELPER FUNCTIONS
// =========================
// Generate ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// Format currency
function formatCurrency(amount, currency = 'Kč') {
    return new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' ' + currency;
}

// Format time duration
function formatTimeDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}