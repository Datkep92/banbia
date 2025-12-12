class HKDManager {
    constructor() {
        this.currentCart = null;
        this.products = {};
        this.categories = [];
        this.hkdId = null;
        this.hkdInfo = null;
        
        this.init();
    }
    
    async init() {
        // Kiểm tra đăng nhập
        if (!window.authManager?.checkAuthStatus()) {
            console.log('HKD not logged in');
            return;
        }
        
        // Lấy thông tin HKD
        this.hkdId = window.authManager.getCurrentHKD();
        if (!this.hkdId) {
            console.error('No HKD ID found');
            return;
        }
        
        // Khởi tạo
        await this.loadHKDInfo();
        this.restoreCart(); 
        await this.loadData();
        this.setupEventListeners();
        this.updateConnectionStatus();
        
        console.log('HKDManager initialized for:', this.hkdId);
    }
    
    // Load thông tin HKD
    async loadHKDInfo() {
        try {
            // Sử dụng window.database
            const snapshot = await database.ref(`hkds/${this.hkdId}/info`).once('value');
            this.hkdInfo = snapshot.val();
            
            if (this.hkdInfo) {
                // Cập nhật tên cửa hàng
                const storeNameEl = document.getElementById('hkd-store-name');
                if (storeNameEl) {
                    storeNameEl.textContent = this.hkdInfo.name || 'Cửa hàng của tôi';
                }
                
                // Lưu vào localStorage để offline
                localStorage.setItem(`hkd_info_${this.hkdId}`, JSON.stringify(this.hkdInfo));
            }
        } catch (error) {
            console.error('Error loading HKD info:', error);
            
            // Thử load từ cache
            const cachedInfo = localStorage.getItem(`hkd_info_${this.hkdId}`);
            if (cachedInfo) {
                this.hkdInfo = JSON.parse(cachedInfo);
                const storeNameEl = document.getElementById('hkd-store-name');
                if (storeNameEl && this.hkdInfo.name) {
                    storeNameEl.textContent = this.hkdInfo.name;
                }
            }
        }
    }
    // hkd.js - Thêm hàm để load summary
async loadSalesHistorySummary() {
    try {
        const result = await dbManager.getSalesHistory(this.hkdId);
        if (result.success && result.data.length > 0) {
            // Có thể hiển thị số đơn hàng trên nút history
            const historyFab = document.getElementById('history-fab');
            if (historyFab) {
                const badge = document.createElement('span');
                badge.className = 'fab-badge';
                badge.textContent = result.data.length > 99 ? '99+' : result.data.length;
                badge.style.cssText = `
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: #dc3545;
                    color: white;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                historyFab.appendChild(badge);
            }
        }
    } catch (error) {
        console.error('Error loading sales summary:', error);
    }
}
    // hkd.js - Sửa hàm loadData
// hkd.js - Cập nhật hàm loadData để debug
async loadData() {
    try {
        utils.showLoading('Đang tải dữ liệu...');
        
        console.log('=== Loading HKD Data ===');
        console.log('HKD ID:', this.hkdId);
        
        // Load HKD info
        await this.loadHKDInfo();
        
        // Load products và categories song song
        await Promise.all([
            this.loadProducts(),
            this.loadCategories()
        ]);
        
        console.log('Data loaded:', {
            productsCount: Object.keys(this.products).length,
            categories: this.categories,
            categoriesLength: this.categories.length
        });
        
        // Debug: Kiểm tra từng sản phẩm và danh mục
        if (Object.keys(this.products).length > 0) {
            console.log('Sample products with categories:');
            Object.values(this.products).slice(0, 5).forEach(product => {
                console.log(`- ${product.name}: ${product.category}`);
            });
        }
        
        // Render UI
        this.renderCategories();
        this.renderProducts('all');
        this.updateCartUI();
        
        // Load sales history nếu có nút
        if (document.getElementById('history-fab')) {
            this.loadSalesHistorySummary();
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        utils.showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// hkd.js - Cập nhật hàm loadCategories để debug
async loadCategories() {
    try {
        console.log('=== DEBUG: Loading categories ===');
        console.log('HKD ID:', this.hkdId);
        
        // Thử load từ database trước
        if (window.dbManager && typeof window.dbManager.getCategories === 'function') {
            console.log('Using dbManager.getCategories');
            const result = await window.dbManager.getCategories(this.hkdId);
            
            console.log('dbManager result:', result);
            
            if (result.success && result.data && Array.isArray(result.data)) {
                this.categories = result.data;
                console.log('Categories from dbManager:', this.categories);
            } else {
                console.log('dbManager failed, trying Firebase directly');
                await this.loadCategoriesFromFirebase();
            }
        } else {
            console.log('dbManager not available, using Firebase');
            await this.loadCategoriesFromFirebase();
        }
        
        // Đảm bảo có ít nhất danh mục "Khác"
        if (!this.categories.includes('Khác')) {
            this.categories.push('Khác');
        }
        
        // Đảm bảo có danh mục "Tất cả" cho UI
        if (!this.categories.includes('Tất cả')) {
            this.categories.unshift('Tất cả');
        }
        
        // Lưu vào localStorage để offline
        localStorage.setItem(`categories_${this.hkdId}`, JSON.stringify(this.categories));
        
        console.log('Final categories after processing:', this.categories);
        console.log('Number of categories:', this.categories.length);
        
    } catch (error) {
        console.error('Error loading categories:', error);
        
        // Thử load từ cache
        const cachedCategories = localStorage.getItem(`categories_${this.hkdId}`);
        if (cachedCategories) {
            this.categories = JSON.parse(cachedCategories);
            console.log('Loaded categories from cache:', this.categories);
        } else {
            this.categories = ['Tất cả', 'Khác'];
            console.log('Using default categories');
        }
    }
}
    
    // Load sản phẩm
    async loadProducts() {
        try {
            const result = await dbManager.getProducts(this.hkdId);
            
            if (result.success) {
                this.products = result.data;
                
                // Lưu vào localStorage để offline
                localStorage.setItem(`products_${this.hkdId}`, JSON.stringify(this.products));
                
                console.log(`Loaded ${result.count || Object.keys(this.products).length} products`);
                
                // Cập nhật Product Count
                const productCount = document.getElementById('product-count');
                if (productCount) {
                    productCount.textContent = `(${Object.keys(this.products).length} sản phẩm)`;
                }
            } else {
                // Thử load từ cache
                const cachedProducts = localStorage.getItem(`products_${this.hkdId}`);
                if (cachedProducts) {
                    this.products = JSON.parse(cachedProducts);
                    console.log(`Loaded ${Object.keys(this.products).length} products from cache`);
                }
            }
        } catch (error) {
            console.error('Error loading products:', error);
        }
    }
    


// Thêm hàm mới để load từ Firebase
async loadCategoriesFromFirebase() {
    try {
        const snapshot = await database.ref(`hkds/${this.hkdId}/categories`).once('value');
        const data = snapshot.val();
        
        if (data && Array.isArray(data)) {
            this.categories = data;
            console.log('Loaded categories from Firebase:', this.categories);
        } else {
            // Nếu không có data, kiểm tra trong products
            await this.extractCategoriesFromProducts();
        }
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        await this.extractCategoriesFromProducts();
    }
}

// Thêm hàm extract categories từ products
async extractCategoriesFromProducts() {
    try {
        console.log('Extracting categories from products...');
        
        const categoriesSet = new Set(['Khác']);
        
        // Lấy tất cả sản phẩm
        const productsSnapshot = await database.ref(`hkds/${this.hkdId}/products`).once('value');
        const products = productsSnapshot.val();
        
        if (products) {
            Object.values(products).forEach(product => {
                if (product.category && product.category.trim() !== '') {
                    categoriesSet.add(product.category.trim());
                }
            });
        }
        
        this.categories = Array.from(categoriesSet);
        console.log('Extracted categories:', this.categories);
        
        // Lưu categories trở lại Firebase để lần sau dùng
        if (this.categories.length > 0) {
            await database.ref(`hkds/${this.hkdId}/categories`).set(this.categories);
        }
        
    } catch (error) {
        console.error('Error extracting categories:', error);
        this.categories = ['Khác'];
    }
}
    
    // hkd.js - Sửa hàm renderCategories
renderCategories() {
    const categoriesList = document.getElementById('categories-list');
    if (!categoriesList) {
        console.error('categories-list element not found');
        return;
    }
    
    console.log('Rendering categories:', this.categories);
    
    // Clear existing
    categoriesList.innerHTML = '';
    
    // Luôn có button "Tất cả"
    const allButton = document.createElement('a');
    allButton.className = 'category-item active';
    allButton.dataset.category = 'all';
    allButton.textContent = 'Tất cả';
    allButton.href = '#';
    
    allButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCategoryClick('all', allButton);
    });
    
    categoriesList.appendChild(allButton);
    
    // Render các danh mục thực tế (loại bỏ "Tất cả" nếu có trong array)
    const actualCategories = this.categories.filter(cat => 
        cat !== 'Tất cả' && cat !== 'all'
    );
    
    if (actualCategories.length === 0) {
        // Nếu không có danh mục nào, chỉ hiển thị "Khác"
        const otherButton = document.createElement('a');
        otherButton.className = 'category-item';
        otherButton.dataset.category = 'Khác';
        otherButton.textContent = 'Khác';
        otherButton.href = '#';
        
        otherButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleCategoryClick('Khác', otherButton);
        });
        
        categoriesList.appendChild(otherButton);
    } else {
        // Render tất cả danh mục
        actualCategories.forEach(category => {
            const button = document.createElement('a');
            button.className = 'category-item';
            button.dataset.category = category;
            button.textContent = category;
            button.href = '#';
            button.title = category; // Tooltip
            
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleCategoryClick(category, button);
            });
            
            categoriesList.appendChild(button);
        });
    }
    
    // Thêm button thêm danh mục mới
    const addCategoryButton = document.createElement('a');
    addCategoryButton.className = 'category-item add-category';
    addCategoryButton.innerHTML = '<i class="fas fa-plus"></i> Thêm';
    addCategoryButton.href = '#';
    addCategoryButton.title = 'Thêm danh mục mới';
    
    addCategoryButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.showAddCategoryModal();
    });
    
    categoriesList.appendChild(addCategoryButton);
}

// Thêm hàm handleCategoryClick
handleCategoryClick(category, buttonElement) {
    // Update active state
    document.querySelectorAll('.category-item').forEach(btn => {
        btn.classList.remove('active');
    });
    buttonElement.classList.add('active');
    
    // Render products for this category
    this.renderProducts(category);
    
    console.log('Category selected:', category);
}

// Thêm hàm showAddCategoryModal
showAddCategoryModal() {
    const modalContent = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">Thêm danh mục mới</h3>
            <div class="form-group">
                <label for="new-category-name">Tên danh mục</label>
                <input type="text" id="new-category-name" 
                       placeholder="Nhập tên danh mục mới" 
                       style="width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            <div class="form-group">
                <label for="category-color">Màu sắc (tùy chọn)</label>
                <input type="color" id="category-color" value="#007bff" 
                       style="width: 100%; height: 40px; margin-bottom: 15px;">
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="hkd-btn hkd-btn-secondary" id="cancel-add-category">Hủy</button>
                <button class="hkd-btn hkd-btn-primary" id="save-new-category">Lưu</button>
            </div>
        </div>
    `;
    
    const modal = utils.createModal('Thêm danh mục mới', modalContent, []);
    
    // Xử lý lưu
    modal.querySelector('#save-new-category').addEventListener('click', async () => {
        const categoryName = modal.querySelector('#new-category-name').value.trim();
        
        if (!categoryName) {
            utils.showNotification('Vui lòng nhập tên danh mục', 'error');
            return;
        }
        
        if (this.categories.includes(categoryName)) {
            utils.showNotification('Danh mục đã tồn tại', 'warning');
            return;
        }
        
        try {
            utils.showLoading('Đang thêm danh mục...');
            
            // Thêm vào local categories
            this.categories.push(categoryName);
            
            // Update lên Firebase
            await database.ref(`hkds/${this.hkdId}/categories`).set(this.categories);
            
            // Lưu vào localStorage
            localStorage.setItem(`categories_${this.hkdId}`, JSON.stringify(this.categories));
            
            // Re-render categories
            this.renderCategories();
            
            utils.showNotification(`Đã thêm danh mục "${categoryName}"`, 'success');
            
            // Đóng modal
            modal.close();
            
        } catch (error) {
            console.error('Error adding category:', error);
            utils.showNotification('Lỗi thêm danh mục: ' + error.message, 'error');
        } finally {
            utils.hideLoading();
        }
    });
    
    // Xử lý hủy
    modal.querySelector('#cancel-add-category').addEventListener('click', () => {
        modal.close();
    });
}
    
    // Render sản phẩm theo danh mục
    renderProducts(category = 'all') {
        const productsGrid = document.getElementById('products-grid');
        if (!productsGrid) return;
        
        if (Object.keys(this.products).length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-products">
                    <div class="empty-icon">📦</div>
                    <p>Chưa có sản phẩm nào</p>
                    <button onclick="window.hkdManager.showAddProductModal()" class="hkd-btn hkd-btn-primary" style="margin-top: 20px;">
                        <i class="fas fa-plus"></i>
                        Thêm sản phẩm đầu tiên
                    </button>
                </div>
            `;
            return;
        }
        
        // Filter products by category
        let filteredProducts = Object.values(this.products);
        if (category !== 'all') {
            filteredProducts = filteredProducts.filter(product => 
                product.category === category
            );
        }
        
        if (filteredProducts.length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-products">
                    <div class="empty-icon">🔍</div>
                    <p>Không có sản phẩm nào trong danh mục này</p>
                </div>
            `;
            return;
        }
        
        // Render products grid
        productsGrid.innerHTML = '';
        
        filteredProducts.forEach(product => {
            const productCard = this.createProductCard(product);
            productsGrid.appendChild(productCard);
        });
        
        // Update quantity displays
        this.updateProductQuantities();
    }
    
    // Tạo product card
    createProductCard(product) {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.dataset.productId = product.id;
        
        const isOutOfStock = (product.stock || 0) <= 0;
        
        productCard.innerHTML = `
            <div class="product-image">
                ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">` : '📦'}
            </div>
            <div class="product-info">
                <h3 class="product-name" title="${product.name}">${product.name}</h3>
                <div class="product-price">${utils.formatCurrency(product.price || 0)}</div>
                <div class="product-stock ${isOutOfStock ? 'out-of-stock' : ''}">
                    ${isOutOfStock ? 'Hết hàng' : `Còn: ${product.stock} ${product.unit || 'cái'}`}
                </div>
            </div>
            <div class="product-actions">
                <button class="qty-btn minus-btn" ${isOutOfStock ? 'disabled' : ''}>
                    <i class="fas fa-minus"></i>
                </button>
                <span class="product-quantity" id="qty-${product.id}">0</span>
                <button class="qty-btn plus-btn" ${isOutOfStock ? 'disabled' : ''}>
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const minusBtn = productCard.querySelector('.minus-btn');
        const plusBtn = productCard.querySelector('.plus-btn');
        
        minusBtn.addEventListener('click', () => this.removeFromCart(product.id));
        plusBtn.addEventListener('click', () => this.addToCart(product));
        
        return productCard;
    }

    // Cập nhật số lượng sản phẩm trong giỏ hàng trên UI
    updateProductQuantities() {
        // Check for null/undefined this.currentCart
        if (!this.currentCart || !this.currentCart.items) {
             return;
        }

        // Reset tất cả quantities về 0 (để tránh hiển thị sai khi lọc danh mục)
        document.querySelectorAll('.product-quantity').forEach(el => el.textContent = '0');
        
        // Cập nhật các sản phẩm trong giỏ hàng
        this.currentCart.items.forEach(item => {
            const qtyEl = document.getElementById(`qty-${item.product_id}`);
            if (qtyEl) {
                qtyEl.textContent = item.quantity;
            }
        });
    }
    
    // Khôi phục giỏ hàng từ localStorage
    restoreCart() {
        const savedCart = localStorage.getItem('current_cart');
        
        if (savedCart) {
            try {
                this.currentCart = JSON.parse(savedCart);
                
                // Kiểm tra xem cart có thuộc về HKD hiện tại không
                if (this.currentCart.hkdId !== this.hkdId) {
                    this.currentCart = this.createNewCart();
                } else {
                    this.updateCartUI(); // Cập nhật giao diện giỏ hàng sau khi khôi phục
                }
            } catch (error) {
                console.error('Error restoring cart:', error);
                this.currentCart = this.createNewCart();
            }
        } else {
            this.currentCart = this.createNewCart();
        }
    }
    
    // Tạo giỏ hàng mới
    createNewCart() {
        return {
            hkdId: this.hkdId,
            items: [],
            subtotal: 0,
            discount: 0,
            tax: 0,
            total: 0,
            lastUpdated: Date.now()
        };
    }
    
    // Tính toán tổng giỏ hàng
    calculateTotals() {
        if (!this.currentCart) return;

        let subtotal = 0;
        this.currentCart.items.forEach(item => {
            subtotal += item.total;
        });

        // Áp dụng thuế (nếu có)
        const taxRate = this.hkdInfo?.settings?.taxRate || 0;
        const tax = subtotal * (taxRate / 100);
        
        // Discount (tạm thời không xử lý phức tạp)
        const discount = this.currentCart.discount || 0;

        const total = subtotal + tax - discount;

        this.currentCart.subtotal = subtotal;
        this.currentCart.tax = tax;
        this.currentCart.total = total;
        this.currentCart.lastUpdated = Date.now();
    }

    // Lưu giỏ hàng vào localStorage
    saveCart() {
        this.calculateTotals();
        localStorage.setItem('current_cart', JSON.stringify(this.currentCart));
        this.updateCartUI();
    }
    
    // Xóa giỏ hàng
    clearCart() {
        if (this.currentCart && this.currentCart.items.length > 0) {
            if (confirm('Bạn có chắc muốn xóa tất cả sản phẩm trong giỏ hàng?')) {
                 this.currentCart = this.createNewCart();
                 this.saveCart();
                 utils.showNotification('Đã xóa giỏ hàng', 'info');
            }
        } else {
            utils.showNotification('Giỏ hàng đã trống', 'info');
        }
    }
    
    // Cập nhật UI giỏ hàng
    updateCartUI() {
        if (!this.currentCart) return;
        
        // Elements that exist in the minimal hkd.html footer
        const cartTotalEl = document.getElementById('cart-total');
        const cartCountEl = document.getElementById('cart-count');
        const checkoutBtn = document.getElementById('checkout-btn');
        const clearCartBtn = document.getElementById('clear-cart-btn');

        // Elements that are MISSING in the minimal hkd.html (optional for detailed UI)
        const cartItems = document.getElementById('cart-items'); 
        const cartSubtotalEl = document.getElementById('cart-subtotal');
        const cartTaxEl = document.getElementById('cart-tax');
        const cartDiscountEl = document.getElementById('cart-discount');
        
        this.calculateTotals();
        
        let totalItemsCount = this.currentCart.items.reduce((sum, item) => sum + item.quantity, 0);
        const isCartEmpty = this.currentCart.items.length === 0;

        // --- RENDER DETAILED CART ITEMS (Only if the container exists) ---
        if (cartItems) {
            cartItems.innerHTML = '';
            
            if (isCartEmpty) {
                cartItems.innerHTML = '<div class="empty-cart">Giỏ hàng trống</div>';
            } else {
                this.currentCart.items.forEach(item => {
                    const cartItem = document.createElement('div');
                    cartItem.className = 'cart-item';
                    cartItem.innerHTML = `
                        <div class="cart-item-info">
                            <div class="cart-item-name">${item.name}</div>
                            <div class="cart-item-details">
                                ${utils.formatCurrency(item.price)} x ${item.quantity} 
                                <strong style="float: right;">${utils.formatCurrency(item.total)}</strong>
                            </div>
                        </div>
                        <div class="cart-item-actions">
                            <button class="cart-item-btn minus-btn" data-product-id="${item.product_id}" title="Giảm">
                                <i class="fas fa-minus"></i>
                            </button>
                            <span class="cart-item-qty">${item.quantity}</span>
                            <button class="cart-item-btn plus-btn" data-product-id="${item.product_id}" title="Tăng">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="cart-item-btn delete-btn" data-product-id="${item.product_id}" title="Xóa">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    cartItems.appendChild(cartItem);
                    
                    // Add event listeners
                    cartItem.querySelector('.minus-btn').addEventListener('click', () => {
                        this.removeFromCart(item.product_id);
                    });
                    cartItem.querySelector('.plus-btn').addEventListener('click', () => {
                        const product = this.products[item.product_id];
                        if (product) {
                            this.addToCart(product);
                        } else {
                             utils.showNotification('Không tìm thấy thông tin sản phẩm', 'error');
                        }
                    });
                    cartItem.querySelector('.delete-btn').addEventListener('click', () => {
                        this.removeItemFromCart(item.product_id);
                    });
                });
            }
            
            // Update detailed totals (Only if containers exist)
            if (cartSubtotalEl) cartSubtotalEl.textContent = utils.formatCurrency(this.currentCart.subtotal);
            if (cartDiscountEl) cartDiscountEl.textContent = utils.formatCurrency(this.currentCart.discount);
            if (cartTaxEl) cartTaxEl.textContent = utils.formatCurrency(this.currentCart.tax);
        }
        // --- END DETAILED CART ITEMS ---

        // --- UPDATE FOOTER ELEMENTS (These exist in hkd.html) ---
        if (cartTotalEl) cartTotalEl.textContent = utils.formatCurrency(this.currentCart.total);
        
        if (cartCountEl) {
            cartCountEl.textContent = totalItemsCount > 99 ? '99+' : totalItemsCount;
        }
        
        if (checkoutBtn) checkoutBtn.disabled = isCartEmpty;
        if (clearCartBtn) clearCartBtn.disabled = isCartEmpty;
        
        // Update product grid quantities
        this.updateProductQuantities();
    }
    
    // Thêm sản phẩm vào giỏ hàng
    addToCart(product) {
        if ((product.stock || 0) <= 0) {
            utils.showNotification('Sản phẩm đã hết hàng', 'warning');
            return;
        }
        
        // Tìm sản phẩm trong giỏ hàng
        const existingItem = this.currentCart.items.find(item => item.product_id === product.id);
        
        if (existingItem) {
            // Kiểm tra tồn kho
            if (existingItem.quantity >= (product.stock || 0)) {
                utils.showNotification('Đã đạt giới hạn tồn kho', 'warning');
                return;
            }
            
            existingItem.quantity += 1;
            existingItem.total = existingItem.price * existingItem.quantity;
        } else {
            // Thêm sản phẩm mới vào giỏ hàng 
            this.currentCart.items.push({
                product_id: product.id,
                name: product.name,
                price: product.price || 0,
                cost: product.cost || 0, // Lưu giá vốn
                quantity: 1,
                total: product.price || 0,
                unit: product.unit || 'cái'
            });
        }
        
        this.saveCart();
        this.playAddToCartSound();
    }
    
    // Giảm số lượng sản phẩm trong giỏ hàng
    removeFromCart(productId) {
        const index = this.currentCart.items.findIndex(item => item.product_id === productId);

        if (index !== -1) {
            const item = this.currentCart.items[index];
            item.quantity -= 1;
            
            if (item.quantity <= 0) {
                // Xóa khỏi giỏ hàng nếu số lượng về 0
                this.currentCart.items.splice(index, 1);
            } else {
                item.total = item.price * item.quantity;
            }
            
            this.saveCart();
        }
    }
    
    // Xóa hoàn toàn sản phẩm khỏi giỏ hàng
    removeItemFromCart(productId) {
        const index = this.currentCart.items.findIndex(item => item.product_id === productId);
        
        if (index !== -1) {
            this.currentCart.items.splice(index, 1);
            this.saveCart();
            utils.showNotification('Đã xóa sản phẩm khỏi giỏ hàng', 'info');
        }
    }
    // Hàm xử lý checkout nhanh
async processQuickCheckout(modal) {
    const customerName = modal.querySelector('#quick-customer-name').value.trim() || 'Khách vãng lai';
    
    modal.querySelector('#quick-confirm-btn').disabled = true;
    utils.showLoading('Đang xử lý thanh toán...');
    
    // Tạo sale data với mapping sản phẩm đầy đủ
    const saleData = {
        items: this.currentCart.items.map(item => {
            // Tìm thông tin đầy đủ của sản phẩm
            const product = this.products[item.product_id];
            
            // Đảm bảo tất cả giá trị không phải undefined
            return {
                product_id: item.product_id || '',
                code: product?.code || item.product_id || '', // Mã sản phẩm
                displayName: item.name || '', // Tên thường gọi (hiển thị)
                originalName: product?.originalName || item.name || '', // Tên gốc
                name: item.name || '',
                price: item.price || 0,
                cost: item.cost || 0,
                quantity: item.quantity || 1,
                total: item.total || 0,
                unit: item.unit || 'cái',
                metadata: {
                    code: product?.code || item.product_id || '',
                    originalName: product?.originalName || item.name || '',
                    displayName: item.name || ''
                }
            };
        }),
        subtotal: this.currentCart.subtotal || 0,
        discount: this.currentCart.discount || 0,
        tax: this.currentCart.tax || 0,
        total: this.currentCart.total || 0,
        customer: customerName,
        paymentMethod: 'cash', // Mặc định tiền mặt
        timestamp: Date.now(),
        hkdId: this.hkdId,
        hkdName: this.hkdInfo?.name || 'HKD'
    };
    
    try {
        const result = await dbManager.createSale(this.hkdId, saleData);
        
        if (result.success) {
            utils.showNotification('✅ Thanh toán thành công!', 'success');
            
            // Hiển thị hóa đơn
            this.showInvoiceModal(result.data.saleId, saleData);
            
            // Reset giỏ hàng
            this.currentCart = this.createNewCart();
            this.saveCart();
            
        } else {
            if (result.error && result.error.includes('Offline mode')) {
                utils.showNotification('⚠️ Đã lưu đơn hàng offline', 'warning', 6000);
                this.showInvoiceModal(result.saleId, saleData, true);
                this.currentCart = this.createNewCart();
                this.saveCart();
            } else {
                utils.showNotification(`Lỗi: ${result.error || 'Không xác định'}`, 'error', 6000);
            }
        }
    } catch (error) {
        console.error('Checkout error:', error);
        utils.showNotification('Lỗi hệ thống khi thanh toán.', 'error', 6000);
    } finally {
        utils.hideLoading();
        if (modal && modal.remove) modal.remove();
        this.loadProducts(); // Reload products
    }
}
    // Bắt đầu quy trình thanh toán
    checkout() {
    if (this.currentCart.items.length === 0) {
        utils.showNotification('Giỏ hàng trống', 'warning');
        return;
    }

    // Tải lại thông tin giỏ hàng
    this.calculateTotals();

    const totalVND = utils.formatCurrency(this.currentCart.total);
    
    // Tạo modal đơn giản
    const modalContent = `
        <div style="text-align: center; padding: 20px 0;">
            <div style="font-size: 48px; color: #28a745; margin-bottom: 15px;">
                <i class="fas fa-shopping-cart"></i>
            </div>
            <h3 style="margin-bottom: 10px;">Xác nhận thanh toán</h3>
            <p style="font-size: 1.2rem; color: #333; margin-bottom: 20px;">Tổng cộng: <strong style="color: #dc3545; font-size: 1.4rem;">${totalVND}</strong></p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin-bottom: 10px;"><strong>Chi tiết đơn hàng:</strong></p>
                <div style="max-height: 150px; overflow-y: auto; text-align: left;">
                    ${this.currentCart.items.map(item => `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #eee;">
                            <span>${item.name} x ${item.quantity}</span>
                            <span>${utils.formatCurrency(item.total)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="hkd-form-group" style="margin-top: 20px;">
                <label for="quick-customer-name" style="text-align: left; display: block; margin-bottom: 8px;">
                    Tên khách hàng <span style="color: #6c757d; font-size: 0.9rem;">(Nhấn Enter để bỏ qua)</span>
                </label>
                <input type="text" id="quick-customer-name" 
                       placeholder="Khách vãng lai" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px;"
                       autofocus>
                <p style="color: #6c757d; font-size: 0.85rem; margin-top: 5px; text-align: left;">
                    Nhập tên khách hàng hoặc nhấn Enter để sử dụng tên mặc định
                </p>
            </div>
        </div>
    `;

    // Tạo modal
    const modal = document.createElement('div');
    modal.className = 'hkd-modal show';
    modal.innerHTML = `
        <div class="hkd-modal-content" style="max-width: 400px;">
            <div class="hkd-modal-body">
                ${modalContent}
            </div>
            <div class="hkd-modal-footer" style="justify-content: center; padding: 20px;">
                <button class="hkd-btn hkd-btn-secondary" id="quick-cancel-btn" style="margin-right: 10px;">Hủy</button>
                <button class="hkd-btn hkd-btn-primary" id="quick-confirm-btn">
                    <i class="fas fa-check"></i> Xác nhận
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Focus vào input
    setTimeout(() => {
        const input = modal.querySelector('#quick-customer-name');
        if (input) input.focus();
    }, 100);

    // Xử lý nhấn Enter
    modal.querySelector('#quick-customer-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            modal.querySelector('#quick-confirm-btn').click();
        }
    });

    // Xử lý xác nhận
    modal.querySelector('#quick-confirm-btn').addEventListener('click', () => {
        this.processQuickCheckout(modal);
    });

    // Xử lý hủy
    modal.querySelector('#quick-cancel-btn').addEventListener('click', () => {
        modal.remove();
    });
}

    // Xử lý thanh toán
    async processCheckout(modal) {
        if (this.currentCart.items.length === 0) {
            utils.showNotification('Giỏ hàng trống', 'warning');
            return;
        }
        
        const paymentMethod = modal.querySelector('#payment-method').value;
        const customerName = modal.querySelector('#customer-name').value || 'Khách vãng lai';
        
        modal.querySelector('#confirm-checkout-btn').disabled = true;
        utils.showLoading('Đang tạo đơn hàng...');
        
        // Tạo đối tượng saleData
        const saleData = {
            items: this.currentCart.items,
            subtotal: this.currentCart.subtotal,
            discount: this.currentCart.discount,
            tax: this.currentCart.tax,
            total: this.currentCart.total,
            customer: customerName,
            paymentMethod: paymentMethod,
            timestamp: Date.now()
        };
        
        try {
            const result = await dbManager.createSale(this.hkdId, saleData);
            
            if (result.success) {
                utils.showNotification('✅ Thanh toán thành công!', 'success');
                this.showInvoiceModal(result.data.saleId, saleData);
                this.currentCart = this.createNewCart(); // Reset giỏ hàng
                this.saveCart(); // Cập nhật localStorage và UI
            } else {
                // Xử lý khi offline hoặc lỗi stock
                if (result.error.includes('Offline mode')) {
                    utils.showNotification('⚠️ Mất kết nối. Đã lưu đơn hàng offline.', 'warning', 6000);
                    // Không reset cart, để người dùng thử sync lại sau
                    this.showInvoiceModal(result.saleId, saleData, true);
                    this.currentCart = this.createNewCart(); // Reset giỏ hàng
                    this.saveCart(); // Cập nhật localStorage và UI
                } else if (result.error.includes('Sản phẩm tạm thời')) {
                     utils.showNotification(`Lỗi: ${result.error}`, 'error', 6000);
                } else {
                    utils.showNotification(`Lỗi thanh toán: ${result.error}`, 'error', 6000);
                }
            }
        } catch (error) {
            console.error('Checkout error:', error);
            utils.showNotification('Lỗi hệ thống khi thanh toán.', 'error', 6000);
        } finally {
            utils.hideLoading();
            // Đóng modal xác nhận
            // Sử dụng setTimeout để đảm bảo modal đóng sau khi notification đã hiển thị
            setTimeout(() => {
                const closeModalBtn = modal.querySelector('.hkd-modal-close');
                if (closeModalBtn) closeModalBtn.click();
            }, 100); 
            this.loadProducts(); // Reload products to update stock/grid
        }
    }
    
    // Hiển thị modal hóa đơn
    showInvoiceModal(saleId, saleData, isOffline = false) {
        const totalItems = saleData.items.reduce((sum, item) => sum + item.quantity, 0);
        
        const invoiceContent = `
            <div class="invoice-details">
                <p><strong>Cửa hàng:</strong> ${this.hkdInfo?.name || 'HKD'}</p>
                <p><strong>Ngày:</strong> ${utils.formatDate(saleData.timestamp)}</p>
                <p><strong>ID giao dịch:</strong> ${saleId}</p>
                ${isOffline ? '<p style="color: red; font-weight: bold;">LƯU Ý: Giao dịch OFFLINE - Cần đồng bộ</p>' : ''}
            </div>
            
            <h4 style="margin-top: 20px;">Chi tiết hóa đơn:</h4>
            <div class="invoice-items" style="border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; padding: 10px 0;">
                ${saleData.items.map(item => `
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px;">
                        <span>${item.name} x${item.quantity}</span>
                        <span>${utils.formatCurrency(item.total)}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="invoice-summary" style="margin-top: 15px;">
                <p>Tổng sản phẩm: <strong>${totalItems}</strong></p>
                <p>Tạm tính: <strong>${utils.formatCurrency(saleData.subtotal)}</strong></p>
                <p>Giảm giá: <strong>-${utils.formatCurrency(saleData.discount)}</strong></p>
                <p>Thuế (${this.hkdInfo?.settings?.taxRate || 0}%): <strong>+${utils.formatCurrency(saleData.tax)}</strong></p>
                <p style="font-size: 1.2rem; font-weight: bold; color: #007bff; border-top: 1px solid #ccc; padding-top: 10px;">
                    TỔNG CỘNG: ${utils.formatCurrency(saleData.total)}
                </p>
                <p>Thanh toán: <strong>${saleData.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</strong></p>
                <p>Khách hàng: <strong>${saleData.customer}</strong></p>
            </div>
        `;

        // Tạo modal
        const modal = document.createElement('div');
        modal.className = 'hkd-modal show';
        modal.innerHTML = `
            <div class="hkd-modal-content">
                <div class="hkd-modal-header">
                    <h3>Hóa đơn bán hàng</h3>
                    <button class="hkd-modal-close">&times;</button>
                </div>
                <div class="hkd-modal-body">
                    ${invoiceContent}
                </div>
                <div class="hkd-modal-footer">
                    <button class="hkd-btn hkd-btn-secondary" id="print-invoice-btn">In hóa đơn</button>
                    <button class="hkd-btn hkd-btn-primary modal-confirm">Đóng</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Xử lý in hóa đơn
        modal.querySelector('#print-invoice-btn').addEventListener('click', () => {
            this.printInvoice(saleData, saleId);
        });

        // Xử lý đóng modal
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        modal.querySelector('.hkd-modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-confirm').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // In hóa đơn
    printInvoice(saleData, saleId) {
        const printWindow = window.open('', '_blank');
        const totalItems = saleData.items.reduce((sum, item) => sum + item.quantity, 0);
        const storeName = this.hkdInfo?.name || 'HKD Bán Hàng';
        const storeAddress = this.hkdInfo?.address || 'Địa chỉ: N/A';

        const content = `
            <html>
            <head>
                <title>Hóa đơn ${saleId}</title>
                <style>
                    body { font-family: 'Arial', sans-serif; font-size: 12px; margin: 0; padding: 20px; }
                    .invoice { max-width: 300px; margin: 0 auto; border: 1px solid #ccc; padding: 15px; }
                    .header { text-align: center; margin-bottom: 15px; }
                    .header h1 { font-size: 16px; margin: 0; }
                    .header p { font-size: 10px; margin: 3px 0; }
                    .details, .summary { margin-bottom: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
                    .item { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    .item-name { flex-grow: 1; }
                    .item-qty { width: 40px; text-align: right; }
                    .item-price { width: 70px; text-align: right; }
                    .total { font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 10px; text-align: right; }
                    .thank-you { text-align: center; margin-top: 20px; font-style: italic; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="invoice">
                    <div class="header">
                        <h1>${storeName}</h1>
                        <p>${storeAddress}</p>
                        <p>Tel: ${this.hkdInfo?.phone || 'N/A'}</p>
                        <p>Ngày: ${utils.formatDate(saleData.timestamp)}</p>
                        <p>Mã HĐ: ${saleId}</p>
                    </div>
                    
                    <div class="details">
                        <div class="item">
                            <span class="item-name"><strong>Sản phẩm</strong></span>
                            <span class="item-qty"><strong>SL</strong></span>
                            <span class="item-price"><strong>Thành tiền</strong></span>
                        </div>
                        ${saleData.items.map(item => `
                            <div class="item">
                                <span class="item-name">${item.name}</span>
                                <span class="item-qty">${item.quantity}</span>
                                <span class="item-price">${utils.formatCurrency(item.total)}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="summary">
                        <p>Tạm tính: <strong>${utils.formatCurrency(saleData.subtotal)}</strong></p>
                        <p>Giảm giá: <strong>-${utils.formatCurrency(saleData.discount)}</strong></p>
                        <p>Thuế: <strong>+${utils.formatCurrency(saleData.tax)}</strong></p>
                        <p class="total">TỔNG CỘNG: ${utils.formatCurrency(saleData.total)}</p>
                        <p style="text-align: right; margin-top: 5px;">Thanh toán: ${saleData.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</p>
                    </div>
                    
                    <div class="thank-you">
                        <p>Xin cảm ơn và hẹn gặp lại!</p>
                    </div>
                </div>
                
                <script>\n
                    window.onload = function() {\n
                        window.print();\n
                        window.close();\n
                    }\n
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
    }
    
    async showSalesHistoryModal() {
    console.log('Attempting to show sales history modal...');
    console.log('Current HKD ID:', this.hkdId);
    
    utils.showLoading('Đang tải lịch sử bán hàng...');
    
    let result;
    try {
        // Debug: Kiểm tra dbManager
        console.log('dbManager available:', !!window.dbManager);
        console.log('getSalesHistory function:', typeof window.dbManager?.getSalesHistory);
        
        // Tải dữ liệu từ database
        result = await dbManager.getSalesHistory(this.hkdId);
        
        console.log('Sales history result:', result);
        
    } catch (error) {
        console.error('Error fetching sales history:', error);
        result = { 
            success: false, 
            error: 'Lỗi hệ thống khi tải dữ liệu: ' + error.message 
        };
    }
    
    utils.hideLoading();

    let content = '';
    if (!result.success) {
         content = `<div class="empty-products" style="padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">⚠️</div>
            <p>Lỗi tải lịch sử: ${result.error || 'Không rõ'}</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">HKD ID: ${this.hkdId}</p>
        </div>`;
    } else if (!result.data || result.data.length === 0) {
        content = `<div class="empty-products" style="padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">📋</div>
            <p>Chưa có đơn hàng nào</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">Hãy tạo đơn hàng đầu tiên!</p>
        </div>`;
    } else {
        const sales = result.data.slice(0, 50); // Giới hạn 50 đơn gần nhất
        console.log(`Displaying ${sales.length} sales`);
        
         content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <div style="display: grid; gap: 10px;">
                    ${sales.map(sale => {
                        const itemsCount = sale.items?.length || 0;
                        const formattedTime = sale.timestamp ? utils.formatDateTime(sale.timestamp) : 'N/A';
                        const customerName = sale.customer || 'Khách vãng lai';
                        const totalAmount = sale.total ? utils.formatCurrency(sale.total) : '0 đ';
                        
                        return `
                        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #28a745; position: relative;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: flex-start;">
                                <div>
                                    <strong style="color: #333; font-size: 0.95rem;">${formattedTime}</strong>
                                    <div style="color: #6c757d; font-size: 0.85rem; margin-top: 3px;">
                                        ${customerName} • ${sale.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: #28a745; font-weight: 600; font-size: 1.1rem;">${totalAmount}</div>
                                    <button class="view-invoice-btn" data-sale-id="${sale.id}" style="margin-top: 5px; padding: 4px 10px; background: #007bff; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                                        <i class="fas fa-eye"></i> Xem hóa đơn
                                    </button>
                                </div>
                            </div>
                            <div style="color: #6c757d; font-size: 0.85rem;">
                                <span>Số sản phẩm: ${itemsCount}</span>
                                ${sale.id ? `<span style="margin-left: 10px;">Mã: ${sale.id.substring(0, 8)}...</span>` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Tạo modal
    try {
        const modal = document.createElement('div');
        modal.className = 'hkd-modal show';
        modal.innerHTML = `
            <div class="hkd-modal-content" style="max-width: 600px;">
                <div class="hkd-modal-header">
                    <h3>Lịch sử bán hàng</h3>
                    <button class="hkd-modal-close">&times;</button>
                </div>
                <div class="hkd-modal-body">
                    ${content}
                </div>
                <div class="hkd-modal-footer">
                    <button class="hkd-btn hkd-btn-primary modal-confirm">Đóng</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Thêm event listener cho nút xem hóa đơn
        setTimeout(() => {
            modal.querySelectorAll('.view-invoice-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const saleId = e.target.closest('button').dataset.saleId;
                    await this.viewInvoiceDetail(saleId);
                });
            });
        }, 100);

        // Xử lý đóng modal
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        modal.querySelector('.hkd-modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-confirm').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    } catch (domError) {
        console.error('Error creating sales history modal:', domError);
        utils.showNotification('Lỗi hiển thị lịch sử bán hàng', 'error');
    }
}

// Thêm hàm viewInvoiceDetail()
async viewInvoiceDetail(saleId) {
    try {
        utils.showLoading('Đang tải chi tiết hóa đơn...');
        
        // Lấy thông tin hóa đơn từ database
        const snapshot = await database.ref(`hkds/${this.hkdId}/sales/${saleId}`).once('value');
        const invoiceData = snapshot.val();
        
        if (!invoiceData) {
            utils.showNotification('Không tìm thấy hóa đơn', 'error');
            return;
        }
        
        // Hiển thị modal chi tiết
        this.showInvoiceModal(saleId, invoiceData, false, true);
        
    } catch (error) {
        console.error('Error viewing invoice:', error);
        utils.showNotification('Lỗi tải chi tiết hóa đơn', 'error');
    } finally {
        utils.hideLoading();
    }
}

    // hkd.js - Sửa hàm showAddProductModal
showAddProductModal() {
    // Đảm bảo categories đã được load
    if (this.categories.length === 0) {
        this.categories = ['Khác'];
    }
    
    // Filter out "Tất cả" từ danh sách danh mục
    const categoryOptions = this.categories
        .filter(cat => cat !== 'Tất cả' && cat !== 'all')
        .map(cat => `<option value="${cat}">${cat}</option>`)
        .join('');
    
    const modalContent = `
        <form id="add-product-form">
            <div style="display: grid; gap: 15px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Tên sản phẩm *</label>
                    <input type="text" id="new-product-name" required 
                           style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Giá bán *</label>
                        <input type="number" id="new-product-price" required min="1000" step="1000" 
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Giá vốn</label>
                        <input type="number" id="new-product-cost" min="0" step="1000" 
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Tồn kho *</label>
                        <input type="number" id="new-product-stock" value="1" min="0" required 
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Đơn vị tính</label>
                        <input type="text" id="new-product-unit" value="cái" 
                               style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                    </div>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Danh mục</label>
                    <div style="display: flex; gap: 10px;">
                        <select id="new-product-category" 
                                style="flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                            ${categoryOptions}
                            <option value="_new">Thêm danh mục mới...</option>
                        </select>
                        <button type="button" id="refresh-categories-btn" 
                                style="padding: 12px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;"
                                title="Làm mới danh sách danh mục">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
                <div id="new-category-field" style="display: none; margin-top: 10px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Tên danh mục mới *</label>
                    <input type="text" id="new-category-input" placeholder="Nhập tên danh mục" 
                           style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                </div>
            </div>
        </form>
    `;

    // Tạo modal
    const modal = document.createElement('div');
    modal.className = 'hkd-modal show';
    modal.innerHTML = `
        <div class="hkd-modal-content">
            <div class="hkd-modal-header">
                <h3>Thêm sản phẩm mới</h3>
                <button class="hkd-modal-close">&times;</button>
            </div>
            <div class="hkd-modal-body">
                ${modalContent}
            </div>
            <div class="hkd-modal-footer">
                <button class="hkd-btn hkd-btn-secondary modal-cancel">Hủy</button>
                <button type="submit" form="add-product-form" class="hkd-btn hkd-btn-primary" id="save-new-product-btn">Lưu sản phẩm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Logic ẩn/hiện trường danh mục mới
    const categorySelect = modal.querySelector('#new-product-category');
    const newCategoryField = modal.querySelector('#new-category-field');

    categorySelect.addEventListener('change', (e) => {
        if (e.target.value === '_new') {
            newCategoryField.style.display = 'block';
        } else {
            newCategoryField.style.display = 'none';
        }
    });
    
    // Nút refresh categories
    modal.querySelector('#refresh-categories-btn').addEventListener('click', async () => {
        try {
            utils.showLoading('Đang làm mới danh mục...');
            await this.loadCategories();
            
            // Update select options
            const newCategoryOptions = this.categories
                .filter(cat => cat !== 'Tất cả' && cat !== 'all')
                .map(cat => `<option value="${cat}">${cat}</option>`)
                .join('');
            
            categorySelect.innerHTML = newCategoryOptions + '<option value="_new">Thêm danh mục mới...</option>';
            
            utils.showNotification('Đã làm mới danh sách danh mục', 'success');
        } catch (error) {
            console.error('Error refreshing categories:', error);
            utils.showNotification('Lỗi làm mới danh mục', 'error');
        } finally {
            utils.hideLoading();
        }
    });

    // Xử lý submit form
    modal.querySelector('#add-product-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveNewProduct(modal);
    });

    // Xử lý đóng modal
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    };
    modal.querySelector('.hkd-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

    // Lưu sản phẩm mới
    async saveNewProduct(modal) {
        const name = document.getElementById('new-product-name').value.trim();
        const price = parseFloat(document.getElementById('new-product-price').value);
        const cost = parseFloat(document.getElementById('new-product-cost').value) || 0;
        const stock = parseInt(document.getElementById('new-product-stock').value) || 0;
        const unit = document.getElementById('new-product-unit').value || 'cái';
        let category = document.getElementById('new-product-category').value;
        
        if (category === '_new') {
            category = document.getElementById('new-category-input').value.trim() || 'Khác';
            // Thêm danh mục mới vào danh sách
            if (category && !this.categories.includes(category)) {
                this.categories.push(category);
                this.renderCategories();
            }
        }
        
        if (!name || isNaN(price) || price <= 0) {
            utils.showNotification('Vui lòng nhập tên và giá hợp lệ', 'error');
            return;
        }

        utils.showLoading('Đang lưu sản phẩm...');
        
        const newProduct = {
            name,
            price,
            cost,
            stock,
            unit,
            category,
            // SỬ DỤNG ID TẠM THỜI CHO SẢN PHẨM MỚI ĐƯỢC TẠO OFFLINE
            id: utils.generateUniqueId('temp'), 
            createdAt: Date.now()
        };
        
        // Cập nhật local products
        this.products[newProduct.id] = newProduct;

        // Lưu sản phẩm lên Firebase (qua dbManager.importProducts, sẽ push toàn bộ local products lên)
        const productsArray = Object.values(this.products);
        const result = await dbManager.importProducts(this.hkdId, productsArray);

        utils.hideLoading();
        
        if (result.success) {
            utils.showNotification('Đã đồng bộ sản phẩm lên Firebase', 'success');
            // Cập nhật lại danh sách local products từ firebase (để lấy ID thật)
            await this.loadProducts(); 
            this.renderProducts('all');
            modal.querySelector('.hkd-modal-close').click();
        } else {
            // Nếu lỗi, vẫn giữ trong local cache và chờ sync
             utils.showNotification('Đã thêm sản phẩm (chờ đồng bộ)', 'success');
             this.renderProducts('all');
             modal.querySelector('.hkd-modal-close').click();
        }
    }
    
    // ==================== SETUP ====================
    
    // Thiết lập event listeners
    // hkd.js - Cập nhật setupEventListeners()
setupEventListeners() {
    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            this.checkout();
        });
    }
    
    // Clear Cart button
    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            this.clearCart();
        });
    }

    // FAB buttons
    const historyFab = document.getElementById('history-fab');
    if (historyFab) {
        historyFab.addEventListener('click', () => {
            this.showSalesHistoryModal();
        });
    }
    
    // Revenue FAB button
    const revenueFab = document.getElementById('revenue-fab');
    if (revenueFab) {
        revenueFab.addEventListener('click', () => {
            this.showRevenueStats();
        });
    }
    
    const addProductFab = document.getElementById('add-product-fab');
    if (addProductFab) {
        addProductFab.addEventListener('click', () => {
            this.showAddProductModal();
        });
    }
    
    // Auto-save cart
    window.addEventListener('beforeunload', () => {
        this.saveCart();
    });
    
    // Auto-refresh when online
    window.addEventListener('online', async () => {
        await this.loadData();
    });
}

// Thêm hàm showRevenueStats()
async showRevenueStats() {
    try {
        utils.showLoading('Đang tải thống kê doanh thu...');
        
        const result = await dbManager.getRevenueStats(this.hkdId, 30);
        
        if (result.success) {
            this.showRevenueModal(result.data);
        } else {
            utils.showNotification('Lỗi tải thống kê: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error loading revenue stats:', error);
        utils.showNotification('Lỗi hệ thống khi tải thống kê', 'error');
    } finally {
        utils.hideLoading();
    }
}

showRevenueModal(stats) {
    const modalContent = `
        <div style="text-align: center; padding: 20px 0;">
            <h3 style="margin-bottom: 20px; color: #333;">Thống kê doanh thu 30 ngày</h3>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px;">
                <div style="background: #e3f2fd; padding: 20px; border-radius: 10px;">
                    <div style="font-size: 2rem; font-weight: bold; color: #1565c0; margin-bottom: 5px;">
                        ${utils.formatCurrency(stats.totalRevenue)}
                    </div>
                    <div style="color: #0d47a1; font-size: 0.9rem;">Tổng doanh thu</div>
                </div>
                
                <div style="background: #e8f5e9; padding: 20px; border-radius: 10px;">
                    <div style="font-size: 2rem; font-weight: bold; color: #2e7d32; margin-bottom: 5px;">
                        ${stats.totalOrders}
                    </div>
                    <div style="color: #1b5e20; font-size: 0.9rem;">Tổng đơn hàng</div>
                </div>
                
                <div style="background: #fff3e0; padding: 20px; border-radius: 10px;">
                    <div style="font-size: 2rem; font-weight: bold; color: #ef6c00; margin-bottom: 5px;">
                        ${utils.formatCurrency(stats.averageOrderValue)}
                    </div>
                    <div style="color: #e65100; font-size: 0.9rem;">Đơn hàng trung bình</div>
                </div>
                
                <div style="background: #fce4ec; padding: 20px; border-radius: 10px;">
                    <div style="font-size: 2rem; font-weight: bold; color: #c2185b; margin-bottom: 5px;">
                        ${Object.keys(stats.dailyStats || {}).length}
                    </div>
                    <div style="color: #880e4f; font-size: 0.9rem;">Ngày có doanh thu</div>
                </div>
            </div>
            
            <div style="text-align: left; margin-top: 20px;">
                <h4 style="color: #555; margin-bottom: 10px;">Doanh thu theo tháng:</h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${Object.entries(stats.monthlyStats || {}).map(([month, amount]) => `
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                            <span>${month}</span>
                            <span style="font-weight: 600; color: #28a745;">${utils.formatCurrency(amount)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'hkd-modal show';
    modal.innerHTML = `
        <div class="hkd-modal-content" style="max-width: 500px;">
            <div class="hkd-modal-header">
                <h3>Thống kê doanh thu</h3>
                <button class="hkd-modal-close">&times;</button>
            </div>
            <div class="hkd-modal-body">
                ${modalContent}
            </div>
            <div class="hkd-modal-footer">
                <button class="hkd-btn hkd-btn-primary modal-confirm">Đóng</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    };
    
    modal.querySelector('.hkd-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-confirm').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

    // Cập nhật trạng thái kết nối
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        const statusTextEl = document.getElementById('connection-text');

        if (!statusEl || !statusTextEl) return;
        
        const updateStatus = () => {
            if (navigator.onLine) {
                statusEl.className = 'status-dot online-dot';
                statusTextEl.textContent = 'Trực tuyến';
            } else {
                statusEl.className = 'status-dot offline-dot';
                statusTextEl.textContent = 'Offline';
            }
        };

        updateStatus();
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
    }
    
    // Play sound effect
    playAddToCartSound() {
        // Có thể thêm sound effect ở đây
        try {
            // Ví dụ: const audio = new Audio('add-to-cart.mp3');
            // audio.play();
        } catch (error) {
            // Ignore sound errors
        }
    }
}

// Khởi tạo khi DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('hkd.html') || 
            document.getElementById('hkd-dashboard-section')?.style.display !== 'none') {
            setTimeout(() => {
                window.hkdManager = new HKDManager();
            }, 500);
        }
    });
} else {
    if (window.location.pathname.includes('hkd.html') || 
        document.getElementById('hkd-dashboard-section')?.style.display !== 'none') {
        setTimeout(() => {
            window.hkdManager = new HKDManager();
        }, 500);
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.HKDManager = HKDManager;
}