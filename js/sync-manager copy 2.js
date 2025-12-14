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

// Sửa hàm syncFromFirebase
async function syncFromFirebase() {
  
    
    try {
        await initFirebase();
        
        // Chỉ sync các stores cần thiết
        const storesToSync = ['hkds', 'products', 'categories', 'invoices'];
        
        for (const storeName of storesToSync) {
            await syncStoreFromFirebase(storeName);
        }
    } catch (error) {
        console.error('Lỗi đồng bộ từ Firebase:', error);
        // Không throw error, chỉ log
    }
}

async function syncStoreFromFirebase(storeName) {
    const lastSync = await getLastSyncTime(storeName);
    const allHKDs = await getAllFromStore(STORES.HKDS);
    
    try {
        await initFirebase();
        
        for (const hkd of allHKDs) {
            if (hkd.role !== 'hkd') continue;
            
            const hkdId = hkd.id;
            
            if (storeName === 'hkds') {
                // Sync thông tin HKD
                const hkdRef = firebase.database().ref(`hkds/${hkdId}/info`);
                const snapshot = await hkdRef.once('value');
                const hkdData = snapshot.val();
                
                if (hkdData) {
                    await updateInStore(STORES.HKDS, {
                        ...hkdData,
                        id: hkdId
                    });
                }
                
            } else if (storeName === 'categories') {
                // Sync danh mục
                const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
                const snapshot = await categoriesRef.once('value');
                const categoriesData = snapshot.val();
                
                if (categoriesData) {
                    for (const [categoryId, categoryData] of Object.entries(categoriesData)) {
                        // Kiểm tra xem có phải là danh mục hay không (tránh lấy nhầm sản phẩm)
                        if (categoryData && categoryData.name && !categoryData.msp) {
                            await updateInStore(STORES.CATEGORIES, {
                                ...categoryData,
                                id: categoryId,
                                hkdId: hkdId
                            });
                        }
                    }
                }
                
            } else if (storeName === 'products') {
                // Sync sản phẩm - cần duyệt qua từng danh mục
                const categoriesRef = firebase.database().ref(`hkds/${hkdId}/categories`);
                const snapshot = await categoriesRef.once('value');
                const categoriesData = snapshot.val();
                
                if (categoriesData) {
                    for (const [categoryId, categoryOrProducts] of Object.entries(categoriesData)) {
                        // Duyệt qua tất cả các item trong danh mục
                        for (const [itemId, itemData] of Object.entries(categoryOrProducts)) {
                            // Nếu item có msp => đây là sản phẩm
                            if (itemData && itemData.msp) {
                                await updateInStore(STORES.PRODUCTS, {
                                    ...itemData,
                                    id: itemId,
                                    hkdId: hkdId,
                                    categoryId: categoryId
                                });
                            }
                        }
                    }
                }
            }
        }
        
        await updateLastSyncTime(storeName);
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ từ Firebase:', error);
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
        
        // Đối với HKD, hkdId chính là data.id
        if (type === 'hkds' || type === 'hkds_delete') {
            hkdId = data.id;
        }
        
        if (!hkdId) {
            console.error('❌ Không tìm thấy hkdId:', data);
            throw new Error('Thiếu hkdId');
        }
        
        // Tạo đường dẫn Firebase
        let path = '';
        
        switch(type) {
            case 'hkds':
                // HKD lưu ở: hkds/HKD_id/info
                path = `hkds/${hkdId}/info`;
                break;
                
            case 'categories':
                // Danh mục lưu ở: hkds/HKD_id/categories/category_id
                path = `hkds/${hkdId}/categories/${data.id}`;
                break;
                
            case 'products':
                // Sản phẩm lưu ở: hkds/HKD_id/categories/category_id/product_id
                if (!data.categoryId) {
                    console.error('❌ Thiếu categoryId cho sản phẩm:', data);
                    throw new Error('Thiếu categoryId');
                }
                path = `hkds/${hkdId}/categories/${data.categoryId}/${data.id}`;
                break;
                
            case 'hkds_delete':
                // Xóa toàn bộ HKD
                path = `hkds/${hkdId}`;
                break;
                
            case 'categories_delete':
                // Xóa toàn bộ danh mục (và tất cả sản phẩm trong đó)
                path = `hkds/${hkdId}/categories/${data.id}`;
                break;
                
            case 'products_delete':
                // Xóa sản phẩm trong danh mục
                if (!data.categoryId) {
                    console.error('❌ Thiếu categoryId để xóa sản phẩm:', data);
                    throw new Error('Thiếu categoryId');
                }
                path = `hkds/${hkdId}/categories/${data.categoryId}/${data.id}`;
                break;
                
            case 'invoices':
                // Hóa đơn lưu ở: hkds/HKD_id/invoices/invoice_id
                path = `hkds/${hkdId}/invoices/${data.id}`;
                break;
                
            default:
                console.error('❌ Loại dữ liệu không xác định:', type);
                return;
        }
        
        console.log(`📤 Firebase path: ${path}`);
        
        // Xử lý delete operations
        if (type.endsWith('_delete')) {
            const dbRef = firebase.database().ref(path);
            console.log(`🗑️ Xóa trên Firebase: ${path}`);
            await dbRef.remove();
            console.log(`✅ Đã xóa thành công`);
            return;
        }
        
        // Xử lý normal sync
        const dbRef = firebase.database().ref(path);
        const firebaseData = {
            ...data,
            lastUpdated: new Date().toISOString(),
            _syncedAt: new Date().toISOString()
        };
        
        // Lưu dữ liệu
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
async function loadAllHKDInfo() {
    // Giả sử store HKD được gọi là 'hkds' trong IndexedDB của bạn
    // Cần phải có hàm getAllFromStore(storeName) để truy cập IndexedDB
    if (typeof window.getAllFromStore === 'function') {
        return window.getAllFromStore('hkds');
    }
    
    // Nếu không có hàm getAllFromStore, bạn cần implement cách tải HKD.
    console.error('❌ Hàm getAllFromStore không được định nghĩa.');
    return [];
}
let realtimeListeners = {}; // Dùng để quản lý các listener

/**
 * Lắng nghe cập nhật real-time từ Firebase cho tất cả các HKD và Stores quan trọng.
 * Điều này đảm bảo IndexedDB luôn đồng bộ với Firebase, đặc biệt cho thao tác xóa.
 */
async function listenForRealtimeUpdates() {
    // Chỉ chạy nếu Firebase đã được init
    if (!window.firebaseApp) {
        await initFirebase();
    }
    
    // Xóa các listener cũ để tránh trùng lặp
    for (const key in realtimeListeners) {
        firebase.database().ref(key).off();
    }
    realtimeListeners = {};
    
    // Các store cần lắng nghe (cả products, categories, và invoices)
    const storesToListen = ['invoices', 'products', 'categories']; 
    
    try {
        const allHKDs = await loadAllHKDInfo(); // Giả sử bạn có hàm này để lấy danh sách HKD
        
        for (const hkd of allHKDs) {
            if (hkd.role !== 'hkd') continue;
            const hkdId = hkd.id;
            
            for (const storeName of storesToListen) {
                const path = `hkds/${hkdId}/${storeName}`;
                const dbRef = firebase.database().ref(path);
                
                realtimeListeners[path] = dbRef;
                
                console.log(`👂 Đang lắng nghe ${storeName} của HKD: ${hkdId}...`);
                
                // --- 1. Xử lý THÊM MỚI (child_added)
                dbRef.on('child_added', async (snapshot) => {
                    const newItem = snapshot.val();
                    const itemId = snapshot.key;
                    // Lọc những item mới hơn lần đồng bộ cuối cùng của store đó (hoặc luôn cập nhật)
                    if (newItem && itemId) {
                        const itemToSave = { 
                            ...newItem, 
                            id: itemId, 
                            hkdId: hkdId, 
                            _synced: true // Đánh dấu đã sync
                        };
                        if (typeof window.updateInStore === 'function') {
                            await window.updateInStore(storeName, itemToSave); 
                            console.log(`✅ Real-time ADD/UPDATE ${storeName}: ${itemId}`);
                            
                            // (Tùy chọn) Hiển thị thông báo hoặc refresh UI nếu cần
                            if (storeName === 'invoices') {
                                showBrowserNotification(itemToSave);
                            }
                            if (typeof window.loadInitialData === 'function') {
                                // Tải lại data để cập nhật UI, nên debounce/throttle nếu có quá nhiều update
                                window.loadInitialData();
                            }
                        }
                    }
                });
                
                // --- 2. Xử lý SỬA ĐỔI (child_changed)
                // Hầu hết logic sẽ được xử lý bởi child_added vì nó kích hoạt khi update
                // Nếu bạn muốn phân biệt rõ ràng, bạn có thể thêm logic ở đây,
                // nhưng thường child_added/changed có thể dùng chung logic updateInStore.

                // --- 3. Xử lý XÓA (child_removed) - RẤT QUAN TRỌNG
                dbRef.on('child_removed', async (snapshot) => {
                    const removedId = snapshot.key;
                    console.log(`🗑️ Item ${storeName} bị xóa real-time: ${removedId}`);
                    
                    if (removedId && typeof window.deleteFromStore === 'function') {
                        // Xóa khỏi IndexedDB
                        await window.deleteFromStore(storeName, removedId); 
                        
                        // Cập nhật lại UI sau khi xóa local
                        if (typeof window.loadInitialData === 'function') {
                            // Cần tải lại data để UI không còn mục đã xóa
                            window.loadInitialData(); 
                        }
                    }
                });
            }
        }
        
        console.log('✅ Đã bật realtime listener thành công');
        
    } catch (error) {
        console.error('❌ Lỗi khi lắng nghe real-time:', error);
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