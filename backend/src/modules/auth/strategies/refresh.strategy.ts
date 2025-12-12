import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Refresh Token Strategy
 * Used to validate refresh tokens when requesting new access tokens
 * Unlike JwtStrategy, this uses the same secret but allows extended validation
 */
@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // First, try to extract from Authorization Bearer header
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Then, try to extract from HTTP-only cookie
        (req: Request) => {
          if (req && req.cookies) {
            return req.cookies['jwt_refresh_token'] || null;
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email };
  }
}
