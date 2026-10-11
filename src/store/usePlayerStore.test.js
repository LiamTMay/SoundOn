import { beforeEach, describe, expect, it } from 'vitest'
import { RESTART_THRESHOLD_S, setStreamResolver, usePlayerStore } from './usePlayerStore'

const makeTrack = (n) => ({
  id: `t${n}`,
  title: `Song ${n}`,
  artist: `Artist ${n}`,
  albumArtUrl: `https://img.example/${n}.jpg`,
  durationMs: 200_000,
  provider: 'spotify',
})

const tracks = [makeTrack(1), makeTrack(2), makeTrack(3)]
const urlFor = (track) => `https://audio.example/${track.id}.m4a`
const store = () => usePlayerStore.getState()

// A promise the test settles by hand, to observe the loading state mid-resolution.
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  setStreamResolver(async (track) => urlFor(track))
})

describe('playTrack', () => {
  it('shows a loading state, then plays the resolved stream', async () => {
    const pending = deferred()
    setStreamResolver(() => pending.promise)

    const playing = store().playTrack(tracks[1], tracks)
    expect(store()).toMatchObject({
      isLoading: true,
      isPlaying: true,
      progress: 0,
      duration: 200,
      queueIndex: 1,
      currentTrack: { id: 't2', streamUrl: null },
    })
    expect(store().queue).toBe(tracks)

    pending.resolve(urlFor(tracks[1]))
    await playing
    expect(store()).toMatchObject({
      isLoading: false,
      isPlaying: true,
      currentTrack: { id: 't2', title: 'Song 2', streamUrl: urlFor(tracks[1]) },
    })
  })

  it('appends to the current queue when no context is given', async () => {
    await store().playTrack(tracks[0], tracks.slice(0, 2))
    await store().playTrack(tracks[2])
    expect(store().queue.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(store().queueIndex).toBe(2)
  })

  it('picks the exact object when the same song appears twice in the queue', async () => {
    const repeat = { ...tracks[0] }
    const queue = [tracks[0], tracks[1], repeat]
    await store().playTrack(repeat, queue)
    expect(store().queueIndex).toBe(2)
  })

  it('aborts and ignores a slower resolution that a newer click replaced', async () => {
    const slow = deferred()
    let slowSignal
    setStreamResolver((track, { signal }) => {
      if (track.id === 't1') {
        slowSignal = signal
        return slow.promise
      }
      return Promise.resolve(urlFor(track))
    })

    const first = store().playTrack(tracks[0], tracks)
    await store().playTrack(tracks[1], tracks)
    expect(slowSignal.aborted).toBe(true)

    slow.resolve(urlFor(tracks[0]))
    await first
    expect(store().currentTrack).toMatchObject({ id: 't2', streamUrl: urlFor(tracks[1]) })
    expect(store().isLoading).toBe(false)
  })

  it('reports a failed resolution and skips to the next track', async () => {
    setStreamResolver(async (track) => {
      if (track.id === 't1') throw new Error('No match on Piped')
      return urlFor(track)
    })

    await store().playTrack(tracks[0], tracks)
    expect(store().error).toMatchObject({
      trackId: 't1',
      message: 'Couldn\'t find audio for "Song 1". Skipping to the next track.',
    })
    expect(store().error.cause.message).toBe('No match on Piped')
    expect(store()).toMatchObject({
      queueIndex: 1,
      isPlaying: true,
      isLoading: false,
      currentTrack: { id: 't2', streamUrl: urlFor(tracks[1]) },
    })
  })

  it('skips past several failures in a row', async () => {
    setStreamResolver(async (track) => {
      if (track.id !== 't3') throw new Error('No match')
      return urlFor(track)
    })
    await store().playTrack(tracks[0], tracks)
    expect(store().currentTrack).toMatchObject({ id: 't3', streamUrl: urlFor(tracks[2]) })
    expect(store().error.trackId).toBe('t2')
  })

  it('stops when the last track fails', async () => {
    setStreamResolver(async () => {
      throw new Error('No match')
    })
    await store().playTrack(tracks[2], tracks)
    expect(store()).toMatchObject({ isPlaying: false, isLoading: false, queueIndex: 2 })
    expect(store().error.message).toBe('Couldn\'t find audio for "Song 3".')
  })

  it('treats an empty resolver result as a failure', async () => {
    setStreamResolver(async () => '')
    await store().playTrack(tracks[2], tracks)
    expect(store().error.cause.message).toBe('Resolver returned no stream URL')
  })
})

describe('transport controls', () => {
  it('pauses and resumes', async () => {
    await store().playTrack(tracks[0], tracks)
    store().pause()
    expect(store().isPlaying).toBe(false)
    store().resume()
    expect(store().isPlaying).toBe(true)
    store().togglePlay()
    expect(store().isPlaying).toBe(false)
  })

  it('ignores resume with nothing playable', async () => {
    store().resume()
    expect(store().isPlaying).toBe(false)

    setStreamResolver(async () => {
      throw new Error('No match')
    })
    await store().playTrack(tracks[2], tracks)
    store().resume()
    expect(store().isPlaying).toBe(false)
  })

  it('moves forward and back through the queue', async () => {
    await store().playTrack(tracks[0], tracks)
    await store().nextTrack()
    expect(store().currentTrack.id).toBe('t2')
    await store().prevTrack()
    expect(store().currentTrack.id).toBe('t1')
  })

  it('stops and rewinds at the end of the queue', async () => {
    await store().playTrack(tracks[2], tracks)
    store().setProgress(150)
    await store().nextTrack()
    expect(store()).toMatchObject({ isPlaying: false, progress: 0, currentTrack: { id: 't3' } })
    expect(store().seekRequest.time).toBe(0)
  })

  it('restarts the current track when previous is pressed past the threshold', async () => {
    await store().playTrack(tracks[1], tracks)
    store().setProgress(RESTART_THRESHOLD_S + 1)
    await store().prevTrack()
    expect(store().currentTrack.id).toBe('t2')
    expect(store().seekRequest.time).toBe(0)
  })

  it('restarts the first track instead of going back', async () => {
    await store().playTrack(tracks[0], tracks)
    await store().prevTrack()
    expect(store().currentTrack.id).toBe('t1')
    expect(store().seekRequest.time).toBe(0)
  })

  it('does nothing without a current track', async () => {
    await store().nextTrack()
    await store().prevTrack()
    store().seek(10)
    expect(store()).toMatchObject({ currentTrack: null, seekRequest: null, isPlaying: false })
  })
})

describe('seek, volume and engine reports', () => {
  it('clamps seeks to the track and issues a fresh request each time', async () => {
    await store().playTrack(tracks[0], tracks)
    store().seek(500)
    const first = store().seekRequest
    expect(first.time).toBe(200)
    expect(store().progress).toBe(200)

    store().seek(-5)
    expect(store().seekRequest.time).toBe(0)
    expect(store().seekRequest.id).not.toBe(first.id)
  })

  it('clamps volume between 0 and 1', () => {
    store().setVolume(1.5)
    expect(store().volume).toBe(1)
    store().setVolume(-1)
    expect(store().volume).toBe(0)
    store().setVolume(0.4)
    expect(store().volume).toBe(0.4)
  })

  it('keeps the metadata duration until the audio reports a real one', async () => {
    await store().playTrack(tracks[0], tracks)
    store().setDuration(Number.NaN)
    store().setDuration(Infinity)
    expect(store().duration).toBe(200)
    store().setDuration(198.4)
    expect(store().duration).toBe(198.4)
  })
})

describe('clearError', () => {
  it('only clears the error it was given', async () => {
    setStreamResolver(async () => {
      throw new Error('No match')
    })
    await store().playTrack(tracks[2], tracks)
    const { id } = store().error

    store().clearError(id - 1)
    expect(store().error).not.toBeNull()
    store().clearError(id)
    expect(store().error).toBeNull()
  })
})
