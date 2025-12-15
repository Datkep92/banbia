// HKD module - Bán hàng, quản lý đơn hàng
let currentHKD = null;
let products = [];
let categories = [];
let cart = [];
let invoiceHistory = [];
// Thêm các biến global mới
let isSyncing = false;
let hkdSyncInterval = null;

// Sửa hàm initHKDPage để khởi tạo sync
async function initHKDPage() {
    try {
         setTimeout(async () => {
        if (!currentHKD) return;
        
        const products = await getProductsByHKD(currentHKD.id);
        const categories = await getCategoriesByHKD(currentHKD.id);
        
        if ((products.length === 0 || categories.length === 0) && navigator.onLine) {
            console.log('📭 HKD: Dữ liệu trống, thực hiện sync...');
            Utils.showToast('Đang tải dữ liệu...', 'info');
            
            if (typeof syncHKDDataFromFirebase === 'function') {
                await syncHKDDataFromFirebase(currentHKD.id);
                await loadHKDData(); // Tải lại sau sync
                displayProducts(); // Refresh UI
            }
        }
    }, 2000);
        // Khởi tạo toàn bộ hệ thống
        await initSystem();
        
        // Kiểm tra quyền HKD
        const user = getCurrentUser();
        if (!user || user.role !== 'hkd') {
            window.location.href = 'login.html?type=hkd';
            return;
        }
        
        // Lấy thông tin HKD
        currentHKD = user;
        
        // Tải dữ liệu ban đầu
        await loadHKDData();
        
        // Setup event listeners
        setupHKDEventListeners();
        
        // Hiển thị thông tin HKD
        displayHKDInfo();
        
        // Hiển thị danh sách sản phẩm
        displayProducts();
        
        // Khởi tạo giỏ hàng
        initCart();
        
        // Hiển thị sidebar
        initSidebar();
        
        console.log('HKD page initialized');
        
        // Khởi tạo realtime sync
        initHKDRealtimeSync();
        
        // Kiểm tra dữ liệu từ Firebase (đồng bộ 2 chiều)
        if (navigator.onLine) {
            setTimeout(async () => {
                await syncFromFirebase();
                await loadHKDData(); // Tải lại dữ liệu mới
                displayProducts();
            }, 2000);
        }
        
    } catch (error) {
        console.error('Lỗi khởi tạo HKD page:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}

// Khởi tạo realtime sync cho HKD
function initHKDRealtimeSync() {
    console.log('🔔 Khởi tạo realtime sync cho HKD...');
    
    // Lắng nghe thay đổi kết nối mạng
    window.addEventListener('online', handleHKDConnectionChange);
    window.addEventListener('offline', handleHKDConnectionChange);
    
    // Bắt đầu sync interval (mỗi 30 giây)
    hkdSyncInterval = setInterval(() => {
        if (navigator.onLine && !isSyncing) {
            syncFromFirebase();
        }
    }, 30000);
    
    // Lắng nghe realtime updates
    listenForHKDRealtimeUpdates();
}

// Xử lý thay đổi kết nối mạng
function handleHKDConnectionChange() {
    if (navigator.onLine) {
        console.log('🌐 HKD đã kết nối mạng, đồng bộ dữ liệu...');
        syncFromFirebase();
    } else {
        console.log('📴 HKD mất kết nối, làm việc offline...');
    }
}

async function syncFromFirebase() {
    if (isSyncing) {
        console.log('🔄 Đang sync, bỏ qua...');
        return;
    }
    
    isSyncing = true;
    console.log('⬇️ Đồng bộ từ Firebase về IndexedDB...');
    
    try {
        // THAY VÌ gọi các hàm riêng lẻ, gọi hàm mới tổng hợp
        await syncHKDDataFromFirebase(currentHKD.id); // ← Hàm vừa sửa
        
        // Tải lại dữ liệu local
        await loadHKDData();
        
        // Cập nhật UI
        displayProducts();
        updateCategoryList();
        
        console.log('✅ Đã đồng bộ xong từ Firebase');
        Utils.showToast('Đã cập nhật dữ liệu mới', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
        Utils.showToast('Lỗi đồng bộ dữ liệu', 'error');
    } finally {
        isSyncing = false;
    }
}

// Đồng bộ thông tin HKD từ Firebase
async function syncHKDInfoFromFirebase() {
    try {
        await initFirebase();
        
        const hkdRef = firebase.database().ref(`hkds/${currentHKD.id}/info`);
        const snapshot = await hkdRef.once('value');
        const hkdData = snapshot.val();
        
        if (hkdData) {
            // Kiểm tra xem có cần cập nhật không
            const localHKD = await getFromStore(STORES.HKDS, currentHKD.id);
            
            if (!localHKD || new Date(hkdData.lastUpdated) > new Date(localHKD.lastUpdated)) {
                // Cập nhật thông tin HKD
                const updatedHKD = {
                    ...localHKD,
                    ...hkdData,
                    id: currentHKD.id,
                    role: 'hkd'
                };
                
                await updateInStore(STORES.HKDS, updatedHKD);
                
                // Cập nhật currentHKD nếu cần
                if (hkdData.name !== currentHKD.name) {
                    currentHKD = updatedHKD;
                    displayHKDInfo();
                }
                
                console.log('✅ Đã cập nhật thông tin HKD');
            }
        }
    } catch (error) {
        console.error('❌ Lỗi sync HKD info:', error);
    }
}

// Sửa hàm syncCategoriesFromFirebase trong hkd.js
async function syncCategoriesFromFirebase() {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${currentHKD.id}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                // Chỉ lấy danh mục (không lấy sản phẩm)
                if (categoryData && categoryData.name && !categoryData.msp) {
                    
                    // Kiểm tra nếu danh mục đã bị xóa trên Firebase
                    if (categoryData._deleted === true) {
                        // Xóa khỏi IndexedDB - QUAN TRỌNG: không thêm vào sync queue
                        await deleteFromStore(STORES.CATEGORIES, categoryId);
                        
                        // Đồng thời xóa TẤT CẢ sản phẩm trong danh mục này
                        const productsInCategory = await getProductsByCategory(currentHKD.id, categoryId);
                        for (const product of productsInCategory) {
                            await deleteFromStore(STORES.PRODUCTS, product.id);
                        }
                        
                        deletedCount++;
                        console.log(`🗑️ Đã xóa danh mục ${categoryId} và sản phẩm liên quan (từ Firebase)`);
                        continue;
                    }
                    
                    const localCategory = await getFromStore(STORES.CATEGORIES, categoryId);
                    
                    // Nếu đây là thao tác xóa từ Admin, KHÔNG được ghi đè ngược
                    if (localCategory && localCategory._deleted === true) {
                        console.log(`⚠️ Bỏ qua danh mục ${categoryId} - đã bị xóa bởi Admin`);
                        continue;
                    }
                    
                    // Kiểm tra xem có cần cập nhật không
                    if (!localCategory || new Date(categoryData.lastUpdated) > new Date(localCategory.lastUpdated)) {
                        await updateInStore(STORES.CATEGORIES, {
                            ...categoryData,
                            id: categoryId,
                            hkdId: currentHKD.id,
                            _isFromFirebase: true // Đánh dấu là từ Firebase
                        });
                        updatedCount++;
                    }
                }
            }
            
            if (updatedCount > 0 || deletedCount > 0) {
                console.log(`✅ Đã sync ${updatedCount} danh mục, xóa ${deletedCount} danh mục từ Firebase`);
            }
        }
    } catch (error) {
        console.error('❌ Lỗi sync categories:', error);
    }
}

// Sửa hàm syncProductsFromFirebase
async function syncProductsFromFirebase() {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${currentHKD.id}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [categoryId, categoryOrProducts] of Object.entries(categoriesData)) {
                // Duyệt qua tất cả items trong danh mục
                for (const [itemId, itemData] of Object.entries(categoryOrProducts)) {
                    // Nếu có msp => đây là sản phẩm
                    if (itemData && itemData.msp) {
                        
                        // Kiểm tra nếu sản phẩm đã bị xóa trên Firebase
                        if (itemData._deleted === true) {
                            // Xóa khỏi IndexedDB - KHÔNG thêm vào sync queue
                            await deleteFromStore(STORES.PRODUCTS, itemId);
                            deletedCount++;
                            console.log(`🗑️ Đã xóa sản phẩm ${itemId} (từ Firebase)`);
                            continue;
                        }
                        
                        const localProduct = await getFromStore(STORES.PRODUCTS, itemId);
                        
                        // Nếu đây là thao tác xóa từ Admin, KHÔNG được ghi đè ngược
                        if (localProduct && localProduct._deleted === true) {
                            console.log(`⚠️ Bỏ qua sản phẩm ${itemId} - đã bị xóa bởi Admin`);
                            continue;
                        }
                        
                        // Kiểm tra xem có cần cập nhật không
                        if (!localProduct || new Date(itemData.lastUpdated) > new Date(localProduct.lastUpdated)) {
                            await updateInStore(STORES.PRODUCTS, {
                                ...itemData,
                                id: itemId,
                                hkdId: currentHKD.id,
                                categoryId: categoryId,
                                _isFromFirebase: true // Đánh dấu là từ Firebase
                            });
                            updatedCount++;
                        }
                    }
                }
            }
            
            if (updatedCount > 0 || deletedCount > 0) {
                console.log(`✅ Đã sync ${updatedCount} sản phẩm, xóa ${deletedCount} sản phẩm từ Firebase`);
            }
        }
    } catch (error) {
        console.error('❌ Lỗi sync products:', error);
    }
}

// Thêm hàm kiểm tra trước khi lưu
async function saveProductWithCheck(productData) {
    try {
        // Kiểm tra xem sản phẩm này có bị xóa trên Firebase không
        await initFirebase();
        
        const productRef = firebase.database().ref(`hkds/${currentHKD.id}/categories/${productData.categoryId}/${productData.id}`);
        const snapshot = await productRef.once('value');
        const firebaseProduct = snapshot.val();
        
        if (firebaseProduct && firebaseProduct._deleted === true) {
            console.log(`⚠️ Sản phẩm ${productData.id} đã bị xóa bởi Admin, không được tạo lại`);
            Utils.showToast('Sản phẩm đã bị xóa bởi Admin', 'error');
            return false;
        }
        
        // Lưu vào IndexedDB
        await saveProduct(productData);
        
        // CHỈ thêm vào sync queue nếu KHÔNG có flag _isFromFirebase
        if (!productData._isFromFirebase) {
            if (typeof window.addToSyncQueue === 'function') {
                await window.addToSyncQueue({
                    type: 'products',
                    data: productData
                });
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Lỗi kiểm tra và lưu sản phẩm:', error);
        return false;
    }
}



// Đồng bộ hóa đơn từ Firebase
async function syncInvoicesFromFirebase() {
    try {
        await initFirebase();
        
        const invoicesRef = firebase.database().ref(`hkds/${currentHKD.id}/invoices`);
        const snapshot = await invoicesRef.once('value');
        const invoicesData = snapshot.val();
        
        if (invoicesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
                
                // Kiểm tra nếu hóa đơn đã bị xóa trên Firebase
                if (invoiceData._deleted === true) {
                    // Xóa khỏi IndexedDB
                    await deleteFromStore(STORES.INVOICES, invoiceId);
                    deletedCount++;
                    console.log(`🗑️ Đã xóa hóa đơn ${invoiceId} (từ Firebase)`);
                    continue;
                }
                
                const localInvoice = await getFromStore(STORES.INVOICES, invoiceId);
                
                // Kiểm tra xem có cần cập nhật không
                if (!localInvoice || new Date(invoiceData.lastUpdated) > new Date(localInvoice.lastUpdated)) {
                    await updateInStore(STORES.INVOICES, {
                        ...invoiceData,
                        id: invoiceId,
                        hkdId: currentHKD.id
                    });
                    updatedCount++;
                }
            }
            
            if (updatedCount > 0 || deletedCount > 0) {
                console.log(`✅ Đã sync ${updatedCount} hóa đơn, xóa ${deletedCount} hóa đơn`);
            }
        }
    } catch (error) {
        console.error('❌ Lỗi sync invoices:', error);
    }
}
// Hàm thiết lập listener cho sản phẩm trong một danh mục cụ thể
async function setupProductListenersForCategory(categoryId) {
    console.log(`🎧 Thiết lập product listeners cho danh mục ${categoryId}`);
    
    try {
        await initFirebase();
        
        const productsRef = firebase.database().ref(
            `hkds/${currentHKD.id}/categories/${categoryId}/products`
        );
        
        // a) Khi hàng hóa bị xóa
        productsRef.on('child_removed', async (snapshot) => {
            const productId = snapshot.key;
            console.log(`🗑️ [REALTIME] Sản phẩm ${productId} đã bị xóa từ Admin`);
            
            // Xóa khỏi IndexedDB
            await deleteFromStore(STORES.PRODUCTS, productId);
            
            // Cập nhật UI
            await loadHKDData();
            displayProducts();
            
            Utils.showToast('Sản phẩm đã bị xóa', 'warning');
        });
        
        // b) Khi hàng hóa thay đổi
        productsRef.on('child_changed', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            console.log(`🔄 [REALTIME] Sản phẩm ${productId} đã thay đổi:`, productData?.name);
            
            // Cập nhật sản phẩm
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: currentHKD.id,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            // Cập nhật UI
            await loadHKDData();
            displayProducts();
            
            Utils.showToast(`Sản phẩm "${productData.name}" đã được cập nhật`, 'info');
        });
        
        // c) Khi có hàng hóa mới
        productsRef.on('child_added', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            console.log(`🆕 [REALTIME] Sản phẩm mới ${productId}:`, productData?.name);
            
            // Thêm sản phẩm mới
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: currentHKD.id,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            // Cập nhật UI
            await loadHKDData();
            displayProducts();
            
            Utils.showToast(`Sản phẩm mới: "${productData.name}"`, 'success');
        });
        
        console.log(`✅ Đã thiết lập product listeners cho danh mục ${categoryId}`);
        
        // Lưu reference để cleanup sau
        if (!window.productListeners) window.productListeners = [];
        window.productListeners.push(productsRef);
        
    } catch (error) {
        console.error(`❌ Lỗi thiết lập listener cho danh mục ${categoryId}:`, error);
    }
}
async function listenForHKDRealtimeUpdates() {
    console.log('🎧 Bắt đầu lắng nghe realtime updates cho HKD...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, không thể lắng nghe');
        return;
    }
    
    try {
        await initFirebase();
        
        // ==================== 1. LẮNG NGHE DANH MỤC ====================
        const categoriesRef = firebase.database().ref(`hkds/${currentHKD.id}/categories`);
        
        // a) Khi danh mục bị xóa (Admin xóa danh mục)
        categoriesRef.on('child_removed', async (snapshot) => {
            const categoryId = snapshot.key;
            console.log(`🗑️ [REALTIME] Danh mục ${categoryId} đã bị xóa từ Admin`);
            
            // Xóa danh mục khỏi IndexedDB
            await deleteFromStore(STORES.CATEGORIES, categoryId);
            
            // Xóa TẤT CẢ sản phẩm trong danh mục này
            const products = await getProductsByHKD(currentHKD.id);
            const categoryProducts = products.filter(p => p.categoryId === categoryId);
            
            for (const product of categoryProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
            
            console.log(`✅ Đã xóa ${categoryProducts.length} sản phẩm trong danh mục`);
            
            // Cập nhật UI
            await loadHKDData();
            displayProducts();
            updateCategoryList();
            
            Utils.showToast(`Đã xóa danh mục (${categoryProducts.length} sản phẩm)`, 'warning');
        });
        
        // ==================== 2. LẮNG NGHE HÀNG HÓA TRONG TỪNG DANH MỤC ====================
        // Lấy tất cả danh mục hiện có và lắng nghe từng danh mục
        const categoriesSnapshot = await categoriesRef.once('value');
        const categoriesData = categoriesSnapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (!categoryData || !categoryData.name) continue;
                
                // Lắng nghe sản phẩm trong danh mục này
                await setupProductListenersForCategory(categoryId);
            }
        }
        
        // ==================== 3. LẮNG NGHE DANH MỤC MỚI ĐỂ THIẾT LẬP LISTENER CHO NÓ ====================
        categoriesRef.on('child_added', async (snapshot) => {
            const categoryId = snapshot.key;
            const categoryData = snapshot.val();
            
            console.log(`🆕 [REALTIME] Danh mục mới ${categoryId}: "${categoryData?.name}"`);
            
            // Thêm danh mục
            await updateInStore(STORES.CATEGORIES, {
                id: categoryId,
                hkdId: currentHKD.id,
                name: categoryData.name,
                description: categoryData.description || '',
                createdAt: categoryData.createdAt || new Date().toISOString(),
                lastUpdated: categoryData.lastUpdated || new Date().toISOString(),
                _synced: true
            });
            
            // Thiết lập listener cho sản phẩm trong danh mục mới
            await setupProductListenersForCategory(categoryId);
            
            // Cập nhật UI
            await loadHKDData();
            updateCategoryList();
            
            Utils.showToast(`Danh mục mới: "${categoryData.name}"`, 'success');
        });
        
        console.log('✅ Đã bật realtime listener cho HKD');
        
    } catch (error) {
        console.error('❌ Lỗi khi lắng nghe realtime updates:', error);
    }
}

// Force sync từ Firebase
async function forceSync() {
    if (isSyncing) {
        console.log('🔄 Đang sync, bỏ qua...');
        return;
    }
    
    Utils.showLoading('Đang đồng bộ dữ liệu...');
    
    try {
        await syncFromFirebase();
        Utils.showToast('Đồng bộ hoàn tất', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi force sync:', error);
        Utils.showToast('Lỗi đồng bộ', 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Dọn dẹp khi page unload
function cleanupHKD() {
    if (hkdSyncInterval) {
        clearInterval(hkdSyncInterval);
    }
    
    window.removeEventListener('online', handleHKDConnectionChange);
    window.removeEventListener('offline', handleHKDConnectionChange);
    
    console.log('🧹 Đã dọn dẹp HKD sync');
}


// Tải dữ liệu HKD
async function loadHKDData() {
    Utils.showLoading('Đang tải dữ liệu...');
    
    try {
        // Tải sản phẩm
        products = await getProductsByHKD(currentHKD.id);
        
        // Tải danh mục
        categories = await getCategoriesByHKD(currentHKD.id);
        
        // Tải lịch sử hóa đơn
        invoiceHistory = await getInvoicesByHKD(currentHKD.id);
        invoiceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Cập nhật danh mục trong sidebar
        updateCategoryList();
        
    } catch (error) {
        console.error('Lỗi tải dữ liệu HKD:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Thiết lập event listeners
function setupHKDEventListeners() {
    // Sidebar toggle
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
    
    // Category filter
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-filter')) {
            filterProductsByCategory(e.target.dataset.category);
        }
    });
    
    // Product click
    document.getElementById('productGrid').addEventListener('click', (e) => {
        const productCard = e.target.closest('.product-card');
        if (productCard) {
            const productId = productCard.dataset.productId;
            addToCart(productId);
        }
    });
    
    // Cart actions
    document.getElementById('clearCart').addEventListener('click', clearCart);
    document.getElementById('createInvoice').addEventListener('click', createInvoice);
    
    // Invoice history
    document.getElementById('viewHistory').addEventListener('click', showInvoiceHistory);
    document.getElementById('viewRevenue').addEventListener('click', showRevenueReport);
    
    // Customer name input
    document.getElementById('customerName').addEventListener('input', (e) => {
        updateCartSummary();
    });
    
    // Close sidebar khi click outside
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menuToggle');
        
        if (sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            !menuToggle.contains(e.target)) {
            toggleSidebar();
        }
    });
}

// Hiển thị thông tin HKD
function displayHKDInfo() {
    document.getElementById('hkdName').textContent = currentHKD.name;
    document.getElementById('hkdNameMobile').textContent = currentHKD.name;
}
// Thêm vào hkd.js
function updateSyncStatus() {
    const syncStatusEl = document.getElementById('syncStatus');
    if (!syncStatusEl) return;
    
    if (navigator.onLine) {
        if (isSyncing) {
            syncStatusEl.className = 'sync-status syncing';
            syncStatusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> <span>Đang đồng bộ...</span>';
        } else {
            syncStatusEl.className = 'sync-status';
            syncStatusEl.innerHTML = '<i class="fas fa-wifi"></i> <span>Đã kết nối</span>';
        }
    } else {
        syncStatusEl.className = 'sync-status offline';
        syncStatusEl.innerHTML = '<i class="fas fa-wifi-slash"></i> <span>Đang offline</span>';
    }
}

// Cập nhật hàm syncFromFirebase
async function syncFromFirebase() {
    if (isSyncing) {
        console.log('🔄 Đang sync, bỏ qua...');
        return;
    }
    
    isSyncing = true;
    updateSyncStatus(); // Cập nhật trạng thái
    
    console.log('⬇️ Đồng bộ từ Firebase về IndexedDB...');
    
    try {
        // ... phần còn lại của hàm syncFromFirebase ...
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
    } finally {
        isSyncing = false;
        updateSyncStatus(); // Cập nhật trạng thái
    }
}
// Sửa hàm initSidebar để thêm nút sync
function initSidebar() {
    // Thêm các menu item
    const menuItems = [
        { id: 'dashboard', icon: 'fa-home', text: 'Bán hàng', action: () => showDashboard() },
        { id: 'history', icon: 'fa-history', text: 'Lịch sử', action: () => showInvoiceHistory() },
        { id: 'revenue', icon: 'fa-chart-line', text: 'Doanh thu', action: () => showRevenueReport() },
        { id: 'products', icon: 'fa-boxes', text: 'Sản phẩm', action: () => showAllProducts() },
        { id: 'sync', icon: 'fa-sync-alt', text: 'Đồng bộ', action: () => forceSync() },
        { id: 'logout', icon: 'fa-sign-out-alt', text: 'Đăng xuất', action: () => logout() }
    ];
    
    const menuContainer = document.getElementById('sidebarMenu');
    menuContainer.innerHTML = menuItems.map(item => `
        <div class="menu-item" onclick="${item.action.toString().replace(/"/g, '&quot;')}">
            <i class="fas ${item.icon}"></i>
            <span>${item.text}</span>
        </div>
    `).join('');
}
// Hiển thị trang quản lý của HKD
function showAllManagement() {
    console.log('📋 Hiển thị trang quản lý HKD');
    
    // Tạo modal hoặc mở trang quản lý
    const modal = new bootstrap.Modal(document.getElementById('hkdManagementModal'));
    
    // Load danh mục và sản phẩm vào modal
    loadHKDManagementData();
    
    modal.show();
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
    
    // Toggle overlay
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.classList.toggle('active');
    } else {
        // Tạo overlay nếu chưa có
        const newOverlay = document.createElement('div');
        newOverlay.id = 'sidebarOverlay';
        newOverlay.className = 'sidebar-overlay';
        newOverlay.onclick = toggleSidebar;
        document.body.appendChild(newOverlay);
        setTimeout(() => newOverlay.classList.add('active'), 10);
    }
}

function updateCategoryList() {
    const categoryContainer = document.getElementById('categoryList');
    if (!categoryContainer) return;
    
    // Tạo unique categories từ products theo cấu trúc mới
    const uniqueCategoryIds = [...new Set(products
        .map(p => p.categoryId)
        .filter(Boolean))];
    
    // Lấy tên danh mục từ categories array
    const productCategories = uniqueCategoryIds
        .map(categoryId => {
            const category = categories.find(c => c.id === categoryId);
            return category ? category.name : null;
        })
        .filter(Boolean);
    
    // Kết hợp với danh sách categories từ database
    const allCategories = ['Tất cả', ...new Set([
        ...categories.map(c => c.name),
        ...productCategories
    ])];
    
    // Render category filters
    categoryContainer.innerHTML = allCategories.map(cat => `
        <button class="category-filter ${cat === 'Tất cả' ? 'active' : ''}" 
                data-category="${cat}">
            ${cat}
        </button>
    `).join('');
}

function displayProducts(category = 'Tất cả') {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;
    
    let filteredProducts = products;
    
    if (category !== 'Tất cả') {
        console.log(`🔍 Filtering by category: "${category}"`);
        
        // FILTER THEO CẤU TRÚC MỚI: product có categoryId, tìm tên từ categories array
        filteredProducts = products.filter(product => {
            if (!product || !product.categoryId) return false;
            
            // Tìm tên danh mục từ categoryId
            const productCategory = categories.find(c => 
                c && c.id === product.categoryId
            );
            
            // So sánh tên danh mục
            return productCategory && productCategory.name === category;
        });
        
        console.log(`📊 Found ${filteredProducts.length} products for category "${category}"`);
    }
    
    // Hiển thị sản phẩm
    if (filteredProducts.length === 0) {
        productGrid.innerHTML = `
            <div class="no-products">
                <i class="fas fa-box-open"></i>
                <p>Không có sản phẩm trong danh mục này</p>
            </div>
        `;
        return;
    }
    
    productGrid.innerHTML = filteredProducts.map(product => {
        // Lấy tên danh mục để hiển thị
        const categoryObj = categories.find(c => c.id === product.categoryId);
        const categoryName = categoryObj ? categoryObj.name : '';
        
        return `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-details">
                        <span class="product-price">${Utils.formatCurrency(product.price)}</span>
                        <span class="product-unit">/${product.unit}</span>
                    </div>
                    ${product.stock !== undefined ? 
                        `<div class="product-stock">Còn: ${product.stock}</div>` : 
                        `<div class="product-stock">Không giới hạn</div>`
                    }
                    ${categoryName ? `<div class="product-category-badge">${categoryName}</div>` : ''}
                </div>
                <div class="product-cart">
                    <span class="quantity-value">${getCartQuantity(product.id)}</span>
                    <button class="btn-add-cart">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function editHKDProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Điền dữ liệu vào form
    document.getElementById('hkdProductCode').value = product.msp || '';
    document.getElementById('hkdProductName').value = product.name || '';
    document.getElementById('hkdProductUnit').value = product.unit || 'cái';
    document.getElementById('hkdProductPrice').value = product.price || 0;
    document.getElementById('hkdProductStock').value = product.stock || 0;
    document.getElementById('hkdProductDescription').value = product.description || '';
    
    // Load danh mục và chọn đúng
    const categorySelect = document.getElementById('hkdProductCategory');
    categorySelect.innerHTML = '<option value="">Chọn danh mục...</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        if (category.id === product.categoryId) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });
    
    // Lưu ID sản phẩm đang sửa
    document.getElementById('hkdProductModal').dataset.editId = productId;
    document.querySelector('#hkdProductModal .modal-title').textContent = 'Sửa hàng hóa';
    
    const modal = new bootstrap.Modal(document.getElementById('hkdProductModal'));
    modal.show();
}
async function deleteHKDProduct(productId) {
    const confirmed = await Utils.confirm('Bạn có chắc muốn xóa sản phẩm này?');
    if (!confirmed) return;
    
    Utils.showLoading('Đang xóa...');
    
    try {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
        // 1. Xóa khỏi IndexedDB
        await deleteFromStore(STORES.PRODUCTS, productId);
        
        // 2. Cập nhật UI ngay
        products = products.filter(p => p.id !== productId);
        displayProducts();
        
        Utils.showToast('Đã xóa sản phẩm', 'success');
        
        // 3. Sync xóa lên Firebase
        setTimeout(async () => {
            try {
                await initFirebase();
                
                const productRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${product.categoryId}/products/${productId}`
                );
                
                // Soft delete
                await productRef.update({
                    _deleted: true,
                    _deletedAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                });
                
                console.log('✅ HKD đã xóa sản phẩm trên Firebase');
                
            } catch (firebaseError) {
                console.error('❌ Lỗi sync delete:', firebaseError);
                await addToSyncQueue({
                    type: 'products_delete',
                    data: {
                        id: productId,
                        hkdId: currentHKD.id,
                        categoryId: product.categoryId
                    }
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi xóa sản phẩm:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}
function getCategoryNameById(categoryId) {
    if (!categoryId || !categories) return '';
    const category = categories.find(c => c && c.id === categoryId);
    return category ? category.name : '';
}

// Thêm hàm debug để xem dữ liệu
function debugProductCategories() {
    console.log('=== DEBUG PRODUCT CATEGORIES ===');
    console.log(`📊 Total products: ${products.length}`);
    console.log(`📊 Total categories: ${categories.length}`);
    
    products.forEach((product, index) => {
        const categoryName = getCategoryNameById(product.categoryId);
        console.log(`  Product ${index + 1}:`, {
            name: product.name,
            categoryId: product.categoryId,
            categoryName: categoryName,
            hasCategoryField: !!product.category,
            categoryField: product.category
        });
    });
    
    categories.forEach((category, index) => {
        console.log(`  Category ${index + 1}:`, {
            id: category.id,
            name: category.name,
            hkdId: category.hkdId
        });
    });
}

// Thêm vào window để debug
window.debugProductCategories = debugProductCategories;

function filterProductsByCategory(category) {
    // Update active button
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.category-filter[data-category="${category}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Display filtered products
    displayProducts(category);
}

// Giỏ hàng
function initCart() {
    // Load cart from localStorage
    const savedCart = localStorage.getItem(`cart_${currentHKD.id}`);
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartDisplay();
    }
}

function getCartQuantity(productId) {
    const item = cart.find(item => item.productId === productId);
    return item ? item.quantity : 0;
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
        // Kiểm tra tồn kho nếu có
        if (product.stock && existingItem.quantity >= product.stock) {
            Utils.showToast('Đã đạt giới hạn tồn kho', 'warning');
            return;
        }
        existingItem.quantity += 1;
    } else {
        // Kiểm tra tồn kho
        if (product.stock && product.stock <= 0) {
            Utils.showToast('Sản phẩm đã hết hàng', 'warning');
            return;
        }
        cart.push({
            productId: productId,
            quantity: 1,
            price: product.price,
            name: product.name,
            unit: product.unit,
            msp: product.msp,
            category: product.category,
            description: product.description,
            note: product.note
        });
    }
    
    // Update UI
    updateCartDisplay();
    updateProductQuantity(productId);
    
    // Play sound
    playAddToCartSound();
    
    // Save cart
    saveCart();
}

function removeFromCart(productId) {
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
        if (existingItem.quantity > 1) {
            existingItem.quantity -= 1;
        } else {
            cart = cart.filter(item => item.productId !== productId);
        }
    }
    
    updateCartDisplay();
    updateProductQuantity(productId);
    saveCart();
}

function clearCart() {
    const confirmed =  Utils.confirm('Bạn có chắc chắn muốn xóa giỏ hàng?');
    if (!confirmed) return;
    
    cart = [];
    updateCartDisplay();
    
    // Reset product quantities
    document.querySelectorAll('.product-card').forEach(card => {
        const productId = card.dataset.productId;
        updateProductQuantity(productId);
    });
    
    saveCart();
    
    Utils.showToast('Đã xóa giỏ hàng', 'success');
}

function updateProductQuantity(productId) {
    const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (productCard) {
        const quantityValue = productCard.querySelector('.quantity-value');
        if (quantityValue) {
            quantityValue.textContent = getCartQuantity(productId);
        }
    }
}

function updateCartDisplay() {
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
    
    // Update cart items
    const cartItemsContainer = document.getElementById('cartItems');
    if (cartItemsContainer) {
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Giỏ hàng trống</p>
                </div>
            `;
        } else {
            cartItemsContainer.innerHTML = cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-details">
                            <span class="cart-item-price">${Utils.formatCurrency(item.price)}</span>
                            <span class="cart-item-unit">/${item.unit}</span>
                        </div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="btn-decrease" onclick="removeFromCart('${item.productId}')">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="cart-item-quantity">${item.quantity}</span>
                        <button class="btn-increase" onclick="addToCart('${item.productId}')">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="cart-item-total">
                        ${Utils.formatCurrency(item.price * item.quantity)}
                    </div>
                </div>
            `).join('');
        }
    }
    
    // Update summary
    updateCartSummary();
}

function updateCartSummary() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    document.getElementById('cartSubtotal').textContent = Utils.formatCurrency(subtotal);
    document.getElementById('cartTotal').textContent = Utils.formatCurrency(subtotal);
}

function saveCart() {
    localStorage.setItem(`cart_${currentHKD.id}`, JSON.stringify(cart));
}

// Thay thế hàm playAddToCartSound
function playAddToCartSound() {
    try {
        // Tạo âm thanh đơn giản bằng Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
        
        // Cleanup
        setTimeout(() => {
            oscillator.disconnect();
            gainNode.disconnect();
        }, 200);
    } catch (error) {
        // Silent fail - không cần xử lý
        console.log('Audio not supported or error:', error.message);
    }
}

// Tạo hóa đơn - ĐÃ SỬA ĐỂ ĐỒNG BỘ 2 CHIỀU
async function createInvoice() {
    if (cart.length === 0) {
        Utils.showToast('Giỏ hàng trống', 'warning');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim() || 'Khách lẻ';
    
    const confirmed = await Utils.confirm(
        `Xác nhận tạo hóa đơn cho ${customerName}?\nTổng tiền: ${Utils.formatCurrency(calculateCartTotal())}`
    );
    
    if (!confirmed) return;
    
    Utils.showLoading('Đang tạo hóa đơn...');
    
    try {
        const invoiceId = Utils.generateId();
        
        // Tạo items array với cấu trúc CHUẨN - FIX LỖI UNDEFINED
        const invoiceItems = cart.map(item => {
            // Tìm thông tin đầy đủ của sản phẩm từ products array
            const productInfo = products.find(p => p.id === item.productId);
            
            // Tạo item với cấu trúc chuẩn, đảm bảo không có undefined
            const invoiceItem = {
                productId: item.productId || '',
                name: item.name || productInfo?.name || 'Sản phẩm không xác định',
                unit: item.unit || productInfo?.unit || 'cái',
                quantity: item.quantity || 0,
                price: item.price || productInfo?.price || 0,
                msp: item.msp || productInfo?.msp || '',
                
                // QUAN TRỌNG: Lấy category từ productInfo nếu cart item không có
                // Ưu tiên 1: Từ cart item (nếu có và không undefined)
                // Ưu tiên 2: Từ productInfo.category (nếu có)
                // Ưu tiên 3: Từ categoryId + categories array
                // Ưu tiên 4: Chuỗi rỗng
                category: (item.category !== undefined && item.category !== null) 
                    ? item.category 
                    : productInfo?.category || getCategoryNameById(productInfo?.categoryId) || '',
                
                description: item.description || productInfo?.description || '',
                note: item.note || productInfo?.note || ''
            };
            
            console.log('📦 Invoice item created:', {
                name: invoiceItem.name,
                category: invoiceItem.category,
                fromCartCategory: item.category,
                fromProductCategory: productInfo?.category,
                categoryId: productInfo?.categoryId,
                categoryName: getCategoryNameById(productInfo?.categoryId)
            });
            
            return invoiceItem;
        });
        
        // Tạo invoice data
        const invoiceData = {
            id: invoiceId,
            hkdId: currentHKD.id,
            hkdName: currentHKD.name,
            customerName: customerName,
            date: new Date().toISOString(),
            items: invoiceItems, // Sử dụng items đã được chuẩn hóa
            subtotal: calculateCartTotal(),
            tax: 0,
            discount: 0,
            total: calculateCartTotal(),
            status: 'completed',
            _synced: false,
            lastUpdated: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        console.log('📝 Tạo invoice:', invoiceId);
        console.log('📊 Invoice items check (no undefined):', 
            invoiceData.items.every(item => item.category !== undefined)
        );
        
        // 1. Lưu vào IndexedDB (invoices store)
        await saveInvoice(invoiceData);
        console.log('💾 Đã lưu invoice vào IndexedDB');
        
        // 2. Thêm vào sync queue để đồng bộ lên Firebase
        let syncAdded = false;
        
        // Kiểm tra các cách gọi hàm addToSyncQueue
        if (typeof window.addToSyncQueue === 'function') {
            await window.addToSyncQueue({
                type: 'invoices',
                data: invoiceData
            });
            syncAdded = true;
            console.log('✅ Đã thêm vào sync queue (via window)');
        }
        else if (typeof addToSyncQueue === 'function') {
            await addToSyncQueue({
                type: 'invoices',
                data: invoiceData
            });
            syncAdded = true;
            console.log('✅ Đã thêm vào sync queue (via local)');
        }
        else {
            console.log('⚠️ Hàm addToSyncQueue không tồn tại, thử cách khác');
            
            // Thử lưu trực tiếp vào syncQueue
            try {
                const db = await getDB();
                const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
                const store = tx.objectStore(STORES.SYNC_QUEUE);
                
                const syncItem = {
                    type: 'invoices',
                    data: invoiceData,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };
                
                await store.add(syncItem);
                syncAdded = true;
                console.log('✅ Đã lưu trực tiếp vào syncQueue');
            } catch (syncError) {
                console.error('❌ Lỗi lưu sync queue:', syncError);
            }
        }
        
        if (!syncAdded) {
            // Nếu không thể lưu sync queue, thử lưu trực tiếp lên Firebase
            console.log('🔄 Thử lưu trực tiếp lên Firebase...');
            await saveInvoiceDirectToFirebase(invoiceData);
        }
        
        // 3. Cập nhật lịch sử local
        invoiceHistory.unshift(invoiceData);
        
        // 4. Giảm số lượng tồn kho (nếu có)
        await updateProductStockAfterSale();
        
        // 5. Clear cart
        cart = [];
        updateCartDisplay();
        saveCart();
        
        // 6. Reset customer name
        document.getElementById('customerName').value = '';
        
        // 7. Reset product quantities
        products.forEach(product => {
            updateProductQuantity(product.id);
        });
        
        // 8. Show success
        Utils.showToast('Đã tạo hóa đơn thành công', 'success');
        
        // 9. Show invoice details
        showInvoiceReceipt(invoiceData);
        
        // 10. Cố gắng đồng bộ ngay nếu online
        if (navigator.onLine && syncAdded) {
            console.log('🌐 Đang online, thử đồng bộ ngay...');
            
            setTimeout(async () => {
                try {
                    // Kiểm tra sync queue
                    const pendingItems = await getPendingSyncItems();
                    console.log(`📊 Sync queue có ${pendingItems.length} item pending`);
                    
                    // Thực hiện sync
                    if (typeof window.syncToFirebase === 'function') {
                        await window.syncToFirebase();
                    } else if (typeof syncToFirebase === 'function') {
                        await syncToFirebase();
                    }
                    
                    console.log('✅ Đã thực hiện sync lên Firebase');
                } catch (syncError) {
                    console.error('❌ Lỗi khi sync:', syncError);
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Lỗi tạo hóa đơn:', error);
        Utils.showToast('Lỗi khi tạo hóa đơn: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Hàm lưu trực tiếp lên Firebase (fallback)
async function saveInvoiceDirectToFirebase(invoiceData) {
    try {
        await initFirebase();
        
        const invoiceRef = firebase.database().ref(`hkds/${currentHKD.id}/invoices/${invoiceData.id}`);
        
        const firebaseData = {
            ...invoiceData,
            lastUpdated: new Date().toISOString(),
            _syncedAt: new Date().toISOString()
        };
        
        await invoiceRef.set(firebaseData);
        console.log('✅ Đã lưu trực tiếp lên Firebase');
        
    } catch (error) {
        console.error('❌ Lỗi lưu trực tiếp lên Firebase:', error);
        throw error;
    }
}

// Cập nhật tồn kho sau khi bán
async function updateProductStockAfterSale() {
    try {
        for (const cartItem of cart) {
            const product = products.find(p => p.id === cartItem.productId);
            
            if (product && product.stock !== undefined) {
                // Giảm số lượng tồn
                product.stock = Math.max(0, product.stock - cartItem.quantity);
                product.lastUpdated = new Date().toISOString();
                
                // Cập nhật trong IndexedDB
                await saveProduct(product);
                
                // Thêm vào sync queue
                if (typeof window.addToSyncQueue === 'function') {
                    await window.addToSyncQueue({
                        type: 'products',
                        data: product
                    });
                }
                
                console.log(`📦 Đã cập nhật tồn kho ${product.name}: -${cartItem.quantity}`);
            }
        }
        
        // Cập nhật lại danh sách sản phẩm
        products = await getProductsByHKD(currentHKD.id);
        
    } catch (error) {
        console.error('❌ Lỗi cập nhật tồn kho:', error);
    }
}

function calculateCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function showInvoiceReceipt(invoice) {
    const modal = new bootstrap.Modal(document.getElementById('invoiceReceiptModal'));
    
    // Format receipt
    const receiptHtml = `
        <div class="receipt-header">
            <h4>HÓA ĐƠN BÁN HÀNG</h4>
            <div class="receipt-id">Mã: ${invoice.id.substring(0, 8)}</div>
        </div>
        
        <div class="receipt-info">
            <div class="receipt-row">
                <span>HKD:</span>
                <span>${invoice.hkdName}</span>
            </div>
            <div class="receipt-row">
                <span>Khách hàng:</span>
                <span>${invoice.customerName}</span>
            </div>
            <div class="receipt-row">
                <span>Ngày:</span>
                <span>${Utils.formatDate(invoice.date)}</span>
            </div>
        </div>
        
        <div class="receipt-items">
            <h5>Chi tiết sản phẩm:</h5>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th>Tên sản phẩm</th>
                        <th>SL</th>
                        <th>Đơn giá</th>
                        <th>Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.items.map(item => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.quantity} ${item.unit}</td>
                            <td>${Utils.formatCurrency(item.price)}</td>
                            <td>${Utils.formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="receipt-total">
            <div class="receipt-row total-row">
                <span>TỔNG CỘNG:</span>
                <span>${Utils.formatCurrency(invoice.total)}</span>
            </div>
        </div>
        
        <div class="receipt-footer">
            <p>Cảm ơn quý khách!</p>
        </div>
    `;
    
    document.getElementById('receiptContent').innerHTML = receiptHtml;
    
    // Print button
    document.getElementById('printReceipt').onclick = () => printReceipt(invoice);
    
    modal.show();
}

function printReceipt(invoice) {
    const printWindow = window.open('', '_blank');
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Hóa đơn ${invoice.id}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 300px; margin: 0 auto; }
                .receipt-header { text-align: center; margin-bottom: 20px; }
                .receipt-header h4 { margin: 0; font-size: 16px; }
                .receipt-id { font-size: 12px; color: #666; }
                .receipt-info { margin-bottom: 20px; }
                .receipt-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .receipt-items table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .receipt-items th, .receipt-items td { border-bottom: 1px dashed #ddd; padding: 5px; font-size: 12px; }
                .receipt-total { border-top: 2px solid #000; padding-top: 10px; }
                .total-row { font-weight: bold; font-size: 14px; }
                .receipt-footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
                @media print {
                    body { padding: 10px; }
                }
            </style>
        </head>
        <body>
            ${document.getElementById('receiptContent').innerHTML}
        </body>
        </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// Lịch sử hóa đơn
function showInvoiceHistory() {
    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    
    // Display history
    const historyHtml = invoiceHistory.length > 0 ? `
        <div class="history-list">
            ${invoiceHistory.slice(0, 20).map(invoice => `
                <div class="history-item" onclick="viewHistoryInvoice('${invoice.id}')">
                    <div class="history-item-header">
                        <span class="history-id">${invoice.id.substring(0, 8)}</span>
                        <span class="history-date">${Utils.formatDate(invoice.date)}</span>
                    </div>
                    <div class="history-item-body">
                        <div class="history-customer">${invoice.customerName}</div>
                        <div class="history-total">${Utils.formatCurrency(invoice.total)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : `
        <div class="no-history">
            <i class="fas fa-receipt"></i>
            <p>Chưa có hóa đơn nào</p>
        </div>
    `;
    
    document.getElementById('historyContent').innerHTML = historyHtml;
    
    modal.show();
}

function viewHistoryInvoice(invoiceId) {
    const invoice = invoiceHistory.find(inv => inv.id === invoiceId);
    if (!invoice) return;
    
    showInvoiceReceipt(invoice);
}

// Báo cáo doanh thu
function showRevenueReport() {
    const modal = new bootstrap.Modal(document.getElementById('revenueModal'));
    
    // Tính toán thống kê
    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    
    // Filter invoices
    const monthlyInvoices = invoiceHistory.filter(inv => {
        const date = new Date(inv.date);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    });
    
    const dailyInvoices = invoiceHistory.filter(inv => {
        const date = new Date(inv.date);
        return date.toDateString() === today.toDateString();
    });
    
    // Calculate totals
    const monthlyTotal = monthlyInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const dailyTotal = dailyInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const avgInvoice = invoiceHistory.length > 0 ? 
        invoiceHistory.reduce((sum, inv) => sum + inv.total, 0) / invoiceHistory.length : 0;
    
    // Display statistics
    const statsHtml = `
        <div class="revenue-stats">
            <div class="stat-card">
                <div class="stat-value">${Utils.formatCurrency(dailyTotal)}</div>
                <div class="stat-label">Hôm nay</div>
                <div class="stat-detail">${dailyInvoices.length} hóa đơn</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-value">${Utils.formatCurrency(monthlyTotal)}</div>
                <div class="stat-label">Tháng này</div>
                <div class="stat-detail">${monthlyInvoices.length} hóa đơn</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-value">${invoiceHistory.length}</div>
                <div class="stat-label">Tổng hóa đơn</div>
                <div class="stat-detail">TB: ${Utils.formatCurrency(avgInvoice)}</div>
            </div>
        </div>
        
        <div class="revenue-chart">
            <h5>Doanh thu 7 ngày gần nhất:</h5>
            <canvas id="revenueChart" width="400" height="200"></canvas>
        </div>
    `;
    
    document.getElementById('revenueContent').innerHTML = statsHtml;
    
    modal.show();
    
    // Draw chart
    setTimeout(() => drawRevenueChart(), 100);
}

function drawRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Prepare data for last 7 days
    const dailyData = {};
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = 0;
    }
    
    // Fill with actual data
    invoiceHistory.forEach(invoice => {
        const invoiceDate = new Date(invoice.date).toISOString().split('T')[0];
        if (dailyData[invoiceDate] !== undefined) {
            dailyData[invoiceDate] += invoice.total;
        }
    });
    
    // Draw chart
    const dates = Object.keys(dailyData);
    const revenues = Object.values(dailyData);
    
    // Simple bar chart
    const maxRevenue = Math.max(...revenues, 1);
    const barWidth = canvas.width / dates.length - 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw bars
    dates.forEach((date, index) => {
        const barHeight = (revenues[index] / maxRevenue) * (canvas.height - 50);
        const x = index * (barWidth + 10) + 5;
        const y = canvas.height - barHeight - 30;
        
        // Bar
        ctx.fillStyle = '#4a6ee0';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Value
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            Utils.formatCurrency(revenues[index]).replace('₫', ''), 
            x + barWidth / 2, 
            y - 5
        );
        
        // Date
        const dateLabel = new Date(date).getDate() + '/' + (new Date(date).getMonth() + 1);
        ctx.fillText(dateLabel, x + barWidth / 2, canvas.height - 10);
    });
}

// Hiển thị tất cả sản phẩm
function showAllProducts() {
    const modal = new bootstrap.Modal(document.getElementById('productsModal'));
    
    const productsHtml = products.length > 0 ? `
        <div class="products-modal-list">
            ${products.map(product => `
                <div class="product-modal-item">
                    <div class="product-modal-info">
                        <div class="product-modal-name">${product.name}</div>
                        <div class="product-modal-details">
                            <span>${product.msp}</span>
                            <span>${product.category}</span>
                            <span>${Utils.formatCurrency(product.price)}/${product.unit}</span>
                        </div>
                    </div>
                    <div class="product-modal-stock">
                        ${product.stock ? `Còn: ${product.stock}` : 'Không giới hạn'}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : `
        <div class="no-products-modal">
            <i class="fas fa-box-open"></i>
            <p>Chưa có sản phẩm nào</p>
        </div>
    `;
    
    document.getElementById('productsContent').innerHTML = productsHtml;
    
    modal.show();
}

// Dashboard
function showDashboard() {
    // Đóng sidebar nếu đang mở
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}
// Hiển thị modal thêm danh mục
function showCategoryModal() {
    // Reset form
    document.getElementById('hkdCategoryName').value = '';
    document.getElementById('hkdCategoryDescription').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('hkdCategoryModal'));
    modal.show();
}

// Hiển thị modal thêm hàng hóa
function showProductModal() {
    // Reset form
    document.getElementById('hkdProductCode').value = '';
    document.getElementById('hkdProductName').value = '';
    document.getElementById('hkdProductUnit').value = 'cái';
    document.getElementById('hkdProductPrice').value = '';
    document.getElementById('hkdProductStock').value = '0';
    document.getElementById('hkdProductDescription').value = '';
    
    // Load danh mục vào select
    const categorySelect = document.getElementById('hkdProductCategory');
    categorySelect.innerHTML = '<option value="">Chọn danh mục...</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('hkdProductModal'));
    modal.show();
}
async function saveHKDCategory() {
    const name = document.getElementById('hkdCategoryName').value.trim();
    const description = document.getElementById('hkdCategoryDescription').value.trim();
    
    if (!name) {
        Utils.showToast('Vui lòng nhập tên danh mục', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu danh mục...');
    
    try {
        // Tạo category data
        const categoryId = Utils.generateId();
        const categoryData = {
            id: categoryId,
            hkdId: currentHKD.id,
            name: name,
            description: description,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false,
            _createdBy: 'hkd' // Đánh dấu HKD tự tạo
        };
        
        // 1. Lưu vào IndexedDB (hiển thị ngay)
        await updateInStore(STORES.CATEGORIES, categoryData);
        
        // 2. Cập nhật UI ngay
        categories.push(categoryData);
        updateCategoryList();
        
        // 3. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('hkdCategoryModal'));
        if (modal) modal.hide();
        
        Utils.showToast(`Đã thêm danh mục "${name}"`, 'success');
        
        // 4. Sync lên Firebase (admin sẽ thấy realtime)
        setTimeout(async () => {
            try {
                await initFirebase();
                
                // Cấu trúc chuẩn trên Firebase
                const categoryRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${categoryId}`
                );
                
                const firebaseData = {
                    name: name,
                    description: description,
                    createdAt: categoryData.createdAt,
                    lastUpdated: categoryData.lastUpdated,
                    products: {}, // Node products rỗng
                    _syncedAt: new Date().toISOString(),
                    _createdBy: 'hkd'
                };
                
                await categoryRef.set(firebaseData);
                
                // Đánh dấu đã sync
                categoryData._synced = true;
                categoryData._syncedAt = new Date().toISOString();
                await updateInStore(STORES.CATEGORIES, categoryData);
                
                console.log('✅ HKD đã tạo danh mục trên Firebase');
                
            } catch (firebaseError) {
                console.error('❌ Lỗi sync category:', firebaseError);
                await addToSyncQueue({
                    type: 'categories',
                    data: categoryData
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi thêm danh mục:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}
async function saveHKDProduct() {
    const productData = {
        id: Utils.generateId(),
        msp: document.getElementById('hkdProductCode').value.trim(),
        name: document.getElementById('hkdProductName').value.trim(),
        categoryId: document.getElementById('hkdProductCategory').value,
        unit: document.getElementById('hkdProductUnit').value.trim() || 'cái',
        price: parseFloat(document.getElementById('hkdProductPrice').value) || 0,
        stock: parseInt(document.getElementById('hkdProductStock').value) || 0,
        description: document.getElementById('hkdProductDescription').value.trim(),
        lastUpdated: new Date().toISOString(),
        _synced: false,
        _createdBy: 'hkd'
    };
    
    // Validation
    if (!productData.msp || !productData.name || !productData.categoryId || productData.price <= 0) {
        Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu hàng hóa...');
    
    try {
        // 1. Lưu vào IndexedDB (hiển thị ngay)
        await updateInStore(STORES.PRODUCTS, { ...productData, hkdId: currentHKD.id });
        
        // 2. Cập nhật UI ngay
        products.push({ ...productData, hkdId: currentHKD.id });
        displayProducts();
        
        // 3. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('hkdProductModal'));
        if (modal) modal.hide();
        
        Utils.showToast(`Đã thêm sản phẩm "${productData.name}"`, 'success');
        
        // 4. Sync lên Firebase (admin sẽ thấy realtime)
        setTimeout(async () => {
            try {
                await initFirebase();
                
                // Cấu trúc chuẩn: hkds/{hkdId}/categories/{categoryId}/products/{productId}
                const productRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${productData.categoryId}/products/${productData.id}`
                );
                
                const firebaseData = {
                    msp: productData.msp,
                    name: productData.name,
                    unit: productData.unit,
                    price: productData.price,
                    stock: productData.stock,
                    description: productData.description,
                    lastUpdated: productData.lastUpdated,
                    _syncedAt: new Date().toISOString(),
                    _createdBy: 'hkd'
                };
                
                await productRef.set(firebaseData);
                
                // Đánh dấu đã sync
                productData._synced = true;
                productData._syncedAt = new Date().toISOString();
                await updateInStore(STORES.PRODUCTS, { ...productData, hkdId: currentHKD.id });
                
                console.log('✅ HKD đã tạo sản phẩm trên Firebase');
                
            } catch (firebaseError) {
                console.error('❌ Lỗi sync product:', firebaseError);
                await addToSyncQueue({
                    type: 'products',
                    data: { ...productData, hkdId: currentHKD.id }
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi thêm hàng hóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}
// Load dữ liệu quản lý HKD
async function loadHKDManagementData() {
    try {
        // 1. Load danh mục (chỉ của HKD này)
        const categoriesList = document.getElementById('hkdCategoriesList');
        if (categoriesList) {
            categoriesList.innerHTML = categories.map(category => `
                <div class="col-md-4 mb-3">
                    <div class="card category-management-card">
                        <div class="card-body">
                            <h6 class="card-title">${category.name}</h6>
                            ${category.description ? `<p class="card-text small text-muted">${category.description}</p>` : ''}
                            <div class="mt-2">
                                <small class="text-muted">
                                    <i class="fas fa-box"></i> 
                                    Sản phẩm: ${products.filter(p => p.categoryId === category.id).length}
                                </small>
                            </div>
                            <div class="mt-2">
                                <button class="btn btn-sm btn-outline-danger" 
                                        onclick="deleteHKDCategory('${category.id}')"
                                        ${category._createdBy !== 'hkd' ? 'disabled title="Không thể xóa danh mục của Admin"' : ''}>
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            if (categories.length === 0) {
                categoriesList.innerHTML = `
                    <div class="col-12 text-center py-4">
                        <i class="fas fa-folder-open fa-2x text-muted mb-2"></i>
                        <p class="text-muted">Chưa có danh mục nào</p>
                    </div>
                `;
            }
        }
        
        // 2. Load hàng hóa vào table
        const productsTable = document.getElementById('hkdProductsTable');
        if (productsTable) {
            productsTable.innerHTML = products.map(product => {
                const category = categories.find(c => c.id === product.categoryId);
                const categoryName = category ? category.name : 'Không xác định';
                
                return `
                    <tr>
                        <td><code>${product.msp || ''}</code></td>
                        <td>
                            <strong>${product.name}</strong>
                            ${product.description ? `<br><small class="text-muted">${product.description}</small>` : ''}
                        </td>
                        <td>${categoryName}</td>
                        <td>${Utils.formatCurrency(product.price)}</td>
                        <td>${product.stock || 0}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="editHKDProduct('${product.id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger" 
                                        onclick="deleteHKDProduct('${product.id}')"
                                        ${product._createdBy !== 'hkd' ? 'disabled title="Không thể xóa hàng hóa của Admin"' : ''}>
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
            
            if (products.length === 0) {
                productsTable.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">
                            <i class="fas fa-box-open fa-2x text-muted mb-2"></i>
                            <p class="text-muted">Chưa có hàng hóa nào</p>
                        </td>
                    </tr>
                `;
            }
        }
        
    } catch (error) {
        console.error('❌ Lỗi load dữ liệu quản lý:', error);
    }
}
// Xóa danh mục (HKD chỉ xóa được danh mục tự tạo)
async function deleteHKDCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    // Kiểm tra quyền: chỉ xóa được danh mục tự tạo
    if (category._createdBy !== 'hkd') {
        Utils.showToast('Không thể xóa danh mục của Admin', 'error');
        return;
    }
    
    const confirmed = await Utils.confirm(
        `Xóa danh mục "${category.name}"? Tất cả sản phẩm trong danh mục sẽ bị xóa.`
    );
    if (!confirmed) return;
    
    Utils.showLoading('Đang xóa danh mục...');
    
    try {
        // 1. Xóa sản phẩm trong danh mục
        const categoryProducts = products.filter(p => p.categoryId === categoryId);
        for (const product of categoryProducts) {
            await deleteFromStore(STORES.PRODUCTS, product.id);
        }
        
        // 2. Xóa danh mục
        await deleteFromStore(STORES.CATEGORIES, categoryId);
        
        // 3. Cập nhật UI
        categories = categories.filter(c => c.id !== categoryId);
        products = products.filter(p => p.categoryId !== categoryId);
        
        // Reload cả trang bán hàng và modal quản lý
        displayProducts();
        updateCategoryList();
        await loadHKDManagementData();
        
        Utils.showToast(`Đã xóa danh mục "${category.name}"`, 'success');
        
        // 4. Sync xóa lên Firebase
        setTimeout(async () => {
            try {
                await initFirebase();
                
                // Xóa trên Firebase
                const categoryRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${categoryId}`
                );
                await categoryRef.remove();
                
                console.log('✅ HKD đã xóa danh mục trên Firebase');
                
            } catch (firebaseError) {
                console.error('❌ Lỗi sync delete category:', firebaseError);
                await addToSyncQueue({
                    type: 'categories_delete',
                    data: {
                        id: categoryId,
                        hkdId: currentHKD.id
                    }
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi xóa danh mục:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Hàm gọi điện thoại
function callSupport() {
    const phone = '0932155035';
    
    if (confirm(`Bạn muốn gọi đến số ${phone}?`)) {
        window.location.href = `tel:${phone}`;
    }
}

// Hàm sao chép số điện thoại
function copyPhoneNumber() {
    const phone = '0932155035';
    
    navigator.clipboard.writeText(phone).then(() => {
        Utils.showToast('Đã sao chép số điện thoại', 'success');
    }).catch(err => {
        console.error('Lỗi sao chép:', err);
        Utils.showToast('Lỗi sao chép', 'error');
    });
}
// Xuất các hàm global
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.viewHistoryInvoice = viewHistoryInvoice;
window.toggleSidebar = toggleSidebar;
// Thêm vào cuối hkd.js
window.forceSync = forceSync;
window.syncFromFirebase = syncFromFirebase;
window.cleanupHKD = cleanupHKD;

// Dọn dẹp khi page unload
window.addEventListener('beforeunload', cleanupHKD);
window.addEventListener('pagehide', cleanupHKD);