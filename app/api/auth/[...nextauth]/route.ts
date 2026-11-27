callbacks: {
      async signIn({ user }: { user: any }) {
        // MASUKKAN SEMUA EMAIL YANG DIIZINKAN DI DALAM KURUNG SIKU INI
        const allowedEmails = [
          "mulyabudimandiri@gmail.com",
          "mulyabudhimandiri@gmail.com",
          "sefhira69@gmail.com"
        ]

        if (allowedEmails.includes(user.email)) {
          return true // Izinkan masuk karena email cocok
        } else {
          return false // Tolak dan blokir jika email tidak ada di daftar atas
        }
      },