// notification-manager.js - Quản lý thông báo hóa đơn mới
let pendingNotifications = [];
let notificationBadge = null;
let notificationPanel = null;

// Khởi tạo Notification Manager
function initNotificationManager() {
    console.log('🔔 Khởi tạo Notification Manager...');
    
    // 1. Tạo badge thông báo
    createNotificationBadge();
    
    // 2. Tạo panel thông báo
    createNotificationPanel();
    
    // 3. Load pending notifications từ localStorage
    loadPendingNotifications();
    
    // 4. Auto-clear notifications cũ sau 24h
    autoClearOldNotifications();
    
    console.log('✅ Notification Manager initialized');
}

// Tạo badge thông báo
function createNotificationBadge() {
    // Kiểm tra đã có chưa
    if (document.getElementById('notificationBadge')) {
        notificationBadge = document.getElementById('notificationBadge');
        return;
    }
    
    // Tạo badge
    const badge = document.createElement('div');
    badge.id = 'notificationBadge';
    badge.className = 'notification-badge';
    badge.innerHTML = `
        <button class="notification-badge-btn" onclick="toggleNotificationPanel()">
            <i class="fas fa-bell"></i>
            <span class="notification-count">0</span>
        </button>
    `;
    
    // Thêm vào header
    const header = document.querySelector('.header-actions') || document.querySelector('header') || document.body;
    header.appendChild(badge);
    
    notificationBadge = badge;
    console.log('✅ Created notification badge');
}

// Tạo panel thông báo
function createNotificationPanel() {
    // Kiểm tra đã có chưa
    if (document.getElementById('notificationPanel')) {
        notificationPanel = document.getElementById('notificationPanel');
        return;
    }
    
    // Tạo panel
    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'notification-panel';
    panel.innerHTML = `
        <div class="notification-header">
            <h4><i class="fas fa-bell"></i> Thông báo mới</h4>
            <button class="notification-close" onclick="toggleNotificationPanel()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="notification-body" id="notificationList">
            <div class="no-notifications">
                <i class="fas fa-bell-slash"></i>
                <p>Không có thông báo mới</p>
            </div>
        </div>
        <div class="notification-footer">
            <button class="btn-mark-all-read" onclick="markAllNotificationsAsRead()">
                <i class="fas fa-check-double"></i> Đánh dấu đã đọc
            </button>
            <button class="btn-clear-all" onclick="clearAllNotifications()">
                <i class="fas fa-trash"></i> Xóa tất cả
            </button>
        </div>
    `;
    
    document.body.appendChild(panel);
    notificationPanel = panel;
    
    // Click outside to close
    document.addEventListener('click', (e) => {
        if (notificationPanel.classList.contains('active') &&
            !notificationPanel.contains(e.target) &&
            !notificationBadge.contains(e.target)) {
            toggleNotificationPanel();
        }
    });
    
    console.log('✅ Created notification panel');
}

// Thêm thông báo mới
function addNewInvoiceNotification(invoice) {
    console.log('🔔 Adding new invoice notification:', invoice.id);
    
    // KIỂM TRA INVOICE HỢP LỆ
    if (!invoice || !invoice.id) {
        console.error('❌ Invalid invoice data');
        return;
    }
    
    const now = Date.now();
    const notification = {
        id: 'notif_' + now,
        invoiceId: invoice.id,
        hkdId: invoice.hkdId,
        hkdName: invoice.hkdName || 'HKD',
        customerName: invoice.customerName || 'Khách lẻ',
        total: invoice.total || 0,
        date: new Date().toISOString(),
        read: false,
        timestamp: now,
        viewed: false,
        viewedAt: null,
        // Lưu toàn bộ dữ liệu invoice
        invoiceData: JSON.parse(JSON.stringify(invoice))
    };
    
    pendingNotifications.unshift(notification);
    
    if (pendingNotifications.length > 50) {
        pendingNotifications = pendingNotifications.slice(0, 50);
    }
    
    try {
        updateNotificationBadge();
        updateNotificationList();
        savePendingNotifications();
    } catch (error) {
        console.error('❌ Error updating notification UI:', error);
    }
    
    try {
        // QUAN TRỌNG: Cập nhật allInvoices ngay lập tức
        updateAllInvoices(invoice);
    } catch (error) {
        console.error('❌ Error updating allInvoices:', error);
    }
    
    try {
        // Hiển thị thông báo
        if (typeof window.showNewInvoiceNotification === 'function') {
            window.showNewInvoiceNotification(invoice);
        } else if (typeof showNewInvoiceNotification === 'function') {
            showNewInvoiceNotification(invoice);
        }
    } catch (error) {
        console.error('❌ Error showing notification:', error);
    }
    
    console.log(`✅ Added notification, total: ${pendingNotifications.length}`);
}

// Hàm cập nhật allInvoices
function updateAllInvoices(invoice) {
    // Kiểm tra nếu đang trong admin context
    if (typeof window.allInvoices !== 'undefined') {
        // Đảm bảo allInvoices là array
        if (!Array.isArray(window.allInvoices)) {
            window.allInvoices = [];
        }
        
        // Kiểm tra invoice đã tồn tại chưa
        const existingIndex = window.allInvoices.findIndex(inv => inv && inv.id === invoice.id);
        
        if (existingIndex === -1) {
            // Thêm vào đầu mảng
            window.allInvoices.unshift(invoice);
            console.log(`📥 Added to allInvoices: ${invoice.id}, total: ${window.allInvoices.length}`);
            
            // Update dashboard nếu đang ở dashboard
            if (typeof window.updateDashboardStats === 'function') {
                setTimeout(() => {
                    try {
                        window.updateDashboardStats();
                    } catch (e) {
                        console.log('updateDashboardStats error:', e.message);
                    }
                }, 100);
            }
            
            // Update invoice list nếu đang ở tab invoices
            if (typeof window.currentAdminView !== 'undefined' && 
                window.currentAdminView === 'invoices' && 
                typeof window.displayInvoices === 'function') {
                setTimeout(() => {
                    try {
                        window.displayInvoices();
                    } catch (e) {
                        console.log('displayInvoices error:', e.message);
                    }
                }, 100);
            }
        } else {
            // Cập nhật invoice nếu đã tồn tại
            window.allInvoices[existingIndex] = invoice;
            console.log(`📤 Updated in allInvoices: ${invoice.id}`);
        }
    } else {
        console.warn('⚠️ allInvoices not available in current context - storing in temporary cache');
        
        // Tạo temporary cache nếu cần
        if (!window.tempInvoicesCache) {
            window.tempInvoicesCache = [];
        }
        
        // Lưu vào cache
        const cacheIndex = window.tempInvoicesCache.findIndex(inv => inv && inv.id === invoice.id);
        if (cacheIndex === -1) {
            window.tempInvoicesCache.unshift(invoice);
            console.log(`📦 Stored in temp cache: ${invoice.id}`);
        }
    }
}

// Cập nhật badge
function updateNotificationBadge() {
    if (!notificationBadge) return;
    
    const unreadCount = pendingNotifications.filter(n => !n.read).length;
    const countElement = notificationBadge.querySelector('.notification-count');
    
    if (countElement) {
        countElement.textContent = unreadCount;
        
        // Hiệu ứng khi có thông báo mới
        if (unreadCount > 0) {
            notificationBadge.classList.add('has-notifications');
            
            // Hiệu ứng nhấp nháy
            if (unreadCount === 1) {
                notificationBadge.classList.add('pulse');
                setTimeout(() => {
                    notificationBadge.classList.remove('pulse');
                }, 3000);
            }
        } else {
            notificationBadge.classList.remove('has-notifications');
        }
    }
}

// Cập nhật danh sách thông báo
function updateNotificationList() {
    if (!notificationPanel) return;
    
    const listContainer = document.getElementById('notificationList');
    if (!listContainer) return;
    
    if (pendingNotifications.length === 0) {
        listContainer.innerHTML = `
            <div class="no-notifications">
                <i class="fas fa-bell-slash"></i>
                <p>Không có thông báo mới</p>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = pendingNotifications.map((notification, index) => {
        // Xác định class trạng thái
        const statusClass = notification.read ? 'read' : 'unread';
        const viewedClass = notification.viewed ? 'viewed' : 'not-viewed';
        const isNewest = index === 0 && !notification.read;
        
        return `
            <div class="notification-item ${statusClass} ${viewedClass} ${isNewest ? 'newest' : ''}" 
                 data-id="${notification.id}"
                 onclick="viewNotificationInvoice('${notification.invoiceId}')"
                 title="${notification.viewed ? 'Đã xem chi tiết' : 'Chưa xem chi tiết'}">
                <div class="notification-icon">
                    <i class="fas ${notification.viewed ? 'fa-file-invoice-dollar' : 
                                     notification.read ? 'fa-receipt' : 'fa-bell'}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">
                        ${notification.read ? 'Hóa đơn mới' : '<strong>HÓA ĐƠN MỚI</strong>'}
                        ${isNewest ? '<span class="new-badge">MỚI</span>' : ''}
                    </div>
                    <div class="notification-message">
                        <strong>${notification.hkdName}</strong> - ${notification.customerName}
                    </div>
                    <div class="notification-details">
                        <span class="notification-time">${formatNotificationTime(notification.date)}</span>
                        <span class="notification-amount">${Utils.formatCurrency(notification.total)}</span>
                    </div>
                    ${!notification.viewed ? '<div class="view-hint">Click để xem chi tiết</div>' : ''}
                </div>
                ${!notification.read ? '<div class="notification-dot"></div>' : ''}
                ${notification.viewed ? '<div class="viewed-checkmark"><i class="fas fa-check-circle"></i></div>' : ''}
            </div>
        `;
    }).join('');
}
// Format thời gian thông báo
function formatNotificationTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    
    return date.toLocaleDateString('vi-VN');
}

// Toggle panel
function toggleNotificationPanel() {
    if (!notificationPanel) return;
    
    notificationPanel.classList.toggle('active');
    
    // Đánh dấu đã đọc khi mở panel
    if (notificationPanel.classList.contains('active')) {
        markNotificationsAsRead();
    }
}

// Xem hóa đơn từ thông báo
async function viewNotificationInvoice(invoiceId) {
    console.log('📋 Viewing invoice from notification:', invoiceId);
    
    // Refresh data trước khi mở
    const refreshed = await refreshInvoiceData();
    if (!refreshed) {
        Utils.showToast('Đang cập nhật dữ liệu...', 'info');
    }
    // Tìm thông báo tương ứng
    const notification = pendingNotifications.find(n => n.invoiceId === invoiceId);
    if (notification) {
        notification.viewed = true;
        notification.viewedAt = new Date().toISOString();
        savePendingNotifications();
        updateNotificationList();
    }
    
    // Đóng panel
    toggleNotificationPanel();
    
    // THÊM: Kiểm tra và tải invoice nếu chưa có trong allInvoices
    let targetInvoice = null;
    
    // Cách 1: Tìm trong allInvoices
    if (typeof window.allInvoices !== 'undefined' && Array.isArray(window.allInvoices)) {
        targetInvoice = window.allInvoices.find(inv => inv && inv.id === invoiceId);
    }
    
    // Cách 2: Nếu không tìm thấy, lấy từ notification data
    if (!targetInvoice && notification && notification.invoiceData) {
        targetInvoice = notification.invoiceData;
        console.log('📄 Using invoice data from notification');
    }
    
    // Cách 3: Tải từ IndexedDB
    if (!targetInvoice) {
        try {
            targetInvoice = await getFromStore(STORES.INVOICES, invoiceId);
            if (targetInvoice) {
                console.log('💾 Loaded invoice from IndexedDB');
            }
        } catch (error) {
            console.error('❌ Error loading invoice:', error);
        }
    }
    
    // Nếu vẫn không tìm thấy, thử tải lại dữ liệu
    if (!targetInvoice) {
        console.warn('⚠️ Invoice not found, attempting to reload...');
        Utils.showToast('Đang tải hóa đơn...', 'info');
        
        // Thử load lại allInvoices
        if (typeof loadAllInvoices === 'function') {
            await loadAllInvoices();
            
            // Tìm lại
            if (window.allInvoices) {
                targetInvoice = window.allInvoices.find(inv => inv && inv.id === invoiceId);
            }
        }
    }
    
    // Nếu tìm thấy invoice
    if (targetInvoice) {
        // Chuyển sang tab invoices
        if (typeof switchAdminView === 'function') {
            switchAdminView('invoices');
        }
        
        // Đợi UI cập nhật
        setTimeout(() => {
            // Set filter theo HKD
            if (targetInvoice.hkdId) {
                const select = document.getElementById('invoiceHKD');
                if (select) {
                    select.value = targetInvoice.hkdId;
                    if (typeof filterInvoices === 'function') {
                        setTimeout(() => filterInvoices(), 100);
                    }
                }
            }
            
            // Mở chi tiết hóa đơn
            if (typeof viewInvoiceDetails === 'function') {
                // Đợi thêm chút để UI sẵn sàng
                setTimeout(() => {
                    viewInvoiceDetails(invoiceId);
                }, 200);
            }
        }, 300);
        
    } else {
        // Invoice không tìm thấy
        Utils.showToast('Không tìm thấy hóa đơn. Vui lòng thử lại.', 'error');
        console.error('❌ Invoice not found:', invoiceId);
    }
}
// Thêm vào notification-manager.js
async function refreshInvoiceData() {
    console.log('🔄 Refreshing invoice data...');
    
    try {
        // Cập nhật allInvoices từ IndexedDB
        if (typeof window.loadAllInvoices === 'function') {
            await window.loadAllInvoices();
            console.log('✅ Refreshed allInvoices');
        }
        
        // Cập nhật UI
        if (typeof window.updateDashboardStats === 'function') {
            window.updateDashboardStats();
        }
        
        if (typeof window.currentAdminView !== 'undefined' && window.currentAdminView === 'invoices') {
            if (typeof window.displayInvoices === 'function') {
                window.displayInvoices();
            }
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error refreshing data:', error);
        return false;
    }
}


// Đánh dấu đã đọc
function markNotificationsAsRead() {
    let updated = false;
    
    pendingNotifications.forEach(notification => {
        if (!notification.read) {
            notification.read = true;
            updated = true;
        }
    });
    
    if (updated) {
        updateNotificationBadge();
        updateNotificationList();
        savePendingNotifications();
    }
}

function markAllNotificationsAsRead() {
    markNotificationsAsRead();
    Utils.showToast('Đã đánh dấu tất cả đã đọc', 'success');
}

// Xóa thông báo
function clearAllNotifications() {
    if (pendingNotifications.length === 0) return;
    
    const confirmed = confirm(`Bạn có chắc muốn xóa ${pendingNotifications.length} thông báo?`);
    if (!confirmed) return;
    
    pendingNotifications = [];
    updateNotificationBadge();
    updateNotificationList();
    savePendingNotifications();
    
    Utils.showToast('Đã xóa tất cả thông báo', 'success');
}

// Lưu/Load từ localStorage
function savePendingNotifications() {
    try {
        localStorage.setItem('pendingNotifications', JSON.stringify(pendingNotifications));
    } catch (error) {
        console.error('❌ Lỗi lưu thông báo:', error);
    }
}

function loadPendingNotifications() {
    try {
        const saved = localStorage.getItem('pendingNotifications');
        if (saved) {
            pendingNotifications = JSON.parse(saved);
            
            // Auto-clear notifications older than 7 days
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            pendingNotifications = pendingNotifications.filter(n => n.timestamp > sevenDaysAgo);
            
            updateNotificationBadge();
            updateNotificationList();
            console.log(`✅ Loaded ${pendingNotifications.length} notifications`);
        }
    } catch (error) {
        console.error('❌ Lỗi load thông báo:', error);
        pendingNotifications = [];
    }
}

// Auto-clear notifications cũ
function autoClearOldNotifications() {
    setInterval(() => {
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        const oldCount = pendingNotifications.length;
        
        pendingNotifications = pendingNotifications.filter(n => n.timestamp > twentyFourHoursAgo);
        
        if (oldCount !== pendingNotifications.length) {
            updateNotificationBadge();
            updateNotificationList();
            savePendingNotifications();
            console.log(`🧹 Auto-cleared ${oldCount - pendingNotifications.length} old notifications`);
        }
    }, 3600000); // Mỗi giờ
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initNotificationManager,
        addNewInvoiceNotification,
        toggleNotificationPanel,
        viewNotificationInvoice,
        markAllNotificationsAsRead,
        clearAllNotifications
    };
}