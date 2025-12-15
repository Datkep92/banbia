// Utility functions
const Utils = {
    // Format tiền tệ
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    },
    
    // Format ngày tháng
    formatDate: (dateString, includeTime = true) => {
        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.second = '2-digit';
        }
        
        return date.toLocaleDateString('vi-VN', options);
    },
    
    // Tạo ID duy nhất
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    
    // Validate số điện thoại
    validatePhone: (phone) => {
        const regex = /^(0|\+84)(\d{9,10})$/;
        return regex.test(phone);
    },
    
    // Validate email
    validateEmail: (email) => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },
    
    // Debounce function
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Parse Excel data
    parseExcelData: (data) => {
        // Giả sử data là array của các row từ Excel
        // 8 columns: MSP, Tên, DVT, Giá, Tồn kho, Danh mục, Mô tả, Ghi chú
        return data.map(row => ({
            msp: row[0] || '',
            name: row[1] || '',
            unit: row[2] || '',
            price: parseFloat(row[3]) || 0,
            stock: parseInt(row[4]) || 0,
            category: row[5] || 'Khác',
            description: row[6] || '',
            note: row[7] || '',
            id: Utils.generateId(),
            lastUpdated: new Date().toISOString()
        }));
    },
    
    // Tính tổng tiền hóa đơn
    calculateInvoiceTotal: (items) => {
        return items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
    },
    
    // Hiển thị loading
    showLoading: (message = 'Đang xử lý...') => {
        // Xóa loading cũ nếu có
        Utils.hideLoading();
        
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'global-loading';
        loadingDiv.className = 'global-loading';
        loadingDiv.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        document.body.appendChild(loadingDiv);
    },
    
    // Ẩn loading
    hideLoading: () => {
        const loadingDiv = document.getElementById('global-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    },
    
    // Hiển thị toast message
    showToast: (message, type = 'info', duration = 3000) => {
        // Xóa toast cũ nếu có
        const oldToast = document.getElementById('global-toast');
        if (oldToast) {
            oldToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = `global-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${
                    type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'
                }"></i>
            </div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="Utils.hideToast()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(toast);
        
        // Tự động ẩn sau duration
        setTimeout(() => {
            Utils.hideToast();
        }, duration);
    },
    
    // Ẩn toast
    hideToast: () => {
        const toast = document.getElementById('global-toast');
        if (toast) {
            toast.classList.add('hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    },
    
    // Sửa hàm confirm trong utils.js
confirm: (message, title = 'Xác nhận') => {
    return new Promise((resolve) => {
        // Tạo dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-backdrop"></div>
            <div class="confirm-content">
                <div class="confirm-header">
                    <h3>${title}</h3>
                    <button class="confirm-close" onclick="this.closest('.confirm-dialog').remove(); window.__confirmResolve && window.__confirmResolve(false)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="confirm-body">
                    <p>${message}</p>
                </div>
                <div class="confirm-footer">
                    <button class="btn-secondary" onclick="this.closest('.confirm-dialog').remove(); window.__confirmResolve && window.__confirmResolve(false)">
                        Hủy
                    </button>
                    <button class="btn-primary" onclick="this.closest('.confirm-dialog').remove(); window.__confirmResolve && window.__confirmResolve(true)">
                        Xác nhận
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Lưu resolve function vào window
        window.__confirmResolve = resolve;
        
        // Xử lý click backdrop
        dialog.querySelector('.confirm-backdrop').addEventListener('click', () => {
            dialog.remove();
            if (window.__confirmResolve) {
                window.__confirmResolve(false);
                delete window.__confirmResolve;
            }
        });
        
        // Xử lý khi dialog bị xóa
        const observer = new MutationObserver(() => {
            if (!document.body.contains(dialog)) {
                if (window.__confirmResolve) {
                    window.__confirmResolve(false);
                    delete window.__confirmResolve;
                }
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    });
},
    
    // Download file
    downloadFile: (content, fileName, contentType) => {
        const a = document.createElement('a');
        const file = new Blob([content], {type: contentType});
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    },
    
    // Upload file
    uploadFile: (accept = '.csv,.xlsx,.xls') => {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.style.display = 'none';
            
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('Không có file được chọn'));
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    resolve({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        data: event.target.result
                    });
                };
                reader.onerror = () => {
                    reject(new Error('Lỗi đọc file'));
                };
                
                reader.readAsBinaryString(file);
            };
            
            input.oncancel = () => {
                reject(new Error('Đã hủy chọn file'));
            };
            
            document.body.appendChild(input);
            input.click();
            setTimeout(() => {
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            }, 1000);
        });
    }
};

// Thêm CSS cho các component tiện ích
(function addUtilityStyles() {
    if (document.getElementById('utility-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'utility-styles';
    style.textContent = `
        /* Loading styles */
        .global-loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }
        
        .loading-content {
            background: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4a6ee0;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Toast styles */
        .global-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            padding: 15px;
            min-width: 300px;
            max-width: 400px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            border-left: 4px solid #4a6ee0;
        }
        
        .global-toast.success {
            border-left-color: #48bb78;
        }
        
        .global-toast.error {
            border-left-color: #f56565;
        }
        
        .global-toast.warning {
            border-left-color: #ed8936;
        }
        
        .global-toast.hiding {
            animation: slideOut 0.3s ease forwards;
        }
        
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
        
        .toast-icon {
            margin-right: 15px;
            font-size: 24px;
        }
        
        .toast-icon .fa-check-circle {
            color: #48bb78;
        }
        
        .toast-icon .fa-exclamation-circle {
            color: #f56565;
        }
        
        .toast-icon .fa-exclamation-triangle {
            color: #ed8936;
        }
        
        .toast-icon .fa-info-circle {
            color: #4a6ee0;
        }
        
        .toast-message {
            flex: 1;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .toast-close {
            background: none;
            border: none;
            color: #a0aec0;
            cursor: pointer;
            padding: 5px;
            margin-left: 10px;
            font-size: 16px;
        }
        
        /* Confirm dialog styles */
        .confirm-dialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
        }
        
        .confirm-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
        }
        
        .confirm-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        
        .confirm-header {
            padding: 20px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .confirm-header h3 {
            margin: 0;
            font-size: 18px;
            color: #2d3748;
        }
        
        .confirm-close {
            background: none;
            border: none;
            color: #a0aec0;
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }
        
        .confirm-close:hover {
            background: #f7fafc;
        }
        
        .confirm-body {
            padding: 20px;
        }
        
        .confirm-body p {
            margin: 0;
            color: #4a5568;
            line-height: 1.5;
        }
        
        .confirm-footer {
            padding: 20px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        
        .btn-secondary, .btn-primary {
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
            border: none;
        }
        
        .btn-secondary:hover {
            background: #cbd5e0;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #4a6ee0 0%, #6a8cff 100%);
            color: white;
            border: none;
        }
        
        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 5px 15px rgba(74, 110, 224, 0.2);
        }
    `;
    
    document.head.appendChild(style);
})();

// Xuất các hàm
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}