class AdminCoreManager {
    constructor() {
        this.init();
    }
    
    // admin-core.js - Cập nhật phần init()
async init() {
    // Chỉ chạy trên trang admin.html
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'admin.html') {
        console.log('Not on admin page, skipping admin core initialization');
        return;
    }
    
    // Kiểm tra quyền admin
    if (!this.checkAdminAuth()) {
        console.log('No admin auth found');
        return;
    }
    
    // Khởi tạo giao diện nếu cần
    this.setupEventListeners();
    
    // Load dữ liệu ban đầu
    if (window.adminHkdManager && typeof window.adminHkdManager.loadHKDs === 'function') {
        await window.adminHkdManager.loadHKDs();
    } else {
        setTimeout(() => {
            if (window.adminHkdManager && typeof window.adminHkdManager.loadHKDs === 'function') {
                window.adminHkdManager.loadHKDs();
            }
        }, 500);
    }
    
    // Cập nhật thông tin
    this.updateSystemInfo();

    // Hiện dashboard
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
}
    
    // Kiểm tra quyền admin
    checkAdminAuth() {
        const token = localStorage.getItem('admin_token');
        const loginTime = localStorage.getItem('admin_login_time');
        
        if (token !== 'admin_authenticated') {
            return false;
        }
        
        // Kiểm tra thời gian đăng nhập (24 giờ)
        if (loginTime) {
            const loginDate = new Date(loginTime);
            const now = new Date();
            const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
            
            if (hoursDiff >= 24) {
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_login_time');
                localStorage.removeItem('admin_username');
                window.location.reload();
                return false;
            }
        }
        
        return true;
    }
    
    // Thiết lập các Event Listener chung
    setupEventListeners() {
        // Menu tab switching (chỉ dành cho các tab trong admin.html)
        document.querySelectorAll('.sidebar-menu a[data-tab]').forEach(link => {
            link.addEventListener('click', (e) => {
                const tabId = e.currentTarget.getAttribute('data-tab');
                if (tabId) {
                    e.preventDefault();
                    this.switchTab(tabId);
                }
            });
        });
        
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.handleLogout();
        });
        
        // Clear Cache
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.clearCache();
            });
        }
        
        // Refresh Data
        const refreshDataBtn = document.getElementById('refresh-data-btn');
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => {
                if (window.adminHkdManager && typeof window.adminHkdManager.loadHKDs === 'function') {
                    window.adminHkdManager.loadHKDs();
                }
            });
        }
    }
    
    // Chuyển tab
    switchTab(tabId) {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        // Remove active class from all links
        document.querySelectorAll('.sidebar-menu li').forEach(li => {
            li.classList.remove('active');
        });

        // Add active class to selected tab and link
        const selectedTab = document.getElementById(tabId);
        const selectedLink = document.querySelector(`.sidebar-menu a[data-tab="${tabId}"]`)?.parentNode;
        
        if (selectedTab) {
            selectedTab.classList.add('active');
        }
        if (selectedLink) {
            selectedLink.classList.add('active');
        }
    }

    // Cập nhật thông tin người dùng
    updateSystemInfo() {
        const username = localStorage.getItem('admin_username') || 'Administrator';
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const welcomeUser = document.getElementById('welcome-user');

        if (userAvatar) {
            userAvatar.textContent = username.substring(0, 2).toUpperCase();
        }
        if (userName) {
            userName.textContent = username;
        }
        if (welcomeUser) {
            welcomeUser.textContent = username;
        }
    }
    
    // Xử lý đăng xuất
    handleLogout() {
        window.authManager.logout('admin');
        window.location.reload();
    }
    
    // Xóa cache
    clearCache() {
        if (confirm('Bạn có chắc chắn muốn xóa cache? Thao tác này không thể hoàn tác.')) {
            // Xóa localStorage items liên quan đến admin
            const keys = Object.keys(localStorage);
            let count = 0;
            
            keys.forEach(key => {
                if (key.startsWith('admin_') || key.includes('pending_') || key.includes('temp_')) {
                    localStorage.removeItem(key);
                    count++;
                }
            });
            
            window.utils.showNotification(`Đã xóa ${count} mục trong cache`, 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }
    
    // Hiển thị lỗi
    showError(message) {
        console.error(message);
        window.utils.showNotification(message, 'error');
    }
}

// Khởi tạo khi DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('admin.html') || 
            document.getElementById('dashboard-section')?.style.display !== 'none') {
            window.adminManager = new AdminCoreManager();
        }
    });
} else {
    if (window.location.pathname.includes('admin.html') || 
        document.getElementById('dashboard-section')?.style.display !== 'none') {
        window.adminManager = new AdminCoreManager();
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.AdminCoreManager = AdminCoreManager;
}