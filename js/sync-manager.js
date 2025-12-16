// Sync Manager - Đồng bộ giữa IndexedDB và Firebase
let syncInProgress = false;
let syncInterval = null;
let isSyncing = false; // For HKD

// ========== KHỞI TẠO SYNC MANAGER ==========
function initSyncManager() {
    console.log('🔄 Khởi tạo Sync Manager...');
    
    // Kiểm tra user role
    const user = getCurrentUser();
    if (!user) {
        console.log('⚠️ Chưa đăng nhập, bỏ qua Sync Manager');
        return;
    }
    
    if (user.role === 'hkd') {
        console.log('⚠️ HKD page - Sync Manager không cần thiết');
        return; // HKD sẽ tự quản lý sync trong hkd.js
    }
    
    // CHỈ Admin mới chạy phần này
    console.log(`👤 User role: ${user.role}, khởi tạo Sync Manager...`);
    
    // Kiểm tra kết nối mạng
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    
    // Bắt đầu sync interval (mỗi 30 giây) - CHỈ CHO ADMIN
    syncInterval = setInterval(() => {
        if (navigator.onLine && !syncInProgress) {
            smartSync();
        }
    }, 30000);
    
    // Kiểm tra và sync nếu dữ liệu trống
    setTimeout(() => {
        checkAndSyncIfEmpty();
        validateAndFixData();
    }, 3000);
    
    // Lắng nghe realtime updates - CHỈ CHO ADMIN
    if (navigator.onLine) {
        setTimeout(listenForRealtimeUpdates, 2000);
    }
    
    console.log('✅ Sync Manager đã sẵn sàng cho Admin');
}

// Xử lý thay đổi kết nối
function handleConnectionChange() {
    if (navigator.onLine) {
        console.log('🌐 Đã kết nối mạng, bắt đầu đồng bộ...');
        smartSync();
        listenForRealtimeUpdates();
    } else {
        console.log('📴 Mất kết nối mạng, làm việc offline...');
    }
}

// ========== SMART SYNC ==========
async function smartSync() {
    console.log('🧠 Smart sync đang chạy...');
    
    if (syncInProgress) return;
    syncInProgress = true;
    
    try {
        // 1. Kiểm tra lần sync cuối
        const lastSync = await getLastSyncTime('full_sync');
        const now = new Date();
        const hoursSinceLastSync = lastSync ? 
            (now - new Date(lastSync)) / (1000 * 60 * 60) : 999;
        
        // 2. Nếu quá 1 giờ chưa sync, thực hiện full sync
        if (hoursSinceLastSync > 1) {
            console.log('🕒 Đã lâu chưa sync, thực hiện full sync...');
            await fullSyncFromFirebase();
        } else {
            // 3. Ngược lại, chỉ sync incremental
            console.log('⚡ Sync incremental...');
            await incrementalSync();
        }
        
        // 4. Đồng bộ local changes lên Firebase
        await syncLocalChangesToFirebase();
        
        // 5. Kiểm tra và sửa dữ liệu
        await validateAndFixData();
        
        console.log('✅ Smart sync hoàn tất');
        
    } catch (error) {
        console.error('❌ Lỗi smart sync:', error);
    } finally {
        syncInProgress = false;
    }
}

// Full sync: tải toàn bộ dữ liệu
async function fullSyncFromFirebase() {
    await initialSyncFromFirebase();
    await updateLastSyncTime('full_sync', new Date().toISOString());
}

// Incremental sync: chỉ tải dữ liệu mới/thay đổi
async function incrementalSync() {
    try {
        const storesToSync = ['hkds', 'categories', 'products', 'invoices'];
        
        for (const storeName of storesToSync) {
            await syncStoreFromFirebase(storeName);
        }
        
        console.log('✅ Incremental sync hoàn tất');
    } catch (error) {
        console.error('❌ Lỗi incremental sync:', error);
    }
}

// ========== KIỂM TRA VÀ SỬA DỮ LIỆU ==========
async function checkAndSyncIfEmpty() {
    console.log('🔍 Kiểm tra dữ liệu local...');
    
    try {
        const allHKDs = await getAllHKDs();
        const allProducts = await getAllFromStore(STORES.PRODUCTS);
        
        if (allHKDs.length === 0 && allProducts.length === 0 && navigator.onLine) {
            console.log('📭 IndexedDB trống, thực hiện initial sync...');
            await initialSyncFromFirebase();
        }
        
    } catch (error) {
        console.error('❌ Lỗi kiểm tra dữ liệu:', error);
    }
}

async function validateAndFixData() {
    console.log('🔧 Kiểm tra và sửa lỗi dữ liệu...');
    
    try {
        // 1. Kiểm tra sản phẩm không có categoryId
        const allProducts = await getAllFromStore(STORES.PRODUCTS);
        const productsWithoutCategory = allProducts.filter(p => !p.categoryId);
        
        if (productsWithoutCategory.length > 0) {
            console.warn(`⚠️ Tìm thấy ${productsWithoutCategory.length} sản phẩm không có categoryId`);
            
            const hkdIds = [...new Set(productsWithoutCategory.map(p => p.hkdId))];
            
            for (const hkdId of hkdIds) {
                const otherCategory = await findOrCreateOtherCategory(hkdId);
                
                for (const product of productsWithoutCategory.filter(p => p.hkdId === hkdId)) {
                    product.categoryId = otherCategory.id;
                    product.lastUpdated = new Date().toISOString();
                    await updateInStore(STORES.PRODUCTS, product);
                    
                    console.log(`✅ Đã gán ${product.name} vào category "Khác"`);
                }
            }
        }
        
        // 2. Kiểm tra categories không có HKD
        const allCategories = await getAllFromStore(STORES.CATEGORIES);
        const allHKDs = await getAllHKDs();
        const hkdIds = allHKDs.map(h => h.id);
        
        const orphanCategories = allCategories.filter(c => !hkdIds.includes(c.hkdId));
        if (orphanCategories.length > 0) {
            console.warn(`⚠️ Tìm thấy ${orphanCategories.length} categories không có HKD cha`);
            
            for (const category of orphanCategories) {
                await deleteFromStore(STORES.CATEGORIES, category.id);
            }
        }
        
        console.log('✅ Hoàn tất kiểm tra dữ liệu');
        
    } catch (error) {
        console.error('❌ Lỗi kiểm tra dữ liệu:', error);
    }
}

async function findOrCreateOtherCategory(hkdId) {
    const categories = await getCategoriesByHKD(hkdId);
    let otherCategory = categories.find(c => c.name === 'Khác');
    
    if (!otherCategory) {
        otherCategory = {
            id: Utils.generateId(),
            hkdId: hkdId,
            name: 'Khác',
            description: 'Sản phẩm chưa phân loại',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false
        };
        
        await updateInStore(STORES.CATEGORIES, otherCategory);
        
        // Sync lên Firebase
        setTimeout(async () => {
            try {
                await initFirebase();
                const categoryRef = firebase.database().ref(
                    `hkds/${hkdId}/categories/${otherCategory.id}`
                );
                await categoryRef.set({
                    name: 'Khác',
                    description: 'Sản phẩm chưa phân loại',
                    createdAt: otherCategory.createdAt,
                    lastUpdated: otherCategory.lastUpdated,
                    products: {},
                    _syncedAt: new Date().toISOString()
                });
            } catch (error) {
                console.error('❌ Lỗi sync category "Khác":', error);
            }
        }, 100);
    }
    
    return otherCategory;
}

// ========== INITIAL SYNC ==========
async function initialSyncFromFirebase() {
    console.log('🚀 Bắt đầu initial sync từ Firebase...');
    
    try {
        await initFirebase();
        
        const hkdsRef = firebase.database().ref('hkds');
        const snapshot = await hkdsRef.once('value');
        const allHKDsFromFirebase = snapshot.val();
        
        if (!allHKDsFromFirebase) {
            console.log('📭 Firebase trống, không có dữ liệu');
            return;
        }
        
        console.log(`📥 Tìm thấy ${Object.keys(allHKDsFromFirebase).length} HKD trên Firebase`);
        
        let totalSynced = 0;
        
        for (const [hkdId, hkdData] of Object.entries(allHKDsFromFirebase)) {
            if (!hkdData || !hkdData.info) continue;
            
            console.log(`🔄 Đang sync HKD: ${hkdData.info.name || hkdId}`);
            
            try {
                await syncHKDInfo(hkdId, hkdData.info);
                
                if (hkdData.categories) {
                    await syncCategoriesAndProducts(hkdId, hkdData.categories);
                }
                
                if (hkdData.invoices) {
                    await syncInvoices(hkdId, hkdData.invoices);
                }
                
                totalSynced++;
                
            } catch (hkdError) {
                console.error(`❌ Lỗi sync HKD ${hkdId}:`, hkdError);
            }
        }
        
        await updateLastSyncTime('initial_sync', new Date().toISOString());
        
        console.log(`✅ Đã sync ${totalSynced} HKD từ Firebase`);
        
        if (typeof window.onInitialSyncComplete === 'function') {
            window.onInitialSyncComplete();
        }
        
        Utils.showToast(`Đã tải ${totalSynced} HKD từ Firebase`, 'success');
        
    } catch (error) {
        console.error('❌ Lỗi initial sync:', error);
        throw error;
    }
}

async function syncHKDInfo(hkdId, hkdInfo) {
    const hkdToSave = {
        id: hkdId,
        name: hkdInfo.name || '',
        phone: hkdInfo.phone || '',
        address: hkdInfo.address || '',
        password: hkdInfo.password || '',
        role: 'hkd',
        createdAt: hkdInfo.createdAt || new Date().toISOString(),
        lastUpdated: hkdInfo.lastUpdated || new Date().toISOString(),
        _synced: true
    };
    
    await updateInStore(STORES.HKDS, hkdToSave);
}

async function syncCategoriesAndProducts(hkdId, categoriesData) {
    if (!categoriesData) return;
    
    for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
        if (!categoryData || !categoryData.name) continue;
        
        const categoryToSave = {
            id: categoryId,
            hkdId: hkdId,
            name: categoryData.name,
            description: categoryData.description || '',
            createdAt: categoryData.createdAt || new Date().toISOString(),
            lastUpdated: categoryData.lastUpdated || new Date().toISOString(),
            _synced: true,
            _source: 'firebase'
        };
        
        await updateInStore(STORES.CATEGORIES, categoryToSave);
        
        if (categoryData.products && typeof categoryData.products === 'object') {
            for (const [productId, productData] of Object.entries(categoryData.products)) {
                if (!productData || !productData.name) continue;
                
                const productToSave = {
                    id: productId,
                    hkdId: hkdId,
                    categoryId: categoryId,
                    msp: productData.msp || '',
                    name: productData.name,
                    unit: productData.unit || 'cái',
                    price: productData.price || 0,
                    stock: productData.stock || 0,
                    description: productData.description || '',
                    note: productData.note || '',
                    lastUpdated: productData.lastUpdated || new Date().toISOString(),
                    _synced: true,
                    _source: 'firebase'
                };
                
                await updateInStore(STORES.PRODUCTS, productToSave);
            }
        }
    }
}

async function syncInvoices(hkdId, invoicesData) {
    if (!invoicesData) return;
    
    for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
        if (!invoiceData || invoiceData._deleted === true) continue;
        
        const invoiceToSave = {
            id: invoiceId,
            hkdId: hkdId,
            hkdName: invoiceData.hkdName || '',
            customerName: invoiceData.customerName || 'Khách lẻ',
            date: invoiceData.date || new Date().toISOString(),
            items: invoiceData.items || [],
            total: invoiceData.total || 0,
            status: invoiceData.status || 'completed',
            lastUpdated: invoiceData.lastUpdated || new Date().toISOString(),
            _synced: true
        };
        
        await updateInStore(STORES.INVOICES, invoiceToSave);
    }
}

// ========== STORE SYNC FUNCTIONS ==========
async function syncStoreFromFirebase(storeName) {
    console.log(`📊 Đồng bộ store: ${storeName}`);
    
    try {
        await initFirebase();
        const allHKDs = await getAllFromStore(STORES.HKDS);
        
        for (const hkd of allHKDs) {
            if (hkd.role !== 'hkd') continue;
            const hkdId = hkd.id;
            
            if (storeName === 'hkds') {
                await syncHKDInfoFromFirebase(hkdId);
            } else if (storeName === 'categories') {
                await syncCategoriesFromFirebaseGlobal(hkdId);
            } else if (storeName === 'products') {
                await syncProductsFromFirebaseGlobal(hkdId);
            } else if (storeName === 'invoices') {
                await syncInvoicesFromFirebaseGlobal(hkdId);
            }
        }
        
        await updateLastSyncTime(storeName);
        console.log(`✅ Đã sync ${storeName} từ Firebase`);
        
    } catch (error) {
        console.error(`❌ Lỗi sync ${storeName} từ Firebase:`, error);
    }
}

async function syncHKDInfoFromFirebase(hkdId) {
    try {
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const snapshot = await hkdRef.once('value');
        const hkdData = snapshot.val();
        
        if (hkdData) {
            const localHKD = await getFromStore(STORES.HKDS, hkdId);
            
            if (!localHKD || new Date(hkdData.lastUpdated) > new Date(localHKD.lastUpdated)) {
                await updateInStore(STORES.HKDS, {
                    ...hkdData,
                    id: hkdId,
                    role: 'hkd'
                });
                console.log(`✅ Đã cập nhật thông tin HKD ${hkdId}`);
            }
        }
    } catch (error) {
        console.error(`❌ Lỗi sync HKD info ${hkdId}:`, error);
    }
}

async function syncCategoriesFromFirebaseGlobal(hkdId) {
    try {
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (categoryData && categoryData.name && !categoryData.msp) {
                    if (categoryData._deleted === true) {
                        await deleteFromStore(STORES.CATEGORIES, categoryId);
                        console.log(`🗑️ Đã xóa danh mục ${categoryId} (từ Firebase)`);
                        continue;
                    }
                    
                    const localCategory = await getFromStore(STORES.CATEGORIES, categoryId);
                    
                    if (localCategory && localCategory._deleted === true) {
                        console.log(`⚠️ Bỏ qua danh mục ${categoryId} - đã bị xóa bởi Admin`);
                        continue;
                    }
                    
                    if (!localCategory || new Date(categoryData.lastUpdated) > new Date(localCategory.lastUpdated)) {
                        await updateInStore(STORES.CATEGORIES, {
                            ...categoryData,
                            id: categoryId,
                            hkdId: hkdId
                        });
                        console.log(`✅ Đã cập nhật danh mục ${categoryId}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`❌ Lỗi sync categories ${hkdId}:`, error);
    }
}

async function syncProductsFromFirebaseGlobal(products) {
    if (!products || !Array.isArray(products)) return;
    
    console.log(`📦 Đang đồng bộ ${products.length} sản phẩm...`);
    
    for (const product of products) {
        try {
            // Chuẩn hóa ID để tránh trùng lặp giữa các HKD
            const uniqueId = product.id || `${product.hkdId}_${product.msp}`;
            
            const productToSave = {
                ...product,
                id: uniqueId,
                _synced: true,
                lastUpdated: new Date().toISOString()
            };
            
            await updateInStore(STORES.PRODUCTS, productToSave);
        } catch (err) {
            // Lỗi này giờ đây sẽ không làm dừng cả quá trình sync nữa
            console.warn(`⚠️ Bỏ qua sản phẩm lỗi: ${product.msp}`, err.message);
        }
    }
}

async function syncInvoicesFromFirebaseGlobal(hkdId) {
    try {
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        const snapshot = await invoicesRef.once('value');
        const invoicesData = snapshot.val();
        
        if (invoicesData) {
            for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
                const localInvoice = await getFromStore(STORES.INVOICES, invoiceId);
                
                if (invoiceData._deleted === true) {
                    await deleteFromStore(STORES.INVOICES, invoiceId);
                    console.log(`🗑️ Đã xóa hóa đơn ${invoiceId} (từ Firebase)`);
                    continue;
                }
                
                if (!localInvoice || new Date(invoiceData.lastUpdated) > new Date(localInvoice.lastUpdated)) {
                    await updateInStore(STORES.INVOICES, {
                        ...invoiceData,
                        id: invoiceId,
                        hkdId: hkdId
                    });
                    console.log(`✅ Đã cập nhật hóa đơn ${invoiceId}`);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Lỗi sync invoices ${hkdId}:`, error);
    }
}

// ========== SYNC QUEUE FUNCTIONS ==========
async function syncLocalChangesToFirebase() {
    console.log('🔄 Đồng bộ thay đổi local lên Firebase...');
    
    try {
        const pendingItems = await getPendingSyncItems();
        
        console.log(`📋 Có ${pendingItems.length} mục cần đồng bộ`);
        
        if (pendingItems.length === 0) {
            console.log('✅ Không có gì cần sync');
            return;
        }
        
        for (const item of pendingItems) {
            try {
                console.log(`📤 Processing: ${item.type} - ${item.data?.id}`);
                await syncItemToFirebase(item);
                await updateSyncItemStatus(item.id, 'synced');
                console.log(`✅ Đã sync thành công: ${item.id}`);
            } catch (error) {
                console.error(`❌ Lỗi sync item ${item.id}:`, error);
                await updateSyncItemStatus(item.id, 'error');
            }
        }
        
        console.log('✅ Đã hoàn tất sync local changes');
    } catch (error) {
        console.error('❌ Lỗi tổng quát sync local changes:', error);
    }
}

async function syncItemToFirebase(item) {
    console.log('🔄 Đang sync item lên Firebase:', item.type, item.data?.id || 'no-id');
    
    if (!window.firebaseApp) {
        try {
            await initFirebase();
        } catch (initError) {
            console.error('❌ Không thể khởi tạo Firebase:', initError);
            throw new Error('Firebase initialization failed');
        }
    }
    
    const { type, data } = item;
    
    if (!data || typeof data !== 'object') {
        console.error('❌ Dữ liệu không hợp lệ:', data);
        throw new Error('Invalid data format');
    }
    
    if (!data.id && type !== 'hkds') {
        console.error('❌ Thiếu ID trong dữ liệu:', data);
        throw new Error('Missing item ID');
    }
    
    try {
        let hkdId = data.hkdId;
        
        if (type === 'hkds' || type === 'hkds_delete') {
            hkdId = data.id;
        }
        
        if (!hkdId) {
            console.error('❌ Không tìm thấy hkdId:', { type, data });
            throw new Error('Missing hkdId');
        }
        
        console.log(`📤 Syncing ${type} for HKD: ${hkdId}`);
        
        if (type.endsWith('_delete')) {
            const baseType = type.replace('_delete', '');
            await handleSoftDelete(baseType, hkdId, data);
            return;
        }
        
        if (type === 'products' && data.oldCategoryId && data.oldCategoryId !== data.categoryId) {
            await handleProductCategoryChange(hkdId, data);
            return;
        }
        
        await handleNormalSync(type, hkdId, data);
        
    } catch (error) {
        console.error('❌ Lỗi sync item:', {
            type: item.type,
            dataId: item.data?.id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function handleSoftDelete(baseType, hkdId, data) {
    try {
        await initFirebase();
        
        if (baseType === 'hkds') {
            const hkdRef = firebase.database().ref(`hkds/${hkdId}`);
            await hkdRef.update({
                _deleted: true,
                _deletedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
            
        } else if (baseType === 'categories') {
            const categoryRef = firebase.database().ref(`hkds/${hkdId}/categories/${data.id}`);
            await categoryRef.update({
                _deleted: true,
                _deletedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
            
        } else if (baseType === 'products') {
            const productRef = firebase.database().ref(
                `hkds/${hkdId}/categories/${data.categoryId}/products/${data.id}`
            );
            await productRef.update({
                _deleted: true,
                _deletedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
        }
        
        console.log(`✅ Đã xóa mềm ${baseType} ${data.id} trên Firebase`);
        
    } catch (error) {
        console.error(`❌ Lỗi xóa mềm ${baseType}:`, error);
        throw error;
    }
}

async function handleProductCategoryChange(hkdId, data) {
    try {
        await initFirebase();
        
        // Xóa sản phẩm cũ ở danh mục cũ
        const oldProductRef = firebase.database().ref(
            `hkds/${hkdId}/categories/${data.oldCategoryId}/products/${data.id}`
        );
        await oldProductRef.remove();
        
        // Thêm sản phẩm vào danh mục mới
        const newProductRef = firebase.database().ref(
            `hkds/${hkdId}/categories/${data.categoryId}/products/${data.id}`
        );
        
        await newProductRef.set({
            msp: data.msp,
            name: data.name,
            unit: data.unit,
            price: data.price,
            stock: data.stock,
            cost: data.cost,
            description: data.description,
            note: data.note,
            lastUpdated: data.lastUpdated,
            _syncedAt: new Date().toISOString()
        });
        
        console.log(`✅ Đã đổi danh mục sản phẩm ${data.id}`);
        
    } catch (error) {
        console.error('❌ Lỗi đổi danh mục sản phẩm:', error);
        throw error;
    }
}

async function handleNormalSync(type, hkdId, data) {
    try {
        await initFirebase();
        
        if (type === 'hkds') {
            const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
            await hkdRef.set({
                name: data.name,
                phone: data.phone,
                address: data.address,
                password: data.password,
                createdAt: data.createdAt || new Date().toISOString(),
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                _syncedAt: new Date().toISOString()
            });
            
        } else if (type === 'categories') {
            const categoryRef = firebase.database().ref(
                `hkds/${hkdId}/categories/${data.id}`
            );
            await categoryRef.set({
                name: data.name,
                description: data.description || '',
                createdAt: data.createdAt || new Date().toISOString(),
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                products: {},
                _syncedAt: new Date().toISOString()
            });
            
        } else if (type === 'products') {
            const productRef = firebase.database().ref(
                `hkds/${hkdId}/categories/${data.categoryId}/products/${data.id}`
            );
            await productRef.set({
                msp: data.msp,
                name: data.name,
                unit: data.unit,
                price: data.price,
                stock: data.stock,
                cost: data.cost,
                description: data.description,
                note: data.note,
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                _syncedAt: new Date().toISOString()
            });
            
        } else if (type === 'invoices') {
            const invoiceRef = firebase.database().ref(
                `hkds/${hkdId}/invoices/${data.id}`
            );
            await invoiceRef.set({
                ...data,
                lastUpdated: new Date().toISOString(),
                _syncedAt: new Date().toISOString()
            });
        }
        
        console.log(`✅ Đã sync ${type} ${data.id} lên Firebase`);
        
    } catch (error) {
        console.error(`❌ Lỗi sync ${type}:`, error);
        throw error;
    }
}

// [sync-manager.js] - Cập nhật logic Realtime
let isRealtimeListening = false; // <--- THÊM BIẾN NÀY
async function listenForRealtimeUpdates() {
    // Kiểm tra nếu đã lắng nghe rồi thì dừng lại ngay
    if (isRealtimeListening) {
        console.log('🎧 Đã đang lắng nghe realtime, bỏ qua...');
        return;
    }

    console.log('🎧 Bắt đầu lắng nghe realtime updates...');
    
    if (!navigator.onLine) return;
    if (!window.firebaseApp) await initFirebase();

    // Đánh dấu là đang lắng nghe
    isRealtimeListening = true; 

    const hkdsRef = firebase.database().ref('hkds');

    // 1. LẮNG NGHE HKD MỚI/CẬP NHẬT
    hkdsRef.on('child_added', async (snapshot) => {
        const hkdId = snapshot.key;
        const hkdData = snapshot.val();

        if (!hkdData || !hkdData.info) return;

        // Kiểm tra xem đã có trong local chưa
        const existing = await getFromStore(STORES.HKDS, hkdId);
        
        // Chuẩn hóa dữ liệu
        const hkdObj = {
            id: hkdId,
            name: hkdData.info.name || '',
            phone: hkdData.info.phone || '',
            address: hkdData.info.address || '',
            role: 'hkd',
            lastUpdated: hkdData.info.lastUpdated || new Date().toISOString(),
            _synced: true
        };

        if (!existing) {
            console.log(`🆕 Realtime: HKD Mới - ${hkdObj.name}`);
            await updateInStore(STORES.HKDS, hkdObj);
            
            // Gắn listener hóa đơn cho HKD mới này ngay lập tức!
            setupInvoiceListenerForHKD(hkdObj);

            // GỌI ADMIN UI HANDLE
            if (typeof window.handleAdminRealtimeHKD === 'function') {
                window.handleAdminRealtimeHKD(hkdObj);
            }
        }
    });

    // 2. LẮNG NGHE HÓA ĐƠN CỦA TẤT CẢ HKD HIỆN CÓ
    const allHKDs = await getAllHKDs();
    for (const hkd of allHKDs) {
        if (hkd.role === 'hkd') {
            setupInvoiceListenerForHKD(hkd);
        }
    }
}

function setupInvoiceListenerForHKD(hkd) {
    const hkdId = hkd.id;
    // Chỉ lấy 1 hóa đơn mới nhất được thêm vào để tối ưu hiệu năng
    const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);

    invoicesRef.limitToLast(1).on('child_added', async (snapshot) => {
        const invoiceId = snapshot.key;
        const newInvoice = snapshot.val();

        if (!newInvoice) return;

        // Kiểm tra trùng lặp trong IndexedDB
        const existing = await getFromStore(STORES.INVOICES, invoiceId);
        if (existing) return; // Đã có rồi thì bỏ qua

        console.log(`📨 Realtime: Hóa đơn mới từ ${hkd.name}`);

        const invoiceToSave = {
            ...newInvoice,
            id: invoiceId,
            hkdId: hkdId,
            hkdName: newInvoice.hkdName || hkd.name, // Đảm bảo có tên HKD
            _synced: true
        };

        // 1. Lưu vào DB
        await updateInStore(STORES.INVOICES, invoiceToSave);

        // 2. GỌI ADMIN UI HANDLE (Hiển thị ngay lập tức)
        if (typeof window.handleAdminRealtimeInvoice === 'function') {
            window.handleAdminRealtimeInvoice(invoiceToSave);
        }
    });
}




async function setupInvoiceListenerForNewHKD(hkdId) {
    try {
        console.log(`🎧 Thiết lập listener hóa đơn cho HKD mới: ${hkdId}`);
        
        await initFirebase();
        
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        
        invoicesRef.orderByChild('lastUpdated').limitToLast(50).on('child_added', async (snapshot) => {
            const newInvoice = snapshot.val();
            const invoiceId = snapshot.key;
            
            if (!newInvoice || !invoiceId) return;
            
            console.log(`📨 Hóa đơn mới từ HKD mới ${hkdId}: ${invoiceId}`);
            
            const existing = await getFromStore(STORES.INVOICES, invoiceId);
            if (!existing) {
                const invoiceToSave = {
                    ...newInvoice,
                    id: invoiceId,
                    hkdId: hkdId,
                    _synced: true
                };
                
                await updateInStore(STORES.INVOICES, invoiceToSave);
                
                if (typeof window.handleNewInvoiceFromRealtime === 'function') {
                    window.handleNewInvoiceFromRealtime(invoiceToSave);
                }
            }
        });
        
        console.log(`✅ Đã thiết lập listener cho HKD ${hkdId}`);
        
    } catch (error) {
        console.error(`❌ Lỗi thiết lập listener cho HKD ${hkdId}:`, error);
    }
}

// ========== HKD SPECIFIC FUNCTIONS ==========
function initHKDRealtimeSync() {
    console.log('🔔 Khởi tạo realtime sync cho HKD...');
    
    window.addEventListener('online', handleHKDConnectionChange);
    window.addEventListener('offline', handleHKDConnectionChange);
    
    console.log('✅ Đã khởi tạo HKD realtime sync');
}

function handleHKDConnectionChange() {
    if (navigator.onLine) {
        console.log('🌐 HKD đã kết nối mạng, đồng bộ dữ liệu...');
        smartSync();
    } else {
        console.log('📴 HKD mất kết nối, làm việc offline...');
    }
}

async function syncHKDDataFromFirebase(hkdId) {
    try {
        await initFirebase();
        
        // Sync HKD info
        await syncHKDInfoFromFirebase(hkdId);
        
        // Sync categories
        await syncCategoriesFromFirebaseForHKD(hkdId);
        
        // Sync products
        await syncProductsFromFirebaseForHKD(hkdId);
        
        // Sync invoices
        await syncInvoicesFromFirebaseForHKD(hkdId);
        
    } catch (error) {
        console.error('❌ Lỗi sync toàn bộ dữ liệu HKD:', error);
        throw error;
    }
}

async function syncCategoriesFromFirebaseForHKD(hkdId) {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (categoryData && categoryData.name && !categoryData.msp) {
                    
                    if (categoryData._deleted === true) {
                        await deleteFromStore(STORES.CATEGORIES, categoryId);
                        
                        const productsInCategory = await getProductsByCategory(hkdId, categoryId);
                        for (const product of productsInCategory) {
                            await deleteFromStore(STORES.PRODUCTS, product.id);
                        }
                        
                        deletedCount++;
                        continue;
                    }
                    
                    const localCategory = await getFromStore(STORES.CATEGORIES, categoryId);
                    
                    if (localCategory && localCategory._deleted === true) {
                        console.log(`⚠️ Bỏ qua danh mục ${categoryId} - đã bị xóa bởi Admin`);
                        continue;
                    }
                    
                    if (!localCategory || new Date(categoryData.lastUpdated) > new Date(localCategory.lastUpdated)) {
                        await updateInStore(STORES.CATEGORIES, {
                            ...categoryData,
                            id: categoryId,
                            hkdId: hkdId,
                            _isFromFirebase: true
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

async function syncProductsFromFirebaseForHKD(hkdId) {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [categoryId, categoryOrProducts] of Object.entries(categoriesData)) {
                for (const [itemId, itemData] of Object.entries(categoryOrProducts)) {
                    if (itemData && itemData.msp) {
                        
                        if (itemData._deleted === true) {
                            await deleteFromStore(STORES.PRODUCTS, itemId);
                            deletedCount++;
                            continue;
                        }
                        
                        const localProduct = await getFromStore(STORES.PRODUCTS, itemId);
                        
                        if (localProduct && localProduct._deleted === true) {
                            console.log(`⚠️ Bỏ qua sản phẩm ${itemId} - đã bị xóa bởi Admin`);
                            continue;
                        }
                        
                        if (!localProduct || new Date(itemData.lastUpdated) > new Date(localProduct.lastUpdated)) {
                            await updateInStore(STORES.PRODUCTS, {
                                ...itemData,
                                id: itemId,
                                hkdId: hkdId,
                                categoryId: categoryId,
                                _isFromFirebase: true
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

async function syncInvoicesFromFirebaseForHKD(hkdId) {
    try {
        await initFirebase();
        
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        const snapshot = await invoicesRef.once('value');
        const invoicesData = snapshot.val();
        
        if (invoicesData) {
            let updatedCount = 0;
            let deletedCount = 0;
            
            for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
                
                if (invoiceData._deleted === true) {
                    await deleteFromStore(STORES.INVOICES, invoiceId);
                    deletedCount++;
                    continue;
                }
                
                const localInvoice = await getFromStore(STORES.INVOICES, invoiceId);
                
                if (!localInvoice || new Date(invoiceData.lastUpdated) > new Date(localInvoice.lastUpdated)) {
                    await updateInStore(STORES.INVOICES, {
                        ...invoiceData,
                        id: invoiceId,
                        hkdId: hkdId
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

async function listenForHKDRealtimeUpdates(currentHKD) {
    console.log('🎧 Bắt đầu lắng nghe realtime updates cho HKD...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, không thể lắng nghe');
        return;
    }
    
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${currentHKD.id}/categories`);
        
        // Khi danh mục bị xóa (Admin xóa danh mục)
        categoriesRef.on('child_removed', async (snapshot) => {
            const categoryId = snapshot.key;
            console.log(`🗑️ [REALTIME] Danh mục ${categoryId} đã bị xóa từ Admin`);
            
            await deleteFromStore(STORES.CATEGORIES, categoryId);
            
            const products = await getProductsByHKD(currentHKD.id);
            const categoryProducts = products.filter(p => p.categoryId === categoryId);
            
            for (const product of categoryProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
            
            console.log(`✅ Đã xóa ${categoryProducts.length} sản phẩm trong danh mục`);
            
            if (typeof window.loadHKDData === 'function') {
                await window.loadHKDData();
            }
            
            if (typeof window.displayProducts === 'function') {
                window.displayProducts();
            }
            
            if (typeof window.updateCategoryList === 'function') {
                window.updateCategoryList();
            }
        });
        
        // Khi có danh mục mới
        categoriesRef.on('child_added', async (snapshot) => {
            const categoryId = snapshot.key;
            const categoryData = snapshot.val();
            
            console.log(`🆕 [REALTIME] Danh mục mới ${categoryId}: "${categoryData?.name}"`);
            
            await updateInStore(STORES.CATEGORIES, {
                id: categoryId,
                hkdId: currentHKD.id,
                name: categoryData.name,
                description: categoryData.description || '',
                createdAt: categoryData.createdAt || new Date().toISOString(),
                lastUpdated: categoryData.lastUpdated || new Date().toISOString(),
                _synced: true
            });
            
            await setupProductListenersForCategory(categoryId, currentHKD.id);
            
            if (typeof window.loadHKDData === 'function') {
                await window.loadHKDData();
            }
            
            if (typeof window.updateCategoryList === 'function') {
                window.updateCategoryList();
            }
        });
        
        const categoriesSnapshot = await categoriesRef.once('value');
        const categoriesData = categoriesSnapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (!categoryData || !categoryData.name) continue;
                await setupProductListenersForCategory(categoryId, currentHKD.id);
            }
        }
        
        console.log('✅ Đã bật realtime listener cho HKD');
        
    } catch (error) {
        console.error('❌ Lỗi khi lắng nghe realtime updates:', error);
    }
}

async function setupProductListenersForCategory(categoryId, hkdId) {
    try {
        await initFirebase();
        
        const productsRef = firebase.database().ref(
            `hkds/${hkdId}/categories/${categoryId}/products`
        );
        
        // Khi hàng hóa bị xóa
        productsRef.on('child_removed', async (snapshot) => {
            const productId = snapshot.key;
            console.log(`🗑️ [REALTIME] Sản phẩm ${productId} đã bị xóa từ Admin`);
            
            await deleteFromStore(STORES.PRODUCTS, productId);
            
            if (typeof window.loadHKDData === 'function') {
                await window.loadHKDData();
            }
            
            if (typeof window.displayProducts === 'function') {
                window.displayProducts();
            }
        });
        
        // Khi hàng hóa thay đổi
        productsRef.on('child_changed', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            console.log(`🔄 [REALTIME] Sản phẩm ${productId} đã thay đổi:`, productData?.name);
            
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: hkdId,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            if (typeof window.loadHKDData === 'function') {
                await window.loadHKDData();
            }
            
            if (typeof window.displayProducts === 'function') {
                window.displayProducts();
            }
        });
        
        // Khi có hàng hóa mới
        productsRef.on('child_added', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            console.log(`🆕 [REALTIME] Sản phẩm mới ${productId}:`, productData?.name);
            
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: hkdId,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            if (typeof window.loadHKDData === 'function') {
                await window.loadHKDData();
            }
            
            if (typeof window.displayProducts === 'function') {
                window.displayProducts();
            }
        });
        
        console.log(`✅ Đã thiết lập product listeners cho danh mục ${categoryId}`);
        
    } catch (error) {
        console.error(`❌ Lỗi thiết lập listener cho danh mục ${categoryId}:`, error);
    }
}

// ========== NOTIFICATION FUNCTIONS ==========
function showNewInvoiceNotification(invoice) {
    playNotificationSound();
    showToastNotification(invoice);
    showBrowserNotification(invoice);
}

function showNewHKDNotification(hkdData) {
    playNewHKDNotificationSound();
    
    const toastId = 'toast-hkd-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast-notification show" style="
            position: fixed;
            top: 80px;
            right: 20px;
            min-width: 300px;
            background: #10b981;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        ">
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-store" style="font-size: 18px;"></i>
                    <strong>HKD MỚI ĐĂNG KÝ</strong>
                </div>
                <button onclick="document.getElementById('${toastId}').remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 16px;">
                <div style="margin-bottom: 8px;">
                    <strong>${hkdData.name}</strong> vừa đăng ký
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    <i class="fas fa-phone"></i> ${hkdData.phone || 'Chưa có số'}
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    <i class="fas fa-map-marker-alt"></i> ${hkdData.address || 'Chưa có địa chỉ'}
                </div>
                <button onclick="if (typeof window.switchAdminView === 'function') { window.switchAdminView('hkds'); } document.getElementById('${toastId}').remove()" style="
                    margin-top: 12px;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">
                    <i class="fas fa-eye"></i> Xem chi tiết
                </button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    
    setTimeout(() => {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

function playNewHKDNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        if (!window.hkdAudioContext) {
            window.hkdAudioContext = new AudioContext();
        }
        
        const ctx = window.hkdAudioContext;
        
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                createHKDNotificationSound(ctx);
            });
        } else {
            createHKDNotificationSound(ctx);
        }
        
    } catch (error) {
        console.log('HKD notification sound error:', error.message);
    }
}

function createHKDNotificationSound(ctx) {
    const oscillator1 = ctx.createOscillator();
    const oscillator2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator1.frequency.setValueAtTime(349.23, ctx.currentTime);
    oscillator2.frequency.setValueAtTime(440.00, ctx.currentTime);
    oscillator1.type = 'sine';
    oscillator2.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    
    oscillator1.start();
    oscillator2.start();
    oscillator1.stop(ctx.currentTime + 0.8);
    oscillator2.stop(ctx.currentTime + 0.8);
    
    setTimeout(() => {
        oscillator1.disconnect();
        oscillator2.disconnect();
        gainNode.disconnect();
    }, 900);
}

let audioContext = null;

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.log('Web Audio API not supported');
            return;
        }
        
        if (!audioContext) {
            audioContext = new AudioContext();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed');
                createAndPlaySound();
            }).catch(err => {
                console.log('Failed to resume AudioContext:', err);
                playSimpleBeepFallback();
            });
        } else {
            createAndPlaySound();
        }
        
    } catch (error) {
        console.log('Notification sound error:', error.message);
        playSimpleBeepFallback();
    }
}

function createAndPlaySound() {
    if (!audioContext || audioContext.state !== 'running') {
        console.log('AudioContext not ready');
        return;
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
    
    setTimeout(() => {
        oscillator.disconnect();
        gainNode.disconnect();
    }, 600);
}

function playSimpleBeepFallback() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (!ctx) return;
        
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.frequency.value = 800;
                gain.gain.value = 0.05;
                
                osc.start();
                osc.stop(ctx.currentTime + 0.1);
                
                setTimeout(() => ctx.close(), 200);
            });
        } else {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.frequency.value = 800;
            gain.gain.value = 0.05;
            
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
            
            setTimeout(() => ctx.close(), 200);
        }
    } catch (fallbackError) {
        console.log('Fallback audio also failed');
    }
}

function showToastNotification(invoice) {
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast-notification show" style="
            position: fixed;
            top: 20px;
            right: 20px;
            min-width: 300px;
            background: #4a6ee0;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        ">
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-receipt" style="font-size: 18px;"></i>
                    <strong>HÓA ĐƠN MỚI</strong>
                </div>
                <button onclick="document.getElementById('${toastId}').remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 16px;">
                <div style="margin-bottom: 8px;">
                    <strong>${invoice.hkdName || 'HKD'}</strong> vừa tạo hóa đơn
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    Mã: ${invoice.id.substring(0, 12)}...
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    ${new Date(invoice.date).toLocaleString('vi-VN')}
                </div>
                <div style="margin-top: 12px; font-weight: bold;">
                    ${Utils.formatCurrency(invoice.total)}
                </div>
                <button onclick="if (typeof window.viewInvoiceDetails === 'function') { window.viewInvoiceDetails('${invoice.id}'); } document.getElementById('${toastId}').remove()" style="
                    margin-top: 12px;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">
                    <i class="fas fa-eye"></i> Xem chi tiết
                </button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    
    setTimeout(() => {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
    
    if (!document.querySelector('#toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function showBrowserNotification(invoice) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Hóa đơn mới', {
            body: `HKD ${invoice.hkdName} vừa tạo hóa đơn ${invoice.id}\nTổng: ${Utils.formatCurrency(invoice.total)}`,
            icon: '/assets/notification-icon.png',
            tag: 'new-invoice',
            silent: false
        });
        
        notification.onclick = function() {
            window.focus();
            if (typeof window.viewInvoiceDetails === 'function') {
                window.viewInvoiceDetails(invoice.id);
            }
            notification.close();
        };
        
        setTimeout(() => notification.close(), 10000);
    }
}

// ========== ADMIN SPECIFIC FUNCTIONS ==========
async function syncall() {
    try {
        console.log('🔄 Admin: Bắt đầu đồng bộ toàn diện...');
        
        const user = getCurrentUser();
        if (!user || user.role !== 'admin') {
            return;
        }

        const isNewDevice = await checkIfNewDevice();
        
        if (isNewDevice && navigator.onLine) {
            console.log('🆕 MÁY MỚI: Tải toàn bộ dữ liệu HKD và HÓA ĐƠN...');
            Utils.showLoading('Đang tải dữ liệu lần đầu...');
            await initialFullSyncForNewDevice();
            Utils.hideLoading();
        }

        if (navigator.onLine) {
            console.log('🔄 Đồng bộ dữ liệu quan trọng...');
            await syncEssentialData();
        }

        listenForRealtimeUpdates();
        
        if (typeof window.loadEssentialData === 'function') {
            await window.loadEssentialData();
        }

        console.log('✅ Admin: Đồng bộ hoàn tất');

    } catch (error) {
        console.error('❌ Lỗi đồng bộ admin:', error);
        Utils.showToast('Lỗi đồng bộ hệ thống', 'error');
    }
}

async function checkIfNewDevice() {
    try {
        const allHKDs = await getAllHKDs();
        const hkdCount = allHKDs.filter(hkd => hkd.role === 'hkd').length;
        
        console.log(`📊 Thiết bị hiện có: ${hkdCount} HKD`);
        
        return hkdCount === 0;
        
    } catch (error) {
        console.error('❌ Lỗi kiểm tra thiết bị:', error);
        return true;
    }
}

async function initialFullSyncForNewDevice() {
    try {
        await initFirebase();
        
        const hkdsRef = firebase.database().ref('hkds');
        const hkdsSnapshot = await hkdsRef.once('value');
        const allHKDsFromFirebase = hkdsSnapshot.val() || {};
        
        console.log(`📥 Tìm thấy ${Object.keys(allHKDsFromFirebase).length} HKD trên Firebase`);
        
        let totalHKDs = 0;
        let totalInvoices = 0;
        
        for (const [hkdId, hkdData] of Object.entries(allHKDsFromFirebase)) {
            if (!hkdData || !hkdData.info) continue;
            
            const hkdToSave = {
                id: hkdId,
                name: hkdData.info.name || '',
                phone: hkdData.info.phone || '',
                address: hkdData.info.address || '',
                password: hkdData.info.password || '',
                role: 'hkd',
                createdAt: hkdData.info.createdAt || new Date().toISOString(),
                lastUpdated: hkdData.info.lastUpdated || new Date().toISOString(),
                _synced: true
            };
            
            await updateInStore(STORES.HKDS, hkdToSave);
            totalHKDs++;
            
            if (hkdData.invoices) {
                for (const [invoiceId, invoiceData] of Object.entries(hkdData.invoices)) {
                    if (!invoiceData || invoiceData._deleted === true) continue;
                    
                    const invoiceToSave = {
                        id: invoiceId,
                        hkdId: hkdId,
                        hkdName: hkdData.info.name || '',
                        customerName: invoiceData.customerName || 'Khách lẻ',
                        date: invoiceData.date || new Date().toISOString(),
                        items: invoiceData.items || [],
                        total: invoiceData.total || 0,
                        status: invoiceData.status || 'completed',
                        lastUpdated: invoiceData.lastUpdated || new Date().toISOString(),
                        _synced: true
                    };
                    
                    await updateInStore(STORES.INVOICES, invoiceToSave);
                    totalInvoices++;
                }
            }
            
            console.log(`✅ Đã xử lý HKD: ${hkdData.info.name} (${Object.keys(hkdData.invoices || {}).length} hóa đơn)`);
        }
        
        await updateLastSyncTime('initial_sync', new Date().toISOString());
        
        localStorage.setItem('last_full_sync', new Date().toISOString());
        localStorage.setItem('device_initialized', 'true');
        
        console.log(`🎉 ĐÃ HOÀN TẤT: ${totalHKDs} HKD, ${totalInvoices} hóa đơn`);
        Utils.showToast(`Đã tải ${totalHKDs} HKD và ${totalInvoices} hóa đơn`, 'success');
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu lần đầu:', error);
        Utils.showToast('Lỗi tải dữ liệu lần đầu', 'error');
        throw error;
    }
}

async function syncEssentialData() {
    console.log('🔁 Admin: Đồng bộ dữ liệu quan trọng...');
    
    try {
        await initFirebase();
        
        const allLocalHKDs = await getAllHKDs();
        const localHKDIds = allLocalHKDs.map(h => h.id);
        
        const hkdsRef = firebase.database().ref('hkds');
        const hkdsSnapshot = await hkdsRef.once('value');
        const firebaseHKDs = hkdsSnapshot.val() || {};
        
        let newHKDs = 0;
        let updatedInvoices = 0;
        
        for (const [hkdId, hkdData] of Object.entries(firebaseHKDs)) {
            if (!hkdData || !hkdData.info) continue;
            
            if (!localHKDIds.includes(hkdId)) {
                const newHKD = {
                    id: hkdId,
                    name: hkdData.info.name || '',
                    phone: hkdData.info.phone || '',
                    address: hkdData.info.address || '',
                    password: hkdData.info.password || '',
                    role: 'hkd',
                    createdAt: hkdData.info.createdAt || new Date().toISOString(),
                    lastUpdated: hkdData.info.lastUpdated || new Date().toISOString(),
                    _synced: true
                };
                
                await updateInStore(STORES.HKDS, newHKD);
                newHKDs++;
                console.log(`➕ HKD mới: ${hkdData.info.name}`);
            }
            
            if (hkdData.invoices) {
                const invoiceUpdates = await syncInvoicesForHKD(hkdId, hkdData.invoices);
                updatedInvoices += invoiceUpdates;
            }
        }
        
        localStorage.setItem('last_essential_sync', new Date().toISOString());
        
        console.log(`✅ ĐÃ ĐỒNG BỘ: ${newHKDs} HKD mới, ${updatedInvoices} hóa đơn cập nhật`);
        
        if (newHKDs > 0 || updatedInvoices > 0) {
            if (typeof window.loadEssentialData === 'function') {
                await window.loadEssentialData();
            }
        }
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ dữ liệu quan trọng:', error);
    }
}

async function syncInvoicesForHKD(hkdId, firebaseInvoices) {
    let updatedCount = 0;
    
    try {
        const localInvoices = await getInvoicesByHKD(hkdId);
        const localInvoiceIds = localInvoices.map(inv => inv.id);
        
        for (const [invoiceId, invoiceData] of Object.entries(firebaseInvoices || {})) {
            if (!invoiceData || invoiceData._deleted === true) continue;
            
            const localInvoice = localInvoices.find(inv => inv.id === invoiceId);
            const firebaseUpdated = new Date(invoiceData.lastUpdated || 0);
            const localUpdated = new Date(localInvoice?.lastUpdated || 0);
            
            if (!localInvoice || firebaseUpdated > localUpdated) {
                const invoiceToSave = {
                    id: invoiceId,
                    hkdId: hkdId,
                    hkdName: invoiceData.hkdName || '',
                    customerName: invoiceData.customerName || 'Khách lẻ',
                    date: invoiceData.date || new Date().toISOString(),
                    items: invoiceData.items || [],
                    total: invoiceData.total || 0,
                    status: invoiceData.status || 'completed',
                    lastUpdated: invoiceData.lastUpdated || new Date().toISOString(),
                    _synced: true
                };
                
                await updateInStore(STORES.INVOICES, invoiceToSave);
                updatedCount++;
                
                if (!localInvoice) {
                    console.log(`➕ Hóa đơn mới: ${invoiceId} từ HKD ${hkdId}`);
                }
            }
        }
        
        return updatedCount;
        
    } catch (error) {
        console.error(`❌ Lỗi đồng bộ hóa đơn cho HKD ${hkdId}:`, error);
        return 0;
    }
}

function setupDeviceSyncCheck() {
    console.log('📱 Thiết lập kiểm tra đồng bộ thiết bị...');
    
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && navigator.onLine) {
            console.log('🔄 App trở lại foreground, kiểm tra đồng bộ...');
            
            const lastSync = localStorage.getItem('last_essential_sync');
            const now = new Date();
            
            if (!lastSync || (now - new Date(lastSync)) > 2 * 60 * 1000) {
                console.log('⏰ Đã 2 phút chưa sync, đồng bộ lại...');
                await syncEssentialData();
            }
        }
    });
    
    window.addEventListener('online', async () => {
        console.log('🌐 Đã kết nối mạng, đồng bộ dữ liệu...');
        setTimeout(async () => {
            await syncEssentialData();
        }, 3000);
    });
    
    setInterval(async () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
            console.log('⏰ Đồng bộ định kỳ (5 phút)...');
            await syncEssentialData();
        }
    }, 5 * 60 * 1000);
    
    console.log('✅ Đã thiết lập kiểm tra đồng bộ thiết bị');
}

async function handleNewInvoiceFromRealtime(invoiceData) {
    try {
        console.log('📨 Nhận được hóa đơn mới từ realtime:', invoiceData.id);
        
        const existing = await getFromStore(STORES.INVOICES, invoiceData.id);
        if (existing) {
            console.log('⚠️ Hóa đơn đã tồn tại, bỏ qua');
            return;
        }
        
        await updateInStore(STORES.INVOICES, {
            ...invoiceData,
            _synced: true
        });
        
        if (typeof window.allHKDs !== 'undefined') {
            const hkdExists = window.allHKDs.find(h => h.id === invoiceData.hkdId);
            if (!hkdExists) {
                console.log(`🔍 HKD ${invoiceData.hkdId} chưa có trong local, đang tải...`);
                await loadHKDInfoFromFirebase(invoiceData.hkdId);
            }
        }
        
        if (typeof window.allInvoices !== 'undefined') {
            if (!window.allInvoices.find(inv => inv.id === invoiceData.id)) {
                window.allInvoices.unshift(invoiceData);
            }
        }
        
        if (typeof window.currentAdminView !== 'undefined' && window.currentAdminView === 'dashboard') {
            if (typeof window.updateDashboardStats === 'function') {
                window.updateDashboardStats();
            }
            if (typeof window.displayRecentInvoices === 'function') {
                window.displayRecentInvoices();
            }
            showNewInvoiceNotification(invoiceData);
        }
        
        console.log('✅ Đã xử lý hóa đơn mới từ realtime');
        
    } catch (error) {
        console.error('❌ Lỗi xử lý hóa đơn realtime:', error);
    }
}

async function loadHKDInfoFromFirebase(hkdId) {
    try {
        await initFirebase();
        
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const snapshot = await hkdRef.once('value');
        const hkdData = snapshot.val();
        
        if (hkdData) {
            const newHKD = {
                id: hkdId,
                name: hkdData.name || '',
                phone: hkdData.phone || '',
                address: hkdData.address || '',
                password: hkdData.password || '',
                role: 'hkd',
                createdAt: hkdData.createdAt || new Date().toISOString(),
                lastUpdated: hkdData.lastUpdated || new Date().toISOString(),
                _synced: true
            };
            
            await updateInStore(STORES.HKDS, newHKD);
            
            if (typeof window.allHKDs !== 'undefined') {
                if (!window.allHKDs.find(h => h.id === hkdId)) {
                    window.allHKDs.push(newHKD);
                }
            }
            
            console.log(`✅ Đã tải HKD ${hkdData.name} từ Firebase`);
            
            if (typeof window.updateHKDSelects === 'function') {
                window.updateHKDSelects();
            }
        }
        
    } catch (error) {
        console.error(`❌ Lỗi tải HKD ${hkdId} từ Firebase:`, error);
    }
}

async function handleNewHKDRealtime(hkdData) {
    try {
        console.log('👤 Xử lý HKD mới từ realtime:', hkdData.name);
        
        if (typeof window.allHKDs !== 'undefined') {
            if (!window.allHKDs.find(h => h.id === hkdData.id)) {
                window.allHKDs.push(hkdData);
            }
        }
        
        showNewHKDNotification(hkdData);
        
        if (typeof window.currentAdminView !== 'undefined') {
            if (window.currentAdminView === 'dashboard') {
                if (typeof window.updateDashboardStats === 'function') {
                    window.updateDashboardStats();
                }
            } else if (window.currentAdminView === 'hkds') {
                if (typeof window.updateHKDList === 'function') {
                    window.updateHKDList();
                }
            }
        }
        
        if (typeof window.updateHKDSelects === 'function') {
            window.updateHKDSelects();
        }
        
        console.log('✅ Đã xử lý HKD mới từ realtime');
        
    } catch (error) {
        console.error('❌ Lỗi xử lý HKD realtime:', error);
    }
}

// ========== UTILITY FUNCTIONS ==========
function forceSync() {
    if (syncInProgress) {
        return Promise.resolve();
    }
    return smartSync();
}

function stopSyncManager() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    window.removeEventListener('online', handleConnectionChange);
    window.removeEventListener('offline', handleConnectionChange);
    
    console.log('🛑 Đã dừng Sync Manager');
}

// ========== EXPORT FUNCTIONS ==========
window.initSyncManager = initSyncManager;
window.syncall = syncall;
window.syncEssentialData = syncEssentialData;
window.syncFromFirebase = smartSync; // Alias
window.forceSync = forceSync;
window.listenForRealtimeUpdates = listenForRealtimeUpdates;
window.stopSyncManager = stopSyncManager;
window.handleNewInvoiceFromRealtime = handleNewInvoiceFromRealtime;
window.handleNewHKDRealtime = handleNewHKDRealtime;
window.loadHKDInfoFromFirebase = loadHKDInfoFromFirebase;
window.setupDeviceSyncCheck = setupDeviceSyncCheck;
window.syncHKDDataFromFirebase = syncHKDDataFromFirebase;
window.listenForHKDRealtimeUpdates = listenForHKDRealtimeUpdates;
window.initHKDRealtimeSync = initHKDRealtimeSync;
window.showNewInvoiceNotification = showNewInvoiceNotification;
window.showNewHKDNotification = showNewHKDNotification;