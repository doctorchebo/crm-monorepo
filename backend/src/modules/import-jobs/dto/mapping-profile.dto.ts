import {
    IsString,
    IsObject,
    IsOptional,
} from 'class-validator';

/**
 * DTO for creating a mapping profile
 */
export class CreateMappingProfileDto {
    @IsString()
    providerName: string;

    @IsObject()
    mapping: Record<string, string | null>;
}

/**
 * DTO for updating a mapping profile
 */
export class UpdateMappingProfileDto {
    @IsOptional()
    @IsString()
    providerName?: string;

    @IsOptional()
    @IsObject()
    mapping?: Record<string, string | null>;
}

/**
 * Response type
 */
export interface MappingProfileResponse {
    id: string;
    userId: number;
    providerName: string;
    mapping: Record<string, string | null>;
    createdAt: Date;
}
