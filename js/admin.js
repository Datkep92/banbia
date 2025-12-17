// Admin module - Quản lý HKD, sản phẩm, hóa đơn
let currentAdminView = 'dashboard';
let selectedHKD = null;
let allHKDs = [];
let allInvoices = [];

async function syncall() {
    try {
        // 1. Tải CSS trước
        loadDashboardStyles();

        // 2. Khởi tạo hệ thống
        await initSystem();
        
        // 3. Kiểm tra quyền admin
        const user = getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = 'login.html?type=admin';
            return;
        }

        // 4. KIỂM TRA NẾU LÀ MÁY MỚI (chưa có dữ liệu)
        const isNewDevice = await checkIfNewDevice();
        
        if (isNewDevice && navigator.onLine) {
            console.log('🆕 MÁY MỚI: Tải toàn bộ dữ liệu HKD và HÓA ĐƠN...');
            Utils.showLoading('Đang tải dữ liệu lần đầu...');
            await initialFullSyncForNewDevice();
            Utils.hideLoading();
        }

        // 5. ĐỒNG BỘ DỮ LIỆU QUAN TRỌNG (HKD + HÓA ĐƠN)
        if (navigator.onLine) {
            console.log('🔄 Đồng bộ dữ liệu quan trọng...');
            await syncEssentialData();
        }

        // 6. BẬT REALTIME LISTENER CHO HÓA ĐƠN
        listenForInvoiceRealtimeUpdates();
// 6. BẬT REALTIME LISTENER CHO CẢ HKD VÀ HÓA ĐƠN
        listenForRealtimeUpdates();
        // 7. TẢI DỮ LIỆU LOCAL LÊN UI
        await loadEssentialData();

        // 8. Setup event listeners
        setupEventListeners();

        // 9. Thêm nút sync vào header
        createSyncButton();

        // 10. Hiển thị dashboard
        showDashboard();

        // 11. Yêu cầu quyền thông báo
        requestNotificationPermission();

        // 12. KIỂM TRA ĐỒNG BỘ KHI CHUYỂN THIẾT BỊ
        setupDeviceSyncCheck();

        console.log('✅ Trang Admin đã sẵn sàng - Chế độ Realtime');

    } catch (error) {
        console.error('❌ Lỗi khởi tạo trang Admin:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}

/**
 * Kiểm tra nếu đây là máy mới (chưa có dữ liệu HKD)
 */
async function checkIfNewDevice() {
    try {
        const allHKDs = await getAllHKDs();
        const hkdCount = allHKDs.filter(hkd => hkd.role === 'hkd').length;
        
        console.log(`📊 Thiết bị hiện có: ${hkdCount} HKD`);
        
        // Nếu có ít nhất 1 HKD → không phải máy mới
        return hkdCount === 0;
        
    } catch (error) {
        console.error('❌ Lỗi kiểm tra thiết bị:', error);
        return true; // Coi như máy mới nếu có lỗi
    }
}

/**
 * Tải toàn bộ dữ liệu HKD và Hóa đơn cho máy mới
 */
async function initialFullSyncForNewDevice() {
    try {
        await initFirebase();
        
        // 1. LẤY TẤT CẢ HKD TỪ FIREBASE
        const hkdsRef = firebase.database().ref('hkds');
        const hkdsSnapshot = await hkdsRef.once('value');
        const allHKDsFromFirebase = hkdsSnapshot.val() || {};
        
        console.log(`📥 Tìm thấy ${Object.keys(allHKDsFromFirebase).length} HKD trên Firebase`);
        
        let totalHKDs = 0;
        let totalInvoices = 0;
        
        // 2. XỬ LÝ TỪNG HKD
        for (const [hkdId, hkdData] of Object.entries(allHKDsFromFirebase)) {
            if (!hkdData || !hkdData.info) continue;
            
            // LƯU THÔNG TIN HKD
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
            
            // 3. LƯU HÓA ĐƠN CỦA HKD NÀY
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
        
        // 4. LƯU THỜI ĐIỂM SYNC
        await updateLastSyncTime('initial_sync', new Date().toISOString());
        
        // 5. LƯU VÀO LOCALSTORAGE ĐỂ THEO DÕI
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

/**
 * Đồng bộ dữ liệu quan trọng (HKD + Hóa đơn)
 */
async function syncEssentialData() {
    console.log('🔁 Bắt đầu đồng bộ dữ liệu quan trọng...');
    
    try {
        await initFirebase();
        
        // 1. LẤY DỮ LIỆU LOCAL
        const allLocalHKDs = await getAllHKDs();
        const localHKDIds = allLocalHKDs.map(h => h.id);
        
        // 2. LẤY DỮ LIỆU TỪ FIREBASE
        const hkdsRef = firebase.database().ref('hkds');
        const hkdsSnapshot = await hkdsRef.once('value');
        const firebaseHKDs = hkdsSnapshot.val() || {};
        
        let newHKDs = 0;
        let updatedInvoices = 0;
        
        // 3. XỬ LÝ TỪNG HKD TỪ FIREBASE
        for (const [hkdId, hkdData] of Object.entries(firebaseHKDs)) {
            if (!hkdData || !hkdData.info) continue;
            
            // KIỂM TRA NẾU HKD MỚI
            if (!localHKDIds.includes(hkdId)) {
                // THÊM HKD MỚI
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
            
            // 4. ĐỒNG BỘ HÓA ĐƠN CỦA HKD NÀY
            if (hkdData.invoices) {
                const invoiceUpdates = await syncInvoicesForHKD(hkdId, hkdData.invoices);
                updatedInvoices += invoiceUpdates;
            }
        }
        
       
        
        // 6. CẬP NHẬT THỜI GIAN SYNC
        localStorage.setItem('last_essential_sync', new Date().toISOString());
        
        console.log(`✅ ĐÃ ĐỒNG BỘ: ${newHKDs} HKD mới, ${updatedInvoices} hóa đơn cập nhật`);
        
        if (newHKDs > 0 || updatedInvoices > 0) {
            // CẬP NHẬT UI NẾU CÓ DỮ LIỆU MỚI
            await loadEssentialData();
            
            if (currentAdminView === 'dashboard') {
                updateDashboardStats();
                displayRecentInvoices();
            }
        }
        
    } catch (error) {
        console.error('❌ Lỗi đồng bộ dữ liệu quan trọng:', error);
    }
}

/**
 * Đồng bộ hóa đơn cho một HKD cụ thể
 */
async function syncInvoicesForHKD(hkdId, firebaseInvoices) {
    let updatedCount = 0;
    
    try {
        // LẤY HÓA ĐƠN LOCAL CỦA HKD NÀY
        const localInvoices = await getInvoicesByHKD(hkdId);
        const localInvoiceIds = localInvoices.map(inv => inv.id);
        
        // XỬ LÝ TỪNG HÓA ĐƠN TỪ FIREBASE
        for (const [invoiceId, invoiceData] of Object.entries(firebaseInvoices || {})) {
            if (!invoiceData || invoiceData._deleted === true) continue;
            
            // KIỂM TRA NẾU HÓA ĐƠN MỚI HOẶC CẦN CẬP NHẬT
            const localInvoice = localInvoices.find(inv => inv.id === invoiceId);
            const firebaseUpdated = new Date(invoiceData.lastUpdated || 0);
            const localUpdated = new Date(localInvoice?.lastUpdated || 0);
            
            if (!localInvoice || firebaseUpdated > localUpdated) {
                // LƯU HOẶC CẬP NHẬT HÓA ĐƠN
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

/**
 * Tải dữ liệu quan trọng (HKD + Hóa đơn) lên UI
 */
async function loadEssentialData() {
    console.log('📂 Đang tải dữ liệu quan trọng lên UI...');
    
    try {
        // 1. TẢI DANH SÁCH HKD
        allHKDs = await getAllHKDs();
        allHKDs = allHKDs.filter(hkd => hkd.role === 'hkd');
        
        console.log(`📊 Có ${allHKDs.length} HKD`);
        
        // 2. TẢI TẤT CẢ HÓA ĐƠN
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
        
        // SẮP XẾP HÓA ĐƠN MỚI NHẤT TRƯỚC
        allInvoices.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
        });
        
        console.log(`📊 Có ${allInvoices.length} hóa đơn`);
        
        // 3. CẬP NHẬT DROPDOWN HKD
        updateHKDSelects();
        
    } catch (error) {
        console.error('❌ Lỗi tải dữ liệu quan trọng:', error);
        allHKDs = [];
        allInvoices = [];
    }
}

/**
 * Bật realtime listener cho hóa đơn mới
 */
function listenForInvoiceRealtimeUpdates() {
    console.log('👂 Bật realtime listener cho hóa đơn...');
    
    if (!navigator.onLine) {
        console.log('📴 Đang offline, không thể bật realtime');
        return;
    }
    
    try {
        // SỬ DỤNG HÀM ĐÃ CÓ TỪ sync-manager.js
        if (typeof window.listenForRealtimeUpdates === 'function') {
            window.listenForRealtimeUpdates();
            console.log('✅ Đã bật realtime listener');
        } else {
            console.log('⚠️ Không tìm thấy hàm listenForRealtimeUpdates');
        }
        
    } catch (error) {
        console.error('❌ Lỗi bật realtime listener:', error);
    }
}

/**
 * Thiết lập kiểm tra đồng bộ khi chuyển thiết bị
 */
function setupDeviceSyncCheck() {
    console.log('📱 Thiết lập kiểm tra đồng bộ thiết bị...');
    
    // 1. KIỂM TRA KHI APP TRỞ LẠI FOREGROUND
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden && navigator.onLine) {
            console.log('🔄 App trở lại foreground, kiểm tra đồng bộ...');
            
            // Kiểm tra thời gian từ lần sync cuối
            const lastSync = localStorage.getItem('last_essential_sync');
            const now = new Date();
            
            if (!lastSync || (now - new Date(lastSync)) > 2 * 60 * 1000) { // 2 phút
                console.log('⏰ Đã 2 phút chưa sync, đồng bộ lại...');
                await syncEssentialData();
            }
        }
    });
    
    // 2. KIỂM TRA KHI CÓ KẾT NỐI MẠNG
    window.addEventListener('online', async () => {
        console.log('🌐 Đã kết nối mạng, đồng bộ dữ liệu...');
        setTimeout(async () => {
            await syncEssentialData();
        }, 3000); // Đợi 3 giây cho kết nối ổn định
    });
    
    // 3. ĐỒNG BỘ ĐỊNH KỲ MỖI 5 PHÚT
    setInterval(async () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
            console.log('⏰ Đồng bộ định kỳ (5 phút)...');
            await syncEssentialData();
        }
    }, 5 * 60 * 1000); // 5 phút
    
    console.log('✅ Đã thiết lập kiểm tra đồng bộ thiết bị');
}

async function handleNewInvoiceFromRealtime(invoiceData) {
    try {
        console.log('📨 Nhận được hóa đơn mới từ realtime:', invoiceData.id);
        
        // 1. KIỂM TRA ĐÃ CÓ TRONG LOCAL CHƯA
        const existing = await getFromStore(STORES.INVOICES, invoiceData.id);
        if (existing) {
            console.log('⚠️ Hóa đơn đã tồn tại, bỏ qua');
            return;
        }
        
        // 2. LƯU VÀO INDEXEDDB
        await updateInStore(STORES.INVOICES, {
            ...invoiceData,
            _synced: true
        });
        
        // 3. KIỂM TRA NẾU HKD CỦA HÓA ĐƠN NÀY CHƯA CÓ TRONG LOCAL
        const hkdExists = allHKDs.find(h => h.id === invoiceData.hkdId);
        if (!hkdExists) {
            console.log(`🔍 HKD ${invoiceData.hkdId} chưa có trong local, đang tải...`);
            await loadHKDInfoFromFirebase(invoiceData.hkdId);
        }
        
        // 4. THÊM VÀO DANH SÁCH LOCAL
        if (!allInvoices.find(inv => inv.id === invoiceData.id)) {
            allInvoices.unshift(invoiceData);
        }
        
        // 5. CẬP NHẬT UI NGAY LẬP TỨC
        if (currentAdminView === 'dashboard') {
            updateDashboardStats();
            displayRecentInvoices();
            
            // HIỂN THỊ THÔNG BÁO
            showNewInvoiceNotification(invoiceData);
        }
        
        console.log('✅ Đã xử lý hóa đơn mới từ realtime');
        
    } catch (error) {
        console.error('❌ Lỗi xử lý hóa đơn realtime:', error);
    }
}

/**
 * Tải thông tin HKD từ Firebase nếu chưa có
 */
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
            
            // THÊM VÀO DANH SÁCH LOCAL
            if (!allHKDs.find(h => h.id === hkdId)) {
                allHKDs.push(newHKD);
            }
            
            console.log(`✅ Đã tải HKD ${hkdData.name} từ Firebase`);
            
            // CẬP NHẬT UI
            updateHKDSelects();
            
            if (currentAdminView === 'hkds') {
                updateHKDList();
            }
        }
        
    } catch (error) {
        console.error(`❌ Lỗi tải HKD ${hkdId} từ Firebase:`, error);
    }
}
// Tạo nút sync và gắn vào header
function createSyncButton() {
    // Kiểm tra nếu đã có nút sync rồi thì không tạo lại
    if (document.getElementById('adminSyncButton')) {
        return;
    }
    
    // Tạo nút sync
    const syncButton = document.createElement('button');
    syncButton.id = 'adminSyncButton';
    syncButton.className = 'btn-sync-admin';
    syncButton.innerHTML = `
        <i class="fas fa-sync-alt"></i>
        <span class="sync-text">Đồng bộ</span>
    `;
    syncButton.title = 'Đồng bộ dữ liệu';
    
    // Thêm event listener
    syncButton.addEventListener('click', async () => {
        try {
            // Đổi icon để hiển thị đang loading
            syncButton.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span class="sync-text">Đang đồng bộ...</span>
            `;
            syncButton.disabled = true;
            
            // Gọi hàm syncall
            await syncall();
            
            // Trở lại trạng thái ban đầu
            syncButton.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                <span class="sync-text">Đồng bộ</span>
            `;
            syncButton.disabled = false;
            
            // Hiệu ứng thành công
            syncButton.classList.add('sync-success');
            setTimeout(() => {
                syncButton.classList.remove('sync-success');
            }, 2000);
            
        } catch (error) {
            console.error('❌ Lỗi khi đồng bộ:', error);
            
            // Hiển thị lỗi
            syncButton.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <span class="sync-text">Lỗi</span>
            `;
            syncButton.classList.add('sync-error');
            
            // Sau 2 giây reset lại
            setTimeout(() => {
                syncButton.innerHTML = `
                    <i class="fas fa-sync-alt"></i>
                    <span class="sync-text">Đồng bộ</span>
                `;
                syncButton.classList.remove('sync-error');
                syncButton.disabled = false;
            }, 2000);
        }
    });
    
    // Tìm header và chèn nút vào
    const header = document.querySelector('.main-header');
    if (header) {
        header.appendChild(syncButton);
        console.log('✅ Đã thêm nút sync vào header');
    } else {
        // Fallback: chèn vào body
        const userActions = document.querySelector('.user-actions') || 
                           document.querySelector('.header-right');
        if (userActions) {
            userActions.prepend(syncButton);
        } else {
            document.body.prepend(syncButton);
        }
    }
    
    // Thêm CSS cho nút
    addSyncButtonStyles();
// THÊM SỰ KIỆN CLICK MỚI
    syncButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        await handleSmartSync();
    });
    
    // THÊM HÀM SMART SYNC
    window.handleSmartSync = async () => {
        try {
            // Đổi icon để hiển thị đang loading
            syncButton.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span class="sync-text">Đang đồng bộ...</span>
            `;
            syncButton.disabled = true;
            syncButton.classList.add('syncing');
            
            // GỌI HÀM SYNC THÔNG MINH
            await syncEssentialData();
            
            // Trở lại trạng thái ban đầu
            syncButton.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                <span class="sync-text">Đồng bộ</span>
            `;
            syncButton.disabled = false;
            syncButton.classList.remove('syncing');
            
            // Hiệu ứng thành công
            syncButton.classList.add('sync-success');
            setTimeout(() => {
                syncButton.classList.remove('sync-success');
            }, 2000);
            
            Utils.showToast('Đã đồng bộ dữ liệu thành công', 'success');
            
        } catch (error) {
            console.error('❌ Lỗi khi đồng bộ:', error);
            
            // Hiển thị lỗi
            syncButton.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <span class="sync-text">Lỗi</span>
            `;
            syncButton.classList.add('sync-error');
            syncButton.classList.remove('syncing');
            
            // Sau 2 giây reset lại
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
    };
}

// Thêm CSS cho nút sync (phiên bản đơn giản)
function addSyncButtonStyles() {
    if (document.getElementById('sync-button-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sync-button-styles';
    style.textContent = `
        /* Nút đồng bộ trong header - Phiên bản đơn giản */
        .btn-sync-admin {
            background: rgba(255, 255, 255, 0.1); /* Nền trong suốt */
            color: #4a6ee0; /* Màu chữ chính */
            border: 1px solid rgba(74, 110, 224, 0.3); /* Viền nhẹ */
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px); /* Hiệu ứng blur nền */
            margin-left: 8px;
        }
        
        .btn-sync-admin:hover {
            background: rgba(74, 110, 224, 0.1); /* Nền nhẹ khi hover */
            border-color: rgba(74, 110, 224, 0.5);
            transform: translateY(-1px);
        }
        
        .btn-sync-admin:active {
            transform: translateY(0);
            background: rgba(74, 110, 224, 0.15);
        }
        
        .btn-sync-admin:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }
        
        .btn-sync-admin .sync-text {
            font-size: 13px;
        }
        
        /* Trạng thái đang đồng bộ */
        .btn-sync-admin.syncing {
            color: #f59e0b; /* Màu vàng cam */
            border-color: rgba(245, 158, 11, 0.3);
            background: rgba(245, 158, 11, 0.1);
        }
        
        /* Hiệu ứng thành công */
        .btn-sync-admin.sync-success {
            color: #10b981; /* Màu xanh lá */
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.1);
        }
        
        /* Hiệu ứng lỗi */
        .btn-sync-admin.sync-error {
            color: #ef4444; /* Màu đỏ */
            border-color: rgba(239, 68, 68, 0.3);
            background: rgba(239, 68, 68, 0.1);
        }
        
        /* Animation xoay */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .fa-spinner {
            animation: spin 1s linear infinite;
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .btn-sync-admin {
                background: rgba(255, 255, 255, 0.05);
                color: #7b9bff; /* Màu sáng hơn cho dark mode */
                border-color: rgba(123, 155, 255, 0.2);
            }
            
            .btn-sync-admin:hover {
                background: rgba(123, 155, 255, 0.1);
                border-color: rgba(123, 155, 255, 0.4);
            }
            
            .btn-sync-admin:active {
                background: rgba(123, 155, 255, 0.15);
            }
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .btn-sync-admin {
                padding: 5px 8px;
                font-size: 12px;
            }
            
            .btn-sync-admin .sync-text {
                display: none; /* Ẩn text trên mobile */
            }
        }
    `;
    
    document.head.appendChild(style);
}



async function initAdminPage() {
    try {
         // KIỂM TRA VÀ SYNC NẾU DỮ LIỆU TRỐNG
    // THÊM: ĐỒNG BỘ DỮ LIỆU SAU KHI KHỞI TẠO
    setTimeout(async () => {
        // Kiểm tra nếu dữ liệu trống
        const allHKDs = await getAllHKDs();
        const allProducts = await getAllFromStore(STORES.PRODUCTS);
        
        if ((allHKDs.length === 0 || allProducts.length === 0) && navigator.onLine) {
            console.log('📭 Admin: Dữ liệu trống, thực hiện auto sync...');
            
            if (typeof syncAllDataForAdmin === 'function') {
                Utils.showLoading('Đang tải dữ liệu từ server...');
                await syncAllDataForAdmin();
                await loadEssentialData();
                Utils.hideLoading();
            }
        }
    }, 2000);
        // TẢI CSS TRƯỚC KHI KHỞI TẠO
        loadDashboardStyles();
        // Khởi tạo toàn bộ hệ thống
        await initSystem();
        
        // Kiểm tra quyền admin
        const user = getCurrentUser();
        if (!user || user.role !== 'admin') {
            window.location.href = 'login.html?type=admin';
            return;
        }
        
        // Lắng nghe realtime updates
        listenForRealtimeUpdates();
        
        // Tải dữ liệu ban đầu
        await loadEssentialData();
        
        // Setup event listeners
        setupEventListeners();
        // Sau khi setup event listeners
        setupEventListeners();
        
        // Thêm nút sync vào header
        createSyncButton();
        // Hiển thị thông tin admin
        //displayAdminInfo();
        
        // Hiển thị dashboard mặc định
        showDashboard();
        
        // Yêu cầu quyền thông báo
        requestNotificationPermission();
        
        console.log('Admin page initialized');
    } catch (error) {
        console.error('Lỗi khởi tạo admin page:', error);
        Utils.showToast('Lỗi khởi tạo hệ thống', 'error');
    }
}



// Tải dữ liệu ban đầu
async function loadInitialData() {
    Utils.showLoading('Đang tải dữ liệu...');
    
    try {
        // Tải danh sách HKD
        allHKDs = await getAllHKDs();
        allHKDs = allHKDs.filter(hkd => hkd.role === 'hkd');
        
        // Tải hóa đơn
        await loadAllInvoices();
        
        // Cập nhật UI
        updateHKDList();
        updateDashboardStats();
        
    } catch (error) {
        console.error('Lỗi tải dữ liệu:', error);
        Utils.showToast('Lỗi tải dữ liệu', 'error');
    } finally {
        Utils.hideLoading();
    }
}
async function saveHKD() {
    const saveButton = document.getElementById('saveHKD');
    if (saveButton.disabled) {
        return;
    }
    
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
        
        // 3. Tạo HKD data
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
            _synced: false // Chưa sync lên Firebase
        };
        
        // CÁCH 1: Sử dụng trực tiếp IndexedDB API (BỎ QUA HÀM updateInStore)
        const db = await getDB();
        
        const tx = db.transaction([STORES.HKDS], 'readwrite');
        const store = tx.objectStore(STORES.HKDS);
        
        // Kiểm tra xem số điện thoại đã tồn tại chưa
        const index = store.index('phone');
        const checkRequest = index.get(phone);
        
        await new Promise((resolve, reject) => {
            checkRequest.onsuccess = (e) => {
                if (e.target.result) {
                    reject(new Error('Số điện thoại đã tồn tại'));
                    return;
                }
                
                // Lưu HKD mới
                const putRequest = store.put(hkdData);
                putRequest.onsuccess = () => {
                    console.log('✅ Đã lưu HKD vào IndexedDB với ID:', hkdId);
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            checkRequest.onerror = () => reject(checkRequest.error);
        });
        
        // Cập nhật danh sách local
        allHKDs.push(hkdData);
        
        // Thêm vào sync queue
        await addToSyncQueue({
            type: 'hkds',
            data: hkdData
        });
        
        // Update UI
        updateHKDList();
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addHKDModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset form
        document.getElementById('hkdForm').reset();
        
        Utils.showToast('Đã thêm HKD thành công', 'success');
        
        // TEST: Kiểm tra ngay lập tức
        console.log('🔍 Kiểm tra HKD vừa tạo...');
        const testHKD = await getFromStore(STORES.HKDS, hkdId);
        console.log('HKD từ IndexedDB:', testHKD);
        
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
async function loadAllInvoices() {
    console.log('📥 Đang tải tất cả hóa đơn...');
    
    // KHỞI TẠO NẾU CHƯA CÓ
    if (!allInvoices || !Array.isArray(allInvoices)) {
        allInvoices = [];
    } else {
        allInvoices = []; // Reset
    }
    
    // KIỂM TRA allHKDs
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
            
            // LỌC INVOICE HỢP LỆ
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
                return dateB - dateA; // Mới nhất trước
            } catch {
                return 0;
            }
        });
    }
    
    console.log(`✅ Đã tải ${allInvoices.length} invoices`);
}

function setupEventListeners() {
    console.log('🔗 Setting up event listeners (REPLACING OLD)...');
    
    // === 1. XÓA TẤT CẢ LISTENERS CŨ ===
    const allNavLinks = document.querySelectorAll('.nav-link[data-view]');
    allNavLinks.forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
    });
    
    // === 2. NAVIGATION - SỬA LỖI ===
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const view = e.currentTarget.dataset.view || 
                         e.target.closest('.nav-link').dataset.view;
            
            if (view) {
                console.log('🎯 Navigation click:', view);
                switchAdminView(view);
            } else {
                console.error('❌ No data-view found');
            }
        });
    });
    
    // === 3. LOGOUT ===
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        document.getElementById('btnLogout').addEventListener('click', logout);
    }
    
    // === 4. HKD SEARCH ===
    const searchInput = document.getElementById('hkdSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(searchHKDs, 300));
    }
    
    // === 5. ADD HKD MODAL ===
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
    
    // === 6. IMPORT EXCEL ===
    const importInput = document.getElementById('importExcel');
    if (importInput) {
        importInput.addEventListener('change', handleExcelImport);
    }
    
    const importBtn = document.getElementById('btnImport');
    if (importBtn) {
        importBtn.addEventListener('click', processExcelImport);
    }
    
    // === 7. CHANGE PASSWORD ===
    const passwordForm = document.getElementById('changePasswordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', changePassword);
    }
    
    // === 8. INVOICE FILTERS (THÊM PHẦN NÀY) ===
    console.log('🎛️ Setting up invoice filters...');
    
    // a) HKD select change
    const hkdSelect = document.getElementById('invoiceHKD');
    if (hkdSelect) {
        hkdSelect.addEventListener('change', function() {
            console.log(`🔄 HKD select changed to: ${this.value}`);
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
        console.log('✅ Added change listener to invoiceHKD select');
    }
    // Thêm vào setupEventListeners
const updateBtn = document.getElementById('updateHKD');
if (updateBtn) {
    updateBtn.replaceWith(updateBtn.cloneNode(true));
    document.getElementById('updateHKD').addEventListener('click', updateHKD);
    console.log('✅ Added click listener to update HKD button');
}
    // b) Date inputs
    const startDate = document.getElementById('invoiceStartDate');
    const endDate = document.getElementById('invoiceEndDate');
    
    if (startDate) {
        startDate.addEventListener('change', () => {
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
    }
    
    if (endDate) {
        endDate.addEventListener('change', () => {
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
        });
    }
    
    // c) Filter button
    const filterBtn = document.getElementById('btnFilterInvoices');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            if (typeof filterInvoices === 'function') {
                filterInvoices();
            }
        });
        console.log('✅ Added click listener to filter button');
    }
    
    // d) Reset button
    const resetBtn = document.getElementById('btnResetFilter');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            console.log('🔄 Resetting invoice filter...');
            
            // Reset values
            if (hkdSelect) hkdSelect.value = '';
            if (startDate) startDate.value = '';
            if (endDate) endDate.value = '';
            
            // Call filter
            setTimeout(() => {
                if (typeof filterInvoices === 'function') {
                    filterInvoices();
                }
            }, 50);
            
            Utils.showToast('Đã reset bộ lọc', 'success');
        });
        console.log('✅ Added click listener to reset button');
    }
    
    console.log('✅ Event listeners setup complete');
// === 9. CATEGORY & PRODUCT MANAGEMENT ===
    console.log('🎛️ Setting up category/product management...');
    
    // HKD select for management
    const manageHKDSelect = document.getElementById('manageHKD');
    if (manageHKDSelect) {
        manageHKDSelect.addEventListener('change', function() {
            console.log(`🔄 Management HKD changed to: ${this.value}`);
            if (this.value) {
                loadCategoriesAndProducts(this.value);
            } else {
                clearManagementData();
            }
        });
    }
    
    // Load products button
    const loadProductsBtn = document.getElementById('btnLoadProducts');
    if (loadProductsBtn) {
        loadProductsBtn.addEventListener('click', function() {
            const hkdId = manageHKDSelect.value;
            if (hkdId) {
                loadCategoriesAndProducts(hkdId);
            } else {
                Utils.showToast('Vui lòng chọn HKD', 'error');
            }
        });
    }
    
    // Save category
    const saveCategoryBtn = document.getElementById('btnSaveCategory');
    if (saveCategoryBtn) {
        saveCategoryBtn.addEventListener('click', saveCategory);
    }
    
    // Save product
    const saveProductBtn = document.getElementById('btnSaveProduct');
    if (saveProductBtn) {
        saveProductBtn.addEventListener('click', saveProduct);
    }
    
    // Filter category
    const filterCategorySelect = document.getElementById('filterCategory');
    if (filterCategorySelect) {
        filterCategorySelect.addEventListener('change', filterProducts);
    }
    
    // Search product
    const searchProductInput = document.getElementById('searchProduct');
    if (searchProductInput) {
        searchProductInput.addEventListener('input', Utils.debounce(filterProducts, 300));
    }
    
    // Confirm delete
    const confirmDeleteBtn = document.getElementById('btnConfirmDelete');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', confirmDelete);
    }
}

    

// Cập nhật showImport() để populate HKD select
function showImport() {
    console.log('📤 Loading import section...');
    
    // Cập nhật danh sách HKD cho dropdown import
    const importSelect = document.getElementById('importHKD');
    const manageSelect = document.getElementById('manageHKD');
    
    if (importSelect && manageSelect) {
        const optionsHTML = allHKDs.map(hkd => 
            `<option value="${hkd.id}">${hkd.name}</option>`
        ).join('');
        
        importSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
        manageSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
        
        // Clear management data khi mới vào tab
        clearManagementData();
        
        console.log(`✅ Populated ${allHKDs.length} HKDs to select`);
    }
}

// Xóa dữ liệu quản lý
function clearManagementData() {
    document.getElementById('categoriesList').innerHTML = '<div class="no-data"><i class="fas fa-folder-open"></i><p>Chưa chọn HKD</p></div>';
    document.getElementById('productsList').innerHTML = '<tr><td colspan="7" class="text-center">Chưa chọn HKD</td></tr>';
    document.getElementById('filterCategory').innerHTML = '<option value="">Tất cả danh mục</option>';
}

async function loadCategoriesAndProducts(hkdId) {
    if (!hkdId) return;
    
    Utils.showLoading('Đang tải danh mục và sản phẩm...');
    
    try {
        // LẤY TRỰC TIẾP TỪ FIREBASE (KHÔNG LƯU VÀO INDEXEDDB)
        const { categories, products } = await loadCategoriesAndProductsFromFirebase(hkdId);
        
        // Hiển thị dữ liệu tạm
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

// HÀM MỚI: Lấy danh mục và sản phẩm trực tiếp từ Firebase
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
                // ĐÂY LÀ DANH MỤC
                categories.push({
                    id: categoryId,
                    hkdId: hkdId,
                    name: category.name,
                    description: category.description || '',
                    _fromFirebase: true
                });
                
                // LẤY SẢN PHẨM TRONG DANH MỤC
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
/**
 * Xử lý khi có HKD mới từ realtime
 */
async function handleNewHKDRealtime(hkdData) {
    try {
        console.log('👤 Xử lý HKD mới từ realtime:', hkdData.name);
        
        // 1. THÊM VÀO DANH SÁCH LOCAL
        if (!allHKDs.find(h => h.id === hkdData.id)) {
            allHKDs.push(hkdData);
        }
        
        // 2. THÔNG BÁO CHO USER
        showNewHKDNotification(hkdData);
        
        // 3. CẬP NHẬT UI NẾU ĐANG Ở TAB DASHBOARD HOẶC HKDS
        if (currentAdminView === 'dashboard') {
            updateDashboardStats();
        } else if (currentAdminView === 'hkds') {
            updateHKDList();
        }
        
        // 4. CẬP NHẬT DROPDOWN HKD
        updateHKDSelects();
        
        console.log('✅ Đã xử lý HKD mới từ realtime');
        
    } catch (error) {
        console.error('❌ Lỗi xử lý HKD realtime:', error);
    }
}

/**
 * Hiển thị thông báo HKD mới
 */
function showNewHKDNotification(hkdData) {
    // 1. PHÁT ÂM THANH THÔNG BÁO (khác với âm thanh hóa đơn)
    playNewHKDNotificationSound();
    
    // 2. HIỂN THỊ TOAST
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
                <button onclick="switchAdminView('hkds'); document.getElementById('${toastId}').remove()" style="
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
    
    // TỰ ĐỘNG XÓA SAU 8 GIÂY
    setTimeout(() => {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

/**
 * Âm thanh thông báo HKD mới (khác với hóa đơn)
 */
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
    // ÂM THANH KHÁC VỚI HÓA ĐƠN (cao độ thấp hơn)
    const oscillator1 = ctx.createOscillator();
    const oscillator2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator1.frequency.setValueAtTime(349.23, ctx.currentTime); // F4
    oscillator2.frequency.setValueAtTime(440.00, ctx.currentTime); // A4
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
// Hiển thị danh mục
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

// Hiển thị hàng hóa
function displayProducts(products, categories) {
    const container = document.getElementById('productsList');
    
    if (!products || products.length === 0) {
        container.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có hàng hóa nào</td></tr>';
        return;
    }
    
    // Tạo map category name
    const categoryMap = {};
    categories.forEach(cat => {
        categoryMap[cat.id] = cat.name;
    });
    
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

// Populate category select
function populateCategorySelects(categories) {
    const filterSelect = document.getElementById('filterCategory');
    const modalSelect = document.getElementById('productCategory');
    
    const optionsHTML = categories.map(cat => 
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');
    
    filterSelect.innerHTML = '<option value="">Tất cả danh mục</option>' + optionsHTML;
    modalSelect.innerHTML = '<option value="">Chọn danh mục...</option>' + optionsHTML;
}

// Lọc hàng hóa
function filterProducts() {
    const categoryId = document.getElementById('filterCategory').value;
    const searchTerm = document.getElementById('searchProduct').value.toLowerCase();
    const hkdId = document.getElementById('manageHKD').value;
    
    if (!hkdId) return;
    
    // Gọi lại API với filter
    getProductsByHKD(hkdId).then(products => {
        let filtered = products;
        
        // Lọc theo danh mục
        if (categoryId) {
            filtered = filtered.filter(p => p.categoryId === categoryId);
        }
        
        // Lọc theo tìm kiếm
        if (searchTerm) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(searchTerm)) ||
                (p.msp && p.msp.toLowerCase().includes(searchTerm)) ||
                (p.description && p.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Lấy danh mục để hiển thị tên
        getCategoriesByHKD(hkdId).then(categories => {
            displayProducts(filtered, categories);
        });
    });
}
async function saveProduct() {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'error');
        return;
    }
    
    // Lấy ID sản phẩm đang sửa (nếu có)
    const editProductId = document.getElementById('editProductId').value;
    const isEdit = !!editProductId;
    
    // Lấy dữ liệu form
    const productData = {
        id: isEdit ? editProductId : Utils.generateId(),
        msp: document.getElementById('productCode').value.trim(),
        name: document.getElementById('productName').value.trim(),
        categoryId: document.getElementById('productCategory').value, // DANH MỤC MỚI
        unit: document.getElementById('productUnit').value.trim() || 'cái',
        price: parseFloat(document.getElementById('productPrice').value) || 0,
        stock: parseInt(document.getElementById('productStock').value) || 0,
        cost: parseFloat(document.getElementById('productCost').value) || null,
        description: document.getElementById('productDescription').value.trim(),
        note: document.getElementById('productNote').value.trim(),
        lastUpdated: new Date().toISOString(),
        _synced: false
    };
    
    // Validation
    if (!productData.msp || !productData.name || !productData.categoryId || productData.price <= 0) {
        Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    Utils.showLoading('Đang lưu...');
    
    try {
        // ==================== QUAN TRỌNG: XỬ LÝ KHI SỬA ====================
        let oldCategoryId = null;
        
        if (isEdit) {
            // Lấy thông tin sản phẩm cũ để biết categoryId cũ
            const oldProduct = await getFromStore(STORES.PRODUCTS, editProductId);
            if (oldProduct) {
                oldCategoryId = oldProduct.categoryId;
                console.log(`🔄 Sửa sản phẩm: từ category ${oldCategoryId} → ${productData.categoryId}`);
            }
        }
        
        // 1. LƯU VÀO INDEXEDDB NGAY
        await updateInStore(STORES.PRODUCTS, { ...productData, hkdId });
        
        // 2. CẬP NHẬT UI NGAY
        await loadCategoriesAndProducts(hkdId);
        Utils.showToast(`Đã ${isEdit ? 'cập nhật' : 'thêm'} hàng hóa`, 'success');
        
        // 3. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
        if (modal) modal.hide();
        
        // Reset form
        document.getElementById('productForm').reset();
        document.getElementById('editProductId').value = '';
        document.getElementById('productModalTitle').textContent = 'Thêm hàng hóa mới';
        
        // 4. SYNC LÊN FIREBASE SAU (QUAN TRỌNG: XỬ LÝ ĐỔI DANH MỤC)
        setTimeout(async () => {
            try {
                await initFirebase();
                
                // ==================== TRƯỜNG HỢP SỬA VÀ ĐỔI DANH MỤC ====================
                if (isEdit && oldCategoryId && oldCategoryId !== productData.categoryId) {
                    console.log(`🔄 Sản phẩm đổi danh mục: xóa ở ${oldCategoryId}, thêm vào ${productData.categoryId}`);
                    
                    // Xóa sản phẩm cũ ở danh mục cũ
                    const oldProductRef = firebase.database().ref(
                        `hkds/${hkdId}/categories/${oldCategoryId}/products/${productData.id}`
                    );
                    await oldProductRef.remove();
                    
                    console.log(`✅ Đã xóa sản phẩm khỏi danh mục cũ: ${oldCategoryId}`);
                }
                
                // Lưu sản phẩm vào danh mục mới
                const productRef = firebase.database().ref(
                    `hkds/${hkdId}/categories/${productData.categoryId}/products/${productData.id}`
                );
                
                const firebaseProductData = {
                    msp: productData.msp,
                    name: productData.name,
                    unit: productData.unit,
                    price: productData.price,
                    stock: productData.stock,
                    cost: productData.cost,
                    description: productData.description,
                    note: productData.note,
                    lastUpdated: productData.lastUpdated,
                    _syncedAt: new Date().toISOString()
                };
                
                await productRef.set(firebaseProductData);
                
                // Đánh dấu đã sync
                productData._synced = true;
                productData._syncedAt = new Date().toISOString();
                await updateInStore(STORES.PRODUCTS, { ...productData, hkdId });
                
                console.log(`✅ Đã ${isEdit ? 'cập nhật' : 'thêm'} sản phẩm trên Firebase`);
                
            } catch (error) {
                console.error('❌ Lỗi sync product:', error);
                await addToSyncQueue({
                    type: 'products',
                    data: { 
                        ...productData, 
                        hkdId,
                        oldCategoryId: isEdit ? oldCategoryId : null // Lưu cả categoryId cũ để xử lý sau
                    }
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Lỗi lưu hàng hóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
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
        // Tạo category data
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
        
        // 1. LƯU INDEXEDDB NGAY
        await updateInStore(STORES.CATEGORIES, categoryData);
        
        // 2. CẬP NHẬT UI NGAY
        await loadCategoriesAndProducts(hkdId);
        Utils.showToast('Đã thêm danh mục', 'success');
        
        // 3. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addCategoryModal'));
        if (modal) modal.hide();
        
        // 4. SYNC LÊN FIREBASE SAU (cấu trúc mới)
        setTimeout(async () => {
            try {
                await initFirebase();
                
                // CẤU TRÚC MỚI: hkds/{hkdId}/categories/{categoryId}
                const categoryRef = firebase.database().ref(
                    `hkds/${hkdId}/categories/${categoryId}`
                );
                
                const firebaseData = {
                    name: name,
                    description: description,
                    createdAt: categoryData.createdAt,
                    lastUpdated: categoryData.lastUpdated,
                    products: {}, // Tạo node products rỗng
                    _syncedAt: new Date().toISOString()
                };
                
                await categoryRef.set(firebaseData);
                
                // Đánh dấu đã sync
                categoryData._synced = true;
                categoryData._syncedAt = new Date().toISOString();
                await updateInStore(STORES.CATEGORIES, categoryData);
                
                console.log('✅ Đã sync category lên Firebase');
                
            } catch (error) {
                console.error('❌ Lỗi sync category:', error);
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

// Hàm helper để lưu vào IndexedDB
async function saveCategoryToIndexedDB(categoryData) {
    try {
        const db = await getDB();
        const tx = db.transaction([STORES.CATEGORIES], 'readwrite');
        const store = tx.objectStore(STORES.CATEGORIES);
        
        await store.put(categoryData);
        console.log('💾 Đã lưu danh mục vào IndexedDB');
        
    } catch (error) {
        console.error('❌ Lỗi lưu danh mục vào IndexedDB:', error);
        throw error;
    }
}

// Tìm hàm saveProduct trong admin.js
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
        _deleted: false // Đảm bảo không bị đánh dấu xóa
    };
    
    // Validation
    if (!productData.msp || !productData.name || !productData.categoryId || productData.price <= 0) {
        Utils.showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error');
        return;
    }
    
    try {
        // Kiểm tra MSP trùng (chỉ khi thêm mới)
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
        
        // Kiểm tra xem danh mục có tồn tại không
        const category = await getFromStore(STORES.CATEGORIES, productData.categoryId);
        if (!category || category._deleted === true) {
            Utils.showToast('Danh mục không tồn tại hoặc đã bị xóa', 'error');
            return;
        }
        
        console.log('📝 Lưu sản phẩm:', productData);
        
        // 1. Lưu vào IndexedDB
        await saveProductToIndexedDB(productData);
        
        // 2. Thêm vào sync queue
        await addToSyncQueue({
            type: 'products',
            data: productData
        });
        
        // 3. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
        if (modal) modal.hide();
        
        // 4. Reset form
        document.getElementById('productForm').reset();
        document.getElementById('editProductId').value = '';
        document.getElementById('productModalTitle').textContent = 'Thêm hàng hóa mới';
        
        // 5. Reload data
        await loadCategoriesAndProducts(hkdId);
        
        Utils.showToast(`Đã ${isEdit ? 'cập nhật' : 'thêm'} hàng hóa thành công`, 'success');
        
        // 6. Sync ngay nếu online
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

// Hàm helper để lưu vào IndexedDB
async function saveProductToIndexedDB(productData) {
    try {
        const db = await getDB();
        const tx = db.transaction([STORES.PRODUCTS], 'readwrite');
        const store = tx.objectStore(STORES.PRODUCTS);
        
        await store.put(productData);
        console.log('💾 Đã lưu sản phẩm vào IndexedDB');
        
    } catch (error) {
        console.error('❌ Lỗi lưu sản phẩm vào IndexedDB:', error);
        throw error;
    }
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

// Sửa hàng hóa
async function editProduct(productId) {
    const hkdId = document.getElementById('manageHKD').value;
    if (!hkdId) {
        Utils.showToast('Vui lòng chọn HKD', 'warning');
        return;
    }
    
    try {
        // Lấy sản phẩm từ IndexedDB
        const product = await getFromStore(STORES.PRODUCTS, productId);
        
        if (!product) {
            Utils.showToast('Không tìm thấy sản phẩm', 'error');
            return;
        }
        
        console.log('✏️ Editing product:', product);
        
        // Điền dữ liệu vào form
        document.getElementById('productCode').value = product.msp || '';
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productUnit').value = product.unit || 'cái';
        document.getElementById('productPrice').value = product.price || 0;
        document.getElementById('productStock').value = product.stock || 0;
        document.getElementById('productCost').value = product.cost || '';
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productNote').value = product.note || '';
        
        // QUAN TRỌNG: Lưu ID sản phẩm đang sửa
        document.getElementById('editProductId').value = product.id;
        
        // Populate danh mục và chọn đúng
        const categories = await getCategoriesByHKD(hkdId);
        const categorySelect = document.getElementById('productCategory');
        
        // Clear và thêm options
        categorySelect.innerHTML = '<option value="">Chọn danh mục...</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
        
        // Chọn đúng danh mục của sản phẩm
        if (product.categoryId) {
            categorySelect.value = product.categoryId;
        }
        
        // Cập nhật title modal
        document.getElementById('productModalTitle').textContent = 'Sửa hàng hóa';
        
        // Hiển thị modal
        const modal = new bootstrap.Modal(document.getElementById('addProductModal'));
        modal.show();
        
        console.log(`✅ Form loaded for editing product: ${product.name}`);
        
    } catch (error) {
        console.error('❌ Lỗi sửa hàng hóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    }
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
// Thêm vào admin.js
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
async function confirmDelete() {
    const id = document.getElementById('deleteItemId').value;
    const type = document.getElementById('deleteItemType').value;
    const hkdId = document.getElementById('manageHKD').value;
    
    if (!id || !type || !hkdId) return;
    
    Utils.showLoading('Đang xóa...');
    
    try {
        if (type === 'category') {
            // 1. XÓA DANH MỤC VÀ SẢN PHẨM TRONG INDEXEDDB
            const products = await getProductsByHKD(hkdId);
            const categoryProducts = products.filter(p => p.categoryId === id);
            
            // Xóa sản phẩm
            for (const product of categoryProducts) {
                await deleteFromStore(STORES.PRODUCTS, product.id);
            }
            
            // Xóa danh mục
            await deleteFromStore(STORES.CATEGORIES, id);
            
            // 2. CẬP NHẬT UI NGAY
            await loadCategoriesAndProducts(hkdId);
            Utils.showToast(`Đã xóa danh mục và ${categoryProducts.length} sản phẩm`, 'success');
            
            // 3. SYNC XÓA LÊN FIREBASE SAU
            setTimeout(async () => {
                try {
                    await initFirebase();
                    
                    // Xóa trên Firebase (cấu trúc mới)
                    const categoryRef = firebase.database().ref(`hkds/${hkdId}/categories/${id}`);
                    await categoryRef.remove();
                    
                    console.log('✅ Đã xóa category trên Firebase');
                    
                } catch (error) {
                    console.error('❌ Lỗi xóa Firebase:', error);
                    await addToSyncQueue({
                        type: 'categories_delete',
                        data: { id, hkdId }
                    });
                }
            }, 100);
            
        } else if (type === 'product') {
            // 1. Lấy thông tin sản phẩm để biết categoryId
            const product = await getFromStore(STORES.PRODUCTS, id);
            if (!product) return;
            
            // 2. XÓA TRONG INDEXEDDB
            await deleteFromStore(STORES.PRODUCTS, id);
            
            // 3. CẬP NHẬT UI NGAY
            await loadCategoriesAndProducts(hkdId);
            Utils.showToast('Đã xóa hàng hóa', 'success');
            
            // 4. SYNC XÓA LÊN FIREBASE SAU
            setTimeout(async () => {
                try {
                    await initFirebase();
                    
                    // Xóa trên Firebase (cấu trúc mới)
                    const productRef = firebase.database().ref(
                        `hkds/${hkdId}/categories/${product.categoryId}/products/${id}`
                    );
                    await productRef.remove();
                    
                    console.log('✅ Đã xóa product trên Firebase');
                    
                } catch (error) {
                    console.error('❌ Lỗi xóa Firebase:', error);
                    await addToSyncQueue({
                        type: 'products_delete',
                        data: { id, hkdId, categoryId: product.categoryId }
                    });
                }
            }, 100);
        }
        
        // Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
        if (modal) modal.hide();
        
    } catch (error) {
        console.error('❌ Lỗi xóa:', error);
        Utils.showToast('Lỗi: ' + error.message, 'error');
    } finally {
        Utils.hideLoading();
    }
}
// Hiển thị thông tin admin
function displayAdminInfo() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('adminName').textContent = user.name;
        document.getElementById('adminPhone').textContent = user.phone;
    }
}

// Chuyển đổi view
function switchAdminView(view) {
    currentAdminView = view;
    
    // Ẩn tất cả sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Xóa active class từ tất cả nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Hiển thị section được chọn
    const targetSection = document.getElementById(`${view}Section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Thêm active class cho nav link
    const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // Tải dữ liệu cho view
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

// Thêm vào admin.js
function addMarkAllAsReadButton() {
    // Kiểm tra đã có button chưa
    if (document.getElementById('markAllInvoicesRead')) return;
    
    // Tìm container của recent invoices
    const container = document.querySelector('#recentInvoices').parentElement;
    if (!container) return;
    
    // Thêm header với button
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
    
    // Lấy tất cả invoice cards
    const invoiceCards = recentContainer.querySelectorAll('.invoice-card');
    
    // Lấy danh sách ID
    const viewedInvoices = getViewedInvoices();
    
    invoiceCards.forEach(card => {
        const invoiceId = card.dataset.invoiceId;
        if (invoiceId && !viewedInvoices.includes(invoiceId)) {
            markInvoiceAsViewed(invoiceId);
        }
    });
    
    Utils.showToast('Đã đánh dấu tất cả hóa đơn đã xem', 'success');
}
// Thêm CSS vào đầu admin.js hoặc trong initAdminPage
function loadDashboardStyles() {
    // Kiểm tra nếu CSS đã tồn tại
    if (document.getElementById('dashboard-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.textContent = `
        /* ========== INVOICE CARD STYLES ========== */
        
    `;
    
    // Thêm vào head sớm nhất có thể
    document.head.appendChild(style);
    console.log('✅ Dashboard styles loaded');
}
// Trong admin.js
function handleNewInvoiceSimple(invoice) {
    console.log('🔄 Processing new invoice:', invoice.id);
    
    // 1. Thêm vào allInvoices nếu chưa có
    if (allInvoices && !allInvoices.find(inv => inv.id === invoice.id)) {
        allInvoices.unshift(invoice);
    }
    
    // 2. Gọi hàm hiển thị view hiện tại
    switch(currentAdminView) {
        case 'dashboard':
            showDashboard(); // Sẽ render lại toàn bộ dashboard
            break;
        case 'invoices':
            showInvoices();  // Sẽ render lại danh sách invoices
            break;
        case 'hkds':
            showHKDs();      // Sẽ render lại danh sách HKD
            break;
    }
    
    console.log('✅ UI refreshed');
}

// Export ra window
window.handleNewInvoiceSimple = handleNewInvoiceSimple;
// Gọi trong showDashboard
function showDashboard() {
    updateDashboardStats();
    displayRecentInvoices();
    drawDashboardCharts();
    addMarkAllAsReadButton(); // Thêm dòng này
}
function updateUIRealtime(invoice) {
    console.log('🔄 Updating UI for new invoice:', invoice.id);
    
    // 1. Cập nhật dashboard stats
    updateDashboardStats();
    
    // 2. Thêm invoice vào danh sách nếu đang xem dashboard
    if (currentAdminView === 'dashboard') {
        // Gọi lại hàm displayRecentInvoices để hiển thị với hiệu ứng mới
        setTimeout(() => {
            displayRecentInvoices();
        }, 500);
    }
    
    // 3. Nếu đang xem invoices, thêm vào table
    if (currentAdminView === 'invoices') {
        const tableBody = document.querySelector('#invoiceList tbody');
        if (tableBody) {
            const hkd = allHKDs.find(h => h.id === invoice.hkdId);
            const newRow = `
                <tr id="row-${invoice.id}" class="new-invoice-row">
                    <td><span class="new-indicator-table"><i class="fas fa-star"></i></span> ${Utils.formatDate(invoice.date)}</td>
                    <td>${invoice.id.substring(0, 10)}...</td>
                    <td><strong>${hkd ? hkd.name : 'N/A'}</strong></td>
                    <td>${invoice.customerName || 'Khách lẻ'}</td>
                    <td>${invoice.items.length}</td>
                    <td class="highlight-total">${Utils.formatCurrency(invoice.total)}</td>
                    <td>
                        <button class="btn-view" onclick="viewInvoiceDetails('${invoice.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
            
            tableBody.insertAdjacentHTML('afterbegin', newRow);
            
            // Tự động xóa class "new" sau 5 giây
            setTimeout(() => {
                const row = document.getElementById(`row-${invoice.id}`);
                if (row) {
                    row.classList.remove('new-invoice-row');
                }
            }, 5000);
        }
    }
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
    
    // Xóa tất cả các invoice card cũ
    container.innerHTML = '';
    
    // Lấy 10 invoice gần nhất
    const recentInvoices = allInvoices.slice(0, 10);
    
    // Lấy danh sách invoice đã xem
    const viewedInvoices = getViewedInvoices();
    
    // Tạo từng invoice card
    recentInvoices.forEach(invoice => {
        const isViewed = viewedInvoices.includes(invoice.id);
        const isNew = !isViewed && isRecentInvoice(invoice);
        
        // Tạo card element
        const card = document.createElement('div');
        card.className = `invoice-card ${isNew ? 'invoice-card-new glow-effect' : 'invoice-card-viewed'}`;
        card.id = `invoice-${invoice.id}`;
        card.dataset.invoiceId = invoice.id;
        
        // Thêm event listener
        card.addEventListener('click', function(e) {
            // Chỉ xử lý click trực tiếp lên card, không phải lên button
            if (!e.target.closest('.btn-view-invoice')) {
                markInvoiceAsViewed(invoice.id);
                viewInvoiceDetails(invoice.id);
            }
        });
        
        // Tạo nội dung
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
        
        // Thêm vào container
        container.appendChild(card);
    });
    
    // Nếu không có invoice nào
    if (recentInvoices.length === 0) {
        container.innerHTML = `
            <div class="no-invoices">
                <i class="fas fa-receipt"></i>
                <p>Chưa có hóa đơn nào</p>
            </div>
        `;
    }
}

// Hàm kiểm tra invoice có phải mới không (trong vòng 24h)
function isRecentInvoice(invoice) {
    if (!invoice || !invoice.date) return false;
    
    const invoiceDate = new Date(invoice.date);
    const now = new Date();
    const hoursDiff = (now - invoiceDate) / (1000 * 60 * 60);
    
    return hoursDiff < 24; // Mới trong 24h
}

// Lấy danh sách invoice đã xem từ localStorage
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
        
        // Cập nhật card trong DOM
        const invoiceCard = document.getElementById(`invoice-${invoiceId}`);
        if (invoiceCard) {
            // Thay đổi class
            invoiceCard.classList.remove('invoice-card-new', 'glow-effect');
            invoiceCard.classList.add('invoice-card-viewed');
            
            // Cập nhật nội dung bên trong
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
            
            // Update button
            const button = invoiceCard.querySelector('.btn-view-invoice');
            if (button) {
                button.innerHTML = '<i class="far fa-eye"></i> Xem chi tiết';
                button.className = 'btn-view-invoice';
            }
            
            // Thêm hiệu ứng transition
            invoiceCard.style.transition = 'all 0.3s ease';
        }
    }
}


function drawDashboardCharts() {
    // Đơn giản: hiển thị thống kê dạng text
    const chartContainer = document.getElementById('dashboardChart');
    if (!chartContainer) return;
    
    // Phân tích dữ liệu theo tháng
    const monthlyData = {};
    allInvoices.forEach(invoice => {
        const date = new Date(invoice.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                invoices: 0,
                revenue: 0
            };
        }
        
        monthlyData[monthKey].invoices++;
        monthlyData[monthKey].revenue += invoice.total;
    });
    
    // Hiển thị dạng bảng
    const sortedMonths = Object.keys(monthlyData).sort();
    const recentMonths = sortedMonths.slice(-6); // 6 tháng gần nhất
    
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

// Quản lý HKD
function showHKDs() {
    updateHKDList();
}

// Sửa hàm updateHKDList để lọc HKD chưa bị xóa
function updateHKDList() {
    const container = document.getElementById('hkdList');
    if (!container) return;
    
    // Lọc HKD active (chưa bị xóa)
    const activeHKDs = allHKDs.filter(hkd => 
        hkd && hkd._deleted !== true
    );
    
    if (!activeHKDs || activeHKDs.length === 0) {
        container.innerHTML = '<p class="no-hkds">Chưa có HKD nào</p>';
        return;
    }
    
    console.log('🔄 Updating HKD list...');
    console.log(`📊 Total HKDs: ${allHKDs ? allHKDs.length : 0}`);
    console.log(`📊 Total Invoices: ${allInvoices ? allInvoices.length : 0}`);
    
    // KIỂM TRA allInvoices
    if (!allInvoices) {
        console.error('❌ allInvoices is undefined!');
        allInvoices = [];
    }
    
    // KIỂM TRA allHKDs
    if (!allHKDs || allHKDs.length === 0) {
        container.innerHTML = '<p class="no-hkds">Chưa có HKD nào</p>';
        return;
    }
    
    container.innerHTML = allHKDs.map((hkd, index) => {
        // BẢO VỆ: kiểm tra hkd
        if (!hkd || typeof hkd !== 'object') {
            console.error(`❌ HKD at index ${index} is invalid:`, hkd);
            return '';
        }
        
        console.log(`Processing HKD ${index + 1}: ${hkd.name || 'No name'} (${hkd.id})`);
        
        // Lọc invoices của HKD này - AN TOÀN
        const hkdInvoices = Array.isArray(allInvoices) 
            ? allInvoices.filter(inv => {
                // Kiểm tra invoice hợp lệ
                if (!inv || typeof inv !== 'object') return false;
                if (!inv.hkdId) return false;
                return inv.hkdId === hkd.id;
            })
            : [];
        
        console.log(`  - Found ${hkdInvoices.length} invoices`);
        
        // Lấy 5 invoice gần nhất - AN TOÀN
        const recentInvoices = Array.isArray(hkdInvoices) 
            ? hkdInvoices.slice(0, 5) 
            : [];
        
        // Tính tổng doanh thu - AN TOÀN
        const totalRevenue = hkdInvoices.reduce((sum, inv) => {
            if (!inv || typeof inv !== 'object') return sum;
            return sum + (parseFloat(inv.total) || 0);
        }, 0);
        
        // Tạo HTML - THÊM KIỂM TRA NULL
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
                                    // KIỂM TRA invoice hợp lệ
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


// Hàm helper để cập nhật tất cả dropdown HKD
function updateHKDSelects() {
    console.log('🔄 Cập nhật tất cả dropdown HKD...');
    
    // Danh sách các select cần cập nhật
    const selectIds = [
        'invoiceHKD',      // Trong tab invoices
        'importHKD',       // Trong tab import
        'manageHKD'        // Trong tab import (management)
    ];
    
    selectIds.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            updateSingleHKDSelect(select);
        }
    });
}

// Cập nhật một select cụ thể
function updateSingleHKDSelect(selectElement) {
    if (!selectElement) return;
    
    // Lưu giá trị hiện tại
    const currentValue = selectElement.value;
    
    // Xóa tất cả options trừ option đầu tiên
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }
    
    // Thêm từng HKD
    allHKDs.forEach(hkd => {
        if (hkd && hkd.role === 'hkd') {
            const option = document.createElement('option');
            option.value = hkd.id;
            option.textContent = `${hkd.name} (${hkd.phone})`;
            selectElement.appendChild(option);
        }
    });
    
    // Khôi phục giá trị cũ nếu còn tồn tại
    if (currentValue && selectElement.querySelector(`option[value="${currentValue}"]`)) {
        selectElement.value = currentValue;
    }
    
    console.log(`✅ Đã cập nhật select ${selectElement.id} với ${allHKDs.length} HKD`);
}
function editHKD(hkdId) {
    console.log(`✏️ Editing HKD: ${hkdId}`);
    
    if (!hkdId) {
        console.error('❌ HKD ID không hợp lệ');
        return;
    }
    
    // Tìm HKD
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        console.error(`❌ Không tìm thấy HKD với ID: ${hkdId}`);
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    console.log('📋 HKD data:', hkd);
    
    // Điền thông tin vào form
    document.getElementById('editHKDName').value = hkd.name || '';
    document.getElementById('editHKDPhone').value = hkd.phone || '';
    document.getElementById('editHKDAddress').value = hkd.address || '';
    document.getElementById('editHKDPassword').value = hkd.password || '';
    
    // Lưu HKD đang chỉnh sửa
    selectedHKD = hkd;
    
    // Hiển thị modal
    const editModal = new bootstrap.Modal(document.getElementById('editHKDModal'));
    editModal.show();
    
    console.log(`✅ Form loaded for HKD: ${hkd.name}`);
}

async function updateHKD() {
    console.log('🔄 Updating HKD...');
    
    if (!selectedHKD) {
        console.error('❌ Không có HKD nào được chọn để cập nhật');
        Utils.showToast('Không tìm thấy HKD để cập nhật', 'error');
        return;
    }
    
    const name = document.getElementById('editHKDName').value;
    const phone = document.getElementById('editHKDPhone').value;
    const address = document.getElementById('editHKDAddress').value;
    const password = document.getElementById('editHKDPassword').value;
    
    console.log('📝 Update data:', { name, phone, address, passwordLength: password?.length });
    
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
        // Cập nhật thông tin
        selectedHKD.name = name;
        selectedHKD.phone = phone;
        selectedHKD.address = address;
        
        // Chỉ cập nhật mật khẩu nếu có nhập
        if (password && password.trim() !== '') {
            selectedHKD.password = password;
            console.log('🔐 Password updated');
        }
        
        selectedHKD.lastUpdated = new Date().toISOString();
        
        console.log('📤 Updated HKD data:', selectedHKD);
        
        // 1. Cập nhật trong IndexedDB
        await updateInStore(STORES.HKDS, selectedHKD);
        console.log('✅ Đã cập nhật trong IndexedDB');
        
        // 2. Thêm vào sync queue
        await addToSyncQueue({
            type: 'hkds',
            data: selectedHKD
        });
        console.log('✅ Đã thêm vào sync queue');
        
        // 3. Cập nhật danh sách local
        const index = allHKDs.findIndex(h => h.id === selectedHKD.id);
        if (index !== -1) {
            allHKDs[index] = { ...selectedHKD };
            console.log(`✅ Đã cập nhật allHKDs tại index ${index}`);
        }
        
        // 4. Update UI
        updateHKDList();
        
        // THAY THẾ TOÀN BỘ ĐOẠN TRÊN BẰNG:
setTimeout(() => {
    try {
        const invoiceSelect = document.getElementById('invoiceHKD');
        if (invoiceSelect && selectedHKD && selectedHKD.id) {
            const option = invoiceSelect.querySelector(`option[value="${selectedHKD.id}"]`);
            if (option && selectedHKD.name) {
                option.textContent = selectedHKD.name + (selectedHKD.phone ? ` (${selectedHKD.phone})` : '');
                console.log('✅ Đã cập nhật option trong select');
            }
        }
    } catch (error) {
        console.warn('⚠️ Lỗi khi cập nhật select (không nghiêm trọng):', error.message);
    }
}, 100);
        
        // 6. Đóng modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editHKDModal'));
        if (modal) {
            modal.hide();
        }
        
        Utils.showToast('Đã cập nhật HKD thành công', 'success');
        
        // 7. Đồng bộ ngay lập tức
        if (navigator.onLine) {
            setTimeout(async () => {
                try {
                    if (typeof forceSync === 'function') {
                        await forceSync();
                        console.log('✅ Đã đồng bộ lên Firebase');
                    }
                } catch (syncError) {
                    console.error('❌ Lỗi khi sync:', syncError);
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Lỗi cập nhật HKD:', error);
        console.error('Error details:', error.message, error.stack);
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
        // Xóa khỏi IndexedDB
        await deleteFromStore(STORES.HKDS, hkdId);
        
        // Xóa dữ liệu liên quan
        await clearHKDData(hkdId);
        
        // Thêm vào sync queue để xóa trên Firebase
        await addToSyncQueue({
            type: 'hkds_delete',
            data: { id: hkdId }
        });
        
        // Cập nhật danh sách
        allHKDs = allHKDs.filter(h => h.id !== hkdId);
        updateHKDList();
        
        // Cập nhật dashboard
        updateDashboardStats();
        
        Utils.showToast('Đã xóa HKD thành công', 'success');
        
        // Đồng bộ ngay lập tức
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
function populateHKDSelect() {
    const hkdSelect = document.getElementById('invoiceHKD');
    if (!hkdSelect) {
        console.error('❌ Không tìm thấy select invoiceHKD');
        return;
    }
    
    console.log(`📊 Populating HKD select with ${allHKDs.length} HKDs...`);
    
    // Lưu giá trị hiện tại
    const currentValue = hkdSelect.value;
    
    // Clear và thêm option mặc định
    hkdSelect.innerHTML = '<option value="">Tất cả HKD</option>';
    
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
    
    // Khôi phục giá trị cũ nếu còn tồn tại
    if (currentValue && hkdSelect.querySelector(`option[value="${currentValue}"]`)) {
        hkdSelect.value = currentValue;
    }
    
    console.log(`✅ Select now has ${hkdSelect.options.length} options`);
}
function viewHKDInvoices(hkdId) {
    console.log(`📋 Xem hóa đơn của HKD: ${hkdId}`);
    
    if (!hkdId) {
        console.error('❌ HKD ID không hợp lệ');
        return;
    }
    
    // Tìm HKD
    const hkd = allHKDs.find(h => h && h.id === hkdId);
    if (!hkd) {
        console.error(`❌ Không tìm thấy HKD với ID: ${hkdId}`);
        Utils.showToast('Không tìm thấy HKD', 'error');
        return;
    }
    
    console.log(`✅ Đã chọn HKD: ${hkd.name}`);
    
    // 1. Chuyển sang tab invoices
    switchAdminView('invoices');
    
    // 2. Đợi một chút rồi set filter
    setTimeout(() => {
        const select = document.getElementById('invoiceHKD');
        if (select) {
            // Set value
            select.value = hkdId;
            console.log(`🎯 Set invoiceHKD select to: ${hkdId}`);
            
            // Gọi filter ngay
            if (typeof filterInvoices === 'function') {
                setTimeout(() => {
                    filterInvoices();
                    console.log(`✅ Đã filter invoices cho HKD: ${hkd.name}`);
                }, 100);
            }
        } else {
            console.error('❌ Không tìm thấy select invoiceHKD');
        }
    }, 300); // Đợi tab hiển thị
}

function showInvoices() {
    console.log('📋 Bắt đầu hiển thị trang hóa đơn...');
    
    try {
        // 1. Populate HKD select
        populateHKDSelect();
        
        // 2. Đảm bảo allInvoices đã được tải
        if (!allInvoices || !Array.isArray(allInvoices)) {
            console.warn('⚠️ allInvoices chưa sẵn sàng, đang tải lại...');
            
            // Thử tải lại invoices
            setTimeout(async () => {
                try {
                    await loadAllInvoices();
                    displayInvoices();
                } catch (error) {
                    console.error('❌ Lỗi tải lại invoices:', error);
                }
            }, 300);
        }
        
        // 3. Hiển thị invoices
        displayInvoices();
        
        console.log('✅ showInvoices hoàn tất');
        
    } catch (error) {
        console.error('❌ Lỗi trong showInvoices:', error);
        Utils.showToast('Lỗi hiển thị hóa đơn: ' + error.message, 'error');
    }
}

// Sửa hàm displayInvoices để lọc invoices chưa bị xóa
function displayInvoices() {
    const container = document.getElementById('invoiceList');
    if (!container) return;
    
    // Lọc invoices active
    const activeInvoices = allInvoices.filter(inv => 
        inv && inv._deleted !== true
    );
    
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
    
    console.log(`📊 Số hóa đơn: ${allInvoices.length}`);
    
    if (allInvoices.length === 0) {
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
    
    // TẠO HTML - THÊM KIỂM TRA TỪNG INVOICE
    try {
        const invoicesHTML = allInvoices.map((invoice, index) => {
            // KIỂM TRA invoice hợp lệ
            if (!invoice || typeof invoice !== 'object') {
                console.warn(`⚠️ Invoice at index ${index} không hợp lệ`);
                return '';
            }
            
            // Tìm HKD
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
        console.log(`✅ Đã hiển thị ${allInvoices.length} hóa đơn`);
        
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
    console.log('🔍 Đang lọc hóa đơn...');
    console.log('allInvoices:', allInvoices ? allInvoices.length : 0);
    
    // Lấy giá trị filter
    const hkdId = document.getElementById('invoiceHKD')?.value || '';
    const startDate = document.getElementById('invoiceStartDate')?.value || '';
    const endDate = document.getElementById('invoiceEndDate')?.value || '';
    
    console.log('🎯 Filter criteria:', { 
        hkdId, 
        startDate: startDate || '(none)', 
        endDate: endDate || '(none)' 
    });
    
    // Kiểm tra allInvoices
    if (!allInvoices || !Array.isArray(allInvoices)) {
        console.error('❌ allInvoices không hợp lệ');
        return;
    }
    
    let filtered = [...allInvoices];
    console.log(`📊 Tổng số hóa đơn: ${filtered.length}`);
    
    // Lọc theo HKD - CHI TIẾT LOG
    if (hkdId) {
        const before = filtered.length;
        filtered = filtered.filter(inv => {
            const match = inv && inv.hkdId === hkdId;
            if (!match && inv) {
                console.log(`   ❌ Invoice ${inv.id} - hkdId: ${inv.hkdId} không khớp với ${hkdId}`);
            }
            return match;
        });
        console.log(`📊 Sau khi lọc HKD "${hkdId}": ${before} → ${filtered.length}`);
    }
    
    // Lọc theo ngày
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
    
    console.log(`📊 Kết quả cuối cùng: ${filtered.length} hóa đơn`);
    
    // Hiển thị
    const container = document.getElementById('invoiceList');
    if (!container) {
        console.error('❌ Không tìm thấy container invoiceList');
        return;
    }
    
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
    
    console.log(`✅ Đã hiển thị ${filtered.length} hóa đơn`);
}

async function viewInvoiceDetails(invoiceId) {
    console.log('🔍 Looking for invoice:', invoiceId);
    
    // Đánh dấu invoice đã xem khi mở modal
    markInvoiceAsViewed(invoiceId);
    
    // Tìm trong allInvoices
    let invoice = allInvoices.find(inv => inv.id === invoiceId);
    
    // Nếu không tìm thấy, thử tìm trong IndexedDB
    if (!invoice) {
        console.log('🔍 Invoice not in allInvoices, checking IndexedDB...');
        try {
            invoice = await getFromStore(STORES.INVOICES, invoiceId);
            if (invoice) {
                console.log('✅ Found invoice in IndexedDB');
                // Thêm vào allInvoices để lần sau tìm nhanh hơn
                allInvoices.unshift(invoice);
            }
        } catch (error) {
            console.error('❌ Error loading invoice from IndexedDB:', error);
        }
    }
    
    // Nếu vẫn không tìm thấy
    if (!invoice) {
        Utils.showToast('Không tìm thấy hóa đơn', 'error');
        console.error('❌ Invoice not found:', invoiceId);
        return;
    }
    
    // Tiếp tục xử lý hiển thị...
    const hkd = allHKDs.find(h => h.id === invoice.hkdId);
    
    // Hiển thị chi tiết
    const modal = new bootstrap.Modal(document.getElementById('invoiceDetailModal'));
    
    document.getElementById('invoiceDetailTitle').textContent = `Hóa đơn: ${invoice.id}`;
    document.getElementById('invoiceDetailDate').textContent = Utils.formatDate(invoice.date);
    document.getElementById('invoiceDetailHKD').textContent = hkd ? hkd.name : 'N/A';
    document.getElementById('invoiceDetailCustomer').textContent = invoice.customerName || 'Khách lẻ';
    document.getElementById('invoiceDetailTotal').textContent = Utils.formatCurrency(invoice.total);
    document.getElementById('invoiceDetailStatus').textContent = invoice.status || 'Hoàn thành';
    
    // Hiển thị chi tiết sản phẩm
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
    console.log('📤 Loading import section...');
    
    // Cập nhật danh sách HKD cho CẢ HAI dropdown
    const importSelect = document.getElementById('importHKD');
    const manageSelect = document.getElementById('manageHKD');
    
    console.log(`📊 Total HKDs available: ${allHKDs ? allHKDs.length : 0}`);
    console.log('📋 HKDs:', allHKDs);
    
    if (!allHKDs || !Array.isArray(allHKDs)) {
        console.error('❌ allHKDs is not an array!');
        return;
    }
    
    // Tạo options HTML
    const optionsHTML = allHKDs
        .filter(hkd => hkd && hkd.role === 'hkd') // Chỉ lấy HKD
        .map(hkd => `<option value="${hkd.id}">${hkd.name} - ${hkd.phone}</option>`)
        .join('');
    
    console.log(`✅ Generated ${optionsHTML.length} characters of options HTML`);
    
    // Populate cả hai select
    if (importSelect) {
        importSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
        console.log(`✅ Populated import HKD select with ${allHKDs.filter(h => h.role === 'hkd').length} options`);
    }
    
    if (manageSelect) {
        manageSelect.innerHTML = '<option value="">Chọn HKD...</option>' + optionsHTML;
        console.log(`✅ Populated manage HKD select with ${allHKDs.filter(h => h.role === 'hkd').length} options`);
    }
    
    // Clear management data khi mới vào tab
    clearManagementData();
}

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
    const rows = data.slice(0, 11); // Hiển thị tối đa 10 dòng đầu
    
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
    
    // Lưu data tạm thời
    window.excelData = data;
}

async function processExcelImport() {
    const hkdId = document.getElementById('importHKD').value;
    const importMode = document.getElementById('importMode').value;
    
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
        // Parse Excel data với cấu trúc mới
        const { products, categories } = parseExcelDataForNewStructure(window.excelData, hkdId);
        
        console.log(`📊 Dữ liệu parse: ${categories.length} danh mục, ${products.length} sản phẩm`);
        
        // Xử lý danh mục trước
        const categoryMap = {}; // Map category name → categoryId
        await initFirebase();
        
        for (const category of categories) {
            // Tạo hoặc lấy categoryId
            let categoryId = category.id;
            
            // Lưu lên Firebase với cấu trúc chuẩn
            const categoryRef = firebase.database().ref(`hkds/${hkdId}/categories/${categoryId}`);
            await categoryRef.set({
                name: category.name,
                description: category.description || '',
                createdAt: category.createdAt,
                lastUpdated: category.lastUpdated,
                products: {} // ← Tạo node products rỗng
            });
            
            // Lưu vào IndexedDB
            await saveCategoryToIndexedDB(category);
            
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
                
                // Gán categoryId
                product.categoryId = categoryId;
                
                // 1. Lưu vào IndexedDB
                await saveProductToIndexedDB(product);
                
                // 2. Lưu lên Firebase với cấu trúc chuẩn
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
                console.log(`✅ Đã import: ${product.name} vào danh mục ${product.categoryName}`);
                
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

// Hàm parse Excel cho cấu trúc mới
function parseExcelDataForNewStructure(data, hkdId) {
    const rows = data.slice(1); // bỏ header
    const categories = [];
    const products = [];
    const categoryMap = {}; // Tên danh mục → categoryId

    for (const row of rows) {
        if (!row || row.length < 5) continue;

        // ===== DANH MỤC =====
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

        // ===== SẢN PHẨM =====
        const product = {
            id: Utils.generateId(),
            hkdId: hkdId,

            name: (row[1]?.toString() || '').trim(),       // Tên SP
            msp: (row[2]?.toString() || '').trim(),        // Mã SP
            unit: 'cái',                                   // mặc định
            price: parseFloat(row[4]) || 0,                // Đơn giá
            stock: parseInt(row[5]) || 0,                  // Số lượng

            categoryName: categoryName,
            description: (row[3]?.toString() || '').trim(),// Tên thường gọi
            note: (row[6]?.toString() || '').trim(),

            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            _synced: false
        };

        // tránh import dòng rỗng
        if (!product.name) continue;

        products.push(product);
    }

    return { categories, products };
}

function parseExcelData(data) {
    // Giả sử cấu trúc: MSP, Tên, DVT, Giá, Tồn kho, Danh mục, Mô tả, Ghi chú
    const rows = data.slice(1); // Bỏ header
    const products = [];
    
    for (const row of rows) {
        if (row.length < 4) continue; // Bỏ hàng không đủ dữ liệu
        
        const product = {
            id: Utils.generateId(),
            msp: row[0]?.toString() || '',
            name: row[1]?.toString() || '',
            unit: row[2]?.toString() || 'cái',
            price: parseFloat(row[3]) || 0,
            stock: parseInt(row[4]) || 0,
            category: row[5]?.toString() || 'Khác',
            description: row[6]?.toString() || '',
            note: row[7]?.toString() || '',
            createdAt: new Date().toISOString()
        };
        
        products.push(product);
    }
    
    return products;
}

// Settings
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
        
        // Reset form
        e.target.reset();
        
        Utils.showToast('Đã đổi mật khẩu thành công', 'success');
        
    } catch (error) {
        Utils.showToast(error.message, 'error');
    }
}

// Thông báo
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
// Xuất hàm để sync-manager.js có thể gọi
window.handleNewHKDRealtime = handleNewHKDRealtime;
window.handleNewInvoiceFromRealtime = handleNewInvoiceFromRealtime;
window.loadHKDInfoFromFirebase = loadHKDInfoFromFirebase;
// Xuất hàm để sử dụng trong HTML
window.loadCategoriesAndProducts = loadCategoriesAndProducts;
window.editCategory = editCategory;
window.editProduct = editProduct;
window.deleteItem = deleteItem;
window.filterProducts = filterProducts;
window.saveCategory = saveCategory;
window.saveProduct = saveProduct;
window.confirmDelete = confirmDelete;
// Thêm vào cuối admin.js
window.loadDataAfterSync = loadDataAfterSync;
window.syncFromFirebase = syncFromFirebase; // Export để gọi từ nơi khác

// Auto sync khi online
window.addEventListener('online', async () => {
    console.log('🌐 Đã kết nối mạng, tự động đồng bộ...');
    if (typeof syncFromFirebase === 'function') {
        setTimeout(async () => {
            await syncFromFirebase();
        }, 2000);
    }
});