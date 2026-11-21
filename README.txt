ClinicCare – Hệ thống quản lý phòng khám tư nhân
Đồ án tốt nghiệp
Tên đề tài: Xây dựng hệ thống đặt lịch khám bệnh và quản lý phòng khám tư nhân tích hợp AI Chatbot.

Mục tiêu: Số hóa quy trình đặt lịch, quản lý bác sĩ, bệnh nhân, hồ sơ khám bệnh và thống kê hoạt động phòng khám.

Công nghệ chính
- Frontend: NextJS
- Backend: Node.js + ExpressJS
- Database: MongoDB
- Authentication: JWT
- QR Code: qrcode
2. Đối tượng sử dụng hệ thống
Hệ thống có 3 nhóm người dùng chính:
1. Bệnh nhân (Patient)
- Đăng ký, đăng nhập.
- Tìm kiếm bác sĩ.
- Xem lịch khám.
- Đặt, hủy lịch khám.
- Xem lịch sử khám bệnh.
- Nhận thông báo.
- Sử dụng chatbot.
- Xem mã QR lịch hẹn.
2. Bác sĩ (Doctor)
- Đăng nhập.
- Quản lý lịch làm việc.
- Xem lịch hẹn.
- Xác nhận hoặc từ chối lịch.
- Xem hồ sơ bệnh nhân được phân công.
- Tạo và cập nhật hồ sơ khám bệnh.
3. Quản trị viên (Admin)
- Quản lý bệnh nhân.
- Quản lý bác sĩ.
- Quản lý chuyên khoa.
- Quản lý lịch làm việc.
- Quản lý lịch hẹn.
- Quản lý tài khoản và phân quyền.
- Quản lý dịch vụ.
- Xem dashboard thống kê.
3. Phân tích yêu cầu chức năng
Chia thành 8 nhóm chức năng.
Mã	Nhóm chức năng	Nội dung
FR01	Tài khoản	Đăng ký, đăng nhập, đăng xuất
FR02	Bệnh nhân	Quản lý thông tin cá nhân
FR03	Bác sĩ	Quản lý thông tin, chuyên khoa
FR04	Lịch khám	Quản lý ca làm việc, đặt lịch
FR05	Hồ sơ bệnh án	Lưu lịch sử khám bệnh
FR06	Thông báo	Gửi thông báo, nhắc lịch
FR07	AI Chatbot	Hướng dẫn thủ tục, tra cứu thông tin
FR08	Dashboard	Thống kê và báo cáo
3.1. Yêu cầu chi tiết chức năng đặt lịch
Đây là chức năng quan trọng nhất của hệ thống.

Quy trình:
1. Bệnh nhân đăng nhập.
2. Chọn chuyên khoa.
3. Chọn bác sĩ.
4. Chọn ngày khám.
5. Hệ thống hiển thị các khung giờ còn trống.
6. Bệnh nhân chọn khung giờ.
7. Nhập lý do khám hoặc triệu chứng ban đầu.
8. Xác nhận đặt lịch.
9. Hệ thống kiểm tra khung giờ lần cuối.
10. Lưu lịch hẹn và tạo mã QR.
11. Gửi thông báo xác nhận.