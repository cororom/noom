const socket = io();

const myFace = document.querySelector(".stream__mine");
const muteBtn = document.querySelector(".stream--mute");
const cameraBtn = document.querySelector(".stream--off");
const camerasSelect = document.querySelector(".stream--cameras");
const room = document.querySelector(".room");

room.classList.add("hide");

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let nickName;
let myPeerConnection;
let myDataChannel;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };
  const cameraConstrains = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(deviceId ? cameraConstrains : initialConstrains);
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
  muteBtn.innerText = !muted ? "volume_up" : "volume_off";
  muted = !muted;
}

function handleCameraClick() {
  myStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
  cameraBtn.innerText = cameraOff ? "call" : "call_end";
  cameraOff = !cameraOff;
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection.getSenders().find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

// Welcome Form (join a room)

const welcome = document.querySelector(".welcome");
const welcomeForm = welcome.querySelector("form");

async function initRoom() {
  welcome.classList.add("hide");
  room.classList.remove("hide");
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelectorAll("input");
  roomName = input[0].value;
  nickName = input[1].value;
  await initRoom();
  socket.emit("join_room", roomName, nickName);
  input[0].value = "";
  input[1].value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

// Chat Form

const chat = document.querySelector(".room__chat");
const chatForm = chat.querySelector("form");

function handleBubble(obj, type = "receive") {
  const info = JSON.parse(obj);
  const bubbles = document.querySelector(".chat__bubbles");
  const div = document.createElement("div");
  if (type === "send") {
    div.className = "chat__bubble mine";
  } else {
    div.className = "chat__bubble other";
  }
  const span = document.createElement("span");
  span.innerText = info.msg;
  div.appendChild(span);
  bubbles.appendChild(div);
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const input = chatForm.querySelector("input");
  const obj = JSON.stringify({ name: nickName, msg: input.value });
  await myDataChannel.send(obj);
  input.value = "";
  handleBubble(obj, "send");
}

chatForm.addEventListener("submit", handleChatSubmit);

// Socket Code

socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => handleBubble(event.data));
  console.log("made data channel");
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
});

socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) => handleBubble(event.data));
  });
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
});

socket.on("answer", (answer) => {
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC Code

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("track", handleTrack);
  myStream.getTracks().forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

function handleTrack(data) {
  const peerFace = document.querySelector(".stream__other");
  peerFace.srcObject = data.streams[0];
}
