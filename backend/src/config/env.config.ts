import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  validate,
} from 'class-validator';

export enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.DEVELOPMENT;

  @IsNumber()
  PORT: number = 3001;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsNumber()
  JWT_EXPIRATION: number = 3600; // 1 hour - access token

  @IsNumber()
  JWT_REFRESH_EXPIRATION: number = 604800; // 7 days - refresh token

  @IsString()
  @IsNotEmpty()
  META_WABA_ID: string;

  @IsString()
  @IsNotEmpty()
  META_BUSINESS_PHONE_NUMBER: string;

  @IsString()
  @IsNotEmpty()
  META_ACCESS_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  META_VERIFY_TOKEN: string;

  @IsString()
  META_APP_ID?: string;

  @IsString()
  META_APP_SECRET?: string;

  @IsString()
  META_EMBEDDED_SIGNUP_CONFIG_ID?: string; // Facebook Login for Business configuration ID

  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  STRIPE_SECRET_KEY: string;

  @IsString()
  STRIPE_WEBHOOK_SECRET: string;

  @IsString()
  FRONTEND_URL: string = 'http://localhost:3000';
}

export async function validateEnvironment(
  config: Record<string, unknown>,
): Promise<EnvironmentVariables> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = await validate(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  return validatedConfig;
}
