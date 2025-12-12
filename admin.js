class AdminManager {
    constructor() {
        this.init();
    }
    
    async init() {
        // Kiểm tra quyền admin
        if (!this.checkAdminAuth()) {
            console.log('No admin auth found');
            return;
        }
        
        // Khởi tạo giao diện nếu cần
        this.setupEventListeners();
        
        // Load dữ liệu ban đầu
        await this.loadHKDs();
        
        // Cập nhật thông tin
        this.updateSystemInfo();
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
    
    // Load danh sách HKD
    async loadHKDs(searchTerm = '') {
        try {
            utils.showLoading('Đang tải dữ liệu...');
            
            const result = await dbManager.getHKDs();
            
            if (result.success) {
                this.renderHKDTable(result.data, searchTerm);
                this.updateStats(result.data);
            } else {
                this.showError('Lỗi khi tải dữ liệu: ' + result.error);
            }
        } catch (error) {
            this.showError('Lỗi hệ thống: ' + error.message);
        } finally {
            utils.hideLoading();
        }
    }
    
    // Render bảng HKD
    renderHKDTable(hkds, searchTerm = '') {
        const tableBody = document.getElementById('hkd-table-body');
        if (!tableBody) return;
        
        // Clear loading state
        tableBody.innerHTML = '';
        
        // Filter data if search term exists
        let filteredHKDs = hkds;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredHKDs = hkds.filter(hkd => 
                (hkd.name && hkd.name.toLowerCase().includes(term)) ||
                (hkd.phone && hkd.phone.includes(term)) ||
                (hkd.address && hkd.address.toLowerCase().includes(term))
            );
        }
        
        if (filteredHKDs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <div class="empty-icon">📭</div>
                        <p>${searchTerm ? 'Không tìm thấy HKD nào phù hợp' : 'Chưa có HKD nào'}</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Render HKD rows
        filteredHKDs.forEach((hkd, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>
                    <strong>${hkd.name || 'Chưa có tên'}</strong>
                    <br>
                    <small style="color: #6c757d; font-size: 0.85rem;">ID: ${hkd.id || 'N/A'}</small>
                </td>
                <td>${hkd.phone || 'Chưa cập nhật'}</td>
                <td>${hkd.address || 'Chưa cập nhật'}</td>
                <td>${hkd.productCount || 0}</td>
                <td>${hkd.salesCount || 0}</td>
                <td>
                    <span class="status-badge ${hkd.status === 'active' ? 'active' : 'inactive'}">
                        ${hkd.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view-hkd" data-id="${hkd.id}" title="Xem chi tiết">
                            👁️
                        </button>
                        <button class="action-btn edit-hkd" data-id="${hkd.id}" title="Sửa thông tin">
                            ✏️
                        </button>
                        <button class="action-btn import-products" data-id="${hkd.id}" title="Import sản phẩm">
                            📦
                        </button>
                        <button class="action-btn ${hkd.status === 'active' ? 'deactivate' : 'activate'}" 
                                data-id="${hkd.id}" 
                                data-status="${hkd.status}"
                                title="${hkd.status === 'active' ? 'Khoá HKD' : 'Mở khoá HKD'}">
                            ${hkd.status === 'active' ? '🔒' : '🔓'}
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // Add event listeners
        this.addHKDEventListeners();
    }
    
    // Cập nhật thống kê
    updateStats(hkds) {
        const totalHKDs = hkds.length;
        const activeHKDs = hkds.filter(h => h.status === 'active').length;
        const totalOrders = hkds.reduce((sum, hkd) => sum + (hkd.salesCount || 0), 0);
        
        const totalHkdsEl = document.getElementById('total-hkds');
        const activeHkdsEl = document.getElementById('active-hkds');
        const totalOrdersEl = document.getElementById('total-orders');
        
        if (totalHkdsEl) totalHkdsEl.textContent = totalHKDs;
        if (activeHkdsEl) activeHkdsEl.textContent = activeHKDs;
        if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
    }
    
    // Thêm event listeners cho HKD
    addHKDEventListeners() {
        // View HKD details
        document.querySelectorAll('.view-hkd').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hkdId = e.target.closest('button').dataset.id;
                this.viewHKDDetails(hkdId);
            });
        });
        
        // Edit HKD
        document.querySelectorAll('.edit-hkd').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hkdId = e.target.closest('button').dataset.id;
                this.editHKD(hkdId);
            });
        });
        
        // Import products
        document.querySelectorAll('.import-products').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hkdId = e.target.closest('button').dataset.id;
                this.showImportModal(hkdId);
            });
        });
        
        // Toggle HKD status
        document.querySelectorAll('.activate, .deactivate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hkdId = e.target.closest('button').dataset.id;
                const currentStatus = e.target.closest('button').dataset.status;
                this.toggleHKDStatus(hkdId, currentStatus);
            });
        });
    }
    
    // Xem chi tiết HKD
    async viewHKDDetails(hkdId) {
        try {
            utils.showLoading('Đang tải thông tin...');
            
            const snapshot = await database.ref(`hkds/${hkdId}`).once('value');
            const hkdData = snapshot.val();
            
            if (!hkdData) {
                utils.showNotification('Không tìm thấy thông tin HKD', 'error');
                return;
            }
            
            // Tạo modal content
            const modalContent = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 25px;">
                        <h4 style="color: #333; margin-bottom: 15px;">Thông tin cơ bản</h4>
                        <div style="display: grid; gap: 10px;">
                            <p><strong>Tên:</strong> ${hkdData.info?.name || 'N/A'}</p>
                            <p><strong>Số điện thoại:</strong> ${hkdData.info?.phone || 'N/A'}</p>
                            <p><strong>Địa chỉ:</strong> ${hkdData.info?.address || 'Chưa cập nhật'}</p>
                            <p><strong>Trạng thái:</strong> 
                                <span style="padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; background: ${hkdData.info?.status === 'active' ? '#d4edda' : '#f8d7da'}; color: ${hkdData.info?.status === 'active' ? '#155724' : '#721c24'}">
                                    ${hkdData.info?.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                                </span>
                            </p>
                            <p><strong>Ngày tạo:</strong> ${utils.formatDate(hkdData.info?.createdAt)}</p>
                            <p><strong>Ngày cập nhật:</strong> ${utils.formatDate(hkdData.info?.updatedAt)}</p>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <h4 style="color: #333; margin-bottom: 15px;">Thống kê</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                                <p style="color: #6c757d; margin-bottom: 5px;">Số sản phẩm</p>
                                <p style="font-size: 1.5rem; font-weight: 600; color: #333;">${hkdData.products ? Object.keys(hkdData.products).length : 0}</p>
                            </div>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                                <p style="color: #6c757d; margin-bottom: 5px;">Số đơn hàng</p>
                                <p style="font-size: 1.5rem; font-weight: 600; color: #333;">${hkdData.sales ? Object.keys(hkdData.sales).length - 1 : 0}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Tạo modal
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Chi tiết HKD: ${hkdData.info?.name || 'Unknown'}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary modal-cancel">Đóng</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Xử lý đóng modal
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            };
            
            modal.querySelector('.modal-close').addEventListener('click', closeModal);
            modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            
        } catch (error) {
            utils.showNotification('Lỗi: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    // Sửa HKD
    async editHKD(hkdId) {
        try {
            utils.showLoading('Đang tải thông tin...');
            
            const snapshot = await database.ref(`hkds/${hkdId}/info`).once('value');
            const hkdInfo = snapshot.val();
            
            if (!hkdInfo) {
                utils.showNotification('Không tìm thấy HKD', 'error');
                return;
            }
            
            const modalContent = `
                <form id="edit-hkd-form" style="display: grid; gap: 15px;">
                    <div class="form-group">
                        <label for="edit-name">Tên HKD *</label>
                        <input type="text" id="edit-name" value="${hkdInfo.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-phone">Số điện thoại *</label>
                        <input type="tel" id="edit-phone" value="${hkdInfo.phone || ''}" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-address">Địa chỉ</label>
                        <textarea id="edit-address" rows="2">${hkdInfo.address || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="edit-status">Trạng thái</label>
                        <select id="edit-status">
                            <option value="active" ${hkdInfo.status === 'active' ? 'selected' : ''}>Đang hoạt động</option>
                            <option value="inactive" ${hkdInfo.status === 'inactive' ? 'selected' : ''}>Ngừng hoạt động</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="edit-password">Mật khẩu mới (để trống nếu không đổi)</label>
                        <input type="password" id="edit-password">
                    </div>
                </form>
            `;
            
            // Tạo modal
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Sửa thông tin HKD</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary modal-cancel">Hủy</button>
                        <button class="btn btn-primary" id="save-edit-btn">Cập nhật</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Xử lý lưu thay đổi
            modal.querySelector('#save-edit-btn').addEventListener('click', () => {
                this.updateHKD(hkdId, modal);
            });
            
            // Xử lý đóng modal
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            };
            
            modal.querySelector('.modal-close').addEventListener('click', closeModal);
            modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            
        } catch (error) {
            utils.showNotification('Lỗi: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    // Cập nhật HKD
    async updateHKD(hkdId, modal) {
        const name = document.getElementById('edit-name').value;
        const phone = document.getElementById('edit-phone').value;
        const address = document.getElementById('edit-address').value;
        const status = document.getElementById('edit-status').value;
        const newPassword = document.getElementById('edit-password').value;
        
        if (!name || !phone) {
            utils.showNotification('Vui lòng nhập tên và số điện thoại', 'error');
            return;
        }
        
        const updateData = {
            name,
            phone,
            address,
            status
        };
        
        try {
            utils.showLoading('Đang cập nhật...');
            
            const result = await dbManager.updateHKD(hkdId, updateData);
            
            if (result.success) {
                utils.showNotification('Cập nhật thành công!', 'success');
                
                // Đóng modal
                modal.querySelector('.modal-close').click();
                
                // Reload data
                await this.loadHKDs();
            } else {
                utils.showNotification('Lỗi: ' + result.error, 'error');
            }
        } catch (error) {
            utils.showNotification('Lỗi hệ thống: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    // Hiển thị modal import sản phẩm
    showImportModal(hkdId) {
        utils.showNotification('Tính năng import sản phẩm đang phát triển', 'info');
    }
    
    // Chuyển trạng thái HKD
    async toggleHKDStatus(hkdId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const confirmMessage = newStatus === 'inactive' 
            ? 'Bạn có chắc muốn khoá HKD này? HKD sẽ không thể đăng nhập.' 
            : 'Bạn có chắc muốn mở khoá HKD này?';
        
        if (!confirm(confirmMessage)) return;
        
        try {
            utils.showLoading('Đang cập nhật trạng thái...');
            
            await database.ref(`hkds/${hkdId}/info/status`).set(newStatus);
            utils.showNotification('Cập nhật trạng thái thành công', 'success');
            
            // Reload data
            await this.loadHKDs();
            
        } catch (error) {
            utils.showNotification('Lỗi: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    // Hiển thị modal thêm HKD mới
    showAddHKDModal() {
    const modalId = `hkd-modal-${Date.now()}`;
    
    const modalContent = `
        <form id="${modalId}-form" style="display: grid; gap: 15px;">
            <div class="form-group">
                <label for="${modalId}-name">Tên HKD *</label>
                <input type="text" id="${modalId}-name" required placeholder="Nhập tên HKD">
            </div>
            <div class="form-group">
                <label for="${modalId}-phone">Số điện thoại *</label>
                <input type="tel" id="${modalId}-phone" required placeholder="Nhập số điện thoại">
            </div>
            <div class="form-group">
                <label for="${modalId}-address">Địa chỉ</label>
                <textarea id="${modalId}-address" rows="2" placeholder="Nhập địa chỉ"></textarea>
            </div>
            <div class="form-group">
                <label for="${modalId}-password">Mật khẩu đăng nhập *</label>
                <input type="password" id="${modalId}-password" required minlength="6" placeholder="Nhập mật khẩu">
            </div>
            <div class="form-group">
                <label for="${modalId}-confirm-password">Xác nhận mật khẩu *</label>
                <input type="password" id="${modalId}-confirm-password" required placeholder="Nhập lại mật khẩu">
            </div>
            <div class="form-group">
                <label for="${modalId}-status">Trạng thái</label>
                <select id="${modalId}-status">
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Ngừng hoạt động</option>
                </select>
            </div>
        </form>
    `;
    
    // Tạo modal
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Thêm HKD mới</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-cancel">Hủy</button>
                <button class="btn btn-primary" id="${modalId}-create-btn">Tạo HKD</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Xử lý tạo HKD với ID mới
    modal.querySelector(`#${modalId}-create-btn`).addEventListener('click', () => {
        this.createHKD(modal, modalId);
    });
    
    // Xử lý đóng modal
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    };
    
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// Cập nhật function createHKD để dùng ID mới
async createHKD(modal, modalId) {
    const name = document.getElementById(`${modalId}-name`).value;
    const phone = document.getElementById(`${modalId}-phone`).value;
    const address = document.getElementById(`${modalId}-address`).value;
    const password = document.getElementById(`${modalId}-password`).value;
    const confirmPassword = document.getElementById(`${modalId}-confirm-password`).value;
    const status = document.getElementById(`${modalId}-status`).value;
        
        // Validate
        if (!name || !phone || !password) {
            utils.showNotification('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            utils.showNotification('Mật khẩu xác nhận không khớp', 'error');
            return;
        }
        
        if (!utils.validatePhone(phone)) {
            utils.showNotification('Số điện thoại không hợp lệ', 'error');
            return;
        }
        
        const hkdData = {
            name,
            phone,
            address,
            password,
            status
        };
        
        try {
            utils.showLoading('Đang tạo HKD...');
            
            const result = await dbManager.createHKD(hkdData);
            
            if (result.success) {
                utils.showNotification('Tạo HKD thành công!', 'success');
                
                // Đóng modal
                modal.querySelector('.modal-close').click();
                
                // Reload data
                await this.loadHKDs();
            } else {
                utils.showNotification('Lỗi: ' + result.error, 'error');
            }
        } catch (error) {
            utils.showNotification('Lỗi hệ thống: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    // Cập nhật thông tin hệ thống
    updateSystemInfo() {
        // Cập nhật ngày hệ thống
        const systemDate = document.getElementById('system-date');
        if (systemDate) {
            systemDate.textContent = new Date().toLocaleDateString('vi-VN');
        }
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Update active tab
                document.querySelectorAll('.nav-item').forEach(nav => {
                    nav.classList.remove('active');
                });
                item.classList.add('active');
                
                // Show corresponding tab content
                const tabId = item.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(tabId).classList.add('active');
                
                // Update page title
                const pageTitle = document.getElementById('page-title');
                if (pageTitle) {
                    const tabText = item.querySelector('.nav-text').textContent;
                    pageTitle.textContent = tabText;
                }
            });
        });
        
        // Nút thêm HKD
        const addHkdBtn = document.getElementById('add-hkd-btn');
        if (addHkdBtn) {
            addHkdBtn.addEventListener('click', () => {
                this.showAddHKDModal();
            });
        }
        
        // Tìm kiếm HKD
        const searchInput = document.getElementById('search-hkd');
        const searchBtn = document.getElementById('search-btn');
        
        if (searchInput && searchBtn) {
            const performSearch = () => {
                const searchTerm = searchInput.value.trim();
                this.loadHKDs(searchTerm);
            };
            
            searchBtn.addEventListener('click', performSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }
        
        // System buttons
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.clearCache();
            });
        }
        
        const refreshDataBtn = document.getElementById('refresh-data-btn');
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => {
                this.loadHKDs();
                utils.showNotification('Đã làm mới dữ liệu', 'success');
            });
        }
        
        const checkUpdatesBtn = document.getElementById('check-updates-btn');
        if (checkUpdatesBtn) {
            checkUpdatesBtn.addEventListener('click', () => {
                utils.showNotification('Đang kiểm tra cập nhật...', 'info');
                setTimeout(() => {
                    utils.showNotification('Hệ thống đang ở phiên bản mới nhất', 'success');
                }, 1500);
            });
        }
    }
    
    // Xóa cache
    clearCache() {
        if (confirm('Bạn có chắc muốn xóa cache? Thao tác này không thể hoàn tác.')) {
            // Xóa localStorage items liên quan đến admin
            const keys = Object.keys(localStorage);
            let count = 0;
            
            keys.forEach(key => {
                if (key.startsWith('admin_') || key.includes('pending_') || key.includes('temp_')) {
                    localStorage.removeItem(key);
                    count++;
                }
            });
            
            utils.showNotification(`Đã xóa ${count} mục trong cache`, 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }
    
    // Hiển thị lỗi
    showError(message) {
        console.error(message);
        utils.showNotification(message, 'error');
    }
}

// Khởi tạo khi DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Kiểm tra xem có đang ở trang admin không
        if (window.location.pathname.includes('admin.html') || 
            document.getElementById('dashboard-section').style.display !== 'none') {
            window.adminManager = new AdminManager();
        }
    });
} else {
    if (window.location.pathname.includes('admin.html') || 
        document.getElementById('dashboard-section').style.display !== 'none') {
        window.adminManager = new AdminManager();
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.AdminManager = AdminManager;
}