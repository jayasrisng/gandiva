import { createServerSupabaseClient } from "@/lib/supabase/server";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function getAuthenticatedUser() {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}
export async function requireOwner() {
  const user = await getAuthenticatedUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user.id;
}
