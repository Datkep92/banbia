// main.js - Quản lý thứ tự load module
const ModuleLoader = {
    modules: {},
    loaded: {},
    
    register: function(name, module) {
        this.modules[name] = module;
    },
    
    load: function(name) {
        if (this.loaded[name]) {
            return Promise.resolve(this.modules[name]);
        }
        
        return new Promise((resolve, reject) => {
            if (this.modules[name]) {
                this.loaded[name] = true;
                resolve(this.modules[name]);
            } else {
                reject(new Error(`Module ${name} not found`));
            }
        });
    },
    
    loadAll: function(modules) {
        const promises = modules.map(module => this.load(module));
        return Promise.all(promises);
    }
};

// Register core modules
ModuleLoader.register('firebase', { init: initFirebase });
ModuleLoader.register('indexedDB', { init: initIndexedDB });
ModuleLoader.register('auth', { init: initAuth });
ModuleLoader.register('sync', { init: initSyncManager });

// Global helper để kiểm tra module đã load
window.isModuleLoaded = function(moduleName) {
    return ModuleLoader.loaded[moduleName] || false;
};

// Xuất ModuleLoader
window.ModuleLoader = ModuleLoader;