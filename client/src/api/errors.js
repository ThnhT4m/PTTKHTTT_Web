const messages = {
  0: 'Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.',
  400: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra biểu mẫu.',
  401: 'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  409: 'Dữ liệu hoặc trạng thái đã thay đổi. Vui lòng tải lại.',
  429: 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.',
};
export class ApiError extends Error {
  constructor(error = {}, status = 0, serverTime) {
    super(error.message || messages[status] || 'Máy chủ gặp lỗi. Vui lòng thử lại sau.');
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code || (status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`);
    this.details = error.details;
    this.server_time = serverTime;
    this.kind = status === 0 ? 'network' : status >= 500 ? 'server' : ({
      400: 'validation', 401: 'authentication', 403: 'forbidden', 404: 'not_found',
      409: 'conflict', 429: 'rate_limit',
    }[status] || 'http');
  }
}
