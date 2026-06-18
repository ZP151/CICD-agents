import type { AzureUser } from "./azureAuthTypes.js";

export function decodeUserFromJwt(jwt: string): AzureUser {
  const parts = jwt.split(".");
  if (parts.length !== 3) return { oid: "anonymous" };

  const payload = JSON.parse(
    Buffer.from(parts[1]!, "base64url").toString("utf-8"),
  ) as Record<string, unknown>;

  return {
    oid: (payload["oid"] as string | undefined) ?? (payload["sub"] as string | undefined) ?? "anonymous",
    upn: (payload["upn"] as string | undefined) ?? (payload["preferred_username"] as string | undefined),
    name: payload["name"] as string | undefined,
  };
}

export async function fetchGraphAvatar(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}
