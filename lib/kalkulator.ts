export const ATURAN_KOPERASI = {
  SIMPANAN_POKOK: 10000,
  SIMPANAN_WAJIB_BULANAN: 5000,
  BUNGA_SUKARELA_BULANAN: 0.005, // 0.5% per bulan
  PERSEN_AMBIL_SIMPANAN_SAAT_PINJAM: 0.02, // 2% diambil dari saldo simpanannya
}

export const OPSI_TENOR_PINJAMAN = [
  { id: '3-2.5', tenor: 3, bunga: 2.5, label: '3 Bulan - Jasa 2,5% / bln' },
  { id: '5-2.5', tenor: 5, bunga: 2.5, label: '5 Bulan - Jasa 2,5% / bln' },
  { id: '8-2.5', tenor: 8, bunga: 2.5, label: '8 Bulan - Jasa 2,5% / bln' },
  { id: '10-2.5', tenor: 10, bunga: 2.5, label: '10 Bulan - Jasa 2,5% / bln' },
  { id: '12-2.5', tenor: 12, bunga: 2.5, label: '12 Bulan - Jasa 2,5% / bln' },
  { id: '15-2.5', tenor: 15, bunga: 2.5, label: '15 Bulan - Jasa 2,5% / bln' },
  { id: '24-2.5', tenor: 24, bunga: 2.5, label: '24 Bulan - Jasa 2,5% / bln' },
  { id: '24-2.0', tenor: 24, bunga: 2.0, label: '24 Bulan Khusus - Jasa 2% / bln' },
]

/**
 * Menghitung rincian pencairan pinjaman dengan sistem BUNGA PUTUS
 * Bunga hanya berjalan setiap bulan selama pokok hutang masih ada.
 */
export function hitungPinjaman(
  jumlahPinjaman: number,
  tenorBulan: number,
  bungaPersen: number,
  saldoSimpananAnggota: number = 0
) {
  const bungaDesimal = bungaPersen / 100

  // Mengambil 2% dari saldo simpanan anggota untuk pinjamannya sendiri
  const ambil2PersenDariSimpanan = Math.round(
    saldoSimpananAnggota * ATURAN_KOPERASI.PERSEN_AMBIL_SIMPANAN_SAAT_PINJAM
  )
  const sisaSaldoSimpanan = Math.max(0, saldoSimpananAnggota - ambil2PersenDariSimpanan)

  // Estimasi angsuran bulanan (Pokok dan Jasa dipisah)
  const angsuranPokokBulanan = Math.round(jumlahPinjaman / tenorBulan)
  const jasaBulanan = Math.round(jumlahPinjaman * bungaDesimal)
  const estimasiTotalBulanan = angsuranPokokBulanan + jasaBulanan

  return {
    jumlahPinjaman,
    tenorBulan,
    bungaPersen,
    ambil2PersenDariSimpanan,
    sisaSaldoSimpanan,
    angsuranPokokBulanan,
    jasaBulanan,
    estimasiTotalBulanan,
    estimasiTotalJasaJikaPenuh: jasaBulanan * tenorBulan,
  }
}