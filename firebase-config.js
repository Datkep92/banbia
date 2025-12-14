// Lấy database reference theo HKD
function getDatabaseRefByHKD(type, hkdId, itemId = null) {
    if (!firebaseInitialized) {
        throw new Error('Firebase chưa được khởi tạo');
    }
    
    let path = `${type}`;
    
    if (hkdId) {
        path += `/${hkdId}`;
    }
    
    if (itemId) {
        path += `/${itemId}`;
    }
    
    return firebase.database().ref(path);
}

// Export thêm hàm mới
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        firebaseConfig,
        initFirebase,
        getDatabaseRef,
        getDatabaseRefByHKD, // THÊM DÒNG NÀY
        getAuth,
        checkFirebaseConnection
    };
}

// Thêm vào firebase-config.js
function getHKDRef(hkdId, type = null, itemId = null) {
    if (!firebaseInitialized) {
        throw new Error('Firebase chưa được khởi tạo');
    }
    
    let path = `hkds/${hkdId}`;
    
    if (type === 'info') {
        path += '/info';
    } else if (type) {
        path += `/${type}`;
        if (itemId) {
            path += `/${itemId}`;
        }
    }
    
    return firebase.database().ref(path);
}