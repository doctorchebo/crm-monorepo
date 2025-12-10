/**
 * API Endpoints for backend communication
 */
import { apiClient } from "./client";

// DTOs
export interface CreateContactDto {
  firstName: string;
  lastName?: string;
  countryCode: string;
  phoneNumber: string;
  senderIds: number[];
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

export interface UserProfileDto {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const backendApi = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",

  // Auth endpoints
  auth: {
    register: (data: { email: string; name: string; password: string }) =>
      apiClient.post("/auth/register", data),
    login: (data: { email: string; password: string }) =>
      apiClient.post("/auth/login", data),
  },

  // User endpoints
  user: {
    getProfile: (): Promise<UserProfileDto> => apiClient.get("/users/profile"),
    updateProfile: (data: any) => apiClient.patch("/users/profile", data),
  },

  // Team endpoints
  team: {
    get: () => apiClient.get("/teams"),
    create: (data: { name: string; description?: string }) =>
      apiClient.post("/teams", data),
    inviteMember: (teamId: string, data: { email: string; role: string }) =>
      apiClient.post(`/teams/${teamId}/invite`, data),
    removeMember: (teamId: string, memberId: string) =>
      apiClient.delete(`/teams/${teamId}/members/${memberId}`),
    getMembers: (teamId: string) => apiClient.get(`/teams/${teamId}/members`),
  },

  // Billing endpoints
  billing: {
    getSubscription: () => apiClient.get("/billing/subscription"),
    createCheckout: (priceId: string) =>
      apiClient.post("/billing/checkout", { priceId }),
    createPortalSession: (returnUrl: string) =>
      apiClient.post("/billing/portal", { returnUrl }),
    getInvoices: () => apiClient.get("/billing/invoices"),
    getCheckoutSession: (sessionId: string) =>
      apiClient.get(`/billing/checkout/${sessionId}`),
  },

  // Chats endpoints
  chats: {
    list: (skip?: number, take?: number) =>
      apiClient.get(`/chats?skip=${skip || 0}&take=${take || 20}`),
    get: (id: string) => apiClient.get(`/chats/${id}`),
    create: (data: any) => apiClient.post("/chats", data),
    update: (id: string, data: any) => apiClient.patch(`/chats/${id}`, data),
    close: (id: string) => apiClient.post(`/chats/${id}/close`, {}),
    getMessages: (id: string, skip?: number, take?: number) =>
      apiClient.get(
        `/chats/${id}/messages?skip=${skip || 0}&take=${take || 50}`
      ),
    startWithContact: (data: {
      businessPhone: string;
      participantPhone: string;
      participantName?: string;
      senderId?: number;
    }) => apiClient.post("/chats/contact/start", data),
  },

  // Kanban endpoints
  kanban: {
    getStages: () => apiClient.get("/kanban/stages"),
    createStage: (data: any) => apiClient.post("/kanban/stages", data),
    updateStage: (id: string, data: any) =>
      apiClient.patch(`/kanban/stages/${id}`, data),
    deleteStage: (id: string) => apiClient.delete(`/kanban/stages/${id}`),
    moveCard: (data: any) => apiClient.post("/kanban/cards/move", data),
    getCards: (stageId: string) =>
      apiClient.get(`/kanban/stages/${stageId}/cards`),
  },

  // Automation endpoints
  automation: {
    list: () => apiClient.get("/automation/rules"),
    get: (id: string) => apiClient.get(`/automation/rules/${id}`),
    create: (data: any) => apiClient.post("/automation/rules", data),
    update: (id: string, data: any) =>
      apiClient.patch(`/automation/rules/${id}`, data),
    delete: (id: string) => apiClient.delete(`/automation/rules/${id}`),
    evaluateTriggers: (data: any) =>
      apiClient.post("/automation/evaluate", data),
  },

  // Settings endpoints
  settings: {
    getTeam: () => apiClient.get("/settings/team"),
    updateTeam: (data: any) => apiClient.patch("/settings/team", data),
    getWhatsApp: () => apiClient.get("/settings/whatsapp"),
    updateWhatsApp: (data: any) => apiClient.patch("/settings/whatsapp", data),
    getAutomation: () => apiClient.get("/settings/automation"),
    updateAutomation: (data: any) =>
      apiClient.patch("/settings/automation", data),
  },

  // WhatsApp endpoints
  whatsapp: {
    sendMessage: (data: { to: string; body: string; senderId?: number }) =>
      apiClient.post("/whatsapp/send", data),
    sendMedia: (data: {
      to: string;
      mediaType: "image" | "video" | "audio" | "document";
      mediaUrl: string;
      caption?: string;
    }) => apiClient.post("/whatsapp/send-media", data),
    getStatus: (messageId: string) =>
      apiClient.get(`/whatsapp/status/${messageId}`),
    getMessages: () => apiClient.get("/whatsapp/messages"),
    getChats: (skip?: number, take?: number) =>
      apiClient.get(`/whatsapp/chats?skip=${skip || 0}&take=${take || 20}`),
    getChatMessages: (chatId: string, skip?: number, take?: number) =>
      apiClient.get(
        `/whatsapp/chats/${chatId}/messages?skip=${skip || 0}&take=${
          take || 50
        }`
      ),
    saveNote: (data: { messageId: string; note: string }) =>
      apiClient.post("/whatsapp/notes", data),
    getMessageNotes: (messageId: string) =>
      apiClient.get(`/whatsapp/notes/${messageId}`),
  },

  // Contacts endpoints
  contacts: {
    list: (skip?: number, take?: number, phoneNumberId?: number) =>
      apiClient.get(
        `/contacts?skip=${skip || 0}&take=${take || 50}${
          phoneNumberId ? `&phoneNumberId=${phoneNumberId}` : ""
        }`
      ),
    get: (contactId: string) => apiClient.get(`/contacts/${contactId}`),
    create: (data: any) => apiClient.post("/contacts", data),
    update: (contactId: string, data: any) =>
      apiClient.patch(`/contacts/${contactId}`, data),
    delete: (contactId: string) => apiClient.delete(`/contacts/${contactId}`),
    getByPhone: (phoneNumber: string) =>
      apiClient.get(`/contacts/phone/${phoneNumber}`),
  },

  // Senders endpoints
  senders: {
    list: () => apiClient.get("/senders"),
    get: (senderId: number) => apiClient.get(`/senders/${senderId}`),
    create: (data: any) => apiClient.post("/senders", data),
    update: (senderId: number, data: any) =>
      apiClient.patch(`/senders/${senderId}`, data),
    delete: (senderId: number) => apiClient.delete(`/senders/${senderId}`),
    verify: (senderId: number) =>
      apiClient.patch(`/senders/${senderId}/verify`, {}),
    getContacts: (senderId: number) =>
      apiClient.get(`/senders/${senderId}/contacts`),
    linkContact: (senderId: number, contactId: string, data?: any) =>
      apiClient.post(`/senders/${senderId}/contacts/${contactId}`, data || {}),
    unlinkContact: (senderId: number, contactId: string) =>
      apiClient.delete(`/senders/${senderId}/contacts/${contactId}`),
  },

  // Templates endpoints
  templates: {
    list: (visible?: boolean) =>
      apiClient.get(`/templates${visible ? "?visible=true" : ""}`),
    get: (templateId: string) => apiClient.get(`/templates/${templateId}`),
    create: (data: any) => apiClient.post("/templates", data),
    update: (templateId: string, data: any) =>
      apiClient.patch(`/templates/${templateId}`, data),
    delete: (templateId: string) =>
      apiClient.delete(`/templates/${templateId}`),
    addLocale: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/locales`, data),
    preview: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/preview`, data),
    validate: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/validate`, data),
    submit: (templateId: string, data: any, provider?: string) =>
      apiClient.post(
        `/templates/${templateId}/submit${
          provider ? `?provider=${provider}` : ""
        }`,
        data
      ),
    test: (templateId: string, data: any) =>
      apiClient.post(`/templates/${templateId}/test`, data),
    getVersions: (templateId: string) =>
      apiClient.get(`/templates/${templateId}/versions`),
  },

  // Notes endpoints
  notes: {
    create: (data: { messageId?: string; chatId?: string; note: string }) =>
      apiClient.post("/notes", data),
    getChatNotes: (chatId: string) => apiClient.get(`/notes/chat/${chatId}`),
    getMessageNotes: (messageId: string) =>
      apiClient.get(`/notes/message/${messageId}`),
    delete: (noteId: number) => apiClient.delete(`/notes/${noteId}`),
  },
};
