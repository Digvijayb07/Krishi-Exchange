"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { haversineDistance, formatDistance, geocodeAddress } from "@/lib/geo";
import dynamic from "next/dynamic";

// Leaflet uses `window` — must skip SSR
const MiniMarketMap = dynamic(() => import("@/components/mini-market-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-2xl border border-border bg-muted/30 flex items-center justify-center text-muted-foreground text-sm">
      Loading map…
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProduceListing {
  id: string;
  farmer_id: string;
  crop_name: string;
  quantity: number;
  unit: string;
  price_per_kg: number;
  quality_grade: string;
  location: string;
  status: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  image_url?: string | null;
  listing_type: "crop" | "tool";
  condition: string | null;
  rental_price_per_day: number | null;
  profiles?: {
    trust_score: number | null;
    full_name: string | null;
  };
}

interface ListingWithDistance extends ProduceListing {
  _distance?: number;
}

interface SellerDetails {
  full_name: string | null;
  phone: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  trust_score: number | null;
  total_completed: number | null;
  role: string | null;
}

interface ListingForm {
  listingType: "crop" | "tool";
  cropName: string;
  cropType: string;
  quantity: string;
  unit: string;
  price: string;
  quality: string;
  region: string;
  description: string;
  contactNumber: string;
  sellerAddress: string;
  // Tool-specific fields
  toolCondition: string;
  rentalPricePerDay: string;
}

interface BuyForm {
  quantity_requested: string;
  offer_type: "crop" | "tool";
  offer_crop_name: string;
  offer_quantity: string;
  offer_unit: string;
  // Tool offer fields
  offer_tool_condition: string;
}

interface SellerCoords {
  latitude: number | null;
  longitude: number | null;
  display_name: string;
}

interface BuyerLocation {
  latitude: number;
  longitude: number;
  label: string;
}

const defaultListingForm: ListingForm = {
  listingType: "crop",
  cropName: "",
  cropType: "",
  quantity: "",
  unit: "kg",
  price: "",
  quality: "",
  region: "",
  description: "",
  contactNumber: "",
  sellerAddress: "",
  toolCondition: "",
  rentalPricePerDay: "",
};

const defaultBuyForm: BuyForm = {
  quantity_requested: "",
  offer_type: "crop",
  offer_crop_name: "",
  offer_quantity: "",
  offer_unit: "kg",
  offer_tool_condition: "",
};

// ── Constants ──────────────────────────────────────────────────────────────────
const CROP_TYPES = [
  "Wheat",
  "Rice",
  "Corn",
  "Sugarcane",
  "Cotton",
  "Vegetables",
  "Pulses",
  "Spices",
  "Fruits",
  "Other",
];
const TOOL_TYPES = [
  "Tractor",
  "Harvester",
  "Plough",
  "Seed Drill",
  "Sprayer",
  "Thresher",
  "Rotavator",
  "Trailer",
  "Water Pump",
  "Other",
];
const TOOL_CONDITIONS = ["New", "Good", "Fair", "Needs Repair"];
const REGIONS = [
  "Punjab",
  "Haryana",
  "Madhya Pradesh",
  "Delhi NCR",
  "Uttar Pradesh",
  "Gujarat",
  "Maharashtra",
  "Rajasthan",
  "Bihar",
  "Other",
];
const QUALITIES = [
  "Grade A",
  "Grade B",
  "Premium",
  "Organic Certified",
  "Fresh",
  "High Sugar Content",
  "Standard",
];
const RADIUS_OPTIONS = [
  { label: "All distances", value: 0 },
  { label: "Within 10 km", value: 10 },
  { label: "Within 25 km", value: 25 },
  { label: "Within 50 km", value: 50 },
  { label: "Within 100 km", value: 100 },
];

type ListingTypeFilter = "all" | "crop" | "tool";

function itemEmoji(
  name: string,
  listingType: "crop" | "tool" = "crop",
): string {
  const n = name.toLowerCase();
  if (listingType === "tool") {
    if (n.includes("tractor")) return "🚜";
    if (n.includes("harvest")) return "🌾";
    if (n.includes("plough") || n.includes("plow")) return "⚙️";
    if (n.includes("drill")) return "🔧";
    if (n.includes("spray")) return "💨";
    if (n.includes("thresh")) return "🔄";
    if (n.includes("rotavator")) return "⚙️";
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

// ── Component ──────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const supabase = createClient();

  // Current user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // Listings state
  const [listings, setListings] = useState<ProduceListing[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Remove listing state
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // List-crop modal
  const [showListModal, setShowListModal] = useState(false);
  const [listForm, setListForm] = useState<ListingForm>(defaultListingForm);
  const [listSubmitted, setListSubmitted] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Seller geocoding state
  const [sellerCoords, setSellerCoords] = useState<SellerCoords>({
    latitude: null,
    longitude: null,
    display_name: "",
  });
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showSellerManualAddress, setShowSellerManualAddress] = useState(false); 

  // Buy-now modal
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<ProduceListing | null>(
    null,
  );
  const [buyForm, setBuyForm] = useState<BuyForm>(defaultBuyForm);
  const [buySubmitted, setBuySubmitted] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [showFairTradeCalc, setShowFairTradeCalc] = useState(false);

  // Mandi API (Market value suggestions)
  const [mandiRecords, setMandiRecords] = useState<any[]>([]);

  useEffect(() => {
    async function loadMandi() {
      try {
        let cachedRecords: any[] = [];
        let lastFetchTime = 0;
        const cachedStr = localStorage.getItem("mandi_prices_cache");
        
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          cachedRecords = parsed.records || [];
          lastFetchTime = parsed.timestamp || 0;
          setMandiRecords(cachedRecords);
        }

        const now = Date.now();
        // Fetch if older than 12 hours
        if (now - lastFetchTime > 12 * 60 * 60 * 1000 || cachedRecords.length === 0) {
          const res = await fetch(
            "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=579b464db66ec23bdd000001a7e2391ebe434c456bf495fca2f0faad&format=json&limit=6000",
          );
          const data = await res.json();
          if (data.records?.length) {
            // Merge maps by state+commodity to accumulate
            const mergedMap = new Map();
            cachedRecords.forEach(r => mergedMap.set(r.commodity + "-" + r.state, r));
            data.records.forEach((r: any) => mergedMap.set(r.commodity + "-" + r.state, r));
            
            const newRecords = Array.from(mergedMap.values());
            setMandiRecords(newRecords);
            localStorage.setItem("mandi_prices_cache", JSON.stringify({
              timestamp: now,
              records: newRecords
            }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch mandi prices", err);
      }
    }
    loadMandi();
  }, []);

  const getSuggestedPrice = (cropName: string, region: string) => {
    if (!cropName || typeof cropName !== "string") return null;
    const lowerCrop = cropName.toLowerCase();
    const lowerRegion = region ? region.toLowerCase() : "";

    let exactLocation = true;
    let match = mandiRecords.find(
      (r) =>
        r.commodity.toLowerCase().includes(lowerCrop) &&
        r.state.toLowerCase().includes(lowerRegion),
    );

    if (!match) {
      exactLocation = false;
      match = mandiRecords.find((r) =>
        r.commodity.toLowerCase().includes(lowerCrop),
      );
    }

    if (match) {
      const min = (match.min_price / 100).toFixed(1);
      const max = (match.max_price / 100).toFixed(1);
      const modal = (match.modal_price / 100).toFixed(1);
      return {
        range: `₹${min} - ₹${max}/kg`,
        modal: `₹${modal}/kg`,
        modalNumber: Number(modal),
        source: exactLocation ? `${match.market}, ${match.state}` : `National Avg`,
      };
    }
    
    // Baseline fallback for common crops entirely missing from API
    const BASELINE_PRICES: Record<string, number> = {
      wheat: 3000,
      rice: 4000,
      corn: 2500,
      maize: 2500,
      sugarcane: 400, // ≈ ₹4/kg
      cotton: 7000,
      vegetables: 3000,
      pulses: 8000,
      dal: 8000,
      spices: 15000,
      fruits: 5000,
      tomato: 3000,
      potato: 2000,
      onion: 2500,
      apple: 10000,
      banana: 3500,
    };

    for (const [key, pricePerQuintal] of Object.entries(BASELINE_PRICES)) {
      if (lowerCrop.includes(key)) {
        const min = ((pricePerQuintal * 0.9) / 100).toFixed(1);
        const max = ((pricePerQuintal * 1.1) / 100).toFixed(1);
        const modal = (pricePerQuintal / 100).toFixed(1);
        return {
          range: `₹${min} - ₹${max}/kg`,
          modal: `₹${modal}/kg`,
          modalNumber: Number(modal),
          source: `Baseline Estimate`,
        };
      }
    }

    return null;
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterQuality, setFilterQuality] = useState("");
  const [filterType, setFilterType] = useState<ListingTypeFilter>("all");
  const [showMyListings, setShowMyListings] = useState(false);

  // Buyer location state
  const [buyerLocation, setBuyerLocation] = useState<BuyerLocation | null>(
    null,
  );
  const [buyerLocLoading, setBuyerLocLoading] = useState(false);
  const [buyerLocError, setBuyerLocError] = useState<string | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [radiusFilter, setRadiusFilter] = useState(0); // 0 = all

  // Contact seller modal
  const [showContactModal, setShowContactModal] = useState(false);
  const [sellerDetails, setSellerDetails] = useState<SellerDetails | null>(
    null,
  );
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // ── Remove listing handler ──────────────────────────────────────────────────
  const handleRemoveListing = async (listingId: string) => {
    setRemovingId(listingId);
    setConfirmRemoveId(null);
    // Delete all exchange_requests for this listing first
    await supabase.from("exchange_requests").delete().eq("listing_id", listingId);
    // Delete the listing
    await supabase.from("produce_listings").delete().eq("id", listingId);
    // Refresh
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    setRemovingId(null);
  };

  // Listing camera capture state
  const [listingCameraOpen, setListingCameraOpen] = useState(false);
  const [listingCameraStream, setListingCameraStream] = useState<MediaStream | null>(null);
  const [listingCapturedImage, setListingCapturedImage] = useState<string | null>(null);
  const [listingCameraError, setListingCameraError] = useState("");
  const listingVideoRef = useRef<HTMLVideoElement>(null);
  const listingCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Listing camera functions ──────────────────────────────────────────────
  const openListingCamera = async () => {
    setListingCapturedImage(null);
    setListingCameraError("");
    setListingCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setListingCameraStream(stream);
      setTimeout(() => {
        if (listingVideoRef.current) listingVideoRef.current.srcObject = stream;
      }, 100);
    } catch (err: any) {
      setListingCameraError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access."
          : err.name === "NotFoundError"
            ? "No camera found on this device."
            : "Could not access camera: " + err.message
      );
    }
  };

  const stopListingCamera = () => {
    if (listingCameraStream) {
      listingCameraStream.getTracks().forEach((t) => t.stop());
      setListingCameraStream(null);
    }
    if (listingVideoRef.current) listingVideoRef.current.srcObject = null;
  };

  const closeListingCamera = () => {
    stopListingCamera();
    setListingCapturedImage(null);
    setListingCameraError("");
    setListingCameraOpen(false);
  };

  const captureListingPhoto = () => {
    if (!listingVideoRef.current || !listingCanvasRef.current) return;
    const video = listingVideoRef.current;
    const canvas = listingCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setListingCapturedImage(canvas.toDataURL("image/jpeg", 0.85));
    stopListingCamera();
    setListingCameraOpen(false);
  };

  // ── Fetch seller details ────────────────────────────────────────────────────
  const fetchSellerDetails = async (farmerId: string) => {
    setContactLoading(true);
    setContactError(null);
    setShowContactModal(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, phone, village, district, state, trust_score, total_completed, role",
        )
        .eq("id", farmerId)
        .single();

      if (error) {
        setContactError(error.message);
      } else {
        setSellerDetails(data as SellerDetails);
      }
    } catch (err) {
      setContactError("Failed to load seller details");
    } finally {
      setContactLoading(false);
    }
  };

  const closeContactModal = () => {
    setShowContactModal(false);
    setSellerDetails(null);
    setContactError(null);
  };

  // ── Fetch listings ──────────────────────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    setLoadingData(true);
    setFetchError(null);

    let query = supabase
      .from("produce_listings")
      .select("*, profiles!farmer_id(trust_score, full_name)")
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (filterType !== "all") query = query.eq("listing_type", filterType);
    if (filterRegion) query = query.eq("location", filterRegion);
    if (filterQuality) query = query.eq("quality_grade", filterQuality);
    if (searchQuery) query = query.ilike("crop_name", `%${searchQuery}%`);

    const { data, error } = await query;
    if (error) setFetchError(error.message);
    else {
      // Sort by farmer trust score (descending), then by created_at (descending)
      const sorted = (data ?? []).sort(
        (a: ProduceListing, b: ProduceListing) => {
          const scoreA = a.profiles?.trust_score ?? 50;
          const scoreB = b.profiles?.trust_score ?? 50;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        },
      );
      setListings(sorted);
    }
    setLoadingData(false);
  }, [filterRegion, filterQuality, filterType, searchQuery]);

  const searchParams = useSearchParams()

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    if (searchParams.get("openListModal")) {
      setShowListModal(true)
    }
    const queryParam = searchParams.get("query")
    if (queryParam) {
      setSearchQuery(queryParam)
    }
  }, [searchParams])

  useEffect(() => {
    const handleOpenListModal = () => setShowListModal(true)
    window.addEventListener("voice-assistant-open-list-modal", handleOpenListModal)
    return () => {
      window.removeEventListener("voice-assistant-open-list-modal", handleOpenListModal)
    }
  }, [])

  // ── Sorted & filtered listings by distance ─────────────────────────────────
  const sortedListings: ListingWithDistance[] = useMemo(() => {
    let items: ListingWithDistance[] = listings.map((l) => {
      const item: ListingWithDistance = { ...l };
      if (buyerLocation && l.latitude != null && l.longitude != null) {
        item._distance = haversineDistance(
          buyerLocation.latitude,
          buyerLocation.longitude,
          l.latitude,
          l.longitude,
        );
      }
      return item;
    });

    // Apply radius filter
    if (buyerLocation && radiusFilter > 0) {
      items = items.filter(
        (l) => l._distance !== undefined && l._distance <= radiusFilter,
      );
    }

    // Sort by distance (nearest first) if buyer location exists
    if (buyerLocation) {
      items.sort((a, b) => {
        // Listings with coords come first
        if (a._distance !== undefined && b._distance !== undefined)
          return a._distance - b._distance;
        if (a._distance !== undefined) return -1;
        if (b._distance !== undefined) return 1;
        return 0;
      });
    }

    return items;
  }, [listings, buyerLocation, radiusFilter]);

  // ── Seller location — GPS ───────────────────────────────────────────────────
  const handleSellerDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSellerCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          display_name: `GPS (${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°)`,
        });
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(
          err.code === 1
            ? "Location permission denied. Please allow or enter address manually."
            : "Could not detect location. Please enter address manually.",
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Seller location — Manual address geocoding ─────────────────────────────
  const handleSellerManualGeocode = async () => {
    if (!listForm.sellerAddress.trim()) {
      setGeoError("Please enter your address.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    const result = await geocodeAddress(listForm.sellerAddress);
    if (result) {
      setSellerCoords({
        latitude: result.latitude,
        longitude: result.longitude,
        display_name: result.display_name,
      });
    } else {
      setGeoError("Could not find this location. Try a more specific address.");
      setSellerCoords({ latitude: null, longitude: null, display_name: "" });
    }
    setGeoLoading(false);
  };

  // ── Buyer location — GPS ───────────────────────────────────────────────────
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setBuyerLocError("Geolocation is not supported by your browser.");
      return;
    }
    setBuyerLocLoading(true);
    setBuyerLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuyerLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          label: `GPS (${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°)`,
        });
        setBuyerLocLoading(false);
      },
      (err) => {
        setBuyerLocError(
          err.code === 1
            ? "Location permission denied. Please allow or enter manually."
            : "Could not detect location. Please enter manually.",
        );
        setBuyerLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Buyer location — Manual address ────────────────────────────────────────
  const handleManualGeocode = async () => {
    if (!manualAddress.trim()) return;
    setBuyerLocLoading(true);
    setBuyerLocError(null);
    const result = await geocodeAddress(manualAddress);
    if (result) {
      setBuyerLocation({
        latitude: result.latitude,
        longitude: result.longitude,
        label:
          result.display_name.length > 50
            ? result.display_name.slice(0, 50) + "…"
            : result.display_name,
      });
    } else {
      setBuyerLocError(
        "Could not find this location. Try a more specific address.",
      );
    }
    setBuyerLocLoading(false);
  };

  // ── List-crop modal handlers ────────────────────────────────────────────────
  const handleListChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => setListForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setListLoading(true);
    setListError(null);

    if (!listingCapturedImage) {
      setListError("📸 Please take a photo of your item before listing.");
      setListLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setListError("You must be signed in.");
      setListLoading(false);
      return;
    }

    // Ensure profile exists
    await supabase
      .from("profiles")
      .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });

    // Upload item photo
    let imageUrl: string | null = null;
    try {
      const photoRes = await fetch(listingCapturedImage);
      const photoBlob = await photoRes.blob();
      const photoPath = `${user.id}/listings/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("krishi-user-photos")
        .upload(photoPath, photoBlob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("krishi-user-photos")
        .createSignedUrl(photoPath, 60 * 60 * 24 * 365 * 10);
      if (signedUrlError || !signedUrlData?.signedUrl)
        throw signedUrlError || new Error("Failed to generate signed URL");
      imageUrl = signedUrlData.signedUrl;
    } catch (err: any) {
      setListError("Failed to upload photo: " + err.message);
      setListLoading(false);
      return;
    }

    const isTool = listForm.listingType === "tool";
    const { error } = await supabase.from("produce_listings").insert({
      farmer_id: user.id,
      listing_type: listForm.listingType,
      crop_name: listForm.cropName,
      quantity: isTool ? 1 : parseFloat(listForm.quantity),
      unit: isTool ? "piece" : listForm.unit,
      price_per_kg: parseFloat(listForm.price),
      quality_grade: isTool ? null : listForm.quality,
      condition: isTool ? listForm.toolCondition : null,
      rental_price_per_day:
        isTool && listForm.rentalPricePerDay
          ? parseFloat(listForm.rentalPricePerDay)
          : null,
      location: listForm.region,
      status: "available",
      latitude: sellerCoords.latitude ?? null,
      longitude: sellerCoords.longitude ?? null,
      address:
        listForm.sellerAddress.trim() || sellerCoords.display_name || null,
      image_url: imageUrl,
    });

    if (error) {
      setListError(error.message);
      setListLoading(false);
      return;
    }
    setListLoading(false);
    setListSubmitted(true);
    fetchListings();
  };

  const closeListModal = () => {
    setShowListModal(false);
    setListSubmitted(false);
    setListError(null);
    setListForm(defaultListingForm);
    setSellerCoords({ latitude: null, longitude: null, display_name: "" });
    setShowSellerManualAddress(false);
    setGeoError(null);
    stopListingCamera();
    setListingCapturedImage(null);
    setListingCameraError("");
  };

  // ── Buy-now modal handlers ──────────────────────────────────────────────────
  const openBuyModal = (listing: ProduceListing) => {
    setSelectedListing(listing);
    setBuyForm(defaultBuyForm);
    setBuySubmitted(false);
    setBuyError(null);
    setShowFairTradeCalc(false);
    setShowBuyModal(true);
  };

  const handleBuyChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (e.target.name === "offer_crop_name") setShowFairTradeCalc(false);
    setBuyForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleBuySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuyLoading(true);
    setBuyError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBuyError("You must be signed in to place an order.");
      setBuyLoading(false);
      return;
    }

    if (selectedListing && user.id === selectedListing.farmer_id) {
      setBuyError("You cannot place a request on your own listing.");
      setBuyLoading(false);
      return;
    }

    // Ensure buyer profile exists
    await supabase
      .from("profiles")
      .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });

    const qty = parseFloat(buyForm.quantity_requested);
    if (!selectedListing) return;

    if (qty > selectedListing.quantity) {
      setBuyError(
        `Only ${selectedListing.quantity} ${selectedListing.unit} available.`,
      );
      setBuyLoading(false);
      return;
    }

    const { error } = await supabase.from("exchange_requests").insert({
      listing_id: selectedListing.id,
      buyer_id: user.id,
      quantity_requested: qty,
      offer_type: buyForm.offer_type,
      offer_crop_name: buyForm.offer_crop_name || null,
      offer_quantity:
        buyForm.offer_type === "crop" && buyForm.offer_quantity
          ? parseFloat(buyForm.offer_quantity)
          : null,
      offer_unit:
        buyForm.offer_type === "crop" ? buyForm.offer_unit || null : "piece",
      status: "pending",
    });

    if (error) {
      setBuyError(error.message);
      setBuyLoading(false);
      return;
    }
    setBuyLoading(false);
    setBuySubmitted(true);
  };

  const closeBuyModal = () => {
    setShowBuyModal(false);
    setBuySubmitted(false);
    setBuyError(null);
    setSelectedListing(null);
    setShowFairTradeCalc(false);
    setBuyForm(defaultBuyForm);
  };

  // Spinner SVG helper
  const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
    <svg
      className={`animate-spin ${className}`}
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
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Marketplace</h1>
            <p className="text-muted-foreground mt-2">
              Browse and exchange crops, tools &amp; equipment
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowMyListings((v) => !v)}
              className={showMyListings ? "bg-primary/10 border-primary text-primary" : ""}>
              {showMyListings ? "🌐 All Listings" : "📋 My Listings"}
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => setShowListModal(true)}>
              + List Item
            </Button>
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-2">
          {[
            { label: "All", value: "all" as ListingTypeFilter },
            { label: "🌾 Crops", value: "crop" as ListingTypeFilter },
            {
              label: "🚜 Tools & Equipment",
              value: "tool" as ListingTypeFilter,
            },
          ].map((tab) => (
            <Button
              key={tab.value}
              variant="outline"
              size="sm"
              onClick={() => setFilterType(tab.value)}
              className={
                filterType === tab.value
                  ? "bg-primary/10 border-primary text-primary"
                  : ""
              }>
              {tab.label}
            </Button>
          ))}
        </div>

        {/* ── Find Nearby Sellers ─────────────────────────────────────────── */}
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📍</span>
              <h2 className="text-base font-semibold text-foreground">
                Find Nearby Sellers
              </h2>
              {buyerLocation && (
                <Badge
                  variant="outline"
                  className="bg-green-100/50 text-green-700 border-green-300 ml-auto text-xs">
                  📍 Nearest First
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDetectLocation}
                disabled={buyerLocLoading}
                className="gap-2">
                {buyerLocLoading ? <Spinner /> : <span>📡</span>}
                Detect My Location
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualAddress(!showManualAddress)}>
                ✏️ Enter Address Manually
              </Button>

              {buyerLocation && (
                <>
                  <select
                    className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm"
                    value={radiusFilter}
                    onChange={(e) => setRadiusFilter(Number(e.target.value))}>
                    {RADIUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground text-xs"
                    onClick={() => {
                      setBuyerLocation(null);
                      setRadiusFilter(0);
                      setBuyerLocError(null);
                    }}>
                    ✕ Clear Location
                  </Button>
                </>
              )}
            </div>

            {/* Manual address input */}
            {showManualAddress && (
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Enter your city, area, or full address..."
                  className="flex-1"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleManualGeocode();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualGeocode}
                  disabled={buyerLocLoading || !manualAddress.trim()}>
                  {buyerLocLoading ? <Spinner /> : "Search"}
                </Button>
              </div>
            )}

            {/* Location status */}
            {buyerLocation && (
              <p className="text-xs text-muted-foreground mt-2">
                📍 Your location:{" "}
                <span className="font-medium text-foreground">
                  {buyerLocation.label}
                </span>
              </p>
            )}
            {buyerLocError && (
              <p className="text-xs text-destructive mt-2">{buyerLocError}</p>
            )}
          </CardContent>
        </Card>

        {buyerLocation && (
          <MiniMarketMap
            listings={sortedListings}
            buyerLocation={buyerLocation}
            radiusKm={radiusFilter > 0 ? radiusFilter : 0}
            onMarkerClick={(listing) => {
              const full = listings.find((l) => l.id === listing.id);
              if (full) openBuyModal(full);
            }}
          />
        )}

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <Input
            type="search"
            placeholder="Search crops..."
            className="w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground"
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}>
            <option value="">All Regions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="px-4 py-2 rounded-lg border border-border bg-background text-foreground"
            value={filterQuality}
            onChange={(e) => setFilterQuality(e.target.value)}>
            <option value="">All Quality</option>
            {QUALITIES.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        {/* Loading */}
        {loadingData && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
            <Spinner className="h-6 w-6 text-primary" />
            Loading listings...
          </div>
        )}

        {/* Fetch Error */}
        {fetchError && !loadingData && (
          <div className="text-center py-16 text-destructive">
            <p className="text-lg font-semibold">Failed to load listings</p>
            <p className="text-sm mt-1">{fetchError}</p>
            <Button variant="outline" className="mt-4" onClick={fetchListings}>
              Retry
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!loadingData && !fetchError && sortedListings.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <div className="text-6xl mb-4">🌱</div>
            <p className="text-lg font-semibold text-foreground">
              {radiusFilter > 0
                ? "No listings within this radius"
                : "No listings found"}
            </p>
            <p className="text-sm mt-1">
              {radiusFilter > 0
                ? "Try increasing the distance radius or clearing the filter."
                : "Be the first to list your crop!"}
            </p>
            {radiusFilter > 0 ? (
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => setRadiusFilter(0)}>
                Show All Listings
              </Button>
            ) : (
              <Button
                className="mt-6 bg-primary hover:bg-primary/90"
                onClick={() => setShowListModal(true)}>
                + List Your Crops
              </Button>
            )}
          </div>
        )}

        {/* Section heading */}
        {!loadingData && sortedListings.length > 0 && buyerLocation && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Nearby Listings
            </h2>
            <span className="text-sm text-muted-foreground">
              — {sortedListings.length} result
              {sortedListings.length !== 1 ? "s" : ""}
              {radiusFilter > 0 ? ` within ${radiusFilter} km` : ""}
            </span>
          </div>
        )}

        {/* Crop Grid */}
        {!loadingData && (showMyListings ? sortedListings.filter(l => l.farmer_id === currentUserId) : sortedListings).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {(showMyListings ? sortedListings.filter(l => l.farmer_id === currentUserId) : sortedListings).map((listing) => (
              <Card
                key={listing.id}
                className="border-border overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                <CardContent className="p-6 flex flex-col flex-1">
                  {/* Fixed-height media area — keeps all cards aligned */}
                  <div className="h-44 mb-4 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    {listing.image_url ? (
                      <img src={listing.image_url} alt={listing.crop_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-6xl">
                        {itemEmoji(listing.crop_name, listing.listing_type)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    {listing.crop_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className={
                        listing.listing_type === "tool"
                          ? "text-[10px] px-1.5 py-0 bg-orange-100/50 text-orange-700 border-orange-300"
                          : "text-[10px] px-1.5 py-0 bg-emerald-100/50 text-emerald-700 border-emerald-300"
                      }>
                      {listing.listing_type === "tool" ? "🚜 Tool" : "🌾 Crop"}
                    </Badge>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {listing.profiles?.full_name ??
                        `ID: ${listing.farmer_id.slice(0, 8)}…`}
                    </p>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-yellow-100/50 text-yellow-700 border-yellow-300">
                      ⭐{" "}
                      {((listing.profiles?.trust_score ?? 50) / 20).toFixed(1)}
                      /5
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    {listing.listing_type === "crop" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Quantity:</span>
                        <span className="font-semibold text-foreground">
                          {listing.quantity} {listing.unit}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-bold text-primary">
                        ₹{listing.price_per_kg}/
                        {listing.listing_type === "tool"
                          ? "piece"
                          : listing.unit}
                      </span>
                    </div>
                    {listing.listing_type === "tool" &&
                      listing.rental_price_per_day && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Rental:</span>
                          <span className="font-bold text-orange-600">
                            ₹{listing.rental_price_per_day}/day
                          </span>
                        </div>
                      )}
                    {listing.listing_type === "tool" && listing.condition && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Condition:
                        </span>
                        <span className="text-foreground">
                          {listing.condition}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Region:</span>
                      <span className="text-foreground">
                        {listing.location}
                      </span>
                    </div>
                    {/* Distance row */}
                    {listing._distance !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Distance:</span>
                        <span className="font-semibold text-primary">
                          {formatDistance(listing._distance)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap flex-1">
                    {listing.listing_type === "crop" && (() => {
                      const sugg = getSuggestedPrice(listing.crop_name, listing.location);
                      if (!sugg) return null;
                      return (
                        <div className="w-full mb-2">
                          <span className="text-xs text-green-700 bg-green-50/80 px-2 py-1 rounded-md border border-green-200">
                            📊 Market Value: {sugg.modal} ({sugg.source})
                          </span>
                        </div>
                      );
                    })()}
                    {listing.listing_type === "crop" &&
                      listing.quality_grade && (
                        <Badge variant="outline" className="bg-secondary/50">
                          {listing.quality_grade}
                        </Badge>
                      )}
                    <Badge
                      variant="outline"
                      className="bg-green-100/50 text-green-700 border-green-300">
                      ● Available
                    </Badge>
                    {listing._distance !== undefined &&
                      listing._distance <= 25 && (
                        <Badge
                          variant="outline"
                          className="bg-blue-100/50 text-blue-700 border-blue-300">
                          📍 Nearby
                        </Badge>
                      )}
                  </div>

                  {currentUserId === listing.farmer_id ? (
                    <div className="mt-auto pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                          📋 Your Listing
                        </Badge>
                      </div>
                      {confirmRemoveId === listing.id ? (
                        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                          <p className="text-xs text-destructive font-medium">
                            ⚠️ Remove this listing? All pending requests will also be cancelled.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs"
                              onClick={() => setConfirmRemoveId(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              disabled={removingId === listing.id}
                              onClick={() => handleRemoveListing(listing.id)}>
                              {removingId === listing.id ? "Removing…" : "Yes, Remove"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                          onClick={() => setConfirmRemoveId(listing.id)}>
                          🗑 Remove Listing
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-auto pt-4 flex gap-2">
                      <Button
                        className="flex-1 bg-primary hover:bg-primary/90"
                        onClick={() => openBuyModal(listing)}>
                        Exchange
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => fetchSellerDetails(listing.farmer_id)}>
                        Contact
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LIST ITEM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showListModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeListModal();
          }}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-background z-10">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {listForm.listingType === "tool"
                    ? "List a Tool / Equipment"
                    : "List Your Crop"}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Fill in the details to list your{" "}
                  {listForm.listingType === "tool" ? "tool" : "crop"}
                </p>
              </div>
              <button
                onClick={closeListModal}
                className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg">
                ✕
              </button>
            </div>

            {listSubmitted ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-foreground">
                  Listing Live!
                </h3>
                <p className="text-muted-foreground mt-2">
                  <span className="font-semibold text-foreground">
                    {listForm.cropName}
                  </span>{" "}
                  is now visible on the marketplace.
                </p>
                <Button
                  className="mt-8 bg-primary hover:bg-primary/90"
                  onClick={closeListModal}>
                  Back to Marketplace
                </Button>
              </div>
            ) : (
              <form onSubmit={handleListSubmit} className="px-6 py-5 space-y-5">
                {listError && (
                  <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                    {listError}
                  </div>
                )}

                {/* Listing type toggle */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    What are you listing?{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setListForm((p) => ({ ...p, listingType: "crop" }))
                      }
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        listForm.listingType === "crop"
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}>
                      🌾 Crop
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setListForm((p) => ({ ...p, listingType: "tool" }))
                      }
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        listForm.listingType === "tool"
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}>
                      🚜 Tool / Equipment
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {listForm.listingType === "tool"
                      ? "Tool Name"
                      : "Crop Name"}{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="cropName"
                    value={listForm.cropName}
                    onChange={handleListChange}
                    placeholder={
                      listForm.listingType === "tool"
                        ? "e.g. Mahindra 575 Tractor"
                        : "e.g. Premium Basmati Rice"
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {listForm.listingType === "tool"
                      ? "Tool Type"
                      : "Crop Type"}{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <select
                    name="cropType"
                    value={listForm.cropType}
                    onChange={handleListChange}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">
                      Select{" "}
                      {listForm.listingType === "tool"
                        ? "tool type"
                        : "crop type"}
                    </option>
                    {(listForm.listingType === "tool"
                      ? TOOL_TYPES
                      : CROP_TYPES
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Crop-only: quantity + unit */}
                {listForm.listingType === "crop" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Quantity <span className="text-destructive">*</span>
                      </label>
                      <Input
                        name="quantity"
                        type="number"
                        min="1"
                        value={listForm.quantity}
                        onChange={handleListChange}
                        placeholder="e.g. 500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Unit
                      </label>
                      <select
                        name="unit"
                        value={listForm.unit}
                        onChange={handleListChange}
                        className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="kg">kg</option>
                        <option value="quintal">Quintal</option>
                        <option value="ton">Ton</option>
                        <option value="piece">Piece</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Tool-only: condition */}
                {listForm.listingType === "tool" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Condition <span className="text-destructive">*</span>
                    </label>
                    <select
                      name="toolCondition"
                      value={listForm.toolCondition}
                      onChange={handleListChange}
                      required
                      className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">Select condition</option>
                      {TOOL_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-foreground">
                      {listForm.listingType === "tool"
                        ? "Price (₹)"
                        : `Price per ${listForm.unit} (₹)`}{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    {listForm.listingType === "crop" && listForm.cropName && listForm.unit === "kg" && (() => {
                      const suggestion = getSuggestedPrice(listForm.cropName, listForm.region);
                      if (!suggestion) return null;
                      return (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200" title={`Based on Mandi prices from ${suggestion.source}`}>
                          💡 Market Avg: {suggestion.modal}
                        </span>
                      );
                    })()}
                  </div>
                  <Input
                    name="price"
                    type="number"
                    min="1"
                    value={listForm.price}
                    onChange={handleListChange}
                    placeholder={
                      listForm.listingType === "tool" ? "e.g. 50000" : "e.g. 25"
                    }
                    required
                  />
                </div>

                {/* Tool-only: rental price */}
                {listForm.listingType === "tool" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Rental Price per Day (₹){" "}
                      <span className="text-xs text-muted-foreground">
                        (optional)
                      </span>
                    </label>
                    <Input
                      name="rentalPricePerDay"
                      type="number"
                      min="1"
                      value={listForm.rentalPricePerDay}
                      onChange={handleListChange}
                      placeholder="e.g. 2000 — leave empty if not for rent"
                    />
                  </div>
                )}

                {/* Crop-only: quality grade */}
                {listForm.listingType === "crop" && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Quality Grade <span className="text-destructive">*</span>
                    </label>
                    <select
                      name="quality"
                      value={listForm.quality}
                      onChange={handleListChange}
                      required
                      className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">Select quality</option>
                      {QUALITIES.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Region <span className="text-destructive">*</span>
                  </label>
                  <select
                    name="region"
                    value={listForm.region}
                    onChange={handleListChange}
                    required
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">Select region</option>
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ── Location Details Section ─────────────────────────────── */}
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">📍</span>
                    <h3 className="text-sm font-semibold text-foreground">
                      Location Details
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      (helps buyers find you nearby)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSellerDetectLocation}
                      disabled={geoLoading}
                      className="gap-2">
                      {geoLoading && !showSellerManualAddress ? (
                        <Spinner />
                      ) : (
                        <span>📡</span>
                      )}
                      Detect My Location
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShowSellerManualAddress(!showSellerManualAddress)
                      }>
                      ✏️ Enter Address Manually
                    </Button>

                    {sellerCoords.latitude !== null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground text-xs"
                        onClick={() => {
                          setSellerCoords({
                            latitude: null,
                            longitude: null,
                            display_name: "",
                          });
                          setGeoError(null);
                        }}>
                        ✕ Clear
                      </Button>
                    )}
                  </div>

                  {/* Manual address input */}
                  {showSellerManualAddress && (
                    <div className="flex gap-2 mt-3">
                      <Input
                        name="sellerAddress"
                        placeholder="Enter your village, city, or full address..."
                        className="flex-1"
                        value={listForm.sellerAddress}
                        onChange={handleListChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSellerManualGeocode();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSellerManualGeocode}
                        disabled={geoLoading || !listForm.sellerAddress.trim()}>
                        {geoLoading && showSellerManualAddress ? (
                          <Spinner />
                        ) : (
                          "Search"
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Location result */}
                  {sellerCoords.latitude !== null &&
                    sellerCoords.longitude !== null && (
                      <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm mt-3">
                        <p className="font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                          ✅ Location set
                        </p>
                        <p
                          className="text-xs text-muted-foreground mt-1 truncate"
                          title={sellerCoords.display_name}>
                          📍 {sellerCoords.display_name}
                        </p>
                      </div>
                    )}
                  {geoError && (
                    <p className="text-xs text-destructive mt-2">{geoError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Contact Number <span className="text-destructive">*</span>
                  </label>
                  <Input
                    name="contactNumber"
                    type="tel"
                    value={listForm.contactNumber}
                    onChange={handleListChange}
                    placeholder="e.g. +91 98765 43210"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Additional Details
                  </label>
                  <textarea
                    name="description"
                    value={listForm.description}
                    onChange={handleListChange}
                    rows={3}
                    placeholder="Freshness, harvest date, storage conditions..."
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                  />
                </div>

                {/* ── Item Photo (Mandatory) ───────────────────────────── */}
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">📸</span>
                    <h3 className="text-sm font-semibold text-foreground">
                      Item Photo <span className="text-destructive">*</span>
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      (take a live photo of your {listForm.listingType === "tool" ? "tool" : "crop"})
                    </span>
                  </div>

                  {listingCapturedImage ? (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-w-[300px]">
                        <img src={listingCapturedImage} alt="Item preview" className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <Badge variant="outline" className="bg-green-500/90 text-white border-0 text-xs">
                            ✓ Captured
                          </Badge>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={openListingCamera} className="gap-2">
                        🔄 Retake Photo
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openListingCamera}
                      className="w-full py-8 border-dashed border-2 hover:border-primary/50 transition-colors"
                      id="listing-take-photo-btn"
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <span className="text-3xl">📷</span>
                        <span className="text-sm font-medium">Take a Photo</span>
                        <span className="text-xs">Click to open camera and capture your item</span>
                      </div>
                    </Button>
                  )}
                </div>

                <div className="flex gap-3 pt-2 pb-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={closeListModal}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={listLoading}>
                    {listLoading ? (
                      <span className="flex items-center gap-2">
                        <Spinner />
                        Submitting...
                      </span>
                    ) : listForm.listingType === "tool" ? (
                      "List Tool"
                    ) : (
                      "List Crop"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* LISTING CAMERA DIALOG */}
      {listingCameraOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeListingCamera(); }}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">📷 Take Item Photo</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Capture a clear photo of your {listForm.listingType === "tool" ? "tool" : "crop"}
                </p>
              </div>
              <button onClick={closeListingCamera} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {listingCameraError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                  <p className="text-sm text-destructive">{listingCameraError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={closeListingCamera}>Close</Button>
                </div>
              )}
              {!listingCameraError && (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                  <video ref={listingVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {!listingCameraStream && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                      <Spinner className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-4 border-2 border-white/30 rounded-2xl pointer-events-none" />
                  <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center">
                    <span className="text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                      Point camera at your item
                    </span>
                  </div>
                </div>
              )}
              <canvas ref={listingCanvasRef} className="hidden" />
              {!listingCameraError && (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={closeListingCamera}>Cancel</Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={captureListingPhoto}
                    disabled={!listingCameraStream}
                    id="listing-capture-btn"
                  >
                    📸 Capture
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EXCHANGE MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showBuyModal && selectedListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeBuyModal();
          }}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Place Exchange Request
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Submit a request to the seller
                </p>
              </div>
              <button
                onClick={closeBuyModal}
                className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg">
                ✕
              </button>
            </div>

            {buySubmitted ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-foreground">
                  Request Sent!
                </h3>
                <p className="text-muted-foreground mt-2 max-w-xs">
                  Your request for{" "}
                  <span className="font-semibold text-foreground">
                    {buyForm.quantity_requested} {selectedListing.unit}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-foreground">
                    {selectedListing.crop_name}
                  </span>{" "}
                  in exchange for{" "}
                  <span className="font-semibold text-foreground">
                    {buyForm.offer_quantity} {buyForm.offer_unit}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-foreground">
                    {buyForm.offer_crop_name}
                  </span>{" "}
                  has been submitted. Track it in{" "}
                  <span className="font-semibold">Exchanges</span>.
                </p>
                <Button
                  className="mt-8 bg-primary hover:bg-primary/90"
                  onClick={closeBuyModal}>
                  Back to Marketplace
                </Button>
              </div>
            ) : (
              <form onSubmit={handleBuySubmit} className="px-6 py-6 space-y-5">
                {/* Item Summary */}
                <div className="rounded-xl bg-secondary/30 border border-border p-4 flex gap-4 items-center">
                  <span className="text-4xl">
                    {itemEmoji(
                      selectedListing.crop_name,
                      selectedListing.listing_type,
                    )}
                  </span>
                  <div>
                    <p className="font-bold text-foreground">
                      {selectedListing.crop_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedListing.location} ·{" "}
                      {selectedListing.listing_type === "tool"
                        ? selectedListing.condition
                        : selectedListing.quality_grade}
                    </p>
                    <p className="text-sm font-semibold text-primary mt-1">
                      ₹{selectedListing.price_per_kg}/
                      {selectedListing.listing_type === "tool"
                        ? "piece"
                        : selectedListing.unit}
                      {selectedListing.listing_type === "crop" && (
                        <>
                          {" "}
                          · Available: {selectedListing.quantity}{" "}
                          {selectedListing.unit}
                        </>
                      )}
                    </p>
                    {selectedListing.listing_type === "tool" &&
                      selectedListing.rental_price_per_day && (
                        <p className="text-sm font-semibold text-orange-600 mt-0.5">
                          ₹{selectedListing.rental_price_per_day}/day rental
                        </p>
                      )}
                    {/* Distance info in buy modal */}
                    {buyerLocation &&
                      selectedListing.latitude != null &&
                      selectedListing.longitude != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📍{" "}
                          {formatDistance(
                            haversineDistance(
                              buyerLocation.latitude,
                              buyerLocation.longitude,
                              selectedListing.latitude,
                              selectedListing.longitude,
                            ),
                          )}
                        </p>
                      )}
                  </div>
                </div>
                {selectedListing.listing_type === "crop" && (() => {
                  const sugg = getSuggestedPrice(selectedListing.crop_name, selectedListing.location);
                  if (!sugg) return null;
                  return (
                    <div className="bg-green-50/50 p-2.5 rounded-lg border border-green-100/60 flex items-center justify-between text-sm shadow-sm mt-1 mb-2 w-full">
                      <span className="text-green-800 font-medium tracking-tight">📊 Agmarknet Market Avg:</span>
                      <span className="font-bold text-green-700">{sugg.modal} <span className="font-normal text-[11px] text-green-600">({sugg.source})</span></span>
                    </div>
                  );
                })()}


                {buyError && (
                  <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                    {buyError}
                  </div>
                )}

                {/* Quantity Requested */}
                {selectedListing.listing_type === "crop" ? (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Quantity to Buy ({selectedListing.unit}){" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <Input
                      name="quantity_requested"
                      type="number"
                      min="1"
                      max={selectedListing.quantity}
                      step="0.01"
                      value={buyForm.quantity_requested}
                      onChange={handleBuyChange}
                      placeholder={`Max: ${selectedListing.quantity} ${selectedListing.unit}`}
                      required
                    />
                    {buyForm.quantity_requested && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Estimated total:{" "}
                        <span className="font-semibold text-foreground">
                          ₹
                          {(
                            parseFloat(buyForm.quantity_requested || "0") *
                            selectedListing.price_per_kg
                          ).toLocaleString("en-IN")}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <input type="hidden" name="quantity_requested" value="1" />
                )}

                {/* Barter Offer */}
                <div className="rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    🔄 What will you offer in exchange?
                  </p>

                  {/* Offer type toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setBuyForm((p) => ({
                          ...p,
                          offer_type: "crop",
                          offer_crop_name: "",
                        }))
                      }
                      className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                        buyForm.offer_type === "crop"
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}>
                      🌾 Offer a Crop
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBuyForm((p) => ({
                          ...p,
                          offer_type: "tool",
                          offer_crop_name: "",
                        }))
                      }
                      className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${
                        buyForm.offer_type === "tool"
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      }`}>
                      🚜 Offer a Tool
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {buyForm.offer_type === "tool"
                        ? "Tool to Offer"
                        : "Crop to Offer"}{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <select
                      name="offer_crop_name"
                      value={buyForm.offer_crop_name}
                      onChange={handleBuyChange}
                      required
                      className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <option value="">
                        Select {buyForm.offer_type === "tool" ? "tool" : "crop"}
                      </option>
                      {(buyForm.offer_type === "tool"
                        ? TOOL_TYPES
                        : CROP_TYPES
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {buyForm.offer_type === "crop" && buyForm.offer_crop_name && (() => {
                    const sugg = getSuggestedPrice(buyForm.offer_crop_name, "");
                    const requestedQty = parseFloat(buyForm.quantity_requested || "0");
                    if (!sugg || sugg.modalNumber <= 0 || requestedQty <= 0) return null;
                    
                    if (!showFairTradeCalc) {
                      return (
                        <div className="mt-2 mb-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 gap-2 w-full"
                            onClick={() => setShowFairTradeCalc(true)}
                          >
                            <span>📊</span> Check Agmarknet Market Value
                          </Button>
                        </div>
                      );
                    }
                    
                    const buyTotalValue = requestedQty * selectedListing.price_per_kg;
                    const recommendedKgs = (buyTotalValue / sugg.modalNumber).toFixed(2);
                    
                    return (
                      <div className="text-sm font-medium text-amber-900 bg-amber-50 p-2.5 rounded border border-amber-200 mt-2 mb-2 flex flex-col gap-1 shadow-sm animate-in fade-in zoom-in-95">
                        <span>⚖️ <strong>Fair Trade Hint:</strong> To match the ₹{buyTotalValue.toLocaleString("en-IN")} value of the crop you are requesting, you should offer approx <strong>{recommendedKgs} kg</strong> of {buyForm.offer_crop_name}.</span>
                        <span className="text-[11px] font-normal text-amber-700 leading-tight">
                          (Based on {buyForm.offer_crop_name} market avg of ₹{sugg.modalNumber}/kg vs requested value: ₹{buyTotalValue})
                        </span>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-fit text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 mt-1"
                          onClick={() => {
                            setBuyForm(prev => ({...prev, offer_quantity: recommendedKgs, offer_unit: 'kg'}));
                          }}
                        >
                          Use Suggestion 👇
                        </Button>
                      </div>
                    );
                  })()}

                  {/* Crop offer: quantity + unit */}
                  {buyForm.offer_type === "crop" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Quantity <span className="text-destructive">*</span>
                        </label>
                        <Input
                          name="offer_quantity"
                          type="number"
                          min="1"
                          step="0.01"
                          value={buyForm.offer_quantity}
                          onChange={handleBuyChange}
                          placeholder="e.g. 100"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Unit
                        </label>
                        <select
                          name="offer_unit"
                          value={buyForm.offer_unit}
                          onChange={handleBuyChange}
                          className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                          <option value="kg">kg</option>
                          <option value="quintal">Quintal</option>
                          <option value="ton">Ton</option>
                          <option value="piece">Piece</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Tool offer: condition */}
                  {buyForm.offer_type === "tool" && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Condition <span className="text-destructive">*</span>
                      </label>
                      <select
                        name="offer_tool_condition"
                        value={buyForm.offer_tool_condition}
                        onChange={handleBuyChange}
                        required
                        className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">Select condition</option>
                        {TOOL_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={closeBuyModal}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={buyLoading}>
                    {buyLoading ? (
                      <span className="flex items-center gap-2">
                        <Spinner />
                        Sending...
                      </span>
                    ) : (
                      "Send Exchange Request"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CONTACT SELLER MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showContactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeContactModal();
          }}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <span className="text-2xl">👤</span>
                  Seller Contact Info
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Get in touch with the seller
                </p>
              </div>
              <button
                onClick={closeContactModal}
                className="w-8 h-8 rounded-full hover:bg-background/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg">
                ✕
              </button>
            </div>

            <div className="p-6">
              {contactLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-sm text-muted-foreground">
                    Loading seller details...
                  </p>
                </div>
              )}

              {contactError && (
                <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-lg mb-4 flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  <span>{contactError}</span>
                </div>
              )}

              {sellerDetails && !contactLoading && (
                <div className="space-y-4">
                  {/* Name */}
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/30 border border-border">
                    <span className="text-2xl">👤</span>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">
                        Full Name
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        {sellerDetails.full_name || "Not provided"}
                      </p>
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <span className="text-2xl">📱</span>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">
                        Phone Number
                      </p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">
                        {sellerDetails.phone || "Not provided"}
                      </p>
                      {sellerDetails.phone && (
                        <a
                          href={`tel:${sellerDetails.phone}`}
                          className="text-xs text-primary hover:underline mt-1 inline-block">
                          Tap to call
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  {(sellerDetails.village ||
                    sellerDetails.district ||
                    sellerDetails.state) && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/30 border border-border">
                      <span className="text-2xl">📍</span>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-1">
                          Location
                        </p>
                        <p className="text-sm text-foreground">
                          {[
                            sellerDetails.village,
                            sellerDetails.district,
                            sellerDetails.state,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Not provided"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Role */}
                  {sellerDetails.role && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/30 border border-border">
                      <span className="text-2xl">💼</span>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-1">
                          Role
                        </p>
                        <p className="text-sm text-foreground capitalize">
                          {sellerDetails.role}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Trust Score */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Trust Score
                        </p>
                        <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          {((sellerDetails.trust_score ?? 50) / 20).toFixed(1)}
                          /5
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="text-base font-semibold text-foreground">
                        {sellerDetails.total_completed ?? 0} trades
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    {sellerDetails.phone && (
                      <>
                        <a
                          href={`tel:${sellerDetails.phone}`}
                          className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-center transition-colors">
                          📞 Call Now
                        </a>
                        <a
                          href={`sms:${sellerDetails.phone}`}
                          className="flex-1 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-center transition-colors">
                          💬 Send SMS
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )}

              {!sellerDetails && !contactLoading && !contactError && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No seller details available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
