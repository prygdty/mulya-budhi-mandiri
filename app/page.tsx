import { unstable_noStore as noStore } from 'next/cache'
import { getKoperasiData } from './actions'
import DashboardClient from './DashboardClient'

export default async function Page() {
  // Fungsi ini menggantikan 'force-dynamic' untuk memberitahu Next.js 
  // agar sentiasa mengambil data terkini dari pangkalan data (tiada cache)
  noStore()
  
  const anggota = await getKoperasiData()
  
  return <DashboardClient initialAnggota={anggota} />
}