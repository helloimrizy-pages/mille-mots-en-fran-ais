import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudio } from './useAudio';

describe('useAudio', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
    pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('plays a clip and reports isPlaying for that id', async () => {
    const { result } = renderHook(() => useAudio());
    await act(async () => { await result.current.play('livre-word', '/audio/words/livre.mp3'); });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying('livre-word')).toBe(true);
    expect(result.current.isPlaying('other')).toBe(false);
  });

  it('pauses previous clip when a new one is played', async () => {
    const { result } = renderHook(() => useAudio());
    await act(async () => { await result.current.play('a', '/a.mp3'); });
    await act(async () => { await result.current.play('b', '/b.mp3'); });
    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.isPlaying('a')).toBe(false);
    expect(result.current.isPlaying('b')).toBe(true);
  });
});
