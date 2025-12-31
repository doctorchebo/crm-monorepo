import { Module, OnModuleInit } from '@nestjs/common';
import { ReactionsController } from './reactions.controller';
import { ReactionsGateway, setReactionsGateway } from './reactions.gateway';
import { ReactionsService } from './reactions.service';

@Module({
  controllers: [ReactionsController],
  providers: [ReactionsService, ReactionsGateway],
  exports: [ReactionsService, ReactionsGateway],
})
export class ReactionsModule implements OnModuleInit {
  constructor(private readonly reactionsGateway: ReactionsGateway) {}

  onModuleInit() {
    // Set the singleton instance for use in services
    setReactionsGateway(this.reactionsGateway);
  }
}
