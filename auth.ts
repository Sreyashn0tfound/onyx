import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db"
import bcrypt from "bcryptjs"

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Required in production (next start / non-Vercel hosts / proxies): without it Auth.js v5
  // throws UntrustedHost and every /api/auth/* route returns 500 → login breaks.
  trustHost: true,
  session: { strategy: "jwt" }, // JWT is mandatory when using Credentials
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // 1. Find the user in the Neon Database
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string }
        });

        if (!user || !user.password) return null;

        // 2. Verify the encrypted key (password)
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string, 
          user.password
        );

        if (!isPasswordValid) return null;

        // 3. Return the user object to build the session
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    // Inject the user ID into the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    // Pass the user ID from the token into the active session
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login', // Tells Auth.js where our custom login page is
  }
});