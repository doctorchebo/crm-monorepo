-- ============================================================================
-- Seed Workflow Template Categories and Templates
-- 
-- This migration creates pre-built workflow templates that users can use
-- as starting points for their automation workflows.
--
-- IMPORTANT: Icons use Lucide icon names (e.g., 'target', 'message-square')
-- instead of emojis to avoid database encoding issues.
--
-- CONNECTION BRANCH VALUES: For AI classification conditions, the branch
-- values MUST match the category names defined in the aiClassification config.
-- ============================================================================

-- ============================================================================
-- TEMPLATE CATEGORIES
-- ============================================================================

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
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"New Message Received","description":"Triggers when a new message arrives","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-1","nodeType":"condition_ai_classification","label":"Classify Intent","description":"AI determines if the lead is interested in products/services","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Analyze the customer message and classify their intent","categories":[{"name":"interested","description":"Customer is interested in products or services"},{"name":"support","description":"Customer needs support or has questions"},{"name":"other","description":"Other inquiries"}]}},"positionX":250,"positionY":180},{"id":"action-ask-budget","nodeType":"action_send_message","label":"Ask Budget","description":"Ask about their budget range","config":{"actionType":"send_message","messageType":"text","message":"Thank you for your interest! To better assist you, could you share your approximate budget range?"},"positionX":100,"positionY":320},{"id":"action-support","nodeType":"action_send_message","label":"Route to Support","description":"Acknowledge support request","config":{"actionType":"send_message","messageType":"text","message":"I understand you need assistance. Let me connect you with our support team who can help resolve your issue."},"positionX":400,"positionY":320},{"id":"action-handoff","nodeType":"action_request_handoff","label":"Request Human Agent","description":"Transfer to human support agent","config":{"actionType":"request_handoff","reason":"Customer needs support assistance"},"positionX":400,"positionY":450},{"id":"condition-budget","nodeType":"condition_ai_classification","label":"Evaluate Budget","description":"AI evaluates if budget is qualified","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Evaluate if the customer budget indicates a qualified lead","categories":[{"name":"qualified","description":"Budget is sufficient for our products"},{"name":"nurture","description":"Budget is lower, needs nurturing"}]}},"positionX":100,"positionY":450},{"id":"action-qualified","nodeType":"action_add_tag","label":"Tag as Qualified","description":"Add qualified lead tag","config":{"actionType":"add_tag","tagName":"qualified-lead"},"positionX":0,"positionY":580},{"id":"action-nurture","nodeType":"action_send_message","label":"Send Nurture Content","description":"Send educational content to nurture the lead","config":{"actionType":"send_message","messageType":"text","message":"Thank you for sharing! While you explore options, here are some resources that might help you make an informed decision..."},"positionX":200,"positionY":580},{"id":"end-qualified","nodeType":"end","label":"End - Qualified","description":"Workflow ends - lead is qualified","config":{"exitType":"success"},"positionX":0,"positionY":700},{"id":"end-nurture","nodeType":"end","label":"End - Nurturing","description":"Workflow ends - lead in nurture sequence","config":{"exitType":"success"},"positionX":200,"positionY":700},{"id":"end-support","nodeType":"end","label":"End - Support","description":"Workflow ends - handed to support","config":{"exitType":"success"},"positionX":400,"positionY":580}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-1","branch":"default"},{"id":"conn-2","fromNodeId":"condition-1","toNodeId":"action-ask-budget","branch":"interested","label":"Interested"},{"id":"conn-3","fromNodeId":"condition-1","toNodeId":"action-support","branch":"support","label":"Support"},{"id":"conn-4","fromNodeId":"action-support","toNodeId":"action-handoff","branch":"default"},{"id":"conn-5","fromNodeId":"action-handoff","toNodeId":"end-support","branch":"default"},{"id":"conn-6","fromNodeId":"action-ask-budget","toNodeId":"condition-budget","branch":"default"},{"id":"conn-7","fromNodeId":"condition-budget","toNodeId":"action-qualified","branch":"qualified","label":"Qualified"},{"id":"conn-8","fromNodeId":"condition-budget","toNodeId":"action-nurture","branch":"nurture","label":"Nurture"},{"id":"conn-9","fromNodeId":"action-qualified","toNodeId":"end-qualified","branch":"default"},{"id":"conn-10","fromNodeId":"action-nurture","toNodeId":"end-nurture","branch":"default"}],"variables":[]}',
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
  'message-square',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Support Request","description":"New support message received","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-urgency","nodeType":"condition_ai_classification","label":"Check Urgency","description":"Determine if this is an urgent issue","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Analyze the urgency level of this support request","categories":[{"name":"urgent","description":"System down, cannot access account, payment issues"},{"name":"normal","description":"General questions, feature requests, non-critical issues"}]}},"positionX":250,"positionY":180},{"id":"action-urgent-ack","nodeType":"action_send_message","label":"Urgent Acknowledgment","description":"Acknowledge urgent request immediately","config":{"actionType":"send_message","messageType":"text","message":"I understand this is urgent. I am escalating your request immediately and a support specialist will assist you within the next few minutes."},"positionX":50,"positionY":320},{"id":"action-urgent-tag","nodeType":"action_add_tag","label":"Tag as Urgent","config":{"actionType":"add_tag","tagName":"urgent-support"},"positionX":50,"positionY":450},{"id":"action-urgent-handoff","nodeType":"action_request_handoff","label":"Escalate to Agent","config":{"actionType":"request_handoff","reason":"Urgent support request requires immediate attention","priority":"high"},"positionX":50,"positionY":580},{"id":"condition-category","nodeType":"condition_ai_classification","label":"Categorize Issue","description":"Classify the type of support issue","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Categorize this support request","categories":[{"name":"billing","description":"Payment, invoice, subscription issues"},{"name":"technical","description":"Bugs, errors, how-to questions"},{"name":"general","description":"General inquiries, feedback"}]}},"positionX":450,"positionY":320},{"id":"action-billing","nodeType":"action_send_message","label":"Billing Response","config":{"actionType":"send_message","messageType":"text","message":"I can help with billing questions. Could you please provide your account email or invoice number so I can look up your account?"},"positionX":300,"positionY":480},{"id":"action-technical","nodeType":"action_send_message","label":"Technical Response","config":{"actionType":"send_message","messageType":"text","message":"I will help troubleshoot this technical issue. Could you describe what you were trying to do and any error messages you are seeing?"},"positionX":500,"positionY":480},{"id":"action-general","nodeType":"action_send_message","label":"General Response","config":{"actionType":"send_message","messageType":"text","message":"Thank you for reaching out! I am here to help. Could you tell me more about what you need assistance with?"},"positionX":700,"positionY":480},{"id":"end-urgent","nodeType":"end","label":"End - Escalated","config":{"exitType":"success"},"positionX":50,"positionY":700},{"id":"end-normal","nodeType":"end","label":"End - Triaged","config":{"exitType":"success"},"positionX":500,"positionY":620}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-urgency","branch":"default"},{"id":"conn-2","fromNodeId":"condition-urgency","toNodeId":"action-urgent-ack","branch":"urgent","label":"Urgent"},{"id":"conn-3","fromNodeId":"condition-urgency","toNodeId":"condition-category","branch":"normal","label":"Normal"},{"id":"conn-4","fromNodeId":"action-urgent-ack","toNodeId":"action-urgent-tag","branch":"default"},{"id":"conn-5","fromNodeId":"action-urgent-tag","toNodeId":"action-urgent-handoff","branch":"default"},{"id":"conn-6","fromNodeId":"action-urgent-handoff","toNodeId":"end-urgent","branch":"default"},{"id":"conn-7","fromNodeId":"condition-category","toNodeId":"action-billing","branch":"billing","label":"Billing"},{"id":"conn-8","fromNodeId":"condition-category","toNodeId":"action-technical","branch":"technical","label":"Technical"},{"id":"conn-9","fromNodeId":"condition-category","toNodeId":"action-general","branch":"general","label":"General"},{"id":"conn-10","fromNodeId":"action-billing","toNodeId":"end-normal","branch":"default"},{"id":"conn-11","fromNodeId":"action-technical","toNodeId":"end-normal","branch":"default"},{"id":"conn-12","fromNodeId":"action-general","toNodeId":"end-normal","branch":"default"}],"variables":[]}',
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
  'Intelligently respond to product questions with AI-powered answers about pricing, features, and availability.',
  'shopping-cart',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Product Inquiry","description":"New product question received","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-intent","nodeType":"condition_ai_classification","label":"Identify Intent","description":"Classify the type of product inquiry","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"What type of product information is the customer asking about?","categories":[{"name":"pricing","description":"Questions about price, cost, payment options"},{"name":"features","description":"Questions about product features and capabilities"},{"name":"availability","description":"Questions about stock, delivery, availability"},{"name":"other","description":"Other product-related questions"}]}},"positionX":250,"positionY":180},{"id":"action-pricing","nodeType":"action_send_message","label":"Share Pricing","config":{"actionType":"send_message","messageType":"text","message":"Great question! Here is our pricing information:\n\n- Basic Plan: $29/month\n- Pro Plan: $79/month\n- Enterprise: Custom pricing\n\nWould you like more details on any specific plan?"},"positionX":50,"positionY":340},{"id":"action-features","nodeType":"action_send_message","label":"Explain Features","config":{"actionType":"send_message","messageType":"text","message":"Our product includes these key features:\n\n- Feature A: Description\n- Feature B: Description\n- Feature C: Description\n\nWhich feature would you like to learn more about?"},"positionX":200,"positionY":340},{"id":"action-availability","nodeType":"action_send_message","label":"Check Availability","config":{"actionType":"send_message","messageType":"text","message":"I would be happy to check availability for you! Could you please tell me which product you are interested in and your location?"},"positionX":350,"positionY":340},{"id":"action-other","nodeType":"action_send_message","label":"General Response","config":{"actionType":"send_message","messageType":"text","message":"I would be happy to help with your product question! Could you provide a bit more detail about what you would like to know?"},"positionX":500,"positionY":340},{"id":"end-1","nodeType":"end","label":"End - Responded","config":{"exitType":"success"},"positionX":250,"positionY":500}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-intent","branch":"default"},{"id":"conn-2","fromNodeId":"condition-intent","toNodeId":"action-pricing","branch":"pricing","label":"Pricing"},{"id":"conn-3","fromNodeId":"condition-intent","toNodeId":"action-features","branch":"features","label":"Features"},{"id":"conn-4","fromNodeId":"condition-intent","toNodeId":"action-availability","branch":"availability","label":"Availability"},{"id":"conn-5","fromNodeId":"condition-intent","toNodeId":"action-other","branch":"other","label":"Other"},{"id":"conn-6","fromNodeId":"action-pricing","toNodeId":"end-1","branch":"default"},{"id":"conn-7","fromNodeId":"action-features","toNodeId":"end-1","branch":"default"},{"id":"conn-8","fromNodeId":"action-availability","toNodeId":"end-1","branch":"default"},{"id":"conn-9","fromNodeId":"action-other","toNodeId":"end-1","branch":"default"}],"variables":[]}',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 4: Appointment Scheduler
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440004',
  'Appointment Scheduler',
  'Guide customers through booking appointments with availability checking and confirmation.',
  'calendar',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Appointment Request","description":"Customer asks about appointments","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-intent","nodeType":"condition_ai_classification","label":"Determine Intent","description":"What does the customer want to do?","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"What appointment action does the customer want?","categories":[{"name":"book_new","description":"Customer wants to book a new appointment"},{"name":"reschedule","description":"Customer wants to change existing appointment"},{"name":"cancel","description":"Customer wants to cancel appointment"},{"name":"inquiry","description":"Customer has questions about appointments"}]}},"positionX":250,"positionY":180},{"id":"action-collect-details","nodeType":"action_send_message","label":"Collect Details","config":{"actionType":"send_message","messageType":"text","message":"I would be happy to help you book an appointment! What date and time works best for you? Our available slots are:\n\n- Morning: 9am - 12pm\n- Afternoon: 1pm - 5pm"},"positionX":50,"positionY":340},{"id":"action-reschedule","nodeType":"action_send_message","label":"Reschedule Flow","config":{"actionType":"send_message","messageType":"text","message":"No problem! I can help you reschedule. Could you please provide your current appointment date and your preferred new date/time?"},"positionX":200,"positionY":340},{"id":"action-cancel","nodeType":"action_send_message","label":"Cancel Confirmation","config":{"actionType":"send_message","messageType":"text","message":"I understand you would like to cancel your appointment. Could you please confirm the appointment date you wish to cancel? Note: Cancellations must be made at least 24 hours in advance."},"positionX":350,"positionY":340},{"id":"action-info","nodeType":"action_send_message","label":"Provide Info","config":{"actionType":"send_message","messageType":"text","message":"Here is our appointment information:\n\n- Hours: Mon-Fri 9am-5pm\n- Location: 123 Main St\n- Duration: 30-60 minutes\n\nWould you like to book an appointment?"},"positionX":500,"positionY":340},{"id":"end-1","nodeType":"end","label":"End","config":{"exitType":"success"},"positionX":250,"positionY":500}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-intent","branch":"default"},{"id":"conn-2","fromNodeId":"condition-intent","toNodeId":"action-collect-details","branch":"book_new","label":"Book New"},{"id":"conn-3","fromNodeId":"condition-intent","toNodeId":"action-reschedule","branch":"reschedule","label":"Reschedule"},{"id":"conn-4","fromNodeId":"condition-intent","toNodeId":"action-cancel","branch":"cancel","label":"Cancel"},{"id":"conn-5","fromNodeId":"condition-intent","toNodeId":"action-info","branch":"inquiry","label":"Inquiry"},{"id":"conn-6","fromNodeId":"action-collect-details","toNodeId":"end-1","branch":"default"},{"id":"conn-7","fromNodeId":"action-reschedule","toNodeId":"end-1","branch":"default"},{"id":"conn-8","fromNodeId":"action-cancel","toNodeId":"end-1","branch":"default"},{"id":"conn-9","fromNodeId":"action-info","toNodeId":"end-1","branch":"default"}],"variables":[]}',
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
  'Help customers check order status, track deliveries, and handle order-related inquiries.',
  'package',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Order Inquiry","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-intent","nodeType":"condition_ai_classification","label":"Classify Request","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"What is the customer asking about their order?","categories":[{"name":"track_order","description":"Customer wants to track order status"},{"name":"return_request","description":"Customer wants to return or exchange"},{"name":"complaint","description":"Customer has a complaint about order"},{"name":"other","description":"Other order-related questions"}]}},"positionX":250,"positionY":180},{"id":"action-track","nodeType":"action_send_message","label":"Request Order Number","config":{"actionType":"send_message","messageType":"text","message":"I will help you track your order! Please provide your order number (found in your confirmation email) or the email address used for the order."},"positionX":50,"positionY":340},{"id":"action-return","nodeType":"action_send_message","label":"Return Instructions","config":{"actionType":"send_message","messageType":"text","message":"I can help with your return request. Our return policy allows returns within 30 days. Please provide your order number and reason for return, and I will initiate the process."},"positionX":200,"positionY":340},{"id":"action-complaint","nodeType":"action_send_message","label":"Acknowledge Complaint","config":{"actionType":"send_message","messageType":"text","message":"I am sorry to hear about your experience. I will make sure your concern is addressed. Please provide your order number and describe the issue, and I will escalate this to our team immediately."},"positionX":350,"positionY":340},{"id":"action-complaint-tag","nodeType":"action_add_tag","label":"Tag Complaint","config":{"actionType":"add_tag","tagName":"complaint"},"positionX":350,"positionY":470},{"id":"action-other","nodeType":"action_send_message","label":"General Help","config":{"actionType":"send_message","messageType":"text","message":"I would be happy to help with your order question! Could you please provide your order number and what you need assistance with?"},"positionX":500,"positionY":340},{"id":"end-1","nodeType":"end","label":"End","config":{"exitType":"success"},"positionX":250,"positionY":600}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-intent","branch":"default"},{"id":"conn-2","fromNodeId":"condition-intent","toNodeId":"action-track","branch":"track_order","label":"Track"},{"id":"conn-3","fromNodeId":"condition-intent","toNodeId":"action-return","branch":"return_request","label":"Return"},{"id":"conn-4","fromNodeId":"condition-intent","toNodeId":"action-complaint","branch":"complaint","label":"Complaint"},{"id":"conn-5","fromNodeId":"condition-intent","toNodeId":"action-other","branch":"other","label":"Other"},{"id":"conn-6","fromNodeId":"action-track","toNodeId":"end-1","branch":"default"},{"id":"conn-7","fromNodeId":"action-return","toNodeId":"end-1","branch":"default"},{"id":"conn-8","fromNodeId":"action-complaint","toNodeId":"action-complaint-tag","branch":"default"},{"id":"conn-9","fromNodeId":"action-complaint-tag","toNodeId":"end-1","branch":"default"},{"id":"conn-10","fromNodeId":"action-other","toNodeId":"end-1","branch":"default"}],"variables":[]}',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 6: Feedback Collector
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440005',
  'Feedback Collector',
  'Collect customer feedback after interactions with rating collection and sentiment-based responses.',
  'star',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Conversation End","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"delay-1","nodeType":"delay","label":"Wait 5 Minutes","config":{"duration":5,"unit":"minutes"},"positionX":250,"positionY":180},{"id":"action-ask-feedback","nodeType":"action_send_message","label":"Ask for Feedback","config":{"actionType":"send_message","messageType":"text","message":"Thank you for chatting with us! We would love to hear your feedback. On a scale of 1-5, how would you rate your experience today?"},"positionX":250,"positionY":310},{"id":"condition-rating","nodeType":"condition_ai_classification","label":"Analyze Rating","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"What rating did the customer give (1-5)?","categories":[{"name":"positive","description":"Rating of 4 or 5"},{"name":"neutral","description":"Rating of 3"},{"name":"negative","description":"Rating of 1 or 2"}]}},"positionX":250,"positionY":440},{"id":"action-thank","nodeType":"action_send_message","label":"Thank Positive","config":{"actionType":"send_message","messageType":"text","message":"Thank you so much for the great feedback! We are glad we could help. Have a wonderful day!"},"positionX":50,"positionY":590},{"id":"action-improve","nodeType":"action_send_message","label":"Ask Improvement","config":{"actionType":"send_message","messageType":"text","message":"Thank you for your feedback! We always strive to improve. Is there anything specific we could do better?"},"positionX":250,"positionY":590},{"id":"action-escalate","nodeType":"action_send_message","label":"Apologize","config":{"actionType":"send_message","messageType":"text","message":"We are sorry your experience was not up to par. Your feedback is important to us. A manager will follow up with you shortly to address your concerns."},"positionX":450,"positionY":590},{"id":"action-tag-negative","nodeType":"action_add_tag","label":"Tag for Follow-up","config":{"actionType":"add_tag","tagName":"negative-feedback"},"positionX":450,"positionY":720},{"id":"end-1","nodeType":"end","label":"End","config":{"exitType":"success"},"positionX":250,"positionY":850}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"delay-1","branch":"default"},{"id":"conn-2","fromNodeId":"delay-1","toNodeId":"action-ask-feedback","branch":"default"},{"id":"conn-3","fromNodeId":"action-ask-feedback","toNodeId":"condition-rating","branch":"default"},{"id":"conn-4","fromNodeId":"condition-rating","toNodeId":"action-thank","branch":"positive","label":"Positive"},{"id":"conn-5","fromNodeId":"condition-rating","toNodeId":"action-improve","branch":"neutral","label":"Neutral"},{"id":"conn-6","fromNodeId":"condition-rating","toNodeId":"action-escalate","branch":"negative","label":"Negative"},{"id":"conn-7","fromNodeId":"action-thank","toNodeId":"end-1","branch":"default"},{"id":"conn-8","fromNodeId":"action-improve","toNodeId":"end-1","branch":"default"},{"id":"conn-9","fromNodeId":"action-escalate","toNodeId":"action-tag-negative","branch":"default"},{"id":"conn-10","fromNodeId":"action-tag-negative","toNodeId":"end-1","branch":"default"}],"variables":[]}',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 7: Welcome New Contact
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440006',
  'Welcome New Contact',
  'Greet new contacts with a personalized welcome message and guide them to the right resources.',
  'user-plus',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"First Message","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"action-welcome","nodeType":"action_send_message","label":"Send Welcome","config":{"actionType":"send_message","messageType":"text","message":"Welcome! Thank you for reaching out to us. I am here to help you.\n\nHow can I assist you today?\n\n1. Learn about our products\n2. Get support\n3. Speak with sales\n4. Other"},"positionX":250,"positionY":180},{"id":"action-tag","nodeType":"action_add_tag","label":"Tag New Contact","config":{"actionType":"add_tag","tagName":"new-contact"},"positionX":250,"positionY":310},{"id":"condition-intent","nodeType":"condition_ai_classification","label":"Classify Intent","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"What is the customer interested in?","categories":[{"name":"products","description":"Customer wants to learn about products"},{"name":"support","description":"Customer needs support"},{"name":"sales","description":"Customer wants to speak with sales"},{"name":"other","description":"Other inquiries"}]}},"positionX":250,"positionY":440},{"id":"action-products","nodeType":"action_send_message","label":"Product Info","config":{"actionType":"send_message","messageType":"text","message":"Great! Here is an overview of our products and services. What would you like to know more about?"},"positionX":50,"positionY":590},{"id":"action-support","nodeType":"action_send_message","label":"Support Handoff","config":{"actionType":"send_message","messageType":"text","message":"I will connect you with our support team right away. Please describe your issue and a support agent will assist you shortly."},"positionX":200,"positionY":590},{"id":"action-sales","nodeType":"action_send_message","label":"Sales Connect","config":{"actionType":"send_message","messageType":"text","message":"Our sales team would be happy to help! I will connect you with a sales representative. In the meantime, what are you looking to accomplish?"},"positionX":350,"positionY":590},{"id":"action-other","nodeType":"action_send_message","label":"General Response","config":{"actionType":"send_message","messageType":"text","message":"No problem! Please let me know what you need help with and I will do my best to assist you."},"positionX":500,"positionY":590},{"id":"end-1","nodeType":"end","label":"End","config":{"exitType":"success"},"positionX":250,"positionY":750}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"action-welcome","branch":"default"},{"id":"conn-2","fromNodeId":"action-welcome","toNodeId":"action-tag","branch":"default"},{"id":"conn-3","fromNodeId":"action-tag","toNodeId":"condition-intent","branch":"default"},{"id":"conn-4","fromNodeId":"condition-intent","toNodeId":"action-products","branch":"products","label":"Products"},{"id":"conn-5","fromNodeId":"condition-intent","toNodeId":"action-support","branch":"support","label":"Support"},{"id":"conn-6","fromNodeId":"condition-intent","toNodeId":"action-sales","branch":"sales","label":"Sales"},{"id":"conn-7","fromNodeId":"condition-intent","toNodeId":"action-other","branch":"other","label":"Other"},{"id":"conn-8","fromNodeId":"action-products","toNodeId":"end-1","branch":"default"},{"id":"conn-9","fromNodeId":"action-support","toNodeId":"end-1","branch":"default"},{"id":"conn-10","fromNodeId":"action-sales","toNodeId":"end-1","branch":"default"},{"id":"conn-11","fromNodeId":"action-other","toNodeId":"end-1","branch":"default"}],"variables":[]}',
  true,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 8: Abandoned Cart Recovery
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440008',
  '550e8400-e29b-41d4-a716-446655440003',
  'Abandoned Cart Recovery',
  'Automatically follow up with customers who abandoned their shopping cart with reminders and incentives.',
  'shopping-cart',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger","label":"Cart Abandoned","config":{"triggerType":"tag_added","tagName":"abandoned-cart"},"positionX":250,"positionY":50},{"id":"delay-1","nodeType":"delay","label":"Wait 1 Hour","config":{"duration":1,"unit":"hours"},"positionX":250,"positionY":180},{"id":"action-reminder","nodeType":"action_send_message","label":"First Reminder","config":{"actionType":"send_message","messageType":"text","message":"Hi! I noticed you left some items in your cart. Would you like to complete your purchase? I can help if you have any questions!"},"positionX":250,"positionY":310},{"id":"delay-2","nodeType":"delay","label":"Wait 24 Hours","config":{"duration":24,"unit":"hours"},"positionX":250,"positionY":440},{"id":"condition-response","nodeType":"condition_ai_classification","label":"Check Response","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Did the customer respond positively or show interest?","categories":[{"name":"interested","description":"Customer responded or showed interest"},{"name":"not_interested","description":"No response or declined"}]}},"positionX":250,"positionY":570},{"id":"action-offer","nodeType":"action_send_message","label":"Send Discount","config":{"actionType":"send_message","messageType":"text","message":"Great! Here is a special 10% discount code just for you: CART10\n\nThis code expires in 24 hours. Ready to complete your purchase?"},"positionX":100,"positionY":720},{"id":"action-final","nodeType":"action_send_message","label":"Final Offer","config":{"actionType":"send_message","messageType":"text","message":"Last chance! Your cart items are waiting, and your 10% discount is about to expire. Use code CART10 to save!"},"positionX":400,"positionY":720},{"id":"end-1","nodeType":"end","label":"End - Recovered","config":{"exitType":"success"},"positionX":100,"positionY":880},{"id":"end-2","nodeType":"end","label":"End - Not Recovered","config":{"exitType":"success"},"positionX":400,"positionY":880}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"delay-1","branch":"default"},{"id":"conn-2","fromNodeId":"delay-1","toNodeId":"action-reminder","branch":"default"},{"id":"conn-3","fromNodeId":"action-reminder","toNodeId":"delay-2","branch":"default"},{"id":"conn-4","fromNodeId":"delay-2","toNodeId":"condition-response","branch":"default"},{"id":"conn-5","fromNodeId":"condition-response","toNodeId":"action-offer","branch":"interested","label":"Interested"},{"id":"conn-6","fromNodeId":"condition-response","toNodeId":"action-final","branch":"not_interested","label":"No Response"},{"id":"conn-7","fromNodeId":"action-offer","toNodeId":"end-1","branch":"default"},{"id":"conn-8","fromNodeId":"action-final","toNodeId":"end-2","branch":"default"}],"variables":[]}',
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  definition = EXCLUDED.definition,
  updated_at = NOW();

-- Template 9: After-Hours Auto-Reply
INSERT INTO workflow_templates (id, category_id, name, description, icon, definition, is_featured, use_count, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440009',
  '550e8400-e29b-41d4-a716-446655440005',
  'After-Hours Auto-Reply',
  'Automatically respond to messages received outside business hours with helpful information.',
  'clock',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger_message","label":"Message Received","config":{"triggerType":"message"},"positionX":250,"positionY":50},{"id":"condition-hours","nodeType":"condition_ai_classification","label":"Check Business Hours","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Is this message during business hours (9am-5pm weekdays)?","categories":[{"name":"business_hours","description":"Message sent during business hours"},{"name":"after_hours","description":"Message sent outside business hours"}]}},"positionX":250,"positionY":180},{"id":"action-auto-reply","nodeType":"action_send_message","label":"After Hours Reply","config":{"actionType":"send_message","messageType":"text","message":"Thank you for your message! Our office hours are Monday-Friday, 9am-5pm. We will respond to your inquiry first thing on the next business day.\n\nFor urgent matters, please email urgent@company.com"},"positionX":400,"positionY":340},{"id":"action-tag-urgent","nodeType":"action_add_tag","label":"Tag for Follow-up","config":{"actionType":"add_tag","tagName":"after-hours-message"},"positionX":400,"positionY":470},{"id":"end-business","nodeType":"end","label":"End - Business Hours","config":{"exitType":"success"},"positionX":100,"positionY":340},{"id":"end-after","nodeType":"end","label":"End - After Hours","config":{"exitType":"success"},"positionX":400,"positionY":600}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"condition-hours","branch":"default"},{"id":"conn-2","fromNodeId":"condition-hours","toNodeId":"end-business","branch":"business_hours","label":"Business Hours"},{"id":"conn-3","fromNodeId":"condition-hours","toNodeId":"action-auto-reply","branch":"after_hours","label":"After Hours"},{"id":"conn-4","fromNodeId":"action-auto-reply","toNodeId":"action-tag-urgent","branch":"default"},{"id":"conn-5","fromNodeId":"action-tag-urgent","toNodeId":"end-after","branch":"default"}],"variables":[]}',
  false,
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
  '550e8400-e29b-41d4-a716-446655440005',
  'Re-engagement Campaign',
  'Win back inactive customers with personalized re-engagement messages and special offers.',
  'refresh-cw',
  '{"nodes":[{"id":"trigger-1","nodeType":"trigger","label":"Inactive 30 Days","config":{"triggerType":"tag_added","tagName":"inactive-30-days"},"positionX":250,"positionY":50},{"id":"action-reengagement","nodeType":"action_send_message","label":"Re-engagement Message","config":{"actionType":"send_message","messageType":"text","message":"Hi there! We miss you! It has been a while since we heard from you.\n\nAs a valued customer, here is a special 15% off your next purchase. Would you like to take advantage of this offer?"},"positionX":250,"positionY":180},{"id":"delay-response","nodeType":"delay","label":"Wait 48 Hours","config":{"duration":48,"unit":"hours"},"positionX":250,"positionY":310},{"id":"condition-response","nodeType":"condition_ai_classification","label":"Check Response","config":{"conditionType":"ai_classification","aiClassification":{"prompt":"Did the customer respond positively to the re-engagement offer?","categories":[{"name":"interested","description":"Customer responded positively or claimed offer"},{"name":"not_interested","description":"No response or negative response"}]}},"positionX":250,"positionY":440},{"id":"action-welcome-back","nodeType":"action_send_message","label":"Welcome Back","config":{"actionType":"send_message","messageType":"text","message":"Welcome back! Your 15% discount code is: WELCOME15\n\nUse it on your next purchase. Is there anything specific you are looking for?"},"positionX":100,"positionY":600},{"id":"action-remove-inactive","nodeType":"action_remove_tag","label":"Remove Inactive Tag","config":{"actionType":"remove_tag","tagName":"inactive-30-days"},"positionX":100,"positionY":730},{"id":"action-feedback-request","nodeType":"action_send_message","label":"Request Feedback","config":{"actionType":"send_message","messageType":"text","message":"We noticed you have not been active lately. We would love to understand how we can serve you better. Is there anything we could improve?"},"positionX":400,"positionY":600},{"id":"end-reengaged","nodeType":"end","label":"End - Re-engaged","config":{"exitType":"success"},"positionX":100,"positionY":870},{"id":"end-feedback","nodeType":"end","label":"End - Feedback","config":{"exitType":"success"},"positionX":400,"positionY":730}],"connections":[{"id":"conn-1","fromNodeId":"trigger-1","toNodeId":"action-reengagement","branch":"default"},{"id":"conn-2","fromNodeId":"action-reengagement","toNodeId":"delay-response","branch":"default"},{"id":"conn-3","fromNodeId":"delay-response","toNodeId":"condition-response","branch":"default"},{"id":"conn-4","fromNodeId":"condition-response","toNodeId":"action-welcome-back","branch":"interested","label":"Interested"},{"id":"conn-5","fromNodeId":"condition-response","toNodeId":"action-feedback-request","branch":"not_interested","label":"No Response"},{"id":"conn-6","fromNodeId":"action-welcome-back","toNodeId":"action-remove-inactive","branch":"default"},{"id":"conn-7","fromNodeId":"action-remove-inactive","toNodeId":"end-reengaged","branch":"default"},{"id":"conn-8","fromNodeId":"action-feedback-request","toNodeId":"end-feedback","branch":"default"}],"variables":[]}',
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
