// Admin module - Quản lý HKD, sản phẩm, hóa đơn
let currentAdminView = 'dashboard';
let selectedHKD = null;
let allHKDs = [];
let allInvoices = [];



// ========== HÀM KHỞI TẠO ĐƠN GIẢN ==========
async function initAdminPage() {
    try {
        // 1. TẢI CSS TRƯỚC
        loadDashboardStyles();
        
        // 2. Khởi tạo toàn bộ hệ thống
        await initSystem();
        
        // 3. Kiểm tra quyền admin
        const user = getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = 'login.html?type=admin';
            return;
        }
        
        // 4. Lắng nghe realtime updates
        listenForRealtimeUpdates();
        
        // 5. Tải dữ liệu ban đầu
        await loadEssentialData();
        
        // 6. Setup event listeners
        setupEventListeners();
        
        // 7. Thêm nút sync vào header
        createSyncButton();
        
        // 8. Hiển thị dashboard mặc định
        showDashboard();
        
        // 9. Yêu cầu quyền thông báo
        requestNotificationPermission();
        
        console.log('✅ Admin page initialized');
    } catch (error) {
        console.error('❌ Lỗi khởi tạo admin page:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}




// ========== QUẢN LÝ DỮ LIỆU ==========
async function loadEssentialData() {
    console.log('📂 Đang tải dữ liệu quan trọng lên UI...');
    
    try {
        // Tải danh sách HKD
        allHKDs = await getAllHKDs();
        allHKDs = allHKDs.filter(hkd => hkd.role === 'hkd');
        
        console.log(`📊 Có ${allHKDs.length} HKD`);
        
        // Tải tất cả hóa đơn
        allInvoices = [];
        for (const hkd of allHKDs) {
            try {
                const invoices = await getInvoicesByHKD(hkd.id);
                if (invoices && Array.isArray(invoices)) {
                    allInvoices.push(...invoices);
                }
            } catch (error) {
                console.error(`❌ Lỗi tải hóa đơn cho HKD ${hkd.id}:`, error);
            }
        }
        
        // Sắp xếp hóa đơn mới nhất trước
        allInvoices.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
        });
        
        console.log(`📊 Có ${allInvoices.length} hóa đơn`);
        
        // Cập nhật dropdown HKD
        updateHKDSelects();
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu quan trọng:', error);
        allHKDs = [];
        allInvoices = [];
    }
}

async function loadAllInvoices() {
    console.log('📥 Đang tải tất cả hóa đơn...');
    
    if (!allInvoices || !Array.isArray(allInvoices)) {
        allInvoices = [];
    } else {
        allInvoices = [];
    }
    
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
                return dateB - dateA;
            } catch {
                return 0;
            }
        });
    }
    
    console.log(`✅ Đã tải ${allInvoices.length} invoices`);
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
            
            if (!allHKDs.find(h => h.id === hkdId)) {
                allHKDs.push(newHKD);
            }
            
            console.log(`✅ Đã tải HKD ${hkdData.name} từ Firebase`);
            updateHKDSelects();
            
            if (currentAdminView === 'hkds') {
                updateHKDList();
            }
        }
        
    } catch (error) {
        console.error(`❌ Lỗi tải HKD ${hkdId} từ Firebase:`, error);
    }
}

// ========== UI COMPONENTS ==========
function createSyncButton() {
    if (document.getElementById('adminSyncButton')) return;
    
    const syncButton = document.createElement('button');
    syncButton.id = 'adminSyncButton';
    syncButton.className = 'btn-sync-admin';
    syncButton.innerHTML = `
        <i class="fas fa-sync-alt"></i>
        <span class="sync-text">Đồng bộ</span>
    `;
    syncButton.title = 'Đồng bộ dữ liệu';
    
    syncButton.addEventListener('click', handleSmartSync);
    addSyncButtonStyles();
    
    const header = document.querySelector('.main-header');
    if (header) {
        header.appendChild(syncButton);
        console.log('✅ Đã thêm nút sync vào header');
    } else {
        document.body.prepend(syncButton);
    }
}

async function handleSmartSync() {
    const syncButton = document.getElementById('adminSyncButton');
    if (!syncButton) return;
    
    try {
        syncButton.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span class="sync-text">Đang đồng bộ...</span>
        `;
        syncButton.disabled = true;
        syncButton.classList.add('syncing');
        
        await syncEssentialData();
        
        syncButton.innerHTML = `
            <i class="fas fa-sync-alt"></i>
            <span class="sync-text">Đồng bộ</span>
        `;
        syncButton.disabled = false;
        syncButton.classList.remove('syncing');
        
        syncButton.classList.add('sync-success');
        setTimeout(() => syncButton.classList.remove('sync-success'), 2000);
        
        Utils.showToast('Đã đồng bộ dữ liệu thành công', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi khi đồng bộ:', error);
        syncButton.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span class="sync-text">Lỗi</span>
        `;
        syncButton.classList.add('sync-error');
        syncButton.classList.remove('syncing');
        
        setTimeout(() => {
            syncButton.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                <span class="sync-text">Đồng bộ</span>
            `;
            syncButton.classList.remove('sync-error');
            syncButton.disabled = false;
        }, 2000);
        
        Utils.showToast('Lỗi đồng bộ dữ liệu', 'error');
    }
}

// ========== HÀM QUẢN LÝ HKD ==========
async function saveHKD() {
    const saveButton = document.getElementById('saveHKD');
    if (saveButton.disabled) return;
    
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
        
        const hkdId = Utils.generateId();
        const hkdData = {
            id: hkdId,
            name: name,
            phone: phone,
            address: address,
            password: password,
            role: 'hkd',
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false
        };
        
        const db = await getDB();
        const tx = db.transaction([STORES.HKDS], 'readwrite');
        const store = tx.objectStore(STORES.HKDS);
        
        // Kiểm tra số điện thoại đã tồn tại chưa
        const index = store.index('phone');
        const checkRequest = index.get(phone);
        
        await new Promise((resolve, reject) => {
            checkRequest.onsuccess = (e) => {
                if (e.target.result) {
                    reject(new Error('Số điện thoại đã tồn tại'));
                    return;
                }
                
                const putRequest = store.put(hkdData);
                putRequest.onsuccess = () => {
                    console.log('✅ Đã lưu HKD vào IndexedDB với ID:', hkdId);
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            checkRequest.onerror = () => reject(checkRequest.error);
        });
        
        allHKDs.push(hkdData);
        await addToSyncQueue({ type: 'hkds', data: hkdData });
        updateHKDList();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addHKDModal'));
        if (modal) modal.hide();
        document.getElementById('hkdForm').reset();
        
        Utils.showToast('Đã thêm HKD thành công', 'success');
        
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

async function editHKD(hkdId) {
    console.log(`✏️ Editing HKD: ${hkdId}`);
    
    if (!hkdId) {
        console.error('❌ HKD ID không hợp lệ');
        return;
    }
    
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    document.getElementById('editHKDName').value = hkd.name || '';
    document.getElementById('editHKDPhone').value = hkd.phone || '';
    document.getElementById('editHKDAddress').value = hkd.address || '';
    document.getElementById('editHKDPassword').value = hkd.password || '';
    
    selectedHKD = hkd;
    
    const editModal = new bootstrap.Modal(document.getElementById('editHKDModal'));
    editModal.show();
}

async function updateHKD() {
    if (!selectedHKD) {
        Utils.showToast('Không tìm thấy HKD để cập nhật', 'error');
        return;
    }
    
    const name = document.getElementById('editHKDName').value;
    const phone = document.getElementById('editHKDPhone').value;
    const address = document.getElementById('editHKDAddress').value;
    const password = document.getElementById('editHKDPassword').value;
    
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
        selectedHKD.name = name;
        selectedHKD.phone = phone;
        selectedHKD.address = address;
        
        if (password && password.trim() !== '') {
            selectedHKD.password = password;
        }
        
        selectedHKD.lastUpdated = new Date().toISOString();
        
        await updateInStore(STORES.HKDS, selectedHKD);
        await addToSyncQueue({ type: 'hkds', data: selectedHKD });
        
        const index = allHKDs.findIndex(h => h.id === selectedHKD.id);
        if (index !== -1) {
            allHKDs[index] = { ...selectedHKD };
        }
        
        updateHKDList();
        updateHKDSelects();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('editHKDModal'));
        if (modal) modal.hide();
        
        Utils.showToast('Đã cập nhật HKD thành công', 'success');
        
        if (navigator.onLine && typeof forceSync === 'function') {
            setTimeout(async () => {
                try {
                    await forceSync();
                } catch (syncError) {
                    console.error('❌ Lỗi khi sync:', syncError);
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Lỗi cập nhật HKD:', error);
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
        await deleteFromStore(STORES.HKDS, hkdId);
        await clearHKDData(hkdId);
        await addToSyncQueue({ type: 'hkds_delete', data: { id: hkdId } });
        
        allHKDs = allHKDs.filter(h => h.id !== hkdId);
        updateHKDList();
        updateDashboardStats();
        
        Utils.showToast('Đã xóa HKD thành công', 'success');
        
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

// ========== QUẢN LÝ SẢN PHẨM VÀ DANH MỤC ==========
async function loadCategoriesAndProducts(hkdId) {
    if (!hkdId) return;
    
    Utils.showLoading('Đang tải danh mục và sản phẩm...');
    
    try {
        const { categories, products } = await loadCategoriesAndProductsFromFirebase(hkdId);
        displayCategories(categories);
        displayProducts(products, categories);
        console.log(`✅ Đã tải ${categories.length} danh mục và ${products.length} sản phẩm từ Firebase`);
        
    } catch (error) {
        console.error('❌ Lỗi tải danh mục và sản phẩm:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

async function loadCategoriesAndProductsFromFirebase(hkdId) {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val() || {};
        
        const categories = [];
        const products = [];
        
        for (const [categoryId, category] of Object.entries(categoriesData)) {
            if (category && category.name && !category.msp) {
                categories.push({
                    id: categoryId,
                    hkdId: hkdId,
                    name: category.name,
                    description: category.description || '',
                    _fromFirebase: true
                });
                
                if (category.products) {
                    for (const [productId, product] of Object.entries(category.products)) {
                        if (product && product.name) {
                            products.push({
                                id: productId,
                                hkdId: hkdId,
                                categoryId: categoryId,
                                msp: product.msp || '',
                                name: product.name,
                                unit: product.unit || 'cái',
                                price: product.price || 0,
                                stock: product.stock || 0,
                                description: product.description || '',
                                _fromFirebase: true
                            });
                        }
                    }
                }
            }
        }
        
        return { categories, products };
        
    } catch (error) {
        console.error('❌ Lỗi lấy dữ liệu từ Firebase:', error);
        throw error;
    }
}

async function saveCategory() {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'error');
        return;
    }
    
    const name = document.getElementById('categoryName').value.trim();
    const description = document.getElementById('categoryDescription').value.trim();
    
    if (!name) {
        Utils.showToast('Vui lòng nhập tên danh mục', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu...');
    
    try {
        const categoryId = Utils.generateId();
        const categoryData = {
            id: categoryId,
            hkdId: hkdId,
            name: name,
            description: description,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false
        };
        
        await updateInStore(STORES.CATEGORIES, categoryData);
        await loadCategoriesAndProducts(hkdId);
        Utils.showToast('Đã thêm danh mục', 'success');
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addCategoryModal'));
        if (modal) modal.hide();
        
        setTimeout(async () => {
            try {
                await initFirebase();
                const categoryRef = firebase.database().ref(
                    `hkds/${hkdId}/categories/${categoryId}`
                );
                
                const firebaseData = {
                    name: name,
                    description: description,
                    createdAt: categoryData.createdAt,
                    lastUpdated: categoryData.lastUpdated,
                    products: {},
                    _syncedAt: new Date().toISOString()
                };
                
                await categoryRef.set(firebaseData);
                categoryData._synced = true;
                categoryData._syncedAt = new Date().toISOString();
                await updateInStore(STORES.CATEGORIES, categoryData);
                console.log('✅ Đã sync category lên Firebase');
                
            } catch (error) {
                console.error('❌ Lỗi sync category:', error);
                await addToSyncQueue({ type: 'categories', data: categoryData });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi thêm danh mục:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

async function saveProduct() {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'error');
        return;
    }
    
    const editProductId = document.getElementById('editProductId').value;
    const isEdit = !!editProductId;
    
    const productData = {
        id: isEdit ? editProductId : Utils.generateId(),
        hkdId: hkdId,
        msp: document.getElementById('productCode').value.trim(),
        name: document.getElementById('productName').value.trim(),
        categoryId: document.getElementById('productCategory').value,
        unit: document.getElementById('productUnit').value.trim() || 'cái',
        price: parseFloat(document.getElementById('productPrice').value) || 0,
        stock: parseInt(document.getElementById('productStock').value) || 0,
        cost: parseFloat(document.getElementById('productCost').value) || null,
        description: document.getElementById('productDescription').value.trim(),
        note: document.getElementById('productNote').value.trim(),
        lastUpdated: new Date().toISOString(),
        _synced: false,
        _deleted: false
    };
    
    if (!productData.msp || !productData.name || !productData.categoryId || productData.price <= 0) {
        Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    try {
        if (!isEdit) {
            const existingProducts = await getProductsByHKD(hkdId);
            const duplicate = existingProducts.find(p => 
                p.msp === productData.msp && p._deleted !== true
            );
            if (duplicate) {
                Utils.showToast('Mã sản phẩm đã tồn tại', 'error');
                return;
            }
        }
        
        const category = await getFromStore(STORES.CATEGORIES, productData.categoryId);
        if (!category || category._deleted === true) {
            Utils.showToast('Danh mục không tồn tại hoặc đã bị xóa', 'error');
            return;
        }
        
        console.log('📝 Lưu sản phẩm:', productData);
        
        const db = await getDB();
        const tx = db.transaction([STORES.PRODUCTS], 'readwrite');
        const store = tx.objectStore(STORES.PRODUCTS);
        await store.put(productData);
        console.log('💾 Đã lưu sản phẩm vào IndexedDB');
        
        await addToSyncQueue({ type: 'products', data: productData });
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
        if (modal) modal.hide();
        
        document.getElementById('productForm').reset();
        document.getElementById('editProductId').value = '';
        document.getElementById('productModalTitle').textContent = 'Thêm hàng hóa mới';
        
        await loadCategoriesAndProducts(hkdId);
        Utils.showToast(`Đã ${isEdit ? 'cập nhật' : 'thêm'} hàng hóa thành công`, 'success');
        
        if (navigator.onLine) {
            setTimeout(async () => {
                try {
                    await forceSync();
                    console.log('✅ Đã đồng bộ sản phẩm lên Firebase');
                } catch (error) {
                    console.error('❌ Lỗi sync sản phẩm:', error);
                }
            }, 500);
        }
        
    } catch (error) {
        console.error('❌ Lỗi lưu hàng hóa:', error);
        Utils.showToast('Lỗi lưu hàng hóa: ' + error.message, 'error');
    }
}

async function editProduct(productId) {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'warning');
        return;
    }
    
    try {
        const product = await getFromStore(STORES.PRODUCTS, productId);
        if (!product) {
            Utils.showToast('Không tìm thấy sản phẩm', 'error');
            return;
        }
        
        document.getElementById('productCode').value = product.msp || '';
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productUnit').value = product.unit || 'cái';
        document.getElementById('productPrice').value = product.price || 0;
        document.getElementById('productStock').value = product.stock || 0;
        document.getElementById('productCost').value = product.cost || '';
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productNote').value = product.note || '';
        document.getElementById('editProductId').value = product.id;
        
        const categories = await getCategoriesByHKD(hkdId);
        const categorySelect = document.getElementById('productCategory');
        
        categorySelect.innerHTML = '<option value="">Chọn danh mục...</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
        
        if (product.categoryId) {
            categorySelect.value = product.categoryId;
        }
        
        document.getElementById('productModalTitle').textContent = 'Sửa hàng hóa';
        const modal = new bootstrap.Modal(document.getElementById('addProductModal'));
        modal.show();
        
        console.log(`✅ Form loaded for editing product: ${product.name}`);
        
    } catch (error) {
        console.error('❌ Lỗi sửa hàng hóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    }
}

async function confirmDelete() {
    const id = document.getElementById('deleteItemId').value;
    const type = document.getElementById('deleteItemType').value;
    const hkdId = document.getElementById('manageHKD').value;
    
    if (!id || !type || !hkdId) return;
    
    Utils.showLoading('Đang xóa...');
    
    try {
        if (type === 'category') {
            const products = await getProductsByHKD(hkdId);
            const categoryProducts = products.filter(p => p.categoryId === id);
            
            for (const product of categoryProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
            
            await deleteFromStore(STORES.CATEGORIES, id);
            await loadCategoriesAndProducts(hkdId);
            Utils.showToast(`Đã xóa danh mục và ${categoryProducts.length} sản phẩm`, 'success');
            
            setTimeout(async () => {
                try {
                    await initFirebase();
                    const categoryRef = firebase.database().ref(`hkds/${hkdId}/categories/${id}`);
                    await categoryRef.remove();
                    console.log('✅ Đã xóa category trên Firebase');
                    
                } catch (error) {
                    console.error('❌ Lỗi xóa Firebase:', error);
                    await addToSyncQueue({ type: 'categories_delete', data: { id, hkdId } });
                }
            }, 100);
            
        } else if (type === 'product') {
            const product = await getFromStore(STORES.PRODUCTS, id);
            if (!product) return;
            
            await deleteFromStore(STORES.PRODUCTS, id);
            await loadCategoriesAndProducts(hkdId);
            Utils.showToast('Đã xóa hàng hóa', 'success');
            
            setTimeout(async () => {
                try {
                    await initFirebase();
                    const productRef = firebase.database().ref(
                        `hkds/${hkdId}/categories/${product.categoryId}/products/${id}`
                    );
                    await productRef.remove();
                    console.log('✅ Đã xóa product trên Firebase');
                    
                } catch (error) {
                    console.error('❌ Lỗi xóa Firebase:', error);
                    await addToSyncQueue({ type: 'products_delete', data: { id, hkdId, categoryId: product.categoryId } });
                }
            }, 100);
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
        if (modal) modal.hide();
        
    } catch (error) {
        console.error('❌ Lỗi xóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// ========== UI DISPLAY FUNCTIONS ==========
function displayCategories(categories) {
    const container = document.getElementById('categoriesList');
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="no-data"><i class="fas fa-folder-open"></i><p>Chưa có danh mục nào</p></div>';
        return;
    }
    
    container.innerHTML = categories.map(category => `
        <div class="category-item" data-category-id="${category.id}">
            <div>
                <div class="category-name">${category.name}</div>
                ${category.description ? `<small class="text-muted">${category.description}</small>` : ''}
            </div>
            <div class="category-actions">
                <button class="btn-category-action" onclick="editCategory('${category.id}')" title="Sửa">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-category-action" onclick="deleteItem('category', '${category.id}', '${category.name}')" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function displayProducts(products, categories) {
    const container = document.getElementById('productsList');
    
    if (!products || products.length === 0) {
        container.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có hàng hóa nào</td></tr>';
        return;
    }
    
    const categoryMap = {};
    categories.forEach(cat => categoryMap[cat.id] = cat.name);
    
    container.innerHTML = products.map(product => {
        const categoryName = categoryMap[product.categoryId] || 'Không xác định';
        
        return `
            <tr data-product-id="${product.id}">
                <td class="product-code">${product.msp || product.code || 'N/A'}</td>
                <td>
                    <div class="product-name">${product.name}</div>
                    ${product.description ? `<small class="text-muted">${product.description}</small>` : ''}
                </td>
                <td><span class="product-category">${categoryName}</span></td>
                <td>${product.unit || 'cái'}</td>
                <td class="product-price">${Utils.formatCurrency(product.price || 0)}</td>
                <td class="product-stock">${product.stock || 0}</td>
                <td>
                    <div class="product-actions">
                        <button class="btn-product-action btn-edit" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i> Sửa
                        </button>
                        <button class="btn-product-action btn-delete" onclick="deleteItem('product', '${product.id}', '${product.name}')">
                            <i class="fas fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function populateCategorySelects(categories) {
    const filterSelect = document.getElementById('filterCategory');
    const modalSelect = document.getElementById('productCategory');
    
    const optionsHTML = categories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');
    
    filterSelect.innerHTML = '<option value="">Tất cả danh mục</option>' + optionsHTML;
    modalSelect.innerHTML = '<option value="">Chọn danh mục...</option>' + optionsHTML;
}

function filterProducts() {
    const categoryId = document.getElementById('filterCategory').value;
    const searchTerm = document.getElementById('searchProduct').value.toLowerCase();
    const hkdId = document.getElementById('manageHKD').value;
    
    if (!hkdId) return;
    
    getProductsByHKD(hkdId).then(products => {
        let filtered = products;
        
        if (categoryId) {
            filtered = filtered.filter(p => p.categoryId === categoryId);
        }
        
        if (searchTerm) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(searchTerm)) ||
                (p.msp && p.msp.toLowerCase().includes(searchTerm)) ||
                (p.description && p.description.toLowerCase().includes(searchTerm))
            );
        }
        
        getCategoriesByHKD(hkdId).then(categories => {
            displayProducts(filtered, categories);
        });
    });
}

// ========== VIEW MANAGEMENT ==========
function switchAdminView(view) {
    currentAdminView = view;
    
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const targetSection = document.getElementById(`${view}Section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
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

function showDashboard() {
    updateDashboardStats();
    displayRecentInvoices();
    drawDashboardCharts();
    addMarkAllAsReadButton();
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
    
    container.innerHTML = '';
    const recentInvoices = allInvoices.slice(0, 10);
    const viewedInvoices = getViewedInvoices();
    
    recentInvoices.forEach(invoice => {
        const isViewed = viewedInvoices.includes(invoice.id);
        const isNew = !isViewed && isRecentInvoice(invoice);
        
        const card = document.createElement('div');
        card.className = `invoice-card ${isNew ? 'invoice-card-new glow-effect' : 'invoice-card-viewed'}`;
        card.id = `invoice-${invoice.id}`;
        card.dataset.invoiceId = invoice.id;
        
        card.addEventListener('click', function(e) {
            if (!e.target.closest('.btn-view-invoice')) {
                markInvoiceAsViewed(invoice.id);
                viewInvoiceDetails(invoice.id);
            }
        });
        
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
        
        container.appendChild(card);
    });
    
    if (recentInvoices.length === 0) {
        container.innerHTML = `
            <div class="no-invoices">
                <i class="fas fa-receipt"></i>
                <p>Chưa có hóa đơn nào</p>
            </div>
        `;
    }
}

function drawDashboardCharts() {
    const chartContainer = document.getElementById('dashboardChart');
    if (!chartContainer) return;
    
    const monthlyData = {};
    allInvoices.forEach(invoice => {
        const date = new Date(invoice.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { invoices: 0, revenue: 0 };
        }
        
        monthlyData[monthKey].invoices++;
        monthlyData[monthKey].revenue += invoice.total;
    });
    
    const sortedMonths = Object.keys(monthlyData).sort();
    const recentMonths = sortedMonths.slice(-6);
    
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

function updateHKDList() {
    const container = document.getElementById('hkdList');
    if (!container) return;
    
    const activeHKDs = allHKDs.filter(hkd => hkd && hkd._deleted !== true);
    
    if (!activeHKDs || activeHKDs.length === 0) {
        container.innerHTML = '<p class="no-hkds">Chưa có HKD nào</p>';
        return;
    }
    
    container.innerHTML = activeHKDs.map((hkd, index) => {
        if (!hkd || typeof hkd !== 'object') {
            console.error(`❌ HKD at index ${index} is invalid:`, hkd);
            return '';
        }
        
        const hkdInvoices = Array.isArray(allInvoices) 
            ? allInvoices.filter(inv => inv && inv.hkdId === hkd.id)
            : [];
        
        const recentInvoices = Array.isArray(hkdInvoices) 
            ? hkdInvoices.slice(0, 5) 
            : [];
        
        const totalRevenue = hkdInvoices.reduce((sum, inv) => {
            if (!inv || typeof inv !== 'object') return sum;
            return sum + (parseFloat(inv.total) || 0);
        }, 0);
        
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

function updateHKDSelects() {
    const selectIds = ['invoiceHKD', 'importHKD', 'manageHKD'];
    
    selectIds.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const currentValue = select.value;
            
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            allHKDs.forEach(hkd => {
                if (hkd && hkd.role === 'hkd') {
                    const option = document.createElement('option');
                    option.value = hkd.id;
                    option.textContent = `${hkd.name} (${hkd.phone})`;
                    select.appendChild(option);
                }
            });
            
            if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
                select.value = currentValue;
            }
        }
    });
}

function populateHKDSelect() {
    const hkdSelect = document.getElementById('invoiceHKD');
    if (!hkdSelect) return;
    
    const currentValue = hkdSelect.value;
    hkdSelect.innerHTML = '<option value="">Tất cả HKD</option>';
    
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
    
    if (currentValue && hkdSelect.querySelector(`option[value="${currentValue}"]`)) {
        hkdSelect.value = currentValue;
    }
}

function showHKDs() {
    updateHKDList();
}

function showInvoices() {
    populateHKDSelect();
    
    if (!allInvoices || !Array.isArray(allInvoices)) {
        setTimeout(async () => {
            try {
                await loadAllInvoices();
                displayInvoices();
            } catch (error) {
                console.error('❌ Lỗi tải lại invoices:', error);
            }
        }, 300);
    }
    
    displayInvoices();
}

function displayInvoices() {
    const container = document.getElementById('invoiceList');
    if (!container) return;
    
    const activeInvoices = allInvoices.filter(inv => inv && inv._deleted !== true);
    
    if (!activeInvoices || activeInvoices.length === 0) {
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
    
    try {
        const invoicesHTML = allInvoices.map((invoice, index) => {
            if (!invoice || typeof invoice !== 'object') {
                console.warn(`⚠️ Invoice at index ${index} không hợp lệ`);
                return '';
            }
            
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
    const hkdId = document.getElementById('invoiceHKD')?.value || '';
    const startDate = document.getElementById('invoiceStartDate')?.value || '';
    const endDate = document.getElementById('invoiceEndDate')?.value || '';
    
    if (!allInvoices || !Array.isArray(allInvoices)) {
        console.error('❌ allInvoices không hợp lệ');
        return;
    }
    
    let filtered = [...allInvoices];
    
    if (hkdId) {
        filtered = filtered.filter(inv => inv && inv.hkdId === hkdId);
    }
    
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
    
    const container = document.getElementById('invoiceList');
    if (!container) return;
    
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
}

async function viewInvoiceDetails(invoiceId) {
    markInvoiceAsViewed(invoiceId);
    
    let invoice = allInvoices.find(inv => inv.id === invoiceId);
    
    if (!invoice) {
        try {
            invoice = await getFromStore(STORES.INVOICES, invoiceId);
            if (invoice) {
                allInvoices.unshift(invoice);
            }
        } catch (error) {
            console.error('❌ Error loading invoice from IndexedDB:', error);
        }
    }
    
    if (!invoice) {
        Utils.showToast('Không tìm thấy hóa đơn', 'error');
        return;
    }
    
    const hkd = allHKDs.find(h => h.id === invoice.hkdId);
    const modal = new bootstrap.Modal(document.getElementById('invoiceDetailModal'));
    
    document.getElementById('invoiceDetailTitle').textContent = `Hóa đơn: ${invoice.id}`;
    document.getElementById('invoiceDetailDate').textContent = Utils.formatDate(invoice.date);
    document.getElementById('invoiceDetailHKD').textContent = hkd ? hkd.name : 'N/A';
    document.getElementById('invoiceDetailCustomer').textContent = invoice.customerName || 'Khách lẻ';
    document.getElementById('invoiceDetailTotal').textContent = Utils.formatCurrency(invoice.total);
    document.getElementById('invoiceDetailStatus').textContent = invoice.status || 'Hoàn thành';
    
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

function showImport() {
    const importSelect = document.getElementById('importHKD');
    const manageSelect = document.getElementById('manageHKD');
    
    if (!allHKDs || !Array.isArray(allHKDs)) {
        console.error('❌ allHKDs is not an array!');
        return;
    }
    
    const optionsHTML = allHKDs
        .filter(hkd => hkd && hkd.role === 'hkd')
        .map(hkd => `<option value="${hkd.id}">${hkd.name} - ${hkd.phone}</option>`)
        .join('');
    
    if (importSelect) {
        importSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
    }
    
    if (manageSelect) {
        manageSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
    }
    
    clearManagementData();
}

function clearManagementData() {
    document.getElementById('categoriesList').innerHTML = '<div class="no-data"><i class="fas fa-folder-open"></i><p>Chưa chọn HKD</p></div>';
    document.getElementById('productsList').innerHTML = '<tr><td colspan="7" class="text-center">Chưa chọn HKD</td></tr>';
    document.getElementById('filterCategory').innerHTML = '<option value="">Tất cả danh mục</option>';
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    console.log('🔗 Setting up event listeners...');
    
    // Navigation
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = e.currentTarget.dataset.view;
            if (view) switchAdminView(view);
        });
    });
    
    // Logout
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // HKD Search
    const searchInput = document.getElementById('hkdSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(searchHKDs, 300));
    }
    
    // Add HKD Modal
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
    
    // Import Excel
    const importInput = document.getElementById('importExcel');
    if (importInput) {
        importInput.addEventListener('change', handleExcelImport);
    }
    
    const importBtn = document.getElementById('btnImport');
    if (importBtn) {
        importBtn.addEventListener('click', processExcelImport);
    }
    
    // Change Password
    const passwordForm = document.getElementById('changePasswordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', changePassword);
    }
    
    // Invoice Filters
    const hkdSelect = document.getElementById('invoiceHKD');
    if (hkdSelect) {
        hkdSelect.addEventListener('change', () => {
            setTimeout(() => {
                if (typeof filterInvoices === 'function') filterInvoices();
            }, 50);
        });
    }
    
    const startDate = document.getElementById('invoiceStartDate');
    const endDate = document.getElementById('invoiceEndDate');
    
    if (startDate) startDate.addEventListener('change', () => {
        setTimeout(() => { if (typeof filterInvoices === 'function') filterInvoices(); }, 50);
    });
    
    if (endDate) endDate.addEventListener('change', () => {
        setTimeout(() => { if (typeof filterInvoices === 'function') filterInvoices(); }, 50);
    });
    
    const filterBtn = document.getElementById('btnFilterInvoices');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            if (typeof filterInvoices === 'function') filterInvoices();
        });
    }
    
    const resetBtn = document.getElementById('btnResetFilter');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (hkdSelect) hkdSelect.value = '';
            if (startDate) startDate.value = '';
            if (endDate) endDate.value = '';
            
            setTimeout(() => {
                if (typeof filterInvoices === 'function') filterInvoices();
            }, 50);
            
            Utils.showToast('Đã reset bộ lọc', 'success');
        });
    }
    
    // Category & Product Management
    const manageHKDSelect = document.getElementById('manageHKD');
    if (manageHKDSelect) {
        manageHKDSelect.addEventListener('change', function() {
            if (this.value) loadCategoriesAndProducts(this.value);
            else clearManagementData();
        });
    }
    
    const loadProductsBtn = document.getElementById('btnLoadProducts');
    if (loadProductsBtn) {
        loadProductsBtn.addEventListener('click', function() {
            const hkdId = manageHKDSelect.value;
            if (hkdId) loadCategoriesAndProducts(hkdId);
            else Utils.showToast('Vui lòng chọn HKD', 'error');
        });
    }
    
    const saveCategoryBtn = document.getElementById('btnSaveCategory');
    if (saveCategoryBtn) saveCategoryBtn.addEventListener('click', saveCategory);
    
    const saveProductBtn = document.getElementById('btnSaveProduct');
    if (saveProductBtn) saveProductBtn.addEventListener('click', saveProduct);
    
    const filterCategorySelect = document.getElementById('filterCategory');
    if (filterCategorySelect) filterCategorySelect.addEventListener('change', filterProducts);
    
    const searchProductInput = document.getElementById('searchProduct');
    if (searchProductInput) searchProductInput.addEventListener('input', Utils.debounce(filterProducts, 300));
    
    const confirmDeleteBtn = document.getElementById('btnConfirmDelete');
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDelete);
    
    const updateBtn = document.getElementById('updateHKD');
    if (updateBtn) updateBtn.addEventListener('click', updateHKD);
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

// ========== UTILITY FUNCTIONS ==========
function addMarkAllAsReadButton() {
    if (document.getElementById('markAllInvoicesRead')) return;
    
    const container = document.querySelector('#recentInvoices').parentElement;
    if (!container) return;
    
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
    
    const invoiceCards = recentContainer.querySelectorAll('.invoice-card');
    const viewedInvoices = getViewedInvoices();
    
    invoiceCards.forEach(card => {
        const invoiceId = card.dataset.invoiceId;
        if (invoiceId && !viewedInvoices.includes(invoiceId)) {
            markInvoiceAsViewed(invoiceId);
        }
    });
    
    Utils.showToast('Đã đánh dấu tất cả hóa đơn đã xem', 'success');
}

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
        
        const invoiceCard = document.getElementById(`invoice-${invoiceId}`);
        if (invoiceCard) {
            invoiceCard.classList.remove('invoice-card-new', 'glow-effect');
            invoiceCard.classList.add('invoice-card-viewed');
            
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
            
            const button = invoiceCard.querySelector('.btn-view-invoice');
            if (button) {
                button.innerHTML = '<i class="far fa-eye"></i> Xem chi tiết';
                button.className = 'btn-view-invoice';
            }
        }
    }
}

function isRecentInvoice(invoice) {
    if (!invoice || !invoice.date) return false;
    const invoiceDate = new Date(invoice.date);
    const now = new Date();
    const hoursDiff = (now - invoiceDate) / (1000 * 60 * 60);
    return hoursDiff < 24;
}

function viewHKDInvoices(hkdId) {
    console.log(`📋 Xem hóa đơn của HKD: ${hkdId}`);
    
    if (!hkdId) return;
    
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    switchAdminView('invoices');
    
    setTimeout(() => {
        const select = document.getElementById('invoiceHKD');
        if (select) {
            select.value = hkdId;
            console.log(`🎯 Set invoiceHKD select to: ${hkdId}`);
            
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                    console.log(`✅ Đã filter invoices cho HKD: ${hkd.name}`);
                }
            }, 100);
        }
    }, 300);
}

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
        e.target.reset();
        Utils.showToast('Đã đổi mật khẩu thành công', 'success');
        
    } catch (error) {
        Utils.showToast(error.message, 'error');
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function loadDashboardStyles() {
    if (document.getElementById('dashboard-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    document.head.appendChild(style);
    console.log('✅ Dashboard styles loaded');
}

function addSyncButtonStyles() {
    if (document.getElementById('sync-button-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sync-button-styles';
    style.textContent = `
        .btn-sync-admin {
            background: rgba(255, 255, 255, 0.1);
            color: #4a6ee0;
            border: 1px solid rgba(74, 110, 224, 0.3);
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px);
            margin-left: 8px;
        }
        
        .btn-sync-admin:hover {
            background: rgba(74, 110, 224, 0.1);
            border-color: rgba(74, 110, 224, 0.5);
            transform: translateY(-1px);
        }
        
        .btn-sync-admin:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .btn-sync-admin.syncing {
            color: #f59e0b;
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.1);
        }
        
        .btn-sync-admin.sync-success {
            color: #10b981;
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.1);
        }
        
        .btn-sync-admin.sync-error {
            color: #ef4444;
            border-color: rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.1);
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .fa-spinner {
            animation: spin 1s linear infinite;
        }
        
        @media (prefers-color-scheme: dark) {
            .btn-sync-admin {
                background: rgba(255, 255, 255, 0.05);
                color: #7b9bff;
                border-color: rgba(123, 155, 255, 0.2);
            }
        }
        
        @media (max-width: 768px) {
            .btn-sync-admin .sync-text {
                display: none;
            }
        }
    `;
    
    document.head.appendChild(style);
}
// ========== EXCEL IMPORT FUNCTIONS ==========
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
    const rows = data.slice(0, 11);
    
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
    
    window.excelData = data;
}

async function processExcelImport() {
    const hkdId = document.getElementById('importHKD').value;
    
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
        const { products, categories } = parseExcelDataForNewStructure(window.excelData, hkdId);
        console.log(`📊 Dữ liệu parse: ${categories.length} danh mục, ${products.length} sản phẩm`);
        
        await initFirebase();
        const categoryMap = {};
        
        // Xử lý danh mục
        for (const category of categories) {
            const categoryId = category.id;
            const categoryRef = firebase.database().ref(`hkds/${hkdId}/categories/${categoryId}`);
            
            await categoryRef.set({
                name: category.name,
                description: category.description || '',
                createdAt: category.createdAt,
                lastUpdated: category.lastUpdated,
                products: {}
            });
            
            await updateInStore(STORES.CATEGORIES, category);
            categoryMap[category.name] = categoryId;
            console.log(`✅ Đã tạo danh mục: ${category.name} (${categoryId})`);
        }
        
        // Xử lý sản phẩm
        let successCount = 0;
        
        for (const product of products) {
            try {
                const categoryId = categoryMap[product.categoryName];
                if (!categoryId) {
                    console.warn(`⚠️ Bỏ qua sản phẩm ${product.name}: không tìm thấy danh mục "${product.categoryName}"`);
                    continue;
                }
                
                product.categoryId = categoryId;
                
                // Lưu vào IndexedDB
                const db = await getDB();
                const tx = db.transaction([STORES.PRODUCTS], 'readwrite');
                const store = tx.objectStore(STORES.PRODUCTS);
                await store.put(product);
                
                // Lưu lên Firebase
                const productRef = firebase.database().ref(
                    `hkds/${hkdId}/categories/${categoryId}/products/${product.id}`
                );
                
                const firebaseProductData = {
                    msp: product.msp,
                    name: product.name,
                    unit: product.unit,
                    price: product.price,
                    stock: product.stock,
                    description: product.description || '',
                    note: product.note || '',
                    lastUpdated: product.lastUpdated,
                    _synced: true
                };
                
                await productRef.set(firebaseProductData);
                successCount++;
                
            } catch (productError) {
                console.error(`❌ Lỗi import sản phẩm ${product.name}:`, productError);
            }
        }
        
        // Reset preview
        document.getElementById('excelPreview').innerHTML = '';
        delete window.excelData;
        
        Utils.showToast(`Đã import thành công ${successCount}/${products.length} sản phẩm`, 'success');
        
        // Reload data
        if (document.getElementById('manageHKD').value === hkdId) {
            await loadCategoriesAndProducts(hkdId);
        }
        
    } catch (error) {
        console.error('❌ Lỗi import:', error);
        Utils.showToast('Lỗi khi import dữ liệu: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

function parseExcelDataForNewStructure(data, hkdId) {
    const rows = data.slice(1);
    const categories = [];
    const products = [];
    const categoryMap = {};

    for (const row of rows) {
        if (!row || row.length < 5) continue;

        // Danh mục
        const categoryName = (row[0]?.toString() || 'Khác').trim();

        if (!categoryMap[categoryName]) {
            const categoryId = Utils.generateId();
            const category = {
                id: categoryId,
                hkdId: hkdId,
                name: categoryName,
                description: '',
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            categories.push(category);
            categoryMap[categoryName] = categoryId;
        }

        // Sản phẩm
        const product = {
            id: Utils.generateId(),
            hkdId: hkdId,
            name: (row[1]?.toString() || '').trim(),
            msp: (row[2]?.toString() || '').trim(),
            unit: 'cái',
            price: parseFloat(row[4]) || 0,
            stock: parseInt(row[5]) || 0,
            categoryName: categoryName,
            description: (row[3]?.toString() || '').trim(),
            note: (row[6]?.toString() || '').trim(),
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false
        };

        if (!product.name) continue;
        products.push(product);
    }

    return { categories, products };
}
// Xóa item
function deleteItem(type, id, name) {
    document.getElementById('deleteItemId').value = id;
    document.getElementById('deleteItemType').value = type;
    
    const message = type === 'category' 
        ? `Bạn có chắc muốn xóa danh mục "${name}"? Tất cả hàng hóa trong danh mục sẽ chuyển sang "Không xác định".`
        : `Bạn có chắc muốn xóa hàng hóa "${name}"?`;
    
    document.getElementById('deleteMessage').textContent = message;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}
// Sửa danh mục
async function editCategory(categoryId) {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) return;
    
    try {
        const categories = await getCategoriesByHKD(hkdId);
        const category = categories.find(c => c.id === categoryId);
        
        if (category) {
            document.getElementById('categoryName').value = category.name;
            document.getElementById('categoryDescription').value = category.description || '';
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('addCategoryModal'));
            modal.show();
            
            // TODO: Cần thêm logic để update thay vì create mới
            // Có thể thêm hidden field để phân biệt edit/add
        }
    } catch (error) {
        console.error('Lỗi sửa danh mục:', error);
    }
}

// ========== SYNC MANAGEMENT ==========
async function loadDataAfterSync() {
    console.log('🔄 Tải lại dữ liệu sau khi sync từ Firebase...');
    
    try {
        // Load lại dữ liệu HKD
        allHKDs = await getAllHKDs();
        allHKDs = allHKDs.filter(hkd => hkd.role === 'hkd');
        
        // Load lại invoices
        await loadAllInvoices();
        
        // Cập nhật UI dựa trên view hiện tại
        switch(currentAdminView) {
            case 'dashboard':
                updateDashboardStats();
                displayRecentInvoices();
                drawDashboardCharts();
                break;
            case 'hkds':
                updateHKDList();
                break;
            case 'invoices':
                showInvoices();
                break;
            case 'import':
                // Reload categories và products nếu đang ở tab quản lý
                const hkdId = document.getElementById('manageHKD').value;
                if (hkdId) {
                    await loadCategoriesAndProducts(hkdId);
                }
                break;
        }
        
        console.log('✅ Đã tải lại dữ liệu sau sync');
        
    } catch (error) {
        console.error('❌ Lỗi tải lại dữ liệu sau sync:', error);
    }
}

// Cập nhật hàm forceSync để đồng bộ 2 chiều
window.forceSync = async function() {
    Utils.showLoading('Đang đồng bộ dữ liệu 2 chiều...');
    
    try {
        // 1. Đồng bộ từ Firebase về IndexedDB
        console.log('⬇️ Đồng bộ từ Firebase về...');
        await syncFromFirebase();
        
        // 2. Đồng bộ từ IndexedDB lên Firebase
        console.log('⬆️ Đồng bộ lên Firebase...');
        await syncToFirebase();
        
        // 3. Tải lại dữ liệu sau sync
        await loadDataAfterSync();
        
        Utils.showToast('Đồng bộ hoàn tất', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ:', error);
        Utils.showToast('Lỗi đồng bộ', 'error');
    } finally {
        Utils.hideLoading();
    }
};

// [admin.js] - Thêm các hàm xử lý Realtime UI

// XỬ LÝ KHI CÓ HÓA ĐƠN MỚI (REALTIME)
window.handleAdminRealtimeInvoice = function(invoice) {
    console.log('⚡ UI Update: Hóa đơn mới nhận được', invoice.id);
    
    // 1. Cập nhật biến bộ nhớ (quan trọng để không phải load lại DB)
    if (typeof allInvoices !== 'undefined' && Array.isArray(allInvoices)) {
        // Kiểm tra trùng lần nữa cho chắc
        if (!allInvoices.some(inv => inv.id === invoice.id)) {
            allInvoices.unshift(invoice); // Thêm vào đầu danh sách
        }
    }

    // 2. Hiển thị thông báo (Notification Manager)
    if (typeof addNewInvoiceNotification === 'function') {
        addNewInvoiceNotification(invoice); 
    } else if (typeof showNewInvoiceNotification === 'function') {
        showNewInvoiceNotification(invoice);
    }

    // 3. Cập nhật Dashboard (Nếu đang ở Dashboard)
    if (currentAdminView === 'dashboard') {
        updateDashboardStats(); // Cập nhật số liệu tổng
        
        // Thêm dòng mới vào bảng Recent Invoices với hiệu ứng
        const recentContainer = document.getElementById('recentInvoices');
        if (recentContainer) {
            // Xóa thông báo "Chưa có hóa đơn" nếu có
            const noData = recentContainer.querySelector('.no-invoices');
            if (noData) noData.remove();

            // Tạo thẻ HTML cho hóa đơn mới
            const div = document.createElement('div');
            // Logic tạo HTML giống displayRecentInvoices nhưng cho 1 item
            // Thêm class 'animate-slide-in' để mượt mà
            div.className = 'invoice-card invoice-card-new glow-effect'; 
            div.id = `invoice-${invoice.id}`;
            div.style.animation = 'slideIn 0.5s ease';
            
            div.innerHTML = `
                <div class="invoice-header">
                    <div class="invoice-id">
                        ${invoice.id.substring(0, 8)}... <span class="new-badge">MỚI</span>
                    </div>
                    <div class="invoice-status ${invoice.status || 'completed'}">
                        ${invoice.status || 'Hoàn thành'}
                    </div>
                </div>
                <div class="invoice-body">
                    <div class="invoice-info">
                        <div class="invoice-hkd"><i class="fas fa-store"></i> ${invoice.hkdName || 'HKD'}</div>
                        <div class="invoice-date"><i class="far fa-clock"></i> Vừa xong</div>
                    </div>
                    <div class="invoice-total highlight">${Utils.formatCurrency(invoice.total)}</div>
                </div>
                <div class="invoice-footer">
                    <button class="btn-view-invoice" onclick="viewInvoiceDetails('${invoice.id}')">
                        <i class="fas fa-eye"></i> Xem chi tiết
                    </button>
                </div>
            `;

            // Chèn vào đầu danh sách
            recentContainer.insertBefore(div, recentContainer.firstChild);

            // Xóa bớt nếu danh sách quá dài (>10)
            if (recentContainer.children.length > 10) {
                recentContainer.lastElementChild.remove();
            }
        }
    } 
    // 4. Cập nhật danh sách Invoice (Nếu đang ở tab Invoices)
    else if (currentAdminView === 'invoices') {
        const tableBody = document.getElementById('invoiceList');
        if (tableBody) {
            const tr = document.createElement('tr');
            tr.style.backgroundColor = '#f0f9ff'; // Highlight nhẹ
            tr.style.transition = 'background-color 2s ease';
            tr.innerHTML = `
                <td>${Utils.formatDate(invoice.date)} <span class="badge bg-success" style="font-size:0.6em">Mới</span></td>
                <td>${invoice.id.substring(0, 10)}...</td>
                <td>${invoice.hkdName}</td>
                <td>${invoice.customerName || 'Khách lẻ'}</td>
                <td>${invoice.items ? invoice.items.length : 0}</td>
                <td><strong>${Utils.formatCurrency(invoice.total)}</strong></td>
                <td>
                    <button class="btn-view" onclick="viewInvoiceDetails('${invoice.id}')"><i class="fas fa-eye"></i></button>
                </td>
            `;
            tableBody.insertBefore(tr, tableBody.firstChild);
            
            // Xóa highlight sau 2 giây
            setTimeout(() => { tr.style.backgroundColor = 'transparent'; }, 2000);
        }
    }
};

// XỬ LÝ KHI CÓ HKD MỚI (REALTIME)
window.handleAdminRealtimeHKD = function(hkd) {
    console.log('👤 UI Update: HKD Mới đăng ký', hkd.name);

    // 1. Cập nhật biến bộ nhớ
    if (typeof allHKDs !== 'undefined' && Array.isArray(allHKDs)) {
        if (!allHKDs.some(h => h.id === hkd.id)) {
            allHKDs.push(hkd);
        }
    }

    // 2. Hiển thị thông báo Toast đặc biệt
    if (typeof showNewHKDNotification === 'function') {
        showNewHKDNotification(hkd);
    } else {
        Utils.showToast(`HKD mới: ${hkd.name} vừa tham gia!`, 'success');
    }

    // 3. Cập nhật Dropdown chọn HKD
    updateHKDSelects();

    // 4. Cập nhật UI tùy view
    if (currentAdminView === 'dashboard') {
        updateDashboardStats();
    } else if (currentAdminView === 'hkds') {
        updateHKDList(); // Reload lại list để hiện HKD mới
    }
};

// CSS Animation (Thêm bằng JS nếu chưa có trong CSS)
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    @keyframes slideIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .invoice-card-new { border-left: 4px solid #10b981; }
    .glow-effect { box-shadow: 0 0 10px rgba(16, 185, 129, 0.2); }
`;
document.head.appendChild(styleSheet);
// ========== EXPORT FUNCTIONS ==========
window.loadHKDInfoFromFirebase = loadHKDInfoFromFirebase;
window.loadCategoriesAndProducts = loadCategoriesAndProducts;
window.editCategory = editCategory;
window.editProduct = editProduct;
window.deleteItem = deleteItem;
window.filterProducts = filterProducts;
window.saveCategory = saveCategory;
window.saveProduct = saveProduct;
window.confirmDelete = confirmDelete;
window.loadDataAfterSync = loadDataAfterSync;

// Auto sync khi online
window.addEventListener('online', async () => {
    console.log('🌐 Đã kết nối mạng, tự động đồng bộ...');
    setTimeout(async () => {
        await syncEssentialData();
    }, 2000);
});

// Thêm để gọi từ HTML
window.initAdminPage = initAdminPage;
window.handleSmartSync = handleSmartSync;
// Thêm vào phần EXPORT FUNCTIONS
window.handleExcelImport = handleExcelImport;
window.processExcelImport = processExcelImport;
window.forceSync = forceSync;