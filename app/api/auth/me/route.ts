// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getAppRole, requireUser } from "@/lib/auth";
import { HttpError, toErrorResponse } from "@/lib/server/errors";

/**
 * Returns the signed-in user and their app role. Used by the client to
 * determine which features to show — the server independently enforces
 * the same role on every mutation, so this endpoint is purely UI.
 *
 * Also serves as a "session still valid?" probe.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;

  try {
    const role = await getAppRole(auth.user);
    if (!role) {
      return NextResponse.json(
        { error: "Your account is not set up. Ask an admin to grant access." },
        { status: 403 },
      );
    }

    const name =
      (auth.user.user_metadata?.name as string | undefined) ??
      auth.user.email?.split("@")[0] ??
      "";

    return NextResponse.json({
      id: auth.user.id,
      email: auth.user.email,
      name,
      role,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}