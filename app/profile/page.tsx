"use client";

import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { createClient } from "@/utils/supabase/client";

interface Profile {
  full_name: string | null;
  role: string | null;
  phone: string | null;
  phone_verified: boolean | null;
  village: string | null;
  district: string | null;
  state: string | null;
  trust_score: number | null;
  total_completed: number | null;
  total_failed: number | null;
  photo_url?: string | null;
}

export default function ProfilePage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userCreatedAt, setUserCreatedAt] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [avatarLetter, setAvatarLetter] = useState("U");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");

  // OTP verification state
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");
  const [devOtp, setDevOtp] = useState("");

  // Save feedback
  const [saveMessage, setSaveMessage] = useState("");

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email ?? "");
    setUserCreatedAt(user.created_at);

    const displayName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "User";
    setAvatarLetter(displayName.charAt(0).toUpperCase());

    const { data } = await supabase
      .from("profiles")
      .select(
        "full_name, role, phone, phone_verified, village, district, state, trust_score, total_completed, total_failed, photo_url",
      )
      .eq("id", user.id)
      .single();

    if (data) {
      const p = data as Profile;
      setProfile(p);
      setFullName(p.full_name ?? displayName);
      setPhone(p.phone ?? "");
      setVillage(p.village ?? "");
      setDistrict(p.district ?? "");
      setState(p.state ?? "");
      setPhotoUrl(p.photo_url ?? null);
    } else {
      setFullName(displayName);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    setSaveMessage("");

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        village,
        district,
        state,
      },
      { onConflict: "id" },
    );

    if (error) {
      setSaveMessage("Failed to save profile. Please try again.");
    } else {
      setSaveMessage("Profile saved successfully!");
      // Refresh profile data
      await loadProfile();
    }
    setSaving(false);
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleSendOtp = async () => {
    if (!otpPhone.trim()) {
      setOtpError("Please enter a valid phone number");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    setOtpMessage("");
    setDevOtp("");

    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: otpPhone }),
      });
      const data = await res.json();

      if (data.success) {
        setOtpStep("verify");
        setOtpMessage("OTP sent! Check your phone.");
        // In dev mode, the OTP is returned in the response
        if (data.otp_dev) {
          setDevOtp(data.otp_dev);
        }
      } else {
        setOtpError(data.message || "Failed to send OTP");
      }
    } catch {
      setOtpError("Network error. Please try again.");
    }
    setOtpLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Please enter the complete 6-digit OTP");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    setOtpMessage("");

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpValue }),
      });
      const data = await res.json();

      if (data.success) {
        setOtpMessage("Phone verified successfully! 🎉");
        setOtpDialogOpen(false);
        // Refresh profile
        await loadProfile();
      } else {
        setOtpError(data.message || "Verification failed");
      }
    } catch {
      setOtpError("Network error. Please try again.");
    }
    setOtpLoading(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  try {
    setUploadingPhoto(true);

    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();

    // ✅ FIXED: use folder = userId
    const filePath = `${userId}/${Math.random()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("krishi-user-photos")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // ✅ FIXED: same bucket
    const { data } = supabase.storage
      .from("krishi-user-photos")
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase.from("profiles").upsert(
      { id: userId, photo_url: data.publicUrl },
      { onConflict: "id" }
    );

    if (updateError) throw updateError;

    setPhotoUrl(data.publicUrl);
    await loadProfile();

  } catch (error: any) {
    console.error(error);
    alert("Error uploading photo: " + error.message);
  } finally {
    setUploadingPhoto(false);
  }
};

  const openOtpDialog = () => {
    setOtpStep("phone");
    setOtpPhone(phone || "");
    setOtpValue("");
    setOtpMessage("");
    setOtpError("");
    setDevOtp("");
    setOtpDialogOpen(true);
  };

  const score = profile?.trust_score ?? 50;
  const scoreOut5 = (score / 20).toFixed(1);
  const completed = profile?.total_completed ?? 0;
  const failed = profile?.total_failed ?? 0;
  const total = completed + failed;
  const role = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "Farmer";
  const phoneVerified = profile?.phone_verified === true;
  const registeredSince = userCreatedAt
    ? new Date(userCreatedAt).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      })
    : "—";

  function memberTier(s: number) {
    if (s >= 80)
      return {
        label: "Gold",
        color: "text-yellow-500",
        bg: "bg-yellow-500/10 border-yellow-500/30",
      };
    if (s >= 60)
      return {
        label: "Silver",
        color: "text-gray-400",
        bg: "bg-gray-400/10 border-gray-400/30",
      };
    if (s >= 40)
      return {
        label: "Bronze",
        color: "text-orange-500",
        bg: "bg-orange-500/10 border-orange-500/30",
      };
    return {
      label: "New",
      color: "text-muted-foreground",
      bg: "bg-muted/30 border-border",
    };
  }

  const tier = memberTier(score);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32 text-muted-foreground gap-3">
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
          Loading profile...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-4xl w-full overflow-x-hidden">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            My Profile
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">
            Manage your personal information and verification status
          </p>
        </div>

        {/* Profile Hero Card */}
        <Card className="border-border overflow-hidden">
          {/* Gradient Banner */}
          <div className="h-24 sm:h-32 bg-gradient-to-r from-primary via-primary/80 to-accent relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.08%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
          </div>

          <CardContent className="relative px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
            {/* Avatar */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 -mt-12 sm:-mt-16 mb-6">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-4xl sm:text-5xl font-bold shadow-xl border-4 border-background overflow-hidden relative">
                {photoUrl ? (
                  <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  avatarLetter
                )}
              </div>
              <div className="pb-2 flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-start">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    {fullName || "Your Name"}
                  </h2>
                  <Badge className={`${tier.bg} ${tier.color} border text-xs`}>
                    {tier.label} Member
                  </Badge>
                  {phoneVerified && (
                    <Badge className="bg-green-500/10 text-green-600 border border-green-500/30 text-xs">
                      ✓ Verified
                    </Badge>
                  )}
                  {!phoneVerified && (
                    <Badge className="bg-orange-500/10 text-orange-600 border border-orange-500/30 text-xs">
                      ⚠ Unverified
                    </Badge>
                  )}
                </div>
                <p className="text-sm sm:text-base text-muted-foreground mt-1">
                  {role} · Member since {registeredSince}
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-primary">
                  {scoreOut5}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Trust Score
                </p>
              </div>
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">
                  {total}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Transactions
                </p>
              </div>
              <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-green-600">
                  {completed}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Completed
                </p>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-red-500">
                  {failed}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Failed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verification Status Card */}
        <Card
          className={`border-2 transition-all ${phoneVerified ? "border-green-500/30 bg-green-500/[0.02]" : "border-orange-500/30 bg-orange-500/[0.02]"}`}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  {phoneVerified ? (
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-600 text-lg">
                      ✓
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/10 text-orange-600 text-lg">
                      !
                    </span>
                  )}
                  Identity Verification
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm">
                  {phoneVerified
                    ? "Your phone number has been verified. Your profile is trusted."
                    : "Verify your phone number via OTP to increase trust and unlock all features."}
                </CardDescription>
              </div>
              {!phoneVerified && (
                <Button
                  onClick={openOtpDialog}
                  className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 w-full sm:w-auto"
                  id="verify-phone-btn">
                  Verify Now
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 p-3 bg-background rounded-lg border border-border">
                <span className="text-xl sm:text-2xl">📧</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                    {userEmail}
                  </p>
                </div>
                <Badge className="bg-green-500/10 text-green-600 border border-green-500/30 text-[10px]">
                  Verified
                </Badge>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 p-3 bg-background rounded-lg border border-border">
                <span className="text-xl sm:text-2xl">📱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    {profile?.phone || "Not set"}
                  </p>
                </div>
                {phoneVerified ? (
                  <Badge className="bg-green-500/10 text-green-600 border border-green-500/30 text-[10px]">
                    Verified
                  </Badge>
                ) : (
                  <Badge className="bg-orange-500/10 text-orange-600 border border-orange-500/30 text-[10px]">
                    Pending
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-2 p-3 bg-background rounded-lg border border-border">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl">📸</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Photo</p>
                    <p className="text-xs sm:text-sm font-medium text-foreground">
                      {photoUrl ? "Uploaded" : "Required"}
                    </p>
                  </div>
                  {photoUrl ? (
                    <Badge className="bg-green-500/10 text-green-600 border border-green-500/30 text-[10px]">
                      Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-orange-500/10 text-orange-600 border border-orange-500/30 text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>
                <div>
                  <Button asChild size="sm" variant="outline" className="w-full text-xs h-8 relative overflow-hidden" disabled={uploadingPhoto}>
                    <label className="cursor-pointer">
                      {uploadingPhoto ? "Uploading..." : (photoUrl ? "Change Photo" : "Upload Photo")}
                      <Input 
                        type="file" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                        disabled={uploadingPhoto}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                  </Button>
                </div>
              </div>
            </div>

            {/* Verification Progress */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Verification Progress
                </span>
                <span className="text-sm text-muted-foreground">
                  {phoneVerified ? "2" : "1"}/3 steps
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-primary to-accent rounded-full h-2.5 transition-all duration-500"
                  style={{ width: phoneVerified ? "66%" : "33%" }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span className="text-green-600 font-semibold">Email ✓</span>
                <span
                  className={
                    phoneVerified ? "text-green-600 font-semibold" : ""
                  }>
                  Phone {phoneVerified ? "✓" : "○"}
                </span>
                <span className={photoUrl ? "text-green-600 font-semibold" : ""}>
                  Photo {photoUrl ? "✓" : "○"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Profile Card */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your basic profile details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  className="text-sm font-semibold text-foreground"
                  htmlFor="profile-fullname">
                  Full Name
                </label>
                <Input
                  id="profile-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label
                  className="text-sm font-semibold text-foreground"
                  htmlFor="profile-email">
                  Email
                </label>
                <Input
                  id="profile-email"
                  value={userEmail}
                  disabled
                  className="mt-2 opacity-60"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Email cannot be changed
                </p>
              </div>
              <div>
                <label
                  className="text-sm font-semibold text-foreground"
                  htmlFor="profile-phone">
                  Phone Number
                </label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="profile-phone"
                    value={profile?.phone || phone}
                    disabled
                    className="flex-1 opacity-60"
                    placeholder="Verify to set phone"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openOtpDialog}
                    className="whitespace-nowrap"
                    id="change-phone-btn">
                    {phoneVerified ? "Change" : "Verify"}
                  </Button>
                </div>
              </div>
              <div>
                <label
                  className="text-sm font-semibold text-foreground"
                  htmlFor="profile-role">
                  Role
                </label>
                <Input
                  id="profile-role"
                  value={role}
                  disabled
                  className="mt-2 opacity-60"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Role is set during registration
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4">
                📍 Location Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label
                    className="text-sm text-muted-foreground"
                    htmlFor="profile-village">
                    Village / Town
                  </label>
                  <Input
                    id="profile-village"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className="mt-2"
                    placeholder="e.g. Suratgarh"
                  />
                </div>
                <div>
                  <label
                    className="text-sm text-muted-foreground"
                    htmlFor="profile-district">
                    District
                  </label>
                  <Input
                    id="profile-district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="mt-2"
                    placeholder="e.g. Amritsar"
                  />
                </div>
                <div>
                  <label
                    className="text-sm text-muted-foreground"
                    htmlFor="profile-state">
                    State
                  </label>
                  <Input
                    id="profile-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="mt-2"
                    placeholder="e.g. Punjab"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md hover:shadow-lg transition-all"
                id="save-profile-btn">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
              {saveMessage && (
                <p
                  className={`text-sm font-medium animate-in fade-in ${saveMessage.includes("success") ? "text-green-600" : "text-destructive"}`}>
                  {saveMessage}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OTP Verification Dialog */}
      <Dialog open={otpDialogOpen} onOpenChange={setOtpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📱 Phone Verification
            </DialogTitle>
            <DialogDescription>
              {otpStep === "phone"
                ? "Enter your phone number to receive a verification code."
                : "Enter the 6-digit OTP sent to your phone."}
            </DialogDescription>
          </DialogHeader>

          {otpStep === "phone" ? (
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="otp-phone-input">
                  Phone Number
                </label>
                <Input
                  id="otp-phone-input"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  className="mt-2"
                />
              </div>
              {otpError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {otpError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground text-center">
                  Code sent to{" "}
                  <span className="font-semibold text-foreground">
                    {otpPhone}
                  </span>
                </p>
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={(value) => setOtpValue(value)}
                  id="otp-input">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>

                {/* Dev mode OTP display */}
                {devOtp && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center w-full">
                    <p className="text-[10px] text-amber-600 font-medium">
                      DEV MODE — OTP:
                    </p>
                    <p className="text-2xl font-bold text-amber-700 tracking-[0.5em] font-mono">
                      {devOtp}
                    </p>
                  </div>
                )}
              </div>

              {otpMessage && (
                <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg text-center">
                  {otpMessage}
                </p>
              )}
              {otpError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg text-center">
                  {otpError}
                </p>
              )}

              <button
                onClick={() => {
                  setOtpStep("phone");
                  setOtpValue("");
                  setOtpError("");
                  setOtpMessage("");
                  setDevOtp("");
                }}
                className="text-sm text-primary hover:underline mx-auto block">
                ← Change phone number
              </button>
            </div>
          )}

          <DialogFooter>
            {otpStep === "phone" ? (
              <Button
                onClick={handleSendOtp}
                disabled={otpLoading}
                className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
                id="send-otp-btn">
                {otpLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Sending...
                  </span>
                ) : (
                  "Send OTP"
                )}
              </Button>
            ) : (
              <Button
                onClick={handleVerifyOtp}
                disabled={otpLoading || otpValue.length !== 6}
                className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
                id="verify-otp-btn">
                {otpLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Verifying...
                  </span>
                ) : (
                  "Verify OTP"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
