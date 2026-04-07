import './style.css'
import './piano-visualizer'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<body>
  <div id="main">
    <div id="controls" class="center">
      <div>
        <h3>鋼琴鍵盤顯示器 by NiceChord</h3>
        <div style="display: flex; justify-content: space-around;">
          <div>
            <h5>選擇 MIDI 裝置</h5>
            <input id="slider" type="range" min="0" max="0" value="0">
            <div id="device">Select Input: </div>
          </div>
          <div style="display: flex; flex-direction: column; justify-content: center; align-items: start;">
            <div>
              <label for="colorpicker">選擇顏色</label>
              <input type="color" id="colorpicker" value="#ff0090" oninput="changeColor()">
            </div>
            <div style="display: flex; align-items: center;">
              <span style="margin-right: 5px;">彩虹模式</span>
              <input type="checkbox" id="rainbow-mode-checkbox" onclick="toggleRainbowMode(this)">
              <label for="rainbow-mode-checkbox">
                <span class="switch-txt" turnOn="On" turnOff="Off"></span>
              </label>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="margin-right: 5px;">顯示音名</span>
              <input type="checkbox" id="display-note-names-checkbox" onclick="toggleDisplayNoteNames(this)">
              <label for="display-note-names-checkbox">
                <span class="switch-txt" turnOn="On" turnOff="Off"></span>
              </label>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="margin-right: 5px;">播放聲音</span>
              <input type="checkbox" id="play-note-sound-checkbox" onclick="togglePlayNoteSound(this)">
              <label for="play-note-sound-checkbox">
                <span class="switch-txt" turnOn="On" turnOff="Off"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <br />

    </div>
  </div>

  <div class="center">

    <div id="piano-visualizer">
      <!-- Our sketch will go here! -->
    </div>
    <span style="font-size: 11px;">
      TIME：使用時間 | NOTE COUNT：總彈奏音符數 | NPS：最近一秒鐘彈奏音符數（括號為歷史最大值） | LEGATO：圓滑指數（最近一秒鐘平均來說有幾個鍵被同時按住） <br />
      CALORIES：消耗熱量（估計值，好玩就好）| PEDALS：左右踏板深度顯示 <br />
      （密技：點鍵盤最左上角的角落，可以儲存截圖） <br /><br />
    </span>


    覺得好用嗎？到 <a href="https://nicechord.com">NiceChord.com</a> 逛逛支持我！原始碼在 <a href="https://github.com/wiwikuan/pianometer">GitHub</a>。
  </div>


  <div style="margin-top: 10px;">
    <h5>MIDI 錄製控制</h5>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <div id="recording-status" style="text-align: center; font-weight: bold; color: red;">未錄製</div>
      <button id="record-btn" onclick="startRecording()">錄製</button>
      <button id="pause-btn" onclick="pauseRecording()">暫停</button>
      <button id="stop-btn" onclick="stopRecording()">停止</button>
      <button id="clear-btn" onclick="clearRecording()">清除</button>
      <button id="export-btn" onclick="exportRecording()">匯出 MIDI</button>
    </div>
  </div>
</body>
`
