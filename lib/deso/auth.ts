import { identity } from "deso-protocol";

export type ConnectedUser = {
  publicKey: string;
  username: string;
  profilePicUrl: string;
  balanceUSD: number;
  balanceDeso: number;
};

export async function connectDeSoWallet(): Promise<ConnectedUser | null> {
  identity.configure({
    appName: "Caldera",
    identityPresenter: async (url: string) => {
      const width = 450;
      const height = 700;
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
      const popup = window.open(
        url,
        "deso-identity",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=1`
      );
      if (popup) popup.focus();
    },
  });

  let loginResult: Awaited<ReturnType<typeof identity.login>>;
  try {
    loginResult = await identity.login();
  } catch {
    // User closed popup without completing login
    console.log("DeSo login cancelled");
    return null;
  }

  const publicKey = loginResult.publicKeyBase58Check;

  const [profileRes, balanceRes] = await Promise.all([
    fetch("https://api.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
    }).then((r) => r.json()),
    fetch("https://api.deso.org/api/v0/get-users-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeysBase58Check: [publicKey] }),
    }).then((r) => r.json()),
  ]);

  const desoPrice = 5.25;
  const balanceNanos: number = balanceRes.UserList?.[0]?.BalanceNanos || 0;

  return {
    publicKey,
    username: profileRes.Profile?.Username || publicKey.substring(0, 8),
    profilePicUrl: `https://node.deso.org/api/v0/get-single-profile-picture/${publicKey}`,
    balanceUSD: (balanceNanos / 1e9) * desoPrice,
    balanceDeso: balanceNanos / 1e9,
  };
}

export async function disconnectDeSoWallet(): Promise<void> {
  try {
    await identity.logout();
  } catch {
    // Logout popup may be blocked or dismissed — clear local state regardless
  }
}
