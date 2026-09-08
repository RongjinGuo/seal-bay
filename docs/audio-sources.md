# Seal Bay audio source

Updated on 2026-09-08 following the user's selection of the exact **15.0-17.0
second** passage in the Yantai reference video.

## Selected recording

The game plays one two-second excerpt from the selected video, preserving its
original timing and pitch. It contains no synthesized replacement voice,
repeated or rearranged syllables, or fictional age-based pitch changes.

| Field | Source information |
| --- | --- |
| Video | https://www.bilibili.com/video/BV1cV411X7GW/ |
| Video title | 好喜欢歌唱家，太有毅力了，天天叫唤-海豹大叔山东烟台东炮台海豹湾1月26日直播录屏 |
| Bilibili uploader | 白糖蘸年糕, account 34345851 |
| Original livestream credited in the video description | 海豹大叔, Douyin account `fengchuidaha` |
| Original source link provided by the uploader | https://v.douyin.com/iLgk4Qcx/ |
| Location named in the title | Dongpaotai Seal Bay, Yantai, Shandong |
| Species tags supplied by Bilibili | 海豹 / 斑海豹 (seal / spotted seal) |
| User-selected interval | 15.000-17.000 seconds |
| Source audio encoding | AAC, 48 kHz, mono; starts at 0.000 seconds |
| Reuse license | No Creative Commons or public-domain license is stated in the retrieved metadata; source rights remain with their respective owners. |

The excerpt is included at the user's explicit selection of this source and
interval. The source is credited in the game's sound panel. Only the selected
two seconds are distributed with the game; the full source video/audio and
rejected candidates are not in the public audio directory. All characters
share this selected game sound; it is not a species/age reference library.

## Asset and processing

Runtime file: `public/audio/seal-wawa.mp3`.

| Verification | Result |
| --- | --- |
| Duration | 2.000000 seconds |
| Encoding | Mono MP3, 44.1 kHz, 128 kb/s |
| File size | 33,062 bytes |
| SHA-256 | `68a48bffd0d8c0fe0f71ad06ba8775500a82f7976c19e437340ab85dd8d2863a` |
| Decode / level check | Decodes without errors; mean -22.7 dBFS, peak -3.4 dBFS |

Processing is limited to extracting the selected interval, gentle loudness
normalization, 8 ms fades at both edges, and MP3 encoding. No pitch shifting,
time stretching, syllable duplication, synthesis, noise synthesis, or
background substitution is applied.

```text
ffmpeg -ss 15 -t 2 -i SOURCE_AUDIO
  -af loudnorm=I=-20:TP=-3:LRA=8,afade=t=in:st=0:d=0.008,afade=t=out:st=1.992:d=0.008
  -map_metadata -1 -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k
  public/audio/seal-wawa.mp3
```

The source audio starts at zero, so the interval uses the same timestamps as the
video. The player always sets the recording playback rate to `1`, including for
young and elderly characters. The complete call stays at steady playback gain
until a 25 ms ending fade, preserving its final syllable.

## Other game sounds

Water splashes, a fish-throw swish, eating feedback, and a three-note reward
sound are generated locally with Web Audio oscillators and filtered noise.
They are interaction effects, not animal recordings. There is no music or
continuous ambient playback.

## Playback integration

`src/audio.js` exports `GameAudio` with the existing API:

```js
const audio = new GameAudio();
await audio.unlock(); // In a user click/tap/key gesture.
audio.call({ age: 'adult', x: 0.4, species: 'spotted' });
audio.splash(1);
audio.throwFish();
audio.eat();
audio.celebrate();
audio.setMuted(true);
audio.setPaused(true);
audio.dispose();
```

`unlock()` creates/resumes Web Audio before awaiting the local MP3 download;
there is no autoplay or third-party request during play. The one call file is
fetched through the configured application base URL. `call()` keeps the `age`
and `species` arguments for API compatibility, but they do not alter playback.
Horizontal position `x` ranges from -1 to +1 and controls stereo placement.
Calls have a 420 ms minimum start gap and at most two concurrent voices.

Mute and pause stop active/scheduled sounds. Pause suspends the audio context,
unpause resumes it, and `dispose()` aborts loading and closes it. Missing audio
never falls back to a synthesized animal voice. Procedural interaction effects
may still play if the recording fails to load.

Read-only `status` reports `locked`, `loading`, `ready`, `unavailable`, `paused`,
`muted`, or `disposed`. The internal `partial` state remains for API compatibility
but cannot occur with a single call file. Pause/mute take precedence over loading
state when reporting status.
