"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuth = async () => {
      await supabase.auth.getSession();
      router.replace("/"); // redirect after login
    };

    handleAuth();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      Logging you in...
    </div>
  );
}
