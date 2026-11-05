# Cartoon Studio

A small cartoon movie editor that runs in your web browser. Animate characters with keyframes, add music, voices and sound effects, lip-sync with Rhubarb, and export videos for TikTok, Instagram and Facebook.

## Starting it

- **Best:** double-click `start.bat`. It opens the editor at http://localhost:5173 and turns on automatic lip sync. It needs [Node.js](https://nodejs.org); nothing else to install.
- **Quick look:** double-click `index.html`. Everything works except the **Auto lip sync** button (you can still import Rhubarb files).

Use **Google Chrome** or **Microsoft Edge**. They can export MP4 directly.

## Making a cartoon

1. Click **New** and pick a format (9:16 for TikTok / Reels).
2. Add a **Smiley character**, your own **image** (PNG with a see-through background works best), or **text**.
3. Click a frame on the timeline, then drag the character on the stage. That frame becomes a keyframe ◆.
4. Click a later frame and move it again. The frames in between are filled in for you.
5. Press **Space** to play. Drag ◆ on the timeline to change the timing.
6. Use **Movement to the next keyframe** to choose smooth, steady, or "jump" motion.

Your work saves itself in the browser. Use **Save** to keep a `.cartoon.json` file (pictures and sounds are inside it), and **Open…** to load it again.

## Music, voices and sound effects

Use **Add audio** on the left. Drag the coloured bars on the timeline to change when they play. Click a bar to set its volume or mute it.

## Lip sync with Rhubarb

1. Download [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync/releases) for Windows.
2. Unzip it into the `rhubarb` folder here.
3. Run `start.bat`. The left panel should say **Rhubarb ready**.
4. Add a **Voice** track, select your character, choose that voice in **Lip sync**, then click **⚡ Auto lip sync**.
   Typing the words into "What's being said" makes it more accurate.

The Smiley character has all nine Rhubarb mouth shapes built in (A–H and X).
For your own character art, upload one mouth picture per shape and set where the mouth sits.

**Command line instead:** `rhubarb -f json -o voice.json voice.wav`, then **Import file** on your character. JSON, TSV and XML all work.

## John Calvin (ready-made character)

Click **🧔 John Calvin** under **Characters**. He comes in with all 9 mouth shapes and 10 eye pictures loaded, and he blinks on his own.

- **Eyes:** select him and use the arrow pad under **👀 Eyes** to choose where he looks. The look you pick is part of the keyframe, so he holds it until the next change. **As drawn** and **●** both look at the viewer; **— Closed** closes his eyes.
- **Talking:** add a voice, then **⚡ Auto lip sync**, the same as the smiley.

His ready-to-use pictures are in `assets/John_Calvin_HD/`. They're built from the hand-made eye pictures in `assets/John_Calvin_eyes/` (named from Calvin's point of view, so `left.png` is his left) and the hand-made mouth pictures in `assets/mouths/` (`A.jpg` … `H.jpg`). After rebuilding, raise `"version"` in `assets/characters.json` so existing projects pick up the new pictures. If you change those, rebuild by opening http://localhost:5173/tools/make-calvin-hd.html#dump and asking Claude to save the result, or ask Claude to rerun it.

To add another ready-made character, list its pictures in `assets/characters.json`.

The Characters button needs the editor opened through `start.bat` or Live Server, not by double-clicking `index.html`.

## Exporting

Click **🎬 Export Video**. The movie plays once in real time while it records, so keep the tab open and in front.

| Platform | Format to pick |
| --- | --- |
| TikTok, Instagram Reels / Stories, Facebook Reels | 9:16 Vertical |
| Instagram / Facebook feed post | 4:5 Portrait or 1:1 Square |
| Facebook / YouTube video | 16:9 Wide |

The **Safe zone** outline shows where phone apps put their buttons and captions. Keep faces and text inside it.

If your browser can only make a `.webm` file, convert it to MP4 with [ffmpeg](https://ffmpeg.org):
`ffmpeg -i movie.webm -c:v libx264 -pix_fmt yuv420p -c:a aac movie.mp4`

## Files

- `index.html`, `css/`, `js/`: the editor
- `assets/smiley.svg`: the smiley face graphic
- `server.js`, `start.bat`: local server that runs Rhubarb
- `rhubarb/`: put Rhubarb here
