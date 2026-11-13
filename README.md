# TransFlow TMS — Giai đoạn 7

Ứng dụng TMS với đăng nhập/RBAC, Customer, Shipment, Booking, B/L, Container, điều xe, Vessel/Voyage và tích hợp AIS provider cho bản đồ tàu.

## Yêu cầu

- Node.js 20.9 trở lên và npm.
- PostgreSQL 16 hoặc Docker Desktop (file `docker-compose.yml` cung cấp PostgreSQL và Mailpit).
- Trình duyệt hiện đại.

## Chạy trên máy phát triển

### Bản cài cục bộ trong workspace này

Node.js 24.21.0, PostgreSQL 16.15 và Mailpit đã được đặt trong `.tools/` (được Git bỏ qua); dữ liệu PostgreSQL ở `.data/`. Từ PowerShell, chạy `./scripts/start-local.ps1` để mở lại cả ba dịch vụ và frontend. Nếu cần dùng lệnh `node`, `npm`, `psql` trong terminal hiện tại, chạy `. ./scripts/use-local-tools.ps1` trước. Tài khoản nội bộ và mật khẩu khởi tạo được lưu cục bộ trong `.tools/local-accounts.txt`; giữ file này trên máy phát triển và không đưa lên Git. PostgreSQL dùng alias ổ đĩa `T:` vì binary Windows không xử lý ổn định đường dẫn workspace có dấu tiếng Việt.

Các lệnh bên dưới dùng cho máy khác hoặc khi cần cài lại từ đầu.

1. Tạo file môi trường cho API và Docker Compose:

   ```powershell
   Copy-Item .env.example apps/api/.env
   Copy-Item .env.example .env
   ```

2. Đặt cùng một mật khẩu PostgreSQL riêng trong `POSTGRES_PASSWORD` ở `.env` và phần mật khẩu của `DATABASE_URL` trong `apps/api/.env`. Đổi `SEED_ADMIN_PASSWORD` trong `apps/api/.env` thành mật khẩu riêng dài ít nhất 12 ký tự; nếu để trống, lệnh seed tạo mật khẩu ngẫu nhiên và chỉ in ra **một lần**. Để tạo thêm tài khoản theo vai trò, đặt `SEED_SAMPLE_USERS=true` trước khi seed. Không bật tùy chọn này trong production.

3. Khởi động PostgreSQL và Mailpit:

   ```powershell
   docker compose up -d
   ```

   Nếu đã có PostgreSQL hoặc SMTP riêng, cập nhật `DATABASE_URL`, `MAIL_HOST`, `MAIL_PORT` trong `apps/api/.env` và không cần Docker.

4. Cài dependency, áp dụng migration và tạo dữ liệu ban đầu:

   ```powershell
   npm install
   npm run db:deploy
   npm run db:seed
   ```

5. Chạy frontend và API:

   ```powershell
   npm run dev
   ```

6. Mở `http://localhost:3000`. API ở `http://localhost:4000/api/v1`. Email đặt lại mật khẩu được xem tại `http://localhost:8025` (Mailpit).

Nếu API chạy tại URL khác, đặt `NEXT_PUBLIC_API_URL` trong `apps/web/.env.local`, ví dụ `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. `WEB_ORIGIN` phải khớp URL frontend.

## Giai đoạn 2: Customer, Shipment, Booking, Container

Giao diện có các trang `/customers`, `/shipments`, `/bookings`, `/containers` và `/search`. ADMIN và OPERATIONS có thể tạo, sửa hồ sơ nghiệp vụ; MANAGER và ACCOUNTANT xem dữ liệu. DRIVER không truy cập các màn hình này. Trang chi tiết Customer cho thấy lịch sử Shipment. Shipment có timeline mốc dự kiến và thực tế. Booking liên kết với Shipment và B/L. Container liên kết với Shipment/Booking, lưu từng sự kiện trạng thái và lịch sử gán. Tìm `MSCU1234567` trên thanh tìm kiếm để xem chuỗi hồ sơ liên quan.

Sau khi cập nhật mã, áp dụng migration và seed:

```powershell
. ./scripts/use-local-tools.ps1
npm run db:deploy
$env:SEED_SAMPLE_OPERATIONS = 'true'
npm run db:seed
Remove-Item Env:SEED_SAMPLE_OPERATIONS
npm run build
./scripts/start-local.ps1
```

`SEED_SAMPLE_OPERATIONS=true` tạo hồ sơ vận hành nội bộ khi không ở production: 9 khách hàng, 16 Shipment, Booking, B/L, Container, chi phí, hóa đơn, 5 PDF tham khảo, 9 tàu đang chạy và 4 xe đang giao hàng. Tên, liên hệ, lịch và số liệu là hư cấu để kiểm tra ứng dụng. PDF được đóng dấu “tài liệu tham khảo, dữ liệu hư cấu, không có giá trị giao dịch”. Không gắn dữ liệu này với AIS. Khi chưa cấu hình AIS provider, màn hình hiển thị **AIS DATA NOT CONNECTED**; seed không tạo vị trí tàu.

Endpoint giai đoạn 2, có tiền tố `/api/v1`:

| Nghiệp vụ | Endpoint | Quyền ghi |
|---|---|---|
| Customer | `GET/POST /customers`, `GET/PATCH /customers/:id` | `shipments.manage` |
| Port | `GET/POST /ports` | `shipments.manage` |
| Shipment | `GET/POST /shipments`, `GET/PATCH /shipments/:id`, `POST /shipments/:id/events` | `shipments.manage` |
| Booking | `GET/POST /bookings`, `GET/PATCH /bookings/:id` | `shipments.manage` |
| B/L | `GET/POST /bills-of-lading` | `shipments.manage` |
| Container | `GET/POST /containers`, `GET/PATCH /containers/:id`, `POST /containers/:id/assign`, `/release`, `/events` | `shipments.manage` |
| Tra cứu | `GET /search?q=...` | `operations.view` |

Các endpoint đọc cần `operations.view`. API ghi validate đầu vào, kiểm tra quan hệ, tránh gán cùng một container đang hoạt động vào hai Shipment, và ghi audit log. Danh sách hiện giới hạn 100 bản ghi mỗi lần gọi; phân trang thuộc giai đoạn tối ưu.

## Giai đoạn 3: vận tải đường bộ

Các màn hình `/fleet`, `/drivers`, `/trucking` quản lý xe tải/đầu kéo, rơ-moóc, tài xế, lịch bảo dưỡng và điều xe theo Shipment/Container. Tài xế có tài khoản DRIVER được liên kết với hồ sơ tài xế chỉ thấy chuyến của mình tại `/my-jobs` và có thể cập nhật tiến độ chuyến được giao. Điều hành/Admin có thể cập nhật tiến độ hoặc hủy chuyến; mỗi lần thay đổi tạo sự kiện và audit log.

Khi điều xe, API kiểm tra trùng lịch xe, trùng lịch tài xế, bảo dưỡng, trạng thái nghỉ, hạn GPLX/đăng kiểm/bảo hiểm và tải trọng so với Shipment. Việc kiểm tra và tạo chuyến nằm trong giao dịch khóa xe/tài xế để tránh hai người điều xe đồng thời vào cùng khung giờ. Lịch sử ghi nhận giờ lấy/giao dự kiến và thực tế, km có hàng/chạy rỗng. GPS là mã thiết bị tùy chọn; ứng dụng chưa nhận vị trí GPS thật.

Bộ dữ liệu vận hành có 6 xe, 6 tài xế và 4 chuyến giao hàng đang thực hiện. Bốn xe giao hàng được liên kết với Shipment, Container, tài xế và điểm giao. Dữ liệu vị trí GPS không được tạo nếu chưa có thiết bị kết nối.

Endpoint mới (tiền tố `/api/v1`):

| Nghiệp vụ | Endpoint | Quyền |
|---|---|---|
| Đội xe | `GET/POST /trucks`, `GET/PATCH /trucks/:id` | Đọc `operations.view`, ghi `trucking.manage` |
| Bảo dưỡng | `POST /trucks/:id/maintenance`, `PATCH /trucks/:id/maintenance/:maintenanceId/complete` | `trucking.manage` |
| Rơ-moóc | `GET/POST /trailers`, `PATCH /trailers/:id` | Đọc `operations.view`, ghi `trucking.manage` |
| Tài xế | `GET/POST /drivers`, `GET/PATCH /drivers/:id` | Đọc `operations.view`, ghi `trucking.manage` |
| Điều xe | `GET/POST /transport-jobs`, `GET /transport-jobs/:id`, `POST /transport-jobs/:id/events` | Đọc `operations.view`, ghi `trucking.manage` |
| Chuyến tài xế | `GET /my-jobs`, `GET /my-jobs/:id`, `POST /my-jobs/:id/events` | `jobs.own.view`/`jobs.own.update`, giới hạn theo tài khoản liên kết |

## Giai đoạn 4: Vessel, Voyage và manifest Container

Màn hình `/vessels` quản lý IMO, MMSI, Call Sign, cờ tàu, hãng tàu, loại tàu và trạng thái. Màn hình `/voyages` quản lý tàu, Voyage Number, POL/POD, ETD/ATD/ETA/ATA và vòng đời Voyage. Chi tiết Voyage có manifest Container, ghi nhận BOOKED → LOADED → DISCHARGED, lưu người cập nhật và thời điểm. Tra cứu toàn hệ thống hỗ trợ tên tàu, IMO, MMSI, Voyage Number; chi tiết Shipment/Container hiển thị Voyage liên quan.

Các endpoint (tiền tố `/api/v1`, quyền đọc `operations.view`, ghi `shipments.manage`): `GET/POST /vessels`, `GET/PATCH /vessels/:id`, `GET/POST /voyages`, `GET/PATCH /voyages/:id`, `POST /voyages/:id/containers`, `POST /voyages/:id/containers/:linkId/events`. Trạng thái tàu và Voyage cập nhật từ nghiệp vụ vận hành. Trang Live Vessel Map và API theo dõi AIS được bổ sung tại giai đoạn 5.

Seed tạo 9 tàu hư cấu với Voyage đã rời cảng và manifest Container đang vận chuyển. Tên, IMO/MMSI, lịch chạy và cảng đến là hồ sơ nội bộ để thử các màn hình. Seed không ghi tọa độ tàu. Khi chưa có vị trí AIS, Live Vessel Map hiển thị vị trí mô phỏng trên giao diện; tọa độ được đánh dấu riêng và không lưu vào cơ sở dữ liệu.

## Dữ liệu nội bộ và phạm vi

Seed tạo 5 vai trò: `ADMIN`, `MANAGER`, `OPERATIONS`, `ACCOUNTANT`, `DRIVER`, cùng quyền tương ứng. Tài khoản Admin ban đầu được tạo từ `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD`. Khi bật `SEED_SAMPLE_USERS=true`, seed tạo thêm một tài khoản cho mỗi vai trò còn lại và in mật khẩu ngẫu nhiên ra terminal. Chạy seed lần nữa không thay đổi mật khẩu tài khoản đã có.

Dashboard hiển thị số Shipment, Container, xe, doanh thu, chi phí và lợi nhuận từ PostgreSQL. Tổng tài chính luôn tách theo từng loại tiền, không cộng chéo VND/USD/EUR. Live Vessel Map bật vị trí mô phỏng để xem thử giao diện, gắn nhãn rõ và không lưu xuống PostgreSQL. Trạng thái kết nối vẫn là **AIS DATA NOT CONNECTED** cho đến khi AIS thật kết nối.

Quyền tài xế được giới hạn cho chuyến được giao trong mô hình quyền. Trang `/my-jobs` chỉ tải chuyến thuộc hồ sơ tài xế liên kết với tài khoản đang đăng nhập.

## Endpoint giai đoạn 1

| Method | Path | Quyền |
|---|---|---|
| POST | `/auth/login` | Công khai, có giới hạn lượt gọi |
| POST | `/auth/logout` | Đã đăng nhập |
| GET | `/auth/me` | Đã đăng nhập |
| POST | `/auth/change-password` | Đã đăng nhập |
| POST | `/auth/forgot-password` | Công khai, có giới hạn lượt gọi |
| POST | `/auth/reset-password` | Công khai, có giới hạn lượt gọi |
| GET | `/dashboard/summary` | `dashboard.view` |
| GET | `/users`, `/users/roles` | `users.manage` |
| POST | `/users` | `users.manage` |
| PATCH | `/users/:id` | `users.manage` |

Đường dẫn trên có tiền tố `/api/v1`. Không có API xóa audit log.

## Kiểm tra thủ công sau khi chạy

1. Đăng nhập Admin, xem Dashboard và trang Users. Tạo người dùng mới với từng vai trò.
2. Đăng xuất rồi thử gọi `/dashboard/summary`: phải nhận `401`.
3. Đăng nhập Manager rồi thử `/users`: phải nhận `403`.
4. Đăng nhập Driver: chỉ truy cập Settings và `/my-jobs`; API dashboard, users và danh sách chuyến toàn công ty phải trả `403`.
5. Thử mật khẩu sai nhiều lần: endpoint đăng nhập trả `429` khi vượt giới hạn.
6. Yêu cầu quên mật khẩu, mở Mailpit, dùng liên kết một lần. Sau đặt lại mật khẩu, mọi session cũ bị thu hồi.
7. Đổi mật khẩu từ Settings: bị đăng xuất, mật khẩu cũ không còn đăng nhập được.

## Cấu trúc dữ liệu

Migration giai đoạn 1 tạo `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, `password_reset_tokens`, `audit_logs`. Migration giai đoạn 2 thêm `customers`, `ports`, `shipments`, `shipment_events`, `bookings`, `bills_of_lading`, `containers`, `shipment_containers`, `container_events`. Migration giai đoạn 3 thêm `trucks`, `trailers`, `drivers`, `transport_jobs`, `transport_job_events`, `maintenance`. Thiết kế tổng thể xem [docs/architecture.md](docs/architecture.md).

## Triển khai production

Đặt `NODE_ENV=production`, `WEB_ORIGIN` đúng domain, dùng HTTPS, PostgreSQL/SMTP được quản lý, mật khẩu seed riêng và tắt `SEED_SAMPLE_USERS` cùng `SEED_SAMPLE_OPERATIONS`. Đặt frontend và API sau cùng reverse proxy/domain để cookie phiên có cùng site. Không đưa `.env` vào Git.

## Giai đoạn 5: AIS tracking và Live Vessel Map

`/live-map` hiển thị các Voyage đã `DEPARTED` có container ở trạng thái `LOADED`. Chọn tàu để xem vị trí mới nhất nhận qua provider, tốc độ, course, heading, trạng thái hàng hải, thời điểm nhận, danh sách container và ETA/cảng đích theo lịch Voyage. Liên kết Google Maps nhận tọa độ AIS thật hoặc tọa độ mô phỏng; dữ liệu mô phỏng có nhãn ngay cạnh tọa độ, chỉ chạy trên trình duyệt và không ghi vào `vessel_positions`. Giao diện tự làm mới dữ liệu AIS mỗi 30 giây.

Backend hiện có adapter `AISSTREAM` chạy server-side qua WebSocket, dùng `permessage-deflate`, chỉ đăng ký MMSI của Vessel có Voyage đã rời cảng và đang chở container (giới hạn 200 MMSI mỗi subscription), kết nối lại theo backoff và lưu từng bản tin vị trí vào `vessel_positions`. Hợp đồng provider chuẩn hóa giúp có thể thay adapter sau này. Bộ hồ sơ nội bộ không tạo lat/lon. Trạng thái `AIS DATA NOT CONNECTED` giữ nguyên khi thiếu provider, API key hoặc vùng đăng ký.

Cấu hình trong `apps/api/.env` (không đưa khóa vào source control):

```dotenv
AIS_PROVIDER=aisstream
AIS_API_KEY=your_server_side_key
AIS_BBOXES=[[[south_latitude,west_longitude],[north_latitude,east_longitude]]]
```

`AIS_BBOXES` là JSON danh sách vùng địa lý AIS cần nhận; hãy giới hạn vùng phù hợp với hành trình của công ty. Mỗi Vessel cần MMSI AIS gồm 9 chữ số. Sau khi sửa `.env`, khởi động lại API. Khi có khóa và Vessel phù hợp, backend tự đăng ký stream; không cần bật kết nối từ trình duyệt.

| Endpoint | Quyền | Mục đích |
|---|---|---|
| `GET /tracking/status` | `operations.view` | Provider/configuration/connection state |
| `GET /tracking/live` | `operations.view` | Tàu đang chở container và vị trí AIS mới nhất |

Migration `20261003170715_phase5_ais_tracking` tạo bảng `vessel_positions`, liên kết Vessel và index lịch sử theo thời gian. Chạy `npm run db:deploy` rồi build/khởi động lại như các giai đoạn trước. AIS Stream yêu cầu backend đọc stream liên tục; bản tin vị trí là dữ liệu sự kiện nên thời điểm cập nhật phụ thuộc vùng phủ sóng và hoạt động AIS.

## Giai đoạn 6: Chứng từ, chi phí, doanh thu và hóa đơn

Các trang `/documents`, `/costs` và `/revenue` bổ sung nghiệp vụ tài chính theo Shipment. Chứng từ được lưu riêng tư tại `.data/uploads` (hoặc `DOCUMENTS_STORAGE_DIR`), tối đa 25 MB, nhận PDF, PNG, JPG, DOC/DOCX, XLS/XLSX và CSV. File không được phục vụ tĩnh; tải file cần đăng nhập. Metadata và mọi thao tác ghi có Audit Log. Quyền `documents.manage` được cấp cho ADMIN, OPERATIONS và ACCOUNTANT; MANAGER có quyền xem. Tài khoản DRIVER không truy cập chứng từ hay tài chính.

Chi phí và doanh thu có danh mục, mô tả, ngày phát sinh, ghi chú và mã tiền tệ ISO. Dashboard và báo cáo lợi nhuận chỉ đối chiếu số tiền cùng loại tiền; không cộng chéo VND/USD/EUR. Hóa đơn có nhiều dòng, trạng thái nháp/phát hành/đã thanh toán và hỗ trợ nhiều lần thu tiền. Phát hành hóa đơn tạo một bút toán doanh thu duy nhất trong cùng transaction; thanh toán cập nhật công nợ hóa đơn, không ghi thêm doanh thu. Không cho phép thanh toán vượt số dư. Các bút toán không có chức năng xóa.

Sau khi cập nhật phiên bản, áp dụng migration và build:

```powershell
. ./scripts/use-local-tools.ps1
npm run db:deploy
npm run db:seed
npm run build
./scripts/start-local.ps1
```

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET/POST/PATCH | `/costs` | `finance.view` / `finance.manage` | Sổ chi phí theo Shipment |
| GET/POST/PATCH | `/revenues` | `finance.view` / `finance.manage` | Sổ doanh thu theo Shipment |
| GET | `/finance/summary` | `finance.view` | Tổng hợp theo tiền tệ và Shipment |
| GET/POST | `/invoices` | `finance.view` / `finance.manage` | Danh sách, tạo hóa đơn nháp |
| POST | `/invoices/:id/issue` | `finance.manage` | Phát hành và ghi nhận doanh thu |
| POST | `/invoices/:id/payments` | `finance.manage` | Ghi nhận một lần thanh toán |
| GET | `/documents` | `operations.view` | Danh sách chứng từ, lọc theo `shipmentId` |
| POST | `/documents` | `documents.manage` | Tải file multipart (`file`, `shipmentId`, `type`, `notes`) |
| GET | `/documents/:id/download` | `operations.view` | Tải file đã xác thực |

## Giai đoạn 7: Cảnh báo, KPI và báo cáo

Trang `/alerts` rà soát dữ liệu nghiệp vụ hiện có khi người dùng tải/làm mới danh sách. Cảnh báo được khử trùng lặp theo hồ sơ nguồn, tự chuyển sang `RESOLVED` khi điều kiện không còn đúng, và cho phép vai trò có `alerts.manage` tiếp nhận. Bộ dò hiện có: Shipment/Voyage quá ETA, ETA AIS khác lịch Voyage ít nhất 6 giờ, Shipment trễ Gate In theo mốc đã lập, chuyến xe quá giờ lấy/giao, đăng kiểm/bảo hiểm/GPLX hết hạn hoặc sắp hết hạn, xe đến lịch bảo dưỡng, và Container Available hơn 24 giờ chưa lấy. Mức `INFO`, `WARNING`, `CRITICAL` phụ thuộc thời hạn thực tế. Demurrage/Detention chưa tự tính vì hệ thống chưa lưu free time theo cảng/hãng tàu và ngày bắt đầu tính phí; không sinh cảnh báo phí dựa trên giả định.

`MANAGER`, `OPERATIONS` và `ADMIN` có quyền tiếp nhận cảnh báo; `MANAGER` và `ADMIN` xem báo cáo. `/reports` hỗ trợ hôm nay, tuần, tháng, quý, năm; hiển thị Shipment hoàn thành/tạo mới, tỷ lệ đúng hạn khi có cả giờ dự kiến và thực tế, thời gian xử lý, chuyến xe trễ, km có hàng/rỗng, hiệu suất theo xe và tài xế, cước và chi phí xe trên km, lợi nhuận theo khách hàng, xu hướng doanh thu/chi phí. Mọi khoản tài chính và biểu đồ được tách theo tiền tệ; cước/km chỉ so sánh cước đường bộ với nhóm chi phí đường bộ, nhiên liệu, cầu đường và tài xế. KPI thiếu sự kiện/mẫu số trả về chưa có dữ liệu.

Bảng `alerts` lưu trạng thái, nguồn, mức độ, thời điểm phát hiện/tiếp nhận/giải quyết; thao tác tiếp nhận có Audit Log. API đối chiếu dữ liệu lúc khởi động, mỗi 5 phút và khi người dùng gọi `GET /alerts`; không cần dịch vụ lập lịch bổ sung.

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/alerts?status=OPEN&severity=CRITICAL` | `operations.view` | Đối chiếu và lọc cảnh báo |
| POST | `/alerts/:id/acknowledge` | `alerts.manage` | Tiếp nhận cảnh báo |
| GET | `/reports/overview?period=month` | `reports.view` | KPI và báo cáo; `period`: day/week/month/quarter/year |
| GET | `/reports/overview?from=2026-01-01&to=2026-02-01` | `reports.view` | Kỳ tùy chọn tối đa 366 ngày |

Chạy `npm run db:deploy`, `npm run db:seed`, `npm run build` rồi `./scripts/start-local.ps1` sau khi cập nhật.


"# Hanhtrinhvantai" 
