const API = "http://127.0.0.1:5000";

let allPlaces = [];
let currentPlace = null;
let map = null;
let currentExperiences = [];

const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get("id");

/* =========================
UTILITY / HELPERS
========================= */

function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getEcoScore(type) {
    const scores = {
        Trek: "9/10",
        Nature: "10/10",
        "Hill Station": "8/10",
        Cultural: "7/10",
        Religious: "7/10",
        Beach: "8/10",
        Historical: "7/10",
        Fort: "9/10"
    };
    return scores[type] || "8/10";
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* =========================
TOAST NOTIFICATION
========================= */

function showToast(message, type = "success") {
    const oldToast = document.getElementById("ecoToast");
    if (oldToast) oldToast.remove();

    const toast = document.createElement("div");
    toast.id = "ecoToast";
    toast.className = "eco-toast " + type;

    const icon = type === "success" ? "✓" : "⚠";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span>${escapeHTML(message)}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

/* =========================================================
AUTH STATE (real backend-issued JWT, not fake localStorage auth)
========================================================= */

function getToken() { return localStorage.getItem("authToken"); }
function getRole() { return localStorage.getItem("role") || "traveller"; }
function getUsername() { return localStorage.getItem("loggedInUser"); }
function getName() { return localStorage.getItem("userName") || ""; }
function isLoggedIn() { return !!getToken(); }

function authHeader() {
    const token = getToken();
    return token ? { "Authorization": "Bearer " + token } : {};
}

function setSession(data) {
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("role", data.role || "traveller");
    localStorage.setItem("loggedInUser", data.username || "");
    localStorage.setItem("userName", data.name || "");
    if (data.role === "partner") {
        localStorage.setItem("partnerStatus", data.partnerStatus || "Pending");
    } else {
        localStorage.removeItem("partnerStatus");
    }
}

function getPartnerStatus() { return localStorage.getItem("partnerStatus") || "Pending"; }

function logout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("role");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("userName");
    localStorage.removeItem("partnerStatus");
    showToast("Logged out successfully");
    setTimeout(() => { window.location.href = "index.html"; }, 800);
}

// Shows/hides nav links that only apply to a given role. Safe to call on every page.
function applyRoleNav() {
    const role = getRole();
    const loggedIn = isLoggedIn();

    document.querySelectorAll("#navPartnerLink").forEach(el => {
        el.style.display = (loggedIn && role === "partner") ? "" : "none";
    });

    document.querySelectorAll("#navAdminLink").forEach(el => {
        el.style.display = (loggedIn && role === "admin") ? "" : "none";
    });
}

// Call at the top of a role-restricted page. Redirects (client-side convenience only —
// the backend independently re-checks the role on every protected API call, since a
// user could edit localStorage directly).
function guardPage(requiredRoles, redirectTo = "login.html") {
    if (!isLoggedIn()) {
        window.location.href = redirectTo;
        return false;
    }
    if (!requiredRoles.includes(getRole())) {
        window.location.href = "index.html";
        return false;
    }
    return true;
}

async function apiFetch(path, options = {}) {
    const response = await fetch(API + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeader(),
            ...(options.headers || {})
        }
    });

    let data = null;
    try { data = await response.json(); } catch (e) { /* no body */ }

    if (!response.ok) {
        const message = (data && data.error) ? data.error : `Request failed (${response.status})`;
        throw new Error(message);
    }

    return data;
}

/* =========================================================
PAGE LOAD ORCHESTRATION
========================================================= */

window.addEventListener("load", function () {
    applyRoleNav();

    if (document.getElementById("places")) fetchPlaces();
    if (document.getElementById("placeDetails")) loadDestination();
    if (document.getElementById("myTripsBox") || document.getElementById("profileContainer")) loadProfile();
    if (document.getElementById("reservationsContainer")) loadMyReservations();
    if (document.getElementById("savedContainer")) loadSavedList();
    if (document.getElementById("partnerApp")) loadPartnerDashboard();
    if (document.getElementById("adminBox")) loadAdminDashboard();
});

/* =========================================================
LOAD PLACES
========================================================= */

function fetchPlaces() {
    fetch(API + "/places")
        .then(response => {
            if (!response.ok) throw new Error("Unable to load places");
            return response.json();
        })
        .then(data => {
            allPlaces = Array.isArray(data) ? data : [];
            render(allPlaces);
            loadMap();
        })
        .catch(error => {
            console.error(error);
            const box = document.getElementById("places");
            if (box) {
                box.innerHTML = `
                    <div class="empty-state">
                        <h3>Unable to load destinations</h3>
                        <p>Please make sure the backend server is running.</p>
                    </div>
                `;
            }
        });
}

/* =========================
SEARCH
========================= */

function searchPlaces() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    const value = input.value.trim().toLowerCase();

    if (value === "") {
        render(allPlaces);
        return;
    }

    const filtered = allPlaces.filter(place => (
        (place.name && place.name.toLowerCase().includes(value)) ||
        (place.type && place.type.toLowerCase().includes(value)) ||
        (place.difficulty && place.difficulty.toLowerCase().includes(value)) ||
        (place.description && place.description.toLowerCase().includes(value)) ||
        (place.location && place.location.toLowerCase().includes(value))
    ));

    render(filtered);
}

/* =========================
RENDER DESTINATIONS
========================= */

function render(data) {
    const box = document.getElementById("places");
    if (!box) return;

    if (!data || data.length === 0) {
        box.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🌿</div>
                <h3>No destinations found</h3>
                <p>Try another search or select a different category.</p>
            </div>
        `;
        return;
    }

    box.innerHTML = data.map(place => {
        const image = place.image ||
            "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80";

        return `
            <article class="destination-card">
                <img src="${image}" alt="${escapeHTML(place.name || "Destination")}" loading="lazy">
                <div class="destination-content">
                    <span class="destination-type">${escapeHTML(place.type || "Travel")}</span>
                    <h3>${escapeHTML(place.name || "Unnamed Destination")}</h3>
                    <p class="destination-location">📍 ${escapeHTML(place.location || "India")}</p>
                    <p class="destination-description">
                        ${escapeHTML(place.description || "Explore this sustainable destination.")}
                    </p>
                    <div class="destination-meta">
                        <span>${escapeHTML(place.difficulty || "Easy")}</span>
                        <span>Eco: ${getEcoScore(place.type)}</span>
                    </div>
                    <a class="details-btn" href="destination.html?id=${place._id}">
                        View Destination <span>→</span>
                    </a>
                </div>
            </article>
        `;
    }).join("");
}

/* =========================
FILTER
========================= */

function filterType(type) {
    if (type === "All") {
        render(allPlaces);
        setActiveFilter("All");
        return;
    }

    const filtered = allPlaces.filter(place => place.type && place.type.toLowerCase() === type.toLowerCase());
    render(filtered);
    setActiveFilter(type);
}

function setActiveFilter(type) {
    const buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(button => {
        const text = button.textContent.toLowerCase();
        if (type === "All" && text.includes("all")) {
            button.classList.add("active");
        } else if (type !== "All" && text.includes(type.toLowerCase())) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });
}

/* =========================
DESTINATION PAGE
========================= */

function loadDestination() {
    const detailsBox = document.getElementById("placeDetails");
    if (!detailsBox || !id) return;

    fetch(API + "/places")
        .then(response => {
            if (!response.ok) throw new Error("Unable to load destination");
            return response.json();
        })
        .then(data => {
            allPlaces = Array.isArray(data) ? data : [];
            currentPlace = allPlaces.find(place => String(place._id) === String(id));

            if (!currentPlace) {
                detailsBox.innerHTML = `
                    <div class="empty-state">
                        <h3>Destination not found</h3>
                        <p>The destination may have been removed.</p>
                    </div>
                `;
                return;
            }

            renderDestination();
            loadMap();
            loadReviews();
            loadExperiences();
            updateSaveLaterButton();
        })
        .catch(error => {
            console.error(error);
            detailsBox.innerHTML = `
                <div class="empty-state">
                    <h3>Unable to load destination</h3>
                    <p>Please check that your backend is running.</p>
                </div>
            `;
        });
}

/* =========================
DESTINATION DETAILS
========================= */

function renderDestination() {
    const box = document.getElementById("placeDetails");
    if (!box || !currentPlace) return;

    const image = currentPlace.image ||
        "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=80";

    box.innerHTML = `
        <div class="destination-detail-card">
            <div class="destination-detail-image">
                <img src="${image}" alt="${escapeHTML(currentPlace.name)}" loading="lazy">
                <div class="detail-image-scrim">
                    <span class="detail-badge">${escapeHTML(currentPlace.type || "Travel")}</span>
                    <h1>${escapeHTML(currentPlace.name)}</h1>
                    <p class="destination-location">📍 ${escapeHTML(currentPlace.location || "Maharashtra")}</p>
                </div>
            </div>
            <div class="destination-detail-content">
                <p class="eyebrow">ECO DESTINATION</p>
                <p class="destination-description">${escapeHTML(currentPlace.description || "")}</p>
                <div class="destination-meta detail-meta">
                    <span>🥾 ${escapeHTML(currentPlace.difficulty || "Easy")}</span>
                    <span>🌱 Eco Score: ${getEcoScore(currentPlace.type)}</span>
                </div>
            </div>
        </div>
    `;

    const travelBox = document.getElementById("travelInfo");
    if (travelBox) {
        const todo = Array.isArray(currentPlace.thingsToDo) ? currentPlace.thingsToDo : [];

        travelBox.innerHTML = `
            <div class="best-time-row">
                <span>📅 Best time to visit</span>
                <strong>${escapeHTML(currentPlace.bestTime || "Year-round")}</strong>
            </div>
            ${todo.length ? `
                <ul class="todo-list">
                    ${todo.map(t => `<li>${escapeHTML(t)}</li>`).join("")}
                </ul>
            ` : `<p class="muted">Things-to-do details coming soon for this destination.</p>`}
        `;
    }
}

/* =========================================================
HOW TO REACH / DIRECTIONS
========================================================= */

function buildMapsUrl() {
    if (!currentPlace) return null;

    if (currentPlace.lat && currentPlace.lng) {
        return `https://www.google.com/maps/dir/?api=1&destination=${currentPlace.lat},${currentPlace.lng}`;
    }

    const query = [currentPlace.name, currentPlace.location, "Maharashtra"].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDirections() {
    const reachInfo = document.getElementById("reachInfo");
    const reachBtn = document.getElementById("reachBtn");
    const mapsUrl = buildMapsUrl();

    if (!currentPlace || !mapsUrl) return;

    if (!navigator.geolocation || !currentPlace.lat || !currentPlace.lng) {
        window.open(mapsUrl, "_blank", "noopener");
        return;
    }

    if (reachBtn) { reachBtn.disabled = true; reachBtn.textContent = "Locating you..."; }

    navigator.geolocation.getCurrentPosition(
        position => {
            const distance = haversineKm(position.coords.latitude, position.coords.longitude, currentPlace.lat, currentPlace.lng);
            if (reachInfo) reachInfo.innerHTML = `You're approximately <strong>${distance.toFixed(1)} km</strong> from ${escapeHTML(currentPlace.name)} as the crow flies. Opening turn-by-turn directions...`;
            if (reachBtn) { reachBtn.disabled = false; reachBtn.textContent = "Open Directions →"; }
            window.open(mapsUrl, "_blank", "noopener");
        },
        () => {
            if (reachInfo) reachInfo.textContent = "Couldn't access your location, but you can still get directions below.";
            if (reachBtn) { reachBtn.disabled = false; reachBtn.textContent = "Open Directions →"; }
            window.open(mapsUrl, "_blank", "noopener");
        },
        { timeout: 8000 }
    );
}

/* =========================================================
MAP
========================================================= */

function loadMap() {
    const mapBox = document.getElementById("map");
    if (!mapBox || typeof L === "undefined") return;

    if (map) { map.remove(); map = null; }

    map = L.map("map").setView([19.0, 75.5], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    if (currentPlace && currentPlace.lat && currentPlace.lng) {
        L.marker([currentPlace.lat, currentPlace.lng]).addTo(map).bindPopup(`<b>${escapeHTML(currentPlace.name)}</b>`);
        map.setView([currentPlace.lat, currentPlace.lng], 10);
    } else if (allPlaces.length > 0) {
        allPlaces.forEach(place => {
            if (place.lat && place.lng) {
                L.marker([place.lat, place.lng]).addTo(map).bindPopup(`<b>${escapeHTML(place.name)}</b>`);
            }
        });
    }
}

/* =========================================================
SAVE FOR LATER (wishlist — localStorage, per TRIP PLANNING spec)
========================================================= */

function getSavedList() {
    return JSON.parse(localStorage.getItem("savedPlaces")) || [];
}

function isSaved(placeId) {
    return getSavedList().some(p => p.id === placeId);
}

function toggleSaveForLater() {
    if (!currentPlace) return;

    let saved = getSavedList();
    const existingIndex = saved.findIndex(p => p.id === currentPlace._id);

    if (existingIndex > -1) {
        saved.splice(existingIndex, 1);
        showToast("Removed from your saved list");
    } else {
        saved.push({ id: currentPlace._id, name: currentPlace.name, image: currentPlace.image, location: currentPlace.location });
        showToast("Saved for later — view it in Plan Trip");
    }

    localStorage.setItem("savedPlaces", JSON.stringify(saved));
    updateSaveLaterButton();
}

function updateSaveLaterButton() {
    const btn = document.getElementById("saveLaterBtn");
    if (!btn || !currentPlace) return;
    btn.innerHTML = isSaved(currentPlace._id) ? "★ Saved" : "☆ Save for Later";
    btn.classList.toggle("saved", isSaved(currentPlace._id));
}

function loadSavedList() {
    const box = document.getElementById("savedContainer");
    if (!box) return;

    const saved = getSavedList();

    if (!saved.length) {
        box.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧭</div>
                <h3>Nothing saved yet</h3>
                <p>Browse destinations and tap "Save for Later" to plan your trip.</p>
            </div>
        `;
        return;
    }

    box.innerHTML = saved.map(p => `
        <article class="destination-card saved-card">
            <img src="${p.image || ''}" alt="${escapeHTML(p.name)}" loading="lazy">
            <div class="destination-content">
                <h3>${escapeHTML(p.name)}</h3>
                <p class="destination-location">📍 ${escapeHTML(p.location || "Maharashtra")}</p>
                <div class="saved-actions">
                    <a class="details-btn" href="destination.html?id=${p.id}">View →</a>
                    <button class="remove-trip" onclick="removeSaved('${p.id}')">Remove</button>
                </div>
            </div>
        </article>
    `).join("");
}

function removeSaved(placeId) {
    let saved = getSavedList().filter(p => p.id !== placeId);
    localStorage.setItem("savedPlaces", JSON.stringify(saved));
    loadSavedList();
}

/* =========================================================
MARKETPLACE — PARTNERS & EXPERIENCES
========================================================= */

function loadExperiences() {
    const box = document.getElementById("experiencesContainer");
    if (!box || !currentPlace) return;

    fetch(API + "/experiences?destinationId=" + currentPlace._id)
        .then(res => res.json())
        .then(data => {
            currentExperiences = Array.isArray(data) ? data : [];
            renderExperiences();
        })
        .catch(() => {
            box.innerHTML = `<div class="empty-state"><p>Unable to load partner experiences right now.</p></div>`;
        });
}

function renderExperiences() {
    const box = document.getElementById("experiencesContainer");
    if (!box) return;

    if (!currentExperiences.length) {
        box.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧳</div>
                <h3>No partner experiences listed yet</h3>
                <p>Tourism partners haven't added packages for this destination yet. Check back soon.</p>
            </div>
        `;
        return;
    }

    box.innerHTML = `
        <div class="experience-grid">
            ${currentExperiences.map(exp => experienceCardHTML(exp)).join("")}
        </div>
    `;
}

function experienceCardHTML(exp) {
    const partnerName = exp.partnerId ? escapeHTML(exp.partnerId.businessName) : "Tourism Partner";
    const isDemo = exp.partnerId && exp.partnerId.isDemo;
    const dates = Array.isArray(exp.availableDates) ? exp.availableDates : [];

    return `
        <div class="experience-card">
            <div class="experience-top">
                <div>
                    <p class="experience-partner">${partnerName} ${isDemo ? '<span class="demo-tag">DEMO</span>' : ""}</p>
                    <h3>${escapeHTML(exp.name)}</h3>
                </div>
                <div class="experience-rating">⭐ ${Number(exp.rating || 4.5).toFixed(1)}</div>
            </div>

            <p class="experience-desc">${escapeHTML(exp.description || "")}</p>

            <div class="experience-meta">
                <span>⏱ ${escapeHTML(exp.duration || "1 Day")}</span>
                <span>🥾 ${escapeHTML(exp.difficulty || "Easy")}</span>
                <span>👥 ${exp.capacity || "—"} seats</span>
            </div>

            ${Array.isArray(exp.included) && exp.included.length ? `
                <ul class="experience-included">
                    ${exp.included.map(i => `<li>${escapeHTML(i)}</li>`).join("")}
                </ul>
            ` : ""}

            <div class="experience-price-row">
                <strong>₹${Number(exp.price).toLocaleString("en-IN")}</strong>
                <span>per traveller</span>
            </div>

            <button class="details-btn experience-reserve-btn" onclick="toggleReserveForm('${exp._id}')">
                Reserve Now
            </button>

            <form class="reserve-inline-form" id="reserveForm-${exp._id}" style="display:none" onsubmit="submitReservation(event, '${exp._id}')">

                <div class="reserve-field">
                    <label>Select Date</label>
                    <select id="resDate-${exp._id}" required>
                        ${dates.length
                            ? dates.map(d => `<option value="${d}">${formatDate(d)}</option>`).join("")
                            : `<option value="">No dates available</option>`}
                    </select>
                </div>

                <div class="reserve-field">
                    <label>Travellers</label>
                    <input type="number" id="resPeople-${exp._id}" min="1" max="${exp.capacity || 20}" value="1" required>
                </div>

                <div class="reserve-field">
                    <label>Phone (optional)</label>
                    <input type="tel" id="resPhone-${exp._id}" placeholder="+91">
                </div>

                <div id="resError-${exp._id}" class="auth-error-msg"></div>

                <button type="submit" class="primary-btn">Submit Reservation Request</button>
            </form>
        </div>
    `;
}

function toggleReserveForm(expId) {
    if (!isLoggedIn()) {
        showToast("Please log in as a traveller to reserve", "error");
        setTimeout(() => { window.location.href = "login.html"; }, 1200);
        return;
    }

    if (getRole() !== "traveller") {
        showToast("Only traveller accounts can submit reservations", "error");
        return;
    }

    const form = document.getElementById("reserveForm-" + expId);
    if (!form) return;
    form.style.display = form.style.display === "none" ? "flex" : "none";
}

function submitReservation(event, expId) {
    event.preventDefault();

    const errorBox = document.getElementById("resError-" + expId);
    if (errorBox) errorBox.textContent = "";

    const date = document.getElementById("resDate-" + expId).value;
    const travellers = document.getElementById("resPeople-" + expId).value;
    const phone = document.getElementById("resPhone-" + expId).value;

    if (!date) {
        if (errorBox) errorBox.textContent = "This experience has no available dates right now.";
        return;
    }

    apiFetch("/reservations", {
        method: "POST",
        body: JSON.stringify({ experienceId: expId, date, travellers, phone })
    })
    .then(() => {
        showToast("Reservation request sent! Track its status under My Reservations.");
        const form = document.getElementById("reserveForm-" + expId);
        if (form) form.style.display = "none";
    })
    .catch(err => {
        if (errorBox) errorBox.textContent = err.message;
    });
}

/* =========================================================
REVIEWS
========================================================= */

function loadReviews() {
    const box = document.getElementById("reviewContainer");
    if (!box || !currentPlace) return;

    box.innerHTML = `<p class="muted">Loading reviews...</p>`;

    fetch(API + "/reviews/" + currentPlace._id)
        .then(res => res.json())
        .then(data => renderReviews(Array.isArray(data) ? data : []))
        .catch(() => {
            box.innerHTML = `<p class="muted">Unable to load reviews right now.</p>`;
        });

    const userInput = document.getElementById("reviewUser");
    if (userInput && getName()) userInput.value = getName();
}

function renderReviews(reviews) {
    const box = document.getElementById("reviewContainer");
    if (!box) return;

    if (!reviews.length) {
        box.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>No reviews yet</h3>
                <p>Be the first to share your experience.</p>
            </div>
        `;
        return;
    }

    box.innerHTML = reviews.slice().reverse().map(r => `
        <div class="review-card">
            <div class="review-card-top">
                <strong>${escapeHTML(r.username || "Traveller")}</strong>
                <span class="review-stars">${"★".repeat(Number(r.rating) || 0)}${"☆".repeat(5 - (Number(r.rating) || 0))}</span>
            </div>
            <p>${escapeHTML(r.comment || "")}</p>
        </div>
    `).join("");
}

function addReview(event) {
    event.preventDefault();

    const errorBox = document.getElementById("reviewError");
    if (errorBox) errorBox.textContent = "";

    if (!isLoggedIn()) {
        if (errorBox) errorBox.textContent = "Please log in to submit a review.";
        return;
    }

    const username = document.getElementById("reviewUser").value.trim() || getName() || getUsername();
    const rating = document.getElementById("rating").value;
    const comment = document.getElementById("comment").value.trim();

    if (!comment) {
        if (errorBox) errorBox.textContent = "Please write a short comment.";
        return;
    }

    fetch(API + "/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: currentPlace._id, username, rating, comment })
    })
    .then(res => res.json())
    .then(() => {
        document.getElementById("comment").value = "";
        showToast("Review submitted — thank you!");
        loadReviews();
    })
    .catch(() => {
        if (errorBox) errorBox.textContent = "Could not submit review. Please try again.";
    });
}

/* =========================================================
AUTHENTICATION  (talks to the real backend)
========================================================= */

function showAuthError(message) {
    const errorBox = document.getElementById("authError") || document.getElementById("loginError");
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.add("show");
    }
}

function clearAuthError() {
    const errorBox = document.getElementById("authError") || document.getElementById("loginError");
    if (errorBox) {
        errorBox.textContent = "";
        errorBox.classList.remove("show");
    }
}

// Traveller login/signup always lands on the Home page (not Profile — Profile stays
// reachable from the nav). Partner always goes to the Partner Dashboard route, but that
// page itself decides whether to show the real dashboard or an Application Pending /
// Rejected screen, based on their approval status.
function redirectByRole(role) {
    if (role === "admin") window.location.href = "admin.html";
    else if (role === "partner") window.location.href = "partner.html";
    else window.location.href = "index.html";
}

function login(event) {
    if (event) event.preventDefault();
    clearAuthError();

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const username = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!username || !username.includes("@")) {
        showAuthError("Please enter a valid email address.");
        return;
    }
    if (!password) {
        showAuthError("Please enter your password.");
        return;
    }

    fetch(API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            showAuthError(data.error || "Login failed. Please check your details.");
            return;
        }

        setSession(data);
        showToast("Logged in successfully!");
        setTimeout(() => redirectByRole(data.role), 800);
    })
    .catch(() => {
        showAuthError("Unable to reach the server. Please make sure the backend is running.");
    });
}

function signup(event) {
    if (event) event.preventDefault();
    clearAuthError();

    const nameInput = document.getElementById("signupName");
    const emailInput = document.getElementById("signupEmail");
    const passwordInput = document.getElementById("signupPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const roleInput = document.querySelector('input[name="signupRole"]:checked');
    const businessNameInput = document.getElementById("businessName");
    const businessPhoneInput = document.getElementById("businessPhone");
    const businessLocationInput = document.getElementById("businessLocation");
    const businessDescriptionInput = document.getElementById("businessDescription");

    const name = nameInput ? nameInput.value.trim() : "";
    const username = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";
    // "admin" is never a selectable option in this form — the role toggle only ever
    // offers traveller/partner, and the backend independently rejects anything else.
    const role = roleInput ? roleInput.value : "traveller";
    const businessName = businessNameInput ? businessNameInput.value.trim() : "";
    const businessPhone = businessPhoneInput ? businessPhoneInput.value.trim() : "";
    const businessLocation = businessLocationInput ? businessLocationInput.value.trim() : "";
    const businessDescription = businessDescriptionInput ? businessDescriptionInput.value.trim() : "";

    if (!name || name.length < 2) {
        showAuthError("Please enter your full name.");
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
        showAuthError("Please enter a valid email address (e.g. name@domain.com).");
        return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password)) {
        showAuthError("Password must have at least 8 characters, 1 uppercase letter, 1 number, and 1 special character (@$!%*?&), and no spaces.");
        return;
    }
    if (password !== confirmPassword) {
        showAuthError("Passwords do not match. Please check again.");
        return;
    }
    if (role === "partner") {
        if (businessName.length < 2) {
            showAuthError("Please enter your business/agency name to register as a partner.");
            return;
        }
        if (businessPhone.length < 6) {
            showAuthError("Please enter a business phone number.");
            return;
        }
        if (businessLocation.length < 2) {
            showAuthError("Please enter where your business operates.");
            return;
        }
    }

    fetch(API + "/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username, password, name, role,
            businessName, businessPhone, businessLocation, businessDescription
        })
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            showAuthError(data.error || "Signup failed. Please try again.");
            return;
        }

        setSession(data);

        if (data.role === "partner") {
            showToast("Application submitted! You can log in, but the dashboard unlocks after admin approval.");
        } else {
            showToast("Account created successfully!");
        }

        setTimeout(() => redirectByRole(data.role), 1400);
    })
    .catch(() => {
        showAuthError("Unable to reach the server. Please make sure the backend is running.");
    });
}

/* =========================================================
PROFILE PAGE
========================================================= */

function loadProfile() {
    const box = document.getElementById("myTripsBox") || document.getElementById("profileContainer");
    if (!box) return;

    if (!isLoggedIn()) {
        box.innerHTML = `
            <div class="empty-state-box">
                <p>Please <a href="login.html" style="color:#163d2e;font-weight:bold;">Login</a> to view your profile.</p>
            </div>
        `;
        return;
    }

    const username = getUsername();
    const name = getName() || username.split("@")[0];
    const role = getRole();
    const saved = getSavedList();

    box.className = "dashboard-page";
    box.innerHTML = `
        <div class="dashboard-header">
            <div class="user-profile-meta">
                <div class="user-avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div>
                <div>
                    <h2 style="margin:0;color:#163d2e;">Welcome back, ${escapeHTML(name)}!</h2>
                    <p style="margin:4px 0 0;color:#68756f;font-size:14px;">
                        📍 ${escapeHTML(role.charAt(0).toUpperCase() + role.slice(1))} Account | ${escapeHTML(username)}
                    </p>
                </div>
            </div>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">🧾</div>
                <div>
                    <div class="stat-label">My Reservations</div>
                    <div class="stat-value" id="profileReservationCount">—</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div>
                    <div class="stat-label">Saved Destinations</div>
                    <div class="stat-value">${saved.length}</div>
                </div>
            </div>
        </div>

        <div class="section-card">
            <h3 style="margin-top:0;color:#163d2e;border-bottom:1px solid #e1ebe5;padding-bottom:15px;margin-bottom:20px;">
                Quick Links
            </h3>
            <div class="profile-grid">
                <a class="profile-card" href="reservations.html">
                    <div class="card-icon">🧾</div>
                    <h2>My Reservations</h2>
                    <p class="muted">Track pending, confirmed and rejected requests.</p>
                </a>
                <a class="profile-card" href="trips.html">
                    <div class="card-icon">🧳</div>
                    <h2>Plan Trip</h2>
                    <p class="muted">Destinations you've saved for later.</p>
                </a>
                ${role === "partner" ? `
                <a class="profile-card" href="partner.html">
                    <div class="card-icon">🏕️</div>
                    <h2>Partner Dashboard</h2>
                    <p class="muted">Manage your experiences and reservation requests.</p>
                </a>` : ""}
                ${role === "admin" ? `
                <a class="profile-card" href="admin.html">
                    <div class="card-icon">🛡️</div>
                    <h2>Admin Dashboard</h2>
                    <p class="muted">Approve partners and monitor the platform.</p>
                </a>` : ""}
            </div>
        </div>
    `;

    if (role === "traveller") {
        apiFetch("/reservations/mine")
            .then(list => {
                const countEl = document.getElementById("profileReservationCount");
                if (countEl) countEl.textContent = Array.isArray(list) ? list.length : 0;
            })
            .catch(() => {});
    } else {
        const countEl = document.getElementById("profileReservationCount");
        if (countEl) countEl.textContent = "—";
    }
}

/* =========================================================
MY RESERVATIONS (traveller)
========================================================= */

function loadMyReservations() {
    const box = document.getElementById("reservationsContainer");
    if (!box) return;

    if (!guardPage(["traveller"])) return;

    box.innerHTML = `<div class="loading-card">Loading your reservations...</div>`;

    apiFetch("/reservations/mine")
        .then(list => renderMyReservations(Array.isArray(list) ? list : []))
        .catch(err => {
            box.innerHTML = `
                <div class="empty-state">
                    <h3>Unable to load reservations</h3>
                    <p>${escapeHTML(err.message)}</p>
                </div>
            `;
        });
}

function renderMyReservations(list) {
    const box = document.getElementById("reservationsContainer");
    if (!box) return;

    if (!list.length) {
        box.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧾</div>
                <h3>No reservations yet</h3>
                <p>Browse destinations and reserve an experience to see it here.</p>
                <a class="explore-btn" href="index.html#destinations" style="margin-top:14px;display:inline-block;">Explore Destinations</a>
            </div>
        `;
        return;
    }

    box.innerHTML = list.map(r => `
        <div class="trip-card">
            <div class="trip-card-top">
                <div>
                    <span class="trip-label">#${String(r._id).slice(-6).toUpperCase()} · ${formatDate(r.createdAt)}</span>
                    <h2>${escapeHTML(r.destinationId ? r.destinationId.name : "Destination")}</h2>
                </div>
                <span class="status status-${r.status.toLowerCase()}">${escapeHTML(r.status)}</span>
            </div>
            <div class="trip-details">
                <div><span>🏕️</span><div><small>Partner</small><strong>${escapeHTML(r.partnerId ? r.partnerId.businessName : "—")}</strong></div></div>
                <div><span>🎒</span><div><small>Experience</small><strong>${escapeHTML(r.experienceId ? r.experienceId.name : "—")}</strong></div></div>
                <div><span>📅</span><div><small>Date</small><strong>${formatDate(r.date)}</strong></div></div>
                <div><span>👥</span><div><small>Travellers</small><strong>${r.travellers}</strong></div></div>
                <div><span>💰</span><div><small>Total</small><strong>₹${Number(r.price).toLocaleString("en-IN")}</strong></div></div>
            </div>
            ${["Pending", "Confirmed"].includes(r.status) ? `
            <div class="trip-footer">
                <span>Requested ${formatDate(r.createdAt)}</span>
                <button class="remove-trip" onclick="cancelReservation('${r._id}')">Cancel</button>
            </div>` : ""}
        </div>
    `).join("");
}

function cancelReservation(resId) {
    apiFetch(`/reservations/${resId}/cancel`, { method: "PUT" })
        .then(() => {
            showToast("Reservation cancelled");
            loadMyReservations();
        })
        .catch(err => showToast(err.message, "error"));
}

/* =========================================================
PARTNER DASHBOARD
========================================================= */

let partnerProfile = null;
let partnerDestinationsCache = [];

function loadPartnerDashboard() {
    if (!guardPage(["partner"])) return;

    apiFetch("/partners/me")
        .then(partner => {
            partnerProfile = partner;
            localStorage.setItem("partnerStatus", partner.status);

            // Dashboard access is gated on approval status, not just a banner —
            // Pending/Rejected partners see a status-only screen, nothing else.
            if (partner.status !== "Approved") {
                renderPartnerStatusScreen();
                return;
            }

            return fetch(API + "/places").then(r => r.json()).then(places => {
                partnerDestinationsCache = Array.isArray(places) ? places : [];
                renderPartnerShell();
                loadPartnerExperiences();
                loadPartnerReservations();
            });
        })
        .catch(err => {
            document.getElementById("partnerApp").innerHTML = `
                <div class="empty-state"><h3>Unable to load partner dashboard</h3><p>${escapeHTML(err.message)}</p></div>
            `;
        });
}

// Shown instead of the dashboard for Pending/Rejected partners. No experience form,
// no reservations list, no API calls that would fail anyway — just the status.
function renderPartnerStatusScreen() {
    const app = document.getElementById("partnerApp");
    if (!app || !partnerProfile) return;

    const isPending = partnerProfile.status === "Pending";

    app.innerHTML = `
        <div class="dashboard-header">
            <div class="user-profile-meta">
                <div class="user-avatar">${escapeHTML((partnerProfile.businessName || "P").charAt(0).toUpperCase())}</div>
                <div>
                    <h2 style="margin:0;color:white;">${escapeHTML(partnerProfile.businessName)}</h2>
                    <p style="margin:4px 0 0;color:#d9ece1;font-size:14px;">${escapeHTML(partnerProfile.email)}</p>
                </div>
            </div>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>

        <div class="partner-status-screen">
            <div class="partner-status-icon">${isPending ? "⏳" : "🚫"}</div>
            <h2>${isPending ? "Application Pending" : "Application Rejected"}</h2>
            <p>
                ${isPending
                    ? "Thanks for applying! Our team is reviewing your business details. You'll be able to create experiences and manage reservations as soon as an admin approves your account."
                    : "Unfortunately your partner application was not approved. If you think this is a mistake, please contact the platform admin for more details."}
            </p>

            <div class="partner-status-details">
                <div><span>Business Name</span><strong>${escapeHTML(partnerProfile.businessName || "—")}</strong></div>
                <div><span>Location</span><strong>${escapeHTML(partnerProfile.location || "—")}</strong></div>
                <div><span>Phone</span><strong>${escapeHTML(partnerProfile.phone || "—")}</strong></div>
                <div><span>Status</span><strong class="status status-${partnerProfile.status.toLowerCase()}">${escapeHTML(partnerProfile.status)}</strong></div>
            </div>

            <a href="index.html" class="explore-btn" style="margin-top:10px;">Back to Home</a>
        </div>
    `;
}

function renderPartnerShell() {
    const app = document.getElementById("partnerApp");
    if (!app || !partnerProfile) return;

    app.innerHTML = `
        <div class="dashboard-header">
            <div class="user-profile-meta">
                <div class="user-avatar">${escapeHTML((partnerProfile.businessName || "P").charAt(0).toUpperCase())}</div>
                <div>
                    <h2 style="margin:0;color:white;">${escapeHTML(partnerProfile.businessName)}</h2>
                    <p style="margin:4px 0 0;color:#d9ece1;font-size:14px;">${escapeHTML(partnerProfile.email)}</p>
                </div>
            </div>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>

        <div class="section-card">
            <h3>Add New Experience</h3>
            <form id="newExperienceForm" class="experience-form" onsubmit="createExperience(event)">
                <div class="reserve-field">
                    <label>Destination</label>
                    <select id="expDestination" required>
                        <option value="">Select destination</option>
                        ${partnerDestinationsCache.map(p => `<option value="${p._id}">${escapeHTML(p.name)}</option>`).join("")}
                    </select>
                </div>
                <div class="reserve-field">
                    <label>Package Name</label>
                    <input id="expName" placeholder="e.g. Weekend Trek" required>
                </div>
                <div class="reserve-field">
                    <label>Price (₹ per traveller)</label>
                    <input type="number" id="expPrice" min="1" required>
                </div>
                <div class="reserve-field">
                    <label>Duration</label>
                    <input id="expDuration" placeholder="e.g. 2 Days, 1 Night" required>
                </div>
                <div class="reserve-field">
                    <label>Difficulty</label>
                    <select id="expDifficulty">
                        <option>Easy</option><option>Medium</option><option>Hard</option>
                    </select>
                </div>
                <div class="reserve-field">
                    <label>Capacity (seats)</label>
                    <input type="number" id="expCapacity" min="1" value="10" required>
                </div>
                <div class="reserve-field" style="grid-column:1/-1">
                    <label>Meeting Point</label>
                    <input id="expMeetingPoint" placeholder="e.g. Lonavala Railway Station">
                </div>
                <div class="reserve-field" style="grid-column:1/-1">
                    <label>Description</label>
                    <textarea id="expDescription" rows="2"></textarea>
                </div>
                <div class="reserve-field" style="grid-column:1/-1">
                    <label>Included (comma separated)</label>
                    <input id="expIncluded" placeholder="Guide, Permits, First Aid">
                </div>
                <div class="reserve-field" style="grid-column:1/-1">
                    <label>Available Dates (comma separated, YYYY-MM-DD)</label>
                    <input id="expDates" placeholder="2026-11-14, 2026-11-21">
                </div>
                <div id="expFormError" class="auth-error-msg" style="grid-column:1/-1"></div>
                <button type="submit" class="primary-btn" style="grid-column:1/-1">Create Experience</button>
            </form>
        </div>

        <div class="section-card">
            <h3>My Experiences</h3>
            <div id="partnerExperiencesBox"><div class="loading-card">Loading...</div></div>
        </div>

        <div class="section-card">
            <h3>Reservation Requests</h3>
            <div id="partnerReservationsBox"><div class="loading-card">Loading...</div></div>
        </div>
    `;
}

function createExperience(event) {
    event.preventDefault();
    const errorBox = document.getElementById("expFormError");
    if (errorBox) errorBox.textContent = "";

    const included = document.getElementById("expIncluded").value.split(",").map(s => s.trim()).filter(Boolean);
    const availableDates = document.getElementById("expDates").value.split(",").map(s => s.trim()).filter(Boolean);

    const payload = {
        destinationId: document.getElementById("expDestination").value,
        name: document.getElementById("expName").value.trim(),
        price: document.getElementById("expPrice").value,
        duration: document.getElementById("expDuration").value.trim(),
        difficulty: document.getElementById("expDifficulty").value,
        capacity: document.getElementById("expCapacity").value,
        meetingPoint: document.getElementById("expMeetingPoint").value.trim(),
        description: document.getElementById("expDescription").value.trim(),
        included,
        availableDates
    };

    if (!payload.destinationId || !payload.name || !payload.price) {
        if (errorBox) errorBox.textContent = "Destination, name and price are required.";
        return;
    }

    apiFetch("/experiences", { method: "POST", body: JSON.stringify(payload) })
        .then(() => {
            showToast("Experience created");
            document.getElementById("newExperienceForm").reset();
            loadPartnerExperiences();
        })
        .catch(err => { if (errorBox) errorBox.textContent = err.message; });
}

function loadPartnerExperiences() {
    const box = document.getElementById("partnerExperiencesBox");
    if (!box) return;

    apiFetch("/experiences/mine/all")
        .then(list => {
            if (!list.length) {
                box.innerHTML = `<p class="muted">You haven't created any experiences yet.</p>`;
                return;
            }

            box.innerHTML = `
                <div class="experience-grid">
                    ${list.map(exp => `
                        <div class="experience-card">
                            <div class="experience-top">
                                <div>
                                    <p class="experience-partner">${escapeHTML(exp.destinationId ? exp.destinationId.name : "")}</p>
                                    <h3>${escapeHTML(exp.name)}</h3>
                                </div>
                            </div>
                            <div class="experience-meta">
                                <span>⏱ ${escapeHTML(exp.duration || "")}</span>
                                <span>🥾 ${escapeHTML(exp.difficulty || "")}</span>
                                <span>👥 ${exp.capacity} seats</span>
                            </div>
                            <div class="experience-price-row">
                                <strong>₹${Number(exp.price).toLocaleString("en-IN")}</strong>
                                <span>per traveller</span>
                            </div>
                            <button class="remove-trip" onclick="deleteExperience('${exp._id}')">Delete</button>
                        </div>
                    `).join("")}
                </div>
            `;
        })
        .catch(err => { box.innerHTML = `<p class="muted">${escapeHTML(err.message)}</p>`; });
}

function deleteExperience(expId) {
    apiFetch(`/experiences/${expId}`, { method: "DELETE" })
        .then(() => {
            showToast("Experience deleted");
            loadPartnerExperiences();
        })
        .catch(err => showToast(err.message, "error"));
}

function loadPartnerReservations() {
    const box = document.getElementById("partnerReservationsBox");
    if (!box) return;

    apiFetch("/reservations/partner")
        .then(list => {
            if (!list.length) {
                box.innerHTML = `<p class="muted">No reservation requests yet.</p>`;
                return;
            }

            box.innerHTML = list.map(r => `
                <div class="trip-card">
                    <div class="trip-card-top">
                        <div>
                            <span class="trip-label">#${String(r._id).slice(-6).toUpperCase()}</span>
                            <h2>${escapeHTML(r.experienceId ? r.experienceId.name : "Experience")}</h2>
                        </div>
                        <span class="status status-${r.status.toLowerCase()}">${escapeHTML(r.status)}</span>
                    </div>
                    <div class="trip-details">
                        <div><span>📍</span><div><small>Destination</small><strong>${escapeHTML(r.destinationId ? r.destinationId.name : "—")}</strong></div></div>
                        <div><span>🙋</span><div><small>Traveller</small><strong>${escapeHTML(r.name)}</strong></div></div>
                        <div><span>📅</span><div><small>Date</small><strong>${formatDate(r.date)}</strong></div></div>
                        <div><span>👥</span><div><small>Travellers</small><strong>${r.travellers}</strong></div></div>
                        <div><span>💰</span><div><small>Total</small><strong>₹${Number(r.price).toLocaleString("en-IN")}</strong></div></div>
                    </div>
                    ${r.status === "Pending" ? `
                    <div class="trip-footer">
                        <button class="primary-btn" style="width:auto;padding:8px 18px;" onclick="setReservationStatus('${r._id}','Confirmed')">Confirm</button>
                        <button class="remove-trip" onclick="setReservationStatus('${r._id}','Rejected')">Reject</button>
                    </div>` : ""}
                </div>
            `).join("");
        })
        .catch(err => { box.innerHTML = `<p class="muted">${escapeHTML(err.message)}</p>`; });
}

function setReservationStatus(resId, status) {
    apiFetch(`/reservations/${resId}/status`, { method: "PUT", body: JSON.stringify({ status }) })
        .then(() => {
            showToast(`Reservation ${status.toLowerCase()}`);
            loadPartnerReservations();
        })
        .catch(err => showToast(err.message, "error"));
}

/* =========================================================
ADMIN DASHBOARD
========================================================= */

function loadAdminDashboard() {
    if (!guardPage(["admin"])) return;
    showAdminTab("stats");
}

function showAdminTab(tab) {
    document.querySelectorAll(".admin-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));

    const box = document.getElementById("adminBox");
    box.innerHTML = `<div class="loading-card">Loading...</div>`;

    const loaders = {
        stats: loadAdminStats,
        partners: loadAdminPartners,
        reservations: loadAdminReservations,
        users: loadAdminUsers,
        reviews: loadAdminReviews
    };

    (loaders[tab] || loadAdminStats)();
}

function loadAdminStats() {
    apiFetch("/admin/stats").then(s => {
        document.getElementById("adminBox").innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon">👥</div><div><div class="stat-label">Users</div><div class="stat-value">${s.users}</div></div></div>
                <div class="stat-card"><div class="stat-icon">🏕️</div><div><div class="stat-label">Partners</div><div class="stat-value">${s.partners}</div></div></div>
                <div class="stat-card"><div class="stat-icon">📍</div><div><div class="stat-label">Destinations</div><div class="stat-value">${s.destinations}</div></div></div>
                <div class="stat-card"><div class="stat-icon">🎒</div><div><div class="stat-label">Experiences</div><div class="stat-value">${s.experiences}</div></div></div>
                <div class="stat-card"><div class="stat-icon">🧾</div><div><div class="stat-label">Reservations</div><div class="stat-value">${s.reservations}</div></div></div>
                <div class="stat-card"><div class="stat-icon">⏳</div><div><div class="stat-label">Pending Partners</div><div class="stat-value">${s.pendingPartners}</div></div></div>
            </div>
        `;
    }).catch(renderAdminError);
}

function loadAdminPartners() {
    apiFetch("/admin/partners").then(list => {
        document.getElementById("adminBox").innerHTML = `
            <div id="adminBoxGrid">
                ${list.map(p => `
                    <div class="card">
                        <b>${escapeHTML(p.status)}</b>
                        <h3>${escapeHTML(p.businessName)}</h3>
                        <p>${escapeHTML(p.email)} ${p.phone ? "· " + escapeHTML(p.phone) : ""}</p>
                        <p>📍 ${escapeHTML(p.location || "Location not provided")}</p>
                        <p>${escapeHTML(p.description || "")}</p>
                        ${p.status === "Pending" ? `
                            <button onclick="setPartnerStatus('${p._id}','Approved')" style="background:#e6f7ec;color:#1c5c45;border-color:#bfe8cf;">Approve</button>
                            <button onclick="setPartnerStatus('${p._id}','Rejected')">Reject</button>
                        ` : `<button onclick="setPartnerStatus('${p._id}','Pending')">Reset to Pending</button>`}
                    </div>
                `).join("") || `<p class="muted">No partners registered yet.</p>`}
            </div>
        `;
    }).catch(renderAdminError);
}

function setPartnerStatus(partnerId, status) {
    apiFetch(`/admin/partners/${partnerId}/status`, { method: "PUT", body: JSON.stringify({ status }) })
        .then(() => { showToast(`Partner marked ${status}`); loadAdminPartners(); })
        .catch(err => showToast(err.message, "error"));
}

function loadAdminReservations() {
    apiFetch("/admin/reservations").then(list => {
        document.getElementById("adminBox").innerHTML = `
            <div id="adminBoxGrid">
                ${list.map(r => `
                    <div class="card">
                        <b>${escapeHTML(r.status)}</b>
                        <h3>${escapeHTML(r.experienceId ? r.experienceId.name : "Experience")}</h3>
                        <p>${escapeHTML(r.destinationId ? r.destinationId.name : "")} · ${escapeHTML(r.partnerId ? r.partnerId.businessName : "")}</p>
                        <p>${escapeHTML(r.name)} · ${r.travellers} travellers · ₹${Number(r.price).toLocaleString("en-IN")}</p>
                    </div>
                `).join("") || `<p class="muted">No reservations yet.</p>`}
            </div>
        `;
    }).catch(renderAdminError);
}

function loadAdminUsers() {
    apiFetch("/admin/users").then(list => {
        document.getElementById("adminBox").innerHTML = `
            <div id="adminBoxGrid">
                ${list.map(u => `
                    <div class="card">
                        <b>${escapeHTML(u.role)}</b>
                        <h3>${escapeHTML(u.name || u.username)}</h3>
                        <p>${escapeHTML(u.username)}</p>
                    </div>
                `).join("") || `<p class="muted">No users yet.</p>`}
            </div>
        `;
    }).catch(renderAdminError);
}

function loadAdminReviews() {
    apiFetch("/admin/reviews").then(list => {
        document.getElementById("adminBox").innerHTML = `
            <div id="adminBoxGrid">
                ${list.map(r => `
                    <div class="card">
                        <b>${"★".repeat(Number(r.rating) || 0)}</b>
                        <h3>${escapeHTML(r.username || "Traveller")}</h3>
                        <p>${escapeHTML(r.comment || "")}</p>
                        <button onclick="deleteAdminReview('${r._id}')">Delete</button>
                    </div>
                `).join("") || `<p class="muted">No reviews yet.</p>`}
            </div>
        `;
    }).catch(renderAdminError);
}

function deleteAdminReview(reviewId) {
    apiFetch(`/admin/reviews/${reviewId}`, { method: "DELETE" })
        .then(() => { showToast("Review deleted"); loadAdminReviews(); })
        .catch(err => showToast(err.message, "error"));
}

function renderAdminError(err) {
    document.getElementById("adminBox").innerHTML = `
        <div class="empty-state"><h3>Unable to load</h3><p>${escapeHTML(err.message)}</p></div>
    `;
}
