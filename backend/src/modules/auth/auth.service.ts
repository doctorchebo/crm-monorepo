import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../database/db.connection';
import { users } from '../../database/schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async register(registerDto: RegisterDto) {
    // TODO: Implement user registration with hashed password
    // This would typically involve saving to database and returning user without password
    return {
      message: 'User registered successfully',
      user: { email: registerDto.email, name: registerDto.name },
    };
  }

  async login(loginDto: LoginDto) {
    // Validate credentials against database
    const user = await db.query.users.findFirst({
      where: eq(users.email, loginDto.email),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare provided password with hashed password
    const isPasswordValid = await compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create JWT payload with real user ID
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async validateUser(email: string, password: string) {
    // TODO: Implement user validation logic
    // Fetch user from database and validate password
    return null;
  }
}
