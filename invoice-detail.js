// invoice-detail.js
class InvoiceDetailManager {
    constructor() {
        this.hkdProducts = {}; // Lưu trữ sản phẩm của HKD theo format: {code: {category, originalName, displayName, ...}}
        this.saleData = null;
        this.mappingComplete = false;
    }
    
    /**
     * Hiển thị chi tiết hóa đơn với mapping chính xác danh mục và mã hàng
     * @param {string} saleId - ID của đơn hàng
     * @param {string} hkdId - ID của HKD
     */
    async showInvoiceDetail(saleId, hkdId = null) {
        try {
            window.utils.showLoading('Đang tải chi tiết hóa đơn...');
            
            // Lấy dữ liệu đơn hàng
            const sale = await this.getSaleData(saleId, hkdId);
            if (!sale) {
                window.utils.showNotification('Không tìm thấy đơn hàng', 'error');
                return;
            }
            
            this.saleData = sale;
            
            // Nếu có hkdId, load sản phẩm để mapping
            if (hkdId) {
                await this.loadHKDProducts(hkdId);
            } else if (sale.hkdId) {
                await this.loadHKDProducts(sale.hkdId);
            }
            
            // Tạo và hiển thị modal
            this.createInvoiceModal();
            
        } catch (error) {
            console.error('Error showing invoice detail:', error);
            window.utils.showNotification('Lỗi tải chi tiết hóa đơn', 'error');
        } finally {
            window.utils.hideLoading();
        }
    }
    
    /**
     * Lấy dữ liệu đơn hàng từ database
     */
    async getSaleData(saleId, hkdId = null) {
        try {
            let sale = null;
            
            // Thử tìm trong node /sales tổng hợp trước
            const salesSnapshot = await database.ref(`sales/${saleId}`).once('value');
            if (salesSnapshot.exists()) {
                sale = salesSnapshot.val();
                sale.id = saleId;
            } else {
                // Nếu không tìm thấy, thử trong cấu trúc lồng của HKD
                if (hkdId) {
                    const hkdSaleSnapshot = await database.ref(`hkds/${hkdId}/sales/${saleId}`).once('value');
                    if (hkdSaleSnapshot.exists()) {
                        sale = hkdSaleSnapshot.val();
                        sale.id = saleId;
                        sale.hkdId = hkdId;
                    }
                }
            }
            
            return sale;
        } catch (error) {
            console.error('Error getting sale data:', error);
            return null;
        }
    }
    
/**
 * Load sản phẩm của HKD để mapping chính xác
 */
async loadHKDProducts(hkdId) {
    try {
        console.log(`🔍 Loading HKD products for: ${hkdId}`);
        
        const snapshot = await database.ref(`hkds/${hkdId}/products`).once('value');
        const products = snapshot.val();
        
        this.hkdProducts = {};
        
        if (products) {
            Object.keys(products).forEach(key => {
                const product = products[key];
                if (product.code) {
                    // CHUẨN HÓA KEY: Chuyển mã thành chữ HOA
                    const normalizedCode = product.code.toUpperCase();
                    
                    console.log(`📦 Product ${normalizedCode}:`, {
                        originalName: product.originalName,
                        displayName: product.displayName,
                        name: product.name,
                        metadata: product.metadata
                    });
                    
                    this.hkdProducts[normalizedCode] = {
                        category: product.category || 'Khác',
                        originalName: product.originalName || product.metadata?.originalName || product.displayName || product.name || '',
                        displayName: product.displayName || product.name || '',
                        unit: product.unit || 'cái',
                        price: product.price || 0,
                        metadata: product.metadata || {}
                    };
                }
            });
        }
        
        console.log(`✅ Loaded ${Object.keys(this.hkdProducts).length} products for mapping`);
        console.log('📊 HKD Products map keys:', Object.keys(this.hkdProducts));
        
        this.mappingComplete = true;
        
    } catch (error) {
        console.error('❌ Error loading HKD products:', error);
        this.mappingComplete = false;
    }
}
    
    /**
 * Mapping sản phẩm từ đơn hàng với dữ liệu import
 */
mapProductData(item) {
    // CHUẨN HÓA MÃ SẢN PHẨM: Chuyển thành chữ HOA
    const productCode = (item.code || item.metadata?.code || '').toUpperCase();
    
    console.log('🔍 DEBUG mapProductData:', {
        originalCode: item.code || item.metadata?.code,
        normalizedCode: productCode,
        hkdProductsKeys: Object.keys(this.hkdProducts)
    });
    
    let mappedData = {
        category: 'Không xác định',
        originalName: '',
        displayName: '',
        unit: 'cái',
        mapped: false
    };
    
    if (productCode && this.hkdProducts[productCode]) {
        const hkdProduct = this.hkdProducts[productCode];
        console.log('✅ Found HKD product:', hkdProduct);
        
        mappedData = {
            category: hkdProduct.category,
            originalName: hkdProduct.originalName || hkdProduct.displayName || hkdProduct.name || item.originalName || item.metadata?.originalName || item.displayName || item.name || '',
            displayName: hkdProduct.displayName || hkdProduct.name || item.displayName || item.name || '',
            unit: hkdProduct.unit,
            mapped: true
        };
    } else {
        // Fallback nếu không tìm thấy mapping
        console.log('⚠️ No HKD product found for code:', productCode);
        
        mappedData = {
            category: item.category || item.metadata?.category || 'Không xác định',
            originalName: item.originalName || item.metadata?.originalName || item.displayName || item.name || '',
            displayName: item.displayName || item.name || '',
            unit: item.unit || item.metadata?.unit || 'cái',
            mapped: false
        };
    }
    
    console.log('📋 Final mapped data:', mappedData);
    
    return {
        ...mappedData,
        code: productCode || item.code || 'N/A',
        price: item.price || 0,
        total: item.total || 0,
        quantity: item.quantity || 1,
        note: item.note || item.description || item.metadata?.note || ''
    };
}
    
    /**
     * Tạo modal hiển thị hóa đơn
     */
    createInvoiceModal() {
        const sale = this.saleData;
        const totalBeforeDiscount = sale.totalAmount || sale.total || 0;
        const discount = sale.discount || 0;
        const finalTotal = totalBeforeDiscount - discount;
        
        // Tạo bảng chi tiết sản phẩm với mapping
        const productTableHTML = this.createProductTable();
        
        // Tạo modal content
        const modalContent = `
            <div style="max-width: 1600px; width: 95vw;">
                <!-- Header với thông tin đơn hàng -->
                <div style="background: linear-gradient(135deg, #0f3460, #16213e); color: white; padding: 25px 30px; border-radius: 12px 12px 0 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                        <div>
                            <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; display: flex; align-items: center; gap: 10px;">
                                📄 HÓA ĐƠN BÁN HÀNG
                                ${this.mappingComplete ? 
                                    '<span style="font-size: 0.8rem; background: #28a745; padding: 2px 10px; border-radius: 10px;">Đã mapping</span>' : 
                                    '<span style="font-size: 0.8rem; background: #ffc107; color: #000; padding: 2px 10px; border-radius: 10px;">Chưa mapping</span>'
                                }
                            </h2>
                            <div style="display: flex; gap: 30px; font-size: 0.95rem; opacity: 0.9;">
                                <div>
                                    <div style="font-weight: 500; margin-bottom: 5px;">Mã đơn hàng:</div>
                                    <code style="background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 4px; font-size: 1.1rem;">
                                        ${sale.id || 'N/A'}
                                    </code>
                                </div>
                                <div>
                                    <div style="font-weight: 500; margin-bottom: 5px;">Ngày tạo:</div>
                                    <div>${window.utils.formatDate(sale.timestamp, true)}</div>
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 2.5rem; font-weight: 700; color: #28a745; margin-bottom: 5px;">
                                ${window.utils.formatCurrency(finalTotal)}
                            </div>
                            <div style="font-size: 0.9rem; opacity: 0.8;">TỔNG THÀNH TIỀN</div>
                        </div>
                    </div>
                    
                    <!-- Thông tin khách hàng và HKD -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px;">
                        <div>
                            <h4 style="margin: 0 0 10px 0; font-size: 1.1rem;">👤 THÔNG TIN KHÁCH HÀNG</h4>
                            <p style="margin: 5px 0;"><strong>Tên:</strong> ${sale.customerName || sale.customer || 'Khách lẻ'}</p>
                            <p style="margin: 5px 0;"><strong>SĐT:</strong> ${sale.customerPhone || sale.phone || 'N/A'}</p>
                        </div>
                        <div>
                            <h4 style="margin: 0 0 10px 0; font-size: 1.1rem;">🏪 THÔNG TIN HKD</h4>
                            <p style="margin: 5px 0;"><strong>Tên HKD:</strong> ${sale.hkdName || 'Không xác định'}</p>
                            <p style="margin: 5px 0;"><strong>Mã HKD:</strong> ${sale.hkdId || 'N/A'}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Thống kê tổng hợp -->
                <div style="background: #e8f4fd; padding: 20px 30px; border-bottom: 1px solid #cfe2ff;">
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;">
                        <div style="text-align: center;">
                            <div style="font-size: 1.1rem; color: #495057; margin-bottom: 5px;">Tổng tiền (trước giảm)</div>
                            <div style="font-size: 1.4rem; font-weight: 600; color: #333;">
                                ${window.utils.formatCurrency(totalBeforeDiscount)}
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.1rem; color: #495057; margin-bottom: 5px;">Giảm giá</div>
                            <div style="font-size: 1.4rem; font-weight: 600; color: #dc3545;">
                                -${window.utils.formatCurrency(discount)}
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.1rem; color: #495057; margin-bottom: 5px;">Số sản phẩm</div>
                            <div style="font-size: 1.4rem; font-weight: 600; color: #17a2b8;">
                                ${sale.items?.length || 0}
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.1rem; color: #495057; margin-bottom: 5px;">Tổng số lượng</div>
                            <div style="font-size: 1.4rem; font-weight: 600; color: #6f42c1;">
                                ${sale.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Bảng chi tiết sản phẩm -->
                <div style="padding: 30px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <span>📦 CHI TIẾT SẢN PHẨM</span>
                        <small style="font-size: 0.9rem; font-weight: normal;">
                            ${this.mappingComplete ? '✅ Đã map với dữ liệu import' : '⚠️ Chưa có dữ liệu import để map'}
                        </small>
                    </h3>
                    ${productTableHTML}
                </div>
                
                <!-- Footer với tổng kết -->
                <div style="background: #f8f9fa; padding: 20px 30px; border-top: 1px solid #dee2e6; border-radius: 0 0 12px 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="color: #6c757d; font-size: 0.9rem;">
                            <p style="margin: 5px 0;">Được tạo bởi hệ thống Admin Dashboard</p>
                            <p style="margin: 5px 0;">Thời gian xuất: ${window.utils.formatDate(Date.now(), true)}</p>
                        </div>
                        <div style="text-align: right;">
                            <h4 style="margin: 0 0 10px 0; color: #333;">TỔNG KẾT</h4>
                            <div style="font-size: 1.3rem; font-weight: 700; color: #28a745;">
                                ${window.utils.formatCurrency(finalTotal)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Tạo modal
        const modal = document.createElement('div');
        modal.className = 'hkd-modal invoice-modal show';
        modal.innerHTML = `
            <div class="hkd-modal-content">
                <div class="hkd-modal-header">
                    <h3>Chi tiết đơn hàng #${sale.id ? sale.id.substring(0, 8) + '...' : 'N/A'}</h3>
                    <button class="hkd-modal-close">&times;</button>
                </div>
                <div class="hkd-modal-body">
                    ${modalContent}
                </div>
                <div class="hkd-modal-footer">
                    <button class="hkd-btn hkd-btn-secondary" id="close-invoice-btn">Đóng</button>
                    <button class="hkd-btn hkd-btn-success" id="export-invoice-excel">
                        <i class="fas fa-file-excel"></i> Xuất Excel
                    </button>
                    <button class="hkd-btn hkd-btn-primary" id="print-invoice-btn">
                        <i class="fas fa-print"></i> In hóa đơn
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Thêm CSS cho modal hóa đơn nếu chưa có
        this.addInvoiceStyles();
        
        // Xử lý sự kiện
        this.setupModalEvents(modal);
    }
    
    /**
     * Tạo bảng chi tiết sản phẩm với 10 cột
     */
    createProductTable() {
        const sale = this.saleData;
        
        if (!sale.items || !Array.isArray(sale.items) || sale.items.length === 0) {
            return `
                <div style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                    <div style="font-size: 48px; color: #ddd; margin-bottom: 10px;">📦</div>
                    <p style="color: #6c757d; margin: 0;">Không có chi tiết sản phẩm</p>
                </div>
            `;
        }
        
        let tableHTML = `
            <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                <table class="invoice-products-table" style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #f8f9fa, #e9ecef); position: sticky; top: 0; z-index: 10;">
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: center; width: 50px; position: sticky; top: 0;">STT</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: left; position: sticky; top: 0;">Danh mục</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: left; position: sticky; top: 0;">Tên thường gọi</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: center; width: 100px; position: sticky; top: 0;">Mã SP</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: center; width: 100px; position: sticky; top: 0;">Đơn vị tính</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: right; width: 120px; position: sticky; top: 0;">Đơn giá</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: right; width: 120px; position: sticky; top: 0;">Thành tiền</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: left; width: 150px; position: sticky; top: 0;">Ghi chú</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: left; position: sticky; top: 0;">Tên gốc</th>
                            <th style="padding: 12px 8px; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px; position: sticky; top: 0;">Số lượng</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sale.items.forEach((item, index) => {
            const mappedProduct = this.mapProductData(item);
            const isMapped = mappedProduct.mapped;
            
            tableHTML += `
                <tr style="border-bottom: 1px solid #f0f0f0; transition: background 0.2s; ${isMapped ? 'background: rgba(40, 167, 69, 0.03);' : ''}">
                    <td style="padding: 10px 8px; text-align: center; color: #666;">${index + 1}</td>
                    <td style="padding: 10px 8px; color: #495057;">
                        <span style="display: inline-flex; align-items: center; gap: 5px;">
                            ${mappedProduct.category}
                            ${isMapped ? '<span style="color: #28a745; font-size: 0.8em;" title="Đã map với import">✓</span>' : ''}
                        </span>
                    </td>
                    <td style="padding: 10px 8px; color: #212529; font-weight: 500;">${mappedProduct.displayName}</td>
                    <td style="padding: 10px 8px; text-align: center;">
                        <code style="background: #f8f9fa; padding: 3px 6px; border-radius: 4px; font-family: monospace; border: 1px solid ${isMapped ? '#28a745' : '#ddd'};">
                            ${mappedProduct.code}
                        </code>
                    </td>
                    <td style="padding: 10px 8px; text-align: center; color: #6c757d;">${mappedProduct.unit}</td>
                    <td style="padding: 10px 8px; text-align: right; font-family: 'Consolas', monospace; color: #28a745;">
                        ${window.utils.formatCurrency(mappedProduct.price)}
                    </td>
                    <td style="padding: 10px 8px; text-align: right; font-family: 'Consolas', monospace; font-weight: 600; color: #007bff;">
                        ${window.utils.formatCurrency(mappedProduct.total)}
                    </td>
                    <td style="padding: 10px 8px; color: #6c757d; font-size: 0.9em;">${mappedProduct.note || '-'}</td>
                    <td style="padding: 10px 8px; color: #6c757d; font-size: 0.9em;" title="${mappedProduct.originalName}">
                        ${mappedProduct.originalName.length > 30 ? mappedProduct.originalName.substring(0, 30) + '...' : mappedProduct.originalName}
                        ${!isMapped && mappedProduct.originalName ? '<span style="color: #ffc107; margin-left: 5px;" title="Chưa map">⚠️</span>' : ''}
                    </td>
                    <td style="padding: 10px 8px; text-align: center; font-weight: 500; color: #495057;">${mappedProduct.quantity}</td>
                </tr>
            `;
        });
        
        tableHTML += `
                    </tbody>
                </table>
            </div>
            
            <!-- Mapping status summary -->
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${this.mappingComplete ? '#28a745' : '#ffc107'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Trạng thái mapping:</strong>
                        <span style="margin-left: 10px; padding: 3px 10px; border-radius: 4px; background: ${this.mappingComplete ? '#d4edda' : '#fff3cd'}; color: ${this.mappingComplete ? '#155724' : '#856404'};">
                            ${this.mappingComplete ? '✅ Đã map với dữ liệu import' : '⚠️ Chưa có dữ liệu import để map'}
                        </span>
                    </div>
                    <div style="font-size: 0.9rem; color: #6c757d;">
                        Tổng: ${sale.items.length} sản phẩm | 
                        Đã map: ${sale.items.filter(item => {
                            const productCode = item.code || item.metadata?.code;
                            return productCode && this.hkdProducts[productCode];
                        }).length}
                    </div>
                </div>
            </div>
        `;
        
        return tableHTML;
    }
    
    /**
     * Thêm CSS cho modal hóa đơn
     */
    addInvoiceStyles() {
        if (!document.querySelector('#invoice-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'invoice-modal-styles';
            style.textContent = `
                .invoice-modal .hkd-modal-content {
                    max-width: 1600px !important;
                    width: 95vw !important;
                    max-height: 90vh !important;
                }
                
                .invoice-products-table th {
                    position: sticky;
                    top: 0;
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef) !important;
                    z-index: 10;
                }
                
                .invoice-products-table tbody tr:hover {
                    background-color: rgba(0, 123, 255, 0.04) !important;
                }
                
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .invoice-modal,
                    .invoice-modal * {
                        visibility: visible;
                    }
                    .invoice-modal {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100% !important;
                        max-width: 100% !important;
                        background: white !important;
                    }
                    .hkd-modal-header,
                    .hkd-modal-footer,
                    .hkd-modal-close {
                        display: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    /**
     * Thiết lập sự kiện cho modal
     */
    setupModalEvents(modal) {
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        
        // Nút đóng
        modal.querySelector('.hkd-modal-close').addEventListener('click', closeModal);
        modal.querySelector('#close-invoice-btn').addEventListener('click', closeModal);
        
        // Nút in hóa đơn
        modal.querySelector('#print-invoice-btn').addEventListener('click', () => {
            this.printInvoice();
        });
        
        // Nút xuất Excel
        modal.querySelector('#export-invoice-excel').addEventListener('click', () => {
            this.exportInvoiceToExcel();
        });
        
        // Đóng khi click ra ngoài modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    /**
     * In hóa đơn
     */
    printInvoice() {
        const sale = this.saleData;
        const printWindow = window.open('', '_blank');
        const totalBeforeDiscount = sale.totalAmount || sale.total || 0;
        const discount = sale.discount || 0;
        const finalTotal = totalBeforeDiscount - discount;
        
        let productTableHTML = '';
        if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
            productTableHTML = `
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt; page-break-inside: avoid;">
                    <thead>
                        <tr style="background: #f5f5f5; page-break-inside: avoid;">
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; width: 35px;">STT</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Danh mục</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Tên thường gọi</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; width: 70px;">Mã SP</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; width: 70px;">Đơn vị</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: right; width: 90px;">Đơn giá</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: right; width: 90px;">Thành tiền</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left; width: 100px;">Ghi chú</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Tên gốc</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; width: 50px;">SL</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            sale.items.forEach((item, index) => {
                const mappedProduct = this.mapProductData(item);
                
                productTableHTML += `
                    <tr style="page-break-inside: avoid;">
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${index + 1}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${mappedProduct.category}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${mappedProduct.displayName}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-family: monospace;">${mappedProduct.code}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${mappedProduct.unit}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${window.utils.formatCurrency(mappedProduct.price)}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: right; font-weight: bold;">${window.utils.formatCurrency(mappedProduct.total)}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${mappedProduct.note || '-'}</td>
                        <td style="border: 1px solid #ddd; padding: 6px;">${mappedProduct.originalName}</td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${mappedProduct.quantity}</td>
                    </tr>
                `;
            });
            
            productTableHTML += `
                    </tbody>
                </table>
            `;
        }
        
        const printContent = `
            <html>
            <head>
                <title>Hóa đơn ${sale.id}</title>
                <style>
                    @media print {
                        @page {
                            size: A4 landscape;
                            margin: 10mm;
                        }
                        
                        body {
                            font-family: 'Arial', sans-serif;
                            font-size: 9pt;
                            line-height: 1.4;
                            margin: 0;
                            padding: 0;
                        }
                        
                        .invoice-header {
                            text-align: center;
                            margin-bottom: 15px;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #000;
                        }
                        
                        .invoice-header h1 {
                            margin: 0 0 8px 0;
                            font-size: 18pt;
                            color: #000;
                        }
                        
                        .invoice-info {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 15px;
                            margin-bottom: 15px;
                            padding: 10px;
                            background: #f8f9fa;
                            border: 1px solid #ddd;
                            font-size: 9pt;
                        }
                        
                        .invoice-summary {
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            gap: 10px;
                            margin: 15px 0;
                            padding: 10px;
                            background: #e8f4fd;
                            border: 1px solid #cfe2ff;
                            font-size: 9pt;
                        }
                        
                        .summary-item {
                            text-align: center;
                        }
                        
                        .summary-value {
                            font-size: 11pt;
                            font-weight: bold;
                            margin-bottom: 3px;
                        }
                        
                        .summary-label {
                            font-size: 8pt;
                            color: #666;
                        }
                        
                        .total-amount {
                            text-align: right;
                            margin: 20px 0;
                            padding: 10px;
                            background: #f8f9fa;
                            border-top: 2px solid #000;
                        }
                        
                        .total-amount .amount {
                            font-size: 16pt;
                            font-weight: bold;
                            color: #28a745;
                        }
                        
                        .footer {
                            text-align: center;
                            margin-top: 30px;
                            padding-top: 10px;
                            border-top: 1px dashed #ccc;
                            font-size: 8pt;
                            color: #666;
                        }
                        
                        table {
                            page-break-inside: auto;
                        }
                        
                        tr {
                            page-break-inside: avoid;
                            page-break-after: auto;
                        }
                        
                        thead {
                            display: table-header-group;
                        }
                    }
                    
                    body {
                        font-family: 'Arial', sans-serif;
                        font-size: 9pt;
                        line-height: 1.4;
                        margin: 0;
                        padding: 15px;
                    }
                </style>
            </head>
            <body>
                <div class="invoice-header">
                    <h1>HÓA ĐƠN BÁN HÀNG</h1>
                    <p>Mã đơn: ${sale.id || 'N/A'} | Ngày: ${window.utils.formatDate(sale.timestamp, true)}</p>
                </div>
                
                <div class="invoice-info">
                    <div>
                        <h3 style="margin: 0 0 5px 0; font-size: 10pt;">THÔNG TIN KHÁCH HÀNG</h3>
                        <p style="margin: 2px 0;"><strong>Tên:</strong> ${sale.customerName || sale.customer || 'Khách lẻ'}</p>
                        <p style="margin: 2px 0;"><strong>SĐT:</strong> ${sale.customerPhone || sale.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 style="margin: 0 0 5px 0; font-size: 10pt;">THÔNG TIN HKD</h3>
                        <p style="margin: 2px 0;"><strong>Tên HKD:</strong> ${sale.hkdName || 'Không xác định'}</p>
                        <p style="margin: 2px 0;"><strong>Mã HKD:</strong> ${sale.hkdId || 'N/A'}</p>
                    </div>
                </div>
                
                <div class="invoice-summary">
                    <div class="summary-item">
                        <div class="summary-label">Tổng trước giảm</div>
                        <div class="summary-value">${window.utils.formatCurrency(totalBeforeDiscount)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Giảm giá</div>
                        <div class="summary-value" style="color: #dc3545;">-${window.utils.formatCurrency(discount)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Số sản phẩm</div>
                        <div class="summary-value">${sale.items?.length || 0}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Tổng số lượng</div>
                        <div class="summary-value">${sale.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0}</div>
                    </div>
                </div>
                
                <h3 style="margin: 15px 0 10px 0; font-size: 11pt;">CHI TIẾT SẢN PHẨM</h3>
                ${productTableHTML || '<p style="text-align: center; color: #666; padding: 20px;">Không có chi tiết sản phẩm</p>'}
                
                <div class="total-amount">
                    <div style="font-size: 10pt; margin-bottom: 5px;">Tổng thành tiền:</div>
                    <div class="amount">${window.utils.formatCurrency(finalTotal)}</div>
                </div>
                
                <div class="footer">
                    <p>Được tạo bởi hệ thống Admin Dashboard</p>
                    <p>Thời gian xuất: ${window.utils.formatDate(Date.now(), true)}</p>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    }
                </script>
            </body>
            </html>
        `;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
    
    /**
     * Xuất Excel hóa đơn
     */
    exportInvoiceToExcel() {
        try {
            window.utils.showLoading('Đang tạo file Excel...');
            
            const sale = this.saleData;
            const totalBeforeDiscount = sale.totalAmount || sale.total || 0;
            const discount = sale.discount || 0;
            const finalTotal = totalBeforeDiscount - discount;
            
            // Tạo dữ liệu Excel với 10 cột
            const excelData = [
                ['HÓA ĐƠN BÁN HÀNG'],
                ['Mã đơn hàng:', sale.id || 'N/A'],
                ['HKD:', sale.hkdName || 'Không xác định'],
                ['Mã HKD:', sale.hkdId || 'N/A'],
                ['Khách hàng:', sale.customerName || sale.customer || 'Khách lẻ'],
                ['Số điện thoại:', sale.customerPhone || sale.phone || 'N/A'],
                ['Ngày tạo:', window.utils.formatDate(sale.timestamp, true)],
                ['Tổng tiền (trước giảm):', window.utils.formatCurrency(totalBeforeDiscount)],
                ['Giảm giá:', window.utils.formatCurrency(discount)],
                ['Thành tiền:', window.utils.formatCurrency(finalTotal)],
                [''],
                ['CHI TIẾT SẢN PHẨM'],
                ['STT', 'Danh mục', 'Tên thường gọi', 'Mã SP', 'Đơn vị tính', 'Đơn giá', 'Thành tiền', 'Ghi chú', 'Tên gốc', 'Số lượng']
            ];
            
            // Thêm dữ liệu sản phẩm với mapping
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach((item, index) => {
                    const mappedProduct = this.mapProductData(item);
                    
                    excelData.push([
                        index + 1,
                        mappedProduct.category,
                        mappedProduct.displayName,
                        mappedProduct.code,
                        mappedProduct.unit,
                        mappedProduct.price,
                        mappedProduct.total,
                        mappedProduct.note || '',
                        mappedProduct.originalName,
                        mappedProduct.quantity
                    ]);
                });
            }
            
            // Thêm thông tin mapping
            excelData.push(['']);
            excelData.push(['THÔNG TIN MAPPING']);
            excelData.push(['Trạng thái:', this.mappingComplete ? 'Đã map với dữ liệu import' : 'Chưa có dữ liệu import']);
            excelData.push(['Số sản phẩm đã map:', sale.items ? sale.items.filter(item => {
                const productCode = item.code || item.metadata?.code;
                return productCode && this.hkdProducts[productCode];
            }).length : 0]);
            excelData.push(['Tổng sản phẩm:', sale.items?.length || 0]);
            excelData.push(['']);
            excelData.push(['Thời gian xuất:', window.utils.formatDate(Date.now(), true)]);
            excelData.push(['Được tạo bởi:', 'Hệ thống Admin Dashboard']);
            
            // Tạo workbook
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            // Thiết lập độ rộng cột
            const wscols = [
                {wch: 5},   // STT
                {wch: 15},  // Danh mục
                {wch: 25},  // Tên thường gọi
                {wch: 12},  // Mã SP
                {wch: 12},  // Đơn vị tính
                {wch: 12},  // Đơn giá
                {wch: 12},  // Thành tiền
                {wch: 20},  // Ghi chú
                {wch: 30},  // Tên gốc
                {wch: 8},   // Số lượng
                {wch: 25},  // Thông tin mapping
                {wch: 25}   // Giá trị mapping
            ];
            ws['!cols'] = wscols;
            
            // Merge cells cho tiêu đề
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // HÓA ĐƠN BÁN HÀNG
                { s: { r: 11, c: 0 }, e: { r: 11, c: 9 } }, // CHI TIẾT SẢN PHẨM
                { s: { r: excelData.length - 8, c: 0 }, e: { r: excelData.length - 8, c: 9 } } // THÔNG TIN MAPPING
            ];
            
            // Định dạng tiền tệ cho cột đơn giá và thành tiền
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = 12; R <= range.e.r; R++) { // Bắt đầu từ dòng dữ liệu sản phẩm
                if (excelData[R] && excelData[R].length >= 10) {
                    // Cột Đơn giá (cột F, index 5)
                    const priceCell = XLSX.utils.encode_cell({r: R, c: 5});
                    ws[priceCell].z = '#,##0';
                    
                    // Cột Thành tiền (cột G, index 6)
                    const totalCell = XLSX.utils.encode_cell({r: R, c: 6});
                    ws[totalCell].z = '#,##0';
                }
            }
            
            // Định dạng header
            for (let C = 0; C <= 9; C++) {
                const headerCell = XLSX.utils.encode_cell({r: 12, c: C}); // Header ở dòng 13
                if (ws[headerCell]) {
                    ws[headerCell].s = {
                        font: { bold: true, color: { rgb: "FFFFFF" } },
                        fill: { fgColor: { rgb: "4F81BD" } },
                        alignment: { horizontal: "center", vertical: "center" }
                    };
                }
            }
            
            // Thêm freeze pane
            ws['!freeze'] = { xSplit: 0, ySplit: 13 }; // Cố định header sản phẩm
            
            // Thêm vào workbook
            XLSX.utils.book_append_sheet(wb, ws, 'HoaDon');
            
            // Tạo sheet thống kê mapping
            const statsData = [
                ['THỐNG KÊ MAPPING'],
                [''],
                ['Mã đơn hàng:', sale.id || 'N/A'],
                ['HKD:', sale.hkdName || 'Không xác định'],
                ['Ngày tạo:', window.utils.formatDate(sale.timestamp, true)],
                [''],
                ['Tổng sản phẩm:', sale.items?.length || 0],
                ['Sản phẩm đã map:', sale.items ? sale.items.filter(item => {
                    const productCode = item.code || item.metadata?.code;
                    return productCode && this.hkdProducts[productCode];
                }).length : 0],
                ['Sản phẩm chưa map:', sale.items ? sale.items.filter(item => {
                    const productCode = item.code || item.metadata?.code;
                    return !productCode || !this.hkdProducts[productCode];
                }).length : 0],
                ['Tỷ lệ mapping:', sale.items?.length > 0 ? 
                    `${((sale.items.filter(item => {
                        const productCode = item.code || item.metadata?.code;
                        return productCode && this.hkdProducts[productCode];
                    }).length / sale.items.length) * 100).toFixed(1)}%` : '0%'],
                [''],
                ['CHI TIẾT MAPPING THEO MÃ SP'],
                ['Mã SP', 'Tên thường gọi', 'Danh mục', 'Tên gốc', 'Trạng thái']
            ];
            
            // Thêm chi tiết mapping
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const productCode = item.code || item.metadata?.code;
                    const isMapped = productCode && this.hkdProducts[productCode];
                    const mappedProduct = this.mapProductData(item);
                    
                    statsData.push([
                        productCode || 'N/A',
                        mappedProduct.displayName,
                        mappedProduct.category,
                        mappedProduct.originalName,
                        isMapped ? '✅ Đã map' : '❌ Chưa map'
                    ]);
                });
            }
            
            const statsWs = XLSX.utils.aoa_to_sheet(statsData);
            XLSX.utils.book_append_sheet(wb, statsWs, 'ThongKeMapping');
            
            // Tạo tên file
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `HoaDon_${sale.id ? sale.id.substring(0, 8) : 'Unknown'}_${dateStr}.xlsx`;
            
            // Xuất file
            XLSX.writeFile(wb, fileName);
            
            window.utils.showNotification(`Đã xuất file: ${fileName}`, 'success');
            
        } catch (error) {
            console.error('Error exporting invoice to Excel:', error);
            window.utils.showNotification('Lỗi xuất file Excel: ' + error.message, 'error');
        } finally {
            window.utils.hideLoading();
        }
    }
}

// Export to window
window.InvoiceDetailManager = InvoiceDetailManager;

// Utility function để gọi từ reports.js
window.showInvoiceDetail = async function(saleId, hkdId = null) {
    const invoiceManager = new InvoiceDetailManager();
    await invoiceManager.showInvoiceDetail(saleId, hkdId);
};