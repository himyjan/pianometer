import p5 from 'p5';
import 'p5/global';
import * as Tonal from 'tonal';
import { Input, WebMidi } from 'webmidi';

let midiSelectSlider: p5.Element;
let midiIn: Input[];

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
    midiSelectSlider = p.select("#slider") as p5.Element;
    midiSelectSlider.attributes("max", WebMidi.inputs.length - 1);
    midiSelectSlider.input(inputChanged);
    midiIn = WebMidi.inputs[midiSelectSlider.value()]

    inputChanged();
  }).catch(function (err) {
    console.log("WebMidi could not be enabled.", err);
  });

  function inputChanged() {
    isKeyOn.fill(0);
    controllerChange(64, 0);
    controllerChange(67, 0);

    midiIn.removeListener();
    midiIn = WebMidi.inputs[midiSelectSlider.value()];
    midiIn.addListener('noteon', "all", function (e) {
      console.log("Received 'noteon' message (" + e.note.number + ", " + e.velocity + ").");
      noteOn(e.note.number, e.velocity);
    });
    midiIn.addListener('noteoff', "all", function (e) {
      console.log("Received 'noteoff' message (" + e.note.number + ", " + e.velocity + ").");
      noteOff(e.note.number, e.velocity);
    })
    midiIn.addListener('controlchange', 'all', function (e) {
      console.log("Received control change message:", e.controller.number, e.value);
      controllerChange(e.controller.number, e.value)
    });
    console.log(midiIn.name);
    document.querySelector("#device").html(midiIn.name);
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

  function toggleRainbowMode(cb: HTMLInputElement) {
    rainbowMode = cb.checked;
    if (rainbowMode)
      p.select('#colorpicker')?.attribute('disabled', 'true');
    else
      p.select('#colorpicker')?.removeAttribute('disabled')
  }

  function toggleDisplayNoteNames(cb: HTMLInputElement) {
    displayNoteNames = cb.checked;
  }

  function changeColor() {
    keyOnColor = pedaledColor = color(p.select('#colorpicker').value());
    darkenedColor = keyOnColor.levels.map(x => floor(x * .7));
    pedaledColor = color(`rgb(${darkenedColor[0]}, ${darkenedColor[1]}, ${darkenedColor[2]})`)
    console.log(pedaledColor.levels);
  }

  function setup() {
    createCanvas(1098, 118).parent('piano-visualizer');
    colorMode(HSB, 360, 100, 100, 100);
    keyOnColor = color(326, 100, 100, 100); // <---- 編輯這裡換「按下時」的顏色！[HSB Color Mode] 
    pedaledColor = color(326, 100, 70, 100); // <---- 編輯這裡換「踏板踩住」的顏色！[HSB Color Mode]
    smooth();
    frameRate(60);
    initKeys();

  }

  function draw() {
    background(0, 0, 20, 100);
    pushHistories();
    drawWhiteKeys();
    drawBlackKeys();
    if (displayNoteNames) { drawNoteNames(); };
    drawTexts();
  }

  function calculateSessionTime() {
    let currentTime = new Date();
    let timeElapsed = currentTime - sessionStartTime;
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
    stroke(0, 0, 0);
    strokeWeight(1);
    for (let i = 21; i < 109; i++) {
      if (isBlack[i % 12] == 0) {
        // it's a white key
        if (isKeyOn[i] == 1 && !rainbowMode) {
          fill(keyOnColor); // keypressed
        } else if (isKeyOn[i] == 1 && rainbowMode) {
          fill(map(i, 21, 108, 0, 1080) % 360, 100, 100, 100); // rainbowMode
        } else if (isPedaled[i] == 1 && !rainbowMode) {
          fill(pedaledColor); // pedaled
        } else if (isPedaled[i] == 1 && rainbowMode) {
          fill(map(i, 21, 108, 0, 1080) % 360, 100, 70, 100); // pedaled rainbowMode
        } else {
          fill(0, 0, 100); // white key
        }
        let thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
        rect(thisX, keyAreaY, whiteKeyWidth, keyAreaHeight, radius);
        // println(wIndex);
        wIndex++;
      }
    }
  }

  function drawBlackKeys() {
    let wIndex = 0; // white key index
    stroke(0, 0, 0);
    strokeWeight(1.5);
    for (let i = 21; i < 109; i++) {
      if (isBlack[i % 12] == 0) {
        // it's a white key
        wIndex++;
      }

      if (isBlack[i % 12] > 0) {
        // it's a black key
        if (isKeyOn[i] == 1 && !rainbowMode) {
          fill(keyOnColor); // keypressed
        } else if (isKeyOn[i] == 1 && rainbowMode) {
          fill(map(i, 21, 108, 0, 1080) % 360, 100, 100, 100); // rainbowMode
        } else if (isPedaled[i] == 1 && !rainbowMode) {
          fill(pedaledColor); // pedaled
        } else if (isPedaled[i] == 1 && rainbowMode) {
          fill(map(i, 21, 108, 0, 1080) % 360, 100, 70, 100); // pedaled rainbowMode
        } else {
          fill(0, 0, 0); // white key
        }

        let thisX = border + (wIndex - 1) * (whiteKeyWidth + whiteKeySpace) + isBlack[i % 12];
        rect(thisX, keyAreaY - 1, blackKeyWidth, blackKeyHeight, bRadius);
      }
    }
  }

  function drawNoteNames() {
    let noteNames = ["A", "B", "C", "D", "E", "F", "G"]; // 音名數組

    textSize(12); // 設置文字大小
    noStroke();
    fill(0, 0, 0, 75); // 設置文字顏色為黑色
    textAlign(CENTER, CENTER); // 設置文字對齊方式為居中
    textStyle(NORMAL);

    let wIndex = 0; // 白鍵索引
    for (let i = 0; i < 52; i++) { // 遍歷所有白鍵
      let thisX = border + wIndex * (whiteKeyWidth + whiteKeySpace);
      let thisY = keyAreaY + keyAreaHeight - 11; // 調整文字的垂直位置
      let noteName = noteNames[i % 7]; // 獲取對應的音名
      text(noteName, thisX + whiteKeyWidth / 2, thisY); // 繪製音名文字
      wIndex++;
    }
  }

  function drawTexts() {
    stroke(0, 0, 10, 100);
    fill(0, 0, 100, 90)
    textFont('Monospace');
    textStyle(BOLD);
    textSize(14);
    textAlign(LEFT, TOP);

    // TIME
    let timeText = "TIME" + "\n" + calculateSessionTime();
    text(timeText, 5, 79);

    // PEDAL
    let pedalText = "PEDALS" + "\nL " + convertNumberToBars(cc67now) + "  R " + convertNumberToBars(cc64now)
    text(pedalText, 860, 79);

    // NOTES
    let notesText = "NOTE COUNT" + "\n" + totalNotesPlayed;
    text(notesText, 85, 79);

    // CALORIES
    let caloriesText = "CALORIES" + "\n" + (totalIntensityScore / 250).toFixed(3); // 250 Intensity = 1 kcal.
    text(caloriesText, 350, 79);

    // SHORT-TERM DENSITY
    let shortTermDensity = shortTermTotal.reduce((accumulator, currentValue) => accumulator + currentValue, 0); // Sum the array.
    if (shortTermDensity > notesSMax) {
      notesSMax = shortTermDensity
    };
    let shortTermDensityText = "NPS(MAX)" + "\n" + shortTermDensity + " (" + notesSMax + ")";
    text(shortTermDensityText, 190, 79);

    // LEGATO SCORE
    let legatoScore = legatoHistory.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
    legatoScore /= 60;
    let legatoText = "LEGATO" + "\n" + legatoScore.toFixed(2);
    text(legatoText, 276, 79);

    // NOW PLAYING
    let chordSymbol = Tonal.Chord.detect(getPressedKeys(false), { assumePerfectFifth: true })
    let chordSymbolWithoutM = chordSymbol.map((str) => str.replace(/M($|(?=\/))/g, "")); // get rid of the M's
    let nowPlayingText = truncateString(getPressedKeys(true), 47) + "\n" + truncateString(chordSymbolWithoutM.join(' '), 47);
    text(nowPlayingText, 440, 79);
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

  function truncateString(str, maxLength = 40) {
    if (str.length <= maxLength) {
      return str;
    }

    return str.slice(0, maxLength - 3) + '...';
  }

  function mouseClicked() {
    // Save the canvas content as an image file
    if (mouseX < 50 && mouseY < 50) {
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
      saveCanvas(fileName, 'png');
    }
    if (mouseY > 76) {
      if (mouseX <= 84) {
        sessionStartTime = new Date();
      }

      if (mouseX > 84 && mouseX < 170) {
        totalNotesPlayed = 0;
      }

      if (mouseX > 187 && mouseX < 257) {
        notesSMax = 0;
      }

      if (mouseX > 347 && mouseX < 420) {
        totalIntensityScore = 0; // RESET CALORIES
      }

      if (mouseX > 441 && mouseX < 841) {
        flatNames = !flatNames; // toggle flat  
      }
    }
    console.log(mouseX, mouseY);
  }
};

new p5(sketch);