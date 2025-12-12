// integrated-manager.js
// File này tích hợp cả ReportManager và ImportManager trong một giao diện admin duy nhất

class IntegratedManager {
    constructor() {
        this.currentTab = 'hkd-list';
        this.reportManager = null;
        this.importManager = null;
        this.hkdManager = null;
        
        this.init();
    }
    
    async init() {
        console.log('IntegratedManager initializing...');
        
        // Kiểm tra admin auth
        if (!this.checkAdminAccess()) {
            console.log('Not logged in, redirecting...');
            return;
        }
        
        // Load các manager
        await this.loadManagers();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial load for HKD tab
        await this.loadHKDData();
        
        console.log('IntegratedManager initialized successfully');
    }
    
    checkAdminAccess() {
        const token = localStorage.getItem('admin_token');
        if (!token || token !== 'admin_authenticated') {
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('dashboard-section').style.display = 'none';
            return false;
        }
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        return true;
    }
    
    async loadManagers() {
        // Initialize HKD Manager
        if (typeof HKDManager !== 'undefined') {
            this.hkdManager = new HKDManager();
            await this.hkdManager.init();
        }
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Tab switching
        document.querySelectorAll('.header-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabId = e.currentTarget.getAttribute('data-tab');
                console.log('Switching to tab:', tabId);
                this.switchTab(tabId);
            });
        });
        
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.logout();
        });
        
        // File upload for import
        const fileInput = document.getElementById('excel-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File selected');
                if (this.importManager) {
                    this.importManager.handleFileUpload(e);
                }
            });
        }
        
        // Start import button
        const startBtn = document.getElementById('start-import');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Start import clicked');
                if (this.importManager) {
                    this.importManager.startImport();
                }
            });
        }
        
        // Cancel import button
        const cancelBtn = document.getElementById('cancel-import');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                console.log('Cancel import clicked');
                if (this.importManager) {
                    this.importManager.resetImport();
                }
            });
        }
        
        // HKD select change (for import)
        const hkdSelect = document.getElementById('hkd-select');
        if (hkdSelect) {
            hkdSelect.addEventListener('change', (e) => {
                console.log('HKD select changed');
                if (this.importManager) {
                    this.importManager.handleHKDSelect(e);
                }
            });
        }
        
        // Download template
        const templateBtn = document.getElementById('download-template');
        if (templateBtn) {
            templateBtn.addEventListener('click', () => {
                console.log('Download template clicked');
                if (this.importManager) {
                    this.importManager.downloadTemplate();
                }
            });
        }
        
        // Report filter button
        const filterBtn = document.getElementById('filter-btn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                console.log('Filter button clicked');
                if (this.reportManager) {
                    this.reportManager.filterSales();
                }
            });
        }
        
        // Export Excel button
        const exportExcelBtn = document.getElementById('export-excel-btn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                console.log('Export Excel clicked');
                if (this.reportManager) {
                    this.reportManager.exportToExcel();
                }
            });
        }
        
        // Export PDF button
        const exportPdfBtn = document.getElementById('export-pdf-btn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                console.log('Export PDF clicked');
                if (this.reportManager) {
                    this.reportManager.exportToPDF();
                }
            });
        }
        
        // Back to all reports button
        const backToAllBtn = document.getElementById('back-to-all-reports');
        if (backToAllBtn) {
            backToAllBtn.addEventListener('click', () => {
                console.log('Back to all reports clicked');
                this.showAllReports();
            });
        }
        
        console.log('Event listeners setup completed');
    }
    
    async switchTab(tabId) {
        console.log('Switching to tab:', tabId);
        this.currentTab = tabId;
        
        // Update UI
        document.querySelectorAll('.header-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`.header-tab[data-tab="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
        
        // Lazy load specific manager when tab is activated
        switch(tabId) {
            case 'reports-section':
                await this.initReportManager();
                break;
            case 'import-section':
                await this.initImportManager();
                break;
            case 'hkd-list':
                await this.loadHKDData();
                break;
        }
    }
    
    async initReportManager() {
        console.log('Initializing ReportManager...');
        if (!this.reportManager) {
            // Create ReportManager instance
            this.reportManager = new ReportManager();
            await this.reportManager.init();
        } else {
            // Refresh data
            await this.reportManager.loadReportData();
        }
    }
    
    async initImportManager() {
        console.log('Initializing ImportManager...');
        if (!this.importManager) {
            // Create ImportManager instance
            this.importManager = new ImportManager();
            await this.importManager.init();
        }
    }
    
    async loadHKDData() {
        console.log('Loading HKD data...');
        if (this.hkdManager) {
            await this.hkdManager.loadHKDs();
        }
    }
    
    // Function to show reports for specific HKD
    showHKDReports(hkdId, hkdName) {
        console.log(`Showing reports for HKD: ${hkdName} (${hkdId})`);
        
        // Switch to reports tab
        this.switchTab('reports-section');
        
        // Initialize report manager if not already
        if (!this.reportManager) {
            this.reportManager = new ReportManager();
        }
        
        // Set HKD info
        this.reportManager.hkdId = hkdId;
        this.reportManager.hkdName = hkdName;
        
        // Update UI
        this.updateReportUI(hkdName);
        
        // Load report data
        setTimeout(() => {
            if (this.reportManager) {
                this.reportManager.loadReportData();
            }
        }, 100);
    }
    
    // Function to show all reports
    showAllReports() {
        console.log('Showing all reports');
        
        if (this.reportManager) {
            this.reportManager.hkdId = null;
            this.reportManager.hkdName = "Toàn bộ HKD";
            this.updateReportUI(null);
            this.reportManager.loadReportData();
        }
    }
    
    // Update report UI elements
    updateReportUI(hkdName) {
        const reportTitleEl = document.getElementById('report-title');
        const hkdNameDisplayEl = document.getElementById('hkd-name-display');
        const backToAllBtn = document.getElementById('back-to-all-reports');
        
        if (reportTitleEl) {
            reportTitleEl.textContent = hkdName ? 
                `Báo cáo HKD: ${hkdName}` : 
                'Báo cáo tổng hợp toàn hệ thống';
        }
        
        if (hkdNameDisplayEl) {
            hkdNameDisplayEl.textContent = hkdName || 'Toàn bộ HKD';
        }
        
        // Show/hide back button
        if (backToAllBtn) {
            backToAllBtn.style.display = hkdName ? 'block' : 'none';
        }
    }
    
    // Handle sale detail view
    showSaleDetail(saleId) {
        console.log('Showing sale detail:', saleId);
        if (this.reportManager) {
            this.reportManager.showSaleDetail(saleId);
        } else {
            window.utils.showNotification('Không tìm thấy chi tiết đơn hàng', 'error');
        }
    }
    
    logout() {
        if (confirm('Bạn có chắc muốn đăng xuất?')) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_username');
            window.location.reload();
        }
    }
}

// ============================================================================
// IMPORT MANAGER
// ============================================================================

class ImportManager {
    constructor() {
        this.products = [];
        this.categories = new Set();
        this.selectedHKD = null;
        this.hkdList = [];
    }
    
    async init() {
        console.log('ImportManager initializing...');
        
        await this.loadHKDs();
        console.log('ImportManager initialized successfully');
    }
    
    async loadHKDs() {
        try {
            console.log('Loading HKDs for import...');
            
            if (!window.dbManager) {
                throw new Error('Database manager not available');
            }
            
            const result = await window.dbManager.getHKDs();
            
            if (result.success) {
                this.hkdList = result.data;
                console.log(`Loaded ${this.hkdList.length} HKDs`);
                this.renderHKDSelect();
            } else {
                console.error('Failed to load HKDs:', result.error);
                utils.showNotification('Lỗi tải danh sách HKD: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error loading HKDs:', error);
            utils.showNotification('Lỗi hệ thống khi tải HKD', 'error');
        }
    }
    
    renderHKDSelect() {
        const select = document.getElementById('hkd-select');
        if (!select) {
            console.error('HKD select element not found');
            return;
        }
        
        select.innerHTML = '<option value="">-- Chọn HKD --</option>';
        
        this.hkdList.forEach(hkd => {
            if (hkd.status === 'active') {
                const option = document.createElement('option');
                option.value = hkd.id;
                option.textContent = `${hkd.name} (${hkd.phone})`;
                option.dataset.hkd = JSON.stringify(hkd);
                select.appendChild(option);
            }
        });
        
        console.log('HKD select rendered with', this.hkdList.length, 'options');
    }
    
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.match(/\.(xlsx|xls)$/)) {
            utils.showNotification('Chỉ chấp nhận file Excel (.xlsx, .xls)', 'error');
            return;
        }
        
        const fileInfo = document.getElementById('file-info');
        if (fileInfo) {
            fileInfo.innerHTML = `
                <i class="fas fa-file-excel"></i> 
                <strong>${file.name}</strong> 
                <span>(${(file.size / 1024).toFixed(1)} KB)</span>
            `;
        }
        
        await this.parseExcelFile(file);
    }
    
    async parseExcelFile(file) {
        try {
            utils.showLoading('Đang đọc file Excel...');
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    this.processExcelData(jsonData);
                } catch (error) {
                    console.error('Error processing Excel:', error);
                    utils.showNotification('Lỗi xử lý file Excel', 'error');
                } finally {
                    utils.hideLoading();
                }
            };
            
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                utils.hideLoading();
                utils.showNotification('Lỗi đọc file Excel', 'error');
            };
            
            reader.readAsArrayBuffer(file);
            
        } catch (error) {
            console.error('Error parsing Excel:', error);
            utils.hideLoading();
            utils.showNotification('Lỗi xử lý file Excel', 'error');
        }
    }
    
    processExcelData(data) {
        this.products = [];
        this.categories.clear();
        
        if (data.length < 2) {
            utils.showNotification('File Excel không có dữ liệu', 'error');
            return;
        }
        
        const headers = data[0];
        console.log('Excel headers:', headers);
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            const stt = row[0];
            const category = row[1]?.toString().trim() || 'Khác';
            const displayName = row[2]?.toString().trim() || '';
            const code = row[3]?.toString().trim() || utils.generateUniqueId('SP');
            const unit = row[4]?.toString().trim() || 'cái';
            const price = parseFloat(row[5]) || 0;
            let total = parseFloat(row[6]) || 0;
            const note = row[7]?.toString().trim() || '';
            const originalName = row[8]?.toString().trim() || displayName;
            const quantity = parseInt(row[9]) || 1;
            
            if (total === 0 && price > 0 && quantity > 0) {
                total = price * quantity;
            }
            
            const product = {
                stt: stt || i,
                category: category,
                displayName: displayName,
                code: code,
                unit: unit,
                price: price,
                total: total,
                note: note,
                originalName: originalName,
                quantity: quantity,
                cost: 0,
                stock: quantity || 100,
                createdAt: Date.now(),
                imported: true
            };
            
            if (product.displayName && product.price > 0) {
                this.products.push(product);
                this.categories.add(product.category);
            }
        }
        
        this.updateStats();
        this.renderPreviewTable();
        utils.showNotification(`Đã đọc ${this.products.length} sản phẩm từ file`, 'success');
    }
    
    updateStats() {
        const totalProductsEl = document.getElementById('total-products');
        const totalCategoriesEl = document.getElementById('total-categories');
        
        if (totalProductsEl) {
            totalProductsEl.textContent = `${this.products.length} sản phẩm`;
        }
        if (totalCategoriesEl) {
            totalCategoriesEl.textContent = `${this.categories.size} danh mục`;
        }
    }
    
    handleHKDSelect(event) {
        const hkdId = event.target.value;
        const hkdInfo = document.getElementById('hkd-info');
        const startBtn = document.getElementById('start-import');
        
        if (hkdId) {
            const option = event.target.querySelector(`option[value="${hkdId}"]`);
            const hkdData = option ? JSON.parse(option.dataset.hkd) : null;
            
            if (hkdData) {
                this.selectedHKD = hkdData;
                this.selectedHKD.id = hkdId;
                
                if (hkdInfo) {
                    hkdInfo.style.display = 'block';
                    document.getElementById('hkd-name').textContent = hkdData.name;
                    document.getElementById('hkd-phone').textContent = hkdData.phone;
                    document.getElementById('hkd-address').textContent = hkdData.address || 'Chưa cập nhật';
                    document.getElementById('hkd-product-count').textContent = hkdData.productCount || 0;
                }
                
                if (startBtn) {
                    startBtn.disabled = false;
                }
                
                console.log('HKD selected:', hkdData.name);
            }
        } else {
            if (hkdInfo) hkdInfo.style.display = 'none';
            if (startBtn) startBtn.disabled = true;
            this.selectedHKD = null;
            console.log('HKD selection cleared');
        }
    }
    
    renderPreviewTable() {
        const tbody = document.getElementById('preview-table-body');
        if (!tbody) {
            console.error('Preview table body not found');
            return;
        }
        
        if (this.products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <div class="empty-icon">📊</div>
                        <p>Không có dữ liệu để hiển thị</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = '';
        
        this.products.forEach((product, index) => {
            const row = document.createElement('tr');
            
            // Generate a color for the category badge
            const colors = ['#007bff', '#28a745', '#17a2b8', '#ffc107', '#dc3545', '#6f42c1', '#20c997', '#fd7e14'];
            const colorIndex = Math.abs(product.category.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length;
            const categoryColor = colors[colorIndex];
            
            row.innerHTML = `
                <td>${product.stt}</td>
                <td>
                    <span class="category-badge" style="
                        background: ${categoryColor};
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 0.85rem;
                        display: inline-block;
                    ">
                        ${product.category}
                    </span>
                </td>
                <td><strong>${product.displayName}</strong></td>
                <td><code>${product.code}</code></td>
                <td>${product.unit}</td>
                <td class="price">${utils.formatCurrency(product.price)}</td>
                <td class="price">${utils.formatCurrency(product.total)}</td>
                <td class="note">${product.note || '-'}</td>
            `;
            tbody.appendChild(row);
        });
        
        console.log('Preview table rendered with', this.products.length, 'products');
    }
    
    async startImport() {
        if (!this.selectedHKD || this.products.length === 0) {
            utils.showNotification('Vui lòng chọn HKD và có dữ liệu sản phẩm', 'error');
            return;
        }
        
        const importMode = document.querySelector('input[name="import-mode"]:checked').value;
        const confirmMessage = importMode === 'replace' 
            ? `Bạn có chắc muốn THAY THẾ toàn bộ ${this.selectedHKD.productCount || 0} sản phẩm hiện có của HKD "${this.selectedHKD.name}" bằng ${this.products.length} sản phẩm mới?`
            : `Bạn có chắc muốn THÊM ${this.products.length} sản phẩm vào HKD "${this.selectedHKD.name}"?`;
        
        if (!confirm(confirmMessage)) {
            console.log('Import cancelled by user');
            return;
        }
        
        try {
            utils.showLoading(`Đang import ${this.products.length} sản phẩm...`);
            
            // Prepare products data
            const formattedProducts = this.products.map(product => {
                const category = product.category && product.category.trim() !== '' 
                    ? product.category 
                    : 'Khác';
                
                let productId = product.code && product.code !== '' 
                    ? product.code.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
                    : 'sp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                
                productId = productId.replace(/\s+/g, '_');
                
                return {
                    id: productId,
                    name: product.displayName || product.originalName || 'Sản phẩm không tên',
                    originalName: product.originalName || product.displayName || '',
                    code: product.code || productId,
                    price: Number(product.price) || 0,
                    cost: Number(product.cost) || 0,
                    category: category,
                    stock: Number(product.stock) || Number(product.quantity) || 100,
                    unit: product.unit || 'cái',
                    barcode: product.code || productId,
                    description: product.note || '',
                    createdAt: product.createdAt || Date.now(),
                    updatedAt: Date.now(),
                    imported: true,
                    importDate: Date.now()
                };
            });
            
            // Get unique categories
            const uniqueCategories = [...new Set(formattedProducts.map(p => p.category))];
            
            // Prepare database updates
            const updates = {};
            
            if (importMode === 'replace') {
                // Replace mode: remove old products
                await database.ref(`hkds/${this.selectedHKD.id}/products`).remove();
                console.log('Removed old products');
                
                // Add new products
                formattedProducts.forEach(product => {
                    updates[`hkds/${this.selectedHKD.id}/products/${product.id}`] = product;
                });
                
                // Update categories
                updates[`hkds/${this.selectedHKD.id}/categories`] = uniqueCategories;
                
            } else {
                // Add mode: add to existing products
                formattedProducts.forEach(product => {
                    updates[`hkds/${this.selectedHKD.id}/products/${product.id}`] = product;
                });
                
                // Get and combine existing categories
                try {
                    const categoriesSnapshot = await database.ref(`hkds/${this.selectedHKD.id}/categories`).once('value');
                    let existingCategories = categoriesSnapshot.val() || [];
                    if (!Array.isArray(existingCategories)) existingCategories = [];
                    
                    const allCategories = [...new Set([...existingCategories, ...uniqueCategories])];
                    updates[`hkds/${this.selectedHKD.id}/categories`] = allCategories;
                } catch (error) {
                    // If categories don't exist, create new
                    updates[`hkds/${this.selectedHKD.id}/categories`] = uniqueCategories;
                }
            }
            
            // Add import info
            updates[`hkds/${this.selectedHKD.id}/lastImport`] = {
                timestamp: Date.now(),
                productCount: formattedProducts.length,
                categoryCount: uniqueCategories.length,
                importedBy: localStorage.getItem('admin_username') || 'Admin',
                mode: importMode
            };
            
            // Execute updates
            console.log('Executing database updates...');
            await database.ref().update(updates);
            
            // Log import history
            await this.logImportHistory(formattedProducts.length, importMode);
            
            utils.showNotification(
                `✅ Import thành công! Đã ${importMode === 'replace' ? 'thay thế' : 'thêm'} ${formattedProducts.length} sản phẩm cho HKD "${this.selectedHKD.name}"`, 
                'success'
            );
            
            console.log('Import completed successfully');
            this.resetImport();
            
            // Refresh HKD list
            if (window.integratedManager && window.integratedManager.hkdManager) {
                window.integratedManager.hkdManager.loadHKDs();
            }
            
        } catch (error) {
            console.error('Import error:', error);
            utils.showNotification(`Lỗi import: ${error.message}`, 'error');
        } finally {
            utils.hideLoading();
        }
    }
    
    async logImportHistory(productCount, mode) {
        try {
            const historyData = {
                timestamp: Date.now(),
                hkdId: this.selectedHKD.id,
                hkdName: this.selectedHKD.name,
                productCount: productCount,
                importedBy: localStorage.getItem('admin_username') || 'Admin',
                mode: mode,
                status: 'success'
            };
            
            const historyRef = database.ref('import_history').push();
            await historyRef.set(historyData);
            
            console.log('Import history logged:', historyData);
            
        } catch (error) {
            console.error('Error logging import history:', error);
        }
    }
    
    resetImport() {
        // Reset file input
        const fileInput = document.getElementById('excel-file');
        if (fileInput) fileInput.value = '';
        
        // Reset file info
        const fileInfo = document.getElementById('file-info');
        if (fileInfo) fileInfo.textContent = 'Chưa có file nào được chọn';
        
        // Reset products
        this.products = [];
        this.categories.clear();
        
        // Reset preview
        this.renderPreviewTable();
        this.updateStats();
        
        // Reset HKD select
        const hkdSelect = document.getElementById('hkd-select');
        if (hkdSelect) hkdSelect.value = '';
        
        // Reset HKD info
        const hkdInfo = document.getElementById('hkd-info');
        if (hkdInfo) hkdInfo.style.display = 'none';
        
        // Reset start button
        const startBtn = document.getElementById('start-import');
        if (startBtn) startBtn.disabled = true;
        
        this.selectedHKD = null;
        
        console.log('Import form reset');
    }
    
    downloadTemplate() {
        try {
            // Sample data for the template
            const sampleData = [
                ['STT', 'Danh mục', 'Tên thường gọi', 'Mã SP', 'Đơn vị tính', 'Đơn giá', 'Thành tiền', 'Ghi chú', 'Tên gốc', 'Số lượng'],
                [1, 'Nước giải khát', 'Coca Cola lon', 'CC330', 'lon', 10000, 10000, '', 'Coca Cola lon 330ml', 50],
                [2, 'Nước giải khát', 'Pepsi chai', 'PEP15', 'chai', 25000, 25000, 'Chai nhựa 1.5L', 'Pepsi chai 1.5L', 30],
                [3, 'Bánh kẹo', 'Bánh Oreo', 'OREO12', 'gói', 30000, 30000, 'Gói 12 cái', 'Bánh Oreo Original 137g', 25],
                [4, 'Sữa', 'Vinamilk', 'VNM180', 'hộp', 8000, 8000, 'Hộp giấy 180ml', 'Sữa tươi Vinamilk có đường 180ml', 40]
            ];
            
            // Create worksheet
            const wsData = XLSX.utils.aoa_to_sheet(sampleData);
            
            // Create workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsData, 'Mẫu sản phẩm');
            
            // Set column widths
            const wscols = [
                {wch: 5},   // STT
                {wch: 20},  // Danh mục
                {wch: 25},  // Tên thường gọi
                {wch: 12},  // Mã SP
                {wch: 10},  // Đơn vị tính
                {wch: 12},  // Đơn giá
                {wch: 12},  // Thành tiền
                {wch: 20},  // Ghi chú
                {wch: 25},  // Tên gốc
                {wch: 10}   // Số lượng
            ];
            wsData['!cols'] = wscols;
            
            // Create filename
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const fileName = `Mau_import_san_pham_${dateStr}.xlsx`;
            
            // Download file
            XLSX.writeFile(wb, fileName);
            
            utils.showNotification(`✅ Đã tải xuống file mẫu: ${fileName}`, 'success');
            
        } catch (error) {
            console.error('Error creating template:', error);
            utils.showNotification('Lỗi tạo file mẫu: ' + error.message, 'error');
        }
    }
}

// ============================================================================
// REPORT MANAGER
// ============================================================================

class ReportManager {
    constructor() {
        this.hkdId = null;
        this.hkdName = "Toàn bộ HKD";
        this.allSales = [];
        this.filteredSales = [];
    }
    
    async init() {
        console.log('ReportManager initializing...');
        
        // Kiểm tra admin auth
        if (!window.authManager?.isAdmin()) {
            window.location.href = 'admin.html';
            return;
        }
        
        this.setupUI();
        await this.loadReportData();
        
        console.log('ReportManager initialized successfully');
    }
    
    setupUI() {
        // Set default date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        
        const startDateEl = document.getElementById('start-date');
        const endDateEl = document.getElementById('end-date');
        
        if (startDateEl) startDateEl.value = startDate.toISOString().split('T')[0];
        if (endDateEl) endDateEl.value = endDate.toISOString().split('T')[0];
        
        console.log('Report UI setup with default date range');
    }
    
    async loadReportData() {
        if (!window.dbManager || !window.utils) {
            console.error("ReportManager: Dependencies (dbManager or utils) not loaded.");
            window.utils?.showNotification('Lỗi hệ thống: Phụ thuộc chưa được tải', 'error');
            return;
        }
        
        try {
            window.utils.showLoading('Đang tải dữ liệu bán hàng...');
            
            console.log(`ReportManager: Loading data for hkdId: ${this.hkdId}`);
            
            // Get sales data
            const result = await window.dbManager.getSalesHistory(this.hkdId);
            
            if (result.success) {
                this.allSales = result.data.sort((a, b) => b.timestamp - a.timestamp);
                console.log(`ReportManager: Loaded ${this.allSales.length} sales records`);
                this.filterSales();
            } else {
                const errorMsg = `Lỗi khi tải dữ liệu báo cáo: ${result.error}`;
                console.error(errorMsg);
                window.utils.showNotification(errorMsg, 'error');
                this.allSales = [];
                this.filterSales();
            }
        } catch (error) {
            const errorMsg = `Lỗi hệ thống trong loadReportData: ${error.message}`;
            console.error(errorMsg, error);
            window.utils.showNotification(errorMsg, 'error');
            this.allSales = [];
            this.filterSales();
        } finally {
            window.utils.hideLoading();
        }
    }
    
    renderReportTable() {
        const tableBody = document.getElementById('report-table-body');
        if (!tableBody) {
            console.error('ReportManager: Cannot find #report-table-body element');
            return;
        }
        
        tableBody.innerHTML = '';
        
        if (this.filteredSales.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-icon">📂</div>
                        <p>Không có đơn hàng nào trong khoảng thời gian đã chọn.</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        console.log(`ReportManager: Rendering ${this.filteredSales.length} sales`);
        
        this.filteredSales.forEach((sale, index) => {
            const row = document.createElement('tr');
            
            // Display HKD ID/Name
            const hkdDisplay = this.hkdId ? 
                `<strong>${this.hkdName}</strong>` : 
                `<strong>${sale.hkdName || 'N/A'}</strong><br><small style="color: #6c757d;">ID: ${sale.hkdId || 'N/A'}</small>`;
            
            // Calculate total amount
            const totalAmount = sale.totalAmount || 0;
            const discount = sale.discount || 0;
            const finalAmount = totalAmount - discount;
            
            // Format date
            let dateDisplay = 'N/A';
            try {
                dateDisplay = window.utils.formatDate(sale.timestamp);
            } catch (dateError) {
                console.warn(`ReportManager: Error formatting date for sale ${sale.id}:`, dateError);
            }
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${hkdDisplay}</td>
                <td>${sale.customerName || 'Khách lẻ'}</td>
                <td>${window.utils.formatCurrency(finalAmount)}</td>
                <td>${dateDisplay}</td>
                <td>
                    <button class="btn-detail" data-sale-id="${sale.id}">
                        <i class="fas fa-info-circle"></i> Chi tiết
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // Add event listeners for detail buttons
        this.setupDetailButtons();
        
        console.log('Report table rendered successfully');
    }
    
    setupDetailButtons() {
        document.querySelectorAll('.btn-detail').forEach(button => {
            button.addEventListener('click', (e) => {
                const saleId = e.currentTarget.getAttribute('data-sale-id');
                this.showSaleDetail(saleId);
            });
        });
    }
    
    filterSales() {
        const startDateStr = document.getElementById('start-date')?.value;
        const endDateStr = document.getElementById('end-date')?.value;
        
        // Handle missing elements or values
        if (!startDateStr || !endDateStr || !this.allSales.length) {
            this.filteredSales = [...this.allSales];
        } else {
            // Convert to timestamp
            const startTime = startDateStr ? new Date(startDateStr).getTime() : 0;
            // Add one day minus 1ms to get to the end of the end date
            const endTime = endDateStr ? new Date(endDateStr).getTime() + (24 * 60 * 60 * 1000) - 1 : Infinity;
            
            this.filteredSales = this.allSales.filter(sale => 
                sale.timestamp >= startTime && sale.timestamp <= endTime
            );
        }
        
        this.renderReportTable();
        this.renderStats();
        
        console.log(`Filter applied: ${this.filteredSales.length} sales match criteria`);
    }
    
    renderStats() {
        const statsContainer = document.getElementById('report-stats-cards');
        if (!statsContainer) return;
        
        const totalSalesCount = this.filteredSales.length;
        // Calculate total revenue after discount
        const totalRevenue = this.filteredSales.reduce((sum, sale) => 
            sum + (sale.totalAmount || 0) - (sale.discount || 0), 0);
        const averageOrder = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;
        
        statsContainer.innerHTML = `
            <div class="stat-card primary">
                <div class="stat-icon"><i class="fas fa-receipt"></i></div>
                <div class="stat-info">
                    <p class="stat-label">Tổng số đơn hàng</p>
                    <p class="stat-value">${totalSalesCount}</p>
                </div>
            </div>
            <div class="stat-card success">
                <div class="stat-icon"><i class="fas fa-hand-holding-usd"></i></div>
                <div class="stat-info">
                    <p class="stat-label">Tổng Doanh Thu</p>
                    <p class="stat-value">${window.utils.formatCurrency(totalRevenue)}</p>
                </div>
            </div>
            <div class="stat-card warning">
                <div class="stat-icon"><i class="fas fa-calculator"></i></div>
                <div class="stat-info">
                    <p class="stat-label">Đơn hàng trung bình</p>
                    <p class="stat-value">${window.utils.formatCurrency(averageOrder)}</p>
                </div>
            </div>
        `;
        
        console.log('Stats rendered:', { totalSalesCount, totalRevenue, averageOrder });
    }
    
    showSaleDetail(saleId) {
        console.log('Showing sale detail for:', saleId);
        const sale = this.allSales.find(s => s.id === saleId);
        if (!sale) {
            window.utils.showNotification('Không tìm thấy chi tiết đơn hàng', 'error');
            return;
        }
        
        // Use new InvoiceDetailManager
        if (typeof window.InvoiceDetailManager !== 'undefined') {
            const invoiceManager = new window.InvoiceDetailManager();
            invoiceManager.showInvoiceDetail(saleId, sale.hkdId);
        } else {
            // Fallback if new file not loaded
            alert('Vui lòng tải lại trang để sử dụng tính năng xem chi tiết mới');
        }
    }
    
    // Export to Excel
    exportToExcel() {
        if (this.filteredSales.length === 0) {
            window.utils.showNotification('Không có dữ liệu để xuất Excel.', 'warning');
            return;
        }
        
        if (typeof window.XLSX === 'undefined') {
            window.utils.showNotification('Lỗi: Cần thư viện XLSX.js để xuất Excel.', 'error');
            return;
        }
        
        window.utils.showLoading('Đang tạo file Excel...');
        
        const wsData = this.filteredSales.map((sale, index) => [
            index + 1,
            sale.id || 'N/A',
            this.hkdId ? this.hkdName : (sale.hkdName || sale.hkdId || 'N/A'),
            sale.customerName || 'Khách lẻ',
            sale.customerPhone || 'N/A',
            sale.totalAmount || 0,
            sale.discount || 0,
            (sale.totalAmount || 0) - (sale.discount || 0),
            window.utils.formatDate(sale.timestamp, true),
            (sale.items && Array.isArray(sale.items)) ? 
                sale.items.map(item => `${item.name} (${item.quantity} x ${window.utils.formatCurrency(item.price)})`).join('; ') : 
                'N/A'
        ]);
        
        const wsHeaders = [
            'STT', 'Mã Đơn hàng', 'HKD', 'Khách hàng', 'SĐT Khách hàng', 
            'Tổng tiền (Chưa giảm)', 'Giảm giá', 'Thành tiền', 'Thời gian', 'Chi tiết Sản phẩm'
        ];
        
        const worksheet = window.XLSX.utils.aoa_to_sheet([wsHeaders, ...wsData]);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, "BaoCaoBanHang");
        
        const fileName = `Bao_cao_Ban_hang${this.hkdId ? `_${this.hkdName.replace(/\s/g, '_')}` : '_TongHop'}_${new Date().toLocaleDateString('en-CA')}.xlsx`;
        window.XLSX.writeFile(workbook, fileName);
        
        window.utils.hideLoading();
        window.utils.showNotification('Xuất Excel thành công!', 'success');
        
        console.log('Excel export completed:', fileName);
    }
    
    // Export to PDF
    exportToPDF() {
        if (this.filteredSales.length === 0) {
            window.utils.showNotification('Không có dữ liệu để xuất PDF.', 'warning');
            return;
        }
        
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            window.utils.showNotification('Lỗi: Cần thư viện jspdf để xuất PDF.', 'error');
            return;
        }
        
        window.utils.showLoading('Đang tạo file PDF...');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        const totalPagesExp = "{total_pages_count_string}";
        
        // Setup header
        doc.setFontSize(18);
        doc.text(`Báo cáo Bán hàng ${this.hkdName}`, 40, 40);
        doc.setFontSize(12);
        
        const startDateEl = document.getElementById('start-date');
        const endDateEl = document.getElementById('end-date');
        const dateRange = `${startDateEl?.value || 'N/A'} - ${endDateEl?.value || 'N/A'}`;
        
        doc.text(`Thời gian: ${dateRange}`, 40, 60);
        
        // Prepare data for AutoTable
        const tableColumn = ["STT", "Mã Đơn", "HKD", "Khách hàng", "Thành tiền", "Ngày tạo"];
        const tableRows = [];
        
        this.filteredSales.forEach((sale, index) => {
            const saleData = [
                index + 1,
                sale.id || 'N/A',
                this.hkdId ? this.hkdName : (sale.hkdName || 'N/A'),
                sale.customerName || 'Khách lẻ',
                window.utils.formatCurrency((sale.totalAmount || 0) - (sale.discount || 0)),
                window.utils.formatDate(sale.timestamp, true)
            ];
            tableRows.push(saleData);
        });
        
        // Setup AutoTable
        if (typeof doc.autoTable !== 'function') {
            window.utils.hideLoading();
            window.utils.showNotification('Lỗi: Cần thư viện jspdf-autotable.', 'error');
            return;
        }
        
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 80,
            headStyles: { fillColor: [15, 52, 96] },
            styles: { fontSize: 8, cellPadding: 8, font: "Arial" },
            margin: { top: 70, bottom: 40, left: 30, right: 30 },
            didDrawPage: function(data) {
                // Footer
                let str = "Trang " + doc.internal.getNumberOfPages()
                if (typeof doc.putTotalPages === 'function') {
                    str = str + " trên " + totalPagesExp;
                }
                doc.setFontSize(10);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });
        
        if (typeof doc.putTotalPages === 'function') {
            doc.putTotalPages(totalPagesExp);
        }
        
        const fileName = `Bao_cao_Ban_hang${this.hkdId ? `_${this.hkdName.replace(/\s/g, '_')}` : '_TongHop'}_${new Date().toLocaleDateString('en-CA')}.pdf`;
        doc.save(fileName);
        
        window.utils.hideLoading();
        window.utils.showNotification('Xuất PDF thành công!', 'success');
        
        console.log('PDF export completed:', fileName);
    }
}

// ============================================================================
// GLOBAL INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing IntegratedManager...');
    
    // Check if we're on admin page
    if (document.getElementById('dashboard-section')) {
        window.integratedManager = new IntegratedManager();
    }
});

// Make classes available globally
if (typeof window !== 'undefined') {
    window.IntegratedManager = IntegratedManager;
    window.ImportManager = ImportManager;
    window.ReportManager = ReportManager;
}