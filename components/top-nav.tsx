"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";
import { NotificationBell } from "@/components/notification-bell";
import type { User } from "@supabase/supabase-js";
import HindiToggle from "@/components/hindi-toggle";
import { useRouter } from "next/navigation";

interface TopNavProps {
  onMenuClick: () => void;
}

export function TopNav({ onMenuClick }: TopNavProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // Get current session user
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const avatarUrl =
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  // Derive display name and avatar letter from user metadata or email
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Account";

  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <header className="glass-nav sticky top-0 z-40 shadow-sm shadow-green-900/5">
      <div className="h-[68px] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-5 w-full">
        {/* Hamburger Menu Button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-green-50 transition-colors flex-shrink-0"
          aria-label="Toggle menu">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Search Bar */}
        {/* <div className="flex-1 max-w-lg relative hidden sm:block">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-green-500/50 z-10"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search crops, prices, buyers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl nav-search-input text-sm text-green-900 placeholder:text-green-500/40 focus:outline-none transition-all"
          />
        </div> */}

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Notifications */}
          <NotificationBell userId={user?.id ?? null} />
          <div className="hidden sm:flex items-center gap-3">
            <HindiToggle />
          </div>
          {/* Messages */}
          <button
            className="p-2.5 rounded-xl hover:bg-green-50 transition-all duration-200 hover:shadow-sm hidden sm:block"
            title="Messages">
            <span className="text-xl">💬</span>
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              className="flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-full hover:bg-green-50 transition-all duration-200"
              title="User Menu"
              onClick={() => setMenuOpen((prev) => !prev)}>
              <div className="w-9 h-9 rounded-full overflow-hidden bg-primary flex items-center justify-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="User"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-primary-foreground font-bold text-sm">
                    {avatarLetter}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-foreground max-w-[100px] sm:max-w-[140px] truncate hidden sm:inline">
                {displayName}
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-green-600/50 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-56 max-w-sm glass-card rounded-2xl shadow-xl shadow-green-900/10 border border-green-100/40 overflow-hidden z-50 animate-scale-in">
                {user?.email && (
                  <div className="px-4 py-3 border-b border-green-100/30">
                    <p className="text-sm font-medium text-green-900 truncate">
                      {user.email}
                    </p>
                    <p className="text-[11px] text-green-600/50 mt-0.5">
                      Authenticated
                    </p>
                  </div>
                )}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-green-800 hover:bg-green-50 transition-colors flex items-center gap-2.5">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    My Profile
                  </button>
                  <div className="border-t border-green-100/30 my-1" />
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5 cursor-pointer">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close menu on outside click */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </header>
  );
}
