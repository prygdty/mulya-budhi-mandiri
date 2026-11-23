import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  callbacks: {
    async signIn({ user }: { user: any }) {
      // ⬇️ GANTI DENGAN EMAIL GOOGLE ANDA SENDIRI ⬇️
      const allowedEmail = "mulyabudhimandiri@gmail.com"
      
      if (user.email === allowedEmail) {
        return true // Izinkan masuk karena email cocok
      } else {
        return false // Tolak dan blokir jika ada orang lain yang mencoba login
      }
    },
  },
  // Kustomisasi halaman (opsional) agar jika ditolak kembali ke halaman awal
  pages: {
    error: '/', 
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }