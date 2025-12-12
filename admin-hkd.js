class AdminHKDManager {
    constructor() {
        // Khởi tạo các event listeners liên quan đến HKD list
        this.setupHKDEvents();
    }

    setupHKDEvents() {
        // Search button
        document.getElementById('search-btn')?.addEventListener('click', () => {
            const searchTerm = document.getElementById('hkd-search-input').value.trim();
            this.loadHKDs(searchTerm);
        });

        // Add HKD button
        document.getElementById('add-hkd-btn')?.addEventListener('click', () => {
            this.showCreateHKDModal();
        });
        
        // Search input keypress (Enter)
        document.getElementById('hkd-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('search-btn').click();
            }
        });
    }

    // Load danh sách HKD
    async loadHKDs(searchTerm = '') {
        try {
            window.utils.showLoading('Đang tải dữ liệu HKD...');
            
            // Giả định dbManager.getHKDs() trả về { success: bool, data: array, error: string }
            const result = await window.dbManager.getHKDs();
            
            if (result.success) {
                this.renderHKDTable(result.data, searchTerm);
                this.updateStats(result.data);
            } else {
                window.adminManager.showError('Lỗi khi tải dữ liệu: ' + result.error);
            }
        } catch (error) {
            window.adminManager.showError('Lỗi hệ thống: ' + error.message);
        } finally {
            window.utils.hideLoading();
        }
    }
    
    // Render bảng HKD (Đã thêm nút báo cáo 📊)
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
                        
                        <button class="action-btn report-hkd" data-id="${hkd.id}" title="Xem báo cáo">
                            📊
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

        document.getElementById('total-hkd').textContent = totalHKDs;
        document.getElementById('active-hkd').textContent = activeHKDs;
        document.getElementById('total-orders').textContent = totalOrders;
    }

    // Thêm event listeners cho các nút thao tác trong bảng
    addHKDEventListeners() {
        const tableBody = document.getElementById('hkd-table-body');
        if (!tableBody) return;

        // View Detail
        tableBody.querySelectorAll('.view-hkd').forEach(btn => {
            btn.addEventListener('click', (e) => this.showHKDDetails(e.currentTarget.dataset.id));
        });

        // Edit
        tableBody.querySelectorAll('.edit-hkd').forEach(btn => {
            btn.addEventListener('click', (e) => this.showEditHKDModal(e.currentTarget.dataset.id));
        });
        
        // Import Products
        tableBody.querySelectorAll('.import-products').forEach(btn => {
            btn.addEventListener('click', (e) => this.showImportModal(e.currentTarget.dataset.id));
        });
        
        // Report (NEW)
        tableBody.querySelectorAll('.report-hkd').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleReportClick(e.currentTarget.dataset.id));
        });

        // Activate/Deactivate
        tableBody.querySelectorAll('.deactivate, .activate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status;
                this.toggleHKDStatus(id, status);
            });
        });
    }

    // Handle Report Click (NEW)
    handleReportClick(hkdId) {
        // Chuyển hướng sang trang báo cáo độc lập với tham số HKD ID
        window.location.href = `reports.html?hkdId=${hkdId}`;
    }

    // Hàm showHKDDetails (Đã chuyển từ admin.js cũ)
    async showHKDDetails(hkdId) {
        try {
            window.utils.showLoading('Đang tải chi tiết HKD...');
            // Giả định dbManager có hàm getHKD(id)
            const result = await window.dbManager.getHKD(hkdId);
            
            if (!result.success || !result.data) {
                window.adminManager.showError('Không tìm thấy HKD.');
                return;
            }
            
            const hkdData = result.data;
            const modalId = `detail-modal-${hkdId}`;

            // Xóa modal cũ nếu tồn tại
            document.getElementById(modalId)?.remove();

            // Tạo nội dung modal
            const modalContent = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Chi tiết HKD: ${hkdData.info?.name || 'Unknown'}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>ID:</strong> ${hkdId}</p>
                        <p><strong>Tên HKD:</strong> ${hkdData.info?.name || 'Chưa có tên'}</p>
                        <p><strong>Số điện thoại:</strong> ${hkdData.info?.phone || 'Chưa cập nhật'}</p>
                        <p><strong>Địa chỉ:</strong> ${hkdData.info?.address || 'Chưa cập nhật'}</p>
                        <p><strong>Trạng thái:</strong> <span class="status-badge ${hkdData.info?.status === 'active' ? 'active' : 'inactive'}">${hkdData.info?.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span></p>
                        <hr>
                        <h4 style="margin-top: 20px;">Thống kê nhanh:</h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 10px;">
                            <div style="background: #e9f5ff; padding: 15px; border-radius: 8px;">
                                <p style="color: #6c757d; margin-bottom: 5px;">Số sản phẩm</p>
                                <p style="font-size: 1.5rem; font-weight: 600; color: #333;">${hkdData.products ? Object.keys(hkdData.products).length - 1 : 0}</p>
                            </div>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                                <p style="color: #6c757d; margin-bottom: 5px;">Số đơn hàng</p>
                                <p style="font-size: 1.5rem; font-weight: 600; color: #333;">${hkdData.sales ? Object.keys(hkdData.sales).length - 1 : 0}</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary modal-cancel">Đóng</button>
                    </div>
                </div>
            `;

            // Tạo modal
            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal show';
            modal.innerHTML = modalContent;
            document.body.appendChild(modal);

            // Xử lý đóng modal
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            };
            modal.querySelector('.modal-close').addEventListener('click', closeModal);
            modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });

        } catch (error) {
            window.adminManager.showError('Lỗi khi xem chi tiết: ' + error.message);
        } finally {
            window.utils.hideLoading();
        }
    }

    // Hàm showEditHKDModal (Đã chuyển từ admin.js cũ)
    async showEditHKDModal(hkdId) {
        try {
            window.utils.showLoading('Đang tải thông tin HKD...');
            const result = await window.dbManager.getHKD(hkdId); 

            if (!result.success || !result.data) {
                window.adminManager.showError('Không tìm thấy HKD để sửa.');
                return;
            }

            const hkdInfo = result.data.info;
            const modalId = `edit-modal-${hkdId}`;

            // Xóa modal cũ nếu tồn tại
            document.getElementById(modalId)?.remove();

            // Tạo nội dung modal
            const modalContent = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Sửa HKD: ${hkdInfo?.name || 'Unknown'}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-hkd-form-${hkdId}">
                            <div class="form-group">
                                <label for="edit-name">Tên HKD</label>
                                <input type="text" id="edit-name" value="${hkdInfo?.name || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-phone">Số điện thoại</label>
                                <input type="tel" id="edit-phone" value="${hkdInfo?.phone || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-address">Địa chỉ</label>
                                <input type="text" id="edit-address" value="${hkdInfo?.address || ''}">
                            </div>
                            <div class="form-group">
                                <label for="edit-status">Trạng thái</label>
                                <select id="edit-status">
                                    <option value="active" ${hkdInfo?.status === 'active' ? 'selected' : ''}>Đang hoạt động</option>
                                    <option value="inactive" ${hkdInfo?.status === 'inactive' ? 'selected' : ''}>Ngừng hoạt động</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="edit-password">Mật khẩu mới (Bỏ trống nếu không đổi)</label>
                                <input type="password" id="edit-password" placeholder="******">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary modal-cancel">Hủy</button>
                        <button class="btn btn-primary" id="${modalId}-save-btn">Lưu thay đổi</button>
                    </div>
                </div>
            `;

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal show';
            modal.innerHTML = modalContent;
            document.body.appendChild(modal);

            // Xử lý lưu
            modal.querySelector(`#${modalId}-save-btn`).addEventListener('click', () => {
                this.handleEditHKD(hkdId, modal);
            });

            // Xử lý đóng modal
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            };
            modal.querySelector('.modal-close').addEventListener('click', closeModal);
            modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });

        } catch (error) {
            window.adminManager.showError('Lỗi khi hiển thị modal sửa: ' + error.message);
        } finally {
            window.utils.hideLoading();
        }
    }

    // Hàm handleEditHKD (Đã chuyển từ admin.js cũ)
    async handleEditHKD(hkdId, modal) {
        const name = document.getElementById('edit-name').value;
        const phone = document.getElementById('edit-phone').value;
        const address = document.getElementById('edit-address').value;
        const status = document.getElementById('edit-status').value;
        const newPassword = document.getElementById('edit-password').value;

        if (!name || !phone) {
            window.utils.showNotification('Vui lòng nhập tên và số điện thoại', 'error');
            return;
        }

        const updateData = { name, phone, address, status };
        let passwordUpdated = false;

        try {
            window.utils.showLoading('Đang cập nhật...');
            const result = await window.dbManager.updateHKD(hkdId, updateData); // Giả định có updateHKD
            
            // Xử lý đổi mật khẩu riêng
            if (newPassword) {
                if (newPassword.length < 6) {
                    window.utils.showNotification('Mật khẩu phải có ít nhất 6 ký tự', 'error');
                    window.utils.hideLoading();
                    return;
                }
                // Giả định authManager có updatePassword(id, newPass)
                const passwordResult = await window.authManager.updatePassword(hkdId, newPassword); 
                if (passwordResult.success) {
                    passwordUpdated = true;
                } else {
                    window.utils.showNotification('Lỗi cập nhật mật khẩu: ' + passwordResult.error, 'error');
                }
            }

            if (result.success) {
                window.utils.showNotification('Cập nhật thành công!' + (passwordUpdated ? ' (Đã đổi mật khẩu)' : ''), 'success');
                // Đóng modal
                modal.querySelector('.modal-close').click();
                // Reload data
                await this.loadHKDs();
            } else {
                window.adminManager.showError('Lỗi: ' + result.error);
            }
        } catch (error) {
            window.adminManager.showError('Lỗi hệ thống khi cập nhật: ' + error.message);
        } finally {
            window.utils.hideLoading();
        }
    }

    // Hàm showCreateHKDModal (Đã chuyển từ admin.js cũ)
    async showCreateHKDModal() {
        const modalId = window.utils.generateUniqueId('create-modal');
        // Xóa modal cũ nếu tồn tại
        document.getElementById(modalId)?.remove();

        const modalContent = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Tạo HKD mới</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-hkd-form">
                        <div class="form-group">
                            <label for="create-name">Tên HKD</label>
                            <input type="text" id="create-name" required>
                        </div>
                        <div class="form-group">
                            <label for="create-phone">Số điện thoại (Dùng làm Username)</label>
                            <input type="tel" id="create-phone" required>
                        </div>
                        <div class="form-group">
                            <label for="create-address">Địa chỉ</label>
                            <input type="text" id="create-address">
                        </div>
                        <div class="form-group">
                            <label for="create-password">Mật khẩu</label>
                            <input type="password" id="create-password" required minlength="6">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">Hủy</button>
                    <button class="btn btn-primary" id="${modalId}-create-btn">Tạo HKD</button>
                </div>
            </div>
        `;

        // Tạo modal
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal show';
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);

        // Xử lý tạo HKD với ID mới
        modal.querySelector(`#${modalId}-create-btn`).addEventListener('click', () => {
            this.createHKD(modal);
        });

        // Xử lý đóng modal
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
// Thêm vào class HKDManager trong admin-hkd.js
showReportsForHKD(hkdId, hkdName) {
    // Lưu thông tin HKD vào session để ReportManager sử dụng
    sessionStorage.setItem('selectedHKDId', hkdId);
    sessionStorage.setItem('selectedHKDName', hkdName);
    
    // Chuyển sang tab báo cáo
    if (window.integratedManager) {
        window.integratedManager.switchTab('reports-section');
        
        // Cập nhật ReportManager
        if (window.integratedManager.reportManager) {
            window.integratedManager.reportManager.hkdId = hkdId;
            window.integratedManager.reportManager.hkdName = hkdName;
            
            // Cập nhật UI
            const reportTitleEl = document.getElementById('report-title');
            const hkdNameDisplayEl = document.getElementById('hkd-name-display');
            
            if (reportTitleEl) reportTitleEl.textContent = `Báo cáo HKD: ${hkdName}`;
            if (hkdNameDisplayEl) hkdNameDisplayEl.textContent = hkdName;
            
            // Tải lại dữ liệu
            window.integratedManager.reportManager.loadReportData();
        }
    }
}
// admin-hkd.js - Sửa hàm createHKD
async createHKD(modal) {
    const name = document.getElementById('create-name').value.trim();
    const phone = document.getElementById('create-phone').value.trim();
    const address = document.getElementById('create-address').value.trim();
    const password = document.getElementById('create-password').value;

    // Validation
    if (!name || !phone || !password) {
        window.utils.showNotification('Vui lòng nhập đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    if (password.length < 6) {
        window.utils.showNotification('Mật khẩu phải có ít nhất 6 ký tự', 'error');
        return;
    }
    
    // Validate phone format (basic)
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(phone)) {
        window.utils.showNotification('Số điện thoại phải có 10-11 chữ số', 'error');
        return;
    }

    try {
        window.utils.showLoading('Đang tạo HKD mới...');

        // Use dbManager.createHKD để đảm bảo đồng bộ
        const result = await window.dbManager.createHKD({
            name: name,
            phone: phone,
            address: address,
            password: password,
            status: 'active'
        });

        if (result.success) {
            window.utils.showNotification(`Tạo HKD "${name}" thành công!`, 'success');
            
            // Đóng modal
            if (modal && modal.querySelector('.modal-close')) {
                modal.querySelector('.modal-close').click();
            }
            
            // Reload danh sách HKD
            await this.loadHKDs();
            
            // Log success
            console.log('HKD created successfully:', {
                id: result.id,
                name: name,
                phone: phone
            });
            
        } else {
            window.utils.showNotification(`Lỗi tạo HKD: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('Error in createHKD:', error);
        window.adminManager.showError('Lỗi hệ thống khi tạo HKD: ' + error.message);
    } finally {
        window.utils.hideLoading();
    }
}
// Thêm hàm hash password nhất quán
hashPasswordConsistent(password) {
    try {
        // Sử dụng logic giống database.js
        if (typeof btoa === 'function') { 
            const base64 = btoa(password); 
            return base64.split('').reverse().join('') + '_hashed';
        } else { 
            return password + '_hashed_fallback';
        }
    } catch (e) {
        console.error('Error hashing password:', e);
        return password + '_hashed_error';
    }
}

// Log creation info
logHKDCreation(data) {
    console.group('HKD Creation Log');
    console.log('HKD ID:', data.hkdId);
    console.log('Phone:', data.phone);
    console.log('Name:', data.name);
    console.log('Hashed Password:', data.hashedPassword);
    
    // Kiểm tra lại trong database
    setTimeout(async () => {
        try {
            console.log('Verifying creation...');
            
            // Check phone mapping
            const mapping = await database.ref(`hkds/phone_mapping/${data.phone}`).once('value');
            console.log('Phone mapping exists:', mapping.exists());
            console.log('Phone mapping value:', mapping.val());
            
            // Check auth record
            const auth = await database.ref(`auth/${data.phone}`).once('value');
            console.log('Auth record exists:', auth.exists());
            console.log('Auth data:', auth.val());
            
            // Check HKD info
            const hkd = await database.ref(`hkds/${data.hkdId}/info`).once('value');
            console.log('HKD exists:', hkd.exists());
            console.log('HKD info:', hkd.val());
            
        } catch (error) {
            console.error('Verification error:', error);
        }
        console.groupEnd();
    }, 1000);
}
    // Hàm toggleHKDStatus (Đã chuyển từ admin.js cũ)
    async toggleHKDStatus(hkdId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const actionText = newStatus === 'active' ? 'Mở khoá' : 'Khoá';

        if (!confirm(`Bạn có chắc chắn muốn ${actionText} HKD ID: ${hkdId}?`)) {
            return;
        }

        try {
            window.utils.showLoading(`Đang ${actionText.toLowerCase()} HKD...`);
            
            const result = await window.dbManager.updateHKD(hkdId, { status: newStatus });

            if (result.success) {
                window.utils.showNotification(`${actionText} HKD thành công!`, 'success');
                // Reload data
                await this.loadHKDs();
            } else {
                window.adminManager.showError(`Lỗi khi ${actionText.toLowerCase()} HKD: ` + result.error);
            }
        } catch (error) {
            window.adminManager.showError('Lỗi hệ thống khi cập nhật trạng thái: ' + error.message);
        } finally {
            window.utils.hideLoading();
        }
    }
}

// Khởi tạo HKD Manager
if (window.location.pathname.includes('admin.html') || 
    document.getElementById('dashboard-section')?.style.display !== 'none') {
    // Khởi tạo sau khi DOMContentLoaded trong admin-core.js đã chạy, 
    // đảm bảo window.adminManager có sẵn để gọi showError
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.AdminCoreManager !== 'undefined') {
            window.adminHkdManager = new AdminHKDManager();
        } else {
            console.error('Không tìm thấy AdminCoreManager. Kiểm tra thứ tự load script.');
        }
    });
}

// Export global
if (typeof window !== 'undefined') {
    window.AdminHKDManager = AdminHKDManager;
}