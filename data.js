// Dữ liệu bia theo từng loại
const beerData = {
    lager: [
        { id: 1, name: "Tiger", price: 25000, quantity: 0 },
        { id: 2, name: "Heineken", price: 30000, quantity: 0 },
        { id: 3, name: "Budweiser", price: 28000, quantity: 0 },
        { id: 4, name: "Sapporo", price: 35000, quantity: 0 },
        { id: 5, name: "Larue", price: 20000, quantity: 0 },
        { id: 6, name: "333", price: 18000, quantity: 0 },
        { id: 7, name: "Saigon", price: 22000, quantity: 0 },
        { id: 8, name: "Habeco", price: 21000, quantity: 0 }
    ],
    ipa: [
        { id: 9, name: "IPA Tiger", price: 40000, quantity: 0 },
        { id: 10, name: "Bia Cá Vàng", price: 35000, quantity: 0 },
        { id: 11, name: "Huda Gold", price: 32000, quantity: 0 },
        { id: 12, name: "Bia Sài Gòn Đỏ", price: 28000, quantity: 0 },
        { id: 13, name: "Bia Larue Đặc Biệt", price: 30000, quantity: 0 },
        { id: 14, name: "Bia Hà Nội Xanh", price: 27000, quantity: 0 },
        { id: 15, name: "Bia Sài Gòn Xanh", price: 25000, quantity: 0 },
        { id: 16, name: "Bia Huda Đỏ", price: 29000, quantity: 0 }
    ],
    stout: [
        { id: 17, name: "Guinness", price: 45000, quantity: 0 },
        { id: 18, name: "Kilkenny", price: 42000, quantity: 0 },
        { id: 19, name: "Murphy's", price: 43000, quantity: 0 },
        { id: 20, name: "Beamish", price: 41000, quantity: 0 },
        { id: 21, name: "Mackeson", price: 38000, quantity: 0 },
        { id: 22, name: "Young's", price: 39000, quantity: 0 },
        { id: 23, name: "Sam Smith's", price: 44000, quantity: 0 },
        { id: 24, name: "Left Hand", price: 46000, quantity: 0 }
    ],
    wheat: [
        { id: 25, name: "Hoegaarden", price: 35000, quantity: 0 },
        { id: 26, name: "Blue Moon", price: 38000, quantity: 0 },
        { id: 27, name: "Weihenstephaner", price: 42000, quantity: 0 },
        { id: 28, name: "Franziskaner", price: 40000, quantity: 0 },
        { id: 29, name: "Paulaner", price: 39000, quantity: 0 },
        { id: 30, name: "Schneider", price: 41000, quantity: 0 },
        { id: 31, name: "Erdinger", price: 37000, quantity: 0 },
        { id: 32, name: "Hacker-Pschorr", price: 43000, quantity: 0 }
    ],
    ale: [
        { id: 33, name: "Pale Ale", price: 32000, quantity: 0 },
        { id: 34, name: "Brown Ale", price: 34000, quantity: 0 },
        { id: 35, name: "Red Ale", price: 33000, quantity: 0 },
        { id: 36, name: "Scotch Ale", price: 36000, quantity: 0 },
        { id: 37, name: "Strong Ale", price: 38000, quantity: 0 },
        { id: 38, name: "Old Ale", price: 37000, quantity: 0 },
        { id: 39, name: "Burton Ale", price: 35000, quantity: 0 },
        { id: 40, name: "Mild Ale", price: 31000, quantity: 0 }
    ]
};

// Lưu trữ lịch sử đơn hàng
let orderHistory = JSON.parse(localStorage.getItem('beerOrderHistory')) || [];

// Giỏ hàng hiện tại
let currentCart = JSON.parse(localStorage.getItem('currentCart')) || { lager: [], ipa: [], stout: [], wheat: [], ale: [] };

// Cập nhật localStorage
function saveToLocalStorage() {
    localStorage.setItem('beerOrderHistory', JSON.stringify(orderHistory));
    localStorage.setItem('currentCart', JSON.stringify(currentCart));
}

// Định dạng số tiền
function formatPrice(price) {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}