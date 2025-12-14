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

// Đăng nhập Admin
async function authenticateAdmin(phone, password) {
    try {
        // Kiểm tra thông tin đăng nhập mặc định
        if (phone === 'admin' && password === '123123') {
            currentUser = {
                id: 'admin',
                phone: 'admin',
                name: 'Administrator',
                role: 'admin',
                loginTime: new Date().toISOString()
            };
            
            // Lưu vào localStorage
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Lưu vào IndexedDB
            try {
                await saveHKD({
                    id: 'admin',
                    phone: 'admin',
                    name: 'Administrator',
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });
            } catch (dbError) {
                console.warn('Không thể lưu admin vào IndexedDB:', dbError);
            }
            
            return true;
        }
        
        // Nếu không phải admin mặc định, kiểm tra trong IndexedDB
        const admin = await getHKD('admin');
        if (admin && admin.phone === phone && admin.password === password) {
            currentUser = {
                id: admin.id,
                phone: admin.phone,
                name: admin.name,
                role: 'admin',
                loginTime: new Date().toISOString()
            };
            
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            return true;
        }
        
        throw new Error('Sai thông tin đăng nhập');
    } catch (error) {
        console.error('Lỗi đăng nhập admin:', error);
        throw error;
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

// Đồng bộ dữ liệu HKD từ Firebase về IndexedDB
async function syncHKDDataFromFirebase(hkdId) {
    console.log(`🔄 Đồng bộ dữ liệu HKD ${hkdId} từ Firebase...`);
    
    try {
        // 1. Lấy thông tin HKD
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const hkdSnapshot = await hkdRef.once('value');
        const hkdData = hkdSnapshot.val();
        
        if (hkdData) {
            // Lưu vào IndexedDB
            await updateInStore(STORES.HKDS, {
                ...hkdData,
                id: hkdId
            });
            console.log('✅ Đã lưu HKD info vào IndexedDB');
        }
        
        // 2. Lấy sản phẩm
        const productsRef = firebase.database().ref(`hkds/${hkdId}/products`);
        const productsSnapshot = await productsRef.once('value');
        const productsData = productsSnapshot.val();
        
        if (productsData) {
            for (const [productId, product] of Object.entries(productsData)) {
                await updateInStore(STORES.PRODUCTS, {
                    ...product,
                    id: productId,
                    hkdId: hkdId
                });
            }
            console.log(`✅ Đã đồng bộ ${Object.keys(productsData).length} sản phẩm`);
        }
        
        // 3. Lấy danh mục
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const categoriesSnapshot = await categoriesRef.once('value');
        const categoriesData = categoriesSnapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, category] of Object.entries(categoriesData)) {
                await updateInStore(STORES.CATEGORIES, {
                    ...category,
                    id: categoryId,
                    hkdId: hkdId
                });
            }
        }
        
        // 4. Lấy hóa đơn
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        const invoicesSnapshot = await invoicesRef.once('value');
        const invoicesData = invoicesSnapshot.val();
        
        if (invoicesData) {
            for (const [invoiceId, invoice] of Object.entries(invoicesData)) {
                await updateInStore(STORES.INVOICES, {
                    ...invoice,
                    id: invoiceId,
                    hkdId: hkdId
                });
            }
            console.log(`✅ Đã đồng bộ ${Object.keys(invoicesData).length} hóa đơn`);
        }
        
        console.log('✅ Hoàn tất đồng bộ từ Firebase');
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
        // Không throw, chỉ log
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