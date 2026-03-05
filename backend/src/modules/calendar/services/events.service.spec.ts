import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CalendarShareService } from './calendar-share.service';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
  };
  let mockCalendarShareService: {
    canEditEvents: jest.Mock;
  };

  const mockUserId = 1;
  const mockCalendarId = 'calendar-123';

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
    };

    mockCalendarShareService = {
      canEditEvents: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
        {
          provide: CalendarShareService,
          useValue: mockCalendarShareService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create with availability check', () => {
    const setupMocks = (
      availabilityRules: unknown[],
      overrides: unknown[] = [],
    ) => {
      // Create proper chainable mock that tracks call order
      let selectCallCount = 0;

      mockDb.select = jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            selectCallCount++;
            // First call is for overrides, second is for rules
            if (selectCallCount === 1) {
              return Promise.resolve(overrides);
            }
            return Promise.resolve(availabilityRules);
          }),
        })),
      }));

      // Mock for inserting event
      mockDb.insert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'event-1',
              calendarId: mockCalendarId,
              title: 'Test Event',
              startTime: new Date(),
              endTime: new Date(),
            },
          ]),
        }),
      });
    };

    it('should allow event creation when no availability rules exist', async () => {
      setupMocks([]);

      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-15T10:00:00.000Z', // Saturday
        endTime: '2025-03-15T11:00:00.000Z',
      };

      const result = await service.create(mockCalendarId, mockUserId, dto);
      expect(result).toBeDefined();
    });

    it('should reject event when day is marked as unavailable', async () => {
      // Saturday (day 6) is marked as unavailable
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [6], // Saturday
          isActive: false, // Unavailable
          ruleType: 'unavailable',
          startMinutes: 540,
          endMinutes: 1020,
        },
      ];
      setupMocks(rules);

      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-15T10:00:00.000Z', // Saturday
        endTime: '2025-03-15T11:00:00.000Z',
      };

      await expect(
        service.create(mockCalendarId, mockUserId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow event creation within available hours', async () => {
      // Use a specific date/time that we know the day of week for
      // March 17, 2025 is a Monday (day 1) in UTC
      const mondayDate = new Date('2025-03-17T10:00:00.000Z');
      const dayOfWeek = mondayDate.getUTCDay(); // Should be 1 (Monday)

      // Set up rules for the actual day of week
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [dayOfWeek], // Match the actual day
          isActive: true,
          ruleType: 'available',
          startMinutes: 0, // Available all day for simplicity
          endMinutes: 1440,
        },
      ];
      setupMocks(rules);

      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-17T10:00:00.000Z',
        endTime: '2025-03-17T11:00:00.000Z',
      };

      const result = await service.create(mockCalendarId, mockUserId, dto);
      expect(result).toBeDefined();
    });

    it('should reject event outside available hours', async () => {
      // March 17, 2025 is a Monday (day 1) in UTC
      const mondayDate = new Date('2025-03-17T20:00:00.000Z');
      const dayOfWeek = mondayDate.getUTCDay();

      // Monday is available only 9:00-17:00 UTC (540-1020 minutes)
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [dayOfWeek],
          isActive: true,
          ruleType: 'available',
          startMinutes: 540, // 9:00
          endMinutes: 1020, // 17:00
        },
      ];
      setupMocks(rules);

      // Create event at 20:00-21:00 UTC (outside 9:00-17:00)
      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-17T20:00:00.000Z', // 20:00 UTC
        endTime: '2025-03-17T21:00:00.000Z',
      };

      await expect(
        service.create(mockCalendarId, mockUserId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip availability check when skipAvailabilityCheck is true', async () => {
      // Monday (day 1) is available 9:00-17:00
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [1],
          isActive: true,
          ruleType: 'available',
          startMinutes: 540,
          endMinutes: 1020,
        },
      ];
      setupMocks(rules);

      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-17T18:00:00.000Z', // Outside hours
        endTime: '2025-03-17T19:00:00.000Z',
        skipAvailabilityCheck: true,
      };

      const result = await service.create(mockCalendarId, mockUserId, dto);
      expect(result).toBeDefined();
    });

    it('should skip availability check for all-day events', async () => {
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [1],
          isActive: false, // Day is unavailable
          ruleType: 'unavailable',
          startMinutes: 540,
          endMinutes: 1020,
        },
      ];
      setupMocks(rules);

      const dto = {
        calendarId: mockCalendarId,
        title: 'All Day Event',
        startTime: '2025-03-17T00:00:00.000Z',
        endTime: '2025-03-18T00:00:00.000Z',
        isAllDay: true,
      };

      const result = await service.create(mockCalendarId, mockUserId, dto);
      expect(result).toBeDefined();
    });

    it('should reject event when date has an unavailable override', async () => {
      const rules = [
        {
          id: '1',
          userId: mockUserId,
          daysOfWeek: [1],
          isActive: true,
          ruleType: 'available',
          startMinutes: 540,
          endMinutes: 1020,
        },
      ];
      const overrides = [
        {
          id: '1',
          userId: mockUserId,
          overrideType: 'unavailable',
          reason: 'Public holiday',
        },
      ];
      setupMocks(rules, overrides);

      const dto = {
        calendarId: mockCalendarId,
        title: 'Test Event',
        startTime: '2025-03-17T10:00:00.000Z',
        endTime: '2025-03-17T11:00:00.000Z',
      };

      await expect(
        service.create(mockCalendarId, mockUserId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
