import { createServerSupabase } from "../../shared/database";
import { signAccessToken, signRefreshToken } from "./auth.service";
import { getNovu } from "../../shared/novu";
import type { SSOProfile } from "../../config/passport";

interface SSOTokenPair {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: { id: string; email: string; role: string; firstName?: string; lastName?: string };
}

export async function findOrCreateSSOUser(profile: SSOProfile): Promise<SSOTokenPair> {
  const supabase = createServerSupabase();

  // 1. Check if this SSO provider link already exists
  const { data: existingLink } = await supabase
    .from("user_sso_providers")
    .select("user_id")
    .eq("provider", profile.provider)
    .eq("provider_user_id", profile.providerUserId)
    .single();

  if (existingLink) {
    // Existing SSO user — log them in
    return loginExistingUser(existingLink.user_id, false);
  }

  // 2. Check if email already exists in users table
  if (profile.email) {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", profile.email.toLowerCase())
      .single();

    if (existingUser) {
      // Link SSO provider to existing account
      await supabase.from("user_sso_providers").insert({
        user_id: existingUser.id,
        provider: profile.provider,
        provider_user_id: profile.providerUserId,
        provider_email: profile.email,
        provider_data: profile.rawData,
      });

      return loginExistingUser(existingUser.id, false);
    }
  }

  // 3. Create new user (SSO-only, no password, email already verified by provider)
  const { data: newUser, error: userError } = await supabase
    .from("users")
    .insert({
      email: profile.email.toLowerCase(),
      password_hash: null,
      role: "nurse",
      email_verified: true,
    })
    .select("id")
    .single();

  if (userError || !newUser) {
    throw new Error("Failed to create user account");
  }

  // Create nurse profile with basic info from SSO
  const { error: profileError } = await supabase
    .from("nurse_profiles")
    .insert({
      user_id: newUser.id,
      first_name: profile.firstName || "",
      last_name: profile.lastName || "",
      phone: "",
      country: "Philippines",
      location_type: "philippines",
      professional_status: "registered_nurse",
      years_of_experience: 0,
      profile_complete: false,
    });

  if (profileError) {
    // Rollback user creation
    await supabase.from("users").delete().eq("id", newUser.id);
    throw new Error("Failed to create nurse profile");
  }

  // Link SSO provider
  await supabase.from("user_sso_providers").insert({
    user_id: newUser.id,
    provider: profile.provider,
    provider_user_id: profile.providerUserId,
    provider_email: profile.email,
    provider_data: profile.rawData,
  });

  // Identify Novu subscriber
  const novu = getNovu();
  if (novu) {
    try {
      await novu.subscribers.identify(newUser.id, {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      await novu.topics.addSubscribers("nurses", { subscribers: [newUser.id] });
    } catch (err) {
      console.error("Novu subscriber identify failed:", err);
    }
  }

  const accessToken = signAccessToken({ id: newUser.id, email: profile.email, role: "nurse" });
  const refreshToken = signRefreshToken({ id: newUser.id });

  return {
    accessToken,
    refreshToken,
    isNewUser: true,
    user: {
      id: newUser.id,
      email: profile.email,
      role: "nurse",
      firstName: profile.firstName,
      lastName: profile.lastName,
    },
  };
}

async function loginExistingUser(userId: string, isNew: boolean): Promise<SSOTokenPair> {
  const supabase = createServerSupabase();

  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("User not found");
  }

  // Get nurse profile for name
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (user.role === "nurse") {
    const { data: profile } = await supabase
      .from("nurse_profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single();
    firstName = profile?.first_name;
    lastName = profile?.last_name;
  }

  // Identify Novu subscriber
  const novu = getNovu();
  if (novu) {
    try {
      await novu.subscribers.identify(user.id, {
        email: user.email,
        firstName,
        lastName,
      });
    } catch (err) {
      console.error("Novu subscriber identify failed:", err);
    }
  }

  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id });

  return {
    accessToken,
    refreshToken,
    isNewUser: isNew,
    user: { id: user.id, email: user.email, role: user.role, firstName, lastName },
  };
}
