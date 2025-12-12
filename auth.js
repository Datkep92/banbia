class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentHKD = null;
        this.currentPage = window.location.pathname.split('/').pop(); // Lấy tên trang hiện tại
        this.initialize();
        console.log('AuthManager initialized - Current page:', this.currentPage);
        
        // Chỉ thiết lập login admin nếu đang ở trang admin.html
        if (this.currentPage === 'admin.html') {
            this.setupAdminLogin();
        }
    }
    
    // KHỞI TẠO LOGIN ADMIN (CHỈ CHO TRANG ADMIN)
    setupAdminLogin() {
        console.log('Setting up admin login for admin.html page');
        
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAdminLogin();
            });
        }
        
        // Password toggle eye
        const toggleBtn = document.querySelector('.toggle-password');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const passwordInput = document.getElementById('password');
                const icon = toggleBtn.querySelector('i');
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                } else {
                    passwordInput.type = 'password';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            });
        }
        
        // Kiểm tra xem đã đăng nhập admin chưa (chỉ cho trang admin)
        if (this.currentPage === 'admin.html') {
            this.checkAdminAuthStatus();
        }
    }
    
    // XỬ LÝ ĐĂNG NHẬP ADMIN
    async handleAdminLogin() {
        console.log('Handling admin login');
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const messageEl = document.getElementById('login-message');
        const loginBtn = document.getElementById('login-btn');
        
        // Validation cơ bản
        if (!username || !password) {
            this.showAdminLoginMessage('Vui lòng nhập tên đăng nhập và mật khẩu', 'error');
            return;
        }
        
        // Disable button và hiển thị loading
        loginBtn.disabled = true;
        const originalHtml = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng nhập...';
        
        try {
            // Kiểm tra thông tin đăng nhập admin
            const isValid = await this.validateAdminCredentials(username, password);
            
            if (isValid) {
                this.successfulAdminLogin(username);
            } else {
                this.showAdminLoginMessage('Tên đăng nhập hoặc mật khẩu không đúng', 'error');
                loginBtn.disabled = false;
                loginBtn.innerHTML = originalHtml;
            }
        } catch (error) {
            console.error('Admin login error:', error);
            this.showAdminLoginMessage('Lỗi hệ thống. Vui lòng thử lại.', 'error');
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalHtml;
        }
    }
    
    // KIỂM TRA CREDENTIALS ADMIN
    async validateAdminCredentials(username, password) {
        // Hiện tại dùng hardcoded credentials
        const adminCredentials = {
            'admin': 'admin123',
            'administrator': 'admin@123'
        };
        
        return adminCredentials[username] === password;
    }
    
    // XỬ LÝ ĐĂNG NHẬP ADMIN THÀNH CÔNG
    successfulAdminLogin(username) {
        console.log('Admin login successful for:', username);
        
        // Lưu thông tin đăng nhập vào localStorage
        localStorage.setItem('admin_token', 'admin_authenticated');
        localStorage.setItem('admin_login_time', new Date().toISOString());
        localStorage.setItem('admin_username', username);
        
        // Hiển thị thông báo thành công
        this.showAdminLoginMessage('Đăng nhập thành công! Đang chuyển hướng...', 'success');
        
        // Chuyển đến dashboard (chỉ trên trang admin.html)
        setTimeout(() => {
            const loginSection = document.getElementById('login-section');
            const dashboardSection = document.getElementById('dashboard-section');
            
            if (loginSection && dashboardSection) {
                loginSection.style.display = 'none';
                dashboardSection.style.display = 'block';
                
                // Khởi tạo admin manager
                if (typeof window.AdminCoreManager !== 'undefined') {
                    window.adminManager = new window.AdminCoreManager();
                }
            } else {
                // Nếu không tìm thấy các section, reload trang
                window.location.reload();
            }
        }, 1000);
    }
    
    // KIỂM TRA TRẠNG THÁI ĐĂNG NHẬP ADMIN
    checkAdminAuthStatus() {
        console.log('Checking admin auth status for page:', this.currentPage);
        
        // Chỉ kiểm tra trên trang admin.html
        if (this.currentPage !== 'admin.html') {
            return false;
        }
        
        const token = localStorage.getItem('admin_token');
        const loginTime = localStorage.getItem('admin_login_time');
        
        if (token === 'admin_authenticated' && loginTime) {
            // Kiểm tra thời gian đăng nhập (24 giờ)
            const loginDate = new Date(loginTime);
            const now = new Date();
            const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
            
            if (hoursDiff < 24) {
                // Đã đăng nhập, tự động hiển thị dashboard
                const loginSection = document.getElementById('login-section');
                const dashboardSection = document.getElementById('dashboard-section');
                
                if (loginSection && dashboardSection) {
                    loginSection.style.display = 'none';
                    dashboardSection.style.display = 'block';
                    console.log('Admin already logged in, showing dashboard');
                    return true;
                }
            } else {
                // Token hết hạn, xóa và yêu cầu đăng nhập lại
                console.log('Admin token expired, clearing...');
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_login_time');
                localStorage.removeItem('admin_username');
            }
        }
        return false;
    }
    
    // HIỂN THỊ THÔNG BÁO ĐĂNG NHẬP ADMIN
    showAdminLoginMessage(message, type = 'info') {
        const messageEl = document.getElementById('login-message');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = 'login-message';
            messageEl.classList.add(type);
            messageEl.style.display = 'block';
        }
    }
    
    // ========== PHẦN HKD - GIỮ NGUYÊN HOẶC CẬP NHẬT ==========
    
    initialize() {
    // Kiểm tra trạng thái HKD trên mọi trang
    this.checkHKDLoginStatus();
    
    // Chỉ check admin status nếu trên trang admin
    if (this.currentPage === 'admin.html') {
        this.checkAdminAuthStatus();
    }
    
    // Setup event listeners based on page
    this.setupPageSpecificEvents();
}

// Thêm hàm mới
setupPageSpecificEvents() {
    // Setup cho trang hkd.html
    if (this.currentPage === 'hkd.html') {
        this.setupHKDLogin();
    }
}

// Setup login cho trang HKD
setupHKDLogin() {
    const loginForm = document.getElementById('hkd-login-form');
    const loginBtn = document.getElementById('hkd-login-btn');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleHKDLoginForm();
        });
    }
    
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            await this.handleHKDLoginForm();
        });
    }
    
    // Kiểm tra nếu đã login thì redirect
    if (this.checkHKDLoginStatus()) {
        console.log('HKD already logged in, redirecting to dashboard');
        // Redirect hoặc show dashboard
        this.showHKDDashboard();
    }
}

// Xử lý form login HKD
async handleHKDLoginForm() {
    const phoneInput = document.getElementById('hkd-phone');
    const passwordInput = document.getElementById('hkd-password');
    
    if (!phoneInput || !passwordInput) {
        console.error('Login form elements not found');
        return;
    }
    
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    
    if (!phone || !password) {
        utils.showNotification('Vui lòng nhập số điện thoại và mật khẩu', 'error');
        return;
    }
    
    const result = await this.loginHKD(phone, password);
    
    if (result.success) {
        // Redirect hoặc show dashboard
        this.showHKDDashboard();
    }
}

// Hiển thị dashboard HKD
showHKDDashboard() {
    const loginSection = document.getElementById('hkd-login-section');
    const dashboardSection = document.getElementById('hkd-dashboard-section');
    
    if (loginSection && dashboardSection) {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        
        // Khởi tạo HKD manager
        setTimeout(() => {
            if (typeof window.HKDManager !== 'undefined') {
                window.hkdManager = new window.HKDManager();
            }
        }, 500);
    }
}
    
    // Cập nhật trạng thái trực tuyến của HKD
    async updateOnlineStatus(isOnline) {
        if (!this.currentHKD || !window.dbManager || typeof window.dbManager.updateHKDOnlineStatus !== 'function') return;

        try {
            await window.dbManager.updateHKDOnlineStatus(this.currentHKD, isOnline); 
        } catch (error) {
            console.error('Error updating online status:', error); 
        }
    }
    
    // Kiểm tra trạng thái đăng nhập HKD (cho tất cả trang)
    checkAuthStatus() {
        try {
            const session = localStorage.getItem('hkd_session');
            
            if (session) {
                const sessionData = JSON.parse(session);
                
                const now = Date.now();
                const sessionDuration = 24 * 60 * 60 * 1000;
                
                if (now - sessionData.timestamp < sessionDuration) {
                    this.currentUser = sessionData;
                    this.currentHKD = sessionData.hkdId;
                    this.updateOnlineStatus(true);
                    return true;
                } else {
                    this.logout('hkd');
                }
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.logout('hkd');
        }
        
        return false;
    }
    async loginHKD(phone, password) {
    try {
        console.log('[HKD Login] Attempting login for:', phone);
        
        if (!window.dbManager || typeof window.dbManager.loginHKD !== 'function') {
            console.error('Database manager not available or loginHKD method missing');
            return { 
                success: false, 
                error: 'Hệ thống chưa sẵn sàng. Vui lòng tải lại trang.' 
            };
        }
        
        utils.showLoading('Đang đăng nhập...');
        
        // Gọi đến database manager
        const result = await window.dbManager.loginHKD(phone, password);
        
        if (result.success) {
            const hkdData = result.data;
            
            // Lưu session vào localStorage
            const sessionData = {
                ...hkdData,
                timestamp: Date.now()
            };
            
            localStorage.setItem('hkd_session', JSON.stringify(sessionData));
            localStorage.setItem('hkd_token', 'authenticated');
            localStorage.setItem('hkd_id', hkdData.hkdId);
            localStorage.setItem('hkd_info', JSON.stringify(hkdData));
            localStorage.setItem('hkd_phone', phone);
            
            this.currentUser = sessionData;
            this.currentHKD = hkdData.hkdId;
            
            // Update online status
            if (typeof window.dbManager.updateHKDOnlineStatus === 'function') {
                await window.dbManager.updateHKDOnlineStatus(hkdData.hkdId, true);
            }
            
            utils.showNotification(`Đăng nhập thành công! Chào mừng ${hkdData.name}`, 'success');
            
            console.log('[HKD Login] Success:', { 
                hkdId: hkdData.hkdId, 
                name: hkdData.name 
            });
            
            return { 
                success: true, 
                data: hkdData 
            };
            
        } else {
            console.error('[HKD Login] Failed:', result.error);
            utils.showNotification(`Đăng nhập thất bại: ${result.error}`, 'error');
            return { 
                success: false, 
                error: result.error 
            };
        }
        
    } catch (error) {
        console.error('[HKD Login] System error:', error);
        return { 
            success: false, 
            error: 'Lỗi hệ thống: ' + error.message 
        };
    } finally {
        utils.hideLoading();
    }
}

// Thêm hàm checkHKDLoginStatus
checkHKDLoginStatus() {
    try {
        const session = localStorage.getItem('hkd_session');
        const token = localStorage.getItem('hkd_token');
        const hkdId = localStorage.getItem('hkd_id');
        
        if (session && token === 'authenticated' && hkdId) {
            const sessionData = JSON.parse(session);
            const now = Date.now();
            const sessionDuration = 24 * 60 * 60 * 1000; // 24 giờ
            
            if (now - sessionData.timestamp < sessionDuration) {
                this.currentUser = sessionData;
                this.currentHKD = hkdId;
                return true;
            } else {
                // Session hết hạn
                this.logout('hkd');
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking HKD login status:', error);
        return false;
    }
}
    // Đăng nhập HKD
    async login(phone, password) {
        try {
            if (!window.dbManager) {
                return { 
                    success: false, 
                    error: 'Hệ thống database chưa sẵn sàng.' 
                };
            }
            
            const result = await window.dbManager.loginHKD(phone, password);
            
            if (result.success) {
                const sessionData = {
                    ...result.data,
                    timestamp: Date.now()
                };
                localStorage.setItem('hkd_session', JSON.stringify(sessionData));
                
                this.currentUser = sessionData;
                this.currentHKD = sessionData.hkdId;
                
                this.updateOnlineStatus(true);
                
                return { success: true, data: result.data };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('Error during login:', error);
            return { success: false, error: 'Đã xảy ra lỗi hệ thống.' };
        }
    }
    
    // auth.js - Cập nhật phần logout()
logout(userType = 'hkd') {
    console.log('Logging out user type:', userType);
    
    if (userType === 'hkd') {
        if (this.currentHKD) {
            this.updateOnlineStatus(false);
        }
        localStorage.removeItem('hkd_session');
        this.currentUser = null;
        this.currentHKD = null;
        
        // KHÔNG reload ở đây nữa, để sự kiện click xử lý
        console.log('HKD logged out successfully');
        
    } else if (userType === 'admin') {
        // Xóa thông tin admin
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_login_time');
        localStorage.removeItem('admin_username');
        
        console.log('Admin logged out successfully');
        
        // Nếu đang ở trang admin, redirect về login
        if (this.currentPage === 'admin.html') {
            // Reload trang để quay về màn hình login
            window.location.reload();
        }
    }
    
}
    
    // Lấy thông tin người dùng hiện tại
    getCurrentUser() {
        return this.currentUser;
    }
    
    // Lấy HKD ID hiện tại
    getCurrentHKD() {
        return this.currentHKD;
    }
    
    // Kiểm tra xem có phải admin không
    isAdmin() {
        return localStorage.getItem('admin_token') === 'admin_authenticated';
    }
    
    // Kiểm tra xem có đang ở trang admin không
    isAdminPage() {
        return this.currentPage === 'admin.html';
    }
}

// Khởi tạo AuthManager toàn cục
let authManager = null;

try {
    authManager = new AuthManager();
    if (typeof window !== 'undefined') {
        window.authManager = authManager;
        window.AuthManager = AuthManager;
    }
    console.log('✅ AuthManager successfully created');
} catch (error) {
    console.error('❌ Failed to create AuthManager:', error);
    // Tạo fallback object
    authManager = {
        checkAuthStatus: () => false,
        login: async () => ({ 
            success: false, 
            error: 'Hệ thống xác thực không khả dụng' 
        }),
        logout: () => {},
        getCurrentUser: () => null,
        getCurrentHKD: () => null,
        isAdmin: () => false,
        isAdminPage: () => false,
        updateOnlineStatus: async () => {}
    };
    if (typeof window !== 'undefined') {
        window.authManager = authManager;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthManager, authManager };
}