export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; scopes: string[]; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    state: opts.state,
    // Always show the consent screen so newly added scopes get granted.
    force_verify: "true",
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}
