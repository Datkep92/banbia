class Utils {
    constructor() {
        this.initEventListeners();
        console.log("Utils initialized");
    }
    
    // Format tiền tệ
    formatCurrency(amount) {
        try {
            if (isNaN(amount)) amount = 0;
            return new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
            }).format(amount);
        } catch (error) {
            console.error('Error formatting currency:', error);
            return amount + ' đ';
        }
    }
    
    // Format ngày tháng với thời gian
    formatDateTime(timestamp) {
        try {
            if (!timestamp) return 'N/A';
            
            // Chuyển timestamp thành số nếu là chuỗi
            const time = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
            const date = new Date(time);
            
            // Kiểm tra date hợp lệ
            if (isNaN(date.getTime())) {
                return 'N/A';
            }
            
            return date.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }) + ' ' + date.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date time:', error);
            return 'N/A';
        }
    }
    
    // Format ngày tháng
    formatDate(timestamp, includeTime = false) {
        try {
            if (!timestamp) return 'N/A';
            const date = new Date(timestamp);
            
            if (includeTime) {
                return date.toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                return date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            }
        } catch (error) {
            console.error('Error formatting date:', error);
            return timestamp || 'N/A';
        }
    }
    
    // Format thời gian
    formatTime(timestamp) {
        try {
            if (!timestamp) return 'N/A';
            const date = new Date(timestamp);
            
            return date.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting time:', error);
            return 'N/A';
        }
    }
    
    // Hiển thị thông báo
    showNotification(message, type = 'info', duration = 4000) {
        try {
            // Remove existing notification
            const existingNotification = document.querySelector('.app-notification');
            if (existingNotification) {
                existingNotification.remove();
            }
            
            const notification = document.createElement('div');
            notification.className = `app-notification ${type}`;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            // Auto-hide
            setTimeout(() => {
                notification.remove();
            }, duration);
            
            // Log to console for debugging
            console.log(`[Notification ${type.toUpperCase()}]: ${message}`);
            
        } catch (error) {
            console.error('Error showing notification:', error);
            // Fallback for non-browser environments
            alert(`[${type.toUpperCase()}]: ${message}`);
        }
    }
    
    // Hiển thị trạng thái loading
    showLoading(message = 'Đang xử lý...') {
        let loading = document.getElementById('app-loading-overlay');
        if (!loading) {
            loading = document.createElement('div');
            loading.id = 'app-loading-overlay';
            loading.innerHTML = `
                <div class="loading-spinner"></div>
                <p class="loading-message">${message}</p>
            `;
            document.body.appendChild(loading);
        } else {
             const messageEl = loading.querySelector('.loading-message');
             if(messageEl) messageEl.textContent = message;
             loading.style.display = 'flex';
        }
    }
    
    // Ẩn trạng thái loading
    hideLoading() {
        const loading = document.getElementById('app-loading-overlay');
        if (loading) {
            loading.style.display = 'none';
        }
    }
    
    // Validate số điện thoại (đơn giản)
    validatePhone(phone) {
        if (!phone) return false;
        // Kiểm tra xem có phải là 8-15 chữ số
        return /^\d{8,15}$/.test(phone.replace(/\s/g, ''));
    }
    
    // Validate email (đơn giản)
    validateEmail(email) {
        if (!email) return false;
        // Kiểm tra định dạng cơ bản
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    // TẠO ID DUY NHẤT (FIX CHO LỖI createSale)
    generateUniqueId(prefix = 'id') {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `${prefix}_${timestamp}_${random}`;
    }
    
    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Định dạng số (thêm dấu phẩy phân cách hàng nghìn)
    formatNumber(number) {
        try {
            if (isNaN(number)) return '0';
            return new Intl.NumberFormat('vi-VN').format(number);
        } catch (error) {
            console.error('Error formatting number:', error);
            return number.toString();
        }
    }
    
    // Lấy thời gian hiện tại dưới dạng timestamp
    getCurrentTimestamp() {
        return Date.now();
    }
    
    // Tính khoảng thời gian từ timestamp đến hiện tại
    getTimeAgo(timestamp) {
        try {
            if (!timestamp) return 'Không xác định';
            
            const now = Date.now();
            const diff = now - timestamp;
            
            const minute = 60 * 1000;
            const hour = minute * 60;
            const day = hour * 24;
            const week = day * 7;
            const month = day * 30;
            const year = day * 365;
            
            if (diff < minute) return 'Vừa xong';
            if (diff < hour) return `${Math.floor(diff / minute)} phút trước`;
            if (diff < day) return `${Math.floor(diff / hour)} giờ trước`;
            if (diff < week) return `${Math.floor(diff / day)} ngày trước`;
            if (diff < month) return `${Math.floor(diff / week)} tuần trước`;
            if (diff < year) return `${Math.floor(diff / month)} tháng trước`;
            return `${Math.floor(diff / year)} năm trước`;
            
        } catch (error) {
            console.error('Error calculating time ago:', error);
            return 'N/A';
        }
    }
    
    // Khởi tạo event listeners
    initEventListeners() {
        try {
            // Online/offline status
            window.addEventListener('online', () => {
                this.showNotification('Đã kết nối lại mạng', 'success');
            });
            
            window.addEventListener('offline', () => {
                this.showNotification('Mất kết nối mạng - Đang chế độ offline', 'warning');
            });
        } catch (error) {
            console.error('Error initializing event listeners:', error);
        }
    }

    // THÊM: Tạo Modal (Popup)
    createModal(title, content, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'hkd-modal show';
        
        let buttonsHtml = '';
        buttons.forEach(btn => {
            buttonsHtml += `
                <button class="hkd-btn hkd-btn-${btn.class || 'secondary'} ${btn.action === 'close' ? 'modal-close-action' : ''}">
                    ${btn.text}
                </button>
            `;
        });
        
        modal.innerHTML = `
            <div class="hkd-modal-content">
                <div class="hkd-modal-header">
                    <h3>${title}</h3>
                    <button class="hkd-modal-close">&times;</button>
                </div>
                <div class="hkd-modal-body">
                    ${content}
                </div>
                <div class="hkd-modal-footer">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Thêm method close
        modal.close = function() {
            this.classList.remove('show');
            setTimeout(() => this.remove(), 300);
        };
        
        // Xử lý nút đóng (X icon và overlay click)
        modal.querySelector('.hkd-modal-close').addEventListener('click', () => modal.close());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.close();
            }
        });
        
        // Xử lý các nút action trong footer
        modal.querySelectorAll('.hkd-modal-footer .hkd-btn').forEach((buttonElement, index) => {
            const btn = buttons[index];
            if (btn) {
                if (btn.action === 'close') {
                    buttonElement.addEventListener('click', () => modal.close());
                } else if (btn.action) {
                    // Bind action function
                    buttonElement.addEventListener('click', () => btn.action(modal));
                }
            }
        });
        
        return modal;
    }
}

// Tạo instance toàn cục
let utils;
try {
    utils = new Utils();
    // Gán vào window
    if (typeof window !== 'undefined') {
        window.utils = utils;
    }
} catch (error) {
    console.error('Failed to create Utils:', error);
    // Fallback object (đã thêm tất cả các hàm mới)
    utils = {
        formatCurrency: (amount) => amount + ' đ',
        formatDateTime: (timestamp) => {
            try {
                if (!timestamp) return 'N/A';
                const date = new Date(timestamp);
                return date.toLocaleString('vi-VN');
            } catch (e) { return 'N/A'; }
        },
        formatDate: (timestamp, includeTime = false) => {
            try {
                if (!timestamp) return 'N/A';
                const date = new Date(timestamp);
                if (includeTime) return date.toLocaleString('vi-VN');
                return date.toLocaleDateString('vi-VN');
            } catch (e) { return 'N/A'; }
        },
        formatTime: (timestamp) => {
            try {
                if (!timestamp) return 'N/A';
                const date = new Date(timestamp);
                return date.toLocaleTimeString('vi-VN');
            } catch (e) { return 'N/A'; }
        },
        showNotification: (msg) => alert(msg),
        showLoading: () => {},
        hideLoading: () => {},
        validatePhone: () => true,
        validateEmail: () => true,
        generateUniqueId: (prefix = 'id') => `${prefix}_${Date.now()}`,
        formatNumber: (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        getCurrentTimestamp: () => Date.now(),
        getTimeAgo: (timestamp) => 'Vừa xong',
        // THÊM FALLBACK CHO createModal
        createModal: (title, content) => {
             console.warn(`Modal: ${title} - ${content}`);
             return { close: () => {} };
        } 
    };
    if (typeof window !== 'undefined') {
        window.utils = utils;
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Utils, utils };
}