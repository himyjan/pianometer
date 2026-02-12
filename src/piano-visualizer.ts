import p5 from 'p5';
import * as Tonal from 'tonal';
import { Input, WebMidi } from 'webmidi';

let midiSelectSlider: p5.Element | null = null;
let midiIn: Input | null = null;
const inputsWithListeners = new Set<string>();
// audio cache for key samples
const audioCache: Record<string, HTMLAudioElement> = {};
const soundFontBase = '/src/soundfont/acoustic_grand_piano-mp3/';
// VFX tiles
let tiles: any[] = [];
let tileAreaTop = 10; // top Y of tile area (will be set in setup)
let tileAreaBottom = 0; // bottom Y of tile area (computed from key area)

// for piano visualizer
let nowPedaling: boolean = false; // is it pedaling?（不要動）
let isKeyOn: number[] = []; // what notes are being pressed (1 or 0)（不要動）
let isPedaled: number[] = []; // what notes are pedaled (1 or 0)（不要動）
let keyOnColor: p5.Color // set it in setup()
let pedaledColor: p5.Color // set it in setup()
let isBlack: number[] = [0, 11, 0, 13, 0, 0, 11, 0, 12, 0, 13, 0]; // 是黑鍵嗎？是的話，相對左方的白鍵位移多少？(default: {0, 11, 0, 13, 0, 0, 11, 0, 12, 0, 13, 0}）
let border: number = 3; // 左方留空幾個畫素？(default: 3)
let whiteKeyWidth: number = 20; // 白鍵多寬？(default: 20)
let whiteKeySpace: number = 1; // 白鍵間的縫隙多寬？(default: 1)
let blackKeyWidth: number = 17; // 黑鍵多寬？(default: 17)
let blackKeyHeight: number = 45; // 黑鍵多高？(default: 45)
let radius: number = 5; // 白鍵圓角(default: 5)
let bRadius: number = 4; // 黑鍵圓角(default: 4)
let keyAreaY: number = 3; // 白鍵從 Y 軸座標多少開始？(default: 3)
let keyAreaHeight: number = 70; // 白鍵多高？(default: 70)
let rainbowMode: boolean = false; // 彩虹模式 (default: false)
let displayNoteNames: boolean = false; // 白鍵要不要顯示音名 (default: false)
let cc64now: number = 0; // 現在的踏板狀態
let cc67now: number = 0;

let sessionStartTime: Date = new Date();
let sessionTotalSeconds: number = 0;

let flatNames: boolean = false;

// note counter
let notesThisFrame: number = 0;
let totalNotesPlayed: number = 0;
let shortTermTotal: number[] = new Array(60).fill(0);
let legatoHistory: number[] = new Array(60).fill(0);
let notesSMax: number = 0;
let totalIntensityScore: number = 0;

// for key pressed counter
let notePressedCount: number = 0;
let notePressedCountHistory: number[] = [];


const sketch = function (p: p5) {
  WebMidi.enable().then(() => { // enable WebMidi (promise-based)
    console.log("WebMidi enabled!");

    //name our visible MIDI input and output ports
    console.log("---");
    console.log("Inputs Ports: ");
    for (let i = 0; i < WebMidi.inputs.length; i++) {
      console.log(i + ": " + WebMidi.inputs[i].name);
    }

    console.log("---");
    console.log("Output Ports: ");
    for (let i = 0; i < WebMidi.outputs.length; i++) {
      console.log(i + ": " + WebMidi.outputs[i].name);
    }
    // attach listeners to all inputs to ensure we catch every keypress
    WebMidi.inputs.forEach((input) => {
      try {
        // avoid double-registering listeners for the same input
        if (inputsWithListeners.has(input.name)) return;
        input.addListener('noteon', 'all', function (e) {
          // treat Note On with velocity 0 as Note Off (some devices use this)
          const num = e.note && typeof e.note.number === 'number' ? e.note.number : (e.noteNumber ?? null);
          if (num === null) return;
          if (e.velocity === 0) {
            noteOff(num, e.velocity);
          } else {
            noteOn(num, e.velocity);
            try { spawnTile(num); } catch (err) { console.warn('spawnTile error', err); }
          }
        });
        input.addListener('noteoff', 'all', function (e) {
          const num = e.note && typeof e.note.number === 'number' ? e.note.number : (e.noteNumber ?? null);
          if (num === null) return;
          noteOff(num, e.velocity);
        });
        input.addListener('controlchange', 'all', function (e) {
          controllerChange(e.controller.number, e.value);
        });
        inputsWithListeners.add(input.name);
      } catch (err) {
        console.warn('Could not attach global listeners to input', input.name, err);
      }
    });
    // update UI controls depending on available inputs
    midiSelectSlider = p.select("#slider");
    if (midiSelectSlider) {
      midiSelectSlider.attribute("max", String(Math.max(WebMidi.inputs.length - 1, 0)));
      midiSelectSlider.input(inputChanged as any);
      // disable slider when no inputs
      if (WebMidi.inputs.length === 0) {
        midiSelectSlider.attribute('disabled', 'true');
      } else {
        midiSelectSlider.removeAttribute('disabled');
        midiIn = WebMidi.inputs[Number(midiSelectSlider.value())];
      }
    }

    if (WebMidi.inputs.length === 0) {
      p.select('#device')?.html('No MIDI input found. Connect a device and reload, or grant permission.');
    }

    inputChanged();
  }).catch(function (err) {
    console.log("WebMidi could not be enabled.", err);
    // show helpful message in UI so user isn't left wondering
    const msg = 'WebMIDI could not be enabled. Use Chrome/Edge and open the app over https or localhost. ' + (err && err.message ? err.message : String(err));
    try { p.select('#device')?.html(msg); } catch (e) { }
  });

  function inputChanged() {
    // only update selected input reference and UI; listeners are attached globally
    // do NOT clear isKeyOn here (clearing caused missed release events when switching)
    if (midiSelectSlider) {
      const idx = Number(midiSelectSlider.value());
      midiIn = WebMidi.inputs[idx] ?? null;
    }
    if (midiIn) {
      p.select('#device')?.html(String(midiIn.name));
    } else {
      p.select('#device')?.html('No MIDI input selected');
    }
  };

  function noteOn(pitch: number, velocity: number) {
    totalNotesPlayed++;
    notesThisFrame++;
    totalIntensityScore += velocity;

    // piano visualizer
    isKeyOn[pitch] = 1;
    if (nowPedaling) {
      isPedaled[pitch] = 1;
    }
    // spawn VFX tile for this note
    spawnTile(pitch);
  }

  function noteOff(pitch: number, velocity: number) {
    isKeyOn[pitch] = 0;
  }

  function controllerChange(number: number, value: number) {
    // Receive a controllerChange
    if (number == 64) {
      cc64now = value;

      if (value >= 64) {
        nowPedaling = true;
        for (let i = 0; i < 128; i++) {
          // copy key on to pedal
          isPedaled[i] = isKeyOn[i];
        }
      } else if (value < 64) {
        nowPedaling = false;
        for (let i = 0; i < 128; i++) {
          // reset isPedaled
          isPedaled[i] = 0;
        }
      }
    }

    if (number == 67) {
      cc67now = value;

    }
  }

  p.toggleRainbowMode = function (cb: HTMLInputElement) {
    rainbowMode = cb.checked;
    if (rainbowMode)
      p.select('#colorpicker')?.attribute('disabled', 'true');
    else
      p.select('#colorpicker')?.removeAttribute('disabled');
  }

  p.toggleDisplayNoteNames = function (cb: HTMLInputElement) {
    displayNoteNames = cb.checked;
  }

  p.changeColor = function () {
    const picker = p.select('#colorpicker');
    const val = picker ? picker.value() : '#ff00ff';
    // @ts-ignore
    keyOnColor = pedaledColor = p.color(val);
    // @ts-ignore
    const darkenedColor = keyOnColor.levels.map((x: number) => p.floor(x * .7));
    // @ts-ignore
    pedaledColor = p.color(`rgb(${darkenedColor[0]}, ${darkenedColor[1]}, ${darkenedColor[2]})`)
    // @ts-ignore
    console.log(pedaledColor.levels);
  }

  p.setup = function () {
    // increase canvas height and reserve space above keys for VFX
    p.createCanvas(1098, 240).parent('piano-visualizer');
    p.colorMode(p.HSB, 360, 100, 100, 100);
    keyOnColor = p.color(326, 100, 100, 100); // <---- 編輯這裡換「按下時」的顏色！[HSB Color Mode] 
    pedaledColor = p.color(326, 100, 70, 100); // <---- 編輯這裡換「踏板踩住」的顏色！[HSB Color Mode]
    p.smooth();
    p.frameRate(60);
    // set key area lower so tiles have room above
    tileAreaTop = 20;
    keyAreaY = 120;
    keyAreaHeight = 70;
    initKeys();

  }

  p.draw = function () {
    p.background(0, 0, 20, 100);
    pushHistories();
    drawWhiteKeys();
    drawBlackKeys();
    // VFX tiles draw on top of keys
    drawTiles();
    if (displayNoteNames) { drawNoteNames(); };
    drawTexts();
  }

  function calculateSessionTime() {
    let currentTime = new Date();
    let timeElapsed = currentTime.getTime() - sessionStartTime.getTime();
    // Convert time elapsed to hours, minutes, and seconds
    let seconds = Math.floor((timeElapsed / 1000) % 60);
    let minutes = Math.floor((timeElapsed / (1000 * 60)) % 60);
    let hours = Math.floor((timeElapsed / (1000 * 60 * 60)) % 24);
    sessionTotalSeconds = Math.floor(timeElapsed / 1000);
    // Pad minutes and seconds with leading zeros
    let paddedMinutes = String(minutes).padStart(2, '0');
    let paddedSeconds = String(seconds).padStart(2, '0');
    let timeText = `${hours}:${paddedMinutes}:${paddedSeconds}`;
    return timeText;
  }

  function initKeys() {
    for (let i = 0; i < 128; i++) {
      isKeyOn[i] = 0;
      isPedaled[i] = 0;
    }
  }

  function drawWhiteKeys() {
    let wIndex = 0; // white key index
    p.stroke(0, 0, 0);
    p.strokeWeight(1);
    for (let i = 21; i < 109; i++) {
      if (isBlack[i % 12] == 0) {
        // it's a white key
        if (isKeyOn[i] == 1 && !rainbowMode) {
          p.fill(keyOnColor); // keypressed
        } else if (isKeyOn[i] == 1 && rainbowMode) {
          p.fill(p.map(i, 21, 108, 0, 1080) % 360, 100, 100, 100); // rainbowMode
        } else if (isPedaled[i] == 1 && !rainbowMode) {
          p.fill(pedaledColor); // pedaled
        } else if (isPedaled[i] == 1 && rainbowMode) {
          p.fill(p.map(i, 21, 108, 0, 1080) % 360, 100, 70, 100); // pedaled rainbowMode
        } else {
          p.fill(0, 0, 100); // white key
        }
        let thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
        p.rect(thisX, keyAreaY, whiteKeyWidth, keyAreaHeight, radius);
        // println(wIndex);
        wIndex++;
      }
    }
  }

  function drawBlackKeys() {
    let wIndex = 0; // white key index
    p.stroke(0, 0, 0);
    p.strokeWeight(1.5);
    for (let i = 21; i < 109; i++) {
      if (isBlack[i % 12] == 0) {
        // it's a white key
        wIndex++;
      }

      if (isBlack[i % 12] > 0) {
        // it's a black key
        if (isKeyOn[i] == 1 && !rainbowMode) {
          p.fill(keyOnColor); // keypressed
        } else if (isKeyOn[i] == 1 && rainbowMode) {
          p.fill(p.map(i, 21, 108, 0, 1080) % 360, 100, 100, 100); // rainbowMode
        } else if (isPedaled[i] == 1 && !rainbowMode) {
          p.fill(pedaledColor); // pedaled
        } else if (isPedaled[i] == 1 && rainbowMode) {
          p.fill(p.map(i, 21, 108, 0, 1080) % 360, 100, 70, 100); // pedaled rainbowMode
        } else {
          p.fill(0, 0, 0); // white key
        }

        let thisX = border + (wIndex - 1) * (whiteKeyWidth + whiteKeySpace) + isBlack[i % 12];
        p.rect(thisX, keyAreaY - 1, blackKeyWidth, blackKeyHeight, bRadius);
      }
    }
  }

  function drawNoteNames() {
    let noteNames = ["A", "B", "C", "D", "E", "F", "G"]; // 音名數組
    p.textSize(12); // 設置文字大小
    p.noStroke();
    p.fill(0, 0, 0, 75); // 設置文字顏色為黑色
    p.textAlign(p.CENTER, p.CENTER); // 設置文字對齊方式為居中
    p.textStyle(p.NORMAL);

    let wIndex = 0; // 白鍵索引
    for (let i = 0; i < 52; i++) { // 遍歷所有白鍵
      let thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
      let thisY = keyAreaY + keyAreaHeight - 11; // 調整文字的垂直位置
      let noteName = noteNames[i % 7]; // 獲取對應的音名
      p.text(noteName, thisX + whiteKeyWidth / 2, thisY); // 繪製音名文字
      wIndex++;
    }
  }

  function drawTexts() {
    p.stroke(0, 0, 10, 100);
    p.fill(0, 0, 100, 90)
    p.textFont('Monospace');
    p.textStyle(p.BOLD);
    p.textSize(14);
    p.textAlign(p.LEFT, p.TOP);
    // TIME and stats: place below keyboard area
    const statsY = keyAreaY + keyAreaHeight + 8;

    // TIME
    let timeText = "TIME" + "\n" + calculateSessionTime();
    p.text(timeText, 5, statsY);

    // PEDAL
    let pedalText = "PEDALS" + "\nL " + convertNumberToBars(cc67now) + "  R " + convertNumberToBars(cc64now)
    p.text(pedalText, 860, statsY);

    // NOTES
    let notesText = "NOTE COUNT" + "\n" + totalNotesPlayed;
    p.text(notesText, 85, statsY);

    // CALORIES
    let caloriesText = "CALORIES" + "\n" + (totalIntensityScore / 250).toFixed(3); // 250 Intensity = 1 kcal.
    p.text(caloriesText, 350, statsY);

    // SHORT-TERM DENSITY
    let shortTermDensity = shortTermTotal.reduce((accumulator, currentValue) => accumulator + currentValue, 0); // Sum the array.
    if (shortTermDensity > notesSMax) {
      notesSMax = shortTermDensity
    };
    let shortTermDensityText = "NPS(MAX)" + "\n" + shortTermDensity + " (" + notesSMax + ")";
    p.text(shortTermDensityText, 190, statsY);

    // LEGATO SCORE
    let legatoScore = legatoHistory.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
    legatoScore /= 60;
    let legatoText = "LEGATO" + "\n" + legatoScore.toFixed(2);
    p.text(legatoText, 276, statsY);

    // NOW PLAYING
    let chordSymbol = Tonal.Chord.detect(getPressedKeys(false), { assumePerfectFifth: true })
    let chordSymbolWithoutM = chordSymbol.map((str) => str.replace(/M($|(?=\/))/g, "")); // get rid of the M's
    let nowPlayingText = truncateString(getPressedKeys(true), 47) + "\n" + truncateString(chordSymbolWithoutM.join(' '), 47);
    p.text(nowPlayingText, 440, statsY);
  }

  function pushHistories() {
    shortTermTotal.push(notesThisFrame);
    shortTermTotal.shift();
    notesThisFrame = 0;
    legatoHistory.push(isKeyOn.reduce((accumulator, currentValue) => accumulator + currentValue, 0));
    legatoHistory.shift();


  }

  function convertNumberToBars(number) {
    if (number < 0 || number > 127) {
      throw new Error('Number must be between 0 and 127');
    }

    const maxBars = 10;
    const scaleFactor = 128 / maxBars;

    // Calculate the number of bars
    const numberOfBars = Math.ceil(number / scaleFactor);

    // Create a string with the calculated number of "|" characters
    const barString = '|'.repeat(numberOfBars);

    // Calculate the number of "." characters required to fill the remaining space
    const numberOfDots = maxBars - numberOfBars;

    // Create a string with the calculated number of "." characters
    const dotString = '.'.repeat(numberOfDots);

    // Combine the "|" and "." strings
    const combinedString = barString + dotString;

    return combinedString;
  }

  function getPressedKeys(returnString = true) {
    let pressedOrPedaled = [];

    for (let i = 0; i < isKeyOn.length; i++) {
      pressedOrPedaled[i] = isKeyOn[i] === 1 || isPedaled[i] === 1 ? 1 : 0;

    }

    let noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; // default if sharp
    if (flatNames) {
      // flat
      noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    }

    const pressedKeys = [];

    for (let i = 0; i < pressedOrPedaled.length; i++) {
      if (pressedOrPedaled[i] === 1) {
        const noteName = noteNames[i % 12];
        const octave = Math.floor(i / 12) - 1;
        pressedKeys.push(`${noteName}${octave}`);
      }
    }
    if (returnString == true) {
      return pressedKeys.join(' ');
    } else {
      return pressedKeys;
    }

  }

  function midiToNoteName(n: number) {
    // use flat names for black keys to match provided mp3 filenames (Db, Eb, Gb, Ab, Bb)
    const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const name = noteNames[n % 12];
    const octave = Math.floor(n / 12) - 1;
    return `${name}${octave}`;
  }

  function playNoteSample(n: number) {
    const noteName = midiToNoteName(n);
    const path = `${soundFontBase}${noteName}.mp3`;
    let a = audioCache[noteName];
    if (!a) {
      a = new Audio(path);
      audioCache[noteName] = a;
    }
    try {
      a.currentTime = 0;
      void a.play();
    } catch (e) {
      console.warn('play error', e);
    }
    // also spawn VFX tile when sample is played (covers mouse clicks)
    spawnTile(n);
  }

  function spawnTile(midiNumber: number) {
    const cx = getKeyCenterX(midiNumber);
    if (cx == null) return;
    // compute bottom of tile area (just above keys)
    tileAreaBottom = keyAreaY - 2;
    const hue = (midiNumber - 21) * 3 % 360;
    // spawn at bottom of tile area
    tiles.push({ x: cx, y: tileAreaBottom, w: 28, h: 16, vy: 1 + Math.random() * 2, life: 80, hue, alpha: 100 });
  }

  function getKeyCenterX(n: number) {
    // compute key center x by iterating keys same as draw functions
    let wIndex = 0;
    for (let i = 21; i < 109; i++) {
      if (isBlack[i % 12] == 0) {
        const thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
        const center = thisX + whiteKeyWidth / 2;
        if (i === n) return center;
        wIndex++;
      } else {
        const center = border + (wIndex - 1) * (whiteKeyWidth + whiteKeySpace) + isBlack[i % 12] + blackKeyWidth / 2;
        if (i === n) return center;
      }
    }
    return null;
  }

  function drawTiles() {
    // compute tile area bottom in case key area changed
    tileAreaBottom = keyAreaY - 2;

    // draw tile area background (subtle)
    p.push();
    p.noStroke();
    p.fill(0, 0, 0, 30);
    p.rect(0, tileAreaTop, p.width, tileAreaBottom - tileAreaTop);
    p.pop();

    // update and draw tiles (from bottom to top)
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      // update: move upward
      t.y -= t.vy;
      // horizontal jitter
      t.x += Math.sin((t.y + i) / 12) * 0.8;
      // fade
      t.life -= 1;
      t.alpha = p.map(t.life, 0, 80, 0, 100);

      // draw glow tile
      p.push();
      p.noStroke();
      p.fill(t.hue, 90, 90, t.alpha);
      // slight blur effect by drawing multiple rects with increasing size and lower alpha
      p.rect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 4);
      p.fill(t.hue, 90, 90, t.alpha * 0.4);
      p.rect(t.x - (t.w * 0.7) / 2, t.y - (t.h * 0.7) / 2, t.w * 0.7, t.h * 0.7, 3);
      p.pop();

      // remove when past top of tile area or life ended
      if (t.life <= 0 || t.y + t.h < tileAreaTop) tiles.splice(i, 1);
    }
  }

  function truncateString(str, maxLength = 40) {
    if (str.length <= maxLength) {
      return str;
    }

    return str.slice(0, maxLength - 3) + '...';
  }

  p.mouseClicked = function () {
    // Save the canvas content as an image file
    if (p.mouseX < 50 && p.mouseY < 50) {
      const now = new Date();
      const strDate =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const strTime =
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      const fileName = `nicechord-pianometer-${strDate}_${strTime}`;
      p.saveCanvas(fileName, 'png');
    }
    // If click is inside keyboard area, detect which key (black keys first)
    // Black keys area (drawn slightly higher)
    const mx = p.mouseX;
    const my = p.mouseY;
    const keyTop = keyAreaY - 1;
    const keyBottom = keyAreaY + keyAreaHeight;

    if (my >= keyTop && my <= keyBottom) {
      // check black keys first
      let wIndex = 0;
      for (let i = 21; i < 109; i++) {
        if (isBlack[i % 12] == 0) {
          wIndex++;
          continue;
        }
        const thisX = border + (wIndex - 1) * (whiteKeyWidth + whiteKeySpace) + isBlack[i % 12];
        const thisY = keyTop;
        if (mx >= thisX && mx <= thisX + blackKeyWidth && my >= thisY && my <= thisY + blackKeyHeight) {
          // black key clicked
          playNoteSample(i);
          return;
        }
      }

      // check white keys
      wIndex = 0;
      for (let i = 21; i < 109; i++) {
        if (isBlack[i % 12] == 0) {
          const thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
          const thisY = keyAreaY;
          if (mx >= thisX && mx <= thisX + whiteKeyWidth && my >= thisY && my <= thisY + keyAreaHeight) {
            playNoteSample(i);
            return;
          }
          wIndex++;
        }
      }
    }

    // other UI interactions below the keys
    if (my > keyAreaY + keyAreaHeight) {
      if (mx <= 84) {
        sessionStartTime = new Date();
      }

      if (mx > 84 && mx < 170) {
        totalNotesPlayed = 0;
      }

      if (mx > 187 && mx < 257) {
        notesSMax = 0;
      }

      if (mx > 347 && mx < 420) {
        totalIntensityScore = 0; // RESET CALORIES
      }

      if (mx > 441 && mx < 841) {
        flatNames = !flatNames; // toggle flat  
      }
    }
    console.log(mx, my);
  }
};

const p5Instance = new p5(sketch);

// expose functions for HTML inline handlers
(window as any).toggleRainbowMode = function (cb: HTMLInputElement) { return (p5Instance as any).toggleRainbowMode(cb); };
(window as any).toggleDisplayNoteNames = function (cb: HTMLInputElement) { return (p5Instance as any).toggleDisplayNoteNames(cb); };
(window as any).changeColor = function () { return (p5Instance as any).changeColor(); };