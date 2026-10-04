/* =========================================================
   SMART MAHARASHTRA TOURISM — BACKEND
   Express + Mongoose. Marketplace model:
   Destination -> Partners -> Experiences -> Reservations

   Preserved original routes & response shapes:
     POST /signup   -> { success } | { error }
     POST /login    -> { success } | { error }
     GET  /places
     POST /review
     GET  /reviews/:id
   Everything else below is additive.
   ========================================================= */

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "eco-travel-dev-secret-change-in-production";

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ecotravel")
.then(() => console.log("DB Connected"));

/* =========================================================
   MODELS
   ========================================================= */

const User = mongoose.model("User", {
  username: String,          // email — kept as "username" for backward compatibility
  password: String,          // bcrypt hash (auto-migrated from legacy plain text on first login)
  name: String,
  role: { type: String, enum: ["traveller", "partner", "admin"], default: "traveller" },
  createdAt: { type: Date, default: Date.now }
});

const Place = mongoose.model("Place", {
  name: String,
  description: String,
  image: String,
  location: String,
  budget: String,
  type: String,
  difficulty: String,
  lat: Number,
  lng: Number,
  bestTime: String,
  thingsToDo: [String]
});

const Partner = mongoose.model("Partner", {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  businessName: String,
  email: String,
  phone: String,
  location: String,
  description: String,
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  isDemo: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Experience = mongoose.model("Experience", {
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner" },
  destinationId: { type: mongoose.Schema.Types.ObjectId, ref: "Place" },
  name: String,
  description: String,
  price: Number,
  duration: String,
  difficulty: String,
  capacity: Number,
  availableDates: [String],
  meetingPoint: String,
  included: [String],
  images: [String],
  rating: { type: Number, default: 4.5 },
  createdAt: { type: Date, default: Date.now }
});

const Reservation = mongoose.model("Reservation", {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  destinationId: { type: mongoose.Schema.Types.ObjectId, ref: "Place" },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner" },
  experienceId: { type: mongoose.Schema.Types.ObjectId, ref: "Experience" },
  name: String,
  email: String,
  phone: String,
  date: String,
  travellers: Number,
  price: Number,
  status: { type: String, enum: ["Pending", "Confirmed", "Rejected", "Cancelled"], default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});

const Review = mongoose.model("Review", {
  placeId: String,
  username: String,
  rating: Number,
  comment: String
});

/* =========================================================
   AUTH HELPERS
   ========================================================= */

function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Verifies the bearer token and attaches req.user. Rejects if missing/invalid.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Login required." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// The frontend never gets to declare its own role — every protected route re-checks
// the role baked into the signed token, not anything sent in the request body.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    next();
  };
}

/* =========================================================
   SEED DEMO DATA (only runs once, when collections are empty)
   ========================================================= */

async function seed() {
  const count = await Place.countDocuments();

  let places;

  if (count === 0) {
    places = await Place.insertMany([
      {
        name: "Rajmachi Trek",
        description: "Beautiful trekking experience in the Sahyadri mountains.",
        image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
        location: "Lonavala",
        budget: "1500",
        type: "Trek",
        difficulty: "Medium",
        lat: 18.7406, lng: 73.3764,
        bestTime: "October to February",
        thingsToDo: ["Fort exploration", "Camping", "Photography", "Monsoon trekking"]
      },
      {
        name: "Pawna Lake Camping",
        description: "Peaceful lakeside camping surrounded by mountains.",
        image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e",
        location: "Pune",
        budget: "2000",
        type: "Nature",
        difficulty: "Easy",
        lat: 18.6395, lng: 73.4788,
        bestTime: "October to March",
        thingsToDo: ["Lakeside camping", "Bonfire nights", "Boating", "Stargazing"]
      },
      {
        name: "Mahabaleshwar",
        description: "Popular hill station famous for viewpoints, valleys and strawberries.",
        image: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23",
        location: "Satara",
        budget: "3000",
        type: "Hill Station",
        difficulty: "Easy",
        lat: 17.9307, lng: 73.6477,
        bestTime: "October to June",
        thingsToDo: ["Viewpoint hopping", "Strawberry farms", "Boating", "Local markets"]
      },
      {
        name: "Lonavala",
        description: "Scenic hill station known for waterfalls, valleys and trekking.",
        image: "https://images.unsplash.com/photo-1597074866923-dc0589150358",
        location: "Pune",
        budget: "2500",
        type: "Hill Station",
        difficulty: "Easy",
        lat: 18.7546, lng: 73.4062,
        bestTime: "June to September",
        thingsToDo: ["Waterfall visits", "Caves", "Chikki shopping", "Valley viewpoints"]
      },
      {
        name: "Mumbai",
        description: "The vibrant city of Maharashtra featuring Gateway of India and Marine Drive.",
        image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f",
        location: "Mumbai",
        budget: "4000",
        type: "Cultural",
        difficulty: "Easy",
        lat: 19.0760, lng: 72.8777,
        bestTime: "November to February",
        thingsToDo: ["Gateway of India", "Marine Drive", "Elephanta Caves", "Local food trails"]
      },
      {
        name: "Nashik",
        description: "Cultural and spiritual destination famous for temples, vineyards and the Godavari river.",
        image: "https://images.unsplash.com/photo-1548013146-72479768bada",
        location: "Nashik",
        budget: "2500",
        type: "Cultural",
        difficulty: "Easy",
        lat: 19.9975, lng: 73.7898,
        bestTime: "October to March",
        thingsToDo: ["Vineyard tours", "Temple visits", "Godavari ghats", "Wine tasting"]
      },
      {
        name: "Shirdi",
        description: "Important religious destination and home of the famous Sai Baba temple.",
        image: "https://images.unsplash.com/photo-1609947017136-9daf32a5eb16",
        location: "Ahmednagar",
        budget: "2000",
        type: "Religious",
        difficulty: "Easy",
        lat: 19.7645, lng: 74.4769,
        bestTime: "Year-round",
        thingsToDo: ["Sai Baba Temple", "Dwarkamai", "Local prasad stalls"]
      },
      {
        name: "Alibaug",
        description: "Beautiful coastal destination with beaches and historic attractions.",
        image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
        location: "Raigad",
        budget: "3000",
        type: "Beach",
        difficulty: "Easy",
        lat: 18.6414, lng: 72.8722,
        bestTime: "November to February",
        thingsToDo: ["Beach walks", "Kolaba Fort", "Water sports", "Seafood trails"]
      },
      {
        name: "Tadoba National Park",
        description: "Famous wildlife destination known for tigers and rich biodiversity.",
        image: "https://images.unsplash.com/photo-1561731216-c3a4d99437d5",
        location: "Chandrapur",
        budget: "5000",
        type: "Nature",
        difficulty: "Medium",
        lat: 20.2141, lng: 79.3728,
        bestTime: "November to April",
        thingsToDo: ["Tiger safaris", "Birdwatching", "Nature trails"]
      },
      {
        name: "Ajanta Caves",
        description: "Ancient rock-cut Buddhist caves famous for paintings and sculptures.",
        image: "https://images.unsplash.com/photo-1598091383021-15ddea10925d",
        location: "Aurangabad",
        budget: "2500",
        type: "Historical",
        difficulty: "Easy",
        lat: 20.5519, lng: 75.7033,
        bestTime: "November to March",
        thingsToDo: ["Cave paintings", "Guided heritage walk", "Photography"]
      },
      {
        name: "Ellora Caves",
        description: "UNESCO World Heritage site featuring remarkable rock-cut temples.",
        image: "https://images.unsplash.com/photo-1600100397608-f010f3b2e7c2",
        location: "Aurangabad",
        budget: "2500",
        type: "Historical",
        difficulty: "Easy",
        lat: 20.0258, lng: 75.1780,
        bestTime: "November to March",
        thingsToDo: ["Kailasa Temple", "Guided heritage walk", "Photography"]
      },
      {
        name: "Raigad Fort",
        description: "Historic hill fort associated with Chhatrapati Shivaji Maharaj.",
        image: "https://images.unsplash.com/photo-1596402184320-417e7178b2cd",
        location: "Raigad",
        budget: "1800",
        type: "Fort",
        difficulty: "Medium",
        lat: 18.2406, lng: 73.4400,
        bestTime: "October to February",
        thingsToDo: ["Ropeway ride", "Fort exploration", "History walk"]
      }
    ]);

    console.log("12 destinations added");
  } else {
    places = await Place.find();
  }

  // --- demo marketplace data: partners + experiences (sample/demo only) ---
  const partnerCount = await Partner.countDocuments();

  if (partnerCount === 0) {
    const find = n => places.find(p => p.name === n);

    const [sahyadri, greencamp, deccan] = await Partner.insertMany([
      {
        businessName: "Sahyadri Trail Co.",
        email: "contact@sahyadritrail.demo",
        phone: "+91 90000 00001",
        description: "Demo trekking agency specialising in Sahyadri fort treks with certified local guides.",
        status: "Approved",
        isDemo: true
      },
      {
        businessName: "GreenCamp Maharashtra",
        email: "hello@greencamp.demo",
        phone: "+91 90000 00002",
        description: "Demo eco-camping & homestay operator running low-impact lakeside and hill-station stays.",
        status: "Approved",
        isDemo: true
      },
      {
        businessName: "Deccan Heritage Tours",
        email: "info@deccanheritage.demo",
        phone: "+91 90000 00003",
        description: "Demo heritage & culture tour operator focused on forts, caves and temple circuits.",
        status: "Approved",
        isDemo: true
      }
    ]);

    const rajmachi = find("Rajmachi Trek");
    const raigad = find("Raigad Fort");
    const mahabaleshwar = find("Mahabaleshwar");

    const experiences = [];

    if (rajmachi) {
      experiences.push(
        {
          partnerId: sahyadri._id, destinationId: rajmachi._id,
          name: "Weekend Trek", description: "A guided two-day weekend trek to Rajmachi fort with an experienced local crew.",
          price: 1200, duration: "2 Days", difficulty: "Medium", capacity: 15,
          availableDates: ["2026-11-14", "2026-11-21", "2026-11-28"],
          meetingPoint: "Lonavala Railway Station",
          included: ["Certified guide", "Forest permits", "First-aid kit"],
          rating: 4.7
        },
        {
          partnerId: greencamp._id, destinationId: rajmachi._id,
          name: "Trek + Camping", description: "Trek to Rajmachi followed by an overnight lakeside camp with a bonfire dinner.",
          price: 1800, duration: "2 Days, 1 Night", difficulty: "Medium", capacity: 20,
          availableDates: ["2026-11-15", "2026-11-22", "2026-12-06"],
          meetingPoint: "Lonavala Bus Stand",
          included: ["Guide", "Tent stay", "Bonfire", "Dinner & breakfast"],
          rating: 4.5
        }
      );
    }

    if (raigad) {
      experiences.push({
        partnerId: deccan._id, destinationId: raigad._id,
        name: "Heritage Walk + History Talk", description: "A guided heritage walk through Raigad Fort with a storytelling session on its history.",
        price: 900, duration: "1 Day", difficulty: "Easy", capacity: 25,
        availableDates: ["2026-11-16", "2026-11-23", "2026-11-30"],
        meetingPoint: "Raigad Ropeway Base Station",
        included: ["Guide", "Ropeway ticket"],
        rating: 4.8
      });
    }

    if (mahabaleshwar) {
      experiences.push({
        partnerId: greencamp._id, destinationId: mahabaleshwar._id,
        name: "Strawberry Farms & Viewpoints Day Trip", description: "A relaxed day trip covering strawberry farms and the best viewpoints around Mahabaleshwar.",
        price: 1500, duration: "1 Day", difficulty: "Easy", capacity: 12,
        availableDates: ["2026-11-18", "2026-11-25", "2026-12-02"],
        meetingPoint: "Mahabaleshwar Bus Stand",
        included: ["Local transport", "Guide", "Farm visit"],
        rating: 4.6
      });
    }

    if (experiences.length) {
      await Experience.insertMany(experiences);
      console.log(`${experiences.length} demo experiences added across ${new Set(experiences.map(e => String(e.destinationId))).size} destinations`);
    }
  }
}

seed();

/* =========================================================
   ADMIN PROVISIONING
   There is no public admin signup anywhere in this app (the /signup route only
   ever accepts "traveller" or "partner"). The one and only admin account is
   provisioned from ADMIN_EMAIL / ADMIN_PASSWORD environment variables, set in
   docker-compose.yml / your environment — never hard-coded, never created via
   a public-facing form.

   Idempotent: if that email already exists, its role is corrected to "admin"
   if needed, but its password is left untouched (so a password the admin has
   since changed is never silently overwritten by the env value on restart).
   ========================================================= */

async function ensureAdminAccount() {
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const password = (process.env.ADMIN_PASSWORD || "").trim();

  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin account provisioning.");
    return;
  }

  let admin = await User.findOne({ username: email });

  if (!admin) {
    const hashed = await bcrypt.hash(password, 10);
    admin = await new User({ username: email, password: hashed, name: "Platform Admin", role: "admin" }).save();
    console.log(`Admin account created for ${email}`);
  } else if (admin.role !== "admin") {
    admin.role = "admin";
    await admin.save();
    console.log(`Existing account ${email} promoted to admin`);
  }
}

ensureAdminAccount();

/* =========================================================
   AUTH ROUTES  (preserved contract: { success } / { error })
   ========================================================= */

app.post("/signup", async (req, res) => {
  try {
    let username = (req.body.username || "").trim();
    let password = (req.body.password || "").trim();
    let name = (req.body.name || "").trim();
    // Public signup only ever accepts "traveller" or "partner" — "admin" is never
    // accepted here, by design. Admin accounts are created internally (e.g. directly
    // in MongoDB), never through this public-facing route.
    let role = ["traveller", "partner"].includes(req.body.role) ? req.body.role : "traveller";
    let businessName = (req.body.businessName || "").trim();
    let businessPhone = (req.body.businessPhone || "").trim();
    let businessLocation = (req.body.businessLocation || "").trim();
    let businessDescription = (req.body.businessDescription || "").trim();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(username)) {
      return res.json({ error: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.json({ error: "Password must be at least 8 characters" });
    }
    if (password.includes(" ")) {
      return res.json({ error: "Password cannot contain spaces" });
    }
    if (!/[A-Z]/.test(password)) {
      return res.json({ error: "Password needs uppercase letter" });
    }
    if (!/[a-z]/.test(password)) {
      return res.json({ error: "Password needs lowercase letter" });
    }
    if (!/[0-9]/.test(password)) {
      return res.json({ error: "Password needs number" });
    }
    if (!/[!@#$%^&*]/.test(password)) {
      return res.json({ error: "Password needs special character" });
    }

    if (role === "partner") {
      if (businessName.length < 2) {
        return res.json({ error: "Business/agency name is required for partner accounts" });
      }
      if (businessPhone.length < 6) {
        return res.json({ error: "A business phone number is required for partner accounts" });
      }
      if (businessLocation.length < 2) {
        return res.json({ error: "Operating location is required for partner accounts" });
      }
    }

    let existing = await User.findOne({ username });
    if (existing) {
      return res.json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await new User({ username, password: hashed, name, role }).save();

    let partnerStatus = null;

    if (role === "partner") {
      const partner = await new Partner({
        userId: user._id,
        businessName,
        email: username,
        phone: businessPhone,
        location: businessLocation,
        description: businessDescription,
        status: "Pending"   // every public partner application starts Pending — only an admin can approve/reject it
      }).save();

      partnerStatus = partner.status;
    }

    res.json({
      success: true,
      token: signToken(user),
      role: user.role,
      username: user.username,
      name: user.name,
      partnerStatus
    });

  } catch (err) {
    res.json({ error: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const password = (req.body.password || "").trim();

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false, error: "Account not found" });
    }

    const looksHashed = /^\$2[aby]\$/.test(user.password || "");
    let valid = false;

    if (looksHashed) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plain-text account from before hashing was added.
      // Validate once against the stored plain value, then transparently upgrade it.
      valid = password === user.password;
      if (valid) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }

    if (!valid) {
      return res.json({ success: false, error: "Incorrect password" });
    }

    let partnerStatus = null;
    if (user.role === "partner") {
      const partner = await Partner.findOne({ userId: user._id });
      partnerStatus = partner ? partner.status : null;
    }

    res.json({
      success: true,
      token: signToken(user),
      role: user.role,
      username: user.username,
      name: user.name,
      partnerStatus
    });

  } catch (err) {
    res.json({ success: false, error: "Login failed" });
  }
});

app.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ error: "User not found" });

  let partner = null;
  if (user.role === "partner") {
    partner = await Partner.findOne({ userId: user._id });
  }

  res.json({ user, partner });
});

/* =========================================================
   PLACES (DESTINATIONS)
   ========================================================= */

app.get("/places", async (req, res) => {
  let data = await Place.find();
  res.json(data);
});

app.get("/places/:id", async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ error: "Destination not found" });
    res.json(place);
  } catch (err) {
    res.status(400).json({ error: "Invalid destination id" });
  }
});

/* =========================================================
   REVIEWS  (preserved)
   ========================================================= */

app.post("/review", async (req, res) => {
  await new Review(req.body).save();
  res.json({ success: true });
});

app.get("/reviews/:id", async (req, res) => {
  let data = await Review.find({ placeId: req.params.id });
  res.json(data);
});

/* =========================================================
   PARTNERS
   ========================================================= */

// Public: a partner's storefront info
app.get("/partners/:id", async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id).select("-userId");
    if (!partner) return res.status(404).json({ error: "Partner not found" });
    res.json(partner);
  } catch (err) {
    res.status(400).json({ error: "Invalid partner id" });
  }
});

// Partner: view own profile
app.get("/partners/me", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  if (!partner) return res.status(404).json({ error: "Partner profile not found" });
  res.json(partner);
});

// Partner: update own profile
app.put("/partners/me", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  if (!partner) return res.status(404).json({ error: "Partner profile not found" });

  const { businessName, phone, location, description } = req.body;
  if (businessName) partner.businessName = businessName;
  if (phone !== undefined) partner.phone = phone;
  if (location !== undefined) partner.location = location;
  if (description !== undefined) partner.description = description;

  await partner.save();
  res.json({ success: true, partner });
});

/* =========================================================
   EXPERIENCES
   ========================================================= */

// Public: list experiences, optionally filtered by destination.
// Only experiences from Approved partners are shown publicly.
app.get("/experiences", async (req, res) => {
  const filter = {};
  if (req.query.destinationId) filter.destinationId = req.query.destinationId;

  const experiences = await Experience.find(filter).populate("partnerId", "businessName status isDemo rating");
  const visible = experiences.filter(e => e.partnerId && e.partnerId.status === "Approved");

  res.json(visible);
});

app.get("/experiences/:id", async (req, res) => {
  try {
    const experience = await Experience.findById(req.params.id).populate("partnerId", "businessName status isDemo");
    if (!experience) return res.status(404).json({ error: "Experience not found" });
    res.json(experience);
  } catch (err) {
    res.status(400).json({ error: "Invalid experience id" });
  }
});

// Partner: own experiences (dashboard)
app.get("/experiences/mine/all", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  if (!partner) return res.status(404).json({ error: "Partner profile not found" });

  const experiences = await Experience.find({ partnerId: partner._id }).populate("destinationId", "name location");
  res.json(experiences);
});

app.post("/experiences", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  if (!partner) return res.status(404).json({ error: "Partner profile not found" });

  if (partner.status !== "Approved") {
    return res.status(403).json({ error: "Your partner account is still pending admin approval." });
  }

  const { destinationId, name, description, price, duration, difficulty, capacity, availableDates, meetingPoint, included } = req.body;

  if (!destinationId || !name || !price) {
    return res.status(400).json({ error: "Destination, name and price are required." });
  }

  const experience = await new Experience({
    partnerId: partner._id,
    destinationId, name, description,
    price: Number(price),
    duration, difficulty,
    capacity: Number(capacity) || 10,
    availableDates: Array.isArray(availableDates) ? availableDates : [],
    meetingPoint,
    included: Array.isArray(included) ? included : []
  }).save();

  res.json({ success: true, experience });
});

app.put("/experiences/:id", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  const experience = await Experience.findById(req.params.id);

  if (!experience) return res.status(404).json({ error: "Experience not found" });
  if (!partner || String(experience.partnerId) !== String(partner._id)) {
    return res.status(403).json({ error: "You can only edit your own experiences." });
  }

  const fields = ["name", "description", "price", "duration", "difficulty", "capacity", "availableDates", "meetingPoint", "included"];
  fields.forEach(f => {
    if (req.body[f] !== undefined) experience[f] = req.body[f];
  });

  await experience.save();
  res.json({ success: true, experience });
});

app.delete("/experiences/:id", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  const experience = await Experience.findById(req.params.id);

  if (!experience) return res.status(404).json({ error: "Experience not found" });
  if (!partner || String(experience.partnerId) !== String(partner._id)) {
    return res.status(403).json({ error: "You can only delete your own experiences." });
  }

  await Experience.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* =========================================================
   RESERVATIONS
   ========================================================= */

// Traveller: submit a reservation request
app.post("/reservations", requireAuth, requireRole("traveller"), async (req, res) => {
  const { experienceId, date, travellers, phone } = req.body;

  if (!experienceId || !date || !travellers) {
    return res.status(400).json({ error: "Experience, date and traveller count are required." });
  }

  const experience = await Experience.findById(experienceId);
  if (!experience) return res.status(404).json({ error: "Experience not found" });

  const user = await User.findById(req.user.id);

  const reservation = await new Reservation({
    userId: user._id,
    destinationId: experience.destinationId,
    partnerId: experience.partnerId,
    experienceId: experience._id,
    name: user.name || user.username,
    email: user.username,
    phone: phone || "",
    date,
    travellers: Number(travellers),
    price: experience.price * Number(travellers),
    status: "Pending"
  }).save();

  res.json({ success: true, reservation });
});

// Traveller: own reservations
app.get("/reservations/mine", requireAuth, requireRole("traveller"), async (req, res) => {
  const reservations = await Reservation.find({ userId: req.user.id })
    .populate("destinationId", "name location image")
    .populate("partnerId", "businessName")
    .populate("experienceId", "name duration")
    .sort({ createdAt: -1 });

  res.json(reservations);
});

// Traveller: cancel own pending/confirmed reservation
app.put("/reservations/:id/cancel", requireAuth, requireRole("traveller"), async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) return res.status(404).json({ error: "Reservation not found" });
  if (String(reservation.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: "You can only cancel your own reservations." });
  }

  reservation.status = "Cancelled";
  await reservation.save();
  res.json({ success: true, reservation });
});

// Partner: incoming reservation requests for their experiences
app.get("/reservations/partner", requireAuth, requireRole("partner"), async (req, res) => {
  const partner = await Partner.findOne({ userId: req.user.id });
  if (!partner) return res.status(404).json({ error: "Partner profile not found" });

  const reservations = await Reservation.find({ partnerId: partner._id })
    .populate("destinationId", "name location")
    .populate("experienceId", "name")
    .sort({ createdAt: -1 });

  res.json(reservations);
});

// Partner: confirm or reject a reservation for one of their experiences
app.put("/reservations/:id/status", requireAuth, requireRole("partner"), async (req, res) => {
  const { status } = req.body;
  if (!["Confirmed", "Rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be Confirmed or Rejected." });
  }

  const partner = await Partner.findOne({ userId: req.user.id });
  const reservation = await Reservation.findById(req.params.id);

  if (!reservation) return res.status(404).json({ error: "Reservation not found" });
  if (!partner || String(reservation.partnerId) !== String(partner._id)) {
    return res.status(403).json({ error: "You can only manage reservations for your own experiences." });
  }

  reservation.status = status;
  await reservation.save();
  res.json({ success: true, reservation });
});

/* =========================================================
   ADMIN
   ========================================================= */

app.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
  const [users, partners, destinations, experiences, reservations] = await Promise.all([
    User.countDocuments(),
    Partner.countDocuments(),
    Place.countDocuments(),
    Experience.countDocuments(),
    Reservation.countDocuments()
  ]);

  const pendingPartners = await Partner.countDocuments({ status: "Pending" });
  const pendingReservations = await Reservation.countDocuments({ status: "Pending" });

  res.json({ users, partners, destinations, experiences, reservations, pendingPartners, pendingReservations });
});

app.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json(users);
});

app.get("/admin/partners", requireAuth, requireRole("admin"), async (req, res) => {
  const partners = await Partner.find().sort({ createdAt: -1 });
  res.json(partners);
});

app.put("/admin/partners/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const { status } = req.body;
  if (!["Approved", "Rejected", "Pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  const partner = await Partner.findById(req.params.id);
  if (!partner) return res.status(404).json({ error: "Partner not found" });

  partner.status = status;
  await partner.save();
  res.json({ success: true, partner });
});

app.get("/admin/experiences", requireAuth, requireRole("admin"), async (req, res) => {
  const experiences = await Experience.find()
    .populate("partnerId", "businessName status")
    .populate("destinationId", "name");
  res.json(experiences);
});

app.get("/admin/reservations", requireAuth, requireRole("admin"), async (req, res) => {
  const reservations = await Reservation.find()
    .populate("destinationId", "name")
    .populate("partnerId", "businessName")
    .populate("experienceId", "name")
    .sort({ createdAt: -1 });
  res.json(reservations);
});

app.get("/admin/reviews", requireAuth, requireRole("admin"), async (req, res) => {
  const reviews = await Review.find().sort({ _id: -1 });
  res.json(reviews);
});

app.delete("/admin/reviews/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.listen(5000, () => console.log("Server running"));
