-- ============================================================================
-- Seed Workflow Template Categories and Templates
-- 
-- This migration creates pre-built workflow templates that users can use
-- as starting points for their automation workflows.
--
-- IMPORTANT: Icons use Lucide icon names (e.g., 'target', 'message-square')
-- instead of emojis to avoid database encoding issues.
-- ============================================================================

-- ============================================================================
-- TEMPLATE CATEGORIES
-- ============================================================================

-- Insert template categories (use ON CONFLICT to make it idempotent)
-- Icons use Lucide icon names: target, message-square, shopping-cart, calendar, bell, user-plus
INSERT INTO workflow_template_categories (id, name, description, icon, sort_order, created_at)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'Lead Management', 'Templates for capturing, qualifying, and nurturing leads', 'target', 1, NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'Customer Support', 'Templates for handling customer inquiries and support tickets', 'message-square', 2, NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'Sales & E-commerce', 'Templates for product inquiries, orders, and sales follow-ups', 'shopping-cart', 3, NOW()),
  ('550e8400-e29b-41d4-a716-446655440004', 'Appointments & Bookings', 'Templates for scheduling and managing appointments', 'calendar', 4, NOW()),
  ('550e8400-e29b-41d4-a716-446655440005', 'Notifications & Reminders', 'Templates for automated notifications and follow-ups', 'bell', 5, NOW()),
  ('550e8400-e29b-41d4-a716-446655440006', 'Onboarding', 'Templates for welcoming and onboarding new customers', 'user-plus', 6, NOW())
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- WORKFLOW TEMPLATES
-- ============================================================================

-- Template 1: Lead Qualification Bot
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440001',
  'Lead Qualification Bot',
  'Automatically qualify leads by asking key questions and scoring responses. Routes qualified leads to sales and nurtures others with follow-up content.',
  'target',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "New Message Received",
        "description": "Triggers when a new message arrives",
        "config": {
          "triggerType": "message"
        },
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-1",
        "nodeType": "condition_ai_classification",
        "label": "Classify Intent",
        "description": "AI determines if the lead is interested in products/services",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Analyze the customer message and classify their intent",
            "categories": [
              {"name": "interested", "description": "Customer is interested in products or services"},
              {"name": "support", "description": "Customer needs support or has questions"},
              {"name": "other", "description": "Other inquiries"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ask-budget",
        "nodeType": "action_send_message",
        "label": "Ask Budget",
        "description": "Ask about their budget range",
        "config": {
          "messageType": "text",
          "message": "Thank you for your interest! To better assist you, could you share your approximate budget range?"
        },
        "positionX": 100,
        "positionY": 320
      },
      {
        "id": "action-support",
        "nodeType": "action_send_message",
        "label": "Route to Support",
        "description": "Acknowledge support request",
        "config": {
          "messageType": "text",
          "message": "I understand you need assistance. Let me connect you with our support team who can help resolve your issue."
        },
        "positionX": 400,
        "positionY": 320
      },
      {
        "id": "action-handoff",
        "nodeType": "action_request_handoff",
        "label": "Request Human Agent",
        "description": "Transfer to human support agent",
        "config": {
          "reason": "Customer needs support assistance"
        },
        "positionX": 400,
        "positionY": 450
      },
      {
        "id": "condition-budget",
        "nodeType": "condition_ai_classification",
        "label": "Evaluate Budget",
        "description": "AI evaluates if budget is qualified",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Evaluate if the customer budget indicates a qualified lead",
            "categories": [
              {"name": "qualified", "description": "Budget is sufficient for our products"},
              {"name": "nurture", "description": "Budget is lower, needs nurturing"}
            ]
          }
        },
        "positionX": 100,
        "positionY": 450
      },
      {
        "id": "action-qualified",
        "nodeType": "action_add_tag",
        "label": "Tag as Qualified",
        "description": "Add qualified lead tag",
        "config": {
          "tagName": "qualified-lead"
        },
        "positionX": 0,
        "positionY": 580
      },
      {
        "id": "action-nurture",
        "nodeType": "action_send_message",
        "label": "Send Nurture Content",
        "description": "Send educational content to nurture the lead",
        "config": {
          "messageType": "text",
          "message": "Thank you for sharing! While you explore options, here are some resources that might help you make an informed decision..."
        },
        "positionX": 200,
        "positionY": 580
      },
      {
        "id": "end-qualified",
        "nodeType": "end",
        "label": "End - Qualified",
        "description": "Workflow ends - lead is qualified",
        "config": {},
        "positionX": 0,
        "positionY": 700
      },
      {
        "id": "end-nurture",
        "nodeType": "end",
        "label": "End - Nurturing",
        "description": "Workflow ends - lead in nurture sequence",
        "config": {},
        "positionX": 200,
        "positionY": 700
      },
      {
        "id": "end-support",
        "nodeType": "end",
        "label": "End - Support",
        "description": "Workflow ends - handed to support",
        "config": {},
        "positionX": 400,
        "positionY": 580
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-1", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-1", "toNodeId": "action-ask-budget", "branch": "true", "label": "Interested"},
      {"id": "conn-3", "fromNodeId": "condition-1", "toNodeId": "action-support", "branch": "false", "label": "Support"},
      {"id": "conn-4", "fromNodeId": "action-support", "toNodeId": "action-handoff", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-handoff", "toNodeId": "end-support", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-ask-budget", "toNodeId": "condition-budget", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "condition-budget", "toNodeId": "action-qualified", "branch": "true", "label": "Qualified"},
      {"id": "conn-8", "fromNodeId": "condition-budget", "toNodeId": "action-nurture", "branch": "false", "label": "Nurture"},
      {"id": "conn-9", "fromNodeId": "action-qualified", "toNodeId": "end-qualified", "branch": "default"},
      {"id": "conn-10", "fromNodeId": "action-nurture", "toNodeId": "end-nurture", "branch": "default"}
    ],
    "variables": []
  }',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 2: Customer Support Triage
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440002',
  'Customer Support Triage',
  'Automatically categorize and route customer support requests to the right team. Handles common questions with AI and escalates complex issues.',
  'ðŸ’¬',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Support Request",
        "description": "New support message received",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-urgency",
        "nodeType": "condition_ai_classification",
        "label": "Check Urgency",
        "description": "Determine if this is an urgent issue",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Analyze the urgency level of this support request",
            "categories": [
              {"name": "urgent", "description": "System down, can'target't access account, payment issues"},
              {"name": "normal", "description": "General questions, feature requests, non-critical issues"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-urgent-ack",
        "nodeType": "action_send_message",
        "label": "Urgent Acknowledgment",
        "description": "Acknowledge urgent request immediately",
        "config": {
          "messageType": "text",
          "message": "ðŸš¨ I understand this is urgent. I'target'm escalating your request immediately and a support specialist will assist you within the next few minutes."
        },
        "positionX": 50,
        "positionY": 320
      },
      {
        "id": "action-urgent-tag",
        "nodeType": "action_add_tag",
        "label": "Tag as Urgent",
        "config": {"tagName": "urgent-support"},
        "positionX": 50,
        "positionY": 450
      },
      {
        "id": "action-urgent-handoff",
        "nodeType": "action_request_handoff",
        "label": "Escalate to Agent",
        "config": {"reason": "Urgent support request requires immediate attention", "priority": "high"},
        "positionX": 50,
        "positionY": 580
      },
      {
        "id": "condition-category",
        "nodeType": "condition_ai_classification",
        "label": "Categorize Issue",
        "description": "Classify the type of support issue",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Categorize this support request",
            "categories": [
              {"name": "billing", "description": "Payment, invoice, subscription issues"},
              {"name": "technical", "description": "Bugs, errors, how-to questions"},
              {"name": "general", "description": "General inquiries, feedback"}
            ]
          }
        },
        "positionX": 450,
        "positionY": 320
      },
      {
        "id": "action-billing",
        "nodeType": "action_send_message",
        "label": "Billing Response",
        "config": {
          "messageType": "text",
          "message": "I can help with billing questions. Could you please provide your account email or invoice number so I can look up your account?"
        },
        "positionX": 300,
        "positionY": 480
      },
      {
        "id": "action-technical",
        "nodeType": "action_send_message",
        "label": "Technical Response",
        "config": {
          "messageType": "text",
          "message": "I'target'll help troubleshoot this technical issue. Could you describe what you were trying to do and any error messages you'target're seeing?"
        },
        "positionX": 500,
        "positionY": 480
      },
      {
        "id": "action-general",
        "nodeType": "action_send_message",
        "label": "General Response",
        "config": {
          "messageType": "text",
          "message": "Thank you for reaching out! I'target'm here to help. Could you tell me more about what you need assistance with?"
        },
        "positionX": 700,
        "positionY": 480
      },
      {
        "id": "end-urgent",
        "nodeType": "end",
        "label": "End - Escalated",
        "config": {},
        "positionX": 50,
        "positionY": 700
      },
      {
        "id": "end-normal",
        "nodeType": "end",
        "label": "End - Triaged",
        "config": {},
        "positionX": 500,
        "positionY": 620
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-urgency", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-urgency", "toNodeId": "action-urgent-ack", "branch": "true", "label": "Urgent"},
      {"id": "conn-3", "fromNodeId": "condition-urgency", "toNodeId": "condition-category", "branch": "false", "label": "Normal"},
      {"id": "conn-4", "fromNodeId": "action-urgent-ack", "toNodeId": "action-urgent-tag", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-urgent-tag", "toNodeId": "action-urgent-handoff", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-urgent-handoff", "toNodeId": "end-urgent", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "condition-category", "toNodeId": "action-billing", "branch": "true", "label": "Billing"},
      {"id": "conn-8", "fromNodeId": "condition-category", "toNodeId": "action-technical", "branch": "false", "label": "Technical"},
      {"id": "conn-9", "fromNodeId": "action-billing", "toNodeId": "end-normal", "branch": "default"},
      {"id": "conn-10", "fromNodeId": "action-technical", "toNodeId": "end-normal", "branch": "default"},
      {"id": "conn-11", "fromNodeId": "action-general", "toNodeId": "end-normal", "branch": "default"}
    ],
    "variables": []
  }',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 3: Product Inquiry Handler
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440003',
  'Product Inquiry Handler',
  'Handle product questions, provide pricing info, and guide customers through the purchase process. Includes upsell and cross-sell opportunities.',
  'ðŸ›’',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Product Inquiry",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-intent",
        "nodeType": "condition_ai_classification",
        "label": "Identify Need",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "What is the customer looking for?",
            "categories": [
              {"name": "pricing", "description": "Asking about prices, costs, plans"},
              {"name": "features", "description": "Asking about product features or capabilities"},
              {"name": "availability", "description": "Asking about stock or availability"},
              {"name": "comparison", "description": "Comparing products or asking for recommendations"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-pricing",
        "nodeType": "action_send_message",
        "label": "Share Pricing",
        "config": {
          "messageType": "text",
          "message": "Here'target's our pricing information! We offer flexible plans to fit your needs. Would you like me to recommend the best option based on your requirements?"
        },
        "positionX": 50,
        "positionY": 350
      },
      {
        "id": "action-features",
        "nodeType": "action_send_message",
        "label": "Explain Features",
        "config": {
          "messageType": "text",
          "message": "Great question about our features! Let me share the key capabilities that our customers love. Which specific feature would you like to know more about?"
        },
        "positionX": 200,
        "positionY": 350
      },
      {
        "id": "action-availability",
        "nodeType": "action_send_message",
        "label": "Check Availability",
        "config": {
          "messageType": "text",
          "message": "Let me check that for you! Which specific product or variant are you interested in? I'target'll confirm availability right away."
        },
        "positionX": 350,
        "positionY": 350
      },
      {
        "id": "action-recommend",
        "nodeType": "action_send_message",
        "label": "Make Recommendation",
        "config": {
          "messageType": "text",
          "message": "Based on what you'target've shared, I'target'd recommend exploring these options. Would you like me to explain the differences to help you decide?"
        },
        "positionX": 500,
        "positionY": 350
      },
      {
        "id": "action-followup",
        "nodeType": "action_send_message",
        "label": "Offer Assistance",
        "config": {
          "messageType": "text",
          "message": "Is there anything else you'target'd like to know? I'target'm here to help you find exactly what you need!"
        },
        "positionX": 250,
        "positionY": 500
      },
      {
        "id": "end-1",
        "nodeType": "end",
        "label": "End",
        "config": {},
        "positionX": 250,
        "positionY": 650
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-intent", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-intent", "toNodeId": "action-pricing", "branch": "true", "label": "Pricing"},
      {"id": "conn-3", "fromNodeId": "condition-intent", "toNodeId": "action-features", "branch": "false", "label": "Features"},
      {"id": "conn-4", "fromNodeId": "action-pricing", "toNodeId": "action-followup", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-features", "toNodeId": "action-followup", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-availability", "toNodeId": "action-followup", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-recommend", "toNodeId": "action-followup", "branch": "default"},
      {"id": "conn-8", "fromNodeId": "action-followup", "toNodeId": "end-1", "branch": "default"}
    ],
    "variables": []
  }',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 4: Appointment Booking Flow
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440004',
  'Appointment Booking Flow',
  'Guide customers through booking an appointment. Collects necessary information, confirms availability, and sends confirmation.',
  'ðŸ“…',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Booking Request",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "action-welcome",
        "nodeType": "action_send_message",
        "label": "Welcome & Ask Service",
        "config": {
          "messageType": "text",
          "message": "Hi! I'target'd be happy to help you book an appointment. What service would you like to schedule?"
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ask-date",
        "nodeType": "action_send_message",
        "label": "Ask Preferred Date",
        "config": {
          "messageType": "text",
          "message": "What date works best for you? Please share your preferred date and I'target'll check availability."
        },
        "positionX": 250,
        "positionY": 310
      },
      {
        "id": "action-ask-time",
        "nodeType": "action_send_message",
        "label": "Offer Time Slots",
        "config": {
          "messageType": "text",
          "message": "For that date, we have the following time slots available:\nâ€¢ 9:00 AM\nâ€¢ 11:00 AM\nâ€¢ 2:00 PM\nâ€¢ 4:00 PM\n\nWhich time works best for you?"
        },
        "positionX": 250,
        "positionY": 440
      },
      {
        "id": "action-confirm-details",
        "nodeType": "action_send_message",
        "label": "Confirm Details",
        "config": {
          "messageType": "text",
          "message": "To confirm your booking, could you please share your full name and contact number?"
        },
        "positionX": 250,
        "positionY": 570
      },
      {
        "id": "action-booking-confirmed",
        "nodeType": "action_send_message",
        "label": "Send Confirmation",
        "config": {
          "messageType": "text",
          "message": "âœ… Your appointment has been confirmed!\n\nYou'target'll receive a reminder 24 hours before your appointment. If you need to reschedule or cancel, just let me know!"
        },
        "positionX": 250,
        "positionY": 700
      },
      {
        "id": "action-add-tag",
        "nodeType": "action_add_tag",
        "label": "Tag as Booked",
        "config": {"tagName": "appointment-booked"},
        "positionX": 250,
        "positionY": 830
      },
      {
        "id": "end-1",
        "nodeType": "end",
        "label": "End - Booked",
        "config": {},
        "positionX": 250,
        "positionY": 960
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "action-welcome", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "action-welcome", "toNodeId": "action-ask-date", "branch": "default"},
      {"id": "conn-3", "fromNodeId": "action-ask-date", "toNodeId": "action-ask-time", "branch": "default"},
      {"id": "conn-4", "fromNodeId": "action-ask-time", "toNodeId": "action-confirm-details", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-confirm-details", "toNodeId": "action-booking-confirmed", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-booking-confirmed", "toNodeId": "action-add-tag", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-add-tag", "toNodeId": "end-1", "branch": "default"}
    ],
    "variables": []
  }',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 5: Order Status Checker
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440003',
  'Order Status Checker',
  'Help customers check their order status. Identifies order inquiries and provides tracking information or escalates to support.',
  'ðŸ“¦',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Order Inquiry",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-type",
        "nodeType": "condition_ai_classification",
        "label": "Identify Request Type",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "What type of order-related request is this?",
            "categories": [
              {"name": "tracking", "description": "Wants to track order status or delivery"},
              {"name": "issue", "description": "Has a problem with their order"},
              {"name": "change", "description": "Wants to modify or cancel order"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ask-order",
        "nodeType": "action_send_message",
        "label": "Ask Order Number",
        "config": {
          "messageType": "text",
          "message": "I'target'd be happy to help you track your order! Could you please share your order number? You can find it in your confirmation email."
        },
        "positionX": 100,
        "positionY": 350
      },
      {
        "id": "action-issue-ack",
        "nodeType": "action_send_message",
        "label": "Acknowledge Issue",
        "config": {
          "messageType": "text",
          "message": "I'target'm sorry to hear you'target're having an issue with your order. Could you please describe what happened and share your order number so I can look into this?"
        },
        "positionX": 300,
        "positionY": 350
      },
      {
        "id": "action-change-info",
        "nodeType": "action_send_message",
        "label": "Change Request Info",
        "config": {
          "messageType": "text",
          "message": "I understand you want to make changes to your order. Please share your order number and what changes you'target'd like to make. Note that some changes may not be possible if the order has already shipped."
        },
        "positionX": 500,
        "positionY": 350
      },
      {
        "id": "action-provide-status",
        "nodeType": "action_send_message",
        "label": "Provide Status Update",
        "config": {
          "messageType": "text",
          "message": "Let me check that for you... Based on your order details, I can see the current status. Is there anything else you'target'd like to know about your order?"
        },
        "positionX": 100,
        "positionY": 500
      },
      {
        "id": "action-escalate",
        "nodeType": "action_request_handoff",
        "label": "Escalate to Support",
        "config": {"reason": "Order issue requires human attention"},
        "positionX": 300,
        "positionY": 500
      },
      {
        "id": "end-tracking",
        "nodeType": "end",
        "label": "End - Status Provided",
        "config": {},
        "positionX": 100,
        "positionY": 650
      },
      {
        "id": "end-escalated",
        "nodeType": "end",
        "label": "End - Escalated",
        "config": {},
        "positionX": 400,
        "positionY": 650
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-type", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-type", "toNodeId": "action-ask-order", "branch": "true", "label": "Tracking"},
      {"id": "conn-3", "fromNodeId": "condition-type", "toNodeId": "action-issue-ack", "branch": "false", "label": "Issue"},
      {"id": "conn-4", "fromNodeId": "action-ask-order", "toNodeId": "action-provide-status", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-issue-ack", "toNodeId": "action-escalate", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-change-info", "toNodeId": "action-escalate", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-provide-status", "toNodeId": "end-tracking", "branch": "default"},
      {"id": "conn-8", "fromNodeId": "action-escalate", "toNodeId": "end-escalated", "branch": "default"}
    ],
    "variables": []
  }',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 6: Welcome & Onboarding
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440006',
  'Welcome & Onboarding',
  'Welcome new customers and guide them through your product or service. Collect preferences and set expectations for future communications.',
  'ðŸ‘‹',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "First Contact",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "action-welcome",
        "nodeType": "action_send_message",
        "label": "Welcome Message",
        "config": {
          "messageType": "text",
          "message": "ðŸ‘‹ Welcome! We'target're so excited to have you here!\n\nI'target'm your personal assistant and I'target'm here to help you get started. Let me show you around!"
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "delay-1",
        "nodeType": "delay",
        "label": "Brief Pause",
        "config": {"delaySeconds": 3},
        "positionX": 250,
        "positionY": 310
      },
      {
        "id": "action-intro",
        "nodeType": "action_send_message",
        "label": "Introduce Features",
        "config": {
          "messageType": "text",
          "message": "Here'target's what you can do with our service:\n\nâœ¨ Feature 1 - Brief description\nðŸ“Š Feature 2 - Brief description\nðŸŽ¯ Feature 3 - Brief description\n\nWhich of these would you like to explore first?"
        },
        "positionX": 250,
        "positionY": 440
      },
      {
        "id": "action-preferences",
        "nodeType": "action_send_message",
        "label": "Ask Preferences",
        "config": {
          "messageType": "text",
          "message": "To personalize your experience, how would you prefer to receive updates?\n\n1ï¸âƒ£ Only when I message you\n2ï¸âƒ£ Weekly digest\n3ï¸âƒ£ Important updates only"
        },
        "positionX": 250,
        "positionY": 570
      },
      {
        "id": "action-tag-new",
        "nodeType": "action_add_tag",
        "label": "Tag as New Customer",
        "config": {"tagName": "new-customer"},
        "positionX": 250,
        "positionY": 700
      },
      {
        "id": "action-complete",
        "nodeType": "action_send_message",
        "label": "Complete Onboarding",
        "config": {
          "messageType": "text",
          "message": "You'target're all set! ðŸŽ‰\n\nFeel free to ask me anything anytime. I'target'm here to help!\n\nIs there something specific you'target'd like to do right now?"
        },
        "positionX": 250,
        "positionY": 830
      },
      {
        "id": "end-1",
        "nodeType": "end",
        "label": "End - Onboarded",
        "config": {},
        "positionX": 250,
        "positionY": 960
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "action-welcome", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "action-welcome", "toNodeId": "delay-1", "branch": "default"},
      {"id": "conn-3", "fromNodeId": "delay-1", "toNodeId": "action-intro", "branch": "default"},
      {"id": "conn-4", "fromNodeId": "action-intro", "toNodeId": "action-preferences", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-preferences", "toNodeId": "action-tag-new", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-tag-new", "toNodeId": "action-complete", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-complete", "toNodeId": "end-1", "branch": "default"}
    ],
    "variables": []
  }',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 7: Feedback Collection
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440005',
  'Feedback Collection',
  'Collect customer feedback after a purchase or interaction. Routes satisfied customers to leave reviews and addresses concerns from unhappy customers.',
  'â­',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_tag",
        "label": "After Purchase Tag",
        "config": {"tagName": "purchase-complete"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "delay-1",
        "nodeType": "delay",
        "label": "Wait 24 Hours",
        "config": {"delaySeconds": 86400},
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ask-feedback",
        "nodeType": "action_send_message",
        "label": "Ask for Feedback",
        "config": {
          "messageType": "text",
          "message": "Hi! We hope you'target're enjoying your recent purchase. ðŸ™\n\nWe'target'd love to hear about your experience! On a scale of 1-5, how would you rate your experience with us?\n\nâ­ 1 - Poor\nâ­â­ 2 - Fair\nâ­â­â­ 3 - Good\nâ­â­â­â­ 4 - Very Good\nâ­â­â­â­â­ 5 - Excellent"
        },
        "positionX": 250,
        "positionY": 310
      },
      {
        "id": "condition-rating",
        "nodeType": "condition_ai_classification",
        "label": "Evaluate Response",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Based on the customer'target's response, is their feedback positive (4-5 stars) or needs attention (1-3 stars)?",
            "categories": [
              {"name": "positive", "description": "Customer gave positive feedback (4-5 stars, happy expressions)"},
              {"name": "negative", "description": "Customer gave negative feedback (1-3 stars, complaints)"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 440
      },
      {
        "id": "action-thank-positive",
        "nodeType": "action_send_message",
        "label": "Thank for Positive",
        "config": {
          "messageType": "text",
          "message": "Thank you so much for the wonderful feedback! ðŸŽ‰\n\nWe'target'd be incredibly grateful if you could share your experience with others. Would you like me to send you a link to leave a review?"
        },
        "positionX": 100,
        "positionY": 600
      },
      {
        "id": "action-address-negative",
        "nodeType": "action_send_message",
        "label": "Address Concerns",
        "config": {
          "messageType": "text",
          "message": "We'target're sorry to hear your experience wasn'target't perfect. ðŸ˜”\n\nYour feedback is really valuable to us. Could you tell us more about what went wrong? We'target'd like to make it right."
        },
        "positionX": 400,
        "positionY": 600
      },
      {
        "id": "action-tag-happy",
        "nodeType": "action_add_tag",
        "label": "Tag as Satisfied",
        "config": {"tagName": "satisfied-customer"},
        "positionX": 100,
        "positionY": 750
      },
      {
        "id": "action-escalate",
        "nodeType": "action_request_handoff",
        "label": "Escalate for Recovery",
        "config": {"reason": "Customer recovery needed - negative feedback received"},
        "positionX": 400,
        "positionY": 750
      },
      {
        "id": "end-positive",
        "nodeType": "end",
        "label": "End - Happy",
        "config": {},
        "positionX": 100,
        "positionY": 900
      },
      {
        "id": "end-escalated",
        "nodeType": "end",
        "label": "End - Escalated",
        "config": {},
        "positionX": 400,
        "positionY": 900
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "delay-1", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "delay-1", "toNodeId": "action-ask-feedback", "branch": "default"},
      {"id": "conn-3", "fromNodeId": "action-ask-feedback", "toNodeId": "condition-rating", "branch": "default"},
      {"id": "conn-4", "fromNodeId": "condition-rating", "toNodeId": "action-thank-positive", "branch": "true", "label": "Positive"},
      {"id": "conn-5", "fromNodeId": "condition-rating", "toNodeId": "action-address-negative", "branch": "false", "label": "Negative"},
      {"id": "conn-6", "fromNodeId": "action-thank-positive", "toNodeId": "action-tag-happy", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-address-negative", "toNodeId": "action-escalate", "branch": "default"},
      {"id": "conn-8", "fromNodeId": "action-tag-happy", "toNodeId": "end-positive", "branch": "default"},
      {"id": "conn-9", "fromNodeId": "action-escalate", "toNodeId": "end-escalated", "branch": "default"}
    ],
    "variables": []
  }',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 8: Out of Office Auto-Reply
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440008',
  '550e8400-e29b-41d4-a716-446655440005',
  'Out of Office Auto-Reply',
  'Automatically respond to messages received outside business hours. Acknowledges the message and sets expectations for response time.',
  'ðŸŒ™',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Message Received",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-hours",
        "nodeType": "condition_time",
        "label": "Check Business Hours",
        "config": {
          "conditionType": "time_based",
          "timeBased": {
            "businessHoursStart": "09:00",
            "businessHoursEnd": "18:00",
            "businessDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "timezone": "America/New_York"
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ooo-reply",
        "nodeType": "action_send_message",
        "label": "Out of Office Reply",
        "config": {
          "messageType": "text",
          "message": "Thank you for your message! ðŸ™\n\nOur team is currently away. Our business hours are Monday-Friday, 9 AM - 6 PM EST.\n\nWe'target'll get back to you as soon as we'target're back in the office. For urgent matters, please email urgent@company.com."
        },
        "positionX": 400,
        "positionY": 350
      },
      {
        "id": "action-tag-ooo",
        "nodeType": "action_add_tag",
        "label": "Tag for Follow-up",
        "config": {"tagName": "needs-response"},
        "positionX": 400,
        "positionY": 480
      },
      {
        "id": "end-ooo",
        "nodeType": "end",
        "label": "End - OOO",
        "config": {},
        "positionX": 400,
        "positionY": 610
      },
      {
        "id": "end-business",
        "nodeType": "end",
        "label": "End - Business Hours",
        "config": {},
        "positionX": 100,
        "positionY": 350
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-hours", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-hours", "toNodeId": "end-business", "branch": "true", "label": "Business Hours"},
      {"id": "conn-3", "fromNodeId": "condition-hours", "toNodeId": "action-ooo-reply", "branch": "false", "label": "After Hours"},
      {"id": "conn-4", "fromNodeId": "action-ooo-reply", "toNodeId": "action-tag-ooo", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-tag-ooo", "toNodeId": "end-ooo", "branch": "default"}
    ],
    "variables": []
  }',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 9: FAQ Bot
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440009',
  '550e8400-e29b-41d4-a716-446655440002',
  'FAQ Bot',
  'Answer common questions automatically using AI. Handles frequently asked questions and escalates complex queries to human agents.',
  'â“',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_message",
        "label": "Question Received",
        "config": {"triggerType": "message"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "condition-faq",
        "nodeType": "condition_ai_classification",
        "label": "Match FAQ",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Can this question be answered from common FAQs, or does it require human assistance?",
            "categories": [
              {"name": "faq", "description": "Common question that can be answered automatically"},
              {"name": "complex", "description": "Complex question requiring human assistance"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "action-ai-answer",
        "nodeType": "action_send_message",
        "label": "AI Answer",
        "config": {
          "messageType": "ai",
          "aiInstructions": "Answer the customer'target's question helpfully and concisely. If unsure, offer to connect them with a human agent."
        },
        "positionX": 100,
        "positionY": 350
      },
      {
        "id": "action-followup",
        "nodeType": "action_send_message",
        "label": "Check Satisfaction",
        "config": {
          "messageType": "text",
          "message": "Did that answer your question? Let me know if you need any clarification or have other questions!"
        },
        "positionX": 100,
        "positionY": 480
      },
      {
        "id": "action-handoff-msg",
        "nodeType": "action_send_message",
        "label": "Handoff Message",
        "config": {
          "messageType": "text",
          "message": "That'target's a great question! Let me connect you with someone from our team who can help you better. One moment please..."
        },
        "positionX": 400,
        "positionY": 350
      },
      {
        "id": "action-handoff",
        "nodeType": "action_request_handoff",
        "label": "Request Agent",
        "config": {"reason": "Complex question requiring human expertise"},
        "positionX": 400,
        "positionY": 480
      },
      {
        "id": "end-answered",
        "nodeType": "end",
        "label": "End - Answered",
        "config": {},
        "positionX": 100,
        "positionY": 620
      },
      {
        "id": "end-handoff",
        "nodeType": "end",
        "label": "End - Handed Off",
        "config": {},
        "positionX": 400,
        "positionY": 620
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "condition-faq", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "condition-faq", "toNodeId": "action-ai-answer", "branch": "true", "label": "FAQ"},
      {"id": "conn-3", "fromNodeId": "condition-faq", "toNodeId": "action-handoff-msg", "branch": "false", "label": "Complex"},
      {"id": "conn-4", "fromNodeId": "action-ai-answer", "toNodeId": "action-followup", "branch": "default"},
      {"id": "conn-5", "fromNodeId": "action-followup", "toNodeId": "end-answered", "branch": "default"},
      {"id": "conn-6", "fromNodeId": "action-handoff-msg", "toNodeId": "action-handoff", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-handoff", "toNodeId": "end-handoff", "branch": "default"}
    ],
    "variables": []
  }',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 10: Re-engagement Campaign
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440010',
  '550e8400-e29b-41d4-a716-446655440001',
  'Re-engagement Campaign',
  'Reach out to inactive customers with personalized messages. Offers incentives and collects feedback on why they became inactive.',
  'ðŸ”„',
  '{
    "nodes": [
      {
        "id": "trigger-1",
        "nodeType": "trigger_tag",
        "label": "Inactive Customer Tag",
        "config": {"tagName": "inactive-30-days"},
        "positionX": 250,
        "positionY": 50
      },
      {
        "id": "action-reengagement",
        "nodeType": "action_send_template",
        "label": "Send Re-engagement",
        "config": {
          "messageType": "text",
          "message": "Hi! ðŸ‘‹ We'target've missed you!\n\nIt'target's been a while since we last connected. We'target've been working on some exciting updates and would love to show you what'target's new.\n\nAs a valued customer, here'target's a special 15% discount just for you! Reply 'target'YES'target' to claim it, or let us know if there'target's anything we can help with."
        },
        "positionX": 250,
        "positionY": 180
      },
      {
        "id": "delay-response",
        "nodeType": "delay",
        "label": "Wait for Response",
        "config": {"delaySeconds": 172800},
        "positionX": 250,
        "positionY": 310
      },
      {
        "id": "condition-response",
        "nodeType": "condition_ai_classification",
        "label": "Check Response",
        "config": {
          "conditionType": "ai_classification",
          "aiClassification": {
            "prompt": "Did the customer respond positively to the re-engagement offer?",
            "categories": [
              {"name": "interested", "description": "Customer responded positively or claimed offer"},
              {"name": "not_interested", "description": "No response or negative response"}
            ]
          }
        },
        "positionX": 250,
        "positionY": 440
      },
      {
        "id": "action-welcome-back",
        "nodeType": "action_send_message",
        "label": "Welcome Back",
        "config": {
          "messageType": "text",
          "message": "Welcome back! ðŸŽ‰ Your 15% discount code is: WELCOME15\n\nUse it on your next purchase. Is there anything specific you'target're looking for?"
        },
        "positionX": 100,
        "positionY": 600
      },
      {
        "id": "action-remove-inactive",
        "nodeType": "action_remove_tag",
        "label": "Remove Inactive Tag",
        "config": {"tagName": "inactive-30-days"},
        "positionX": 100,
        "positionY": 730
      },
      {
        "id": "action-feedback-request",
        "nodeType": "action_send_message",
        "label": "Request Feedback",
        "config": {
          "messageType": "text",
          "message": "We noticed you haven'target't been active lately. We'target'd love to understand how we can serve you better. Is there anything we could improve?"
        },
        "positionX": 400,
        "positionY": 600
      },
      {
        "id": "end-reengaged",
        "nodeType": "end",
        "label": "End - Re-engaged",
        "config": {},
        "positionX": 100,
        "positionY": 870
      },
      {
        "id": "end-feedback",
        "nodeType": "end",
        "label": "End - Feedback",
        "config": {},
        "positionX": 400,
        "positionY": 730
      }
    ],
    "connections": [
      {"id": "conn-1", "fromNodeId": "trigger-1", "toNodeId": "action-reengagement", "branch": "default"},
      {"id": "conn-2", "fromNodeId": "action-reengagement", "toNodeId": "delay-response", "branch": "default"},
      {"id": "conn-3", "fromNodeId": "delay-response", "toNodeId": "condition-response", "branch": "default"},
      {"id": "conn-4", "fromNodeId": "condition-response", "toNodeId": "action-welcome-back", "branch": "true", "label": "Interested"},
      {"id": "conn-5", "fromNodeId": "condition-response", "toNodeId": "action-feedback-request", "branch": "false", "label": "No Response"},
      {"id": "conn-6", "fromNodeId": "action-welcome-back", "toNodeId": "action-remove-inactive", "branch": "default"},
      {"id": "conn-7", "fromNodeId": "action-remove-inactive", "toNodeId": "end-reengaged", "branch": "default"},
      {"id": "conn-8", "fromNodeId": "action-feedback-request", "toNodeId": "end-feedback", "branch": "default"}
    ],
    "variables": []
  }',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Add comments for documentation
COMMENT ON TABLE workflow_template_categories IS 'Categories for organizing workflow templates - seeded with default categories';
COMMENT ON TABLE workflow_templates IS 'Pre-built workflow templates for quick start - seeded with common automation patterns';
