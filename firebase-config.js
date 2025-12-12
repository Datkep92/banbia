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

// Global variables
let database = null;
let currentUser = null;
let currentHKD = null;


// Check if Firebase SDK is loaded
function isFirebaseLoaded() {
    return typeof firebase !== 'undefined' && typeof firebase.initializeApp !== 'undefined';
}

// Initialize Firebase
function initFirebase() {
    try {
        if (!isFirebaseLoaded()) {
            console.error("Firebase SDK not loaded!");
            return null;
        }
        
        // Initialize only if not already initialized
        let app;
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
            console.log("Firebase initialized successfully");
        } else {
            app = firebase.app();
            console.log("Firebase already initialized");
        }
        
        // Get services
        database = firebase.database();
        
        // Check Firebase connection
        checkFirebaseConnection();
        
        return database;
    } catch (error) {
        console.error("Firebase initialization error:", error);
        return null;
    }
}

// Check Firebase connection
function checkFirebaseConnection() {
    if (!database) {
        console.warn("Database not initialized for connection check");
        return;
    }
    
    try {
        const connectedRef = database.ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                console.log("✅ Connected to Firebase");
                document.dispatchEvent(new Event('firebase-connected'));
                
                // Update online status for all HKDs if user is logged in
                if (window.authManager && window.authManager.currentHKD) {
                    window.authManager.updateOnlineStatus(true);
                }
            } else {
                console.log("⚠️ Disconnected from Firebase");
                document.dispatchEvent(new Event('firebase-disconnected'));
            }
        });
    } catch (error) {
        console.error("Firebase connection check error:", error);
    }
}

// Test connection
function testFirebaseConnection() {
    if (!database) {
        console.warn("Database not initialized for connection test");
        return Promise.resolve(false);
    }
    
    return new Promise((resolve, reject) => {
        const testRef = database.ref('.info/serverTimeOffset');
        testRef.once('value')
            .then(() => resolve(true))
            .catch(error => {
                console.error("Firebase connection test failed:", error);
                resolve(false);
            });
    });
}

// Initialize Firebase when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (isFirebaseLoaded()) {
        initFirebase();
        
        // Test connection after a delay
        setTimeout(() => {
            if (database) {
                testFirebaseConnection().then(isConnected => {
                    if (!isConnected && navigator.onLine) {
                        console.warn("Firebase connection may be unstable");
                    }
                });
            }
        }, 1000);
    } else {
        console.error("Firebase SDK not loaded! Make sure to include Firebase scripts before this file.");
        
        // Try to load Firebase SDK dynamically
        loadFirebaseSDK();
    }
});

// Dynamically load Firebase SDK if not loaded
function loadFirebaseSDK() {
    console.log("Attempting to load Firebase SDK dynamically...");
    
    const scripts = [
        'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
        'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js',
        'https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js'
    ];
    
    let loadedCount = 0;
    
    scripts.forEach((src, index) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedCount++;
            console.log(`Loaded: ${src}`);
            
            if (loadedCount === scripts.length) {
                console.log("All Firebase SDK scripts loaded");
                initFirebase();
            }
        };
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
        };
        document.head.appendChild(script);
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { database, firebaseConfig, initFirebase, isFirebaseLoaded };
}