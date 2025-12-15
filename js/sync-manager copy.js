// Sync Manager - Đồng bộ giữa IndexedDB và Firebase
let syncInProgress = false;
let syncInterval = null;

// Khởi tạo sync manager
function initSyncManager() {
    // Kiểm tra kết nối mạng
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    
    // Bắt đầu sync interval (mỗi 30 giây)
    syncInterval = setInterval(() => {
        if (navigator.onLine) {
            syncData();
        }
    }, 30000);
    
    // Đồng bộ ngay lập tức nếu online
    if (navigator.onLine) {
        setTimeout(syncData, 2000);
    }
}

// Xử lý thay đổi kết nối
function handleConnectionChange() {
    if (navigator.onLine) {
        console.log('Đã kết nối mạng, bắt đầu đồng bộ...');
        syncData();
    } else {
        console.log('Mất kết nối mạng, làm việc offline...');
    }
}

// Đồng bộ dữ liệu
async function syncData() {
    if (syncInProgress) {
        console.log('Đang đồng bộ, bỏ qua...');
        return;
    }
    
    syncInProgress = true;
    console.log('Bắt đầu đồng bộ dữ liệu...');
    
    try {
        // Đồng bộ từ Firebase về IndexedDB
        await syncFromFirebase();
        
        // Đồng bộ từ IndexedDB lên Firebase (sync queue)
        await syncToFirebase();
        
        console.log('Đồng bộ hoàn tất');
    } catch (error) {
        console.error('Lỗi đồng bộ:', error);
    } finally {
        syncInProgress = false;
    }
}

async function syncFromFirebase() {
    console.log('🔄 Đồng bộ từ Firebase về IndexedDB...');
    
    try {
        await initFirebase();
        
        // Sync các stores theo thứ tự
        const storesToSync = ['hkds', 'categories', 'products', 'invoices'];
        
        for (const storeName of storesToSync) {
            console.log(`📥 Đang sync ${storeName} từ Firebase...`);
            await syncStoreFromFirebase(storeName);
        }
        
        console.log('✅ Đã đồng bộ xong từ Firebase');
        
        // Sau khi sync từ Firebase, cập nhật UI admin
        if (typeof window.loadDataAfterSync === 'function') {
            window.loadDataAfterSync();
        }
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
    }
}

async function syncStoreFromFirebase(storeName) {
    console.log(`📊 Đồng bộ store: ${storeName}`);
    
    try {
        await initFirebase();
        const allHKDs = await getAllFromStore(STORES.HKDS);
        
        for (const hkd of allHKDs) {
            if (hkd.role !== 'hkd') continue;
            
            const hkdId = hkd.id;
            
            if (storeName === 'hkds') {
                // Sync thông tin HKD
                await syncHKDInfoFromFirebase(hkdId);
                
            } else if (storeName === 'categories') {
                // Sync danh mục
                await syncCategoriesFromFirebase(hkdId);
                
            } else if (storeName === 'products') {
                // Sync hàng hóa
                await syncProductsFromFirebase(hkdId);
                
            } else if (storeName === 'invoices') {
                // Sync hóa đơn
                await syncInvoicesFromFirebase(hkdId);
            }
        }
        
        await updateLastSyncTime(storeName);
        console.log(`✅ Đã sync ${storeName} từ Firebase`);
        
    } catch (error) {
        console.error(`❌ Lỗi sync ${storeName} từ Firebase:`, error);
    }
}

// Hàm sync thông tin HKD
async function syncHKDInfoFromFirebase(hkdId) {
    try {
        const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
        const snapshot = await hkdRef.once('value');
        const hkdData = snapshot.val();
        
        if (hkdData) {
            // Kiểm tra xem có cần cập nhật không
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

// Hàm sync danh mục
async function syncCategoriesFromFirebase(hkdId) {
    try {
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (categoriesData) {
            for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                // Chỉ lấy danh mục (không lấy sản phẩm)
                if (categoryData && categoryData.name && !categoryData.msp) {
                    const localCategory = await getFromStore(STORES.CATEGORIES, categoryId);
                    
                    // Kiểm tra nếu danh mục đã bị xóa trên Firebase
                    if (categoryData._deleted === true) {
                        // Xóa khỏi IndexedDB
                        await deleteFromStore(STORES.CATEGORIES, categoryId);
                        console.log(`🗑️ Đã xóa danh mục ${categoryId} (từ Firebase)`);
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

// Trong syncProductsFromFirebase() - SỬA ĐỂ ĐỌC CẤU TRÚC MỚI
async function syncProductsFromFirebase(hkdId) {
    try {
        await initFirebase();
        
        const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
        const snapshot = await categoriesRef.once('value');
        const categoriesData = snapshot.val();
        
        if (!categoriesData) return;
        
        for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
            if (!categoryData || !categoryData.name) continue;
            
            // ĐỌC SẢN PHẨM TRONG products/ (cấu trúc mới)
            if (categoryData.products && typeof categoryData.products === 'object') {
                for (const [productId, productData] of Object.entries(categoryData.products)) {
                    if (!productData || !productData.name) continue;
                    
                    // Lưu với categoryId từ đường dẫn
                    await updateInStore(STORES.PRODUCTS, {
                        ...productData,
                        id: productId,
                        hkdId: hkdId,
                        categoryId: categoryId, // ← QUAN TRỌNG
                        _synced: true
                    });
                }
            }
        }
        
        console.log(`✅ Đã sync products từ Firebase (cấu trúc mới)`);
        
    } catch (error) {
        console.error('❌ Lỗi sync products:', error);
    }
}

// Hàm sync hóa đơn
async function syncInvoicesFromFirebase(hkdId) {
    try {
        const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
        const snapshot = await invoicesRef.once('value');
        const invoicesData = snapshot.val();
        
        if (invoicesData) {
            for (const [invoiceId, invoiceData] of Object.entries(invoicesData)) {
                const localInvoice = await getFromStore(STORES.INVOICES, invoiceId);
                
                // Kiểm tra nếu hóa đơn đã bị xóa trên Firebase
                if (invoiceData._deleted === true) {
                    // Xóa khỏi IndexedDB
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

async function syncItemToFirebase(item) {
    console.log('🔄 Đang sync item lên Firebase:', item.type, item.data?.id);
    
    if (!window.firebaseApp) {
        await initFirebase();
    }
    
    const { type, data } = item;
    
    if (!data || !data.id) {
        console.error('❌ Dữ liệu không hợp lệ:', data);
        return;
    }
    
    try {
        // Xác định hkdId
        let hkdId = data.hkdId || data.id;
        
        if (type === 'hkds' || type === 'hkds_delete') {
            hkdId = data.id;
        }
        
        if (!hkdId) {
            console.error('❌ Không tìm thấy hkdId:', data);
            throw new Error('Thiếu hkdId');
        }
        
        // Xử lý delete operations - ĐÁNH DẤU XÓA THAY VÌ XÓA THẬT
        if (type.endsWith('_delete')) {
            const baseType = type.replace('_delete', '');
            
            // Xác định đường dẫn
            let path = '';
            if (baseType === 'hkds') {
                path = `hkds/${hkdId}/info`;
            } else if (baseType === 'categories') {
                path = `hkds/${hkdId}/categories/${data.id}`;
            } else if (baseType === 'products') {
                if (!data.categoryId) {
                    throw new Error('Thiếu categoryId để xóa sản phẩm');
                }
                path = `hkds/${hkdId}/categories/${data.categoryId}/${data.id}`;
            } else if (baseType === 'invoices') {
                path = `hkds/${hkdId}/invoices/${data.id}`;
            }
            
            const dbRef = firebase.database().ref(path);
            
            // Thay vì xóa, đánh dấu là đã xóa (soft delete)
            await dbRef.update({
                _deleted: true,
                _deletedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
            
            console.log(`✅ Đã đánh dấu xóa ${baseType} trên Firebase`);
            return;
        }
        
        // Xử lý normal sync
        let path = '';
        
        switch(type) {
            case 'hkds':
                path = `hkds/${hkdId}/info`;
                break;
            case 'categories':
                path = `hkds/${hkdId}/categories/${data.id}`;
                break;
            case 'products':
                if (!data.categoryId) {
                    throw new Error('Thiếu categoryId cho sản phẩm');
                }
                path = `hkds/${hkdId}/categories/${data.categoryId}/${data.id}`;
                break;
            case 'invoices':
                path = `hkds/${hkdId}/invoices/${data.id}`;
                break;
            default:
                console.error('❌ Loại dữ liệu không xác định:', type);
                return;
        }
        
        const dbRef = firebase.database().ref(path);
        const firebaseData = {
            ...data,
            lastUpdated: new Date().toISOString(),
            _syncedAt: new Date().toISOString(),
            _deleted: false // Đảm bảo không bị đánh dấu xóa
        };
        
        await dbRef.set(firebaseData);
        console.log('✅ Đã sync thành công');
        
    } catch (error) {
        console.error('❌ Lỗi sync:', error);
        throw error;
    }
}

// Sửa hàm syncToFirebase để debug
async function syncToFirebase() {
    console.log('🔄 Bắt đầu sync TO Firebase...');
    
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
        
        console.log('✅ Đã hoàn tất sync TO Firebase');
    } catch (error) {
        console.error('❌ Lỗi tổng quát sync TO Firebase:', error);
    }
}

async function listenForRealtimeUpdates() {
    console.log('🎧 Bắt đầu lắng nghe realtime updates...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, không thể lắng nghe');
        return;
    }
    
    try {
        if (!window.firebaseApp) {
            console.log('🔥 Đang khởi tạo Firebase...');
            await initFirebase();
        }
        
        const allHKDs = await getAllHKDs();
        
        for (const hkd of allHKDs) {
            if (hkd.role !== 'hkd') continue;
            
            const hkdId = hkd.id;
            
            // Lắng nghe invoices của từng HKD
            const invoicesRef = firebase.database().ref(`hkds/${hkdId}/invoices`);
            
            console.log(`👂 Đang lắng nghe invoices của HKD: ${hkdId}...`);
            
            // Sửa hàm listenForRealtimeUpdates - THÊM DÒNG GỌI THÔNG BÁO
// Trong hàm child_added listener
invoicesRef.orderByChild('lastUpdated').limitToLast(20).on('child_added', async (snapshot) => {
    const newInvoice = snapshot.val();
    const invoiceId = snapshot.key;
    
    console.log(`📨 Nhận được invoice mới từ HKD ${hkdId}:`, invoiceId);
    
    if (!newInvoice || !invoiceId) {
        console.error('❌ Invoice không hợp lệ');
        return;
    }
    
    const existing = await getFromStore(STORES.INVOICES, invoiceId);
    
    if (!existing) {
        console.log(`➕ Thêm invoice mới: ${invoiceId}`);
        
        const invoiceToSave = {
            ...newInvoice,
            id: invoiceId,
            hkdId: hkdId,
            _synced: true
        };
        
        await updateInStore(STORES.INVOICES, invoiceToSave);
        
        // 1. Thông báo
        if (typeof addNewInvoiceNotification === 'function') {
            addNewInvoiceNotification(invoiceToSave);
        }
        
        // 2. GỌI LOAD LẠI TOÀN BỘ DATA - ĐƠN GIẢN NHẤT!
        console.log('🔄 Triggering full data reload...');
        
        if (typeof window.loadInitialData === 'function') {
            // Load lại nhưng không hiển thị loading (trải nghiệm mượt hơn)
            setTimeout(async () => {
                try {
                    await window.loadInitialData();
                    console.log('✅ Full data reload completed');
                } catch (error) {
                    console.error('❌ Error reloading data:', error);
                }
            }, 500);
        }
        // Sau khi lưu invoice vào IndexedDB
if (typeof window.handleNewInvoiceSimple === 'function') {
    window.handleNewInvoiceSimple(invoiceToSave);
}
        console.log(`✅ Đã xử lý invoice: ${invoiceId}`);
    }
});
        }
        
        console.log('✅ Đã bật realtime listener thành công');
        
    } catch (error) {
        console.error('❌ Lỗi khi lắng nghe:', error);
    }
}

// Thay thế hàm showNewInvoiceNotification
function showNewInvoiceNotification(invoice) {
    // 1. Phát âm thanh thông báo
    playNotificationSound();
    
    // 2. Hiển thị toast notification
    showToastNotification(invoice);
    
    // 3. Hiển thị browser notification (nếu được cho phép)
    showBrowserNotification(invoice);
}

// ĐÂY LÀ PHIÊN BẢN ĐÃ TEST VÀ HOẠT ĐỘNG TỐT
let audioContext = null;

function playNotificationSound() {
    try {
        // Kiểm tra browser support
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.log('Web Audio API not supported');
            return;
        }
        
        // Khởi tạo audio context nếu chưa có
        if (!audioContext) {
            audioContext = new AudioContext();
        }
        
        // Nếu context bị suspended, resume nó
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed');
                createAndPlaySound();
            }).catch(err => {
                console.log('Failed to resume AudioContext:', err);
                // Thử phát âm thanh đơn giản hơn
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
    
    // Tạo oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Cài đặt âm thanh
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    // Phát và dừng
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Dọn dẹp
    setTimeout(() => {
        oscillator.disconnect();
        gainNode.disconnect();
    }, 600);
}

function playSimpleBeepFallback() {
    try {
        // Fallback cực kỳ đơn giản
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
    // Tạo toast element
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
                <button onclick="viewInvoiceDetails('${invoice.id}'); document.getElementById('${toastId}').remove()" style="
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
    
    // Thêm vào body
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    
    // Tự động xóa sau 8 giây
    setTimeout(() => {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
    
    // Thêm CSS animation
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
            icon: '/assets/notification-icon.png', // Thay bằng icon của bạn
            tag: 'new-invoice',
            silent: false // Cho phép âm thanh hệ thống
        });
        
        notification.onclick = function() {
            window.focus();
            viewInvoiceDetails(invoice.id);
            notification.close();
        };
        
        // Tự động đóng sau 10 giây
        setTimeout(() => notification.close(), 10000);
    }
}

// Force sync ngay lập tức
function forceSync() {
    if (syncInProgress) {
        return Promise.resolve();
    }
    return syncData();
}

// Dừng sync manager
function stopSyncManager() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    window.removeEventListener('online', handleConnectionChange);
    window.removeEventListener('offline', handleConnectionChange);
    
    console.log('Đã dừng sync manager');
}

// Xuất các hàm
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSyncManager,
        syncData,
        forceSync,
        listenForRealtimeUpdates,
        stopSyncManager
    };
}