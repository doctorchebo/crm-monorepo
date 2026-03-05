import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };

  const mockUserId = 1;

  beforeEach(async () => {
    // Create mock database methods
    mockDb = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
    };

    // Add chainable methods
    const chainableMock = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };

    Object.assign(mockDb.select(), chainableMock);
    Object.assign(mockDb.insert(), chainableMock);
    Object.assign(mockDb.delete(), chainableMock);
    Object.assign(mockDb.update(), chainableMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setBulkAvailability', () => {
    it('should save rules for all days including unavailable ones', async () => {
      const insertValues: unknown[] = [];
      const mockInsert = jest.fn().mockReturnValue({
        values: jest.fn((vals) => {
          insertValues.push(...vals);
          return {
            returning: jest.fn().mockResolvedValue(vals),
          };
        }),
      });
      const mockDelete = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });

      (service as unknown as { db: unknown }).db = {
        insert: mockInsert,
        delete: mockDelete,
      };

      const dto = {
        weeklySchedule: [
          {
            dayOfWeek: 1, // Monday
            slots: [{ startTime: '09:00', endTime: '17:00' }],
            isAvailable: true,
          },
          {
            dayOfWeek: 2, // Tuesday
            slots: [{ startTime: '09:00', endTime: '17:00' }],
            isAvailable: false, // Marked as unavailable
          },
        ],
      };

      await service.setBulkAvailability(mockUserId, dto);

      expect(insertValues.length).toBe(2);
      // Monday should be active (available)
      expect(insertValues[0]).toMatchObject({
        userId: mockUserId,
        daysOfWeek: [1],
        isActive: true,
        ruleType: 'available',
      });
      // Tuesday should be inactive (unavailable)
      expect(insertValues[1]).toMatchObject({
        userId: mockUserId,
        daysOfWeek: [2],
        isActive: false,
        ruleType: 'unavailable',
      });
    });

    it('should handle all days being unavailable', async () => {
      const insertValues: unknown[] = [];
      const mockInsert = jest.fn().mockReturnValue({
        values: jest.fn((vals) => {
          insertValues.push(...vals);
          return {
            returning: jest.fn().mockResolvedValue(vals),
          };
        }),
      });
      const mockDelete = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });

      (service as unknown as { db: unknown }).db = {
        insert: mockInsert,
        delete: mockDelete,
      };

      const dto = {
        weeklySchedule: [
          {
            dayOfWeek: 0, // Sunday
            slots: [{ startTime: '09:00', endTime: '17:00' }],
            isAvailable: false,
          },
          {
            dayOfWeek: 6, // Saturday
            slots: [{ startTime: '09:00', endTime: '17:00' }],
            isAvailable: false,
          },
        ],
      };

      await service.setBulkAvailability(mockUserId, dto);

      expect(insertValues.length).toBe(2);
      // Both days should be inactive
      expect(
        insertValues.every(
          (rule: unknown) => (rule as { isActive: boolean }).isActive === false,
        ),
      ).toBe(true);
    });

    it('should use default time window for unavailable days with empty slots', async () => {
      const insertValues: unknown[] = [];
      const mockInsert = jest.fn().mockReturnValue({
        values: jest.fn((vals) => {
          insertValues.push(...vals);
          return {
            returning: jest.fn().mockResolvedValue(vals),
          };
        }),
      });
      const mockDelete = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });

      (service as unknown as { db: unknown }).db = {
        insert: mockInsert,
        delete: mockDelete,
      };

      const dto = {
        weeklySchedule: [
          {
            dayOfWeek: 3, // Wednesday
            slots: [], // Empty slots
            isAvailable: false,
          },
        ],
      };

      await service.setBulkAvailability(mockUserId, dto);

      expect(insertValues.length).toBe(1);
      // Should have default 9:00-17:00 time window
      expect(insertValues[0]).toMatchObject({
        startMinutes: 9 * 60, // 540
        endMinutes: 17 * 60, // 1020
      });
    });
  });

  describe('getRules', () => {
    it('should return all rules including inactive ones', async () => {
      const mockRules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [1],
          isActive: true,
          ruleType: 'available',
          startMinutes: 540,
          endMinutes: 1020,
        },
        {
          id: '2',
          userId: mockUserId,
          daysOfWeek: [2],
          isActive: false, // Inactive rule
          ruleType: 'unavailable',
          startMinutes: 540,
          endMinutes: 1020,
        },
      ];

      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockRules),
          }),
        }),
      });

      (service as unknown as { db: unknown }).db = {
        select: mockSelect,
      };

      const result = await service.getRules(mockUserId);

      expect(result.length).toBe(2);
      expect(result.find((r) => r.isActive === false)).toBeDefined();
    });
  });
});
