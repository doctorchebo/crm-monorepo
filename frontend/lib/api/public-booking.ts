/**
 * Public Booking API Client
 *
 * API client for public (unauthenticated) booking pages.
 * These endpoints allow external users to book appointments
 * through shared booking links.
 */

// ==================== Types ====================

export interface PublicBookingLink {
  bookingLinkId: string;
  teamId: number;
  name: string;
  description: string | null;
  duration: number;
  bufferBefore: number | null;
  bufferAfter: number | null;
  maxAdvanceDays: number | null;
  minNoticeMintues: number | null;
  requiresConfirmation: boolean;
  collectPhone: boolean;
  collectNotes: boolean;
  customQuestions: CustomQuestion[] | null;
  hostName: string | null;
  color: string | null;
}

export interface CustomQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  required: boolean;
  options?: string[];
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AvailableSlotsResponse {
  date: string;
  slots: TimeSlot[];
  timezone: string;
}

export interface AvailableDatesResponse {
  month: string;
  availableDates: string[];
}

export interface PublicBookingRequest {
  startTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  notes?: string;
  timezone?: string;
  customAnswers?: Record<string, string>;
}

export interface BookingConfirmation {
  success: boolean;
  bookingId: string;
  status: "pending" | "confirmed";
  requiresConfirmation: boolean;
  message: string;
  details: {
    startTime: string;
    endTime: string;
    duration: number;
    hostName: string | null;
  };
}

export interface BookingStatus {
  confirmationCode: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  startTime: string;
  endTime: string;
  guestName: string;
  guestEmail: string;
  meetingLink: string | null;
}

export interface ApiError {
  error: string;
  message: string;
}

type ApiResponse<T> = T | ApiError;

function isError(response: ApiResponse<unknown>): response is ApiError {
  return (response as ApiError).error !== undefined;
}

// ==================== API Client ====================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function publicFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  return res.json();
}

// ==================== Public Booking Functions ====================

/**
 * Get booking link details by slug
 */
export async function getPublicBookingLink(
  teamId: string | number,
  slug: string,
): Promise<ApiResponse<PublicBookingLink>> {
  return publicFetch<PublicBookingLink>(
    `/api/public/booking/${teamId}/${slug}`,
  );
}

/**
 * Get available time slots for a specific date
 */
export async function getAvailableSlots(
  teamId: string | number,
  slug: string,
  date: string,
): Promise<ApiResponse<AvailableSlotsResponse>> {
  return publicFetch<AvailableSlotsResponse>(
    `/api/public/booking/${teamId}/${slug}/slots?date=${date}`,
  );
}

/**
 * Get dates with availability for a given month
 */
export async function getAvailableDates(
  teamId: string | number,
  slug: string,
  month: string,
): Promise<ApiResponse<AvailableDatesResponse>> {
  return publicFetch<AvailableDatesResponse>(
    `/api/public/booking/${teamId}/${slug}/dates?month=${month}`,
  );
}

/**
 * Create a public booking
 */
export async function createPublicBooking(
  teamId: string | number,
  slug: string,
  data: PublicBookingRequest,
): Promise<ApiResponse<BookingConfirmation>> {
  return publicFetch<BookingConfirmation>(
    `/api/public/booking/${teamId}/${slug}`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Get booking status by confirmation code
 */
export async function getBookingStatus(
  confirmationCode: string,
): Promise<ApiResponse<BookingStatus>> {
  return publicFetch<BookingStatus>(
    `/api/public/booking/status/${confirmationCode}`,
  );
}

/**
 * Cancel booking by confirmation code
 */
export async function cancelPublicBooking(
  confirmationCode: string,
  reason?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return publicFetch<{ success: boolean; message: string }>(
    `/api/public/booking/cancel/${confirmationCode}`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

// ==================== React Hooks for Public Booking ====================

export { isError };
