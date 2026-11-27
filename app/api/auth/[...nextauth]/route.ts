import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    // Menggunakan ": any" untuk mencegah error garis merah di TypeScript
    async signIn({ user }: any) {
      
      // MASUKKAN SEMUA EMAIL YANG DIIZINKAN DI BAWAH INI
      const allowedEmails = [
        "mulyabudimandiri@gmail.com",
        "mulyabudhimandiri@gmail.com",
        "sefhira69@gmail.com"
      ];

      // Jika email orang yang login ada di dalam daftar di atas
      if (allowedEmails.includes(user.email)) {
        return true; // Izinkan masuk
      } else {
        return false; // Tolak dan blokir (AccessDenied)
      }
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };