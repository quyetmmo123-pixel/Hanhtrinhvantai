import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType } from '@prisma/client';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { RequirePermission } from '../auth/auth.decorators';
import { AuthRequest } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { UploadDocumentDto } from './documents.dto';

const maxFileSize = 25 * 1024 * 1024;
const allowedMimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv',
};
const safeSelect = { id: true, shipmentId: true, type: true, originalName: true, mimeType: true, byteSize: true, notes: true, createdAt: true, uploadedBy: { select: { id: true, fullName: true } }, shipment: { select: { id: true, shipmentNo: true, customer: { select: { companyName: true } } } } } as const;

@Controller('documents')
export class DocumentsController {
  private readonly storageRoot = this.resolveStorageRoot();
  constructor(private readonly db: PrismaService) {}

  @Get() @RequirePermission('operations.view')
  list(@Query('shipmentId') shipmentId?: string) {
    return this.db.document.findMany({ where: shipmentId ? { shipmentId } : undefined, select: safeSelect, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post() @RequirePermission('documents.manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { files: 1, fileSize: maxFileSize } }))
  async upload(@Body() dto: UploadDocumentDto, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AuthRequest) {
    if (!file?.buffer?.length) throw new BadRequestException('Vui lòng chọn file chứng từ');
    if (file.size > maxFileSize) throw new BadRequestException('File vượt giới hạn 25 MB');
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes[extension] || allowedMimeTypes[extension] !== file.mimetype) throw new BadRequestException('Chỉ nhận PDF, PNG, JPG, DOC, DOCX, XLS, XLSX hoặc CSV đúng định dạng');
    const shipment = await this.db.shipment.findUnique({ where: { id: dto.shipmentId }, select: { id: true } });
    if (!shipment) throw new NotFoundException('Không tìm thấy Shipment');
    const originalName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255);
    if (!originalName) throw new BadRequestException('Tên file không hợp lệ');
    const storageKey = `${randomUUID()}${extension}`;
    await mkdir(this.storageRoot, { recursive: true });
    const absolutePath = path.join(this.storageRoot, storageKey);
    await writeFile(absolutePath, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      return await this.db.$transaction(async (tx) => {
        const item = await tx.document.create({ data: { shipmentId: shipment.id, type: dto.type, originalName, storageKey, mimeType: file.mimetype, byteSize: file.size, notes: dto.notes, uploadedById: req.authUser.id }, select: safeSelect });
        await tx.auditLog.create({ data: { actorId: req.authUser.id, action: 'DOCUMENT_UPLOADED', entity: 'Document', entityId: item.id, changes: { shipmentId: item.shipmentId, type: item.type, originalName: item.originalName, byteSize: item.byteSize }, ipAddress: req.ip } });
        return item;
      });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id/download') @RequirePermission('operations.view')
  async download(@Param('id') id: string, @Res() response: Response) {
    const item = await this.db.document.findUnique({ where: { id }, select: { id: true, originalName: true, storageKey: true, mimeType: true } });
    if (!item) throw new NotFoundException('Không tìm thấy chứng từ');
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(item.storageKey)) throw new NotFoundException('Không tìm thấy file chứng từ');
    const filePath = path.resolve(this.storageRoot, item.storageKey);
    if (!filePath.startsWith(`${path.resolve(this.storageRoot)}${path.sep}`) || !existsSync(filePath)) throw new NotFoundException('Không tìm thấy file chứng từ');
    response.setHeader('Content-Type', item.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    return response.download(filePath, item.originalName);
  }

  private resolveStorageRoot(): string {
    const configured = process.env.DOCUMENTS_STORAGE_DIR?.trim();
    if (configured) return path.resolve(configured);
    const cwd = process.cwd();
    return path.join(existsSync(path.join(cwd, 'apps', 'api', 'package.json')) ? cwd : path.resolve(cwd, '../..'), '.data', 'uploads');
  }
}
