import { create } from 'zustand'

/**
 * Unified track shape shared by every metadata provider:
 *   { id, title, artist, albumArtUrl, durationMs, provider, streamUrl? }
 *
 * `currentTrack` is that object plus a resolved `streamUrl`, which stays null
 * while the audio source is being resolved in the background.
 *
 * The store never touches an <audio> element. It holds intent (isPlaying,
 * seekRequest, volume) and the AudioEngine component applies it, then reports
 * back through setProgress / setDuration.
 */

// Pressing "previous" this far into a track restarts it instead of going back.
export const RESTART_THRESHOLD_S = 3

// Default resolver: plays tracks that already carry a streamUrl. The Piped
// resolver is plugged in with setStreamResolver().
const passthroughResolver = async (track) => {
  if (track.streamUrl) return track.streamUrl
  throw new Error('No stream resolver is configured')
}

let resolveStream = passthroughResolver

/**
 * Swap the function that turns a track into a playable audio URL.
 * Signature: (track, { signal }) => Promise<string>. Passing null restores the default.
 */
export function setStreamResolver(resolver) {
  resolveStream = resolver ?? passthroughResolver
}

// Only the newest resolution may update the store; older ones are aborted and ignored.
let activeRequest = null
let requestCounter = 0
let seekCounter = 0
let errorCounter = 0

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const usePlayerStore = create((set, get) => {
  const startAt = async (index) => {
    const { queue } = get()
    const track = queue[index]
    if (!track) return

    activeRequest?.controller.abort()
    const request = { id: ++requestCounter, controller: new AbortController() }
    activeRequest = request

    set({
      queueIndex: index,
      currentTrack: { ...track, streamUrl: null },
      isPlaying: true,
      isLoading: true,
      progress: 0,
      duration: (track.durationMs ?? 0) / 1000,
      seekRequest: null,
    })

    try {
      const streamUrl = await resolveStream(track, { signal: request.controller.signal })
      if (activeRequest !== request) return
      if (!streamUrl) throw new Error('Resolver returned no stream URL')
      activeRequest = null
      set({ currentTrack: { ...track, streamUrl }, isLoading: false })
    } catch (cause) {
      if (activeRequest !== request) return
      activeRequest = null

      const hasNext = index < get().queue.length - 1
      set({
        isLoading: false,
        isPlaying: false,
        error: {
          id: ++errorCounter,
          trackId: track.id,
          message: hasNext
            ? `Couldn't find audio for "${track.title}". Skipping to the next track.`
            : `Couldn't find audio for "${track.title}".`,
          cause,
        },
      })
      if (hasNext) return startAt(index + 1)
    }
  }

  return {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isLoading: false,
    progress: 0,
    duration: 0,
    volume: 1,
    error: null,
    seekRequest: null,

    /**
     * Play a track. Pass the list it was picked from (search results, an album)
     * as contextQueue to make that list the queue; otherwise the track is found
     * in, or appended to, the current queue.
     */
    playTrack: (track, contextQueue) => {
      if (!track) return Promise.resolve()

      let queue = Array.isArray(contextQueue) && contextQueue.length ? contextQueue : get().queue
      let index = queue.indexOf(track)
      if (index === -1) index = queue.findIndex((t) => t.id === track.id)
      if (index === -1) {
        queue = [...queue, track]
        index = queue.length - 1
      }

      set({ queue })
      return startAt(index)
    },

    pause: () => {
      if (get().currentTrack) set({ isPlaying: false })
    },

    resume: () => {
      const { currentTrack, isLoading } = get()
      if (currentTrack && (currentTrack.streamUrl || isLoading)) set({ isPlaying: true })
    },

    togglePlay: () => (get().isPlaying ? get().pause() : get().resume()),

    nextTrack: () => {
      const { currentTrack, queue, queueIndex } = get()
      if (!currentTrack) return Promise.resolve()
      if (queueIndex < queue.length - 1) return startAt(queueIndex + 1)

      // End of the queue: stop and rewind so play starts the last track again.
      activeRequest?.controller.abort()
      activeRequest = null
      set({ isPlaying: false, isLoading: false })
      get().seek(0)
      return Promise.resolve()
    },

    prevTrack: () => {
      const { currentTrack, progress, queueIndex } = get()
      if (!currentTrack) return Promise.resolve()
      if (progress > RESTART_THRESHOLD_S || queueIndex <= 0) {
        get().seek(0)
        return Promise.resolve()
      }
      return startAt(queueIndex - 1)
    },

    /** Request a jump to `seconds`. AudioEngine watches seekRequest and applies it. */
    seek: (seconds) => {
      const { currentTrack, duration } = get()
      if (!currentTrack) return
      const target = Number(seconds) || 0
      const time = duration > 0 ? clamp(target, 0, duration) : Math.max(0, target)
      set({ progress: time, seekRequest: { time, id: ++seekCounter } })
    },

    setVolume: (volume) => set({ volume: clamp(Number(volume) || 0, 0, 1) }),

    // Reported by AudioEngine from the <audio> element's events.
    setProgress: (seconds) => set({ progress: Math.max(0, Number(seconds) || 0) }),
    setDuration: (seconds) => {
      const value = Number(seconds)
      if (Number.isFinite(value) && value > 0) set({ duration: value })
    },

    /** Dismiss the current error. Pass its id so a stale timer can't clear a newer error. */
    clearError: (id) => {
      const { error } = get()
      if (error && (id === undefined || error.id === id)) set({ error: null })
    },
  }
})
