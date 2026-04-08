# 🌾 Krishi Exchange — Full Project Report

---

## 📌 What Is Krishi Exchange?

**Krishi Exchange** is a full-stack, authenticated **agricultural marketplace web application** built specifically for the Indian farming community. It is a peer-to-peer platform where farmers, buyers, and rural stakeholders can **list, discover, and exchange crops and farming tools** — directly with each other, without any middlemen.

The platform is designed to bridge the gap between rural farmers who have surplus produce or idle farm equipment, and buyers or other farmers who need those resources — all within a trust-verified, transparent digital ecosystem.

---

## 🔴 The Problem It Solves

India's agricultural sector suffers from several deep-rooted issues:

| Problem | Impact |
|---|---|
| **Middlemen (Dalals) controlling prices** | Farmers get far below market value |
| **No transparent price discovery** | Farmers don't know real mandi rates |
| **Idle farming tools sitting unused** | Small farmers can't afford equipment they need only seasonally |
| **No peer-to-peer crop exchange** | Hard for farmers to barter surplus without a trusted platform |
| **Language barriers** | Farmers can't navigate English-only digital tools |
| **No trust mechanism** | No way to verify if a seller/buyer is reliable |
| **Disputes left unresolved** | No formal channel for agricultural transaction disputes |

Krishi Exchange tackles **all of these** in one platform.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 + custom CSS design system |
| **Database & Auth** | Supabase (PostgreSQL + Auth + Storage) |
| **UI Components** | shadcn/ui (Radix UI primitives) |
| **Maps** | Leaflet + React-Leaflet |
| **Charts** | Recharts |
| **Phone OTP** | Twilio |
| **Analytics** | Vercel Analytics |
| **Fonts** | Inter + Poppins (Google Fonts) |
| **Voice** | Web Speech API (browser-native) |
| **Mandi Prices** | data.gov.in Open Government API |

---

## 🗂️ Application Pages & Features

### 1. 🔐 Authentication — Login / Signup / Logout

- Email-based authentication powered by **Supabase Auth**
- **Route Protection via Middleware**: Every page (except `/login`, `/signup`, `/logout`, `/auth/*`) is guarded by a Next.js middleware that checks for a valid Supabase session before granting access
- Unauthenticated users are redirected to `/login` with the original destination stored as a query parameter (`redirectedFrom`) so they land back correctly after login
- On signup, a `profiles` row is automatically created/upserted in Supabase

---

### 2. 📊 Dashboard (`/`)

The main homepage after login. Gives users a high-level snapshot of everything happening on the platform.

**Features:**
- **Welcome banner** with the platform name and role greeting
- **Live Mandi Price Ticker** — A horizontally scrolling ticker that pulls real-time commodity prices from the Government of India's data API (`api.data.gov.in`). Shows crop name, emoji, modal price per kg, and min/max range with the market location. Pauses on hover.
- **Recently Listed Items** — Shows the 6 latest available listings (crops or tools) from all farmers sorted by recency. Each card shows:
  - Crop/tool emoji (auto-assigned by name)
  - Name, quantity, unit
  - Farmer's name
  - Listing type badge (🌾 Crop or 🚜 Tool)
  - Location
  - Trust score (displayed as ⭐ X.X/5)
  - Price per kg
  - Quality grade
  - Exchange button + View All button
- **Inline Exchange Modal** — Clicking "Exchange" opens a modal directly on the dashboard where the user can:
  - Specify how much of the listing they want
  - Choose what they're offering in return (🌾 Crop or 🚜 Tool)
  - Enter the name, quantity, and unit of their offer
  - Submit the exchange request
- **Recent Transactions** — Shows the last 5 exchange requests the current user is involved in (either as buyer or seller). Each transaction shows direction (🛒 Buying / 📦 Selling), the counterparty name, timestamp, and a color-coded status badge

---

### 3. 🛒 Marketplace (`/marketplace`)

The core listing and discovery page. The most feature-rich page in the entire app.

#### Listing & Searching
- **Search bar** — text search by crop/tool name (case-insensitive)
- **Filter by Region** — dropdown for 9 Indian states/regions (Punjab, Haryana, MP, UP, Gujarat, Maharashtra, Rajasthan, Bihar, Delhi NCR)
- **Filter by Quality** — Grade A, Grade B, Premium, Organic Certified, Fresh, High Sugar Content, Standard
- **Filter by Type** — All / Crops / Tools toggle
- **My Listings toggle** — shows only the current user's listings

#### Location-Based Discovery
- **GPS-based "Find Near Me"** — detects buyer's GPS coordinates and sorts/filters all listings by proximity (nearest first)
- **Manual address geocoding** — user can type their address and it auto-geocodes using Nominatim/OpenStreetMap
- **Distance Radius Filter** — 10 km / 25 km / 50 km / 100 km / All
- Each listing with lat/lng coordinates shows its distance from the buyer

#### Interactive Map
- **Leaflet Map** embedded on the page showing all listings as pins
- Clicking a pin on the map opens the buy/exchange modal for that listing
- Loaded dynamically (no SSR) to avoid `window` errors

#### Creating a Listing
Farmers can list items by clicking **"+ List Item"**. A modal form appears with:
- **Listing type**: Crop or Tool
- **Crop fields**: Name (dropdown), Quantity, Unit (kg/quintal/bag/liter), Price, Quality grade, Region, Description
- **Tool fields**: Tool name, Condition (New/Good/Fair/Needs Repair), Rental Price per Day
- **📸 Camera capture** — **MANDATORY photo requirement**: The farmer must take a live photo of their crop/tool using the device camera before submitting. Uses `getUserMedia` with environment-facing camera. Photo is uploaded to Supabase Storage and a signed URL (valid for 10 years) is stored with the listing.
- **Seller location detection**: GPS button or manual address entry with geocoding — coordinates are stored with the listing for map display and distance sorting
- **Mandi Price Suggestion**: While filling in crop name and region, the app fetches real mandi data and suggests a fair price range (with source attribution)

Listings are sorted by **farmer trust score** (descending) then by recency.

#### Buying / Making an Exchange Request
- Users click **"Exchange"** on a listing card
- A modal appears with:
  - Listing summary (name, quantity, price, location)
  - Quantity requested input (validates against available stock)
  - Offer type: Crop (with name, quantity, unit) or Tool
  - Estimated value display using mandi-sourced pricing
  - **Fair Trade Calculator toggle** — shows mandi price data inline as reference
- The exchange request is stored in the `exchange_requests` table with status `pending`
- Sellers cannot place exchange requests on their own listings (self-exchange blocked)

#### Removing a Listing
- Farmers see a **Remove** button on their own listings
- Clicking opens a confirmation dialog
- On confirm: all associated `exchange_requests` are cascade-deleted first, then the listing is deleted

#### Contacting a Seller
- A **"Contact Seller"** button reveals the seller's full name, phone number, village, district, state, trust score, and completed transaction count
- Data fetched directly from the `profiles` table

---

### 4. 🤝 Exchange Management (`/exchange`)

The dedicated page for managing all exchange requests — as a seller receiving requests, or as a buyer tracking your own.

#### Two Tabs
- **📥 Incoming** — Requests made by buyers on YOUR listings (you are the seller/farmer)
- **📤 My Requests** — Requests YOU have made on others' listings (you are the buyer)

Both tabs show live counts as badges.

#### Status Filter Bar
Filter by: All / Pending / Accepted / In Transit / Completed / Rejected

#### Incoming Tab — Grouped by Listing
Incoming requests are **grouped by the listing they belong to**, so a farmer with multiple buyers for the same crop can see all offers together. Within each group, requests are **sorted by estimated offer value** (best offer shown first with a ⭐ Best Offer badge).

Each request card shows:
- **Buyer** name, role, and initial avatar
- **Wants**: quantity requested + estimated INR value
- **Offering in Exchange**: crop/tool name, quantity, emoji
- **Est. Offer Value**: calculated using crop price map (INR/kg)
- **Status badge**
- **Action buttons** based on status:
  - `pending` → Accept / Reject buttons
  - `accepted` → 🚚 Mark In Transit button
  - `completed` → ✔ Completed label
  - `rejected` → ✕ Rejected label
  - `in_transit` → 🚚 In Transit label

#### Status Transition & Side Effects
When a farmer updates a status, the system automatically:
- **Accepted / Rejected / In Transit** → Creates a notification for the buyer in the `notifications` table
- **Completed** → Deducts `quantity_requested` from the listing's stock; if stock hits 0, marks listing as `sold_out`; **updates trust score** for both farmer and buyer
- **Rejected** → **Updates trust score** for buyer (adds to failed count, lowering their score)

#### My Requests Tab
Shows all requests the current user has placed, with their current status and descriptive hints (e.g., "Seller accepted your request. Awaiting shipment.", "Item is on its way to you.").

---

### 5. 👤 My Profile (`/profile`)

Full profile management page.

**Profile Hero Card**
- Gradient banner with subtle SVG pattern
- Avatar: uploads photo (captured via camera) or falls back to name initial
- Full name, member tier badge (New/Bronze/Silver/Gold based on trust score), phone verified badge
- Role and "Member since" date

**Quick Stats**
- Trust Score (out of 5)
- Total Transactions
- Completed count
- Failed count

**Camera-Based Photo Upload**
- Click "📷 Take Photo" to open front-facing camera
- Preview → Capture → Retake or Save
- Photo uploaded to Supabase Storage with signed URL
- Photo URL saved to user's `profiles` row

**Identity Verification Card**
Shows verification status for 3 checkpoints:
1. **Email** — auto-verified on signup ✓
2. **Phone** — OTP-based verification via Twilio
3. **Photo** — Camera capture required

A visual progress bar tracks completion (1/3 → 2/3 → 3/3).

**Phone OTP Verification Flow**
1. User clicks "Verify Now" or "Change"
2. Enters phone number
3. Hits "Send OTP" → API call to `/api/send-otp` (Twilio)
4. Enters 6-digit OTP using the `InputOTP` component
5. Hits "Verify" → API call to `/api/verify-otp`
6. On success, `phone_verified: true` is stored in the profile

**Editable Fields**
- Full Name, Village/Town, District, State (all updatable and saved)
- Email and Role are read-only

---

### 6. ⭐ Trust Profile (`/trust-profile`)

A dedicated page showing your trust standing in the Krishi Exchange community.

**Main Profile Card**
- Large circular trust score display (out of 5)
- Full name, verified role badge, registration date

**Stats Grid**
- Total Transactions
- Successful Deals (with completion %)
- Failed/Rejected count
- Member Tier (New / Bronze / Silver / Gold)

**Trust Breakdown Cards (3-column)**
- **Trust Score** — visual progress bar with score/5
- **Success Rate** — completion rate percentage bar
- **Reliability** — member tier with descriptive standing text

**Achievements / Badges System**
8 achievement badges, earned/unearned based on real activity data:

| Badge | Condition |
|---|---|
| ✓ Email Verified | Always earned |
| 🏆 Gold Member | Trust score ≥ 80 |
| 🎯 10+ Sales | Completed ≥ 10 |
| 🎯 50+ Sales | Completed ≥ 50 |
| 🎯 100+ Sales | Completed ≥ 100 |
| ⭐ 4.0+ Rating | Score ≥ 80 |
| ⭐ 4.5+ Rating | Score ≥ 90 |
| 🚀 Top Seller | 100+ sales AND score ≥ 90 |

Unearned badges appear greyed-out with "Not yet earned" label.

---

### 7. ⚖️ Disputes & Resolution (`/disputes`)

A conflict management page for filing and tracking disputes between marketplace participants.

- **View all disputes** — shows all disputes community-wide for transparency
- **"+ File New Dispute" modal** — select the user to dispute against from a dropdown (yourself excluded), enter a text description of the issue
- Disputes submitted via the `/api/file-dispute` server-side API route
- Each dispute card shows: ID, Filed By name, Against name, Issue summary, Status badge, Date
- **Status lifecycle**: `raised` (blue) → `in-mediation` (yellow) → `resolved` (green)
- **View Details** — modal with full dispute info including resolution text
- **Clear Resolved** — bulk deletes all resolved disputes from the list
- Voice assistant is excluded from this page

---

## 🤖 Cross-Cutting Features

### 🌐 Google Translate Integration
- Google Translate widget loaded globally via `GoogleTranslateLoader` at the root layout
- Farmers can translate the entire app interface into Hindi or other regional languages
- Critical for reaching rural, non-English-literate users

### 🎙️ Voice Assistant (Floating 🎤 Button)
Appears on every page (except `/disputes`) as a floating microphone button.

- Uses **Web Speech API** (`webkitSpeechRecognition`) with `hi-IN` (Hindi) language
- Listens continuously with real-time transcript display in a dialog
- **Intent Detection Logic**:
  - Words like "sell / selling / sale" → Opens the **List Item modal** in the marketplace
  - Words like "buy / find / search / purchase / market / shop" → Navigates to marketplace with extracted crop/item as search query pre-filled
- If already on the marketplace page, dispatches custom window events the page listens to
- If on another page, uses Next.js router to navigate to marketplace with URL params

### 🔔 Notification Bell
- Lives in the top navigation bar
- Pulls unread notifications from the `notifications` table in Supabase
- Notifications are created automatically when an exchange status changes (accepted/rejected/in_transit)
- Clicking the bell shows the list; notifications can be individually marked as read

### 📈 Live Mandi Price Ticker
- Fetches from `api.data.gov.in` — India's official open government data platform
- Caches in `localStorage` for 12 hours to reduce API calls
- Merges new data with cached data (deduped by commodity + state key)
- Used in two places:
  1. **Dashboard ticker** — continuously scrolling banner
  2. **Marketplace listing form** — suggests fair price based on crop name and region

---

## 🗄️ Database Schema (Supabase / PostgreSQL)

| Table | Key Columns | Purpose |
|---|---|---|
| `profiles` | `id`, `full_name`, `role`, `phone`, `phone_verified`, `village`, `district`, `state`, `trust_score`, `total_completed`, `total_failed`, `photo_url` | User data & trust metrics |
| `produce_listings` | `id`, `farmer_id`, `crop_name`, `quantity`, `unit`, `price_per_kg`, `quality_grade`, `location`, `status`, `listing_type`, `condition`, `rental_price_per_day`, `latitude`, `longitude`, `address`, `image_url` | All crop and tool listings |
| `exchange_requests` | `id`, `listing_id`, `buyer_id`, `quantity_requested`, `offer_type`, `offer_crop_name`, `offer_quantity`, `offer_unit`, `status`, `created_at` | All exchange/barter requests |
| `notifications` | `id`, `user_id`, `message`, `read`, `created_at` | In-app notifications |
| `disputes` | `id`, `filed_by`, `against_user_id`, `issue`, `status`, `resolution`, `created_at` | Dispute records |

---

## 🔐 Trust Score Algorithm

Trust scores are computed every time a transaction is marked completed or rejected:

```
score = (total_completed / (total_completed + total_failed)) × 100
```

- **Default score** for new users: `50`
- Displayed as `X.X / 5` throughout the UI (raw score ÷ 20)
- Marketplace listings are **sorted by trust score descending** — most trusted farmers appear first
- Both buyer AND seller scores improve on `completed`
- Only the buyer's score is penalized on `rejected`

---

## 🛡️ Security & Auth

- All protected routes guarded by **Next.js Edge Middleware** using `@supabase/ssr`
- Session managed via **HTTP-only cookies** (no client-side token exposure)
- Phone OTP handled by server-side API routes — Twilio credentials never reach the browser
- Users cannot place exchange requests on their own listings (UI enforced)
- Storage paths are user-scoped: `/{userId}/listings/...` and `/{userId}/photo.jpg`
- Signed URLs (10-year expiry) used for all uploaded media

---

## 📱 Responsive Design

- Fully mobile-responsive using Tailwind CSS breakpoints (`sm:`, `md:`, `lg:`)
- Sidebar becomes a **slide-in drawer** on mobile with hamburger toggle in the top bar
- Map, modals, and card grids all adapt to viewport size
- Cards switch from 3-column grid (desktop) → 2-column → single column (mobile)

---

## 🎨 Design System

The app uses a premium, agriculture-themed green design language:

- **Primary color**: Emerald/Forest Green
- **Accent**: Amber/Gold
- **Style**: Glassmorphism — semi-transparent cards with `backdrop-blur`, frosted panels
- **Background**: Decorative blurred orb gradients (green + amber/gold) for depth
- **Fonts**: Poppins (bold headings) + Inter (body text)
- **Animations**:
  - Fade-in-up stagger animations on page load
  - Pulse effect on live price indicator
  - CSS `@keyframes ticker` for the mandi scroll
  - Smooth hover transitions on all cards and buttons
- **Color-coded statuses**: pending (amber), accepted (blue), in_transit (purple), completed (green), rejected (red)

---

## 🌟 Summary: What Makes Krishi Exchange Unique

| Feature | Why It Matters |
|---|---|
| **Barter-first marketplace** | Not just buying/selling — real crop-for-crop or crop-for-tool exchange |
| **Trust Score ecosystem** | Quantified reputation built from actual transaction history |
| **Live mandi pricing** | Real government open-data for fair price discovery |
| **Voice assistant in Hindi** | Accessible to non-tech-savvy, rural farmers |
| **Camera-mandatory listings** | Forces authentic listings with real photos — no fake entries |
| **Dispute resolution module** | Transparent, structured conflict handling |
| **End-to-end transaction lifecycle** | Pending → Accepted → In Transit → Completed |
| **Location-aware** | GPS + geocoding for proximity-sorted marketplace |
| **Multi-language via Google Translate** | Truly rural-accessible |
| **No middlemen** | Direct farmer-to-farmer and farmer-to-buyer connections |

---
