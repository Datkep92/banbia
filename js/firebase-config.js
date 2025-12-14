// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCBQajWNtD8bPrMwlUvc_ti4Mi7YO1LTTs",
    authDomain: "banhang-65e90.firebaseapp.com",
    databaseURL: "https://banhang-65e90-default-rtdb.firebaseio.com",
    projectId: "banhang-65e90",
    storageBucket: "banhang-65e90.firebasestorage.app",
    messagingSenderId: "658600855600",
    appId: "1:658600855600:web:5ad75e95f46096755205f5",
    measurementId: "G-GBWPQKQNKV"
};

// Khởi tạo Firebase
let firebaseInitialized = false;

function initFirebase() {
    return new Promise((resolve, reject) => {
        if (firebaseInitialized) {
            resolve();
            return;
        }

        // Tạo script elements cho Firebase SDK
        const scripts = [
            'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
            'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js',
            'https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js'
        ];

        let loadedCount = 0;
        
        scripts.forEach(scriptUrl => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                loadedCount++;
                if (loadedCount === scripts.length) {
                    try {
                        if (!firebase.apps.length) {
                            firebase.initializeApp(firebaseConfig);
                        }
                        firebaseInitialized = true;
                        console.log('Firebase initialized successfully');
                        resolve();
                    } catch (error) {
                        reject(new Error('Firebase initialization failed: ' + error.message));
                    }
                }
            };
            script.onerror = () => {
                reject(new Error(`Failed to load script: ${scriptUrl}`));
            };
            document.head.appendChild(script);
        });
    });
}

// Database references
function getDatabaseRef(path) {
    if (!firebaseInitialized) {
        throw new Error('Firebase chưa được khởi tạo');
    }
    return firebase.database().ref(path);
}

// Auth functions
function getAuth() {
    if (!firebaseInitialized) {
        throw new Error('Firebase chưa được khởi tạo');
    }
    return firebase.auth();
}

// Check Firebase connection
function checkFirebaseConnection() {
    return new Promise((resolve) => {
        if (!firebaseInitialized) {
            resolve(false);
            return;
        }
        
        const connectedRef = getDatabaseRef('.info/connected');
        connectedRef.on('value', (snap) => {
            resolve(snap.val() === true);
        });
        
        // Timeout sau 3 giây
        setTimeout(() => resolve(false), 3000);
    });
}

// Xuất các hàm
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        firebaseConfig,
        initFirebase,
        getDatabaseRef,
        getAuth,
        checkFirebaseConnection
    };
}