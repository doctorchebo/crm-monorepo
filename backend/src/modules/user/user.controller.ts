import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

interface AuthenticatedRequest {
  user: { userId: number };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.userService.findOne(userId.toString());
  }

  @Get('activity')
  async getActivityLogs(@Req() req: AuthenticatedRequest) {
    const userId =
      typeof req.user.userId === 'string'
        ? parseInt(req.user.userId, 10)
        : req.user.userId;
    return this.userService.getActivityLogs(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
