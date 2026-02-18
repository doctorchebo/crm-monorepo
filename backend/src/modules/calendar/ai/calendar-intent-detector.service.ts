/**
 * Calendar Intent Detector Service
 *
 * Analyzes incoming messages to detect calendar-related intents.
 * Uses pattern matching and NLP to understand scheduling requests.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface CalendarIntent {
  /** Primary intent type */
  type: CalendarIntentType;
  /** Confidence score 0-1 */
  confidence: number;
  /** Extracted entities from the message */
  entities: CalendarIntentEntities;
  /** Original message text */
  originalMessage: string;
  /** Suggested action based on intent */
  suggestedAction?: string;
}

export type CalendarIntentType =
  | 'schedule_meeting'
  | 'check_availability'
  | 'reschedule'
  | 'cancel'
  | 'get_schedule'
  | 'suggest_times'
  | 'confirm_booking'
  | 'share_booking_link'
  | 'none';

export interface CalendarIntentEntities {
  /** Detected date/time references */
  dateTime?: {
    raw: string;
    parsed?: Date;
    isRange?: boolean;
    endDate?: Date;
  };
  /** Duration mentioned */
  duration?: {
    raw: string;
    minutes?: number;
  };
  /** Event title/topic */
  title?: string;
  /** People mentioned */
  people?: string[];
  /** Location mentioned */
  location?: string;
  /** Type of meeting/event */
  eventType?: string;
}

// Patterns for detecting calendar intents
const INTENT_PATTERNS: Record<CalendarIntentType, RegExp[]> = {
  schedule_meeting: [
    /\b(schedule|book|set up|arrange|plan|create)\b.*\b(meeting|call|appointment|event|session|chat)\b/i,
    /\blet'?s?\s+(meet|schedule|book|talk)\b/i,
    /\bcan\s+(we|you)\s+(meet|schedule|book|have a call)\b/i,
    /\bi('d| would)\s+like\s+to\s+(schedule|book|set up)\b/i,
    /\bfind\s+a?\s*time\s+(to|for)\s+(meet|talk|discuss|call)\b/i,
    /\bput\s+(something|it|this)\s+(on|in)\s+(my|the|your)\s+calendar\b/i,
    /\badd\s+(to|on)\s+(my|the)\s+calendar\b/i,
  ],
  check_availability: [
    /\b(are\s+you|am\s+i|is\s+.+)\s+(available|free)\b/i,
    /\bcheck\s+(my|your|the)?\s*availability\b/i,
    /\bwhat('s|\s+is)\s+(your|my)\s+schedule\b/i,
    /\bdo\s+(you|i)\s+have\s+(any\s+)?time\b/i,
    /\bwhen\s+(are|is)\s+.+\s+(free|available)\b/i,
    /\bfree\s+(time|slot|period)\b/i,
    /\bany\s+openings?\b/i,
  ],
  reschedule: [
    /\b(reschedule|move|postpone|push\s+back|change\s+the\s+time)\b/i,
    /\bcan\s+(we|you)\s+(move|reschedule|change)\b/i,
    /\bneed\s+to\s+(reschedule|move|change)\b/i,
    /\bchange\s+(the|my|our)\s+(meeting|appointment|call|event)\b/i,
    /\b(different|another|new)\s+(time|date|day)\b/i,
  ],
  cancel: [
    /\b(cancel|delete|remove)\s+(the|my|our)?\s*(meeting|appointment|call|event)?\b/i,
    /\bcan'?t?\s+make\s+it\b/i,
    /\bneed\s+to\s+cancel\b/i,
    /\b(won'?t|can'?t)\s+(be\s+able\s+to\s+)?(attend|make\s+it|join)\b/i,
    /\bsomething\s+(came|has\s+come)\s+up\b/i,
  ],
  get_schedule: [
    /\bwhat('s|\s+is)\s+(on\s+)?(my|your|the)\s+(calendar|schedule|agenda)\b/i,
    /\bshow\s+(me\s+)?(my|your|the)\s+(calendar|schedule|events)\b/i,
    /\bwhat\s+(do\s+)?(i|you|we)\s+have\s+(scheduled|planned|coming\s+up)\b/i,
    /\b(my|your|the)\s+(upcoming|next)\s+(meetings?|events?|appointments?)\b/i,
    /\bwhat'?s?\s+(happening|going\s+on)\s+(today|tomorrow|this\s+week)\b/i,
  ],
  suggest_times: [
    /\bsuggest\s+(some\s+)?(times?|slots?)\b/i,
    /\bwhat\s+times?\s+(work|are\s+good|are\s+available)\b/i,
    /\bgive\s+me\s+(some\s+)?(options|times|slots)\b/i,
    /\bfind\s+(me\s+)?available\s+(times?|slots?)\b/i,
    /\bwhen\s+(can|could)\s+(we|you|i)\s+(meet|talk|schedule)\b/i,
  ],
  confirm_booking: [
    /\b(confirm|yes|sounds\s+good|that\s+works|perfect|great|let'?s?\s+do\s+it)\b/i,
    /\bi'?ll?\s+(take|book|confirm)\s+(that|it|the)\b/i,
    /\b(book|schedule)\s+(it|that|this)\b/i,
    /\b(see\s+you|talk\s+to\s+you)\s+(then|at)\b/i,
  ],
  share_booking_link: [
    /\b(share|send|give)\s+(me\s+)?(your|a|the)\s+booking\s+(link|page|url)\b/i,
    /\bhow\s+(can|do)\s+i\s+book\s+(with|time\s+with)\s+(you|them)\b/i,
    /\b(calendly|booking\s+link|scheduling\s+link)\b/i,
  ],
  none: [],
};

// Time-related patterns for entity extraction
const TIME_PATTERNS = [
  // Specific times
  /\b(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?\b/,
  // Relative days
  /\b(today|tomorrow|yesterday|next\s+\w+|this\s+\w+)\b/i,
  // Day names
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  // Date formats
  /\b(\d{1,2})[\/\-](\d{1,2})([\/\-](\d{2,4}))?\b/,
  // Natural language dates
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{0,4}\b/i,
  // Time ranges
  /\bfrom\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*(to|until|-)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/i,
  // Duration
  /\b\d+\s*(hour|hr|minute|min)s?\b/i,
  // Time of day
  /\b(morning|afternoon|evening|night)\b/i,
];

// Duration patterns
const DURATION_PATTERNS = [
  { pattern: /(\d+)\s*hours?\b/i, multiplier: 60 },
  { pattern: /(\d+)\s*hrs?\b/i, multiplier: 60 },
  { pattern: /(\d+)\s*minutes?\b/i, multiplier: 1 },
  { pattern: /(\d+)\s*mins?\b/i, multiplier: 1 },
  { pattern: /half\s*(an\s*)?hour\b/i, value: 30 },
  { pattern: /quarter\s*(of\s*an\s*)?hour\b/i, value: 15 },
];

@Injectable()
export class CalendarIntentDetectorService {
  private readonly logger = new Logger(CalendarIntentDetectorService.name);

  /**
   * Detect calendar intent from a message
   */
  detectIntent(message: string): CalendarIntent {
    const normalizedMessage = message.toLowerCase().trim();

    // Check each intent type
    const intentScores: Array<{ type: CalendarIntentType; score: number }> = [];

    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (intentType === 'none') continue;

      let matchCount = 0;
      let totalPatterns = patterns.length;

      for (const pattern of patterns) {
        if (pattern.test(normalizedMessage)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Score based on match ratio and boost for multiple matches
        const score = Math.min(
          1,
          (matchCount / Math.max(totalPatterns, 3)) * 1.5,
        );
        intentScores.push({
          type: intentType as CalendarIntentType,
          score,
        });
      }
    }

    // Sort by score descending
    intentScores.sort((a, b) => b.score - a.score);

    // Get the best match
    const bestMatch = intentScores[0];
    const intentType: CalendarIntentType = bestMatch?.type || 'none';
    const confidence = bestMatch?.score || 0;

    // Extract entities
    const entities = this.extractEntities(message);

    // Generate suggested action
    const suggestedAction = this.generateSuggestedAction(intentType, entities);

    return {
      type: intentType,
      confidence,
      entities,
      originalMessage: message,
      suggestedAction,
    };
  }

  /**
   * Check if a message has calendar-related content
   */
  hasCalendarIntent(message: string, minConfidence = 0.3): boolean {
    const intent = this.detectIntent(message);
    return intent.type !== 'none' && intent.confidence >= minConfidence;
  }

  /**
   * Extract calendar-related entities from a message
   */
  extractEntities(message: string): CalendarIntentEntities {
    const entities: CalendarIntentEntities = {};

    // Extract date/time
    for (const pattern of TIME_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        entities.dateTime = {
          raw: match[0],
          parsed: this.parseDateTime(match[0]),
        };
        break;
      }
    }

    // Extract duration
    for (const { pattern, multiplier, value } of DURATION_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        const minutes = value ?? parseInt(match[1]) * multiplier!;
        entities.duration = {
          raw: match[0],
          minutes,
        };
        break;
      }
    }

    // Extract potential event title (text after "for" or "about" or "to discuss")
    const titleMatch = message.match(
      /\b(for|about|to\s+discuss|regarding)\s+([a-z\s]+)(?:\b(?:at|on|tomorrow|today|\d))/i,
    );
    if (titleMatch) {
      entities.title = titleMatch[2].trim();
    }

    // Extract location (text after "at" when it's a place, not time)
    const locationMatch = message.match(
      /\bat\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)(?:\s+(?:on|at\s+\d|tomorrow|next)|\s*$)/,
    );
    if (locationMatch && !locationMatch[1].match(/\d/)) {
      entities.location = locationMatch[1].trim();
    }

    // Extract people (names after "with")
    const peopleMatch = message.match(
      /\bwith\s+((?:[A-Z][a-z]+(?:\s+(?:and|&)\s+)?)+)/,
    );
    if (peopleMatch) {
      entities.people = peopleMatch[1]
        .split(/\s+(?:and|&)\s+/)
        .map((n) => n.trim());
    }

    // Detect event type
    const eventTypePatterns: Array<{ pattern: RegExp; type: string }> = [
      { pattern: /\b(call|phone\s+call)\b/i, type: 'call' },
      { pattern: /\b(meeting)\b/i, type: 'meeting' },
      { pattern: /\b(appointment)\b/i, type: 'appointment' },
      { pattern: /\b(demo|demonstration)\b/i, type: 'demo' },
      { pattern: /\b(interview)\b/i, type: 'interview' },
      { pattern: /\b(consultation|consult)\b/i, type: 'consultation' },
      { pattern: /\b(follow[- ]?up)\b/i, type: 'follow-up' },
    ];

    for (const { pattern, type } of eventTypePatterns) {
      if (pattern.test(message)) {
        entities.eventType = type;
        break;
      }
    }

    return entities;
  }

  /**
   * Parse a date/time string into a Date object
   */
  private parseDateTime(dateTimeStr: string): Date | undefined {
    const now = new Date();
    const lowerStr = dateTimeStr.toLowerCase();

    // Handle relative dates
    if (lowerStr === 'today') {
      return now;
    }
    if (lowerStr === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (lowerStr === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // Handle "next [day]"
    const nextDayMatch = lowerStr.match(
      /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    );
    if (nextDayMatch) {
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const targetDay = dayNames.indexOf(nextDayMatch[1].toLowerCase());
      const result = new Date(now);
      result.setDate(
        result.getDate() + ((7 + targetDay - result.getDay()) % 7 || 7),
      );
      return result;
    }

    // Handle "this [day]"
    const thisDayMatch = lowerStr.match(
      /this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    );
    if (thisDayMatch) {
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const targetDay = dayNames.indexOf(thisDayMatch[1].toLowerCase());
      const result = new Date(now);
      const daysUntil = (targetDay - result.getDay() + 7) % 7;
      result.setDate(result.getDate() + daysUntil);
      return result;
    }

    // Handle day name alone
    const dayMatch = lowerStr.match(
      /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
    );
    if (dayMatch) {
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase());
      const result = new Date(now);
      const daysUntil = (targetDay - result.getDay() + 7) % 7;
      if (daysUntil === 0) {
        result.setDate(result.getDate() + 7); // Next week if today
      } else {
        result.setDate(result.getDate() + daysUntil);
      }
      return result;
    }

    // Try parsing as regular date
    try {
      const parsed = new Date(dateTimeStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Ignore parsing errors
    }

    return undefined;
  }

  /**
   * Generate a suggested action message based on intent
   */
  private generateSuggestedAction(
    intentType: CalendarIntentType,
    entities: CalendarIntentEntities,
  ): string | undefined {
    switch (intentType) {
      case 'schedule_meeting':
        if (entities.dateTime?.raw) {
          return `Schedule a ${entities.eventType || 'meeting'} for ${entities.dateTime.raw}`;
        }
        return `Schedule a ${entities.eventType || 'meeting'}`;

      case 'check_availability':
        if (entities.dateTime?.raw) {
          return `Check availability for ${entities.dateTime.raw}`;
        }
        return 'Check availability';

      case 'reschedule':
        return entities.dateTime?.raw
          ? `Reschedule to ${entities.dateTime.raw}`
          : 'Reschedule event';

      case 'cancel':
        return 'Cancel the event';

      case 'get_schedule':
        return entities.dateTime?.raw
          ? `Show schedule for ${entities.dateTime.raw}`
          : 'Show upcoming events';

      case 'suggest_times':
        return entities.duration?.raw
          ? `Suggest available ${entities.duration.raw} slots`
          : 'Suggest available times';

      case 'share_booking_link':
        return 'Share booking link';

      default:
        return undefined;
    }
  }
}
