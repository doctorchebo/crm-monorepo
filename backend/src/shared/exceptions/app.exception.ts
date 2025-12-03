/**
 * Shared Exception Classes
 */

export class AppException extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppException';
  }
}

export class ValidationException extends AppException {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationException';
  }
}

export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends AppException {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictException';
  }
}

export class InternalServerException extends AppException {
  constructor(message: string = 'Internal server error') {
    super(500, message);
    this.name = 'InternalServerException';
  }
}
