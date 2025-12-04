# WhatsApp Automation CRM - Project Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Key Features](#key-features)
8. [Development Setup](#development-setup)
9. [Deployment](#deployment)

---

## 🎯 Project Overview

**WhatsApp Automation CRM** is a full-stack monorepo application that enables businesses to manage WhatsApp communications, contacts, and customer relationships efficiently. The platform integrates with Twilio's WhatsApp Business API to handle messaging, provide contact management, and support team collaboration.

### Core Purpose

- **Message Management**: Track inbound/outbound WhatsApp messages
- **Contact Management**: Store and organize customer contacts with multiple sender associations
- **Business Phone Management**: Register and manage multiple WhatsApp business numbers (senders)
- **Team Collaboration**: Support multiple team members with role-based access
- **CRM Features**: Notes, kanban board, and contact lifecycle management

### Key Integrations

- **Twilio WhatsApp Business API**: For message sending/receiving and contact management
- **Stripe**: Payment processing and subscription management
- **Auth**: JWT-based authentication with Passport.js

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                      │
│  - Dashboard UI with React components                       │
│  - Real-time data with SWR                                  │
│  - Internationalization (i18n)                              │
│  - Responsive design with Tailwind CSS                      │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼────────────────────────────────────────┐
│                  Backend (NestJS)                           │
│  - RESTful API endpoints                                    │
│  - Service/Controller/Module pattern                        │
│  - JWT authentication middleware                            │
│  - Soft delete architecture                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ SQL Queries
┌────────────────────▼────────────────────────────────────────┐
│              Database (PostgreSQL)                          │
│  - Drizzle ORM for type-safe queries                        │
│  - 7 migrations applied                                     │
│  - Soft delete with conditional indexes                     │
│  - UUID for contact IDs                                     │
└─────────────────────────────────────────────────────────────┘
```

### Design Patterns

#### 1. **Soft Delete Pattern**

- Contacts and senders use soft delete (mark `isActive = false`)
- Allows contact recreation with same phone number
- Conditional unique indexes to allow duplicates when soft-deleted
- Migration 005 implements this pattern

#### 2. **Many-to-Many Relationship**

- Contacts linked to multiple senders via `contact_senders` junction table
- Each contact can communicate through multiple WhatsApp business numbers
- Primary sender concept (first sender has `isPrimary = true`)
- Migration 007 implements the junction table

#### 3. **Service/Controller/Module Pattern (NestJS)**

- **Modules**: Wire dependencies (SendersModule, ContactsModule, etc.)
- **Controllers**: Handle HTTP requests and delegate to services
- **Services**: Business logic and database operations
- **DTOs**: Data validation and type safety

#### 4. **Context-Based Notifications**

- React Context API for global notification state
- Reusable notification hook across all pages
- Success/error messages with configurable TTL

---

## 🛠️ Technology Stack

### Backend

| Category       | Technology        | Version         | Purpose               |
| -------------- | ----------------- | --------------- | --------------------- |
| Framework      | NestJS            | 11.0.1          | REST API framework    |
| Runtime        | Node.js           | 20.11.0         | JavaScript runtime    |
| Language       | TypeScript        | 5.7.3           | Type safety           |
| ORM            | Drizzle ORM       | 0.30.10         | Type-safe SQL queries |
| Database       | PostgreSQL        | Latest          | Primary database      |
| Driver         | pg                | 8.16.3          | PostgreSQL client     |
| Authentication | Passport.js + JWT | 11.0.5 / 11.0.1 | Auth strategy         |
| Validation     | class-validator   | 0.14.1          | DTO validation        |
| External APIs  | Twilio            | 5.10.7          | WhatsApp messaging    |
| Payments       | Stripe            | 14.18.0         | Payment processing    |
| Server         | Express           | 11.0.1          | HTTP server           |

### Frontend

| Category             | Technology               | Version          | Purpose                   |
| -------------------- | ------------------------ | ---------------- | ------------------------- |
| Framework            | Next.js                  | 15.4.0-canary.47 | React meta-framework      |
| Language             | TypeScript               | 5.8.3            | Type safety               |
| UI Library           | React                    | 19.1.0           | UI components             |
| Styling              | Tailwind CSS             | 4.1.7            | Utility-first CSS         |
| Component Library    | chadcn/ui + Radix UI     | -                | Accessible components     |
| Data Fetching        | SWR                      | 2.3.3            | Client-side data fetching |
| Internationalization | next-intl                | 4.5.7            | i18n support              |
| Icons                | Lucide React             | 0.511.0          | Icon library              |
| Form Validation      | Zod                      | 3.24.4           | Schema validation         |
| Authentication       | Jose                     | 6.0.11           | JWT handling              |
| Styling              | class-variance-authority | 0.7.1            | Variant patterns          |

### DevOps & Tools

- **Package Manager**: pnpm (monorepo support)
- **Linting**: ESLint 9.18.0
- **Formatting**: Prettier 3.4.2
- **Build**: Webpack 5.103.0 (backend), Next.js (frontend)
- **Testing**: Jest 30.0.0 (backend)
- **Database Migrations**: Custom Node.js script

---

## 📁 Directory Structure

### Backend Structure

```
backend/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root NestJS module
│   ├── app.controller.ts                # Root controller
│   ├── app.service.ts                   # Root service
│   │
│   ├── config/                          # Configuration files
│   │   ├── database.config.ts           # DB connection config
│   │   ├── env.config.ts                # Environment variables
│   │   ├── openai.config.ts             # OpenAI configuration
│   │   └── twilio.config.ts             # Twilio configuration
│   │
│   ├── database/                        # Database layer
│   │   ├── db.connection.ts             # Drizzle ORM instance
│   │   ├── schema.ts                    # All table definitions
│   │   ├── seed.ts                      # Database seeding
│   │   └── migrations/                  # SQL migration files
│   │       ├── 001_create_messages_and_notes_tables.sql
│   │       ├── 002_add_chats_table.sql
│   │       ├── 003_add_contacts_table.sql
│   │       ├── 004_add_user_phone_relationships.sql
│   │       ├── 005_fix_soft_delete_unique_constraint.sql
│   │       ├── 006_change_contact_id_to_uuid.sql
│   │       ├── 007_add_contact_senders_junction.sql
│   │       └── 008_fix_senders_is_active_type.sql
│   │
│   ├── modules/                         # Feature modules
│   │   ├── auth/                        # Authentication module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.guard.ts
│   │   │   ├── strategies/              # Passport strategies
│   │   │   └── dto/
│   │   │
│   │   ├── contacts/                    # Contacts management
│   │   │   ├── contacts.controller.ts
│   │   │   ├── contacts.service.ts
│   │   │   ├── contacts.module.ts
│   │   │   └── dto/
│   │   │       ├── create-contact.dto.ts (requires senderIds array)
│   │   │       └── update-contact.dto.ts
│   │   │
│   │   ├── senders/                     # WhatsApp business numbers
│   │   │   ├── senders.controller.ts
│   │   │   ├── senders.service.ts
│   │   │   ├── senders.module.ts
│   │   │   └── dto/
│   │   │       ├── create-sender.dto.ts
│   │   │       ├── update-sender.dto.ts
│   │   │       └── link-contact.dto.ts
│   │   │
│   │   ├── messaging/                   # Message handling
│   │   ├── automation/                  # Automation workflows
│   │   ├── billing/                     # Stripe integration
│   │   ├── kanban/                      # Kanban board features
│   │   ├── team/                        # Team management
│   │   ├── user/                        # User management
│   │   └── chats/                       # Chat metadata
│   │
│   ├── shared/                          # Shared utilities
│   │   ├── exceptions/                  # Custom exceptions
│   │   ├── guards/                      # Auth guards
│   │   ├── interceptors/                # HTTP interceptors
│   │   ├── pipes/                       # Validation pipes
│   │   ├── types/                       # TypeScript types
│   │   └── utils/                       # Helper functions
│   │
│   └── test/                            # E2E tests
│
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── webpack-hmr.config.js
├── migrate.js                           # Database migration runner
└── eslint.config.mjs
```

### Frontend Structure

```
frontend/
├── app/
│   └── [locale]/                        # i18n routing
│       ├── globals.css                  # Global styles
│       ├── layout.tsx                   # Root layout
│       ├── not-found.tsx                # 404 page
│       │
│       ├── (dashboard)/                 # Dashboard group
│       │   └── dashboard/
│       │       ├── layout.tsx           # Dashboard layout with sidebar
│       │       │
│       │       ├── page.tsx             # Dashboard home
│       │       │
│       │       ├── chats/               # Chats management
│       │       │   ├── page.tsx
│       │       │   └── [chatId]/
│       │       │
│       │       ├── contacts/            # Contacts management
│       │       │   ├── page.tsx         # Contacts list
│       │       │   ├── new/
│       │       │   │   └── page.tsx     # Create contact (selector for senders)
│       │       │   └── [contactId]/
│       │       │       └── edit/
│       │       │           └── page.tsx # Edit contact
│       │       │
│       │       ├── senders/             # WhatsApp business numbers
│       │       │   ├── page.tsx         # Senders list with CRUD
│       │       │   ├── new/
│       │       │   │   └── page.tsx
│       │       │   └── [id]/
│       │       │       └── edit/
│       │       │           └── page.tsx
│       │       │
│       │       ├── kanban/              # Kanban board
│       │       │   └── page.tsx
│       │       │
│       │       ├── team/                # Team management
│       │       │   └── page.tsx
│       │       │
│       │       ├── settings/            # Settings pages
│       │       │   ├── general/
│       │       │   ├── activity/
│       │       │   └── security/
│       │       │
│       │       └── api/                 # Route handlers
│       │           ├── team/
│       │           └── user/
│       │
│       ├── (login)/                     # Login group
│       │   └── login/
│       │       └── page.tsx
│       │
│       └── pricing/                     # Pricing page
│
├── components/
│   ├── header.tsx                       # Top header
│   ├── language-switcher.tsx            # i18n switcher
│   ├── theme-toggle.tsx                 # Dark mode toggle
│   │
│   └── ui/                              # Reusable UI components
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx                 # NEW: Multi-sender selection
│       ├── country-code-select.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── navigation-menu.tsx
│       ├── radio-group.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sidebar.tsx
│       ├── skeleton.tsx
│       ├── switch.tsx
│       └── tooltip.tsx
│
├── hooks/
│   ├── use-mobile.ts
│   └── use-notification.ts              # Global notification context
│
├── lib/
│   ├── utils.ts
│   ├── api/
│   │   ├── client.ts                    # HTTP client (fetch wrapper)
│   │   └── endpoints.ts                 # Typed API endpoints
│   │
│   ├── auth/
│   │   ├── middleware.ts
│   │   └── session.ts
│   │
│   ├── db/                              # Frontend DB interactions
│   │   ├── drizzle.ts
│   │   ├── queries.ts
│   │   ├── schema.ts
│   │   ├── seed.ts
│   │   ├── setup.ts
│   │   └── migrations/
│   │
│   ├── payments/
│   │   ├── actions.ts
│   │   └── stripe.ts
│   │
│   └── theme/
│       ├── theme-provider.tsx
│       └── theme-script.tsx
│
├── messages/                            # i18n translations
│   ├── en.json
│   └── es.json
│
├── src/
│   ├── middleware.ts
│   └── i18n/
│       ├── navigation.ts
│       ├── request.ts
│       └── routing.ts
│
├── package.json
├── tsconfig.json
├── tsconfig.intl.json
├── next.config.ts
├── middleware.ts                        # Next.js middleware
├── postcss.config.mjs
├── drizzle.config.ts
└── i18n.ts
```

---

## 📊 Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐         ┌─────────────────────┐
│   users (TBD)    │         │     senders         │
├──────────────────┤         ├─────────────────────┤
│ id (PK)          │◀────────│ id (PK)             │
│ email            │ 1  * 1  │ user_id (FK)        │
│ name             │         │ phone_number (U)    │
│ password_hash    │         │ display_name        │
│ created_at       │         │ is_active (BOOL)    │
│ updated_at       │         │ is_verified (BOOL)  │
└──────────────────┘         │ contact_count       │
                             │ last_used_at        │
                             │ twilio_* fields     │
                             │ created_at          │
                             │ updated_at          │
                             └────────────┬────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
        ┌───────────▼──────────────┐      │      ┌──────────────▼──────────┐
        │      chats               │      │      │    contact_senders      │
        ├────────────────────────┤      │      ├─────────────────────────┤
        │ id (PK)                │      │      │ id (PK)                 │
        │ chat_id (U)            │      │      │ contact_id (FK) ───────┐│
        │ user_id (FK) ──┐       │      │      │ sender_id (FK) ────────┤├──→ senders
        │ participant_phone       │      │      │ is_primary (BOOL)       │
        │ business_phone          │      │      │ added_at                │
        │ last_message_time       │      │      │ (U) contact_id+sender_id│
        │ is_active               │      │      └─────────────────────────┘
        │ created_at              │      │
        │ updated_at              │      │
        └────────────────────────┘      │
                    │                    │
                    │                ┌───▼──────────────────┐
                    │                │     contacts        │
                    │                ├─────────────────────┤
                    └───────────────▶│ id (PK)             │
                                    │ contact_id (U,UUID) │
                                    │ phone_number_id     │
                                    │   (FK, nullable)    │
                                    │ first_name          │
                                    │ last_name           │
                                    │ country_code        │
                                    │ phone_number        │
                                    │ twilio_contact_id   │
                                    │ last_message_*      │
                                    │ avatar              │
                                    │ is_active (BOOL)    │
                                    │ created_at          │
                                    │ updated_at          │
                                    └─────────────────────┘
                                            │
                                            │
        ┌───────────────────────────────────┘
        │
        │ (message_id FK)
        │
        ▼
    ┌─────────────────────┐       ┌──────────────────┐
    │     messages        │       │      notes       │
    ├─────────────────────┤       ├──────────────────┤
    │ id (PK)             │◀──────│ id (PK)          │
    │ message_id (U)      │   FK  │ message_id (FK)  │
    │ chat_id (FK)        │       │ user_id (FK)     │
    │ source              │       │ note (TEXT)      │
    │ sender              │       │ created_at       │
    │ type                │       └──────────────────┘
    │ text                │
    │ media_url           │
    │ direction           │
    │ status              │
    │ timestamp           │
    └─────────────────────┘
```

### Key Tables

#### `senders` (WhatsApp Business Numbers)

- **Purpose**: Register multiple WhatsApp business numbers per user
- **Key Fields**:
  - `user_id`: Owner of the sender
  - `phone_number`: The WhatsApp business number (e.g., +14144557966)
  - `display_name`: Human-readable name (e.g., "Support Line")
  - `is_active`: Soft delete flag
  - `is_verified`: Twilio verification status
  - `contact_count`: Denormalized count of linked contacts
  - `twilio_*`: Twilio internal IDs for API integration

#### `contacts` (Customer Contacts)

- **Purpose**: Store customer contact information
- **Key Fields**:
  - `contact_id`: UUID for distributed systems compatibility
  - `phone_number_id`: Primary sender (backward compatibility)
  - `phone_number`: Customer's phone number (6-15 digits)
  - `country_code`: Country calling code (e.g., "+1")
  - `is_active`: Soft delete flag (allows recreation with same phone)
  - `twilio_contact_id`: Synced with Twilio
  - `last_message_*`: Cache for UI performance
- **Relationships**: Linked to multiple senders via `contact_senders` junction table

#### `contact_senders` (Many-to-Many Relationship)

- **Purpose**: Link contacts to multiple senders (business numbers)
- **Design**:
  - Allows one contact to communicate through multiple WhatsApp numbers
  - First record with `is_primary = true` is the default sender
  - Unique constraint on `(contact_id, sender_id)` prevents duplicates
- **Use Case**: Customer can reach your business via support line or sales line

#### `chats` (Conversation Metadata)

- **Purpose**: Track conversation sessions with contacts
- **Fields**:
  - `chat_id`: Unique identifier for conversation
  - `participant_phone`: Customer's phone number
  - `business_phone`: Which business number conversation is through
  - `last_message_*`: Cache for UI list display
  - `is_active`: Soft delete flag

#### `messages` (Message Records)

- **Purpose**: Store WhatsApp message metadata
- **Fields**:
  - `message_id`: Twilio's unique message ID
  - `chat_id`: Link to conversation
  - `source`: Platform (whatsapp, messenger, sms)
  - `direction`: Inbound or outbound
  - `status`: sent, delivered, read, failed
  - `type`: text, image, video, etc.

#### `notes` (User Annotations)

- **Purpose**: Allow team members to add notes to messages
- **Design**: Multiple notes per message, tracked by user

### Migration History

| #   | Name                              | Purpose             | Key Changes                                            |
| --- | --------------------------------- | ------------------- | ------------------------------------------------------ |
| 001 | Create messages and notes         | Initial schema      | Created chats, messages, notes, senders                |
| 002 | Add chats table                   | Chat metadata       | Added chats table with soft delete                     |
| 003 | Add contacts table                | Contact management  | Added contacts with conditional unique                 |
| 004 | Add user phone relationships      | Relationships       | Added user_id to chats, phone_number_id to contacts    |
| 005 | Fix soft delete unique constraint | Data integrity      | Conditional unique index for soft-deleted records      |
| 006 | Change contact_id to UUID         | Distributed systems | Migrated contact IDs from INT to UUID                  |
| 007 | Add contact_senders junction      | Multiple senders    | Created many-to-many relationship for contacts-senders |
| 008 | Fix senders is_active type        | Type correction     | Changed `is_active` from INT to BOOLEAN                |

---

## 🔌 API Endpoints

### Authentication

```
POST   /auth/register              - Register new user
POST   /auth/login                 - Login user
```

### Senders (WhatsApp Business Numbers)

```
POST   /senders                    - Create new sender
GET    /senders                    - List all user senders
GET    /senders/:id                - Get specific sender
PATCH  /senders/:id                - Update sender
DELETE /senders/:id                - Soft delete sender
GET    /senders/:id/contacts       - Get contacts linked to sender
POST   /senders/:senderId/contacts/:contactId        - Link contact
DELETE /senders/:senderId/contacts/:contactId        - Unlink contact
```

### Contacts

```
POST   /contacts                   - Create contact (requires senderIds array)
GET    /contacts                   - List contacts for user's senders
GET    /contacts/:contactId        - Get specific contact
PATCH  /contacts/:contactId        - Update contact
DELETE /contacts/:contactId        - Soft delete contact
```

### Chats

```
GET    /chats                      - List conversations
GET    /chats/:chatId              - Get chat details
```

### Messages

```
GET    /messages                   - List messages
POST   /messages                   - Send message via Twilio
```

### Team

```
GET    /teams                      - List user's teams
POST   /teams                      - Create team
GET    /teams/:teamId/members      - List team members
POST   /teams/:teamId/invite       - Invite member
DELETE /teams/:teamId/members/:memberId - Remove member
```

### User

```
GET    /users/profile              - Get user profile
PATCH  /users/profile              - Update profile
```

### Billing

```
GET    /billing/subscription       - Get subscription status
POST   /billing/checkout           - Create Stripe checkout
```

---

## ✨ Key Features

### 1. Multi-Sender Support ⭐

- **What**: Each user can register multiple WhatsApp business numbers
- **How**: `senders` table with `user_id` foreign key
- **Benefit**: Support different departments (sales, support, billing) via different numbers

### 2. Contact-to-Sender Linking ⭐

- **What**: Contacts can be linked to multiple senders
- **How**: `contact_senders` junction table with many-to-many relationship
- **Benefit**: Contacts communicate through multiple business numbers; first sender is primary
- **API**: `POST /senders/:senderId/contacts/:contactId` and `DELETE` endpoint

### 3. Soft Delete Architecture ⭐

- **What**: Records are marked inactive rather than deleted
- **How**: `is_active` boolean flag; conditional unique indexes
- **Benefit**: Data recovery, audit trails, allow re-creation with same identifier

### 4. Notification System ⭐

- **What**: Context-based global notifications
- **How**: React Context API + Toast UI component
- **Benefit**: Consistent UX across all pages

### 5. Internationalization (i18n)

- **What**: Multi-language support (English, Spanish, more)
- **How**: next-intl + JSON translation files
- **Where**: `/messages/*.json`

### 6. Twilio Integration

- **Capabilities**:
  - Send/receive WhatsApp messages
  - Store Twilio contact IDs for sync
  - Receive webhooks for message status
  - Query Twilio for conversation context
- **Config**: `backend/src/config/twilio.config.ts`

### 7. Team Collaboration

- **Teams**: Group users into teams
- **Roles**: Role-based access control (in progress)
- **Audit**: Track who modified what via `user_id` in notes

### 8. Payment Integration (Stripe)

- **Subscriptions**: Different tiers of service
- **Checkout**: Create payment sessions
- **Webhooks**: Handle payment events

### 9. Kanban Board

- **CRM Features**: Visual workflow management
- **Drag & Drop**: Organize contacts/deals

### 10. Chat & Message History

- **Conversations**: Organized by participant phone + business phone
- **Message Metadata**: Type (text/image/video), direction (in/out), status
- **Notes**: Team annotations on messages

---

## 🚀 Development Setup

### Prerequisites

- Node.js 20.11.0+
- pnpm 10.24.0+
- PostgreSQL 12+
- Twilio Account with WhatsApp Business API enabled
- Stripe Account (for payments)

### Local Development

#### 1. Clone and Install

```bash
git clone <repo>
cd whatsapp-automation
pnpm install
```

#### 2. Environment Variables

**Backend** (`backend/.env`)

```
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_crm
JWT_SECRET=your-secret-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+14144557966
STRIPE_SECRET_KEY=your-stripe-key
```

**Frontend** (`frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### 3. Database Setup

**Backend**:

```bash
cd backend
pnpm run db:migrate:init    # Initialize migrations table
pnpm run db:migrate         # Run all pending migrations
```

#### 4. Start Services

**Terminal 1 - Backend**:

```bash
cd backend
pnpm start:dev              # Runs on http://localhost:3001
```

**Terminal 2 - Frontend**:

```bash
cd frontend
pnpm dev                    # Runs on http://localhost:3000
```

### Database Migrations

**View Status**:

```bash
cd backend
pnpm run db:migrate:status
```

**Create New Migration**:

```bash
# 1. Edit backend/src/database/schema.ts
# 2. Create new SQL file: backend/src/database/migrations/00X_description.sql
# 3. Run: pnpm run db:migrate
```

### Testing

**Backend Tests**:

```bash
cd backend
pnpm test                   # Run all tests
pnpm test:watch            # Watch mode
pnpm test:cov              # Coverage report
```

### Code Quality

**Linting**:

```bash
# Backend
cd backend && pnpm lint

# Frontend
cd frontend && npm run lint (not configured yet)
```

**Formatting**:

```bash
# Backend
cd backend && pnpm format

# Frontend
cd frontend && npm run format (not configured yet)
```

---

## 📦 Deployment

### Build

**Backend**:

```bash
cd backend
pnpm build              # Outputs to dist/
npm start               # Runs production build
```

**Frontend**:

```bash
cd frontend
pnpm build              # Outputs to .next/
pnpm start              # Runs production build
```

### Docker (Optional)

Create `Dockerfile` in each package for containerization.

### Environment Configuration

Production environment variables should be set via:

- Environment variables
- Secret management service (AWS Secrets Manager, etc.)
- `.env` file (NOT recommended for secrets)

### Database Migrations

Always run migrations before deploying new code:

```bash
pnpm run db:migrate
```

---

## 📝 Coding Standards

### NestJS (Backend)

- **Modules**: Feature-based module organization
- **Services**: Business logic, no HTTP concerns
- **Controllers**: HTTP handlers, delegate to services
- **DTOs**: All inputs validated with class-validator
- **Error Handling**: Custom exception classes
- **Logging**: Use Logger service

### React/Next.js (Frontend)

- **Client Components**: Mark with `"use client"`
- **Server Components**: Default; handle sensitive operations
- **Hooks**: Custom hooks in `hooks/` directory
- **Components**: Reusable UI in `components/ui/`
- **API**: Use `backendApi` object in `lib/api/endpoints.ts`
- **Styling**: Tailwind CSS with CV for variants

---

## 🔒 Security Considerations

1. **Authentication**: JWT tokens in HTTP-only cookies
2. **Authorization**: User IDs hardcoded as 1 (TODO: extract from token)
3. **Input Validation**: All DTOs validated with class-validator
4. **Database**: Parameterized queries via Drizzle ORM
5. **CORS**: Configure allowed origins in production
6. **Rate Limiting**: Not yet implemented (TODO)
7. **API Rate Limiting**: TODO for Twilio API calls

---

## 🐛 Known Issues & TODOs

### Auth (Priority: HIGH)

- [ ] Extract `userId` from JWT token (currently hardcoded as 1)
- [ ] Implement role-based access control (RBAC)
- [ ] Add API key authentication for webhooks

### Features (Priority: MEDIUM)

- [ ] Rate limiting on API endpoints
- [ ] Contact deduplication logic
- [ ] Twilio webhook signature verification
- [ ] Contact verification status from Twilio
- [ ] Message search/filter
- [ ] Contact bulk operations

### Frontend (Priority: LOW)

- [ ] ESLint/Prettier configuration
- [ ] Error boundary components
- [ ] Loading skeletons optimization
- [ ] Dark mode theme refinement

### Testing (Priority: LOW)

- [ ] E2E tests with Cypress/Playwright
- [ ] Frontend unit tests with Vitest
- [ ] API integration tests

---

## 📞 Integration Points

### Twilio Webhooks (Inbound Messages)

```
POST /webhooks/twilio/messages

Expected payload:
{
  "From": "+customer-phone",
  "To": "+business-phone",
  "MessageSid": "unique-twilio-id",
  "Body": "message text",
  "MediaUrl": "optional-media-url"
}

Actions:
1. Find/create chat from participant_phone + business_phone
2. Create message record
3. Update contact last_message_*
4. Update chat last_message_*
```

### Stripe Webhooks (Payments)

```
POST /webhooks/stripe

Handled Events:
- checkout.session.completed
- payment_intent.succeeded
- invoice.payment_succeeded
- customer.subscription.updated
```

---

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM](https://orm.drizzle.team)
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

## 📄 License

UNLICENSED - Private project

---

**Last Updated**: December 4, 2025  
**Project Status**: Active Development  
**Version**: 0.0.1
