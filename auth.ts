import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { requireEnv } from "@/lib/cf";
import { ensureSignupGrant } from "@/lib/minutes";
import { getAuthSecret } from "@/lib/secrets";
import { upsertGoogleUser } from "@/lib/users";

declare module "next-auth" {
  interface Session {
    userId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
  }
}

/** Google sign-in (Auth.js, JWT sessions) — same pattern as crayonink. */
export const { handlers, auth, signIn, signOut } = NextAuth(async (request) => {
  const env = await requireEnv();
  const clientId = (env.AUTH_GOOGLE_ID || "").trim();
  const clientSecret = (env.AUTH_GOOGLE_SECRET || "").trim();
  const useSecureCookies = request ? new URL(request.url).protocol === "https:" : undefined;
  return {
    trustHost: true,
    ...(useSecureCookies === undefined ? {} : { useSecureCookies }),
    secret: await getAuthSecret(env),
    session: { strategy: "jwt" },
    providers: clientId && clientSecret ? [Google({ clientId, clientSecret })] : [],
    callbacks: {
      async jwt({ token, account, profile }) {
        if (account?.provider !== "google" || !profile || typeof profile.email !== "string" || !profile.email) return token;
        if ("email_verified" in profile && profile.email_verified === false) return token;
        const user = await upsertGoogleUser(env.DB, {
          email: profile.email,
          name: typeof profile.name === "string" ? profile.name : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
          googleId: account.providerAccountId,
        });
        token.userId = user.id;
        try {
          await ensureSignupGrant(env, user.id);
        } catch (e) {
          console.error("[auth] signup grant failed", e instanceof Error ? e.message : e);
        }
        return token;
      },
      async session({ session, token }) {
        if (typeof token.userId === "string") session.userId = token.userId;
        return session;
      },
    },
  };
});
