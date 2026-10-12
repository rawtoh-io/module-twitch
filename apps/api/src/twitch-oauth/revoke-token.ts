// Best effort: a token Twitch no longer knows returns 400, which is fine for our purpose.
export async function revokeTwitchToken(clientId: string, token: string): Promise<boolean> {
  const res = await fetch("https://id.twitch.tv/oauth2/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, token }),
  });
  return res.ok;
}
