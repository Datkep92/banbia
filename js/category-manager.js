// Category & Product Manager
let currentHKDProducts = [];
let currentHKDCategories = [];
let selectedHKDForProducts = null;

// Khởi tạo quản lý danh mục
function initCategoryManager() {
    console.log('🛠️ Initializing category manager...');
    setupCategoryEventListeners();
}

// Thiết lập event listeners cho danh mục và sản phẩm
function setupCategoryEventListeners() {
    console.log('🔗 Setting up category event listeners...');
    
    // 1. Tab switch để hiển thị quản lý sản phẩm
    const productsTab = document.querySelector('.nav-link[data-view="products"]');
    if (productsTab) {
        productsTab.addEventListener('click', () => {
            showProductsManagement();
        });
    }
    
    // 2. HKD select change trong products management
    const hkdSelectProducts = document.getElementById('productHKDSelect');
    if (hkdSelectProducts) {
        hkdSelectProducts.addEventListener('change', async function() {
            console.log(`🔄 HKD select changed to: ${this.value}`);
            selectedHKDForProducts = this.value;
            await loadHKDProductsAndCategories(this.value);
        });
    }
    
    // 3. Add category button
    const addCategoryBtn = document.getElementById('btnAddCategory');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', () => {
            showAddCategoryModal();
        });
    }
    
    // 4. Save category button
    const saveCategoryBtn = document.getElementById('saveCategory');
    if (saveCategoryBtn) {
        saveCategoryBtn.addEventListener('click', saveCategory);
    }
    
    // 5. Add product button
    const addProductBtn = document.getElementById('btnAddProduct');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => {
            showAddProductModal();
        });
    }
    
    // 6. Save product button
    const saveProductBtn = document.getElementById('saveProduct');
    if (saveProductBtn) {
        saveProductBtn.addEventListener('click', saveProduct);
    }
    
    // 7. Product search
    const productSearch = document.getElementById('productSearch');
    if (productSearch) {
        productSearch.addEventListener('input', Utils.debounce(searchProducts, 300));
    }
    
    // 8. Category search
    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) {
        categorySearch.addEventListener('input', Utils.debounce(searchCategories, 300));
    }
    
    // 9. Import products từ Excel
    const importProductsBtn = document.getElementById('btnImportProducts');
    if (importProductsBtn) {
        importProductsBtn.addEventListener('click', showImportProductsSection);
    }
    
    // 10. Export products
    const exportProductsBtn = document.getElementById('btnExportProducts');
    if (exportProductsBtn) {
        exportProductsBtn.addEventListener('click', exportProductsToExcel);
    }
    
    console.log('✅ Category event listeners setup complete');
}

// Hiển thị trang quản lý sản phẩm
function showProductsManagement() {
    console.log('📦 Showing products management...');
    
    // Populate HKD select
    populateHKDSelectForProducts();
    
    // Hiển thị phần quản lý sản phẩm
    showProductsSection();
    
    // Reset data
    currentHKDProducts = [];
    currentHKDCategories = [];
    selectedHKDForProducts = null;
}

// Populate HKD select cho quản lý sản phẩm
function populateHKDSelectForProducts() {
    const hkdSelect = document.getElementById('productHKDSelect');
    if (!hkdSelect) return;
    
    console.log(`📊 Populating HKD select with ${allHKDs.length} HKDs...`);
    
    // Clear và thêm option mặc định
    hkdSelect.innerHTML = '<option value="">Chọn HKD...</option>';
    
    // Thêm từng HKD
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
    
    console.log(`✅ Product HKD select now has ${hkdSelect.options.length} options`);
}

// Hiển thị section quản lý sản phẩm
function showProductsSection() {
    const container = document.getElementById('productsManagementSection');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Quản lý Danh mục & Hàng hóa</h2>
            <div class="header-actions">
                <button class="btn btn-secondary" id="btnImportProducts">
                    <i class="fas fa-file-import"></i> Import Excel
                </button>
                <button class="btn btn-secondary" id="btnExportProducts">
                    <i class="fas fa-file-export"></i> Export Excel
                </button>
            </div>
        </div>
        
        <div class="hkd-selection mb-4">
            <div class="row">
                <div class="col-md-6">
                    <label class="form-label">Chọn HKD:</label>
                    <select id="productHKDSelect" class="form-select">
                        <option value="">Chọn HKD...</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <div class="hkd-info mt-4" id="selectedHKDInfo" style="display: none;">
                        <p><strong id="hkdInfoName"></strong></p>
                        <p id="hkdInfoPhone"></p>
                        <p id="hkdInfoAddress"></p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="products-management-container" id="productsContent" style="display: none;">
            <!-- Tabs cho Categories và Products -->
            <ul class="nav nav-tabs" id="productsTabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active" id="categories-tab" data-bs-toggle="tab" data-bs-target="#categories" type="button" role="tab">
                        <i class="fas fa-folder"></i> Danh mục
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" id="products-tab" data-bs-toggle="tab" data-bs-target="#products" type="button" role="tab">
                        <i class="fas fa-box"></i> Sản phẩm
                    </button>
                </li>
            </ul>
            
            <div class="tab-content mt-3">
                <!-- Categories Tab -->
                <div class="tab-pane fade show active" id="categories" role="tabpanel">
                    <div class="category-management">
                        <div class="category-header mb-3">
                            <div class="search-container">
                                <input type="text" id="categorySearch" class="search-input" placeholder="Tìm kiếm danh mục...">
                            </div>
                            <button class="btn btn-primary" id="btnAddCategory">
                                <i class="fas fa-plus"></i> Thêm danh mục
                            </button>
                        </div>
                        
                        <div id="categoriesList" class="categories-grid">
                            <!-- Categories will be loaded here -->
                        </div>
                    </div>
                </div>
                
                <!-- Products Tab -->
                <div class="tab-pane fade" id="products" role="tabpanel">
                    <div class="product-management">
                        <div class="product-header mb-3">
                            <div class="search-container">
                                <input type="text" id="productSearch" class="search-input" placeholder="Tìm kiếm sản phẩm...">
                            </div>
                            <button class="btn btn-primary" id="btnAddProduct">
                                <i class="fas fa-plus"></i> Thêm sản phẩm
                            </button>
                        </div>
                        
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Mã SP</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Danh mục</th>
                                        <th>ĐVT</th>
                                        <th>Giá</th>
                                        <th>Tồn kho</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody id="productsList">
                                    <!-- Products will be loaded here -->
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="pagination-container mt-3" id="productsPagination">
                            <!-- Pagination will be added here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Import Products Section (ẩn mặc định) -->
        <div id="importProductsSection" style="display: none;">
            <div class="import-products-container">
                <div class="section-header mb-3">
                    <h4>Import sản phẩm từ Excel</h4>
                    <button class="btn btn-secondary" id="btnBackToProducts">
                        <i class="fas fa-arrow-left"></i> Quay lại
                    </button>
                </div>
                
                <div class="import-options">
                    <div class="mb-3">
                        <label class="form-label">Chọn HKD:</label>
                        <select id="importProductsHKD" class="form-select" required>
                            <option value="">Chọn HKD...</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label">Chế độ import:</label>
                        <select id="importProductsMode" class="form-select">
                            <option value="append">Bổ sung sản phẩm</option>
                            <option value="replace">Ghi đè toàn bộ</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label class="form-label">Chọn file Excel:</label>
                        <input type="file" id="importProductsFile" class="form-control" accept=".xlsx,.xls,.csv">
                    </div>
                    
                    <div class="import-preview mb-3">
                        <h5>Preview dữ liệu:</h5>
                        <div id="importProductsPreview" class="excel-preview">
                            <!-- Excel preview will be shown here -->
                        </div>
                    </div>
                    
                    <div class="import-actions">
                        <button class="btn btn-secondary" id="btnClearProductsPreview">
                            <i class="fas fa-times"></i> Hủy
                        </button>
                        <button class="btn btn-primary" id="btnProcessProductsImport">
                            <i class="fas fa-upload"></i> Import
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Re-attach event listeners sau khi render
    setTimeout(() => {
        setupCategoryEventListeners();
        initProductsImportListeners();
    }, 100);
}

// Tải danh mục và sản phẩm của HKD
async function loadHKDProductsAndCategories(hkdId) {
    if (!hkdId) return;
    
    console.log(`📦 Loading products and categories for HKD: ${hkdId}`);
    
    Utils.showLoading('Đang tải dữ liệu...');
    
    try {
        // 1. Tải danh mục
        currentHKDCategories = await getCategoriesByHKD(hkdId);
        console.log(`📁 Loaded ${currentHKDCategories.length} categories`);
        
        // 2. Tải sản phẩm
        currentHKDProducts = await getProductsByHKD(hkdId);
        console.log(`📦 Loaded ${currentHKDProducts.length} products`);
        
        // 3. Hiển thị thông tin HKD
        const hkd = allHKDs.find(h => h.id === hkdId);
        if (hkd) {
            document.getElementById('selectedHKDInfo').style.display = 'block';
            document.getElementById('hkdInfoName').textContent = hkd.name;
            document.getElementById('hkdInfoPhone').textContent = `SĐT: ${hkd.phone}`;
            document.getElementById('hkdInfoAddress').textContent = `Địa chỉ: ${hkd.address || 'N/A'}`;
        }
        
        // 4. Hiển thị content
        document.getElementById('productsContent').style.display = 'block';
        document.getElementById('importProductsSection').style.display = 'none';
        
        // 5. Render dữ liệu
        displayCategories();
        displayProducts();
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Hiển thị danh mục
function displayCategories() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    if (currentHKDCategories.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <i class="fas fa-folder-open"></i>
                <p>Chưa có danh mục nào</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = currentHKDCategories.map(category => `
        <div class="category-card" data-category-id="${category.id}">
            <div class="category-header">
                <div class="category-info">
                    <h5>${category.name}</h5>
                    <p class="category-product-count">
                        ${getProductCountByCategory(category.id)} sản phẩm
                    </p>
                </div>
                <div class="category-actions">
                    <button class="btn-edit-category" onclick="editCategory('${category.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete-category" onclick="deleteCategory('${category.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="category-description">
                ${category.description || 'Không có mô tả'}
            </div>
        </div>
    `).join('');
}

// Hiển thị sản phẩm
function displayProducts() {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    if (currentHKDProducts.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-box-open"></i>
                        <p>Chưa có sản phẩm nào</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    container.innerHTML = currentHKDProducts.map(product => {
        const category = currentHKDCategories.find(c => c.id === product.categoryId);
        
        return `
            <tr data-product-id="${product.id}">
                <td><code>${product.msp || 'N/A'}</code></td>
                <td>
                    <strong>${product.name}</strong>
                    ${product.description ? `<br><small class="text-muted">${product.description}</small>` : ''}
                </td>
                <td>${category ? category.name : 'Khác'}</td>
                <td>${product.unit || 'cái'}</td>
                <td>${Utils.formatCurrency(product.price)}</td>
                <td>
                    <span class="badge ${product.stock > 0 ? 'bg-success' : 'bg-danger'}">
                        ${product.stock || 0}
                    </span>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-primary" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Lấy số lượng sản phẩm theo danh mục
function getProductCountByCategory(categoryId) {
    return currentHKDProducts.filter(p => p.categoryId === categoryId).length;
}

// Thêm danh mục
async function saveCategory() {
    const name = document.getElementById('categoryName').value;
    const description = document.getElementById('categoryDescription').value;
    
    if (!name || !selectedHKDForProducts) {
        Utils.showToast('Vui lòng nhập tên danh mục và chọn HKD', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu danh mục...');
    
    try {
        const categoryId = Utils.generateId();
        const categoryData = {
            id: categoryId,
            name: name,
            description: description,
            hkdId: selectedHKDForProducts,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        // Lưu vào IndexedDB
        await saveCategory(categoryData);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'categories',
            data: categoryData
        });
        
        // Cập nhật local data
        currentHKDCategories.push(categoryData);
        
        // Update UI
        displayCategories();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addCategoryModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset form
        document.getElementById('addCategoryForm').reset();
        
        Utils.showToast('Đã thêm danh mục thành công', 'success');
        
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
        console.error('❌ Lỗi lưu danh mục:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Chỉnh sửa danh mục
async function editCategory(categoryId) {
    const category = currentHKDCategories.find(c => c.id === categoryId);
    if (!category) return;
    
    // Hiển thị modal chỉnh sửa
    document.getElementById('editCategoryName').value = category.name;
    document.getElementById('editCategoryDescription').value = category.description || '';
    document.getElementById('editCategoryId').value = category.id;
    
    const modal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
    modal.show();
}

// Cập nhật danh mục
async function updateCategory() {
    const categoryId = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value;
    const description = document.getElementById('editCategoryDescription').value;
    
    if (!name || !categoryId) {
        Utils.showToast('Vui lòng nhập tên danh mục', 'error');
        return;
    }
    
    Utils.showLoading('Đang cập nhật...');
    
    try {
        const category = currentHKDCategories.find(c => c.id === categoryId);
        if (!category) throw new Error('Không tìm thấy danh mục');
        
        // Cập nhật thông tin
        category.name = name;
        category.description = description;
        category.lastUpdated = new Date().toISOString();
        
        // Cập nhật IndexedDB
        await saveCategory(category);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'categories',
            data: category
        });
        
        // Update UI
        displayCategories();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editCategoryModal'));
        if (modal) {
            modal.hide();
        }
        
        Utils.showToast('Đã cập nhật danh mục thành công', 'success');
        
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
        console.error('❌ Lỗi cập nhật danh mục:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Xóa danh mục
async function deleteCategory(categoryId) {
    const confirmed = await Utils.confirm('Bạn có chắc muốn xóa danh mục này? Tất cả sản phẩm trong danh mục sẽ chuyển sang danh mục "Khác".');
    if (!confirmed) return;
    
    Utils.showLoading('Đang xóa danh mục...');
    
    try {
        // 1. Xóa danh mục khỏi IndexedDB
        await deleteFromStore(STORES.CATEGORIES, categoryId);
        
        // 2. Thêm vào sync queue để xóa trên Firebase
        await addToSyncQueue({
            type: 'categories_delete',
            data: { id: categoryId, hkdId: selectedHKDForProducts }
        });
        
        // 3. Cập nhật sản phẩm thuộc danh mục này thành "Khác"
        const productsInCategory = currentHKDProducts.filter(p => p.categoryId === categoryId);
        for (const product of productsInCategory) {
            product.categoryId = null;
            product.category = 'Khác';
            product.lastUpdated = new Date().toISOString();
            
            await saveProduct(product);
            await addToSyncQueue({
                type: 'products',
                data: product
            });
        }
        
        // 4. Cập nhật local data
        currentHKDCategories = currentHKDCategories.filter(c => c.id !== categoryId);
        currentHKDProducts = currentHKDProducts.map(p => {
            if (p.categoryId === categoryId) {
                return { ...p, categoryId: null, category: 'Khác' };
            }
            return p;
        });
        
        // 5. Update UI
        displayCategories();
        displayProducts();
        
        Utils.showToast('Đã xóa danh mục thành công', 'success');
        
        // 6. Đồng bộ ngay
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
        console.error('❌ Lỗi xóa danh mục:', error);
        Utils.showToast('Lỗi khi xóa danh mục', 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Thêm sản phẩm
async function saveProduct() {
    const name = document.getElementById('productName').value;
    const msp = document.getElementById('productMSP').value;
    const categoryId = document.getElementById('productCategory').value;
    const unit = document.getElementById('productUnit').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const description = document.getElementById('productDescription').value;
    
    if (!name || !price || !selectedHKDForProducts) {
        Utils.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu sản phẩm...');
    
    try {
        const productId = Utils.generateId();
        const category = currentHKDCategories.find(c => c.id === categoryId);
        
        const productData = {
            id: productId,
            name: name,
            msp: msp,
            categoryId: categoryId,
            category: category ? category.name : 'Khác',
            unit: unit || 'cái',
            price: price,
            stock: stock || 0,
            description: description,
            hkdId: selectedHKDForProducts,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        // Lưu vào IndexedDB
        await saveProduct(productData);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'products',
            data: productData
        });
        
        // Cập nhật local data
        currentHKDProducts.push(productData);
        
        // Update UI
        displayProducts();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset form
        document.getElementById('addProductForm').reset();
        
        Utils.showToast('Đã thêm sản phẩm thành công', 'success');
        
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
        console.error('❌ Lỗi lưu sản phẩm:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Chỉnh sửa sản phẩm
async function editProduct(productId) {
    const product = currentHKDProducts.find(p => p.id === productId);
    if (!product) return;
    
    // Hiển thị modal chỉnh sửa
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editProductMSP').value = product.msp || '';
    document.getElementById('editProductCategory').value = product.categoryId || '';
    document.getElementById('editProductUnit').value = product.unit || 'cái';
    document.getElementById('editProductPrice').value = product.price;
    document.getElementById('editProductStock').value = product.stock || 0;
    document.getElementById('editProductDescription').value = product.description || '';
    document.getElementById('editProductId').value = product.id;
    
    // Populate categories select
    const categorySelect = document.getElementById('editProductCategory');
    categorySelect.innerHTML = '<option value="">Khác</option>';
    currentHKDCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        if (product.categoryId === category.id) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
    modal.show();
}

// Cập nhật sản phẩm
async function updateProduct() {
    const productId = document.getElementById('editProductId').value;
    const name = document.getElementById('editProductName').value;
    const msp = document.getElementById('editProductMSP').value;
    const categoryId = document.getElementById('editProductCategory').value;
    const unit = document.getElementById('editProductUnit').value;
    const price = parseFloat(document.getElementById('editProductPrice').value);
    const stock = parseInt(document.getElementById('editProductStock').value);
    const description = document.getElementById('editProductDescription').value;
    
    if (!name || !price || !productId) {
        Utils.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
        return;
    }
    
    Utils.showLoading('Đang cập nhật...');
    
    try {
        const product = currentHKDProducts.find(p => p.id === productId);
        if (!product) throw new Error('Không tìm thấy sản phẩm');
        
        const category = currentHKDCategories.find(c => c.id === categoryId);
        
        // Cập nhật thông tin
        product.name = name;
        product.msp = msp;
        product.categoryId = categoryId;
        product.category = category ? category.name : 'Khác';
        product.unit = unit;
        product.price = price;
        product.stock = stock;
        product.description = description;
        product.lastUpdated = new Date().toISOString();
        
        // Cập nhật IndexedDB
        await saveProduct(product);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'products',
            data: product
        });
        
        // Update UI
        displayProducts();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editProductModal'));
        if (modal) {
            modal.hide();
        }
        
        Utils.showToast('Đã cập nhật sản phẩm thành công', 'success');
        
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
        console.error('❌ Lỗi cập nhật sản phẩm:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Xóa sản phẩm
async function deleteProduct(productId) {
    const confirmed = await Utils.confirm('Bạn có chắc muốn xóa sản phẩm này?');
    if (!confirmed) return;
    
    Utils.showLoading('Đang xóa sản phẩm...');
    
    try {
        // 1. Xóa khỏi IndexedDB
        await deleteFromStore(STORES.PRODUCTS, productId);
        
        // 2. Thêm vào sync queue để xóa trên Firebase
        await addToSyncQueue({
            type: 'products_delete',
            data: { id: productId, hkdId: selectedHKDForProducts }
        });
        
        // 3. Cập nhật local data
        currentHKDProducts = currentHKDProducts.filter(p => p.id !== productId);
        
        // 4. Update UI
        displayProducts();
        
        Utils.showToast('Đã xóa sản phẩm thành công', 'success');
        
        // 5. Đồng bộ ngay
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
        console.error('❌ Lỗi xóa sản phẩm:', error);
        Utils.showToast('Lỗi khi xóa sản phẩm', 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Tìm kiếm sản phẩm
function searchProducts() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    
    if (!searchTerm) {
        displayProducts();
        return;
    }
    
    const filteredProducts = currentHKDProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        (product.msp && product.msp.toLowerCase().includes(searchTerm)) ||
        (product.description && product.description.toLowerCase().includes(searchTerm))
    );
    
    renderFilteredProducts(filteredProducts);
}

// Tìm kiếm danh mục
function searchCategories() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
    
    if (!searchTerm) {
        displayCategories();
        return;
    }
    
    const filteredCategories = currentHKDCategories.filter(category =>
        category.name.toLowerCase().includes(searchTerm) ||
        (category.description && category.description.toLowerCase().includes(searchTerm))
    );
    
    renderFilteredCategories(filteredCategories);
}

// Hiển thị sản phẩm đã lọc
function renderFilteredProducts(products) {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    if (products.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="no-data">
                        <i class="fas fa-search"></i>
                        <p>Không tìm thấy sản phẩm</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    container.innerHTML = products.map(product => {
        const category = currentHKDCategories.find(c => c.id === product.categoryId);
        
        return `
            <tr>
                <td><code>${product.msp || 'N/A'}</code></td>
                <td>
                    <strong>${product.name}</strong>
                    ${product.description ? `<br><small class="text-muted">${product.description}</small>` : ''}
                </td>
                <td>${category ? category.name : 'Khác'}</td>
                <td>${product.unit || 'cái'}</td>
                <td>${Utils.formatCurrency(product.price)}</td>
                <td>
                    <span class="badge ${product.stock > 0 ? 'bg-success' : 'bg-danger'}">
                        ${product.stock || 0}
                    </span>
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-primary" onclick="editProduct('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Hiển thị danh mục đã lọc
function renderFilteredCategories(categories) {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <i class="fas fa-search"></i>
                <p>Không tìm thấy danh mục</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = categories.map(category => `
        <div class="category-card">
            <div class="category-header">
                <div class="category-info">
                    <h5>${category.name}</h5>
                    <p class="category-product-count">
                        ${getProductCountByCategory(category.id)} sản phẩm
                    </p>
                </div>
                <div class="category-actions">
                    <button class="btn-edit-category" onclick="editCategory('${category.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete-category" onclick="deleteCategory('${category.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="category-description">
                ${category.description || 'Không có mô tả'}
            </div>
        </div>
    `).join('');
}

// Hiển thị modal thêm danh mục
function showAddCategoryModal() {
    // Reset form
    document.getElementById('addCategoryForm').reset();
    
    const modal = new bootstrap.Modal(document.getElementById('addCategoryModal'));
    modal.show();
}

// Hiển thị modal thêm sản phẩm
function showAddProductModal() {
    // Reset form
    document.getElementById('addProductForm').reset();
    
    // Populate categories select
    const categorySelect = document.getElementById('productCategory');
    categorySelect.innerHTML = '<option value="">Khác</option>';
    currentHKDCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('addProductModal'));
    modal.show();
}

// Export sản phẩm ra Excel
function exportProductsToExcel() {
    if (currentHKDProducts.length === 0) {
        Utils.showToast('Không có sản phẩm để export', 'warning');
        return;
    }
    
    try {
        // Chuẩn bị dữ liệu
        const exportData = currentHKDProducts.map(product => {
            const category = currentHKDCategories.find(c => c.id === product.categoryId);
            return {
                'Mã SP': product.msp || '',
                'Tên sản phẩm': product.name,
                'Danh mục': category ? category.name : 'Khác',
                'Đơn vị tính': product.unit || 'cái',
                'Giá': product.price,
                'Tồn kho': product.stock || 0,
                'Mô tả': product.description || '',
                'Ngày tạo': Utils.formatDate(product.createdAt),
                'Ngày cập nhật': Utils.formatDate(product.lastUpdated)
            };
        });
        
        // Tạo worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Tạo workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
        
        // Xuất file
        const hkd = allHKDs.find(h => h.id === selectedHKDForProducts);
        const fileName = `san_pham_${hkd ? hkd.name.replace(/\s+/g, '_') : 'unknown'}_${Utils.formatDate(new Date(), false)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        Utils.showToast(`Đã export ${exportData.length} sản phẩm`, 'success');
        
    } catch (error) {
        console.error('❌ Lỗi export:', error);
        Utils.showToast('Lỗi export file Excel', 'error');
    }
}

// Show import products section
function showImportProductsSection() {
    document.getElementById('productsContent').style.display = 'none';
    document.getElementById('importProductsSection').style.display = 'block';
    
    // Populate HKD select for import
    const importSelect = document.getElementById('importProductsHKD');
    if (importSelect) {
        importSelect.innerHTML = '<option value="">Chọn HKD...</option>';
        allHKDs.forEach(hkd => {
            if (hkd && hkd.id && hkd.name) {
                const option = document.createElement('option');
                option.value = hkd.id;
                option.textContent = hkd.name + (hkd.phone ? ` (${hkd.phone})` : '');
                importSelect.appendChild(option);
            }
        });
    }
}

// Init products import listeners
function initProductsImportListeners() {
    // Back button
    const backBtn = document.getElementById('btnBackToProducts');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('productsContent').style.display = 'block';
            document.getElementById('importProductsSection').style.display = 'none';
        });
    }
    
    // File input
    const fileInput = document.getElementById('importProductsFile');
    if (fileInput) {
        fileInput.addEventListener('change', handleProductsExcelImport);
    }
    
    // Clear preview
    const clearBtn = document.getElementById('btnClearProductsPreview');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('importProductsPreview').innerHTML = '';
            document.getElementById('importProductsFile').value = '';
            delete window.productsExcelData;
        });
    }
    
    // Process import
    const processBtn = document.getElementById('btnProcessProductsImport');
    if (processBtn) {
        processBtn.addEventListener('click', processProductsImport);
    }
}

// Handle Excel import cho sản phẩm
async function handleProductsExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
        Utils.showToast('Chỉ chấp nhận file Excel (.xlsx, .xls, .csv)', 'error');
        return;
    }
    
    Utils.showLoading('Đang đọc file...');
    
    try {
        const data = await readExcelFile(file);
        displayProductsExcelPreview(data);
    } catch (error) {
        console.error('Lỗi đọc file:', error);
        Utils.showToast('Lỗi đọc file Excel', 'error');
    } finally {
        Utils.hideLoading();
        event.target.value = ''; // Reset input
    }
}

// Display Excel preview cho sản phẩm
function displayProductsExcelPreview(data) {
    const container = document.getElementById('importProductsPreview');
    const rows = data.slice(0, 11); // Hiển thị tối đa 10 dòng đầu
    
    container.innerHTML = `
        <h6>Preview (${rows.length - 1} dòng đầu tiên):</h6>
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
    
    // Lưu data tạm thời
    window.productsExcelData = data;
}

// Process products import
async function processProductsImport() {
    const hkdId = document.getElementById('importProductsHKD').value;
    const importMode = document.getElementById('importProductsMode').value;
    
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'error');
        return;
    }
    
    if (!window.productsExcelData || window.productsExcelData.length < 2) {
        Utils.showToast('Không có dữ liệu Excel để import', 'error');
        return;
    }
    
    Utils.showLoading('Đang xử lý dữ liệu...');
    
    try {
        // Parse Excel data
        const products = parseProductsExcelData(window.productsExcelData);
        
        // Lấy HKD info
        const hkd = allHKDs.find(h => h.id === hkdId);
        if (!hkd) throw new Error('Không tìm thấy HKD');
        
        if (importMode === 'replace') {
            // Xóa sản phẩm cũ
            const oldProducts = await getProductsByHKD(hkdId);
            for (const product of oldProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
                await addToSyncQueue({
                    type: 'products_delete',
                    data: { id: product.id, hkdId: hkdId }
                });
            }
        }
        
        // Xử lý danh mục
        const categories = {};
        for (const product of products) {
            const categoryName = product.category || 'Khác';
            if (!categories[categoryName]) {
                const categoryId = Utils.generateId();
                categories[categoryName] = {
                    id: categoryId,
                    name: categoryName,
                    hkdId: hkdId,
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
            }
            product.categoryId = categories[categoryName].id;
        }
        
        // Lưu danh mục
        for (const category of Object.values(categories)) {
            await saveCategory(category);
            await addToSyncQueue({
                type: 'categories',
                data: category
            });
        }
        
        // Lưu sản phẩm
        for (const product of products) {
            product.hkdId = hkdId;
            product.createdAt = new Date().toISOString();
            product.lastUpdated = new Date().toISOString();
            
            await saveProduct(product);
            await addToSyncQueue({
                type: 'products',
                data: product
            });
        }
        
        // Reset preview
        document.getElementById('importProductsPreview').innerHTML = '';
        delete window.productsExcelData;
        
        Utils.showToast(`Đã import ${products.length} sản phẩm cho ${hkd.name}`, 'success');
        
        // Đồng bộ ngay lập tức
        if (navigator.onLine && typeof forceSync === 'function') {
            await forceSync();
        }
        
        // Quay lại quản lý sản phẩm
        document.getElementById('productsContent').style.display = 'block';
        document.getElementById('importProductsSection').style.display = 'none';
        
        // Nếu đang chọn HKD này, refresh data
        if (selectedHKDForProducts === hkdId) {
            await loadHKDProductsAndCategories(hkdId);
        }
        
    } catch (error) {
        console.error('Lỗi import:', error);
        Utils.showToast('Lỗi khi import dữ liệu: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}

// Parse products Excel data
function parseProductsExcelData(data) {
    // Giả sử cấu trúc: MSP, Tên, Danh mục, DVT, Giá, Tồn kho, Mô tả
    const rows = data.slice(1); // Bỏ header
    const products = [];
    
    for (const row of rows) {
        if (row.length < 2) continue; // Bỏ hàng không đủ dữ liệu
        
        const product = {
            id: Utils.generateId(),
            msp: row[0]?.toString() || '',
            name: row[1]?.toString() || '',
            category: row[2]?.toString() || 'Khác',
            unit: row[3]?.toString() || 'cái',
            price: parseFloat(row[4]) || 0,
            stock: parseInt(row[5]) || 0,
            description: row[6]?.toString() || ''
        };
        
        products.push(product);
    }
    
    return products;
}

// Make functions available globally
window.editCategory = editCategory;
window.updateCategory = updateCategory;
window.deleteCategory = deleteCategory;
window.editProduct = editProduct;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.searchProducts = searchProducts;
window.searchCategories = searchCategories;

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Category manager DOM loaded');
    // initCategoryManager sẽ được gọi từ admin.js
});