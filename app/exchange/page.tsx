"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { generateContractPDF } from "@/lib/generateContract";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExchangeRequest {
  id: string;
  listing_id: string;
  buyer_id: string;
  quantity_requested: number;
  offer_type: "crop" | "tool";
  offer_crop_name: string | null;
  offer_quantity: number | null;
  offer_unit: string | null;
  status: "pending" | "accepted" | "rejected" | "in_transit" | "completed";
  created_at: string;
  produce_listings?: {
    crop_name: string;
    unit: string;
    price_per_kg: number;
    location: string;
    quality_grade: string;
    farmer_id: string;
    listing_type: "crop" | "tool";
  };
  profiles?: {
    full_name: string | null;
    phone: string | null;
    role: string | null;
  };
}

type StatusFilter =
  | "all"
  | "pending"
  | "accepted"
  | "in_transit"
  | "completed"
  | "rejected";

type PageTab = "incoming" | "mine";

// ── Static crop price map (INR/kg) for offer value scoring ────────────────────
const CROP_PRICE_MAP: Record<string, number> = {
  wheat: 22,
  rice: 35,
  corn: 18,
  maize: 18,
  cotton: 60,
  sugarcane: 4,
  sugar: 40,
  vegetables: 25,
  veg: 25,
  pulses: 80,
  dal: 80,
  spices: 150,
  fruits: 50,
  fruit: 50,
  soybean: 45,
  groundnut: 55,
  mustard: 50,
  onion: 20,
  potato: 15,
  tomato: 18,
};

function estimateCropPrice(name: string): number {
  if (!name) return 20;
  const lower = name.toLowerCase();
  for (const [key, price] of Object.entries(CROP_PRICE_MAP)) {
    if (lower.includes(key)) return price;
  }
  return 20; // default fallback
}

function computeOfferScore(ex: ExchangeRequest): number {
  if (!ex.offer_crop_name) return 0;
  if (ex.offer_type === "tool") return 500; // tools are high-value but hard to price
  const qty = ex.offer_quantity ?? 0;
  const price = estimateCropPrice(ex.offer_crop_name);
  // Normalize by unit
  const unit = (ex.offer_unit ?? "kg").toLowerCase();
  const multiplier = unit === "quintal" ? 100 : unit === "ton" ? 1000 : 1;
  return qty * multiplier * price;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100/60 text-yellow-700 border-yellow-300";
    case "accepted":
      return "bg-blue-100/60 text-blue-700 border-blue-300";
    case "in_transit":
      return "bg-purple-100/60 text-purple-700 border-purple-300";
    case "completed":
      return "bg-green-100/60 text-green-700 border-green-300";
    case "rejected":
      return "bg-red-100/60 text-red-700 border-red-300";
    default:
      return "bg-gray-100/60 text-gray-700 border-gray-300";
  }
}

function statusLabel(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemEmoji(name = "", listingType: "crop" | "tool" = "crop"): string {
  const n = name.toLowerCase();
  if (listingType === "tool") {
    if (n.includes("tractor")) return "🚜";
    if (n.includes("harvest")) return "🌾";
    if (n.includes("plough") || n.includes("plow")) return "⚙️";
    if (n.includes("drill")) return "🔧";
    if (n.includes("spray")) return "💨";
    if (n.includes("thresh")) return "🔄";
    if (n.includes("trailer")) return "🚛";
    if (n.includes("pump") || n.includes("water")) return "💧";
    return "🔧";
  }
  if (n.includes("wheat")) return "🌾";
  if (n.includes("rice")) return "🍚";
  if (n.includes("corn") || n.includes("maize")) return "🌽";
  if (n.includes("cotton")) return "☁️";
  if (n.includes("sugar")) return "🍃";
  if (n.includes("veg")) return "🥕";
  if (n.includes("fruit")) return "🍎";
  if (n.includes("pulse") || n.includes("dal")) return "🫘";
  if (n.includes("spice")) return "🌶️";
  return "🌱";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatScore(score: number): string {
  if (score >= 100000) return `₹${(score / 1000).toFixed(0)}K`;
  if (score >= 1000) return `₹${(score / 1000).toFixed(1)}K`;
  return `₹${score.toFixed(0)}`;
}

// ── Trust Score Helper ─────────────────────────────────────────────────────────
async function updateTrustScore(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  outcome: "completed" | "failed",
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_completed, total_failed")
    .eq("id", userId)
    .single();

  if (!profile) return;

  const completed =
    (profile.total_completed ?? 0) + (outcome === "completed" ? 1 : 0);
  const failed = (profile.total_failed ?? 0) + (outcome === "failed" ? 1 : 0);
  const total = completed + failed;
  const score = total > 0 ? (completed / total) * 100 : 50;

  await supabase
    .from("profiles")
    .update({
      trust_score: score,
      total_completed: completed,
      total_failed: failed,
    })
    .eq("id", userId);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ExchangePage() {
  const supabase = createClient();

  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [activeTab, setActiveTab] = useState<PageTab>("incoming");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ── Download contract PDF ──────────────────────────────────────────────────
  const downloadContract = async (ex: ExchangeRequest) => {
    setDownloadingId(ex.id);
    try {
      // Fetch full buyer profile
      const { data: buyerProfile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", ex.buyer_id)
        .single();

      // Fetch farmer profile
      const farmerId = ex.produce_listings?.farmer_id;
      const { data: farmerProfile } = farmerId
        ? await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("id", farmerId)
            .single()
        : { data: null };

      const contractId = `KE-${ex.id.slice(0, 8).toUpperCase()}`;
      const date = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      generateContractPDF({
        contractId,
        date,
        farmerName: farmerProfile?.full_name ?? `Farmer ${farmerId?.slice(0, 6).toUpperCase() ?? "—"}`,
        farmerPhone: farmerProfile?.phone,
        farmerLocation: ex.produce_listings?.location,
        buyerName: buyerProfile?.full_name ?? ex.profiles?.full_name ?? `Buyer ${ex.buyer_id.slice(0, 6).toUpperCase()}`,
        buyerPhone: buyerProfile?.phone ?? ex.profiles?.phone,
        cropName: ex.produce_listings?.crop_name ?? "—",
        quantityRequested: ex.quantity_requested,
        unit: ex.produce_listings?.unit ?? "kg",
        pricePerKg: ex.produce_listings?.price_per_kg ?? 0,
        quality: ex.produce_listings?.quality_grade,
        listingType: ex.produce_listings?.listing_type ?? "crop",
        offerCropName: ex.offer_crop_name,
        offerQuantity: ex.offer_quantity ?? undefined,
        offerUnit: ex.offer_unit ?? undefined,
        offerType: ex.offer_type ?? undefined,
        status: ex.status,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Get current user ────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ── Fetch exchanges ─────────────────────────────────────────────────────────
  const fetchExchanges = useCallback(async () => {
    setLoadingData(true);
    setFetchError(null);

    let query = supabase
      .from("exchange_requests")
      .select(
        `
        *,
        produce_listings (
          crop_name,
          unit,
          price_per_kg,
          location,
          quality_grade,
          farmer_id,
          listing_type
        ),
        profiles (
          full_name,
          phone,
          role
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (activeFilter !== "all") query = query.eq("status", activeFilter);

    const { data, error } = await query;
    if (error) {
      setFetchError(error.message);
      setLoadingData(false);
      return;
    }

    setExchanges((data ?? []) as ExchangeRequest[]);
    setLoadingData(false);
  }, [activeFilter]);

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  // ── Filter to current user only ─────────────────────────────────────────────
  const userExchanges = useMemo(() => {
    if (!currentUserId) return [];
    return exchanges.filter(
      (ex) =>
        ex.buyer_id === currentUserId ||
        ex.produce_listings?.farmer_id === currentUserId,
    );
  }, [exchanges, currentUserId]);

  // ── Split into incoming (farmer) and outgoing (buyer) ──────────────────────
  const incomingRequests = useMemo(
    () =>
      userExchanges.filter(
        (ex) => ex.produce_listings?.farmer_id === currentUserId,
      ),
    [userExchanges, currentUserId],
  );

  const myRequests = useMemo(
    () => userExchanges.filter((ex) => ex.buyer_id === currentUserId),
    [userExchanges, currentUserId],
  );

  // ── Group incoming requests by listing ─────────────────────────────────────
  const incomingGrouped = useMemo(() => {
    const groups: Record<string, ExchangeRequest[]> = {};
    for (const ex of incomingRequests) {
      const key = ex.listing_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ex);
    }
    // Sort each group by offer score descending
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => computeOfferScore(b) - computeOfferScore(a));
    }
    return groups;
  }, [incomingRequests]);

  // ── Update exchange status ──────────────────────────────────────────────────
  const updateStatus = async (id: string, newStatus: string) => {
    setActionLoading(id);
    const { error } = await supabase
      .from("exchange_requests")
      .update({ status: newStatus })
      .eq("id", id);

    if (!error) {
      setExchanges((prev) =>
        prev.map((ex) =>
          ex.id === id
            ? { ...ex, status: newStatus as ExchangeRequest["status"] }
            : ex,
        ),
      );

      const notifyMessages: Record<string, string> = {
        accepted: "Your buy request for {crop} has been accepted",
        rejected: "Your buy request for {crop} has been rejected",
        in_transit: "Your order for {crop} is now in transit",
      };

      if (notifyMessages[newStatus]) {
        const exchange = exchanges.find((ex) => ex.id === id);
        if (exchange) {
          const cropName = exchange.produce_listings?.crop_name ?? "your item";
          const message = notifyMessages[newStatus].replace("{crop}", cropName);
          await supabase.from("notifications").insert({
            user_id: exchange.buyer_id,
            message,
          });
        }
      }

      if (newStatus === "completed") {
        const exchange = exchanges.find((ex) => ex.id === id);
        if (exchange) {
          const { data: listing } = await supabase
            .from("produce_listings")
            .select("quantity")
            .eq("id", exchange.listing_id)
            .single();

          if (listing) {
            const newQty = listing.quantity - exchange.quantity_requested;
            if (newQty <= 0) {
              await supabase
                .from("produce_listings")
                .update({ quantity: 0, status: "sold_out" })
                .eq("id", exchange.listing_id);
            } else {
              await supabase
                .from("produce_listings")
                .update({ quantity: newQty })
                .eq("id", exchange.listing_id);
            }
          }

          const farmerId = exchange.produce_listings?.farmer_id;
          if (farmerId) await updateTrustScore(supabase, farmerId, "completed");
          await updateTrustScore(supabase, exchange.buyer_id, "completed");
        }
      }

      if (newStatus === "rejected") {
        const exchange = exchanges.find((ex) => ex.id === id);
        if (exchange) {
          await updateTrustScore(supabase, exchange.buyer_id, "failed");
        }
      }
    }
    setActionLoading(null);
  };

  const filters: StatusFilter[] = [
    "all",
    "pending",
    "accepted",
    "in_transit",
    "completed",
    "rejected",
  ];

  const activeList = activeTab === "incoming" ? incomingRequests : myRequests;
  const isEmpty = !loadingData && !fetchError && activeList.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              My Exchanges
            </h1>
            <p className="text-muted-foreground mt-2">
              View and manage requests on your listings and your own offers
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchExchanges}
            disabled={loadingData}>
            {loadingData ? "Refreshing…" : "↺ Refresh"}
          </Button>
        </div>

        {/* Page Tabs — Incoming vs My Requests */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit border border-border">
          <button
            onClick={() => setActiveTab("incoming")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "incoming"
                ? "bg-background shadow text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            📥 Incoming
            {incomingRequests.length > 0 && (
              <span className="ml-2 text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                {incomingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("mine")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "mine"
                ? "bg-background shadow text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            📤 My Requests
            {myRequests.length > 0 && (
              <span className="ml-2 text-xs bg-blue-500/15 text-blue-600 px-1.5 py-0.5 rounded-full">
                {myRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <Button
              key={f}
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter(f)}
              className={
                activeFilter === f
                  ? "bg-primary/10 border-primary text-primary"
                  : ""
              }>
              {f === "all" ? "All" : statusLabel(f)}
            </Button>
          ))}
        </div>

        {/* Loading */}
        {loadingData && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
            <svg
              className="animate-spin h-6 w-6 text-primary"
              viewBox="0 0 24 24"
              fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            Loading exchanges...
          </div>
        )}

        {/* Error */}
        {fetchError && !loadingData && (
          <div className="text-center py-16 text-destructive">
            <p className="text-lg font-semibold">Failed to load exchanges</p>
            <p className="text-sm mt-1">{fetchError}</p>
            <Button variant="outline" className="mt-4" onClick={fetchExchanges}>
              Retry
            </Button>
          </div>
        )}

        {/* Empty */}
        {isEmpty && (
          <div className="text-center py-24 text-muted-foreground">
            <div className="text-6xl mb-4">
              {activeTab === "incoming" ? "📭" : "📤"}
            </div>
            <p className="text-lg font-semibold text-foreground">
              {activeTab === "incoming"
                ? "No incoming requests"
                : "No outgoing requests"}
            </p>
            <p className="text-sm mt-1">
              {activeTab === "incoming"
                ? activeFilter !== "all"
                  ? `No ${statusLabel(activeFilter).toLowerCase()} requests on your listings.`
                  : "When buyers request your listed items, they'll appear here."
                : activeFilter !== "all"
                  ? `No ${statusLabel(activeFilter).toLowerCase()} requests you made.`
                  : "Requests you place on the marketplace will appear here."}
            </p>
          </div>
        )}

        {/* ── INCOMING TAB — grouped by listing ─────────────────────────── */}
        {!loadingData && !fetchError && activeTab === "incoming" && incomingRequests.length > 0 && (
          <div className="space-y-8">
            {Object.entries(incomingGrouped).map(([listingId, requests]) => {
              const sampleCrop = requests[0]?.produce_listings;
              const topScore = computeOfferScore(requests[0]);

              return (
                <div key={listingId} className="space-y-3">
                  {/* Listing group header */}
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {itemEmoji(sampleCrop?.crop_name, sampleCrop?.listing_type)}
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        {sampleCrop?.crop_name ?? "Listing"}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        📍 {sampleCrop?.location ?? "—"} ·{" "}
                        {sampleCrop?.quality_grade ?? "—"} ·{" "}
                        {requests.length} request{requests.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1 rounded-full">
                      Sorted by best offer ↓
                    </span>
                  </div>

                  {/* Request cards within this listing */}
                  <div className="space-y-3">
                    {requests.map((ex, idx) => {
                      const score = computeOfferScore(ex);
                      const isBest = idx === 0 && topScore > 0 && requests.length > 1;
                      const isLoading = actionLoading === ex.id;
                      const buyer = ex.profiles;
                      const buyerName =
                        buyer?.full_name ||
                        `User ${ex.buyer_id.slice(0, 6).toUpperCase()}`;
                      const buyerInitial = buyerName.charAt(0).toUpperCase();

                      return (
                        <Card
                          key={ex.id}
                          className={`border-border hover:shadow-md transition-shadow ${isBest ? "ring-2 ring-primary/30 bg-primary/[0.02]" : ""}`}>
                          <CardContent className="p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
                              {/* Buyer */}
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Buyer
                                </p>
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
                                    {buyerInitial}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-foreground text-sm truncate">
                                      {buyerName}
                                    </p>
                                    {buyer?.role && (
                                      <p className="text-xs text-muted-foreground capitalize">
                                        {buyer.role}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(ex.created_at)}
                                </p>
                              </div>

                              {/* Wants */}
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Wants
                                </p>
                                <p className="font-semibold text-foreground">
                                  {ex.quantity_requested} {sampleCrop?.unit ?? "units"}
                                </p>
                                {sampleCrop && (
                                  <p className="text-sm text-primary font-medium">
                                    ₹{(ex.quantity_requested * sampleCrop.price_per_kg).toLocaleString("en-IN")} est.
                                  </p>
                                )}
                              </div>

                              {/* Offering */}
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Offering In Exchange
                                </p>
                                {ex.offer_crop_name ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl">
                                      {itemEmoji(ex.offer_crop_name, ex.offer_type ?? "crop")}
                                    </span>
                                    <div>
                                      <p className="font-semibold text-foreground text-sm">
                                        {ex.offer_crop_name}
                                      </p>
                                      {ex.offer_type === "tool" ? (
                                        <p className="text-xs text-orange-600 font-medium">🚜 Tool</p>
                                      ) : (
                                        <p className="text-sm text-orange-600 font-medium">
                                          {ex.offer_quantity} {ex.offer_unit}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">No offer</p>
                                )}
                              </div>

                              {/* Offer Value + Best badge */}
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">
                                  Est. Offer Value
                                </p>
                                {score > 0 ? (
                                  <p className="font-bold text-foreground text-base">
                                    {formatScore(score)}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground italic">—</p>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  {isBest && (
                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 font-semibold">
                                      ⭐ Best Offer
                                    </span>
                                  )}
                                  <Badge variant="outline" className={statusColor(ex.status)}>
                                    {statusLabel(ex.status)}
                                  </Badge>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex flex-col gap-2">
                                {ex.status === "pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="flex-1 bg-primary hover:bg-primary/90"
                                      disabled={isLoading}
                                      onClick={() => updateStatus(ex.id, "accepted")}>
                                      {isLoading ? "…" : "Accept"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                      disabled={isLoading}
                                      onClick={() => updateStatus(ex.id, "rejected")}>
                                      {isLoading ? "…" : "Reject"}
                                    </Button>
                                  </div>
                                )}

                                {ex.status === "accepted" && (
                                  <Button
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700 text-white"
                                    disabled={isLoading}
                                    onClick={() => updateStatus(ex.id, "in_transit")}>
                                    {isLoading ? "…" : "🚚 Mark In Transit"}
                                  </Button>
                                )}

                                {ex.status === "completed" && (
                                  <span className="text-sm text-green-600 font-medium">
                                    ✔ Completed
                                  </span>
                                )}

                                {ex.status === "rejected" && (
                                  <span className="text-sm text-destructive font-medium">
                                    ✕ Rejected
                                  </span>
                                )}

                                {ex.status === "in_transit" && (
                                  <span className="text-sm text-purple-600 font-medium">
                                    🚚 In Transit
                                  </span>
                                )}

                                {(ex.status === "accepted" || ex.status === "in_transit" || ex.status === "completed") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-green-600 text-green-700 hover:bg-green-50 gap-1.5"
                                    disabled={downloadingId === ex.id}
                                    onClick={() => downloadContract(ex)}>
                                    {downloadingId === ex.id ? "Generating…" : "📄 Download Contract"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MY REQUESTS TAB ───────────────────────────────────────────── */}
        {!loadingData && !fetchError && activeTab === "mine" && myRequests.length > 0 && (
          <div className="space-y-4">
            {myRequests.map((ex) => {
              const crop = ex.produce_listings;
              const isLoading = actionLoading === ex.id;

              return (
                <Card
                  key={ex.id}
                  className="border-border hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
                      {/* Listing info */}
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">
                          {itemEmoji(crop?.crop_name, crop?.listing_type)}
                        </span>
                        <div>
                          <p className="font-bold text-foreground">
                            {crop?.crop_name ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📍 {crop?.location ?? "—"} · {crop?.quality_grade ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(ex.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* What I want */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          I Want
                        </p>
                        <p className="font-semibold text-foreground">
                          {ex.quantity_requested} {crop?.unit ?? "units"}
                        </p>
                        {crop && (
                          <p className="text-sm text-primary font-medium">
                            ₹{(ex.quantity_requested * crop.price_per_kg).toLocaleString("en-IN")} est.
                          </p>
                        )}
                      </div>

                      {/* My offer */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          My Offer
                        </p>
                        {ex.offer_crop_name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xl">
                              {itemEmoji(ex.offer_crop_name, ex.offer_type ?? "crop")}
                            </span>
                            <div>
                              <p className="font-semibold text-foreground text-sm">
                                {ex.offer_crop_name}
                              </p>
                              {ex.offer_type === "tool" ? (
                                <p className="text-xs text-orange-600 font-medium">🚜 Tool</p>
                              ) : (
                                <p className="text-sm text-orange-600 font-medium">
                                  {ex.offer_quantity} {ex.offer_unit}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No offer specified</p>
                        )}
                      </div>

                      {/* Status */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          Status
                        </p>
                        <Badge variant="outline" className={statusColor(ex.status)}>
                          {statusLabel(ex.status)}
                        </Badge>
                        {ex.status === "accepted" && (
                          <p className="text-xs text-blue-600 mt-1">
                            Seller accepted your request. Awaiting shipment.
                          </p>
                        )}
                        {ex.status === "rejected" && (
                          <p className="text-xs text-destructive mt-1">
                            Seller declined this request.
                          </p>
                        )}
                        {ex.status === "in_transit" && (
                          <p className="text-xs text-purple-600 mt-1">
                            Item is on its way to you.
                          </p>
                        )}
                      </div>

                      {/* Buyer action: mark received */}
                      <div className="flex flex-col gap-2">
                        {ex.status === "in_transit" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={isLoading}
                            onClick={() => updateStatus(ex.id, "completed")}>
                            {isLoading ? "…" : "✅ Mark Received"}
                          </Button>
                        )}

                        {ex.status === "completed" && (
                          <span className="text-sm text-green-600 font-medium">
                            ✔ Exchange completed
                          </span>
                        )}

                        {(ex.status === "accepted" || ex.status === "in_transit" || ex.status === "completed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-600 text-green-700 hover:bg-green-50 gap-1.5"
                            disabled={downloadingId === ex.id}
                            onClick={() => downloadContract(ex)}>
                            {downloadingId === ex.id ? "Generating…" : "📄 Download Contract"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
