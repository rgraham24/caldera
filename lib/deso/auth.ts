export type ConnectedUser = {
  publicKey: string;
  username: string;
  profilePicUrl: string;
  balanceUSD: number;
  balanceDeso: number;
};

export function connectDeSoWallet(): void {
  localStorage.setItem("caldera_auth_return", window.location.pathname);

  const callbackUrl = `${window.location.origin}/auth/callback`;
  const identityUrl =
    "https://identity.deso.org/log-in?" +
    new URLSearchParams({
      accessLevelRequest: "2",
      redirect_uri: callbackUrl,
      derive: "false",
    }).toString();

  window.location.href = identityUrl;
}

export function disconnectDeSoWallet(): void {
  // Redirect-based auth — clearing the store is sufficient
}
