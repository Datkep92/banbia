// system-init.js - Khởi tạo hệ thống đơn giản

// Kiểm tra nếu biến đã tồn tại
if (typeof window.systemInitialized === 'undefined') {
    window.systemInitialized = false;
}

async function initSystem() {
    if (window.systemInitialized) {
        console.log('✅ Hệ thống đã được khởi tạo trước đó');
        return true;
    }
    
    //console.log('🔄 Khởi tạo hệ thống...');
    
    try {
        // 1. Khởi tạo IndexedDB
        //console.log('📦 Khởi tạo IndexedDB...');
        await initIndexedDB();
        
        // 2. Khởi tạo Firebase
        //console.log('🔥 Khởi tạo Firebase...');
        await initFirebase();
        
        // 3. Khởi tạo Authentication
        //console.log('🔐 Khởi tạo Authentication...');
        await initAuth();
        
        // 4. Khởi tạo Sync Manager
        //console.log('🔄 Khởi tạo Sync Manager...');
        initSyncManager();
        // 5. KHỞI TẠO NOTIFICATION MANAGER (THÊM DÒNG NÀY)
        console.log('🔔 Khởi tạo Notification Manager...');
        if (typeof initNotificationManager === 'function') {
            initNotificationManager();
        }
        window.systemInitialized = true;
        //console.log('✅ Hệ thống khởi tạo thành công!');
        
        return true;
    } catch (error) {
        console.error('❌ Lỗi khởi tạo hệ thống:', error);
        throw error;
    }
}

async function waitForSystem() {
    return await initSystem();
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ Đã được phép hiển thị thông báo');
            }
        });
    }
}

// Export to window (chỉ nếu chưa tồn tại)
if (typeof window.initSystem === 'undefined') {
    window.initSystem = initSystem;
    window.waitForSystem = waitForSystem;
    window.isSystemInitialized = () => window.systemInitialized;
    window.requestNotificationPermission = requestNotificationPermission;
}

console.log('✅ init.js loaded successfully');