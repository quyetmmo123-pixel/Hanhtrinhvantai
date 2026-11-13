import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('status')
  @RequirePermission('operations.view')
  status() { return this.tracking.getStatus(); }

  @Get('live')
  @RequirePermission('operations.view')
  liveVessels() { return this.tracking.liveVessels(); }
}
