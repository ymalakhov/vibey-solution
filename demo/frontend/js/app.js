/* ShopVibe Demo — navigation highlighting, auth helpers & widget helpers */

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getLoggedInUser() {
    try {
        var raw = localStorage.getItem('shopvibe_user');
        if (!raw) return null;
        var user = JSON.parse(raw);
        return (user && user.email) ? user : null;
    } catch (e) {
        return null;
    }
}

function requireAuth() {
    if (!getLoggedInUser()) {
        window.location.href = '/login.html';
    }
}

function logout() {
    localStorage.removeItem('shopvibe_user');
    window.location.href = '/login.html';
}

// ---------------------------------------------------------------------------
// Widget loader — injects widget script with logged-in user's email
// ---------------------------------------------------------------------------

(function () {
    var user = getLoggedInUser();
    var s = document.createElement('script');
    s.src = 'http://localhost:8000/widget/widget.js';
    s.setAttribute('data-workspace', 'demo');
    s.setAttribute('data-api', 'http://localhost:8000');
    if (user && user.email) {
        s.setAttribute('data-customer-email', user.email);
    }
    document.head.appendChild(s);
})();

// ---------------------------------------------------------------------------
// Nav setup (highlighting + user section)
// ---------------------------------------------------------------------------

(function () {
    // Highlight current nav link
    var path = window.location.pathname;
    document.querySelectorAll('nav a').forEach(function (a) {
        var href = a.getAttribute('href');
        if (href === '/' && path === '/') a.classList.add('active');
        else if (href !== '/' && path.startsWith(href)) a.classList.add('active');
    });

    // Populate #nav-user
    var navUser = document.getElementById('nav-user');
    if (navUser) {
        var user = getLoggedInUser();
        if (user) {
            navUser.innerHTML =
                '<span class="text-sm text-gray-700 font-medium">' + user.name + '</span>' +
                '<a href="#" onclick="logout(); return false;" class="text-sm text-violet-600 hover:text-violet-800 font-medium">Log out</a>';
        } else {
            navUser.innerHTML =
                '<a href="/login.html" class="text-sm text-violet-600 hover:text-violet-800 font-medium">Sign In</a>';
        }
    }
})();

/**
 * Open the chat widget and pre-fill a message.
 */
function openWidgetWithMessage(message) {
    var btn = document.getElementById('sai-widget-btn');
    if (btn) btn.click();

    setTimeout(function () {
        var input = document.querySelector('#sai-chat-input');
        if (input) {
            input.value = message;
            input.focus();
        }
    }, 400);
}

/**
 * Load orders for a given customer email and render them into #orders-body.
 */
function loadOrders(email) {
    var tbody = document.getElementById('orders-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Loading...</td></tr>';

    fetch('/api/customer-orders?email=' + encodeURIComponent(email))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.orders || data.orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">No orders found</td></tr>';
                return;
            }
            tbody.innerHTML = data.orders.map(function (o) {
                var statusClass = 'badge-' + o.status;
                return '<tr class="border-b border-gray-100">' +
                    '<td class="py-3 px-4 font-medium">' + o.order_id + '</td>' +
                    '<td class="py-3 px-4">' + o.items.map(function (i) { return i.product; }).join(', ') + '</td>' +
                    '<td class="py-3 px-4">$' + o.total.toFixed(2) + '</td>' +
                    '<td class="py-3 px-4"><span class="px-2 py-1 rounded-full text-xs font-medium ' + statusClass + '">' + o.status + '</span></td>' +
                    '<td class="py-3 px-4 text-gray-500 text-sm">' + o.placed + '</td>' +
                    '<td class="py-3 px-4"><button onclick="openWidgetWithMessage(\'I need help with order ' + o.order_id + '\')" class="text-violet-600 hover:text-violet-800 text-sm font-medium">Need Help?</button></td>' +
                    '</tr>';
            }).join('');
        })
        .catch(function () {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">Failed to load orders</td></tr>';
        });
}

/**
 * Load account info for a given customer email and render into account page elements.
 */
function loadAccount(email) {
    fetch('/api/customer-orders?email=' + encodeURIComponent(email))
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var c = data.customer;
            // Profile
            var el = function (id) { return document.getElementById(id); };
            if (el('acct-name')) el('acct-name').textContent = c.name;
            if (el('acct-email')) el('acct-email').textContent = c.email;
            if (el('acct-phone')) el('acct-phone').textContent = c.phone;
            if (el('acct-address')) el('acct-address').textContent = c.address;
            if (el('acct-joined')) el('acct-joined').textContent = 'Member since ' + c.joined;
            // Status
            if (el('acct-status')) {
                var badge = el('acct-status');
                badge.textContent = c.status;
                badge.className = 'px-2 py-1 rounded-full text-xs font-medium badge-' + c.status;
            }
            // Subscription
            if (el('acct-plan')) {
                if (c.plan) {
                    el('acct-plan').textContent = c.plan.charAt(0).toUpperCase() + c.plan.slice(1) + ' Plan';
                } else {
                    el('acct-plan').textContent = 'No active subscription';
                }
            }
        })
        .catch(function () {});
}
