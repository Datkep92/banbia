class DatabaseManager {
    constructor() {
        try {
            // Wait for Firebase to be ready
            if (typeof firebase === 'undefined') {
                console.error("Firebase SDK not loaded!");
                this.db = null;
                this.isInitialized = false;
                return;
            }
            
            // Check if database is initialized
            // Chú ý: Biến 'database' phải được khai báo và gán giá trị ở file firebase-config.js
            if (typeof database === 'undefined' || !database) {
                console.warn("Database not initialized, attempting to initialize...");
                
                // Try to initialize
                if (typeof initFirebase === 'function') {
                    // Giả định initFirebase() trả về database object
                    database = initFirebase();
                }
                
                if (!database) {
                    console.error("Failed to initialize database");
                    this.db = null;
                    this.isInitialized = false;
                    return;
                }
            }
            
            this.db = database;
            this.SYNC_INTERVAL = 30000; // 30 giây
            this.isOnline = navigator.onLine;
            this.isInitialized = true;
            
            console.log("DatabaseManager initialized");
            
            // Wait a bit before initializing sync
            setTimeout(() => {
                this.initSync();
            }, 1000);
            
        } catch (error) {
            console.error("Error during DatabaseManager construction:", error);
        }
    }

    // --- Helper & Logging ---
    log(message) {
        console.log(`database.js: ${message}`);
    }

    error(message, error) {
        console.error(`database.js: ${message}`, error);
    }

    // --- HKD Management (Admin Use) ---
    async getHKDList() {
        try {
            const snapshot = await this.db.ref('hkds').once('value');
            const data = snapshot.val();
            const hkdList = [];
            if (data) {
                for (const id in data) {
                    if (data.hasOwnProperty(id) && data[id].info) {
                        hkdList.push({ id, ...data[id].info });
                    }
                }
            }
            return { success: true, data: hkdList };
        } catch (error) {
            this.error("Error fetching HKD list:", error);
            return { success: false, error: error.message };
        }
    }

    // database.js - Sửa hàm createHKD
async createHKD(hkdData) {
    try {
        console.log('Creating HKD with data:', hkdData);
        
        // Validate required fields
        if (!hkdData.phone || !hkdData.password || !hkdData.name) {
            return { 
                success: false, 
                error: 'Thiếu thông tin bắt buộc (phone, password, name)' 
            };
        }
        
        // Hash password
        const hashedPassword = this.hashPassword(hkdData.password);
        
        // Generate HKD ID
        const hkdId = 'hkd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Create the complete HKD structure
        const hkdStructure = {
            info: {
                id: hkdId,
                name: hkdData.name,
                phone: hkdData.phone,
                address: hkdData.address || '',
                status: hkdData.status || 'active',
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            products: {},
            sales: {
                daily_stats: {}
            },
            categories: ['Khác'],
            settings: {
                taxRate: 0
            }
        };
        
        // Create auth record
        const authRecord = {
            hkd_id: hkdId,
            phone: hkdData.phone,
            password: hashedPassword,
            created_at: Date.now(),
            name: hkdData.name
        };
        
        // Create all updates in one transaction
        const updates = {};
        
        // 1. Add HKD to /hkds
        updates[`hkds/${hkdId}`] = hkdStructure;
        
        // 2. Add auth record
        updates[`auth/${hkdData.phone}`] = authRecord;
        
        // 3. Add phone mapping
        updates[`hkds/phone_mapping/${hkdData.phone}`] = hkdId;
        
        console.log('Applying updates:', updates);
        
        // Apply all updates atomically
        await this.db.ref().update(updates);
        
        console.log('✅ HKD created successfully:', { hkdId, phone: hkdData.phone });
        
        return { 
            success: true, 
            id: hkdId,
            data: hkdStructure.info
        };
        
    } catch (error) {
        console.error('Error creating HKD:', error);
        return { success: false, error: error.message };
    }
}

    async updateHKD(hkdId, updates) {
        // Implement HKD update logic
        try {
            await this.db.ref(`hkds/${hkdId}/info`).update(updates);
            return { success: true };
        } catch (error) {
            this.error(`Error updating HKD ${hkdId}:`, error);
            return { success: false, error: error.message };
        }
    }

    async updateHKDOnlineStatus(hkdId, isOnline) {
        // Update online status
        try {
            await this.db.ref(`hkds/${hkdId}`).update({
                online: isOnline,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            return { success: true };
        } catch (error) {
            this.error(`Error updating HKD ${hkdId} online status:`, error);
            return { success: false, error: error.message };
        }
    }
    
    // --- Product & Category Management ---

    async getProducts(hkdId) {
        // Fetch products for a specific HKD (path: /hkds/{hkdId}/products)
        try {
            const snapshot = await this.db.ref(`hkds/${hkdId}/products`).once('value');
            const data = snapshot.val();
            const productsArray = [];
            if (data) {
                for (const id in data) {
                    if (data.hasOwnProperty(id)) {
                        productsArray.push({ id, ...data[id] });
                    }
                }
            }
            return { success: true, data: productsArray };
        } catch (error) {
            this.error(`Error fetching products for HKD ${hkdId}:`, error);
            return { success: false, error: error.message };
        }
    }
    // database.js - Sửa hàm getCategories
async getCategories(hkdId) {
    try {
        console.log(`[getCategories] Fetching categories for HKD: ${hkdId}`);
        
        // Thử lấy từ node categories riêng trước
        const categoriesSnapshot = await this.db.ref(`hkds/${hkdId}/categories`).once('value');
        const categoriesData = categoriesSnapshot.val();
        
        console.log(`[getCategories] Categories from /hkds/${hkdId}/categories:`, categoriesData);
        
        if (categoriesData && Array.isArray(categoriesData)) {
            return { success: true, data: categoriesData };
        }
        
        // Nếu không có trong node categories, trích xuất từ sản phẩm
        console.log(`[getCategories] No categories node, extracting from products...`);
        const productsSnapshot = await this.db.ref(`hkds/${hkdId}/products`).once('value');
        const products = productsSnapshot.val();
        
        const categoriesSet = new Set(['Khác']);
        
        if (products) {
            Object.values(products).forEach(product => {
                if (product.category && product.category.trim() !== '') {
                    categoriesSet.add(product.category.trim());
                }
            });
        }
        
        const categoriesArray = Array.from(categoriesSet);
        
        // Lưu categories trở lại để lần sau dùng
        if (categoriesArray.length > 0) {
            await this.db.ref(`hkds/${hkdId}/categories`).set(categoriesArray);
            console.log(`[getCategories] Saved extracted categories:`, categoriesArray);
        }
        
        console.log(`[getCategories] Returning categories:`, categoriesArray);
        return { success: true, data: categoriesArray };
        
    } catch (error) {
        console.error(`[getCategories] Error fetching categories for HKD ${hkdId}:`, error);
        return { success: false, error: error.message };
    }
}



async getSalesHistory(hkdId = null) {
    try {
        console.log(`[getSalesHistory] Starting for hkdId: ${hkdId}`);
        
        let allSales = [];
        
        if (hkdId) {
            // Lấy dữ liệu cho 1 HKD cụ thể
            console.log(`[getSalesHistory] Fetching sales for single HKD: ${hkdId}`);
            
            try {
                // Lấy thông tin HKD để có tên
                const hkdSnapshot = await this.db.ref(`hkds/${hkdId}/info`).once('value');
                const hkdInfo = hkdSnapshot.val();
                const hkdName = hkdInfo?.name || `HKD ${hkdId}`;
                
                // Lấy dữ liệu sales từ node /sales tổng hợp
                const salesSnapshot = await this.db.ref(`sales`).orderByChild('hkdId').equalTo(hkdId).once('value');
                
                if (salesSnapshot.exists()) {
                    console.log(`[getSalesHistory] Found sales in root /sales node for HKD ${hkdId}`);
                    
                    salesSnapshot.forEach((childSnapshot) => {
                        const sale = childSnapshot.val();
                        if (sale && sale.hkdId === hkdId) {
                            allSales.push(this.formatSaleForReport(sale, childSnapshot.key, hkdId, hkdName));
                        }
                    });
                    
                } else {
                    console.log(`[getSalesHistory] No sales in root node, checking nested structure for HKD ${hkdId}`);
                    
                    // Lấy từ cấu trúc lồng trong HKD
                    const nestedSnapshot = await this.db.ref(`hkds/${hkdId}/sales`).once('value');
                    
                    if (nestedSnapshot.exists()) {
                        nestedSnapshot.forEach((childSnapshot) => {
                            if (childSnapshot.key !== 'daily_stats') {
                                const sale = childSnapshot.val();
                                if (sale) {
                                    allSales.push(this.formatSaleForReport(sale, childSnapshot.key, hkdId, hkdName));
                                }
                            }
                        });
                    } else {
                        console.log(`[getSalesHistory] No sales found for HKD ${hkdId}`);
                    }
                }
                
            } catch (error) {
                console.error(`[getSalesHistory] Error fetching single HKD data:`, error);
            }
            
        } else {
            // Lấy dữ liệu cho TẤT CẢ HKD
            console.log(`[getSalesHistory] Fetching sales for ALL HKDs`);
            
            try {
                // Lấy từ node /sales tổng hợp
                const salesSnapshot = await this.db.ref(`sales`).once('value');
                
                if (salesSnapshot.exists()) {
                    console.log(`[getSalesHistory] Found ${salesSnapshot.numChildren()} sales in root /sales node`);
                    
                    // Lấy danh sách HKD để map tên
                    const hkdsSnapshot = await this.db.ref('hkds').once('value');
                    const hkdsMap = {};
                    
                    if (hkdsSnapshot.exists()) {
                        hkdsSnapshot.forEach((childSnapshot) => {
                            const hkdId = childSnapshot.key;
                            const hkdData = childSnapshot.val();
                            if (hkdData && hkdData.info) {
                                hkdsMap[hkdId] = hkdData.info.name || `HKD ${hkdId}`;
                            }
                        });
                    }
                    
                    // Xử lý từng sale
                    salesSnapshot.forEach((childSnapshot) => {
                        const sale = childSnapshot.val();
                        if (sale && sale.hkdId) {
                            const saleHkdId = sale.hkdId;
                            const hkdName = hkdsMap[saleHkdId] || `HKD ${saleHkdId}`;
                            
                            allSales.push(this.formatSaleForReport(sale, childSnapshot.key, saleHkdId, hkdName));
                        }
                    });
                    
                } else {
                    console.log(`[getSalesHistory] No sales in root node, checking nested structure in all HKDs`);
                    
                    // Lấy từ cấu trúc lồng trong từng HKD
                    const hkdsSnapshot = await this.db.ref('hkds').once('value');
                    
                    if (hkdsSnapshot.exists()) {
                        hkdsSnapshot.forEach((hkdChildSnapshot) => {
                            const hkdId = hkdChildSnapshot.key;
                            const hkdData = hkdChildSnapshot.val();
                            
                            // Bỏ qua các node không phải HKD
                            if (!hkdData || !hkdData.info || hkdId === 'phone_mapping') return;
                            
                            const hkdName = hkdData.info.name || `HKD ${hkdId}`;
                            
                            // Kiểm tra node sales trong HKD
                            if (hkdData.sales) {
                                for (const saleId in hkdData.sales) {
                                    if (saleId !== 'daily_stats') {
                                        const sale = hkdData.sales[saleId];
                                        if (sale) {
                                            allSales.push(this.formatSaleForReport(sale, saleId, hkdId, hkdName));
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
                
            } catch (error) {
                console.error(`[getSalesHistory] Error fetching all HKDs data:`, error);
                return { success: false, error: error.message };
            }
        }
        
        // Sắp xếp theo thời gian (mới nhất trước)
        allSales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        console.log(`[getSalesHistory] Returned ${allSales.length} sales records`);
        
        if (allSales.length > 0) {
            console.log(`[getSalesHistory] Sample sale:`, allSales[0]);
        }
        
        return { success: true, data: allSales };
        
    } catch (error) {
        console.error('[getSalesHistory] Critical error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Hàm helper để format dữ liệu sale cho báo cáo
 */
formatSaleForReport(sale, saleId, hkdId, hkdName) {
    // DEBUG: Log cấu trúc dữ liệu gốc
    console.log(`[formatSaleForReport] Raw sale data for ${saleId}:`, sale);
    
    // Tìm trường total từ các tên có thể có
    let totalAmount = 0;
    if (sale.totalAmount !== undefined) totalAmount = sale.totalAmount;
    else if (sale.total !== undefined) totalAmount = sale.total;
    else if (sale.amount !== undefined) totalAmount = sale.amount;
    else if (sale.sum !== undefined) totalAmount = sale.sum;
    
    // Tìm trường discount
    let discount = 0;
    if (sale.discount !== undefined) discount = sale.discount;
    else if (sale.discountAmount !== undefined) discount = sale.discountAmount;
    
    // Tìm trường customer
    let customerName = 'Khách lẻ';
    if (sale.customerName !== undefined) customerName = sale.customerName;
    else if (sale.customer !== undefined) customerName = sale.customer;
    else if (sale.client !== undefined) customerName = sale.client;
    else if (sale.clientName !== undefined) customerName = sale.clientName;
    
    // Tìm trường items
    let items = [];
    if (sale.items && Array.isArray(sale.items)) items = sale.items;
    else if (sale.products && Array.isArray(sale.products)) items = sale.products;
    else if (sale.details && Array.isArray(sale.details)) items = sale.details;
    
    // Tìm timestamp
    let timestamp = sale.timestamp || sale.date || sale.createdAt || Date.now();
    
    // Tìm customer phone
    let customerPhone = sale.customerPhone || sale.phone || sale.clientPhone || 'N/A';
    
    const formattedSale = {
        id: saleId,
        timestamp: timestamp,
        totalAmount: totalAmount,
        discount: discount,
        hkdId: hkdId,
        hkdName: hkdName,
        customerName: customerName,
        customerPhone: customerPhone,
        items: items,
        // Giữ nguyên các trường khác để debug
        _rawData: sale
    };
    
    console.log(`[formatSaleForReport] Formatted sale:`, formattedSale);
    return formattedSale;
}
 

    // --- Synchronization & Realtime ---

    initSync() {
        this.syncPendingSales();
        this.autoSync();
        
        // Listen for online/offline status in firebase
        this.db.ref('.info/connected').on('value', (snapshot) => {
            const isConnected = snapshot.val();
            if (isConnected) {
                this.log("✅ Connected to Firebase");
            } else {
                this.log("⚠️ Disconnected from Firebase");
            }
        });
    }

    syncPendingSales() {
        // Logic kiểm tra và đồng bộ hóa các sales đang chờ
        this.log("No pending sales to sync");
    }

    autoSync() {
        // Logic khởi tạo đồng bộ hóa tự động
        this.log("Auto-sync initialized");
    }
    
    getPendingSales() {
        // Trả về các sales đang chờ đồng bộ từ localStorage
        return JSON.parse(localStorage.getItem('pending_sales') || '[]');
    }


// database.js - Tìm hàm hashPassword
hashPassword(password) {
    try {
        // Sử dụng cách hash đơn giản và ổn định (NON-SECURE! Dùng để fix lỗi đăng nhập)
        if (typeof btoa === 'function') { 
            // Mã hóa base64
            const base64 = btoa(password); 
            // Đảo ngược và thêm suffix
            return base64.split('').reverse().join('') + '_hashed';
        } else { 
            // Fallback nếu btoa không có
            return password + '_hashed_fallback';
        }
    } catch (e) {
        console.error('Error hashing password:', e);
        return password + '_hashed_error';
    }
}
    
    // Verification function
    verifyPassword(inputPassword, storedHash) {
        if (!storedHash || typeof storedHash !== 'string' || storedHash.length < 5) return false;
        
        try {
            const inputHash = this.hashPassword(inputPassword);
            return inputHash === storedHash;
        } catch (error) {
            console.error('Error verifying password:', error);
            return false;
        }
    }
    
    // Kiểm tra database có sẵn không
    checkDatabase() {
        if (!this.db || !this.isInitialized) {
            console.warn("Database not available");
            return false;
        }
        return true;
    }
    
   // database.js - Đảm bảo có hàm loginHKD
async loginHKD(phone, password) {
    console.log('[DB] HKD login attempt:', phone);
    
    if (!this.checkDatabase()) {
        return { success: false, error: 'Database not available' };
    }

    try {
        // 1. Tìm trong auth record
        const authSnapshot = await this.db.ref(`auth/${phone}`).once('value');
        
        if (!authSnapshot.exists()) {
            console.log('[DB] No auth at direct path, searching all auth...');
            
            // Tìm trong tất cả auth records
            const allAuthSnapshot = await this.db.ref('auth')
                .orderByChild('phone')
                .equalTo(phone)
                .once('value');
            
            if (!allAuthSnapshot.exists()) {
                return { success: false, error: 'Số điện thoại không tồn tại' };
            }
            
            let authData = null;
            allAuthSnapshot.forEach((childSnapshot) => {
                authData = childSnapshot.val();
                return true; // Dừng sau record đầu tiên
            });
            
            if (!authData) {
                return { success: false, error: 'Không tìm thấy thông tin xác thực' };
            }
            
            // Verify password
            if (!this.verifyPassword(password, authData.password)) {
                return { success: false, error: 'Mật khẩu không đúng' };
            }
            
            const hkdId = authData.hkd_id;
            
            // Get HKD info
            const hkdSnapshot = await this.db.ref(`hkds/${hkdId}/info`).once('value');
            const hkdInfo = hkdSnapshot.val();
            
            if (!hkdInfo) {
                return { success: false, error: 'Không tìm thấy thông tin HKD' };
            }
            
            return { 
                success: true, 
                data: { 
                    ...hkdInfo, 
                    hkdId: hkdId 
                } 
            };
        }
        
        // 2. Nếu có auth record trực tiếp
        const authData = authSnapshot.val();
        const hkdId = authData.hkd_id;
        
        console.log('[DB] Found auth record:', authData);
        
        // Verify password
        if (!this.verifyPassword(password, authData.password)) {
            return { success: false, error: 'Mật khẩu không đúng' };
        }
        
        // Get HKD info
        const hkdSnapshot = await this.db.ref(`hkds/${hkdId}/info`).once('value');
        const hkdInfo = hkdSnapshot.val();
        
        if (!hkdInfo) {
            return { success: false, error: 'Không tìm thấy thông tin HKD' };
        }
        
        console.log('[DB] Login successful:', { hkdId, name: hkdInfo.name });
        
        return { 
            success: true, 
            data: { 
                ...hkdInfo, 
                hkdId: hkdId 
            } 
        };

    } catch (error) {
        console.error('[DB] HKD login error:', error);
        return { success: false, error: 'Lỗi hệ thống: ' + error.message };
    }
}
    


    // Xóa HKD (soft delete)
    async deleteHKD(hkdId) {
        try {
            if (!hkdId) {
                return { success: false, error: 'Thiếu HKD ID' };
            }
            
            await this.db.ref(`hkds/${hkdId}/info/status`).set('inactive');
            console.log(`Deleted HKD: ${hkdId}`);
            return { success: true };
        } catch (error) {
            console.error('Error deleting HKD:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Lấy danh sách HKD
    async getHKDs() {
        try {
            const snapshot = await this.db.ref('hkds').once('value');
            const hkds = [];
            
            snapshot.forEach((childSnapshot) => {
                const hkd = childSnapshot.val();
                const hkdId = childSnapshot.key;
                
                // Skip phone_mapping node
                if (hkd.info && hkdId !== 'phone_mapping') {
                    hkds.push({
                        id: hkdId,
                        ...hkd.info,
                        // Thêm logic tính toán (tạm thời)
                        productCount: hkd.products ? Object.keys(hkd.products).length : 0,
                        salesCount: hkd.sales ? Object.keys(hkd.sales).length - 1 : 0, // -1 for daily_stats
                        lastUpdated: hkd.info.updatedAt || hkd.info.createdAt
                    });
                }
            });
            
            // Sort by creation date (newest first)
            hkds.sort((a, b) => b.createdAt - a.createdAt);
            
            console.log(`Fetched ${hkds.length} HKDs`);
            return { success: true, data: hkds };
        } catch (error) {
            console.error('Error getting HKDs:', error);
            return { success: false, error: error.message };
        }
    }
    
// database.js - Kiểm tra hàm importProducts
async importProducts(hkdId, products) {
    try {
        if (!hkdId || !products || !Array.isArray(products)) {
            return { success: false, error: 'Dữ liệu không hợp lệ' };
        }
        
        const updates = {};
        const categories = new Set();
        
        // Luôn có danh mục "Khác"
        categories.add('Khác');
        
        // 1. Lấy danh mục hiện có
        try {
            const categoriesSnapshot = await this.db.ref(`hkds/${hkdId}/categories`).once('value');
            const existingCategories = categoriesSnapshot.val() || [];
            existingCategories.forEach(cat => categories.add(cat));
        } catch (error) {
            console.log('Không lấy được danh mục hiện có:', error);
        }
        
        // 2. Xử lý từng sản phẩm
        products.forEach((product, index) => {
            // Tạo ID sản phẩm ổn định
            const productId = product.id || utils.generateUniqueId('p');
            
            // Lấy category, mặc định là "Khác" nếu không có
            let category = product.category?.trim() || 'Khác';
            if (category === '') category = 'Khác';
            
            // Thêm danh mục vào Set
            categories.add(category);
            
            // Tạo object sản phẩm đầy đủ
            updates[`products/${productId}`] = {
                id: productId,
                name: product.name || product.displayName || 'Sản phẩm không tên',
                originalName: product.originalName || product.name || product.displayName || '',
                code: product.code || productId,
                price: Number(product.price) || 0,
                cost: Number(product.cost) || 0,
                category: category, // Gán category
                stock: Number(product.stock) || Number(product.quantity) || 100,
                unit: product.unit || 'cái',
                barcode: product.barcode || product.code || '',
                description: product.description || product.note || '',
                createdAt: product.createdAt || Date.now(),
                updatedAt: Date.now(),
                imported: true,
                importDate: Date.now(),
                importBatch: `batch_${Date.now()}`,
                metadata: {
                    originalName: product.originalName || product.name || '',
                    displayName: product.displayName || product.name || '',
                    category: category,
                    importSource: 'excel'
                }
            };
        });
        
        // 3. Cập nhật danh mục (chuyển Set thành Array)
        const categoriesArray = Array.from(categories);
        updates['categories'] = categoriesArray;
        
        // 4. Cập nhật thời gian import
        updates['lastImport'] = {
            timestamp: Date.now(),
            productCount: products.length,
            categoryCount: categoriesArray.length,
            importedBy: 'system'
        };
        
        // 5. Cập nhật products và categories trong một lần
        await this.db.ref(`hkds/${hkdId}`).update(updates);
        
        console.log(`✅ Imported ${products.length} products for HKD: ${hkdId}`);
        console.log(`📂 Categories updated: ${categoriesArray.join(', ')}`);
        
        return { 
            success: true, 
            count: products.length, 
            categories: categoriesArray 
        };
        
    } catch (error) {
        console.error('Error importing products:', error);
        return { success: false, error: error.message };
    }
}
async createSale(hkdId, saleData) {
    if (!this.checkDatabase() || !navigator.onLine) {
        const pendingId = this.savePendingSale(hkdId, saleData);
        return { success: false, error: 'Offline mode - saved locally', saleId: pendingId };
    }

    try {
        // Format items để loại bỏ undefined values
        const formattedItems = saleData.items.map(item => {
            // Tạo object mới chỉ chứa các giá trị không phải undefined
            const cleanItem = {
                product_id: item.product_id,
                code: item.code || item.product_id || '', // Đảm bảo không undefined
                displayName: item.displayName || item.name || '', // Đảm bảo không undefined
                originalName: item.originalName || item.name || '', // Đảm bảo không undefined
                name: item.name || '',
                price: item.price || 0,
                cost: item.cost || 0,
                quantity: item.quantity || 1,
                total: item.total || 0,
                unit: item.unit || 'cái'
            };
            
            // Chỉ thêm metadata nếu có dữ liệu
            if (item.metadata) {
                cleanItem.metadata = {
                    code: item.metadata.code || cleanItem.code,
                    originalName: item.metadata.originalName || cleanItem.originalName,
                    displayName: item.metadata.displayName || cleanItem.displayName
                };
            } else {
                cleanItem.metadata = {
                    code: cleanItem.code,
                    originalName: cleanItem.originalName,
                    displayName: cleanItem.displayName
                };
            }
            
            return cleanItem;
        });
        
        const saleRecord = {
            id: utils.generateUniqueId('sale'),
            items: formattedItems,
            subtotal: saleData.subtotal || 0,
            discount: saleData.discount || 0,
            tax: saleData.tax || 0,
            total: saleData.total || 0,
            customer: saleData.customer || 'Khách vãng lai',
            paymentMethod: saleData.paymentMethod || 'cash',
            timestamp: Date.now(),
            synced: true,
            hkdId: hkdId,
            hkdName: saleData.hkdName || 'HKD'
        };
        
        // 1. Kiểm tra tồn kho
        const stockCheck = await this.checkStockBeforeSale(hkdId, saleData.items);
        if (!stockCheck.success) {
            return stockCheck; 
        }

        // 2. Cập nhật tồn kho
        await this.updateStockAfterSale(hkdId, saleData.items);

        // 3. Lưu giao dịch
        const newSaleRef = this.db.ref(`hkds/${hkdId}/sales`).push();
        await newSaleRef.set(saleRecord);
        
        // 4. Cập nhật thống kê
        this.updateDailyStats(hkdId, saleRecord);

        // 5. Lưu vào node tổng hợp để báo cáo admin
        await this.db.ref(`sales/${newSaleRef.key}`).set({
            ...saleRecord,
            saleId: newSaleRef.key
        });

        return { success: true, data: { saleId: newSaleRef.key } };
    } catch (error) {
        console.error('Error creating sale online:', error);
        const pendingId = this.savePendingSale(hkdId, saleData);
        return { success: false, error: 'Lỗi ghi dữ liệu. Đã lưu offline.', saleId: pendingId };
    }
}
    
    // Lưu giao dịch chờ đồng bộ (local storage)
savePendingSale(hkdId, saleData) {
    try {
        const pendingSales = JSON.parse(localStorage.getItem('pending_sales')) || [];
        
        // Format items để loại bỏ undefined
        const formattedItems = saleData.items.map(item => ({
            product_id: item.product_id || '',
            code: item.code || item.product_id || '',
            displayName: item.displayName || item.name || '',
            originalName: item.originalName || item.name || '',
            name: item.name || '',
            price: item.price || 0,
            cost: item.cost || 0,
            quantity: item.quantity || 1,
            total: item.total || 0,
            unit: item.unit || 'cái',
            metadata: {
                code: item.metadata?.code || item.code || item.product_id || '',
                originalName: item.metadata?.originalName || item.originalName || item.name || '',
                displayName: item.metadata?.displayName || item.displayName || item.name || ''
            }
        }));
        
        const offlineSale = {
            id: utils.generateUniqueId('offline_sale'), 
            hkdId: hkdId,
            timestamp: Date.now(),
            items: formattedItems,
            subtotal: saleData.subtotal || 0,
            discount: saleData.discount || 0,
            tax: saleData.tax || 0,
            total: saleData.total || 0,
            customer: saleData.customer || 'Khách vãng lai',
            paymentMethod: saleData.paymentMethod || 'cash',
            synced: false
        };
        
        pendingSales.push(offlineSale);
        localStorage.setItem('pending_sales', JSON.stringify(pendingSales));
        
        console.log('Sale saved offline:', offlineSale.id);
        return offlineSale.id;
    } catch (error) {
        console.error('Error saving pending sale:', error);
        return Date.now().toString();
    }
}

    // Kiểm tra tồn kho trước khi bán
    async checkStockBeforeSale(hkdId, items) {
        try {
            const snapshot = await this.db.ref(`hkds/${hkdId}/products`).once('value');
            const products = snapshot.val() || {};
            
            for (const item of items) {
                const productId = item.product_id;
                
                // KIỂM TRA ID TẠM THỜI (FIX LỖI 2)
                if (productId.startsWith('temp_') || productId.startsWith('draft_')) {
                    // Nếu sản phẩm là tạm thời, coi như không tồn tại để skip sync (chỉ áp dụng cho sync, không phải create online)
                    // Hoặc coi như không cần kiểm tra stock (tùy vào logic kinh doanh)
                    // Chọn cách: Báo lỗi để giao dịch này bị skip/dọn dẹp
                    return { 
                        success: false, 
                        error: `Sản phẩm tạm thời "${productId}" không hợp lệ cho giao dịch.` 
                    }; 
                }
                
                const product = products[productId];
                
                if (!product) {
                    return { success: false, error: `Sản phẩm ${productId} không tồn tại` };
                }
                if (product.stock < item.quantity) {
                    return { success: false, error: `Sản phẩm "${product.name}" chỉ còn ${product.stock} trong kho` };
                }
            }
            return { success: true };
        } catch (error) {
            console.error('Error checking stock:', error);
            return { success: false, error: 'Lỗi kiểm tra tồn kho' };
        }
    }

    // Cập nhật stock sau khi bán
    async updateStockAfterSale(hkdId, items) {
        try {
            const updates = {};
            const snapshot = await this.db.ref(`hkds/${hkdId}/products`).once('value');
            const products = snapshot.val() || {};
            items.forEach(item => {
                const productId = item.product_id;
                
                // BỎ QUA ID TẠM THỜI NẾU LỌT VÀO ĐÂY
                if (productId.startsWith('temp_') || productId.startsWith('draft_')) {
                    return;
                }
                
                const product = products[productId];
                if (product) {
                    const newStock = Math.max(0, (product.stock || 0) - item.quantity);
                    updates[`products/${productId}/stock`] = newStock;
                    updates[`products/${productId}/updatedAt`] = Date.now();
                }
            });
            
            if (Object.keys(updates).length > 0) {
                await this.db.ref(`hkds/${hkdId}`).update(updates);
            }
            return { success: true };
        } catch (error) {
            console.error('Error updating stock:', error);
            return { success: false, error: 'Lỗi cập nhật tồn kho' };
        }
    }



    // Lấy thống kê doanh thu
    async getRevenueStats(hkdId, days = 30) {
        try {
            if (!hkdId) {
                return { success: false, error: 'Thiếu HKD ID' };
            }
            
            const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            // Lấy toàn bộ sales (hoặc dùng query nếu đã thêm indexOn)
            const snapshot = await this.db.ref(`hkds/${hkdId}/sales`).once('value');
            
            let totalRevenue = 0;
            let totalOrders = 0;
            const dailyStats = {};
            const monthlyStats = {};
            
            snapshot.forEach((childSnapshot) => {
                const sale = childSnapshot.val();
                if (sale.total && childSnapshot.key !== 'daily_stats' && sale.timestamp >= cutoffDate) {
                    totalRevenue += sale.total;
                    totalOrders++;
                    
                    // Daily stats
                    const date = new Date(sale.timestamp).toLocaleDateString('vi-VN');
                    dailyStats[date] = (dailyStats[date] || 0) + sale.total;
                    
                    // Monthly stats
                    const month = new Date(sale.timestamp).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                    monthlyStats[month] = (monthlyStats[month] || 0) + sale.total;
                }
            });

            return { 
                success: true, 
                data: { 
                    totalRevenue, 
                    totalOrders, 
                    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0, 
                    dailyStats, 
                    monthlyStats, 
                    period: `${days} ngày gần nhất`
                } 
            };
        } catch (error) {
            console.error('Error getting revenue stats:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Cập nhật thống kê hàng ngày
    async updateDailyStats(hkdId, saleRecord) {
        try {
            const today = new Date().toLocaleDateString('vi-VN');
            const dailyStatsRef = this.db.ref(`hkds/${hkdId}/sales/daily_stats/${today}`);
            
            await dailyStatsRef.transaction((currentData) => {
                if (currentData === null) {
                    return {
                        revenue: saleRecord.total,
                        orders: 1,
                        updatedAt: Date.now()
                    };
                } else {
                    currentData.revenue += saleRecord.total;
                    currentData.orders += 1;
                    currentData.updatedAt = Date.now();
                    return currentData;
                }
            });
        } catch (error) {
            console.error('Error updating daily stats:', error);
        }
    }
// database.js - Thêm vào class DatabaseManager

async importProductsToHKD(hkdId, products) {
    try {
        if (!hkdId || !products || !Array.isArray(products)) {
            return { success: false, error: 'Dữ liệu không hợp lệ' };
        }
        
        const updates = {};
        const categories = new Set();
        
        // Prepare products data
        products.forEach(product => {
            const productId = product.id || utils.generateUniqueId('p');
            updates[`products/${productId}`] = {
                id: productId,
                name: product.name || 'Sản phẩm không tên',
                price: Number(product.price) || 0,
                cost: Number(product.cost) || 0,
                category: product.category || 'Khác',
                stock: Number(product.stock) || 100,
                unit: product.unit || 'cái',
                barcode: product.barcode || '',
                description: product.description || '',
                createdAt: product.createdAt || Date.now(),
                updatedAt: Date.now(),
                imported: true
            };
            
            categories.add(product.category || 'Khác');
        });
        
        // Update categories
        updates['categories'] = Array.from(categories);
        
        // Apply updates
        await this.db.ref(`hkds/${hkdId}`).update(updates);
        
        console.log(`Imported ${products.length} products to HKD: ${hkdId}`);
        return { success: true, count: products.length };
        
    } catch (error) {
        console.error('Error importing products:', error);
        return { success: false, error: error.message };
    }
}
    // ==================== ĐỒNG BỘ OFFLINE ====================


    
    // Dọn dẹp những giao dịch đã đồng bộ
    cleanupSyncedSales() {
        try {
            let pendingSales = JSON.parse(localStorage.getItem('pending_sales')) || [];
            const remainingSales = pendingSales.filter(sale => !sale.synced);
            localStorage.setItem('pending_sales', JSON.stringify(remainingSales));
        } catch (error) {
            console.error('Error cleaning up synced sales:', error);
        }
    }
    

    
    // Kích hoạt sync ngay lập tức
    triggerSync() {
        if (navigator.onLine) {
            this.syncPendingSales();
        }
    }

    // Kiểm tra kết nối database
    async testConnection() {
        try {
            const testRef = this.db.ref('.info/connected');
            return new Promise((resolve) => {
                testRef.once('value')
                .then(() => resolve(true))
                .catch(() => resolve(false));
            });
        } catch (error) {
            return false;
        }
    }
    
    // Clean up
    destroy() {
        // Clean up any listeners if needed
        console.log('DatabaseManager destroyed');
    }
}

// Tạo instance toàn cục với error handling
let dbManager = null;
try {
    if (typeof window !== 'undefined' && !window.dbManager) {
        dbManager = new DatabaseManager();
        if (dbManager.isInitialized) {
            window.dbManager = dbManager;
        } else {
            console.error("DatabaseManager failed to initialize.");
        }
    }
} catch (error) {
    console.error('Failed to create DatabaseManager:', error);
    // Cập nhật Fallback Object ĐẦY ĐỦ
    dbManager = {
        db: null,
        getHKDList: () => ({ success: false, error: 'Database not available' }),
        createHKD: () => ({ success: false, error: 'Database not available' }),
        updateHKD: () => ({ success: false, error: 'Database not available' }),
        createSale: () => ({ success: false, error: 'Database not available' }),
        getProducts: () => ({ success: false, error: 'Database not available' }),
        getSalesHistory: async (hkdId = null) => { 
            console.error('Database not available. Cannot fetch sales.');
            return { success: false, data: [], error: 'Database not available' }; 
        },
        getRevenueStats: () => ({ success: false, error: 'Database not available' }),
        getCategories: () => ({ success: false, error: 'Database not available' }),
        updateHKDOnlineStatus: () => ({ success: false, error: 'Database not available' }),
        getPendingSales: () => []
    };
    
    // GÁN FALLBACK VÀO WINDOW để tránh lỗi trong các module khác
    if (typeof window !== 'undefined') {
        window.dbManager = dbManager;
    }
    
}
// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DatabaseManager, dbManager };
}