"""ShopVibe Demo Backend — mock e-commerce APIs for AI agent tool testing."""
import copy
from datetime import datetime, timedelta
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="ShopVibe Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory data (resets on restart)
# ---------------------------------------------------------------------------

PLANS = {
    "basic": {"name": "Basic", "price": 9.99, "features": ["5 GB Storage", "Email Support", "Basic Analytics"]},
    "pro": {"name": "Pro", "price": 29.99, "features": ["50 GB Storage", "Priority Support", "Advanced Analytics", "API Access"]},
    "business": {"name": "Business", "price": 79.99, "features": ["Unlimited Storage", "24/7 Phone Support", "Custom Analytics", "API Access", "SSO", "Dedicated Manager"]},
}

PRODUCTS = [
    {"id": "PROD-001", "name": "Wireless Headphones", "price": 79.99, "category": "Electronics", "rating": 4.5, "image": "https://picsum.photos/seed/headphones/400/400"},
    {"id": "PROD-002", "name": "Laptop Stand", "price": 49.99, "category": "Accessories", "rating": 4.8, "image": "https://picsum.photos/seed/stand/400/400"},
    {"id": "PROD-003", "name": "Mechanical Keyboard", "price": 129.99, "category": "Electronics", "rating": 4.7, "image": "https://picsum.photos/seed/keyboard/400/400"},
    {"id": "PROD-004", "name": "USB-C Hub", "price": 39.99, "category": "Accessories", "rating": 4.3, "image": "https://picsum.photos/seed/hub/400/400"},
    {"id": "PROD-005", "name": "Webcam HD", "price": 69.99, "category": "Electronics", "rating": 4.4, "image": "https://picsum.photos/seed/webcam/400/400"},
    {"id": "PROD-006", "name": "Desk Lamp", "price": 34.99, "category": "Home Office", "rating": 4.6, "image": "https://picsum.photos/seed/lamp/400/400"},
    {"id": "PROD-007", "name": "Monitor Arm", "price": 89.99, "category": "Accessories", "rating": 4.5, "image": "https://picsum.photos/seed/arm/400/400"},
    {"id": "PROD-008", "name": "Noise-Canceling Earbuds", "price": 149.99, "category": "Electronics", "rating": 4.9, "image": "https://picsum.photos/seed/earbuds/400/400"},
    {"id": "PROD-009", "name": "Ergonomic Mouse", "price": 59.99, "category": "Accessories", "rating": 4.2, "image": "https://picsum.photos/seed/mouse/400/400"},
    {"id": "PROD-010", "name": "Cable Management Kit", "price": 19.99, "category": "Accessories", "rating": 4.1, "image": "https://picsum.photos/seed/cables/400/400"},
    {"id": "PROD-011", "name": "Portable Charger", "price": 29.99, "category": "Electronics", "rating": 4.3, "image": "https://picsum.photos/seed/charger/400/400"},
    {"id": "PROD-012", "name": "Desk Organizer", "price": 24.99, "category": "Home Office", "rating": 4.0, "image": "https://picsum.photos/seed/organizer/400/400"},
]

_CUSTOMERS = {
    "sarah@example.com": {
        "email": "sarah@example.com", "name": "Sarah Johnson", "status": "active",
        "plan": "pro", "joined": "2024-06-15",
        "address": "123 Main St, San Francisco, CA 94105",
        "phone": "+1 (555) 123-4567",
    },
    "mike@example.com": {
        "email": "mike@example.com", "name": "Mike Chen", "status": "locked",
        "plan": "business", "joined": "2023-11-20",
        "address": "456 Oak Ave, Portland, OR 97201",
        "phone": "+1 (555) 234-5678",
    },
    "emma@example.com": {
        "email": "emma@example.com", "name": "Emma Wilson", "status": "active",
        "plan": "basic", "joined": "2025-01-10",
        "address": "789 Pine Rd, Austin, TX 78701",
        "phone": "+1 (555) 345-6789",
    },
    "john@example.com": {
        "email": "john@example.com", "name": "John Davis", "status": "suspended",
        "plan": None, "joined": "2024-03-05",
        "address": "321 Elm St, Denver, CO 80201",
        "phone": "+1 (555) 456-7890",
    },
    "anna@example.com": {
        "email": "anna@example.com", "name": "Anna Kovalenko", "status": "active",
        "plan": "pro", "joined": "2024-09-01",
        "address": "12 Khreshchatyk St, Kyiv, 01001, Ukraine",
        "phone": "+380 (44) 123-4567",
    },
    "david@example.com": {
        "email": "david@example.com", "name": "David Brown", "status": "active",
        "plan": "business", "joined": "2023-08-12",
        "address": "555 Market St, Seattle, WA 98101",
        "phone": "+1 (555) 567-8901",
    },
    "lisa@example.com": {
        "email": "lisa@example.com", "name": "Lisa Taylor", "status": "active",
        "plan": None, "joined": "2025-03-01",
        "address": "888 Birch Ln, Miami, FL 33101",
        "phone": "+1 (555) 678-9012",
    },
    "alex@example.com": {
        "email": "alex@example.com", "name": "Alex Martinez", "status": "active",
        "plan": "pro", "joined": "2024-12-20",
        "address": "222 Cedar Dr, Chicago, IL 60601",
        "phone": "+1 (555) 789-0123",
    },
}

_ORDERS = {
    "ORD-1001": {
        "order_id": "ORD-1001", "customer_email": "sarah@example.com",
        "status": "delivered", "total": 159.98,
        "items": [
            {"product": "Wireless Headphones", "qty": 1, "price": 79.99},
            {"product": "Laptop Stand", "qty": 1, "price": 49.99},
            {"product": "Cable Management Kit", "qty": 1, "price": 19.99},
        ],
        "tracking": "1Z999AA10123456784", "carrier": "UPS",
        "placed": "2025-02-20", "delivered_date": "2025-02-25",
        "address": "123 Main St, San Francisco, CA 94105",
        "refundable": True,
    },
    "ORD-1002": {
        "order_id": "ORD-1002", "customer_email": "sarah@example.com",
        "status": "processing", "total": 129.99,
        "items": [{"product": "Mechanical Keyboard", "qty": 1, "price": 129.99}],
        "tracking": None, "carrier": None,
        "placed": "2025-03-12", "delivered_date": None,
        "address": "123 Main St, San Francisco, CA 94105",
        "refundable": False,
    },
    "ORD-1003": {
        "order_id": "ORD-1003", "customer_email": "sarah@example.com",
        "status": "shipped", "total": 69.99,
        "items": [{"product": "Webcam HD", "qty": 1, "price": 69.99}],
        "tracking": "9400111899223100001234", "carrier": "USPS",
        "placed": "2025-03-10", "delivered_date": None,
        "address": "123 Main St, San Francisco, CA 94105",
        "refundable": False,
    },
    "ORD-1004": {
        "order_id": "ORD-1004", "customer_email": "mike@example.com",
        "status": "shipped", "total": 89.99,
        "items": [{"product": "Monitor Arm", "qty": 1, "price": 89.99}],
        "tracking": "794644790132", "carrier": "FedEx",
        "placed": "2025-03-08", "delivered_date": None,
        "address": "456 Oak Ave, Portland, OR 97201",
        "refundable": False,
    },
    "ORD-1005": {
        "order_id": "ORD-1005", "customer_email": "emma@example.com",
        "status": "returned", "total": 149.99,
        "items": [{"product": "Noise-Canceling Earbuds", "qty": 1, "price": 149.99}],
        "tracking": "1Z999AA10123456790", "carrier": "UPS",
        "placed": "2025-02-01", "delivered_date": "2025-02-06",
        "address": "789 Pine Rd, Austin, TX 78701",
        "refundable": False,
    },
    "ORD-1006": {
        "order_id": "ORD-1006", "customer_email": "emma@example.com",
        "status": "delivered", "total": 34.99,
        "items": [{"product": "Desk Lamp", "qty": 1, "price": 34.99}],
        "tracking": "9400111899223100005678", "carrier": "USPS",
        "placed": "2025-03-01", "delivered_date": "2025-03-05",
        "address": "789 Pine Rd, Austin, TX 78701",
        "refundable": True,
    },
    "ORD-1007": {
        "order_id": "ORD-1007", "customer_email": "anna@example.com",
        "status": "delivered", "total": 109.98,
        "items": [
            {"product": "Ergonomic Mouse", "qty": 1, "price": 59.99},
            {"product": "Laptop Stand", "qty": 1, "price": 49.99},
        ],
        "tracking": "794644790145", "carrier": "FedEx",
        "placed": "2025-02-15", "delivered_date": "2025-02-22",
        "address": "12 Khreshchatyk St, Kyiv, 01001, Ukraine",
        "refundable": True,
    },
    "ORD-1008": {
        "order_id": "ORD-1008", "customer_email": "alex@example.com",
        "status": "processing", "total": 209.98,
        "items": [
            {"product": "Mechanical Keyboard", "qty": 1, "price": 129.99},
            {"product": "Wireless Headphones", "qty": 1, "price": 79.99},
        ],
        "tracking": None, "carrier": None,
        "placed": "2025-03-13", "delivered_date": None,
        "address": "222 Cedar Dr, Chicago, IL 60601",
        "refundable": False,
    },
    "ORD-1009": {
        "order_id": "ORD-1009", "customer_email": "david@example.com",
        "status": "delivered", "total": 79.99,
        "items": [{"product": "Wireless Headphones", "qty": 1, "price": 79.99}],
        "tracking": "1Z999AA10123456800", "carrier": "UPS",
        "placed": "2025-01-15", "delivered_date": "2025-01-20",
        "address": "555 Market St, Seattle, WA 98101",
        "refundable": True,
    },
    "ORD-1010": {
        "order_id": "ORD-1010", "customer_email": "david@example.com",
        "status": "delivered", "total": 59.99,
        "items": [{"product": "Ergonomic Mouse", "qty": 1, "price": 59.99}],
        "tracking": "9400111899223100009999", "carrier": "USPS",
        "placed": "2025-02-10", "delivered_date": "2025-02-14",
        "address": "555 Market St, Seattle, WA 98101",
        "refundable": True,
    },
    "ORD-1011": {
        "order_id": "ORD-1011", "customer_email": "david@example.com",
        "status": "shipped", "total": 149.99,
        "items": [{"product": "Noise-Canceling Earbuds", "qty": 1, "price": 149.99}],
        "tracking": "794644790160", "carrier": "FedEx",
        "placed": "2025-03-11", "delivered_date": None,
        "address": "555 Market St, Seattle, WA 98101",
        "refundable": False,
    },
    "ORD-1012": {
        "order_id": "ORD-1012", "customer_email": "david@example.com",
        "status": "cancelled", "total": 24.99,
        "items": [{"product": "Desk Organizer", "qty": 1, "price": 24.99}],
        "tracking": None, "carrier": None,
        "placed": "2025-03-05", "delivered_date": None,
        "address": "555 Market St, Seattle, WA 98101",
        "refundable": False,
    },
    "ORD-1013": {
        "order_id": "ORD-1013", "customer_email": "anna@example.com",
        "status": "processing", "total": 39.99,
        "items": [{"product": "USB-C Hub", "qty": 1, "price": 39.99}],
        "tracking": None, "carrier": None,
        "placed": "2025-03-14", "delivered_date": None,
        "address": "12 Khreshchatyk St, Kyiv, 01001, Ukraine",
        "refundable": False,
    },
    "ORD-1014": {
        "order_id": "ORD-1014", "customer_email": "lisa@example.com",
        "status": "delivered", "total": 29.99,
        "items": [{"product": "Portable Charger", "qty": 1, "price": 29.99}],
        "tracking": "1Z999AA10123456815", "carrier": "UPS",
        "placed": "2025-03-05", "delivered_date": "2025-03-10",
        "address": "888 Birch Ln, Miami, FL 33101",
        "refundable": True,
    },
    "ORD-1015": {
        "order_id": "ORD-1015", "customer_email": "alex@example.com",
        "status": "delivered", "total": 49.99,
        "items": [{"product": "Laptop Stand", "qty": 1, "price": 49.99}],
        "tracking": "9400111899223100012345", "carrier": "USPS",
        "placed": "2025-02-25", "delivered_date": "2025-03-01",
        "address": "222 Cedar Dr, Chicago, IL 60601",
        "refundable": True,
    },
}

# Simple passwords for demo login (pattern: {firstname_lower}123)
PASSWORDS = {
    "sarah@example.com": "sarah123",
    "mike@example.com": "mike123",
    "emma@example.com": "emma123",
    "john@example.com": "john123",
    "anna@example.com": "anna123",
    "david@example.com": "david123",
    "lisa@example.com": "lisa123",
    "alex@example.com": "alex123",
}

# Working copies (mutated at runtime)
customers = copy.deepcopy(_CUSTOMERS)
orders = copy.deepcopy(_ORDERS)


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if PASSWORDS.get(email) == password:
        customer = customers.get(email)
        return {"success": True, "customer": {"email": customer["email"], "name": customer["name"]}}

    return JSONResponse(status_code=401, content={"success": False, "error": "Invalid email or password"})


@app.get("/api/auth/me")
async def auth_me(email: str = Query(...)):
    customer = customers.get(email)
    if not customer:
        return JSONResponse(status_code=404, content={"success": False, "error": "Customer not found"})
    return {"success": True, "customer": {"email": customer["email"], "name": customer["name"]}}


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/lookup-customer")
async def lookup_customer(email: str = Query(...)):
    customer = customers.get(email)
    if not customer:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Customer not found: {email}"})

    customer_orders = [
        {"order_id": o["order_id"], "status": o["status"], "total": o["total"], "placed": o["placed"]}
        for o in orders.values() if o["customer_email"] == email
    ]

    plan_info = PLANS.get(customer["plan"]) if customer["plan"] else None

    return {
        "success": True,
        "customer": {
            "name": customer["name"],
            "email": customer["email"],
            "status": customer["status"],
            "phone": customer["phone"],
            "address": customer["address"],
            "member_since": customer["joined"],
            "subscription": {
                "plan": plan_info["name"] if plan_info else "No active subscription",
                "price": plan_info["price"] if plan_info else 0,
                "features": plan_info["features"] if plan_info else [],
            },
            "orders": customer_orders,
            "total_orders": len(customer_orders),
            "total_spent": sum(o["total"] for o in customer_orders),
        },
    }


@app.get("/api/order-status")
async def order_status(order_id: str = Query(...)):
    order = orders.get(order_id)
    if not order:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Order not found: {order_id}"})

    return {
        "success": True,
        "order": {
            "order_id": order["order_id"],
            "status": order["status"],
            "total": order["total"],
            "items": order["items"],
            "tracking_number": order["tracking"],
            "carrier": order["carrier"],
            "shipping_address": order["address"],
            "placed_date": order["placed"],
            "delivered_date": order["delivered_date"],
            "refundable": order["refundable"],
        },
    }


@app.post("/api/refund")
async def refund(request: Request):
    body = await request.json()
    order_id = body.get("order_id")
    amount = body.get("amount")
    reason = body.get("reason", "No reason provided")

    order = orders.get(order_id)
    if not order:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Order not found: {order_id}"})

    if not order["refundable"]:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Order {order_id} is not eligible for refund (status: {order['status']})",
        })

    if amount and float(amount) > order["total"]:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Refund amount ${amount} exceeds order total ${order['total']}",
        })

    refund_amount = float(amount) if amount else order["total"]
    refund_id = f"REF-{order_id.split('-')[1]}"

    # Mark order as no longer refundable
    orders[order_id]["refundable"] = False

    return {
        "success": True,
        "refund": {
            "refund_id": refund_id,
            "order_id": order_id,
            "amount": refund_amount,
            "reason": reason,
            "status": "processed",
            "estimated_arrival": "5-7 business days",
            "message": f"Refund of ${refund_amount:.2f} for order {order_id} has been processed.",
        },
    }


@app.post("/api/reset-password")
async def reset_password(request: Request):
    body = await request.json()
    email = body.get("email")

    customer = customers.get(email)
    if not customer:
        # Still return success for security (don't reveal if email exists)
        return {"success": True, "message": "If an account exists with that email, a password reset link has been sent."}

    return {
        "success": True,
        "message": f"Password reset link sent to {email}. The link expires in 24 hours.",
        "details": {
            "email": email,
            "expires_in": "24 hours",
            "name": customer["name"],
        },
    }


@app.post("/api/change-subscription")
async def change_subscription(request: Request):
    body = await request.json()
    customer_email = body.get("customer_email")
    new_plan = body.get("new_plan", "").lower()

    customer = customers.get(customer_email)
    if not customer:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Customer not found: {customer_email}"})

    if new_plan not in PLANS:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Invalid plan: {new_plan}. Available plans: basic, pro, business",
        })

    old_plan = customer["plan"]
    old_plan_info = PLANS.get(old_plan) if old_plan else None

    customers[customer_email]["plan"] = new_plan
    new_plan_info = PLANS[new_plan]

    return {
        "success": True,
        "subscription_change": {
            "customer": customer["name"],
            "previous_plan": old_plan_info["name"] if old_plan_info else "None",
            "new_plan": new_plan_info["name"],
            "new_price": new_plan_info["price"],
            "features": new_plan_info["features"],
            "effective": "immediately",
            "message": f"Subscription changed from {old_plan_info['name'] if old_plan_info else 'None'} to {new_plan_info['name']} (${new_plan_info['price']}/mo).",
        },
    }


@app.post("/api/cancel-subscription")
async def cancel_subscription(request: Request):
    body = await request.json()
    customer_email = body.get("customer_email")
    reason = body.get("reason", "No reason provided")

    customer = customers.get(customer_email)
    if not customer:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Customer not found: {customer_email}"})

    if not customer["plan"]:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Customer {customer_email} does not have an active subscription",
        })

    old_plan_info = PLANS[customer["plan"]]
    customers[customer_email]["plan"] = None

    return {
        "success": True,
        "cancellation": {
            "customer": customer["name"],
            "cancelled_plan": old_plan_info["name"],
            "reason": reason,
            "effective_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "message": f"{old_plan_info['name']} subscription cancelled. Access continues until end of current billing period.",
        },
    }


@app.post("/api/unlock-account")
async def unlock_account(request: Request):
    body = await request.json()
    email = body.get("email")

    customer = customers.get(email)
    if not customer:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Customer not found: {email}"})

    if customer["status"] not in ("locked", "suspended"):
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Account is not locked (current status: {customer['status']})",
        })

    old_status = customer["status"]
    customers[email]["status"] = "active"

    return {
        "success": True,
        "account_update": {
            "customer": customer["name"],
            "email": email,
            "previous_status": old_status,
            "new_status": "active",
            "message": f"Account for {customer['name']} ({email}) has been unlocked and is now active.",
        },
    }


@app.post("/api/update-address")
async def update_address(request: Request):
    body = await request.json()
    order_id = body.get("order_id")
    new_address = body.get("new_address")

    order = orders.get(order_id)
    if not order:
        return JSONResponse(status_code=404, content={"success": False, "error": f"Order not found: {order_id}"})

    if order["status"] != "processing":
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"Cannot update address for order {order_id} — status is '{order['status']}'. Only 'processing' orders can be updated.",
        })

    if not new_address:
        return JSONResponse(status_code=400, content={"success": False, "error": "new_address is required"})

    old_address = order["address"]
    orders[order_id]["address"] = new_address

    return {
        "success": True,
        "address_update": {
            "order_id": order_id,
            "previous_address": old_address,
            "new_address": new_address,
            "message": f"Shipping address for order {order_id} updated successfully.",
        },
    }


# Utility endpoints for the demo frontend
@app.get("/api/products")
async def list_products():
    return {"products": PRODUCTS}


@app.get("/api/customers")
async def list_customers():
    return {"customers": list(customers.values())}


@app.get("/api/customer-orders")
async def customer_orders(email: str = Query(...)):
    customer = customers.get(email)
    if not customer:
        return JSONResponse(status_code=404, content={"error": "Customer not found"})
    cust_orders = [o for o in orders.values() if o["customer_email"] == email]
    return {"customer": customer, "orders": cust_orders}


# ---------------------------------------------------------------------------
# Static files (must be LAST)
# ---------------------------------------------------------------------------
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
