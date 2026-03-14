"""Seed script to create demo workspace with sample tools, flows, and KB."""
import asyncio

from sqlalchemy import select, delete, text

from app.database import init_db, async_session
from app.models.models import (
    Workspace, Tool, Flow,
    KnowledgeSource, KnowledgeDocument, KnowledgeChunk,
)
from app.services.knowledge_base import kb_service


async def seed():
    await init_db()

    async with async_session() as db:
        # Remove existing demo workspace and its data if present
        existing = await db.execute(select(Workspace).where(Workspace.id == "demo"))
        if existing.scalar_one_or_none():
            # Clean up KB data (chunks FTS, chunks, docs, sources)
            kb_sources = await db.execute(
                select(KnowledgeSource).where(KnowledgeSource.workspace_id == "demo")
            )
            for src in kb_sources.scalars().all():
                kb_docs = await db.execute(
                    select(KnowledgeDocument).where(KnowledgeDocument.source_id == src.id)
                )
                for doc in kb_docs.scalars().all():
                    chunks = await db.execute(
                        select(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id)
                    )
                    for chunk in chunks.scalars().all():
                        await db.execute(
                            text("DELETE FROM knowledge_chunks_fts WHERE chunk_id = :cid"),
                            {"cid": chunk.id},
                        )
                    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id))
                await db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.source_id == src.id))
            await db.execute(delete(KnowledgeSource).where(KnowledgeSource.workspace_id == "demo"))
            await db.execute(delete(Flow).where(Flow.workspace_id == "demo"))
            await db.execute(delete(Tool).where(Tool.workspace_id == "demo"))
            await db.execute(delete(Workspace).where(Workspace.id == "demo"))
            await db.flush()

        # Create demo workspace
        ws = Workspace(id="demo", name="Demo Shop", domain="demo.shop.com")
        db.add(ws)

        # Sample tools
        tools = [
            Tool(
                workspace_id="demo",
                name="refund_payment",
                description="Process a refund for the customer's order. Use when customer requests money back.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "order_id", "type": "string", "description": "Order ID to refund", "required": True},
                    {"name": "amount", "type": "number", "description": "Refund amount in USD", "required": True},
                    {"name": "reason", "type": "string", "description": "Reason for refund", "required": False},
                ],
                requires_approval=True,
            ),
            Tool(
                workspace_id="demo",
                name="change_subscription_plan",
                description="Change customer's subscription plan to a different tier.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "customer_email", "type": "string", "description": "Customer email", "required": True},
                    {"name": "new_plan", "type": "string", "description": "New plan name (basic/pro/business)", "required": True},
                ],
                requires_approval=True,
            ),
            Tool(
                workspace_id="demo",
                name="reset_password",
                description="Send password reset link to customer's email.",
                endpoint="https://httpbin.org/post",
                method="POST",
                parameters=[
                    {"name": "email", "type": "string", "description": "Customer email address", "required": True},
                ],
                requires_approval=False,
            ),
            Tool(
                workspace_id="demo",
                name="lookup_customer",
                description="Look up customer information including orders, plan, and support history.",
                endpoint="https://httpbin.org/get",
                method="GET",
                parameters=[
                    {"name": "email", "type": "string", "description": "Customer email", "required": True},
                ],
                requires_approval=False,
            ),
        ]

        for tool in tools:
            db.add(tool)

        # Sample flow: Refund Request
        refund_flow = Flow(
            workspace_id="demo",
            name="Refund Request",
            description="Handles customer refund requests with order verification and approval",
            trigger_intents=["refund", "money back", "повернення", "повернути кошти"],
            priority=10,
            is_active=True,
            nodes=[
                {
                    "id": "trigger-1",
                    "type": "trigger",
                    "position": {"x": 250, "y": 0},
                    "data": {
                        "label": "Refund Request",
                        "intents": ["refund", "money back", "повернення"],
                        "description": "Customer wants a refund",
                    },
                },
                {
                    "id": "question-1",
                    "type": "question",
                    "position": {"x": 250, "y": 120},
                    "data": {
                        "label": "Ask Order ID",
                        "question_text": "Could you please provide your order ID so I can look into this for you?",
                        "variable_name": "order_id",
                        "validation": "non-empty",
                        "required": True,
                    },
                },
                {
                    "id": "question-2",
                    "type": "question",
                    "position": {"x": 250, "y": 240},
                    "data": {
                        "label": "Ask Refund Reason",
                        "question_text": "What is the reason for the refund?",
                        "variable_name": "refund_reason",
                        "required": True,
                    },
                },
                {
                    "id": "guardrail-1",
                    "type": "guardrail",
                    "position": {"x": 250, "y": 360},
                    "data": {
                        "label": "Check Amount",
                        "check_type": "amount_limit",
                        "condition": "Refund amount must be under $500",
                        "fail_message": "Refunds over $500 require manager approval. Let me connect you with a supervisor.",
                        "on_fail_action": "escalate",
                    },
                },
                {
                    "id": "tool-1",
                    "type": "tool",
                    "position": {"x": 250, "y": 480},
                    "data": {
                        "label": "Process Refund",
                        "tool_id": "",
                        "input_mapping": {
                            "order_id": "{{order_id}}",
                            "reason": "{{refund_reason}}",
                        },
                    },
                },
                {
                    "id": "response-1",
                    "type": "response",
                    "position": {"x": 250, "y": 600},
                    "data": {
                        "label": "Confirm Refund",
                        "message_template": "Your refund for order {{order_id}} has been processed. You should see the amount back in your account within 5-7 business days.",
                        "ai_instructions": "Confirm the refund was processed and provide timeline.",
                    },
                },
            ],
            edges=[
                {"id": "e1", "source": "trigger-1", "target": "question-1"},
                {"id": "e2", "source": "question-1", "target": "question-2"},
                {"id": "e3", "source": "question-2", "target": "guardrail-1"},
                {"id": "e4", "source": "guardrail-1", "target": "tool-1"},
                {"id": "e5", "source": "tool-1", "target": "response-1"},
            ],
        )
        db.add(refund_flow)

        # Sample flow: Account Deletion (with escalation)
        account_deletion_flow = Flow(
            workspace_id="demo",
            name="Account Deletion",
            description="Handles account deletion requests — confirms intent, checks for active subscriptions, and escalates to a human agent",
            trigger_intents=["delete account", "close account", "remove account", "видалити акаунт", "закрити акаунт"],
            priority=5,
            is_active=True,
            nodes=[
                {
                    "id": "trigger-del",
                    "type": "trigger",
                    "position": {"x": 250, "y": 0},
                    "data": {
                        "label": "Account Deletion",
                        "intents": ["delete account", "close account", "видалити акаунт"],
                        "description": "Customer wants to delete their account",
                    },
                },
                {
                    "id": "question-reason",
                    "type": "question",
                    "position": {"x": 250, "y": 120},
                    "data": {
                        "label": "Ask Reason",
                        "question_text": "We're sorry to see you go. Could you share why you'd like to delete your account? This helps us improve.",
                        "variable_name": "deletion_reason",
                        "required": True,
                    },
                },
                {
                    "id": "question-confirm",
                    "type": "question",
                    "position": {"x": 250, "y": 240},
                    "data": {
                        "label": "Confirm Deletion",
                        "question_text": "Please be aware that account deletion is permanent and all your data will be lost. Type 'CONFIRM' to proceed.",
                        "variable_name": "confirmation",
                        "validation": "must equal CONFIRM",
                        "required": True,
                    },
                },
                {
                    "id": "condition-confirmed",
                    "type": "condition",
                    "position": {"x": 250, "y": 360},
                    "data": {
                        "label": "User Confirmed?",
                        "variable": "confirmation",
                        "operator": "equals",
                        "value": "CONFIRM",
                    },
                },
                {
                    "id": "escalation-delete",
                    "type": "escalation",
                    "position": {"x": 100, "y": 500},
                    "data": {
                        "label": "Escalate to Agent",
                        "reason": "Customer confirmed account deletion. This requires a human agent to process.",
                        "generate_summary": True,
                        "priority_override": "high",
                        "handoff_notes_template": "Customer ({{customer_email}}) confirmed account deletion. Reason: {{deletion_reason}}. Please process in admin panel.",
                    },
                },
                {
                    "id": "response-cancelled",
                    "type": "response",
                    "position": {"x": 400, "y": 500},
                    "data": {
                        "label": "Deletion Cancelled",
                        "message_template": "No problem! Your account will remain active. If you change your mind or need anything else, feel free to reach out.",
                        "ai_instructions": "The customer did not confirm. Reassure them their account is safe.",
                    },
                },
            ],
            edges=[
                {"id": "ed1", "source": "trigger-del", "target": "question-reason"},
                {"id": "ed2", "source": "question-reason", "target": "question-confirm"},
                {"id": "ed3", "source": "question-confirm", "target": "condition-confirmed"},
                {"id": "ed4", "source": "condition-confirmed", "target": "escalation-delete", "sourceHandle": "yes", "label": "Confirmed"},
                {"id": "ed5", "source": "condition-confirmed", "target": "response-cancelled", "sourceHandle": "no", "label": "Not confirmed"},
            ],
        )
        db.add(account_deletion_flow)

        await db.commit()

        # --- Knowledge Base seed ---
        kb_source = await kb_service.create_source(
            db, "demo", "PayFlow Admin Docs", "file", {}
        )

        kb_documents = [
            (
                "Campaign Management",
                """# Campaign Management

## Abandoned Cart Campaigns
PayFlow's abandoned cart campaigns automatically send reminders to customers who left items in their cart. Configure timing (1hr, 4hr, 24hr delays), set discount incentives (percentage or fixed), and customize email templates. The campaign dashboard shows conversion rate, recovered revenue, and email open rates. Common issue: if conversion rate shows 0%, verify the tracking pixel is installed on the checkout confirmation page.

## Back-in-Stock Notifications
Customers can subscribe to back-in-stock alerts for out-of-stock products. When inventory is updated via the API or admin panel, notifications are sent automatically. Supports email and SMS channels. Maximum 10,000 subscribers per product.

## Price Drop Alerts
Automated notifications when product prices decrease. Customers opt in from the product page. Configure minimum discount threshold (default 10%) to avoid sending alerts for trivial changes.

## Campaign Analytics
View campaign performance in Analytics > Campaigns. Metrics include: send rate, open rate, click rate, conversion rate, revenue attributed. Filter by date range, campaign type, and status. Export reports as CSV.""",
            ),
            (
                "Payment Processing",
                """# Payment Processing

## Stripe Connect Integration
PayFlow uses Stripe Connect for payment processing. Each merchant has a connected Stripe account. Setup: Settings > Payments > Connect Stripe Account. The OAuth flow handles account linking. Test mode uses Stripe test keys (prefix `sk_test_`).

## Handling Disputes
When a customer files a chargeback, PayFlow creates a dispute record. View disputes in Payments > Disputes. Required actions: upload evidence within 7 days, include shipping proof and communication logs. Auto-response can be enabled in Settings > Payments > Dispute Automation.

## Payout Schedule
Merchants receive payouts on a configurable schedule: daily, weekly, or monthly. Minimum payout threshold: $25. View payout history in Payments > Payouts. Failed payouts usually indicate an invalid bank account — update in Settings > Banking.

## Fraud Detection
Built-in fraud scoring uses Stripe Radar. Transactions scoring above 75 are flagged for manual review. Configure thresholds in Settings > Payments > Fraud Rules. Block specific countries or require 3D Secure for high-risk orders.""",
            ),
            (
                "Customer & Subscriber Management",
                """# Customer & Subscriber Management

## Customer Profiles
Each customer has a unified profile showing: order history, subscription status, support tickets, campaign interactions, and payment methods. Access via Customers > Search. Merge duplicate profiles with the Merge tool (requires admin role).

## Customer Segments
Create dynamic segments based on: purchase history, subscription plan, location, engagement score, or custom attributes. Segments auto-update as customer data changes. Use segments to target campaigns and flows. Maximum 50 segments per workspace.

## GDPR Compliance
PayFlow provides GDPR tools: data export (customer can request their data), right to deletion (removes PII within 30 days), consent management (tracks opt-in/opt-out), and data processing records. Access GDPR tools in Settings > Privacy. Deletion requests appear in a queue for admin review.""",
            ),
            (
                "Journey Automation",
                """# Journey Automation

## Visual Flow Builder
Build customer journeys using the drag-and-drop ReactFlow editor. Available node types: Trigger (entry point), Question (collect data), Condition (branch logic), Tool (execute action), Response (send message), Guardrail (validation), and Escalation (handoff to agent).

## Triggers
Flows start with trigger nodes matching customer intents. Configure trigger keywords and the AI matches incoming messages. Priority setting determines which flow activates when multiple match. Test triggers in the Flow Editor preview panel.

## Actions & Tools
Tool nodes execute external API calls (refunds, plan changes, lookups). Configure input mapping using variable references like {{order_id}}. Tools with requires_approval=true pause the flow for agent review. Results are stored in flow state.

## Flow Analytics
Track flow performance in Analytics > Flows. Metrics: trigger rate, completion rate, average steps to resolution, escalation rate, drop-off points. Identify bottlenecks where customers abandon flows.""",
            ),
            (
                "Analytics Dashboards",
                """# Analytics Dashboards

## Revenue Dashboard
Overview of payment metrics: total revenue, average order value, refund rate, and MRR (monthly recurring revenue). Filter by date range, product category, or customer segment. Compare periods with the date comparison toggle.

## Campaign Dashboard
Campaign performance overview: total sends, delivery rate, open rate, click rate, conversion rate. Drill down into individual campaigns. A/B test results shown side-by-side. Export data for external analysis.

## Payment Analytics
Detailed payment metrics: successful transactions, failure rate by payment method, dispute rate, average processing time. Geographic breakdown of payment methods. Alert when failure rate exceeds 5%.

## Custom Reports
Build custom reports by selecting metrics, dimensions, and filters. Save reports for quick access. Schedule automated email delivery (daily, weekly, monthly). Share reports with team members via link.""",
            ),
            (
                "Settings & Configuration",
                """# Settings & Configuration

## User Roles & Permissions
Three role levels: Admin (full access), Agent (chat and customer management), Viewer (read-only analytics). Manage users in Settings > Team. Invite by email with role assignment. SSO available on Business plan.

## Billing & Plans
Three plans: Starter ($29/mo, 1000 customers), Pro ($79/mo, 10,000 customers), Business ($199/mo, unlimited + SSO + API). Upgrade/downgrade in Settings > Billing. Changes take effect at next billing cycle. Annual billing saves 20%.

## API Keys
Generate API keys in Settings > Developers. Keys have scoped permissions: read-only, write, or admin. Rate limit: 100 requests/minute on Starter, 500 on Pro, 2000 on Business. Include key in Authorization header as Bearer token.

## Workspace Configuration
Configure workspace name, domain, timezone, default language, and notification preferences. Widget customization: brand color, position, greeting message, quick actions. All changes auto-save.""",
            ),
            (
                "Authentication & Onboarding",
                """# Authentication & Onboarding

## OAuth Integration
PayFlow supports Google and GitHub OAuth for user authentication. Configure OAuth apps in Settings > Authentication. Required fields: Client ID, Client Secret, Redirect URI. Callback URL format: `https://app.payflow.io/auth/callback/{provider}`.

## Registration Flow
New users: email verification > workspace creation > Stripe Connect setup > import products > configure first campaign. The onboarding wizard guides through each step. Skip steps by clicking "Set up later" — incomplete steps show as reminders in the dashboard.

## Onboarding Wizard
Step-by-step setup: 1) Workspace details, 2) Connect payment processor, 3) Import product catalog, 4) Design first campaign, 5) Install chat widget. Progress saved automatically. Resume from Settings > Setup Wizard. Typical completion time: 15 minutes.""",
            ),
            (
                "Troubleshooting Guide",
                """# Troubleshooting Guide

## Common Errors
- **"Payment processor not connected"**: Go to Settings > Payments and complete Stripe Connect OAuth flow
- **"Campaign not sending"**: Check that the campaign is set to Active status and has valid recipient segments
- **"Widget not appearing"**: Verify the embed script is placed before the closing </body> tag and the domain matches workspace settings
- **"API rate limit exceeded"**: Reduce request frequency or upgrade plan. Current limits shown in Settings > Developers
- **"Abandoned cart conversion rate showing 0%"**: Install the tracking pixel on the order confirmation page. Code snippet available in Campaigns > Settings > Tracking

## Performance Issues
Slow dashboard loading: clear browser cache, check if date range is too large (max 90 days recommended). API timeouts: reduce batch size for bulk operations. Webhook failures: verify endpoint URL is HTTPS and responds within 5 seconds.

## Escalation Procedures
Level 1: Check this documentation and FAQ. Level 2: Contact support via chat widget or email support@payflow.io. Level 3: For billing disputes or account issues, email billing@payflow.io. Level 4: For security incidents, email security@payflow.io with subject "URGENT".""",
            ),
        ]

        total_chunks = 0
        for title, content in kb_documents:
            doc = await kb_service.add_document(db, kb_source.id, title, content)
            result = await db.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id)
            )
            total_chunks += len(result.all())

        print(f"Seeded workspace: demo")
        print(f"Seeded {len(tools)} tools")
        print(f"Seeded 2 flows: Refund Request, Account Deletion")
        print(f"Seeded KB: {len(kb_documents)} documents, {total_chunks} chunks")
        print(f"\nWorkspace ID: demo")
        print(f"Start the server and visit: http://localhost:8000/docs")


async def main():
    await seed()
    from app.database import engine
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
