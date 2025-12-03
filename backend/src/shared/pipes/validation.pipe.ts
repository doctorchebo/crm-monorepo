import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Validation Pipe
 * Automatically validates DTOs against class-validator rules
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, metadata: any) {
    if (
      !metadata.type ||
      metadata.type === String ||
      metadata.type === Number
    ) {
      return value;
    }

    const object = plainToInstance(metadata.type, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      throw new BadRequestException('Validation failed');
    }

    return value;
  }
}
