# Hệ thống bán hàng Firebase

Hệ thống quản lý bán hàng với Firebase Realtime Database và IndexedDB cho offline support.

## Cấu trúc thư mục
├── index.html # Trang chính - chọn đăng nhập
├── login.html # Trang đăng nhập chung
├── admin.html # Trang quản lý admin
├── hkd.html # Trang bán hàng HKD
├── css/
│ ├── style.css # CSS chung
│ ├── admin.css # CSS cho admin
│ └── hkd.css # CSS cho HKD (mobile optimized)
├── js/
│ ├── firebase-config.js # Cấu hình Firebase
│ ├── indexedDB.js # Quản lý IndexedDB
│ ├── sync-manager.js # Đồng bộ Firebase và IndexedDB
│ ├── auth.js # Xác thực người dùng
│ ├── admin.js # Logic cho admin
│ ├── hkd.js # Logic cho HKD
│ └── utils.js # Hàm tiện ích
└── README.md


## Tính năng

### Admin (admin.html)
- **Dashboard**: Thống kê tổng quan hệ thống
- **Quản lý HKD**: Thêm, sửa, xóa, tìm kiếm HKD
- **Quản lý hóa đơn**: Xem tất cả hóa đơn từ các HKD
- **Import Excel**: Nhập sản phẩm từ file Excel (8 cột)
- **Cài đặt**: Đổi mật khẩu admin

### HKD (hkd.html)
- **Bán hàng**: Giao diện tối ưu cho mobile
- **Danh mục**: Tự động tạo từ dữ liệu import
- **Giỏ hàng**: Thêm/bớt sản phẩm, tính tổng tiền
- **Xuất hàng**: Tạo hóa đơn gửi realtime đến admin
- **Lịch sử**: Xem hóa đơn đã tạo
- **Doanh thu**: Thống kê doanh thu theo thời gian

## Công nghệ sử dụng

- **Firebase Realtime Database**: Lưu trữ và đồng bộ dữ liệu realtime
- **IndexedDB**: Lưu trữ cục bộ, hỗ trợ offline
- **Vanilla JavaScript**: Không dùng framework
- **Bootstrap 5**: Responsive design
- **XLSX library**: Đọc file Excel

## Cài đặt

1. Tạo tài khoản Firebase tại [firebase.google.com](https://firebase.google.com)
2. Tạo project mới
3. Thêm web app và lấy Firebase configuration
4. Cập nhật `firebaseConfig` trong `js/firebase-config.js`
5. Mở file `index.html` trong trình duyệt

## Thông tin đăng nhập mặc định

- **Admin**: `admin` / `123123`
- **HKD**: Sử dụng SĐT và mật khẩu do Admin tạo

## Tính năng đồng bộ

1. **Offline-first**: Lưu dữ liệu cục bộ bằng IndexedDB
2. **Realtime sync**: Đồng bộ khi online với Firebase
3. **Smart sync**: Chỉ đồng bộ dữ liệu thay đổi
4. **Sync queue**: Hàng đợi cho các thao tác offline

## Excel Import Format

File Excel cần có 8 cột:
1. **MSP**: Mã sản phẩm
2. **Tên**: Tên sản phẩm
3. **DVT**: Đơn vị tính
4. **Giá**: Đơn giá
5. **Tồn kho**: Số lượng tồn (không bắt buộc)
6. **Danh mục**: Tên danh mục
7. **Mô tả**: Mô tả sản phẩm
8. **Ghi chú**: Ghi chú thêm

## Hướng dẫn sử dụng

### Admin
1. Đăng nhập với tài khoản admin
2. Tạo HKD mới với SĐT và mật khẩu
3. Import sản phẩm cho HKD từ file Excel
4. Theo dõi hóa đơn realtime từ HKD

### HKD
1. Đăng nhập với SĐT và mật khẩu do Admin cấp
2. Chọn danh mục để xem sản phẩm
3. Click vào sản phẩm để thêm vào giỏ hàng
4. Nhập tên khách hàng (nếu có)
5. Click "Xuất hàng" để tạo hóa đơn
6. Xem lịch sử và doanh thu

## Tính năng bảo mật

- Xác thực đơn giản với IndexedDB
- Phân quyền rõ ràng: Admin vs HKD
- Mật khẩu được lưu trữ local (chỉ demo)

## Lưu ý

- Dự án này dùng cho mục đích demo/học tập
- Trong môi trường production cần thêm:
  - Xác thực Firebase Authentication
  - Bảo mật Firebase Rules
  - Mã hóa mật khẩu
  - HTTPS deployment

## Tác giả

Hệ thống bán hàng Firebase - Phiên bản 1.0