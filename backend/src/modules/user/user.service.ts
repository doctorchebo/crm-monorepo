import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  async findOne(id: string) {
    // TODO: Fetch user from database
    return null;
  }

  async findByEmail(email: string) {
    // TODO: Fetch user by email from database
    return null;
  }

  async update(id: string, updateUserDto: any) {
    // TODO: Update user in database
    return null;
  }

  async remove(id: string) {
    // TODO: Delete user from database
    return null;
  }
}
