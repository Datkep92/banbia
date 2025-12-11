// Biến toàn cục
let currentCategory = 'lager';
let totalQuantity = 0;
let totalPrice = 0;

// Khởi tạo ứng dụng
document.addEventListener('DOMContentLoaded', function() {
    initApp();
});

function initApp() {
    // Render bia ban đầu
    renderBeers('lager');
    
    // Cập nhật toast
    updateToast();
    
    // Render lịch sử
    renderHistory();
    
    // Thêm sự kiện cho nút loại bia
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            switchCategory(category);
        });
    });
    
    // Sự kiện nút gửi đơn hàng
    document.getElementById('sendOrderBtn').addEventListener('click', sendOrder);
    
    // Sự kiện nút lịch sử
    document.getElementById('showHistoryBtn').addEventListener('click', showHistory);
    
    // Sự kiện đóng popup
    document.getElementById('closePopupBtn').addEventListener('click', closeHistory);
    
    // Sự kiện bộ lọc lịch sử
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            filterHistory(filter);
        });
    });
    
    // Sự kiện xóa lịch sử
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
    
    // Đóng popup khi click bên ngoài
    document.getElementById('historyPopup').addEventListener('click', function(e) {
        if (e.target === this) {
            closeHistory();
        }
    });
    
    // Load giỏ hàng từ localStorage
    loadCartFromStorage();
}

// Chuyển đổi loại bia
function switchCategory(category) {
    currentCategory = category;
    
    // Cập nhật nút active
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-category="${category}"]`).classList.add('active');
    
    // Cập nhật tiêu đề
    const categoryNames = {
        lager: 'LAGER',
        ipa: 'IPA',
        stout: 'STOUT',
        wheat: 'WHEAT',
        ale: 'ALE'
    };
    
    document.querySelector('.category-title h2').innerHTML = 
        `<i class="fas fa-beer"></i> ${categoryNames[category]} <span class="selected-badge">(ĐÃ CHỌN)</span>`;
    
    // Render bia mới
    renderBeers(category);
}

// Render danh sách bia
function renderBeers(category) {
    const beerGrid = document.getElementById('beerGrid');
    const beers = beerData[category];
    
    beerGrid.innerHTML = '';
    
    beers.forEach(beer => {
        const beerCard = document.createElement('div');
        beerCard.className = 'beer-card';
        beerCard.innerHTML = `
            <h3 class="beer-name">${beer.name}</h3>
            <div class="beer-price">${formatPrice(beer.price)} VND</div>
            <div class="quantity-control">
                <button class="quantity-btn minus-btn" data-id="${beer.id}">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="quantity-display" id="quantity-${beer.id}">${beer.quantity}</span>
                <button class="quantity-btn plus-btn" data-id="${beer.id}">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;
        beerGrid.appendChild(beerCard);
    });
    
    // Thêm sự kiện cho nút +/-
    document.querySelectorAll('.plus-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const beerId = parseInt(this.dataset.id);
            changeQuantity(beerId, 1);
        });
    });
    
    document.querySelectorAll('.minus-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const beerId = parseInt(this.dataset.id);
            changeQuantity(beerId, -1);
        });
    });
}

// Thay đổi số lượng bia
function changeQuantity(beerId, change) {
    // Tìm bia trong danh sách hiện tại
    const beers = beerData[currentCategory];
    const beer = beers.find(b => b.id === beerId);
    
    if (beer) {
        const newQuantity = beer.quantity + change;
        if (newQuantity >= 0) {
            beer.quantity = newQuantity;
            
            // Cập nhật hiển thị
            document.getElementById(`quantity-${beerId}`).textContent = newQuantity;
            
            // Cập nhật giỏ hàng
            updateCart(beer, newQuantity);
            
            // Cập nhật toast
            updateToast();
            
            // Animation
            const quantityElement = document.getElementById(`quantity-${beerId}`);
            quantityElement.classList.add('updated');
            setTimeout(() => {
                quantityElement.classList.remove('updated');
            }, 500);
        }
    }
}

// Cập nhật giỏ hàng
function updateCart(beer, quantity) {
    // Xóa bia khỏi giỏ nếu số lượng = 0
    if (quantity === 0) {
        currentCart[currentCategory] = currentCart[currentCategory].filter(item => item.id !== beer.id);
    } else {
        // Tìm bia trong giỏ
        const existingItem = currentCart[currentCategory].find(item => item.id === beer.id);
        
        if (existingItem) {
            existingItem.quantity = quantity;
        } else {
            currentCart[currentCategory].push({
                id: beer.id,
                name: beer.name,
                price: beer.price,
                quantity: quantity
            });
        }
    }
    
    // Lưu vào localStorage
    saveToLocalStorage();
}

// Load giỏ hàng từ storage
function loadCartFromStorage() {
    // Load số lượng từ currentCart
    Object.keys(currentCart).forEach(category => {
        currentCart[category].forEach(cartItem => {
            // Tìm bia trong data và cập nhật số lượng
            const beers = beerData[category];
            if (beers) {
                const beer = beers.find(b => b.id === cartItem.id);
                if (beer) {
                    beer.quantity = cartItem.quantity;
                }
            }
        });
    });
    
    // Render lại bia hiện tại
    renderBeers(currentCategory);
    updateToast();
}

// Cập nhật toast thông báo
function updateToast() {
    // Tính tổng số lượng và tổng tiền từ tất cả loại bia
    totalQuantity = 0;
    totalPrice = 0;
    
    Object.keys(beerData).forEach(category => {
        beerData[category].forEach(beer => {
            totalQuantity += beer.quantity;
            totalPrice += beer.quantity * beer.price;
        });
    });
    
    // Cập nhật hiển thị
    document.getElementById('totalQuantity').textContent = totalQuantity;
    document.getElementById('totalPrice').textContent = formatPrice(totalPrice);
    
    // Animation
    document.getElementById('totalQuantity').classList.add('updated');
    document.getElementById('totalPrice').classList.add('updated');
    setTimeout(() => {
        document.getElementById('totalQuantity').classList.remove('updated');
        document.getElementById('totalPrice').classList.remove('updated');
    }, 500);
}

// Gửi đơn hàng
function sendOrder() {
    if (totalQuantity === 0) {
        alert('Vui lòng chọn ít nhất 1 ly bia!');
        return;
    }
    
    // Tạo đơn hàng mới
    const order = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        items: [],
        totalQuantity: totalQuantity,
        totalPrice: totalPrice
    };
    
    // Lấy tất cả items từ giỏ hàng
    Object.keys(currentCart).forEach(category => {
        currentCart[category].forEach(item => {
            if (item.quantity > 0) {
                order.items.push({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price
                });
            }
        });
    });
    
    // Thêm vào lịch sử
    orderHistory.unshift(order);
    
    // Reset giỏ hàng
    resetCart();
    
    // Lưu vào localStorage
    saveToLocalStorage();
    
    // Cập nhật UI
    updateToast();
    renderHistory();
    
    // Hiển thị thông báo
    alert(`✅ Đơn hàng đã được gửi thành công!\n\nTổng: ${totalQuantity} ly - ${formatPrice(totalPrice)} VND`);
    
    // Reset biến tạm
    totalQuantity = 0;
    totalPrice = 0;
}

// Reset giỏ hàng
function resetCart() {
    // Reset tất cả số lượng về 0
    Object.keys(beerData).forEach(category => {
        beerData[category].forEach(beer => {
            beer.quantity = 0;
        });
    });
    
    // Reset currentCart
    currentCart = { lager: [], ipa: [], stout: [], wheat: [], ale: [] };
    
    // Render lại bia
    renderBeers(currentCategory);
}

// Hiển thị lịch sử
function showHistory() {
    document.getElementById('historyPopup').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Đóng lịch sử
function closeHistory() {
    document.getElementById('historyPopup').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Render lịch sử
function renderHistory(filter = 'all') {
    const historyList = document.getElementById('historyList');
    const filteredHistory = filterHistoryData(filter);
    
    if (filteredHistory.length === 0) {
        historyList.innerHTML = `
            <div class="history-item" style="text-align: center; padding: 40px;">
                <i class="fas fa-history" style="font-size: 3rem; color: #666; margin-bottom: 20px;"></i>
                <p>Chưa có lịch sử đơn hàng</p>
            </div>
        `;
    } else {
        historyList.innerHTML = '';
        
        filteredHistory.forEach(order => {
            const date = new Date(order.timestamp);
            const timeString = date.toLocaleTimeString('vi-VN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            const dateString = date.toLocaleDateString('vi-VN');
            
            const itemsText = order.items.map(item => 
                `${item.name}(${item.quantity})`
            ).join(', ');
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-time">${timeString} ${dateString}</div>
                <div class="history-items">${itemsText}</div>
                <div class="history-amount">${formatPrice(order.totalPrice)} VND</div>
            `;
            historyList.appendChild(historyItem);
        });
    }
    
    // Cập nhật tổng kết
    updateHistorySummary(filteredHistory);
}

// Lọc dữ liệu lịch sử
function filterHistoryData(filter) {
    const now = new Date();
    
    return orderHistory.filter(order => {
        const orderDate = new Date(order.timestamp);
        
        switch(filter) {
            case 'today':
                return orderDate.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                return orderDate >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return orderDate >= monthAgo;
            default:
                return true;
        }
    });
}

// Lọc lịch sử
function filterHistory(filter) {
    // Cập nhật nút active
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
    
    // Render lịch sử đã lọc
    renderHistory(filter);
}

// Cập nhật tổng kết lịch sử
function updateHistorySummary(filteredHistory) {
    const totalOrders = filteredHistory.length;
    const totalAmount = filteredHistory.reduce((sum, order) => sum + order.totalPrice, 0);
    
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('totalHistoryAmount').textContent = formatPrice(totalAmount) + ' VND';
}

// Xóa lịch sử
function clearHistory() {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử đơn hàng?')) {
        orderHistory = [];
        saveToLocalStorage();
        renderHistory('all');
        
        // Reset filter
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('[data-filter="all"]').classList.add('active');
    }
}