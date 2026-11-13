import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { normalizeEmail } from '../common/security';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const userSelect = {
  id: true, email: true, fullName: true, active: true, createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Controller('users')
@RequirePermission('users.manage')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() { return this.prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } }); }

  @Get('roles')
  roles() { return this.prisma.role.findMany({ select: { code: true, name: true }, orderBy: { code: 'asc' } }); }

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: AuthRequest) {
    if (!dto.roleCodes.length) throw new BadRequestException('Chọn ít nhất một vai trò');
    const email = normalizeEmail(dto.email);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email đã tồn tại');
    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email, fullName: dto.fullName.trim(), passwordHash,
          roles: { create: [...new Set(dto.roleCodes)].map((code) => ({ role: { connect: { code } } })) },
        }, select: userSelect,
      });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'USER_CREATED', entity: 'User', entityId: created.id, changes: { email, roleCodes: dto.roleCodes }, ipAddress: req.ip } });
      return created;
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AuthRequest) {
    if (id === req.authUser.id && dto.active === false) throw new BadRequestException('Không thể tự vô hiệu hóa tài khoản');
    if (id === req.authUser.id && dto.roleCodes) throw new BadRequestException('Không thể tự thay đổi vai trò');
    if (dto.roleCodes && !dto.roleCodes.length) throw new BadRequestException('Chọn ít nhất một vai trò');
    if (dto.fullName === undefined && dto.active === undefined && dto.roleCodes === undefined) throw new BadRequestException('Không có thay đổi nào');
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!existing) throw new NotFoundException('Không tìm thấy người dùng');
    const before = { fullName: existing.fullName, active: existing.active, roleCodes: existing.roles.map(({ role }) => role.code) };
    const after = { fullName: dto.fullName?.trim() ?? before.fullName, active: dto.active ?? before.active, roleCodes: dto.roleCodes ?? before.roleCodes };
    const user = await this.prisma.$transaction(async (tx) => {
      if (dto.roleCodes) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        const roles = await tx.role.findMany({ where: { code: { in: [...new Set(dto.roleCodes)] } } });
        await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      }
      const updated = await tx.user.update({
        where: { id }, data: { fullName: dto.fullName?.trim(), active: dto.active }, select: userSelect,
      });
      if (dto.roleCodes || dto.active === false) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: { actorId: req.authUser.id, action: 'USER_UPDATED', entity: 'User', entityId: id, changes: { before, after }, ipAddress: req.ip },
      });
      return updated;
    });
    return user;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    if (id === req.authUser.id) throw new BadRequestException('Không thể xóa tài khoản đang đăng nhập');
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.active) throw new ConflictException('Hãy vô hiệu hóa tài khoản trước khi xóa');
    if (user.roles.some(({ role }) => role.code === 'ADMIN')) {
      const admins = await this.prisma.user.count({ where: { roles: { some: { role: { code: 'ADMIN' } } } } });
      if (admins <= 1) throw new ConflictException('Không thể xóa quản trị viên cuối cùng');
    }
    const [shipments, shipmentEvents, containerEvents, jobs, voyageEvents, voyageContainerEvents, documents, costs, revenues, invoices, payments, alerts] = await Promise.all([
      this.prisma.shipment.count({ where: { assigneeId: id } }), this.prisma.shipmentEvent.count({ where: { updatedById: id } }),
      this.prisma.containerEvent.count({ where: { updatedById: id } }), this.prisma.transportJobEvent.count({ where: { updatedById: id } }),
      this.prisma.voyageEvent.count({ where: { updatedById: id } }), this.prisma.voyageContainerEvent.count({ where: { updatedById: id } }),
      this.prisma.document.count({ where: { uploadedById: id } }), this.prisma.cost.count({ where: { createdById: id } }),
      this.prisma.revenue.count({ where: { createdById: id } }), this.prisma.invoice.count({ where: { createdById: id } }),
      this.prisma.payment.count({ where: { recordedById: id } }), this.prisma.alert.count({ where: { acknowledgedById: id } }),
    ]);
    if (shipments + shipmentEvents + containerEvents + jobs + voyageEvents + voyageContainerEvents + documents + costs + revenues + invoices + payments + alerts) {
      throw new ConflictException('Tài khoản có lịch sử nghiệp vụ. Hãy giữ trạng thái vô hiệu hóa để bảo toàn chứng từ và lịch sử kiểm toán.');
    }
    const driver = await this.prisma.driver.findUnique({ where: { userId: id }, select: { id: true } });
    if (driver) throw new ConflictException('Tài khoản đang liên kết hồ sơ tài xế. Gỡ liên kết tài xế trước khi xóa.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'USER_DELETED', entity: 'User', entityId: id, changes: { email: user.email, fullName: user.fullName }, ipAddress: req.ip } });
    });
    return { deleted: true };
  }
}
