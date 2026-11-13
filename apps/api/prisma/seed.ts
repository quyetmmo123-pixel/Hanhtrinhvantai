import 'dotenv/config';
import {
  BookingStatus, ContainerStatus, ContainerType, CostCategory, DocumentType, DriverStatus, InvoiceStatus, PrismaClient,
  RevenueCategory, ShipmentMilestone, ShipmentStatus, TransportJobStatus, TruckStatus, TruckType,
  VesselStatus, VoyageContainerStatus, VoyageStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

const permissionNames: Record<string, string> = {
  'dashboard.view': 'Xem dashboard', 'users.manage': 'Quản lý người dùng',
  'reports.view': 'Xem báo cáo', 'shipments.manage': 'Quản lý Shipment',
  'operations.view': 'Xem hoạt động giao nhận', 'trucking.manage': 'Điều xe',
  'finance.view': 'Xem tài chính', 'finance.manage': 'Quản lý tài chính',
  'documents.manage': 'Quản lý chứng từ', 'alerts.manage': 'Tiếp nhận cảnh báo',
  'jobs.own.view': 'Xem chuyến được giao', 'jobs.own.update': 'Cập nhật chuyến được giao',
};

const roleDefinitions = [
  { code: 'ADMIN', name: 'Quản trị viên', permissions: Object.keys(permissionNames) },
  { code: 'MANAGER', name: 'Quản lý', permissions: ['dashboard.view', 'operations.view', 'reports.view', 'finance.view', 'alerts.manage'] },
  { code: 'OPERATIONS', name: 'Điều hành', permissions: ['dashboard.view', 'operations.view', 'shipments.manage', 'trucking.manage', 'documents.manage', 'alerts.manage'] },
  { code: 'ACCOUNTANT', name: 'Kế toán', permissions: ['dashboard.view', 'operations.view', 'finance.view', 'finance.manage', 'documents.manage'] },
  { code: 'DOCUMENTS', name: 'Chứng từ', permissions: ['dashboard.view', 'operations.view', 'documents.manage'] },
  { code: 'DRIVER', name: 'Tài xế', permissions: ['jobs.own.view', 'jobs.own.update'] },
];

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day);
const ahead = (days: number) => new Date(Date.now() + days * day);

function isoContainerNo(serial: number): string {
  const prefix = 'TMSU';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterValues = [10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38];
  const base = `${prefix}${String(serial).padStart(6, '0')}`;
  let sum = 0;
  for (let index = 0; index < base.length; index += 1) {
    const char = base[index];
    const value = index < 4 ? letterValues[letters.indexOf(char)] : Number(char);
    sum += value * (2 ** index);
  }
  return `${base}${(sum % 11) % 10}`;
}

function referencePdf(lines: string[]): Buffer {
  const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&');
  const commands = ['BT', '/F1 18 Tf', '55 730 Td', '(TAI LIEU THAM KHAO NOI BO) Tj', '/F1 13 Tf', '0 -32 Td', '(DU LIEU HU CAU - KHONG CO GIA TRI GIAO DICH) Tj', '/F1 11 Tf'];
  for (const line of lines) commands.push('0 -34 Td', `(${clean(line)}) Tj`);
  commands.push('ET');
  const stream = Buffer.from(commands.join('\n'), 'ascii');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'), stream, Buffer.from('\nendstream', 'ascii')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(parts).length);
    const body = typeof objects[index] === 'string' ? Buffer.from(objects[index] as string, 'ascii') : objects[index] as Buffer;
    parts.push(Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), body, Buffer.from('\nendobj\n', 'ascii'));
  }
  const xrefOffset = Buffer.concat(parts).length;
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)];
  parts.push(Buffer.from(`${xref.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'ascii'));
  return Buffer.concat(parts);
}

async function seedAccess() {
  for (const [code, name] of Object.entries(permissionNames)) {
    await prisma.permission.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({ where: { code: definition.code }, update: { name: definition.name }, create: { code: definition.code, name: definition.name } });
    const permissions = await prisma.permission.findMany({ where: { code: { in: definition.permissions } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@tms.local').toLowerCase();
  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
    if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must contain at least 12 characters');
    admin = await prisma.user.create({ data: { email, fullName: 'Nguyễn Văn Quyết', passwordHash: await argon2.hash(password), roles: { create: { role: { connect: { code: 'ADMIN' } } } } } });
    await prisma.auditLog.create({ data: { actorId: admin.id, action: 'USER_SEEDED', entity: 'User', entityId: admin.id } });
    console.log(`Quản trị viên: ${email}`);
    console.log(`Mật khẩu khởi tạo (chỉ hiển thị một lần): ${password}`);
  } else {
    await prisma.user.update({ where: { id: admin.id }, data: { fullName: 'Nguyễn Văn Quyết' } });
    console.log(`Tài khoản quản trị ${email} đã tồn tại; mật khẩu được giữ nguyên.`);
  }

  if (process.env.SEED_SAMPLE_USERS === 'true' && process.env.NODE_ENV !== 'production') {
    const accounts = [
      { email: 'manager@tms.local', fullName: 'Lê Thu Hà', role: 'MANAGER' },
      { email: 'operations@tms.local', fullName: 'Phạm Quốc Huy', role: 'OPERATIONS' },
      { email: 'accountant@tms.local', fullName: 'Trần Ngọc Mai', role: 'ACCOUNTANT' },
      { email: 'driver@tms.local', fullName: 'Võ Minh Khang', role: 'DRIVER' },
    ];
    for (const account of accounts) {
      const found = await prisma.user.findUnique({ where: { email: account.email } });
      if (found) {
        await prisma.user.update({ where: { id: found.id }, data: { fullName: account.fullName } });
        continue;
      }
      const password = randomBytes(18).toString('base64url');
      await prisma.user.create({ data: { email: account.email, fullName: account.fullName, passwordHash: await argon2.hash(password), roles: { create: { role: { connect: { code: account.role } } } } } });
      console.log(`${account.role}: ${account.email} / ${password}`);
    }
  }
  return { admin, email };
}

async function migrateOldLabels() {
  const customerRenames = [
    { old: 'DEMO-CUS-001', code: 'CUS-2026-0091', companyName: 'Công ty Cổ phần Dệt may An Phát', contactName: 'Nguyễn Minh Anh', phone: '0903124781', email: 'minhanh@anphat-textile.example', address: 'Quận 7, TP. Hồ Chí Minh', taxId: '0318456721' },
    { old: 'DEMO-CUS-002', code: 'CUS-2026-0092', companyName: 'Công ty TNHH Thiết bị Minh Long', contactName: 'Trần Quốc Bảo', phone: '0918273645', email: 'quocbao@minhlong-equipment.example', address: 'Quận Hải An, Hải Phòng', taxId: '0202187634' },
  ];
  for (const row of customerRenames) {
    const old = await prisma.customer.findUnique({ where: { code: row.old } });
    if (old && !await prisma.customer.findUnique({ where: { code: row.code } })) {
      await prisma.customer.update({ where: { id: old.id }, data: { code: row.code, companyName: row.companyName, contactName: row.contactName, phone: row.phone, email: row.email, address: row.address, taxId: row.taxId, notes: 'Hồ sơ khách hàng vận tải; thông tin liên hệ được tạo cho môi trường nội bộ.' } });
    }
  }
  const oldShipmentNames = [
    { old: 'DEMO-SHP-001', no: 'SHP-2026-1842', cargoName: 'Vải dệt kim thành phẩm', cargoType: 'Hàng khô', notes: 'Lô hàng xuất khẩu theo điều kiện FOB.' },
    { old: 'DEMO-SHP-002', no: 'SHP-2026-1843', cargoName: 'Bộ điều khiển điện công nghiệp', cargoType: 'Thiết bị điện', notes: 'Hàng đóng pallet, cần tránh ẩm.' },
  ];
  for (const row of oldShipmentNames) {
    const old = await prisma.shipment.findUnique({ where: { shipmentNo: row.old } });
    if (old && !await prisma.shipment.findUnique({ where: { shipmentNo: row.no } })) await prisma.shipment.update({ where: { id: old.id }, data: { shipmentNo: row.no, cargoName: row.cargoName, cargoType: row.cargoType, notes: row.notes } });
  }
  const booking = await prisma.booking.findUnique({ where: { bookingNo: 'DEMO-BKG-001' } });
  if (booking && !await prisma.booking.findUnique({ where: { bookingNo: 'BKG-2026-1842' } })) await prisma.booking.update({ where: { id: booking.id }, data: { bookingNo: 'BKG-2026-1842', shippingLine: 'An Phú Lines', notes: 'Đã xác nhận chỗ trên chuyến APH 2609.' } });
  const bill = await prisma.billOfLading.findUnique({ where: { blNo: 'DEMO-BL-001' } });
  if (bill && !await prisma.billOfLading.findUnique({ where: { blNo: 'APL-HCM-LAX-2601842' } })) await prisma.billOfLading.update({ where: { id: bill.id }, data: { blNo: 'APL-HCM-LAX-2601842', notes: 'Vận đơn đường biển; bộ chứng từ chính thức sẽ được tải lên theo hồ sơ.' } });
  const oldTruck = await prisma.truck.findUnique({ where: { plateNo: 'DEMO-51C-12345' } });
  if (oldTruck && !await prisma.truck.findUnique({ where: { plateNo: '51H-829.46' } })) await prisma.truck.update({ where: { id: oldTruck.id }, data: { plateNo: '51H-829.46', notes: 'Đầu kéo container tuyến nội thành và cảng.' } });
  const oldTrailer = await prisma.trailer.findUnique({ where: { plateNo: 'DEMO-51R-45678' } });
  if (oldTrailer && !await prisma.trailer.findUnique({ where: { plateNo: '51R-202.86' } })) await prisma.trailer.update({ where: { id: oldTrailer.id }, data: { plateNo: '51R-202.86', notes: 'Sơ-mi rơ-moóc sàn chở container 40 feet.' } });
  const oldDriver = await prisma.driver.findUnique({ where: { code: 'DEMO-DRV-001' } });
  if (oldDriver && !await prisma.driver.findUnique({ where: { code: 'DRV-2026-041' } })) await prisma.driver.update({ where: { id: oldDriver.id }, data: { code: 'DRV-2026-041', fullName: 'Võ Minh Khang', phone: '0908452176', licenseNo: '79F123456', notes: 'Tài xế đầu kéo, phụ trách vận chuyển container.' } });
  const oldJob = await prisma.transportJob.findUnique({ where: { jobNo: 'DEMO-JOB-001' } });
  if (oldJob && !await prisma.transportJob.findUnique({ where: { jobNo: 'TRP-2026-1842' } })) await prisma.transportJob.update({ where: { id: oldJob.id }, data: { jobNo: 'TRP-2026-1842', deliveryPlace: 'Kho An Phát, KCN Hiệp Phước', notes: 'Điều vận giao container theo lịch kho đã xác nhận.' } });
  const oldVessel = await prisma.vessel.findUnique({ where: { imo: '9876543' } });
  if (oldVessel && !await prisma.vessel.findUnique({ where: { imo: '9900001' } })) await prisma.vessel.update({ where: { id: oldVessel.id }, data: { name: 'An Phú Horizon', imo: '9900001', mmsi: '999100001', callSign: '9VAP1', flag: 'VN', shippingLine: 'An Phú Lines', vesselType: 'Container Ship', status: VesselStatus.IN_TRANSIT } });
  const oldVoyage = await prisma.voyage.findFirst({ where: { voyageNo: 'DEMO-VY-001' } });
  if (oldVoyage && !await prisma.voyage.findUnique({ where: { vesselId_voyageNo: { vesselId: oldVoyage.vesselId, voyageNo: 'AP01-2609' } } })) await prisma.voyage.update({ where: { id: oldVoyage.id }, data: { voyageNo: 'AP01-2609', etd: ago(2), atd: ago(2), eta: ahead(8), status: VoyageStatus.DEPARTED, notes: 'Lịch khai thác; không có dữ liệu tọa độ AIS.' } });
  const renamedVessel = await prisma.vessel.findUnique({ where: { imo: '9900001' } });
  const renamedVoyage = renamedVessel ? await prisma.voyage.findUnique({ where: { vesselId_voyageNo: { vesselId: renamedVessel.id, voyageNo: 'APH-2609' } } }) : null;
  const primaryVoyage = renamedVessel ? await prisma.voyage.findUnique({ where: { vesselId_voyageNo: { vesselId: renamedVessel.id, voyageNo: 'AP01-2609' } } }) : null;
  if (renamedVoyage && primaryVoyage) {
    const oldManifests = await prisma.voyageContainer.findMany({ where: { voyageId: renamedVoyage.id } });
    for (const manifest of oldManifests) {
      const duplicate = await prisma.voyageContainer.findUnique({ where: { voyageId_containerId: { voyageId: primaryVoyage.id, containerId: manifest.containerId } } });
      if (duplicate) await prisma.voyageContainerEvent.updateMany({ where: { voyageContainerId: manifest.id }, data: { voyageContainerId: duplicate.id } });
      else await prisma.voyageContainer.update({ where: { id: manifest.id }, data: { voyageId: primaryVoyage.id, status: VoyageContainerStatus.LOADED, loadedAt: primaryVoyage.atd || ago(2), notes: 'Đã hợp nhất hồ sơ container vào chuyến khai thác hiện hành.' } });
    }
    await prisma.voyageEvent.updateMany({ where: { voyageId: renamedVoyage.id }, data: { voyageId: primaryVoyage.id } });
    await prisma.voyage.update({ where: { id: renamedVoyage.id }, data: { status: VoyageStatus.CANCELLED, notes: 'Hồ sơ chuyến cũ đã được hợp nhất vào AP01-2609; sự kiện được giữ lại trong lịch sử.' } });
  } else if (renamedVoyage && !primaryVoyage) {
    await prisma.voyage.update({ where: { id: renamedVoyage.id }, data: { voyageNo: 'AP01-2609', etd: ago(2), atd: ago(2), eta: ahead(8), status: VoyageStatus.DEPARTED, notes: 'Lịch khai thác; không có dữ liệu tọa độ AIS.' } });
  }
  await prisma.container.updateMany({ where: { OR: [{ sealNo: { startsWith: 'DEMO-' } }, { notes: { contains: 'demo', mode: 'insensitive' } }] }, data: { sealNo: 'APLU26001842', shippingLine: 'An Phú Lines', notes: 'Container xếp trên chuyến APH-2609; vị trí tàu chỉ hiển thị khi AIS được kết nối.' } });
  await prisma.transportJob.updateMany({ where: { notes: { contains: 'demo', mode: 'insensitive' } }, data: { notes: 'Điều vận container theo lịch kho đã xác nhận.' } });
  await prisma.shipment.updateMany({ where: { notes: { contains: 'demo', mode: 'insensitive' } }, data: { notes: 'Hồ sơ vận tải đang được xử lý theo lịch khai thác.' } });
  await prisma.booking.updateMany({ where: { notes: { contains: 'demo', mode: 'insensitive' } }, data: { notes: 'Đã xác nhận chỗ với hãng tàu.' } });
  await prisma.voyageContainer.updateMany({ where: { notes: { contains: 'demo', mode: 'insensitive' } }, data: { status: VoyageContainerStatus.LOADED, loadedAt: ago(2), notes: 'Container đã được xếp lên tàu.' } });
}

async function seedOperations(actorId: string) {
  const enabled = (process.env.SEED_SAMPLE_OPERATIONS === 'true' || process.env.SEED_SAMPLE_DATA === 'true') && process.env.NODE_ENV !== 'production';
  if (!enabled) return;
  await migrateOldLabels();

  const ports = [
    { code: 'VNSGN', name: 'Cảng Cát Lái', country: 'Việt Nam' },
    { code: 'VNHPH', name: 'Cảng Hải Phòng', country: 'Việt Nam' },
    { code: 'USLAX', name: 'Cảng Los Angeles', country: 'Hoa Kỳ' },
    { code: 'SGSIN', name: 'Cảng Singapore', country: 'Singapore' },
  ];
  for (const port of ports) await prisma.port.upsert({ where: { code: port.code }, update: port, create: port });
  const portId: Record<string, string> = {};
  for (const { code } of ports) portId[code] = (await prisma.port.findUniqueOrThrow({ where: { code } })).id;

  const customerData = [
    ['CUS-2026-0091', 'Công ty Cổ phần Dệt may An Phát', 'Nguyễn Minh Anh', '0903124781', 'minhanh@anphat-textile.example', 'Quận 7, TP. Hồ Chí Minh', '0318456721'],
    ['CUS-2026-0092', 'Công ty TNHH Thiết bị Minh Long', 'Trần Quốc Bảo', '0918273645', 'quocbao@minhlong-equipment.example', 'Quận Hải An, Hải Phòng', '0202187634'],
    ['CUS-2026-0093', 'Công ty Xuất nhập khẩu Đại Phúc', 'Lê Thu Hà', '0987132460', 'thuha@daiphuc-trading.example', 'TP. Thủ Đức, TP. Hồ Chí Minh', '0319024681'],
    ['CUS-2026-0094', 'Công ty Nội thất Nam Việt', 'Phạm Thành Đạt', '0935281640', 'dat@namviet-furnishings.example', 'TP. Dĩ An, Bình Dương', '3703148256'],
    ['CUS-2026-0095', 'Công ty Nông sản Hưng Thịnh', 'Vũ Thanh Tâm', '0976318524', 'tam@hungthinh-agri.example', 'Quận Ninh Kiều, Cần Thơ', '1801764523'],
    ['CUS-2026-0096', 'Công ty Điện tử Sao Mai', 'Đặng Ngọc Lan', '0908765412', 'lan@saomai-electronics.example', 'Quận Long Biên, Hà Nội', '0109283645'],
    ['CUS-2026-0097', 'Công ty Bao bì Tân Tiến', 'Bùi Quốc Khánh', '0916327845', 'khanh@tantien-packaging.example', 'TP. Biên Hòa, Đồng Nai', '3602874519'],
    ['CUS-2026-0098', 'Công ty Cơ khí Việt Thành', 'Đỗ Hoàng Yến', '0964125783', 'yen@vietthanh-machinery.example', 'Quận Lê Chân, Hải Phòng', '0201983754'],
    ['CUS-2026-0099', 'Công ty Thủy sản Biển Xanh', 'Hồ Minh Trí', '0947352168', 'tri@bienxanh-seafood.example', 'TP. Vũng Tàu, Bà Rịa - Vũng Tàu', '3502468137'],
  ] as const;
  const customers = [];
  for (const [code, companyName, contactName, phone, email, address, taxId] of customerData) {
    customers.push(await prisma.customer.upsert({ where: { code }, update: { companyName, contactName, phone, email, address, taxId, active: true }, create: { code, companyName, contactName, phone, email, address, taxId, notes: 'Hồ sơ vận hành dùng thông tin liên hệ hư cấu trong môi trường nội bộ.' } }));
  }

  const carriers = ['An Phú Lines', 'Đông Dương Container Line', 'Việt Hải Logistics', 'Pacific Bridge Shipping', 'Hải Đăng Express', 'Nam Á Cargo', 'Trường Sơn Maritime', 'Cửu Long Shipping', 'Bắc Nam Container Line'];
  const vesselNames = ['An Phú Horizon', 'Đông Dương Star', 'Việt Hải Pioneer', 'Pacific Bridge 08', 'Hải Đăng Voyager', 'Nam Á Meridian', 'Trường Sơn Pacific', 'Cửu Long Navigator', 'Bắc Nam Aurora'];
  const routes = [
    ['VNSGN', 'USLAX'], ['VNHPH', 'SGSIN'], ['VNSGN', 'SGSIN'], ['VNHPH', 'USLAX'], ['VNSGN', 'SGSIN'],
    ['VNHPH', 'SGSIN'], ['VNSGN', 'USLAX'], ['VNHPH', 'SGSIN'], ['VNSGN', 'USLAX'],
  ];
  const cargoes = [
    ['Vải dệt kim thành phẩm', 'Hàng dệt may', 12500, 58.4], ['Bộ điều khiển điện công nghiệp', 'Thiết bị điện', 4800, 24.0],
    ['Hạt nhựa PP nguyên sinh', 'Nguyên liệu sản xuất', 19600, 32.0], ['Bàn ghế gỗ lắp ráp', 'Đồ nội thất', 14200, 61.5],
    ['Cà phê rang xay đóng thùng', 'Nông sản chế biến', 17800, 48.0], ['Linh kiện điện tử đóng pallet', 'Điện tử', 7200, 36.0],
    ['Màng bao bì cuộn', 'Bao bì công nghiệp', 21800, 44.5], ['Máy bơm công nghiệp', 'Máy móc', 16300, 52.0],
    ['Tôm đông lạnh đóng thùng', 'Thủy sản đông lạnh', 20500, 54.0], ['Sợi polyester đóng kiện', 'Nguyên liệu dệt may', 18200, 49.0],
    ['Động cơ điện ba pha', 'Thiết bị cơ khí', 9400, 37.5], ['Hạt điều nhân xuất khẩu', 'Nông sản', 11200, 42.0],
    ['Thiết bị điện lạnh công nghiệp', 'Máy móc', 8900, 39.0], ['Gạch ốp lát đóng kiện', 'Vật liệu xây dựng', 22400, 47.0],
    ['Bao bì giấy nhiều lớp', 'Bao bì công nghiệp', 13200, 46.0], ['Phụ tùng ô tô đóng pallet', 'Phụ tùng', 7600, 34.0],
  ] as const;
  const shipments = [];
  const shipmentContainers: Array<{ shipment: (typeof shipments)[number]; container: Awaited<ReturnType<typeof prisma.container.upsert>>; linkId: string }> = [];
  for (let index = 0; index < cargoes.length; index += 1) {
    const customer = customers[index % customers.length];
    const shipmentNo = `SHP-2026-${String(1842 + index).padStart(4, '0')}`;
    const [cargoName, cargoType, weightKg, cbm] = cargoes[index];
    const [polCode, podCode] = routes[index % routes.length];
    const transit = index < 9;
    const roadDelivery = index >= 12;
    const status = transit || roadDelivery ? ShipmentStatus.IN_TRANSIT : index === 9 ? ShipmentStatus.PROCESSING : index === 10 ? ShipmentStatus.NEW : ShipmentStatus.COMPLETED;
    const createdAt = ago(Math.max(1, 16 - index));
    const shipment = await prisma.shipment.upsert({
      where: { shipmentNo },
      update: { customerId: customer.id, shipper: customer.companyName, consignee: `Đối tác nhận hàng ${index + 1}`, cargoType, cargoName, quantity: 1, weightKg, cbm, incoterm: index % 2 ? 'CIF' : 'FOB', polId: portId[polCode], podId: portId[podCode], placeOfReceipt: polCode === 'VNSGN' ? 'Kho Sóng Thần, Bình Dương' : 'Kho Đình Vũ, Hải Phòng', placeOfDelivery: podCode === 'USLAX' ? 'Long Beach, California' : podCode === 'SGSIN' ? 'Jurong Port, Singapore' : 'Kho khách hàng', etd: ago(3 + index % 5), atd: transit ? ago(2 + index % 5) : null, eta: transit ? ahead(9 + index * 2) : ahead(3), ata: status === ShipmentStatus.COMPLETED ? ago(1) : null, status, assigneeId: actorId, notes: 'Lịch và hồ sơ vận tải tạo cho môi trường nội bộ.' },
      create: { shipmentNo, customerId: customer.id, shipper: customer.companyName, consignee: `Đối tác nhận hàng ${index + 1}`, cargoType, cargoName, quantity: 1, weightKg, cbm, incoterm: index % 2 ? 'CIF' : 'FOB', polId: portId[polCode], podId: portId[podCode], placeOfReceipt: polCode === 'VNSGN' ? 'Kho Sóng Thần, Bình Dương' : 'Kho Đình Vũ, Hải Phòng', placeOfDelivery: podCode === 'USLAX' ? 'Long Beach, California' : podCode === 'SGSIN' ? 'Jurong Port, Singapore' : 'Kho khách hàng', etd: ago(3 + index % 5), atd: transit ? ago(2 + index % 5) : null, eta: transit ? ahead(9 + index * 2) : ahead(3), ata: status === ShipmentStatus.COMPLETED ? ago(1) : null, status, assigneeId: actorId, notes: 'Lịch và hồ sơ vận tải tạo cho môi trường nội bộ.', createdAt },
    });
    shipments.push(shipment);

    const bookingNo = `BKG-2026-${String(1842 + index).padStart(4, '0')}`;
    const booking = await prisma.booking.upsert({ where: { bookingNo }, update: { shipmentId: shipment.id, shippingLine: carriers[index % carriers.length], status: BookingStatus.CONFIRMED, confirmedAt: ago(4 + index % 5), notes: 'Chỗ đã được hãng tàu xác nhận.' }, create: { bookingNo, shipmentId: shipment.id, shippingLine: carriers[index % carriers.length], status: BookingStatus.CONFIRMED, confirmedAt: ago(4 + index % 5), notes: 'Chỗ đã được hãng tàu xác nhận.' } });
    const blNo = `APL-${polCode.slice(2)}-${podCode.slice(2)}-26${String(1842 + index).slice(-4)}`;
    await prisma.billOfLading.upsert({ where: { blNo }, update: { bookingId: booking.id, issuedAt: ago(2 + index % 4), notes: 'Số tham chiếu nội bộ; bản vận đơn phát hành được quản lý trong mục chứng từ.' }, create: { blNo, bookingId: booking.id, issuedAt: ago(2 + index % 4), notes: 'Số tham chiếu nội bộ; bản vận đơn phát hành được quản lý trong mục chứng từ.' } });

    const containerNo = isoContainerNo(index + 1);
    const containerStatus = transit ? ContainerStatus.IN_TRANSIT : roadDelivery ? ContainerStatus.GATE_OUT : status === ShipmentStatus.COMPLETED ? ContainerStatus.DELIVERED : ContainerStatus.GATE_IN;
    const container = await prisma.container.upsert({ where: { containerNo }, update: { type: index === 8 ? ContainerType.REEFER : index % 3 === 0 ? ContainerType.HC40 : ContainerType.GP40, sealNo: `APLU26${String(index + 1).padStart(6, '0')}`, status: containerStatus, shippingLine: carriers[index % carriers.length], notes: 'Không lưu tọa độ giả; vị trí tàu cần dữ liệu AIS từ nhà cung cấp.' }, create: { containerNo, type: index === 8 ? ContainerType.REEFER : index % 3 === 0 ? ContainerType.HC40 : ContainerType.GP40, sealNo: `APLU26${String(index + 1).padStart(6, '0')}`, status: containerStatus, shippingLine: carriers[index % carriers.length], notes: 'Không lưu tọa độ giả; vị trí tàu cần dữ liệu AIS từ nhà cung cấp.' } });
    const link = await prisma.shipmentContainer.upsert({ where: { id: `sample_link_${String(index + 1).padStart(3, '0')}` }, update: { shipmentId: shipment.id, containerId: container.id, bookingId: booking.id, releasedAt: null }, create: { id: `sample_link_${String(index + 1).padStart(3, '0')}`, shipmentId: shipment.id, containerId: container.id, bookingId: booking.id, assignedAt: ago(3 + index % 4) } });
    shipmentContainers.push({ shipment, container, linkId: link.id });
    if (!await prisma.shipmentEvent.findFirst({ where: { shipmentId: shipment.id, milestone: ShipmentMilestone.CREATED } })) {
      const milestones = transit
        ? [ShipmentMilestone.CREATED, ShipmentMilestone.BOOKING, ShipmentMilestone.EMPTY_PICKUP, ShipmentMilestone.STUFFING, ShipmentMilestone.GATE_IN, ShipmentMilestone.LOADED_ON_VESSEL]
        : roadDelivery
          ? [ShipmentMilestone.CREATED, ShipmentMilestone.BOOKING, ShipmentMilestone.ARRIVED, ShipmentMilestone.DISCHARGED, ShipmentMilestone.CONTAINER_PICKUP]
          : [ShipmentMilestone.CREATED, ShipmentMilestone.BOOKING];
      await prisma.shipmentEvent.createMany({ data: milestones.map((milestone, eventIndex) => ({ shipmentId: shipment.id, milestone, actualAt: ago(Math.max(0.1, 8 - eventIndex)), updatedById: actorId, note: 'Cập nhật theo hồ sơ khai thác nội bộ.' })) });
    }
    if (!await prisma.containerEvent.findFirst({ where: { containerId: container.id } })) {
      const statuses = transit
        ? [ContainerStatus.EMPTY_RELEASED, ContainerStatus.PICKED_UP, ContainerStatus.STUFFING, ContainerStatus.GATE_IN, ContainerStatus.LOADED_ON_VESSEL]
        : roadDelivery
          ? [ContainerStatus.EMPTY_RELEASED, ContainerStatus.PICKED_UP, ContainerStatus.STUFFING, ContainerStatus.GATE_IN, ContainerStatus.DISCHARGED]
          : [containerStatus];
      await prisma.containerEvent.createMany({ data: statuses.map((status, eventIndex) => ({ containerId: container.id, shipmentId: shipment.id, status, occurredAt: ago(Math.max(0.1, 6 - eventIndex)), updatedById: actorId, note: 'Sự kiện trạng thái ghi nhận trong lịch sử vận chuyển.' })) });
    }
  }

  const vesselIds: string[] = [];
  for (let index = 0; index < 9; index += 1) {
    const imo = `990${String(index + 1).padStart(4, '0')}`;
    const vessel = await prisma.vessel.upsert({ where: { imo }, update: { name: vesselNames[index], mmsi: `99910000${index + 1}`, callSign: `9V${String.fromCharCode(65 + index)}${index + 1}`, flag: 'VN', shippingLine: carriers[index], vesselType: 'Container Ship', status: VesselStatus.IN_TRANSIT }, create: { name: vesselNames[index], imo, mmsi: `99910000${index + 1}`, callSign: `9V${String.fromCharCode(65 + index)}${index + 1}`, flag: 'VN', shippingLine: carriers[index], vesselType: 'Container Ship', status: VesselStatus.IN_TRANSIT } });
    vesselIds.push(vessel.id);
    const [polCode, podCode] = routes[index];
    const voyageNo = `AP${String(index + 1).padStart(2, '0')}-26${String(9 + index).padStart(2, '0')}`;
    const voyage = await prisma.voyage.upsert({ where: { vesselId_voyageNo: { vesselId: vessel.id, voyageNo } }, update: { polId: portId[polCode], podId: portId[podCode], etd: ago(1 + index % 6), atd: ago(1 + index % 6), eta: ahead(8 + index * 2), status: VoyageStatus.DEPARTED, notes: 'Chuyến đang khai thác; vị trí trực tiếp chưa có nếu AIS chưa kết nối.' }, create: { vesselId: vessel.id, voyageNo, polId: portId[polCode], podId: portId[podCode], etd: ago(1 + index % 6), atd: ago(1 + index % 6), eta: ahead(8 + index * 2), status: VoyageStatus.DEPARTED, notes: 'Chuyến đang khai thác; vị trí trực tiếp chưa có nếu AIS chưa kết nối.' } });
    if (!await prisma.voyageEvent.findFirst({ where: { voyageId: voyage.id, status: VoyageStatus.DEPARTED } })) await prisma.voyageEvent.create({ data: { voyageId: voyage.id, status: VoyageStatus.DEPARTED, occurredAt: voyage.atd || ago(1), updatedById: actorId, note: 'Xác nhận tàu rời cảng theo lịch khai thác.' } });
    const item = shipmentContainers[index];
    const manifest = await prisma.voyageContainer.upsert({ where: { voyageId_containerId: { voyageId: voyage.id, containerId: item.container.id } }, update: { shipmentContainerId: item.linkId, status: VoyageContainerStatus.LOADED, loadedAt: voyage.atd, notes: 'Container đã xếp trên tàu; vị trí không được suy đoán.' }, create: { voyageId: voyage.id, containerId: item.container.id, shipmentContainerId: item.linkId, status: VoyageContainerStatus.LOADED, loadedAt: voyage.atd, notes: 'Container đã xếp trên tàu; vị trí không được suy đoán.' } });
    if (!await prisma.voyageContainerEvent.findFirst({ where: { voyageContainerId: manifest.id, status: VoyageContainerStatus.LOADED } })) await prisma.voyageContainerEvent.create({ data: { voyageContainerId: manifest.id, status: VoyageContainerStatus.LOADED, occurredAt: voyage.atd || ago(1), updatedById: actorId, note: 'Xác nhận container đã xếp tàu.' } });
    await prisma.container.update({ where: { id: item.container.id }, data: { status: ContainerStatus.IN_TRANSIT } });
    if (!await prisma.containerEvent.findFirst({ where: { containerId: item.container.id, status: ContainerStatus.VESSEL_DEPARTED } })) await prisma.containerEvent.create({ data: { containerId: item.container.id, shipmentId: item.shipment.id, status: ContainerStatus.VESSEL_DEPARTED, occurredAt: voyage.atd || ago(1), updatedById: actorId, note: `Tàu ${vesselNames[index]} / Voyage ${voyageNo} rời cảng.` } });
    await prisma.shipment.update({ where: { id: item.shipment.id }, data: { status: ShipmentStatus.IN_TRANSIT, atd: voyage.atd, eta: voyage.eta } });
    if (!await prisma.shipmentEvent.findFirst({ where: { shipmentId: item.shipment.id, milestone: ShipmentMilestone.VESSEL_DEPARTED } })) await prisma.shipmentEvent.create({ data: { shipmentId: item.shipment.id, milestone: ShipmentMilestone.VESSEL_DEPARTED, actualAt: voyage.atd, plannedAt: voyage.etd, updatedById: actorId, note: `Tàu ${vesselNames[index]} / Voyage ${voyageNo}.` } });
  }

  const truckRows = [
    { plate: '51H-829.46', type: TruckType.TRACTOR, capacity: 24000, name: 'Võ Minh Khang', phone: '0908452176' },
    { plate: '51H-638.25', type: TruckType.TRACTOR, capacity: 25000, name: 'Nguyễn Thành Long', phone: '0914378250' },
    { plate: '15H-276.91', type: TruckType.TRACTOR, capacity: 24000, name: 'Phạm Quốc Huy', phone: '0982746135' },
    { plate: '60H-419.73', type: TruckType.TRUCK, capacity: 12000, name: 'Lê Văn Phúc', phone: '0936852147' },
    { plate: '51H-504.18', type: TruckType.TRACTOR, capacity: 25000, name: 'Đặng Minh Tâm', phone: '0975412863' },
    { plate: '15H-198.64', type: TruckType.TRUCK, capacity: 10000, name: 'Bùi Hoàng Sơn', phone: '0902674185' },
  ];
  const trucks = [];
  const drivers = [];
  for (let index = 0; index < truckRows.length; index += 1) {
    const row = truckRows[index];
    const activeTrip = index < 4;
    const truck = await prisma.truck.upsert({ where: { plateNo: row.plate }, update: { type: row.type, capacityKg: row.capacity, status: activeTrip ? TruckStatus.DELIVERING : TruckStatus.AVAILABLE, gpsDeviceId: null, inspectionExpires: ahead(90 + index * 17), insuranceExpires: ahead(150 + index * 13), notes: 'Xe đầu kéo và xe tải tuyến cảng - kho; chưa kết nối thiết bị GPS.' }, create: { plateNo: row.plate, type: row.type, capacityKg: row.capacity, status: activeTrip ? TruckStatus.DELIVERING : TruckStatus.AVAILABLE, inspectionExpires: ahead(90 + index * 17), insuranceExpires: ahead(150 + index * 13), notes: 'Xe đầu kéo và xe tải tuyến cảng - kho; chưa kết nối thiết bị GPS.' } });
    trucks.push(truck);
    const code = `DRV-2026-${String(41 + index).padStart(3, '0')}`;
    const driverUser = index === 0 ? await prisma.user.findUnique({ where: { email: 'driver@tms.local' } }) : null;
    const driver = await prisma.driver.upsert({ where: { code }, update: { fullName: row.name, phone: row.phone, licenseNo: `79F${String(123456 + index * 137).padStart(6, '0')}`, licenseClass: row.type === TruckType.TRACTOR ? 'FC' : 'C', licenseExpires: ahead(450 + index * 30), assignedTruckId: truck.id, status: activeTrip ? DriverStatus.ON_TRIP : DriverStatus.AVAILABLE, userId: driverUser?.id, notes: 'Hồ sơ nhân sự hư cấu phục vụ kiểm tra luồng điều vận.' }, create: { code, fullName: row.name, phone: row.phone, licenseNo: `79F${String(123456 + index * 137).padStart(6, '0')}`, licenseClass: row.type === TruckType.TRACTOR ? 'FC' : 'C', licenseExpires: ahead(450 + index * 30), assignedTruckId: truck.id, status: activeTrip ? DriverStatus.ON_TRIP : DriverStatus.AVAILABLE, userId: driverUser?.id, notes: 'Hồ sơ nhân sự hư cấu phục vụ kiểm tra luồng điều vận.' } });
    drivers.push(driver);
    if (index < 4) {
      const item = shipmentContainers[index + 12];
      const jobNo = `TRP-2026-${String(1842 + index).padStart(4, '0')}`;
      const pickup = ago(0.15);
      const delivery = ahead(0.12 + index * 0.015);
      const job = await prisma.transportJob.upsert({ where: { jobNo }, update: { shipmentId: item.shipment.id, containerId: item.container.id, truckId: truck.id, driverId: driver.id, pickupPlace: index % 2 ? 'Cảng Hải Phòng, Đình Vũ' : 'Cảng Cát Lái, TP. Hồ Chí Minh', deliveryPlace: ['Kho An Phát, KCN Hiệp Phước', 'Kho Minh Long, KCN Đình Vũ', 'Kho Đại Phúc, TP. Thủ Đức', 'Kho Nam Việt, TP. Dĩ An'][index], pickupAt: pickup, deliveryAt: delivery, actualPickupAt: pickup, status: TransportJobStatus.DELIVERING, loadedKm: 28 + index * 16, emptyKm: 11 + index * 5, notes: 'Đang giao hàng theo lịch điều độ; tọa độ xe chỉ có khi kết nối GPS.' }, create: { jobNo, shipmentId: item.shipment.id, containerId: item.container.id, truckId: truck.id, driverId: driver.id, pickupPlace: index % 2 ? 'Cảng Hải Phòng, Đình Vũ' : 'Cảng Cát Lái, TP. Hồ Chí Minh', deliveryPlace: ['Kho An Phát, KCN Hiệp Phước', 'Kho Minh Long, KCN Đình Vũ', 'Kho Đại Phúc, TP. Thủ Đức', 'Kho Nam Việt, TP. Dĩ An'][index], pickupAt: pickup, deliveryAt: delivery, actualPickupAt: pickup, status: TransportJobStatus.DELIVERING, loadedKm: 28 + index * 16, emptyKm: 11 + index * 5, notes: 'Đang giao hàng theo lịch điều độ; tọa độ xe chỉ có khi kết nối GPS.' } });
      if (!await prisma.transportJobEvent.findFirst({ where: { jobId: job.id, status: TransportJobStatus.DELIVERING } })) await prisma.transportJobEvent.createMany({ data: [
        { jobId: job.id, status: TransportJobStatus.ASSIGNED, occurredAt: ago(0.3), updatedById: actorId, note: 'Điều độ xác nhận xe và tài xế cho khung giờ giao hàng.' },
        { jobId: job.id, status: TransportJobStatus.PICKING_UP, occurredAt: ago(0.2), updatedById: actorId, note: 'Xe đến khu vực nhận container tại cảng.' },
        { jobId: job.id, status: TransportJobStatus.IN_TRANSIT, occurredAt: ago(0.16), updatedById: actorId, note: 'Container đã rời cảng theo phiếu giao nhận.' },
        { jobId: job.id, status: TransportJobStatus.DELIVERING, occurredAt: pickup, updatedById: actorId, note: 'Tài xế xác nhận đang giao đến kho khách hàng.' },
      ] });
    }
  }

  for (let index = 0; index < 6; index += 1) {
    const item = shipmentContainers[index];
    const linkId = `sample_truck_link_${String(index + 1).padStart(3, '0')}`;
    await prisma.trailer.upsert({ where: { plateNo: ['51R-202.86', '51R-318.54', '15R-640.21', '60R-851.37', '51R-475.29', '15R-208.64'][index] }, update: { truckId: trucks[index].id, type: 'Sơ-mi rơ-moóc sàn container', capacityKg: 30000, notes: 'Rơ-moóc vận chuyển container 20/40 feet.' }, create: { id: linkId, plateNo: ['51R-202.86', '51R-318.54', '15R-640.21', '60R-851.37', '51R-475.29', '15R-208.64'][index], type: 'Sơ-mi rơ-moóc sàn container', capacityKg: 30000, truckId: trucks[index].id, notes: 'Rơ-moóc vận chuyển container 20/40 feet.' } });
  }

  const financeShipments = shipments.slice(0, 9);
  for (let index = 0; index < financeShipments.length; index += 1) {
    const shipment = financeShipments[index];
    const base = 68_500_000 + index * 7_250_000;
    const costRows = [
      { id: `sample_cost_ocean_${index + 1}`, category: CostCategory.OCEAN_FREIGHT, description: 'Cước biển theo booking', amount: 31_500_000 + index * 1_750_000 },
      { id: `sample_cost_local_${index + 1}`, category: CostCategory.LOCAL_CHARGE, description: 'THC và phí chứng từ đầu xuất', amount: 8_200_000 + index * 310_000 },
      { id: `sample_cost_road_${index + 1}`, category: CostCategory.ROAD_FREIGHT, description: 'Vận chuyển cảng - kho', amount: 5_800_000 + index * 220_000 },
    ];
    for (const cost of costRows) await prisma.cost.upsert({ where: { id: cost.id }, update: { shipmentId: shipment.id, category: cost.category, description: cost.description, amount: cost.amount, currency: 'VND', occurredAt: ago(2), createdById: actorId }, create: { ...cost, shipmentId: shipment.id, currency: 'VND', occurredAt: ago(2), createdById: actorId, notes: 'Khoản cước tham chiếu nội bộ, số liệu hư cấu.' } });
    const invoiceNo = `INV-2026-${String(1842 + index).padStart(4, '0')}`;
    const invoiceStatus = index === 0 ? InvoiceStatus.PAID : index < 4 ? InvoiceStatus.ISSUED : InvoiceStatus.DRAFT;
    const invoice = await prisma.invoice.upsert({ where: { invoiceNo }, update: { shipmentId: shipment.id, currency: 'VND', totalAmount: base, status: invoiceStatus, issuedAt: invoiceStatus === InvoiceStatus.DRAFT ? null : ago(1), dueAt: ahead(21), notes: 'Hóa đơn nội bộ tạo cho bộ dữ liệu vận hành.', createdById: actorId }, create: { invoiceNo, shipmentId: shipment.id, currency: 'VND', totalAmount: base, status: invoiceStatus, issuedAt: invoiceStatus === InvoiceStatus.DRAFT ? null : ago(1), dueAt: ahead(21), notes: 'Hóa đơn nội bộ tạo cho bộ dữ liệu vận hành.', createdById: actorId } });
    await prisma.invoiceLine.upsert({ where: { id: `sample_invoice_line_${index + 1}` }, update: { invoiceId: invoice.id, description: 'Cước giao nhận trọn gói theo Shipment', quantity: 1, unitPrice: base, amount: base }, create: { id: `sample_invoice_line_${index + 1}`, invoiceId: invoice.id, description: 'Cước giao nhận trọn gói theo Shipment', quantity: 1, unitPrice: base, amount: base } });
    if (invoiceStatus !== InvoiceStatus.DRAFT) {
      await prisma.revenue.upsert({ where: { id: `sample_revenue_${index + 1}` }, update: { shipmentId: shipment.id, invoiceId: invoice.id, category: RevenueCategory.INVOICE, description: `Doanh thu ${invoiceNo}`, amount: base, currency: 'VND', occurredAt: ago(1), createdById: actorId }, create: { id: `sample_revenue_${index + 1}`, shipmentId: shipment.id, invoiceId: invoice.id, category: RevenueCategory.INVOICE, description: `Doanh thu ${invoiceNo}`, amount: base, currency: 'VND', occurredAt: ago(1), createdById: actorId, notes: 'Doanh thu tham chiếu nội bộ, số liệu hư cấu.' } });
    }
    if (invoiceStatus === InvoiceStatus.PAID && !await prisma.payment.findFirst({ where: { invoiceId: invoice.id, reference: 'UNC-2026-1018' } })) await prisma.payment.create({ data: { invoiceId: invoice.id, amount: base, currency: 'VND', paidAt: ago(0.5), reference: 'UNC-2026-1018', notes: 'Thanh toán chuyển khoản đã ghi nhận trong bộ dữ liệu nội bộ.', recordedById: actorId } });
  }

  const workspaceRoot = path.basename(process.cwd()).toLowerCase() === 'api' && path.basename(path.dirname(process.cwd())).toLowerCase() === 'apps'
    ? path.resolve(process.cwd(), '..', '..')
    : process.cwd();
  const storageRoot = process.env.DOCUMENTS_STORAGE_DIR?.trim() ? path.resolve(process.env.DOCUMENTS_STORAGE_DIR) : path.join(workspaceRoot, '.data', 'uploads');
  await mkdir(storageRoot, { recursive: true });
  const referenceDocuments = [
    { shipmentIndex: 0, type: DocumentType.BOOKING_CONFIRMATION, id: 'sample_doc_booking_001', storageKey: '6f8a0001-0000-4000-8000-000000000001.pdf', name: 'Tham-khao-booking-SHP-2026-1842.pdf', reference: 'BKG-2026-1842' },
    { shipmentIndex: 0, type: DocumentType.BILL_OF_LADING, id: 'sample_doc_bill_001', storageKey: '6f8a0002-0000-4000-8000-000000000002.pdf', name: 'Tham-khao-van-don-SHP-2026-1842.pdf', reference: 'APL-SGN-LAX-261842' },
    { shipmentIndex: 1, type: DocumentType.PACKING_LIST, id: 'sample_doc_pack_001', storageKey: '6f8a0003-0000-4000-8000-000000000003.pdf', name: 'Tham-khao-packing-list-SHP-2026-1843.pdf', reference: 'SHP-2026-1843' },
    { shipmentIndex: 2, type: DocumentType.COMMERCIAL_INVOICE, id: 'sample_doc_commercial_001', storageKey: '6f8a0004-0000-4000-8000-000000000004.pdf', name: 'Tham-khao-commercial-invoice-SHP-2026-1844.pdf', reference: 'INV-2026-1844' },
    { shipmentIndex: 3, type: DocumentType.EIR, id: 'sample_doc_eir_001', storageKey: '6f8a0005-0000-4000-8000-000000000005.pdf', name: 'Tham-khao-EIR-SHP-2026-1845.pdf', reference: 'TMSU0000046' },
  ];
  for (const doc of referenceDocuments) {
    const shipment = shipments[doc.shipmentIndex];
    const pdf = referencePdf([`Shipment: ${shipment.shipmentNo}`, `Reference: ${doc.reference}`, `Cargo: ${shipment.cargoName}`, `Created: ${new Date().toISOString().slice(0, 10)}`, 'This reference document is fictional and not valid for any transaction.']);
    await writeFile(path.join(storageRoot, doc.storageKey), pdf, { mode: 0o600 });
    await prisma.document.upsert({ where: { id: doc.id }, update: { shipmentId: shipment.id, type: doc.type, originalName: doc.name, storageKey: doc.storageKey, mimeType: 'application/pdf', byteSize: pdf.length, notes: 'Tài liệu tham khảo được tạo từ dữ liệu hư cấu; không có giá trị giao dịch.', uploadedById: actorId }, create: { id: doc.id, shipmentId: shipment.id, type: doc.type, originalName: doc.name, storageKey: doc.storageKey, mimeType: 'application/pdf', byteSize: pdf.length, notes: 'Tài liệu tham khảo được tạo từ dữ liệu hư cấu; không có giá trị giao dịch.', uploadedById: actorId, createdAt: ago(1) } });
    if (!await prisma.auditLog.findFirst({ where: { action: 'SAMPLE_DOCUMENT_CREATED', entity: 'Document', entityId: doc.id } })) await prisma.auditLog.create({ data: { actorId, action: 'SAMPLE_DOCUMENT_CREATED', entity: 'Document', entityId: doc.id, changes: { shipmentNo: shipment.shipmentNo, type: doc.type, storageKey: doc.storageKey } } });
  }

  // Replace labels left by earlier local seeds without deleting linked history.
  await prisma.user.updateMany({ where: { fullName: { contains: 'Demo', mode: 'insensitive' } }, data: { fullName: 'Nhân viên vận hành' } });
  const strayVessel = await prisma.vessel.findFirst({ where: { name: { contains: 'demo', mode: 'insensitive' }, NOT: { imo: { startsWith: '990' } } } });
  if (strayVessel) await prisma.vessel.update({ where: { id: strayVessel.id }, data: { name: 'An Phú Horizon', imo: `991${strayVessel.imo.slice(-4)}`, mmsi: '999100099', callSign: '9VAP9', flag: 'VN', shippingLine: 'An Phú Lines', status: VesselStatus.IN_TRANSIT } });

  const audit = await prisma.auditLog.findFirst({ where: { action: 'SAMPLE_OPERATIONS_REFRESHED' } });
  if (!audit) await prisma.auditLog.create({ data: { actorId, action: 'SAMPLE_OPERATIONS_REFRESHED', entity: 'OperationsSeed', changes: { customers: 9, shipments: 12, vesselsUnderway: 9, trucksDelivering: 4, positionsCreated: 0 } } });
  console.log('Đã nạp 9 khách hàng, 16 lô hàng, 9 tàu đang chạy, 4 xe đang giao hàng và 5 chứng từ tham khảo có đóng dấu dữ liệu hư cấu; không tạo vị trí AIS giả.');
}

async function main() {
  const { admin } = await seedAccess();
  for (const port of [
    { code: 'VNSGN', name: 'Cảng Cát Lái', country: 'Việt Nam' },
    { code: 'VNHPH', name: 'Cảng Hải Phòng', country: 'Việt Nam' },
    { code: 'USLAX', name: 'Cảng Los Angeles', country: 'Hoa Kỳ' },
    { code: 'SGSIN', name: 'Cảng Singapore', country: 'Singapore' },
  ]) await prisma.port.upsert({ where: { code: port.code }, update: port, create: port });
  await seedOperations(admin.id);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
