// Admin module - Quản lý HKD, sản phẩm, hóa đơn
let currentAdminView = 'dashboard';
let selectedHKD = null;
let allHKDs = [];
let allInvoices = [];

// Khởi tạo admin page
async function initAdminPage() {
    try {
        // TẢI CSS TRƯỚC KHI KHỞI TẠO
        loadDashboardStyles();
        // Khởi tạo toàn bộ hệ thống
        await initSystem();
        
        // Kiểm tra quyền admin
        const user = getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = 'login.html?type=admin';
            return;
        }
        
        // Lắng nghe realtime updates
        listenForRealtimeUpdates();
        
        // Tải dữ liệu ban đầu
        await loadInitialData();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hiển thị thông tin admin
        displayAdminInfo();
        
        // Hiển thị dashboard mặc định
        showDashboard();
        
        // Yêu cầu quyền thông báo
        requestNotificationPermission();
        
        console.log('Admin page initialized');
    } catch (error) {
        console.error('Lỗi khởi tạo admin page:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}
// Tải dữ liệu ban đầu
async function loadInitialData() {
    Utils.showLoading('Đang tải dữ liệu...');
    
    try {
        // Tải danh sách HKD
        allHKDs = await getAllHKDs();
        allHKDs = allHKDs.filter(hkd => hkd.role === 'hkd');
        
        // Tải hóa đơn
        await loadAllInvoices();
        
        // Cập nhật UI
        updateHKDList();
        updateDashboardStats();
        
    } catch (error) {
        console.error('Lỗi tải dữ liệu:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

async function loadAllInvoices() {
    console.log('📥 Đang tải tất cả hóa đơn...');
    
    // KHỞI TẠO NẾU CHƯA CÓ
    if (!allInvoices || !Array.isArray(allInvoices)) {
        allInvoices = [];
    } else {
        allInvoices = []; // Reset
    }
    
    // KIỂM TRA allHKDs
    if (!allHKDs || !Array.isArray(allHKDs)) {
        console.error('❌ allHKDs không hợp lệ');
        return;
    }
    
    console.log(`📊 Có ${allHKDs.length} HKD để tải invoices`);
    
    for (const hkd of allHKDs) {
        if (!hkd || !hkd.id) {
            console.warn('⚠️ Bỏ qua HKD không hợp lệ:', hkd);
            continue;
        }
        
        try {
            const invoices = await getInvoicesByHKD(hkd.id);
            console.log(`  - HKD ${hkd.name}: ${invoices.length} invoices`);
            
            // LỌC INVOICE HỢP LỆ
            if (invoices && Array.isArray(invoices)) {
                const validInvoices = invoices.filter(inv => 
                    inv && typeof inv === 'object' && inv.id
                );
                allInvoices.push(...validInvoices);
            }
            
        } catch (error) {
            console.error(`❌ Lỗi tải invoices cho HKD ${hkd.id}:`, error);
        }
    }
    
    // Sắp xếp
    if (allInvoices.length > 0) {
        allInvoices.sort((a, b) => {
            try {
                const dateA = a.date ? new Date(a.date) : new Date(0);
                const dateB = b.date ? new Date(b.date) : new Date(0);
                return dateB - dateA; // Mới nhất trước
            } catch {
                return 0;
            }
        });
    }
    
    console.log(`✅ Đã tải ${allInvoices.length} invoices`);
}

function setupEventListeners() {
    console.log('🔗 Setting up event listeners (REPLACING OLD)...');
    
    // === 1. XÓA TẤT CẢ LISTENERS CŨ ===
    const allNavLinks = document.querySelectorAll('.nav-link[data-view]');
    allNavLinks.forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
    });
    
    // === 2. NAVIGATION - SỬA LỖI ===
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const view = e.currentTarget.dataset.view || 
                         e.target.closest('.nav-link').dataset.view;
            
            if (view) {
                console.log('🎯 Navigation click:', view);
                switchAdminView(view);
            } else {
                console.error('❌ No data-view found');
            }
        });
    });
    
    // === 3. LOGOUT ===
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        document.getElementById('btnLogout').addEventListener('click', logout);
    }
    
    // === 4. HKD SEARCH ===
    const searchInput = document.getElementById('hkdSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(searchHKDs, 300));
    }
    
    // === 5. ADD HKD MODAL ===
    const addHKDModal = document.getElementById('addHKDModal');
    if (addHKDModal) {
        addHKDModal.addEventListener('shown.bs.modal', () => {
            document.getElementById('hkdForm').reset();
        });
        
        const saveBtn = document.getElementById('saveHKD');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveHKD);
        }
    }
    
    // === 6. IMPORT EXCEL ===
    const importInput = document.getElementById('importExcel');
    if (importInput) {
        importInput.addEventListener('change', handleExcelImport);
    }
    
    const importBtn = document.getElementById('btnImport');
    if (importBtn) {
        importBtn.addEventListener('click', processExcelImport);
    }
    
    // === 7. CHANGE PASSWORD ===
    const passwordForm = document.getElementById('changePasswordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', changePassword);
    }
    
    // === 8. INVOICE FILTERS (THÊM PHẦN NÀY) ===
    console.log('🎛️ Setting up invoice filters...');
    
    // a) HKD select change
    const hkdSelect = document.getElementById('invoiceHKD');
    if (hkdSelect) {
        hkdSelect.addEventListener('change', function() {
            console.log(`🔄 HKD select changed to: ${this.value}`);
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
        console.log('✅ Added change listener to invoiceHKD select');
    }
    // Thêm vào setupEventListeners
const updateBtn = document.getElementById('updateHKD');
if (updateBtn) {
    updateBtn.replaceWith(updateBtn.cloneNode(true));
    document.getElementById('updateHKD').addEventListener('click', updateHKD);
    console.log('✅ Added click listener to update HKD button');
}
    // b) Date inputs
    const startDate = document.getElementById('invoiceStartDate');
    const endDate = document.getElementById('invoiceEndDate');
    
    if (startDate) {
        startDate.addEventListener('change', () => {
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
    }
    
    if (endDate) {
        endDate.addEventListener('change', () => {
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
    }
    
    // c) Filter button
    const filterBtn = document.getElementById('btnFilterInvoices');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            if (typeof filterInvoices === 'function') {
                filterInvoices();
            }
        });
        console.log('✅ Added click listener to filter button');
    }
    
    // d) Reset button
    const resetBtn = document.getElementById('btnResetFilter');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            console.log('🔄 Resetting invoice filter...');
            
            // Reset values
            if (hkdSelect) hkdSelect.value = '';
            if (startDate) startDate.value = '';
            if (endDate) endDate.value = '';
            
            // Call filter
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
            
            Utils.showToast('Đã reset bộ lọc', 'success');
        });
        console.log('✅ Added click listener to reset button');
    }
    
    console.log('✅ Event listeners setup complete');
}

// Hiển thị thông tin admin
function displayAdminInfo() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('adminName').textContent = user.name;
        document.getElementById('adminPhone').textContent = user.phone;
    }
}

// Chuyển đổi view
function switchAdminView(view) {
    currentAdminView = view;
    
    // Ẩn tất cả sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Xóa active class từ tất cả nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Hiển thị section được chọn
    const targetSection = document.getElementById(`${view}Section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Thêm active class cho nav link
    const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // Tải dữ liệu cho view
    switch(view) {
        case 'dashboard':
            showDashboard();
            break;
        case 'hkds':
            showHKDs();
            break;
        case 'invoices':
            showInvoices();
            break;
        case 'import':
            showImport();
            break;
        case 'settings':
            showSettings();
            break;
    }
}

// Thêm vào admin.js
function addMarkAllAsReadButton() {
    // Kiểm tra đã có button chưa
    if (document.getElementById('markAllInvoicesRead')) return;
    
    // Tìm container của recent invoices
    const container = document.querySelector('#recentInvoices').parentElement;
    if (!container) return;
    
    // Thêm header với button
    const header = container.querySelector('.section-header');
    if (header) {
        const button = document.createElement('button');
        button.id = 'markAllInvoicesRead';
        button.className = 'btn-mark-all-read';
        button.innerHTML = '<i class="fas fa-check-double"></i> Đánh dấu tất cả đã xem';
        button.onclick = markAllInvoicesAsRead;
        
        header.appendChild(button);
    }
}

function markAllInvoicesAsRead() {
    const recentContainer = document.getElementById('recentInvoices');
    if (!recentContainer) return;
    
    // Lấy tất cả invoice cards
    const invoiceCards = recentContainer.querySelectorAll('.invoice-card');
    
    // Lấy danh sách ID
    const viewedInvoices = getViewedInvoices();
    
    invoiceCards.forEach(card => {
        const invoiceId = card.dataset.invoiceId;
        if (invoiceId && !viewedInvoices.includes(invoiceId)) {
            markInvoiceAsViewed(invoiceId);
        }
    });
    
    Utils.showToast('Đã đánh dấu tất cả hóa đơn đã xem', 'success');
}
// Thêm CSS vào đầu admin.js hoặc trong initAdminPage
function loadDashboardStyles() {
    // Kiểm tra nếu CSS đã tồn tại
    if (document.getElementById('dashboard-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.textContent = `
        /* ========== INVOICE CARD STYLES ========== */
        .invoice-card {
            background: #ffffff;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            position: relative;
            cursor: pointer;
            overflow: hidden;
        }
        
        /* Hover effect cho TẤT CẢ invoice cards */
        .invoice-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            border-color: #4a6ee0;
        }
        
        /* Invoice card mới - chưa xem */
        .invoice-card-new {
            border: 2px solid rgba(74, 110, 224, 0.3);
            background: linear-gradient(135deg, #ffffff 0%, #f8faff 100%);
            box-shadow: 0 4px 15px rgba(74, 110, 224, 0.15);
            animation: subtleFloat 3s infinite ease-in-out;
        }
        
        .invoice-card-new:hover {
            transform: translateY(-2px) scale(1.01);
            box-shadow: 0 8px 25px rgba(74, 110, 224, 0.25);
            border-color: #4a6ee0;
        }
        
        .invoice-card-viewed {
            border: 1px solid #e0e0e0;
            background: #ffffff;
        }
        
        .invoice-card-viewed:hover {
            border-color: #4a6ee0;
            box-shadow: 0 8px 25px rgba(74, 110, 224, 0.1);
        }
        
        /* Invoice header */
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .invoice-id {
            font-family: monospace;
            font-size: 12px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Badge "MỚI" */
        .new-badge {
            display: inline-block;
            background: linear-gradient(45deg, #ff416c, #ff4b2b);
            color: white;
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 12px;
            font-weight: bold;
            animation: pulse 1.5s infinite;
            box-shadow: 0 2px 5px rgba(255, 65, 108, 0.3);
        }
        
        /* Invoice status */
        .invoice-status {
            padding: 4px 10px;
            border-radius: 15px;
            font-size: 11px;
            font-weight: 600;
        }
        
        .invoice-status.completed {
            background: #e8f5e9;
            color: #2e7d32;
        }
        
        .invoice-status.pending {
            background: #fff3e0;
            color: #ef6c00;
        }
        
        .invoice-status.cancelled {
            background: #ffebee;
            color: #c62828;
        }
        
        /* Ngôi sao trong status */
        .new-star {
            color: #ffd700;
            margin-left: 5px;
            animation: spin 2s infinite linear;
            font-size: 10px;
        }
        
        /* Invoice body */
        .invoice-body {
            margin-bottom: 15px;
        }
        
        .invoice-info {
            margin-bottom: 10px;
        }
        
        .invoice-hkd {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .invoice-hkd i.fa-store {
            color: #4a6ee0;
        }
        
        .new-indicator {
            color: #4a6ee0;
            animation: bellRing 1s infinite;
            font-size: 12px;
        }
        
        .invoice-date {
            font-size: 12px;
            color: #777;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .invoice-total {
            font-size: 18px;
            font-weight: 700;
            color: #2c3e50;
            text-align: right;
        }
        
        .invoice-total.highlight {
            color: #ff5722;
            text-shadow: 0 0 10px rgba(255, 87, 34, 0.2);
        }
        
        /* Invoice footer */
        .invoice-footer {
            padding-top: 10px;
            border-top: 1px solid #f0f0f0;
        }
        
        .btn-view-invoice {
            width: 100%;
            padding: 8px 12px;
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            color: #4a6ee0;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .btn-view-invoice:hover {
            background: #4a6ee0;
            color: white;
            border-color: #4a6ee0;
            transform: translateY(-1px);
            box-shadow: 0 3px 10px rgba(74, 110, 224, 0.3);
        }
        
        /* Invoice card mới có button đặc biệt */
        .invoice-card-new .btn-view-invoice {
            background: linear-gradient(45deg, #4a6ee0, #7b68ee);
            color: white;
            border: none;
            font-weight: bold;
            box-shadow: 0 3px 10px rgba(74, 110, 224, 0.3);
        }
        
        .invoice-card-new .btn-view-invoice:hover {
            background: linear-gradient(45deg, #3a5ecf, #6b58df);
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(74, 110, 224, 0.4);
        }
        
        /* Hiệu ứng nhấp nháy */
        .glow-effect {
            position: relative;
        }
        
        .glow-effect::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            background: linear-gradient(45deg, #4a6ee0, #7b68ee, #4a6ee0);
            border-radius: 12px;
            z-index: -1;
            animation: glowing 2s infinite;
            opacity: 0.3;
        }
        
        /* Chấm nhấp nháy */
        .pulse-dot {
            position: absolute;
            top: 15px;
            right: 15px;
            width: 8px;
            height: 8px;
            background: #ff416c;
            border-radius: 50%;
            animation: pulseDot 1.5s infinite;
            z-index: 1;
        }
        
        /* ========== ANIMATIONS ========== */
        @keyframes subtleFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
        }
        
        @keyframes glowing {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.9; }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @keyframes bellRing {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(15deg); }
            75% { transform: rotate(-15deg); }
        }
        
        @keyframes pulseDot {
            0%, 100% { 
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 65, 108, 0.7);
            }
            70% { 
                transform: scale(1.2);
                box-shadow: 0 0 0 6px rgba(255, 65, 108, 0);
            }
        }
        
        /* ========== RESPONSIVE ========== */
        @media (max-width: 768px) {
            .invoice-card {
                padding: 12px;
            }
            
            .invoice-card-new {
                border-width: 1px;
            }
            
            .glow-effect::before {
                display: none;
            }
            
            .invoice-total {
                font-size: 16px;
            }
        }
        
        /* ========== DARK MODE SUPPORT ========== */
        @media (prefers-color-scheme: dark) {
            .invoice-card {
                background: #2d3748;
                border-color: #4a5568;
                color: #e2e8f0;
            }
            
            .invoice-card-viewed {
                background: #2d3748;
            }
            
            .invoice-card-new {
                background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%);
                border-color: #4a6ee0;
            }
            
            .invoice-hkd {
                color: #e2e8f0;
            }
            
            .invoice-date {
                color: #a0aec0;
            }
            
            .invoice-total {
                color: #ffffff;
            }
            
            .btn-view-invoice {
                background: #4a5568;
                border-color: #718096;
                color: #e2e8f0;
            }
            
            .invoice-card-new .btn-view-invoice {
                background: linear-gradient(45deg, #4a6ee0, #7b68ee);
            }
        }
    `;
    
    // Thêm vào head sớm nhất có thể
    document.head.appendChild(style);
    console.log('✅ Dashboard styles loaded');
}
// Trong admin.js
function handleNewInvoiceSimple(invoice) {
    console.log('🔄 Processing new invoice:', invoice.id);
    
    // 1. Thêm vào allInvoices nếu chưa có
    if (allInvoices && !allInvoices.find(inv => inv.id === invoice.id)) {
        allInvoices.unshift(invoice);
    }
    
    // 2. Gọi hàm hiển thị view hiện tại
    switch(currentAdminView) {
        case 'dashboard':
            showDashboard(); // Sẽ render lại toàn bộ dashboard
            break;
        case 'invoices':
            showInvoices();  // Sẽ render lại danh sách invoices
            break;
        case 'hkds':
            showHKDs();      // Sẽ render lại danh sách HKD
            break;
    }
    
    console.log('✅ UI refreshed');
}

// Export ra window
window.handleNewInvoiceSimple = handleNewInvoiceSimple;
// Gọi trong showDashboard
function showDashboard() {
    updateDashboardStats();
    displayRecentInvoices();
    drawDashboardCharts();
    addMarkAllAsReadButton(); // Thêm dòng này
}
function updateUIRealtime(invoice) {
    console.log('🔄 Updating UI for new invoice:', invoice.id);
    
    // 1. Cập nhật dashboard stats
    updateDashboardStats();
    
    // 2. Thêm invoice vào danh sách nếu đang xem dashboard
    if (currentAdminView === 'dashboard') {
        // Gọi lại hàm displayRecentInvoices để hiển thị với hiệu ứng mới
        setTimeout(() => {
            displayRecentInvoices();
        }, 500);
    }
    
    // 3. Nếu đang xem invoices, thêm vào table
    if (currentAdminView === 'invoices') {
        const tableBody = document.querySelector('#invoiceList tbody');
        if (tableBody) {
            const hkd = allHKDs.find(h => h.id === invoice.hkdId);
            const newRow = `
                <tr id="row-${invoice.id}" class="new-invoice-row">
                    <td><span class="new-indicator-table"><i class="fas fa-star"></i></span> ${Utils.formatDate(invoice.date)}</td>
                    <td>${invoice.id.substring(0, 10)}...</td>
                    <td><strong>${hkd ? hkd.name : 'N/A'}</strong></td>
                    <td>${invoice.customerName || 'Khách lẻ'}</td>
                    <td>${invoice.items.length}</td>
                    <td class="highlight-total">${Utils.formatCurrency(invoice.total)}</td>
                    <td>
                        <button class="btn-view" onclick="viewInvoiceDetails('${invoice.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
            
            tableBody.insertAdjacentHTML('afterbegin', newRow);
            
            // Tự động xóa class "new" sau 5 giây
            setTimeout(() => {
                const row = document.getElementById(`row-${invoice.id}`);
                if (row) {
                    row.classList.remove('new-invoice-row');
                }
            }, 5000);
        }
    }
}
function updateDashboardStats() {
    const stats = {
        totalHKDs: allHKDs.length,
        totalInvoices: allInvoices.length,
        totalRevenue: allInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
        todayInvoices: allInvoices.filter(inv => 
            new Date(inv.date).toDateString() === new Date().toDateString()
        ).length
    };
    
    document.getElementById('totalHKDs').textContent = stats.totalHKDs;
    document.getElementById('totalInvoices').textContent = stats.totalInvoices;
    document.getElementById('totalRevenue').textContent = Utils.formatCurrency(stats.totalRevenue);
    document.getElementById('todayInvoices').textContent = stats.todayInvoices;
}

function displayRecentInvoices() {
    const container = document.getElementById('recentInvoices');
    if (!container) return;
    
    // Xóa tất cả các invoice card cũ
    container.innerHTML = '';
    
    // Lấy 10 invoice gần nhất
    const recentInvoices = allInvoices.slice(0, 10);
    
    // Lấy danh sách invoice đã xem
    const viewedInvoices = getViewedInvoices();
    
    // Tạo từng invoice card
    recentInvoices.forEach(invoice => {
        const isViewed = viewedInvoices.includes(invoice.id);
        const isNew = !isViewed && isRecentInvoice(invoice);
        
        // Tạo card element
        const card = document.createElement('div');
        card.className = `invoice-card ${isNew ? 'invoice-card-new glow-effect' : 'invoice-card-viewed'}`;
        card.id = `invoice-${invoice.id}`;
        card.dataset.invoiceId = invoice.id;
        
        // Thêm event listener
        card.addEventListener('click', function(e) {
            // Chỉ xử lý click trực tiếp lên card, không phải lên button
            if (!e.target.closest('.btn-view-invoice')) {
                markInvoiceAsViewed(invoice.id);
                viewInvoiceDetails(invoice.id);
            }
        });
        
        // Tạo nội dung
        card.innerHTML = `
            <div class="invoice-header">
                <div class="invoice-id">
                    ${invoice.id.substring(0, 8)}...
                    ${isNew ? '<span class="new-badge">MỚI</span>' : ''}
                </div>
                <div class="invoice-status ${invoice.status || 'completed'}">
                    ${invoice.status || 'Hoàn thành'}
                    ${isNew ? '<i class="fas fa-star new-star"></i>' : ''}
                </div>
            </div>
            
            <div class="invoice-body ${isNew ? 'unread' : ''}">
                <div class="invoice-info">
                    <div class="invoice-hkd">
                        <i class="fas fa-store"></i> ${invoice.hkdName || 'N/A'}
                        ${isNew ? '<i class="fas fa-bell new-indicator"></i>' : ''}
                    </div>
                    <div class="invoice-date">
                        <i class="far fa-clock"></i> ${Utils.formatDate(invoice.date, true)}
                    </div>
                </div>
                <div class="invoice-total ${isNew ? 'highlight' : ''}">
                    ${Utils.formatCurrency(invoice.total)}
                </div>
            </div>
            
            <div class="invoice-footer">
                <button class="btn-view-invoice" onclick="event.stopPropagation(); viewInvoiceDetails('${invoice.id}')">
                    ${isNew ? '<i class="fas fa-eye"></i>' : '<i class="far fa-eye"></i>'}
                    ${isNew ? '<strong>Xem chi tiết</strong>' : 'Xem chi tiết'}
                </button>
            </div>
            
            ${isNew ? '<div class="pulse-dot"></div>' : ''}
        `;
        
        // Thêm vào container
        container.appendChild(card);
    });
    
    // Nếu không có invoice nào
    if (recentInvoices.length === 0) {
        container.innerHTML = `
            <div class="no-invoices">
                <i class="fas fa-receipt"></i>
                <p>Chưa có hóa đơn nào</p>
            </div>
        `;
    }
}

// Hàm kiểm tra invoice có phải mới không (trong vòng 24h)
function isRecentInvoice(invoice) {
    if (!invoice || !invoice.date) return false;
    
    const invoiceDate = new Date(invoice.date);
    const now = new Date();
    const hoursDiff = (now - invoiceDate) / (1000 * 60 * 60);
    
    return hoursDiff < 24; // Mới trong 24h
}

// Lấy danh sách invoice đã xem từ localStorage
function getViewedInvoices() {
    try {
        const saved = localStorage.getItem('viewedInvoices');
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

function markInvoiceAsViewed(invoiceId) {
    const viewedInvoices = getViewedInvoices();
    
    if (!viewedInvoices.includes(invoiceId)) {
        viewedInvoices.push(invoiceId);
        localStorage.setItem('viewedInvoices', JSON.stringify(viewedInvoices));
        
        // Cập nhật card trong DOM
        const invoiceCard = document.getElementById(`invoice-${invoiceId}`);
        if (invoiceCard) {
            // Thay đổi class
            invoiceCard.classList.remove('invoice-card-new', 'glow-effect');
            invoiceCard.classList.add('invoice-card-viewed');
            
            // Cập nhật nội dung bên trong
            const newBadge = invoiceCard.querySelector('.new-badge');
            if (newBadge) newBadge.remove();
            
            const newStar = invoiceCard.querySelector('.new-star');
            if (newStar) newStar.remove();
            
            const newIndicator = invoiceCard.querySelector('.new-indicator');
            if (newIndicator) newIndicator.remove();
            
            const pulseDot = invoiceCard.querySelector('.pulse-dot');
            if (pulseDot) pulseDot.remove();
            
            const unreadBody = invoiceCard.querySelector('.invoice-body.unread');
            if (unreadBody) unreadBody.classList.remove('unread');
            
            const highlightTotal = invoiceCard.querySelector('.invoice-total.highlight');
            if (highlightTotal) highlightTotal.classList.remove('highlight');
            
            // Update button
            const button = invoiceCard.querySelector('.btn-view-invoice');
            if (button) {
                button.innerHTML = '<i class="far fa-eye"></i> Xem chi tiết';
                button.className = 'btn-view-invoice';
            }
            
            // Thêm hiệu ứng transition
            invoiceCard.style.transition = 'all 0.3s ease';
        }
    }
}


function drawDashboardCharts() {
    // Đơn giản: hiển thị thống kê dạng text
    const chartContainer = document.getElementById('dashboardChart');
    if (!chartContainer) return;
    
    // Phân tích dữ liệu theo tháng
    const monthlyData = {};
    allInvoices.forEach(invoice => {
        const date = new Date(invoice.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                invoices: 0,
                revenue: 0
            };
        }
        
        monthlyData[monthKey].invoices++;
        monthlyData[monthKey].revenue += invoice.total;
    });
    
    // Hiển thị dạng bảng
    const sortedMonths = Object.keys(monthlyData).sort();
    const recentMonths = sortedMonths.slice(-6); // 6 tháng gần nhất
    
    chartContainer.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Tháng</th>
                    <th>Số hóa đơn</th>
                    <th>Doanh thu</th>
                </tr>
            </thead>
            <tbody>
                ${recentMonths.map(month => `
                    <tr>
                        <td>${month}</td>
                        <td>${monthlyData[month].invoices}</td>
                        <td>${Utils.formatCurrency(monthlyData[month].revenue)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Quản lý HKD
function showHKDs() {
    updateHKDList();
}

function updateHKDList() {
    const container = document.getElementById('hkdList');
    if (!container) return;
    
    console.log('🔄 Updating HKD list...');
    console.log(`📊 Total HKDs: ${allHKDs ? allHKDs.length : 0}`);
    console.log(`📊 Total Invoices: ${allInvoices ? allInvoices.length : 0}`);
    
    // KIỂM TRA allInvoices
    if (!allInvoices) {
        console.error('❌ allInvoices is undefined!');
        allInvoices = [];
    }
    
    // KIỂM TRA allHKDs
    if (!allHKDs || allHKDs.length === 0) {
        container.innerHTML = '<p class="no-hkds">Chưa có HKD nào</p>';
        return;
    }
    
    container.innerHTML = allHKDs.map((hkd, index) => {
        // BẢO VỆ: kiểm tra hkd
        if (!hkd || typeof hkd !== 'object') {
            console.error(`❌ HKD at index ${index} is invalid:`, hkd);
            return '';
        }
        
        console.log(`Processing HKD ${index + 1}: ${hkd.name || 'No name'} (${hkd.id})`);
        
        // Lọc invoices của HKD này - AN TOÀN
        const hkdInvoices = Array.isArray(allInvoices) 
            ? allInvoices.filter(inv => {
                // Kiểm tra invoice hợp lệ
                if (!inv || typeof inv !== 'object') return false;
                if (!inv.hkdId) return false;
                return inv.hkdId === hkd.id;
            })
            : [];
        
        console.log(`  - Found ${hkdInvoices.length} invoices`);
        
        // Lấy 5 invoice gần nhất - AN TOÀN
        const recentInvoices = Array.isArray(hkdInvoices) 
            ? hkdInvoices.slice(0, 5) 
            : [];
        
        // Tính tổng doanh thu - AN TOÀN
        const totalRevenue = hkdInvoices.reduce((sum, inv) => {
            if (!inv || typeof inv !== 'object') return sum;
            return sum + (parseFloat(inv.total) || 0);
        }, 0);
        
        // Tạo HTML - THÊM KIỂM TRA NULL
        return `
            <div class="hkd-card" data-hkd-id="${hkd.id || ''}">
                <div class="hkd-header">
                    <div class="hkd-info">
                        <h4>${hkd.name || 'Không có tên'}</h4>
                        <div class="hkd-details">
                            <span><i class="fas fa-phone"></i> ${hkd.phone || 'N/A'}</span>
                            <span><i class="fas fa-map-marker-alt"></i> ${hkd.address || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="hkd-actions">
                        <button class="btn-edit" onclick="editHKD('${hkd.id || ''}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-delete" onclick="deleteHKD('${hkd.id || ''}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="hkd-stats">
                    <div class="stat-item">
                        <div class="stat-value">${hkdInvoices.length}</div>
                        <div class="stat-label">Hóa đơn</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${Utils.formatCurrency(totalRevenue)}</div>
                        <div class="stat-label">Doanh thu</div>
                    </div>
                </div>
                
                <div class="hkd-recent-invoices">
                    <h5>5 hóa đơn gần nhất:</h5>
                    ${recentInvoices.length > 0 ? `
                        <table class="invoice-mini-table">
                            <thead>
                                <tr>
                                    <th>Ngày</th>
                                    <th>Số lượng</th>
                                    <th>Tổng tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recentInvoices.map(inv => {
                                    // KIỂM TRA invoice hợp lệ
                                    if (!inv) return '';
                                    return `
                                        <tr>
                                            <td>${Utils.formatDate(inv.date, false)}</td>
                                            <td>${inv.items ? inv.items.length : 0} SP</td>
                                            <td>${Utils.formatCurrency(inv.total || 0)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    ` : '<p class="no-data">Chưa có hóa đơn</p>'}
                    
                    ${hkdInvoices.length > 5 ? `
                        <button class="btn-show-all" onclick="viewHKDInvoices('${hkd.id || ''}')">
                            Xem tất cả (${hkdInvoices.length})
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function searchHKDs() {
    const searchTerm = document.getElementById('hkdSearch').value.toLowerCase();
    
    if (!searchTerm) {
        updateHKDList();
        return;
    }
    
    const filteredHKDs = allHKDs.filter(hkd =>
        hkd.name.toLowerCase().includes(searchTerm) ||
        hkd.phone.includes(searchTerm) ||
        (hkd.address && hkd.address.toLowerCase().includes(searchTerm))
    );
    
    const container = document.getElementById('hkdList');
    if (!container) return;
    
    if (filteredHKDs.length === 0) {
        container.innerHTML = '<p class="no-results">Không tìm thấy HKD nào</p>';
        return;
    }
    
    container.innerHTML = filteredHKDs.map(hkd => `
        <div class="hkd-card">
            <div class="hkd-header">
                <h4>${hkd.name}</h4>
                <div class="hkd-actions">
                    <button class="btn-edit" onclick="editHKD('${hkd.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
            <div class="hkd-details">
                <p><i class="fas fa-phone"></i> ${hkd.phone}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${hkd.address || 'N/A'}</p>
            </div>
        </div>
    `).join('');
}

async function saveHKD() {
    const saveButton = document.getElementById('saveHKD');
    if (saveButton.disabled) {
        return;
    }
    
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    
    try {
        const name = document.getElementById('hkdName').value;
        const phone = document.getElementById('hkdPhone').value;
        const address = document.getElementById('hkdAddress').value;
        const password = document.getElementById('hkdPassword').value;
        
        if (!name || !phone || !password) {
            Utils.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = 'Lưu';
            return;
        }
        
        if (!Utils.validatePhone(phone)) {
            Utils.showToast('Số điện thoại không hợp lệ', 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = 'Lưu';
            return;
        }
        
        Utils.showLoading('Đang lưu HKD...');
        
        // TẠO ID
        const hkdId = Utils.generateId();
        const hkdData = {
            id: hkdId,
            name: name,
            phone: phone,
            address: address,
            password: password, // QUAN TRỌNG
            role: 'hkd',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        console.log('📝 Tạo HKD data:', hkdData);
        
        // CÁCH 1: Sử dụng trực tiếp IndexedDB API (BỎ QUA HÀM updateInStore)
        const db = await getDB();
        
        const tx = db.transaction([STORES.HKDS], 'readwrite');
        const store = tx.objectStore(STORES.HKDS);
        
        // Kiểm tra xem số điện thoại đã tồn tại chưa
        const index = store.index('phone');
        const checkRequest = index.get(phone);
        
        await new Promise((resolve, reject) => {
            checkRequest.onsuccess = (e) => {
                if (e.target.result) {
                    reject(new Error('Số điện thoại đã tồn tại'));
                    return;
                }
                
                // Lưu HKD mới
                const putRequest = store.put(hkdData);
                putRequest.onsuccess = () => {
                    console.log('✅ Đã lưu HKD vào IndexedDB với ID:', hkdId);
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            checkRequest.onerror = () => reject(checkRequest.error);
        });
        
        // Cập nhật danh sách local
        allHKDs.push(hkdData);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'hkds',
            data: hkdData
        });
        
        // Update UI
        updateHKDList();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addHKDModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset form
        document.getElementById('hkdForm').reset();
        
        Utils.showToast('Đã thêm HKD thành công', 'success');
        
        // TEST: Kiểm tra ngay lập tức
        console.log('🔍 Kiểm tra HKD vừa tạo...');
        const testHKD = await getFromStore(STORES.HKDS, hkdId);
        console.log('HKD từ IndexedDB:', testHKD);
        
        // Đồng bộ ngay
        if (navigator.onLine && typeof forceSync === 'function') {
            setTimeout(async () => {
                try {
                    await forceSync();
                } catch (syncError) {
                    console.error('Lỗi sync:', syncError);
                }
            }, 500);
        }
        
    } catch (error) {
        console.error('❌ Lỗi lưu HKD:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
        saveButton.disabled = false;
        saveButton.innerHTML = 'Lưu';
    }
}

function editHKD(hkdId) {
    console.log(`✏️ Editing HKD: ${hkdId}`);
    
    if (!hkdId) {
        console.error('❌ HKD ID không hợp lệ');
        return;
    }
    
    // Tìm HKD
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        console.error(`❌ Không tìm thấy HKD với ID: ${hkdId}`);
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    console.log('📋 HKD data:', hkd);
    
    // Điền thông tin vào form
    document.getElementById('editHKDName').value = hkd.name || '';
    document.getElementById('editHKDPhone').value = hkd.phone || '';
    document.getElementById('editHKDAddress').value = hkd.address || '';
    document.getElementById('editHKDPassword').value = hkd.password || '';
    
    // Lưu HKD đang chỉnh sửa
    selectedHKD = hkd;
    
    // Hiển thị modal
    const editModal = new bootstrap.Modal(document.getElementById('editHKDModal'));
    editModal.show();
    
    console.log(`✅ Form loaded for HKD: ${hkd.name}`);
}

async function updateHKD() {
    console.log('🔄 Updating HKD...');
    
    if (!selectedHKD) {
        console.error('❌ Không có HKD nào được chọn để cập nhật');
        Utils.showToast('Không tìm thấy HKD để cập nhật', 'error');
        return;
    }
    
    const name = document.getElementById('editHKDName').value;
    const phone = document.getElementById('editHKDPhone').value;
    const address = document.getElementById('editHKDAddress').value;
    const password = document.getElementById('editHKDPassword').value;
    
    console.log('📝 Update data:', { name, phone, address, passwordLength: password?.length });
    
    if (!name || !phone) {
        Utils.showToast('Vui lòng nhập tên và số điện thoại', 'error');
        return;
    }
    
    if (!Utils.validatePhone(phone)) {
        Utils.showToast('Số điện thoại không hợp lệ', 'error');
        return;
    }
    
    Utils.showLoading('Đang cập nhật...');
    
    try {
        // Cập nhật thông tin
        selectedHKD.name = name;
        selectedHKD.phone = phone;
        selectedHKD.address = address;
        
        // Chỉ cập nhật mật khẩu nếu có nhập
        if (password && password.trim() !== '') {
            selectedHKD.password = password;
            console.log('🔐 Password updated');
        }
        
        selectedHKD.lastUpdated = new Date().toISOString();
        
        console.log('📤 Updated HKD data:', selectedHKD);
        
        // 1. Cập nhật trong IndexedDB
        await updateInStore(STORES.HKDS, selectedHKD);
        console.log('✅ Đã cập nhật trong IndexedDB');
        
        // 2. Thêm vào sync queue
        await addToSyncQueue({
            type: 'hkds',
            data: selectedHKD
        });
        console.log('✅ Đã thêm vào sync queue');
        
        // 3. Cập nhật danh sách local
        const index = allHKDs.findIndex(h => h.id === selectedHKD.id);
        if (index !== -1) {
            allHKDs[index] = { ...selectedHKD };
            console.log(`✅ Đã cập nhật allHKDs tại index ${index}`);
        }
        
        // 4. Update UI
        updateHKDList();
        
        // THAY THẾ TOÀN BỘ ĐOẠN TRÊN BẰNG:
setTimeout(() => {
    try {
        const invoiceSelect = document.getElementById('invoiceHKD');
        if (invoiceSelect && selectedHKD && selectedHKD.id) {
            const option = invoiceSelect.querySelector(`option[value="${selectedHKD.id}"]`);
            if (option && selectedHKD.name) {
                option.textContent = selectedHKD.name + (selectedHKD.phone ? ` (${selectedHKD.phone})` : '');
                console.log('✅ Đã cập nhật option trong select');
            }
        }
    } catch (error) {
        console.warn('⚠️ Lỗi khi cập nhật select (không nghiêm trọng):', error.message);
    }
}, 100);
        
        // 6. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editHKDModal'));
        if (modal) {
            modal.hide();
        }
        
        Utils.showToast('Đã cập nhật HKD thành công', 'success');
        
        // 7. Đồng bộ ngay lập tức
        if (navigator.onLine) {
            setTimeout(async () => {
                try {
                    if (typeof forceSync === 'function') {
                        await forceSync();
                        console.log('✅ Đã đồng bộ lên Firebase');
                    }
                } catch (syncError) {
                    console.error('❌ Lỗi khi sync:', syncError);
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Lỗi cập nhật HKD:', error);
        console.error('Error details:', error.message, error.stack);
        Utils.showToast('Lỗi khi cập nhật HKD: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
        selectedHKD = null;
    }
}

async function deleteHKD(hkdId) {
    const confirmed = await Utils.confirm('Bạn có chắc chắn muốn xóa HKD này? Tất cả dữ liệu liên quan sẽ bị xóa.');
    if (!confirmed) return;
    
    Utils.showLoading('Đang xóa HKD...');
    
    try {
        // Xóa khỏi IndexedDB
        await deleteFromStore(STORES.HKDS, hkdId);
        
        // Xóa dữ liệu liên quan
        await clearHKDData(hkdId);
        
        // Thêm vào sync queue để xóa trên Firebase
        await addToSyncQueue({
            type: 'hkds_delete',
            data: { id: hkdId }
        });
        
        // Cập nhật danh sách
        allHKDs = allHKDs.filter(h => h.id !== hkdId);
        updateHKDList();
        
        // Cập nhật dashboard
        updateDashboardStats();
        
        Utils.showToast('Đã xóa HKD thành công', 'success');
        
        // Đồng bộ ngay lập tức
        if (navigator.onLine) {
            await forceSync();
        }
        
    } catch (error) {
        console.error('Lỗi xóa HKD:', error);
        Utils.showToast('Lỗi khi xóa HKD', 'error');
    } finally {
        Utils.hideLoading();
    }
}
function populateHKDSelect() {
    const hkdSelect = document.getElementById('invoiceHKD');
    if (!hkdSelect) {
        console.error('❌ Không tìm thấy select invoiceHKD');
        return;
    }
    
    console.log(`📊 Populating HKD select with ${allHKDs.length} HKDs...`);
    
    // Lưu giá trị hiện tại
    const currentValue = hkdSelect.value;
    
    // Clear và thêm option mặc định
    hkdSelect.innerHTML = '<option value="">Tất cả HKD</option>';
    
    // Thêm từng HKD
    if (allHKDs && Array.isArray(allHKDs)) {
        allHKDs.forEach(hkd => {
            if (hkd && hkd.id && hkd.name) {
                const option = document.createElement('option');
                option.value = hkd.id;
                option.textContent = hkd.name + (hkd.phone ? ` (${hkd.phone})` : '');
                hkdSelect.appendChild(option);
            }
        });
    }
    
    // Khôi phục giá trị cũ nếu còn tồn tại
    if (currentValue && hkdSelect.querySelector(`option[value="${currentValue}"]`)) {
        hkdSelect.value = currentValue;
    }
    
    console.log(`✅ Select now has ${hkdSelect.options.length} options`);
}
function viewHKDInvoices(hkdId) {
    console.log(`📋 Xem hóa đơn của HKD: ${hkdId}`);
    
    if (!hkdId) {
        console.error('❌ HKD ID không hợp lệ');
        return;
    }
    
    // Tìm HKD
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        console.error(`❌ Không tìm thấy HKD với ID: ${hkdId}`);
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    console.log(`✅ Đã chọn HKD: ${hkd.name}`);
    
    // 1. Chuyển sang tab invoices
    switchAdminView('invoices');
    
    // 2. Đợi một chút rồi set filter
    setTimeout(() => {
        const select = document.getElementById('invoiceHKD');
        if (select) {
            // Set value
            select.value = hkdId;
            console.log(`🎯 Set invoiceHKD select to: ${hkdId}`);
            
            // Gọi filter ngay
            if (typeof filterInvoices === 'function') {
                setTimeout(() => {
                    filterInvoices();
                    console.log(`✅ Đã filter invoices cho HKD: ${hkd.name}`);
                }, 100);
            }
        } else {
            console.error('❌ Không tìm thấy select invoiceHKD');
        }
    }, 300); // Đợi tab hiển thị
}

function showInvoices() {
    console.log('📋 Bắt đầu hiển thị trang hóa đơn...');
    
    try {
        // 1. Populate HKD select
        populateHKDSelect();
        
        // 2. Đảm bảo allInvoices đã được tải
        if (!allInvoices || !Array.isArray(allInvoices)) {
            console.warn('⚠️ allInvoices chưa sẵn sàng, đang tải lại...');
            
            // Thử tải lại invoices
            setTimeout(async () => {
                try {
                    await loadAllInvoices();
                    displayInvoices();
                } catch (error) {
                    console.error('❌ Lỗi tải lại invoices:', error);
                }
            }, 300);
        }
        
        // 3. Hiển thị invoices
        displayInvoices();
        
        console.log('✅ showInvoices hoàn tất');
        
    } catch (error) {
        console.error('❌ Lỗi trong showInvoices:', error);
        Utils.showToast('Lỗi hiển thị hóa đơn: ' + error.message, 'error');
    }
}

function displayInvoices() {
    console.log('📄 Hiển thị danh sách hóa đơn...');
    
    const container = document.getElementById('invoiceList');
    if (!container) {
        console.error('❌ Không tìm thấy invoiceList container');
        return;
    }
    
    // KIỂM TRA allInvoices
    if (!allInvoices || !Array.isArray(allInvoices)) {
        console.error('❌ allInvoices không hợp lệ:', allInvoices);
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-invoices">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Lỗi dữ liệu hóa đơn</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    console.log(`📊 Số hóa đơn: ${allInvoices.length}`);
    
    if (allInvoices.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-invoices">
                        <i class="fas fa-receipt"></i>
                        <p>Chưa có hóa đơn nào</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // TẠO HTML - THÊM KIỂM TRA TỪNG INVOICE
    try {
        const invoicesHTML = allInvoices.map((invoice, index) => {
            // KIỂM TRA invoice hợp lệ
            if (!invoice || typeof invoice !== 'object') {
                console.warn(`⚠️ Invoice at index ${index} không hợp lệ`);
                return '';
            }
            
            // Tìm HKD
            const hkd = allHKDs && Array.isArray(allHKDs) 
                ? allHKDs.find(h => h && h.id === invoice.hkdId)
                : null;
            
            return `
                <tr>
                    <td>${Utils.formatDate(invoice.date)}</td>
                    <td>${invoice.id ? invoice.id.substring(0, 10) + '...' : 'N/A'}</td>
                    <td>${hkd ? hkd.name : 'N/A'}</td>
                    <td>${invoice.customerName || 'Khách lẻ'}</td>
                    <td>${invoice.items ? invoice.items.length : 0}</td>
                    <td>${Utils.formatCurrency(invoice.total || 0)}</td>
                    <td>
                        <button class="btn-view" onclick="viewInvoiceDetails('${invoice.id || ''}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        container.innerHTML = invoicesHTML;
        console.log(`✅ Đã hiển thị ${allInvoices.length} hóa đơn`);
        
    } catch (error) {
        console.error('❌ Lỗi khi tạo HTML hóa đơn:', error);
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-invoices">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Lỗi hiển thị hóa đơn</p>
                        <small>${error.message}</small>
                    </div>
                </td>
            </tr>
        `;
    }
}

function filterInvoices() {
    console.log('🔍 Đang lọc hóa đơn...');
    console.log('allInvoices:', allInvoices ? allInvoices.length : 0);
    
    // Lấy giá trị filter
    const hkdId = document.getElementById('invoiceHKD')?.value || '';
    const startDate = document.getElementById('invoiceStartDate')?.value || '';
    const endDate = document.getElementById('invoiceEndDate')?.value || '';
    
    console.log('🎯 Filter criteria:', { 
        hkdId, 
        startDate: startDate || '(none)', 
        endDate: endDate || '(none)' 
    });
    
    // Kiểm tra allInvoices
    if (!allInvoices || !Array.isArray(allInvoices)) {
        console.error('❌ allInvoices không hợp lệ');
        return;
    }
    
    let filtered = [...allInvoices];
    console.log(`📊 Tổng số hóa đơn: ${filtered.length}`);
    
    // Lọc theo HKD - CHI TIẾT LOG
    if (hkdId) {
        const before = filtered.length;
        filtered = filtered.filter(inv => {
            const match = inv && inv.hkdId === hkdId;
            if (!match && inv) {
                console.log(`   ❌ Invoice ${inv.id} - hkdId: ${inv.hkdId} không khớp với ${hkdId}`);
            }
            return match;
        });
        console.log(`📊 Sau khi lọc HKD "${hkdId}": ${before} → ${filtered.length}`);
    }
    
    // Lọc theo ngày
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filtered = filtered.filter(inv => {
            if (!inv || !inv.date) return false;
            return new Date(inv.date) >= start;
        });
    }
    
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(inv => {
            if (!inv || !inv.date) return false;
            return new Date(inv.date) <= end;
        });
    }
    
    console.log(`📊 Kết quả cuối cùng: ${filtered.length} hóa đơn`);
    
    // Hiển thị
    const container = document.getElementById('invoiceList');
    if (!container) {
        console.error('❌ Không tìm thấy container invoiceList');
        return;
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-invoices">
                        <i class="fas fa-search"></i>
                        <p>Không tìm thấy hóa đơn nào</p>
                        ${hkdId ? `<small>Cho HKD: ${allHKDs.find(h => h.id === hkdId)?.name || hkdId}</small>` : ''}
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(invoice => {
        if (!invoice) return '';
        
        const hkd = allHKDs.find(h => h && h.id === invoice.hkdId);
        
        return `
            <tr>
                <td>${Utils.formatDate(invoice.date)}</td>
                <td>${invoice.id ? invoice.id.substring(0, 10) + '...' : 'N/A'}</td>
                <td>${hkd ? hkd.name : 'N/A'}</td>
                <td>${invoice.customerName || 'Khách lẻ'}</td>
                <td>${invoice.items ? invoice.items.length : 0}</td>
                <td>${Utils.formatCurrency(invoice.total || 0)}</td>
                <td>
                    <button class="btn-view" onclick="viewInvoiceDetails('${invoice.id || ''}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    console.log(`✅ Đã hiển thị ${filtered.length} hóa đơn`);
}

async function viewInvoiceDetails(invoiceId) {
    console.log('🔍 Looking for invoice:', invoiceId);
    
    // Đánh dấu invoice đã xem khi mở modal
    markInvoiceAsViewed(invoiceId);
    
    // Tìm trong allInvoices
    let invoice = allInvoices.find(inv => inv.id === invoiceId);
    
    // Nếu không tìm thấy, thử tìm trong IndexedDB
    if (!invoice) {
        console.log('🔍 Invoice not in allInvoices, checking IndexedDB...');
        try {
            invoice = await getFromStore(STORES.INVOICES, invoiceId);
            if (invoice) {
                console.log('✅ Found invoice in IndexedDB');
                // Thêm vào allInvoices để lần sau tìm nhanh hơn
                allInvoices.unshift(invoice);
            }
        } catch (error) {
            console.error('❌ Error loading invoice from IndexedDB:', error);
        }
    }
    
    // Nếu vẫn không tìm thấy
    if (!invoice) {
        Utils.showToast('Không tìm thấy hóa đơn', 'error');
        console.error('❌ Invoice not found:', invoiceId);
        return;
    }
    
    // Tiếp tục xử lý hiển thị...
    const hkd = allHKDs.find(h => h.id === invoice.hkdId);
    
    // Hiển thị chi tiết
    const modal = new bootstrap.Modal(document.getElementById('invoiceDetailModal'));
    
    document.getElementById('invoiceDetailTitle').textContent = `Hóa đơn: ${invoice.id}`;
    document.getElementById('invoiceDetailDate').textContent = Utils.formatDate(invoice.date);
    document.getElementById('invoiceDetailHKD').textContent = hkd ? hkd.name : 'N/A';
    document.getElementById('invoiceDetailCustomer').textContent = invoice.customerName || 'Khách lẻ';
    document.getElementById('invoiceDetailTotal').textContent = Utils.formatCurrency(invoice.total);
    document.getElementById('invoiceDetailStatus').textContent = invoice.status || 'Hoàn thành';
    
    // Hiển thị chi tiết sản phẩm
    const itemsContainer = document.getElementById('invoiceDetailItems');
    if (invoice.items && Array.isArray(invoice.items)) {
        itemsContainer.innerHTML = invoice.items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.quantity}</td>
                <td>${Utils.formatCurrency(item.price)}</td>
                <td>${Utils.formatCurrency(item.price * item.quantity)}</td>
            </tr>
        `).join('');
    } else {
        itemsContainer.innerHTML = '<tr><td colspan="5">Không có sản phẩm</td></tr>';
    }
    
    modal.show();
}



// Import Excel
function showImport() {
    // Cập nhật danh sách HKD cho dropdown
    const select = document.getElementById('importHKD');
    select.innerHTML = '<option value="">Chọn HKD...</option>' +
        allHKDs.map(hkd => `<option value="${hkd.id}">${hkd.name}</option>`).join('');
}

async function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
        Utils.showToast('Chỉ chấp nhận file Excel (.xlsx, .xls, .csv)', 'error');
        return;
    }
    
    Utils.showLoading('Đang đọc file...');
    
    try {
        const data = await readExcelFile(file);
        displayExcelPreview(data);
    } catch (error) {
        console.error('Lỗi đọc file:', error);
        Utils.showToast('Lỗi đọc file Excel', 'error');
    } finally {
        Utils.hideLoading();
        event.target.value = ''; // Reset input
    }
}

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function displayExcelPreview(data) {
    const container = document.getElementById('excelPreview');
    const rows = data.slice(0, 11); // Hiển thị tối đa 10 dòng đầu
    
    container.innerHTML = `
        <h5>Preview (${rows.length - 1} dòng đầu tiên):</h5>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        ${rows[0]?.map((col, idx) => `<th>Cột ${idx + 1}</th>`).join('') || ''}
                    </tr>
                </thead>
                <tbody>
                    ${rows.slice(1).map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // Lưu data tạm thời
    window.excelData = data;
}

async function processExcelImport() {
    const hkdId = document.getElementById('importHKD').value;
    const importMode = document.getElementById('importMode').value;
    
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'error');
        return;
    }
    
    if (!window.excelData || window.excelData.length < 2) {
        Utils.showToast('Không có dữ liệu Excel để import', 'error');
        return;
    }
    
    Utils.showLoading('Đang xử lý dữ liệu...');
    
    try {
        // Parse Excel data
        const products = parseExcelData(window.excelData);
        
        // Lấy HKD info
        const hkd = allHKDs.find(h => h.id === hkdId);
        if (!hkd) throw new Error('Không tìm thấy HKD');
        
        if (importMode === 'replace') {
            // Xóa sản phẩm cũ
            const oldProducts = await getProductsByHKD(hkdId);
            for (const product of oldProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
        }
        
        // Xử lý danh mục
        const categories = {};
        for (const product of products) {
            const categoryName = product.category || 'Khác';
            if (!categories[categoryName]) {
                const categoryId = Utils.generateId();
                categories[categoryName] = {
                    id: categoryId,
                    name: categoryName,
                    hkdId: hkdId,
                    createdAt: new Date().toISOString()
                };
            }
            product.categoryId = categories[categoryName].id;
        }
        
        // Lưu danh mục
        for (const category of Object.values(categories)) {
            await saveCategory(category);
            
            // Thêm vào sync queue
            await addToSyncQueue({
                type: 'categories',
                data: category
            });
        }
        
        // Lưu sản phẩm
        for (const product of products) {
            product.hkdId = hkdId;
            product.lastUpdated = new Date().toISOString();
            
            await saveProduct(product);
            
            // Thêm vào sync queue
            await addToSyncQueue({
                type: 'products',
                data: product
            });
        }
        
        // Reset preview
        document.getElementById('excelPreview').innerHTML = '';
        delete window.excelData;
        
        Utils.showToast(`Đã import ${products.length} sản phẩm cho ${hkd.name}`, 'success');
        
        // Đồng bộ ngay lập tức
        if (navigator.onLine) {
            await forceSync();
        }
        
    } catch (error) {
        console.error('Lỗi import:', error);
        Utils.showToast('Lỗi khi import dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

function parseExcelData(data) {
    // Giả sử cấu trúc: MSP, Tên, DVT, Giá, Tồn kho, Danh mục, Mô tả, Ghi chú
    const rows = data.slice(1); // Bỏ header
    const products = [];
    
    for (const row of rows) {
        if (row.length < 4) continue; // Bỏ hàng không đủ dữ liệu
        
        const product = {
            id: Utils.generateId(),
            msp: row[0]?.toString() || '',
            name: row[1]?.toString() || '',
            unit: row[2]?.toString() || 'cái',
            price: parseFloat(row[3]) || 0,
            stock: parseInt(row[4]) || 0,
            category: row[5]?.toString() || 'Khác',
            description: row[6]?.toString() || '',
            note: row[7]?.toString() || '',
            createdAt: new Date().toISOString()
        };
        
        products.push(product);
    }
    
    return products;
}

// Settings
function showSettings() {
    // Đã có form trong HTML
}

async function changePassword(e) {
    e.preventDefault();
    
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        Utils.showToast('Mật khẩu mới không khớp', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        Utils.showToast('Mật khẩu phải có ít nhất 6 ký tự', 'error');
        return;
    }
    
    try {
        await changeAdminPassword(oldPassword, newPassword);
        
        // Reset form
        e.target.reset();
        
        Utils.showToast('Đã đổi mật khẩu thành công', 'success');
        
    } catch (error) {
        Utils.showToast(error.message, 'error');
    }
}

// Thông báo
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
