/**
 * ReliableLink — Sliding Window Protocol Simulator & Lab
 * Computer Networks Mini-Project
 * 
 * Protocols Implemented:
 *  1. Stop-and-Wait ARQ (Window Size = 1)
 *  2. Go-Back-N ARQ (Window Size = N, Receiver Window = 1, Cumulative ACK)
 *  3. Selective Repeat ARQ (Window Size = N, Receiver Window = N, Individual ACK + Buffering)
 * 
 * Features:
 *  - Native Web Audio API Synthesizer (Offline, zero-asset sound feedback)
 *  - Interactive Scenario Presets (Instant demonstration of key protocol behaviors)
 *  - Dynamic Visual Sliding Window Bracket
 *  - Real-time Log Filtering & Clipboard Export
 *  - Full Keyboard Shortcuts Suite
 *  - Interactive Comparison Matrix & Formula Guide
 */

// ============================================================================
// 1. CONFIGURATION & SIMULATION STATE
// ============================================================================

const CONFIG = {
  DEFAULT_TOTAL_FRAMES: 8,
  DEFAULT_WINDOW_SIZE: 4,
  DEFAULT_SPEED: 1.0,
  BASE_PACKET_TRANSIT_TIME_MS: 2400, // Time for packet to traverse channel at 1.0x
  BASE_TIMEOUT_DURATION_MS: 4800,    // Sender timeout timer duration at 1.0x
};

const SimState = {
  status: 'IDLE', // 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED'
  protocol: 'SAW', // 'SAW' | 'GBN' | 'SR'
  totalFrames: 8,
  windowSize: 1,   // 1 for SAW, configurable for GBN & SR
  speedMultiplier: 1.0,
  soundEnabled: true,
  logFilter: 'ALL',
  theme: (function() {
    try {
      return localStorage.getItem('reliableLink_theme') || 'light';
    } catch (e) {
      return 'light';
    }
  })(),

  // Sender State
  sender: {
    base: 0,          // Oldest unacknowledged frame
    nextSeqNum: 0,    // Next frame sequence number to transmit
    frames: [],       // Array of frame state objects
    timerRemaining: 0,// Remaining time for oldest unacked frame timer (SAW & GBN)
    timerDuration: CONFIG.BASE_TIMEOUT_DURATION_MS,
    timerRunning: false,
    lastSendTime: 0,
  },

  // Receiver State
  receiver: {
    expectedSeqNum: 0, // In-order frame expected next (SAW & GBN)
    rcvBase: 0,        // Receiver window base (SR)
    buffer: {},        // Buffered out-of-order frames { seqNum: frameObj } (SR)
    deliveredCount: 0, // Number of unique frames delivered to application layer
    deliveredSet: new Set(),
  },

  // Channel State
  channel: {
    inFlightFrames: [], // Active data frames traveling Sender -> Receiver
    inFlightAcks: [],   // Active ACKs traveling Receiver -> Sender
  },

  // Fault Injection Flags
  faults: {
    dropNextFrame: false,
    dropNextAck: false,
    autoDropTargetFrame: 'none',
    droppedFramesHistory: new Set(),
  },

  // Live Metrics
  metrics: {
    totalTransmissions: 0,
    retransmissions: 0,
    lostPackets: 0,
  },

  // Engine Time Tracking
  time: {
    lastTimestamp: 0,
    simulatedElapsedMs: 0,
  }
};

// ============================================================================
// 2. WEB AUDIO API SYNTHESIZER (ZERO ASSET, PURE CODE)
// ============================================================================

const AudioSynth = {
  ctx: null,

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playClick() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (_) {}
  },

  playLaunch() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(640, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (_) {}
  },

  playAck() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      // Pleasant double chime
      const now = this.ctx.currentTime;
      [880, 1320].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.12, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.06 + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.14);
      });
    } catch (_) {}
  },

  playLoss() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.16, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch (_) {}
  },

  playTimeout() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      [350, 300].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.12, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.08);
      });
    } catch (_) {}
  },

  playFinished() {
    if (!SimState.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      // Major triad fanfare (C - E - G - C)
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch (_) {}
  }
};

// ============================================================================
// 3. DOM ELEMENT REFERENCES
// ============================================================================

const DOM = {
  // Status & Headers
  simStatusPill: document.getElementById('simStatusPill'),
  simStatusDot: document.getElementById('simStatusDot'),
  simStatusText: document.getElementById('simStatusText'),
  toastBar: document.getElementById('toastBar'),
  toastIcon: document.getElementById('toastIcon'),
  toastMsg: document.getElementById('toastMsg'),
  btnToggleSound: document.getElementById('btnToggleSound'),
  soundIcon: document.getElementById('soundIcon'),
  soundLabel: document.getElementById('soundLabel'),
  btnToggleTheme: document.getElementById('btnToggleTheme'),
  themeIcon: document.getElementById('themeIcon'),
  themeLabel: document.getElementById('themeLabel'),
  selectScenarioPreset: document.getElementById('selectScenarioPreset'),
  btnShortcutsHelp: document.getElementById('btnShortcutsHelp'),

  // Protocol Buttons
  btnProtoSAW: document.getElementById('btnProtoSAW'),
  btnProtoGBN: document.getElementById('btnProtoGBN'),
  btnProtoSR: document.getElementById('btnProtoSR'),

  // Config Inputs & Steppers
  totalFramesInput: document.getElementById('totalFramesInput'),
  btnFramesMinus: document.getElementById('btnFramesMinus'),
  btnFramesPlus: document.getElementById('btnFramesPlus'),
  windowSizeInput: document.getElementById('windowSizeInput'),
  windowSizeHint: document.getElementById('windowSizeHint'),
  btnWinMinus: document.getElementById('btnWinMinus'),
  btnWinPlus: document.getElementById('btnWinPlus'),
  speedSlider: document.getElementById('speedSlider'),
  speedDisplay: document.getElementById('speedDisplay'),
  speedPills: document.querySelectorAll('.speed-pill'),

  // Action Buttons
  btnStart: document.getElementById('btnStart'),
  btnPause: document.getElementById('btnPause'),
  btnStep: document.getElementById('btnStep'),
  btnReset: document.getElementById('btnReset'),

  // Fault Controls
  btnDropNextFrame: document.getElementById('btnDropNextFrame'),
  labelDropNextFrame: document.getElementById('labelDropNextFrame'),
  btnDropNextAck: document.getElementById('btnDropNextAck'),
  labelDropNextAck: document.getElementById('labelDropNextAck'),
  selectDropTarget: document.getElementById('selectDropTarget'),

  // Stages, Tracks & Brackets
  senderFrameTrack: document.getElementById('senderFrameTrack'),
  receiverFrameTrack: document.getElementById('receiverFrameTrack'),
  senderWindowBracket: document.getElementById('senderWindowBracket'),
  senderBracketLabel: document.getElementById('senderBracketLabel'),
  receiverWindowBracket: document.getElementById('receiverWindowBracket'),
  receiverBracketLabel: document.getElementById('receiverBracketLabel'),
  ptrBase: document.getElementById('ptrBase'),
  ptrNext: document.getElementById('ptrNext'),
  ptrExpected: document.getElementById('ptrExpected'),
  senderWindowScope: document.getElementById('senderWindowScope'),
  receiverBufferScope: document.getElementById('receiverBufferScope'),
  senderModeChip: document.getElementById('senderModeChip'),
  receiverModeChip: document.getElementById('receiverModeChip'),
  receiverStatusBox: document.getElementById('receiverStatusBox'),
  receiverStatusText: document.getElementById('receiverStatusText'),

  // Timer
  senderTimerCard: document.getElementById('senderTimerCard'),
  timerDisplay: document.getElementById('timerDisplay'),
  timerProgressFill: document.getElementById('timerProgressFill'),

  // Channel Lanes
  frameLane: document.getElementById('frameLane'),
  ackLane: document.getElementById('ackLane'),

  // Progress & Metrics
  deliveryProgressBar: document.getElementById('deliveryProgressBar'),
  deliveryProgressText: document.getElementById('deliveryProgressText'),
  metricDelivered: document.getElementById('metricDelivered'),
  metricDeliveredSub: document.getElementById('metricDeliveredSub'),
  metricTransmissions: document.getElementById('metricTransmissions'),
  metricRetransmissions: document.getElementById('metricRetransmissions'),
  metricLostPackets: document.getElementById('metricLostPackets'),
  metricEfficiency: document.getElementById('metricEfficiency'),
  metricQualityBadge: document.getElementById('metricQualityBadge'),

  // Event Log & Actions
  eventLog: document.getElementById('eventLog'),
  btnClearLog: document.getElementById('btnClearLog'),
  btnCopyLog: document.getElementById('btnCopyLog'),
  logFilterBtns: document.querySelectorAll('.log-filter-btn'),

  // Education Section Tabs
  eduTabs: document.querySelectorAll('.edu-tab'),
  eduTabContents: document.querySelectorAll('.edu-tab-content'),
  theoryTitle: document.getElementById('theoryTitle'),
  theoryTag: document.getElementById('theoryTag'),
  theoryBody: document.getElementById('theoryBody'),
  faqGrid: document.getElementById('faqGrid'),

  // Shortcuts Modal
  shortcutsModal: document.getElementById('shortcutsModal'),
  btnCloseShortcuts: document.getElementById('btnCloseShortcuts'),

  // Mobile Floating Controls HUD
  mobileFloatingHud: document.getElementById('mobileFloatingHud'),
  hudBtnStart: document.getElementById('hudBtnStart'),
  hudBtnStep: document.getElementById('hudBtnStep'),
  hudBtnDrop: document.getElementById('hudBtnDrop'),
  hudBtnReset: document.getElementById('hudBtnReset'),
  hudBtnJump: document.getElementById('hudBtnJump'),
  hudProtoBadge: document.getElementById('hudProtoBadge'),
  hudStatusText: document.getElementById('hudStatusText'),
  hudStartText: document.getElementById('hudStartText'),
  hudDropText: document.getElementById('hudDropText'),
};

// ============================================================================
// 4. INITIALIZATION & RESET LIFECYCLE
// ============================================================================

/**
 * Initializes simulation state and populates UI elements
 */
function initSimulation() {
  applyTheme(SimState.theme);
  readConfigFromInputs();
  resetSimulationState();
  updateTheorySection();
  populateDropTargetDropdown();
  updateUI();
  logEvent('INFO', `Simulator initialized with ${getProtocolFullName(SimState.protocol)}. Ready to start.`);
  showToast('info', `Ready! Click Start to begin simulation for ${getProtocolFullName(SimState.protocol)}.`);
}

/**
 * Reads inputs from DOM controls
 */
function readConfigFromInputs() {
  SimState.totalFrames = Math.max(3, Math.min(15, parseInt(DOM.totalFramesInput.value, 10) || 8));
  DOM.totalFramesInput.value = SimState.totalFrames;

  if (SimState.protocol === 'SAW') {
    SimState.windowSize = 1;
    DOM.windowSizeInput.value = 1;
    DOM.windowSizeInput.disabled = true;
    DOM.btnWinMinus.disabled = true;
    DOM.btnWinPlus.disabled = true;
    DOM.windowSizeHint.textContent = '(Fixed at 1)';
    DOM.senderModeChip.textContent = 'Lock-Step (Ws = 1)';
    DOM.receiverModeChip.textContent = 'In-Order (Wr = 1)';
  } else if (SimState.protocol === 'GBN') {
    DOM.windowSizeInput.disabled = false;
    DOM.btnWinMinus.disabled = false;
    DOM.btnWinPlus.disabled = false;
    DOM.windowSizeHint.textContent = '(1 - 6)';
    SimState.windowSize = Math.max(1, Math.min(6, parseInt(DOM.windowSizeInput.value, 10) || 4));
    DOM.windowSizeInput.value = SimState.windowSize;
    DOM.senderModeChip.textContent = `Sliding Window (Ws = ${SimState.windowSize})`;
    DOM.receiverModeChip.textContent = 'Cumulative (Wr = 1)';
  } else if (SimState.protocol === 'SR') {
    DOM.windowSizeInput.disabled = false;
    DOM.btnWinMinus.disabled = false;
    DOM.btnWinPlus.disabled = false;
    DOM.windowSizeHint.textContent = '(1 - 6)';
    SimState.windowSize = Math.max(1, Math.min(6, parseInt(DOM.windowSizeInput.value, 10) || 4));
    DOM.windowSizeInput.value = SimState.windowSize;
    DOM.senderModeChip.textContent = `Selective Window (Ws = ${SimState.windowSize})`;
    DOM.receiverModeChip.textContent = `RX Buffer Window (Wr = ${SimState.windowSize})`;
  }

  SimState.speedMultiplier = parseFloat(DOM.speedSlider.value) || 1.0;
  DOM.speedDisplay.textContent = `${SimState.speedMultiplier.toFixed(1)}x`;
  updateSpeedPillsActive();
}

function updateSpeedPillsActive() {
  DOM.speedPills.forEach(pill => {
    const val = parseFloat(pill.dataset.speed);
    pill.classList.toggle('active', Math.abs(val - SimState.speedMultiplier) < 0.1);
  });
}

/**
 * Resets the entire simulation engine to pristine state
 */
function resetSimulationState() {
  SimState.status = 'IDLE';

  // Sender frames array
  SimState.sender.base = 0;
  SimState.sender.nextSeqNum = 0;
  SimState.sender.timerRemaining = 0;
  SimState.sender.timerRunning = false;
  SimState.sender.lastSendTime = 0;
  SimState.sender.frames = [];

  for (let i = 0; i < SimState.totalFrames; i++) {
    SimState.sender.frames.push({
      num: i,
      status: 'unsent', // 'unsent' | 'transit' | 'acked' | 'timeout'
      timer: 0,         // Frame-specific timer used in Selective Repeat
      timerRunning: false,
      transmissionCount: 0,
    });
  }

  // Receiver state
  SimState.receiver.expectedSeqNum = 0;
  SimState.receiver.rcvBase = 0;
  SimState.receiver.buffer = {};
  SimState.receiver.deliveredCount = 0;
  SimState.receiver.deliveredSet = new Set();
  DOM.receiverStatusText.textContent = 'Awaiting initial frame from Sender...';

  // Channel in-flight packets
  SimState.channel.inFlightFrames = [];
  SimState.channel.inFlightAcks = [];

  // Faults
  SimState.faults.dropNextFrame = false;
  SimState.faults.dropNextAck = false;
  SimState.faults.autoDropTargetFrame = DOM.selectDropTarget.value;
  SimState.faults.droppedFramesHistory.clear();
  DOM.btnDropNextFrame.classList.remove('active-arm');
  DOM.labelDropNextFrame.textContent = 'Drop Next Frame';
  DOM.btnDropNextAck.classList.remove('active-arm');
  DOM.labelDropNextAck.textContent = 'Drop Next ACK';

  // Metrics
  SimState.metrics.totalTransmissions = 0;
  SimState.metrics.retransmissions = 0;
  SimState.metrics.lostPackets = 0;

  // Time
  SimState.time.lastTimestamp = 0;
  SimState.time.simulatedElapsedMs = 0;

  // Clear in-flight DOM packets (preserving station endpoint markers)
  DOM.frameLane.innerHTML = '<span class="lane-endpoint endpoint-left">Host A (Tx)</span><span class="lane-endpoint endpoint-right">Host B (Rx)</span><div class="lane-grid-pattern"></div><div class="lane-track-line"></div>';
  DOM.ackLane.innerHTML = '<span class="lane-endpoint endpoint-left">Host A &larr;</span><span class="lane-endpoint endpoint-right">&larr; Host B</span><div class="lane-grid-pattern"></div><div class="lane-track-line"></div>';

  // Button States
  DOM.btnStart.disabled = false;
  DOM.btnPause.disabled = true;
  DOM.btnPause.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>Pause</span>`;
  DOM.btnStep.disabled = false;
  DOM.totalFramesInput.disabled = false;
  DOM.btnFramesMinus.disabled = false;
  DOM.btnFramesPlus.disabled = false;

  if (SimState.protocol !== 'SAW') {
    DOM.windowSizeInput.disabled = false;
    DOM.btnWinMinus.disabled = false;
    DOM.btnWinPlus.disabled = false;
  }

  updateStatusPill('IDLE', 'Ready (Idle)');
  renderFrames();
  updatePointersAndScopes();
  updateMetricsDisplay();
  updateTimerUI();
  updateWindowBrackets();
}

/**
 * Populates dropdown options for the Auto-Drop target frame selector
 */
function populateDropTargetDropdown() {
  const currentVal = DOM.selectDropTarget.value;
  DOM.selectDropTarget.innerHTML = '<option value="none">None (Clean Channel)</option>';

  for (let i = 0; i < SimState.totalFrames; i++) {
    const opt = document.createElement('option');
    opt.value = i.toString();
    opt.textContent = `Frame ${i}`;
    if (currentVal === i.toString()) {
      opt.selected = true;
    }
    DOM.selectDropTarget.appendChild(opt);
  }
}

// ============================================================================
// 5. PROTOCOL LOGIC & STATE MACHINE
// ============================================================================

/**
 * Checks if Sender can transmit more frames within the current window
 */
function checkSenderTransmission() {
  if (SimState.status !== 'RUNNING' && SimState.status !== 'PAUSED') return;

  const { totalFrames, windowSize } = SimState;

  // Rule: Send next frame if sequence number is within window [base, base + N - 1]
  while (
    SimState.sender.nextSeqNum < SimState.sender.base + windowSize &&
    SimState.sender.nextSeqNum < totalFrames
  ) {
    const seq = SimState.sender.nextSeqNum;
    SimState.sender.nextSeqNum++;
    transmitFrame(seq);

    // In Stop-and-Wait and GBN: start the sender timer if not already running
    if (!SimState.sender.timerRunning) {
      startSenderTimer();
    }

    // In Stop-and-Wait, sender can only send 1 frame before waiting for ACK
    if (SimState.protocol === 'SAW') {
      break;
    }
  }
}

/**
 * Transmits a data frame into the physical channel
 */
function transmitFrame(frameNum, isRetransmission = false) {
  const frameObj = SimState.sender.frames[frameNum];
  frameObj.status = 'transit';
  frameObj.transmissionCount++;

  // In Selective Repeat, start individual timer for this specific frame
  if (SimState.protocol === 'SR') {
    frameObj.timer = CONFIG.BASE_TIMEOUT_DURATION_MS;
    frameObj.timerRunning = true;
  }

  // Update transmission metrics
  SimState.metrics.totalTransmissions++;
  if (isRetransmission) {
    SimState.metrics.retransmissions++;
  }

  // Determine if frame will be dropped
  let shouldDrop = false;
  let dropReason = '';

  if (SimState.faults.dropNextFrame) {
    shouldDrop = true;
    dropReason = 'Manual Fault ("Drop Next Frame" triggered)';
    SimState.faults.dropNextFrame = false;
    DOM.btnDropNextFrame.classList.remove('active-arm');
    DOM.labelDropNextFrame.textContent = 'Drop Next Frame';
  } else if (SimState.faults.autoDropTargetFrame === frameNum.toString() && !SimState.faults.droppedFramesHistory.has(frameNum)) {
    shouldDrop = true;
    dropReason = `Auto-Drop Target for Frame ${frameNum}`;
    SimState.faults.droppedFramesHistory.add(frameNum);
  }

  // Create in-flight packet object
  const packet = {
    id: 'frame-' + frameNum + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    type: 'FRAME',
    seqNum: frameNum,
    progress: 0.0,
    isLost: shouldDrop,
    dropReason: dropReason,
    lossTriggered: false,
    element: null,
  };

  createPacketElement(packet, DOM.frameLane);
  SimState.channel.inFlightFrames.push(packet);

  AudioSynth.playLaunch();

  const actionPrefix = isRetransmission ? 'RETRANSMIT' : 'SENT';
  logEvent(actionPrefix, `Sender transmitted Frame [${frameNum}] into channel.${shouldDrop ? ' (Marked for loss)' : ''}`);
  showToast(isRetransmission ? 'warning' : 'info', `Sender: Sent Frame ${frameNum} ${isRetransmission ? '(Retransmit)' : ''}`);

  renderFrames();
  updateMetricsDisplay();
  updateWindowBrackets();
}

/**
 * Processes a data frame when it arrives at the Receiver
 */
function onFrameArriveAtReceiver(packet) {
  const frameNum = packet.seqNum;

  switch (SimState.protocol) {
    case 'SAW':
      handleFrameArrivalSAW(frameNum);
      break;
    case 'GBN':
      handleFrameArrivalGBN(frameNum);
      break;
    case 'SR':
      handleFrameArrivalSR(frameNum);
      break;
  }

  renderFrames();
  updatePointersAndScopes();
  updateMetricsDisplay();
  updateWindowBrackets();
}

/**
 * Stop-and-Wait Receiver Frame Handler
 */
function handleFrameArrivalSAW(frameNum) {
  const { expectedSeqNum } = SimState.receiver;

  if (frameNum === expectedSeqNum) {
    markFrameDelivered(frameNum);
    SimState.receiver.expectedSeqNum++;
    logEvent('RCVD', `Receiver accepted expected Frame [${frameNum}]. Sending ACK [${frameNum}].`);
    DOM.receiverStatusText.textContent = `Accepted Frame ${frameNum}. Sent ACK ${frameNum}.`;
    sendAck(frameNum);
  } else {
    logEvent('DISCARD', `Receiver received duplicate Frame [${frameNum}]. Discarding and re-sending ACK [${frameNum}].`);
    DOM.receiverStatusText.textContent = `Duplicate Frame ${frameNum} discarded. Re-sending ACK ${frameNum}.`;
    sendAck(frameNum);
  }
}

/**
 * Go-Back-N Receiver Frame Handler
 */
function handleFrameArrivalGBN(frameNum) {
  const { expectedSeqNum } = SimState.receiver;

  if (frameNum === expectedSeqNum) {
    markFrameDelivered(frameNum);
    SimState.receiver.expectedSeqNum++;
    logEvent('RCVD', `Receiver accepted in-order Frame [${frameNum}]. Sending cumulative ACK [${frameNum}].`);
    DOM.receiverStatusText.textContent = `Accepted in-order Frame ${frameNum}. Sending ACK ${frameNum}.`;
    sendAck(frameNum);
  } else {
    logEvent('DISCARD', `Receiver discarded out-of-order Frame [${frameNum}]! Expected Frame was [${expectedSeqNum}].`);
    DOM.receiverStatusText.textContent = `Discarded out-of-order Frame ${frameNum}! Expected ${expectedSeqNum}.`;
    
    // Re-send ACK for the last correctly received in-order frame
    if (expectedSeqNum > 0) {
      const lastAck = expectedSeqNum - 1;
      logEvent('ACK', `Receiver re-sending cumulative ACK [${lastAck}] for last in-order frame.`);
      sendAck(lastAck);
    }
  }
}

/**
 * Selective Repeat Receiver Frame Handler
 */
function handleFrameArrivalSR(frameNum) {
  const { rcvBase } = SimState.receiver;
  const { windowSize } = SimState;
  const rcvMax = rcvBase + windowSize - 1;

  if (frameNum >= rcvBase && frameNum <= rcvMax) {
    sendAck(frameNum);

    if (!SimState.receiver.buffer[frameNum] && !SimState.receiver.deliveredSet.has(frameNum)) {
      SimState.receiver.buffer[frameNum] = true;

      if (frameNum === rcvBase) {
        logEvent('RCVD', `Receiver accepted in-order Frame [${frameNum}]. Sliding receiver window.`);
        deliverBufferedFramesSR();
      } else {
        logEvent('BUFFER', `Receiver accepted out-of-order Frame [${frameNum}]. Storing in buffer.`);
        DOM.receiverStatusText.textContent = `Buffered out-of-order Frame ${frameNum}. Sent individual ACK ${frameNum}.`;
      }
    } else {
      logEvent('RCVD', `Receiver received already buffered Frame [${frameNum}]. Re-sending ACK [${frameNum}].`);
    }
  } else if (frameNum >= Math.max(0, rcvBase - windowSize) && frameNum < rcvBase) {
    logEvent('DISCARD', `Receiver received already delivered Frame [${frameNum}]. Re-sending ACK [${frameNum}].`);
    DOM.receiverStatusText.textContent = `Duplicate Frame ${frameNum} already delivered. Re-sending ACK ${frameNum}.`;
    sendAck(frameNum);
  } else {
    logEvent('DISCARD', `Receiver ignored Frame [${frameNum}] outside valid window [${rcvBase} to ${rcvMax}].`);
  }
}

/**
 * Delivers contiguous buffered frames in Selective Repeat
 */
function deliverBufferedFramesSR() {
  while (SimState.receiver.buffer[SimState.receiver.rcvBase]) {
    const cur = SimState.receiver.rcvBase;
    markFrameDelivered(cur);
    delete SimState.receiver.buffer[cur];
    SimState.receiver.rcvBase++;
    logEvent('DELIVER', `Delivered Frame [${cur}] from buffer to application layer.`);
  }
  DOM.receiverStatusText.textContent = `Delivered frames up to ${SimState.receiver.rcvBase - 1}. Receiver window: [${SimState.receiver.rcvBase}..${SimState.receiver.rcvBase + SimState.windowSize - 1}]`;
}

/**
 * Transmits an ACK from Receiver to Sender
 */
function sendAck(ackNum) {
  let shouldDrop = false;
  let dropReason = '';

  if (SimState.faults.dropNextAck) {
    shouldDrop = true;
    dropReason = 'Manual Fault ("Drop Next ACK" triggered)';
    SimState.faults.dropNextAck = false;
    DOM.btnDropNextAck.classList.remove('active-arm');
    DOM.labelDropNextAck.textContent = 'Drop Next ACK';
  }

  const packet = {
    id: 'ack-' + ackNum + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    type: 'ACK',
    seqNum: ackNum,
    progress: 0.0,
    isLost: shouldDrop,
    dropReason: dropReason,
    lossTriggered: false,
    element: null,
  };

  createPacketElement(packet, DOM.ackLane);
  SimState.channel.inFlightAcks.push(packet);

  logEvent('ACK', `Receiver dispatched ACK [${ackNum}] into channel.${shouldDrop ? ' (Marked for loss)' : ''}`);
}

/**
 * Processes an ACK when it arrives at the Sender
 */
function onAckArriveAtSender(packet) {
  const ackNum = packet.seqNum;

  switch (SimState.protocol) {
    case 'SAW':
      handleAckArrivalSAW(ackNum);
      break;
    case 'GBN':
      handleAckArrivalGBN(ackNum);
      break;
    case 'SR':
      handleAckArrivalSR(ackNum);
      break;
  }

  AudioSynth.playAck();

  renderFrames();
  updatePointersAndScopes();
  updateMetricsDisplay();
  updateWindowBrackets();
  checkSimulationCompletion();
}

/**
 * Stop-and-Wait Sender ACK Handler
 */
function handleAckArrivalSAW(ackNum) {
  if (ackNum === SimState.sender.base) {
    logEvent('ACK', `Sender received ACK [${ackNum}]. Advancing window.`);
    SimState.sender.frames[ackNum].status = 'acked';
    stopSenderTimer();
    SimState.sender.base++;
    showToast('success', `Sender: ACK ${ackNum} received successfully!`);
  } else {
    logEvent('INFO', `Sender ignored unexpected ACK [${ackNum}] (Expected ${SimState.sender.base}).`);
  }
}

/**
 * Go-Back-N Sender ACK Handler
 */
function handleAckArrivalGBN(ackNum) {
  const { base } = SimState.sender;

  if (ackNum >= base) {
    logEvent('ACK', `Sender received cumulative ACK [${ackNum}]. Acknowledging frames ${base} through ${ackNum}.`);

    for (let i = base; i <= ackNum; i++) {
      if (SimState.sender.frames[i]) {
        SimState.sender.frames[i].status = 'acked';
      }
    }

    SimState.sender.base = ackNum + 1;
    showToast('success', `Sender: Cumulative ACK ${ackNum} received. Window slides forward!`);

    if (SimState.sender.base === SimState.sender.nextSeqNum) {
      stopSenderTimer();
    } else {
      startSenderTimer();
    }
  } else {
    logEvent('INFO', `Sender received duplicate ACK [${ackNum}]. (Current Base is ${base}).`);
  }
}

/**
 * Selective Repeat Sender ACK Handler
 */
function handleAckArrivalSR(ackNum) {
  if (SimState.sender.frames[ackNum]) {
    const frameObj = SimState.sender.frames[ackNum];
    frameObj.status = 'acked';
    frameObj.timerRunning = false;
    logEvent('ACK', `Sender received individual ACK [${ackNum}]. Frame marked acknowledged.`);
    showToast('success', `Sender: ACK ${ackNum} received!`);

    if (ackNum === SimState.sender.base) {
      while (
        SimState.sender.base < SimState.totalFrames &&
        SimState.sender.frames[SimState.sender.base].status === 'acked'
      ) {
        SimState.sender.base++;
      }
      logEvent('INFO', `Sender window base shifted to [${SimState.sender.base}].`);
    }
  }
}

function markFrameDelivered(frameNum) {
  if (!SimState.receiver.deliveredSet.has(frameNum)) {
    SimState.receiver.deliveredSet.add(frameNum);
    SimState.receiver.deliveredCount = SimState.receiver.deliveredSet.size;
  }
}

// ============================================================================
// 6. TIMEOUT & RETRANSMISSION LOGIC
// ============================================================================

function startSenderTimer() {
  SimState.sender.timerDuration = CONFIG.BASE_TIMEOUT_DURATION_MS;
  SimState.sender.timerRemaining = CONFIG.BASE_TIMEOUT_DURATION_MS;
  SimState.sender.timerRunning = true;
  updateTimerUI();
}

function stopSenderTimer() {
  SimState.sender.timerRunning = false;
  SimState.sender.timerRemaining = 0;
  updateTimerUI();
}

function onSenderTimeout() {
  const { base, nextSeqNum } = SimState.sender;
  AudioSynth.playTimeout();

  if (SimState.protocol === 'SAW') {
    logEvent('TIMEOUT', `TIMEOUT! Frame [${base}] timed out. Retransmitting Frame [${base}].`);
    showToast('danger', `Timeout! Sender retransmitting Frame ${base}.`);
    SimState.sender.frames[base].status = 'timeout';
    renderFrames();
    transmitFrame(base, true);
    startSenderTimer();
  } else if (SimState.protocol === 'GBN') {
    logEvent('TIMEOUT', `TIMEOUT! Oldest unacknowledged Frame [${base}] timed out.`);
    logEvent('RETRANSMIT', `Go-Back-N triggered! Retransmitting all outstanding frames [${base}] to [${nextSeqNum - 1}].`);
    showToast('danger', `Timeout! GBN: Retransmitting frames ${base} through ${nextSeqNum - 1}.`);

    for (let i = base; i < nextSeqNum; i++) {
      SimState.sender.frames[i].status = 'timeout';
    }
    renderFrames();

    for (let i = base; i < nextSeqNum; i++) {
      transmitFrame(i, true);
    }
    startSenderTimer();
  }
}

function updateSelectiveRepeatTimers(deltaMs) {
  const { base, nextSeqNum } = SimState.sender;

  for (let i = base; i < nextSeqNum; i++) {
    const frameObj = SimState.sender.frames[i];
    if (frameObj && frameObj.status === 'transit' && frameObj.timerRunning) {
      frameObj.timer -= deltaMs;

      if (frameObj.timer <= 0) {
        AudioSynth.playTimeout();
        logEvent('TIMEOUT', `TIMEOUT! Frame [${i}] timed out.`);
        logEvent('RETRANSMIT', `Selective Repeat: Retransmitting ONLY missing Frame [${i}].`);
        showToast('danger', `Selective Repeat: Timeout on Frame ${i}! Retransmitting.`);

        frameObj.status = 'timeout';
        renderFrames();
        transmitFrame(i, true);
      }
    }
  }
}

// ============================================================================
// 7. ANIMATION LOOP & CHANNEL ENGINE
// ============================================================================

let animationFrameId = null;

function simulationLoop(timestamp) {
  if (!SimState.time.lastTimestamp) {
    SimState.time.lastTimestamp = timestamp;
  }

  const rawDeltaMs = Math.min(100, timestamp - SimState.time.lastTimestamp);
  SimState.time.lastTimestamp = timestamp;

  if (SimState.status === 'RUNNING') {
    const effectiveDeltaMs = rawDeltaMs * SimState.speedMultiplier;
    simulationTick(effectiveDeltaMs);
  }

  animationFrameId = requestAnimationFrame(simulationLoop);
}

function simulationTick(deltaMs) {
  SimState.time.simulatedElapsedMs += deltaMs;

  advanceChannelPackets(SimState.channel.inFlightFrames, deltaMs, onFrameArriveAtReceiver, DOM.frameLane);
  advanceChannelPackets(SimState.channel.inFlightAcks, deltaMs, onAckArriveAtSender, DOM.ackLane);

  if (SimState.protocol === 'SAW' || SimState.protocol === 'GBN') {
    if (SimState.sender.timerRunning) {
      SimState.sender.timerRemaining -= deltaMs;
      updateTimerUI();

      if (SimState.sender.timerRemaining <= 0) {
        onSenderTimeout();
      }
    }
  } else if (SimState.protocol === 'SR') {
    updateSelectiveRepeatTimers(deltaMs);
    updateSRTimerCardUI();
  }

  checkSenderTransmission();
  updateDeliveryProgress();
}

function advanceChannelPackets(packetList, deltaMs, onArrivalCallback, laneElement) {
  const speedScale = deltaMs / CONFIG.BASE_PACKET_TRANSIT_TIME_MS;

  for (let i = packetList.length - 1; i >= 0; i--) {
    const packet = packetList[i];
    packet.progress += speedScale;

    // Check for Loss Trigger (~50% across channel)
    if (packet.isLost && !packet.lossTriggered && packet.progress >= 0.45) {
      packet.lossTriggered = true;
      SimState.metrics.lostPackets++;
      updateMetricsDisplay();

      AudioSynth.playLoss();

      const typeLabel = packet.type === 'FRAME' ? `Data Frame [${packet.seqNum}]` : `ACK [${packet.seqNum}]`;
      logEvent('LOST', `${typeLabel} was LOST in channel! (${packet.dropReason})`);
      showToast('danger', `Packet Lost! ${typeLabel} dropped in channel.`);

      if (packet.element) {
        packet.element.classList.add('lost');
        setTimeout(() => {
          if (packet.element && packet.element.parentNode) {
            packet.element.parentNode.removeChild(packet.element);
          }
        }, 650);
      }

      packetList.splice(i, 1);
      continue;
    }

    // Arrival at Destination (Progress >= 1.0)
    if (packet.progress >= 1.0) {
      if (packet.element && packet.element.parentNode) {
        packet.element.parentNode.removeChild(packet.element);
      }
      packetList.splice(i, 1);
      onArrivalCallback(packet);
      continue;
    }

    if (packet.element) {
      updatePacketElementPosition(packet);
    }
  }
}

function createPacketElement(packet, laneContainer) {
  const el = document.createElement('div');
  el.className = `packet-node ${packet.type === 'FRAME' ? 'packet-frame' : 'packet-ack'}`;
  el.id = packet.id;

  const iconSvg = packet.type === 'FRAME' ? '📦' : '✓';
  const labelText = packet.type === 'FRAME' 
    ? `Frame ${packet.seqNum}` 
    : `ACK ${packet.seqNum}`;

  el.innerHTML = `
    <span class="packet-icon">${iconSvg}</span>
    <span>${labelText}</span>
    <span class="packet-drop-badge">Tap to Drop ✕</span>
  `;

  const triggerPacketDrop = (e) => {
    e.stopPropagation();
    if (!packet.isLost) {
      packet.isLost = true;
      packet.dropReason = 'Manual User Tap in Channel';
      if ('vibrate' in navigator) {
        try { navigator.vibrate(40); } catch (_) {}
      }
      AudioSynth.playLoss();
      showToast('warning', `You dropped ${packet.type} ${packet.seqNum}!`);
      updateMetricsDisplay();
    }
  };

  el.addEventListener('click', triggerPacketDrop);
  el.addEventListener('pointerdown', triggerPacketDrop);

  laneContainer.appendChild(el);
  packet.element = el;
  updatePacketElementPosition(packet);
}

function updatePacketElementPosition(packet) {
  if (!packet.element) return;
  const percent = Math.min(100, Math.max(0, packet.progress * 100));

  if (packet.type === 'FRAME') {
    packet.element.style.left = `${percent}%`;
  } else {
    packet.element.style.left = `${100 - percent}%`;
  }
}

function checkSimulationCompletion() {
  const allDelivered = SimState.receiver.deliveredCount >= SimState.totalFrames;
  const allAcked = SimState.sender.base >= SimState.totalFrames;

  if (allDelivered && allAcked && SimState.status === 'RUNNING') {
    SimState.status = 'FINISHED';
    stopSenderTimer();
    updateStatusPill('FINISHED', 'Completed (All Delivered)');
    DOM.btnStart.disabled = true;
    DOM.btnPause.disabled = true;
    DOM.btnStep.disabled = true;

    AudioSynth.playFinished();

    const eff = calculateEfficiency().toFixed(1);
    logEvent('INFO', `Simulation Complete! All ${SimState.totalFrames} frames delivered with ${eff}% efficiency.`);
    showToast('success', `🎉 Complete! All ${SimState.totalFrames} frames transmitted and acknowledged (${eff}% Efficiency).`);
  }
}

// ============================================================================
// 8. DYNAMIC UI RENDERING & COMPONENT UPDATES
// ============================================================================

function renderFrames() {
  renderSenderTrack();
  renderReceiverTrack();
}

function renderSenderTrack() {
  DOM.senderFrameTrack.innerHTML = '';
  const { base, frames } = SimState.sender;
  const { windowSize } = SimState;

  frames.forEach((f, idx) => {
    const slot = document.createElement('div');
    slot.className = `frame-item state-${f.status}`;

    const inWindow = idx >= base && idx < base + windowSize;
    if (inWindow) {
      slot.classList.add('in-window');
    }

    slot.innerHTML = `
      <span class="frame-num">${f.num}</span>
      <span class="frame-state-label">${getStateAbbrev(f.status)}</span>
    `;

    slot.title = `Frame ${f.num} | Status: ${f.status.toUpperCase()} | Transmissions: ${f.transmissionCount}`;
    DOM.senderFrameTrack.appendChild(slot);
  });
}

function renderReceiverTrack() {
  DOM.receiverFrameTrack.innerHTML = '';
  const { totalFrames, protocol, windowSize } = SimState;
  const { expectedSeqNum, rcvBase, buffer, deliveredSet } = SimState.receiver;

  for (let i = 0; i < totalFrames; i++) {
    const slot = document.createElement('div');
    slot.className = 'frame-item';

    if (deliveredSet.has(i)) {
      slot.classList.add('state-acked');
      slot.innerHTML = `
        <span class="frame-num">${i}</span>
        <span class="frame-state-label">RCVD</span>
      `;
    } else if (protocol === 'SR' && buffer[i]) {
      slot.classList.add('state-buffered');
      slot.innerHTML = `
        <span class="frame-num">${i}</span>
        <span class="frame-state-label">BUFF</span>
      `;
    } else {
      slot.classList.add('state-unsent');
      slot.innerHTML = `
        <span class="frame-num">${i}</span>
        <span class="frame-state-label">WAIT</span>
      `;
    }

    if (protocol === 'SR' && i >= rcvBase && i < rcvBase + windowSize) {
      slot.classList.add('in-window');
    } else if (protocol !== 'SR' && i === expectedSeqNum) {
      slot.classList.add('in-window');
    }

    DOM.receiverFrameTrack.appendChild(slot);
  }
}

function getStateAbbrev(status) {
  switch (status) {
    case 'unsent': return 'WAIT';
    case 'transit': return 'SEND';
    case 'acked': return 'ACK';
    case 'buffered': return 'BUFF';
    case 'timeout': return 'LOST';
    default: return status;
  }
}

/**
 * Updates visual sliding window brackets above the frame tracks with pixel precision
 */
function updateWindowBrackets() {
  const { base } = SimState.sender;
  const { windowSize, totalFrames, protocol } = SimState;
  const { rcvBase } = SimState.receiver;

  // Sender Bracket
  if (base >= totalFrames || !DOM.senderWindowBracket) {
    if (DOM.senderWindowBracket) DOM.senderWindowBracket.style.display = 'none';
  } else {
    DOM.senderWindowBracket.style.display = 'flex';
    const track = DOM.senderFrameTrack;
    const items = track ? track.querySelectorAll('.frame-item') : [];
    if (items.length > base) {
      const firstEl = items[base];
      const lastIdx = Math.min(items.length - 1, base + windowSize - 1);
      const lastEl = items[lastIdx];
      if (firstEl && lastEl) {
        const trackRect = track.getBoundingClientRect();
        const firstRect = firstEl.getBoundingClientRect();
        const lastRect = lastEl.getBoundingClientRect();
        const left = Math.max(0, firstRect.left - trackRect.left);
        const width = Math.max(34, lastRect.right - firstRect.left);
        DOM.senderWindowBracket.style.left = `${left}px`;
        DOM.senderWindowBracket.style.width = `${width}px`;
      }
    } else {
      const leftPct = (base / totalFrames) * 100;
      const rawWidthPct = (Math.min(windowSize, totalFrames - base) / totalFrames) * 100;
      const widthPct = Math.min(100 - leftPct, Math.max(rawWidthPct, windowSize === 1 ? 12 : 14));
      DOM.senderWindowBracket.style.left = `${leftPct}%`;
      DOM.senderWindowBracket.style.width = `${widthPct}%`;
    }
    DOM.senderBracketLabel.textContent = windowSize === 1 
      ? `[${base}]` 
      : `Win [${base}..${Math.min(totalFrames - 1, base + windowSize - 1)}]`;
  }

  // Receiver Bracket (Visible in SR)
  if (protocol === 'SR' && rcvBase < totalFrames && DOM.receiverWindowBracket) {
    DOM.receiverWindowBracket.style.display = 'flex';
    const track = DOM.receiverFrameTrack;
    const items = track ? track.querySelectorAll('.frame-item') : [];
    if (items.length > rcvBase) {
      const firstEl = items[rcvBase];
      const lastIdx = Math.min(items.length - 1, rcvBase + windowSize - 1);
      const lastEl = items[lastIdx];
      if (firstEl && lastEl) {
        const trackRect = track.getBoundingClientRect();
        const firstRect = firstEl.getBoundingClientRect();
        const lastRect = lastEl.getBoundingClientRect();
        const left = Math.max(0, firstRect.left - trackRect.left);
        const width = Math.max(34, lastRect.right - firstRect.left);
        DOM.receiverWindowBracket.style.left = `${left}px`;
        DOM.receiverWindowBracket.style.width = `${width}px`;
      }
    } else {
      const leftPct = (rcvBase / totalFrames) * 100;
      const rawWidthPct = (Math.min(windowSize, totalFrames - rcvBase) / totalFrames) * 100;
      const widthPct = Math.min(100 - leftPct, Math.max(rawWidthPct, windowSize === 1 ? 12 : 14));
      DOM.receiverWindowBracket.style.left = `${leftPct}%`;
      DOM.receiverWindowBracket.style.width = `${widthPct}%`;
    }
    DOM.receiverBracketLabel.textContent = windowSize === 1 
      ? `RX [${rcvBase}]` 
      : `RX [${rcvBase}..${Math.min(totalFrames - 1, rcvBase + windowSize - 1)}]`;
  } else if (DOM.receiverWindowBracket) {
    DOM.receiverWindowBracket.style.display = 'none';
  }

  updateHUD();
}

function updatePointersAndScopes() {
  const { base, nextSeqNum } = SimState.sender;
  const { windowSize, totalFrames, protocol } = SimState;
  const { expectedSeqNum, rcvBase } = SimState.receiver;

  DOM.ptrBase.textContent = base < totalFrames ? base : 'Done';
  DOM.ptrNext.textContent = nextSeqNum < totalFrames ? nextSeqNum : 'Done';

  const winMax = Math.min(totalFrames - 1, base + windowSize - 1);
  DOM.senderWindowScope.textContent = base < totalFrames ? `[ ${base} to ${winMax} ]` : '[ Closed ]';

  if (protocol === 'SR') {
    const rcvMax = Math.min(totalFrames - 1, rcvBase + windowSize - 1);
    DOM.ptrExpected.textContent = `[${rcvBase}..${rcvMax}]`;
    DOM.receiverBufferScope.textContent = `Window: [ ${rcvBase} to ${rcvMax} ]`;
  } else {
    DOM.ptrExpected.textContent = expectedSeqNum < totalFrames ? expectedSeqNum : 'Done';
    DOM.receiverBufferScope.textContent = expectedSeqNum < totalFrames ? `Expected: Frame ${expectedSeqNum}` : 'All Received';
  }
}

function updateTimerUI() {
  if (SimState.protocol === 'SR') {
    updateSRTimerCardUI();
    return;
  }

  if (SimState.sender.timerRunning && SimState.sender.timerDuration > 0) {
    const remainingSec = Math.max(0, SimState.sender.timerRemaining / 1000).toFixed(1);
    DOM.timerDisplay.textContent = `${remainingSec}s`;
    const pct = Math.max(0, Math.min(100, (SimState.sender.timerRemaining / SimState.sender.timerDuration) * 100));
    DOM.timerProgressFill.style.width = `${pct}%`;
  } else {
    DOM.timerDisplay.textContent = 'Inactive';
    DOM.timerProgressFill.style.width = '0%';
  }
}

function updateSRTimerCardUI() {
  const { base, nextSeqNum, frames } = SimState.sender;
  let activeTimersCount = 0;
  let minRemaining = Infinity;

  for (let i = base; i < nextSeqNum; i++) {
    const f = frames[i];
    if (f && f.timerRunning && f.status === 'transit') {
      activeTimersCount++;
      if (f.timer < minRemaining) {
        minRemaining = f.timer;
      }
    }
  }

  if (activeTimersCount > 0 && minRemaining !== Infinity) {
    DOM.timerDisplay.textContent = `${(minRemaining / 1000).toFixed(1)}s (${activeTimersCount} active)`;
    const pct = Math.max(0, Math.min(100, (minRemaining / CONFIG.BASE_TIMEOUT_DURATION_MS) * 100));
    DOM.timerProgressFill.style.width = `${pct}%`;
  } else {
    DOM.timerDisplay.textContent = 'Inactive';
    DOM.timerProgressFill.style.width = '0%';
  }
}

function updateDeliveryProgress() {
  const delivered = SimState.receiver.deliveredCount;
  const total = SimState.totalFrames;
  const pct = Math.round((delivered / total) * 100);

  DOM.deliveryProgressBar.style.width = `${pct}%`;
  DOM.deliveryProgressText.textContent = `${delivered} / ${total} Delivered (${pct}%)`;
}

function updateMetricsDisplay() {
  DOM.metricDelivered.textContent = SimState.receiver.deliveredCount;
  DOM.metricDeliveredSub.textContent = `of ${SimState.totalFrames} total`;
  DOM.metricTransmissions.textContent = SimState.metrics.totalTransmissions;
  DOM.metricRetransmissions.textContent = SimState.metrics.retransmissions;
  DOM.metricLostPackets.textContent = SimState.metrics.lostPackets;

  const eff = calculateEfficiency();
  DOM.metricEfficiency.textContent = `${eff.toFixed(1)}%`;

  if (eff >= 80) {
    DOM.metricQualityBadge.textContent = 'Optimal';
    DOM.metricQualityBadge.className = 'efficiency-quality-badge';
  } else if (eff >= 55) {
    DOM.metricQualityBadge.textContent = 'Moderate';
    DOM.metricQualityBadge.className = 'efficiency-quality-badge accent-yellow';
  } else {
    DOM.metricQualityBadge.textContent = 'Degraded';
    DOM.metricQualityBadge.className = 'efficiency-quality-badge accent-red';
  }
}

function calculateEfficiency() {
  if (SimState.metrics.totalTransmissions === 0) return 100;
  return (SimState.receiver.deliveredCount / SimState.metrics.totalTransmissions) * 100;
}

function updateStatusPill(status, text) {
  DOM.simStatusDot.className = `status-dot ${status.toLowerCase()}`;
  DOM.simStatusText.textContent = text;
  updateHUD();
}

function showToast(type, msg) {
  DOM.toastBar.className = `toast-bar ${type}`;
  let icon = 'ℹ️';
  if (type === 'warning') icon = '⚠️';
  if (type === 'danger') icon = '🚨';
  if (type === 'success') icon = '✅';
  DOM.toastIcon.textContent = icon;
  DOM.toastMsg.textContent = msg;
}

function logEvent(type, message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.dataset.type = type;

  const elapsedSec = (SimState.time.simulatedElapsedMs / 1000).toFixed(2);
  const minutes = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
  const seconds = (elapsedSec % 60).toFixed(2).padStart(5, '0');
  const timeStr = `${minutes}:${seconds}`;

  let badgeClass = 'badge-info';
  if (type === 'SENT') badgeClass = 'badge-sent';
  if (type === 'ACK') badgeClass = 'badge-ack';
  if (type === 'TIMEOUT') badgeClass = 'badge-timeout';
  if (type === 'LOST') badgeClass = 'badge-lost';
  if (type === 'DISCARD') badgeClass = 'badge-discard';
  if (type === 'BUFFER') badgeClass = 'badge-buffer';
  if (type === 'RETRANSMIT') badgeClass = 'badge-timeout';

  entry.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="badge ${badgeClass}">${type}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;

  // Apply active log filter
  if (SimState.logFilter !== 'ALL') {
    if (SimState.logFilter === 'SENT' && type !== 'SENT' && type !== 'RETRANSMIT') entry.style.display = 'none';
    if (SimState.logFilter === 'ACK' && type !== 'ACK') entry.style.display = 'none';
    if (SimState.logFilter === 'LOST' && type !== 'LOST' && type !== 'TIMEOUT' && type !== 'DISCARD') entry.style.display = 'none';
  }

  DOM.eventLog.appendChild(entry);
  DOM.eventLog.scrollTop = DOM.eventLog.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getProtocolFullName(proto) {
  switch (proto) {
    case 'SAW': return 'Stop-and-Wait ARQ';
    case 'GBN': return 'Go-Back-N ARQ';
    case 'SR': return 'Selective Repeat ARQ';
  }
}

function updateUI() {
  renderFrames();
  updatePointersAndScopes();
  updateMetricsDisplay();
  updateDeliveryProgress();
  updateTimerUI();
  updateWindowBrackets();
}

// ============================================================================
// 9. EDUCATIONAL THEORY CONTENT & TABS
// ============================================================================

const THEORY_CONTENT = {
  SAW: {
    title: 'Stop-and-Wait ARQ Protocol — Concept & Analysis Guide',
    tag: 'Window Size: Sender = 1, Receiver = 1',
    html: `
      <div class="theory-grid">
        <div class="theory-block">
          <h4>📖 Core Mechanism</h4>
          <p>The sender transmits exactly <strong>one data frame</strong> and halts. It starts a retransmission timer and waits for an <strong>Acknowledgement (ACK)</strong> before sending the next frame.</p>
        </div>
        <div class="theory-block">
          <h4>⚠️ Loss Handling</h4>
          <ul>
            <li><strong>Lost Frame:</strong> Sender timer expires &rarr; sender retransmits the same frame.</li>
            <li><strong>Lost ACK:</strong> Sender times out &rarr; retransmits frame. Receiver detects duplicate, discards it, and re-sends the ACK!</li>
          </ul>
        </div>
        <div class="theory-block">
          <h4>📐 Sequence Numbering</h4>
          <p>Only <strong>1-bit sequence numbers (0 and 1)</strong> are required (2<sup>m</sup> = 2) because only one frame is outstanding at any given moment.</p>
        </div>
        <div class="theory-block">
          <h4>⚖️ Efficiency & Tradeoffs</h4>
          <p>Efficiency is very low (&eta; = 1 / (1 + 2a), where a = T<sub>p</sub> / T<sub>t</sub>). The link remains idle while waiting for ACKs over high-latency channels.</p>
        </div>
      </div>
    `,
    faqs: [
      {
        q: 'Why does Stop-and-Wait need sequence numbers if window size is 1?',
        a: 'To handle lost ACKs! If an ACK is lost, the sender retransmits the frame. Without sequence numbers, the receiver cannot distinguish between a brand new frame and a retransmitted duplicate.'
      },
      {
        q: 'What is the receiver window size in Stop-and-Wait?',
        a: 'Receiver Window Size is always 1. It only ever waits for the single expected frame.'
      },
      {
        q: 'What is the main drawback of Stop-and-Wait?',
        a: 'Inefficient channel utilization. If the round-trip propagation time is high (high bandwidth-delay product), the sender spends most of its time idle.'
      }
    ]
  },
  GBN: {
    title: 'Go-Back-N (GBN) ARQ Protocol — Concept & Analysis Guide',
    tag: 'Window Size: Sender = N, Receiver = 1 (Cumulative ACK)',
    html: `
      <div class="theory-grid">
        <div class="theory-block">
          <h4>📖 Pipelined Transmission</h4>
          <p>The sender can transmit multiple frames up to window size <span class="code-font">N</span> without waiting for individual ACKs, keeping the channel busy and improving throughput.</p>
        </div>
        <div class="theory-block">
          <h4>📬 Cumulative Acknowledgement</h4>
          <p>An <strong>ACK k</strong> confirms receipt of <strong>all frames up to and including k</strong>. If ACK 2 arrives, frames 0, 1, and 2 are automatically marked acknowledged!</p>
        </div>
        <div class="theory-block">
          <h4>🚫 Out-of-Order Frames Discarded</h4>
          <p>Because Receiver Window = 1, any frame arriving out of order is <strong>discarded</strong>. The receiver does not buffer un-sequenced frames.</p>
        </div>
        <div class="theory-block">
          <h4>🔄 Timeout & Go-Back-N Action</h4>
          <p>When the timer for the oldest unacknowledged frame (<span class="code-font">base</span>) expires, the sender must <strong>go back</strong> and retransmit <strong>all unacknowledged frames</strong> currently in the window!</p>
        </div>
      </div>
    `,
    faqs: [
      {
        q: 'Why is the receiver window size 1 in Go-Back-N?',
        a: 'To keep the receiver simple and avoid buffer allocation. The receiver only accepts frames in exact sequential order and immediately delivers them.'
      },
      {
        q: 'What is the maximum sender window size for m-bit sequence numbers?',
        a: 'Sender Window Size must satisfy: Ws ≤ 2ᵐ - 1. If Ws = 2ᵐ, the receiver cannot distinguish between a complete window of new frames and a retransmission of old frames if all ACKs are lost!'
      },
      {
        q: 'What happens in GBN when an intermediate frame (e.g. Frame 1) is lost?',
        a: 'Frames 2, 3, etc. arrive out of order and are discarded by the receiver. When Frame 1 times out on the sender, the sender retransmits Frame 1, 2, and 3.'
      }
    ]
  },
  SR: {
    title: 'Selective Repeat (SR) ARQ Protocol — Concept & Analysis Guide',
    tag: 'Window Size: Sender = N, Receiver = N (Individual ACK + Buffering)',
    html: `
      <div class="theory-grid">
        <div class="theory-block">
          <h4>📖 Independent Window Buffering</h4>
          <p>Both Sender and Receiver maintain a window of size <span class="code-font">N</span>. The receiver accepts and <strong>buffers valid out-of-order frames</strong> instead of discarding them.</p>
        </div>
        <div class="theory-block">
          <h4>📬 Individual (Selective) ACKs</h4>
          <p>The receiver sends an individual ACK for each correctly received frame. ACKs are <strong>not cumulative</strong>.</p>
        </div>
        <div class="theory-block">
          <h4>🎯 Targeted Retransmission</h4>
          <p>On timeout, the sender retransmits <strong>ONLY the specific frame that was lost or unacknowledged</strong>, avoiding redundant retransmission of already received frames!</p>
        </div>
        <div class="theory-block">
          <h4>📐 Sequence Number Constraint</h4>
          <p>Sender Window + Receiver Window ≤ 2ᵐ. Typically Ws = Wr = 2ᵐ⁻¹ (at most half the sequence number space) to prevent window overlap ambiguity.</p>
        </div>
      </div>
    `,
    faqs: [
      {
        q: 'Why does Selective Repeat require Ws + Wr ≤ 2ᵐ?',
        a: 'To prevent window overlap! If window size exceeded 2ᵐ⁻¹, an old duplicate frame could fall into the new receiver window and be accepted as new data.'
      },
      {
        q: 'How does Selective Repeat save bandwidth compared to Go-Back-N?',
        a: 'In GBN, losing one frame causes the entire window to be retransmitted. In SR, only the lost frame is retransmitted because out-of-order frames are safely buffered at the receiver.'
      },
      {
        q: 'What is the trade-off of Selective Repeat?',
        a: 'More complexity and memory requirements: both sender and receiver need larger buffers, logic to track out-of-order sequence numbers, and individual timers.'
      }
    ]
  }
};

function updateTheorySection() {
  const data = THEORY_CONTENT[SimState.protocol];
  DOM.theoryTitle.textContent = data.title;
  DOM.theoryTag.textContent = data.tag;
  DOM.theoryBody.innerHTML = data.html;

  DOM.faqGrid.innerHTML = data.faqs.map((faq, idx) => `
    <div class="faq-card ${idx === 0 ? 'expanded' : ''}" role="button" tabindex="0" aria-expanded="${idx === 0}">
      <div class="faq-q">
        <span class="faq-q-text">${escapeHtml(faq.q)}</span>
        <span class="faq-chevron" aria-hidden="true">▾</span>
      </div>
      <div class="faq-a">${escapeHtml(faq.a)}</div>
    </div>
  `).join('');

  DOM.faqGrid.querySelectorAll('.faq-card').forEach(card => {
    const toggle = () => {
      AudioSynth.playClick();
      card.classList.toggle('expanded');
      card.setAttribute('aria-expanded', card.classList.contains('expanded'));
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

// ============================================================================
// 10. EVENT LISTENERS & USER INTERACTIONS
// ============================================================================

/**
 * Protocol Switchers
 */
function selectProtocol(proto) {
  if (SimState.protocol === proto) return;
  AudioSynth.playClick();
  SimState.protocol = proto;

  DOM.btnProtoSAW.classList.toggle('active', proto === 'SAW');
  DOM.btnProtoGBN.classList.toggle('active', proto === 'GBN');
  DOM.btnProtoSR.classList.toggle('active', proto === 'SR');

  readConfigFromInputs();
  resetSimulationState();
  updateTheorySection();
  populateDropTargetDropdown();
  updateUI();

  logEvent('INFO', `Switched protocol to ${getProtocolFullName(proto)}. Simulation reset.`);
  showToast('info', `Switched to ${getProtocolFullName(proto)}. Click Start to run.`);
}

DOM.btnProtoSAW.addEventListener('click', () => selectProtocol('SAW'));
DOM.btnProtoGBN.addEventListener('click', () => selectProtocol('GBN'));
DOM.btnProtoSR.addEventListener('click', () => selectProtocol('SR'));

/**
 * Preset Scenarios for Demonstrations
 */
DOM.selectScenarioPreset.addEventListener('change', (e) => {
  const scenario = e.target.value;
  AudioSynth.playClick();

  switch (scenario) {
    case 'default':
      selectProtocol('GBN');
      DOM.totalFramesInput.value = 8;
      DOM.windowSizeInput.value = 4;
      DOM.selectDropTarget.value = 'none';
      readConfigFromInputs();
      resetSimulationState();
      showToast('info', 'Loaded: Default Clean Transmission (GBN, 8 frames, N=4)');
      break;

    case 'saw-ack-lost':
      selectProtocol('SAW');
      DOM.totalFramesInput.value = 5;
      readConfigFromInputs();
      resetSimulationState();
      // Arm Drop Next ACK
      SimState.faults.dropNextAck = true;
      DOM.btnDropNextAck.classList.add('active-arm');
      DOM.labelDropNextAck.textContent = 'ARMED (ACK Drop)';
      showToast('warning', 'Scenario: Lost ACK in Stop-and-Wait. Watch receiver detect duplicate and re-ACK!');
      break;

    case 'gbn-frame-lost':
      selectProtocol('GBN');
      DOM.totalFramesInput.value = 8;
      DOM.windowSizeInput.value = 4;
      readConfigFromInputs();
      resetSimulationState();
      // Set Auto-drop to Frame 2
      DOM.selectDropTarget.value = '2';
      SimState.faults.autoDropTargetFrame = '2';
      showToast('warning', 'Scenario: GBN Frame 2 Lost. Watch receiver discard frames 3, 4, 5 and sender retransmit all 4!');
      break;

    case 'sr-buffering':
      selectProtocol('SR');
      DOM.totalFramesInput.value = 8;
      DOM.windowSizeInput.value = 4;
      readConfigFromInputs();
      resetSimulationState();
      // Set Auto-drop to Frame 2
      DOM.selectDropTarget.value = '2';
      SimState.faults.autoDropTargetFrame = '2';
      showToast('warning', 'Scenario: SR Frame 2 Lost. Watch receiver BUFFER out-of-order frames 3, 4, 5 and sender retransmit ONLY Frame 2!');
      break;

    case 'burst-stream':
      selectProtocol('GBN');
      DOM.totalFramesInput.value = 12;
      DOM.windowSizeInput.value = 5;
      DOM.speedSlider.value = 1.5;
      readConfigFromInputs();
      resetSimulationState();
      showToast('info', 'Loaded: High-Speed Continuous Stream (Speed 1.5x, 12 frames, N=5)');
      break;
  }
});

/**
 * Sound FX Toggle
 */
DOM.btnToggleSound.addEventListener('click', () => {
  SimState.soundEnabled = !SimState.soundEnabled;
  DOM.btnToggleSound.classList.toggle('active', SimState.soundEnabled);
  DOM.soundIcon.textContent = SimState.soundEnabled ? '🔊' : '🔇';
  DOM.soundLabel.textContent = SimState.soundEnabled ? 'Sound ON' : 'Muted';
  if (SimState.soundEnabled) {
    AudioSynth.playClick();
    showToast('info', 'Audio effects enabled.');
  } else {
    showToast('info', 'Audio effects muted.');
  }
});

/**
 * Dark / Light Theme Toggle & Persistence
 */
function applyTheme(theme) {
  SimState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('reliableLink_theme', theme);
  } catch (err) {
    // LocalStorage fallback
  }

  if (DOM.themeIcon && DOM.themeLabel && DOM.btnToggleTheme) {
    if (theme === 'dark') {
      DOM.themeIcon.textContent = '☀️';
      DOM.themeLabel.textContent = 'Light';
      DOM.btnToggleTheme.title = 'Switch to Light Theme (Key: T)';
      DOM.btnToggleTheme.classList.add('active');
    } else {
      DOM.themeIcon.textContent = '🌙';
      DOM.themeLabel.textContent = 'Dark';
      DOM.btnToggleTheme.title = 'Switch to Dark Theme (Key: T)';
      DOM.btnToggleTheme.classList.remove('active');
    }
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#070b14' : '#ffffff');
  }
}

function toggleTheme() {
  AudioSynth.playClick();
  const nextTheme = SimState.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  showToast('info', `Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode.`);
}

if (DOM.btnToggleTheme) {
  DOM.btnToggleTheme.addEventListener('click', toggleTheme);
}

/**
 * Keyboard Shortcuts Modal Toggle
 */
DOM.btnShortcutsHelp.addEventListener('click', () => {
  AudioSynth.playClick();
  DOM.shortcutsModal.classList.add('active');
  DOM.shortcutsModal.setAttribute('aria-hidden', 'false');
});

DOM.btnCloseShortcuts.addEventListener('click', () => {
  AudioSynth.playClick();
  DOM.shortcutsModal.classList.remove('active');
  DOM.shortcutsModal.setAttribute('aria-hidden', 'true');
});

DOM.shortcutsModal.addEventListener('click', (e) => {
  if (e.target === DOM.shortcutsModal) {
    DOM.shortcutsModal.classList.remove('active');
    DOM.shortcutsModal.setAttribute('aria-hidden', 'true');
  }
});

/**
 * Simulation Control Buttons
 */
DOM.btnStart.addEventListener('click', () => {
  AudioSynth.playClick();
  if (SimState.status === 'IDLE' || SimState.status === 'PAUSED') {
    SimState.status = 'RUNNING';
    updateStatusPill('RUNNING', 'Transmitting (Running)');
    DOM.btnStart.disabled = true;
    DOM.btnPause.disabled = false;
    DOM.totalFramesInput.disabled = true;
    DOM.btnFramesMinus.disabled = true;
    DOM.btnFramesPlus.disabled = true;
    DOM.windowSizeInput.disabled = true;
    DOM.btnWinMinus.disabled = true;
    DOM.btnWinPlus.disabled = true;

    logEvent('INFO', 'Simulation started.');
    showToast('info', 'Simulation started! Frames entering transmission channel.');
    checkSenderTransmission();

    // On mobile screens, smoothly scroll to bring the active visual channel into view
    if (window.innerWidth <= 768) {
      const stage = document.querySelector('.simulation-stage');
      if (stage) {
        stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
});

DOM.btnPause.addEventListener('click', () => {
  AudioSynth.playClick();
  if (SimState.status === 'RUNNING') {
    SimState.status = 'PAUSED';
    updateStatusPill('PAUSED', 'Simulation Paused');
    DOM.btnPause.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Resume</span>`;
    logEvent('INFO', 'Simulation paused by user.');
    showToast('warning', 'Simulation paused. Click Resume or Step.');
  } else if (SimState.status === 'PAUSED') {
    SimState.status = 'RUNNING';
    updateStatusPill('RUNNING', 'Transmitting (Running)');
    DOM.btnPause.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>Pause</span>`;
    logEvent('INFO', 'Simulation resumed.');
    showToast('info', 'Simulation resumed.');
  }
});

DOM.btnStep.addEventListener('click', () => {
  AudioSynth.playClick();
  if (SimState.status === 'IDLE') {
    SimState.status = 'PAUSED';
    updateStatusPill('PAUSED', 'Simulation Paused (Stepping)');
    DOM.btnStart.disabled = true;
    DOM.btnPause.disabled = false;
    DOM.btnPause.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Resume</span>`;
    DOM.totalFramesInput.disabled = true;
    DOM.btnFramesMinus.disabled = true;
    DOM.btnFramesPlus.disabled = true;
    DOM.windowSizeInput.disabled = true;
    DOM.btnWinMinus.disabled = true;
    DOM.btnWinPlus.disabled = true;
    checkSenderTransmission();
  }

  simulationTick(300);
  logEvent('INFO', 'Single step executed (+300ms forward).');
});

DOM.btnReset.addEventListener('click', () => {
  AudioSynth.playClick();
  resetSimulationState();
  logEvent('INFO', 'Simulation reset by user.');
  showToast('info', 'Simulation reset. Ready to start again.');
});

/**
 * Fault Injection Buttons
 */
DOM.btnDropNextFrame.addEventListener('click', () => {
  AudioSynth.playClick();
  SimState.faults.dropNextFrame = !SimState.faults.dropNextFrame;
  DOM.btnDropNextFrame.classList.toggle('active-arm', SimState.faults.dropNextFrame);
  DOM.labelDropNextFrame.textContent = SimState.faults.dropNextFrame ? 'ARMED (Click to Disarm)' : 'Drop Next Frame';

  if (SimState.faults.dropNextFrame) {
    showToast('warning', 'Fault Armed: The next transmitted frame will be dropped in the channel.');
    logEvent('INFO', 'Fault armed: Next data frame will be dropped.');
  } else {
    showToast('info', 'Fault Disarmed: Frame drop cancelled.');
  }
});

DOM.btnDropNextAck.addEventListener('click', () => {
  AudioSynth.playClick();
  SimState.faults.dropNextAck = !SimState.faults.dropNextAck;
  DOM.btnDropNextAck.classList.toggle('active-arm', SimState.faults.dropNextAck);
  DOM.labelDropNextAck.textContent = SimState.faults.dropNextAck ? 'ARMED (Click to Disarm)' : 'Drop Next ACK';

  if (SimState.faults.dropNextAck) {
    showToast('warning', 'Fault Armed: The next transmitted ACK will be dropped in the channel.');
    logEvent('INFO', 'Fault armed: Next ACK will be dropped.');
  } else {
    showToast('info', 'Fault Disarmed: ACK drop cancelled.');
  }
});

DOM.selectDropTarget.addEventListener('change', (e) => {
  AudioSynth.playClick();
  SimState.faults.autoDropTargetFrame = e.target.value;
  SimState.faults.droppedFramesHistory.clear();
  if (e.target.value !== 'none') {
    logEvent('INFO', `Target loss configured: Frame ${e.target.value} will be dropped.`);
    showToast('warning', `Target configured: Frame ${e.target.value} will be dropped upon transmission.`);
  }
});

/**
 * Steppers for Total Frames & Window Size
 */
DOM.btnFramesMinus.addEventListener('click', () => {
  AudioSynth.playClick();
  const cur = parseInt(DOM.totalFramesInput.value, 10) || 8;
  if (cur > 3) {
    DOM.totalFramesInput.value = cur - 1;
    DOM.totalFramesInput.dispatchEvent(new Event('change'));
  }
});

DOM.btnFramesPlus.addEventListener('click', () => {
  AudioSynth.playClick();
  const cur = parseInt(DOM.totalFramesInput.value, 10) || 8;
  if (cur < 15) {
    DOM.totalFramesInput.value = cur + 1;
    DOM.totalFramesInput.dispatchEvent(new Event('change'));
  }
});

DOM.btnWinMinus.addEventListener('click', () => {
  AudioSynth.playClick();
  const cur = parseInt(DOM.windowSizeInput.value, 10) || 4;
  if (cur > 1) {
    DOM.windowSizeInput.value = cur - 1;
    DOM.windowSizeInput.dispatchEvent(new Event('change'));
  }
});

DOM.btnWinPlus.addEventListener('click', () => {
  AudioSynth.playClick();
  const cur = parseInt(DOM.windowSizeInput.value, 10) || 4;
  if (cur < 6) {
    DOM.windowSizeInput.value = cur + 1;
    DOM.windowSizeInput.dispatchEvent(new Event('change'));
  }
});

DOM.totalFramesInput.addEventListener('change', () => {
  readConfigFromInputs();
  resetSimulationState();
  populateDropTargetDropdown();
});

DOM.windowSizeInput.addEventListener('change', () => {
  readConfigFromInputs();
  resetSimulationState();
});

DOM.speedSlider.addEventListener('input', (e) => {
  SimState.speedMultiplier = parseFloat(e.target.value) || 1.0;
  DOM.speedDisplay.textContent = `${SimState.speedMultiplier.toFixed(1)}x`;
  updateSpeedPillsActive();
});

DOM.speedPills.forEach(pill => {
  pill.addEventListener('click', () => {
    AudioSynth.playClick();
    const spd = parseFloat(pill.dataset.speed);
    DOM.speedSlider.value = spd;
    SimState.speedMultiplier = spd;
    DOM.speedDisplay.textContent = `${spd.toFixed(1)}x`;
    updateSpeedPillsActive();
  });
});

/**
 * Event Log Filtering & Tools
 */
DOM.logFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    AudioSynth.playClick();
    DOM.logFilterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    SimState.logFilter = btn.dataset.filter;

    const entries = DOM.eventLog.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      const type = entry.dataset.type;
      if (SimState.logFilter === 'ALL') {
        entry.style.display = 'flex';
      } else if (SimState.logFilter === 'SENT') {
        entry.style.display = (type === 'SENT' || type === 'RETRANSMIT') ? 'flex' : 'none';
      } else if (SimState.logFilter === 'ACK') {
        entry.style.display = (type === 'ACK') ? 'flex' : 'none';
      } else if (SimState.logFilter === 'LOST') {
        entry.style.display = (type === 'LOST' || type === 'TIMEOUT' || type === 'DISCARD') ? 'flex' : 'none';
      }
    });
  });
});

DOM.btnCopyLog.addEventListener('click', () => {
  AudioSynth.playClick();
  const entries = Array.from(DOM.eventLog.querySelectorAll('.log-entry')).map(e => e.innerText.replace(/\s+/g, ' ')).join('\n');
  navigator.clipboard.writeText(entries).then(() => {
    showToast('success', '📋 Event log copied to clipboard for your lab report!');
  }).catch(() => {
    showToast('info', 'Failed to copy log. Please select text manually.');
  });
});

DOM.btnClearLog.addEventListener('click', () => {
  AudioSynth.playClick();
  DOM.eventLog.innerHTML = `
    <div class="log-entry log-system" data-type="INFO">
      <span class="log-time">00:00.00</span>
      <span class="badge badge-info">INFO</span>
      <span class="log-msg">Log cleared by user.</span>
    </div>
  `;
});

/**
 * Education Section Tab Switching with Mobile Auto-Center Scrolling
 */
DOM.eduTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    AudioSynth.playClick();
    DOM.eduTabs.forEach(t => t.classList.remove('active'));
    DOM.eduTabContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const targetId = 'tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    const content = document.getElementById(targetId);
    if (content) {
      content.classList.add('active');
    }

    // Smoothly scroll active tab into center view in horizontally-scrollable tab container
    tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
});

/**
 * Mobile Touch Swipe Gestures for Educational Tabs
 */
const eduCardElement = document.querySelector('.education-card');
if (eduCardElement) {
  let touchStartX = 0;
  let touchStartY = 0;

  eduCardElement.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  eduCardElement.addEventListener('touchend', (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;

    // Detect intentional horizontal swipe (> 50px delta and predominantly horizontal)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const tabs = Array.from(DOM.eduTabs);
      const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
      if (activeIdx !== -1) {
        if (deltaX < 0 && activeIdx < tabs.length - 1) {
          // Swiped left -> next tab
          tabs[activeIdx + 1].click();
        } else if (deltaX > 0 && activeIdx > 0) {
          // Swiped right -> previous tab
          tabs[activeIdx - 1].click();
        }
      }
    }
  }, { passive: true });
}

/**
 * Mobile Floating Controls HUD Logic & Handlers
 */
function updateHUD() {
  if (!DOM.mobileFloatingHud) return;

  // Protocol & Window Size Badge
  if (DOM.hudProtoBadge) {
    if (SimState.protocol === 'SAW') {
      DOM.hudProtoBadge.textContent = 'Stop-and-Wait (Ws=1)';
    } else if (SimState.protocol === 'GBN') {
      DOM.hudProtoBadge.textContent = `GBN (N=${SimState.windowSize})`;
    } else {
      DOM.hudProtoBadge.textContent = `SR (N=${SimState.windowSize})`;
    }
  }

  // Real-time Status Text
  if (DOM.hudStatusText && DOM.simStatusText) {
    DOM.hudStatusText.textContent = DOM.simStatusText.textContent;
  }

  // Play / Pause Toggle Button State
  if (DOM.hudBtnStart) {
    const playIcon = DOM.hudBtnStart.querySelector('.hud-icon-play');
    const pauseIcon = DOM.hudBtnStart.querySelector('.hud-icon-pause');

    if (SimState.status === 'RUNNING') {
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'inline-block';
      if (DOM.hudStartText) DOM.hudStartText.textContent = 'Pause';
      DOM.hudBtnStart.classList.add('is-running');
      DOM.hudBtnStart.disabled = false;
    } else if (SimState.status === 'PAUSED') {
      if (playIcon) playIcon.style.display = 'inline-block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (DOM.hudStartText) DOM.hudStartText.textContent = 'Resume';
      DOM.hudBtnStart.classList.remove('is-running');
      DOM.hudBtnStart.disabled = false;
    } else if (SimState.status === 'FINISHED') {
      if (playIcon) playIcon.style.display = 'inline-block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (DOM.hudStartText) DOM.hudStartText.textContent = 'Done';
      DOM.hudBtnStart.classList.remove('is-running');
      DOM.hudBtnStart.disabled = true;
    } else {
      if (playIcon) playIcon.style.display = 'inline-block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (DOM.hudStartText) DOM.hudStartText.textContent = 'Start';
      DOM.hudBtnStart.classList.remove('is-running');
      DOM.hudBtnStart.disabled = false;
    }
  }

  // Step Button
  if (DOM.hudBtnStep) {
    DOM.hudBtnStep.disabled = (SimState.status === 'FINISHED');
  }

  // Fault Drop Button Arm Status
  if (DOM.hudBtnDrop && DOM.hudDropText) {
    if (SimState.faults.dropNextFrame) {
      DOM.hudBtnDrop.classList.add('active');
      DOM.hudDropText.textContent = 'Frame Arm';
    } else if (SimState.faults.dropNextAck) {
      DOM.hudBtnDrop.classList.add('active');
      DOM.hudDropText.textContent = 'ACK Arm';
    } else {
      DOM.hudBtnDrop.classList.remove('active');
      DOM.hudDropText.textContent = 'Drop Next';
    }
  }
}

// Wire Mobile HUD Button Handlers
if (DOM.hudBtnStart) {
  DOM.hudBtnStart.addEventListener('click', () => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(20); } catch (_) {}
    }
    if (SimState.status === 'RUNNING') {
      DOM.btnPause.click();
    } else if (SimState.status === 'PAUSED') {
      DOM.btnPause.click();
    } else if (SimState.status === 'IDLE') {
      DOM.btnStart.click();
    }
  });
}

if (DOM.hudBtnStep) {
  DOM.hudBtnStep.addEventListener('click', () => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(15); } catch (_) {}
    }
    DOM.btnStep.click();
  });
}

if (DOM.hudBtnReset) {
  DOM.hudBtnReset.addEventListener('click', () => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(25); } catch (_) {}
    }
    DOM.btnReset.click();
  });
}

if (DOM.hudBtnDrop) {
  DOM.hudBtnDrop.addEventListener('click', () => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(30); } catch (_) {}
    }
    DOM.btnDropNextFrame.click();
    updateHUD();
  });
}

if (DOM.hudBtnJump) {
  DOM.hudBtnJump.addEventListener('click', () => {
    const stage = document.querySelector('.simulation-stage');
    if (stage) {
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// Recalculate brackets on screen resize or phone orientation change
let windowResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(windowResizeTimer);
  windowResizeTimer = setTimeout(() => {
    updateWindowBrackets();
  }, 100);
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    updateWindowBrackets();
  }, 150);
});

/**
 * Global Keyboard Shortcuts
 */
window.addEventListener('keydown', (e) => {
  // If an input is focused, don't trigger global shortcuts
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (SimState.status === 'RUNNING') {
        DOM.btnPause.click();
      } else if (SimState.status === 'IDLE' || SimState.status === 'PAUSED') {
        DOM.btnStart.click();
      }
      break;

    case 'KeyS':
      e.preventDefault();
      DOM.btnStep.click();
      break;

    case 'KeyR':
      e.preventDefault();
      DOM.btnReset.click();
      break;

    case 'Digit1':
      selectProtocol('SAW');
      break;

    case 'Digit2':
      selectProtocol('GBN');
      break;

    case 'Digit3':
      selectProtocol('SR');
      break;

    case 'KeyF':
      DOM.btnDropNextFrame.click();
      break;

    case 'KeyA':
      DOM.btnDropNextAck.click();
      break;

    case 'KeyM':
      DOM.btnToggleSound.click();
      break;

    case 'KeyT':
      toggleTheme();
      break;

    case 'Slash':
      if (e.shiftKey) { // '?'
        e.preventDefault();
        DOM.btnShortcutsHelp.click();
      }
      break;

    case 'Escape':
      DOM.shortcutsModal.classList.remove('active');
      DOM.shortcutsModal.setAttribute('aria-hidden', 'true');
      break;
  }
});

// ============================================================================
// 11. BOOTSTRAP APPLICATION
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  initSimulation();
  animationFrameId = requestAnimationFrame(simulationLoop);
});
