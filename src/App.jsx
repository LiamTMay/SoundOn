import { Music } from 'lucide-react'

export default function App() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Music className="size-10 text-emerald-400" aria-hidden="true" />
      <h1 className="text-3xl font-bold tracking-tight">SoundON</h1>
      <p className="text-sm text-neutral-400">Player state is ready. Search and playback arrive in later phases.</p>
    </main>
  )
}
