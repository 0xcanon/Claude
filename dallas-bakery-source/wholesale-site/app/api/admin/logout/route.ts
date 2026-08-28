import { clearAdminSessionCookie } from "../../../admin-auth";

export async function POST(request: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/admin/login", request.url).toString(),
      "Set-Cookie": clearAdminSessionCookie(),
    },
  });
}
