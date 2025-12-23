import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private logger = new Logger(JwtStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // First, try to extract from Authorization Bearer header
        (req: Request) => {
          const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          if (token) {
            this.logger.debug(
              '[JWT Strategy] Token found in Authorization header',
            );
            return token;
          }
          return null;
        },
        // Then, try to extract from HTTP-only cookie
        (req: Request) => {
          const token = req?.cookies?.['jwt_token'];
          if (token) {
            this.logger.debug('[JWT Strategy] Token found in jwt_token cookie');
            return token;
          }
          this.logger.warn(
            '[JWT Strategy] No token found in cookies or headers',
            {
              cookieKeys: req?.cookies
                ? Object.keys(req.cookies)
                : 'no cookies object',
              url: req?.url,
            },
          );
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // this.logger.debug('[JWT Strategy] Full payload decoded:', payload);
    // this.logger.debug('[JWT Strategy] Token validated successfully', {
    //   sub: payload.sub,
    //   userId: payload.sub,
    //   email: payload.email,
    // });
    return { userId: payload.sub, email: payload.email };
  }
}
