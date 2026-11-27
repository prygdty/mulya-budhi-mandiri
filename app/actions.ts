'use server'

import { prisma } from '@/lib/prisma'
import { hitungPinjaman, ATURAN_KOPERASI } from '@/lib/kalkulator'
import { revalidatePath } from 'next/cache'

export async function getKoperasiData() {
  const anggota = await prisma.anggota.findMany({
    include: {
      bukuTabungan: {
        orderBy: { tgl: 'asc' },
      },
      pinjaman: {
        include: {
          riwayatAngsuran: {
            orderBy: { tglBayar: 'asc' },
          },
        },
        orderBy: { tglPencairan: 'desc' },
      },
    },
    orderBy: { noAnggota: 'asc' },
  })
  return anggota
}

export async function tambahAnggota(formData: FormData) {
  const noAnggota = formData.get('noAnggota') as string
  const namaLengkap = formData.get('namaLengkap') as string
  const noKtp = formData.get('noKtp') as string
  const alamat = formData.get('alamat') as string
  const resort = formData.get('resort') as string
  const sukarelaAwal = Number(formData.get('simpananSukarela') || 0)

  // 1. Cek apakah Nomor Anggota sudah ada di database
  const cekAnggota = await prisma.anggota.findUnique({
    where: { noAnggota: noAnggota }
  })
  if (cekAnggota) {
    return { error: `GAGAL! Nomor Anggota "${noAnggota}" sudah digunakan oleh orang lain. Silakan gunakan nomor urut yang berbeda.` }
  }

  // 2. Cek apakah Nomor KTP (NIK) sudah ada di database
  const cekKtp = await prisma.anggota.findUnique({
    where: { noKtp: noKtp }
  })
  if (cekKtp) {
    return { error: `GAGAL! NIK KTP "${noKtp}" sudah terdaftar di sistem.` }
  }

  const saldoAwal =
    ATURAN_KOPERASI.SIMPANAN_POKOK + ATURAN_KOPERASI.SIMPANAN_WAJIB_BULANAN + sukarelaAwal

  await prisma.anggota.create({
    data: {
      noAnggota,
      namaLengkap,
      noKtp,
      alamat,
      resort, 
      statusAnggota: 'Aktif',
      simpananPokok: ATURAN_KOPERASI.SIMPANAN_POKOK,
      simpananWajib: ATURAN_KOPERASI.SIMPANAN_WAJIB_BULANAN,
      simpananSukarela: sukarelaAwal,
      bukuTabungan: {
        create: {
          sandi: 'AWAL',
          debet: 0,
          kredit: saldoAwal,
          saldo: saldoAwal,
          keterangan: `Setoran Awal Anggota (Pokok:10000|Wajib:5000|Sukarela:${sukarelaAwal}|Lain:0)`,
        },
      },
    },
  })

  revalidatePath('/')
  return { success: true }
}

export async function ubahStatusAnggota(formData: FormData) {
  const anggotaId = formData.get('anggotaId') as string
  const statusBaru = formData.get('statusBaru') as string 

  await prisma.anggota.update({
    where: { id: anggotaId },
    data: { statusAnggota: statusBaru },
  })

  revalidatePath('/')
}

export async function transaksiSimpanan(formData: FormData) {
  const anggotaId = formData.get('anggotaId') as string
  const jenis = formData.get('jenis') as
    | 'WAJIB'
    | 'SUKARELA_SETOR'
    | 'SUKARELA_TARIK'
    | 'LAIN_LAIN'
  const nominal = Number(formData.get('nominal'))
  const catatanTambahan = (formData.get('catatan') as string) || ''
  const tglInput = formData.get('tglTransaksi') as string
  const tglTransaksi = tglInput ? new Date(tglInput) : new Date()

  const anggota = await prisma.anggota.findUnique({ where: { id: anggotaId } })
  if (!anggota) throw new Error('Anggota tidak ditemukan')

  const totalSaldoSaatIni =
    anggota.simpananPokok + anggota.simpananWajib + anggota.simpananSukarela

  if (jenis === 'WAJIB') {
    const saldoBaru = totalSaldoSaatIni + nominal
    await prisma.$transaction([
      prisma.anggota.update({
        where: { id: anggotaId },
        data: { simpananWajib: { increment: nominal } },
      }),
      prisma.bukuTabungan.create({
        data: {
          anggotaId,
          tgl: tglTransaksi,
          sandi: 'WAJIB',
          debet: 0,
          kredit: nominal,
          saldo: saldoBaru,
          keterangan: `Setoran Simpanan Wajib ${catatanTambahan} (Pokok:0|Wajib:${nominal}|Sukarela:0|Lain:0)`,
        },
      }),
    ])
  } else if (jenis === 'SUKARELA_SETOR') {
    const saldoBaru = totalSaldoSaatIni + nominal
    await prisma.$transaction([
      prisma.anggota.update({
        where: { id: anggotaId },
        data: { simpananSukarela: { increment: nominal } },
      }),
      prisma.bukuTabungan.create({
        data: {
          anggotaId,
          tgl: tglTransaksi,
          sandi: 'SUKARELA_PLUS',
          debet: 0,
          kredit: nominal,
          saldo: saldoBaru,
          keterangan: `Setoran Simpanan Sukarela ${catatanTambahan} (Pokok:0|Wajib:0|Sukarela:${nominal}|Lain:0)`,
        },
      }),
    ])
  } else if (jenis === 'LAIN_LAIN') {
    const saldoBaru = totalSaldoSaatIni + nominal
    await prisma.$transaction([
      prisma.anggota.update({
        where: { id: anggotaId },
        data: { simpananSukarela: { increment: nominal } },
      }),
      prisma.bukuTabungan.create({
        data: {
          anggotaId,
          tgl: tglTransaksi,
          sandi: 'LAIN_PLUS',
          debet: 0,
          kredit: nominal,
          saldo: saldoBaru,
          keterangan: `Setoran Simpanan Lain-lain ${catatanTambahan} (Pokok:0|Wajib:0|Sukarela:0|Lain:${nominal})`,
        },
      }),
    ])
  } else if (jenis === 'SUKARELA_TARIK') {
    if (anggota.simpananSukarela < nominal) {
      throw new Error('Saldo Simpanan Sukarela tidak mencukupi!')
    }
    const saldoBaru = totalSaldoSaatIni - nominal
    await prisma.$transaction([
      prisma.anggota.update({
        where: { id: anggotaId },
        data: { simpananSukarela: { decrement: nominal } },
      }),
      prisma.bukuTabungan.create({
        data: {
          anggotaId,
          tgl: tglTransaksi,
          sandi: 'SUKARELA_MINUS',
          debet: nominal,
          kredit: 0,
          saldo: saldoBaru,
          keterangan: `Penarikan Simpanan Sukarela ${catatanTambahan} (Pokok:0|Wajib:0|Sukarela:${nominal}|Lain:0)`,
        },
      }),
    ])
  }

  revalidatePath('/')
}

export async function prosesBungaSukarelaBulanan() {
  const daftarAnggota = await prisma.anggota.findMany({
    where: { simpananSukarela: { gt: 0 }, statusAnggota: 'Aktif' },
  })

  for (const agt of daftarAnggota) {
    const bunga = Math.round(agt.simpananSukarela * ATURAN_KOPERASI.BUNGA_SUKARELA_BULANAN)
    if (bunga > 0) {
      const saldoLama = agt.simpananPokok + agt.simpananWajib + agt.simpananSukarela
      const saldoBaru = saldoLama + bunga

      await prisma.$transaction([
        prisma.anggota.update({
          where: { id: agt.id },
          data: { simpananSukarela: { increment: bunga } },
        }),
        prisma.bukuTabungan.create({
          data: {
            anggotaId: agt.id,
            sandi: 'JASA_05',
            debet: 0,
            kredit: bunga,
            saldo: saldoBaru,
            keterangan: `Jasa Simpanan 0,5% (Pokok:0|Wajib:0|Sukarela:${bunga}|Lain:0)`,
          },
        }),
      ])
    }
  }

  revalidatePath('/')
}

export async function ajukanPinjaman(formData: FormData) {
  const anggotaId = formData.get('anggotaId') as string
  const jumlahPinjaman = Number(formData.get('jumlahPinjaman'))
  const paketTenor = formData.get('paketTenor') as string
  const [tenorStr, bungaStr] = paketTenor.split('-')
  const tenorBulan = Number(tenorStr)
  const bungaPersen = Number(bungaStr)

  const tglPencairanInput = formData.get('tglPencairan') as string
  const tglPencairan = tglPencairanInput ? new Date(tglPencairanInput) : new Date()

  // PERUBAHAN: Aturan pemotongan 2% dari simpanan telah Dihapus.
  // Pinjaman langsung dicatat tanpa memotong simpanan wajib/sukarela.
  await prisma.$transaction([
    prisma.pinjaman.create({
      data: {
        anggotaId,
        jumlahPinjaman,
        tenorBulan,
        bungaPersen,
        setoranSimpanan2Persen: 0, // Diubah menjadi 0
        sisaPinjaman: jumlahPinjaman,
        jasaTerbayar: 0,
        tglPencairan,
        status: 'Aktif',
      },
    }),
    prisma.anggota.update({
      where: { id: anggotaId },
      data: {
        statusPinjaman: 'Aktif',
      },
    })
  ])

  revalidatePath('/')
}

export async function bayarAngsuran(formData: FormData) {
  const pinjamanId = formData.get('pinjamanId') as string
  const bayarPokok = Number(formData.get('bayarPokok') || 0)
  const bayarJasa = Number(formData.get('bayarJasa') || 0)
  const tglBayarInput = formData.get('tglBayar') as string
  const tglBayar = tglBayarInput ? new Date(tglBayarInput) : new Date()

  const pinjaman = await prisma.pinjaman.findUnique({
    where: { id: pinjamanId },
    include: { anggota: true },
  })
  if (!pinjaman) throw new Error('Data pinjaman tidak ditemukan')

  const sisaPokokBaru = Math.max(0, pinjaman.sisaPinjaman - bayarPokok)
  const statusBaru = sisaPokokBaru === 0 ? 'Lunas' : 'Aktif'
  const totalDibayarKaliIni = bayarPokok + bayarJasa

  const agt = pinjaman.anggota
  const saldoTabunganTetap = agt.simpananPokok + agt.simpananWajib + agt.simpananSukarela

  await prisma.$transaction([
    prisma.pinjaman.update({
      where: { id: pinjamanId },
      data: {
        sisaPinjaman: sisaPokokBaru,
        jasaTerbayar: { increment: bayarJasa },
        status: statusBaru,
      },
    }),
    prisma.pembayaranAngsuran.create({
      data: {
        pinjamanId,
        tglBayar,
        bayarPokok,
        bayarJasa,
        sisaPokok: sisaPokokBaru,
        keterangan:
          statusBaru === 'Lunas'
            ? 'LUNAS (Bunga Putus - Jasa bulan sisa tidak dihitung)'
            : 'Angsuran Rutin',
      },
    }),
    prisma.anggota.update({
      where: { id: agt.id },
      data: { statusPinjaman: statusBaru === 'Lunas' ? 'Tidak Ada' : 'Aktif' },
    }),
    prisma.bukuTabungan.create({
      data: {
        anggotaId: agt.id,
        tgl: tglBayar,
        sandi: 'ANGSURAN',
        debet: 0,
        kredit: 0,
        saldo: saldoTabunganTetap,
        keterangan: `Bayar Angsuran Rp${totalDibayarKaliIni.toLocaleString('id-ID')} (Pokok: Rp${bayarPokok.toLocaleString('id-ID')}, Jasa: Rp${bayarJasa.toLocaleString('id-ID')}) | Sisa Pokok: Rp${sisaPokokBaru.toLocaleString('id-ID')}`,
      },
    }),
  ])

  revalidatePath('/')
}

export async function hapusAnggotaPermanen(formData: FormData) {
  const anggotaId = formData.get('anggotaId') as string
  
  await prisma.anggota.delete({
    where: { id: anggotaId },
  })

  revalidatePath('/')
}


// =========================================================================
// FUNGSI BARU: MENGHAPUS RIWAYAT PINJAMAN SECARA PERMANEN
// =========================================================================
export async function hapusRiwayatPinjaman(formData: FormData) {
  const pinjamanId = formData.get('pinjamanId') as string

  // Karena di schema.prisma kita sudah menyetel 'onDelete: Cascade' 
  // pada model PembayaranAngsuran, menghapus Pinjaman ini akan otomatis 
  // menghapus SELURUH riwayat angsuran yang menempel padanya.
  await prisma.pinjaman.delete({
    where: { id: pinjamanId },
  })

  revalidatePath('/')
}

// =========================================================================
// FUNGSI BARU: MENGHAPUS SATU BARIS MUTASI BUKU SIMPANAN & MENGHITUNG ULANG
// =========================================================================
export async function hapusRiwayatSimpanan(formData: FormData) {
  const bukuTabunganId = formData.get('bukuTabunganId') as string
  const anggotaId = formData.get('anggotaId') as string

  // 1. Ambil data mutasi yang mau dihapus untuk tahu isinya
  const mutasiYgDihapus = await prisma.bukuTabungan.findUnique({
    where: { id: bukuTabunganId }
  })
  
  if (!mutasiYgDihapus) return;

  // 2. Hapus baris mutasi tersebut dari database
  await prisma.bukuTabungan.delete({
    where: { id: bukuTabunganId },
  })

  // 3. Kita harus menghitung ulang saldo tabungan anggota ini (Pokok, Wajib, Sukarela, Lain)
  // karena kalau dihapus manual tanpa perhitungan ulang, saldo akhirnya akan jadi kacau.
  const semuaMutasi = await prisma.bukuTabungan.findMany({
    where: { anggotaId: anggotaId },
    orderBy: { tgl: 'asc' }, // Urutkan dari yang paling lama
  })

  let totalPokok = 0
  let totalWajib = 0
  let totalSukarela = 0

  // Logika membaca history keterangan untuk menyusun ulang saldo 
  // yang sebenarnya (Sesuai dengan logika parseRincianSimpanan)
  for (let i = 0; i < semuaMutasi.length; i++) {
    const row = semuaMutasi[i]
    const match = row.keterangan?.match(/\(Pokok:(\d+)\|Wajib:(\d+)\|Sukarela:(\d+)\|Lain:(\d+)\)/)
    
    let curPokok = 0, curWajib = 0, curSukarela = 0

    if (match) {
      curPokok = Number(match[1])
      curWajib = Number(match[2])
      curSukarela = Number(match[3])
    } else if (row.keterangan?.includes('Setoran Awal')) {
      curPokok = 10000
      curWajib = 5000
      curSukarela = Math.max(0, row.kredit - 15000)
    } else if (row.keterangan?.includes('Wajib') && !row.keterangan?.includes('2%')) {
      curWajib = row.kredit || row.debet
    } else {
      curSukarela = row.kredit > 0 ? row.kredit : row.debet
    }

    if (row.debet > 0) {
      // Jika penarikan
      totalPokok -= curPokok
      totalWajib -= curWajib
      totalSukarela -= curSukarela
    } else {
      // Jika setoran
      totalPokok += curPokok
      totalWajib += curWajib
      totalSukarela += curSukarela
    }

    // Update saldo kumulatif di baris mutasi ini
    const saldoBerjalan = totalPokok + totalWajib + totalSukarela
    await prisma.bukuTabungan.update({
      where: { id: row.id },
      data: { saldo: saldoBerjalan }
    })
  }

  // 4. Update total saldo akhir di tabel Profil Anggota
  await prisma.anggota.update({
    where: { id: anggotaId },
    data: {
      simpananPokok: totalPokok,
      simpananWajib: totalWajib,
      simpananSukarela: totalSukarela,
    }
  })

  revalidatePath('/')
}

// =========================================================================
// FUNGSI BARU: MENGHAPUS 1X TRANSAKSI ANGSURAN & MENGHITUNG ULANG HUTANG
// =========================================================================
export async function hapusRiwayatAngsuran(formData: FormData) {
  const angsuranId = formData.get('angsuranId') as string
  const pinjamanId = formData.get('pinjamanId') as string

  // 1. Ambil data angsuran yang mau dihapus beserta data pinjaman induknya
  const angsuran = await prisma.pembayaranAngsuran.findUnique({ 
    where: { id: angsuranId }, 
    include: { pinjaman: true } 
  })
  if(!angsuran) return;
  
  // 2. Hapus baris angsuran tersebut
  await prisma.pembayaranAngsuran.delete({ where: { id: angsuranId } })

  // 3. Hitung ulang total sisa pokok dan jasa yang sudah dibayar dari sisa riwayat yang ada
  const sisaAngsuran = await prisma.pembayaranAngsuran.findMany({ where: { pinjamanId } })
  const totalPokokDibayar = sisaAngsuran.reduce((acc, curr) => acc + curr.bayarPokok, 0)
  const totalJasaDibayar = sisaAngsuran.reduce((acc, curr) => acc + curr.bayarJasa, 0)
  
  const sisaPokokBaru = Math.max(0, angsuran.pinjaman.jumlahPinjaman - totalPokokDibayar)
  const statusBaru = sisaPokokBaru === 0 ? 'Lunas' : 'Aktif'

  // 4. Update data pinjaman dan status anggota
  await prisma.pinjaman.update({
    where: { id: pinjamanId },
    data: { sisaPinjaman: sisaPokokBaru, jasaTerbayar: totalJasaDibayar, status: statusBaru }
  })
  
  await prisma.anggota.update({
    where: { id: angsuran.pinjaman.anggotaId },
    data: { statusPinjaman: statusBaru === 'Lunas' ? 'Tidak Ada' : 'Aktif' }
  })

  revalidatePath('/')
}