// HKD module - Bán hàng, quản lý đơn hàng
let currentHKD = null;
let products = [];
let categories = [];
let cart = [];
let invoiceHistory = [];
let hkdSyncInterval = null;

async function initHKDPage() {
    try {
        await initSystem();
        
        const user = getCurrentUser();
        if (!user || user.role !== 'hkd') {
            window.location.href = 'login.html?type=hkd';
            return;
        }
        
        currentHKD = user;
        
        await loadHKDData(); // Tải từ IndexedDB
        setupHKDEventListeners();
        displayHKDInfo();
        displayProducts();
        initCart();
        initSidebar();
        initHKDRealtimeSync(); // Chỉ bật listener, không sync
        
        console.log('✅ HKD page initialized');
        
        // Chỉ sync nếu dữ liệu trống HOẶC cần cập nhật
        if (navigator.onLine) {
            // Đợi một chút để listener hoạt động
            setTimeout(async () => {
                // Kiểm tra nếu dữ liệu local trống
                const localProducts = await getProductsByHKD(currentHKD.id);
                const localCategories = await getCategoriesByHKD(currentHKD.id);
                
                if (localProducts.length === 0 || localCategories.length === 0) {
                    console.log('📭 Dữ liệu local trống, thực hiện sync...');
                    await syncFromFirebase(); // Sync một lần duy nhất
                    await loadHKDData();
                    displayProducts();
                } else {
                    console.log('📊 Dữ liệu local đã có, không cần sync');
                }
            }, 1500);
        }
        
    } catch (error) {
        console.error('❌ Lỗi khởi tạo HKD page:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}


function initHKDRealtimeSync() {
    
 // Chỉ bật realtime listener
    listenForHKDRealtimeUpdates2();
    
    console.log('✅ Đã bật realtime listener (không sync tự động)');
}

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
    updateSyncStatus();
    
    console.log('⬇️ Đồng bộ từ Firebase về IndexedDB...');
    
    try {
        await syncHKDDataFromFirebase(currentHKD.id);
        await loadHKDData();
        displayProducts();
        updateCategoryList();
        
        console.log('✅ Đã đồng bộ xong từ Firebase');
        Utils.showToast('Đã cập nhật dữ liệu mới', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
        Utils.showToast('Lỗi đồng bộ dữ liệu', 'error');
    } finally {
        isSyncing = false;
        updateSyncStatus();
    }
}

async function syncHKDDataFromFirebase(hkdId) {
    try {
        await initFirebase();
        
        // Sync HKD info
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const hkdSnapshot = await hkdRef.once('value');
        const hkdData = hkdSnapshot.val();
        
        if (hkdData) {
            const localHKD = await getFromStore(STORES.HKDS, hkdId);
            if (!localHKD || new Date(hkdData.lastUpdated) > new Date(localHKD.lastUpdated)) {
                await updateInStore(STORES.HKDS, {
                    ...localHKD,
                    ...hkdData,
                    id: hkdId,
                    role: 'hkd'
                });
                
                if (hkdData.name !== currentHKD.name) {
                    currentHKD = updatedHKD;
                    displayHKDInfo();
                }
            }
        }
        
        // Sync categories
        await syncCategoriesFromFirebase();
        
        // Sync products
        await syncProductsFromFirebase();
        
        // Sync invoices
        await syncInvoicesFromFirebase();
        
    } catch (error) {
        console.error('❌ Lỗi sync toàn bộ dữ liệu HKD:', error);
        throw error;
    }
}

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
                if (categoryData && categoryData.name && !categoryData.msp) {
                    if (categoryData._deleted === true) {
                        await deleteFromStore(STORES.CATEGORIES, categoryId);
                        
                        const productsInCategory = await getProductsByCategory(currentHKD.id, categoryId);
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
                            hkdId: currentHKD.id,
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
                                hkdId: currentHKD.id,
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

async function listenForHKDRealtimeUpdates2() {
    console.log('🎧 Bắt đầu lắng nghe realtime updates cho HKD...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, không thể lắng nghe');
        return;
    }
    
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${currentHKD.id}/categories`);
        
        categoriesRef.on('child_removed', async (snapshot) => {
            const categoryId = snapshot.key;
            //console.log(`🗑️ [REALTIME] Danh mục ${categoryId} đã bị xóa từ Admin`);
            
            await deleteFromStore(STORES.CATEGORIES, categoryId);
            
            const products = await getProductsByHKD(currentHKD.id);
            const categoryProducts = products.filter(p => p.categoryId === categoryId);
            
            for (const product of categoryProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
            
            //console.log(`✅ Đã xóa ${categoryProducts.length} sản phẩm trong danh mục`);
            
            await loadHKDData();
            displayProducts();
            updateCategoryList();
            
            Utils.showToast(`Đã xóa danh mục (${categoryProducts.length} sản phẩm)`, 'warning');
        });
        
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
            
            await setupProductListenersForCategory(categoryId);
            await loadHKDData();
            updateCategoryList();
            
        });
        
        const categoriesSnapshot = await categoriesRef.once('value');
        const categoriesData = categoriesSnapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (!categoryData || !categoryData.name) continue;
                await setupProductListenersForCategory(categoryId);
            }
        }
        
        console.log('✅ Đã bật realtime listener cho HKD');
        
    } catch (error) {
        console.error('❌ Lỗi khi lắng nghe realtime updates:', error);
    }
}

async function setupProductListenersForCategory(categoryId) {
    try {
        await initFirebase();
        
        const productsRef = firebase.database().ref(
            `hkds/${currentHKD.id}/categories/${categoryId}/products`
        );
        
        productsRef.on('child_removed', async (snapshot) => {
            const productId = snapshot.key;
           //console.log(`🗑️ [REALTIME] Sản phẩm ${productId} đã bị xóa từ Admin`);
            
            await deleteFromStore(STORES.PRODUCTS, productId);
            await loadHKDData();
            displayProducts();
            
            Utils.showToast('Sản phẩm đã bị xóa', 'warning');
        });
        
        productsRef.on('child_changed', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            console.log(`🔄 [REALTIME] Sản phẩm ${productId} đã thay đổi:`, productData?.name);
            
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: currentHKD.id,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            await loadHKDData();
            displayProducts();
            
            Utils.showToast(`Sản phẩm "${productData.name}" đã được cập nhật`, 'info');
        });
        
        productsRef.on('child_added', async (snapshot) => {
            const productId = snapshot.key;
            const productData = snapshot.val();
            
            //console.log(`🆕 [REALTIME] Sản phẩm mới ${productId}:`, productData?.name);
            
            await updateInStore(STORES.PRODUCTS, {
                id: productId,
                hkdId: currentHKD.id,
                categoryId: categoryId,
                ...productData,
                _synced: true
            });
            
            await loadHKDData();
            displayProducts();
            
        });
        
        //console.log(`✅ Đã thiết lập product listeners cho danh mục ${categoryId}`);
        
    } catch (error) {
        //console.error(`❌ Lỗi thiết lập listener cho danh mục ${categoryId}:`, error);
    }
}

// ========== DATA MANAGEMENT FUNCTIONS ==========
async function loadHKDData() {
    Utils.showLoading('Đang tải dữ liệu...');
    
    try {
        products = await getProductsByHKD(currentHKD.id);
        categories = await getCategoriesByHKD(currentHKD.id);
        invoiceHistory = await getInvoicesByHKD(currentHKD.id);
        invoiceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        updateCategoryList();
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu HKD:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

function displayHKDInfo() {
    document.getElementById('hkdName').textContent = currentHKD.name;
    document.getElementById('hkdNameMobile').textContent = currentHKD.name;
}

function updateCategoryList() {
    const categoryContainer = document.getElementById('categoryList');
    if (!categoryContainer) return;
    
    const uniqueCategoryIds = [...new Set(products
        .map(p => p.categoryId)
        .filter(Boolean))];
    
    const productCategories = uniqueCategoryIds
        .map(categoryId => {
            const category = categories.find(c => c.id === categoryId);
            return category ? category.name : null;
        })
        .filter(Boolean);
    
    const allCategories = ['Tất cả', ...new Set([
        ...categories.map(c => c.name),
        ...productCategories
    ])];
    
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
        filteredProducts = products.filter(product => {
            if (!product || !product.categoryId) return false;
            const productCategory = categories.find(c => c && c.id === product.categoryId);
            return productCategory && productCategory.name === category;
        });
    }
    
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
    const cartQuantity = getCartQuantity(product.id);
    const isLowStock = product.stock !== undefined && product.stock <= 5;

    return `
        <div class="product-card" data-product-id="${product.id}">
            
            <!-- IMAGE -->
            <div class="product-image"></div>

            <!-- INFO -->
            <div class="product-info">
                <div class="product-name">${product.name}</div>

                <div class="product-price">
                    ${Utils.formatCurrency(product.price)}
                </div>

                <div class="product-meta ${isLowStock ? 'low-stock' : ''}">
                    <span>
                        ${
                            product.stock !== undefined
                                ? `Còn ${product.stock} - ${product.unit}`
                                : `Không giới hạn - ${product.unit}`
                        }
                    </span>
                </div>
            </div>

            <!-- CONTROLS -->
            <div class="product-controls">
                <button 
                    class="btn-decrease" 
                    onclick="removeFromCart('${product.id}')">
                    <i class="fas fa-minus"></i>
                </button>

                <span class="quantity-display ${cartQuantity > 0 ? 'active' : ''}">
                    ${cartQuantity > 0 ? cartQuantity : ''}
                </span>

                <button 
                    class="btn-increase" 
                    onclick="addToCart('${product.id}')">
                    <i class="fas fa-plus"></i>
                </button>
            </div>

        </div>
    `;
}).join('');

}

function filterProductsByCategory(category) {
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`.category-filter[data-category="${category}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    displayProducts(category);
}

// ========== CART MANAGEMENT ==========
function initCart() {
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

// Thêm vào trong hàm updateCartDisplay() hoặc tạo hàm mới
function updateProductCardState(productId) {
    const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (!productCard) return;
    
    const cartQuantity = getCartQuantity(productId);
    const product = products.find(p => p.id === productId);
    
    // Cập nhật class
    if (cartQuantity > 0) {
        productCard.classList.add('in-cart');
    } else {
        productCard.classList.remove('in-cart');
    }
    
    // Cập nhật số lượng
    const quantityDisplay = productCard.querySelector('.quantity-display');
    if (quantityDisplay) {
        quantityDisplay.textContent = cartQuantity > 0 ? cartQuantity : '';
        quantityDisplay.classList.toggle('active', cartQuantity > 0);
    }
    
    // Cập nhật trạng thái nút
    const decreaseBtn = productCard.querySelector('.btn-decrease');
    if (decreaseBtn) {
        decreaseBtn.disabled = cartQuantity === 0;
    }
    
    const increaseBtn = productCard.querySelector('.btn-increase');
    if (increaseBtn && product) {
        increaseBtn.disabled = product.stock !== undefined && cartQuantity >= product.stock;
    }
}

// Cập nhật trong hàm addToCart và removeFromCart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
        if (product.stock && existingItem.quantity >= product.stock) {
            Utils.showToast('Đã đạt giới hạn tồn kho', 'warning');
            return;
        }
        existingItem.quantity += 1;
    } else {
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
    
    updateCartDisplay();
    updateProductCardState(productId); // ← CẬP NHẬT
    playAddToCartSound();
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
    updateProductCardState(productId); // ← CẬP NHẬT
    saveCart();
}

function clearCart() {
    const confirmed = Utils.confirm('Bạn có chắc chắn muốn xóa giỏ hàng?');
    if (!confirmed) return;
    
    cart = [];
    updateCartDisplay();
    
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
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
    
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

function playAddToCartSound() {
    try {
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
        
        setTimeout(() => {
            oscillator.disconnect();
            gainNode.disconnect();
        }, 200);
    } catch (error) {
        console.log('Audio not supported:', error.message);
    }
}

function calculateCartTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// ========== INVOICE MANAGEMENT ==========
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
        
        const invoiceItems = cart.map(item => {
            const productInfo = products.find(p => p.id === item.productId);
            
            return {
                productId: item.productId || '',
                name: item.name || productInfo?.name || 'Sản phẩm không xác định',
                unit: item.unit || productInfo?.unit || 'cái',
                quantity: item.quantity || 0,
                price: item.price || productInfo?.price || 0,
                msp: item.msp || productInfo?.msp || '',
                category: (item.category !== undefined && item.category !== null) 
                    ? item.category 
                    : productInfo?.category || getCategoryNameById(productInfo?.categoryId) || '',
                description: item.description || productInfo?.description || '',
                note: item.note || productInfo?.note || ''
            };
        });
        
        const invoiceData = {
            id: invoiceId,
            hkdId: currentHKD.id,
            hkdName: currentHKD.name,
            customerName: customerName,
            date: new Date().toISOString(),
            items: invoiceItems,
            subtotal: calculateCartTotal(),
            tax: 0,
            discount: 0,
            total: calculateCartTotal(),
            status: 'completed',
            _synced: false,
            lastUpdated: new Date().toISOString(),
            timestamp: Date.now()
        };
        // 1. LƯU LOCAL
        await saveInvoice(invoiceData);
        invoiceHistory.unshift(invoiceData);
        
        // 2. SYNC NGAY LẬP TỨC (QUAN TRỌNG)
        // Không chờ queue, bắn thẳng lên Firebase để Admin nhận được ngay
        if (navigator.onLine) {
            saveInvoiceDirectToFirebase(invoiceData).catch(err => console.warn('Direct sync failed, using queue', err));
        }
        
        // 3. Thêm vào queue để đảm bảo an toàn dữ liệu
        if (typeof window.addToSyncQueue === 'function') {
             window.addToSyncQueue({ type: 'invoices', data: invoiceData });
        }
        let syncAdded = false;
        
        if (typeof window.addToSyncQueue === 'function') {
            await window.addToSyncQueue({
                type: 'invoices',
                data: invoiceData
            });
            syncAdded = true;
        }
        else if (typeof addToSyncQueue === 'function') {
            await addToSyncQueue({
                type: 'invoices',
                data: invoiceData
            });
            syncAdded = true;
        }
        else {
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
            } catch (syncError) {
                console.error('❌ Lỗi lưu sync queue:', syncError);
            }
        }
        
        if (!syncAdded) {
            await saveInvoiceDirectToFirebase(invoiceData);
        }
        
        invoiceHistory.unshift(invoiceData);
        await updateProductStockAfterSale();
        
        cart = [];
        updateCartDisplay();
        saveCart();
        document.getElementById('customerName').value = '';
        
        products.forEach(product => {
            updateProductQuantity(product.id);
        });
        
        Utils.showToast('Đã tạo hóa đơn thành công', 'success');
        showInvoiceReceipt(invoiceData);
        
        if (navigator.onLine && syncAdded) {
            setTimeout(async () => {
                try {
                    const pendingItems = await getPendingSyncItems();
                    console.log(`📊 Sync queue có ${pendingItems.length} item pending`);
                    
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

async function updateProductStockAfterSale() {
    try {
        for (const cartItem of cart) {
            const product = products.find(p => p.id === cartItem.productId);
            
            if (product && product.stock !== undefined) {
                product.stock = Math.max(0, product.stock - cartItem.quantity);
                product.lastUpdated = new Date().toISOString();
                
                await saveProduct(product);
                
                if (typeof window.addToSyncQueue === 'function') {
                    await window.addToSyncQueue({
                        type: 'products',
                        data: product
                    });
                }
                
                console.log(`📦 Đã cập nhật tồn kho ${product.name}: -${cartItem.quantity}`);
            }
        }
        
        products = await getProductsByHKD(currentHKD.id);
        
    } catch (error) {
        console.error('❌ Lỗi cập nhật tồn kho:', error);
    }
}

function showInvoiceReceipt(invoice) {
    const modal = new bootstrap.Modal(document.getElementById('invoiceReceiptModal'));
    
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

// ========== LỊCH SỬ ==========
function showInvoiceHistory() {
    console.log('📜 Hiển thị lịch sử hóa đơn');
    
    if (!invoiceHistory || invoiceHistory.length === 0) {
        Utils.showToast('Chưa có hóa đơn nào', 'info');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    
    const historyHtml = `
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
        
        ${invoiceHistory.length > 20 ? `
            <div class="text-center mt-3">
                <small class="text-muted">Hiển thị 20 hóa đơn gần nhất</small>
            </div>
        ` : ''}
    `;
    
    document.getElementById('historyContent').innerHTML = historyHtml;
    modal.show();
}

function viewHistoryInvoice(invoiceId) {
    const invoice = invoiceHistory.find(inv => inv.id === invoiceId);
    if (!invoice) return;
    
    showInvoiceReceipt(invoice);
}

function showRevenueReport() {
    const modal = new bootstrap.Modal(document.getElementById('revenueModal'));
    
    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    
    const monthlyInvoices = invoiceHistory.filter(inv => {
        const date = new Date(inv.date);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    });
    
    const dailyInvoices = invoiceHistory.filter(inv => {
        const date = new Date(inv.date);
        return date.toDateString() === today.toDateString();
    });
    
    const monthlyTotal = monthlyInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const dailyTotal = dailyInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const avgInvoice = invoiceHistory.length > 0 ? 
        invoiceHistory.reduce((sum, inv) => sum + inv.total, 0) / invoiceHistory.length : 0;
    
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
    
    setTimeout(() => drawRevenueChart(), 100);
}

function drawRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const dailyData = {};
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = 0;
    }
    
    invoiceHistory.forEach(invoice => {
        const invoiceDate = new Date(invoice.date).toISOString().split('T')[0];
        if (dailyData[invoiceDate] !== undefined) {
            dailyData[invoiceDate] += invoice.total;
        }
    });
    
    const dates = Object.keys(dailyData);
    const revenues = Object.values(dailyData);
    
    const maxRevenue = Math.max(...revenues, 1);
    const barWidth = canvas.width / dates.length - 10;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    dates.forEach((date, index) => {
        const barHeight = (revenues[index] / maxRevenue) * (canvas.height - 50);
        const x = index * (barWidth + 10) + 5;
        const y = canvas.height - barHeight - 30;
        
        ctx.fillStyle = '#4a6ee0';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            Utils.formatCurrency(revenues[index]).replace('₫', ''), 
            x + barWidth / 2, 
            y - 5
        );
        
        const dateLabel = new Date(date).getDate() + '/' + (new Date(date).getMonth() + 1);
        ctx.fillText(dateLabel, x + barWidth / 2, canvas.height - 10);
    });
}

// ========== SẢN PHẨM ==========
function showAllProducts() {
    console.log('📦 Hiển thị tất cả sản phẩm');
    
    const modal = new bootstrap.Modal(document.getElementById('productsModal'));
    
    if (!products || products.length === 0) {
        document.getElementById('productsContent').innerHTML = `
            <div class="no-products-modal text-center py-4">
                <i class="fas fa-box-open fa-2x text-muted mb-3"></i>
                <p>Chưa có sản phẩm nào</p>
                <button class="btn btn-primary mt-3" onclick="showProductModal()">
                    <i class="fas fa-plus"></i> Thêm sản phẩm
                </button>
            </div>
        `;
    } else {
        const productsHtml = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">Danh sách sản phẩm (${products.length})</h5>
                <button class="btn btn-sm btn-primary" onclick="showProductModal()">
                    <i class="fas fa-plus"></i> Thêm mới
                </button>
            </div>
            
            <div class="products-modal-list">
                ${products.map(product => {
                    const category = categories.find(c => c.id === product.categoryId);
                    const categoryName = category ? category.name : 'Không xác định';
                    
                    return `
                        <div class="product-modal-item">
                            <div class="product-modal-info">
                                <div class="product-modal-name">${product.name}</div>
                                <div class="product-modal-details">
                                    <span class="badge bg-light text-dark">${product.msp || 'N/A'}</span>
                                    <span class="badge bg-info">${categoryName}</span>
                                    <span class="text-primary">${Utils.formatCurrency(product.price)}/${product.unit}</span>
                                </div>
                            </div>
                            <div class="product-modal-stock">
                                ${product.stock !== undefined ? 
                                    `<span class="badge ${product.stock > 10 ? 'bg-success' : product.stock > 0 ? 'bg-warning' : 'bg-danger'}">
                                        Còn: ${product.stock}
                                    </span>` : 
                                    '<span class="badge bg-secondary">Không giới hạn</span>'
                                }
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        document.getElementById('productsContent').innerHTML = productsHtml;
    }
    
    modal.show();
}


// ========== PRODUCT MANAGEMENT ==========
function showCategoryModal() {
    document.getElementById('hkdCategoryName').value = '';
    document.getElementById('hkdCategoryDescription').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('hkdCategoryModal'));
    modal.show();
}

function showProductModal() {
    document.getElementById('hkdProductCode').value = '';
    document.getElementById('hkdProductName').value = '';
    document.getElementById('hkdProductUnit').value = 'cái';
    document.getElementById('hkdProductPrice').value = '';
    document.getElementById('hkdProductStock').value = '0';
    document.getElementById('hkdProductDescription').value = '';
    
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
        const categoryId = Utils.generateId();
        const categoryData = {
            id: categoryId,
            hkdId: currentHKD.id,
            name: name,
            description: description,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false,
            _createdBy: 'hkd'
        };
        
        await updateInStore(STORES.CATEGORIES, categoryData);
        categories.push(categoryData);
        updateCategoryList();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('hkdCategoryModal'));
        if (modal) modal.hide();
        
        Utils.showToast(`Đã thêm danh mục "${name}"`, 'success');
        
        setTimeout(async () => {
            try {
                await initFirebase();
                
                const categoryRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${categoryId}`
                );
                
                const firebaseData = {
                    name: name,
                    description: description,
                    createdAt: categoryData.createdAt,
                    lastUpdated: categoryData.lastUpdated,
                    products: {},
                    _syncedAt: new Date().toISOString(),
                    _createdBy: 'hkd'
                };
                
                await categoryRef.set(firebaseData);
                
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
    
    if (!productData.msp || !productData.name || !productData.categoryId || productData.price <= 0) {
        Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu hàng hóa...');
    
    try {
        await updateInStore(STORES.PRODUCTS, { ...productData, hkdId: currentHKD.id });
        products.push({ ...productData, hkdId: currentHKD.id });
        displayProducts();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('hkdProductModal'));
        if (modal) modal.hide();
        
        Utils.showToast(`Đã thêm sản phẩm "${productData.name}"`, 'success');
        
        setTimeout(async () => {
            try {
                await initFirebase();
                
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

async function editHKDProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    document.getElementById('hkdProductCode').value = product.msp || '';
    document.getElementById('hkdProductName').value = product.name || '';
    document.getElementById('hkdProductUnit').value = product.unit || 'cái';
    document.getElementById('hkdProductPrice').value = product.price || 0;
    document.getElementById('hkdProductStock').value = product.stock || 0;
    document.getElementById('hkdProductDescription').value = product.description || '';
    
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
        
        await deleteFromStore(STORES.PRODUCTS, productId);
        products = products.filter(p => p.id !== productId);
        displayProducts();
        
        Utils.showToast('Đã xóa sản phẩm', 'success');
        
        setTimeout(async () => {
            try {
                await initFirebase();
                
                const productRef = firebase.database().ref(
                    `hkds/${currentHKD.id}/categories/${product.categoryId}/products/${productId}`
                );
                
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

async function deleteHKDCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
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
        const categoryProducts = products.filter(p => p.categoryId === categoryId);
        for (const product of categoryProducts) {
            await deleteFromStore(STORES.PRODUCTS, product.id);
        }
        
        await deleteFromStore(STORES.CATEGORIES, categoryId);
        
        categories = categories.filter(c => c.id !== categoryId);
        products = products.filter(p => p.categoryId !== categoryId);
        
        displayProducts();
        updateCategoryList();
        await loadHKDManagementData();
        
        Utils.showToast(`Đã xóa danh mục "${category.name}"`, 'success');
        
        setTimeout(async () => {
            try {
                await initFirebase();
                
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

async function loadHKDManagementData() {
    try {
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

function showAllManagement() {
    console.log('📋 Hiển thị trang quản lý HKD');
    
    const modal = new bootstrap.Modal(document.getElementById('hkdManagementModal'));
    loadHKDManagementData();
    modal.show();
}

// ========== SIDEBAR FUNCTIONS ==========
function initSidebar() {
    const menuItems = [
        { 
            id: 'dashboard', 
            icon: 'fa-home', 
            text: 'Bán hàng', 
            action: showDashboard 
        },
        { 
            id: 'history', 
            icon: 'fa-history', 
            text: 'Lịch sử', 
            action: showInvoiceHistory 
        },
        { 
            id: 'revenue', 
            icon: 'fa-chart-line', 
            text: 'Doanh thu', 
            action: showRevenueReport 
        },
        { 
            id: 'products', 
            icon: 'fa-boxes', 
            text: 'Sản phẩm', 
            action: showAllProducts 
        },
        { 
            id: 'management', 
            icon: 'fa-cog', 
            text: 'Quản lý', 
            action: showAllManagement 
        },
        { 
            id: 'sync', 
            icon: 'fa-sync-alt', 
            text: 'Đồng bộ', 
            action: handleSidebarSync 
        },
        { 
            id: 'logout', 
            icon: 'fa-sign-out-alt', 
            text: 'Đăng xuất', 
            action: handleLogout 
        }
    ];
    
    const menuContainer = document.getElementById('sidebarMenu');
    if (!menuContainer) {
        console.error('❌ Không tìm thấy sidebarMenu container');
        return;
    }
    
    menuContainer.innerHTML = menuItems.map(item => `
        <div class="menu-item" id="menu-${item.id}" onclick="handleMenuItemClick('${item.id}')">
            <i class="fas ${item.icon}"></i>
            <span>${item.text}</span>
        </div>
    `).join('');
    
    console.log('✅ Sidebar đã được khởi tạo');
}
function handleMenuItemClick(menuId) {
    console.log(`🎯 Menu item clicked: ${menuId}`);
    
    switch(menuId) {
        case 'dashboard':
            showDashboard();
            break;
        case 'history':
            showInvoiceHistory();
            break;
        case 'revenue':
            showRevenueReport();
            break;
        case 'products':
            showAllProducts();
            break;
        case 'management':
            showAllManagement();
            break;
        case 'sync':
            handleSidebarSync();
            break;
        case 'logout':
            handleLogout();
            break;
        default:
            console.warn(`⚠️ Menu item không xác định: ${menuId}`);
    }
    
    // Đóng sidebar (trừ trường hợp logout)
    if (menuId !== 'logout') {
        toggleSidebar();
    }
}
async function handleSidebarSync() {
    console.log('🔄 Bắt đầu đồng bộ thủ công...');
    
    try {
        Utils.showLoading('Đang đồng bộ dữ liệu...');
        
        // 1. Đồng bộ từ Firebase về
        await syncFromFirebase();
        
        // 2. Tải lại dữ liệu
        await loadHKDData();
        displayProducts();
        
        Utils.showToast('Đã đồng bộ dữ liệu thành công', 'success');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ:', error);
        Utils.showToast('Lỗi đồng bộ dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}
function logout() {
    console.log('🚪 Đăng xuất...');
    
    try {
        // Xóa thông tin user từ localStorage
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userToken');
        
        // Xóa cart của HKD hiện tại
        if (currentHKD) {
            localStorage.removeItem(`cart_${currentHKD.id}`);
        }
        
        // Chuyển hướng về trang login
        window.location.href = 'login.html?type=hkd';
        
    } catch (error) {
        console.error('❌ Lỗi đăng xuất:', error);
        window.location.href = 'login.html?type=hkd';
    }
}

function handleLogout() {
    const confirmed = confirm('Bạn có chắc chắn muốn đăng xuất?');
    if (confirmed) {
        logout();
    }
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        console.error('❌ Không tìm thấy sidebar');
        return;
    }
    
    sidebar.classList.toggle('active');
    
    // Toggle overlay
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.classList.toggle('active');
    } else {
        // Tạo overlay nếu chưa có
        createSidebarOverlay();
    }
}
function createSidebarOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    overlay.onclick = toggleSidebar;
    document.body.appendChild(overlay);
    
    // Thêm animation
    setTimeout(() => overlay.classList.add('active'), 10);
}

function showDashboard() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}

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

function cleanupHKD() {
   
    
    window.removeEventListener('online', handleHKDConnectionChange);
    window.removeEventListener('offline', handleHKDConnectionChange);
    
    console.log('🧹 Đã dọn dẹp HKD sync');
}

// ========== UTILITY FUNCTIONS ==========
function getCategoryNameById(categoryId) {
    if (!categoryId || !categories) return '';
    const category = categories.find(c => c && c.id === categoryId);
    return category ? category.name : '';
}

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

function callSupport() {
    const phone = '0932155035';
    
    if (confirm(`Bạn muốn gọi đến số ${phone}?`)) {
        window.location.href = `tel:${phone}`;
    }
}

function copyPhoneNumber() {
    const phone = '0932155035';
    
    navigator.clipboard.writeText(phone).then(() => {
        Utils.showToast('Đã sao chép số điện thoại', 'success');
    }).catch(err => {
        console.error('Lỗi sao chép:', err);
        Utils.showToast('Lỗi sao chép', 'error');
    });
}

// ========== EVENT LISTENERS ==========
// ========== EVENT LISTENERS ==========
function setupHKDEventListeners() {
    console.log('🎯 Thiết lập event listeners cho HKD');
    
    // Sidebar toggle - KIỂM TRA PHẦN TỬ TỒN TẠI TRƯỚC KHI THÊM EVENT
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        console.log('✅ Tìm thấy menuToggle, thêm event listener');
        menuToggle.addEventListener('click', toggleSidebar);
    } else {
        console.error('❌ Không tìm thấy phần tử menuToggle');
    }
    
    // Category filter - SỬ DỤNG EVENT DELEGATION
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-filter')) {
            filterProductsByCategory(e.target.dataset.category);
        }
    });
    
    // Product click - SỬ DỤNG EVENT DELEGATION
    const productGrid = document.getElementById('productGrid');
    if (productGrid) {
        productGrid.addEventListener('click', (e) => {
            const productCard = e.target.closest('.product-card');
            if (productCard) {
                const productId = productCard.dataset.productId;
                addToCart(productId);
            }
        });
    } else {
        console.warn('⚠️ Không tìm thấy productGrid');
    }
    
    // Cart actions - KIỂM TRA TỒN TẠI
    const clearCartBtn = document.getElementById('clearCart');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', clearCart);
    }
    
    const createInvoiceBtn = document.getElementById('createInvoice');
    if (createInvoiceBtn) {
        createInvoiceBtn.addEventListener('click', createInvoice);
    }
    
    // Footer buttons - KIỂM TRA TỒN TẠI
    const clearCartFooterBtn = document.getElementById('clearCartFooter');
    if (clearCartFooterBtn) {
        clearCartFooterBtn.addEventListener('click', clearCart);
    }
    
    const createInvoiceFooterBtn = document.getElementById('createInvoiceFooter');
    if (createInvoiceFooterBtn) {
        createInvoiceFooterBtn.addEventListener('click', createInvoice);
    }
    
    // Invoice history - KIỂM TRA TỒN TẠI (nếu vẫn cần cho sidebar)
    const viewHistoryBtn = document.getElementById('viewHistory');
    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', showInvoiceHistory);
    }
    
    const viewRevenueBtn = document.getElementById('viewRevenue');
    if (viewRevenueBtn) {
        viewRevenueBtn.addEventListener('click', showRevenueReport);
    }
    
    // Customer name input
    const customerNameInput = document.getElementById('customerName');
    if (customerNameInput) {
        customerNameInput.addEventListener('input', (e) => {
            updateCartSummary();
        });
    }
    
    // Close sidebar khi click outside
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menuToggle');
        
        if (sidebar && sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            menuToggle && !menuToggle.contains(e.target)) {
            toggleSidebar();
        }
    });
    
    console.log('✅ Đã thiết lập xong event listeners');
}

// ========== EXPORT FUNCTIONS ==========
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.viewHistoryInvoice = viewHistoryInvoice;
window.toggleSidebar = toggleSidebar;
window.forceSync = forceSync;
window.syncFromFirebase = syncFromFirebase;
window.cleanupHKD = cleanupHKD;
window.debugProductCategories = debugProductCategories;
window.callSupport = callSupport;
window.copyPhoneNumber = copyPhoneNumber;
window.editHKDProduct = editHKDProduct;
window.deleteHKDProduct = deleteHKDProduct;
window.deleteHKDCategory = deleteHKDCategory;
window.showCategoryModal = showCategoryModal;
window.showProductModal = showProductModal;
window.saveHKDCategory = saveHKDCategory;
window.saveHKDProduct = saveHKDProduct;
// ========== THÊM VÀO PHẦN EXPORT ==========
// Thêm vào cuối file, trong phần export
window.showDashboard = showDashboard;
window.showInvoiceHistory = showInvoiceHistory;
window.showRevenueReport = showRevenueReport;
window.showAllProducts = showAllProducts;
window.showAllManagement = showAllManagement;
window.handleSidebarSync = handleSidebarSync;
window.handleLogout = handleLogout;
window.handleMenuItemClick = handleMenuItemClick;
window.logout = logout;
// Dọn dẹp khi page unload
window.addEventListener('beforeunload', cleanupHKD);
window.addEventListener('pagehide', cleanupHKD);