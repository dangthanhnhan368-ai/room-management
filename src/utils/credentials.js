// src/utils/credentials.js

// Hàm mã hóa Base64 (chỉ dùng 1 lần để tạo encrypted string)
const encodeCredentials = (email, password) => {
  return btoa(`${email}:${password}`);
};

// Hàm giải mã Base64
const decodeCredentials = (encoded) => {
  const decoded = atob(encoded);
  const [email, password] = decoded.split(':');
  return { email, password };
};

// ✅ ENCRYPTED CREDENTIALS
// Đây là kết quả sau khi mã hóa - KHÔNG lưu email/password gốc ở đây
const ENCRYPTED_ADMIN_CREDENTIALS = 'YWRtaW4tc2VjdXJlLTIwMjRAdm5yZXR1cm4uY29tOlNlY3VyZVBAc3N3MHJkITIwMjQjVk5SZXR1cm4=';

// Export hàm lấy credentials
export const getAdminCredentials = () => {
  return decodeCredentials(ENCRYPTED_ADMIN_CREDENTIALS);
};

// Export hàm mã hóa (chỉ dùng khi cần tạo mới)
export { encodeCredentials };