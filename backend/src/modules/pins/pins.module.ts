import { Module, OnModuleInit } from '@nestjs/common';
import { PinsController } from './pins.controller';
import { PinsGateway, setPinsGateway } from './pins.gateway';
import { PinsService } from './pins.service';

@Module({
  controllers: [PinsController],
  providers: [PinsService, PinsGateway],
  exports: [PinsService, PinsGateway],
})
export class PinsModule implements OnModuleInit {
  constructor(private readonly pinsGateway: PinsGateway) {}

  onModuleInit() {
    // Set the singleton instance for use in services
    setPinsGateway(this.pinsGateway);
  }
}
