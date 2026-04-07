"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const redirectTo = formData.get("redirectTo") as string | null;

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/", "layout");
  redirect(redirectTo && redirectTo !== "/login" ? redirectTo : "/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const firstName = formData.get("first-name") as string;
  const lastName = formData.get("last-name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = (formData.get("role") as string) || "farmer";
  const phone = (formData.get("phone") as string) || null;
  const village = (formData.get("village") as string) || null;
  const district = (formData.get("district") as string) || null;
  const state = (formData.get("state") as string) || null;

  const full_name = `${firstName} ${lastName}`.trim();

  // 1️⃣ Create the auth user
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name,
      },
    },
  });

  if (signUpError) {
    redirect("/signup?error=" + encodeURIComponent(signUpError.message));
  }

  // 2️⃣ Insert profile row immediately (user might not have confirmed email yet,
  //    but their UUID is available in authData.user)
  const userId = authData.user?.id;
  if (userId) {
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name,
        role,
        phone,
        village,
        district,
        state,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      // Log but don't block — user is already created in auth
      console.error("Profile insert error:", profileError.message);
    }
  }

  revalidatePath("/", "layout");
  redirect(
    "/login?message=" +
      encodeURIComponent("Check your email to confirm your account"),
  );
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
