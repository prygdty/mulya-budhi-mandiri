'use client'

import React, { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  tambahAnggota,
  transaksiSimpanan,
  prosesBungaSukarelaBulanan,
  ajukanPinjaman,
  bayarAngsuran,
  ubahStatusAnggota,
  hapusAnggotaPermanen,
} from './actions'
import { hitungPinjaman, OPSI_TENOR_PINJAMAN } from '@/lib/kalkulator'
import {
  Users,
  Wallet,
  CreditCard,
  BookOpen,
  Download,
  ShieldCheck,
  Eye,
  PlusCircle,
  Printer,
  Sparkles,
  Receipt,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  BookMarked,
  LayoutDashboard,
  UserPlus,
  Calendar,
  FileText,
  Trash2,
  RotateCcw,
  LogOut,
  Lock,
} from 'lucide-react'

function parseRincianSimpanan(row: any) {
  const match = row.keterangan?.match(/\(Pokok:(\d+)\|Wajib:(\d+)\|Sukarela:(\d+)\|Lain:(\d+)\)/)
  const cleanUraian = row.keterangan?.replace(/\s*\(Pokok:\d+\|Wajib:\d+\|Sukarela:\d+\|Lain:\d+\)/, '') || row.keterangan

  if (match) {
    return {
      uraian: cleanUraian,
      pokok: Number(match[1]),
      wajib: Number(match[2]),
      sukarela: Number(match[3]),
      lain: Number(match[4]),
    }
  }

  if (row.keterangan?.includes('Setoran Awal')) {
    const sukarelaLama = Math.max(0, row.kredit - 15000)
    return { uraian: cleanUraian, pokok: 10000, wajib: 5000, sukarela: sukarelaLama, lain: 0 }
  }
  if (row.keterangan?.includes('Wajib') && !row.keterangan?.includes('2%')) {
    return { uraian: cleanUraian, pokok: 0, wajib: row.kredit || row.debet, sukarela: 0, lain: 0 }
  }
  return {
    uraian: cleanUraian,
    pokok: 0,
    wajib: 0,
    sukarela: row.kredit > 0 ? row.kredit : row.debet,
    lain: 0,
  }
}

export default function DashboardClient({ initialAnggota }: { initialAnggota: any[] }) {
  // STATE AUTENTIKASI NEXT-AUTH
  const { data: session, status } = useSession()
  const [isKetuaMode, setIsKetuaMode] = useState(false)
  
  // ROLE: Jika ada session Google -> ADMIN. Jika mode ketua diklik -> KETUA.
  const role = session ? 'ADMIN' : (isKetuaMode ? 'KETUA' : null)

  const [activeTab, setActiveTab] = useState<
    'RINGKASAN' | 'ANGGOTA' | 'PINJAMAN' | 'BUKU_TABUNGAN' | 'TABEL_JASA_05' | 'INPUT_TRANSAKSI'
  >('RINGKASAN')

  // Logika Filter Anggota (Soft Delete)
  const [tampilkanAnggota, setTampilkanAnggota] = useState<'Aktif' | 'Keluar'>('Aktif')
  const daftarAnggotaAktif = initialAnggota.filter((a) => a.statusAnggota !== 'Keluar')
  const daftarAnggotaKeluar = initialAnggota.filter((a) => a.statusAnggota === 'Keluar')
  const anggotaYgDitampilkan = tampilkanAnggota === 'Aktif' ? daftarAnggotaAktif : daftarAnggotaKeluar

  // Logika Kelompok Resort
  const resortUnikDariDB = Array.from(new Set(initialAnggota.map((a) => a.resort).filter(Boolean)))
  const defaultResorts = ['Resort 1', 'Resort 2', 'Resort 3', 'Resort 4', 'Resort 5', 'Resort 6', 'Resort 7', 'Resort 8', 'Resort 9', 'Resort 10']
  const gabunganResort = Array.from(new Set([...defaultResorts, ...resortUnikDariDB])).sort()
  
  const [daftarResortMode, setDaftarResortMode] = useState<string[]>(gabunganResort)
  const [inputResortBaru, setInputResortBaru] = useState('')

  const handleTambahResort = () => {
    if (inputResortBaru && !daftarResortMode.includes(inputResortBaru)) {
      setDaftarResortMode([...daftarResortMode, inputResortBaru].sort())
      setInputResortBaru('')
    }
  }

  // Modals
  const [selectedAnggotaId, setSelectedAnggotaId] = useState<string>(initialAnggota[0]?.id || '')
  const [detailAnggotaModal, setDetailAnggotaModal] = useState<any | null>(null)
  const [kartuPinjamanModal, setKartuPinjamanModal] = useState<any | null>(null)
  const [kuitansiModal, setKuitansiModal] = useState<{
    noKuitansi: string
    tanggal: string
    namaAnggota: string
    noAnggota: string
    jenisTransaksi: string
    nominal: number
    keterangan: string
  } | null>(null)

  // Form Pinjaman
  const todayStr = new Date().toISOString().slice(0, 10)
  const [peminjamIdForm, setPeminjamIdForm] = useState<string>(daftarAnggotaAktif[0]?.id || '')
  const [simPinjaman, setSimPinjaman] = useState<number>(5000000)
  const [paketTenor, setPaketTenor] = useState<string>('12-2.5')
  const [tglPencairanForm, setTglPencairanForm] = useState<string>(todayStr)

  const [tenorNum, bungaNum] = paketTenor.split('-').map(Number)

  // Form Bayar Angsuran
  const [selectedPinjamanBayarId, setSelectedPinjamanBayarId] = useState<string>('')
  const [inputBayarPokok, setInputBayarPokok] = useState<number>(0)
  const [inputBayarJasa, setInputBayarJasa] = useState<number>(0)
  const [tglBayarForm, setTglBayarForm] = useState<string>(todayStr)

  const peminjamTerpilihForm = initialAnggota.find((a) => a.id === peminjamIdForm)
  const saldoSimpananPeminjam = peminjamTerpilihForm
    ? peminjamTerpilihForm.simpananPokok +
      peminjamTerpilihForm.simpananWajib +
      peminjamTerpilihForm.simpananSukarela
    : 0

  const hasilSimulasi = hitungPinjaman(simPinjaman, tenorNum, bungaNum, saldoSimpananPeminjam)

  // Statistik Koperasi (Hanya dari anggota Aktif)
  const totalAnggotaAktifCount = daftarAnggotaAktif.length
  const totalSimpananPokok = daftarAnggotaAktif.reduce((acc, a) => acc + a.simpananPokok, 0)
  const totalSimpananWajib = daftarAnggotaAktif.reduce((acc, a) => acc + a.simpananWajib, 0)
  const totalSimpananSukarela = daftarAnggotaAktif.reduce((acc, a) => acc + a.simpananSukarela, 0)
  const totalSeluruhSimpanan = totalSimpananPokok + totalSimpananWajib + totalSimpananSukarela

  const semuaPinjaman = initialAnggota.flatMap((a) =>
    a.pinjaman.map((p: any) => ({
      ...p,
      namaAnggota: a.namaLengkap,
      noAnggota: a.noAnggota,
      alamatAnggota: a.alamat,
    }))
  )
  const semuaPinjamanAktif = semuaPinjaman.filter((p: any) => p.status === 'Aktif')

  const totalSisaPokokPiutang = semuaPinjamanAktif.reduce((acc, p) => acc + p.sisaPinjaman, 0)
  const totalJasaBerjalanBulanIni = semuaPinjamanAktif.reduce(
    (acc, p) => acc + Math.round(p.jumlahPinjaman * (p.bungaPersen / 100)),
    0
  )
  const totalJasaSudahMasuk = semuaPinjaman.reduce((acc, p) => acc + (p.jasaTerbayar || 0), 0)

  const semuaRiwayatBayar = semuaPinjaman
    .flatMap((p: any) =>
      (p.riwayatAngsuran || []).map((r: any) => ({
        ...r,
        namaAnggota: p.namaAnggota,
        noAnggota: p.noAnggota,
        pokokAwal: p.jumlahPinjaman,
        tenorBulan: p.tenorBulan,
        bungaPersen: p.bungaPersen,
      }))
    )
    .sort((a: any, b: any) => new Date(b.tglBayar).getTime() - new Date(a.tglBayar).getTime())

  const anggotaTerpilih = initialAnggota.find((a) => a.id === selectedAnggotaId)
  const indexUrutAnggota = initialAnggota.findIndex((a) => a.id === selectedAnggotaId) + 1

  const handlePilihPinjamanBayar = (pinjamanId: string) => {
    setSelectedPinjamanBayarId(pinjamanId)
    const p = semuaPinjamanAktif.find((item: any) => item.id === pinjamanId)
    if (p) {
      const saranPokok = Math.min(p.sisaPinjaman, Math.round(p.jumlahPinjaman / p.tenorBulan))
      const saranJasa = Math.round(p.jumlahPinjaman * (p.bungaPersen / 100))
      setInputBayarPokok(saranPokok)
      setInputBayarJasa(saranJasa)
    } else {
      setInputBayarPokok(0)
      setInputBayarJasa(0)
    }
  }

  const exportSemuaAnggotaCSV = () => {
    const headers = [
      'No Anggota',
      'Nama Lengkap',
      'No KTP',
      'Alamat',
      'Resort',
      'Status',
      'Simpanan Pokok (Rp)',
      'Simpanan Wajib (Rp)',
      'Simpanan Sukarela Jasa 0,5% (Rp)',
      'Jumlah Simpanan (Rp)',
      'Sisa Pokok Pinjaman (Rp)',
      'Jasa Pinjaman Terbayar (Rp)',
    ]
    const rows = initialAnggota.map((a) => {
      const sisaPokok = a.pinjaman
        .filter((p: any) => p.status === 'Aktif')
        .reduce((sum: number, p: any) => sum + p.sisaPinjaman, 0)
      const jasaPaid = a.pinjaman.reduce((sum: number, p: any) => sum + (p.jasaTerbayar || 0), 0)
      return [
        `"${a.noAnggota}"`,
        `"${a.namaLengkap}"`,
        `"${a.noKtp}"`,
        `"${a.alamat}"`,
        `"${a.resort}"`,
        `"${a.statusAnggota}"`,
        a.simpananPokok,
        a.simpananWajib,
        a.simpananSukarela,
        a.simpananPokok + a.simpananWajib + a.simpananSukarela,
        sisaPokok,
        jasaPaid,
      ]
    })

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `Rekap_Koperasi_Mulya_Budhi_Mandiri_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportSatuAnggotaCSV = (agt: any) => {
    const totalSimpanan = agt.simpananPokok + agt.simpananWajib + agt.simpananSukarela
    const sisaPokok = agt.pinjaman
      .filter((p: any) => p.status === 'Aktif')
      .reduce((sum: number, p: any) => sum + p.sisaPinjaman, 0)

    const headerBuku = [
      'BUKU - SIMPANAN ANGGOTA KOPERASI MULYA BUDHI MANDIRI',
      '',
      '',
      '',
      '',
      '',
      '',
      `Nomor Anggota:,${agt.noAnggota}`,
    ]
    const infoAnggota1 = [
      `Nama:,${agt.namaLengkap}`,
      `Alamat:,${agt.alamat}`,
      `Total Simpanan:,${totalSimpanan}`,
      `Sisa Pokok Pinjaman:,${sisaPokok}`,
      '',
      'Tgl.,Nomor Bukti,Uraian,+/-,,Simpanan Pokok,Simpanan Wajib,Simpanan Sukarela,Simpanan Lain-lain,JUMLAH SIMPANAN,Keterangan paraf Petugas',
    ]

    const mutasiRows = agt.bukuTabungan.map((row: any, idx: number) => {
      const r = parseRincianSimpanan(row)
      const isPengurangan = row.debet > 0
      const tanda = isPengurangan ? '-' : '+'
      const tglStr = new Date(row.tgl).toLocaleDateString('id-ID')
      const noBukti = `BKT-${String(idx + 1).padStart(3, '0')}`

      return `${tglStr},${noBukti},"${r.uraian}",${tanda},,${r.pokok},${r.wajib},${r.sukarela},${r.lain},${row.saldo},Sah / Paraf`
    })

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [...headerBuku, ...infoAnggota1, ...mutasiRows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Buku_Simpanan_${agt.noAnggota}_${agt.namaLengkap}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ==========================================
  // HALAMAN LOGIN FULL SCREEN (GOOGLE AUTH)
  // ==========================================
  if (!role && status !== 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 max-w-md w-full text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-100 rounded-full blur-3xl opacity-60"></div>
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-100 rounded-full blur-3xl opacity-60"></div>
          
          <div className="relative z-10">
            <div className="bg-emerald-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <ShieldCheck className="w-10 h-10 text-emerald-700" />
            </div>
            
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
              Koperasi Mulya Budhi
            </h1>
            <p className="text-slate-500 text-sm mb-10 font-medium">Sistem Informasi Simpan Pinjam</p>

            <button
              onClick={() => signIn('google')}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-emerald-500 text-slate-700 hover:bg-emerald-50 font-bold py-3.5 px-4 rounded-xl transition shadow-sm mb-5 group"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Login Admin (Google)
            </button>

            <div className="relative flex py-3 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-semibold uppercase tracking-widest">atau</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              onClick={() => setIsKetuaMode(true)}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-xl transition mt-5 flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" /> Masuk Mode Monitoring
            </button>
            <p className="text-[11px] text-slate-400 mt-4">Diamankan dengan Google OAuth 2.0</p>
          </div>
        </div>
      </div>
    )
  }

  // ==========================================
  // JIKA SUDAH LOGIN / MASUK MODE KETUA
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* HEADER NAVBAR */}
      <header className="bg-emerald-800 text-white shadow-md print:hidden sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">KOPERASI MULYA BUDHI MANDIRI</h1>
            <p className="text-emerald-200 text-sm">Bagelen • Sistem Simpan Pinjam (Bunga Putus)</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 ${role === 'ADMIN' ? 'bg-emerald-900 border-emerald-600 text-emerald-100' : 'bg-amber-900 border-amber-600 text-amber-100'}`}>
               {role === 'ADMIN' ? <ShieldCheck className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
               {role === 'ADMIN' ? `Super Admin (${session?.user?.name || 'Aktif'})` : 'Mode Monitoring (Pak Ketua)'}
            </div>
            
            <button
              onClick={() => {
                if (role === 'ADMIN') {
                  signOut()
                } else {
                  setIsKetuaMode(false)
                }
              }}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow transition"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* BANNER MODE KETUA */}
      {role === 'KETUA' && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-6 py-2.5 text-center text-sm font-medium print:hidden">
          <Lock className="w-4 h-4 inline-block mr-1" />
          Mode Pantau Aktif (Pak Ketua): Hak akses untuk menambah, menghapus, atau mengubah transaksi sedang dikunci.
        </div>
      )}

      {/* MENU NAVIGASI TAB */}
      <div className="max-w-7xl mx-auto px-6 pt-6 print:hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('RINGKASAN')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'RINGKASAN' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Dashboard Utama
          </button>
          <button
            onClick={() => setActiveTab('ANGGOTA')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'ANGGOTA' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserPlus className="w-4 h-4" /> Pendaftaran & Data Anggota ({totalAnggotaAktifCount})
          </button>
          <button
            onClick={() => setActiveTab('PINJAMAN')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'PINJAMAN' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CreditCard className="w-4 h-4" /> Pinjaman & Angsuran (Bunga Putus)
          </button>
          <button
            onClick={() => setActiveTab('BUKU_TABUNGAN')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'BUKU_TABUNGAN' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Buku Simpanan Anggota (Cetak)
          </button>
          <button
            onClick={() => setActiveTab('TABEL_JASA_05')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'TABEL_JASA_05' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookMarked className="w-4 h-4" /> Tabel Simpanan Jasa 0,5%
          </button>
          <button
            onClick={() => setActiveTab('INPUT_TRANSAKSI')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition ${
              activeTab === 'INPUT_TRANSAKSI' ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wallet className="w-4 h-4" /> Input Setor / Tarik Simpanan
          </button>
        </div>
      </div>

      {/* KONTEN UTAMA */}
      <main className={`max-w-7xl mx-auto px-6 py-6 ${kuitansiModal || kartuPinjamanModal ? 'print:hidden' : ''}`}>
        
        {/* ==============================================
            TAB 1: DASHBOARD UTAMA
        ============================================== */}
        {activeTab === 'RINGKASAN' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 text-white p-8 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-2">
                <span className="bg-emerald-700/80 text-emerald-100 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
                  Sistem Bunga Putus • Koperasi Simpan Pinjam
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight">Selamat Datang di Koperasi Mulya Budhi Mandiri</h2>
                <p className="text-emerald-200 text-sm max-w-xl leading-relaxed">
                  Pantau seluruh sirkulasi kas simpanan, pokok pinjaman beredar, jasa pinjaman, dan pembagian jasa sukarela 0,5% secara terpisah dan transparan.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total Kas Simpanan</p>
                  <p className="text-2xl font-extrabold text-emerald-700 mt-2">
                    Rp {totalSeluruhSimpanan.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                  <span>Pokok + Wajib + Sukarela</span>
                  <span className="font-semibold text-emerald-700">{totalAnggotaAktifCount} Aktif</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Simpanan Pokok & Wajib</p>
                  <p className="text-2xl font-extrabold text-slate-800 mt-2">
                    Rp {(totalSimpananPokok + totalSimpananWajib).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Pokok Rp10rb | Wajib Rp5rb/bln
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Simpanan Sukarela (0,5%)</p>
                  <p className="text-2xl font-extrabold text-blue-700 mt-2">
                    Rp {totalSimpananSukarela.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Berjasa 0,5% setiap bulan
                </div>
              </div>

              <div className="bg-amber-50/70 p-6 rounded-2xl shadow-sm border border-amber-200 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-amber-900 tracking-wider">
                    Total Sisa Piutang Hutang
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-semibold text-slate-600">Pokok Pinjaman:</span>
                      <span className="text-lg font-extrabold text-amber-700">
                        Rp {totalSisaPokokPiutang.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-semibold text-slate-600">Jasa / Bln Berjalan:</span>
                      <span className="text-sm font-bold text-blue-700">
                        Rp {totalJasaBerjalanBulanIni.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-amber-200/80 flex justify-between text-[11px] text-amber-900 font-medium">
                  <span>Jasa Masuk: Rp {totalJasaSudahMasuk.toLocaleString('id-ID')}</span>
                  <span>{semuaPinjamanAktif.length} Aktif</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" /> Pintasan Menu Cepat
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <button
                  onClick={() => setActiveTab('ANGGOTA')}
                  className="p-5 rounded-xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/50 text-left transition shadow-sm group"
                >
                  <UserPlus className="w-7 h-7 text-emerald-700 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-[15px] text-slate-800">Data & Daftar Anggota</p>
                  <p className="text-xs text-slate-500 mt-1">Kelola biodata, resort, status, & tambah anggota baru</p>
                </button>
                <button
                  onClick={() => setActiveTab('PINJAMAN')}
                  className="p-5 rounded-xl border-2 border-slate-100 hover:border-amber-500 hover:bg-amber-50/50 text-left transition shadow-sm group"
                >
                  <CreditCard className="w-7 h-7 text-amber-600 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-[15px] text-slate-800">Pinjaman & Angsuran</p>
                  <p className="text-xs text-slate-500 mt-1">Sistem bunga putus, ambil 2% simpanan & cetak kartu</p>
                </button>
                <button
                  onClick={() => setActiveTab('BUKU_TABUNGAN')}
                  className="p-5 rounded-xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/50 text-left transition shadow-sm group"
                >
                  <BookOpen className="w-7 h-7 text-emerald-700 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-[15px] text-slate-800">Cetak Buku Simpanan</p>
                  <p className="text-xs text-slate-500 mt-1">Laporan mutasi 7 kolom bergaya buku resmi koperasi</p>
                </button>
                <button
                  onClick={() => setActiveTab('TABEL_JASA_05')}
                  className="p-5 rounded-xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/50 text-left transition shadow-sm group"
                >
                  <BookMarked className="w-7 h-7 text-blue-600 mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-[15px] text-slate-800">Tabel Jasa 0,5%</p>
                  <p className="text-xs text-slate-500 mt-1">Buku catatan riwayat pembagian jasa sukarela bulanan</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==============================================
            TAB 2: PENDAFTARAN & DATA ANGGOTA 
        ============================================== */}
        {activeTab === 'ANGGOTA' && (
          <div className="space-y-6">
            {role === 'ADMIN' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-700" /> Pendaftaran Anggota Baru
                </h2>
                <form 
                  action={async (formData) => {
                    const res = await tambahAnggota(formData);
                    if (res?.error) {
                      alert(res.error);
                    } else {
                      alert("Sukses! Nasabah berhasil didaftarkan.");
                    }
                  }} 
                  className="grid grid-cols-1 md:grid-cols-6 gap-4"
                >
                  <input type="text" name="noAnggota" placeholder="No Anggota (Mis: KMB-001)" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  <input type="text" name="namaLengkap" placeholder="Nama Lengkap" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  <input type="text" name="noKtp" placeholder="Nomor KTP (NIK)" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  <input type="text" name="alamat" placeholder="Alamat Lengkap" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  
                  {/* Select Resort */}
                  <div className="flex flex-col gap-1">
                    <select name="resort" required className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-emerald-800">
                      {daftarResortMode.map((r, i) => (
                        <option key={i} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  
                  <input type="number" name="simpananSukarela" placeholder="Sukarela Awal (Rp)" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />

                  <div className="md:col-span-6 flex flex-wrap justify-between items-start gap-4 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200 w-full md:w-auto">
                      <input 
                        type="text" 
                        value={inputResortBaru} 
                        onChange={(e) => setInputResortBaru(e.target.value)} 
                        placeholder="Ketik Resort Baru..." 
                        className="text-xs px-2 py-1.5 border rounded w-36" 
                      />
                      <button type="button" onClick={handleTambahResort} className="bg-slate-200 hover:bg-slate-300 px-3 py-1.5 text-xs font-semibold rounded">
                        Tambah ke Daftar
                      </button>
                    </div>
                    <button type="submit" className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold w-full md:w-auto">
                      + Daftarkan Anggota Baru
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-slate-800">Tabel Nasabah & Simpanan</h3>
                
                {/* TOGGLE AKTIF / KELUAR */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setTampilkanAnggota('Aktif')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${tampilkanAnggota === 'Aktif' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    Nasabah Aktif ({daftarAnggotaAktif.length})
                  </button>
                  <button 
                    onClick={() => setTampilkanAnggota('Keluar')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${tampilkanAnggota === 'Keluar' ? 'bg-red-50 text-red-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    Nasabah Keluar ({daftarAnggotaKeluar.length})
                  </button>
                </div>
              </div>
              <button
                onClick={exportSemuaAnggotaCSV}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow"
              >
                <FileSpreadsheet className="w-4 h-4" /> Unduh CSV Tabel
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">No Anggota</th>
                    <th className="py-3 px-4">Nama Lengkap</th>
                    <th className="py-3 px-4 text-center">Resort</th>
                    <th className="py-3 px-4 text-right">Total Simpanan</th>
                    <th className="py-3 px-4 text-right bg-amber-50">Pokok Pinjaman</th>
                    <th className="py-3 px-4 text-right bg-blue-50">Jasa Pinjaman</th>
                    <th className="py-3 px-4 text-center">Aksi (Admin)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {anggotaYgDitampilkan.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">Belum ada nasabah di kategori ini.</td>
                    </tr>
                  ) : (
                    anggotaYgDitampilkan.map((a) => {
                      const totalSimpanan = a.simpananPokok + a.simpananWajib + a.simpananSukarela
                      const sisaPokokPinjaman = a.pinjaman.filter((p: any) => p.status === 'Aktif').reduce((sum: number, p: any) => sum + p.sisaPinjaman, 0)
                      const totalJasaPinjamanTerbayar = a.pinjaman.reduce((sum: number, p: any) => sum + (p.jasaTerbayar || 0), 0)
                      const jasaBulananAktif = a.pinjaman.filter((p: any) => p.status === 'Aktif').reduce((sum: number, p: any) => sum + Math.round(p.jumlahPinjaman * (p.bungaPersen / 100)), 0)

                      return (
                        <tr key={a.id} className={a.statusAnggota === 'Keluar' ? 'bg-red-50/40' : 'hover:bg-emerald-50/40 transition'}>
                          <td className="py-3 px-4 font-mono font-semibold text-emerald-700">{a.noAnggota}</td>
                          <td className="py-3 px-4">
                            <button onClick={() => setDetailAnggotaModal(a)} className="font-bold text-emerald-800 hover:text-emerald-600 underline decoration-dotted text-left flex items-center gap-1.5">
                              {a.namaLengkap} <Eye className="w-3.5 h-3.5 inline" />
                            </button>
                            <span className="block text-[10px] text-slate-500 mt-0.5">{a.alamat}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-200">
                              {a.resort}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            Rp {totalSimpanan.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-amber-700 bg-amber-50/40">
                            {sisaPokokPinjaman > 0 ? `Rp ${sisaPokokPinjaman.toLocaleString('id-ID')}` : 'Rp 0'}
                          </td>
                          <td className="py-3 px-4 text-right bg-blue-50/40 text-blue-700 font-bold">
                            Rp {totalJasaPinjamanTerbayar.toLocaleString('id-ID')}
                            {sisaPokokPinjaman > 0 && <div className="text-[11px] font-normal text-slate-500">Tagihan/bln: Rp {jasaBulananAktif.toLocaleString('id-ID')}</div>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <div className="flex gap-1.5 w-full">
                                <button onClick={() => { setSelectedAnggotaId(a.id); setActiveTab('BUKU_TABUNGAN') }} className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded text-xs font-semibold">
                                  Buku
                                </button>
                                <button onClick={() => exportSatuAnggotaCSV(a)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-semibold">
                                  CSV
                                </button>
                              </div>

                              {role === 'ADMIN' && (
                                <div className="w-full">
                                  {a.statusAnggota === 'Aktif' ? (
                                    <form action={ubahStatusAnggota} className="mt-1 w-full">
                                      <input type="hidden" name="anggotaId" value={a.id} />
                                      <input type="hidden" name="statusBaru" value="Keluar" />
                                      <button 
                                        type="submit" 
                                        className="w-full inline-flex justify-center items-center gap-1 bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-semibold"
                                        onClick={(e) => {
                                          if(sisaPokokPinjaman > 0) {
                                            if(!confirm(`PERINGATAN! Nasabah ini masih memiliki hutang Rp ${sisaPokokPinjaman.toLocaleString('id-ID')}. Tetap keluarkan?`)) e.preventDefault();
                                          } else {
                                            if(!confirm('Keluarkan nasabah ini dari daftar aktif? (Riwayat tabungan tetap aman)')) e.preventDefault();
                                          }
                                        }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" /> Keluarkan
                                      </button>
                                    </form>
                                  ) : (
                                    <div className="flex flex-col gap-1 w-full mt-1">
                                      <form action={ubahStatusAnggota} className="w-full">
                                        <input type="hidden" name="anggotaId" value={a.id} />
                                        <input type="hidden" name="statusBaru" value="Aktif" />
                                        <button type="submit" className="w-full inline-flex justify-center items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs font-semibold">
                                          <RotateCcw className="w-3.5 h-3.5" /> Pulihkan ke Aktif
                                        </button>
                                      </form>

                                      <form action={hapusAnggotaPermanen} className="w-full">
                                        <input type="hidden" name="anggotaId" value={a.id} />
                                        <button 
                                          type="submit" 
                                          className="w-full inline-flex justify-center items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs font-semibold shadow-sm"
                                          onClick={(e) => {
                                            if(!confirm('HAPUS PERMANEN? Seluruh data riwayat simpanan dan pinjaman anggota ini akan musnah selamanya dan tidak bisa dikembalikan. Lanjutkan?')) e.preventDefault();
                                          }}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" /> Hapus Permanen
                                        </button>
                                      </form>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==============================================
            TAB 3: PINJAMAN & ANGSURAN
        ============================================== */}
        {activeTab === 'PINJAMAN' && (
          <div className="space-y-6">
            {role === 'ADMIN' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-700" /> Pencairan Pinjaman Baru
                  </h2>
                  <form action={ajukanPinjaman} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Anggota Aktif</label>
                        <select name="anggotaId" value={peminjamIdForm} onChange={(e) => setPeminjamIdForm(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          <option value="">-- Pilih Anggota --</option>
                          {daftarAnggotaAktif.map((a) => (
                            <option key={a.id} value={a.id}>{a.noAnggota} - {a.namaLengkap}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-emerald-700" /> Tanggal Pinjam</label>
                        <input type="date" name="tglPencairan" value={tglPencairanForm} onChange={(e) => setTglPencairanForm(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah Pinjaman (Rp)</label>
                        <input type="number" name="jumlahPinjaman" value={simPinjaman} onChange={(e) => setSimPinjaman(Number(e.target.value))} step={100000} min={100000} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tenor & Jasa Bulanan</label>
                        <select name="paketTenor" value={paketTenor} onChange={(e) => setPaketTenor(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                          {OPSI_TENOR_PINJAMAN.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                        </select>
                      </div>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs space-y-2 text-emerald-950">
                      <p className="font-bold text-sm text-emerald-900">Rincian Pinjaman (Sistem Bunga Putus):</p>
                      <div className="flex justify-between"><span>Saldo Simpanan Anggota Saat Ini:</span><span className="font-bold">Rp {saldoSimpananPeminjam.toLocaleString('id-ID')}</span></div>
                      <div className="flex justify-between text-red-700 font-semibold"><span>Diambil 2% dari Saldo Simpanannya:</span><span>- Rp {hasilSimulasi.ambil2PersenDariSimpanan.toLocaleString('id-ID')}</span></div>
                      <div className="border-t border-emerald-200 pt-1.5 space-y-1">
                        <div className="flex justify-between"><span>Pokok Pinjaman (Bunga Putus):</span><span className="font-bold">Rp {hasilSimulasi.jumlahPinjaman.toLocaleString('id-ID')}</span></div>
                        <div className="flex justify-between text-blue-800"><span>Estimasi Angsuran Pokok / Bulan:</span><span className="font-semibold">Rp {hasilSimulasi.angsuranPokokBulanan.toLocaleString('id-ID')} / bln</span></div>
                        <div className="flex justify-between text-blue-800"><span>Jasa Pinjaman ({hasilSimulasi.bungaPersen}%) / Bulan:</span><span className="font-semibold">Rp {hasilSimulasi.jasaBulanan.toLocaleString('id-ID')} / bln</span></div>
                      </div>
                    </div>

                    <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-lg text-sm transition">
                      Cairkan Pinjaman
                    </button>
                  </form>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-600" /> Pembayaran Angsuran Terpisah
                  </h2>
                  <form action={bayarAngsuran} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Pinjaman Aktif</label>
                      <select name="pinjamanId" value={selectedPinjamanBayarId} onChange={(e) => handlePilihPinjamanBayar(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="">-- Pilih Pinjaman Anggota --</option>
                        {semuaPinjamanAktif.map((p: any) => (<option key={p.id} value={p.id}>{p.noAnggota} - {p.namaAnggota} (Sisa Pokok: Rp{p.sisaPinjaman.toLocaleString('id-ID')})</option>))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-amber-600" /> Tanggal Pembayaran</label>
                      <input type="date" name="tglBayar" value={tglBayarForm} onChange={(e) => setTglBayarForm(e.target.value)} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Bayar Pokok (Rp)</label>
                        <input type="number" name="bayarPokok" value={inputBayarPokok} onChange={(e) => setInputBayarPokok(Number(e.target.value))} min={0} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-amber-800" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Bayar Jasa (Rp)</label>
                        <input type="number" name="bayarJasa" value={inputBayarJasa} onChange={(e) => setInputBayarJasa(Number(e.target.value))} min={0} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-blue-800" />
                      </div>
                    </div>

                    {selectedPinjamanBayarId && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex flex-wrap justify-between items-center gap-2 text-xs">
                        <div>
                          <span className="text-slate-600">Total Diterima: </span>
                          <strong className="text-sm text-emerald-800">Rp {(inputBayarPokok + inputBayarJasa).toLocaleString('id-ID')}</strong>
                        </div>
                        <button type="button" onClick={() => { const p = semuaPinjamanAktif.find((x: any) => x.id === selectedPinjamanBayarId); if (p) setInputBayarPokok(p.sisaPinjaman) }} className="bg-amber-200 hover:bg-amber-300 text-amber-950 px-2.5 py-1 rounded font-semibold">
                          Isi Lunas Sisa Pokok
                        </button>
                      </div>
                    )}
                    <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg text-sm transition">Simpan Pembayaran</button>
                  </form>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <div className="p-4 bg-emerald-900 text-white flex flex-wrap justify-between items-center gap-2">
                <div><h3 className="font-bold text-sm uppercase tracking-wider">1. Tabel Daftar Hutang Pinjaman Anggota</h3></div>
                <span className="text-xs bg-emerald-800 px-3 py-1 rounded-full">{semuaPinjamanAktif.length} Pinjaman Aktif</span>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Tgl Pinjam</th>
                    <th className="py-3 px-4">Anggota</th>
                    <th className="py-3 px-4 text-right">Pokok Awal</th>
                    <th className="py-3 px-4 text-center">Tenor & Jasa</th>
                    <th className="py-3 px-4 text-right text-amber-800">Sisa Pokok</th>
                    <th className="py-3 px-4 text-center">Kartu Angsuran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {semuaPinjaman.map((p: any) => (
                    <tr key={p.id} onClick={() => setKartuPinjamanModal(p)} className={`cursor-pointer transition ${p.status === 'Lunas' ? 'bg-slate-50 opacity-75' : 'hover:bg-emerald-50'}`}>
                      <td className="py-3 px-4 font-mono text-xs">{new Date(p.tglPencairan).toLocaleDateString('id-ID')}</td>
                      <td className="py-3 px-4 font-bold text-emerald-900">{p.noAnggota} - {p.namaAnggota}</td>
                      <td className="py-3 px-4 text-right">Rp {p.jumlahPinjaman.toLocaleString('id-ID')}</td>
                      <td className="py-3 px-4 text-center">{p.tenorBulan} Bln ({p.bungaPersen}%)</td>
                      <td className="py-3 px-4 text-right font-bold text-amber-700">{p.status === 'Lunas' ? 'LUNAS' : `Rp ${p.sisaPinjaman.toLocaleString('id-ID')}`}</td>
                      <td className="py-3 px-4 text-center"><button onClick={() => setKartuPinjamanModal(p)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold">Buka Kartu</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <div className="p-4 bg-amber-700 text-white flex justify-between items-center">
                <h3 className="font-bold text-sm uppercase tracking-wider">2. Tabel Riwayat Bayar Hutang</h3>
                <span className="text-xs bg-amber-800 px-3 py-1 rounded-full">{semuaRiwayatBayar.length} Transaksi</span>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Tanggal Bayar</th>
                    <th className="py-3 px-4">Nasabah / Anggota</th>
                    <th className="py-3 px-4 text-right bg-amber-50">Bayar Pokok</th>
                    <th className="py-3 px-4 text-right bg-blue-50">Bayar Jasa</th>
                    <th className="py-3 px-4 text-right font-bold">Total Setoran</th>
                    <th className="py-3 px-4 text-right">Sisa Pokok Hutang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {semuaRiwayatBayar.map((bayar: any) => {
                    const totalBayar = bayar.bayarPokok + bayar.bayarJasa
                    return (
                      <tr key={bayar.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs">{new Date(bayar.tglBayar).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                        <td className="py-3 px-4 font-medium">{bayar.noAnggota} - {bayar.namaAnggota}</td>
                        <td className="py-3 px-4 text-right font-bold text-amber-800 bg-amber-50/40">Rp {bayar.bayarPokok.toLocaleString('id-ID')}</td>
                        <td className="py-3 px-4 text-right font-bold text-blue-800 bg-blue-50/40">Rp {bayar.bayarJasa.toLocaleString('id-ID')}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-emerald-700">Rp {totalBayar.toLocaleString('id-ID')}</td>
                        <td className="py-3 px-4 text-right font-semibold">{bayar.sisaPokok === 0 ? <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-bold">LUNAS</span> : `Rp ${bayar.sisaPokok.toLocaleString('id-ID')}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: BUKU SIMPANAN ANGGOTA */}
        {activeTab === 'BUKU_TABUNGAN' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Pilih Anggota:</label>
                <select value={selectedAnggotaId} onChange={(e) => setSelectedAnggotaId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Pilih Anggota --</option>
                  {initialAnggota.map((a) => (
                    <option key={a.id} value={a.id}>{a.noAnggota} - {a.namaLengkap}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {anggotaTerpilih && (
                  <button onClick={() => exportSatuAnggotaCSV(anggotaTerpilih)} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-lg text-sm font-semibold"><Download className="w-4 h-4" /> Unduh CSV Buku Ini</button>
                )}
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow"><Printer className="w-4 h-4" /> Cetak Buku Simpanan Anggota</button>
              </div>
            </div>

            {anggotaTerpilih ? (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-400 print:shadow-none print:border-none text-slate-900">
                <div className="mb-5">
                  <div className="flex justify-between items-start">
                    <div className="w-1/3"></div>
                    <div className="w-1/3 text-center">
                      <h2 className="text-lg font-bold tracking-widest underline underline-offset-4 uppercase">BUKU - SIMPANAN ANGGOTA</h2>
                      <p className="text-[11px] text-slate-600 mt-0.5">KOPERASI MULYA BUDHI MANDIRI</p>
                    </div>
                    <div className="w-1/3 text-xs space-y-1 pl-8">
                      <div className="flex"><span className="w-32">No. Urut Simpanan</span><span className="font-mono font-bold">: {String(indexUrutAnggota).padStart(3, '0')}</span></div>
                      <div className="flex"><span className="w-32">Nomor Anggota</span><span className="font-mono font-bold">: {anggotaTerpilih.noAnggota}</span></div>
                    </div>
                  </div>
                  <div className="mt-4 text-xs space-y-1.5 max-w-md">
                    <div className="flex"><span className="w-20 tracking-widest">Nama</span><span className="font-bold uppercase">: {anggotaTerpilih.namaLengkap}</span></div>
                    <div className="flex"><span className="w-20 tracking-widest">Alamat</span><span>: {anggotaTerpilih.alamat}</span></div>
                  </div>
                </div>

                <table className="w-full border-collapse border-2 border-slate-900 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900">
                      <th rowSpan={2} className="border border-slate-800 py-2 px-2 text-center w-20">Tgl.</th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-2 text-center w-20">Nomor<br />Bukti</th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-3 text-center">U r a i a n</th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-1.5 text-center w-8">+<br />-</th>
                      <th colSpan={4} className="border border-slate-800 py-1 px-2 text-center tracking-widest">S I M P A N A N</th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-2 text-center w-28">JUMLAH<br />SIMPANAN</th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-2 text-center w-24">Keterangan<br /><span className="text-[10px] font-normal">paraf Petugas</span></th>
                      <th rowSpan={2} className="border border-slate-800 py-2 px-2 text-center w-28 print:hidden">Cetak<br />Kuitansi</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-900">
                      <th className="border border-slate-800 py-1 px-2 text-center w-20">Pokok</th>
                      <th className="border border-slate-800 py-1 px-2 text-center w-20">Wajib</th>
                      <th className="border border-slate-800 py-1 px-2 text-center w-24">Sukarela</th>
                      <th className="border border-slate-800 py-1 px-2 text-center w-20">Lain-lain</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[11px]">
                    {anggotaTerpilih.bukuTabungan.map((row: any, idx: number) => {
                      const r = parseRincianSimpanan(row)
                      const isPengurangan = row.debet > 0
                      const noBukti = `BKT-${String(idx + 1).padStart(3, '0')}`

                      let nominalKuitansi = row.kredit > 0 ? row.kredit : row.debet
                      if (row.sandi === 'ANGSURAN') {
                        const matchNominal = row.keterangan?.match(/Rp([\d\.]+)/)
                        if (matchNominal) nominalKuitansi = Number(matchNominal[1].replace(/\./g, ''))
                      }

                      return (
                        <tr key={row.id} className="border-b border-slate-400">
                          <td className="border-x border-slate-800 py-1.5 px-2 text-center">{new Date(row.tgl).toLocaleDateString('id-ID')}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-center">{noBukti}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 font-sans">{r.uraian}</td>
                          <td className={`border-x border-slate-800 py-1.5 px-1 text-center font-bold text-sm ${isPengurangan ? 'text-red-600' : 'text-emerald-700'}`}>{isPengurangan ? '-' : '+'}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-right">{r.pokok > 0 ? r.pokok.toLocaleString('id-ID') : '-'}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-right">{r.wajib > 0 ? r.wajib.toLocaleString('id-ID') : '-'}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-right">{r.sukarela > 0 ? r.sukarela.toLocaleString('id-ID') : '-'}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-right">{r.lain > 0 ? r.lain.toLocaleString('id-ID') : '-'}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-right font-bold">{row.saldo.toLocaleString('id-ID')}</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-center font-sans text-[10px] text-slate-500">Paraf</td>
                          <td className="border-x border-slate-800 py-1.5 px-2 text-center print:hidden font-sans">
                            <button
                              onClick={() => setKuitansiModal({ noKuitansi: noBukti, tanggal: new Date(row.tgl).toLocaleDateString('id-ID'), namaAnggota: anggotaTerpilih.namaLengkap, noAnggota: anggotaTerpilih.noAnggota, jenisTransaksi: row.sandi === 'ANGSURAN' ? 'PEMBAYARAN ANGSURAN PINJAMAN' : isPengurangan ? 'PENGAMBILAN / PENARIKAN SIMPANAN' : 'SETORAN SIMPANAN ANGGOTA', nominal: nominalKuitansi, keterangan: row.keterangan })}
                              className="inline-flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-semibold"
                            ><Receipt className="w-3 h-3" /> Kuitansi</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-xl text-center text-slate-400 border border-slate-200">Silakan pilih anggota terlebih dahulu.</div>
            )}
          </div>
        )}

        {/* TAB 5: TABEL SIMPANAN JASA 0,5% */}
        {activeTab === 'TABEL_JASA_05' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Buku Tabel Simpanan Sukarela (Berjasa 0,5% / Bulan)</h2>
              </div>
              {role === 'ADMIN' && (
                <form action={prosesBungaSukarelaBulanan}>
                  <button type="submit" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg text-xs shadow transition">
                    <Sparkles className="w-4 h-4" /> Tambahkan Jasa +0,5% Bulan Ini ke Semua Anggota Aktif
                  </button>
                </form>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border-2 border-slate-400 overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-500 text-slate-800">
                    <th className="border-r border-slate-400 py-3 px-4 w-52">Nama Anggota</th>
                    <th className="border-r border-slate-400 py-3 px-4 w-44 text-right">Saldo Simpanan (Rp)</th>
                    <th className="border-r border-slate-400 py-3 px-4 w-36 text-right bg-blue-50 text-blue-900">Jasa 0,5% / Bln</th>
                    <th className="py-3 px-4">Catatan Mutasi Tanggal & Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 font-mono text-xs">
                  {daftarAnggotaAktif.map((a) => {
                    const jasaBulanan = Math.round(a.simpananSukarela * 0.005)
                    const mutasiSukarela = a.bukuTabungan.filter((m: any) => m.sandi !== 'WAJIB' && !m.keterangan?.includes('Simpanan Wajib Bulanan') && !m.keterangan?.includes('Bayar Angsuran'))

                    return (
                      <tr key={a.id} className="hover:bg-amber-50/30">
                        <td className="border-r border-slate-400 py-3 px-4 font-sans font-bold text-slate-800">
                          <button onClick={() => setDetailAnggotaModal(a)} className="hover:text-emerald-700 underline decoration-dotted underline-offset-4 text-left">{a.namaLengkap}</button>
                        </td>
                        <td className="border-r border-slate-400 py-3 px-4 text-right font-bold text-sm text-slate-900">{a.simpananSukarela.toLocaleString('id-ID')}</td>
                        <td className="border-r border-slate-400 py-3 px-4 text-right font-semibold text-blue-700 bg-blue-50/40">+ {jasaBulanan.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            {mutasiSukarela.map((m: any, i: number) => {
                              const tglObj = new Date(m.tgl)
                              const tglPendek = `${tglObj.getDate()}/${tglObj.getMonth() + 1}/${String(tglObj.getFullYear()).slice(-2)}`
                              const isTarik = m.debet > 0
                              const nominal = isTarik ? m.debet : m.kredit

                              return (
                                <span key={m.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${isTarik ? 'bg-red-50 border-red-200 text-red-700 font-semibold' : m.sandi === 'JASA_05' || m.sandi === '105' ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                                  <sup className="text-[10px] font-bold">{tglPendek}</sup>
                                  <span>{isTarik ? '-' : '+'} {nominal.toLocaleString('id-ID')}</span>
                                  {i === mutasiSukarela.length - 1 && (<span className="font-extrabold ml-1 text-slate-900">= {a.simpananSukarela.toLocaleString('id-ID')}</span>)}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: INPUT SETOR / TARIK SIMPANAN */}
        {activeTab === 'INPUT_TRANSAKSI' && (
          <div className="space-y-6">
            {role === 'ADMIN' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 max-w-2xl">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-emerald-600" /> Input Setoran / Penarikan Simpanan
                </h2>
                <form action={transaksiSimpanan} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Anggota Aktif</label>
                      <select name="anggotaId" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                        <option value="">-- Pilih Anggota --</option>
                        {daftarAnggotaAktif.map((a) => (
                          <option key={a.id} value={a.id}>{a.noAnggota} - {a.namaLengkap}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Transaksi</label>
                      <input type="date" name="tglTransaksi" defaultValue={todayStr} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kolom Jenis Simpanan</label>
                    <select name="jenis" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      <option value="WAJIB">(+) Setor Simpanan Wajib (Rp 5.000/bln)</option>
                      <option value="SUKARELA_SETOR">(+) Setor Simpanan Sukarela (Jasa 0,5%)</option>
                      <option value="SUKARELA_TARIK">(-) Tarik Simpanan Sukarela</option>
                      <option value="LAIN_LAIN">(+) Setor Simpanan Lain-lain</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nominal (Rp)</label>
                      <input type="number" name="nominal" defaultValue={5000} min={500} required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Uraian Tambahan (Opsional)</label>
                      <input type="text" name="catatan" placeholder="Misal: Bulan November" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-lg text-sm transition">
                    Simpan ke Buku Simpanan Anggota
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================================
          MODAL TABEL KARTU ANGSURAN LENGKAP
      ========================================================================= */}
      {kartuPinjamanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 md:p-6 print:static print:bg-white print:p-0 overflow-y-auto">
          <div className="bg-sky-50 rounded-2xl shadow-2xl max-w-6xl w-full p-5 md:p-8 border-2 border-sky-300 print:shadow-none print:border-2 print:border-slate-900 print:bg-white max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-sky-200 print:hidden">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-sky-700" /> Kartu Angsuran Pinjaman Anggota
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow"><Printer className="w-4 h-4" /> Cetak Kartu</button>
                <button onClick={() => setKartuPinjamanModal(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 p-1.5 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b-2 border-slate-800 pb-4 mb-5 text-xs">
              <div className="space-y-1">
                <p className="font-bold text-sm uppercase text-slate-900">KOPERASI SIMPAN PINJAM &ldquo;MULYA BUDHI MANDIRI&rdquo;</p>
                <p className="text-slate-600">Alamat: Soko Bagelen, Purworejo • Sistem Bunga Putus</p>
                <p className="text-slate-600">Tenor: <strong>{kartuPinjamanModal.tenorBulan} Bulan</strong> • Jasa: <strong>{kartuPinjamanModal.bungaPersen}% / bulan</strong></p>
              </div>
              <div className="space-y-1.5 font-mono text-xs bg-white/80 p-3 rounded-lg border border-sky-200">
                <div className="flex"><span className="w-28 font-bold">NAMA</span><span>: {kartuPinjamanModal.namaAnggota} ({kartuPinjamanModal.noAnggota})</span></div>
                <div className="flex"><span className="w-28 font-bold">ALAMAT</span><span>: {kartuPinjamanModal.alamatAnggota || '-'}</span></div>
                <div className="flex"><span className="w-28 font-bold">TGL PINJAM</span><span>: {new Date(kartuPinjamanModal.tglPencairan).toLocaleDateString('id-ID')}</span></div>
                <div className="flex"><span className="w-28 font-bold">PINJAMAN</span><span className="font-extrabold text-emerald-800">: Rp {kartuPinjamanModal.jumlahPinjaman.toLocaleString('id-ID')}</span></div>
              </div>
            </div>

            <div className="overflow-x-auto bg-white border-2 border-slate-900">
              <table className="w-full border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-sky-100 text-slate-900 border-b-2 border-slate-900">
                    <th className="border border-slate-800 py-2 px-2 text-center">Tanggal</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Jasa</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Pokok</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Simpanan</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Angsuran<br />Tunggakan Jasa</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Jumlah</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Jasa yang<br />belum dibayar</th>
                    <th className="border border-slate-800 py-2 px-2 text-center">Cicilan</th>
                    <th className="border border-slate-800 py-2 px-2 text-right">Sisa Pinjaman</th>
                    <th className="border border-slate-800 py-2 px-2 text-center">Tanda Tangan<br />Anggota</th>
                    <th className="border border-slate-800 py-2 px-2 text-center print:hidden bg-slate-100 text-slate-700">Kuitansi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50 border-b border-slate-400">
                    <td className="border-x border-slate-800 py-1.5 px-2 text-center">{new Date(kartuPinjamanModal.tglPencairan).toLocaleDateString('id-ID')}</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right text-blue-700">{kartuPinjamanModal.setoranSimpanan2Persen > 0 ? `-${kartuPinjamanModal.setoranSimpanan2Persen.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-center">Awal</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-right font-bold">{kartuPinjamanModal.jumlahPinjaman.toLocaleString('id-ID')}</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-center text-[10px] text-slate-400">-</td>
                    <td className="border-x border-slate-800 py-1.5 px-2 text-center print:hidden font-sans bg-slate-50">
                      <button onClick={() => setKuitansiModal({ noKuitansi: `KW-AWL-${kartuPinjamanModal.id.slice(0, 5).toUpperCase()}`, tanggal: new Date(kartuPinjamanModal.tglPencairan).toLocaleDateString('id-ID'), namaAnggota: kartuPinjamanModal.namaAnggota, noAnggota: kartuPinjamanModal.noAnggota, jenisTransaksi: 'PENCAIRAN PINJAMAN AWAL', nominal: kartuPinjamanModal.jumlahPinjaman, keterangan: `Pencairan Pokok Pinjaman Tenor ${kartuPinjamanModal.tenorBulan} Bulan (Jasa ${kartuPinjamanModal.bungaPersen}%/bln). Ambil 2% saldo simpanan: Rp ${kartuPinjamanModal.setoranSimpanan2Persen.toLocaleString('id-ID')}.` })} className="inline-flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-300">
                        <Receipt className="w-3 h-3" /> Cetak
                      </button>
                    </td>
                  </tr>

                  {(kartuPinjamanModal.riwayatAngsuran || []).map((ang: any, idx: number) => {
                    const jasaBulananStandar = Math.round(kartuPinjamanModal.jumlahPinjaman * (kartuPinjamanModal.bungaPersen / 100))
                    const tunggakanJasa = Math.max(0, jasaBulananStandar - (ang.bayarJasa || 0))
                    const jumlahSetoran = (ang.bayarPokok || 0) + (ang.bayarJasa || 0)
                    const jasaBelumDibayar = ang.sisaPokok === 0 ? 0 : tunggakanJasa

                    return (
                      <tr key={ang.id} className="border-b border-slate-400 hover:bg-sky-50/50">
                        <td className="border-x border-slate-800 py-2 px-2 text-center">{new Date(ang.tglBayar).toLocaleDateString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right text-blue-800 font-semibold">{(ang.bayarJasa || 0).toLocaleString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right text-amber-800 font-semibold">{(ang.bayarPokok || 0).toLocaleString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right">-</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right">{tunggakanJasa > 0 ? tunggakanJasa.toLocaleString('id-ID') : '0'}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right font-bold text-emerald-800">{jumlahSetoran.toLocaleString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right">{jasaBelumDibayar.toLocaleString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-center font-bold">Ke-{idx + 1}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-right font-extrabold">{(ang.sisaPokok || 0).toLocaleString('id-ID')}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-center text-[10px] font-sans text-slate-600">✓ {kartuPinjamanModal.namaAnggota}</td>
                        <td className="border-x border-slate-800 py-2 px-2 text-center print:hidden font-sans bg-slate-50">
                          <button onClick={() => setKuitansiModal({ noKuitansi: `KW-ANG-${ang.id.slice(0, 5).toUpperCase()}`, tanggal: new Date(ang.tglBayar).toLocaleDateString('id-ID'), namaAnggota: kartuPinjamanModal.namaAnggota, noAnggota: kartuPinjamanModal.noAnggota, jenisTransaksi: `PEMBAYARAN ANGSURAN KE-${idx + 1}`, nominal: jumlahSetoran, keterangan: `Bayar Pokok Rp ${(ang.bayarPokok || 0).toLocaleString('id-ID')} + Jasa Rp ${(ang.bayarJasa || 0).toLocaleString('id-ID')}. Sisa Pokok: Rp ${(ang.sisaPokok || 0).toLocaleString('id-ID')}.` })} className="inline-flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-1 rounded text-[10px] font-bold border border-amber-300">
                            <Receipt className="w-3 h-3" /> Cetak
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {Array.from({ length: Math.max(0, 6 - (kartuPinjamanModal.riwayatAngsuran?.length || 0)) }).map((_, emptyIdx) => (
                    <tr key={`empty-${emptyIdx}`} className="border-b border-slate-300 h-7">
                      <td className="border-x border-slate-800 px-2 text-center text-slate-300">{(kartuPinjamanModal.riwayatAngsuran?.length || 0) + emptyIdx + 1}</td>
                      <td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800"></td><td className="border-x border-slate-800 print:hidden"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap justify-between items-center text-xs text-slate-600 print:hidden">
              <span>*Sistem Bunga Putus: Apabila sisa pinjaman sudah lunas, jasa bulan berikutnya tidak ditagihkan.</span>
              <button onClick={() => setKartuPinjamanModal(null)} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-1.5 rounded-lg font-semibold">Tutup Kartu Angsuran</button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP DETAIL ANGGOTA */}
      {detailAnggotaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden border border-slate-200">
            <div className="bg-emerald-800 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase tracking-wider bg-emerald-950/60 px-2.5 py-0.5 rounded text-emerald-200 font-mono">
                  {detailAnggotaModal.noAnggota}
                </span>
                <h3 className="text-xl font-bold mt-1">{detailAnggotaModal.namaLengkap}</h3>
                <p className="text-xs text-emerald-200">Alamat: {detailAnggotaModal.alamat}</p>
              </div>
              <button onClick={() => setDetailAnggotaModal(null)} className="text-emerald-200 hover:text-white p-1 rounded-lg"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-emerald-800">Jumlah Simpanan Dimiliki</span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                    Rp {(detailAnggotaModal.simpananPokok + detailAnggotaModal.simpananWajib + detailAnggotaModal.simpananSukarela).toLocaleString('id-ID')}
                  </p>
                  <div className="mt-3 pt-2 border-t border-emerald-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Simpanan Pokok:</span>
                      <span className="font-semibold">Rp {detailAnggotaModal.simpananPokok.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Simpanan Wajib:</span>
                      <span className="font-semibold">Rp {detailAnggotaModal.simpananWajib.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-blue-800 font-bold">
                      <span className="max-w-[130px] leading-tight mt-1">Simpanan Sukarela (Jasa 0,5%):</span>
                      <span className="mt-1">Rp {detailAnggotaModal.simpananSukarela.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>

                {(() => {
                  const pinjamanAktifList = detailAnggotaModal.pinjaman.filter((p: any) => p.status === 'Aktif')
                  const totalSisaPokok = pinjamanAktifList.reduce((acc: number, p: any) => acc + p.sisaPinjaman, 0)
                  const totalJasaMasuk = detailAnggotaModal.pinjaman.reduce((acc: number, p: any) => acc + (p.jasaTerbayar || 0), 0)

                  return (
                    <div className={`rounded-xl p-4 border ${totalSisaPokok > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase text-amber-900">Sisa Pokok Hutang</span>
                        <AlertCircle className={`w-5 h-5 ${totalSisaPokok > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                      </div>
                      <p className="text-2xl font-extrabold text-amber-700 mt-1">Rp {totalSisaPokok.toLocaleString('id-ID')}</p>
                      <div className="mt-3 pt-2 border-t border-amber-200 text-xs space-y-1">
                        <div className="flex justify-between text-blue-800 font-semibold">
                          <span>Jasa Sudah Dibayar:</span>
                          <span>Rp {totalJasaMasuk.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span>Sistem Bunga:</span>
                          <span className="font-bold">Bunga Putus</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <button onClick={() => exportSatuAnggotaCSV(detailAnggotaModal)} className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold">
                  <Download className="w-4 h-4" /> Unduh CSV Anggota Ini
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setSelectedAnggotaId(detailAnggotaModal.id); setDetailAnggotaModal(null); setActiveTab('BUKU_TABUNGAN') }} className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg text-xs font-semibold">Lihat Buku Simpanan</button>
                  <button onClick={() => setDetailAnggotaModal(null)} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-semibold">Tutup</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CETAK KUITANSI */}
      {kuitansiModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 border border-slate-300 print:shadow-none print:border-2 print:border-slate-900">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200 print:hidden">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-700" /> Cetak Kuitansi Resmi
              </h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">Print / PDF</button>
                <button onClick={() => setKuitansiModal(null)} className="bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold">Tutup</button>
              </div>
            </div>
            <div className="border-2 border-slate-800 p-6 font-mono text-xs space-y-4">
              <div className="flex justify-between border-b-2 border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold">KOPERASI MULYA BUDHI MANDIRI</h2>
                  <p className="text-[11px]">Bagelen • Bukti Transaksi Sah</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">NO BUKTI: {kuitansiModal.noKuitansi}</p>
                  <p>Tgl: {kuitansiModal.tanggal}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p><strong>Nama Anggota:</strong> {kuitansiModal.namaAnggota} ({kuitansiModal.noAnggota})</p>
                <p><strong>Jenis Transaksi:</strong> {kuitansiModal.jenisTransaksi}</p>
                <p><strong>Uraian:</strong> {kuitansiModal.keterangan}</p>
              </div>
              <div className="bg-slate-100 border border-slate-800 p-3 flex justify-between items-center font-bold">
                <span>NOMINAL DIBAYAR:</span>
                <span className="text-base text-emerald-800">Rp {kuitansiModal.nominal.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}