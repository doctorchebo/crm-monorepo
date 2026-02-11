import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditWriteService } from '../audit/audit-write.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RefreshJwtGuard } from './refresh.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshJwtStrategy } from './strategies/refresh.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        const jwtExpirationEnv = configService.get<string>('JWT_EXPIRATION');
        const jwtExpirationParsed = parseInt(jwtExpirationEnv || '3600', 10);

        console.log('[Auth Module] JWT Configuration:', {
          jwtSecret: jwtSecret ? '***set***' : 'MISSING',
          jwtExpirationEnv,
          jwtExpirationParsed,
          jwtExpirationType: typeof jwtExpirationParsed,
        });

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: jwtExpirationParsed,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshJwtStrategy,
    JwtAuthGuard,
    RefreshJwtGuard,
    AuditWriteService,
  ],
  exports: [JwtAuthGuard, RefreshJwtGuard],
})
export class AuthModule {}
