// Authentication module
let currentUser = null;

// Khởi tạo authentication
async function initAuth() {
    try {
        await initFirebase();
        
        // Kiểm tra nếu đã đăng nhập từ trước
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            return currentUser;
        }
        
        return null;
    } catch (error) {
        console.error('Lỗi khởi tạo auth:', error);
        return null;
    }
}

async function authenticateAdmin(phone, password) {
    console.log('🔑 Admin login attempt:', phone);
    
    try {
        // 1. Kiểm tra credentials mặc định
        if (phone === 'admin' && password === '123123') {
            console.log('✅ Using default admin credentials');
            
            currentUser = {
                id: 'admin',
                phone: 'admin',
                name: 'Administrator',
                role: 'admin',
                loginTime: new Date().toISOString()
            };
            
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // ĐỒNG BỘ DỮ LIỆU TỪ FIREBASE SAU KHI ĐĂNG NHẬP
            setTimeout(async () => {
                try {
                    await syncAllDataForAdmin();
                } catch (syncError) {
                    console.error('❌ Lỗi đồng bộ dữ liệu admin:', syncError);
                }
            }, 1000);
            
            return true;
        }
        
        // 2. Nếu không phải default, kiểm tra trong Firebase
        console.log('🔍 Checking admin in Firebase...');
        await initFirebase();
        
        // Tìm admin trong Firebase
        const admin = await findAdminInFirebase(phone, password);
        
        if (admin) {
            currentUser = {
                id: admin.id,
                phone: admin.phone,
                name: admin.name,
                role: 'admin',
                loginTime: new Date().toISOString()
            };
            
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Đồng bộ dữ liệu
            setTimeout(async () => {
                await syncAllDataForAdmin();
            }, 1000);
            
            return true;
        }
        
        throw new Error('Sai thông tin đăng nhập');
        
    } catch (error) {
        console.error('❌ Lỗi đăng nhập admin:', error);
        throw error;
    }
}
async function syncAllDataForAdmin() {
    console.log('🔄 Đồng bộ toàn bộ dữ liệu cho Admin...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, bỏ qua sync');
        return;
    }
    
    try {
        await initFirebase();
        
        // 1. Lấy tất cả HKD từ Firebase
        const hkdsRef = firebase.database().ref('hkds');
        const snapshot = await hkdsRef.once('value');
        const allHKDsFromFirebase = snapshot.val();
        
        if (!allHKDsFromFirebase) {
            console.log('📭 Firebase trống, không có HKD nào');
            return;
        }
        
        console.log(`📥 Tìm thấy ${Object.keys(allHKDsFromFirebase).length} HKD trên Firebase`);
        
        let totalSynced = 0;
        
        // 2. Đồng bộ từng HKD
        for (const [hkdId, hkdData] of Object.entries(allHKDsFromFirebase)) {
            if (!hkdData || !hkdData.info) continue;
            
            try {
                console.log(`   🔄 Đang sync HKD: ${hkdData.info.name || hkdId}`);
                
                // 2.1. Lưu thông tin HKD
                const hkdToSave = {
                    ...hkdData.info,
                    id: hkdId,
                    role: 'hkd',
                    _synced: true,
                    _syncedAt: new Date().toISOString()
                };
                
                await updateInStore(STORES.HKDS, hkdToSave);
                
                // 2.2. Lưu danh mục và sản phẩm (cấu trúc mới)
                if (hkdData.categories) {
                    await syncCategoriesAndProductsForAdmin(hkdId, hkdData.categories);
                }
                
                // 2.3. Lưu hóa đơn
                if (hkdData.invoices) {
                    await syncInvoicesForAdmin(hkdId, hkdData.invoices);
                }
                
                totalSynced++;
                console.log(`   ✅ Đã sync xong HKD: ${hkdData.info.name}`);
                
            } catch (hkdError) {
                console.error(`   ❌ Lỗi sync HKD ${hkdId}:`, hkdError);
            }
        }
        
        console.log(`✅ Đã đồng bộ ${totalSynced}/${Object.keys(allHKDsFromFirebase).length} HKD`);
        
        // 3. Cập nhật UI nếu đang ở admin page
        if (typeof window.loadDataAfterSync === 'function') {
            setTimeout(() => {
                window.loadDataAfterSync();
            }, 500);
        }
        
        Utils.showToast(`Đã đồng bộ ${totalSynced} HKD từ server`, 'success');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ dữ liệu admin:', error);
        // Không throw, chỉ log lỗi
    }
}
async function syncCategoriesAndProductsForAdmin(hkdId, categoriesData) {
    if (!categoriesData) return;
    
    let categoryCount = 0;
    let productCount = 0;
    
    for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
        if (!categoryData || !categoryData.name) continue;
        
        // 1. Lưu danh mục
        const categoryToSave = {
            id: categoryId,
            hkdId: hkdId,
            name: categoryData.name,
            description: categoryData.description || '',
            createdAt: categoryData.createdAt || new Date().toISOString(),
            lastUpdated: categoryData.lastUpdated || new Date().toISOString(),
            _synced: true,
            _source: 'firebase_admin'
        };
        
        await updateInStore(STORES.CATEGORIES, categoryToSave);
        categoryCount++;
        
        // 2. Lưu sản phẩm trong danh mục (cấu trúc mới)
        if (categoryData.products && typeof categoryData.products === 'object') {
            for (const [productId, productData] of Object.entries(categoryData.products)) {
                if (!productData || !productData.name) continue;
                
                const productToSave = {
                    id: productId,
                    hkdId: hkdId,
                    categoryId: categoryId, // QUAN TRỌNG
                    msp: productData.msp || '',
                    name: productData.name,
                    unit: productData.unit || 'cái',
                    price: productData.price || 0,
                    stock: productData.stock || 0,
                    description: productData.description || '',
                    note: productData.note || '',
                    lastUpdated: productData.lastUpdated || new Date().toISOString(),
                    _synced: true,
                    _source: 'firebase_admin'
                };
                
                await updateInStore(STORES.PRODUCTS, productToSave);
                productCount++;
            }
        }
    }
    
    console.log(`     📁 Danh mục: ${categoryCount}, 📦 Sản phẩm: ${productCount}`);
}

async function syncInvoicesForAdmin(hkdId, invoicesData) {
    if (!invoicesData) return;
    
    let invoiceCount = 0;
    
    for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
        if (!invoiceData || !invoiceData.items) continue;
        
        const invoiceToSave = {
            ...invoiceData,
            id: invoiceId,
            hkdId: hkdId,
            _synced: true,
            _source: 'firebase_admin'
        };
        
        await updateInStore(STORES.INVOICES, invoiceToSave);
        invoiceCount++;
    }
    
    console.log(`     🧾 Hóa đơn: ${invoiceCount}`);
}

async function findAdminInFirebase(phone, password) {
    return new Promise((resolve, reject) => {
        try {
            const adminsRef = firebase.database().ref('admins');
            
            adminsRef.once('value', (snapshot) => {
                const adminsData = snapshot.val();
                
                if (!adminsData) {
                    reject(new Error('Không tìm thấy admin trong Firebase'));
                    return;
                }
                
                // Tìm admin trùng phone và password
                for (const [adminId, adminData] of Object.entries(adminsData)) {
                    if (adminData.phone === phone && 
                        adminData.password === password && 
                        adminData.role === 'admin') {
                        
                        resolve({
                            id: adminId,
                            ...adminData
                        });
                        return;
                    }
                }
                
                reject(new Error('Sai thông tin đăng nhập'));
            }, (error) => {
                reject(new Error('Lỗi kết nối Firebase'));
            });
            
        } catch (error) {
            reject(error);
        }
    });
}
async function handleSoftDelete(baseType, hkdId, data) {
    console.log(`🗑️ Soft deleting ${baseType}: ${data.id}`);
    
    let path = '';
    
    switch(baseType) {
        case 'hkds':
            path = `hkds/${hkdId}/info`;
            break;
            
        case 'categories':
            path = `hkds/${hkdId}/categories/${data.id}`;
            break;
            
        case 'products':
            if (!data.categoryId) {
                // Thử lấy categoryId từ IndexedDB nếu không có trong data
                try {
                    const product = await getFromStore(STORES.PRODUCTS, data.id);
                    data.categoryId = product?.categoryId;
                } catch (err) {
                    console.warn('⚠️ Không thể lấy categoryId từ IndexedDB:', err);
                }
                
                if (!data.categoryId) {
                    throw new Error(`Thiếu categoryId để xóa sản phẩm ${data.id}`);
                }
            }
            path = `hkds/${hkdId}/categories/${data.categoryId}/products/${data.id}`;
            break;
            
        case 'invoices':
            path = `hkds/${hkdId}/invoices/${data.id}`;
            break;
            
        default:
            throw new Error(`Loại xóa không được hỗ trợ: ${baseType}`);
    }
    
    const dbRef = firebase.database().ref(path);
    
    // Soft delete: chỉ đánh dấu, không xóa thật
    await dbRef.update({
        _deleted: true,
        _deletedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    });
    
    console.log(`✅ Đã đánh dấu xóa ${baseType} ${data.id} trên Firebase`);
}
async function handleProductCategoryChange(hkdId, productData) {
    console.log(`🔄 Xử lý sản phẩm đổi danh mục: ${productData.id}`);
    console.log(`   Từ: ${productData.oldCategoryId} → Đến: ${productData.categoryId}`);
    
    // 1. Xóa sản phẩm khỏi danh mục cũ (nếu có)
    if (productData.oldCategoryId) {
        try {
            const oldPath = `hkds/${hkdId}/categories/${productData.oldCategoryId}/products/${productData.id}`;
            const oldRef = firebase.database().ref(oldPath);
            await oldRef.remove();
            console.log(`✅ Đã xóa khỏi danh mục cũ: ${productData.oldCategoryId}`);
        } catch (removeError) {
            console.warn(`⚠️ Không thể xóa khỏi danh mục cũ: ${removeError.message}`);
            // Vẫn tiếp tục, có thể sản phẩm không tồn tại ở danh mục cũ
        }
    }
    
    // 2. Thêm vào danh mục mới
    const newPath = `hkds/${hkdId}/categories/${productData.categoryId}/products/${productData.id}`;
    const newRef = firebase.database().ref(newPath);
    
    // Chỉ lưu các trường cần thiết, không lưu metadata
    const firebaseProductData = {
        msp: productData.msp || '',
        name: productData.name || '',
        unit: productData.unit || 'cái',
        price: productData.price || 0,
        stock: productData.stock || 0,
        cost: productData.cost || null,
        description: productData.description || '',
        note: productData.note || '',
        lastUpdated: productData.lastUpdated || new Date().toISOString(),
        _syncedAt: new Date().toISOString(),
        _deleted: false
    };
    
    await newRef.set(firebaseProductData);
    console.log(`✅ Đã thêm vào danh mục mới: ${productData.categoryId}`);
}
async function handleNormalSync(type, hkdId, data) {
    console.log(`📤 Normal sync ${type}: ${data.id}`);
    
    let path = '';
    let firebaseData = {};
    
    switch(type) {
        case 'hkds':
            path = `hkds/${hkdId}/info`;
            firebaseData = {
                name: data.name || '',
                phone: data.phone || '',
                address: data.address || '',
                password: data.password || '', // QUAN TRỌNG: lưu mật khẩu
                role: 'hkd',
                createdAt: data.createdAt || new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                _syncedAt: new Date().toISOString(),
                _deleted: false
            };
            break;
            
        case 'categories':
            path = `hkds/${hkdId}/categories/${data.id}`;
            firebaseData = {
                name: data.name || '',
                description: data.description || '',
                createdAt: data.createdAt || new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                products: data.products || {}, // Đảm bảo có node products
                _syncedAt: new Date().toISOString(),
                _deleted: false
            };
            break;
            
        case 'products':
            if (!data.categoryId) {
                throw new Error(`Thiếu categoryId cho sản phẩm ${data.id}`);
            }
            path = `hkds/${hkdId}/categories/${data.categoryId}/products/${data.id}`;
            firebaseData = {
                msp: data.msp || '',
                name: data.name || '',
                unit: data.unit || 'cái',
                price: data.price || 0,
                stock: data.stock || 0,
                cost: data.cost || null,
                description: data.description || '',
                note: data.note || '',
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                _syncedAt: new Date().toISOString(),
                _deleted: false
            };
            break;
            
        case 'invoices':
            path = `hkds/${hkdId}/invoices/${data.id}`;
            // Đảm bảo items là array hợp lệ
            const items = Array.isArray(data.items) ? data.items : [];
            firebaseData = {
                hkdName: data.hkdName || '',
                customerName: data.customerName || 'Khách lẻ',
                date: data.date || new Date().toISOString(),
                items: items,
                subtotal: data.subtotal || 0,
                total: data.total || 0,
                status: data.status || 'completed',
                lastUpdated: new Date().toISOString(),
                _syncedAt: new Date().toISOString(),
                _deleted: false
            };
            break;
            
        default:
            throw new Error(`Loại dữ liệu không được hỗ trợ: ${type}`);
    }
    
    const dbRef = firebase.database().ref(path);
    
    // Sử dụng set() thay vì update() để đảm bảo ghi đè toàn bộ
    await dbRef.set(firebaseData);
    
    console.log(`✅ Đã sync ${type} ${data.id} thành công`);
    
    // Ghi log chi tiết cho debug
    if (type === 'products') {
        console.log(`   📍 Vị trí: ${path}`);
        console.log(`   📊 Dữ liệu:`, {
            name: firebaseData.name,
            price: firebaseData.price,
            categoryId: data.categoryId
        });
    }
}
// Đăng nhập HKD - LẤY TỪ FIREBASE
async function authenticateHKD(phone, password) {
    console.log(`🔑 Đăng nhập HKD từ Firebase: ${phone}`);
    
    try {
        // 1. Khởi tạo Firebase nếu chưa
        await initFirebase();
        
        // 2. Tìm HKD trong Firebase
        const hkd = await findHKDInFirebase(phone, password);
        
        // 3. Lưu vào current user
        currentUser = {
            id: hkd.id,
            phone: hkd.phone,
            name: hkd.name,
            address: hkd.address,
            role: 'hkd',
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // 4. Đồng bộ dữ liệu HKD về IndexedDB
        await syncHKDDataFromFirebase(hkd.id);
        
        console.log('✅ Đăng nhập thành công từ Firebase');
        return true;
        
    } catch (error) {
        console.error('❌ Lỗi đăng nhập từ Firebase:', error);
        throw error;
    }
}

// Tìm HKD trong Firebase
async function findHKDInFirebase(phone, password) {
    return new Promise((resolve, reject) => {
        try {
            // Lấy tất cả HKD từ Firebase
            const hkdsRef = firebase.database().ref('hkds');
            
            hkdsRef.once('value', (snapshot) => {
                const hkdsData = snapshot.val();
                console.log('🔥 Dữ liệu HKD từ Firebase:', hkdsData);
                
                if (!hkdsData) {
                    reject(new Error('Không có HKD nào trong Firebase'));
                    return;
                }
                
                // Duyệt qua tất cả HKD
                let foundHKD = null;
                
                for (const [hkdId, hkdData] of Object.entries(hkdsData)) {
                    console.log(`Checking HKD ${hkdId}:`, hkdData);
                    
                    // Kiểm tra xem có info không
                    if (hkdData && hkdData.info) {
                        const info = hkdData.info;
                        
                        if (info.phone === phone && 
                            info.password === password && 
                            info.role === 'hkd') {
                            foundHKD = {
                                id: hkdId,
                                ...info
                            };
                            break;
                        }
                    }
                }
                
                if (foundHKD) {
                    console.log('✅ Tìm thấy HKD trong Firebase:', foundHKD);
                    resolve(foundHKD);
                } else {
                    console.log('❌ Không tìm thấy HKD phù hợp');
                    reject(new Error('Sai số điện thoại hoặc mật khẩu'));
                }
            }, (error) => {
                console.error('❌ Lỗi Firebase:', error);
                reject(new Error('Lỗi kết nối Firebase'));
            });
            
        } catch (error) {
            console.error('❌ Lỗi tìm HKD:', error);
            reject(error);
        }
    });
}

async function syncHKDDataFromFirebase(hkdId) {
    console.log(`🔄 Đồng bộ dữ liệu HKD ${hkdId} từ Firebase...`);
    
    try {
        await initFirebase();
        
        // 1. Lấy thông tin HKD
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const hkdSnapshot = await hkdRef.once('value');
        const hkdData = hkdSnapshot.val();
        
        if (hkdData) {
            await updateInStore(STORES.HKDS, {
                ...hkdData,
                id: hkdId
            });
            console.log('✅ Đã lưu HKD info vào IndexedDB');
        }
        
        // ==================== QUAN TRỌNG ====================
        // 2. Lấy DANH MỤC và SẢN PHẨM (cấu trúc mới)
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const categoriesSnapshot = await categoriesRef.once('value');
        const categoriesData = categoriesSnapshot.val();
        
        if (categoriesData) {
            console.log(`📂 Tìm thấy ${Object.keys(categoriesData).length} danh mục trên Firebase`);
            
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                if (!categoryData || !categoryData.name) continue;
                
                // 2.1. Lưu danh mục
                await updateInStore(STORES.CATEGORIES, {
                    id: categoryId,
                    hkdId: hkdId,
                    name: categoryData.name,
                    description: categoryData.description || '',
                    createdAt: categoryData.createdAt || new Date().toISOString(),
                    lastUpdated: categoryData.lastUpdated || new Date().toISOString(),
                    _synced: true
                });
                
                console.log(`   📁 Đã lưu danh mục: ${categoryData.name}`);
                
                // 2.2. Lưu SẢN PHẨM trong danh mục (cấu trúc mới)
                if (categoryData.products && typeof categoryData.products === 'object') {
                    const products = categoryData.products;
                    console.log(`     📦 Tìm thấy ${Object.keys(products).length} sản phẩm trong danh mục`);
                    
                    for (const [productId, productData] of Object.entries(products)) {
                        if (!productData || !productData.name) continue;
                        
                        await updateInStore(STORES.PRODUCTS, {
                            id: productId,
                            hkdId: hkdId,
                            categoryId: categoryId, // ← QUAN TRỌNG: lấy từ đường dẫn
                            msp: productData.msp || '',
                            name: productData.name,
                            unit: productData.unit || 'cái',
                            price: productData.price || 0,
                            stock: productData.stock || 0,
                            description: productData.description || '',
                            note: productData.note || '',
                            lastUpdated: productData.lastUpdated || new Date().toISOString(),
                            _synced: true
                        });
                        
                        console.log(`       ✅ ${productData.name} - ${productData.price}đ`);
                    }
                } else {
                    console.log(`     📭 Danh mục "${categoryData.name}" không có sản phẩm`);
                }
            }
        } else {
            console.log('📭 Không tìm thấy danh mục nào trên Firebase');
        }
        
        // ==================== QUAN TRỌNG ====================
        // 3. Lấy HÓA ĐƠN
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        const invoicesSnapshot = await invoicesRef.once('value');
        const invoicesData = invoicesSnapshot.val();
        
        if (invoicesData) {
            let invoiceCount = 0;
            for (const [invoiceId, invoice] of Object.entries(invoicesData)) {
                await updateInStore(STORES.INVOICES, {
                    ...invoice,
                    id: invoiceId,
                    hkdId: hkdId
                });
                invoiceCount++;
            }
            console.log(`✅ Đã đồng bộ ${invoiceCount} hóa đơn`);
        }
        
        console.log('✅ Hoàn tất đồng bộ từ Firebase');
        
        // 4. Gọi callback để cập nhật UI
        if (typeof window.onHKDDataSynced === 'function') {
            window.onHKDDataSynced(hkdId);
        }
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
        throw error;
    }
}

// Đồng bộ dữ liệu HKD
async function syncHKDData(hkdId) {
    if (!navigator.onLine) {
        console.log('Offline mode - sử dụng dữ liệu local');
        return;
    }
    
    try {
        await initFirebase();
        
        // Đồng bộ sản phẩm của HKD
        const productsRef = getDatabaseRef('products').orderByChild('hkdId').equalTo(hkdId);
        const productsSnapshot = await productsRef.once('value');
        const products = productsSnapshot.val();
        
        if (products) {
            for (const [key, product] of Object.entries(products)) {
                await saveProduct({
                    ...product,
                    id: key,
                    _synced: true
                });
            }
            console.log(`Đã đồng bộ ${Object.keys(products).length} sản phẩm`);
        }
        
        // Đồng bộ danh mục
        const categoriesRef = getDatabaseRef('categories').orderByChild('hkdId').equalTo(hkdId);
        const categoriesSnapshot = await categoriesRef.once('value');
        const categories = categoriesSnapshot.val();
        
        if (categories) {
            for (const [key, category] of Object.entries(categories)) {
                await saveCategory({
                    ...category,
                    id: key,
                    _synced: true
                });
            }
        }
        
        // Đồng bộ hóa đơn
        const invoicesRef = getDatabaseRef('invoices').orderByChild('hkdId').equalTo(hkdId);
        const invoicesSnapshot = await invoicesRef.once('value');
        const invoices = invoicesSnapshot.val();
        
        if (invoices) {
            for (const [key, invoice] of Object.entries(invoices)) {
                await saveInvoice({
                    ...invoice,
                    id: key,
                    _synced: true
                });
            }
        }
        
    } catch (error) {
        console.error('Lỗi đồng bộ dữ liệu HKD:', error);
    }
}

// Đăng xuất
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    // Chuyển về trang chủ
    window.location.href = 'index.html';
}

// Kiểm tra quyền
function checkPermission(requiredRole) {
    if (!currentUser) {
        return false;
    }
    
    if (requiredRole === 'admin' && currentUser.role !== 'admin') {
        return false;
    }
    
    if (requiredRole === 'hkd' && currentUser.role !== 'hkd') {
        return false;
    }
    
    return true;
}

// Lấy thông tin người dùng hiện tại
function getCurrentUser() {
    return currentUser;
}

// Đổi mật khẩu Admin
async function changeAdminPassword(oldPassword, newPassword) {
    if (!checkPermission('admin')) {
        throw new Error('Không có quyền thực hiện');
    }
    
    if (oldPassword !== '123123') {
        throw new Error('Mật khẩu cũ không đúng');
    }
    
    try {
        // Cập nhật trong IndexedDB
        const admin = await getHKD('admin');
        if (admin) {
            admin.password = newPassword;
            await saveHKD(admin);
        }
        
        // Thêm vào sync queue để đồng bộ lên Firebase
        await addToSyncQueue({
            type: 'hkds',
            data: {
                id: 'admin',
                phone: 'admin',
                name: 'Administrator',
                password: newPassword,
                role: 'admin',
                lastUpdated: new Date().toISOString()
            }
        });
        
        return true;
    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        throw error;
    }
}